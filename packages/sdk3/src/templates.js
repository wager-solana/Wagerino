// The 15-second tier. Each template is a validated payout table (see tools/vectors.py in the program repo)
// or a target-mode config. `margin` lowers RTP from the platform cap; the creator keeps 90% of it.
export const RTP_CAP = 9850;
export const TEMPLATES = {
  coin_flip:    { mode: 0, name: "Coin Flip",    table: [[19700, 5_000_000], [0, 5_000_000]] },
  wheel:        { mode: 0, name: "Wheel",        table: [[100000, 200_000], [30000, 800_000], [15000, 2_000_000], [10000, 2_450_000], [0, 4_550_000]] },
  scratchy:     { mode: 0, name: "Scratchy",     table: [[10_000_000, 1000], [1_000_000, 10_000], [200_000, 50_000], [50_000, 150_000], [20_000, 620_000], [12_000, 1_190_000], [8_000, 2_090_000], [4_000, 2_737_000], [1_000, 3_152_000]] },
  moon_or_doom: { mode: 0, name: "Moon or Doom", table: [[500_000, 195_000], [0, 9_805_000]] },
  dice:         { mode: 1, name: "Dice",         rtpBps: 9850, minTargetBps: 10_100, maxTargetBps: 1_000_000 },
  crash:        { mode: 1, name: "Crash",        rtpBps: 9850, minTargetBps: 10_100, maxTargetBps: 10_000_000 },
};

/// Apply a creator margin (bps) to a template: scales every multiplier so RTP = RTP_CAP - margin.
export function withMargin(template, marginBps) {
  const targetRtp = RTP_CAP - marginBps;
  if (template.mode === 1) return { ...template, rtpBps: targetRtp };
  const curRtp = template.table.reduce((a, [m, p]) => a + m * p, 0) / 10_000_000;
  // Tables are only ever scaled DOWN. A template already below the cap (e.g. Scratchy at 95%)
  // keeps its shape; the gap to the cap is the creator's margin.
  if (targetRtp >= curRtp) return template;
  const scale = targetRtp / curRtp;
  const table = template.table.map(([m, p]) => [Math.floor(m * scale), p]);
  return { ...template, table };
}
export const templateRtp = (t) => t.mode === 1 ? t.rtpBps : Math.floor(t.table.reduce((a, [m, p]) => a + m * p, 0) / 10_000_000);
export const tableToParams = (t) => ({ multBps: t.table.map(([m]) => m), prob: t.table.map(([, p]) => p) });

// ---------- Originals: generated tables ----------
const DOMAIN = 10_000_000;
function normalize(rows) {
  // rows: [multX, weight] with equal multipliers merged; -> [mult_bps, prob] strictly descending, probs summing to DOMAIN
  const byMult = new Map(); let tot = 0;
  for (const [m, w] of rows) { byMult.set(m, (byMult.get(m) ?? 0) + w); tot += w; }
  const sorted = [...byMult.entries()].sort((a, b) => b[0] - a[0]);
  let acc = 0; const out = sorted.map(([m, w], i) => { let p = Math.floor((w / tot) * DOMAIN); if (i === sorted.length - 1) p = DOMAIN - acc; acc += p; return [Math.round(m * 10000), p]; });
  return out;
}
function capRtp(table, cap = RTP_CAP) {
  const rtp = table.reduce((a, [m, p]) => a + m * p, 0) / DOMAIN;
  if (rtp <= cap) return table;
  const s = cap / rtp; return table.map(([m, p]) => [Math.floor(m * s), p]);
}
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const PLINKO = {
  low:    [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high:   [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};
for (const [risk, slots] of Object.entries(PLINKO)) TEMPLATES[`plinko_${risk}`] = { mode: 0, name: `Plinko ${risk} 16`, table: capRtp(normalize(slots.map((m, i) => [m, binom(16, i)]))) };
const WHEEL = {
  low:    { 10: [[1.5, 1], [1.2, 7], [0, 2]], 30: [[1.5, 3], [1.2, 21], [0, 6]], 50: [[1.5, 5], [1.2, 35], [0, 10]] },
  medium: { 10: [[3, 1], [2, 2], [1.7, 2], [1.5, 2], [0, 3]], 30: [[4, 1], [3, 3], [2, 5], [1.7, 6], [1.5, 6], [0, 9]], 50: [[5, 1], [3, 5], [2, 9], [1.7, 10], [1.5, 10], [0, 15]] },
  high:   { 10: [[9.9, 1], [0, 9]], 30: [[29.7, 1], [0, 29]], 50: [[49.5, 1], [0, 49]] },
};
for (const [risk, bySeg] of Object.entries(WHEEL)) for (const [seg, rows] of Object.entries(bySeg)) TEMPLATES[`wheel_${risk}_${seg}`] = { mode: 0, name: `Wheel ${risk} ${seg}`, table: capRtp(normalize(rows)) };
// Diamonds: 5 gems from 7 colours; category counts over 7^5 = 16807 (exact combinatorics)
TEMPLATES.diamonds = { mode: 0, name: "Diamonds", table: capRtp(normalize([[50, 7], [5, 210], [4, 420], [3, 2100], [2, 3150], [0.1, 8400], [0, 2520]])) };
// Mines: pre-commit, constant-RTP target mode; the UI maps (mines, picks) to a target multiplier.
TEMPLATES.mines = { mode: 1, name: "Mines", rtpBps: RTP_CAP, minTargetBps: 10_100, maxTargetBps: 10_000_000 };
TEMPLATES.dice = { mode: 1, name: "Dice", rtpBps: RTP_CAP, minTargetBps: 10_100, maxTargetBps: 990_000 };
export const ORIGINALS = ["coin_flip", "dice", "crash", "mines", "plinko_low", "plinko_medium", "plinko_high", ...Object.keys(TEMPLATES).filter((k) => k.startsWith("wheel_")), "diamonds"];
