// Verifies the permissionless Pyth path: derives the SOL/USD sponsored push-feed account (Pyth SDK) and reads it on-chain.
import { Connection, Keypair } from "@solana/web3.js";
import { parsePriceUpdate, PYTH_RECEIVER } from "@wagerino/sdk";
import anchorPkg from "@coral-xyz/anchor"; const anchor = anchorPkg.default ?? anchorPkg;
const { PythSolanaReceiver } = await import("@pythnetwork/pyth-solana-receiver");
const url = process.env.RPC_URL; if (!url) { console.error("set RPC_URL"); process.exit(1); }
const connection = new Connection(url, "confirmed");
const pyth = new PythSolanaReceiver({ connection, wallet: new anchor.Wallet(Keypair.generate()) });
const feed = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"; // Pyth SOL/USD
const acc = pyth.getPriceFeedAccountAddress(0, feed);
console.log(`derived SOL/USD feed account ${acc.toBase58()} (docs: 7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE)`);
const info = await connection.getAccountInfo(acc);
if (!info) { console.error("account not found"); process.exit(1); }
const p = parsePriceUpdate(info.data);
const now = Math.floor(Date.now() / 1000);
console.log(`owner=${info.owner.toBase58()} (${info.owner.equals(PYTH_RECEIVER) ? "receiver OK" : "UNEXPECTED OWNER"}) feed_id match=${p.feedId.toString("hex") === feed.slice(2)} full=${p.full}`);
console.log(`price=${Number(p.price) * 10 ** p.exponent} publish_time=${p.publishTime} (${now - p.publishTime}s ago)`);
