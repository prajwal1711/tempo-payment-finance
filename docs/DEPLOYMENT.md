# Deployment and operations

## Local and hosted application

`pnpm dev` opens the development server at http://127.0.0.1:3000. `pnpm build` creates a production build; `pnpm start` serves it locally. The frontend reads the checked-in Moderato manifest and public RPC. It needs no secrets or environment variables in Vercel.

For Vercel, import this repository with the Next.js preset, or run:

```sh
vercel --prod
```

If an expired `VERCEL_TOKEN` is set in your shell, remove it for the command (`env -u VERCEL_TOKEN vercel --prod`) and complete CLI sign-in. Add no private-key environment variables to the hosting project.

## Hosted preview

The published preview is https://prajwal1711.github.io/tempo-payment-finance/. GitHub Pages was used while Vercel authentication was unavailable. It serves the same client application and live vault without a signing backend. The Pages workflow sets `GITHUB_PAGES=true` for a static export and repository base path; normal builds retain the Vercel Next.js configuration.

## Compiler and dependencies

`contracts/foundry.toml` pins compiler 0.8.30, Prague and optimizer 200. `scripts/forge.mjs` uses `.tooling/forge` if present, otherwise your installed forge. The forge-std submodule is pinned to v1.15.0's commit. Application dependencies and upstream Accounts publishing fixes are pinned in the pnpm lockfile.

`pnpm deploy` requires `deployments/probe.json` containing successful receipt evidence for the same chain and asset. It writes the deployment transaction, constructor configuration, compiler settings, public role addresses, frontend ABI, and frontend manifest. All sends estimate Tempo gas with a buffer; all economic batches expire in 60 seconds and receipt status is checked.

The first attempted full deployment hit a fixed 12-million gas cap. Its reverted receipt is not the published deployment. The successful deployment uses the network estimate; runtime bytecode is below the EIP-170 size limit.

## Evidence

- Probe addresses and metadata / transfer / rollback assertions: `deployments/probe.json`
- Actual deployment and constructor arguments: `deployments/moderato.json`
- Borrower config and seed deposit receipts: `deployments/seed.json`
- Full live lifecycle / loss recovery assertions: `deployments/live-verification.json`
- Source and tests: `contracts/src`, `contracts/test`

The explorer has the actual transaction and bytecode. A published repository provides the source and reproducible compiler settings; an explorer source-verification badge is separate and should not be claimed unless its verifier confirms it.

## Account handling

`.env.local` holds only newly generated testnet deployment credentials and is ignored by git. The browser uses Tempo Wallet; local private keys are never imported into the application. Ownership can be nominated with `pnpm manage nominate ADDRESS`; acceptance requires that wallet on `/manage`. Approval can be performed before handover with `pnpm manage approve ADDRESS LIMIT HOURS`.

The pre-seeded local testnet wallets are script actors, not automatically connected browser accounts. For a browser recording, use your own Tempo Wallet accounts, nominate a manager, approve a borrower, and fund investors and the settlement payer through the wallet faucet.

## RPC and consistency

Snapshots group economic reads at one block number. Pool/position/loan queries refresh every five seconds; logs refresh every fifteen seconds and after confirmed mutations. Events are reconstructed from deployment with 5,000-block chunks and in-memory caching. No persistent event cache, indexer, or signing backend is needed at demo volume.

The frontend simulates the complete native batch before requesting one wallet authorization. Deposits use a 0.5% minimum-share bound; full payments approve a bounded 60-second interest allowance and pull only exact execution-time debt. Wallet/network changes, failed simulation, rejected signatures, expired quotes, RPC errors and reverted receipts surface without a false success state.
