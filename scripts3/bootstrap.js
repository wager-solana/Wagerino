// Idempotent v3 bootstrap: platform → launch templates → Wagerino House → authority balance → bankroll seed.
// bootstrap.js <USDC_MINT> [bankrollSeedUsdc=0]
import { PublicKey, Transaction } from "@solana/web3.js";
import { ORIGINALS, TEMPLATES, DEFAULT_PARAMS } from "@wagerino/sdk3";
import { load } from "./_env.js";
const { sdk, kp } = load(); const usdc = new PublicKey(process.argv[2] || (() => { console.error("usage: bootstrap.js <USDC_MINT> [bankrollSeedUsdc]"); process.exit(1); })());
const seedUsdc = BigInt(Math.round(parseFloat(process.argv[3] || "0") * 1e6));
const me = kp.publicKey;
// 1. platform
let s = await sdk.platform().catch(() => null);
if (!s) { const sig = await sdk.send(await sdk.initPlatformTx(me, usdc, DEFAULT_PARAMS)); console.log("platform initialized", sig.slice(0, 12)); s = await sdk.platform(); } else console.log("platform exists");
// 2. templates (seeds 1..N, deterministic by ORIGINALS order)
const existing = (await sdk.templates()).map((t) => t.account.name);
for (let i = 0; i < ORIGINALS.length; i++) { const key = ORIGINALS[i]; const name = TEMPLATES[key].name; if (existing.includes(name)) { console.log(`template exists: ${name}`); continue; }
  try { const { tx, template } = await sdk.publishTemplateTx(me, BigInt(i + 1), key, { uri: `w3|${key}` }); const sig = await sdk.send(tx); console.log(`published ${name} ${template.toBase58()} ${sig.slice(0, 12)}`); } catch (e) { console.log(`FAILED ${name}: ${String(e.message).split("\n")[0]}`); } }
// 3. Wagerino House
let house = await sdk.houseByHandle("wagerino");
if (!house) { const { tx, house: h } = await sdk.createHouseTx(me, 1n, "wagerino", "Wagerino House", "w3|house|🎰|The reference casino. Every template, fair by default.", 200); const sig = await sdk.send(tx); house = h; console.log(`house created ${h.toBase58()} ${sig.slice(0, 12)}`); } else console.log(`house exists ${house.toBase58()}`);
// 4. authority balance (owner-signed sessions only) + optional bankroll seed
const bal = await sdk.balance(me);
if (!bal) { const tx = new Transaction().add(await sdk.openBalanceIx(me, me, Math.floor(Date.now() / 1000) + 29 * 86400, 1_000_000_000n, 1_000_000_000_000n)); const sig = await sdk.send(tx); console.log("balance opened", sig.slice(0, 12)); }
if (seedUsdc > 0n) {
  const have = await sdk.balanceOf(me);
  if (have < seedUsdc) { const tx = new Transaction().add(await sdk.depositIx(me, seedUsdc - have)); await sdk.send(tx); console.log(`deposited ${Number(seedUsdc - have) / 1e6} USDC to balance`); } else console.log(`balance already holds ${Number(have) / 1e6} USDC`);
  for (let i = 0; i < 5; i++) { try { const sig = await sdk.send(await sdk.bankrollDepositTx(me, seedUsdc)); console.log(`bankroll seeded with ${Number(seedUsdc) / 1e6} USDC ${sig.slice(0, 12)}`); break; }
    catch (e) { const m = String(e.message).split("\n")[0]; if (i === 4 || !/insufficient funds|does not exist/i.test(m)) throw e; console.log(`bankroll deposit: RPC not caught up yet (${m.slice(0, 60)}…), retrying`); await new Promise((r) => setTimeout(r, 3000)); } }
}
const vb = await sdk.bankroll(); const nav = await sdk.nav(await sdk.platform());
console.log(JSON.stringify({ program: sdk.programId.toBase58(), platform: sdk.pda.platform().toBase58(), vault: sdk.pda.vault().toBase58(), jackpot: sdk.pda.jackpot().toBase58(), lpMint: sdk.pda.lpMint().toBase58(), house: house.toBase58(), bankroll: Number(vb) / 1e6, nav: Number(nav) / 1e6 }, null, 2));
