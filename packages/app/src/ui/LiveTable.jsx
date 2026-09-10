import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { fmt, short } from "../lib/games.js";
import { GameArt } from "./Art.jsx";
import { slugForGame } from "./Discover.jsx";
// Rainbet/Stake-style bottom table — with proofs: every row opens verification.
export default function LiveTable({ onOpen }) {
  const { feed, games, wallet } = useApp(); const [tab, setTab] = useState("all"); const me = wallet?.publicKey.toBase58();
  const rows = (tab === "mine" ? feed.filter((f) => f.player === me) : tab === "high" ? feed.filter((f) => Number(f.amount) >= 1_000_000) : tab === "lucky" ? [...feed].sort((a, b) => b.multBps - a.multBps) : feed).slice(0, 12);
  return <div className="livetable">
    <div className="lt-head"><div className="seg" style={{ width: 440 }}>{[["all", "All Bets"], ["high", "High Rollers"], ["lucky", "Lucky"], ["mine", "My Bets"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div><span className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--green)" }} />Live · every row is a proof</span></div>
    <table><thead><tr><th>Game</th><th>Creator</th><th>Player</th><th>Time</th><th>Bet</th><th>Multiplier</th><th>Payout</th></tr></thead><tbody>
      {rows.map((f) => { const g = games.find((x) => x.publicKey.toBase58() === f.game); const slug = g ? slugForGame(g) : null; const win = f.payout > f.amount; return (
        <tr key={f.signature} className={`lt-row ${f.player === me ? "mine" : ""}`} onClick={() => onOpen(f)}>
          <td><span className="lt-game">{slug && <GameArt slug={slug} size={22} />}<a href={`#/g/${f.game}`} onClick={(e) => e.stopPropagation()}>{g?.account.name ?? short(f.game)}</a></span></td>
          <td className="mono muted">{g ? short(g.account.creator.toBase58()) : ""}</td><td className="mono">{short(f.player)}</td><td className="muted">{new Date(f.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
          <td>{fmt(f.amount)} USDC</td><td className={win ? "win" : "muted"}>{(f.multBps / 10000).toFixed(2)}×</td><td className={win ? "win" : "muted"}>{win ? "+" : ""}{fmt(f.payout - f.amount)} USDC</td>
        </tr>); })}
      {!rows.length && <tr><td colSpan={7} className="dim">Nothing here yet.</td></tr>}
    </tbody></table>
  </div>;
}
