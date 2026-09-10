import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import * as chain from "../lib/chain.js";
import { fmt, short, CATALOG } from "../lib/games.js";
import { GameArt } from "./Art.jsx";

const skinOf = (g) => chain.decodeUri(g.account.uri)?.template ?? null;
const slugOfTemplate = (t) => !t ? null : t.startsWith("plinko") ? "plinko" : t.startsWith("wheel") ? "wheel" : t === "coin_flip" ? "coinflip" : t;
export const slugForGame = (g) => slugOfTemplate(skinOf(g)) ?? CATALOG.find((c) => g.account.name.startsWith(c.prefix))?.slug ?? null;

export default function Discover() {
  const { games, feed } = useApp(); const [stats, setStats] = useState(null); const [tab, setTab] = useState("trending");
  useEffect(() => { chain.fetchStats().then(setStats); const t = setInterval(() => chain.fetchStats().then((s) => s && setStats(s)), 60000); return () => clearInterval(t); }, []);
  const rows = useMemo(() => {
    const by = new Map();
    for (const g of games) by.set(g.publicKey.toBase58(), { g, bets: 0, volume: 0, vol24: 0, bets24: 0 });
    if (stats) for (const s of stats.games) { const r = by.get(s.game); if (r) { r.bets = s.bets; r.volume = s.volume; r.vol24 = s.volume24h; r.bets24 = s.bets24h; } }
    else { const cutoff = Date.now() - 86400e3; for (const f of feed) { const r = by.get(f.game); if (!r) continue; r.bets++; r.volume += Number(f.amount) / 1e6; if (f.time > cutoff) { r.vol24 += Number(f.amount) / 1e6; r.bets24++; } } }
    return [...by.values()];
  }, [games, feed, stats]);
  const sorted = { trending: [...rows].sort((a, b) => b.vol24 - a.vol24 || b.bets - a.bets), new: [...rows].sort((a, b) => Number(b.g.account.gameSeed) - Number(a.g.account.gameSeed)), deepest: [...rows].sort((a, b) => Number(b.g.account.sharesIssued) - Number(a.g.account.sharesIssued)) }[tab];
  const wins = (stats?.bigWins ?? feed.filter((f) => f.payout > f.amount).map((f) => ({ ...f, amount: Number(f.amount) / 1e6, payout: Number(f.payout) / 1e6, mult: f.multBps / 10000, sig: f.signature })).sort((a, b) => b.payout - a.payout)).slice(0, 6);
  const creators = useMemo(() => { const m = new Map(); for (const r of rows) { const c = r.g.account.creator.toBase58(); const e = m.get(c) ?? { c, games: 0, volume: 0 }; e.games++; e.volume += r.volume; m.set(c, e); } return [...m.values()].sort((a, b) => b.volume - a.volume).slice(0, 6); }, [rows]);
  return <>
    <div className="section-h" style={{ marginTop: 6 }}><span>🎰 GAMES</span><div className="seg" style={{ marginLeft: "auto", width: 320 }}><button className={tab === "trending" ? "on" : ""} onClick={() => setTab("trending")}>Trending</button><button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>New</button><button className={tab === "deepest" ? "on" : ""} onClick={() => setTab("deepest")}>Deepest</button></div><a className="btn-orange" href="#/create" style={{ padding: "10px 16px" }}>+ Create</a></div>
    <div className="grid">{sorted.map(({ g, bets, vol24, bets24 }) => { const slug = slugForGame(g); const meta = CATALOG.find((c) => c.slug === slug); const emoji = chain.decodeUri(g.account.uri)?.emoji; return (
      <a key={g.publicKey.toBase58()} href={`#/g/${g.publicKey.toBase58()}`} className="tile" style={{ background: `radial-gradient(circle at 50% 110%, ${meta?.color ?? "#8b90c9"}55, var(--panel) 65%)` }}>
        <h3 style={{ fontSize: 18 }}>{g.account.name}</h3><div className="art">{slug ? <GameArt slug={slug} size={96} /> : <span style={{ fontSize: 64 }}>{emoji ?? "🎲"}</span>}</div>
        <div className="foot" style={{ letterSpacing: 0, textTransform: "none", opacity: 1 }}><span className="muted">{(g.account.rtpBps / 100).toFixed(1)}% RTP · </span>{vol24 > 0 ? `${vol24.toFixed(0)} USDC 24h` : bets ? `${bets} bets` : "new"} · <span className="muted">by {short(g.account.creator.toBase58())}</span></div>
      </a>); })}</div>
    <div className="two-col">
      <div><div className="section-h">🏆 BIGGEST WINS</div>{wins.map((w, i) => { const g = games.find((x) => x.publicKey.toBase58() === w.game); return <div key={i} className="winrow"><span className="pill green" style={{ padding: "2px 8px" }}>{w.mult.toFixed(2)}×</span><span className="mono muted">{short(w.player)}</span><span>{g?.account.name ?? "game"}</span><b>+{(w.payout - w.amount).toFixed(2)} USDC</b></div>; })}{!wins.length && <div className="dim">No wins recorded yet.</div>}</div>
      <div><div className="section-h">👑 TOP CREATORS</div>{creators.map((c, i) => <div key={c.c} className="winrow"><span className="muted">#{i + 1}</span><span className="mono">{short(c.c)}</span><span className="muted">{c.games} game{c.games > 1 ? "s" : ""}</span><b>{c.volume.toFixed(0)} USDC wagered</b></div>)}</div>
    </div>
  </>;
}
