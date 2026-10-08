"use client";
import { useState } from "react";
import {
  approveCall,
  useActivity,
  useLoans,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import { readVault } from "@/lib/chain";
import deployment from "@/lib/deployment.json";
import { fixture, diligenceHash } from "@/lib/fixture";
import { money, projectedInterest, short, timestamp } from "@/lib/format";
import {
  ActivityList,
  InterestTicker,
  LoanStatus,
  PageHeader,
  Panel,
  TxStatus,
  QueryError,
} from "@/components/ui";

export default function Settlement() {
  const loans = useLoans();
  const activity = useActivity();
  const tx = useTransaction();
  const [selectedId, setSelectedId] = useState<bigint>();
  const selected =
    loans.data?.loans.find((loan) => loan.id === selectedId) ||
    loans.data?.loans.find((loan) => loan.status === 1 || loan.status === 2) ||
    loans.data?.loans[0];
  const reconciled = activity.data?.filter(
    (event) => event.eventName === "SettlementRepaid",
  );
  const confirmation =
    selected && reconciled?.find((event) => event.args.loanId === selected.id);
  return (
    <>
      <PageHeader
        eyebrow="Settlement reconciliation"
        title="An inflow with a destination."
        subtitle="Follow a prefunding draw to its matching settlement repayment. A batch memo connects the payment to the loan; the vault updates cash and debt atomically."
      />
      <QueryError
        error={loans.error}
        retry={() => loans.refetch()}
        label="loan ledger"
      />
      <QueryError
        error={activity.error}
        retry={() => activity.refetch()}
        label="settlement history"
      />

      <div className="notice warning" style={{ marginBottom: 24 }}>
        SIMULATED SETTLEMENT PROVIDER · The payment uses actual AlphaUSD test
        tokens. The card/acquirer relationship and expected settlement evidence
        are fixtures.
      </div>
      <div className="grid-two">
        <Panel
          title="Settlement record"
          aside={
            selected
              ? `PF-${selected.id.toString().padStart(3, "0")}`
              : "AWAITING DRAW"
          }
        >
          <div className="panel-body">
            <div className="form-field">
              <label htmlFor="settlement-loan">
                Select loan / settlement batch
              </label>
              <select
                id="settlement-loan"
                value={selected?.id.toString() || ""}
                onChange={(e) => setSelectedId(BigInt(e.target.value))}
              >
                {!loans.data?.loans.length && (
                  <option value="">No loans</option>
                )}
                {loans.data?.loans.map((loan) => (
                  <option key={String(loan.id)} value={String(loan.id)}>
                    PF-{loan.id.toString().padStart(3, "0")} ·{" "}
                    {short(loan.batchRef)} ·{" "}
                    {loan.status === 3
                      ? "settled"
                      : loan.status === 2
                        ? "written off"
                        : "active"}
                  </option>
                ))}
              </select>
            </div>
            <div className="ledger-row">
              <span>Borrower</span>
              <b>
                {!selected ||
                selected.borrower.toLowerCase() ===
                  deployment.demoBorrowerAddress.toLowerCase()
                  ? fixture.company
                  : short(selected.borrower)}
              </b>
            </div>
            <div className="ledger-row">
              <span>Illustrative corridor</span>
              <b>{fixture.corridor}</b>
            </div>
            <div className="ledger-row">
              <span>Expected settlement source</span>
              <b>{fixture.settlementSource}</b>
            </div>
            <div className="ledger-row">
              <span>Expected batch settlement · fixture</span>
              <b>$1,000.00</b>
            </div>
            <div className="ledger-row">
              <span>Prefunding amount · on-chain</span>
              <b>{money(selected?.originalPrincipal)}</b>
            </div>
            <div className="ledger-row">
              <span>Expected arrival · fixture</span>
              <b>
                {selected
                  ? timestamp(selected.drawnAt + 172800n)
                  : "48 hours after draw"}
              </b>
            </div>
            <div className="ledger-row">
              <span>Loan maturity · on-chain</span>
              <b>{selected ? timestamp(selected.dueAt) : "—"}</b>
            </div>
            {selected && (
              <>
                <div className="ledger-row">
                  <span>Current loan status</span>
                  <LoanStatus
                    loan={selected}
                    at={loans.data?.timestamp || 0n}
                  />
                </div>
                <div className="document section-space">
                  <b>32-byte batch reference / transfer memo</b>
                  <br />
                  <span className="address">{selected.batchRef}</span>
                  <br />
                  <br />
                  Borrower wallet:{" "}
                  <span className="address">{selected.borrower}</span>
                </div>
              </>
            )}
            <div className="flow section-space">
              {[
                ["Expected", "Fixture"],
                ["Prefunded", selected ? "Confirmed" : "Waiting"],
                ["Settlement", confirmation ? "Confirmed" : "Waiting"],
                ["Repaid", selected?.status === 3 ? "Confirmed" : "Waiting"],
                [
                  "Credit reopens",
                  selected?.status === 2
                    ? "Reapproval needed"
                    : "Principal repaid",
                ],
              ].map(([title, note], i) => (
                <div className="flow-step" key={title}>
                  <span>{i + 1}</span>
                  <b>{title}</b>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            <div className="document section-space">
              <b>Supporting document hash · simulated evidence</b>
              <br />
              <span className="address">{diligenceHash}</span>
            </div>
            <p className="text-note">
              The memo is a reconciliation identifier. It does not verify
              commercial receivables or automatically execute a callback.
            </p>
          </div>
        </Panel>
        <Panel title="Apply settlement payment" aside="ONE ATOMIC BATCH">
          <div className="panel-body">
            <p>
              A separate payer can settle the borrower’s debt directly.
              Approval, memo transfer, and debt allocation execute together.
            </p>
            <div className="document">
              <b>Demo provider wallet</b>
              <br />
              <span className="address">
                {deployment.demoSettlementProviderAddress}
              </span>
              <br />
              Any consenting wallet can repay; restored capacity belongs to the
              borrower.
            </div>
            <InterestTicker loan={selected} at={loans.data?.timestamp || 0n} />
            <div className="ledger-row">
              <span>Debt at latest block</span>
              <b>{money(selected?.debt, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Payment allocation</span>
              <b>Interest → principal</b>
            </div>
            <button
              className="primary-button full-width section-space"
              disabled={
                !tx.connected || tx.pending || !selected || selected.debt === 0n
              }
              onClick={() =>
                tx.run("Reconcile settlement repayment", async () => {
                  if (!selected) throw new Error("Select a loan.");
                  const [principal, , debt] = (await readVault("previewDebt", [
                    selected.id,
                  ])) as bigint[];
                  const maximum =
                    debt + projectedInterest(principal, 60n) + 10n;
                  return [
                    approveCall(maximum),
                    vaultCall("repaySettlement", [
                      selected.borrower,
                      selected.batchRef,
                      maximum,
                    ]),
                  ];
                })
              }
            >
              Repay matching settlement batch <span>◎</span>
            </button>
            <div className="text-note">
              The contract pulls only execution-time debt within a bounded
              approval. Funds do not sit in the vault waiting for an off-chain
              watcher to reduce the loan.
            </div>
            <TxStatus {...tx} />
          </div>
        </Panel>
      </div>
      <Panel
        title="Confirmed settlement payments"
        aside="ON-CHAIN EVENTS"
        className="section-space"
      >
        <ActivityList events={reconciled} limit={10} />
      </Panel>
    </>
  );
}
