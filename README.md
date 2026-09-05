# Wagerino

Create-your-own-casino on Solana. This repository holds the SDK, the permissionless settlement
cranker, and the operator tooling for the Wagerino v2 program (`7Y5zTYELzMb6pQsco1fomUekYR9HnUsDPcyh7NHfKq8e`).

Plain-JS tooling for the Wagerino v2 program: the SDK (used by the app and by anyone building on the
platform), the cranker (permissionless settlement bot that earns the settler reward), and ops scripts.

- `packages/sdk` — `@wagerino/sdk`: reads, quotes (max bet, share buy/sell, NAV), transaction builders for
  all 22 instructions, event subscriptions, and local verification of settlements.
- `packages/cranker` — event-driven settlement for bets, rounds (request → settle → claim), and price
  markets (Pyth pull update + resolve in one transaction, claims), with RPC failover.
- `scripts/` — `init-platform`, `create-game`, `soak` (randomized load + verification).
- `idl/wagerino.json` — the deployed program's IDL; every tool reads the program ID from it.

## Cranker config (`packages/cranker/config.json`)

| field | meaning |
|---|---|
| `idlPath` | path to the IDL, relative to the config file (`../../idl/wagerino.json` when the config sits in `packages/cranker/`; use an absolute path on a server) |
| `rpcUrls` | ordered list of Solana RPC endpoints; the cranker fails over to the next after 3 consecutive errors |
| `walletPath` | keypair that pays fees and receives the settler reward; a throwaway wallet with ~0.3 SOL |
| `hermesUrl` | Pyth Hermes endpoint (only used with `pythApiKey`) |
| `pythApiKey` | optional; leave empty. Markets on Pyth's sponsored feeds resolve from on-chain push-feed accounts with no key |
| `pollMs` | settle-check interval for known items (default 2000) |
| `scanMs` | full reconciliation scan interval (default 30000) |
| `minBetForSettle` | skip settling bets below this stake in USDC base units (0 = settle everything) |

Running a cranker requires no permission from anyone; it earns the on-chain settler reward on every bet, round, and market it settles.

See `MAINNET-BETA.md` for the end-to-end private-beta runbook.
