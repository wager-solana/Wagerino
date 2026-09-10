import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import * as chain from "../lib/chain.js";
import { runBet, runAuto } from "../lib/engine.js";
import { bySlug, fmt, short } from "../lib/games.js";
import { signAndSend } from "../lib/wallet.js";
import * as CoinFlip from "./games/CoinFlip.jsx";
import * as Crash from "./games/Crash.jsx";
import * as Plinko from "./games/Plinko.jsx";
import * as Mines from "./games/Mines.jsx";
import * as Wheel from "./games/Wheel.jsx";
import * as Diamonds from "./games/Diamonds.jsx";
import LiveTable from "./LiveTable.jsx";
import { slugForGame } from "./Discover.jsx";
import { PublicKey } from "@solana/web3.js";
import SkinFrame from "./SkinFrame.jsx";
import * as Generic from "./games/Generic.jsx";
const MODULES = { coinflip: CoinFlip, crash: Crash, plinko: Plinko, mines: Mines, wheel: Wheel, diamonds: Diamonds };

export default function GamePage({ slug, address }) {
  const app = useApp(); const { platform, games, wallet, usdc, feed, refresh, setHold, sessionKp, sess, openSession } = app;
  const fixed = address ? games.find((x) => x.publicKey.toBase58() === address) : null;
  if (address && !fixed) return <div className="gamebox" style={{ placeItems: "center", display: "grid" }}><div className="muted">Game not found (or paused).</div></div>;
  const effSlug = address ? slugForGame(fixed) : slug;
  // external skin: ?skin=<url> (developer testing) or a registered skin id in the game's uri (w1|skin|emoji|id)
  const devSkin = (location.hash.match(/[?&]skin=([^&]+)/) || [])[1];
  const meta = fixed ? chain.decodeUri(fixed.account.uri) : null;
  const skinUrl = devSkin ? decodeURIComponent(devSkin) : meta?.template === "skin" ? (window.__skins?.[meta.skin]?.url ?? null) : null;
  if (address && !effSlug && !skinUrl) return <div className="gamebox" style={{ placeItems: "center", display: "grid" }}><div className="muted">This game uses a skin this front-end doesn't know. Open it with <span className="mono">?skin=&lt;url&gt;</span> to load one.</div></div>;
  return <GameInner key={(effSlug ?? "skin") + (address ?? "") + (skinUrl ?? "")} slug={effSlug ?? "generic"} fixed={fixed} skinUrl={skinUrl} />;
}
function GameInner({ slug, fixed, skinUrl }) {
  const app = useApp(); const { platform, games, wallet, usdc, feed, refresh, setHold, sessionKp, sess, openSession } = app;
  const meta = bySlug(slug) ?? { title: fixed?.account.name ?? "Game", color: "#8b90c9" }; const M = skinUrl ? Generic : MODULES[slug];
  const [skinTarget, setSkinTarget] = useState(null); const [skinPaced, setSkinPaced] = useState(true);
  const [state, setState] = useState(() => { const s = { ...M.initial }; if (fixed && slug === "plinko") { const t = chain.decodeUri(fixed.account.uri)?.template ?? ""; if (t.includes("medium")) s.risk = "medium"; if (t.includes("high")) s.risk = "high"; } if (fixed && slug === "wheel") { const t = chain.decodeUri(fixed.account.uri)?.template ?? ""; const m = t.match(/wheel_(\w+)_(\d+)/); if (m) { s.risk = m[1]; s.segments = Number(m[2]); } } return s; });
  const gameEntry = useMemo(() => fixed ?? M.pick(games, state), [games, state, fixed]);
  const gameAcc = gameEntry?.account, gamePk = gameEntry?.publicKey;
  const gameKey = gamePk?.toBase58();
  const [vault, setVault] = useState(0n);
  const [mode, setMode] = useState("manual");
  const [amountStr, setAmountStr] = useState("1.00");
  const [auto, setAuto] = useState({ count: 0, onWin: null, onLoss: null, stopProfit: "0", stopLoss: "0" });
  const [running, setRunning] = useState(null); // { n, profit, amount }
  const [phase, setPhase] = useState(null); // { step, text }
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState(null);
  const [fair, setFair] = useState(null);
  const [hiddenBet, setHiddenBet] = useState(null); // player-paced theatre in progress: outcome withheld from strip/feed/balance
  const [gear, setGear] = useState(false); const [copiedLink, setCopiedLink] = useState(false);
  const [settings, setSettings] = useState(() => { try { return JSON.parse(localStorage.getItem("wagerino.settings") || "{}"); } catch { return {}; } });
  const saveSettings = (s) => { setSettings(s); localStorage.setItem("wagerino.settings", JSON.stringify(s)); };
  const abortRef = useRef(null);
  const doneRef = useRef(null);

  useEffect(() => { if (gameAcc) chain.vaultBalance(gameAcc).then(setVault).catch(() => {}); }, [gameKey, feed.length]);
  useEffect(() => { setResult(null); setHistory(feed.filter((f) => gameKey && f.game === gameKey).slice(0, 30).map((f) => ({ ...M.historyItem(f, state), ev: f, signature: f.signature }))); }, [gameKey]);

  const amount = BigInt(Math.max(0, Math.round((parseFloat(amountStr) || 0) * 1e6)));
  const targetBps = gameAcc && gameAcc.mode === 1 ? (skinUrl && skinTarget ? Math.min(Math.max(skinTarget, gameAcc.minTargetBps), gameAcc.maxTargetBps) : M.target(state, gameAcc)) : 0;
  const max = gameAcc && platform ? chain.maxBet(gameAcc, platform, vault, targetBps || null) : 0n;
  const winMult = M.winMult(state, gameAcc, targetBps);
  const busy = !!phase || !!running;
  const useSession = !!(sess?.active && sessionKp);
  const spendable = useSession ? sess.balance : usdc;

  async function oneBet(amt) {
    setResult(null);
    const out = await runBet({ wallet, sessionKp: useSession ? sessionKp : null, gamePk, g: gameAcc, s: platform, amount: amt, targetBps, onStep: (step, text) => setPhase({ step, text }) });
    setPhase({ step: "reveal", text: "" });
    const r = { ev: out.ev, verified: out.verified, seedHex: out.seedHex, signature: out.signature, multX: out.ev.multBps / 10000, payout: out.ev.payout, amount: amt, state: { ...state } };
    const item = { ...M.historyItem({ ...out.ev, state }, state), ev: out.ev, signature: out.signature };
    if (M.playerPaced) {
      // withhold every outcome signal until the player has finished the reveal
      setHiddenBet(out.ev.bet); setHold(true); setResult(r);
      await new Promise((res) => { doneRef.current = res; });
      setHistory((h) => [item, ...h].slice(0, 30)); setHiddenBet(null); setHold(false); setPhase(null); refresh().catch(() => {});
    } else {
      setResult(r); setHistory((h) => [item, ...h].slice(0, 30));
      if (settings.instant) await new Promise((res) => setTimeout(res, 400)); else await M.revealDelay(r); setPhase(null); refresh().catch(() => {});
    }
    return { payout: r.payout, amount: amt };
  }
  async function onBet() {
    setErr(null);
    if (!wallet) return setErr("Connect a wallet first.");
    if (M.begin && M.picking && !M.picking(state)) { M.begin(state, setState); return; }
    if (M.ready && !M.ready(state)) return setErr("Pick at least one tile first.");
    if (amount < BigInt(platform.minBet.toString())) return setErr(`Minimum bet is ${fmt(platform.minBet)} USDC.`);
    if (amount > max) return setErr(`Max bet is ${fmt(max)} USDC right now: the biggest possible win on a bet is capped at ${(platform.exposureBps / 100).toFixed(0)}% of this game's vault (${fmt(vault, 0)} USDC), and this bet could win ${winMult.toFixed(1)}×. Deeper vault → bigger bets — the shares card below funds it.`);
    if (useSession) {
      const acc = await chain.session(wallet.publicKey); const bal = await chain.sessionBalance(wallet.publicKey);
      if (!acc || !acc.sessionKey.equals(sessionKp.publicKey)) return setErr("Your playing session isn't active in this browser — open Deposit to start one.");
      if (amount > BigInt(acc.perBetCap.toString())) return setErr(`Max per bet in this session is ${fmt(acc.perBetCap)} USDC.`);
      if (amount > BigInt(acc.remainingCap.toString())) return setErr(`Wagering allowance left is ${fmt(acc.remainingCap)} USDC — add funds to extend it.`);
      if (amount > bal) return setErr(`Playing balance is ${fmt(bal)} USDC — add funds.`);
    } else if (amount > usdc) return setErr("Not enough USDC.");
    try {
      if (mode === "manual") { await oneBet(amount); M.finish?.(state, setState); return; }
      const ctrl = new AbortController(); abortRef.current = ctrl; setRunning({ n: 0, profit: 0n, amount });
      await runAuto({ base: amount, count: Number(auto.count) || 0, onWinPct: auto.onWin, onLossPct: auto.onLoss,
        stopProfit: BigInt(Math.round((parseFloat(auto.stopProfit) || 0) * 1e6)), stopLoss: BigInt(Math.round((parseFloat(auto.stopLoss) || 0) * 1e6)),
        bet: async (amt) => { if (amt > (await currentMax())) throw new Error("Auto stopped: bet exceeds the vault cap."); return oneBet(amt); },
        onProgress: (p) => setRunning({ ...p }), signal: ctrl.signal });
    } catch (e) { setErr(friendly(e)); setPhase(null); }
    finally { setRunning(null); abortRef.current = null; }
  }
  async function currentMax() { const vb = await chain.vaultBalance(gameAcc); const g = await chain.game(gamePk); return chain.maxBet(g, platform, vb, targetBps || null); }
  const stopAuto = () => abortRef.current?.abort();
  const half = () => setAmountStr((v) => (Math.max(0.1, (parseFloat(v) || 0) / 2)).toFixed(2));
  const dbl = () => setAmountStr((v) => { const cap = Number(max) / 1e6; let n = (parseFloat(v) || 0.1) * 2; if (cap > 0) n = Math.min(n, cap); return Math.max(0.1, n).toFixed(2); });

  if (!gameAcc) return <div className="gamebox" style={{ placeItems: "center", display: "grid" }}><div className="muted">This game isn't deployed on-chain yet.</div></div>;
  const visibleFeed = feed.filter((f) => f.bet !== hiddenBet && f.game === gameKey);
  return (
    <>
      <div className="strip">
        <span className="strip-title">{gameAcc.name}{fixed && <span className="muted" style={{ fontWeight: 600 }}> · by {short(gameAcc.creator.toBase58())}</span>}</span>
        <div className="strip-results">{history.map((h, i) => <button key={h.signature ?? i} className={`chip ${h.mult > 1 ? "win" : ""}`} title="Open proof" onClick={() => h.ev && setFair({ ev: h.ev, signature: h.signature })}>{h.mult.toFixed(2)}×</button>)}</div>
        <div className="strip-tools">
          <div style={{ position: "relative" }}>
            <button className="btn-dark" onClick={() => setGear((o) => !o)}>⚙ Settings</button>
            {gear && <div className="menu" style={{ right: 0 }} onMouseLeave={() => setGear(false)}>
              <div className="menu-h">Settings</div>
              <a onClick={() => saveSettings({ ...settings, instant: !settings.instant })}>{settings.instant ? "☑" : "☐"} Instant results (skip animations)</a>
              <a onClick={() => saveSettings({ ...settings, hideFeed: !settings.hideFeed })}>{settings.hideFeed ? "☑" : "☐"} Hide live bets</a>
            </div>}
          </div>
          <button className="btn-dark" onClick={() => { const u = `${location.origin}/#/g/${gameKey}${wallet ? `?ref=${wallet.publicKey.toBase58()}` : ""}`; navigator.clipboard?.writeText(u); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500); }}>{copiedLink ? "✓ Link copied" : "↗ Share"}</button>
          <button className="btn-dark" onClick={() => setFair(result && !hiddenBet ? { ev: result.ev, signature: result.signature } : { none: true })}>✓ Fairness</button>
        </div>
      </div>
      <div className="gamebox">
        <aside className="betpanel">
          <div className="seg"><button className={mode === "manual" ? "on" : ""} onClick={() => !busy && setMode("manual")}>Manual</button><button className={mode === "auto" ? "on" : ""} onClick={() => !busy && setMode("auto")}>Auto</button></div>
          <div className="field"><label>Bet amount</label>
            <div className="amount"><input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} disabled={busy} /><span className="unit">USDC</span><button onClick={half}>½</button><button onClick={dbl}>2×</button></div>
            <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>max {fmt(max)} USDC · vault {fmt(vault, 0)} USDC</div>
          </div>
          <M.Controls state={state} setState={setState} game={gameAcc} disabled={busy} />
          {mode === "auto" && (
            <>
              <div className="field"><label>Number of Bets</label><div className="amount"><input value={auto.count} onChange={(e) => setAuto({ ...auto, count: e.target.value.replace(/\D/g, "") })} disabled={busy} /><span className="unit">{Number(auto.count) ? "" : "∞"}</span></div></div>
              <WinLoss label="On Win" val={auto.onWin} set={(v) => setAuto({ ...auto, onWin: v })} disabled={busy} />
              <WinLoss label="On Loss" val={auto.onLoss} set={(v) => setAuto({ ...auto, onLoss: v })} disabled={busy} />
              <div className="field"><label>Stop on Profit</label><div className="amount"><input value={auto.stopProfit} onChange={(e) => setAuto({ ...auto, stopProfit: e.target.value })} disabled={busy} /><span className="unit">USDC</span></div></div>
              <div className="field"><label>Stop on Loss</label><div className="amount"><input value={auto.stopLoss} onChange={(e) => setAuto({ ...auto, stopLoss: e.target.value })} disabled={busy} /><span className="unit">USDC</span></div></div>
            </>
          )}
          <M.Readout state={state} game={gameAcc} amount={amount} winMult={winMult} />
          {running ? <button className="btn-orange action" onClick={stopAuto}>Stop Autobet · {running.n} bets · {running.profit >= 0n ? "+" : "-"}{fmt(running.profit < 0n ? -running.profit : running.profit)}</button>
            : <button className="btn-orange action" disabled={busy || !wallet} onClick={onBet}>{!wallet ? "Connect wallet" : phase ? phase.text || "…" : mode === "auto" ? "Start Autobet" : M.label ? M.label(state, winMult) : "Bet"}</button>}
          {err && <div className="err">{err}</div>}
          {!useSession && <p className="trust">Each bet needs a wallet confirmation. <a onClick={openSession} style={{ textDecoration: "underline", cursor: "pointer", color: "var(--amber)" }}>Deposit to play</a> without popups.</p>}
        </aside>
        <section className="canvas" style={{ gridColumn: settings.hideFeed ? "2 / span 2" : undefined }}>
          <div className="stage">
            {phase && phase.step !== "reveal" && <div className="status"><span className="dot" />{phase.text}</div>}
            {skinUrl ? <SkinFrame url={skinUrl} game={{ address: gameKey, name: gameAcc.name, mode: gameAcc.mode, rtpBps: gameAcc.rtpBps, table: chain.tableRows(gameAcc).map((r) => ({ multBps: r.multBps, prob: r.prob })), minTargetBps: gameAcc.minTargetBps, maxTargetBps: gameAcc.maxTargetBps }} platform={platform} result={result} phase={phase && { ...phase, amount, targetBps }} onTarget={setSkinTarget} onDone={() => { doneRef.current?.(); doneRef.current = null; }} onStatus={(t) => setPhase((p) => (p ? { ...p, text: t } : p))} resetKey={result ? 0 : 1} />
              : <M.Canvas result={result} phase={phase} state={state} game={gameAcc} history={history} onPick={(p) => setState({ ...state, ...p })} disabled={busy} onDone={() => { doneRef.current?.(); doneRef.current = null; }} />}
          </div>
          <M.Under result={result} state={state} game={gameAcc} history={history} amount={amount} winMult={winMult} />
        </section>
        {!settings.hideFeed && <LiveBets feed={visibleFeed} games={games} me={wallet?.publicKey.toBase58()} onOpen={(f) => setFair({ ev: f, fromFeed: true, signature: f.signature })} />}
      </div>
      <SharesCard game={gameAcc} gamePk={gamePk} vault={vault} />
      <LiveTable onOpen={(f) => setFair({ ev: f, fromFeed: true, signature: f.signature })} />
      {fair && <Fairness item={fair} games={games} fallback={gameAcc} onClose={() => setFair(null)} />}
    </>
  );
}

function WinLoss({ label, val, set, disabled }) {
  const reset = val === null;
  return <div className="field"><label>{label}</label><div className="onwl"><button className={reset ? "on" : ""} onClick={() => set(null)} disabled={disabled}>Reset</button><button className={!reset ? "on" : ""} onClick={() => set(val ?? 0)} disabled={disabled}>Increase By:</button><input value={reset ? "" : val} placeholder="0" onChange={(e) => set(parseFloat(e.target.value) || 0)} disabled={disabled || reset} /><span className="pct">%</span></div></div>;
}
function friendly(e) { const m = String(e?.message ?? e); const where = (e?.stack || "").split("\n").slice(1, 3).map((l) => l.trim().replace(/^at /, "")).join(" ← "); if (/Cannot read|is not a function|undefined/.test(m)) return `${m} (${where})`; if (/User rejected/i.test(m)) return "You cancelled in the wallet — nothing happened."; if (/ExposureExceeded/.test(m)) return "The vault can't cover that bet at this multiplier right now. Lower the bet or the target."; if (/insufficient funds/i.test(m)) return "Not enough USDC (or SOL for fees)."; return m.split("\n")[0]; }

function LiveBets({ feed, games, me, onOpen }) {
  const ref = useRef(null); const [rows, setRows] = useState(14);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setRows(Math.max(4, Math.floor((el.clientHeight - 44) / 42)))); ro.observe(el); return () => ro.disconnect(); }, []);
  return <aside className="livecol" ref={ref}><div className="eyebrow" style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--green)" }} />THIS GAME · LIVE</div>
    {feed.slice(0, rows).map((f) => { const g = games.find((x) => x.publicKey.toBase58() === f.game); const win = f.payout > f.amount; return (
      <a key={f.signature} className={`liverow ${f.player === me ? "mine" : ""}`} onClick={() => onOpen(f)} title="Open proof">
        <span className="g">{(g?.account.name ?? "game").split(" ")[0]}</span><span className="mono p">{short(f.player)}</span>
        <span className={`m ${win ? "win" : ""}`}>{(f.multBps / 10000).toFixed(2)}×</span><span className={`v ${win ? "win" : ""}`}>{win ? "+" : ""}{fmt(f.payout - f.amount)}</span>
      </a>); })}
    {!feed.length && <div className="dim">No bets yet.</div>}
  </aside>;
}
function SharesCard({ game, gamePk, vault }) {
  const { platform, wallet, refresh, setErr } = useApp(); const [n, setN] = useState("10"); const [busy, setBusy] = useState(false);
  const shares = BigInt(Math.max(0, Math.round((parseFloat(n) || 0) * 1e6)));
  const buy = shares > 0n ? chain.quoteBuy(game, platform, vault, shares) : 0n, sell = shares > 0n && BigInt(game.sharesIssued.toString()) > 0n ? chain.quoteSell(game, platform, vault, shares) : 0n;
  async function trade(isBuy) { if (!wallet) return; setBusy(true); try { await signAndSend(wallet.provider, chain.connection(), await chain.tradeSharesTx(wallet.publicKey, gamePk, game, platform, shares, isBuy)); await refresh(); } catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); } }
  return <div className="livebets" style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 14, alignItems: "center" }}>
    <div><div className="eyebrow">BE THE HOUSE · {game.name}</div><div className="muted" style={{ fontSize: 13 }}>NAV {fmt(chain.navPerShare(game, vault), 4)} USDC/share · shares issued {fmt(game.sharesIssued)} · vault {fmt(vault)} USDC · this game's edge accrues to share holders</div></div>
    <div className="amount" style={{ width: 160 }}><input value={n} onChange={(e) => setN(e.target.value)} /><span className="unit">sh</span></div>
    <button className="btn-orange" disabled={busy || !wallet} onClick={() => trade(true)}>Buy · {fmt(buy)}</button>
    <button className="btn-dark" disabled={busy || !wallet} onClick={() => trade(false)}>Sell · {fmt(sell)}</button>
  </div>;
}

export function Fairness({ item, games, fallback, onClose }) {
  const [v, setV] = useState(null); const ev = item.ev;
  const game = (ev && games.find((x) => x.publicKey.toBase58() === ev.game)?.account) ?? fallback;
  useEffect(() => { if (ev && game) chain.verify(ev, game).then(setV).catch(() => setV({ ok: false })); }, [ev]);
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}>
    <h2>Fairness</h2>
    <p className="muted" style={{ marginTop: 0 }}>Your bet is burned before randomness exists. ORAO's node quorum signs 64 random bytes on-chain; the outcome is <span className="mono">sha256("WAGERINO_BET_V2" ‖ sha256(vrf) ‖ nonce)</span> against this game's immutable table. Anyone can recompute it — this page just did.</p>
    {!ev ? <p className="muted">Place a bet, or click "verify" on any live bet, to see its proof.</p> : <div className="kv">
      <b>game</b><span>{game?.name} · {game?.mode === 0 ? "payout table" : "target mode"} · {game ? (game.rtpBps / 100).toFixed(1) : ""}% RTP</span>
      <b>bet</b><span className="mono">{ev.bet}</span><b>player</b><span className="mono">{ev.player}</span><b>stake</b><span>{fmt(ev.amount)} USDC</span>
      <b>VRF randomness</b><span className="mono" style={{ wordBreak: "break-all" }}>{Buffer.from(ev.vrfRandomness).toString("hex")}</span>
      <b>seed</b><span className="mono" style={{ wordBreak: "break-all" }}>{Buffer.from(ev.seed).toString("hex")}</span>
      <b>r1 / r2</b><span className="mono">{String(ev.r1)} / {String(ev.r2)}</span>
      <b>multiplier</b><span>{(ev.multBps / 10000).toFixed(4)}×</span><b>payout</b><span>{fmt(ev.payout)} USDC{ev.jackpotPaid > 0n ? ` + jackpot ${fmt(ev.jackpotPaid)}` : ""}</span>
      <b>local check</b><span>{v == null ? "recomputing…" : v.ok ? <span className="ok">MATCH — the chain paid exactly what the math says</span> : <span className="bad">MISMATCH</span>}</span>
      {item.signature && <><b>transaction</b><a className="mono" href={`https://solscan.io/tx/${item.signature}`} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>{item.signature.slice(0, 20)}… ↗</a></>}
    </div>}
    <div style={{ marginTop: 18, textAlign: "right" }}><button className="btn-dark" onClick={onClose}>Close</button></div>
  </div></div>;
}
