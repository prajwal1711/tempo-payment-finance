"use client";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, type Abi, type Address } from "viem";
import { vaultAbi } from "./vault-abi";
import { publicClient, vaultAddress } from "./chain";
import deployment from "./deployment.json";
import { useActivity, usePool, usePosition, useSnapshotBlock } from "./hooks";
import type { Snapshot, Redemption } from "./types";
import {
  combinedShares,
  eventBlocks,
  sampleTimes,
  type HistoryRange,
} from "./history-core";
export type HistoryPoint = {
  blockNumber: bigint;
  timestamp: bigint;
  nav: bigint | null;
  cash: bigint | null;
  principal: bigint | null;
  interest: bigint | null;
  supply: bigint | null;
  error?: string;
  sharePrice: bigint | null;
  heldShares?: bigint;
  queuedShares?: bigint;
  positionValue?: bigint | null;
};
// Historical RPC calls use individual requests: this endpoint intermittently
// rejects archive eth_call requests inside JSON-RPC batches.
const archiveClient = createPublicClient({
  chain: publicClient.chain,
  transport: http(deployment.rpcUrl, {
    batch: false,
    timeout: 15_000,
    retryCount: 2,
  }),
});
// History has its own four-request semaphore, shared across all chart queries.
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
const blocks = new Map<
  string,
  Promise<{ number: bigint; timestamp: bigint }>
>();
const points = new Map<string, Promise<HistoryPoint>>();
const timeBlocks = new Map<string, Promise<bigint>>();
function cached<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  work: () => Promise<T>,
) {
  let promise = cache.get(key);
  if (!promise) {
    promise = work().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
  }
  return promise;
}
function blockAt(number: bigint) {
  return cached(blocks, number.toString(), async () => {
    const block = await limited(() =>
      archiveClient.getBlock({ blockNumber: number }),
    );
    return { number: block.number, timestamp: block.timestamp };
  });
}
async function resolveBlock(time: bigint, last: bigint) {
  return cached(timeBlocks, time.toString(), async () => {
    let low = BigInt(deployment.deploymentBlock),
      high = last;
    while (low < high) {
      const mid = (low + high + 1n) / 2n;
      if ((await blockAt(mid)).timestamp <= time) low = mid;
      else high = mid - 1n;
    }
    return low;
  });
}
async function pointAt(
  blockNumber: bigint,
  address?: Address,
): Promise<HistoryPoint> {
  return cached(
    points,
    `${blockNumber}:${address?.toLowerCase() || "pool"}`,
    async () => {
      const block = await blockAt(blockNumber);
      const read = (name: string, args: readonly unknown[] = []) =>
        limited(async () => {
          try {
            return await archiveClient.readContract({
              address: vaultAddress,
              abi: vaultAbi as Abi,
              functionName: name,
              args,
              blockNumber,
            });
          } catch {
            return archiveClient.readContract({
              address: vaultAddress,
              abi: vaultAbi as Abi,
              functionName: name,
              args,
              blockNumber,
            });
          }
        });
      const [raw, price] = await Promise.all([
        read("getPoolSnapshot"),
        read("convertToAssets", [10n ** 18n]),
      ]);
      const s = raw as Snapshot;
      const point: HistoryPoint = {
        blockNumber,
        timestamp: block.timestamp,
        nav: s.nav,
        cash: s.cash,
        principal: s.principal,
        interest: s.interest,
        supply: s.shares,
        sharePrice: s.shares ? (price as bigint) : null,
      };
      if (address) {
        const [held, id] = await Promise.all([
          read("balanceOf", [address]),
          read("pendingRequestOf", [address]),
        ]);
        const pending = id
          ? ((await read("getRedemption", [id])) as Redemption)
          : undefined;
        point.heldShares = held as bigint;
        point.queuedShares = pending?.status === 1 ? pending.shares : 0n;
        point.positionValue = (await read("previewRedeem", [
          combinedShares(held as bigint, pending),
        ])) as bigint;
      }
      return point;
    },
  );
}
export async function fetchHistory(
  range: HistoryRange,
  end: { number: bigint; timestamp: bigint },
  events: Parameters<typeof eventBlocks>[0],
  address?: Address,
) {
  const first = await blockAt(BigInt(deployment.deploymentBlock));
  const times = sampleTimes(first.timestamp, end.timestamp, range);
  const regular = await Promise.all(
    times.map((time) => resolveBlock(time, end.number)),
  );
  const selected = [
    ...new Set([
      ...regular,
      ...eventBlocks(events, regular[0], end.number),
      end.number,
    ]),
  ].sort((a, b) => (a < b ? -1 : 1));
  const data = await Promise.all(
    selected.map(async (number) => {
      try {
        return await pointAt(number, address);
      } catch (error) {
        const block = await blockAt(number);
        return {
          error:
            error instanceof Error
              ? error.message.split("\n")[0]
              : String(error),
          blockNumber: number,
          timestamp: block.timestamp,
          nav: null,
          cash: null,
          principal: null,
          interest: null,
          supply: null,
          sharePrice: null,
          positionValue: address ? null : undefined,
        } as HistoryPoint;
      }
    }),
  );
  return data;
}
export function useHistory(
  range: HistoryRange,
  address?: Address,
  personal = false,
) {
  const anchor = useSnapshotBlock().data;
  const events = useActivity();
  const pool = usePool();
  const position = usePosition(personal ? address : undefined);
  const query = useQuery({
    queryKey: [
      "history",
      vaultAddress,
      personal ? address?.toLowerCase() : "pool",
      range,
      anchor ? (anchor.timestamp / 300n).toString() : "",
      events.data?.length,
    ],
    enabled: !!anchor && !!events.data && (!personal || !!address),
    staleTime: 60_000,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] ===
        (personal ? address?.toLowerCase() : "pool") &&
      previousQuery?.queryKey[3] === range
        ? previous
        : undefined,
    queryFn: () =>
      fetchHistory(
        range,
        anchor!,
        events.data!,
        personal ? address : undefined,
      ),
  });
  let data = query.data;
  // The live endpoint updates at the same five-second snapshot used by the metrics.
  if (
    data &&
    anchor &&
    pool.data?.blockNumber === anchor.number &&
    (!personal || position.data?.blockNumber === anchor.number)
  ) {
    const s = pool.data.snapshot;
    const live: HistoryPoint = {
      blockNumber: anchor.number,
      timestamp: anchor.timestamp,
      nav: s.nav,
      cash: s.cash,
      principal: s.principal,
      interest: s.interest,
      supply: s.shares,
      sharePrice: s.shares ? pool.data.sharePrice : null,
      ...(personal && position.data
        ? {
            heldShares: position.data.ownedShares,
            queuedShares: position.data.pending?.shares || 0n,
            positionValue: position.data.positionValue,
          }
        : {}),
    };
    data = [...data.filter((p) => p.blockNumber < anchor.number), live];
  }
  return {
    ...query,
    data,
    error: query.error || events.error,
    hasGaps: data?.some((p) => p.nav === null) || false,
    retry: async () => {
      points.clear();
      blocks.clear();
      timeBlocks.clear();
      await events.refetch();
      return query.refetch();
    },
  };
}
