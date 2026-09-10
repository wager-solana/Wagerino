# Wagerino Skin SDK

A **skin** is a game front-end. It runs in a sandboxed iframe inside any Wagerino host (the official app, a creator's
own site, a Telegram mini-app). The host handles wallet, session balance, placing and settling bets, and the fairness
proof. The skin receives the outcome and renders it however it likes — reels, scratch foil, a rocket, a 3D scene.

## Contract
Host → skin messages (`window.postMessage`, `{ wagerino: 1, type, data }`):
| type | data |
|---|---|
| `init` | `{ game: { address, name, mode, rtpBps, table: [{multBps, prob}], minTargetBps, maxTargetBps }, platform: { minBet, exposureBps }, theme }` |
| `bet_placed` | `{ amount, targetBps }` — the bet is on-chain; start your suspense |
| `result` | `{ multBps, payout, amount, r1, r2, targetBps, seedHex, signature }` — play the theatre, then `WagerinoSkin.done()` |
| `reset` | — new round |

Skin → host: `ready {playerPaced}`, `set_target {targetBps}`, `status {text}`, `done`.

`r2` is a second random value from the same VRF draw; use `WagerinoSkin.prng(r2)` for cosmetic choices so the same bet
always replays identically (reel symbols, bounce path). The payout is decided by the on-chain row; presentation must be
consistent with it (a losing row must look like a loss).

## Develop against a live game
Open any game with `?skin=http://localhost:8000/` appended to test your skin against real bets in the official app.
Publish anywhere static (GitHub Pages, IPFS, Arweave). Registering a skin so creators can launch games on it is done
through `public/skins.json` today and on-chain metadata with royalties in program v2.3.

See `packages/app/public/skins/coinflip/` for a complete reference skin (~120 lines).
