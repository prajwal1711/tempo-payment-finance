"use client";
import Link from "next/link";
import { alpha, shares, timestamp } from "@/lib/format";
import type { Activity, LoanRecord, Redemption, Snapshot } from "@/lib/types";
import { Metric, Panel, QueryError } from "./ui";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

function fraction(amount: bigint, total: bigint) {
  if (!total) return "0.00%";
  const bps = (amount * 10_000n) / total;
  return amount && !bps ? "<0.01%" : `${(Number(bps) / 100).toFixed(2)}%`;
}

export function AssetComposition({ snapshot }: { snapshot?: Snapshot }) {
  const parts = [
    {
      label: "Available cash",
      amount: snapshot?.cash,
      color: "#18181b",
      note: "AlphaUSD held in the vault",
    },
    {
      label: "Loan principal",
      amount: snapshot?.principal,
      color: "#a1a1aa",
      note: "Unsecured active receivables",
    },
    {
      label: "Accrued interest",
      amount: snapshot?.interest,
      color: "#e4e4e7",
      note: "Earned on active loans; not yet received",
    },
  ];
  return (
    <Panel title="Where pool assets are" aside="All investors">
      <div className="panel-body composition-body">
        <div className="composition-total">
          <span>Total pool assets</span>
          <strong>{alpha(snapshot?.nav, 6)}</strong>
        </div>
        <div
          className="allocation-bar"
          role="img"
          aria-label={
            snapshot
              ? parts
                  .map(
                    (p) =>
                      `${p.label}: ${alpha(p.amount, 6)}, ${fraction(p.amount!, snapshot.nav)}`,
                  )
                  .join("; ")
              : "Loading asset composition"
          }
        >
          {snapshot?.nav ? (
            parts.map((part) => (
              <span
                key={part.label}
                style={{
                  width: `${Number((part.amount! * 1_000_000n) / snapshot.nav) / 10_000}%`,
                  background: part.color,
                }}
              />
            ))
          ) : (
            <span className="allocation-empty" />
          )}
        </div>
        <div className="allocation-rows">
          {parts.map((part) => (
            <div className="allocation-row" key={part.label}>
              <div>
                <span
                  className="legend-swatch"
                  style={{ background: part.color }}
                />
                <b>{part.label}</b>
                <small>{part.note}</small>
              </div>
              <div>
                <b>{alpha(part.amount, 6)}</b>
                <small>
                  {snapshot ? fraction(part.amount!, snapshot.nav) : "—"}
                </small>
              </div>
            </div>
          ))}
        </div>
        <p className="text-note">
          Loan receivables are carried at face value until repayment or
          write-off. Pool assets are not all available cash.
        </p>
      </div>
    </Panel>
  );
}

export function WithdrawalLiquidity({
  snapshot,
  requests,
  error,
  retry,
}: {
  snapshot?: Snapshot;
  requests?: Redemption[];
  error: Error | null;
  retry: () => Promise<unknown>;
}) {
  const pending =
    snapshot?.pendingRequests === 0n
      ? []
      : requests
          ?.filter((r) => r.status === 1)
          .sort((a, b) => (a.id < b.id ? -1 : 1)) || [];
  const coherent =
    snapshot &&
    (snapshot.pendingRequests === 0n ||
      (requests && BigInt(pending.length) === snapshot.pendingRequests));
  const queuedShares = coherent
    ? pending.reduce((sum, r) => sum + r.shares, 0n)
    : undefined;
  const payouts = coherent
    ? pending.reduce((sum, r) => sum + r.estimatedAssets, 0n)
    : undefined;
  const head = coherent ? pending[0] : undefined;
  const shortfall =
    snapshot && payouts !== undefined
      ? payouts > snapshot.cash
        ? payouts - snapshot.cash
        : 0n
      : undefined;
  const state = !snapshot
    ? "Loading"
    : snapshot.hasOverdue
      ? "Blocked · Overdue debt"
      : !snapshot.pendingRequests
        ? "No pending requests"
        : !head
          ? "Reading queue"
          : head.estimatedAssets > snapshot.cash
            ? "Waiting for liquidity"
            : "Head request can be paid";
  return (
    <Panel
      title="Withdrawal liquidity"
      aside={
        <Badge variant={snapshot?.hasOverdue ? "default" : "secondary"}>
          {state}
        </Badge>
      }
    >
      <div className="panel-body withdrawal-summary">
        <div className="withdrawal-totals">
          <div>
            <span>Available pool cash</span>
            <strong>{alpha(snapshot?.cash)}</strong>
          </div>
          <div>
            <span>Estimated queued payouts</span>
            <strong>{alpha(payouts)}</strong>
          </div>
        </div>
        <QueryError error={error} retry={retry} label="withdrawal queue" />
        <div className="ledger-row">
          <span>Pending requests</span>
          <b>{snapshot?.pendingRequests.toString() || "—"}</b>
        </div>
        <div className="ledger-row">
          <span>Shares queued</span>
          <b>{shares(queuedShares)} tPF</b>
        </div>
        <div className="ledger-row">
          <span>Cash shortfall for the full queue</span>
          <b>{alpha(shortfall)}</b>
        </div>
        <div className="ledger-row">
          <span>Head request</span>
          <b>
            {head
              ? `#${head.id} · ${alpha(head.estimatedAssets)}`
              : snapshot?.pendingRequests === 0n
                ? "None"
                : "—"}
          </b>
        </div>
        <p className="text-note">
          FIFO · Minimum 10 tPF · Payout value is set at processing. An overdue
          active loan blocks processing; otherwise the complete head request
          must fit available cash.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/portfolio/withdrawals">Your withdrawals</Link>
        </Button>
      </div>
    </Panel>
  );
}

export function LendingActivity({
  loans,
  events,
  block,
  at,
  error,
  retry,
}: {
  loans?: LoanRecord[];
  events?: Activity[];
  block?: bigint;
  at?: bigint;
  error: Error | null;
  retry: () => Promise<unknown>;
}) {
  const active = loans?.filter((loan) => loan.status === 1);
  const originated = loans?.reduce(
    (sum, loan) => sum + loan.originalPrincipal,
    0n,
  );
  // LoanRepaid already covers recoveries; counting LoanRecovered again would duplicate cash.
  const repaid =
    events && block !== undefined
      ? events
          .filter((e) => e.blockNumber <= block && e.eventName === "LoanRepaid")
          .reduce(
            (sum, e) =>
              sum +
              (typeof e.args.paidPrincipal === "bigint"
                ? e.args.paidPrincipal
                : 0n),
            0n,
          )
      : undefined;
  const overdue =
    active && at !== undefined
      ? active.filter((loan) => at > loan.dueAt)
      : undefined;
  const overdueDebt = overdue?.reduce((sum, loan) => sum + loan.debt, 0n);
  const nextDue = active?.reduce<bigint | undefined>(
    (first, loan) =>
      first === undefined || loan.dueAt < first ? loan.dueAt : first,
    undefined,
  );
  return (
    <Panel
      title="Lending activity"
      className="section-space"
      aside="Since deployment · Actual testnet activity"
    >
      <QueryError error={error} retry={retry} label="lending activity" />
      <div className="metrics lending-metrics">
        <Metric
          label="Credit originated"
          value={alpha(originated)}
          note={`${loans ? loans.length : "—"} loans drawn · Cumulative principal`}
        />
        <Metric
          label="Principal repaid"
          value={alpha(repaid)}
          note="Includes recovered principal · Excludes interest"
        />
        <Metric
          label="Active loans"
          value={active ? `${active.length}` : "—"}
          note={`${active ? new Set(active.map((loan) => loan.borrower.toLowerCase())).size : "—"} borrowers with active debt`}
        />
        <Metric
          label="Overdue exposure"
          value={alpha(overdueDebt, 6)}
          note={`${overdue ? overdue.length : "—"} overdue loans · Principal + interest`}
        />
      </div>
      <div className="lending-context">
        <span>
          Next active maturity{" "}
          <b>
            {nextDue !== undefined
              ? timestamp(nextDue)
              : loans
                ? "No active loans"
                : "—"}
          </b>
        </span>
        <span>
          Borrower pricing <b>18% APR · 4.93 bps/day</b>
        </span>
      </div>
      <p className="text-note">
        Investor returns depend on utilization and losses. Credit originated and
        principal repaid measure capital moving through the pool, not investor
        earnings.
      </p>
    </Panel>
  );
}
