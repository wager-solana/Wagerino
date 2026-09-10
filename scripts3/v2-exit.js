// Consolidate v2: sell every game's shares held by this wallet at NAV, claim creator + platform accruals, withdraw the session vault.
// Uses the v2 IDL at idl/wagerino.json. Prints a summary; run it until it reports nothing left.
import { PublicKey } from "@solana/web3.js"; import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { Wagerino } from "@wagerino/sdk"; import { readFileSync } from "node:fs"; import { Connection, Keypair } from "@solana/web3.js";
const url = process.env.RPC_URL, walletPath = process.env.WALLET; const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
const wallet = { publicKey: kp.publicKey, signTransaction: async (t) => (t.partialSign(kp), t), signAllTransactions: async (ts) => ts.map((t) => (t.partialSign(kp), t)) };
const conn = new Connection(url, "confirmed"); const sdk = new Wagerino(conn, JSON.parse(readFileSync("idl/wagerino.json", "utf8")), wallet); const me = kp.publicKey;
const s = await sdk.platform(); let recovered = 0;
for (const { publicKey: game, account: g } of await sdk.games()) {
  try { const ata = getAssociatedTokenAddressSync(g.shareMint, me); let shares = 0n; try { shares = BigInt((await getAccount(conn, ata)).amount.toString()); } catch {}
    if (shares > 0n) { const vb = await sdk.vaultBalance(g); const quote = sdk.quoteSell(g, s, vb, shares); const sig = await sdk.send(await sdk.sellSharesTx(me, game, shares)); recovered += Number(quote) / 1e6; console.log(`sold ${Number(shares) / 1e6} shares of ${g.name} ≈ ${Number(quote) / 1e6} USDC ${sig.slice(0, 12)}`); }
    if (g.creator.equals(me) && Number(g.creatorAccrued) > 0) { const sig = await sdk.send(await sdk.claimCreatorTx(me, game)); recovered += Number(g.creatorAccrued) / 1e6; console.log(`claimed creator ${Number(g.creatorAccrued) / 1e6} USDC from ${g.name} ${sig.slice(0, 12)}`); }
  } catch (e) { console.log(`${g.name}: ${String(e.message).split("\n")[0]}`); }
}
if (s.authority.equals(me) && Number(s.platformAccrued) > 0) { try { const ix = await sdk.program.methods.claimPlatform().accounts({ authority: me, platform: sdk.pda.platform(), usdcMint: s.usdcMint, platformUsdc: sdk.usdcAta(me, s.usdcMint), tokenProgram: (await import("@solana/spl-token")).TOKEN_PROGRAM_ID, associatedTokenProgram: (await import("@solana/spl-token")).ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: (await import("@solana/web3.js")).SystemProgram.programId }).instruction(); const { Transaction } = await import("@solana/web3.js"); const sig = await sdk.send(new Transaction().add(ix)); recovered += Number(s.platformAccrued) / 1e6; console.log(`claimed platform ${Number(s.platformAccrued) / 1e6} USDC ${sig.slice(0, 12)}`); } catch (e) { console.log("platform claim:", String(e.message).split("\n")[0]); } }
const sess = await sdk.session(me).catch(() => null); if (sess) { const sb = await sdk.sessionBalance(me); if (sb > 0n) { const sig = await sdk.send(await sdk.withdrawSessionTx(me, 0n)); recovered += Number(sb) / 1e6; console.log(`withdrew session ${Number(sb) / 1e6} USDC ${sig.slice(0, 12)}`); } }
console.log(`recovered ≈ ${recovered.toFixed(2)} USDC to ${me.toBase58()} (wallet USDC)`);
