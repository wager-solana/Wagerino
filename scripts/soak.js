// Devnet soak: random bets, share trades, rounds, and a market, verifying every settlement. Run alongside the cranker.
// soak.js <minutes>
import { PublicKey } from "@solana/web3.js";
import { load } from "./_env.js";
const { sdk, kp, conn } = load();
const minutes = Number(process.argv[2] || 30);
const end = Date.now() + minutes * 60_000;
const rnd = (n) => Math.floor(Math.random() * n);
let placed = 0, verified = 0, mismatches = 0;
const games = (await sdk.games()).filter((g) => !g.account.paused);
if (!games.length) { console.error("no games — run create-game.js first"); process.exit(1); }
console.log(`soak: ${games.length} games, ${minutes} min, wallet ${kp.publicKey}`);
sdk.addEventListener("betSettled", async (ev) => {
  if (!ev.player.equals(kp.publicKey)) return;
  const g = await sdk.game(ev.game);
  const v = await sdk.verifyBetSettled(ev, g);
  verified++; if (!v.ok) { mismatches++; console.error("MISMATCH", ev.bet.toBase58(), v); }
  console.log(`settled ${ev.bet.toBase58().slice(0, 8)} ${ev.multBps / 10000}x payout=${Number(ev.payout) / 1e6}${ev.jackpot ? " JACKPOT" : ""} verified=${v.ok}`);
});
const usdcAta = sdk.usdcAta(kp.publicKey, (await sdk.platform()).usdcMint);
const myUsdc = async () => { try { return BigInt((await conn.getTokenAccountBalance(usdcAta)).value.amount); } catch { return 0n; } };
while (Date.now() < end) {
  try {
    const bal = await myUsdc();
    if (bal < 2_000_000n) { console.log(`wallet USDC ${Number(bal) / 1e6} — below 2 USDC, pausing 60s (top up to continue)`); await new Promise((r) => setTimeout(r, 60_000)); continue; }
    const g = games[rnd(games.length)];
    const s = await sdk.platform(); const acc = await sdk.game(g.publicKey); const vb = await sdk.vaultBalance(acc);
    const target = acc.mode === 1 ? acc.minTargetBps + rnd(Math.min(acc.maxTargetBps, 50_000) - acc.minTargetBps) : 0; // crash targets 1.01x–5x
    const max = sdk.maxBet(acc, s, vb, target || null);
    if (max < 100_000n) { console.log(`game ${acc.name}: vault too small for this bet (max ${Number(max) / 1e6} USDC) — deepen the vault to unlock`); await new Promise((r) => setTimeout(r, 5000)); continue; }
    const amount = 100_000n + BigInt(rnd(Number(max - 100_000n) / 4 + 1));
    const { tx, bet } = await sdk.placeBetTx(kp.publicKey, g.publicKey, amount, target);
    await sdk.send(tx); placed++;
    console.log(`bet ${bet.toBase58().slice(0, 8)} on ${acc.name} ${Number(amount) / 1e6} USDC${target ? ` target ${target / 10000}x` : ""}`);
    if (rnd(6) === 0 && bal > 25_000_000n) { const q = sdk.quoteBuy(acc, s, vb, 10_000_000n); await sdk.send(await sdk.buySharesTx(kp.publicKey, g.publicKey, 10_000_000n)); console.log(`bought 10 shares for ${Number(q) / 1e6} USDC`); }
    if (rnd(8) === 0) {
      const kind = rnd(2); // 0 shared draw, 1 raffle
      const stake = kind === 1 ? 1_000_000n : amount; // raffles have no vault exposure; shared rounds are capped like bets
      const { tx: rt, round } = await sdk.openRoundTx(kp.publicKey, g.publicKey, BigInt(Date.now()), kind, 20n);
      rt.add((await sdk.joinRoundTx(kp.publicKey, round, stake, target || 0, g.publicKey)).instructions[0]); // open + join in one tx: no empty rounds
      await sdk.send(rt); console.log(`round ${round.toBase58().slice(0, 8)} (${kind ? "raffle" : "shared"}) opened+joined ${Number(stake) / 1e6} USDC`);
    }
  } catch (e) { console.log("soak step error:", String(e?.message ?? e).split("\n")[0]); }
  await new Promise((r) => setTimeout(r, 4000 + rnd(6000)));
}
console.log(`done: placed=${placed} verified=${verified} mismatches=${mismatches}`);
process.exit(mismatches ? 1 : 0);
