"use client";
import Link from "next/link";
import { useActivity, useLoans, usePool } from "@/lib/hooks";
import { money, shares, utilization } from "@/lib/format";
import {
  ActivityList,
  LoanTable,
  Metric,
  PageHeader,
  Panel,
  QueryError,
} from "@/components/ui";

export default function Overview() {
  const pool = usePool();
  const loans = useLoans();
  const activity = useActivity();
  const s = pool.data?.snapshot;
  const used = s?.nav ? Number((s.principal * 10_000n) / s.nav) / 100 : 0;
  return (
    <>
      <PageHeader
        eyebrow="Capital that keeps payments moving"
        title="Finance the hours in between."
        subtitle="Remittance payouts happen now. Settlement arrives later. A revolving credit pool bridges the gap, with interest measured by the second."
      />
      <QueryError
        error={loans.error}
        retry={() => loans.refetch()}
        label="credit ledger"
      />
      <QueryError
        error={activity.error}
        retry={() => activity.refetch()}
        label="activity history"
      />

      <section className="hero">
        <div>
          <p className="eyebrow">TOTAL POOL VALUE</p>
          <div className="hero-value">
            {money(s?.nav)}
            <small>AlphaUSD</small>
          </div>
          <p>
            Cash + active principal + accrued interest.
            <br />
            Recognized losses reduce the value of every share.
          </p>
          <span
            className="badge"
            style={{
              background: "#345c46",
              borderColor: "#56735a",
              color: "#d4e8bb",
            }}
          >
            LIVE TESTNET ACCOUNTING
          </span>
        </div>
        <div className="hero-right">
          <div className="hero-row">
            <label>Capital utilization</label>
            <b>{utilization(s?.principal, s?.nav)}</b>
          </div>
          <div className="hero-progress">
            <span style={{ width: `${Math.min(100, used)}%` }} />
          </div>
          <div className="hero-legend">
            <span>
              <i />
              Credit outstanding
            </span>
            <span>
              <i />
              Available cash
            </span>
          </div>
          <div className="hero-row">
            <label>Borrower pricing</label>
            <b>
              18%<small>APR / 4.93 bps per day</small>
            </b>
          </div>
        </div>
      </section>
      <div className="metrics">
        <Metric
          label="Available cash"
          value={money(s?.cash)}
          note="Liquidity held by the vault"
        />
        <Metric
          label="Principal outstanding"
          value={money(s?.principal)}
          note="Active credit at carrying value"
          icon="⇄"
        />
        <Metric
          label="Accrued interest"
          value={money(s?.interest, 6)}
          note="Simple interest · actual elapsed time"
          icon="◷"
        />
        <Metric
          label="Share redemption value"
          value={money(pool.data?.sharePrice, 6)}
          note="Per tPF · variable, not a fixed dollar peg"
          icon="◈"
        />
      </div>
      <div className="grid-two">
        <Panel
          title="A settlement gap, closed"
          aside="THE PAYMENT-FINANCE CYCLE"
        >
          <div className="panel-body">
            <div className="flow">
              {[
                ["Deposit", "Investors"],
                ["Draw", "Remittance"],
                ["Prefund", "Borrower"],
                ["Settle", "Demo provider"],
                ["Repay", "Credit reopens"],
              ].map(([title, note], i) => (
                <div className="flow-step" key={title}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <b>{title}</b>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            <p className="text-note">
              A fictional UK → India remittance company finances a 48-hour
              card-settlement delay. The borrower handles FX and destination
              payouts.{" "}
              <strong>
                Loan payments and debt reduction are atomic on Tempo.
              </strong>
            </p>
            <div className="button-row">
              <Link href="/borrow" className="primary-button">
                Explore the credit line <span>→</span>
              </Link>
              <Link href="/settlement" className="secondary-button">
                View settlement records ↗
              </Link>
            </div>
          </div>
        </Panel>
        <Panel title="Pool balance sheet" aside="FROM THE CONTRACT">
          <div className="panel-body">
            <div className="ledger-row">
              <span>AlphaUSD cash</span>
              <b>{money(s?.cash)}</b>
            </div>
            <div className="ledger-row">
              <span>Active principal receivable</span>
              <b>{money(s?.principal)}</b>
            </div>
            <div className="ledger-row">
              <span>Active interest receivable</span>
              <b>{money(s?.interest, 6)}</b>
            </div>
            <div className="ledger-row total">
              <span>Net asset value</span>
              <b>{money(s?.nav, 6)}</b>
            </div>
            <div className="text-note">
              {shares(s?.shares)} tPF shares issued. Pending exits retain
              exposure to earnings and losses until processing.
            </div>
          </div>
        </Panel>
      </div>
      <div className="section-space grid-two">
        <Panel
          title="Credit ledger"
          aside={`${loans.data?.loans.filter((l) => l.status === 1).length || 0} ACTIVE LOANS`}
        >
          <LoanTable
            loans={loans.data?.loans.slice(0, 4)}
            at={loans.data?.timestamp}
          />
        </Panel>
        <Panel title="Latest activity" aside="CONFIRMED RECEIPTS">
          <ActivityList events={activity.data} />
        </Panel>
      </div>
      <div className="split-cta">
        <div>
          <h3>Put idle capital to work.</h3>
          <p>
            Own a transferable share of the pool. Redemptions follow available
            liquidity and recognized losses.
          </p>
        </div>
        <Link href="/invest" className="primary-button">
          Open investor dashboard <span>↗</span>
        </Link>
      </div>
      <div className="notice section-space">
        Hackathon demonstration · AlphaUSD test tokens · Borrower underwriting
        and settlement evidence are simulated. Unsecured credit can lose value.
        Investor yield depends on utilization and losses.
      </div>
    </>
  );
}
