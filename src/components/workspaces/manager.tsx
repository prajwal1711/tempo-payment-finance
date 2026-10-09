"use client";
import { useState } from "react";
import { isAddress, formatUnits, type Address, zeroAddress } from "viem";
import {
  useActivity,
  useBorrower,
  useLoans,
  usePool,
  useRedemptions,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import {
  alpha,
  batchHash,
  parseAmount,
  shares,
  short,
  timestamp,
  utilization,
} from "@/lib/format";
import { diligenceHash, fixture } from "@/lib/fixture";
import type { Borrower } from "@/lib/types";
import deployment from "@/lib/deployment.json";
import { useWorkspace } from "../workspace-context";
import { ActionDialog } from "../action-dialog";
import {
  ActivityList,
  LoanStatus,
  Metric,
  PageHeader,
  Panel,
  QueryError,
  SnapshotTime,
  TxStatus,
} from "../ui";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
function BorrowerRow({
  address,
  edit,
}: {
  address: Address;
  edit: (address: Address, config?: Borrower) => void;
}) {
  const query = useBorrower(address),
    b = query.data;
  return (
    <TableRow>
      <TableCell>
        <span title={address}>{short(address)}</span>
        {address.toLowerCase() ===
          deployment.demoBorrowerAddress.toLowerCase() && (
          <small>{fixture.company} · Simulated</small>
        )}
      </TableCell>
      <TableCell>{alpha(b?.borrower.config.creditLimit)}</TableCell>
      <TableCell>{alpha(b?.borrower.principalOutstanding, 6)}</TableCell>
      <TableCell>{alpha(b?.drawable, 6)}</TableCell>
      <TableCell>
        <Badge variant="secondary">
          {query.error
            ? "Read failed"
            : !b
              ? "Loading"
              : b.borrower.config.enabled
                ? "Enabled"
                : "Disabled"}
        </Badge>
        {query.error && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          onClick={() => edit(address, b?.borrower)}
        >
          Review
        </Button>
      </TableCell>
    </TableRow>
  );
}
export function ManagerPage({
  view = "dashboard",
}: {
  view?: "dashboard" | "borrowers" | "loans" | "redemptions" | "settings";
}) {
  const { account, demo } = useWorkspace();
  const pool = usePool(),
    loans = useLoans(),
    activity = useActivity(),
    redemptions = useRedemptions(),
    tx = useTransaction();
  const s = pool.data?.snapshot;
  const owner =
    !demo &&
    tx.connected &&
    account.address?.toLowerCase() === pool.data?.owner.toLowerCase();
  const pendingOwner =
    !demo &&
    tx.connected &&
    account.address?.toLowerCase() === pool.data?.pendingOwner.toLowerCase();
  const overdue = loans.data?.loans.filter(
    (loan) => loan.status === 1 && loans.data!.timestamp > loan.dueAt,
  );
  const overdueDebt = overdue?.reduce((sum, loan) => sum + loan.debt, 0n);
  const borrowers = [
    ...new Set(
      activity.data
        ?.filter((event) => event.eventName === "BorrowerConfigured")
        .map((event) => String(event.args.borrower).toLowerCase()),
    ),
  ] as Address[];
  const [configOpen, setConfigOpen] = useState(false),
    [wallet, setWallet] = useState(""),
    [limit, setLimit] = useState("750"),
    [hours, setHours] = useState("48"),
    [enabled, setEnabled] = useState("enabled"),
    [documentHash, setDocumentHash] = useState<string>(diligenceHash);
  const currentBorrower = useBorrower(isAddress(wallet) ? wallet : undefined);
  const [writeOffId, setWriteOffId] = useState<bigint>(),
    [reason, setReason] = useState(
      "Simulated settlement failed to arrive; full carrying value recognized as loss.",
    ),
    [newOwner, setNewOwner] = useState("");
  const selected = loans.data?.loans.find((loan) => loan.id === writeOffId);
  const afterNav =
    selected && s
      ? s.nav > selected.debt
        ? s.nav - selected.debt
        : 0n
      : undefined;
  const afterPrice =
    afterNav !== undefined && s
      ? ((afterNav + 1n) * 10n ** 18n) / (s.shares + 10n ** 12n)
      : undefined;
  const names = {
    dashboard: "Pool dashboard",
    borrowers: "Borrowers",
    loans: "Loan book",
    redemptions: "Redemption queue",
    settings: "Settings",
  };
  function edit(address: Address, config?: Borrower) {
    setWallet(address);
    if (config) {
      setLimit(formatUnits(config.config.creditLimit, 6));
      setHours(
        formatUnits(
          (BigInt(config.config.maxTenorSeconds) * 10n ** 6n) / 3600n,
          6,
        ),
      );
      setEnabled(config.config.enabled ? "enabled" : "disabled");
      setDocumentHash(config.config.diligenceHash);
    }
    setConfigOpen(true);
  }
  return (
    <>
      <PageHeader
        title={names[view]}
        subtitle="Pool operations, credit exposure and loss recognition."
        actions={
          view === "borrowers" ? (
            <Button
              disabled={!owner}
              onClick={() => {
                setWallet("");
                setLimit("750");
                setHours("48");
                setEnabled("enabled");
                setDocumentHash(diligenceHash);
                setConfigOpen(true);
              }}
            >
              Add borrower
            </Button>
          ) : undefined
        }
      />
      {!owner && (
        <p className="notice">
          {pendingOwner
            ? "You are the nominated next manager. Accept ownership in Settings to enable management actions."
            : "Read-only pool operations. Only the current owner can change credit limits, pause lending or recognize losses."}
        </p>
      )}
      {view === "dashboard" && (
        <>
          <div className="metrics">
            <Metric
              label="Total pool assets"
              value={alpha(s?.nav, 6)}
              note="All investors · Current carrying value"
            />
            <Metric
              label="Available pool cash"
              value={alpha(s?.cash)}
              note="Cash held in the vault"
            />
            <Metric
              label="Pool utilization"
              value={utilization(s?.principal, s?.nav)}
              note="Active principal / pool assets"
            />
            <Metric
              label="Overdue exposure"
              value={alpha(overdueDebt, 6)}
              note={`${overdue?.length ?? "—"} active overdue loans`}
            />
          </div>
          <div className="grid-two grid-equal">
            <Panel title="Credit and losses">
              <div className="panel-body">
                <div className="ledger-row">
                  <span>Active principal</span>
                  <b>{alpha(s?.principal, 6)}</b>
                </div>
                <div className="ledger-row">
                  <span>Recognized write-offs</span>
                  <b>{alpha(s?.writtenOff, 6)}</b>
                </div>
                <div className="ledger-row">
                  <span>Recoveries</span>
                  <b>{alpha(s?.recovered, 6)}</b>
                </div>
                <div className="ledger-row">
                  <span>Interest collected</span>
                  <b>{alpha(s?.interestPaid, 6)}</b>
                </div>
              </div>
            </Panel>
            <Panel title="Withdrawal liquidity">
              <div className="panel-body">
                <div className="ledger-row">
                  <span>Pending requests</span>
                  <b>{s?.pendingRequests.toString() || "—"}</b>
                </div>
                <div className="ledger-row">
                  <span>Queue head</span>
                  <b>#{s?.queueHead.toString() || "—"}</b>
                </div>
                <div className="ledger-row">
                  <span>Processing status</span>
                  <Badge variant={s?.hasOverdue ? "default" : "secondary"}>
                    {!s
                      ? "Loading"
                      : s.hasOverdue
                        ? "Blocked · Overdue loan"
                        : "Open when liquid"}
                  </Badge>
                </div>
                <p className="text-note">
                  Pending withdrawals take priority over new borrowing. Full
                  head-request liquidity is required.
                </p>
              </div>
            </Panel>
          </div>
          <Panel title="Recent pool activity" className="section-space">
            <QueryError
              error={activity.error}
              label="pool activity"
              retry={() => activity.refetch()}
            />
            <ActivityList events={activity.data} limit={8} />
          </Panel>
        </>
      )}
      {view === "borrowers" && (
        <Panel title="Approved facilities">
          <QueryError
            error={activity.error}
            label="borrower list"
            retry={() => activity.refetch()}
          />
          {borrowers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Principal limit</TableHead>
                  <TableHead>Exposure</TableHead>
                  <TableHead>Drawable</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {borrowers.map((address) => (
                  <BorrowerRow key={address} address={address} edit={edit} />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="empty">
              {activity.data
                ? "No borrowers configured."
                : "Loading borrower approvals…"}
            </div>
          )}
        </Panel>
      )}
      {view === "loans" && (
        <Panel title="Loan monitoring">
          <QueryError
            error={loans.error}
            label="loan book"
            retry={() => loans.refetch()}
          />
          {loans.data?.loans.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan / borrower</TableHead>
                  <TableHead>Carrying value</TableHead>
                  <TableHead>Contractual debt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.data.loans.map((loan) => (
                  <TableRow key={String(loan.id)}>
                    <TableCell>
                      PF-{loan.id.toString().padStart(3, "0")}
                      <small title={loan.borrower}>
                        {short(loan.borrower)}
                      </small>
                    </TableCell>
                    <TableCell>
                      {alpha(loan.status === 1 ? loan.debt : 0n, 6)}
                    </TableCell>
                    <TableCell>{alpha(loan.debt, 6)}</TableCell>
                    <TableCell>
                      <LoanStatus loan={loan} at={loans.data!.timestamp} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !owner ||
                          tx.pending ||
                          loan.status !== 1 ||
                          loans.data!.timestamp <= loan.dueAt
                        }
                        onClick={() => setWriteOffId(loan.id)}
                      >
                        Review write-off
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="empty">
              {loans.data ? "No loans originated." : "Loading loan book…"}
            </div>
          )}
        </Panel>
      )}
      {view === "redemptions" && (
        <Panel
          title="FIFO withdrawal queue"
          aside={
            <Button
              disabled={
                !tx.connected ||
                tx.pending ||
                !s ||
                !s.pendingRequests ||
                s.hasOverdue
              }
              onClick={() =>
                tx.run("Process FIFO withdrawals", () => [
                  vaultCall("processRedemptions", [10n]),
                ])
              }
            >
              Process up to ten entries
            </Button>
          }
        >
          <QueryError
            error={redemptions.error}
            label="redemption queue"
            retry={() => redemptions.refetch()}
          />
          {s?.hasOverdue && (
            <p className="notice">
              Processing is blocked by an active overdue loan. Repayment or
              write-off clears the delinquency restriction.
            </p>
          )}
          {redemptions.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request / owner</TableHead>
                  <TableHead>FIFO position</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Payout</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redemptions.data.map((r) => (
                  <TableRow key={String(r.id)}>
                    <TableCell>
                      #{r.id.toString()}
                      <small title={r.owner}>{short(r.owner)}</small>
                    </TableCell>
                    <TableCell>
                      {r.status === 1
                        ? redemptions.data!.filter(
                            (x) => x.status === 1 && x.id <= r.id,
                          ).length
                        : "—"}
                    </TableCell>
                    <TableCell>{shares(r.shares)} tPF</TableCell>
                    <TableCell>
                      {r.status === 3
                        ? "—"
                        : alpha(
                            r.status === 2 ? r.paidAssets : r.estimatedAssets,
                            6,
                          )}
                      <small>
                        {r.status === 2
                          ? "Actual paid"
                          : r.status === 1
                            ? "Variable estimate"
                            : "Shares returned"}
                      </small>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === 1 ? "default" : "secondary"}>
                        {["Unknown", "Pending", "Paid", "Cancelled"][r.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="empty">No redemption requests.</div>
          )}
          <p className="text-note">
            Processing is permissionless. Each transaction examines at most ten
            entries, including cancelled entries, and stops if the first pending
            request cannot be paid completely.
          </p>
        </Panel>
      )}
      {view === "settings" && (
        <div className="grid-two grid-equal">
          <Panel title="Pool controls">
            <div className="panel-body">
              <div className="ledger-row">
                <span>New deposits</span>
                <Badge variant="secondary">
                  {!s ? "Loading" : s.depositsPaused ? "Paused" : "Enabled"}
                </Badge>
              </div>
              <div className="ledger-row">
                <span>New draws</span>
                <Badge variant="secondary">
                  {!s ? "Loading" : s.drawsPaused ? "Paused" : "Enabled"}
                </Badge>
              </div>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={!owner || tx.pending || !s}
                  onClick={() =>
                    tx.run("Update deposit pause", () => [
                      vaultCall("setPauses", [
                        !s!.depositsPaused,
                        s!.drawsPaused,
                      ]),
                    ])
                  }
                >
                  {s?.depositsPaused ? "Resume" : "Pause"} deposits
                </Button>
                <Button
                  variant="outline"
                  disabled={!owner || tx.pending || !s}
                  onClick={() =>
                    tx.run("Update draw pause", () => [
                      vaultCall("setPauses", [
                        s!.depositsPaused,
                        !s!.drawsPaused,
                      ]),
                    ])
                  }
                >
                  {s?.drawsPaused ? "Resume" : "Pause"} borrowing
                </Button>
              </div>
              <p className="text-note">
                Repayment, recovery, share transfers, withdrawal requests and
                cancellations remain available.
              </p>
            </div>
          </Panel>
          <Panel title="Manager ownership">
            <div className="panel-body">
              <div className="document">
                <b>Current manager</b>
                <p className="address break-all">
                  {pool.data?.owner || "Loading…"}
                </p>
                {pool.data?.pendingOwner !== zeroAddress && (
                  <>
                    <b>Pending manager</b>
                    <p className="address break-all">
                      {pool.data?.pendingOwner || "Loading…"}
                    </p>
                  </>
                )}
              </div>
              {pendingOwner && (
                <Button
                  disabled={tx.pending}
                  onClick={() =>
                    tx.run("Accept manager ownership", () => [
                      vaultCall("acceptOwnership"),
                    ])
                  }
                >
                  Accept ownership
                </Button>
              )}
              <div className="form-field">
                <label htmlFor="new-manager">Nominate next manager</label>
                <Input
                  id="new-manager"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="0x…"
                />
              </div>
              <Button
                variant="outline"
                disabled={!owner || tx.pending}
                onClick={() =>
                  tx.run("Nominate next manager", () => {
                    if (!isAddress(newOwner) || newOwner === zeroAddress)
                      throw new Error("Enter a valid manager wallet.");
                    return [vaultCall("transferOwnership", [newOwner])];
                  })
                }
              >
                Nominate manager
              </Button>
              <p className="text-note">
                The nominated wallet must accept ownership on-chain.
              </p>
            </div>
          </Panel>
        </div>
      )}
      <TxStatus {...tx} />
      <SnapshotTime />
      <ActionDialog
        open={configOpen}
        onOpenChange={(open) => {
          if (!tx.pending) setConfigOpen(open);
        }}
        title="Borrower credit decision"
        description="Set future draw permissions and limits. Existing debt and maturity remain unchanged."
      >
        <div className="form-field">
          <label htmlFor="borrower-address">Borrower wallet</label>
          <Input
            id="borrower-address"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x…"
          />
        </div>
        <div className="form-field">
          <label htmlFor="principal-limit">
            Principal credit limit · AlphaUSD
          </label>
          <Input
            id="principal-limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="form-field">
          <label htmlFor="max-tenor">Maximum tenor · Hours</label>
          <Input
            id="max-tenor"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <Select value={enabled} onValueChange={setEnabled}>
          <SelectTrigger aria-label="Borrower approval">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="enabled">Enabled for new draws</SelectItem>
            <SelectItem value="disabled">
              Disabled · Repayment available
            </SelectItem>
          </SelectContent>
        </Select>
        <div className="ledger-row">
          <span>Existing principal exposure</span>
          <b>{alpha(currentBorrower.data?.borrower.principalOutstanding, 6)}</b>
        </div>
        <div className="form-field">
          <label htmlFor="diligence-hash">Supporting document hash</label>
          <Input
            id="diligence-hash"
            value={documentHash}
            onChange={(e) => setDocumentHash(e.target.value)}
          />
          <small>
            The default document is a clearly simulated underwriting fixture.
          </small>
        </div>
        <details className="how-it-works">
          <summary>Simulated underwriting fixture</summary>
          <p>
            {fixture.company} · {fixture.corridor} · {fixture.business}
          </p>
          <ul>
            {fixture.review.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
        <Button
          disabled={!owner || tx.pending}
          onClick={() =>
            tx.run("Configure borrower", () => {
              if (!isAddress(wallet) || wallet === zeroAddress)
                throw new Error("Enter a valid borrower wallet.");
              if (!/^\d+(?:\.\d{1,6})?$/.test(hours))
                throw new Error("Enter a valid maximum tenor.");
              const hourUnits = parseAmount(hours, 6),
                seconds = (hourUnits * 3600n) / 10n ** 6n;
              if (seconds < 60n || seconds > 2n ** 64n - 1n)
                throw new Error(
                  "Maximum tenor must be between 60 seconds and the contract limit.",
                );
              if (
                !/^0x[0-9a-fA-F]{64}$/.test(documentHash) ||
                /^0x0{64}$/.test(documentHash)
              )
                throw new Error("Enter a 32-byte document hash.");
              const credit = parseAmount(limit);
              return [
                vaultCall("configureBorrower", [
                  wallet,
                  enabled === "enabled",
                  credit,
                  seconds,
                  documentHash,
                ]),
              ];
            })
          }
        >
          Save credit decision
        </Button>
        <TxStatus {...tx} />
      </ActionDialog>
      <ActionDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !tx.pending) setWriteOffId(undefined);
        }}
        title={`Write off PF-${selected?.id.toString() || ""}`}
        description="Recognize the full active carrying value as a loss. Contractual debt remains repayable and future accrual stops."
      >
        {selected && (
          <>
            <div className="ledger-row">
              <span>Carrying value removed · Estimate</span>
              <b>{alpha(selected.debt, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Total pool assets after loss · Estimate</span>
              <b>{alpha(afterNav, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Value per tPF after loss · Estimate</span>
              <b>{alpha(afterPrice, 6)}</b>
            </div>
            <div className="form-field">
              <label htmlFor="writeoff-reason">Reason</label>
              <Textarea
                id="writeoff-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <p className="text-note">
              Execution-time carrying value determines the final loss. Recovery
              benefits holders at recovery time. The borrower remains blocked
              until full recovery and manager reapproval.
            </p>
            <Button
              disabled={
                !owner ||
                tx.pending ||
                selected.status !== 1 ||
                (loans.data?.timestamp || 0n) <= selected.dueAt
              }
              onClick={async () => {
                const hash = await tx.run("Recognize full write-off", () => [
                  vaultCall("writeOff", [selected.id, batchHash(reason)]),
                ]);
                if (hash) setWriteOffId(undefined);
              }}
            >
              Confirm full write-off
            </Button>
            <TxStatus {...tx} />
          </>
        )}
      </ActionDialog>
    </>
  );
}
