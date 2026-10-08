import { existsSync, readFileSync } from 'node:fs';
import { keccak256, toHex } from 'viem';
import { accountFor, artifact, preflight, fund, sendCalls, approval, contractCall, writeJson } from './network.mjs';

await preflight();
const manifest = JSON.parse(readFileSync('deployments/moderato.json', 'utf8'));
if (existsSync('deployments/seed.json')) {
  const previous = JSON.parse(readFileSync('deployments/seed.json', 'utf8'));
  if (previous.vaultAddress.toLowerCase() === manifest.vaultAddress.toLowerCase()) {
    console.log('This deployment is already seeded; preserved its current state.'); process.exit(0);
  }
}
const abi = artifact('PaymentFinanceVault').abi;
for (const role of ['INVESTOR_A', 'INVESTOR_B', 'BORROWER', 'SETTLEMENT']) await fund(role);
const diligenceHash = keccak256(toHex(JSON.stringify(JSON.parse(readFileSync('fixtures/borrower.json', 'utf8')))));
const configured = await sendCalls('MANAGER', [contractCall(manifest.vaultAddress, abi, 'configureBorrower', [accountFor('BORROWER').address, true, 750_000_000n, 172800n, diligenceHash])]);
const receipts = { approval: configured.transactionHash };
for (const role of ['INVESTOR_A', 'INVESTOR_B']) {
  const result = await sendCalls(role, [approval(manifest.vaultAddress, 500_000_000n), contractCall(manifest.vaultAddress, abi, 'depositWithMinShares', [500_000_000n, accountFor(role).address, 500n * 10n ** 18n])]);
  receipts[role] = result.transactionHash;
}
writeJson('deployments/seed.json', { vaultAddress: manifest.vaultAddress, seededAt: new Date().toISOString(), diligenceHash, receipts });
console.log('PASS: borrower approved at 750 AlphaUSD; two atomic 500 AlphaUSD investor deposits.');
