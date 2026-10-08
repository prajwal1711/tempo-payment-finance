import { readFileSync } from 'node:fs';
import { isAddress, parseUnits, keccak256, toHex } from 'viem';
import { artifact, contractCall, sendCalls, accountFor, preflight } from './network.mjs';
const deployment = JSON.parse(readFileSync('deployments/moderato.json'));
const abi = artifact('PaymentFinanceVault').abi;
const [command, address, limit = '750', hours = '48'] = process.argv.slice(2);
if (!isAddress(address || '')) throw new Error('Usage: pnpm manage nominate <wallet> OR pnpm manage approve <borrower> [limit] [hours]');
await preflight();
let call;
if (command === 'nominate') call = contractCall(deployment.vaultAddress, abi, 'transferOwnership', [address]);
else if (command === 'approve') {
 const seconds = Number(hours) * 3600;
 if (!Number.isSafeInteger(seconds) || seconds < 60) throw new Error('Invalid tenor');
 call = contractCall(deployment.vaultAddress, abi, 'configureBorrower', [address, true, parseUnits(limit,6), BigInt(seconds), keccak256(toHex(JSON.stringify(JSON.parse(readFileSync('fixtures/borrower.json')))))]);
} else throw new Error('Unknown command; use nominate or approve');
const result = await sendCalls('MANAGER', [call]);
console.log(`${command} confirmed: ${deployment.explorerUrl}/tx/${result.transactionHash}`);
if (command === 'nominate') console.log('Connect the nominated wallet on /manage and accept ownership. The local manager retains ownership until that acceptance.');
