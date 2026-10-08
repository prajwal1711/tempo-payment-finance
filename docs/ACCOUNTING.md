# Accounting and contract behavior

## Asset and ownership

`PaymentFinanceVault` is both the ERC-4626-derived pool and its ERC-20 share token. AlphaUSD has 6 decimals; `_decimalsOffset() = 12` gives tPF 18 decimals. OpenZeppelin's virtual assets/shares and rounding remain intact. Direct public transfers of shares to the vault are rejected; redemption escrow uses internal transfers.

NAV is cash + outstanding active principal + accrued active interest. Written-off debt has zero carrying value, but remains contractually repayable. Queued shares remain in total supply and are valued at processing time.

| Mutation | NAV treatment |
|---|---|
| Draw | Cash becomes principal receivable; unchanged NAV |
| Interest | Active receivable increases NAV |
| Active repayment | Receivable becomes cash; no duplicate income |
| Write-off | Full principal + accrued interest removed |
| Recovery | Cash and NAV increase once |
| Donation | Cash increases NAV |
| Exit | Shares burned and their current asset value paid |

## Interest

Simple 18% APR, ACT/365, per actual block timestamp. Denominator `10_000 * 31_536_000`.

```
numerator = principalOutstanding * 1800 * elapsed + accrualRemainder
interestAdded = numerator / denominator
remainder = numerator % denominator
```

Checkpoints run before principal changes. Interest is never capitalized. Partial repayment carries the remainder and pays accrued interest before principal. Full settlement discards the sub-base-unit remainder. Written-off debt freezes accrual; active overdue debt continues at the same APR.

At 600 AlphaUSD, expected cost is approximately $0.000205 in 60 seconds, $0.295890 in 24 hours, and $0.591781 in 48 hours. The UI's between-block ticker is explicitly estimated; execution-time contract debt determines payment.

## Credit

Manager config: enabled, principal limit, maximum tenor, diligence hash. Lower limits and new tenors affect future draws. Exposure includes active and written-off outstanding principal.

Draw constraints: approved borrower, no unresolved default, draws enabled, no borrower overdue loan, no pending redemptions, positive principal and unused nonzero permanent batch hash, approved tenor of at least 60 seconds, at most 32 global / 8 borrower active loans, limit respected, and post-draw cash at least ceil(pre-draw NAV / 10).

Blocking precedence: approval/default → pause → borrower overdue → pending redemptions → request validity / loan limits → credit limit → liquidity reserve. Availability and draw share the borrower restriction and liquidity helpers; availability describes maximum capacity rather than validating a specific reference or tenor.

Loans use swap-and-pop bounded active arrays, permanent historical mappings, and monotonic IDs beginning at one.

## Repayment and reconciliation

- `repay(id, amount)`: exact nonzero amount not exceeding debt.
- `repayAll(id, maximum)`: execution-time full debt within a caller bound.
- `repaySettlement(borrower, batchRef, maximum)`: resolves and fully repays the matching debt.

Any payer may repay. Tokens are pulled using `transferFromWithMemo`; debt and payment move atomically. Repayment never relies on an event watcher crediting a previous transfer. Only principal repayment restores principal capacity. TIP-20 memos identify batches and do not establish commercial settlement evidence.

## Delinquency, loss and recovery

Overdue means active debt and `block.timestamp > dueAt`; the exact dueAt boundary is not overdue. Global overdue debt blocks queue processing; borrower-specific overdue debt blocks that borrower's draws. Requests, cancellations, repayment and share transfers remain possible.

Manager-only `writeOff(id, reasonHash)` requires an overdue active loan. It freezes full contractual debt, removes the active carrying value, disables the borrower, and records unresolved default. Recognition is once only. Subsequent payments are recoveries; they benefit current holders. Full recovery clears default exposure but leaves the borrower disabled until fresh manager approval.

## Exits

`maxWithdraw` and `maxRedeem` are zero; positive standard instant exits fail. Previews remain usable. Custom queued exits are not ERC-7540.

Requests escrow at least 10 whole tPF, one pending per wallet. Cancellation is owner-only. Processing is permissionless and examines 1–10 entries, including cancelled entries. The head must be filled completely at current NAV or processing stops. No lending reserve applies to payouts. Transfer failure reverts all changes in the transaction; the owner may cancel. Burning zero-value shares is allowed after full loss, but new deposits with outstanding supply and zero NAV are blocked.

## Permissions and limitations

Ownable2Step controls borrower configuration, independent deposit/draw pauses and write-offs. Repayment, recovery, queue requests/cancellation and share transfers survive these pauses. Reentrancy guards cover deposit/mint asset movement and all custom economic entrypoints.

Unsecured debt is carried at face value until recognized loss. A missing manager can keep exits blocked during delinquency. Withdrawal priority can stop further lending even with the minimum request. Exited investors have no subsequent recovery rights. Transfer policies or paused AlphaUSD can prevent transfers; the contract does not bypass token policy. Underwriting and expected settlement fixtures are descriptive evidence, never authoritative accounting.
