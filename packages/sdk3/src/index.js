// @wagerino/sdk3 — client for the Wagerino v3 program (houses on a communal bankroll). Node + browser.
import * as anchorNs from "@coral-xyz/anchor";
const anchor = anchorNs.default ?? anchorNs;
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { pdas, oraoNetworkState, randomnessPda, betForce, freshNonce, scaledMult, ORAO_VRF, USDC_UNIT } from "./pdas.js";
import { seedFromVrf, outcomeTable, outcomeTarget } from "./derive.js";
import { TEMPLATES, withMargin, tableToParams } from "./templates.js";
export * from "./pdas.js"; export * from "./derive.js"; export * from "./templates.js";
const BN = anchor.BN; const bn = (v) => new BN(v.toString()); const bi = (v) => BigInt(v.toString());
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export class Wagerino3 {
  constructor(connection, idl, wallet) {
    this.connection = connection; this.programId = new PublicKey(idl.address);
    const w = wallet ?? { publicKey: PublicKey.default, signTransaction: async (t) => t, signAllTransactions: async (t) => t };
    this.provider = new anchor.AnchorProvider(connection, w, { commitment: "confirmed" });
    this.program = new anchor.Program(idl, this.provider); this.pda = pdas(this.programId); this.wallet = w;
  }
  // ---------- reads ----------
  platform() { return this.program.account.platform.fetch(this.pda.platform()); }
  houses() { return this.program.account.house.all(); }
  house(pk) { return this.program.account.house.fetch(pk); }
  async houseByHandle(h) { const acc = await this.program.account.handle.fetchNullable(this.pda.handle(h)); return acc ? acc.house : null; }
  templates() { return this.program.account.template.all(); }
  template(pk) { return this.program.account.template.fetch(pk); }
  balance(owner) { return this.program.account.balance.fetchNullable(this.pda.balance(owner)); }
  bet(pk) { return this.program.account.bet.fetchNullable(pk); }
  pendingBets() { return this.program.account.bet.all(); }
  stakePos(house, owner) { return this.program.account.stakePos.fetchNullable(this.pda.stakePos(house, owner)); }
  sales(house) { return this.program.account.sale.all([{ memcmp: { offset: 8 + 2, bytes: house.toBase58() } }]); }
  async tokenBalance(acc) { try { return bi((await this.connection.getTokenAccountBalance(acc)).value.amount); } catch { return 0n; } }
  balanceOf(owner) { return this.tokenBalance(this.pda.balanceVault(owner)); }
  bankroll() { return this.tokenBalance(this.pda.vault()); }
  jackpotPot() { return this.tokenBalance(this.pda.jackpot()); }
  usdcAta(owner, mint) { return getAssociatedTokenAddressSync(new PublicKey(mint), owner, true); }
  async oraoTreasury() { const info = await this.connection.getAccountInfo(oraoNetworkState()); return new PublicKey(info.data.subarray(40, 72)); }
  // ---------- quotes ----------
  free(s, vaultBal) { return vaultBal - bi(s.reserved) - bi(s.liabilities); }
  freeOptimistic(s, vaultBal) { return vaultBal - bi(s.liabilities); }
  effectiveRtp(s, h) { return s.maxRtpBps - h.marginBps; }
  payoutRows(s, h, t) { const rows = []; for (let i = 0; i < t.tableLen; i++) rows.push({ multBps: scaledMult(t.multBps[i], t.rtpBps, s.maxRtpBps, h.marginBps), cum: BigInt(t.cumProb[i]), prob: (t.cumProb[i] - (i ? t.cumProb[i - 1] : 0)) / 1e7 }); return rows; }
  maxBet(s, h, t, vaultBal, targetBps = null) { const cap = (this.free(s, vaultBal) * BigInt(s.exposureBps)) / 10_000n; const mult = t.mode === 0 ? BigInt(scaledMult(t.multBps[0], t.rtpBps, s.maxRtpBps, h.marginBps)) : BigInt(targetBps ?? t.maxTargetBps); return mult === 0n ? 0n : (cap * 10_000n) / mult; }
  async nav(s) { const vb = await this.bankroll(); const supply = bi((await this.connection.getTokenSupply(this.pda.lpMint())).value.amount); return supply === 0n ? USDC_UNIT : (this.free(s, vb) * USDC_UNIT) / supply; }
  jackpotOdds(s, amount) { return Number(amount) / Number(s.jackpotVolumeTarget); }
  // ---------- tx plumbing ----------
  budget(tx) { tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })); return tx; }
  async send(tx, signers = []) {
    this.budget(tx); tx.feePayer = tx.feePayer ?? this.wallet.publicKey;
    for (let attempt = 1; ; attempt++) {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed"); tx.recentBlockhash = blockhash; tx.signatures = [];
      if (signers.length) tx.partialSign(...signers); const signed = await this.wallet.signTransaction(tx); let sig;
      try { sig = await this.connection.sendRawTransaction(signed.serialize(), { maxRetries: 5 }); }
      catch (e) { const logs = e.logs ?? (typeof e.getLogs === "function" ? await e.getLogs(this.connection).catch(() => null) : null); const tail = logs ? logs.filter((l) => /Program log|failed/.test(l)).slice(-4).join(" | ") : ""; throw new Error(`${String(e.message ?? e).split("\n")[0]}${tail ? " :: " + tail : ""}`); }
      try { const r = await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed"); if (r.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(r.value.err)}`); return sig; }
      catch (e) { if (!/expired|block height exceeded/i.test(String(e?.message ?? e)) || attempt >= 2) throw e; const st = await this.connection.getSignatureStatus(sig, { searchTransactionHistory: true }); if (st?.value && !st.value.err) return sig; }
    }
  }
  // ---------- platform ----------
  async initPlatformTx(payer, usdcMint, params, authority = payer) {
    const [programData] = PublicKey.findProgramAddressSync([this.programId.toBuffer()], BPF_LOADER);
    const p = { ...params, jackpotVolumeTarget: bn(params.jackpotVolumeTarget), minBet: bn(params.minBet), refundTimeoutSlots: bn(params.refundTimeoutSlots) };
    const ix = await this.program.methods.initPlatform(p).accounts({ payer, authority, thisProgram: this.programId, programData, platform: this.pda.platform(), usdcMint, vault: this.pda.vault(), lpMint: this.pda.lpMint(), jackpotVault: this.pda.jackpot(), vrf: ORAO_VRF, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).instruction();
    return new Transaction().add(ix);
  }
  async claimPlatformTx(authority, to) { const s = await this.platform(); return new Transaction().add(await this.program.methods.claimPlatform().accounts({ authority, platform: this.pda.platform(), vault: s.vault, to, tokenProgram: TOKEN_PROGRAM_ID }).instruction()); }
  // ---------- templates ----------
  async publishTemplateTx(author, seed, key, { uri = "", royaltyBps = 0, name } = {}) {
    const t = TEMPLATES[key]; const p = t.mode === 0 ? { mode: 0, ...tableToParams(t), rtpBps: 0, minTargetBps: 0, maxTargetBps: 0 } : { mode: 1, multBps: [], prob: [], rtpBps: t.rtpBps, minTargetBps: t.minTargetBps, maxTargetBps: t.maxTargetBps };
    const template = this.pda.template(author, seed);
    const ix = await this.program.methods.publishTemplate({ seed: bn(seed), name: name ?? t.name, uri, royaltyBps, ...p }).accounts({ author, platform: this.pda.platform(), template, systemProgram: SystemProgram.programId }).instruction();
    return { tx: new Transaction().add(ix), template };
  }
  async publishCustomTemplateTx(author, seed, args) { const template = this.pda.template(author, seed); const ix = await this.program.methods.publishTemplate({ seed: bn(seed), name: args.name, uri: args.uri ?? "", royaltyBps: args.royaltyBps ?? 0, mode: args.mode, multBps: args.multBps ?? [], prob: args.prob ?? [], rtpBps: args.rtpBps ?? 0, minTargetBps: args.minTargetBps ?? 0, maxTargetBps: args.maxTargetBps ?? 0 }).accounts({ author, platform: this.pda.platform(), template, systemProgram: SystemProgram.programId }).instruction(); return { tx: new Transaction().add(ix), template }; }
  // ---------- houses ----------
  async createHouseTx(creator, seed, handle, name, uri, marginBps) {
    const house = this.pda.house(creator, seed);
    const ix = await this.program.methods.createHouse(bn(seed), handle, name, uri, marginBps).accounts({ creator, platform: this.pda.platform(), house, handleAcc: this.pda.handle(handle), shareMint: this.pda.shareMint(house), stakeVault: this.pda.stakeVault(house), creatorPos: this.pda.stakePos(house, creator), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).instruction();
    return { tx: new Transaction().add(ix), house };
  }
  async setHouseTx(creator, house, { marginBps = null, name = null, uri = null, paused = null }) { return new Transaction().add(await this.program.methods.setHouse(marginBps, name, uri, paused).accounts({ creator, platform: this.pda.platform(), house }).instruction()); }
  async claimHouseTx(owner, house) { const s = await this.platform(); return new Transaction().add(await this.program.methods.claimHouse().accounts({ owner, platform: this.pda.platform(), vault: s.vault, house, pos: this.pda.stakePos(house, owner), balance: this.pda.balance(owner), balanceVault: this.pda.balanceVault(owner), tokenProgram: TOKEN_PROGRAM_ID }).instruction()); }
  async stakeTx(owner, house, amount, stake = true) {
    const s = await this.platform(); const h = await this.house(house);
    const accs = { owner, platform: this.pda.platform(), vault: s.vault, house, shareMint: h.shareMint, stakeVault: h.stakeVault, pos: this.pda.stakePos(house, owner), userShares: getAssociatedTokenAddressSync(h.shareMint, owner), balance: this.pda.balance(owner), balanceVault: this.pda.balanceVault(owner), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId };
    return new Transaction().add(await (stake ? this.program.methods.stake(bn(amount)) : this.program.methods.unstake(bn(amount))).accounts(accs).instruction());
  }
  async listSharesTx(seller, house, price, amount) { const h = await this.house(house); const sale = this.pda.sale(seller, house); return { tx: new Transaction().add(await this.program.methods.listShares(bn(1), bn(price), bn(amount)).accounts({ seller, house, shareMint: h.shareMint, sale, escrow: this.pda.saleEscrow(sale), sellerShares: getAssociatedTokenAddressSync(h.shareMint, seller), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).instruction()), sale }; }
  async cancelSaleTx(seller, house) { const h = await this.house(house); const sale = this.pda.sale(seller, house); return new Transaction().add(await this.program.methods.cancelSale().accounts({ seller, sale, house, escrow: this.pda.saleEscrow(sale), sellerShares: getAssociatedTokenAddressSync(h.shareMint, seller), tokenProgram: TOKEN_PROGRAM_ID }).instruction()); }
  async buySharesTx(buyer, sale, amount) { const s = await this.platform(); const sa = await this.program.account.sale.fetch(sale); const h = await this.house(sa.house); return new Transaction().add(await this.program.methods.buyShares(bn(amount)).accounts({ buyer, platform: this.pda.platform(), vault: s.vault, sale, house: sa.house, shareMint: h.shareMint, escrow: this.pda.saleEscrow(sale), buyerBalance: this.pda.balance(buyer), buyerVault: this.pda.balanceVault(buyer), sellerBalance: this.pda.balance(sa.seller), sellerVault: this.pda.balanceVault(sa.seller), buyerShares: getAssociatedTokenAddressSync(h.shareMint, buyer), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction()); }
  // ---------- balance & session ----------
  async openBalanceIx(owner, sessionKey, expiresAt, perBetCap, totalCap, referrer = PublicKey.default) { const s = await this.platform(); return this.program.methods.openBalance(sessionKey, bn(expiresAt), bn(perBetCap), bn(totalCap), referrer).accounts({ owner, platform: this.pda.platform(), balance: this.pda.balance(owner), usdcMint: s.usdcMint, balanceVault: this.pda.balanceVault(owner), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).instruction(); }
  async depositIx(owner, amount) { const s = await this.platform(); return this.program.methods.deposit(bn(amount)).accounts({ owner, balance: this.pda.balance(owner), balanceVault: this.pda.balanceVault(owner), userUsdc: this.usdcAta(owner, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID }).instruction(); }
  async withdrawTx(owner, amount = 0n) { const s = await this.platform(); return new Transaction().add(await this.program.methods.withdraw(bn(amount)).accounts({ owner, platform: this.pda.platform(), balance: this.pda.balance(owner), balanceVault: this.pda.balanceVault(owner), usdcMint: s.usdcMint, userUsdc: this.usdcAta(owner, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction()); }
  async revokeSessionTx(owner) { return new Transaction().add(await this.program.methods.revokeSession().accounts({ owner, balance: this.pda.balance(owner) }).instruction()); }
  // ---------- bankroll ----------
  async bankrollDepositTx(owner, usdc) { const s = await this.platform(); return new Transaction().add(await this.program.methods.bankrollDeposit(bn(usdc)).accounts({ owner, platform: this.pda.platform(), vault: s.vault, lpMint: s.lpMint, balance: this.pda.balance(owner), balanceVault: this.pda.balanceVault(owner), userLp: getAssociatedTokenAddressSync(s.lpMint, owner), deadLp: getAssociatedTokenAddressSync(s.lpMint, this.pda.platform(), true), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction()); }
  async bankrollWithdrawTx(owner, lp) { const s = await this.platform(); return new Transaction().add(await this.program.methods.bankrollWithdraw(bn(lp)).accounts({ owner, platform: this.pda.platform(), vault: s.vault, lpMint: s.lpMint, balance: this.pda.balance(owner), balanceVault: this.pda.balanceVault(owner), userLp: getAssociatedTokenAddressSync(s.lpMint, owner), tokenProgram: TOKEN_PROGRAM_ID }).instruction()); }
  // ---------- bets ----------
  async placeBetTx(signer, owner, house, template, amount, targetBps = 0) {
    const s = await this.platform(); const userNonce = freshNonce(); const bet = this.pda.bet(owner, userNonce); const force = await betForce(bet);
    const ix = await this.program.methods.placeBet(bn(amount), targetBps, bn(userNonce)).accounts({ signer, platform: this.pda.platform(), vault: s.vault, house, template, balance: this.pda.balance(owner), balanceVault: this.pda.balanceVault(owner), bet, vrf: ORAO_VRF, vrfNetworkState: oraoNetworkState(), vrfTreasury: await this.oraoTreasury(), vrfRandomness: randomnessPda(force), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction();
    const tx = new Transaction().add(ix); tx.feePayer = signer; return { tx, bet, force, randomness: randomnessPda(force) };
  }
  async isFulfilled(rnd) { const a = await this.connection.getAccountInfo(rnd); return !!a && a.data.subarray(a.data.length - 64).some((b) => b !== 0); }
  async settleBetTx(settler, betPk, b) {
    const s = await this.platform(); const bal = await this.balance(b.player);
    let referrerVault = null; if (bal && !bal.referrer.equals(PublicKey.default)) { const rv = this.pda.balanceVault(bal.referrer); if (await this.connection.getAccountInfo(rv)) referrerVault = rv; }
    const ix = await this.program.methods.settleBet().accounts({ settler, platform: this.pda.platform(), vault: s.vault, jackpotVault: s.jackpotVault, house: b.house, template: b.template, bet: betPk, player: b.player, balance: this.pda.balance(b.player), playerVault: b.payoutTo, settlerUsdc: this.usdcAta(settler, s.usdcMint), referrerVault, vrfRandomness: randomnessPda(Buffer.from(b.force)), tokenProgram: TOKEN_PROGRAM_ID }).instruction();
    const tx = new Transaction().add(ix); tx.feePayer = settler; return tx;
  }
  async refundBetTx(cranker, betPk, b) { const s = await this.platform(); const tx = new Transaction().add(await this.program.methods.refundBet().accounts({ cranker, platform: this.pda.platform(), vault: s.vault, bet: betPk, player: b.player, playerVault: b.payoutTo, vrfRandomness: randomnessPda(Buffer.from(b.force)), tokenProgram: TOKEN_PROGRAM_ID }).instruction()); tx.feePayer = cranker; return tx; }
  // ---------- events + verification ----------
  parser() { return new anchor.EventParser(this.programId, this.program.coder); }
  addEventListener(n, cb) { return this.program.addEventListener(n, cb); }
  removeEventListener(id) { return this.program.removeEventListener(id); }
  /** Recompute a settlement from the event + template + platform cap. */
  async verify(ev, t, maxRtpBps) {
    const seed = await seedFromVrf(Uint8Array.from(ev.vrfRandomness)); const amount = bi(ev.amount), nonce = bi(ev.nonce);
    let o;
    if (t.mode === 0) { const rows = []; for (let i = 0; i < t.tableLen; i++) rows.push({ multBps: scaledMult(t.multBps[i], t.rtpBps, maxRtpBps, ev.marginBps), cum: BigInt(t.cumProb[i]) }); o = await outcomeTable(seed, nonce, amount, rows); }
    else o = await outcomeTarget(seed, nonce, amount, maxRtpBps - ev.marginBps, ev.targetBps);
    const payout = o.payout < bi(ev.payout) ? o.payout : o.payout; // max_payout clamp is equal for scaled rows
    return { ok: o.r1 === bi(ev.r1) && o.multBps === ev.multBps && payout === bi(ev.payout) && Buffer.from(seed).equals(Buffer.from(ev.seed)), seedHex: Buffer.from(seed).toString("hex"), o };
  }
}
export default Wagerino3;
