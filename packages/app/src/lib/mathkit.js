// Math builder helpers: validate a payout table against platform bounds, compute stats, simulate.
export const DOMAIN = 10_000_000;
export function validate(rows, b) {
  // rows: [{ mult: number (x), prob: number (%) }]
  const errs = [];
  if (rows.length < 1 || rows.length > 16) errs.push("1–16 rows");
  const bps = rows.map((r) => Math.round((parseFloat(r.mult) || 0) * 10000)); const pr = rows.map((r) => (parseFloat(r.prob) || 0) / 100 * DOMAIN);
  for (let i = 1; i < bps.length; i++) if (bps[i] >= bps[i - 1]) errs.push("multipliers must strictly decrease top to bottom");
  if (bps[0] > b.maxMultBps) errs.push(`top multiplier above ${b.maxMultBps / 10000}× cap`);
  const sum = pr.reduce((a, v) => a + v, 0); if (Math.abs(sum - DOMAIN) > DOMAIN * 0.0005) errs.push(`probabilities must total 100% (now ${(sum / DOMAIN * 100).toFixed(2)}%)`);
  if (pr.some((p) => p <= 0)) errs.push("every row needs a probability > 0");
  const rtp = bps.reduce((a, m, i) => a + m * pr[i], 0) / DOMAIN; // in bps
  if (rtp > b.maxRtpBps) errs.push(`RTP ${(rtp / 100).toFixed(2)}% above the ${b.maxRtpBps / 100}% cap`);
  if (rtp < b.minRtpBps) errs.push(`RTP ${(rtp / 100).toFixed(2)}% below the ${b.minRtpBps / 100}% floor`);
  return { ok: !errs.length, errs, rtpBps: Math.round(rtp) };
}
/** Normalize to exact integer probabilities summing to DOMAIN (last row absorbs rounding). */
export function toTable(rows) {
  const bps = rows.map((r) => Math.round((parseFloat(r.mult) || 0) * 10000)); let acc = 0;
  return rows.map((r, i) => { let p = Math.round((parseFloat(r.prob) || 0) / 100 * DOMAIN); if (i === rows.length - 1) p = DOMAIN - acc; acc += p; return [bps[i], p]; });
}
export function stats(rows) {
  const t = toTable(rows); const rtp = t.reduce((a, [m, p]) => a + m * p, 0) / DOMAIN / 10000;
  const hit = t.filter(([m]) => m >= 10000).reduce((a, [, p]) => a + p, 0) / DOMAIN; const anyWin = t.filter(([m]) => m > 0).reduce((a, [, p]) => a + p, 0) / DOMAIN;
  const varc = t.reduce((a, [m, p]) => a + Math.pow(m / 10000 - rtp, 2) * p, 0) / DOMAIN;
  return { rtp, hit, anyWin, sd: Math.sqrt(varc), maxX: t[0][0] / 10000 };
}
/** Fast client-side simulation: n bets of `stake` against a vault; returns vault path samples. */
export function simulate(rows, n = 10000, stake = 1, vault = 1000, edgeBps = 100) {
  const t = toTable(rows); const cum = []; let c = 0; for (const [m, p] of t) { c += p; cum.push([m, c]); }
  let v = vault, minV = vault, maxV = vault; const path = [];
  for (let i = 0; i < n; i++) { const r = Math.random() * DOMAIN; let m = 0; for (const [mm, cc] of cum) if (r < cc) { m = mm; break; }
    v += stake - (stake * m) / 10000; if (v < minV) minV = v; if (v > maxV) maxV = v; if (i % Math.max(1, Math.floor(n / 200)) === 0) path.push(+v.toFixed(2)); }
  return { end: +v.toFixed(2), minV: +minV.toFixed(2), maxV: +maxV.toFixed(2), path };
}
export const PRESETS = {
  "Coin flip 1.95×": [{ mult: 1.95, prob: 50 }, { mult: 0, prob: 50 }],
  "Scratch card": [{ mult: 500, prob: 0.01 }, { mult: 50, prob: 0.2 }, { mult: 10, prob: 1.5 }, { mult: 3, prob: 6 }, { mult: 1.5, prob: 12 }, { mult: 1, prob: 15 }, { mult: 0, prob: 65.29 }],
  "3-reel slot": [{ mult: 200, prob: 0.05 }, { mult: 40, prob: 0.5 }, { mult: 12, prob: 2 }, { mult: 5, prob: 5 }, { mult: 2, prob: 12 }, { mult: 1, prob: 18 }, { mult: 0, prob: 62.45 }],
  "Keno-lite (pick 3)": [{ mult: 45, prob: 1.4 }, { mult: 3, prob: 13.5 }, { mult: 1, prob: 32 }, { mult: 0, prob: 53.1 }],
};
