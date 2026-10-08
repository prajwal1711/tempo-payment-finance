import { readFileSync, writeFileSync } from 'node:fs';
import { ASSET, FEE_TOKEN, publicClient, accountFor, preflight, deploy, artifact, writeJson } from './network.mjs';

await preflight();
const probe = JSON.parse(readFileSync('deployments/probe.json', 'utf8'));
if (probe.network.chainId !== 42431 || probe.safeERC20Version !== '5.6.1') throw new Error('Integration gate evidence does not match this build');
for (const [name, hash] of Object.entries(probe.receipts)) {
  const result = await publicClient.getTransactionReceipt({ hash });
  if (result.status !== (name === 'atomicRollback' ? 'reverted' : 'success')) throw new Error(`Invalid probe receipt: ${name}`);
}
const manager = accountFor('MANAGER');
const result = await deploy('MANAGER', 'PaymentFinanceVault', [ASSET, manager.address]);
const manifest = {
  deployed: true, chainId: 42431, rpcUrl: 'https://rpc.moderato.tempo.xyz',
  explorerUrl: 'https://explore.testnet.tempo.xyz', vaultAddress: result.address, assetAddress: ASSET,
  feeTokenAddress: FEE_TOKEN, assetDecimals: 6, shareDecimals: 18,
  deploymentBlock: result.blockNumber, deploymentTransaction: result.hash,
  managerAddress: manager.address, demoBorrowerAddress: accountFor('BORROWER').address,
  demoSettlementProviderAddress: accountFor('SETTLEMENT').address,
  investorAAddress: accountFor('INVESTOR_A').address, investorBAddress: accountFor('INVESTOR_B').address,
  contractVersion: '0.1.0', constructorArguments: [ASSET, accountFor('MANAGER').address], optimizer: { enabled: true, runs: 200 }, compiler: '0.8.30', evmVersion: 'prague', deployedAt: new Date().toISOString(),
};
// An authenticated RPC is deployment-only; do not publish its credential in the web bundle.
writeJson('deployments/moderato.json', manifest);
writeJson('src/lib/deployment.json', { ...manifest, rpcUrl: 'https://rpc.moderato.tempo.xyz' });
const abi = artifact('PaymentFinanceVault').abi;
writeFileSync('src/lib/vault-abi.ts', `// Generated from the Solidity build. Run pnpm deploy after contract changes.\nexport const vaultAbi = ${JSON.stringify(abi, null, 2)} as const;\n`);
console.log('Deployment manifest and frontend ABI generated.');
