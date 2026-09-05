// @wagerino/sdk — plain-JS client for the Wagerino v2 program. Builders return Transactions (unsigned);
// `send` signs with the provided wallet. Read helpers decode accounts via the IDL.
import anchorPkg from "@coral-xyz/anchor";
const anchor = anchorPkg.default ?? anchorPkg;
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { pdas, oraoNetworkState, randomnessPda, betForce, roundForce, freshNonce, curveCost, DEAD_SHARES, SHARE_UNIT, ORAO_VRF } from "./pdas.js";
import { seedFromVrf, outcomeTable, outcomeTarget, validateTable, jackpotProb, sideJackpotProb } from "./derive.js";
import { TEMPLATES, withMargin, tableToParams, RTP_CAP } from "./templates.js";

export * from "./pdas.js";
export * from "./derive.js";
export * from "./templates.js";

const BN = anchor.BN;
const bn = (v) => new BN(v.toString());
const bi = (v) => BigInt(v.toString());

// ---------- Pyth helpers (push feeds: permissionless, no API key) ----------
export const PYTH_PUSH_ORACLE = new PublicKey("pythWSnswVUd12oZpeFP8e9CVVoFHwe6CEt3Mvx1hbP");
/** Shard-0 sponsored price feed account for a feed id (hex or bytes). Same derivation as Pyth's SDK. */
export function pushFeedAccount(feedId, shard = 0) {
  const id = typeof feedId === "string" ? Buffer.from(feedId.replace(/^0x/, ""), "hex") : Buffer.from(feedId);
  const sh = Buffer.alloc(2); sh.writeUInt16LE(shard);
  return PublicKey.findProgramAddressSync([sh, id], PYTH_PUSH_ORACLE)[0];
}
/** Parse a PriceUpdateV2 account (same layout the program reads). */
export function parsePriceUpdate(data) {
  let o = 8 + 32;
  const tag = data[o]; const full = tag === 1; o += tag === 0 ? 2 : 1;
  const feedId = Buffer.from(data.subarray(o, o + 32)); o += 32;
  const price = data.readBigInt64LE(o); o += 8;
  const conf = data.readBigUInt64LE(o); o += 8;
  const exponent = data.readInt32LE(o); o += 4;
  const publishTime = Number(data.readBigInt64LE(o));
  return { full, feedId, price, conf, exponent, publishTime };
}

export class Wagerino {
  /** @param {import("@solana/web3.js").Connection} connection @param {object} idl @param {{publicKey:PublicKey, signTransaction?:Function}} [wallet] */
  constructor(connection, idl, wallet) {
    this.connection = connection;
    this.programId = new PublicKey(idl.address);
    const w = wallet ?? { publicKey: PublicKey.default, signTransaction: async (t) => t, signAllTransactions: async (t) => t };
    this.provider = new anchor.AnchorProvider(connection, w, { commitment: "confirmed" });
    this.program = new anchor.Program(idl, this.provider);
    this.pda = pdas(this.programId);
    this.wallet = w;
  }

  // ---------- reads ----------
  // Reads that follow a write can race a load-balanced RPC; retry "does not exist" briefly.
  async _retry(fn, tries = 6, ms = 500) {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) { if (i >= tries - 1 || !/does not exist|has no data/i.test(String(e?.message ?? e))) throw e; await new Promise((r) => setTimeout(r, ms)); }
    }
  }
  platform() { return this._retry(() => this.program.account.platform.fetch(this.pda.platform())); }
  game(pk) { return this._retry(() => this.program.account.game.fetch(pk)); }
  games() { return this.program.account.game.all(); }
  bet(pk) { return this.program.account.bet.fetchNullable(pk); }
  async betRetry(pk, tries = 6) { for (let i = 0; i < tries; i++) { const b = await this.bet(pk); if (b) return b; await new Promise((r) => setTimeout(r, 500)); } return null; }
  pendingBets() { return this.program.account.bet.all(); }
  round(pk) { return this._retry(() => this.program.account.round.fetch(pk)); }
  rounds() { return this.program.account.round.all(); }
  entries(round) { return this.program.account.entry.all([{ memcmp: { offset: 9, bytes: round.toBase58() } }]); }
  market(pk) { return this._retry(() => this.program.account.market.fetch(pk)); }
  markets() { return this.program.account.market.all(); }
  positions(market) { return this.program.account.position.all([{ memcmp: { offset: 9, bytes: market.toBase58() } }]); }
  async vaultBalance(game) { const g = typeof game.vault !== "undefined" ? game : await this.game(game); return bi((await this.connection.getTokenAccountBalance(g.vault)).value.amount); }
  usdcAta(owner, usdcMint) { return getAssociatedTokenAddressSync(new PublicKey(usdcMint), owner, true); }

  // ---------- quotes ----------
  freeVaultPessimistic(g, vaultBal) { return vaultBal - bi(g.reserved) - bi(g.creatorAccrued) - bi(g.platformAccrued) - bi(g.sidePot); }
  freeVaultOptimistic(g, vaultBal) { return vaultBal - bi(g.creatorAccrued) - bi(g.platformAccrued) - bi(g.sidePot); }
  /** Largest stake allowed right now. For TARGET games pass the target the player intends to use. */
  maxBet(g, s, vaultBal, targetBps = null) {
    const cap = (this.freeVaultPessimistic(g, vaultBal) * BigInt(s.exposureBps)) / 10_000n;
    const mult = g.mode === 0 ? BigInt(g.multBps[0]) : BigInt(targetBps ?? g.maxTargetBps);
    return (cap * 10_000n) / mult;
  }
  quoteBuy(g, s, vaultBal, shares) {
    const issued = bi(g.sharesIssued) === 0n ? DEAD_SHARES : bi(g.sharesIssued);
    const curve = curveCost(bi(s.curveP0), bi(s.curveK), issued, shares);
    const nav = (this.freeVaultOptimistic(g, vaultBal) * shares) / issued;
    const cost = curve > nav ? curve : nav;
    return cost + (cost * BigInt(s.lpFeeBps)) / 10_000n;
  }
  quoteSell(g, s, vaultBal, shares) {
    const gross = (this.freeVaultPessimistic(g, vaultBal) * shares) / bi(g.sharesIssued);
    return gross - (gross * BigInt(s.lpFeeBps)) / 10_000n;
  }
  navPerShare(g, vaultBal) { const n = bi(g.sharesIssued); return n === 0n ? 0n : (this.freeVaultPessimistic(g, vaultBal) * SHARE_UNIT) / n; }

  // ---------- tx helpers ----------
  /** Sign, send, confirm (blockhash-expiry strategy). Adds a priority fee. Retries once with a fresh blockhash on expiry. Surfaces program logs on failure. */
  async send(tx, signers = [], { priorityMicroLamports = 100_000, computeUnits = 400_000, attempts = 2 } = {}) {
    const { ComputeBudgetProgram } = await import("@solana/web3.js");
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }));
    tx.feePayer = this.wallet.publicKey;
    for (let attempt = 1; ; attempt++) {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.signatures = [];
      if (signers.length) tx.partialSign(...signers);
      const signed = await this.wallet.signTransaction(tx);
      let sig;
      try { sig = await this.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 5 }); }
      catch (e) {
        const logs = e.logs ?? (typeof e.getLogs === "function" ? await e.getLogs(this.connection).catch(() => null) : null);
        const tail = logs ? logs.filter((l) => /Program log|failed/.test(l)).slice(-4).join(" | ") : "";
        throw new Error(`${String(e.message ?? e).split("\n")[0]}${tail ? " :: " + tail : ""}`);
      }
      try {
        const res = await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(res.value.err)}`);
        return sig;
      } catch (e) {
        const expired = /expired|block height exceeded/i.test(String(e?.message ?? e));
        if (!expired || attempt >= attempts) throw e;
        // the tx may still have landed late; check before resending
        const st = await this.connection.getSignatureStatus(sig, { searchTransactionHistory: true });
        if (st?.value && !st.value.err) return sig;
      }
    }
  }
  async oraoTreasury() {
    const info = await this.connection.getAccountInfo(oraoNetworkState());
    return new PublicKey(info.data.subarray(8 + 32, 8 + 64));
  }

  // ---------- games ----------
  async createGameTx(creator, seed, opts) {
    // opts: { template, marginBps, name, uri, sideJackpotBps, sideProbPerUsdc } or { mode, multBps, prob, rtpBps, minTargetBps, maxTargetBps, ... }
    const s = await this.platform();
    let p;
    if (opts.template) {
      const t = withMargin(TEMPLATES[opts.template], opts.marginBps ?? 0);
      p = t.mode === 0 ? { mode: 0, ...tableToParams(t), rtpBps: 0, minTargetBps: 0, maxTargetBps: 0 }
                       : { mode: 1, multBps: [], prob: [], rtpBps: t.rtpBps, minTargetBps: t.minTargetBps, maxTargetBps: t.maxTargetBps };
    } else p = { mode: opts.mode, multBps: opts.multBps ?? [], prob: opts.prob ?? [], rtpBps: opts.rtpBps ?? 0, minTargetBps: opts.minTargetBps ?? 0, maxTargetBps: opts.maxTargetBps ?? 0 };
    const game = this.pda.game(creator, seed);
    const ix = await this.program.methods.createGame({
      gameSeed: bn(seed), name: opts.name, uri: opts.uri ?? "", ...p,
      sideJackpotBps: opts.sideJackpotBps ?? 0, sideProbPerUsdc: opts.sideProbPerUsdc ?? 0,
    }).accounts({
      creator, platform: this.pda.platform(), game, gameAuth: this.pda.gameAuth(game), usdcMint: s.usdcMint,
      vault: this.pda.vault(game), shareMint: this.pda.shares(game),
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
    }).instruction();
    return { tx: new Transaction().add(ix), game };
  }
  async tradeSharesIx(user, game, shares, buy) {
    // vault and share mint are PDAs of the game, so this works before the game account exists (create + seed in one tx)
    const s = await this.platform();
    const vault = this.pda.vault(game), shareMint = this.pda.shares(game);
    const m = this.program.methods;
    const args = { user, platform: this.pda.platform(), game, gameAuth: this.pda.gameAuth(game), vault, shareMint,
      userUsdc: this.usdcAta(user, s.usdcMint), userShares: getAssociatedTokenAddressSync(shareMint, user, true),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId };
    return (buy ? m.buyShares(bn(shares)) : m.sellShares(bn(shares))).accounts(args).instruction();
  }
  async buySharesTx(user, game, shares) { return new Transaction().add(await this.tradeSharesIx(user, game, shares, true)); }
  async sellSharesTx(user, game, shares) { return new Transaction().add(await this.tradeSharesIx(user, game, shares, false)); }

  // ---------- solo bets ----------
  async placeBetTx(player, game, amount, targetBps = 0, referrer = PublicKey.default) {
    const s = await this.platform(); const g = await this.game(game);
    const userNonce = freshNonce();
    const bet = this.pda.bet(player, userNonce);
    const force = betForce(bet);
    const ix = await this.program.methods.placeBet(bn(amount), targetBps, bn(userNonce), referrer).accounts({
      player, platform: this.pda.platform(), game, vault: g.vault, usdcMint: s.usdcMint, userUsdc: this.usdcAta(player, s.usdcMint), bet,
      vrf: ORAO_VRF, vrfNetworkState: oraoNetworkState(), vrfTreasury: await this.oraoTreasury(), vrfRandomness: randomnessPda(force),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
    return { tx: new Transaction().add(ix), bet, force, randomness: randomnessPda(force) };
  }
  async isFulfilled(randomness) {
    const acc = await this.connection.getAccountInfo(randomness);
    return !!acc && acc.data.subarray(acc.data.length - 64).some((b) => b !== 0);
  }
  async settleBetTx(settler, betPk, b, referrerUsdc = null) {
    const s = await this.platform(); const g = await this.game(b.game);
    const ix = await this.program.methods.settleBet().accounts({
      settler, platform: this.pda.platform(), game: b.game, gameAuth: this.pda.gameAuth(b.game), bet: betPk, player: b.player, usdcMint: s.usdcMint,
      playerUsdc: this.usdcAta(b.player, s.usdcMint), settlerUsdc: this.usdcAta(settler, s.usdcMint), referrerUsdc,
      vault: g.vault, jackpotVault: s.jackpotVault, vrfRandomness: randomnessPda(Buffer.from(b.force)),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
    return new Transaction().add(ix);
  }
  async refundBetTx(cranker, betPk, b) {
    const s = await this.platform(); const g = await this.game(b.game);
    const ix = await this.program.methods.refundBet().accounts({
      cranker, platform: this.pda.platform(), game: b.game, gameAuth: this.pda.gameAuth(b.game), bet: betPk, player: b.player, usdcMint: s.usdcMint,
      playerUsdc: this.usdcAta(b.player, s.usdcMint), vault: g.vault, vrfRandomness: randomnessPda(Buffer.from(b.force)),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
    return new Transaction().add(ix);
  }
  async claimCreatorTx(creator, game) {
    const s = await this.platform(); const g = await this.game(game);
    const ix = await this.program.methods.claimCreator().accounts({
      creator, platform: this.pda.platform(), game, gameAuth: this.pda.gameAuth(game), vault: g.vault, usdcMint: s.usdcMint,
      creatorUsdc: this.usdcAta(creator, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
    return new Transaction().add(ix);
  }

  // ---------- rounds ----------
  async openRoundTx(opener, game, seed, kind, joinSlots) {
    const round = this.pda.round(game, seed);
    const ix = await this.program.methods.openRound(bn(seed), kind, bn(joinSlots)).accounts({ opener, platform: this.pda.platform(), game, round, systemProgram: SystemProgram.programId }).instruction();
    return { tx: new Transaction().add(ix), round };
  }
  async joinRoundTx(player, round, amount, targetBps = 0, game = null) {
    const s = await this.platform();
    const gamePk = game ?? (await this.round(round)).game;
    const ix = await this.program.methods.joinRound(bn(amount), targetBps).accounts({
      player, platform: this.pda.platform(), game: gamePk, round, vault: this.pda.vault(gamePk), usdcMint: s.usdcMint, userUsdc: this.usdcAta(player, s.usdcMint),
      entry: this.pda.entry(round, player), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
    return new Transaction().add(ix);
  }
  async requestRoundTx(requester, round) {
    const s = await this.platform();
    const force = roundForce(round);
    const ix = await this.program.methods.requestRound().accounts({
      requester, platform: this.pda.platform(), round, vrf: ORAO_VRF, vrfNetworkState: oraoNetworkState(), vrfTreasury: await this.oraoTreasury(),
      vrfRandomness: randomnessPda(force), systemProgram: SystemProgram.programId,
    }).instruction();
    return { tx: new Transaction().add(ix), force };
  }
  async settleRoundTx(settler, round, r) {
    const s = await this.platform(); const g = await this.game(r.game);
    const ix = await this.program.methods.settleRound().accounts({
      settler, platform: this.pda.platform(), game: r.game, gameAuth: this.pda.gameAuth(r.game), round, vault: g.vault, usdcMint: s.usdcMint,
      settlerUsdc: this.usdcAta(settler, s.usdcMint), vrfRandomness: randomnessPda(Buffer.from(r.force)),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
    return new Transaction().add(ix);
  }
  async refundRoundTx(caller, round, r) {
    const ix = await this.program.methods.refundRound().accounts({ caller, platform: this.pda.platform(), round, vrfRandomness: randomnessPda(Buffer.from(r.force)) }).instruction();
    return new Transaction().add(ix);
  }
  async claimEntryTx(caller, round, r, player) {
    const s = await this.platform(); const g = await this.game(r.game);
    const ix = await this.program.methods.claimEntry().accounts({
      caller, platform: this.pda.platform(), game: r.game, gameAuth: this.pda.gameAuth(r.game), round, entry: this.pda.entry(round, player), player,
      usdcMint: s.usdcMint, playerUsdc: this.usdcAta(player, s.usdcMint), vault: g.vault, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction();
    return new Transaction().add(ix);
  }

  async closeEmptyRoundTx(opener, round) { return new Transaction().add(await this.program.methods.closeEmptyRound().accounts({ opener, round }).instruction()); }

  // ---------- markets ----------
  async createMarketTx(creator, seed, p) {
    const s = await this.platform();
    const market = this.pda.market(creator, seed);
    const ix = await this.program.methods.createMarket({
      marketSeed: bn(seed), feedId: Array.from(p.feedId), strike: bn(p.strike), exponent: p.exponent, closeTs: bn(p.closeTs), expiryTs: bn(p.expiryTs),
      resolveWindowSecs: bn(p.resolveWindowSecs ?? 120), rtpBps: p.rtpBps ?? RTP_CAP, name: p.name, uri: p.uri ?? "",
    }).accounts({ creator, platform: this.pda.platform(), market, usdcMint: s.usdcMint, escrow: this.pda.marketEscrow(market),
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).instruction();
    return { tx: new Transaction().add(ix), market };
  }
  async enterMarketTx(player, market, side, amount) {
    const s = await this.platform();
    const ix = await this.program.methods.enterMarket(side, bn(amount)).accounts({
      player, platform: this.pda.platform(), market, escrow: this.pda.marketEscrow(market), usdcMint: s.usdcMint, userUsdc: this.usdcAta(player, s.usdcMint),
      position: this.pda.position(market, player), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
    return new Transaction().add(ix);
  }
  async resolveMarketIx(resolver, market, priceUpdate) {
    const s = await this.platform();
    return this.program.methods.resolveMarket().accounts({
      resolver, platform: this.pda.platform(), market, escrow: this.pda.marketEscrow(market), priceUpdate, usdcMint: s.usdcMint,
      resolverUsdc: this.usdcAta(resolver, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
  }
  /** Read the sponsored push feed for a feed id. Returns null if the account doesn't exist or doesn't match. */
  async readPushFeed(feedId, account = null) {
    const acc = account ?? pushFeedAccount(feedId);
    const info = await this.connection.getAccountInfo(acc);
    if (!info) return null;
    const p = parsePriceUpdate(info.data);
    if (!p.feedId.equals(Buffer.from(typeof feedId === "string" ? feedId.replace(/^0x/, "") : Buffer.from(feedId).toString("hex"), "hex"))) return null;
    return { account: acc, owner: info.owner, ...p };
  }
  async claimMarketFeesTx(caller, market, m) {
    const s = await this.platform();
    const ix = await this.program.methods.claimMarketFees().accounts({
      caller, platform: this.pda.platform(), market, escrow: this.pda.marketEscrow(market), usdcMint: s.usdcMint,
      creatorUsdc: this.usdcAta(m.creator, s.usdcMint), platformUsdc: this.usdcAta(s.authority, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction();
    return new Transaction().add(ix);
  }
  async voidMarketTx(caller, market) { return new Transaction().add(await this.program.methods.voidMarket().accounts({ caller, market }).instruction()); }
  async claimPositionTx(caller, market, player) {
    const s = await this.platform();
    const ix = await this.program.methods.claimPosition().accounts({
      caller, platform: this.pda.platform(), market, escrow: this.pda.marketEscrow(market), position: this.pda.position(market, player), player,
      usdcMint: s.usdcMint, playerUsdc: this.usdcAta(player, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction();
    return new Transaction().add(ix);
  }

  // ---------- events + verification ----------
  parser() { return new anchor.EventParser(this.programId, this.program.coder); }
  onLogs(cb) {
    const parser = this.parser();
    const id = this.connection.onLogs(this.programId, (logs) => {
      try { const evs = [...parser.parseLogs(logs.logs)].map((e) => ({ name: e.name, data: e.data, signature: logs.signature })); if (evs.length) cb(evs); } catch {}
    }, "confirmed");
    return () => this.connection.removeOnLogsListener(id);
  }
  addEventListener(name, cb) { return this.program.addEventListener(name, cb); }
  removeEventListener(id) { return this.program.removeEventListener(id); }

  /** Reproduce a BetSettled event locally and compare. Returns { ok, expected, onchain }. */
  async verifyBetSettled(ev, g) {
    const seed = await seedFromVrf(Uint8Array.from(ev.vrfRandomness));
    const amount = bi(ev.amount), nonce = bi(ev.nonce);
    let o;
    if (g.mode === 0) {
      const cum = []; let c = 0n;
      for (let i = 0; i < g.tableLen; i++) { c += BigInt(g.cumProb[i] - (i ? g.cumProb[i - 1] : 0)); cum.push({ multBps: g.multBps[i], cum: BigInt(g.cumProb[i]) }); }
      o = await outcomeTable(seed, nonce, amount, cum);
    } else o = await outcomeTarget(seed, nonce, amount, g.rtpBps, ev.targetBps);
    const ok = o.r1 === bi(ev.r1) && o.multBps === ev.multBps && o.payout === bi(ev.payout) && Buffer.from(seed).equals(Buffer.from(ev.seed));
    return { ok, expected: o, onchain: { r1: bi(ev.r1), multBps: ev.multBps, payout: bi(ev.payout) } };
  }
}
export default Wagerino;
