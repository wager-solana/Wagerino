import React, { useState } from "react";
import { Transaction } from "@solana/web3.js";
import { useApp } from "../App.jsx";
import * as chain from "../lib/chain.js";
import { signAndSend } from "../lib/wallet.js";
import { newSessionKey, loadSessionKey, clearSessionKey, fundIx, budget, SESSION_SOL } from "../lib/session.js";
import { fmt } from "../lib/games.js";
const MAX_H = 168;
export default function SessionPanel({ onClose, onKey }) {
  const { wallet, platform, usdc, sess, refresh, setErr } = useApp();
  const [dep, setDep] = useState("20"); const [cap, setCap] = useState("2"); const [hours, setHours] = useState("24"); const [turn, setTurn] = useState("20"); const [busy, setBusy] = useState(false); const [wd, setWd] = useState("");
  const [tab, setTab] = useState("deposit");
  const active = sess?.active; const acc = sess?.account;
  const setH = (v) => setHours(String(Math.min(MAX_H, Math.max(1, Math.floor(parseFloat(v) || 1)))));
  async function start() {
    setBusy(true); setErr(null);
    try {
      const deposit = BigInt(Math.round((parseFloat(dep) || 0) * 1e6)); const perBet = BigInt(Math.round((parseFloat(cap) || 0) * 1e6));
      if (deposit <= 0n) throw new Error("Enter a deposit amount.");
      if (deposit > usdc) throw new Error(`Your wallet has ${fmt(usdc)} USDC.`);
      const kp = loadSessionKey() ?? newSessionKey();
      const expires = Math.floor(Date.now() / 1000) + Math.min(MAX_H, Math.max(1, parseFloat(hours) || 24)) * 3600;
      const total = deposit * BigInt(Math.max(1, Math.min(100, parseInt(turn) || 20)));
      const tx = new Transaction().add(...budget());
      const solNow = await chain.connection().getBalance(kp.publicKey); if (solNow < SESSION_SOL * 0.5e9) tx.add(fundIx(wallet.publicKey, kp.publicKey));
      tx.add(...(await chain.openSessionIxs(wallet.publicKey, kp.publicKey, expires, active ? BigInt(acc.perBetCap.toString()) : perBet, active ? BigInt(acc.remainingCap.toString()) + total : total, deposit, platform)));
      tx.feePayer = wallet.publicKey;
      await signAndSend(wallet.provider, chain.connection(), tx); onKey(kp); await refresh(); onClose();
    } catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); }
  }
  async function withdraw(all) { setBusy(true); setErr(null); try { const amt = all ? 0n : BigInt(Math.round((parseFloat(wd) || 0) * 1e6)); if (!all && amt <= 0n) throw new Error("Enter an amount."); await signAndSend(wallet.provider, chain.connection(), await chain.withdrawSessionTx(wallet.publicKey, platform, amt)); setWd(""); await refresh(); } catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); } }
  async function end() { setBusy(true); setErr(null); try { if (sess.balance > 0n) await signAndSend(wallet.provider, chain.connection(), await chain.withdrawSessionTx(wallet.publicKey, platform, 0n)); await signAndSend(wallet.provider, chain.connection(), await chain.revokeSessionTx(wallet.publicKey)); clearSessionKey(); onKey(null); await refresh(); onClose(); } catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); } }
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px,94vw)", padding: 0, overflow: "hidden" }}>
    <div className="sess-head">
      <div><div className="eyebrow" style={{ margin: 0 }}>PLAYING BALANCE</div><div className="sess-big">{active ? fmt(sess.balance) : "0.00"} <small>USDC</small></div></div>
      <div className="dim" style={{ textAlign: "right", fontSize: 12 }}>wallet {fmt(usdc)} USDC{active && <><br />expires {new Date(Number(acc.expiresAt) * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>}</div>
    </div>
    {active && <div className="seg" style={{ margin: "16px 22px 0" }}><button className={tab === "deposit" ? "on" : ""} onClick={() => setTab("deposit")}>Deposit</button><button className={tab === "withdraw" ? "on" : ""} onClick={() => setTab("withdraw")}>Withdraw</button></div>}
    <div style={{ padding: "6px 22px 22px" }}>
      {(!active || tab === "deposit") && <>
        {!active && <p className="muted" style={{ marginTop: 14 }}>Move USDC into your playing balance once, then every bet is instant — no wallet popups. It stays in a vault only your wallet can withdraw from.</p>}
        <div className="field"><label>{active ? "Add" : "Deposit"}</label><div className="amount"><input value={dep} onChange={(e) => setDep(e.target.value)} inputMode="decimal" /><span className="unit">USDC</span><button onClick={() => setDep(fmt(usdc).replace(/,/g, ""))}>Max</button></div></div>
        {!active && <div className="grid2">
          <div className="field"><label>Max per bet</label><div className="amount"><input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /><span className="unit">USDC</span></div></div>
          <div className="field"><label>Valid for</label><div className="amount"><input value={hours} onChange={(e) => setHours(e.target.value)} onBlur={(e) => setH(e.target.value)} inputMode="numeric" /><span className="unit">hours</span></div></div>
        </div>}
        {!active && <details className="dim" style={{ fontSize: 12, marginTop: 10 }}><summary style={{ cursor: "pointer" }}>Advanced: wagering allowance</summary>
          <div className="field" style={{ marginTop: 8 }}><label>Total the browser key may wager before you re-authorize (× deposit)</label><div className="amount"><input value={turn} onChange={(e) => setTurn(e.target.value)} inputMode="numeric" /><span className="unit">× deposit</span></div></div>
          <p>Winnings return to the balance, so a {turn}× allowance lets you play through the deposit about {turn} times. Sessions last at most {MAX_H} hours; you can end one any time.</p></details>}
        <button className="btn-orange action" disabled={busy || !wallet} onClick={start}>{busy ? "Confirm in wallet…" : active ? "Add to balance" : "Deposit & start playing"}</button>
        {!active && <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>One signature: funds a browser key with {SESSION_SOL} SOL for network fees, sets your limits, and deposits.</p>}
      </>}
      {active && tab === "withdraw" && <>
        <div className="field"><label>Withdraw to wallet</label><div className="amount"><input value={wd} placeholder="0.00" onChange={(e) => setWd(e.target.value)} inputMode="decimal" /><span className="unit">USDC</span><button onClick={() => setWd(fmt(sess.balance).replace(/,/g, ""))}>Max</button></div></div>
        <button className="btn-orange action" disabled={busy} onClick={() => withdraw(false)}>{busy ? "Confirm in wallet…" : "Withdraw"}</button>
        <div className="kv" style={{ marginTop: 18 }}>
          <b>max per bet</b><span>{fmt(acc.perBetCap)} USDC</span>
          <b>allowance left</b><span>{fmt(acc.remainingCap)} USDC <span className="dim">(total the browser key may still wager)</span></span>
          <b>this session</b><span>{String(acc.bets)} bets · {fmt(acc.wagered)} USDC wagered</span>
          <b>fee balance</b><span>{(sess.sol / 1e9).toFixed(3)} SOL {sess.sol < 0.005e9 ? "(low — a deposit tops it up)" : ""}</span>
        </div>
      </>}
    </div>
  </div></div>;
}
