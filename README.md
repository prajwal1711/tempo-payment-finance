# Tempo Payment Finance

A working Tempo Moderato demonstration of unsecured revolving credit for a remittance company. Investors deposit AlphaUSD and receive transferable `tPF` shares. Approved borrowers finance settlement delays at 18% simple APR; a third-party settlement payer can repay the matching loan in one atomic transaction.

**Testnet only.** Northstar Remit, its underwriting evidence, and its card-settlement provider are fictional fixtures. All deployed financial activity uses actual test tokens and actual block timestamps.

## Run the application

Requires Node 22+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. Public reads work without a wallet; the checked-in deployment is already funded. Connect Tempo Wallet for signing. Use its testnet faucet to obtain AlphaUSD and PathUSD (fees).

| Route | Purpose |
|---|---|
| `/` | Live pool balance sheet, credit ledger, receipts |
| `/invest` | Deposit, transfer shares, queue/cancel exits, process FIFO |
| `/borrow` | Approved credit, draw, partial/full repayment |
| `/manage` | Borrower approval, pauses, overdue write-off, ownership handover |
| `/settlement` | Simulated evidence and atomic borrower/batch-linked repayment |

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

Then accept ownership on `/manage` from that wallet. The old manager retains authority until acceptance. The new manager can approve your borrower wallet in the UI. Alternatively, before handover:

```sh
pnpm manage approve 0xYOUR_BORROWER_WALLET 750 48
```

Repay the staged loan from any funded wallet on `/settlement` before demonstrating a new 600 AlphaUSD draw. The existing 750 AlphaUSD limit and 10% cash reserve still apply. Anyone can invest and anyone can repay; only approved borrowers can draw.

## Accounting and demo material

- [Accounting and contract interfaces](docs/ACCOUNTING.md)
- [Recording script and rehearsal checklist](docs/DEMO.md)
- [Deployment and operational notes](docs/DEPLOYMENT.md)
- [Implementation plan](PLAN.md)

Borrower pricing is **18% APR / 4.93 bps/day**, not investor APY. Share value reflects utilization, earnings, losses, and recoveries. All exits use a custom FIFO queue; this implementation does not claim ERC-7540 compliance.
