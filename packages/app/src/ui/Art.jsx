import React from "react";
// Original SVG tile art — one glyph per game, drawn in the game's accent colour.
export function CrashGlyph({ size = 26 }) {
  return <svg width={size} height={size} viewBox="0 0 100 100"><defs><linearGradient id="cg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#f5a623" /><stop offset="1" stopColor="#ff4d6d" /></linearGradient></defs>
    <path d="M12 10v78h78" stroke="#8b90c9" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M22 78c28-2 50-16 62-58" stroke="url(#cg)" strokeWidth="9" strokeLinecap="round" fill="none" />
    <circle cx="84" cy="20" r="8" fill="#ff4d6d" /><circle cx="84" cy="20" r="13" fill="#ff4d6d" opacity=".25" /></svg>;
}
export function PlinkoGlyph({ size = 26 }) {
  const pegs = []; for (let r = 0; r < 5; r++) for (let i = 0; i <= r + 1; i++) pegs.push([50 + (i - (r + 1) / 2) * 15, 24 + r * 13]);
  return <svg width={size} height={size} viewBox="0 0 100 100"><defs><linearGradient id="pg" x1="0" x2="1"><stop offset="0" stopColor="#ff2d55" /><stop offset=".5" stopColor="#ff8c1a" /><stop offset="1" stopColor="#ffd21a" /></linearGradient></defs>
    {pegs.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="3.4" fill="#e6e8fa" />)}
    <circle cx="46" cy="12" r="4" fill="#f2a93b" /><circle cx="46" cy="12" r="7" fill="#f2a93b" opacity=".3" />
    <rect x="14" y="88" width="72" height="9" rx="3" fill="url(#pg)" /></svg>;
}
export function CoinGlyph({ size = 120 }) {
  return <svg width={size} height={size} viewBox="0 0 100 100"><defs><radialGradient id="c1" cx=".35" cy=".3"><stop offset="0" stopColor="#ffd37a" /><stop offset=".6" stopColor="#f2a93b" /><stop offset="1" stopColor="#b8791f" /></radialGradient></defs><circle cx="50" cy="52" r="38" fill="url(#c1)" /><circle cx="50" cy="52" r="26" fill="none" stroke="#a5651c" strokeWidth="3" /><path d="M50 36l4.5 9.5 10.5 1.5-7.5 7.2 1.8 10.3L50 59.6l-9.3 4.9 1.8-10.3-7.5-7.2 10.5-1.5z" fill="#a5651c" /></svg>;
}
export function GameArt({ slug, size = 120 }) {
  switch (slug) {
    case "coinflip": return <CoinGlyph size={size} />;
    case "crash": return <CrashGlyph size={size} />;
    case "plinko": return <PlinkoGlyph size={size} />;
    case "mines": case "wheel": case "diamonds": return <img src={`/icons/${slug}.png`} alt={slug} style={{ width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 8px 18px rgba(0,0,0,.5))" }} />;
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
