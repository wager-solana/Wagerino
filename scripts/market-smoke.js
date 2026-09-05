// Creates a short SOL/USD price market and enters both sides in ONE transaction, then reports.
// market-smoke.js [minutesUntilExpiry=7] [strikeUsd=200]
import { load } from "./_env.js";
const { sdk, kp } = load();
const minutes = Number(process.argv[2] || 7), strike = Number(process.argv[3] || 200);
const feedId = Buffer.from("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", "hex"); // Pyth SOL/USD
const now = Math.floor(Date.now() / 1000);
const { tx, market } = await sdk.createMarketTx(kp.publicKey, BigInt(now), {
  feedId, strike: BigInt(Math.round(strike * 1e8)), exponent: -8, closeTs: now + minutes * 60 - 60, expiryTs: now + minutes * 60,
  resolveWindowSecs: 120, rtpBps: 9700, name: `SOL > ${strike}?`,
});
tx.add((await sdk.enterMarketTx(kp.publicKey, market, 1, 1_000_000n)).instructions[0]);
tx.add((await sdk.enterMarketTx(kp.publicKey, market, 0, 1_000_000n)).instructions[0]);
const sig = await sdk.send(tx);
const m = await sdk.market(market);
console.log(`market ${market.toBase58()} "${m.name}" yes=${Number(m.yesPool) / 1e6} no=${Number(m.noPool) / 1e6} expires ${new Date(Number(m.expiryTs) * 1000).toISOString()} sig=${sig}`);
console.log("watch the cranker for: resolved market …, claimed position …");
