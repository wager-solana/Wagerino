import React from "react";
import { useApp } from "../App.jsx";
import { CATALOG, fmt, short } from "../lib/games.js";
import { GameArt } from "./Art.jsx";
import Discover from "./Discover.jsx";
import LiveTable from "./LiveTable.jsx";
import { useState } from "react";
import { Fairness } from "./GamePage.jsx";

export default function Home() {
  const { feed, games, platform } = useApp(); const [fair, setFair] = useState(null);
  const wins = feed.filter((f) => f.payout > f.amount).slice(0, 8);
  const has = (g) => games.some((x) => x.account.name.startsWith(g.prefix));
  return (
    <>
      <div className="eyebrow" style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--green)" }} /> RECENT WINS</div>
      <div className="tick">
        {wins.length ? wins.map((w) => { const g = games.find((x) => x.publicKey.toBase58() === w.game); return (
          <div className="card" key={w.signature}><span className="pill green" style={{ padding: "2px 8px" }}>{(w.multBps / 10000).toFixed(2)}×</span><span>{short(w.player)}</span><span className="muted">{g?.account.name ?? "game"}</span><b>{fmt(w.payout)} USDC</b></div>); })
          : <div className="card muted">No wins yet — be the first</div>}
      </div>
      <div className="promos">
        <div className="promo" style={{ background: "linear-gradient(120deg,#6b2a1c,#c3512d 60%,#3a1a4a)" }}>
          <small>1 · Play</small><h2>Six originals.<br />One signature per bet.</h2>
          <a href="#/game/coinflip">Play Coin Flip →</a>
        </div>
        <div className="promo" style={{ background: "linear-gradient(140deg,#1e7a3c,#3fbf6b)" }}>
          <small>2 · Verify</small><h2>Every outcome is drawn by ORAO VRF and rechecked in your browser.</h2><a href="#/game/crash">See a proof →</a>
        </div>
        <div className="promo" style={{ background: "linear-gradient(140deg,#1f3a8a,#4f6fdc)" }}>
          <small>3 · Be the house</small><h2>Create your own game in 15 seconds. Keep 90% of the edge.</h2><a href="#/create">Create →</a>
        </div>
      </div>
      <div className="section-h">∞ ORIGINALS <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>— the templates every creator starts from</span></div>
      <div className="grid">
        {CATALOG.map((g) => (
          <a key={g.slug} href={`#/game/${g.slug}`} className="tile" style={{ background: `radial-gradient(circle at 50% 110%, ${g.color}55, var(--panel) 65%)`, opacity: has(g) ? 1 : 0.55 }}>
            <h3>{g.title.toUpperCase()}</h3>
            <div className="art"><GameArt slug={g.slug} size={128} /></div>
            <div className="foot">{has(g) ? "WAGERINO" : "COMING SOON"}</div>
          </a>
        ))}
      </div>
      <Discover />
      <LiveTable onOpen={(f) => setFair({ ev: f, signature: f.signature })} />
      {fair && <Fairness item={fair} games={games} fallback={null} onClose={() => setFair(null)} />}
      <p className="trust" style={{ marginTop: 30 }}>Program {platform ? "7Y5zTYELzMb6pQsco1fomUekYR9HnUsDPcyh7NHfKq8e" : ""} · one signature per action · no token approvals · payouts come from code-locked game vaults, never from an operator.</p>
    </>
  );
}
