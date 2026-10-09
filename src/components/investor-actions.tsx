"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, isAddress, zeroAddress } from "viem";
import { useWorkspace } from "./workspace-context";
import {
  approveCall,
  usePool,
  usePosition,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import { readVault, vaultAddress } from "@/lib/chain";
import { alpha, parseAmount, shares } from "@/lib/format";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ActionDialog } from "./action-dialog";
import { AmountField, TxStatus } from "./ui";
export type InvestorAction = "deposit" | "withdraw" | "transfer";
export function InvestorActions({
  onlyDeposit = false,
}: {
  onlyDeposit?: boolean;
}) {
  const [action, setAction] = useState<InvestorAction>();
  const [amount, setAmount] = useState("100");
  const [quantity, setQuantity] = useState("10");
  const [receiver, setReceiver] = useState("");
  const { account, investorAddress, demo } = useWorkspace();
  const pool = usePool(),
    position = usePosition(investorAddress),
    tx = useTransaction();
  const p = position.data,
    s = pool.data?.snapshot;
  let assets: bigint | undefined, shareAmount: bigint | undefined;
  try {
    assets = parseAmount(amount);
  } catch {}
  try {
    shareAmount = parseAmount(quantity, 18);
  } catch {}
  const quote = useQuery({
    queryKey: [
      "deposit-quote",
      assets?.toString(),
      pool.data?.blockNumber.toString(),
    ],
    enabled: action === "deposit" && !!assets && !!pool.data,
    queryFn: async () =>
      (await readVault(
        "previewDeposit",
        [assets],
        pool.data!.blockNumber,
      )) as bigint,
  });
  const exitQuote = useQuery({
    queryKey: [
      "exit-quote",
      shareAmount?.toString(),
      pool.data?.blockNumber.toString(),
    ],
    enabled: action === "withdraw" && !!shareAmount && !!pool.data,
    queryFn: async () =>
      (await readVault(
        "previewRedeem",
        [shareAmount],
        pool.data!.blockNumber,
      )) as bigint,
  });
  const minimum = quote.data ? (quote.data * 995n) / 1000n : undefined;
  function start(value: InvestorAction) {
    setAction(value);
  }
  const depositBlocked =
    !s || s.depositsPaused || (s.nav === 0n && s.shares > 0n);
  return (
    <>
      <div className="button-row">
        <Button
          disabled={!tx.connected || depositBlocked}
          onClick={() => start("deposit")}
        >
          Deposit
        </Button>
        {!onlyDeposit && (
          <>
            <Button
              variant="outline"
              disabled={
                !tx.connected ||
                !p ||
                p.pendingId > 0n ||
                p.ownedShares < 10n * 10n ** 18n
              }
              onClick={() => start("withdraw")}
            >
              Withdraw
            </Button>
            <Button
              variant="ghost"
              disabled={!tx.connected || !p?.ownedShares}
              onClick={() => start("transfer")}
            >
              Transfer shares
            </Button>
          </>
        )}
      </div>
      <ActionDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !tx.pending) setAction(undefined);
        }}
        title={
          action === "deposit"
            ? "Deposit AlphaUSD"
            : action === "withdraw"
              ? "Request withdrawal"
              : "Transfer tPF shares"
        }
        description={
          action === "deposit"
            ? "Receive proportional ownership of pool assets. Approval and deposit use one wallet signature."
            : action === "withdraw"
              ? "Shares enter the FIFO queue and are valued when paid. Minimum 10 tPF; one pending request per wallet."
              : "The recipient receives ownership and exposure to future earnings and losses."
        }
      >
        {action === "deposit" ? (
          <>
            <AmountField
              label="Deposit amount"
              value={amount}
              onChange={setAmount}
              note={`Your wallet balance: ${alpha(p?.assets, 6)}`}
            />
            <div className="ledger-row">
              <span>Estimated shares</span>
              <b>{shares(quote.data)} tPF</b>
            </div>
            <div className="ledger-row">
              <span>Minimum shares · 0.5% tolerance</span>
              <b>{shares(minimum)} tPF</b>
            </div>
            <div className="ledger-row">
              <span>You pay</span>
              <b>{alpha(assets, 6)}</b>
            </div>
            {quote.error && (
              <p role="alert">Unable to quote this deposit. Try again.</p>
            )}
            <Button
              className="w-full"
              disabled={
                !tx.connected ||
                tx.pending ||
                !assets ||
                !minimum ||
                !p ||
                assets > p.assets ||
                depositBlocked
              }
              onClick={() =>
                tx.run("Deposit AlphaUSD", async () => {
                  if (!assets || !minimum || !account.address || demo)
                    throw new Error(
                      "Reconnect and request a fresh deposit quote.",
                    );
                  const fresh = (await readVault("previewDeposit", [
                    assets,
                  ])) as bigint;
                  if (fresh < minimum)
                    throw new Error(
                      "Share quote moved beyond your tolerance. Review the new quote.",
                    );
                  return [
                    approveCall(assets),
                    vaultCall("depositWithMinShares", [
                      assets,
                      account.address,
                      minimum,
                    ]),
                  ];
                })
              }
            >
              Confirm deposit
            </Button>
          </>
        ) : (
          <>
            <AmountField
              label={
                action === "withdraw"
                  ? "Shares to withdraw"
                  : "Shares to transfer"
              }
              value={quantity}
              onChange={setQuantity}
              token="tPF"
              note={`Your available shares: ${shares(p?.ownedShares)} tPF`}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => p && setQuantity(formatUnits(p.ownedShares, 18))}
            >
              Use all held shares
            </Button>
            {action === "transfer" ? (
              <div className="form-field">
                <label htmlFor="share-recipient">Recipient wallet</label>
                <Input
                  id="share-recipient"
                  value={receiver}
                  onChange={(e) => setReceiver(e.target.value)}
                  placeholder="0x…"
                />
              </div>
            ) : (
              <>
                <div className="ledger-row">
                  <span>Estimated payout · variable</span>
                  <b>{alpha(exitQuote.data, 6)}</b>
                </div>
                <p className="text-note">
                  Queued shares remain exposed to earnings and losses.{" "}
                  {s?.hasOverdue
                    ? "Processing is blocked while an active loan is overdue."
                    : "Payment requires sufficient pool cash and follows request order."}
                </p>
              </>
            )}
            <Button
              className="w-full"
              disabled={
                !tx.connected ||
                tx.pending ||
                !shareAmount ||
                !p ||
                shareAmount > p.ownedShares ||
                (action === "withdraw" &&
                  (shareAmount < 10n * 10n ** 18n || p.pendingId > 0n))
              }
              onClick={() =>
                tx.run(
                  action === "withdraw" ? "Request withdrawal" : "Transfer tPF",
                  () => {
                    if (!shareAmount)
                      throw new Error("Enter a positive share amount.");
                    if (action === "withdraw")
                      return [vaultCall("requestRedeem", [shareAmount])];
                    if (
                      !isAddress(receiver) ||
                      receiver === zeroAddress ||
                      receiver.toLowerCase() === vaultAddress.toLowerCase()
                    )
                      throw new Error(
                        "Enter a valid recipient other than the vault or zero address.",
                      );
                    return [vaultCall("transfer", [receiver, shareAmount])];
                  },
                )
              }
            >
              {action === "withdraw"
                ? "Confirm withdrawal request"
                : "Confirm transfer"}
            </Button>
          </>
        )}
        <p className="text-note">
          Fees use PathUSD. Your fee balance: {alpha(p?.fees, 6)}.
        </p>
        <TxStatus {...tx} />
      </ActionDialog>
    </>
  );
}
