import React, { useEffect, useRef, useState } from "react";
import { PLINKO, plinkoSlotFor, mapToChain, fmt } from "../../lib/games.js";
export const initial = { risk: "low" };
export const pick = (games, state) => games.find((g) => g.account.name.toLowerCase().startsWith(`plinko ${state.risk}`)) ?? games.find((g) => g.account.name.startsWith("Plinko"));
export const target = () => 0;
export const winMult = (state, g) => (g ? g.multBps[0] / 10000 : 16);
export const historyItem = (ev) => ({ mult: ev.multBps / 10000 });
export const revealDelay = () => new Promise((r) => setTimeout(r, 2600));
export function Controls({ state, setState, disabled }) {
  return <><div className="field"><label>Risk</label><select className="select" value={state.risk} disabled={disabled} onChange={(e) => setState({ ...state, risk: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
    <div className="field"><label>Rows</label><select className="select" value="16" disabled><option>16</option></select></div></>;
}
export function Readout({ game }) { return <div className="field"><label>Top multiplier</label><div className="readout"><span>{game ? (game.multBps[0] / 10000).toFixed(0) : "–"}×</span><span>{game ? (game.rtpBps / 100).toFixed(1) + "% RTP" : ""}</span></div></div>; }
const slotColor = (m) => (m >= 9 ? "#ff2d55" : m >= 2 ? "#ff5c3a" : m >= 1.2 ? "#ff8c1a" : m >= 1 ? "#ffb31a" : "#ffd21a");
export function Canvas({ result, state, game }) {
  const ref = useRef(null); const [hit, setHit] = useState(null); const anim = useRef(null);
  const slots = mapToChain(PLINKO[state.risk], game);
  useEffect(() => { setHit(null); drawBoard(ref.current, null); }, [state.risk]);
  useEffect(() => {
    if (!result) return; const slot = plinkoSlotFor(result.multX, slots, result.ev.r2);
    // path: 16 left/right decisions ending at `slot` (slot = number of rights). Shuffle order deterministically from r3.
    let x = Number((result.ev.r3 ?? (result.ev.r2 * 7919n)) % 2147483647n) || 1; const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
    const path = [...Array(slot).fill(1), ...Array(16 - slot).fill(0)]; for (let i = 15; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [path[i], path[j]] = [path[j], path[i]]; }
    const t0 = performance.now(); setHit(null); cancelAnimationFrame(anim.current);
    const step = (t) => { const p = Math.min(1, (t - t0) / 2400); drawBoard(ref.current, { path, p }); if (p < 1) anim.current = requestAnimationFrame(step); else setHit(slot); };
    anim.current = requestAnimationFrame(step); return () => cancelAnimationFrame(anim.current);
  }, [result]);
  return <div style={{ width: "100%" }}><canvas ref={ref} width={900} height={560} style={{ width: "100%", display: "block" }} />
    <div className="plinkoslots">{slots.map((m, i) => <span key={i} className={hit === i ? "hit" : ""} style={{ background: slotColor(m) }}>{m >= 10 ? m.toFixed(0) : m.toFixed(1)}x</span>)}</div></div>;
}
function drawBoard(c, ball) {
  if (!c) return; const ctx = c.getContext("2d"); const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
  const rows = 16, gap = 30, top = 40; const peg = (r, i) => ({ x: W / 2 + (i - r / 2) * gap, y: top + r * gap });
  ctx.fillStyle = "#fff"; for (let r = 0; r < rows; r++) for (let i = 0; i <= r + 2; i++) { const { x, y } = peg(r, i); ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
  if (!ball) return;
  const { path, p } = ball; const total = rows; const f = p * total; const r = Math.min(rows - 1, Math.floor(f)); const frac = f - r;
  let col = 1; for (let k = 0; k < r; k++) col += path[k]; // position among pegs of row r
  const a = peg(r, col), b = peg(r + 1, col + path[r]);
  const bx = a.x + (b.x - a.x) * frac, by = a.y + (b.y - a.y) * frac - Math.sin(frac * Math.PI) * 14;
  ctx.fillStyle = "#f2a93b"; ctx.shadowColor = "#f2a93b"; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(bx, by, 9, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
}
export function Under({ history }) { return <div className="hist-dots"><span className="eyebrow" style={{ width: "100%" }}>Recent drops</span>{history.slice(0, 20).map((h, i) => <span key={i} className={`chip ${h.mult > 1 ? "win" : ""}`}>{h.mult}×</span>)}</div>; }
