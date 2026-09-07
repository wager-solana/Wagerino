import React, { useEffect, useRef, useState } from "react";
import { fmt } from "../../lib/games.js";
export const initial = { cashout: "2.00" };
export const pick = (games) => games.find((g) => g.account.name.startsWith("Crash"));
export const target = (state, g) => { const t = Math.round((parseFloat(state.cashout) || 1.01) * 10000); return Math.min(Math.max(t, g.minTargetBps), g.maxTargetBps); };
export const winMult = (state, g, targetBps) => (targetBps || 20000) / 10000;
/** Crash point from the draw: constant-RTP inverse distribution. */
export const crashPoint = (ev, g) => { const r1 = Number(ev.r1); if (r1 === 0) return 1000; return Math.max(1, Math.floor((10_000_000 * g.rtpBps) / Math.max(r1, 1) / 100) / 100); };
export const historyItem = (ev, state) => ({ mult: ev.multBps / 10000, crash: ev.crash ?? null });
export const revealDelay = (r) => new Promise((res) => setTimeout(res, Math.min(9000, 1200 + Math.log(r.crash || 1.01) * 2500) + 600));
export function Controls({ state, setState, game, disabled }) {
  const step = (d) => setState({ ...state, cashout: Math.max(game.minTargetBps / 10000, Math.min(game.maxTargetBps / 10000, (parseFloat(state.cashout) || 2) + d)).toFixed(2) });
  return <div className="field"><label>Cashout At</label><div className="stepper"><input value={state.cashout} onChange={(e) => setState({ ...state, cashout: e.target.value })} disabled={disabled} /><button onClick={() => step(-0.1)} disabled={disabled}>⌄</button><button onClick={() => step(0.1)} disabled={disabled}>⌃</button></div>
    <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>win chance {(game.rtpBps / 100 / (parseFloat(state.cashout) || 2)).toFixed(2)}%</div></div>;
}
export function Readout({ amount, winMult }) { return <div className="field"><label>Profit on Win</label><div className="readout"><span>{fmt(amount * BigInt(Math.round(winMult * 10000)) / 10000n - amount)}</span><span>USDC</span></div></div>; }
export function Canvas({ result, phase, state, game }) {
  const ref = useRef(null); const [num, setNum] = useState(1); const [status, setStatus] = useState("idle"); // idle | flying | cashed | bust
  const anim = useRef(null);
  useEffect(() => { if (phase && phase.step !== "reveal") { setStatus("idle"); setNum(1); } }, [phase?.step]);
  useEffect(() => {
    if (!result) return;
    const cp = crashPoint(result.ev, game); result.crash = cp; const tgt = result.ev.targetBps / 10000;
    const won = result.multX > 0; const t0 = performance.now(); setStatus("flying");
    const growth = 0.00012; // per ms, exponential-ish
    cancelAnimationFrame(anim.current);
    const step = (t) => { const el = t - t0; const m = Math.exp(growth * el * 1.0); const cur = Math.min(m, cp);
      setNum(cur); draw(ref.current, el, cur, cp, tgt, won);
      if (won && cur >= tgt) { setStatus("cashed"); }
      if (cur >= cp) { setStatus(won ? "cashed" : "bust"); return; }
      anim.current = requestAnimationFrame(step); };
    anim.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim.current);
  }, [result]);
  return <div className="crashwrap"><canvas ref={ref} width={900} height={520} style={{ width: "100%", height: "100%" }} />
    <div className={`crashnum ${status}`}>{num.toFixed(2)}×{status === "cashed" && <div style={{ fontSize: 22, color: "var(--green)" }}>cashed out at {(result.ev.targetBps / 10000).toFixed(2)}×</div>}{status === "bust" && <div style={{ fontSize: 22 }}>crashed</div>}</div>
    {!result && !phase && <div className="crashnum" style={{ fontSize: 28, top: "60%" }}><div className="muted" style={{ fontSize: 16, fontWeight: 600 }}>set a cashout and bet — the crash point is drawn by VRF the moment you do</div></div>}
  </div>;
}
function draw(c, el, cur, cp, tgt, won) {
  if (!c) return; const ctx = c.getContext("2d"); const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
  const maxM = Math.max(2, cp * 1.15), maxT = Math.max(4000, el * 1.1);
  const X = (t) => 90 + (t / maxT) * (W - 130), Y = (m) => H - 50 - ((m - 1) / (maxM - 1)) * (H - 110);
  ctx.strokeStyle = "#2b2f66"; ctx.lineWidth = 1; for (let i = 0; i <= 5; i++) { const m = 1 + ((maxM - 1) * i) / 5; ctx.fillStyle = "#8b90c9"; ctx.font = "bold 16px Nunito,sans-serif"; ctx.fillText(m.toFixed(1) + "×", 20, Y(m) + 6); }
  for (let s = 2; s <= maxT / 1000; s += 2) { ctx.fillStyle = "#8b90c9"; ctx.fillText(s + "s", X(s * 1000) - 8, H - 18); }
  ctx.beginPath(); ctx.moveTo(X(0), Y(1)); const N = 80; for (let i = 1; i <= N; i++) { const t = (el * i) / N; const m = Math.min(Math.exp(0.00012 * t), cur); ctx.lineTo(X(t), Y(m)); }
  const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, won ? "#2fd37a" : "#f5a623"); grad.addColorStop(1, won ? "#2fd37a44" : "#f5a62344");
  ctx.lineTo(X(el), Y(1)); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X(0), Y(1)); for (let i = 1; i <= N; i++) { const t = (el * i) / N; const m = Math.min(Math.exp(0.00012 * t), cur); ctx.lineTo(X(t), Y(m)); } ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.stroke();
  if (won && cur >= tgt) { ctx.fillStyle = "#2fd37a"; ctx.beginPath(); ctx.arc(X(Math.log(tgt) / 0.00012), Y(tgt), 9, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(el), Y(cur), 9, 0, 7); ctx.fill();
}
export function Under({ history }) { return <div className="hist-dots"><span className="eyebrow" style={{ width: "100%" }}>Recent crash points</span>{history.slice(0, 20).map((h, i) => <span key={i} className={`chip ${h.mult > 0 ? "win" : ""}`}>{h.mult > 0 ? h.mult.toFixed(2) + "×" : "bust"}</span>)}</div>; }
