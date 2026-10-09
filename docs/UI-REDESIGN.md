# UI redesign verification

Implemented October 9, 2026. The deployed vault, ABI, loan economics, and demo financial state are unchanged.

## Delivered

- Neutral shadcn/ui Radix components with system typography, Recharts 3, responsive sidebar and accessible dialogs/mobile sheets.
- Investor, borrower and manager workspaces; eligibility comes from current contract state. An explicit read-only demo identifies its selected account and rejects mutations in the transaction hook.
- Personal position value includes held and queued shares. Public pool assets, per-share value, borrower debt and asset/token units are labeled distinctly.
- Historical block reads with four concurrent archive requests, UTC sampling, financial-event boundaries, accurate bigint values, visible gaps/retry and a shared live snapshot. No server or persistent event cache.
- Deposits and repayments retain native atomic calls, quote bounds and receipt checks. Public loan details preserve third-party settlement payment access.
- Static-export-compatible routes and client redirects for the original URLs.

## Evidence

- `pnpm test:ui`: nine tests passed for asset/share precision, combined queued ownership, time sampling, event boundaries, account filtering, interest, UTC dates and workspace permissions.
- `pnpm contracts:test`: 23 tests passed, including the stateful invariant suite (128 runs / 4,096 calls).
- `pnpm verify:history`: 32 historical pool and wallet points checked without gaps; actual write-off/recovery effects, escrowed ownership and latest NAV matched direct reads.
- `pnpm verify:batches`: deposit, partial repayment, full repayment and settlement-linked repayment each simulated two successful calls against the existing testnet vault. Actual principal was unchanged afterward.
- Normal Next production build and GitHub Pages static export completed with all 16 application routes plus the not-found page.
- Browser checks covered disconnected portfolio, explicit demo, borrower loan details, settlement payer/bound confirmation, manager configuration permissions, mobile sheets/navigation, chart rendering and absence of horizontal overflow at 375px.
- The `/invest/` legacy URL redirected correctly to `/portfolio/` under the production `/tempo-payment-finance` base path.

Archive requests in JSON-RPC batches initially produced intermittent unknown-RPC errors at otherwise readable blocks. Individual archive requests with one additional retry produced complete verified history. Current financial reads retain the original client.

## Remaining verification limits

New wallet signatures were not requested during this redesign. Live native batches were simulated read-only; signing and receipt handling use the preserved wallet transaction path. Newly signed end-to-end wallet rehearsal remains a manual check. Historical availability depends on the public RPC and failures are shown as gaps.

## Selective transparency-dashboard additions

The public tPF page now uses compact headline metrics, an asset allocation bar with precise cash/principal/interest amounts, a withdrawal liquidity summary, historical asset composition, and cumulative lending activity. These borrow the useful information relationships from the Accountable dashboard while retaining the neutral visual system and existing workspaces.

Principal repayments are summed from `LoanRepaid` only; the additional recovery event is not counted again. Queue estimates remain variable, and the status distinguishes an overdue block from insufficient cash at the FIFO head. No collateralization or independent-verification claim is introduced.

Browser review showed 1,850 AlphaUSD originated across four loans, 1,250 AlphaUSD of principal repaid, one active 600 AlphaUSD loan, and no pending withdrawals. TypeScript, normal production build, and GitHub Pages export completed successfully. Event history now uses individual RPC requests, paced workers and bounded rate-limit retries after the actual endpoint rejected bursts of range queries.
