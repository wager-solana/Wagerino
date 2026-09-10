import React, { useState } from "react";
import { useApp } from "../App.jsx";
import * as chain from "../lib/chain.js";
import { signAndSend } from "../lib/wallet.js";
import { TEMPLATES, RTP_CAP, templateRtp } from "../lib/templates.js";
import { CATALOG, fmt } from "../lib/games.js";
import { GameArt } from "./Art.jsx";
import { validate, toTable, stats, simulate, PRESETS } from "../lib/mathkit.js";

const TEMPLATE_BY_SLUG = { coinflip: "coin_flip", crash: "crash", plinko: "plinko_low", mines: "mines", wheel: "wheel_medium_30", diamonds: "diamonds" };
const VARIANTS = { plinko: ["plinko_low", "plinko_medium", "plinko_high"], wheel: ["wheel_low_10", "wheel_low_30", "wheel_low_50", "wheel_medium_10", "wheel_medium_30", "wheel_medium_50", "wheel_high_10", "wheel_high_30", "wheel_high_50"] };
const EMOJIS = ["🎰", "🐸", "🚀", "🔥", "💎", "🍀", "🐶", "🦍", "👑", "🍌", "🌙", "⚡"];

export default function Create() {
  const { wallet, platform, usdc, refresh, setErr } = useApp();
  const [slug, setSlug] = useState("coinflip"); const [variant, setVariant] = useState(null);
  const [advanced, setAdvanced] = useState(false); const [rows, setRows] = useState(PRESETS["Coin flip 1.95×"]); const [sim, setSim] = useState(null); const [skinId, setSkinId] = useState("");
  const [tmode, setTmode] = useState(0); const [trtp, setTrtp] = useState("97.5"); const [tmin, setTmin] = useState("1.01"); const [tmax, setTmax] = useState("1000");
  const [name, setName] = useState(""); const [emoji, setEmoji] = useState("🎰"); const [cut, setCut] = useState(1.0); const [seed, setSeed] = useState("0"); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  const template = variant ?? TEMPLATE_BY_SLUG[slug]; const t = TEMPLATES[template];
  const baseRtp = templateRtp(t); const marginBps = Math.round(cut * 100);
  const rtp = Math.min(baseRtp, RTP_CAP - marginBps); const effectiveCut = (RTP_CAP - rtp) / 100; // tables below the cap keep their built-in margin
  const seedN = BigInt(Math.max(0, Math.round((parseFloat(seed) || 0) * 1e6)));
  const bounds = platform ? { maxMultBps: platform.maxMultBps, maxRtpBps: platform.maxRtpBps, minRtpBps: platform.minRtpBps } : { maxMultBps: 10_000_000, maxRtpBps: 9850, minRtpBps: 8500 };
  const v = advanced && tmode === 0 ? validate(rows, bounds) : null; const st = advanced && tmode === 0 && v?.ok ? stats(rows) : null;
  const trtpBps = Math.round((parseFloat(trtp) || 0) * 100); const tOk = tmode === 1 && trtpBps >= bounds.minRtpBps && trtpBps <= bounds.maxRtpBps && parseFloat(tmin) >= 1.01 && parseFloat(tmax) <= bounds.maxMultBps / 10000 && parseFloat(tmax) > parseFloat(tmin);
  const custom = advanced ? (tmode === 0 ? { mode: 0, table: toTable(rows), skinTemplate: TEMPLATE_BY_SLUG[slug] } : { mode: 1, rtpBps: trtpBps, minTargetBps: Math.round(parseFloat(tmin) * 10000), maxTargetBps: Math.round(parseFloat(tmax) * 10000), skinTemplate: "crash" }) : null;
  const shownRtp = advanced ? (tmode === 0 ? (v?.rtpBps ?? 0) : trtpBps) : rtp;
  async function launch() {
    setErr(null); if (!wallet) return setErr("Connect a wallet first."); if (!name.trim()) return setErr("Give your game a name.");
    if (seedN > usdc) return setErr(`Seed exceeds your wallet's ${fmt(usdc)} USDC.`);
    if (advanced && tmode === 0 && !v.ok) return setErr("Fix the table first: " + v.errs[0]);
    if (advanced && tmode === 1 && !tOk) return setErr("Target-mode settings are out of bounds.");
    setBusy(true);
    try { const { tx, game } = await chain.createGameTx(wallet.publicKey, platform, { template, name: `${emoji} ${name.trim()}`, emoji, marginBps, seedShares: seedN, custom, skinId: skinId || null });
      await signAndSend(wallet.provider, chain.connection(), tx); await refresh(); setDone(game.toBase58()); }
    catch (e) { setErr(String(e?.message ?? e).split("\n")[0]); } finally { setBusy(false); }
  }
  if (done) { const url = `${location.origin}/#/g/${done}`; return <div className="create-done">
    <div style={{ fontSize: 64 }}>{emoji}</div><h2>{name} is live.</h2>
    <p className="muted">Your game has its own vault, its own share market, and pays you {effectiveCut.toFixed(2)}% of every bet's edge (90% of the margin — the platform keeps 10%). Deepen the vault to raise the max bet.</p>
    <div className="amount" style={{ maxWidth: 560, margin: "14px auto" }}><input value={url} readOnly /><button onClick={() => navigator.clipboard?.writeText(`${url}?ref=${wallet.publicKey.toBase58()}`)}>Copy referral link</button></div>
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}><a className="btn-orange" href={`#/g/${done}`}>Open game</a><a className="btn-dark" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just launched ${emoji} ${name} on Wagerino — provably fair, on-chain, and I'm the house. ${url}?ref=${wallet.publicKey.toBase58()}`)}`} target="_blank" rel="noreferrer">Share on X</a></div>
  </div>; }
  return <div className="create">
    <div className="create-left">
      <h1 style={{ margin: "0 0 4px" }}>Create your casino</h1><p className="muted" style={{ marginTop: 0 }}>Pick a game, name it, choose your cut. One signature. You earn on every bet, forever.</p>
      <div className="eyebrow">1 · GAME</div>
      <div className="tpl-grid">{CATALOG.map((g) => <button key={g.slug} className={`tpl ${slug === g.slug ? "on" : ""}`} onClick={() => { setSlug(g.slug); setVariant(null); }}><GameArt slug={g.slug} size={54} /><span>{g.title}</span></button>)}</div>
      {VARIANTS[slug] && <div className="field"><label>Variant</label><select className="select" value={template} onChange={(e) => setVariant(e.target.value)}>{VARIANTS[slug].map((k) => <option key={k} value={k}>{TEMPLATES[k].name}</option>)}</select></div>}
      <div className="eyebrow" style={{ marginTop: 18 }}>2 · IDENTITY</div>
      <div className="grid2" style={{ gridTemplateColumns: "auto 1fr" }}>
        <div className="field"><label>Emoji</label><div className="emojis">{EMOJIS.map((e) => <button key={e} className={emoji === e ? "on" : ""} onClick={() => setEmoji(e)}>{e}</button>)}</div></div>
        <div className="field"><label>Name (max 30)</label><div className="amount"><input value={name} maxLength={30} placeholder="Frog Flip" onChange={(e) => setName(e.target.value)} /></div></div>
      </div>
      <div className="eyebrow" style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}><span>3 · {advanced ? "YOUR MATH" : "YOUR CUT"}</span><a className="muted" style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setAdvanced(!advanced)}>{advanced ? "← back to simple" : "Advanced: design the math →"}</a></div>
      {!advanced && <>
        <input type="range" min="0" max="13.5" step="0.25" value={cut} onChange={(e) => setCut(parseFloat(e.target.value))} className="slider" />
        <div className="cut-row"><span>Players get <b>{(rtp / 100).toFixed(2)}% RTP</b></span><span>You earn <b>{effectiveCut.toFixed(2)}%</b> of each bet's edge</span></div>
        {baseRtp < RTP_CAP - marginBps && <div className="dim" style={{ fontSize: 12 }}>This template's payouts already sit at {(baseRtp / 100).toFixed(1)}% RTP; your cut is at least {((RTP_CAP - baseRtp) / 100).toFixed(2)}%.</div>}
      </>}
      {advanced && <div className="builder">
        <div className="seg" style={{ maxWidth: 360 }}><button className={tmode === 0 ? "on" : ""} onClick={() => setTmode(0)}>Payout table</button><button className={tmode === 1 ? "on" : ""} onClick={() => setTmode(1)}>Target mode</button></div>
        {tmode === 0 && <>
          <div className="preset-row"><span className="muted">Start from:</span>{Object.keys(PRESETS).map((k) => <button key={k} className="btn-dark" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { setRows(PRESETS[k].map((r) => ({ ...r }))); setSim(null); }}>{k}</button>)}
            <label className="btn-dark" style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Import JSON<input type="file" accept="application/json" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); setRows(j.rows ?? j); } catch { setErr("Invalid JSON"); } }} /></label>
            <button className="btn-dark" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { const blob = new Blob([JSON.stringify({ rows }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name || "game"}-math.json`; a.click(); }}>Export</button></div>
          <table className="tbl"><thead><tr><th>#</th><th>Multiplier ×</th><th>Probability %</th><th>Contribution to RTP</th><th></th></tr></thead><tbody>
            {rows.map((r, i) => <tr key={i}><td className="muted">{i + 1}</td>
              <td><input value={r.mult} onChange={(e) => setRows(rows.map((x, k) => k === i ? { ...x, mult: e.target.value } : x))} /></td>
              <td><input value={r.prob} onChange={(e) => setRows(rows.map((x, k) => k === i ? { ...x, prob: e.target.value } : x))} /></td>
              <td className="muted">{((parseFloat(r.mult) || 0) * (parseFloat(r.prob) || 0)).toFixed(2)}%</td>
              <td><button className="btn-dark" style={{ padding: "4px 8px" }} disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, k) => k !== i))}>×</button></td></tr>)}
          </tbody></table>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className="btn-dark" disabled={rows.length >= 16} onClick={() => setRows([...rows, { mult: 0, prob: 0 }])}>+ row</button>
            <button className="btn-dark" onClick={() => { const s = rows.reduce((a, r) => a + (parseFloat(r.prob) || 0), 0); const last = rows.length - 1; setRows(rows.map((r, k) => k === last ? { ...r, prob: +((parseFloat(r.prob) || 0) + (100 - s)).toFixed(4) } : r)); }}>Balance last row to 100%</button>
            <button className="btn-dark" onClick={() => setSim(simulate(rows, 10000, 1, 1000))}>Simulate 10,000 bets</button></div>
          <div className={`mathstat ${v.ok ? "" : "bad"}`}>
            {v.ok ? <><span>RTP <b>{(st.rtp * 100).toFixed(2)}%</b></span><span>house edge <b>{(100 - st.rtp * 100).toFixed(2)}%</b></span><span>your cut <b>{((RTP_CAP - v.rtpBps) / 100).toFixed(2)}%</b></span><span>any win <b>{(st.anyWin * 100).toFixed(1)}%</b></span><span>max <b>{st.maxX}×</b></span><span>volatility σ <b>{st.sd.toFixed(2)}</b></span></>
              : <span>{v.errs.join(" · ")}</span>}
          </div>
          {sim && <div className="dim" style={{ fontSize: 12 }}>Simulation (1 USDC bets vs a 1,000 USDC vault): ended at <b>{sim.end}</b>, worst <b>{sim.minV}</b>, best <b>{sim.maxV}</b>. <svg width="100%" height="48" viewBox="0 0 200 48" preserveAspectRatio="none"><polyline fill="none" stroke="#2fd37a" strokeWidth="1.5" points={sim.path.map((y, i) => `${(i / (sim.path.length - 1)) * 200},${48 - ((y - sim.minV) / Math.max(1, sim.maxV - sim.minV)) * 44 - 2}`).join(" ")} /></svg></div>}
          <p className="dim" style={{ fontSize: 12 }}>Any game that resolves to one of ≤16 payouts fits: slots (map reel combos to rows), scratch cards, keno, wheels, plinko, pre-commit mines. The skin decides what the row looks like.</p>
        </>}
        {tmode === 1 && <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className="field"><label>RTP %</label><div className="amount"><input value={trtp} onChange={(e) => setTrtp(e.target.value)} /><span className="unit">%</span></div></div>
          <div className="field"><label>Min target ×</label><div className="amount"><input value={tmin} onChange={(e) => setTmin(e.target.value)} /><span className="unit">×</span></div></div>
          <div className="field"><label>Max target ×</label><div className="amount"><input value={tmax} onChange={(e) => setTmax(e.target.value)} /><span className="unit">×</span></div></div>
          <div className="dim" style={{ gridColumn: "1 / -1", fontSize: 12 }}>Player picks any target in range; win chance = RTP ÷ target. Dice, crash, limbo, pre-commit mines. {!tOk && <span style={{ color: "var(--red)" }}>Out of bounds ({bounds.minRtpBps / 100}–{bounds.maxRtpBps / 100}% RTP, max {bounds.maxMultBps / 10000}×).</span>}</div>
        </div>}
        <div className="field"><label>Skin (optional) — a registered skin id, or leave empty to use the {slug} look</label><div className="amount"><input value={skinId} placeholder="e.g. coinflip-ref" onChange={(e) => setSkinId(e.target.value)} /></div><div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Build your own: see the Skin SDK README. Test it on any game with <span className="mono">?skin=&lt;url&gt;</span>.</div></div>
      </div>}
      <div className="eyebrow" style={{ marginTop: 18 }}>4 · SEED THE VAULT (optional)</div>
      <div className="amount"><input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="decimal" /><span className="unit">USDC</span><button onClick={() => setSeed("100")}>100</button><button onClick={() => setSeed("1000")}>1000</button></div>
      <p className="dim" style={{ fontSize: 12 }}>Buys the first shares of your own game so players can bet from minute one (max bet ≈ 1% of vault ÷ top multiplier). Shares are yours to sell at NAV any time. Others can buy in too — that's how vaults grow.</p>
      <button className="btn-orange action" disabled={busy || !wallet} onClick={launch}>{busy ? "Confirm in wallet…" : `Launch ${emoji} ${name || "your game"}`}</button>
    </div>
    <aside className="create-right">
      <div className="eyebrow">PREVIEW</div>
      <div className="tile" style={{ background: `radial-gradient(circle at 50% 110%, ${CATALOG.find((g) => g.slug === slug).color}55, var(--panel) 65%)`, maxWidth: 240 }}>
        <h3>{emoji} {name || "Your game"}</h3><div className="art"><GameArt slug={slug} size={110} /></div><div className="foot">{(shownRtp / 100).toFixed(1)}% RTP · by you</div>
      </div>
      <div className="kv" style={{ marginTop: 18 }}>
        <b>math</b><span>{advanced ? (tmode === 0 ? `custom ${rows.length}-row table` : "custom target mode") : t.mode === 0 ? `${t.table.length}-row payout table, top ${(t.table[0][0] / 10000).toFixed(0)}×` : `target mode, ${(t.minTargetBps / 10000).toFixed(2)}×–${(t.maxTargetBps / 10000).toFixed(0)}×`}</span>
        <b>randomness</b><span>ORAO VRF, verifiable per bet</span>
        <b>your share</b><span>90% of the margin, claimable any time</span>
        <b>cost</b><span>≈0.01 SOL rent + your optional seed</span>
      </div>
    </aside>
  </div>;
}
