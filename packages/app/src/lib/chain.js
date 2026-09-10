import * as anchorNs from "@coral-xyz/anchor";
const anchor = anchorNs.default ?? anchorNs;
import { Connection, PublicKey, Transaction, Keypair, SystemProgram, ComputeBudgetProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { pdas, oraoNetworkState, randomnessPda, betForce, freshNonce, curveCost, DEAD_SHARES, SHARE_UNIT, ORAO_VRF } from "./pdas.js";
import { seedFromVrf, outcomeTable, outcomeTarget } from "./derive.js";

const BN = anchor.BN; const bn = (v) => new BN(v.toString()); const bi = (v) => BigInt(v.toString());
let cfg, conn, program, pid, pda;

export async function init() {
  // config.local.json (gitignored) overrides config.json so deployments and extracts never clobber a live RPC setting
  const local = await fetch("/config.local.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  cfg = local ?? (await (await fetch("/config.json")).json());
  if (!cfg.rpcUrls?.[0]?.startsWith("http")) throw new Error("Set your RPC URL in public/config.local.json (copy public/config.json and edit rpcUrls).");
  const idl = await (await fetch(cfg.idl || "/idl/wagerino.json")).json();
  pid = new PublicKey(idl.address); pda = pdas(pid);
  conn = new Connection(cfg.rpcUrls[0], "confirmed");
  const dummy = Keypair.generate();
  const provider = new anchor.AnchorProvider(conn, { publicKey: dummy.publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t }, { commitment: "confirmed" });
  program = new anchor.Program(idl, provider);
  return { conn, program, pid };
}
export const connection = () => conn;
export const programId = () => pid;
export const P = () => pda;

// ---------- reads ----------
export const platform = () => program.account.platform.fetch(pda.platform());
export const games = () => program.account.game.all();
export const game = (pk) => program.account.game.fetch(pk);
export const bet = (pk) => program.account.bet.fetchNullable(pk);
export async function vaultBalance(g) { return bi((await conn.getTokenAccountBalance(g.vault)).value.amount); }
export async function tokenBalance(ata) { try { return bi((await conn.getTokenAccountBalance(ata)).value.amount); } catch { return 0n; } }
export const usdcAta = (owner, mint) => getAssociatedTokenAddressSync(new PublicKey(mint), owner, true);
export async function jackpotBalance(s) { return tokenBalance(s.jackpotVault); }

// ---------- quotes ----------
export const freePess = (g, vb) => vb - bi(g.reserved) - bi(g.creatorAccrued) - bi(g.platformAccrued) - bi(g.sidePot);
export const freeOpt = (g, vb) => vb - bi(g.creatorAccrued) - bi(g.platformAccrued) - bi(g.sidePot);
export function maxBet(g, s, vb, targetBps = null) {
  const cap = (freePess(g, vb) * BigInt(s.exposureBps)) / 10_000n;
  const mult = g.mode === 0 ? BigInt(g.multBps[0]) : BigInt(targetBps ?? g.maxTargetBps);
  return mult === 0n ? 0n : (cap * 10_000n) / mult;
}
export const navPerShare = (g, vb) => { const n = bi(g.sharesIssued); return n === 0n ? 0n : (freePess(g, vb) * SHARE_UNIT) / n; };
export function quoteBuy(g, s, vb, shares) {
  const issued = bi(g.sharesIssued) === 0n ? DEAD_SHARES : bi(g.sharesIssued);
  const curve = curveCost(bi(s.curveP0), bi(s.curveK), issued, shares);
  const nav = (freeOpt(g, vb) * shares) / issued; const cost = curve > nav ? curve : nav;
  return cost + (cost * BigInt(s.lpFeeBps)) / 10_000n;
}
export function quoteSell(g, s, vb, shares) { const gross = (freePess(g, vb) * shares) / bi(g.sharesIssued); return gross - (gross * BigInt(s.lpFeeBps)) / 10_000n; }
export function tableRows(g) { const rows = []; for (let i = 0; i < g.tableLen; i++) rows.push({ multBps: g.multBps[i], cum: BigInt(g.cumProb[i]), prob: (g.cumProb[i] - (i ? g.cumProb[i - 1] : 0)) / 10_000_000 }); return rows; }

// ---------- tx builders ----------
const withBudget = (ix) => new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }), ix);
async function oraoTreasury() { const info = await conn.getAccountInfo(oraoNetworkState()); return new PublicKey(info.data.subarray(8 + 32, 8 + 64)); }

export async function placeBetTx(player, gamePk, g, s, amount, targetBps = 0, referrer = PublicKey.default) {
  const userNonce = freshNonce(); const betPk = pda.bet(player, userNonce); const force = await betForce(betPk);
  const ix = await program.methods.placeBet(bn(amount), targetBps, bn(userNonce), referrer).accounts({
    player, platform: pda.platform(), game: gamePk, vault: g.vault, usdcMint: s.usdcMint, userUsdc: usdcAta(player, s.usdcMint), bet: betPk,
    vrf: ORAO_VRF, vrfNetworkState: oraoNetworkState(), vrfTreasury: await oraoTreasury(), vrfRandomness: randomnessPda(force),
    tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).instruction();
  const tx = withBudget(ix); tx.feePayer = player; return { tx, betPk, randomness: randomnessPda(force) };
}
export async function settleBetTx(settler, betPk, b, s, g) {
  const ix = await program.methods.settleBet().accounts({
    settler, platform: pda.platform(), game: b.game, gameAuth: pda.gameAuth(b.game), bet: betPk, player: b.player, usdcMint: s.usdcMint,
    playerUsdc: b.payoutTo, settlerUsdc: usdcAta(settler, s.usdcMint), referrerUsdc: null, vault: g.vault, jackpotVault: s.jackpotVault,
    vrfRandomness: randomnessPda(Buffer.from(b.force)), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).instruction();
  const tx = withBudget(ix); tx.feePayer = settler; return tx;
}
export async function tradeSharesTx(user, gamePk, g, s, shares, buy) {
  const m = program.methods; const args = { user, platform: pda.platform(), game: gamePk, gameAuth: pda.gameAuth(gamePk), vault: g.vault, shareMint: g.shareMint,
    userUsdc: usdcAta(user, s.usdcMint), userShares: getAssociatedTokenAddressSync(g.shareMint, user, true), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId };
  const ix = await (buy ? m.buyShares(bn(shares)) : m.sellShares(bn(shares))).accounts(args).instruction();
  const tx = withBudget(ix); tx.feePayer = user; return tx;
}
// ---------- create a game (launchpad) ----------
/** uri codec: "w1|<template>|<emoji>|<skin>" — fits the 64-char on-chain field, readable by any front-end. */
export const encodeUri = (template, emoji = "", skin = "") => `w1|${template}|${emoji}|${skin}`.slice(0, 64);
export const decodeUri = (uri) => { const [v, template, emoji, skin] = (uri || "").split("|"); return v === "w1" ? { template, emoji, skin } : null; };
export async function createGameTx(creator, s, { template, name, emoji, marginBps, seedShares, custom, skinId }) {
  const { TEMPLATES, withMargin, tableToParams } = await import("./templates.js");
  const seed = BigInt(Date.now()); const game = pda.game(creator, seed);
  let p, uri;
  if (custom) { // builder output: { mode, table:[[multBps, prob]], rtpBps, minTargetBps, maxTargetBps }
    p = custom.mode === 0 ? { mode: 0, multBps: custom.table.map(([m]) => m), prob: custom.table.map(([, q]) => q), rtpBps: 0, minTargetBps: 0, maxTargetBps: 0 } : { mode: 1, multBps: [], prob: [], rtpBps: custom.rtpBps, minTargetBps: custom.minTargetBps, maxTargetBps: custom.maxTargetBps };
    uri = skinId ? encodeUri("skin", emoji, skinId) : encodeUri(custom.skinTemplate ?? "custom", emoji);
  } else { const t = withMargin(TEMPLATES[template], marginBps);
    p = t.mode === 0 ? { mode: 0, ...tableToParams(t), rtpBps: 0, minTargetBps: 0, maxTargetBps: 0 } : { mode: 1, multBps: [], prob: [], rtpBps: t.rtpBps, minTargetBps: t.minTargetBps, maxTargetBps: t.maxTargetBps };
    uri = skinId ? encodeUri("skin", emoji, skinId) : encodeUri(template, emoji); }
  const ix = await program.methods.createGame({ gameSeed: bn(seed), name: name.slice(0, 32), uri, ...p, sideJackpotBps: 0, sideProbPerUsdc: 0 }).accounts({
    creator, platform: pda.platform(), game, gameAuth: pda.gameAuth(game), usdcMint: s.usdcMint, vault: pda.vault(game), shareMint: pda.shares(game),
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).instruction();
  const tx = withBudget(ix);
  if (seedShares > 0n) { const gFake = { vault: pda.vault(game), shareMint: pda.shares(game) }; tx.add((await tradeSharesTx(creator, game, gFake, s, seedShares, true)).instructions.at(-1)); }
  tx.feePayer = creator; return { tx, game };
}
export function referrerFromUrl() { try { const m = location.href.match(/[?&]ref=([1-9A-HJ-NP-Za-km-z]{32,44})/); if (m) { localStorage.setItem("wagerino.ref", m[1]); } const r = localStorage.getItem("wagerino.ref"); return r ? new PublicKey(r) : PublicKey.default; } catch { return PublicKey.default; } }
export async function fetchStats() { if (!cfg.statsUrl) return null; try { const r = await fetch(cfg.statsUrl, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; } }

// ---------- session vault ----------
export const session = (owner) => program.account.session.fetchNullable(pda.session(owner));
export const sessionBalance = (owner) => tokenBalance(pda.sessionVault(owner));
export async function openSessionIxs(owner, sessionKey, expiresAt, perBetCap, totalCap, deposit, s) {
  const ixs = [await program.methods.openSession(sessionKey, bn(expiresAt), bn(perBetCap), bn(totalCap)).accounts({
    owner, platform: pda.platform(), session: pda.session(owner), usdcMint: s.usdcMint, sessionVault: pda.sessionVault(owner),
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).instruction()];
  if (deposit > 0n) ixs.push(await program.methods.depositSession(bn(deposit)).accounts({ owner, platform: pda.platform(), session: pda.session(owner), sessionVault: pda.sessionVault(owner), userUsdc: usdcAta(owner, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID }).instruction());
  return ixs;
}
export async function withdrawSessionTx(owner, s, amount = 0n) {
  const ix = await program.methods.withdrawSession(bn(amount)).accounts({ owner, platform: pda.platform(), session: pda.session(owner), sessionVault: pda.sessionVault(owner), usdcMint: s.usdcMint, userUsdc: usdcAta(owner, s.usdcMint), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction();
  const tx = withBudget(ix); tx.feePayer = owner; return tx;
}
export async function revokeSessionTx(owner) { const tx = withBudget(await program.methods.revokeSession().accounts({ owner, session: pda.session(owner) }).instruction()); tx.feePayer = owner; return tx; }
export async function placeBetSessionTx(sessionKey, owner, gamePk, g, amount, targetBps = 0, referrer = PublicKey.default) {
  const userNonce = freshNonce(); const betPk = pda.bet(owner, userNonce); const force = await betForce(betPk);
  const ix = await program.methods.placeBetSession(bn(amount), targetBps, bn(userNonce), referrer).accounts({
    sessionKey, session: pda.session(owner), sessionVault: pda.sessionVault(owner), platform: pda.platform(), game: gamePk, vault: g.vault, bet: betPk,
    vrf: ORAO_VRF, vrfNetworkState: oraoNetworkState(), vrfTreasury: await oraoTreasury(), vrfRandomness: randomnessPda(force),
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction();
  const tx = withBudget(ix); tx.feePayer = sessionKey; return { tx, betPk, randomness: randomnessPda(force) };
}
export const SYSVAR_RENT = SYSVAR_RENT_PUBKEY;

export async function isFulfilled(rnd) { const a = await conn.getAccountInfo(rnd); return !!a && a.data.subarray(a.data.length - 64).some((b) => b !== 0); }

// ---------- events ----------
export const parser = () => new anchor.EventParser(pid, program.coder);
export function decodeSettled(d) {
  return { game: d.game.toBase58(), bet: d.bet.toBase58(), player: d.player.toBase58(), amount: bi(d.amount), targetBps: d.targetBps, nonce: bi(d.nonce),
    vrfRandomness: Array.from(d.vrfRandomness), seed: Array.from(d.seed), r1: bi(d.r1), r2: bi(d.r2), r3: d.r3 !== undefined ? bi(d.r3) : null, multBps: d.multBps, payout: bi(d.payout),
    jackpot: d.jackpot, jackpotPaid: bi(d.jackpotPaid), sidePaid: bi(d.sidePaid ?? 0) };
}
export async function findSettled(betPk) {
  const sigs = await conn.getSignaturesForAddress(betPk, { limit: 10 }); const p = parser();
  for (const s of sigs) {
    const tx = await conn.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx?.meta?.logMessages) continue;
    for (const ev of p.parseLogs(tx.meta.logMessages)) if (ev.name.toLowerCase() === "betsettled") return { ev: decodeSettled(ev.data), signature: s.signature, time: (tx.blockTime || 0) * 1000 };
  }
  return null;
}
export async function backfill(limit = 60) {
  const sigs = await conn.getSignaturesForAddress(pid, { limit }); const p = parser(); const out = [];
  for (const s of sigs) { try { const tx = await conn.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }); if (!tx?.meta?.logMessages) continue;
    for (const ev of p.parseLogs(tx.meta.logMessages)) if (ev.name.toLowerCase() === "betsettled") out.push({ ...decodeSettled(ev.data), signature: s.signature, time: (tx.blockTime || 0) * 1000 }); } catch {} }
  return out;
}
export function onSettled(cb) {
  const p = parser();
  const id = conn.onLogs(pid, (logs) => { try { for (const ev of p.parseLogs(logs.logs)) if (ev.name.toLowerCase() === "betsettled") cb({ ...decodeSettled(ev.data), signature: logs.signature, time: Date.now() }); } catch {} }, "confirmed");
  return () => conn.removeOnLogsListener(id);
}
/** Local re-derivation of a settlement. */
export async function verify(ev, g) {
  const seed = await seedFromVrf(Uint8Array.from(ev.vrfRandomness));
  const o = g.mode === 0 ? await outcomeTable(seed, ev.nonce, ev.amount, tableRows(g)) : await outcomeTarget(seed, ev.nonce, ev.amount, g.rtpBps, ev.targetBps);
  const ok = o.r1 === ev.r1 && o.multBps === ev.multBps && o.payout === ev.payout && Buffer.from(seed).equals(Buffer.from(ev.seed));
  return { ok, seed: Buffer.from(seed).toString("hex"), o };
}
