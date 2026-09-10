import React, { useEffect, useMemo, useState } from "react";
import { WHEEL, WHEEL_COLORS, mapToChain, fmt } from "../../lib/games.js";
export const initial = { risk: "medium", segments: 30 };
export const pick = (games, state) => games.find((g) => g.account.name.toLowerCase().startsWith(`wheel ${state.risk} ${state.segments}`)) ?? games.find((g) => g.account.name.toLowerCase().startsWith(`wheel ${state.risk}`)) ?? games.find((g) => g.account.name.startsWith("Wheel"));
export const target = () => 0;
export const winMult = (state, g) => (g ? g.multBps[0] / 10000 : 3);
export const historyItem = (ev) => ({ mult: ev.multBps / 10000 });
export const revealDelay = () => new Promise((r) => setTimeout(r, 4200));
export function Controls({ state, setState, disabled }) {
  return <><div className="field"><label>Risk</label><select className="select" value={state.risk} disabled={disabled} onChange={(e) => setState({ ...state, risk: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
    <div className="field"><label>Number of segments</label><select className="select" value={state.segments} disabled={disabled} onChange={(e) => setState({ ...state, segments: Number(e.target.value) })}>{[10, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select></div></>;
}
export function Readout({ game }) { return <div className="field"><label>Top multiplier</label><div className="readout"><span>{game ? (game.multBps[0] / 10000).toFixed(2) : "–"}×</span><span>{game ? (game.rtpBps / 100).toFixed(1) + "% RTP" : ""}</span></div></div>; }
/** Build the visual segment list from the preset (multiplier, count) pairs, spread evenly. */
function layout(risk, segments) {
  const preset = WHEEL[risk][segments] ?? WHEEL[risk][30]; const segs = []; const total = preset.reduce((a, [, c]) => a + c, 0);
  const queues = preset.map(([m, c]) => ({ m, left: c, every: total / c, acc: 0 }));
  for (let i = 0; i < total; i++) { let best = null; for (const q of queues) { q.acc += 1 / q.every; if (q.left > 0 && (!best || q.acc > best.acc)) best = q; } best.acc -= 1; best.left--; segs.push(best.m); }
  // break up identical neighbours (including the wrap-around) where a swap fixes it
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < total; i++) { const j = (i + 1) % total; if (segs[i] !== segs[j]) continue;
    for (let k = 0; k < total; k++) { const kp = (k + 1) % total, km = (k - 1 + total) % total; if (segs[k] !== segs[j] && segs[km] !== segs[j] && segs[kp] !== segs[j] && segs[k] !== segs[(j + 1) % total] && segs[k] !== segs[i]) { [segs[j], segs[k]] = [segs[k], segs[j]]; break; } } }
  return segs;
}
export function Canvas({ result, phase, state, game }) {
  const nominal = useMemo(() => layout(state.risk, state.segments), [state.risk, state.segments]);
  const segs = useMemo(() => mapToChain(nominal, game), [nominal, game]);
  const colorOf = (m) => { const i = nominal[segs.indexOf(m)]; return WHEEL_COLORS[i] ?? "#3b5566"; };
  const [rot, setRot] = useState(0); const [hit, setHit] = useState(null);
  useEffect(() => { setHit(null); }, [state.risk, state.segments]);
  useEffect(() => { if (!result) return; const m = result.multX; const candidates = segs.map((s, i) => ({ s, i })).filter((x) => Math.abs(x.s - m) < 1e-6);
    const idx = candidates.length ? candidates[Number(result.ev.r2 % BigInt(candidates.length))].i : 0;
    const per = 360 / segs.length; const targetAngle = -(idx * per + per / 2); setRot((r) => r - (r % 360) + 360 * 6 + targetAngle); setTimeout(() => setHit(idx), 4000); }, [result]);
  useEffect(() => { if (phase && phase.step !== "reveal") setHit(null); }, [phase?.step]);
  const R = 210, r0 = 150, n = segs.length;
  const arc = (i) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2, b = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2; const p = (t, rr) => `${250 + Math.cos(t) * rr},${250 + Math.sin(t) * rr}`; return `M${p(a, R)} A${R} ${R} 0 0 1 ${p(b, R)} L${p(b, r0)} A${r0} ${r0} 0 0 0 ${p(a, r0)}Z`; };
  return <div style={{ position: "relative" }}>
    <svg width="500" height="500" viewBox="0 0 500 500" style={{ maxWidth: "100%" }}>
      <circle cx="250" cy="250" r="230" fill="#1f3b4c" />
      <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: "250px 250px", transition: "transform 4s cubic-bezier(.15,.85,.25,1)" }}>
        {segs.map((m, i) => <path key={i} d={arc(i)} fill={WHEEL_COLORS[nominal[i]] ?? "#3b5566"} opacity={hit === null || hit === i ? 1 : 0.6} />)}
        {segs.map((m, i) => { const a = ((i + 0.5) / n) * 360 - 90; const rr = (R + r0) / 2; const x = 250 + Math.cos((a * Math.PI) / 180) * rr, y = 250 + Math.sin((a * Math.PI) / 180) * rr; const fs = n <= 10 ? 15 : n <= 30 ? 11 : 8;
          return <text key={"t" + i} x={x} y={y} fontSize={fs} fontWeight="900" fill={nominal[i] === 1.2 || nominal[i] === 1.7 || nominal[i] === 2 ? "#111" : "#fff"} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${a + 90} ${x} ${y})`}>{m >= 10 ? m.toFixed(0) : m.toFixed(1)}</text>; })}
      </g>
      <circle cx="250" cy="250" r="115" fill="none" stroke="#2b2f66" strokeWidth="3" />
      <path d="M250 18l12 26h-24z" fill="#ff4d6d" />
      {hit !== null && <text x="250" y="262" textAnchor="middle" fontSize="44" fontWeight="900" fill={WHEEL_COLORS[nominal[hit]] ?? "#fff"}>{segs[hit].toFixed(2)}×</text>}
    </svg>
  </div>;
}
export function Under({ state, result, game }) { const preset = WHEEL[state.risk][state.segments] ?? WHEEL[state.risk][30]; const nominal = preset.map(([m]) => m); const chainM = mapToChain(nominal, game);
  return <div className="wheel-legend">{nominal.map((m, i) => <div key={m} style={{ "--c": WHEEL_COLORS[m] ?? "#3b5566" }} className={result && Math.abs(result.multX - chainM[i]) < 1e-6 ? "hit" : ""}>{chainM[i].toFixed(2)}×</div>)}</div>; }
