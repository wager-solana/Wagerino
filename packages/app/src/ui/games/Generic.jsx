import React from "react";
import { fmt } from "../../lib/games.js";
export const initial = { target: "2.00" };
export const playerPaced = true; // the skin calls done() when its theatre finishes
export const pick = () => null;
export const target = (state, g) => Math.min(Math.max(Math.round((parseFloat(state.target) || 2) * 10000), g.minTargetBps), g.maxTargetBps);
export const winMult = (state, g, t) => (g?.mode === 1 ? (t || 20000) / 10000 : g ? g.multBps[0] / 10000 : 1);
export const historyItem = (ev) => ({ mult: ev.multBps / 10000 });
export const revealDelay = () => new Promise((r) => setTimeout(r, 200));
export function Controls({ state, setState, game, disabled }) {
  if (game.mode !== 1) return null;
  return <div className="field"><label>Target multiplier</label><div className="stepper"><input value={state.target} onChange={(e) => setState({ ...state, target: e.target.value })} disabled={disabled} /><span className="unit" style={{ padding: 12 }}>×</span></div><div className="dim" style={{ fontSize: 12, marginTop: 6 }}>The skin may set this for you.</div></div>;
}
export function Readout({ amount, winMult, game }) { return <div className="field"><label>{game.mode === 1 ? "Profit on win" : "Top prize"}</label><div className="readout"><span>{fmt(amount * BigInt(Math.round(winMult * 10000)) / 10000n - (game.mode === 1 ? amount : 0n))}</span><span>USDC</span></div></div>; }
export function Canvas() { return null; }
export function Under({ game }) { return <div className="hist-dots"><span className="eyebrow" style={{ width: "100%" }}>Payouts</span>{game.mode === 0 ? [...Array(game.tableLen)].map((_, i) => <span key={i} className="chip">{(game.multBps[i] / 10000).toFixed(2)}× · {((game.cumProb[i] - (i ? game.cumProb[i - 1] : 0)) / 1e5).toFixed(2)}%</span>) : <span className="chip">target mode · {(game.rtpBps / 100).toFixed(1)}% RTP · {(game.minTargetBps / 10000).toFixed(2)}×–{(game.maxTargetBps / 10000).toFixed(0)}×</span>}</div>; }
