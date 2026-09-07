import React from "react";
// Original SVG tile art — one glyph per game, drawn in the game's accent colour.
export function GameArt({ slug, size = 120 }) {
  const s = size;
  switch (slug) {
    case "coinflip": return <svg width={s} height={s} viewBox="0 0 100 100"><defs><radialGradient id="c1" cx=".35" cy=".3"><stop offset="0" stopColor="#ffd37a" /><stop offset=".6" stopColor="#f2a93b" /><stop offset="1" stopColor="#b8791f" /></radialGradient></defs><ellipse cx="50" cy="52" rx="38" ry="38" fill="url(#c1)" /><ellipse cx="50" cy="52" rx="26" ry="26" fill="none" stroke="#a5651c" strokeWidth="3" /><path d="M50 36l4.5 9.5 10.5 1.5-7.5 7.2 1.8 10.3L50 59.6l-9.3 4.9 1.8-10.3-7.5-7.2 10.5-1.5z" fill="#a5651c" /></svg>;
    case "crash": return <svg width={s} height={s} viewBox="0 0 100 100"><path d="M12 82 C 30 78, 45 70, 60 52 S 82 24, 90 14" fill="none" stroke="#ee6b3b" strokeWidth="7" strokeLinecap="round" /><path d="M12 82 C 30 78, 45 70, 60 52 S 82 24, 90 14 L 90 82 Z" fill="#ee6b3b" opacity=".25" /><circle cx="90" cy="14" r="7" fill="#fff" /></svg>;
    case "plinko": return <svg width={s} height={s} viewBox="0 0 100 100">{[...Array(5)].map((_, r) => [...Array(r + 2)].map((_, i) => <circle key={r + "-" + i} cx={50 + (i - (r + 1) / 2) * 16} cy={22 + r * 14} r="3.2" fill="#fff" />))}<circle cx="42" cy="14" r="6" fill="#f2a93b" /><rect x="12" y="88" width="76" height="8" rx="2" fill="#ff4d6d" /></svg>;
    case "mines": return <svg width={s} height={s} viewBox="0 0 100 100"><rect x="14" y="14" width="34" height="34" rx="6" fill="#123a2a" /><rect x="52" y="14" width="34" height="34" rx="6" fill="#0f2431" /><rect x="14" y="52" width="34" height="34" rx="6" fill="#0f2431" /><rect x="52" y="52" width="34" height="34" rx="6" fill="#3a1220" /><path d="M31 22l9 8-9 12-9-12z" fill="#2fd37a" /><circle cx="69" cy="70" r="10" fill="#ff4d6d" /><path d="M74 60l4-6" stroke="#f3e000" strokeWidth="3" /></svg>;
    case "wheel": return <svg width={s} height={s} viewBox="0 0 100 100">{["#f3e000", "#34e000", "#d8f0ff", "#8b3cf5", "#ff9a2e", "#3b5566", "#f3e000", "#34e000"].map((c, i) => { const a = (i / 8) * Math.PI * 2, b = ((i + 1) / 8) * Math.PI * 2; const p = (t, r) => `${50 + Math.cos(t) * r},${50 + Math.sin(t) * r}`; return <path key={i} d={`M${p(a, 42)} A42 42 0 0 1 ${p(b, 42)} L${p(b, 28)} A28 28 0 0 0 ${p(a, 28)}Z`} fill={c} />; })}<path d="M50 4l6 12h-12z" fill="#ff4d6d" /></svg>;
    case "diamonds": return <svg width={s} height={s} viewBox="0 0 100 100"><path d="M50 14l28 26-28 46-28-46z" fill="#4dd0ff" /><path d="M22 40h56L50 86z" fill="#1aa6d6" /><path d="M36 40l14-26 14 26z" fill="#a6ecff" /></svg>;
    default: return null;
  }
}

export function RailIcon({ slug }) {
  const P = { width: 26, height: 26, viewBox: "0 0 26 26", fill: "none" };
  switch (slug) {
    case "home": return <svg {...P}><path d="M3 12l10-8 10 8v10a1 1 0 0 1-1 1h-6v-7h-6v7H4a1 1 0 0 1-1-1z" fill="currentColor" opacity=".9" /></svg>;
    case "coinflip": return <svg {...P}><circle cx="13" cy="13" r="10" fill="currentColor" opacity=".35" /><circle cx="13" cy="13" r="10" stroke="currentColor" strokeWidth="2" /><path d="M13 7v12M10 10.5c0-1.4 1.3-2 3-2s3 .6 3 2-1.3 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.6 3-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "crash": return <svg {...P}><path d="M14 3c4 0 8 4 9 9l-4 1-3-3-1 4-4 4-4-1 1-4 3-3-1-4c1-2 2-3 4-3z" fill="currentColor" opacity=".9" /><path d="M6 20l-3 3M9 17l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "plinko": return <svg {...P}>{[[13, 6], [9, 11], [17, 11], [5, 16], [13, 16], [21, 16], [3, 21], [9, 21], [17, 21], [23, 21]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill="currentColor" />)}<circle cx="13" cy="2.5" r="2.4" fill="currentColor" opacity=".5" /></svg>;
    case "mines": return <svg {...P}><circle cx="12" cy="15" r="8" fill="currentColor" opacity=".9" /><path d="M17 8l4-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M21 2l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="currentColor" /></svg>;
    case "wheel": return <svg {...P}><circle cx="13" cy="13" r="10" fill="currentColor" opacity=".25" /><path d="M13 3a10 10 0 0 1 8.7 5L13 13z M21.7 8A10 10 0 0 1 21.7 18L13 13z M21.7 18A10 10 0 0 1 4.3 18L13 13z" fill="currentColor" opacity=".9" /><circle cx="13" cy="13" r="3" fill="#0f1233" /></svg>;
    case "diamonds": return <svg {...P}><path d="M7 3h12l5 7-11 13L2 10z" fill="currentColor" opacity=".9" /><path d="M2 10h22M9.5 3l3.5 7 3.5-7M9.5 10l3.5 13 3.5-13" stroke="#0f1233" strokeWidth="1.4" /></svg>;
    default: return null;
  }
}
