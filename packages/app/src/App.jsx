import React, { useEffect, useState, useCallback, createContext, useContext, useRef } from "react";
import * as chain from "./lib/chain.js";
import { detectWallets, connect } from "./lib/wallet.js";
import { CATALOG, fmt, short } from "./lib/games.js";
import { PublicKey } from "@solana/web3.js";
import { RailIcon, GameArt } from "./ui/Art.jsx";
import SessionPanel from "./ui/Session.jsx";
import { loadSessionKey } from "./lib/session.js";
import Home from "./ui/Home.jsx";
import GamePage from "./ui/GamePage.jsx";
import Create from "./ui/Create.jsx";
import Discover from "./ui/Discover.jsx";

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
  const [railOpen, setRailOpen] = useState(() => localStorage.getItem("wagerino.rail") !== "0");
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

  useEffect(() => { (async () => { try { window.__skins = await (await fetch("/skins.json")).json(); } catch { window.__skins = {}; } await chain.init(); await refresh(); setFeed((await chain.backfill(30)).sort((a, b) => b.time - a.time)); setReady(true); })().catch((e) => setErr(String(e?.message ?? e))); }, []);
  useEffect(() => { if (ready) refresh().catch(() => {}); }, [wallet, ready, refresh]);
  useEffect(() => { if (wallet && sess && !sess.active && !sessionStorage.getItem("wagerino.sessPrompted")) { sessionStorage.setItem("wagerino.sessPrompted", "1"); setSessOpen(true); } }, [wallet, sess?.active]);
  useEffect(() => { if (!ready) return; const off = chain.onSettled((ev) => { setFeed((f) => [ev, ...f].slice(0, 100)); refresh().catch(() => {}); }); const t = setInterval(() => refresh().catch(() => {}), 25000); return () => { off(); clearInterval(t); }; }, [ready, refresh]);

  async function doConnect(w) { try { const pk = await connect(w.provider); setWallet({ provider: w.provider, publicKey: new PublicKey(pk.toString()), name: w.name }); } catch (e) { setErr(String(e?.message ?? e)); } }
  async function endSession() {
    try { const { signAndSend } = await import("./lib/wallet.js"); const { clearSessionKey } = await import("./lib/session.js");
      if (sess?.balance > 0n) await signAndSend(wallet.provider, chain.connection(), await chain.withdrawSessionTx(wallet.publicKey, platform, 0n));
      await signAndSend(wallet.provider, chain.connection(), await chain.revokeSessionTx(wallet.publicKey)); clearSessionKey(); setSessionKp(null); await refresh(); }
    catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); }
  }
  async function disconnect() { try { await wallet?.provider?.disconnect?.(); } catch {} setWallet(null); setUsdc(0n); }

  if (err && !ready) return <pre style={{ color: "#ff7b7b", padding: 24 }}>{err}</pre>;
  if (!ready) return <div style={{ display: "grid", placeItems: "center", height: "100vh" }} className="muted">Loading Wagerino…</div>;
  const ctx = { platform, games, wallet, usdc, feed, refresh, setErr: (m) => setErr(m), setHold: (v) => { holdRef.current = v; }, sessionKp, sess, openSession: () => setSessOpen(true) };
  const gameRoute = route.match(/^\/game\/([a-z]+)/);
  const addrRoute = route.match(/^\/g\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  return (
    <Ctx.Provider value={ctx}>
      <header className="top">
        <a href="#/" className="logo">WAGER<b>INO</b></a>
        <span className="spacer" />
        {wallet ? <WalletChip wallet={wallet} usdc={usdc} sess={sess} onDisconnect={disconnect} onSession={() => setSessOpen(true)} onEnd={endSession} />
          : wallets.length ? wallets.map((w) => <button key={w.id} className="btn-orange" onClick={() => doConnect(w)}>Connect {w.name}</button>)
          : <span className="muted">Install Phantom, Solflare or Backpack</span>}
      </header>
      <div className="layout">
        <nav className={`rail ${railOpen ? "open" : ""}`}>
          <a className="rail-toggle" onClick={() => { const v = !railOpen; setRailOpen(v); localStorage.setItem("wagerino.rail", v ? "1" : "0"); }} title="Menu">☰</a>
          <a href="#/" className={route === "/" ? "on" : ""}><RailIcon slug="home" /><span>Home</span></a>
          <a href="#/create" className={route === "/create" ? "on" : ""}><span className="ri">＋</span><span>Create a game</span></a>
          <div className="rail-h">Originals</div>
          {CATALOG.map((g) => <a key={g.slug} href={`#/game/${g.slug}`} className={gameRoute?.[1] === g.slug ? "on" : ""}><GameArt slug={g.slug} size={26} /><span>{g.title}</span></a>)}
          <div className="rail-h">Community</div>
          <a href="#/" className=""><span className="ri">🔥</span><span>Trending</span></a>
          <a href="#/create" className=""><span className="ri">👑</span><span>Be the house</span></a>
        </nav>
        <main className="main">
          {gameRoute ? <GamePage key={gameRoute[1]} slug={gameRoute[1]} /> : addrRoute ? <GamePage key={addrRoute[1]} address={addrRoute[1]} /> : route === "/create" ? <Create /> : <Home />}
          {err && <div className="err">{err}</div>}
        </main>
        {sessOpen && <SessionPanel onClose={() => setSessOpen(false)} onKey={setSessionKp} />}
      </div>
    </Ctx.Provider>
  );
}

function WalletChip({ wallet, usdc, sess, onDisconnect, onSession, onEnd }) {
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false); const addr = wallet.publicKey.toBase58();
  const copy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  const active = sess?.active;
  return <div style={{ position: "relative" }}>
    <div className="walletchip">
      {active ? <span className="bal"><i className="live" />{fmt(sess.balance)} <small>USDC</small></span> : <button className="btn-orange" style={{ padding: "8px 14px", fontSize: 13 }} onClick={onSession}>Deposit to play</button>}
      <button className="addr" onClick={() => setOpen((o) => !o)}><span className="mono">{short(addr)}</span><span className="copy" onClick={copy} title="Copy address">{copied ? "✓" : "⧉"}</span><span className="caret">▾</span></button>
    </div>
    {open && <div className="menu" style={{ minWidth: 260 }} onMouseLeave={() => setOpen(false)}>
      <a onClick={() => { setOpen(false); onSession(); }}>{active ? "Deposit / Withdraw" : "Deposit to play"}</a>
      <a href={`https://solscan.io/account/${addr}`} target="_blank" rel="noreferrer">View on Solscan ↗</a>
      {active && <a onClick={() => { setOpen(false); onEnd(); }} className="danger">End session · withdraw all</a>}
      <a onClick={onDisconnect} className="danger">Disconnect</a>
    </div>}
  </div>;
}
