import React, { useState } from "react";
import { Transaction } from "@solana/web3.js";
import { useApp } from "../App.jsx";
import * as chain from "../lib/chain.js";
import { signAndSend } from "../lib/wallet.js";
import { newSessionKey, loadSessionKey, clearSessionKey, fundIx, budget, SESSION_SOL } from "../lib/session.js";
import { fmt } from "../lib/games.js";

export default function SessionPanel({ onClose, onKey }) {
  const { wallet, platform, usdc, sess, refresh, setErr } = useApp();
  const [dep, setDep] = useState("20"); const [cap, setCap] = useState("2"); const [hours, setHours] = useState("24"); const [busy, setBusy] = useState(false); const [wd, setWd] = useState("");
  const active = sess?.active; const acc = sess?.account;
  async function open() {
    setBusy(true); setErr(null);
    try {
      const deposit = BigInt(Math.round((parseFloat(dep) || 0) * 1e6)); const perBet = BigInt(Math.round((parseFloat(cap) || 0) * 1e6));
      if (deposit > usdc) throw new Error("Not enough USDC in your wallet for that deposit.");
      const kp = loadSessionKey() ?? newSessionKey();
      const expires = Math.floor(Date.now() / 1000) + Math.min(7 * 24, Math.max(1, parseFloat(hours) || 24)) * 3600;
      const total = deposit * 20n; // allowance: turn the deposit over ~20 times before re-authorizing
      const tx = new Transaction().add(...budget());
      const solNow = await chain.connection().getBalance(kp.publicKey); if (solNow < SESSION_SOL * 0.5e9) tx.add(fundIx(wallet.publicKey, kp.publicKey));
      tx.add(...(await chain.openSessionIxs(wallet.publicKey, kp.publicKey, expires, perBet, total, deposit, platform)));
      tx.feePayer = wallet.publicKey;
      await signAndSend(wallet.provider, chain.connection(), tx); onKey(kp); await refresh(); onClose();
    } catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); }
  }
  async function withdraw(all) { setBusy(true); try { const amt = all ? 0n : BigInt(Math.round((parseFloat(wd) || 0) * 1e6)); await signAndSend(wallet.provider, chain.connection(), await chain.withdrawSessionTx(wallet.publicKey, platform, amt)); await refresh(); } catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); } }
  async function revoke() { setBusy(true); try { await signAndSend(wallet.provider, chain.connection(), await chain.revokeSessionTx(wallet.publicKey)); clearSessionKey(); onKey(null); await refresh(); } catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); } }
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px,94vw)" }}>
    <h2>Session balance</h2>
    <p className="muted" style={{ marginTop: 0 }}>Deposit once, then every bet is instant — no wallet popups. Your deposit sits in your own on-chain session vault; only you can withdraw it, any time. A browser key is authorized to bet from it within the limits you set.</p>
    {active && acc && <div className="kv" style={{ marginBottom: 16 }}>
      <b>balance</b><span>{fmt(sess.balance)} USDC</span>
      <b>per-bet cap</b><span>{fmt(acc.perBetCap)} USDC</span>
      <b>allowance left</b><span>{fmt(acc.remainingCap)} USDC</span>
      <b>expires</b><span>{new Date(Number(acc.expiresAt) * 1000).toLocaleString()}</span>
      <b>bets this session</b><span>{String(acc.bets)} · {fmt(acc.wagered)} USDC wagered</span>
      <b>gas key</b><span>{(sess.sol / 1e9).toFixed(3)} SOL {sess.sol < 0.005e9 ? "(low — top up below)" : ""}</span>
    </div>}
    <div className="field"><label>{active ? "Add to balance" : "Deposit"} (USDC) · wallet has {fmt(usdc)}</label><div className="amount"><input value={dep} onChange={(e) => setDep(e.target.value)} /><span className="unit">USDC</span></div></div>
    {!active && <>
      <div className="field"><label>Max per bet</label><div className="amount"><input value={cap} onChange={(e) => setCap(e.target.value)} /><span className="unit">USDC</span></div></div>
      <div className="field"><label>Session length (hours, max 168)</label><div className="amount"><input value={hours} onChange={(e) => setHours(e.target.value)} /><span className="unit">h</span></div></div>
      <p className="dim" style={{ fontSize: 12 }}>One signature does everything: funds the browser key with {SESSION_SOL} SOL for fees, authorizes it, and deposits. The key can never move more than your allowance, and never out of Wagerino.</p>
    </>}
    <button className="btn-orange action" disabled={busy || !wallet} onClick={open}>{active ? "Add funds" : "Start session"}</button>
    {active && <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, marginTop: 14, alignItems: "center" }}>
      <div className="amount"><input value={wd} placeholder="amount" onChange={(e) => setWd(e.target.value)} /><span className="unit">USDC</span></div>
      <button className="btn-dark" disabled={busy} onClick={() => withdraw(false)}>Withdraw</button>
      <button className="btn-dark" disabled={busy} onClick={() => withdraw(true)}>Withdraw all</button>
      <button className="btn-dark" disabled={busy} onClick={revoke} style={{ color: "var(--red)" }}>End session</button>
    </div>}
    <div style={{ marginTop: 16, textAlign: "right" }}><button className="btn-dark" onClick={onClose}>Close</button></div>
  </div></div>;
}
