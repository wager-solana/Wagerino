// Wagerino v2 primitive — TypeScript mirror of programs/wagerino/src/outcome.rs.
// Reproduce any bet from its on-chain event: seed = sha256(vrf_randomness), then outcome*().
export const PROB_DOMAIN = 10_000_000n;
export const BPS = 10_000n;
export const USDC_UNIT = 1_000_000n;
export const JP_BASE_PER_USDC = 100n;
export const JP_MAX = 100_000n;
export const DOMAIN_SEP = new TextEncoder().encode("WAGERINO_BET_V2");


async function sha256(data) {
  if (typeof globalThis.crypto?.subtle?.digest === "function") return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
  const { createHash } = await import("node:crypto");
  return new Uint8Array(createHash("sha256").update(data).digest());
}
function u64le(b, off) { let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[off + i]); return v; }

export async function seedFromVrf(randomness) { return sha256(randomness); }

export async function draw(seed, betNonce) {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const n = new Uint8Array(8); new DataView(n.buffer).setBigUint64(0, betNonce, true);
  const msg = new Uint8Array(DOMAIN_SEP.length + 32 + 8);
  msg.set(DOMAIN_SEP, 0); msg.set(seed, DOMAIN_SEP.length); msg.set(n, DOMAIN_SEP.length + 32);
  const h = await sha256(msg);
  return { r1: u64le(h, 0) % PROB_DOMAIN, r2: u64le(h, 8) % PROB_DOMAIN, r3: u64le(h, 16) % PROB_DOMAIN };
}
export const payoutFor = (amount, multBps) => (amount * BigInt(multBps)) / BPS;
export const sideJackpotProb = (amount, perUsdc) => { const p = (amount * BigInt(perUsdc)) / USDC_UNIT; return p < JP_MAX ? p : JP_MAX; };
export const jackpotProb = (amount) => { const p = (amount * JP_BASE_PER_USDC) / USDC_UNIT; return p < JP_MAX ? p : JP_MAX; };

export function validateTable(table, b) {
  if (table.length === 0 || table.length > 16) throw new Error("table length");
  if (table[0].mult_bps > b.max_mult_bps) throw new Error("multiplier above platform max");
  let sum = 0n, val = 0n, cumv = 0n;
  const cum = [];
  for (let i = 0; i < table.length; i++) {
    const r = table[i];
    if (r.prob <= 0) throw new Error("zero prob row");
    if (i > 0 && table[i - 1].mult_bps <= r.mult_bps) throw new Error("not strictly descending");
    sum += BigInt(r.prob); val += BigInt(r.prob) * BigInt(r.mult_bps); cumv += BigInt(r.prob);
    cum.push({ multBps: r.mult_bps, cum: cumv });
  }
  if (sum !== PROB_DOMAIN) throw new Error(`probs sum ${sum} != ${PROB_DOMAIN}`);
  const rtpBps = Number(val / PROB_DOMAIN);
  if (rtpBps < b.min_rtp_bps || rtpBps > b.max_rtp_bps) throw new Error(`rtp ${rtpBps} out of bounds`);
  return { cum, rtpBps };
}

export async function outcomeTable(seed, betNonce, amount, cum) {
  const d = await draw(seed, betNonce);
  const row = cum.find((r) => d.r1 < r.cum) ?? cum[cum.length - 1];
  return { r1: d.r1, r2: d.r2, r3: d.r3, multBps: row.multBps, payout: payoutFor(amount, row.multBps), jackpot: d.r2 < jackpotProb(amount) };
}
export function targetWinProb(rtpBps, targetBps) {
  if (targetBps <= 0) throw new Error("target");
  const p = (PROB_DOMAIN * BigInt(rtpBps)) / BigInt(targetBps);
  if (p === 0n || p >= PROB_DOMAIN) throw new Error("target out of range");
  return p;
}
export async function outcomeTarget(seed, betNonce, amount, rtpBps, targetBps) {
  const p = targetWinProb(rtpBps, targetBps);
  const d = await draw(seed, betNonce);
  const mult = d.r1 < p ? targetBps : 0;
  return { r1: d.r1, r2: d.r2, r3: d.r3, multBps: mult, payout: payoutFor(amount, mult), jackpot: d.r2 < jackpotProb(amount) };
}
