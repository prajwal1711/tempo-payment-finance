"use client";
import Link from "next/link";
import { useWorkspace } from "../workspace-context";
import {
  useActivity,
  usePool,
  usePosition,
  useRedemptions,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import { alpha, shares, timestamp } from "@/lib/format";
import { belongsToWallet } from "@/lib/history-core";
import {
  ActivityList,
  Metric,
  PageHeader,
  Panel,
  QueryError,
  SnapshotTime,
  TxStatus,
} from "../ui";
import { HistoryChart } from "../history-chart";
import { InvestorActions } from "../investor-actions";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
export function InvestorPage({
  view = "portfolio",
}: {
  view?: "portfolio" | "withdrawals" | "activity";
}) {
  const { investorAddress, demo } = useWorkspace();
  const pool = usePool(),
    position = usePosition(investorAddress),
    activity = useActivity(),
    redemptions = useRedemptions(),
    tx = useTransaction();
  const p = position.data,
    s = pool.data?.snapshot;
  const requests = redemptions.data?.filter(
    (r) => r.owner.toLowerCase() === investorAddress?.toLowerCase(),
  );
  const events = activity.data?.filter(
    (e) => investorAddress && belongsToWallet(e, investorAddress),
  );
  const pending = p?.pendingId
    ? requests?.find((r) => r.id === p.pendingId)
    : undefined;
  const queuePosition = pending
    ? redemptions.data?.filter((r) => r.status === 1 && r.id <= pending.id)
        .length
    : undefined;
  return (
    <>
      <PageHeader
        title={
          view === "portfolio"
            ? "My portfolio"
            : view === "withdrawals"
              ? "Withdrawals"
              : "My transactions"
        }
        subtitle={
          demo
            ? "Read-only demo position, using actual on-chain testnet balances."
            : "Your wallet’s ownership of the Payment Finance pool."
        }
        actions={
          investorAddress && view !== "activity" ? (
            <InvestorActions />
          ) : undefined
        }
      />
      {!investorAddress ? (
        <section className="access-state">
          <h2>Connect to view your portfolio</h2>
          <p>
            Your balances and transactions appear after connecting a wallet. The
            public pool page shows assets across all investors.
          </p>
          <Button variant="outline" asChild>
            <Link href="/">View tPF pool</Link>
          </Button>
        </section>
      ) : (
        <>
          <QueryError
            error={position.error}
            retry={() => position.refetch()}
            label="your position"
          />
          {view === "portfolio" && (
            <>
              <section className="position-hero">
                <p>Your position value</p>
                <h2>{alpha(p?.positionValue, 6)}</h2>
                <span>
                  {shares(p?.ownedShares)} tPF held ·{" "}
                  {shares(p?.pending?.shares || 0n)} tPF queued
                </span>
                <small>
                  Estimated value includes held and queued shares. Withdrawals
                  depend on pool liquidity.
                </small>
              </section>
              <HistoryChart personal address={investorAddress} />
              <div className="grid-two grid-equal section-space">
                <Panel title="Your shares">
                  <div className="panel-body">
                    <div className="ledger-row">
                      <span>Held in your wallet</span>
                      <b>{shares(p?.ownedShares)} tPF</b>
                    </div>
                    <div className="ledger-row">
                      <span>Estimated held value</span>
                      <b>{alpha(p?.ownedValue, 6)}</b>
                    </div>
                    <div className="ledger-row">
                      <span>Value per tPF</span>
                      <b>{alpha(pool.data?.sharePrice, 6)}</b>
                    </div>
                    <div className="ledger-row">
                      <span>Your AlphaUSD balance</span>
                      <b>{alpha(p?.assets, 6)}</b>
                    </div>
                    <p className="text-note">
                      Shares are transferable. Investor returns depend on
                      utilization, earnings and recognized losses.
                    </p>
                  </div>
                </Panel>
                <Panel title="Queued for withdrawal">
                  <div className="panel-body">
                    {pending ? (
                      <>
                        <div className="ledger-row">
                          <span>Request</span>
                          <b>
                            #{pending.id.toString()} · Queue position{" "}
                            {queuePosition}
                          </b>
                        </div>
                        <div className="ledger-row">
                          <span>Escrowed shares</span>
                          <b>{shares(pending.shares)} tPF</b>
                        </div>
                        <div className="ledger-row">
                          <span>Estimated payout · variable</span>
                          <b>{alpha(p?.queuedValue, 6)}</b>
                        </div>
                        <p className="text-note">
                          {s?.hasOverdue
                            ? "Processing is blocked by an overdue active loan."
                            : "Payout follows FIFO order and requires sufficient pool cash."}
                        </p>
                      </>
                    ) : (
                      <p className="empty">You have no pending withdrawal.</p>
                    )}
                    <Button variant="outline" asChild>
                      <Link href="/portfolio/withdrawals">
                        Manage withdrawals
                      </Link>
                    </Button>
                  </div>
                </Panel>
              </div>
            </>
          )}
          {view === "withdrawals" && (
            <>
              <QueryError
                error={redemptions.error}
                retry={() => redemptions.refetch()}
                label="withdrawal history"
              />
              <div className="metrics">
                <Metric
                  label="Your queued shares"
                  value={`${shares(p?.pending?.shares || 0n)} tPF`}
                  note="Remain exposed to earnings and losses"
                />
                <Metric
                  label="Your estimated payout"
                  value={alpha(p?.queuedValue, 6)}
                  note="Determined at processing time"
                />
                <Metric
                  label="Available pool cash"
                  value={alpha(s?.cash)}
                  note="Shared liquidity across all investors"
                />
              </div>
              <Panel
                title="Your withdrawal requests"
                aside={
                  <div className="button-row">
                    {pending && (
                      <Button
                        variant="outline"
                        disabled={!tx.connected || tx.pending}
                        onClick={() =>
                          tx.run("Cancel withdrawal", () => [
                            vaultCall("cancelRedeem", [pending.id]),
                          ])
                        }
                      >
                        Cancel request #{pending.id.toString()}
                      </Button>
                    )}
                    <Button
                      disabled={
                        !tx.connected ||
                        tx.pending ||
                        !s ||
                        s.pendingRequests === 0n ||
                        s.hasOverdue
                      }
                      onClick={() =>
                        tx.run("Process FIFO withdrawals", () => [
                          vaultCall("processRedemptions", [10n]),
                        ])
                      }
                    >
                      Process queue
                    </Button>
                  </div>
                }
              >
                {s?.hasOverdue && (
                  <p className="notice">
                    Processing is blocked while an active loan is overdue.
                    Requests and cancellations remain available.
                  </p>
                )}
                {requests?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Request</TableHead>
                        <TableHead>Shares</TableHead>
                        <TableHead>Payout</TableHead>
                        <TableHead>Requested · UTC</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r) => (
                        <TableRow key={String(r.id)}>
                          <TableCell>
                            #{r.id.toString()}
                            {r.status === 1 && (
                              <small>
                                Queue position{" "}
                                {
                                  redemptions.data?.filter(
                                    (x) => x.status === 1 && x.id <= r.id,
                                  ).length
                                }
                              </small>
                            )}
                          </TableCell>
                          <TableCell>{shares(r.shares)} tPF</TableCell>
                          <TableCell>
                            {r.status === 3
                              ? "—"
                              : alpha(
                                  r.status === 2
                                    ? r.paidAssets
                                    : r.estimatedAssets,
                                  6,
                                )}
                            <small>
                              {r.status === 2
                                ? "Actual payout"
                                : r.status === 1
                                  ? "Variable estimate"
                                  : "Shares returned"}
                            </small>
                          </TableCell>
                          <TableCell>{timestamp(r.requestedAt)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={r.status === 1 ? "default" : "secondary"}
                            >
                              {
                                ["Unknown", "Pending", "Paid", "Cancelled"][
                                  r.status
                                ]
                              }
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="empty">
                    No withdrawal requests for this wallet.
                  </div>
                )}
              </Panel>
              <TxStatus {...tx} />
              <p className="text-note">
                Minimum request: 10 tPF. One pending request per wallet.
                Requests are paid completely in FIFO order; processing examines
                at most ten entries per transaction.
              </p>
            </>
          )}
          {view !== "withdrawals" && (
            <Panel
              title={
                view === "activity"
                  ? "Your transactions"
                  : "Your recent transactions"
              }
              className="section-space"
              aside={
                view === "portfolio" ? (
                  <Link href="/portfolio/activity">View all →</Link>
                ) : undefined
              }
            >
              <QueryError
                error={activity.error}
                label="your transaction history"
                retry={() => activity.refetch()}
              />
              <ActivityList
                events={events}
                transfers
                limit={view === "activity" ? 200 : 6}
              />
            </Panel>
          )}
          <SnapshotTime />
        </>
      )}
    </>
  );
}
