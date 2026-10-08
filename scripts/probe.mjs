import assert from 'node:assert/strict';
import { erc20Abi, keccak256, toHex, parseEventLogs } from 'viem';
import { ASSET, publicClient, accountFor, preflight, fund, deploy, sendCalls, approval, contractCall, writeJson } from './network.mjs';

const metadata = await preflight();
await fund('MANAGER');
const account = accountFor('MANAGER');
const probe = await deploy('MANAGER', 'IntegrationProbe', [ASSET], 'IntegrationProbe');
const amount = 1_000_000n;
const balance = () => publicClient.readContract({ address: ASSET, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
const readAllowance = () => publicClient.readContract({ address: ASSET, abi: erc20Abi, functionName: 'allowance', args: [account.address, probe.address] });
const initialBalance = await balance();
const plain = await sendCalls('MANAGER', [approval(probe.address, amount), contractCall(probe.address, probe.abi, 'roundTrip', [amount])]);
assert.equal(await balance(), initialBalance);
assert.equal(await readAllowance(), 0n);

const memo = keccak256(toHex('tempo-payment-finance:integration-probe'));
const memoReceipt = await sendCalls('MANAGER', [approval(probe.address, amount), contractCall(probe.address, probe.abi, 'memoRoundTrip', [amount, memo])]);
const memoEvents = parseEventLogs({ abi: [{ type: 'event', name: 'TransferWithMemo', inputs: [
  { name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true },
  { name: 'amount', type: 'uint256', indexed: false }, { name: 'memo', type: 'bytes32', indexed: true },
] }], logs: memoReceipt.logs });
assert.equal(memoEvents.filter(event => event.args.memo === memo).length, 2);
assert.equal(await balance(), initialBalance);

const rollback = await sendCalls('MANAGER', [approval(probe.address, amount), contractCall(probe.address, probe.abi, 'roundTrip', [amount]), contractCall(probe.address, probe.abi, 'fail')], { allowRevert: true });
assert.equal(rollback.status, 'reverted');
assert.equal(await readAllowance(), 0n);
assert.equal(await balance(), initialBalance);

const shell = await deploy('MANAGER', 'VaultShell', [ASSET], 'IntegrationProbe');
const deposit = await sendCalls('MANAGER', [approval(shell.address, amount), contractCall(shell.address, shell.abi, 'deposit', [amount, account.address])]);
assert.equal(await publicClient.readContract({ address: shell.address, abi: shell.abi, functionName: 'decimals' }), 18);
assert.equal(await publicClient.readContract({ address: shell.address, abi: shell.abi, functionName: 'balanceOf', args: [account.address] }), 10n ** 18n);
assert.equal(await publicClient.readContract({ address: ASSET, abi: erc20Abi, functionName: 'balanceOf', args: [shell.address] }), amount);
const withdraw = await sendCalls('MANAGER', [contractCall(shell.address, shell.abi, 'redeem', [10n ** 18n, account.address, account.address])]);
assert.equal(await balance(), initialBalance);

writeJson('deployments/probe.json', {
  verifiedAt: new Date().toISOString(), network: metadata, compiler: '0.8.30', evmVersion: 'prague',
  safeERC20Version: '5.6.1', probe: probe.address, shell: shell.address, memo,
  receipts: { ordinaryRoundTrip: plain.transactionHash, memoRoundTrip: memoReceipt.transactionHash,
    atomicRollback: rollback.transactionHash, shellDeposit: deposit.transactionHash, shellRedeem: withdraw.transactionHash },
  assertions: ['six-decimal AlphaUSD', 'SafeERC20 exact round trip', 'memo exact round trip', 'two matching memo events',
    'atomic rollback of approval and transfers', '18-decimal ERC4626 shares', 'exact shell deposit and redemption'],
});
console.log('PASS: live AlphaUSD, SafeERC20, memos, atomic rollback, and ERC4626 shell. Evidence: deployments/probe.json');
