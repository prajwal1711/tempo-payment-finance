# Rehearsal and recording

## Before recording

1. Run `pnpm typecheck`, `pnpm contracts:test`, and `pnpm build`.
2. Complete Tempo Wallet connection in the popup. Fund each role with AlphaUSD and PathUSD.
3. Nominate and accept a manager wallet; approve your borrower with a 750 AlphaUSD limit and a 48-hour maximum. Use separate investor and settlement-provider wallets.
4. Repay existing staged active debt on `/settlement`. Clear pending exits. Confirm global overdue status is false.
5. Establish approximately 1,000 AlphaUSD NAV (500 each from two investors). On a previously used deployment, account for existing supply rather than duplicating these deposits. A fresh deployment gives the cleanest recording state.
6. Use new batch references for every loan; references are permanently unique per borrower.
7. Keep real interest and real timestamps. A 60-second demonstration tenor changes maturity, not APR. Record waiting separately and cut it honestly.

## Product demo, at most three minutes

| Time | Screen / action | Narration |
|---|---|---|
| 0:00–0:20 | Investor deposit and successful receipt | “Investors supply AlphaUSD and own transferable pool shares. Approval and deposit use one Tempo signature.” |
| 0:20–0:40 | Approved borrower and settlement record | “This simulated remittance company needs payout capital before card settlement arrives. Its approved line is 750 dollars.” |
| 0:40–1:00 | Draw 600 / 48h, explorer memo | “The borrower draws 600. Cash becomes a receivable; pool value is conserved. The transfer memo identifies this batch.” |
| 1:00–1:15 | Ticker and projection | “Interest is 18% annualized by elapsed time. Forty-eight hours costs about 59 cents; a few minutes produces tiny actual interest.” |
| 1:15–1:35 | Partial/full repayment | “Repayment covers interest first, then principal. Principal repayment reopens borrowing capacity.” |
| 1:35–1:50 | New 60s loan; cut to overdue | “This explicitly short testnet tenor lets us show delinquency using actual timestamps. New borrowing is blocked.” |
| 1:50–2:10 | Investor A queues exit | “Shares remain exposed to the pool while queued. Active overdue loans also block processing.” |
| 2:10–2:40 | Distinct settlement payer repays matching batch | “A simulated settlement provider pays the matching loan atomically. Cash and debt update together; no watcher credits an earlier transfer.” |
| 2:40–3:00 | Permissionless queue processing | “The queued shares burn and AlphaUSD returns to the investor. FIFO withdrawals take priority over new lending.” |

For the write-off clip, prepare a separate overdue loan before recording. Show manager recognition removing its carrying value, then repayment as recovery increasing current holders' NAV. Label the clip as a separate testnet scenario. Keep the primary demo within the portal limit.

## Presentation, two to three minutes

**Problem (30s):** Remittance payouts must happen before card/acquirer settlement. Weekends and holidays extend the prefunding gap; businesses need revolving liquidity for those hours.

**Product (40s):** Investors fund a tokenized pool; a manually approved business draws unsecured AlphaUSD under a principal limit. Interest is actual-time simple APR. Third-party settlement repayment resolves a known borrower and batch, restoring capacity.

**Tempo (35s):** Native batches combine approval and economic action under one signature. TIP-20 memos accompany disbursement and repayment for reconciliation. Fixed underlying, actual receipts, no signing server. Fee sponsorship is a future improvement.

**Accounting (30s):** Cash + active debt determine share value. Repayment does not double-count earnings. FIFO exits stay invested until processed. Delinquency freezes processing; explicit write-off recognizes losses; recoveries benefit current holders.

**Evidence and limits (30s):** Successful real-token probe, atomic rollback, live lifecycle and loss/recovery receipts, unit/fuzz and invariant verification. Underwriting and settlement documents are simulated; the demo does not integrate Visa, FX, or bank payouts. The investor token is ownership, not a promised 18% APY.

## Acceptance checklist

- [ ] Read-only balances and history load after a hard reload.
- [ ] AlphaUSD displays six decimals; tPF uses eighteen.
- [ ] Connected wallet and manager/borrower permissions match contract state.
- [ ] One authorization for approval plus deposit / partial / full / settlement repayment.
- [ ] No success until a successful receipt; explorer links open that receipt.
- [ ] Actual interest and projected tenor cost are distinct.
- [ ] Simulated provider/evidence and 60-second tenor are visible labels.
- [ ] Overdue rejection occurs before adding the redemption request.
- [ ] Investor payout and share burn match actual receipts.
- [ ] Separate write-off/recovery clip uses real transactions.

Confirm the portal's exact October 12 cutoff and upload on October 11. Submission and recording with your authenticated wallets remain human actions; the repository supplies the scripts, screens, receipts, and narration for rehearsal.
