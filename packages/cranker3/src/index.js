// Wagerino cranker v3: settles every bet on every house (earns the settler reward), refunds stuck ones, serves stats.
import { readFileSync } from "node:fs"; import { dirname, join, resolve } from "node:path"; import { fileURLToPath } from "node:url"; import { createServer } from "node:http";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Wagerino3 } from "@wagerino/sdk3";
const here = dirname(fileURLToPath(import.meta.url)); const cfgPath = process.env.CRANKER_CONFIG || join(here, "..", "config.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8")); const idl = JSON.parse(readFileSync(resolve(dirname(cfgPath), cfg.idlPath), "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(cfg.walletPath, "utf8"))));
const w = { publicKey: wallet.publicKey, signTransaction: async (t) => (t.partialSign(wallet), t), signAllTransactions: async (ts) => ts.map((t) => (t.partialSign(wallet), t)) };
const POLL = cfg.pollMs ?? 2000, SCAN = cfg.scanMs ?? 30000; let rpcIndex = 0, sdk, conn, errs = 0, listeners = []; const bets = new Map();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a); const first = (e) => String(e?.message ?? e).split("\n")[0];
const stats = { since: Date.now(), houses: new Map(), players: new Map(), recent: [], bigWins: [], jackpots: [] };
function record(ev, sig) { const t = Date.now(), house = ev.house.toBase58(), player = ev.player.toBase58(), amount = Number(ev.amount) / 1e6, payout = Number(ev.payout) / 1e6;
  const h = stats.houses.get(house) ?? { house, bets: 0, volume: 0, paid: 0, earned: 0, h24: [] }; h.bets++; h.volume += amount; h.paid += payout; h.earned += Number(ev.houseShare) / 1e6; h.h24.push([t, amount]); stats.houses.set(house, h);
  const p = stats.players.get(player) ?? { player, bets: 0, wagered: 0, won: 0 }; p.bets++; p.wagered += amount; p.won += payout; stats.players.set(player, p);
  const row = { t, sig, house, template: ev.template.toBase58(), player, amount, payout, mult: ev.multBps / 10000, jackpot: !!ev.jackpot, jackpotPaid: Number(ev.jackpotPaid) / 1e6 };
  stats.recent.unshift(row); stats.recent = stats.recent.slice(0, 200); if (payout > amount) { stats.bigWins.push(row); stats.bigWins.sort((a, b) => b.payout - a.payout); stats.bigWins = stats.bigWins.slice(0, 50); } if (ev.jackpot) stats.jackpots.unshift(row); }
function statsJson() { const cutoff = Date.now() - 86400e3; return JSON.stringify({ generatedAt: Date.now(), since: stats.since, houses: [...stats.houses.values()].map((h) => { h.h24 = h.h24.filter(([t]) => t > cutoff); return { house: h.house, bets: h.bets, volume: +h.volume.toFixed(2), paid: +h.paid.toFixed(2), earned: +h.earned.toFixed(4), volume24h: +h.h24.reduce((a, [, v]) => a + v, 0).toFixed(2), bets24h: h.h24.length }; }), players: [...stats.players.values()].sort((a, b) => b.wagered - a.wagered).slice(0, 100), recent: stats.recent.slice(0, 100), bigWins: stats.bigWins.slice(0, 20), jackpots: stats.jackpots.slice(0, 20) }); }
if (cfg.statsPort) createServer((req, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); if (req.url.startsWith("/stats")) { res.setHeader("Content-Type", "application/json"); res.end(statsJson()); } else { res.statusCode = 404; res.end(); } }).listen(cfg.statsPort, () => log(`stats on :${cfg.statsPort}/stats.json`));

function connect() { const url = cfg.rpcUrls[rpcIndex % cfg.rpcUrls.length]; conn = new Connection(url, "confirmed"); sdk = new Wagerino3(conn, idl, w); log(`rpc=${url.replace(/api-key=.*/, "api-key=…")}`); subscribe().catch((e) => log("subscribe failed", first(e))); }
async function subscribe() { for (const id of listeners) { try { await sdk.removeEventListener(id); } catch {} }
  const safe = (n, fn) => async (ev, slot, sig) => { try { await fn(ev, slot, sig); } catch (e) { log(`event ${n}: ${first(e)}`); } };
  listeners = [sdk.addEventListener("betPlaced", safe("betPlaced", async (ev) => { for (let i = 0; i < 6; i++) { const b = await sdk.bet(ev.bet); if (b) { bets.set(ev.bet.toBase58(), b); log(`event: bet ${ev.bet.toBase58().slice(0, 8)} ${Number(ev.amount) / 1e6} USDC @${ev.house.toBase58().slice(0, 6)}`); return; } await sleep(500); } })),
    sdk.addEventListener("betSettled", safe("betSettled", async (ev, slot, sig) => record(ev, sig))),
    sdk.addEventListener("jackpotHit", safe("jackpotHit", async (ev) => log(`🎰 JACKPOT ${Number(ev.paid) / 1e6} USDC to ${ev.player.toBase58().slice(0, 8)} at house ${ev.house.toBase58().slice(0, 8)} (house bonus ${Number(ev.houseBonus) / 1e6})`)))]; }
async function ensureUsdcAta(s) { const ata = getAssociatedTokenAddressSync(new PublicKey(s.usdcMint), wallet.publicKey); if (!(await conn.getAccountInfo(ata))) { const tx = new Transaction().add(createAssociatedTokenAccountInstruction(wallet.publicKey, ata, wallet.publicKey, new PublicKey(s.usdcMint))); tx.feePayer = wallet.publicKey; await sdk.send(tx); log(`created settler USDC account ${ata.toBase58()}`); } }
async function scan() { for (let a = 0; a < 3; a++) { try { const b = await sdk.pendingBets(); bets.clear(); for (const x of b) bets.set(x.publicKey.toBase58(), x.account); log(`scan: ${bets.size} pending bets`); return; } catch (e) { if (a === 2) log("scan failed:", first(e)); else await sleep(2000 * (a + 1)); } } }
async function tick(s, slot) { for (const [key, b] of [...bets]) { try { const pk = new PublicKey(key); const still = await sdk.bet(pk); if (!still) { bets.delete(key); continue; }
    const rnd = (await import("@wagerino/sdk3")).randomnessPda(Buffer.from(b.force));
    if (await sdk.isFulfilled(rnd)) { const sig = await sdk.send(await sdk.settleBetTx(wallet.publicKey, pk, b)); log(`settled ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); bets.delete(key); }
    else if (slot >= Number(b.requestSlot) + Number(s.refundTimeoutSlots)) { const sig = await sdk.send(await sdk.refundBetTx(wallet.publicKey, pk, b)); log(`refunded ${key.slice(0, 8)} sig=${sig.slice(0, 12)}`); bets.delete(key); }
  } catch (e) { log(`skip ${key.slice(0, 8)}: ${first(e)}`); } } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("unhandledRejection", (e) => log(`unhandled (continuing): ${first(e)}`)); process.on("uncaughtException", (e) => log(`uncaught (continuing): ${first(e)}`));
(async () => { connect(); const s0 = await sdk.platform(); log(`wagerino-cranker v3 up. program=${sdk.programId} wallet=${wallet.publicKey}`); await ensureUsdcAta(s0); await scan(); let last = Date.now();
  for (;;) { try { if (Date.now() - last >= SCAN) { await scan(); last = Date.now(); } const s = await sdk.platform(); const slot = await conn.getSlot(); await tick(s, slot); errs = 0; } catch (e) { errs++; log(`loop error (${errs}): ${first(e)}`); if (errs >= 3) { rpcIndex++; errs = 0; connect(); } } await sleep(POLL); } })();
