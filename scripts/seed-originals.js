// Creates every Originals game the app expects (skips ones that already exist), seeding each with `seedShares` shares.
// seed-originals.js [seedShares=50] [marginBps=100]
import { load } from "./_env.js";
import { ORIGINALS, TEMPLATES } from "@wagerino/sdk";
const { sdk, kp } = load();
const seedShares = BigInt(process.argv[2] ?? 50), marginBps = Number(process.argv[3] ?? 100);
const existing = (await sdk.games()).map((g) => g.account.name.toLowerCase());
for (const key of ORIGINALS) {
  const t = TEMPLATES[key];
  if (existing.some((n) => n === t.name.toLowerCase())) { console.log(`skip ${t.name} (exists)`); continue; }
  const margin = key === "diamonds" || key.startsWith("plinko_high") ? 0 : marginBps; // tables already below the cap keep their shape
  const { tx, game } = await sdk.createGameTx(kp.publicKey, BigInt(Date.now()), { template: key, marginBps: margin, name: t.name });
  if (seedShares > 0n) tx.add(await sdk.tradeSharesIx(kp.publicKey, game, seedShares * 1_000_000n, true));
  try { const sig = await sdk.send(tx); const g = await sdk.game(game); console.log(`created ${g.name} rtp=${g.rtpBps}bps vault≈${seedShares} USDC ${game.toBase58()} sig=${sig.slice(0, 12)}`); }
  catch (e) { console.log(`FAILED ${t.name}: ${String(e.message).split("\n")[0]}`); }
}
