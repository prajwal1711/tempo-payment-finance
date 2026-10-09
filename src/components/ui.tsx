"use client";
import { useEffect, useState } from "react";
import { usePool } from "@/lib/hooks";
import { explorer } from "@/lib/chain";
import { alpha, shares, short, timestamp } from "@/lib/format";
import type { Activity, LoanRecord } from "@/lib/types";
import type { Hash } from "viem";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import {
  CircleAlert,
  ArrowUpRight,
  LoaderCircle,
  Check,
  ArrowRightLeft,
} from "lucide-react";
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  const pool = usePool();
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      <QueryError
        error={pool.error}
        retry={() => pool.refetch()}
        label="pool snapshot"
      />
    </>
  );
}
export function SnapshotTime() {
  const pool = usePool();
  return (
    <p className="snapshot">
      {pool.data
        ? `Block ${pool.data.blockNumber.toLocaleString()} · ${timestamp(pool.data.snapshot.timestamp)}`
        : "Loading on-chain snapshot…"}
    </p>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
  icon?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
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
        {aside && <div>{aside}</div>}
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
  if (!stage && !error) return null;
  return (
    <Alert className="transaction-status" role={error ? "alert" : "status"}>
      {error ? (
        <CircleAlert />
      ) : pending ? (
        <LoaderCircle className="animate-spin" />
      ) : (
        <Check />
      )}
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>
        {error || stage}
        {hash && (
          <a href={explorer(hash)} target="_blank" rel="noreferrer">
            {short(hash)} · View receipt ↗
          </a>
        )}
      </AlertDescription>
    </Alert>
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
        <span>{label}</span>
        <div className="input-wrap">
          <Input
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
    <Badge variant={overdue || loan.status === 2 ? "default" : "secondary"}>
      {loan.status === 2
        ? "Written off"
        : loan.status === 3
          ? "Settled"
          : overdue
            ? "Overdue"
            : "Active"}
    </Badge>
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
  if (!loans.length)
    return <div className="empty">No loans originated yet.</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Loan / batch</TableHead>
          <TableHead>Principal</TableHead>
          <TableHead>Interest</TableHead>
          <TableHead>Due · UTC</TableHead>
          <TableHead>Status</TableHead>
          {onSelect && (
            <TableHead>
              <span className="sr-only">Details</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loans.map((loan) => (
          <TableRow key={String(loan.id)}>
            <TableCell>
              PF-{loan.id.toString().padStart(3, "0")}
              <small title={loan.batchRef}>{short(loan.batchRef)}</small>
              <small title={loan.borrower}>{short(loan.borrower)}</small>
            </TableCell>
            <TableCell>
              {alpha(loan.principalOutstanding)}
              <small>{alpha(loan.originalPrincipal)} originated</small>
            </TableCell>
            <TableCell>{alpha(loan.interest, 6)}</TableCell>
            <TableCell>{timestamp(loan.dueAt)}</TableCell>
            <TableCell>
              <LoanStatus loan={loan} at={at} />
            </TableCell>
            {onSelect && (
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelect(loan)}
                >
                  Details <ArrowUpRight size={14} />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
    loan?.status === 1 && at + BigInt(tick) > loan.lastAccruedAt
      ? at + BigInt(tick) - loan.lastAccruedAt
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
      <span>Accrued interest · estimate between blocks</span>
      <strong>{alpha(interest, 6)}</strong>
      <small>18% simple APR · 4.93 bps/day</small>
    </div>
  );
}
export function ActivityList({
  events = [],
  limit = 6,
  transfers = false,
}: {
  events?: Activity[];
  limit?: number;
  transfers?: boolean;
}) {
  const meaningful = events
    .filter(
      (event) =>
        ![
          "Approval",
          "OwnershipTransferStarted",
          ...(!transfers ? ["Transfer"] : []),
        ].includes(event.eventName),
    )
    .slice(-limit)
    .reverse();
  if (!meaningful.length)
    return <div className="empty">No confirmed transactions to display.</div>;
  const names: Record<string, string> = {
    Deposit: "Deposit",
    Transfer: "Share transfer",
    LoanDrawn: "Credit drawn",
    LoanRepaid: "Loan repayment",
    SettlementRepaid: "Settlement repayment",
    LoanWrittenOff: "Loss recognized",
    LoanRecovered: "Debt recovered",
    RedemptionRequested: "Withdrawal requested",
    RedemptionProcessed: "Withdrawal paid",
    RedemptionCancelled: "Withdrawal cancelled",
    BorrowerConfigured: "Borrower configured",
    PauseChanged: "Pool controls updated",
    OwnershipTransferred: "Manager assigned",
  };
  return (
    <div>
      {meaningful.map((event) => (
        <div
          className="activity-item"
          key={`${event.transactionHash}-${event.logIndex}`}
        >
          <ArrowRightLeft size={17} />
          <div>
            <b>{names[event.eventName] || event.eventName}</b>
            <small>
              Block {event.blockNumber.toString()} ·{" "}
              {short(event.transactionHash)}
              {typeof event.args.assets === "bigint" &&
                ` · ${alpha(event.args.assets, 6)}`}
              {typeof event.args.value === "bigint" &&
                ` · ${shares(event.args.value)} tPF`}
            </small>
          </div>
          <a
            href={explorer(event.transactionHash)}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${names[event.eventName] || event.eventName} receipt`}
          >
            Receipt <ArrowUpRight size={14} />
          </a>
        </div>
      ))}
    </div>
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
    <Alert className="query-error">
      <CircleAlert />
      <AlertTitle>Unable to load {label}</AlertTitle>
      <AlertDescription>
        {message}
        <Button variant="outline" size="sm" onClick={() => void retry()}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
