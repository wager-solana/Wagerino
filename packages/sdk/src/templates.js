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
