# Verification record

## Contract and actual Tempo token

- Integration gate passed against live AlphaUSD: six-decimal metadata; ordinary SafeERC20 and memo round trips; expected memo receipt; native failed-batch approval/token rollback; 18-decimal ERC-4626 shell shares. Evidence: `deployments/probe.json`.
- Published vault deployed successfully using pinned Solidity 0.8.30 / Prague / optimizer 200.
- **35 live assertions passed**: draw and partial/full active repayment conserve NAV at the actual execution timestamp; allocation pays interest before principal; capacity reopens; overdue draw and queue processing produce reverted receipts; a distinct settlement payer resolves the matching batch; FIFO pays the investor exactly and burns escrow; full write-off reduces carrying value once; contractual debt freezes; partial/full recovery raises NAV once; default exposure clears and manager reapproval is required. Evidence: `deployments/live-verification.json`.
- **22 unit/fuzz tests passed**, including 256 fuzz cases for partial repayment NAV conservation.
- **Three stateful invariants passed** over 128 runs / 4,096 actions, zero handler reverts: NAV, principal exposure including written-off debt, and exact pending-request share escrow. Foundry reports these as one grouped test in addition to the 22 unit/fuzz tests.

## Application

- Financial queries share one five-second reference-block poller, with historical event filtering and address-safe previous-data display during refresh.
- TypeScript check and production build passed locally; the first independent GitHub Verify workflow also passed from a fresh checkout.
- Static export and GitHub Pages deployment passed; all five routes served successfully.
- Browser checks inspected overview, investor, borrower, manager, and settlement routes without wallet connection and loaded actual vault state.
- Investor payout history reconstructed after a full hosted-page reload, showing actual payout `500.000142` AlphaUSD for request #1.
- Settlement loan selection reconciled the second loan to its confirmed settlement receipt; the simulated evidence was separately labeled.
- Sixty-second selection displayed the short maturity warning and approximately $0.000205 projected interest. Standard 48-hour selection displayed approximately $0.591780 (integer-rounded contract projection).
- Read-only manager controls were disabled; actual manager wallet and recognized losses/recoveries were displayed.
- Desktop 1440×1000 and mobile 375×812 checks completed. Tables scroll within their containers; financial values remain contained. Narrow snapshot and static-export navigation label fixes followed inspection.
- Tempo Wallet opened its authorization popup; cancelling it displayed “User rejected the request” and restored the connect button. Native approval/action batches were signed and mined through the local testnet script actors.

## Remaining human rehearsal

Authenticated Tempo Wallet signing of each UI action, account switching, and ownership acceptance need a final rehearsal with your own browser-wallet accounts. Script credentials are intentionally absent from browser bundles. The presentation/product videos and portal submission are not claimed as completed; `docs/DEMO.md` supplies the timing and narration. Vercel publishing needs its account login; GitHub Pages hosts the working preview in the meantime.
