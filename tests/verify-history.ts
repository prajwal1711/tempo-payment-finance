import assert from "node:assert/strict";
import { parseEventLogs, type Abi, type Address } from "viem";
import { publicClient, readVault, vaultAddress } from "../src/lib/chain";
import { vaultAbi } from "../src/lib/vault-abi";
import deployment from "../src/lib/deployment.json";
import { fetchHistory } from "../src/lib/history";
import type { Activity, Snapshot } from "../src/lib/types";
async function main() {
  const first = BigInt(deployment.deploymentBlock);
  const logs = await publicClient.getLogs({
    address: vaultAddress,
    fromBlock: first,
    toBlock: first + 1500n,
  });
  const events = parseEventLogs({
    abi: vaultAbi as Abi,
    logs,
    strict: false,
  }).map((log) => ({
    eventName: log.eventName,
    args: log.args,
    transactionHash: log.transactionHash!,
    blockNumber: log.blockNumber!,
    logIndex: log.logIndex!,
  })) as Activity[];
  const latest = await publicClient.getBlock();
  const started = Date.now();
  const pool = await fetchHistory("All", latest, events);
  console.log(
    `Pool history: ${pool.length} points, ${pool.filter((p) => p.nav === null).length} gaps, ${(Date.now() - started) / 1000}s`,
  );
  assert.ok(pool.length > 2);
  console.log(
    pool
      .filter((p) => p.nav === null)
      .map((p) => ({ block: String(p.blockNumber), error: p.error })),
  );
  assert.equal(
    pool.filter((p) => p.nav === null).length,
    0,
    "Expected historical pool snapshots to be readable",
  );
  const loss = events.find((e) => e.eventName === "LoanWrittenOff")!;
  const beforeLoss = pool.find((p) => p.blockNumber === loss.blockNumber - 1n)!;
  const afterLoss = pool.find((p) => p.blockNumber === loss.blockNumber)!;
  assert.ok(
    beforeLoss.nav! > afterLoss.nav!,
    "Write-off lowers historical NAV",
  );
  assert.ok(
    beforeLoss.sharePrice! > afterLoss.sharePrice!,
    "Write-off lowers share price",
  );
  const recovery = events.find((e) => e.eventName === "LoanRecovered")!;
  assert.ok(
    pool.find((p) => p.blockNumber === recovery.blockNumber)!.nav! >
      pool.find((p) => p.blockNumber === recovery.blockNumber - 1n)!.nav!,
    "Recovery raises historical NAV",
  );
  const snapshots = (await readVault(
    "getPoolSnapshot",
    [],
    latest.number,
  )) as Snapshot;
  assert.equal(pool.at(-1)!.nav, snapshots.nav);
  const wallet = await fetchHistory(
    "All",
    latest,
    events,
    deployment.investorAAddress as Address,
  );
  assert.equal(
    wallet.filter((p) => p.nav === null).length,
    0,
    "Expected wallet history to be readable",
  );
  const request = events.find((e) => e.eventName === "RedemptionRequested")!;
  const preQueue = wallet.find(
    (p) => p.blockNumber === request.blockNumber - 1n,
  )!;
  const queued = wallet.find((p) => p.blockNumber === request.blockNumber)!;
  assert.equal(
    preQueue.heldShares! + preQueue.queuedShares!,
    queued.heldShares! + queued.queuedShares!,
  );
  assert.ok(
    queued.positionValue! >= preQueue.positionValue!,
    "Escrow must not look like a loss",
  );
  console.log(
    `Wallet history: ${wallet.length} points; FIFO escrow, write-off, recovery and latest NAV verified against real blocks.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
