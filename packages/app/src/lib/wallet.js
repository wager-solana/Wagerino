export function detectWallets() {
  const f = new Map(); const add = (id, name, p) => { if (p && !f.has(id)) f.set(id, { id, name, provider: p }); };
  add("phantom", "Phantom", window.phantom?.solana?.isPhantom ? window.phantom.solana : null);
  add("solflare", "Solflare", window.solflare?.isSolflare ? window.solflare : null);
  add("backpack", "Backpack", window.backpack?.isBackpack ? window.backpack : null);
  add("okx", "OKX", window.okxwallet?.solana ?? null);
  add("coinbase", "Coinbase", window.coinbaseSolana ?? null);
  if (!f.size && window.solana) add("injected", "Wallet", window.solana);
  return [...f.values()];
}
export async function connect(provider) {
  const res = await Promise.race([provider.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error("Wallet didn't respond.")), 15000))]);
  const pk = res?.publicKey || provider.publicKey; if (!pk) throw new Error("No account returned."); return pk;
}
export async function signAndSend(provider, connection, tx) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  let sig;
  if (provider.signAndSendTransaction) ({ signature: sig } = await provider.signAndSendTransaction(tx));
  else { const s = await provider.signTransaction(tx); sig = await connection.sendRawTransaction(s.serialize(), { maxRetries: 5 }); }
  const r = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (r.value.err) throw new Error("Transaction failed: " + JSON.stringify(r.value.err));
  return sig;
}
