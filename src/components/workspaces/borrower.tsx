"use client";
import { useState } from "react";
import {
  useBorrower,
  useLoans,
  usePool,
  useActivity,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import { publicClient, readVault, explorer } from "@/lib/chain";
import {
  alpha,
  batchHash,
  parseAmount,
  projectedInterest,
  timestamp,
} from "@/lib/format";
import { drawReasons, type Borrower } from "@/lib/types";
import { diligenceHash, fixture } from "@/lib/fixture";
import deployment from "@/lib/deployment.json";
import { useWorkspace } from "../workspace-context";
import { LoanDetail, useLoanSelection } from "../loan-detail";
import { ActionDialog } from "../action-dialog";
import {
  AmountField,
  LoanTable,
  Metric,
  PageHeader,
  Panel,
  QueryError,
  SnapshotTime,
  TxStatus,
} from "../ui";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Badge } from "../ui/badge";
export function BorrowerPage({
  view = "credit",
}: {
  view?: "credit" | "loans" | "settlements";
}) {
  const { borrowerAddress } = useWorkspace();
  const borrower = useBorrower(borrowerAddress),
    allLoans = useLoans(),
    pool = usePool(),
    activity = useActivity(),
    tx = useTransaction();
  const selection = useLoanSelection();
  const [drawOpen, setDrawOpen] = useState(false),
    [amount, setAmount] = useState("600"),
    [reference, setReference] = useState("UK-IN-CARD-NEW"),
    [tenor, setTenor] = useState("172800");
  const loans = allLoans.data?.loans.filter(
    (loan) => loan.borrower.toLowerCase() === borrowerAddress?.toLowerCase(),
  );
  const b = borrower.data;
  const debt = loans?.reduce((sum, loan) => sum + loan.debt, 0n);
  const interest = loans?.reduce((sum, loan) => sum + loan.interest, 0n);
  const active = loans?.filter((loan) => loan.status === 1);
  const nextDue = active?.reduce<bigint | undefined>(
    (next, loan) => (!next || loan.dueAt < next ? loan.dueAt : next),
    undefined,
  );
  let projection: bigint | undefined;
  try {
    projection = projectedInterest(parseAmount(amount), BigInt(tenor));
  } catch {}
  const selected = loans?.find((loan) => loan.id === selection.id);
  return (
    <>
      <PageHeader
        title={
          view === "credit"
            ? "Credit line"
            : view === "loans"
              ? "Your loans"
              : "Settlement batches"
        }
        subtitle="Your approved working-capital facility for remittance prefunding."
        actions={
          view !== "settlements" ? (
            <Button
              disabled={!tx.connected || !b || b.reason !== 0}
              onClick={() => setDrawOpen(true)}
            >
              Draw credit
            </Button>
          ) : undefined
        }
      />
      <QueryError
        error={borrower.error}
        label="your credit line"
        retry={() => borrower.refetch()}
      />
      <QueryError
        error={allLoans.error}
        label="your loans"
        retry={() => allLoans.refetch()}
      />
      {view === "credit" && (
        <>
          <section className="position-hero">
            <p>Available to draw</p>
            <h2>{alpha(b?.drawable, 6)}</h2>
            <span>
              {b ? drawReasons[b.reason] : "Loading credit availability…"}
            </span>
            <small>
              Borrower pricing: 18% simple APR · 4.93 bps/day · ACT/365
            </small>
          </section>
          <div className="metrics">
            <Metric
              label="Your approved limit"
              value={alpha(b?.borrower.config.creditLimit)}
              note="Maximum principal exposure"
            />
            <Metric
              label="Your outstanding debt"
              value={alpha(debt, 6)}
              note="Remaining principal + contractual interest"
            />
            <Metric
              label="Your interest owed"
              value={alpha(interest, 6)}
              note="Simple interest on remaining principal"
            />
            <Metric
              label="Your next maturity"
              value={nextDue ? timestamp(nextDue) : "No active loan"}
              note="Actual block time · UTC"
            />
          </div>
          <Panel title="Facility details">
            <div className="panel-body">
              <div className="ledger-row">
                <span>Your principal exposure</span>
                <b>{alpha(b?.borrower.principalOutstanding, 6)}</b>
              </div>
              <div className="ledger-row">
                <span>Unused principal limit</span>
                <b>{alpha(b?.credit, 6)}</b>
              </div>
              <div className="ledger-row">
                <span>Available pool cash · All investors</span>
                <b>{alpha(pool.data?.snapshot.cash)}</b>
              </div>
              <div className="ledger-row">
                <span>Borrowing approval</span>
                <Badge variant="secondary">
                  {!b
                    ? "Loading"
                    : b.borrower.config.enabled
                      ? "Enabled"
                      : "Disabled · Repayment available"}
                </Badge>
              </div>
              <p className="text-note">
                Repayment covers interest first and then principal. Principal
                payments reopen credit capacity. FX conversion, destination
                prefunding and customer payouts are handled by your company.
              </p>
            </div>
          </Panel>
        </>
      )}
      {view !== "settlements" && (
        <Panel
          title={view === "credit" ? "Your recent loans" : "Your loan history"}
          className="section-space"
        >
          <LoanTable
            loans={view === "credit" ? loans?.slice(0, 5) : loans}
            at={allLoans.data?.timestamp}
            onSelect={selection.select}
          />
        </Panel>
      )}
      {view === "settlements" && (
        <>
          <p className="notice">
            Simulated settlement records. Expected amounts, source, and
            supporting documents are fixtures; draw and payment confirmations
            come from actual contract state.
          </p>
          <QueryError
            error={activity.error}
            label="settlement confirmations"
            retry={() => activity.refetch()}
          />
          {loans?.length ? (
            loans.map((loan) => {
              const known =
                loan.borrower.toLowerCase() ===
                deployment.demoBorrowerAddress.toLowerCase();
              const confirmation = activity.data?.find(
                (event) =>
                  event.eventName === "SettlementRepaid" &&
                  event.args.loanId === loan.id,
              );
              const isRecovered =
                loan.status === 3 &&
                activity.data?.some(
                  (event) =>
                    event.eventName === "LoanRecovered" &&
                    event.args.loanId === loan.id,
                );
              const stages = [
                [
                  "Expected settlement",
                  known ? "Simulated fixture" : "No fixture supplied",
                ],
                ["Credit drawn", "Confirmed on-chain"],
                [
                  "Settlement payment",
                  confirmation ? "Confirmed on-chain" : "Not confirmed",
                ],
                [
                  "Loan repaid",
                  loan.status === 3 ? "Confirmed on-chain" : "Outstanding",
                ],
                [
                  "Credit capacity",
                  loan.status !== 3
                    ? "Debt remains"
                    : isRecovered
                      ? "Manager reapproval required"
                      : "Principal exposure reduced",
                ],
              ];
              return (
                <Panel
                  key={String(loan.id)}
                  title={`Batch · PF-${loan.id.toString().padStart(3, "0")}`}
                  className="section-space"
                  aside={
                    <Button
                      variant="outline"
                      onClick={() => selection.select(loan, "settlement")}
                    >
                      {loan.debt ? "Apply settlement / Repay" : "View loan"}
                    </Button>
                  }
                >
                  <div className="panel-body">
                    <div className="document">
                      <span className="address break-all">{loan.batchRef}</span>
                    </div>
                    <div className="ledger-row">
                      <span>Borrower</span>
                      <b className="address break-all">{loan.borrower}</b>
                    </div>
                    <div className="ledger-row">
                      <span>Settlement source · Simulated</span>
                      <b>
                        {known
                          ? fixture.settlementSource
                          : "No record supplied"}
                      </b>
                    </div>
                    <div className="ledger-row">
                      <span>Expected amount · Simulated</span>
                      <b>
                        {known
                          ? `${fixture.expectedSettlementAmount} AlphaUSD`
                          : "—"}
                      </b>
                    </div>
                    <div className="ledger-row">
                      <span>Expected arrival · Simulated</span>
                      <b>{known ? timestamp(loan.drawnAt + 172800n) : "—"}</b>
                    </div>
                    <div className="ledger-row">
                      <span>Prefunding principal · On-chain</span>
                      <b>{alpha(loan.originalPrincipal, 6)}</b>
                    </div>
                    <ol className="settlement-stages">
                      {stages.map(([title, note]) => (
                        <li key={title}>
                          <b>{title}</b>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ol>
                    {confirmation && (
                      <a
                        href={explorer(confirmation.transactionHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View settlement receipt ↗
                      </a>
                    )}
                    {known && (
                      <details className="how-it-works">
                        <summary>Supporting document · Simulated</summary>
                        <p>
                          {fixture.company} · {fixture.corridor}
                        </p>
                        <p className="address break-all">{diligenceHash}</p>
                      </details>
                    )}
                    <p className="text-note">
                      The memo identifies the batch. It does not verify the
                      underlying commercial settlement.
                    </p>
                  </div>
                </Panel>
              );
            })
          ) : (
            <div className="empty">
              {loans
                ? "No loans or settlement batches for this borrower."
                : "Loading settlement batches…"}
            </div>
          )}
        </>
      )}
      <LoanDetail
        loan={selected}
        at={allLoans.data?.timestamp || 0n}
        onClose={() => selection.select()}
      />
      <ActionDialog
        open={drawOpen}
        onOpenChange={(open) => {
          if (!tx.pending) setDrawOpen(open);
        }}
        title="Draw credit"
        description="Receive AlphaUSD in your approved borrower wallet. Each settlement batch reference can be used once."
      >
        <AmountField
          label="Draw amount"
          value={amount}
          onChange={setAmount}
          note={`Currently drawable: ${alpha(b?.drawable, 6)}`}
        />
        <div className="form-field">
          <label htmlFor="batch-reference">Settlement batch reference</label>
          <Input
            id="batch-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <small>
            Hashed consistently into the loan identifier and TIP-20 transfer
            memo.
          </small>
        </div>
        <div className="form-field">
          <label>Loan tenor</label>
          <Select value={tenor} onValueChange={setTenor}>
            <SelectTrigger aria-label="Loan tenor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="172800">48 hours · Standard tenor</SelectItem>
              <SelectItem value="60">
                60 seconds · Testnet demonstration
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {tenor === "60" && (
          <p className="notice">
            Testnet demonstration: short maturity, actual block timestamps, and
            the real 18% annual interest rate.
          </p>
        )}
        <div className="ledger-row">
          <span>Projected tenor cost</span>
          <b>{alpha(projection, 6)}</b>
        </div>
        <div className="ledger-row">
          <span>Purpose</span>
          <b>Bridge card-settlement prefunding</b>
        </div>
        <Button
          className="w-full"
          disabled={
            !tx.connected ||
            tx.pending ||
            !b ||
            b.reason !== 0 ||
            projection === undefined
          }
          onClick={async () => {
            const hash = await tx.run("Draw working capital", async () => {
              if (!borrowerAddress)
                throw new Error("Connect the borrower wallet.");
              const assets = parseAmount(amount),
                batchRef = batchHash(reference),
                block = await publicClient.getBlockNumber({ cacheTime: 0 });
              const [capacity, config, existing] = await Promise.all([
                readVault("availableToDraw", [borrowerAddress], block),
                readVault("getBorrower", [borrowerAddress], block),
                readVault("loanForBatch", [borrowerAddress, batchRef], block),
              ]);
              const [drawable, reason] = capacity as [bigint, number];
              if (reason !== 0) throw new Error(drawReasons[reason]);
              if (assets > drawable)
                throw new Error(`Currently drawable: ${alpha(drawable, 6)}.`);
              if (BigInt(tenor) > (config as Borrower).config.maxTenorSeconds)
                throw new Error("Tenor exceeds your approved maximum.");
              if (existing !== 0n)
                throw new Error(
                  "Batch reference already used. Choose a new reference.",
                );
              return [vaultCall("draw", [assets, BigInt(tenor), batchRef])];
            });
            if (hash) setReference(`UK-IN-CARD-${Date.now()}`);
          }}
        >
          Confirm draw
        </Button>
        <TxStatus {...tx} />
      </ActionDialog>
      <SnapshotTime />
    </>
  );
}
