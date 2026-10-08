import { createPublicClient, http, type Address, type Abi } from "viem";
import { chain } from "./wallet";
import deployment from "./deployment.json";
import { vaultAbi } from "./vault-abi";

export const vaultAddress = deployment.vaultAddress as Address;
export const assetAddress = deployment.assetAddress as Address;
export const publicClient = createPublicClient({
  chain,
  transport: http(deployment.rpcUrl, {
    batch: true,
    timeout: 20_000,
    retryCount: 2,
  }),
});
export function readVault(
  name: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
) {
  return publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi as Abi,
    functionName: name,
    args,
    blockNumber,
  });
}
export function explorer(hash: string) {
  return `${deployment.explorerUrl}/tx/${hash}`;
}
