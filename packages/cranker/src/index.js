// Wagerino cranker v2: permissionless settlement for bets, rounds, and markets. Earns the settler reward.
// Event-driven with a slow reconciliation scan; RPC failover; Pyth pull for market resolution.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import anchorPkg from "@coral-xyz/anchor";
const anchor = anchorPkg.default ?? anchorPkg;
import { Wagerino, randomnessPda, PYTH_RECEIVER } from "@wagerino/sdk";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const cfgPath = process.env.CRANKER_CONFIG || join(here, "..", "config.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const idl = JSON.parse(readFileSync(resolve(dirname(cfgPath), cfg.idlPath), "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(cfg.walletPath, "utf8"))));
const anchorWallet = { publicKey: wallet.publicKey, signTransaction: async (t) => (t.partialSign(wallet), t), signAllTransactions: async (ts) => ts.map((t) => (t.partialSign(wallet), t)) };
const POLL = cfg.pollMs ?? 2000, SCAN = cfg.scanMs ?? 30000, MIN_BET = BigInt(cfg.minBetForSettle ?? 0);

let rpcIndex = 0, sdk, conn, errs = 0, listeners = [];
const bets = new Map(), rounds = new Map(), markets = new Map();
const done = new Set(); // rounds/markets fully processed: never re-listed by scan
// ---- stats: rolling aggregates from BetSettled events (24h + all-time since start), served as JSON
const stats = { since: Date.now(), games: new Map(), players: new Map(), recent: [], bigWins: [] };
function recordSettled(ev, sig) {
  const t = Date.now(); const game = ev.game.toBase58(), player = ev.player.toBase58(); const amount = Number(ev.amount) / 1e6, payout = Number(ev.payout) / 1e6;
  const g = stats.games.get(game) ?? { game, bets: 0, volume: 0, paid: 0, h24: [] }; g.bets++; g.volume += amount; g.paid += payout; g.h24.push([t, amount]); stats.games.set(game, g);
  const p = stats.players.get(player) ?? { player, bets: 0, wagered: 0, won: 0 }; p.bets++; p.wagered += amount; p.won += payout; stats.players.set(player, p);
  const row = { t, sig, game, player, amount, payout, mult: ev.multBps / 10000, jackpot: !!ev.jackpot };
  stats.recent.unshift(row); stats.recent = stats.recent.slice(0, 200);
  if (payout > amount) { stats.bigWins.push(row); stats.bigWins.sort((a, b) => b.payout - a.payout); stats.bigWins = stats.bigWins.slice(0, 50); }
}
function statsJson() {
  const cutoff = Date.now() - 86400e3;
  const games = [...stats.games.values()].map((g) => { g.h24 = g.h24.filter(([t]) => t > cutoff); return { game: g.game, bets: g.bets, volume: +g.volume.toFixed(2), paid: +g.paid.toFixed(2), volume24h: +g.h24.reduce((a, [, v]) => a + v, 0).toFixed(2), bets24h: g.h24.length }; });
  return JSON.stringify({ generatedAt: Date.now(), since: stats.since, games, players: [...stats.players.values()].sort((a, b) => b.wagered - a.wagered).slice(0, 100), recent: stats.recent.slice(0, 100), bigWins: stats.bigWins.slice(0, 20) });
}
if (cfg.statsPort) {
  createServer((req, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); if (req.url.startsWith("/stats")) { res.setHeader("Content-Type", "application/json"); res.end(statsJson()); } else { res.statusCode = 404; res.end(); } }).listen(cfg.statsPort, () => log(`stats server on :${cfg.statsPort}/stats.json`));
  setInterval(() => { try { if (cfg.statsFile) writeFileSync(cfg.statsFile, statsJson()); } catch {} }, 30000);
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const first = (e) => String(e?.message ?? e).split("\n")[0];

function connect() {
  const url = cfg.rpcUrls[rpcIndex % cfg.rpcUrls.length];
  conn = new Connection(url, "confirmed");
  sdk = new Wagerino(conn, idl, anchorWallet);
  log(`rpc=${url}`);
  subscribe().catch((e) => log("subscribe failed", first(e)));
}
async function subscribe() {
  for (const id of listeners) { try { await sdk.removeEventListener(id); } catch {} }
  const safe = (name, fn) => async (ev, slot, sig) => { try { await fn(ev, slot, sig); } catch (e) { log(`event ${name} handler: ${first(e)}`); } };
  listeners = [
    sdk.addEventListener("betSettled", safe("betSettled", async (ev, slot, sig) => { recordSettled(ev, sig); })),
    sdk.addEventListener("betPlaced", safe("betPlaced", async (ev) => { const b = await sdk.betRetry(ev.bet); if (b) { bets.set(ev.bet.toBase58(), b); log(`event: bet ${ev.bet.toBase58().slice(0, 8)} ${Number(ev.amount) / 1e6} USDC`); } })),
    sdk.addEventListener("roundOpened", safe("roundOpened", async (ev) => { rounds.set(ev.round.toBase58(), await sdk.round(ev.round)); log(`event: round opened ${ev.round.toBase58().slice(0, 8)}`); })),
    sdk.addEventListener("roundRequested", safe("roundRequested", async (ev) => { rounds.set(ev.round.toBase58(), await sdk.round(ev.round)); })),
    sdk.addEventListener("marketCreated", safe("marketCreated", async (ev) => { markets.set(ev.market.toBase58(), await sdk.market(ev.market)); log(`event: market ${ev.market.toBase58().slice(0, 8)} "${ev.name}"`); })),
  ];
}
function failover(why) { rpcIndex++; errs = 0; log(`failover (${why})`); connect(); }

async function scan() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [b, r, m] = await Promise.all([sdk.pendingBets(), sdk.rounds(), sdk.markets()]);
      bets.clear(); for (const x of b) bets.set(x.publicKey.toBase58(), x.account);
      const slotNow = await conn.getSlot();
      rounds.clear(); for (const x of r) { const k = x.publicKey.toBase58(); if (done.has(k)) continue; if (x.account.status <= 2 && !(x.account.status === 0 && x.account.entries === 0 && slotNow >= Number(x.account.openUntilSlot))) rounds.set(k, x.account); }
      markets.clear(); for (const x of m) { const k = x.publicKey.toBase58(); if (done.has(k)) continue; if (x.account.status === 0 || x.account.status === 1 || x.account.status === 2) markets.set(k, x.account); }
      log(`scan: ${bets.size} bets, ${rounds.size} rounds, ${markets.size} markets`);
      return;
    } catch (e) { if (attempt === 2) log("scan failed (non-fatal):", first(e)); else await sleep(2000 * (attempt + 1)); }
  }
}

async function tickBets(s, slot) {
  for (const [key, b] of [...bets]) {
    try {
      const pk = new PublicKey(key);
      if (BigInt(b.amount.toString()) < MIN_BET) continue;
      const still = await sdk.bet(pk); if (!still) { bets.delete(key); continue; }
      const rnd = randomnessPda(Buffer.from(b.force));
      if (await sdk.isFulfilled(rnd)) {
        const refUsdc = b.referrer.equals(PublicKey.default) ? null : sdk.usdcAta(b.referrer, s.usdcMint);
        const refExists = refUsdc ? !!(await conn.getAccountInfo(refUsdc)) : false;
        const sig = await sdk.send(await sdk.settleBetTx(wallet.publicKey, pk, b, refExists ? refUsdc : null));
        log(`settled bet ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); bets.delete(key);
      } else if (slot >= Number(b.requestSlot) + Number(s.refundTimeoutSlots)) {
        const sig = await sdk.send(await sdk.refundBetTx(wallet.publicKey, pk, b));
        log(`refunded bet ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); bets.delete(key);
      }
    } catch (e) { log(`skip bet ${key.slice(0, 8)}: ${first(e)}`); }
  }
}

async function tickRounds(s, slot) {
  for (const [key, r0] of [...rounds]) {
    try {
      const pk = new PublicKey(key);
      const r = await sdk.round(pk); rounds.set(key, r);
      if (r.status === 0) {
        if (slot >= Number(r.openUntilSlot) && r.entries === 0) { rounds.delete(key); continue; } // empty round past its window: nothing to do
        if (slot >= Number(r.openUntilSlot) && r.entries > 0) { const { tx } = await sdk.requestRoundTx(wallet.publicKey, pk); const sig = await sdk.send(tx); log(`requested round ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); }
      } else if (r.status === 1) {
        const rnd = randomnessPda(Buffer.from(r.force));
        if (await sdk.isFulfilled(rnd)) { const sig = await sdk.send(await sdk.settleRoundTx(wallet.publicKey, pk, r)); log(`settled round ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); }
        else if (slot >= Number(r.requestSlot) + Number(s.refundTimeoutSlots)) { const sig = await sdk.send(await sdk.refundRoundTx(wallet.publicKey, pk, r)); log(`refunded round ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); }
      } else if (r.status === 2 || r.status === 3) {
        // claim on behalf of every remaining entry (funds go to the players)
        const entries = await sdk.entries(pk);
        for (const e of entries) {
          try { const sig = await sdk.send(await sdk.claimEntryTx(wallet.publicKey, pk, r, e.account.player)); log(`claimed entry ${e.publicKey.toBase58().slice(0, 8)} sig=${sig.slice(0, 12)}`); }
          catch (err) { log(`skip entry ${e.publicKey.toBase58().slice(0, 8)}: ${first(err)}`); }
        }
        if (!entries.length) { rounds.delete(key); done.add(key); }
      }
    } catch (e) { log(`skip round ${key.slice(0, 8)}: ${first(e)}`); }
  }
}

let pyth = null, hermes = null;
async function pythTools() {
  if (pyth) return { pyth, hermes };
  const { PythSolanaReceiver } = await import("@pythnetwork/pyth-solana-receiver");
  const { HermesClient } = await import("@pythnetwork/hermes-client");
  hermes = new HermesClient(cfg.hermesUrl ?? "https://hermes.pyth.network", cfg.pythApiKey ? { accessToken: cfg.pythApiKey } : undefined);
  pyth = new PythSolanaReceiver({ connection: conn, wallet: new anchor.Wallet(wallet) });
  return { pyth, hermes };
}
async function tickMarkets(s) {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, m0] of [...markets]) {
    try {
      const pk = new PublicKey(key);
      const m = await sdk.market(pk); markets.set(key, m);
      const expiry = Number(m.expiryTs), win = Number(m.resolveWindowSecs);
      if (m.status === 0 && now >= expiry) {
        if (Number(m.yesPool) === 0 || Number(m.noPool) === 0) { const sig = await voidViaResolve(pk); log(`voided empty-side market ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); continue; }
        if (now <= expiry + win) {
          const feedHex = "0x" + Buffer.from(m.feedId).toString("hex");
          // 1) permissionless path: Pyth's sponsored push-feed account (no Hermes, no API key)
          const tools = await pythTools();
          const pf = await sdk.readPushFeed(m.feedId, tools.pyth.getPriceFeedAccountAddress(0, feedHex));
          if (pf && pf.owner.equals(PYTH_RECEIVER) && pf.full) {
            if (pf.publishTime < expiry) { log(`market ${key.slice(0, 8)}: push feed publish_time ${pf.publishTime} < expiry ${expiry}, waiting`); continue; }
            if (pf.publishTime > expiry + win) { log(`market ${key.slice(0, 8)}: push feed past window (${pf.publishTime}); will void after grace`); continue; }
            const { Transaction } = await import("@solana/web3.js");
            const sig = await sdk.send(new Transaction().add(await sdk.resolveMarketIx(wallet.publicKey, pk, pf.account)));
            log(`resolved market ${key.slice(0, 8)} via push feed price=${Number(pf.price) * 10 ** pf.exponent} sig=${sig.slice(0, 12)}`);
            continue;
          }
          // 2) fallback: post a Hermes update ourselves (requires a Pyth API key in config)
          if (!cfg.pythApiKey) { log(`market ${key.slice(0, 8)}: no sponsored push feed for ${feedHex.slice(0, 10)}… and no pythApiKey configured; cannot resolve`); continue; }
          const { pyth, hermes } = await pythTools();
          const upd = await hermes.getLatestPriceUpdates([feedHex], { encoding: "base64" });
          const pt = Number(upd.parsed?.[0]?.price?.publish_time ?? 0);
          if (pt < expiry) { log(`market ${key.slice(0, 8)}: oracle publish_time ${pt} < expiry ${expiry}, waiting`); continue; }
          if (pt > expiry + win) { log(`market ${key.slice(0, 8)}: resolve window missed (publish_time ${pt}); will void after grace`); continue; }
          const builder = pyth.newTransactionBuilder({ closeUpdateAccounts: true });
          await builder.addPostPriceUpdates(upd.binary.data);
          await builder.addPriceConsumerInstructions(async (getPriceUpdateAccount) => [{ instruction: await sdk.resolveMarketIx(wallet.publicKey, pk, getPriceUpdateAccount(feedHex)), signers: [] }]);
          const txs = await builder.buildVersionedTransactions({ computeUnitPriceMicroLamports: 100000 });
          const sigs = await pyth.provider.sendAll(txs, { skipPreflight: false });
          log(`resolved market ${key.slice(0, 8)} via hermes sig=${String(sigs.at(-1)).slice(0, 12)}`);
        } else if (now > expiry + win + 86400) {
          const sig = await sdk.send(await sdk.voidMarketTx(wallet.publicKey, pk)); log(`voided stale market ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`);
        }
      } else if (m.status === 1 || m.status === 2) {
        const positions = await sdk.positions(pk);
        for (const p of positions) {
          try { const sig = await sdk.send(await sdk.claimPositionTx(wallet.publicKey, pk, p.account.player)); log(`claimed position ${p.publicKey.toBase58().slice(0, 8)} sig=${sig.slice(0, 12)}`); }
          catch (err) { log(`skip position ${p.publicKey.toBase58().slice(0, 8)}: ${first(err)}`); }
        }
        if (!positions.length) {
          if (m.status === 1 && (Number(m.creatorAccrued) > 0 || Number(m.platformAccrued) > 0)) {
            try { const sig = await sdk.send(await sdk.claimMarketFeesTx(wallet.publicKey, pk, m)); log(`claimed market fees ${key.slice(0, 8)} creator=${Number(m.creatorAccrued) / 1e6} platform=${Number(m.platformAccrued) / 1e6} sig=${sig.slice(0, 12)}`); }
            catch (err) { log(`skip market fees ${key.slice(0, 8)}: ${first(err)} — will retry`); continue; }
          }
          markets.delete(key); done.add(key);
        }
      }
    } catch (e) { log(`skip market ${key.slice(0, 8)}: ${first(e)}`); }
  }
}
// empty-side markets are voided by calling resolve with any account: the program short-circuits before reading the price
async function voidViaResolve(market) { return sdk.send(new (await import("@solana/web3.js")).Transaction().add(await sdk.resolveMarketIx(wallet.publicKey, market, wallet.publicKey))); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("unhandledRejection", (e) => log(`unhandled rejection (continuing): ${first(e)}`));
process.on("uncaughtException", (e) => log(`uncaught exception (continuing): ${first(e)}`));
(async () => {
  connect();
  const s0 = await sdk.platform();
  log(`wagerino-cranker v2 up. program=${sdk.programId} wallet=${wallet.publicKey} usdc=${s0.usdcMint}`);
  await scan();
  let lastScan = Date.now();
  for (;;) {
    try {
      if (Date.now() - lastScan >= SCAN) { await scan(); lastScan = Date.now(); }
      const s = await sdk.platform(); const slot = await conn.getSlot();
      await tickBets(s, slot); await tickRounds(s, slot); await tickMarkets(s);
      errs = 0;
    } catch (e) { errs++; log(`loop error (${errs}): ${first(e)}`); if (errs >= 3) failover("loop errors"); }
    await sleep(POLL);
  }
})();
