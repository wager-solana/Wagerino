import React, { useEffect, useState } from "react";
import { fmt } from "../../lib/games.js";
import { CoinGlyph } from "../Art.jsx";
export const initial = { side: "heads" };
export const pick = (games) => games.find((g) => g.account.name.startsWith("Coin Flip"));
export const target = () => 0;
export const winMult = (state, g) => (g ? g.multBps[0] / 10000 : 1.95);
export const historyItem = (ev) => ({ mult: ev.multBps / 10000, side: ev.multBps > 0 ? (ev.state?.side ?? "heads") : (ev.state?.side === "heads" ? "tails" : "heads") });
export const revealDelay = () => new Promise((r) => setTimeout(r, 1800));
// Side is cosmetic: the on-chain row is "win" or "lose"; the coin lands on your side when you win.
export function Controls({ state, setState, disabled }) {
  return <div className="field"><button className="btn-dark" style={{ width: "100%", marginBottom: 10 }} disabled={disabled} onClick={() => setState({ ...state, side: Math.random() < 0.5 ? "heads" : "tails" })}>Pick Random Side</button>
    <div className="side2"><button className={state.side === "heads" ? "on" : ""} disabled={disabled} onClick={() => setState({ ...state, side: "heads" })}>Heads ★</button><button className={state.side === "tails" ? "on" : ""} disabled={disabled} onClick={() => setState({ ...state, side: "tails" })}>Tails ♛</button></div></div>;
}
export function Readout({ amount, winMult }) { return <div className="field"><label>Total profit ({winMult.toFixed(2)}×)</label><div className="readout"><span>{fmt(amount * BigInt(Math.round(winMult * 10000)) / 10000n - amount)}</span><span>USDC</span></div></div>; }
export function Canvas({ result, phase, state }) {
  const [rot, setRot] = useState(0); const [spinning, setSpinning] = useState(false);
  useEffect(() => { if (phase && phase.step !== "reveal" && phase.step !== "sign") setSpinning(true); }, [phase?.step]);
  useEffect(() => {
    if (!result) return;
    const won = result.multX > 0; const landed = won ? result.state.side : result.state.side === "heads" ? "tails" : "heads";
    setSpinning(false);
    setRot((r) => r - (r % 360) + 1800 + (landed === "tails" ? 180 : 0)); // one long decelerating landing spin
  }, [result]);
  useEffect(() => { if (!result && !phase) { setSpinning(false); setRot((r) => r - (r % 360) + (state.side === "tails" ? 180 : 0)); } }, [state.side]);
  return <div className={`coin ${spinning ? "spinning" : ""}`} style={spinning ? undefined : { transform: `rotateY(${rot}deg)` }}>
    <div className="f heads"><CoinGlyph size={300} /></div>
    <div className="f tails"><div style={{ filter: "hue-rotate(95deg) saturate(1.2)" }}><CoinGlyph size={300} /></div></div>
  </div>;
}
export function Under({ history }) { return <div className="hist-dots"><span className="eyebrow" style={{ width: "100%" }}>History</span>{history.slice(0, 20).map((h, i) => <i key={i} className={h.mult > 0 ? (h.side === "heads" ? "h" : "t") : ""}>{h.mult > 0 ? (h.side === "heads" ? "★" : "♛") : "◆"}</i>)}</div>; }
