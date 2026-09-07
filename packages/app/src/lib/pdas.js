// Browser-safe PDA helpers (WebCrypto for hashing).
import { PublicKey } from "@solana/web3.js";
export const ORAO_VRF = new PublicKey("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
const enc = (s) => Buffer.from(s);
const le64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const find = (seeds, pid) => PublicKey.findProgramAddressSync(seeds, pid)[0];
export const pdas = (pid) => ({
  platform: () => find([enc("platform")], pid),
  jackpot: () => find([enc("jackpot")], pid),
  game: (creator, seed) => find([enc("game"), creator.toBuffer(), le64(seed)], pid),
  gameAuth: (g) => find([enc("game_auth"), g.toBuffer()], pid),
  vault: (g) => find([enc("vault"), g.toBuffer()], pid),
  shares: (g) => find([enc("shares"), g.toBuffer()], pid),
  bet: (player, n) => find([enc("bet"), player.toBuffer(), le64(n)], pid),
  session: (owner) => find([enc("session"), owner.toBuffer()], pid),
  sessionVault: (owner) => find([enc("session_vault"), owner.toBuffer()], pid),
  round: (g, seed) => find([enc("round"), g.toBuffer(), le64(seed)], pid),
  entry: (r, player) => find([enc("entry"), r.toBuffer(), player.toBuffer()], pid),
});
export const oraoNetworkState = () => find([enc("orao-vrf-network-configuration")], ORAO_VRF);
export const randomnessPda = (force) => find([enc("orao-vrf-randomness-request"), force], ORAO_VRF);
export async function betForce(bet) { return Buffer.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Buffer.concat([enc("WAGERINO_FORCE_V2"), bet.toBuffer()])))); }
export const freshNonce = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
export const curveCost = (p0, k, issued, delta) => { const quad = (issued * delta + (delta * delta) / 2n) / k; return (p0 * (delta + quad)) / 1_000_000n; };
export const DEAD_SHARES = 1_000n, SHARE_UNIT = 1_000_000n;
