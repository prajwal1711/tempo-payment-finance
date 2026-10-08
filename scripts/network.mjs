import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, encodeDeployData, encodeFunctionData, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { tempoModerato } from 'viem/chains';

export const ASSET = '0x20c0000000000000000000000000000000000001';
export const FEE_TOKEN = '0x20c0000000000000000000000000000000000000';
export const chain = tempoModerato.extend({ feeToken: FEE_TOKEN });
const rpc = process.env.TEMPO_RPC_URL || chain.rpcUrls.default.http[0];
export const publicClient = createPublicClient({ chain, transport: http(rpc, { timeout: 30_000, retryCount: 3 }) });
export function accountFor(role) {
  const key = process.env[`${role}_PRIVATE_KEY`];
  if (!key) throw new Error(`Missing ${role}_PRIVATE_KEY in .env.local`);
  return privateKeyToAccount(key);
}
export function walletFor(role) {
  return createWalletClient({ chain, account: accountFor(role), transport: http(rpc, { timeout: 30_000, retryCount: 3 }) });
}
export function artifact(name, file = name) {
  return JSON.parse(readFileSync(`contracts/out/${file}.sol/${name}.json`, 'utf8'));
}
export async function preflight() {
  const id = await publicClient.getChainId();
  if (id !== 42431) throw new Error(`Refusing non-Moderato chain ${id}`);
  const decimals = await publicClient.readContract({ address: ASSET, abi: erc20Abi, functionName: 'decimals' });
  const symbol = await publicClient.readContract({ address: ASSET, abi: erc20Abi, functionName: 'symbol' });
  if (decimals !== 6 || symbol.toLowerCase() !== 'alphausd') throw new Error(`Unexpected underlying ${symbol}/${decimals}`);
  return { chainId: id, symbol, decimals };
}
export async function fund(role) {
  const account = accountFor(role);
  const result = await publicClient.request({ method: 'tempo_fundAddress', params: [account.address] });
  if (Array.isArray(result)) for (const hash of result) await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Funded ${role}: ${account.address}`);
}
export async function receipt(hash, allowRevert = false) {
  const result = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (result.status !== 'success' && !allowRevert) throw new Error(`Transaction reverted: ${hash}`);
  return result;
}
export async function deploy(role, name, args, file = name) {
  const compiled = artifact(name, file);
  const data = encodeDeployData({ abi: compiled.abi, bytecode: compiled.bytecode.object, args });
  const estimate = await publicClient.estimateGas({ account: accountFor(role).address, data, feeToken: FEE_TOKEN });
  const hash = await walletFor(role).sendTransaction({
    data,
    feeToken: FEE_TOKEN,
    gas: estimate * 12n / 10n + 100_000n,
  });
  const result = await receipt(hash);
  if (!result.contractAddress) throw new Error(`Missing deployment address for ${name}`);
  console.log(`${name}: ${result.contractAddress} (${hash})`);
  return { address: result.contractAddress, hash, blockNumber: result.blockNumber, abi: compiled.abi };
}
export async function sendCalls(role, calls, options = {}) {
  const { allowRevert = false, ...transactionOptions } = options;
  const gas = allowRevert ? 12_000_000n : (await publicClient.estimateGas({ account: accountFor(role).address, calls, feeToken: FEE_TOKEN })) * 12n / 10n + 100_000n;
  const hash = await walletFor(role).sendTransaction({
    calls, feeToken: FEE_TOKEN, gas,
    validBefore: Math.floor(Date.now() / 1000) + 60,
    ...transactionOptions,
  });
  return receipt(hash, allowRevert);
}
export function contractCall(address, abi, functionName, args = []) {
  return { to: address, data: encodeFunctionData({ abi, functionName, args }) };
}
export function approval(address, amount) {
  return contractCall(ASSET, erc20Abi, 'approve', [address, amount]);
}
export function writeJson(path, data) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)}\n`);
}
