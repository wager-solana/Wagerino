import React, { useEffect, useState } from "react";
import { DIAMOND_ROWS, GEM_COLORS, diamondsFor, fmt } from "../../lib/games.js";
export const initial = {};
export const pick = (games) => games.find((g) => g.account.name.startsWith("Diamonds"));
export const target = () => 0;
export const winMult = (state, g) => (g ? g.multBps[0] / 10000 : 50);
export const historyItem = (ev) => ({ mult: ev.multBps / 10000 });
export const revealDelay = () => new Promise((r) => setTimeout(r, 2400));
export function Controls() { return null; }
export function Readout({ game, amount }) { return <div className="field"><label>Top prize (5 of a kind)</label><div className="readout"><span>{fmt(amount * BigInt(game?.multBps[0] ?? 500000) / 10000n)}</span><span>USDC</span></div></div>; }
const Gem = ({ c, size = 70 }) => <svg width={size} height={size} viewBox="0 0 100 100"><path d="M50 12l30 28-30 50-30-50z" fill={c} /><path d="M20 40h60L50 90z" fill="rgba(0,0,0,.25)" /><path d="M35 40l15-28 15 28z" fill="rgba(255,255,255,.45)" /></svg>;
export function Canvas({ result, phase, game }) {
  const [gems, setGems] = useState([null, null, null, null, null]); const [rowHit, setRowHit] = useState(null);
  useEffect(() => { if (phase && phase.step !== "reveal") { setGems([null, null, null, null, null]); setRowHit(null); } }, [phase?.step]);
  useEffect(() => { if (!result) return; const g = diamondsFor(result.multX, result.ev.r2); let i = 0; const t = setInterval(() => { setGems((cur) => { const n = [...cur]; n[i] = g[i]; return n; }); i++; if (i >= 5) { clearInterval(t); setRowHit(DIAMOND_ROWS.findIndex((r) => Math.abs(r.mult - result.multX) < 1e-6)); } }, 380); return () => clearInterval(t); }, [result]);
  const rows = game ? [...Array(game.tableLen)].map((_, i) => ({ mult: game.multBps[i] / 10000, prob: (game.cumProb[i] - (i ? game.cumProb[i - 1] : 0)) / 1e7 })) : [];
  return <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 40, width: "100%", alignItems: "center" }}>
    <div className="multlist">{DIAMOND_ROWS.map((r, i) => <div key={r.name} className={rowHit === i ? "on" : ""}><span>{r.pattern.map((p, k) => <span key={k} style={{ opacity: p ? 1 : 0.25, marginRight: 4 }}>◆</span>)}</span><span>{(rows[i]?.mult ?? r.mult).toFixed(2)}×</span></div>)}</div>
    <div className="gems">{gems.map((g, i) => <div key={i} className={`gem ${g !== null ? "reveal" : ""}`}>{g !== null ? <Gem c={GEM_COLORS[g]} /> : ""}</div>)}</div>
  </div>;
}
export function Under({ result, amount, winMult }) { return <div className="stats"><div><div className="eyebrow">Profit (last)</div><div className="readout"><span>{result ? fmt(result.payout - result.amount) : "0.00"}</span><span>USDC</span></div></div><div><div className="eyebrow">Chance of any win</div><div className="readout"><span>{result ? "" : ""}~35.0</span><span>%</span></div></div></div>; }
