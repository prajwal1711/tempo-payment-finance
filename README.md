# Tempo Payment Finance

A working Tempo Moderato demonstration of unsecured revolving credit for a remittance company. Investors deposit AlphaUSD and receive transferable `tPF` shares. Approved borrowers finance settlement delays at 18% simple APR; a third-party settlement payer can repay the matching loan in one atomic transaction.

**Testnet only.** Northstar Remit, its underwriting evidence, and its card-settlement provider are fictional fixtures. All deployed financial activity uses actual test tokens and actual block timestamps.

**[Open the hosted demo](https://prajwal1711.github.io/tempo-payment-finance/) · [Source repository](https://github.com/prajwal1711/tempo-payment-finance)**

## Run the application

Requires Node 22+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. Public reads work without a wallet; the checked-in deployment is already funded. Connect Tempo Wallet for signing. Use its testnet faucet to obtain AlphaUSD and PathUSD (fees).

| Workspace | Routes | Purpose |
|---|---|---|
| Public tPF pool | `/` | Value per share, total assets across all investors, public loans and repayments |
| Investor | `/portfolio`, `/portfolio/withdrawals`, `/portfolio/activity` | Own held + queued position, deposits, share transfers, FIFO requests and history |
| Borrower | `/borrower`, `/borrower/loans`, `/borrower/settlements` | Connected borrower’s facility, debt servicing and simulated settlement records |
| Manager | `/manager`, `/manager/borrowers`, `/manager/loans`, `/manager/redemptions`, `/manager/settings` | Pool monitoring, borrower configuration, loss recognition, queue and ownership |

The workspace selector exposes eligible roles based on current contract state. Disabled configured borrowers retain loan-servicing access; pending owners can accept ownership in Settings. Public loan details allow any connected payer to repay or apply a borrower/batch-linked settlement payment.

**Explore demo** explicitly opens real demo-account data with a persistent read-only banner. It never substitutes demo balances for a connected wallet’s own holdings, and its transaction handler rejects mutations. Old `/invest`, `/borrow`, `/manage` and `/settlement` links redirect in the client, including under the GitHub Pages base path.

### UI and historical charts

The neutral black-and-white UI uses actual shadcn/ui Radix components and Recharts 3. The portfolio chart measures held plus queued shares at historical blocks. The pool chart separates value per tPF from aggregate pool assets, so capital inflows are not displayed as investment returns.

History uses real archive reads from deployment: hourly for 1D, six-hourly for 7D, and daily/adaptive sampling for All (at most 64 regular samples). Financial event blocks and their preceding blocks preserve deposits, payouts, losses, recoveries and escrow transitions. Event scans run in chunks with at most four concurrent requests; subsequent refreshes re-read the recent tail using an in-memory cursor. Chart math and tooltips retain bigint amounts; numbers are used only for drawing coordinates. Individual archive requests share a four-request limit and normal in-memory caching; the live endpoint follows the five-second common snapshot. Archive failures show gaps and a Retry action. Charts use UTC and never insert future or fixture values.

```sh
pnpm test:ui             # Pure formatting, sampling, escrow and workspace tests
pnpm verify:history      # Read-only checks against the existing deployed vault
GITHUB_PAGES=true pnpm build
```

`verify:history` checks the staged demo’s historical write-off, recovery, queued ownership and latest NAV. It sends no signed transactions and uses no private keys. The initial history load can take approximately 20–30 seconds while archive snapshots are read; later chart visits reuse memory caches.

## Deployed contract

- Network: Tempo Moderato, chain ID `42431`
- Vault / tPF: [`0xe26e1e6812d8423f3ad64acb1ddf2ad0f4984e1f`](https://explore.testnet.tempo.xyz/address/0xe26e1e6812d8423f3ad64acb1ddf2ad0f4984e1f)
- AlphaUSD: `0x20c0000000000000000000000000000000000001` (6 decimals)
- PathUSD fees: `0x20c0000000000000000000000000000000000000`
- tPF shares: 18 decimals; variable redemption value
- Deployment: `deployments/moderato.json`; frontend copy: `src/lib/deployment.json`
- Successful token integration evidence: `deployments/probe.json`
- End-to-end receipts and assertions: `deployments/live-verification.json`

There is one immutable vault, no proxy, database, or signing server. The manager has no pool-withdrawal or unbacked-share minting function.

## Contracts and verification

Install [Foundry](https://getfoundry.sh/) and initialize the pinned test library:

```sh
git submodule update --init --recursive
pnpm contracts:build
pnpm contracts:test
pnpm typecheck
pnpm build
```

Solidity `0.8.30`, EVM `prague`, optimizer 200; identical settings for probe, vault, and tests. OpenZeppelin is exactly `5.6.1`. Unit/fuzz and stateful invariant tests cover interest remainders, NAV conservation, credit limits, settlement resolution, FIFO, overdue protections, write-offs, recoveries, pauses, share transfers, and loss/donation edges.

The `accounts@0.18.5` publication contains unresolved `catalog:` dependencies. `pnpm-workspace.yaml` pins its Hono and MPPX dependencies to the versions in its upstream publishing commit; the requested Accounts version is retained. `pnpm peers check` passes.

## Reproduce a fresh testnet deployment

The probe is a mandatory runtime gate. It checks SafeERC20 transfers, native memo transfers, memo receipts, atomic approval/action rollback, and an ERC-4626 shell against actual AlphaUSD before vault deployment.

```sh
node scripts/create-demo-wallets.mjs
pnpm contracts:build
pnpm probe
pnpm deploy
pnpm seed
pnpm verify:live
```

The wallet-generation script creates an ignored, mode-600 `.env.local` and refuses to overwrite it. It funds only new testnet actors through Tempo's faucet. Never use these credentials for real assets. The application never reads the private-key variables; no credentials are in deployment manifests, ABI files, or fixtures.

`verify:live` assumes a freshly seeded vault with no active loans. It writes evidence after each operation, waits for real 60-second maturities, sends deliberately reverting overdue transactions, and leaves a normal 600 AlphaUSD / 48-hour loan staged after completing the loss and recovery scenario. To repeat the whole script, deploy a fresh vault rather than rerunning it on a partially progressed state.

## Use your own Tempo Wallet as manager or borrower

Read the public address from your connected Tempo Wallet. With local testnet deployment credentials:

```sh
pnpm manage nominate 0xYOUR_MANAGER_WALLET
```

Then accept ownership on `/manager/settings` from that wallet. The old manager retains authority until acceptance. The new manager can approve your borrower wallet in the UI. Alternatively, before handover:

```sh
pnpm manage approve 0xYOUR_BORROWER_WALLET 750 48
```

Repay the staged loan from any funded wallet through public loan details on `/` before demonstrating a new 600 AlphaUSD draw. The existing 750 AlphaUSD limit and 10% cash reserve still apply. Anyone can invest and anyone can repay; only approved borrowers can draw.

## Accounting and demo material

- [Verification record](docs/VERIFICATION.md)
- [Accounting and contract interfaces](docs/ACCOUNTING.md)
- [Recording script and rehearsal checklist](docs/DEMO.md)
- [Deployment and operational notes](docs/DEPLOYMENT.md)
- [Implementation plan](PLAN.md)

Borrower pricing is **18% APR / 4.93 bps/day**, not investor APY. Share value reflects utilization, earnings, losses, and recoveries. All exits use a custom FIFO queue; this implementation does not claim ERC-7540 compliance.

`pnpm verify:batches` performs read-only native-batch simulations for deposit, partial/full repayment, and settlement repayment against the existing vault. It confirms actual principal is unchanged afterward. Wallet authorization and receipt handling continue through the original transaction hook; a full newly signed wallet rehearsal is a separate manual check.
