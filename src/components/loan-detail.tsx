"use client";
import { useEffect, useState } from "react";
import { type LoanRecord } from "@/lib/types";
import { approveCall, useLoans, useTransaction, vaultCall } from "@/lib/hooks";
import { readVault, explorer } from "@/lib/chain";
import { alpha, parseAmount, projectedInterest, timestamp } from "@/lib/format";
import { ActionDialog } from "./action-dialog";
import { AmountField, InterestTicker, LoanStatus, TxStatus } from "./ui";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
export function useLoanSelection() {
  const [id, setId] = useState<bigint>();
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("loan");
    if (value && /^\d+$/.test(value)) setId(BigInt(value));
  }, []);
  function select(loan?: LoanRecord, mode?: "settlement") {
    setId(loan?.id);
    const url = new URL(window.location.href);
    if (loan) url.searchParams.set("loan", String(loan.id));
    else {
      url.searchParams.delete("loan");
      url.searchParams.delete("repay");
    }
    if (mode) url.searchParams.set("repay", mode);
    window.history.replaceState(null, "", url);
  }
  return { id, select };
}
export function LoanDetail({
  loan,
  at,
  onClose,
}: {
  loan?: LoanRecord;
  at: bigint;
  onClose: () => void;
}) {
  const tx = useTransaction();
  const [kind, setKind] = useState("full");
  const [amount, setAmount] = useState("100");
  useEffect(() => {
    setKind(
      new URLSearchParams(window.location.search).get("repay") === "settlement"
        ? "settlement"
        : "full",
    );
  }, [loan?.id]);
  const maximum = loan
    ? loan.debt +
      (loan.status === 1
        ? projectedInterest(loan.principalOutstanding, 60n)
        : 0n) +
      10n
    : 0n;
  let partial: bigint | undefined;
  try {
    partial = parseAmount(amount);
  } catch {}
  return (
    <ActionDialog
      open={!!loan}
      onOpenChange={(open) => {
        if (!open && !tx.pending) onClose();
      }}
      title={`Loan PF-${loan?.id.toString().padStart(3, "0") || ""}`}
      description="Review the matching borrower and settlement batch. Any consenting wallet can repay this debt."
    >
      {loan && (
        <>
          <div className="ledger-row">
            <span>Status</span>
            <LoanStatus loan={loan} at={at} />
          </div>
          <div className="ledger-row">
            <span>Borrower</span>
            <b className="address break-all">{loan.borrower}</b>
          </div>
          <div className="ledger-row">
            <span>Principal remaining</span>
            <b>{alpha(loan.principalOutstanding, 6)}</b>
          </div>
          <div className="ledger-row">
            <span>Due · UTC</span>
            <b>{timestamp(loan.dueAt)}</b>
          </div>
          <InterestTicker loan={loan} at={at} />
          <div className="ledger-row">
            <span>Debt at current block</span>
            <b>{alpha(loan.debt, 6)}</b>
          </div>
          <div className="document">
            <b>Batch reference / TIP-20 memo</b>
            <p className="address break-all">{loan.batchRef}</p>
          </div>
          {loan.transactionHash && (
            <a
              className="text-note"
              href={explorer(loan.transactionHash)}
              target="_blank"
              rel="noreferrer"
            >
              View draw receipt and transfer memo ↗
            </a>
          )}
          {loan.debt > 0n ? (
            <>
              <Tabs value={kind} onValueChange={setKind}>
                <TabsList className="w-full">
                  <TabsTrigger value="full">Full repayment</TabsTrigger>
                  <TabsTrigger value="partial">Partial</TabsTrigger>
                  <TabsTrigger value="settlement">Settlement</TabsTrigger>
                </TabsList>
              </Tabs>
              {kind === "partial" && (
                <AmountField
                  label="Repayment amount"
                  value={amount}
                  onChange={setAmount}
                />
              )}
              <div className="ledger-row">
                <span>Payer · connected wallet</span>
                <b className="address break-all">
                  {tx.address || "Connect your wallet"}
                </b>
              </div>
              <div className="ledger-row">
                <span>
                  {kind === "partial" ? "Payment amount" : "Maximum payment"}
                </span>
                <b>{alpha(kind === "partial" ? partial : maximum, 6)}</b>
              </div>
              <p className="text-note">
                Interest is paid first, then principal. Full repayment pulls
                only execution-time debt within the displayed bound.
                {kind === "settlement" &&
                  " The payment is reconciled to this borrower and batch in the same transaction."}
              </p>
              <Button
                className="w-full"
                disabled={
                  !tx.connected ||
                  tx.pending ||
                  (kind === "partial" && (!partial || partial > loan.debt))
                }
                onClick={() =>
                  tx.run(
                    kind === "settlement"
                      ? "Apply settlement payment"
                      : "Repay loan",
                    async () => {
                      if (kind === "partial") {
                        if (!partial)
                          throw new Error("Enter a repayment amount.");
                        return [
                          approveCall(partial),
                          vaultCall("repay", [loan.id, partial]),
                        ];
                      }
                      const debt = (await readVault("previewDebt", [
                        loan.id,
                      ])) as bigint[];
                      if (debt[2] > maximum)
                        throw new Error(
                          "Repayment quote expired. Review the refreshed maximum.",
                        );
                      return [
                        approveCall(maximum),
                        kind === "settlement"
                          ? vaultCall("repaySettlement", [
                              loan.borrower,
                              loan.batchRef,
                              maximum,
                            ])
                          : vaultCall("repayAll", [loan.id, maximum]),
                      ];
                    },
                  )
                }
              >
                {kind === "settlement"
                  ? "Confirm settlement repayment"
                  : "Confirm repayment"}
              </Button>
            </>
          ) : (
            <p className="notice">
              This loan is settled. Its batch reference remains permanently
              used.
            </p>
          )}
          <TxStatus {...tx} />
        </>
      )}
    </ActionDialog>
  );
}
export function LoanExplorer({
  loans,
  at,
}: {
  loans?: LoanRecord[];
  at: bigint;
}) {
  const selection = useLoanSelection();
  const selected = loans?.find((loan) => loan.id === selection.id);
  return (
    <LoanDetail loan={selected} at={at} onClose={() => selection.select()} />
  );
}
