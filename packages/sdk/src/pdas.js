import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";

export const ORAO_VRF = new PublicKey("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
export const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
const enc = (s) => Buffer.from(s);
const le64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const find = (seeds, pid) => PublicKey.findProgramAddressSync(seeds, pid)[0];

export const pdas = (pid) => ({
  platform: () => find([enc("platform")], pid),
  jackpot: () => find([enc("jackpot")], pid),
  game: (creator, seed) => find([enc("game"), creator.toBuffer(), le64(seed)], pid),
  gameAuth: (game) => find([enc("game_auth"), game.toBuffer()], pid),
  vault: (game) => find([enc("vault"), game.toBuffer()], pid),
  shares: (game) => find([enc("shares"), game.toBuffer()], pid),
  bet: (player, userNonce) => find([enc("bet"), player.toBuffer(), le64(userNonce)], pid),
  round: (game, seed) => find([enc("round"), game.toBuffer(), le64(seed)], pid),
  entry: (round, player) => find([enc("entry"), round.toBuffer(), player.toBuffer()], pid),
  market: (creator, seed) => find([enc("market"), creator.toBuffer(), le64(seed)], pid),
  marketEscrow: (market) => find([enc("mescrow"), market.toBuffer()], pid),
  position: (market, player) => find([enc("pos"), market.toBuffer(), player.toBuffer()], pid),
});
export const oraoNetworkState = () => find([enc("orao-vrf-network-configuration")], ORAO_VRF);
export const randomnessPda = (force) => find([enc("orao-vrf-randomness-request"), force], ORAO_VRF);
export const betForce = (bet) => createHash("sha256").update(Buffer.concat([enc("WAGERINO_FORCE_V2"), bet.toBuffer()])).digest();
export const roundForce = (round) => createHash("sha256").update(Buffer.concat([enc("WAGERINO_ROUND_V2"), round.toBuffer()])).digest();
export const freshNonce = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
export const curveCost = (p0, k, issued, delta) => { const quad = (issued * delta + (delta * delta) / 2n) / k; return (p0 * (delta + quad)) / 1_000_000n; };
export const DEAD_SHARES = 1_000n;
export const SHARE_UNIT = 1_000_000n;
