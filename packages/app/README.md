# @wagerino/app

The Wagerino web app: Originals (Coin Flip, Crash, Plinko, Mines, Wheel, Diamonds), share market
("be the house"), live bets, and a Fairness panel that re-derives every settlement in the browser.
Static build, no backend, plain JavaScript.

## Run locally
```bash
cd packages/app
mkdir -p public/idl && cp ../../idl/wagerino.json public/idl/wagerino.json
cp public/config.json public/config.local.json 2>/dev/null; nano public/config.json   # rpcUrls
npm install && npm run dev -- --host
```

## Deploy (Cloudflare Workers static assets)
Project root directory: `packages/app`. Build command: `mkdir -p public/idl && cp ../../idl/wagerino.json public/idl/ && npm install && npm run build`.
Deploy command: `npx wrangler deploy`. Attach `wagerino.fun` as a custom domain.

## How a bet flows
1. One signature: `place_bet` escrows USDC and requests ORAO randomness.
2. The app polls the randomness account. A public cranker normally settles within seconds.
3. If no cranker has settled ~6 s after the randomness lands, the app asks you to sign `settle_bet` yourself.
4. The `BetSettled` event is fetched and the outcome is recomputed locally before it is shown.

Auto mode runs bets sequentially with the classic controls (count, on-win/on-loss adjust, stop on profit/loss).
Each bet needs one wallet confirmation; Solana has no session keys yet.
