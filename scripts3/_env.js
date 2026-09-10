import { readFileSync } from "node:fs"; import { Connection, Keypair } from "@solana/web3.js"; import { Wagerino3 } from "@wagerino/sdk3";
export function load(idlPath = process.env.IDL || "idl/wagerino3.json") {
  const url = process.env.RPC_URL, walletPath = process.env.WALLET; if (!url || !walletPath) { console.error("set RPC_URL and WALLET"); process.exit(1); }
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
  const wallet = { publicKey: kp.publicKey, signTransaction: async (t) => (t.partialSign(kp), t), signAllTransactions: async (ts) => ts.map((t) => (t.partialSign(kp), t)) };
  const conn = new Connection(url, "confirmed"); const idl = JSON.parse(readFileSync(idlPath, "utf8"));
  return { conn, kp, wallet, idl, sdk: new Wagerino3(conn, idl, wallet) };
}
