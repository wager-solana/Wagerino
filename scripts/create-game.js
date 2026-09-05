// create-game.js <template> <name> [marginBps] [seedShares]   e.g. create-game.js coin_flip "Frog Flip" 150 1000
import { PublicKey } from "@solana/web3.js";
import { load } from "./_env.js";
const { sdk, kp } = load();
const [template, name, marginBps = "0", seedShares = "0"] = process.argv.slice(2);
if (!template || !name) { console.error("usage: create-game.js <template> <name> [marginBps] [seedShares]"); process.exit(1); }
const seed = BigInt(Date.now());
const { tx, game } = await sdk.createGameTx(kp.publicKey, seed, { template, marginBps: Number(marginBps), name });
if (Number(seedShares) > 0) tx.add(await sdk.tradeSharesIx(kp.publicKey, game, BigInt(seedShares) * 1_000_000n, true));
const sig = await sdk.send(tx);
const g = await sdk.game(game);
console.log(`game ${game.toBase58()} "${g.name}" rtp=${g.rtpBps}bps mode=${g.mode} vault=${g.vault.toBase58()} sig=${sig}`);
