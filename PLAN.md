# Tempo Payment Finance — implementation plan

Updated October 8, 2026 from the final approved technical plan.

## Deliverable

Unsecured revolving AlphaUSD working-capital credit to an approved remittance company on Tempo Moderato. Investors deposit, own transferable tPF shares, participate in elapsed-time earnings and recognized losses, and exit through a custom FIFO queue. A separate simulated settlement payer repays the matching borrower/batch atomically.

## Fixed implementation decisions

| Item | Value |
|---|---|
| Chain | Tempo Moderato 42431 |
| Asset | Actual AlphaUSD TIP-20, six decimals |
| Shares | Payment Finance Vault Share / tPF, eighteen decimals |
| Contract | One immutable PaymentFinanceVault; ERC4626, Ownable2Step, ReentrancyGuard |
| Compiler | Solidity 0.8.30, Prague, optimizer 200 |
| Library | OpenZeppelin 5.6.1; virtual asset/share protections preserved |
| Rate | 18% simple APR, ACT/365, actual block timestamps |
| Tenor | 48 hours; explicitly labeled 60-second demonstration option |
| Credit | Manager approval and principal limit; unsecured |
| Fees | Zero protocol fee; PathUSD network fees, sponsorship deferred |
| Reserve | 10% of pre-draw NAV, rounded up |
| Exits | Custom FIFO, no positive instant ERC-4626 exits; no ERC-7540 claim |
| Request size | At least 10 tPF, one pending request per wallet |
| Processing | At most ten examined entries; whole head fills only |
| Delinquency | Borrower draws blocked; all queue processing blocked by any active overdue loan |
| Ledger bounds | 32 global / 8 borrower active loans |
| References | Permanent unique borrower/batch mapping; TIP-20 draw/payment memos |
| Frontend | Next.js 16 / React 19 / TypeScript / viem 2.57.4 / Wagmi 3.7.7 / Accounts 0.18.5 / TanStack Query 5 / Tailwind |
| Backend | None; public reads and wallet-native atomic calls |
| Hosting target | Vercel |

## Gate and accounting

Before the credit ledger, obtain actual AlphaUSD metadata and successful SafeERC20/memo round-trip receipts, native approval/action rollback, and ERC-4626 shell deposits. The checked-in probe evidence passes this gate.

NAV = cash + active principal + current active interest. Draw and active repayment conserve NAV at the same timestamp. Checkpoint before principal changes, pay interest first, carry fractional remainders, never compound, freeze written-off debt. Full overdue manager write-offs remove carrying value once; cash recovery increases NAV once and benefits current holders.

Deposits use minimum-share bounds. Queue requests escrow shares without changing supply or reserving fixed-dollar liabilities. Cancellation returns shares. Delinquent processing resumes after repayment or full write-off clears every active overdue loan. Full recovery still requires manager reapproval for future borrowing.

## UI and transactions

Implement `/`, `/invest`, `/borrow`, `/manage`, `/settlement`. Read financial state without connection; group related reads at one block; refresh every five seconds and after confirmed changes. Reconstruct event history from deployment with chunked log queries and in-memory caching.

Tempo Wallet signs native calls batches: approve + bounded deposit, approve + partial repayment, approve + exact full repayment, and approve + borrower/batch settlement repayment. Simulate the complete batch, validate current account/chain, use a 60-second validity window, await successful receipts, then refresh. Queue creation and processing remain distinct actions.

Explain the simulated settlement gap and fictional evidence. Show six-decimal actual interest separately from the 48-hour projection. Display borrower APR / bps/day without promising investor APY. Show cash, principal, NAV, supply, losses, recoveries, queue restrictions and role permissions.

## Verification and delivery

- Real token probe and atomic rollback.
- Focused unit/fuzz tests and stateful exposure/NAV/escrow invariants.
- Live testnet deposit → draw → partial/full repay → restored credit → second draw → actual overdue restrictions → queued exit → separate payer settlement repayment → investor payout.
- Separate actual overdue write-off → lower NAV → partial/full recovery → higher NAV scenario.
- Production build, read-only UI, wallet connection, responsive layout and event reload checks.
- Publish source/deployment artifacts, host application, supply rehearsal and recording material.

October 8: integration gate, functioning contract and UI. October 9: full normal flow and queue. October 10: settlement/loss verification and hosting. October 11: feature freeze, rehearsal, presentation/demo recording and submission. October 12: buffer; confirm exact portal cutoff.

## Demo ordering

Deposit; approved borrower and settlement evidence; 600 AlphaUSD draw; tiny actual interest and ~$0.59 48-hour cost; repay; new 60-second batch; show overdue draw block; queue investor exit; show overdue processing block; separate settlement-provider repayment; process investor payout. A separate prepared clip shows write-off and recovery. Waiting and account switching may be edited honestly; interest and receipts remain real.

## Explicit limitations

Fixtures do not verify commercial settlement or underwriting. Active debt remains at face value until recognized loss. A missing manager may keep investors waiting during delinquency. Withdrawal priority can suspend lending. Former holders have no subsequent recovery rights. No FX, bank/payment-network execution, automated underwriting, secondary market, governance/reward token, or production design is included.

See `README.md`, `docs/ACCOUNTING.md`, `docs/DEPLOYMENT.md`, and `docs/DEMO.md` for the implemented interfaces and operation instructions.
