// Browser session key: an ephemeral Solana keypair kept in localStorage, authorized on-chain with caps and an expiry.
// Risk model: an attacker with access to this browser can spend at most the session's remaining allowance until expiry.
import { Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
const KEY = "wagerino.sessionKey";
export function loadSessionKey() { try { const raw = localStorage.getItem(KEY); return raw ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))) : null; } catch { return null; } }
export function newSessionKey() { const kp = Keypair.generate(); localStorage.setItem(KEY, JSON.stringify(Array.from(kp.secretKey))); return kp; }
export function clearSessionKey() { localStorage.removeItem(KEY); }
export const SESSION_SOL = 0.03; // rent + oracle fees for ~150 bets
export function fundIx(from, to, sol = SESSION_SOL) { return SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: Math.round(sol * 1e9) }); }
export function budget() { return [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })]; }
/** Sign & send with the session keypair (no wallet popup). */
export async function sendWithSession(connection, kp, tx) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash; tx.feePayer = kp.publicKey; tx.sign(kp);
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  const r = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (r.value.err) throw new Error("Transaction failed: " + JSON.stringify(r.value.err));
  return sig;
}
