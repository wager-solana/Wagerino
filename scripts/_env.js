import { readFileSync } from "node:fs";
import { Connection, Keypair } from "@solana/web3.js";
import { Wagerino } from "@wagerino/sdk";
export function load() {
  const url = process.env.RPC_URL; const walletPath = process.env.WALLET; const idlPath = process.env.IDL || "idl/wagerino.json";
  if (!url || !walletPath) { console.error("set RPC_URL and WALLET (see DEVNET.md)"); process.exit(1); }
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
  const wallet = { publicKey: kp.publicKey, signTransaction: async (t) => (t.partialSign(kp), t), signAllTransactions: async (ts) => ts.map((t) => (t.partialSign(kp), t)) };
  const idl = JSON.parse(readFileSync(idlPath, "utf8"));
  const conn = new Connection(url, "confirmed");
  return { conn, kp, wallet, idl, sdk: new Wagerino(conn, idl, wallet) };
}
