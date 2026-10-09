"use client";
import { useEffect } from "react";
import { usePool, useLoans, useActivity, useRedemptions } from "@/lib/hooks";
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
import {
  AssetComposition,
  LendingActivity,
  WithdrawalLiquidity,
} from "@/components/pool-panels";
export default function PoolPage() {
  const pool = usePool(),
    loans = useLoans(),
    activity = useActivity(),
    redemptions = useRedemptions();
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
      <div className="pool-dashboard">
        <PageHeader
          title="Payment Finance Vault Share"
          subtitle="tPF · Transferable ownership of a pool financing remittance settlement delays."
          actions={<InvestorActions onlyDeposit />}
        />
        <div className="pool-data-source">
          <SnapshotTime />
          <a
            href={`${deployment.explorerUrl}/address/${deployment.vaultAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            On-chain source ↗
          </a>
        </div>
        <div className="metrics pool-headline-metrics">
          <Metric
            label="Value per tPF"
            value={alpha(pool.data?.sharePrice, 6)}
            note="Estimated value of one whole tPF share"
          />
          <Metric
            label="Total pool assets"
            value={alpha(s?.nav)}
            note="All investors · Cash + active principal + interest"
          />
          <Metric
            label="Available pool cash"
            value={alpha(s?.cash)}
            note="Shared liquidity held in the vault"
          />
          <Metric
            label="Pool utilization"
            value={s ? utilization(s.principal, s.nav) : "—"}
            note="Active principal / total pool assets"
          />
        </div>
        <div className="grid-two grid-equal">
          <AssetComposition snapshot={s} />
          <WithdrawalLiquidity
            snapshot={s}
            requests={redemptions.data}
            error={redemptions.error || activity.error}
            retry={async () => {
              await activity.refetch();
              return redemptions.refetch();
            }}
          />
        </div>
        <div className="pool-history section-space">
          <HistoryChart composition />
        </div>
        <LendingActivity
          loans={loans.data?.loans}
          events={activity.data}
          block={loans.data?.blockNumber}
          at={loans.data?.timestamp}
          error={loans.error || activity.error}
          retry={async () => {
            await activity.refetch();
            return loans.refetch();
          }}
        />
        <div className="grid-two grid-equal section-space pool-detail-grid">
          <Panel title="Credit exposure" aside="Public loan ledger">
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
              <p className="text-note">
                Accrued interest is part of current pool assets. Collected
                interest, write-offs and recoveries are cumulative since
                deployment.
              </p>
            </div>
          </Panel>
        </div>
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
            companies borrow to bridge settlement delays, paying 18% simple
            annual interest on outstanding principal by elapsed time. Principal
            repayment restores their credit capacity.
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
      </div>
      <LoanDetail
        loan={loans.data?.loans.find((loan) => loan.id === selected.id)}
        at={loans.data?.timestamp || 0n}
        onClose={() => selected.select()}
      />
    </>
  );
}
