// One bet, end to end: place (1 signature) → wait for VRF → settle (cranker first, self-settle if slow) → fetch proof → verify.
import { PublicKey } from "@solana/web3.js";
import * as chain from "./chain.js";
import { signAndSend } from "./wallet.js";
import { sendWithSession } from "./session.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBet({ wallet, sessionKp, gamePk, g, s, amount, targetBps = 0, referrer, onStep }) {
  let betPk, randomness, placeSig;
  if (sessionKp) {
    onStep?.("sign", "Placing bet…");
    const built = await chain.placeBetSessionTx(sessionKp.publicKey, wallet.publicKey, gamePk, g, amount, targetBps, referrer ?? PublicKey.default);
    betPk = built.betPk; randomness = built.randomness; placeSig = await sendWithSession(chain.connection(), sessionKp, built.tx);
  } else {
    onStep?.("sign", "Confirm the bet in your wallet");
    const built = await chain.placeBetTx(wallet.publicKey, gamePk, g, s, amount, targetBps, referrer ?? PublicKey.default);
    betPk = built.betPk; randomness = built.randomness; placeSig = await signAndSend(wallet.provider, chain.connection(), built.tx);
  }
  onStep?.("oracle", "Drawing randomness…");
  const t0 = Date.now(); let fulfilledAt = null;
  for (;;) {
    const b = await chain.bet(betPk);
    if (!b) break; // settled by a cranker
    if (!fulfilledAt && (await chain.isFulfilled(randomness))) fulfilledAt = Date.now();
    if (fulfilledAt && Date.now() - fulfilledAt > (sessionKp ? 2500 : 6000)) {
      // session key settles silently; wallet users are asked once
      if (sessionKp) { try { await sendWithSession(chain.connection(), sessionKp, await chain.settleBetTx(sessionKp.publicKey, betPk, b, s, g)); } catch (e) { if (await chain.bet(betPk)) throw e; } break; }
      onStep?.("settle", "Settle & reveal — one more confirmation");
      try { await signAndSend(wallet.provider, chain.connection(), await chain.settleBetTx(wallet.publicKey, betPk, b, s, g)); } catch (e) { if (await chain.bet(betPk)) throw e; }
      break;
    }
    if (Date.now() - t0 > 180000) throw new Error("The oracle is slow. Your bet auto-refunds after ~10 minutes if it never answers.");
    await sleep(1200);
  }
  onStep?.("proof", "Fetching proof…");
  const found = await waitForProof(betPk, 90000);
  if (!found) throw new Error("Settled, but the proof hasn't appeared yet. Check the live bets in a moment — your USDC is already paid.");
  const v = await chain.verify(found.ev, g); return { ...found, verified: v.ok, seedHex: v.seed, placeSig };
}

/** Auto-bet loop with the classic controls. `bet(amount)` performs one bet and returns { payout, amount }. */
export async function runAuto({ base, count, onWinPct, onLossPct, stopProfit, stopLoss, bet, onProgress, signal }) {
  let amount = base, profit = 0n, n = 0;
  while (!signal.aborted && (count === 0 || n < count)) {
    const r = await bet(amount); n++;
    const delta = r.payout - r.amount; profit += delta;
    onProgress?.({ n, profit, amount });
    if (stopProfit > 0n && profit >= stopProfit) break;
    if (stopLoss > 0n && -profit >= stopLoss) break;
    const won = r.payout > r.amount;
    const pct = won ? onWinPct : onLossPct;
    amount = pct === null ? base : amount + (amount * BigInt(Math.round(pct * 100))) / 10_000n;
  }
  return { n, profit };
}

/** Race a live event subscription against signature-history polling. */
function waitForProof(betPk, ms) {
  const key = betPk.toBase58();
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; off(); resolve(v); } };
    const off = chain.onSettled((ev) => { if (ev.bet === key) finish({ ev, signature: ev.signature, time: ev.time }); });
    (async () => { const t0 = Date.now(); while (!done && Date.now() - t0 < ms) { try { const f = await chain.findSettled(betPk); if (f) return finish(f); } catch {} await sleep(2000); } finish(null); })();
  });
}