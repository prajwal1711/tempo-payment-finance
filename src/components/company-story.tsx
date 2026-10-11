"use client";
import {
  Building2,
  ArrowRight,
  Clock3,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { sampleCompany, companyName, isSampleCompany } from "@/lib/company";
import { alpha, projectedInterest, timestamp } from "@/lib/format";
import { useLoans, usePool } from "@/lib/hooks";
import type { LoanRecord } from "@/lib/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { LoanStatus } from "./ui";

export function CompanyStory({
  loans,
  at = 0n,
  onSelect,
}: {
  loans?: LoanRecord[];
  at?: bigint;
  onSelect?: (loan: LoanRecord) => void;
}) {
  const relevant = loans?.filter((loan) => isSampleCompany(loan.borrower));
  const loan =
    relevant?.find((loan) => loan.status === 1) ||
    relevant?.find((loan) => loan.debt > 0n) ||
    relevant?.[0];
  return (
    <section className="company-story">
      <div className="company-story-heading">
        <div className="company-identity">
          <span className="company-avatar">
            <Building2 size={24} />
          </span>
          <div>
            <h2>{sampleCompany.name}</h2>
            <p>Remittance company · {sampleCompany.corridor}</p>
          </div>
        </div>
        <Badge variant="secondary">Simulated company</Badge>
      </div>
      <p className="company-need">
        Alpha Remit’s sample funding request:{" "}
        <b>{alpha(sampleCompany.fundingAmount, 0)}</b> to prefund UK → India
        payouts against an expected card-settlement inflow.
      </p>
      <div className="company-story-facts">
        <div>
          <span>Expected card settlement</span>
          <b>{alpha(sampleCompany.settlementAmount, 0)}</b>
          <small>Illustrative settlement record</small>
        </div>
        <div>
          <span>Settlement wait</span>
          <b>48 hours</b>
          <small>Borrowing bridges this delay</small>
        </div>
        <div>
          <span>Estimated 48-hour loan cost</span>
          <b>
            {alpha(
              projectedInterest(
                sampleCompany.fundingAmount,
                sampleCompany.delaySeconds,
              ),
            )}
          </b>
          <small>Borrower pricing · 18% simple APR</small>
        </div>
      </div>
      <div className="company-loan-summary">
        <div>
          {loan ? (
            <>
              <LoanStatus loan={loan} at={at} />
              <span>
                Loan PF-{loan.id.toString().padStart(3, "0")} ·{" "}
                {alpha(loan.principalOutstanding)} principal · Due{" "}
                {timestamp(loan.dueAt)}
              </span>
            </>
          ) : (
            <span>
              {loans
                ? "No loan has been drawn by Alpha Remit."
                : "Reading Alpha Remit’s actual loan status…"}
            </span>
          )}
        </div>
        {loan && onSelect && (
          <Button variant="outline" size="sm" onClick={() => onSelect(loan)}>
            View company loan <ArrowRight size={14} />
          </Button>
        )}
      </div>
      <p className="text-note">
        The business and expected settlement are simulated. Loan amounts,
        repayment deadlines and payment confirmations are actual testnet data.
      </p>
    </section>
  );
}

export function OverdueNotice() {
  const pool = usePool(),
    loans = useLoans();
  if (!pool.data?.snapshot.hasOverdue) return null;
  const overdue = loans.data?.loans.filter(
    (loan) => loan.status === 1 && loans.data!.timestamp > loan.dueAt,
  );
  const names = [
    ...new Set(overdue?.map((loan) => companyName(loan.borrower))),
  ];
  return (
    <div className="notice notice-danger" role="status">
      <CircleAlert size={18} />
      <div>
        <b>Redemption processing blocked · Overdue loan</b>
        <p>
          {names.length ? names.join(", ") : "A borrowing company"} has missed a
          loan repayment deadline. Processing resumes after repayment or manager
          write-off. Requests and cancellations remain available.
        </p>
      </div>
    </div>
  );
}

export function WithdrawalStatus({
  status,
  blocked,
  waitingCash = false,
  queuePosition,
}: {
  status: number;
  blocked?: boolean;
  waitingCash?: boolean;
  queuePosition?: number;
}) {
  const done = status === 2,
    cancelled = status === 3;
  const tone = done
    ? "success"
    : blocked && status === 1
      ? "danger"
      : status === 1
        ? "warning"
        : "neutral";
  const Icon = done ? CircleCheck : blocked ? CircleAlert : Clock3;
  const text = done
    ? "Paid"
    : cancelled
      ? "Cancelled"
      : status !== 1
        ? "Unknown status"
        : blocked
          ? "Blocked · Overdue company loan"
          : queuePosition && queuePosition > 1
            ? "Pending · Earlier FIFO requests"
            : waitingCash
              ? "Pending · Insufficient pool cash"
              : "Pending · Awaiting processing";
  return (
    <Badge variant="secondary" className={`status-badge status-${tone}`}>
      <Icon size={12} />
      {text}
    </Badge>
  );
}
