// Game catalogue: how on-chain games map to the six originals, plus per-game math helpers.
// Presets are separate on-chain games; the UI matches them by name prefix.
export const PROB_DOMAIN = 10_000_000;
export const CATALOG = [
  { slug: "coinflip", title: "Coin Flip", prefix: "Coin Flip", mode: 0, tag: "1.95×", color: "#f2a93b" },
  { slug: "crash",    title: "Crash",     prefix: "Crash",     mode: 1, tag: "up to 1000×", color: "#ee6b3b" },
  { slug: "plinko",   title: "Plinko",    prefix: "Plinko",    mode: 0, tag: "16 rows", color: "#ff4d6d" },
  { slug: "mines",    title: "Mines",     prefix: "Mines",     mode: 1, tag: "pick & rip", color: "#2fd37a" },
  { slug: "wheel",    title: "Wheel",     prefix: "Wheel",     mode: 0, tag: "up to 10×", color: "#f3e000" },
  { slug: "diamonds", title: "Diamonds",  prefix: "Diamonds",  mode: 0, tag: "50×", color: "#4dd0ff" },
];
export const bySlug = (s) => CATALOG.find((g) => g.slug === s);

// ---- Plinko: 16 rows -> 17 slots; mirrored slots share a payout row on-chain.
export const PLINKO = {
  low:    [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high:   [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};
export const binom16 = (() => { const c = [1]; for (let i = 1; i <= 16; i++) c.push((c[i - 1] * (16 - i + 1)) / i); return c; })();
/** Given the on-chain row multiplier that hit and r2, pick a concrete landing slot (presentation only). */
export function plinkoSlotFor(multX, slotMults, r2) {
  const slots = slotMults.map((m, i) => ({ m, i })).filter((s) => Math.abs(s.m - multX) < 1e-6);
  if (!slots.length) return 8;
  const w = slots.map((s) => binom16[s.i]); const tot = w.reduce((a, b) => a + b, 0);
  let x = (Number(r2 % 1_000_000n) / 1_000_000) * tot;
  for (let i = 0; i < slots.length; i++) { x -= w[i]; if (x <= 0) return slots[i].i; }
  return slots[slots.length - 1].i;
}

// ---- Mines: pre-commit. Survive `picks` safe tiles with `mines` mines on a 5x5 grid.
export const choose = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
export const minesWinProb = (mines, picks) => choose(25 - mines, picks) / choose(25, picks);
/** Target multiplier (bps) for a TARGET-mode game with rtpBps so that EV == RTP. */
export const minesTargetBps = (mines, picks, rtpBps) => Math.floor((rtpBps / minesWinProb(mines, picks)));
/** Deterministic tile layout for the reveal animation from the draw (presentation only). */
export function minesLayout(mines, r2) {
  let x = Number(r2 % 2147483647n) || 1; const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const idx = [...Array(25).keys()]; for (let i = 24; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return new Set(idx.slice(0, mines));
}

// ---- Wheel presets (segments 10/20/30/40/50, risk low/medium/high). Row = distinct multiplier.
export const WHEEL = {
  low:    { 10: [[1.5, 1], [1.2, 7], [0, 2]], 30: [[1.5, 3], [1.2, 21], [0, 6]], 50: [[1.5, 5], [1.2, 35], [0, 10]] },
  medium: { 10: [[3, 1], [2, 2], [1.7, 2], [1.5, 2], [0, 3]], 30: [[4, 1], [3, 3], [2, 5], [1.7, 6], [1.5, 6], [0, 9]], 50: [[5, 1], [3, 5], [2, 9], [1.7, 10], [1.5, 10], [0, 15]] },
  high:   { 10: [[9.9, 1], [0, 9]], 30: [[29.7, 1], [0, 29]], 50: [[49.5, 1], [0, 49]] },
};
export const WHEEL_COLORS = { 0: "#3b5566", 1.2: "#d8f0ff", 1.5: "#34e000", 1.7: "#d8f0ff", 2: "#f3e000", 3: "#8b3cf5", 4: "#ff9a2e", 5: "#ff9a2e", 9.9: "#ff4d6d", 29.7: "#ff4d6d", 49.5: "#ff4d6d" };

// ---- Diamonds: 5 gems from 7 colours. Outcome categories -> rows.
export const DIAMOND_ROWS = [
  { name: "5 of a kind", mult: 50, pattern: [1, 1, 1, 1, 1] },
  { name: "4 of a kind", mult: 5, pattern: [1, 1, 1, 1, 0] },
  { name: "Full house", mult: 4, pattern: [1, 1, 1, 2, 2] },
  { name: "3 of a kind", mult: 3, pattern: [1, 1, 1, 0, 0] },
  { name: "Two pairs", mult: 2, pattern: [1, 1, 2, 2, 0] },
  { name: "One pair", mult: 0.1, pattern: [1, 1, 0, 0, 0] },
  { name: "No pair", mult: 0, pattern: [0, 0, 0, 0, 0] },
];
export const GEM_COLORS = ["#4dd0ff", "#2fd37a", "#ff4d6d", "#f3e000", "#8b3cf5", "#ff9a2e", "#ffffff"];
/** Generate five gems whose category matches the hit row (presentation only). */
export function diamondsFor(multX, r2) {
  const row = DIAMOND_ROWS.find((r) => Math.abs(r.mult - multX) < 1e-6) ?? DIAMOND_ROWS[6];
  let x = Number(r2 % 2147483647n) || 1; const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const pick = () => Math.floor(rnd() * 7);
  const a = pick(); let b = pick(); while (b === a) b = pick(); let c = pick(); while (c === a || c === b) c = pick();
  let d = pick(); while ([a, b, c].includes(d)) d = pick(); let e = pick(); while ([a, b, c, d].includes(e)) e = pick();
  const gems = { "5 of a kind": [a, a, a, a, a], "4 of a kind": [a, a, a, a, b], "Full house": [a, a, a, b, b], "3 of a kind": [a, a, a, b, c], "Two pairs": [a, a, b, b, c], "One pair": [a, a, b, c, d], "No pair": [a, b, c, d, e] }[row.name];
  for (let i = gems.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [gems[i], gems[j]] = [gems[j], gems[i]]; }
  return gems;
}
/** Map a nominal multiplier layout onto the on-chain table: distinct nominal values (desc) correspond 1:1 to the game's rows (desc). */
export function mapToChain(nominal, game) {
  const distinct = [...new Set(nominal)].sort((a, b) => b - a);
  const onchain = [...Array(game.tableLen)].map((_, i) => game.multBps[i] / 10000);
  const m = new Map(distinct.map((v, i) => [v, onchain[i] ?? v]));
  return nominal.map((v) => m.get(v));
}
export const fmt = (v, d = 2) => (Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
export const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "");
