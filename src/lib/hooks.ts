"use client";
import { useWorkspace } from "@/components/workspace-context";
import { useState, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useAccount, useWalletClient } from "wagmi";
import {
  encodeFunctionData,
  erc20Abi,
  parseEventLogs,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { simulateCalls } from "viem/actions";
import deployment from "./deployment.json";
import { vaultAbi } from "./vault-abi";
import { publicClient, readVault, vaultAddress, assetAddress } from "./chain";
import { chain } from "./wallet";
import type {
  Activity,
  Borrower,
  Loan,
  LoanRecord,
  Redemption,
  Snapshot,
} from "./types";

// One shared chain reference anchors every financial query on a screen.
export function useSnapshotBlock(poll = false) {
  return useQuery({
    queryKey: ["snapshot-block", deployment.chainId],
    refetchInterval: poll ? 5_000 : false,
    queryFn: () => publicClient.getBlock({ blockTag: "latest" }),
  });
}

export function SnapshotPoller() {
  useSnapshotBlock(true);
  return null;
}

export function usePool() {
  const anchor = useSnapshotBlock();
  const block = anchor.data;
  const query = useQuery({
    queryKey: ["pool", vaultAddress, block?.number.toString()],
    enabled: !!block,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!deployment.deployed)
        throw new Error("Vault deployment is not configured.");
      if (!block) throw new Error("Waiting for the snapshot block.");
      const [snapshot, owner, sharePrice, pendingOwner] = await Promise.all([
        readVault("getPoolSnapshot", [], block.number),
        readVault("owner", [], block.number),
        readVault("convertToAssets", [10n ** 18n], block.number),
        readVault("pendingOwner", [], block.number),
      ]);
      return {
        snapshot: snapshot as Snapshot,
        owner: owner as Address,
        pendingOwner: pendingOwner as Address,
        sharePrice: sharePrice as bigint,
        blockNumber: block.number,
      };
    },
  });
  return {
    ...query,
    error: query.error || anchor.error,
    refetch: async () => {
      await anchor.refetch();
      return query.refetch();
    },
  };
}

export function useActivity() {
  return useQuery({
    queryKey: ["activity", vaultAddress],
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!deployment.deployed) return [] as Activity[];
      const to = await publicClient.getBlockNumber({ cacheTime: 0 });
      const logs = [];
      for (
        let from = BigInt(deployment.deploymentBlock);
        from <= to;
        from += 5_000n
      ) {
        logs.push(
          ...(await publicClient.getLogs({
            address: vaultAddress,
            fromBlock: from,
            toBlock: from + 4_999n < to ? from + 4_999n : to,
          })),
        );
      }
      return parseEventLogs({ abi: vaultAbi as Abi, logs, strict: false })
        .map((log) => ({
          eventName: log.eventName,
          args: log.args as Record<string, unknown>,
          transactionHash: log.transactionHash!,
          blockNumber: log.blockNumber!,
          logIndex: log.logIndex!,
        }))
        .sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? a.logIndex - b.logIndex
            : a.blockNumber < b.blockNumber
              ? -1
              : 1,
        ) as Activity[];
    },
  });
}

export function useLoans() {
  const block = useSnapshotBlock().data;
  const activity = useActivity();
  const drawEvents = activity.data?.filter(
    (event) =>
      event.eventName === "LoanDrawn" &&
      !!block &&
      event.blockNumber <= block.number,
  );
  return useQuery({
    queryKey: [
      "loans",
      vaultAddress,
      block?.number.toString(),
      drawEvents?.map((event) => String(event.args.loanId)).join(","),
    ],
    enabled: !!activity.data && !!block,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!block) throw new Error("Waiting for the snapshot block.");
      const loans = await Promise.all(
        (drawEvents || []).map(async (event) => {
          const id = event.args.loanId as bigint;
          const [loan, debt] = await Promise.all([
            readVault("getLoan", [id], block.number),
            readVault("previewDebt", [id], block.number),
          ]);
          const [, interest, total] = debt as readonly bigint[];
          return {
            ...(loan as Loan),
            id,
            interest,
            debt: total,
            transactionHash: event.transactionHash,
          } as LoanRecord;
        }),
      );
      return {
        loans: loans.reverse(),
        timestamp: block.timestamp,
        blockNumber: block.number,
      };
    },
  });
}

export function useBorrower(address?: Address) {
  const block = useSnapshotBlock().data;
  return useQuery({
    queryKey: ["borrower", vaultAddress, address, block?.number.toString()],
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === address ? previous : undefined,
    enabled: deployment.deployed && !!block && !!address,
    queryFn: async () => {
      if (!block) throw new Error("Waiting for the snapshot block.");
      if (!address)
        throw new Error("Connect a wallet to view its credit line.");
      const [borrower, available, credit] = await Promise.all([
        readVault("getBorrower", [address], block.number),
        readVault("availableToDraw", [address], block.number),
        readVault("availableCredit", [address], block.number),
      ]);
      const [drawable, reason] = available as readonly [bigint, number];
      return {
        borrower: borrower as Borrower,
        drawable,
        reason,
        credit: credit as bigint,
      };
    },
  });
}

export function usePosition(address?: Address) {
  const block = useSnapshotBlock().data;
  return useQuery({
    queryKey: ["position", vaultAddress, address, block?.number.toString()],
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === address ? previous : undefined,
    enabled: deployment.deployed && !!block && !!address,
    queryFn: async () => {
      if (!block) throw new Error("Waiting for the snapshot block.");
      if (!address) throw new Error("Connect a wallet to view its position.");
      const [assets, fees, ownedShares, pendingId] = await Promise.all([
        publicClient.readContract({
          address: assetAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
          blockNumber: block.number,
        }),
        publicClient.readContract({
          address: deployment.feeTokenAddress as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
          blockNumber: block.number,
        }),
        readVault("balanceOf", [address], block.number),
        readVault("pendingRequestOf", [address], block.number),
      ]);
      const pending = (pendingId as bigint)
        ? ((await readVault(
            "getRedemption",
            [pendingId],
            block.number,
          )) as Omit<Redemption, "id" | "estimatedAssets">)
        : undefined;
      const ownedValue = (await readVault(
        "previewRedeem",
        [ownedShares],
        block.number,
      )) as bigint;
      const queuedValue = pending
        ? ((await readVault(
            "previewRedeem",
            [pending.shares],
            block.number,
          )) as bigint)
        : 0n;
      const positionValue = (await readVault(
        "previewRedeem",
        [(ownedShares as bigint) + (pending?.shares || 0n)],
        block.number,
      )) as bigint;
      return {
        positionValue,
        blockNumber: block.number,
        assets,
        fees,
        ownedShares: ownedShares as bigint,
        ownedValue,
        pendingId: pendingId as bigint,
        pending,
        queuedValue,
      };
    },
  });
}

export function useRedemptions() {
  const block = useSnapshotBlock().data;
  const activity = useActivity();
  const events = activity.data?.filter(
    (event) =>
      event.eventName === "RedemptionRequested" &&
      !!block &&
      event.blockNumber <= block.number,
  );
  return useQuery({
    queryKey: [
      "redemptions",
      vaultAddress,
      block?.number.toString(),
      events?.map((e) => String(e.args.requestId)).join(","),
      activity.data?.length,
    ],
    enabled: !!activity.data && !!block,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!block) throw new Error("Waiting for the snapshot block.");
      return Promise.all(
        (events || []).map(async (event) => {
          const id = event.args.requestId as bigint;
          const request = (await readVault(
            "getRedemption",
            [id],
            block.number,
          )) as Omit<Redemption, "id" | "estimatedAssets">;
          const estimatedAssets = (await readVault(
            "previewRedeem",
            [request.shares],
            block.number,
          )) as bigint;
          const payout = activity.data?.find(
            (e) =>
              e.eventName === "RedemptionProcessed" &&
              e.args.requestId === id &&
              e.blockNumber <= block.number,
          );
          return {
            ...request,
            id,
            estimatedAssets,
            paidAssets: payout?.args.assets as bigint | undefined,
          };
        }),
      );
    },
  });
}

export type Call = { to: Address; data: Hex };
export function vaultCall(
  functionName: string,
  args: readonly unknown[] = [],
): Call {
  return {
    to: vaultAddress,
    data: encodeFunctionData({ abi: vaultAbi as Abi, functionName, args }),
  };
}
export function approveCall(amount: bigint): Call {
  return {
    to: assetAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [vaultAddress, amount],
    }),
  };
}
export function useTransaction() {
  const { demo } = useWorkspace();
  const account = useAccount();
  const currentDemo = useRef(demo);
  currentDemo.current = demo;
  const currentAccount = useRef(account);
  currentAccount.current = account;
  const inFlight = useRef(false);
  const wallet = useWalletClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<{
    pending: boolean;
    label?: string;
    stage?: string;
    hash?: Hash;
    error?: string;
  }>({ pending: false });
  async function run(
    label: string,
    buildCalls: () => Call[] | Promise<Call[]>,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ pending: true, label, stage: "Preparing transaction" });
    try {
      if (demo)
        throw new Error(
          "Demo exploration is read-only. Exit demo mode to transact.",
        );
      if (!account.address || !wallet.data)
        throw new Error("Connect your Tempo Wallet to continue.");
      if (account.chainId !== 42431)
        throw new Error("Switch to Tempo Moderato (42431).");
      const signer = account.address;
      const addresses = await wallet.data.getAddresses();
      if (addresses[0]?.toLowerCase() !== signer.toLowerCase())
        throw new Error("Wallet account changed. Reopen the transaction.");
      const feeBalance = await publicClient.readContract({
        address: deployment.feeTokenAddress as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [signer],
      });
      if (feeBalance === 0n)
        throw new Error(
          "Fund this wallet with PathUSD for network fees using the Tempo Wallet faucet.",
        );
      const validBefore = Math.floor(Date.now() / 1000) + 60;
      const calls = await buildCalls();
      setState({
        pending: true,
        label,
        stage: "Simulating the complete batch",
      });
      const simulation = await simulateCalls(publicClient, {
        account: signer,
        calls,
        traceAssetChanges: false,
      });
      const failed = simulation.results.find(
        (result) => result.status === "failure",
      );
      if (failed?.status === "failure") throw failed.error;
      const freshAddresses = await wallet.data.getAddresses();
      if (
        currentDemo.current ||
        currentAccount.current.address?.toLowerCase() !==
          signer.toLowerCase() ||
        currentAccount.current.chainId !== 42431 ||
        freshAddresses[0]?.toLowerCase() !== signer.toLowerCase()
      )
        throw new Error(
          "Wallet account or network changed. Reopen the transaction.",
        );
      setState({
        pending: true,
        label,
        stage: "Confirm one transaction in your wallet",
      });
      if (Math.floor(Date.now() / 1000) >= validBefore)
        throw new Error("Quote expired before signing. Try again.");
      const hash = await wallet.data.sendTransaction({
        account: signer,
        chain,
        calls,
        feeToken: deployment.feeTokenAddress as Address,
        validBefore,
      });
      setState({
        pending: true,
        label,
        stage: "Waiting for a successful receipt",
        hash,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 90_000,
      });
      if (receipt.status !== "success")
        throw new Error(
          "Transaction reverted. No economic changes were committed.",
        );
      await queryClient.invalidateQueries({ queryKey: ["snapshot-block"] });
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "snapshot-block",
      });
      setState({ pending: false, label, stage: "Confirmed on Tempo", hash });
      return hash;
    } catch (error) {
      const message =
        error && typeof error === "object" && "shortMessage" in error
          ? String(error.shortMessage)
          : error instanceof Error
            ? error.message
            : String(error);
      setState({
        pending: false,
        label,
        error: message.length > 1600 ? `${message.slice(0, 1600)}…` : message,
      });
    } finally {
      inFlight.current = false;
    }
  }
  return {
    ...state,
    run,
    connected: !demo && account.isConnected && account.chainId === 42431,
    address: account.address,
  };
}
