"use client";
import { useEffect } from "react";
import { usePool, useLoans, useActivity } from "@/lib/hooks";
import { alpha, utilization } from "@/lib/format";
import deployment from "@/lib/deployment.json";
import {
  ActivityList,
  LoanTable,
  Metric,
  PageHeader,
  Panel,
  QueryError,
  SnapshotTime,
} from "@/components/ui";
import { HistoryChart } from "@/components/history-chart";
import { InvestorActions } from "@/components/investor-actions";
import { LoanDetail, useLoanSelection } from "@/components/loan-detail";
import { Badge } from "@/components/ui/badge";
export default function PoolPage() {
  const pool = usePool(),
    loans = useLoans(),
    activity = useActivity();
  const selected = useLoanSelection();
  const s = pool.data?.snapshot;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("repay") === "settlement" &&
      !params.has("loan") &&
      loans.data
    ) {
      const loan = loans.data.loans.find((loan) => loan.debt > 0n);
      if (loan) selected.select(loan, "settlement");
    }
  }, [loans.data, selected]);

  return (
    <>
      <PageHeader
        title="Payment Finance Vault Share"
        subtitle="tPF · Transferable ownership of a pool financing remittance settlement delays."
        actions={<InvestorActions onlyDeposit />}
      />
      <section className="position-hero pool-hero">
        <div>
          <p>Value per tPF</p>
          <h2>{alpha(pool.data?.sharePrice, 6)}</h2>
          <span>Current estimated AlphaUSD value of one whole tPF share.</span>
        </div>
        <Badge variant="secondary">tPF / AlphaUSD</Badge>
      </section>
      <HistoryChart />
      <div className="metrics section-space">
        <Metric
          label="Total pool assets"
          value={alpha(s?.nav, 6)}
          note="All investors · Cash + active principal + interest"
        />
        <Metric
          label="Available pool cash"
          value={alpha(s?.cash)}
          note="Shared liquidity held in the vault"
        />
        <Metric
          label="Outstanding principal"
          value={alpha(s?.principal)}
          note="Active loans carried at face value"
        />
        <Metric
          label="Pool utilization"
          value={utilization(s?.principal, s?.nav)}
          note="Active principal / total pool assets"
        />
      </div>
      <div className="grid-two grid-equal">
        <Panel title="Pool earnings and losses">
          <div className="panel-body">
            <div className="ledger-row">
              <span>Accrued active interest</span>
              <b>{alpha(s?.interest, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Interest collected</span>
              <b>{alpha(s?.interestPaid, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Recognized write-offs</span>
              <b>{alpha(s?.writtenOff, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Debt recovered</span>
              <b>{alpha(s?.recovered, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Borrower pricing</span>
              <b>18% APR · 4.93 bps/day</b>
            </div>
            <p className="text-note">
              Investor returns depend on utilization and losses. Borrower APR is
              not an investor APY.
            </p>
          </div>
        </Panel>
        <Panel title="Withdrawal conditions">
          <div className="panel-body">
            <p>
              Withdrawals use a FIFO queue. Shares are valued when the request
              is processed and remain exposed to earnings and losses while
              queued.
            </p>
            <div className="ledger-row">
              <span>Minimum request</span>
              <b>10 tPF</b>
            </div>
            <div className="ledger-row">
              <span>Pending requests</span>
              <b>{s?.pendingRequests.toString() || "—"}</b>
            </div>
            <div className="ledger-row">
              <span>Processing</span>
              <Badge variant={s?.hasOverdue ? "default" : "secondary"}>
                {!s
                  ? "Loading"
                  : s.hasOverdue
                    ? "Blocked · Overdue debt"
                    : "Available when funded"}
              </Badge>
            </div>
            <p className="text-note">
              An overdue active loan blocks processing until repayment or
              write-off. Payouts require sufficient cash for the complete head
              request.
            </p>
          </div>
        </Panel>
      </div>
      <Panel
        title="Credit exposure"
        className="section-space"
        aside="Public loan ledger"
      >
        <QueryError
          error={loans.error}
          label="loan ledger"
          retry={() => loans.refetch()}
        />
        <LoanTable
          loans={loans.data?.loans}
          at={loans.data?.timestamp}
          onSelect={selected.select}
        />
      </Panel>
      <Panel title="Pool activity" className="section-space">
        <QueryError
          error={activity.error}
          label="pool activity"
          retry={() => activity.refetch()}
        />
        <ActivityList events={activity.data} limit={8} />
      </Panel>
      <details className="how-it-works">
        <summary>How the pool works</summary>
        <p>
          Investors deposit AlphaUSD and receive tPF. Approved remittance
          companies borrow to bridge settlement delays, paying 18% simple annual
          interest on outstanding principal by elapsed time. Principal repayment
          restores their credit capacity.
        </p>
        <p>
          tPF represents proportional ownership of cash and active loan
          receivables. Recognized write-offs reduce share value; recoveries
          benefit holders at recovery time. Credit is unsecured and approved
          manually.
        </p>
        <p>
          Settlement and underwriting records are simulated fixtures. Token
          transfers, interest, repayments, and share accounting are on-chain
          testnet activity.
        </p>
        <a
          href={`${deployment.explorerUrl}/address/${deployment.vaultAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          View vault and tPF contract ↗
        </a>
      </details>
      <SnapshotTime />
      <LoanDetail
        loan={loans.data?.loans.find((loan) => loan.id === selected.id)}
        at={loans.data?.timestamp || 0n}
        onClose={() => selected.select()}
      />
    </>
  );
}
