import React, { useEffect, useState, useCallback, createContext, useContext, useRef } from "react";
import * as chain from "./lib/chain.js";
import { detectWallets, connect } from "./lib/wallet.js";
import { CATALOG, fmt, short } from "./lib/games.js";
import { PublicKey } from "@solana/web3.js";
import { RailIcon } from "./ui/Art.jsx";
import SessionPanel from "./ui/Session.jsx";
import { loadSessionKey } from "./lib/session.js";
import Home from "./ui/Home.jsx";
import GamePage from "./ui/GamePage.jsx";

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  useEffect(() => { const f = () => setRoute(location.hash.slice(1) || "/"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [games, setGames] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [usdc, setUsdc] = useState(0n);
  const [feed, setFeed] = useState([]);
  const [wallets] = useState(detectWallets);
  const [sessionKp, setSessionKp] = useState(loadSessionKey);
  const [sess, setSess] = useState(null); // { account, balance, active }
  const [sessOpen, setSessOpen] = useState(false);
  const holdRef = useRef(false);

  const refresh = useCallback(async () => {
    const [s, gs] = await Promise.all([chain.platform(), chain.games()]);
    setPlatform(s); setGames(gs.filter((g) => !g.account.paused));
    if (wallet && !holdRef.current) {
      setUsdc(await chain.tokenBalance(chain.usdcAta(wallet.publicKey, s.usdcMint)));
      const acc = await chain.session(wallet.publicKey); const balance = acc ? await chain.sessionBalance(wallet.publicKey) : 0n;
      const kp = loadSessionKey(); const now = Math.floor(Date.now() / 1000);
      const active = !!(acc && kp && acc.sessionKey.equals(kp.publicKey) && Number(acc.expiresAt) > now);
      setSess({ account: acc, balance, active, sol: kp ? await chain.connection().getBalance(kp.publicKey) : 0 });
    }
  }, [wallet]);

  useEffect(() => { (async () => { await chain.init(); await refresh(); setFeed((await chain.backfill(30)).sort((a, b) => b.time - a.time)); setReady(true); })().catch((e) => setErr(String(e?.message ?? e))); }, []);
  useEffect(() => { if (ready) refresh().catch(() => {}); }, [wallet, ready, refresh]);
  useEffect(() => { if (!ready) return; const off = chain.onSettled((ev) => { setFeed((f) => [ev, ...f].slice(0, 100)); refresh().catch(() => {}); }); const t = setInterval(() => refresh().catch(() => {}), 25000); return () => { off(); clearInterval(t); }; }, [ready, refresh]);

  async function doConnect(w) { try { const pk = await connect(w.provider); setWallet({ provider: w.provider, publicKey: new PublicKey(pk.toString()), name: w.name }); } catch (e) { setErr(String(e?.message ?? e)); } }
  async function disconnect() { try { await wallet?.provider?.disconnect?.(); } catch {} setWallet(null); setUsdc(0n); }

  if (err && !ready) return <pre style={{ color: "#ff7b7b", padding: 24 }}>{err}</pre>;
  if (!ready) return <div style={{ display: "grid", placeItems: "center", height: "100vh" }} className="muted">Loading Wagerino…</div>;
  const ctx = { platform, games, wallet, usdc, feed, refresh, setErr: (m) => setErr(m), setHold: (v) => { holdRef.current = v; }, sessionKp, sess, openSession: () => setSessOpen(true) };
  const gameRoute = route.match(/^\/game\/([a-z]+)/);
  return (
    <Ctx.Provider value={ctx}>
      <header className="top">
        <a href="#/" className="logo">WAGER<b>INO</b></a>
        <span className="spacer" />
        {wallet && <button className={`sesschip ${sess?.active ? "on" : ""}`} onClick={() => setSessOpen(true)} title="Session balance: bet without wallet popups">
          <span className="dot" />{sess?.active ? <><b>{fmt(sess.balance)}</b> <small>SESSION</small></> : "Play without popups"}</button>}
        {wallet ? <WalletChip wallet={wallet} usdc={usdc} onDisconnect={disconnect} />
          : wallets.length ? wallets.map((w) => <button key={w.id} className="btn-orange" onClick={() => doConnect(w)}>Connect {w.name}</button>)
          : <span className="muted">Install Phantom, Solflare or Backpack</span>}
      </header>
      <div className="layout">
        <nav className="rail">
          <a href="#/" className={route === "/" ? "on" : ""} title="Home"><RailIcon slug="home" /></a>
          <span style={{ width: 34, height: 1, background: "var(--line)", margin: "6px 0" }} />
          {CATALOG.map((g) => <a key={g.slug} href={`#/game/${g.slug}`} className={gameRoute?.[1] === g.slug ? "on" : ""} title={g.title}>{["coinflip", "mines", "wheel", "diamonds"].includes(g.slug) ? <img src={`/icons/${g.slug}.png`} alt={g.title} className="rail-img" /> : <RailIcon slug={g.slug} />}</a>)}
        </nav>
        <main className="main">
          {gameRoute ? <GamePage key={gameRoute[1]} slug={gameRoute[1]} /> : <Home />}
          {err && <div className="err">{err}</div>}
        </main>
        {sessOpen && <SessionPanel onClose={() => setSessOpen(false)} onKey={setSessionKp} />}
      </div>
    </Ctx.Provider>
  );
}

function WalletChip({ wallet, usdc, onDisconnect }) {
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false); const addr = wallet.publicKey.toBase58();
  const copy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return <div style={{ position: "relative" }}>
    <div className="walletchip">
      <span className="bal">{fmt(usdc)} <small>USDC</small></span>
      <button className="addr" onClick={() => setOpen((o) => !o)}><span className="mono">{short(addr)}</span><span className="copy" onClick={copy} title="Copy address">{copied ? "✓" : "⧉"}</span><span className="caret">▾</span></button>
    </div>
    {open && <div className="menu" onMouseLeave={() => setOpen(false)}>
      <a href={`https://solscan.io/account/${addr}`} target="_blank" rel="noreferrer">View on Solscan ↗</a>
      <a onClick={onDisconnect} className="danger">Disconnect</a>
    </div>}
  </div>;
}
