import { PublicKey } from "@solana/web3.js";
export const ORAO_VRF = new PublicKey("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
const enc = (s) => Buffer.from(s);
const le64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const find = (seeds, pid) => PublicKey.findProgramAddressSync(seeds, pid)[0];
export const pdas = (pid) => ({
  platform: () => find([enc("platform")], pid), vault: () => find([enc("vault")], pid), lpMint: () => find([enc("lp")], pid), jackpot: () => find([enc("jackpot")], pid),
  template: (author, seed) => find([enc("template"), author.toBuffer(), le64(seed)], pid),
  house: (creator, seed) => find([enc("house"), creator.toBuffer(), le64(seed)], pid),
  handle: (h) => find([enc("handle"), enc(h)], pid),
  shareMint: (house) => find([enc("shares"), house.toBuffer()], pid),
  stakeVault: (house) => find([enc("stake_vault"), house.toBuffer()], pid),
  stakePos: (house, owner) => find([enc("stake"), house.toBuffer(), owner.toBuffer()], pid),
  sale: (seller, house) => find([enc("sale"), seller.toBuffer(), house.toBuffer()], pid),
  saleEscrow: (sale) => find([enc("sale_escrow"), sale.toBuffer()], pid),
  balance: (owner) => find([enc("balance"), owner.toBuffer()], pid),
  balanceVault: (owner) => find([enc("balance_vault"), owner.toBuffer()], pid),
  bet: (owner, userNonce) => find([enc("bet"), owner.toBuffer(), le64(userNonce)], pid),
});
export const oraoNetworkState = () => find([enc("orao-vrf-network-configuration")], ORAO_VRF);
export const randomnessPda = (force) => find([enc("orao-vrf-randomness-request"), force], ORAO_VRF);
// works in node and browsers
export async function betForce(bet) { const data = Buffer.concat([enc("WAGERINO_FORCE_V3"), bet.toBuffer()]); const d = await globalThis.crypto.subtle.digest("SHA-256", data); return Buffer.from(new Uint8Array(d)); }
export const freshNonce = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
/** Multipliers a house actually pays: template rows scaled so RTP = max_rtp − margin. Mirrors scaled_mult() on-chain. */
export const scaledMult = (multBps, templateRtpBps, maxRtpBps, marginBps) => Math.floor((multBps * (maxRtpBps - marginBps)) / templateRtpBps);
export const USDC_UNIT = 1_000_000n;
export const DEFAULT_PARAMS = { maxRtpBps: 9850, minRtpBps: 9000, maxMultBps: 10_000_000, exposureBps: 100, bankrollBps: 125, jackpotBaseBps: 25, houseSplitBps: 8500, platformSplitBps: 1000, jackpotSplitBps: 500,
  referralBps: 5000, lpExitFeeBps: 25, saleFeeBps: 100, jackpotPayBps: 8000, jackpotHouseBps: 500, settlerRewardBps: 5, jackpotVolumeTarget: 50_000_000_000n, minBet: 100_000n, refundTimeoutSlots: 1500n };
