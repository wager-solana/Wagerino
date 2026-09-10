import React, { useEffect, useState } from "react";
import { minesTargetBps, minesWinProb, fmt } from "../../lib/games.js";
// Risk is chosen up front (tiles to clear), like a crash cashout. After the draw, the player clicks ANY tiles:
// positions are theatre; win/lose and — for a loss — which click busts, come from the draw.
export const initial = { mines: 3, tiles: 3, clicks: [] };
export const playerPaced = true;
export const pick = (games) => games.find((g) => g.account.name.startsWith("Mines"));
export const target = (state, g) => Math.min(Math.max(minesTargetBps(state.mines, state.tiles, g.rtpBps), g.minTargetBps), g.maxTargetBps);
export const winMult = (state, g, t) => (t || 10000) / 10000;
export const historyItem = (ev) => ({ mult: ev.multBps / 10000 });
export const revealDelay = () => new Promise((res) => setTimeout(res, 200)); // player-paced
export const label = (state, winMult) => `Bet · clear ${state.tiles} tile${state.tiles > 1 ? "s" : ""} for ${winMult.toFixed(2)}×`;
export const finish = (state, setState) => setState({ ...state, clicks: [] });

/** Which click (1..N) hits a mine, conditional on losing — sampled from the true hazard curve. */
export function bustClick(mines, N, r2) {
  const w = []; let surv = 1;
  for (let j = 1; j <= N; j++) { const left = 25 - (j - 1); const pm = mines / left; w.push(surv * pm); surv *= 1 - pm; }
  const tot = w.reduce((a, b) => a + b, 0); let x = (Number(r2 % 1_000_000n) / 1_000_000) * tot;
  for (let j = 0; j < N; j++) { x -= w[j]; if (x <= 0) return j + 1; }
  return N;
}
export function Controls({ state, setState, game, disabled }) {
  const maxTiles = 25 - state.mines;
  return <>
    <div className="field"><label>Mines</label><select className="select" value={state.mines} disabled={disabled} onChange={(e) => { const m = Number(e.target.value); setState({ ...state, mines: m, tiles: Math.min(state.tiles, 25 - m), clicks: [] }); }}>{[...Array(24)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></div>
    <div className="field"><label>Tiles to clear</label><div className="stepper"><input value={state.tiles} readOnly /><button disabled={disabled} onClick={() => setState({ ...state, tiles: Math.max(1, state.tiles - 1), clicks: [] })}>−</button><button disabled={disabled} onClick={() => setState({ ...state, tiles: Math.min(maxTiles, state.tiles + 1), clicks: [] })}>+</button></div></div>
  </>;
}
export function Readout({ state, game, amount, winMult }) { return <div className="stats" style={{ marginTop: 16 }}><div><div className="eyebrow">Profit on win ({winMult.toFixed(2)}×)</div><div className="readout"><span>{fmt(amount * BigInt(Math.round(winMult * 10000)) / 10000n - amount)}</span><span>USDC</span></div></div><div><div className="eyebrow">Chance</div><div className="readout"><span>{(minesWinProb(state.mines, state.tiles) * 100).toFixed(2)}</span><span>%</span></div></div></div>; }
export function Canvas({ result, phase, state, onPick, disabled, onDone }) {
  const [board, setBoard] = useState({ clicks: [], bustAt: null, done: false, mines: new Set() });
  useEffect(() => { if (!result) { setBoard({ clicks: [], bustAt: null, done: false, mines: new Set() }); return; }
    const won = result.multX > 0; setBoard({ clicks: [], bustAt: won ? null : bustClick(result.state.mines, result.state.tiles, result.ev.r2), done: false, mines: new Set() }); }, [result]);
  const active = !!result && !board.done;
  const N = result?.state.tiles ?? state.tiles;
  const click = (i) => {
    if (!active || board.clicks.includes(i)) return;
    const clicks = [...board.clicks, i]; const k = clicks.length;
    const bust = board.bustAt !== null && k === board.bustAt;
    const finished = bust || k === N;
    let mines = new Set();
    if (finished) { // reveal the rest of the board: remaining mines land on unclicked tiles
      const free = [...Array(25).keys()].filter((t) => !clicks.includes(t)); let x = Number(result.ev.r2 % 2147483647n) || 1; const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
      for (let i2 = free.length - 1; i2 > 0; i2--) { const j = Math.floor(rnd() * (i2 + 1)); [free[i2], free[j]] = [free[j], free[i2]]; }
      mines = new Set(free.slice(0, result.state.mines - (bust ? 1 : 0))); if (bust) mines.add(i);
    }
    setBoard({ clicks, bustAt: board.bustAt, done: finished, mines });
    if (finished) setTimeout(() => onDone?.(), 900);
  };
  const revealAll = () => { if (!active) return; const free = [...Array(25).keys()].filter((t) => !board.clicks.includes(t)); const need = N - board.clicks.length; const seq = free.slice(0, need); let i = 0;
    const t = setInterval(() => { if (i < seq.length && !board.done) { click(seq[i++]); } else clearInterval(t); }, 300); };
  const isBoom = (i) => board.done && board.bustAt !== null && board.clicks[board.bustAt - 1] === i;
  return <div>
    <div className="minegrid" style={{ opacity: !result && !phase ? 0.6 : 1 }}>{[...Array(25)].map((_, i) => { const clicked = board.clicks.includes(i); const boom = isBoom(i); const mine = board.mines.has(i) && !clicked; const shown = clicked || (board.done);
      const cls = `tile-m ${clicked ? (boom ? "boom" : "safe") : ""} ${active && !clicked ? "flippable" : ""} ${board.done && mine ? "boom" : ""}`;
      return <div key={i} className={cls} onClick={() => click(i)} style={{ opacity: board.done && !clicked && !mine ? 0.45 : 1 }}>{clicked ? (boom ? "💣" : "💎") : board.done && mine ? "💣" : ""}</div>; })}</div>
    <div style={{ textAlign: "center", marginTop: 14, minHeight: 30 }}>
      {!result && !phase && <span className="muted">Choose mines and tiles to clear, then <b>Bet</b>. You'll click your tiles after the draw.</span>}
      {active && <span className="muted">{board.clicks.length} / {N} cleared — click any tile · <a className="muted" style={{ textDecoration: "underline", cursor: "pointer" }} onClick={revealAll}>auto-click the rest</a></span>}
      {board.done && result && <span style={{ fontWeight: 900, fontSize: 22, color: result.multX > 0 ? "var(--green)" : "var(--red)" }}>{result.multX > 0 ? `${result.multX.toFixed(2)}× · ${fmt(result.payout)} USDC` : "Boom."}</span>}
    </div>
  </div>;
}
export function Under({ state, game }) { const rows = [1, 2, 3, 5, 8, 12].filter((n) => n <= 25 - state.mines); return <div className="hist-dots" style={{ justifyContent: "space-between" }}>{rows.map((n) => <span key={n} className="chip" style={{ background: state.tiles === n ? "var(--input2)" : undefined }}>{n} tile{n > 1 ? "s" : ""} · {(minesTargetBps(state.mines, n, game.rtpBps) / 10000).toFixed(2)}×</span>)}</div>; }
