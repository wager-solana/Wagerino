// One-time platform initialization. Signer must be the program's upgrade authority.
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import anchorPkg from "@coral-xyz/anchor";
const anchor = anchorPkg.default ?? anchorPkg;
import { ORAO_VRF } from "@wagerino/sdk";
import { load } from "./_env.js";
const { sdk, kp } = load();
const usdc = new PublicKey(process.argv[2] || (() => { console.error("usage: init-platform.js <USDC_MINT> [AUTHORITY_PUBKEY]"); process.exit(1); })());
const authority = process.argv[3] ? new PublicKey(process.argv[3]) : kp.publicKey;
const bn = (v) => new anchor.BN(v.toString());
const P = { minRtpBps: 8500, maxRtpBps: 9850, maxMultBps: 10_000_000, exposureBps: 100, baseEdgeBps: 100, jackpotStreamBps: 50, settlerRewardBps: 5,
  creatorSplitBps: 9000, lpFeeBps: 25, referralSplitBps: 5000, curveP0: bn(1_000_000), curveK: bn(100_000n * 1_000_000n), minBet: bn(100_000), refundTimeoutSlots: bn(1500) };
const [programData] = PublicKey.findProgramAddressSync([sdk.programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
const sig = await sdk.program.methods.initPlatform(P).accounts({
  payer: kp.publicKey, thisProgram: sdk.programId, programData, authority, platform: sdk.pda.platform(), usdcMint: usdc, jackpotVault: sdk.pda.jackpot(),
  vrf: ORAO_VRF, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
}).rpc();
console.log("platform initialized", sig);
const s = await sdk.platform();
console.log(JSON.stringify({ authority: s.authority.toBase58(), usdc: s.usdcMint.toBase58(), jackpotVault: s.jackpotVault.toBase58(), maxRtpBps: s.maxRtpBps, exposureBps: s.exposureBps }, null, 2));
