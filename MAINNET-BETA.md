# Wagerino v2 — mainnet private-beta deployment & soak runbook

This replaces the devnet runbook. It deploys v2 to mainnet as a **private beta**: real SOL, real USDC,
but only your own money, in small amounts, with no external users until the soak passes and the
audit is done. Treat this deployment as disposable — keep the upgrade authority, never publish the
program ID, and expect to redeploy after the audit.

Every block below is a complete paste for a **fresh shell**. Replace `<...>` before pasting.

## 0. Env — run at the top of every new shell on the build box

```bash
. ~/src/ticket/scripts/env.sh
export SOLANA_URL="https://mainnet.helius-rpc.com/?api-key=<your-key>"
export AUTH=$HOME/wagerino-authority.json
export USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
solana config set --url "$SOLANA_URL" --keypair $AUTH
solana config get
```
`Keypair Path` must be `/root/wagerino-authority.json` and the RPC must be mainnet before any deploy.

## 1. Fund the v2 authority

From Phantom, send to `GYFD8TJSDr2ayb6vD8FRnq83DcH4Es6mT7ckptDDMhyz`:
- **6.5 SOL** (≈5.5 locks as program rent; the rest is fees and buffer)
- **500 USDC** (seeding 4 games at 100 each, plus soak stakes)

```bash
solana balance
spl-token balance $USDC
```

## 2. Program keypair — back it up BEFORE deploying

```bash
cd ~/wagerino
anchor keys list
cp target/deploy/wagerino-keypair.json ~/wagerino-program-mainnet-keypair.json.bak
```
Then from your laptop: `scp root@<box-ip>:/root/wagerino-program-mainnet-keypair.json.bak .` and keep it with the authority backups.

## 3. Build & deploy (mainnet)

```bash
cd ~/wagerino
anchor keys sync && anchor build 2>&1 | grep -E "Error|error\[|Finished"
export PROGRAM_ID=$(solana-keygen pubkey target/deploy/wagerino-keypair.json) && echo $PROGRAM_ID
solana program deploy target/deploy/wagerino.so \
  --program-id target/deploy/wagerino-keypair.json \
  --with-compute-unit-price 50000 --use-rpc --max-sign-attempts 100
solana program show $PROGRAM_ID
cp target/idl/wagerino.json ~/wagerino-tools/idl/wagerino.json
```
Checks: two `Finished` lines and no `Error`; `Program Id:` printed; `Authority: GYFD8TJSDr2ayb6vD8FRnq83DcH4Es6mT7ckptDDMhyz`.
If the deploy fails partway ("N write transactions failed"), run the `solana program close <buffer>` line it prints,
then rerun the deploy command.

### Upgrading later (lesson from v2.1)
A rebuilt binary can outgrow the program-data account. Before any upgrade:
`ls -l target/deploy/wagerino.so` vs `Data Length` in `solana program show`; if larger, run
`solana program extend <PROGRAM_ID> <extra_bytes>` first (rent is permanent), then deploy.
The buffer write needs ~6 SOL on the authority temporarily; it is refunded on completion.

## 4. Tools install (once)

```bash
cd ~/wagerino-tools && npm install
```

## 5. Initialize the platform (real USDC)

```bash
cd ~/wagerino-tools
export RPC_URL="$SOLANA_URL" WALLET=$AUTH IDL=idl/wagerino.json
node scripts/init-platform.js $USDC
```
Prints the platform JSON: `usdc` must be `EPjF…Dt1v`, `authority` your `GYFD8…` key, `maxRtpBps 9850`, `exposureBps 100`.
This is one-time and irreversible for this program ID (parameters only move within their bounded setter later).

## 6. Seed the flagship games (100 USDC each; max win per bet = 1 USDC)

```bash
cd ~/wagerino-tools
export RPC_URL="$SOLANA_URL" WALLET=$AUTH IDL=idl/wagerino.json
node scripts/create-game.js coin_flip "Coin Flip" 100 100
node scripts/create-game.js crash "Crash" 100 100
node scripts/create-game.js scratchy "Scratchy" 0 100
node scripts/create-game.js wheel "Wheel" 150 100
```
Arguments: template, name, creator margin in bps, shares bought at creation (≈ USDC into that game's vault).
Each prints `game <address> "<name>" rtp=<bps> mode=<0|1> vault=<address>`. Save those lines.

## 7. Cranker (second shell, on the build box for the beta)

```bash
. ~/src/ticket/scripts/env.sh
cd ~/wagerino-tools
node -e 'const {Keypair}=require("@solana/web3.js");const fs=require("fs");const k=Keypair.generate();fs.writeFileSync("cranker-beta.json",JSON.stringify(Array.from(k.secretKey)));console.log("cranker fee wallet:",k.publicKey.toBase58())'
```
Send **0.3 SOL** from Phantom to the printed address (it pays settlement fees; earns the settler reward in USDC). Then:

```bash
cp packages/cranker/config.example.json packages/cranker/config.json
nano packages/cranker/config.json
```
Set: `"rpcUrls": ["https://mainnet.helius-rpc.com/?api-key=<your-key>"]`, `"walletPath": "/root/wagerino-tools/cranker-beta.json"`,
leave `idlPath` as `../../idl/wagerino.json`. Save, then:

```bash
node packages/cranker/src/index.js
```
Expected: `wagerino-cranker v2 up. program=<PROGRAM_ID> ... usdc=EPjF…`, then `scan: 0 bets, 0 rounds, 0 markets`.
Leave it running.

## 8. Soak (third shell) — the actual proof

```bash
. ~/src/ticket/scripts/env.sh
cd ~/wagerino-tools
export RPC_URL="https://mainnet.helius-rpc.com/?api-key=<your-key>" WALLET=$HOME/wagerino-authority.json IDL=idl/wagerino.json
node scripts/soak.js 15
```
Bets 0.10–0.25 USDC at random across the four games, buys a few shares, opens the occasional round, and verifies
every `BetSettled` event against the local derivation. Watch both shells: the cranker logs `settled bet …`, the
soak logs `… verified=true`. **Pass criterion: it exits with `mismatches=0`.** Start with 15 minutes; then run
60; then leave it for a day.

What to report after the first run: the tail of the cranker log and the soak's final line. Any `skip …` or
`MISMATCH` line is a finding.

## 9. Markets smoke (after §8 is clean)

Create one short market on SOL/USD and let the cranker resolve it (needs ≥5 min duration and Pyth mainnet):
```bash
cd ~/wagerino-tools && export RPC_URL="$SOLANA_URL" WALLET=$AUTH IDL=idl/wagerino.json
node -e '
import("@wagerino/sdk").then(async ({ Wagerino }) => {
  const { load } = await import("./scripts/_env.js"); const { sdk, kp } = load();
  const feedId = Buffer.from("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", "hex"); // Pyth SOL/USD
  const now = Math.floor(Date.now()/1000);
  const { tx, market } = await sdk.createMarketTx(kp.publicKey, BigInt(now), { feedId, strike: 200_00000000n, exponent: -8, closeTs: now + 360, expiryTs: now + 420, resolveWindowSecs: 120, rtpBps: 9700, name: "SOL > 200?" });
  await sdk.send(tx);
  await sdk.send(await sdk.enterMarketTx(kp.publicKey, market, 1, 1_000_000n));
  await sdk.send(await sdk.enterMarketTx(kp.publicKey, market, 0, 1_000_000n));
  console.log("market", market.toBase58(), "expires in 7 min; watch the cranker");
});'
```
Both sides are you, so the payout just nets out minus rake — the point is watching `resolved market …` and
`claimed position …` appear in the cranker log.

## 10. Cranker on the VPS (replaces v1) — only after §8 and §9 are clean

```bash
sudo systemctl disable --now wager-cranker
sudo adduser --system --group --home /opt/wagerino-cranker cranker 2>/dev/null
sudo git clone https://github.com/wager-solana/Wagerino /opt/wagerino-cranker/app
cd /opt/wagerino-cranker/app && sudo npm install
sudo cp packages/cranker/config.example.json /opt/wagerino-cranker/config.json
sudo nano /opt/wagerino-cranker/config.json
```
Set `idlPath` to `/opt/wagerino-cranker/app/idl/wagerino.json` (the IDL must be in the repo), `rpcUrls` to two providers,
`walletPath` to `/opt/wagerino-cranker/cranker.json`. Then:
```bash
sudo node -e 'const {Keypair}=require("@solana/web3.js");const fs=require("fs");const k=Keypair.generate();fs.writeFileSync("/opt/wagerino-cranker/cranker.json",JSON.stringify(Array.from(k.secretKey)));console.log("fee wallet:",k.publicKey.toBase58())'
sudo chown -R cranker:cranker /opt/wagerino-cranker
sudo cp packages/cranker/wagerino-cranker.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now wagerino-cranker
journalctl -fu wagerino-cranker
```
Fund the printed fee wallet with 0.3 SOL. Then stop the beta cranker on the build box (Ctrl+C in shell 2).

## Rules of the private beta
- Only your wallets. No links, no LPs, no creators, no announcements.
- Keep the upgrade authority. This program ID may be replaced after the audit.
- Never point the CLI at mainnet with a key you didn't intend: `solana config get` before every deploy.
