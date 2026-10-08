"use client";
import { useEffect, useState } from "react";
import { usePool } from "@/lib/hooks";
import { explorer } from "@/lib/chain";
import { money, short, timestamp } from "@/lib/format";
import type { Activity, LoanRecord } from "@/lib/types";
import type { Hash } from "viem";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  const pool = usePool();
  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
        <div className="snapshot">
          <span className="status-dot" />
          ON-CHAIN SNAPSHOT
          <br />
          <b>
            {pool.data
              ? `Block ${pool.data.blockNumber.toLocaleString()}`
              : "Connecting to Tempo…"}
          </b>
          <br />
          {pool.data
            ? timestamp(pool.data.snapshot.timestamp)
            : "Read-only access available"}
        </div>
      </div>
      {pool.error && (
        <div className="transaction-error" role="alert">
          Unable to load pool: {pool.error.message}
          <button
            className="secondary-button"
            style={{ marginLeft: 12 }}
            onClick={() => pool.refetch()}
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
}
export function Metric({
  label,
  value,
  note,
  icon = "↗",
}: {
  label: string;
  value: string;
  note: string;
  icon?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <span aria-hidden>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <h2>{title}</h2>
        {aside && <span>{aside}</span>}
      </div>
      {children}
    </section>
  );
}
export function TxStatus({
  pending,
  label,
  stage,
  hash,
  error,
}: {
  pending: boolean;
  label?: string;
  stage?: string;
  hash?: Hash;
  error?: string;
}) {
  if (error)
    return (
      <div className="transaction-error" role="alert">
        <b>{label}</b>
        <br />
        {error}
      </div>
    );
  if (!stage) return null;
  return (
    <div className="transaction-status" role="status">
      <b>
        {pending ? "◌ " : "✓ "}
        {label}
      </b>
      <br />
      {stage}
      {hash && (
        <>
          <br />
          <a href={explorer(hash)} target="_blank" rel="noreferrer">
            {short(hash)} — view receipt ↗
          </a>
        </>
      )}
    </div>
  );
}
export function AmountField({
  label,
  value,
  onChange,
  token = "AlphaUSD",
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  token?: string;
  note?: string;
}) {
  return (
    <div className="form-field">
      <label>
        {label}
        <div className="input-wrap" style={{ marginTop: 9 }}>
          <input
            aria-label={label}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
          />
          <span>{token}</span>
        </div>
      </label>
      {note && <small>{note}</small>}
    </div>
  );
}
export function LoanStatus({ loan, at }: { loan: LoanRecord; at: bigint }) {
  const overdue = loan.status === 1 && at > loan.dueAt;
  return (
    <span
      className={`badge ${overdue || loan.status === 2 ? "danger" : loan.status === 3 ? "muted" : ""}`}
    >
      {loan.status === 2
        ? "WRITTEN OFF"
        : loan.status === 3
          ? "SETTLED"
          : overdue
            ? "OVERDUE"
            : "ACTIVE"}
    </span>
  );
}
export function LoanTable({
  loans,
  at = 0n,
  onSelect,
}: {
  loans?: LoanRecord[];
  at?: bigint;
  onSelect?: (loan: LoanRecord) => void;
}) {
  if (!loans)
    return <div className="empty">Loading confirmed loan records…</div>;
  return loans.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Loan / batch</th>
            <th>Principal</th>
            <th>Interest</th>
            <th>Due</th>
            <th>Status</th>
            {onSelect && <th />}
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={String(loan.id)}>
              <td>
                PF-{loan.id.toString().padStart(3, "0")}
                <small title={loan.batchRef}>{short(loan.batchRef)}</small>
              </td>
              <td>
                {money(loan.principalOutstanding)}
                <small>{money(loan.originalPrincipal)} originated</small>
              </td>
              <td>{money(loan.interest, 6)}</td>
              <td>{timestamp(loan.dueAt)}</td>
              <td>
                <LoanStatus loan={loan} at={at} />
              </td>
              {onSelect && (
                <td>
                  <button
                    className="secondary-button"
                    onClick={() => onSelect(loan)}
                  >
                    View →
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty">
      No loans originated yet.
      <br />
      Approved borrowers can draw from available pool liquidity.
    </div>
  );
}
export function InterestTicker({
  loan,
  at,
}: {
  loan?: LoanRecord;
  at: bigint;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [at]);
  const elapsed =
    loan && loan.status === 1
      ? at + BigInt(tick) > loan.lastAccruedAt
        ? at + BigInt(tick) - loan.lastAccruedAt
        : 0n
      : 0n;
  const interest = loan
    ? loan.status === 1
      ? loan.interestAccrued +
        (loan.principalOutstanding * 1800n * elapsed + loan.accrualRemainder) /
          315_360_000_000n
      : loan.interest
    : 0n;
  return (
    <div className="live-ticker">
      <div>
        <label>ELAPSED-TIME INTEREST · ESTIMATE BETWEEN BLOCKS</label>
        <strong>{money(interest, 6)}</strong>
      </div>
      <small>
        <span className="status-dot" />
        18% simple APR
      </small>
    </div>
  );
}
export function ActivityList({
  events = [],
  limit = 5,
}: {
  events?: Activity[];
  limit?: number;
}) {
  const meaningful = events
    .filter(
      (event) =>
        !["Transfer", "Approval", "OwnershipTransferStarted"].includes(
          event.eventName,
        ),
    )
    .slice(-limit)
    .reverse();
  if (!meaningful.length)
    return (
      <div className="empty">Confirmed contract activity will appear here.</div>
    );
  const names: Record<string, string> = {
    Deposit: "Capital deposited",
    LoanDrawn: "Credit drawn",
    LoanRepaid: "Loan repayment",
    SettlementRepaid: "Settlement reconciled",
    LoanWrittenOff: "Loss recognized",
    LoanRecovered: "Debt recovered",
    RedemptionRequested: "Redemption queued",
    RedemptionProcessed: "Investor paid",
    RedemptionCancelled: "Redemption cancelled",
    BorrowerConfigured: "Borrower configured",
    PauseChanged: "Pool controls updated",
    OwnershipTransferred: "Manager assigned",
  };
  return (
    <>
      {meaningful.map((event) => (
        <div
          className="activity-item"
          key={`${event.transactionHash}-${event.logIndex}`}
        >
          <span className="activity-icon">
            {event.eventName === "SettlementRepaid" ? "◎" : "↗"}
          </span>
          <div>
            {names[event.eventName] || event.eventName}
            <small>
              Block {event.blockNumber.toString()} ·{" "}
              {short(event.transactionHash)}
            </small>
          </div>
          <a
            href={explorer(event.transactionHash)}
            target="_blank"
            rel="noreferrer"
          >
            Receipt ↗
          </a>
        </div>
      ))}
    </>
  );
}

export function QueryError({
  error,
  retry,
  label,
}: {
  error: Error | null;
  retry: () => Promise<unknown>;
  label: string;
}) {
  if (!error) return null;
  const message =
    "shortMessage" in error
      ? String(error.shortMessage)
      : error.message.split("\n")[0];
  return (
    <div className="transaction-error" role="alert">
      Unable to load {label}: {message}
      <button
        className="secondary-button"
        style={{ marginLeft: 12 }}
        onClick={() => void retry()}
      >
        Retry
      </button>
    </div>
  );
}
