"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import {
  useBorrower,
  useLoans,
  usePool,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import deployment from "@/lib/deployment.json";
import { batchHash, money, parseAmount, short } from "@/lib/format";
import { diligenceHash, fixture } from "@/lib/fixture";
import {
  Metric,
  PageHeader,
  Panel,
  TxStatus,
  LoanStatus,
  QueryError,
} from "@/components/ui";

export default function Manage() {
  const account = useAccount();
  const pool = usePool();
  const loans = useLoans();
  const tx = useTransaction();
  const [wallet, setWallet] = useState(deployment.demoBorrowerAddress);
  const [limit, setLimit] = useState("750");
  const [hours, setHours] = useState("48");
  const [enabled, setEnabled] = useState(true);
  const [writeOffId, setWriteOffId] = useState<bigint>();
  const [reason, setReason] = useState(
    "Simulated settlement failed to arrive; full carrying value recognized as loss.",
  );
  const [newOwner, setNewOwner] = useState("");
  const s = pool.data?.snapshot;
  const manager =
    account.address?.toLowerCase() === pool.data?.owner.toLowerCase();
  const pendingManager =
    account.address?.toLowerCase() === pool.data?.pendingOwner.toLowerCase();
  const selected = loans.data?.loans.find((loan) => loan.id === writeOffId);
  const borrower = useBorrower(
    isAddress(wallet)
      ? wallet
      : (deployment.demoBorrowerAddress as `0x${string}`),
  );
  return (
    <>
      <PageHeader
        eyebrow="Manager workspace"
        title="Underwrite. Monitor. Recognize."
        subtitle="Set unsecured credit limits, monitor settlement timing, and recognize losses explicitly. Financial changes are enforced by the vault contract."
      />
      <QueryError
        error={borrower.error}
        retry={() => borrower.refetch()}
        label="borrower configuration"
      />
      <QueryError
        error={loans.error}
        retry={() => loans.refetch()}
        label="loan history"
      />

      <div className="notice" style={{ marginBottom: 20 }}>
        Current manager:{" "}
        <span className="address">{pool.data?.owner || "Loading…"}</span>.{" "}
        {manager
          ? "Connected wallet has manager permissions."
          : "Read-only view. Connect the owner wallet to use manager controls."}
      </div>
      <div className="metrics">
        <Metric
          label="Active principal"
          value={money(s?.principal)}
          note="Receivables currently carried at face value"
        />
        <Metric
          label="Recognized write-offs"
          value={money(s?.writtenOff, 6)}
          note="Gross carrying value removed"
          icon="↓"
        />
        <Metric
          label="Debt recovered"
          value={money(s?.recovered, 6)}
          note="Recovery increases current-holder NAV"
          icon="↻"
        />
        <Metric
          label="Interest collected"
          value={money(s?.interestPaid, 6)}
          note="Actual borrower interest payments"
          icon="◷"
        />
      </div>
      <div className="grid-two grid-equal">
        <Panel title="Borrower approval" aside="MANUAL CREDIT DECISION">
          <div className="panel-body">
            <div className="form-field">
              <label htmlFor="approved-wallet">Borrower wallet</label>
              <input
                id="approved-wallet"
                className="plain-input address"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
              />
              <button
                className="secondary-button"
                style={{ marginTop: 8 }}
                disabled={!account.address}
                onClick={() => setWallet(account.address!)}
              >
                Use connected wallet
              </button>
            </div>
            <div className="form-field">
              <label htmlFor="credit-limit">
                Principal credit limit · AlphaUSD
              </label>
              <input
                id="credit-limit"
                className="plain-input"
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="maximum-tenor">Maximum tenor · hours</label>
              <input
                id="maximum-tenor"
                className="plain-input"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="borrower-enabled">Borrower approval</label>
              <select
                id="borrower-enabled"
                value={enabled ? "enabled" : "disabled"}
                onChange={(e) => setEnabled(e.target.value === "enabled")}
              >
                <option value="enabled">Enabled for new borrowing</option>
                <option value="disabled">
                  Disabled · repayment remains available
                </option>
              </select>
            </div>
            <div className="ledger-row">
              <span>Existing principal exposure</span>
              <b>{money(borrower.data?.borrower.principalOutstanding)}</b>
            </div>
            <button
              className="primary-button full-width section-space"
              disabled={!manager || tx.pending}
              onClick={() =>
                tx.run("Configure borrower", () => {
                  if (!isAddress(wallet))
                    throw new Error("Enter a valid borrower wallet.");
                  if (!/^\d+(?:\.\d+)?$/.test(hours))
                    throw new Error("Enter a valid maximum tenor.");
                  const seconds = Math.floor(Number(hours) * 3600);
                  if (!Number.isSafeInteger(seconds) || seconds < 60)
                    throw new Error(
                      "Maximum tenor must be at least 60 seconds.",
                    );
                  return [
                    vaultCall("configureBorrower", [
                      wallet,
                      enabled,
                      parseAmount(limit),
                      BigInt(seconds),
                      diligenceHash,
                    ]),
                  ];
                })
              }
            >
              Save credit decision <span>↗</span>
            </button>
            <p className="text-note">
              Changes apply to future draws. Existing principal, interest and
              maturity are preserved.
            </p>
          </div>
        </Panel>
        <Panel
          title="Underwriting document"
          aside={<span className="badge warning">SIMULATED</span>}
        >
          <div className="panel-body">
            <div className="document">
              <b>{fixture.label}</b>
              <br />
              <br />
              <b>{fixture.company}</b>
              <br />
              {fixture.corridor}
              <br />
              {fixture.business}
              <br />
              <br />
              Settlement source: {fixture.settlementSource}
              <br />
              Expected batch settlement: ${fixture.expectedSettlementAmount}
              <br />
              Prefunding requirement: ${fixture.prefundingRequirement}
              <br />
              Standard delay: {fixture.standardSettlementDelayHours} hours
            </div>
            <ul className="checklist section-space">
              {fixture.review.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="text-note">
              Document reference · keccak256 of canonical fixture JSON
            </div>
            <div className="address" style={{ fontSize: 9, marginTop: 8 }}>
              {diligenceHash}
            </div>
            <div className="notice warning section-space">
              This fixture represents an underwriting workflow. It does not
              verify receivables, company identity, or repayment capacity.
            </div>
          </div>
        </Panel>
      </div>
      <TxStatus {...tx} />
      <Panel
        title="Loan monitoring and loss recognition"
        aside="FULL WRITE-OFFS ONLY"
        className="section-space"
      >
        {loans.data?.loans.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Loan</th>
                  <th>Borrower</th>
                  <th>Carrying / contractual debt</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.data.loans.map((loan) => (
                  <tr key={String(loan.id)}>
                    <td>PF-{loan.id.toString().padStart(3, "0")}</td>
                    <td className="address">{short(loan.borrower)}</td>
                    <td>
                      {money(loan.status === 2 ? 0n : loan.debt, 6)}
                      <small>{money(loan.debt, 6)} contractual debt</small>
                    </td>
                    <td>
                      <LoanStatus loan={loan} at={loans.data.timestamp} />
                    </td>
                    <td>
                      <button
                        className="secondary-button"
                        disabled={
                          !manager ||
                          tx.pending ||
                          loan.status !== 1 ||
                          loans.data!.timestamp <= loan.dueAt
                        }
                        onClick={() => setWriteOffId(loan.id)}
                      >
                        Review write-off
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Loans will appear here after origination.</div>
        )}
      </Panel>
      <div className="section-space grid-two grid-equal">
        <Panel title="Pool controls" aside="MANAGER ONLY">
          <div className="panel-body">
            <div className="ledger-row">
              <span>New deposits</span>
              <b>{s?.depositsPaused ? "Paused" : "Enabled"}</b>
            </div>
            <div className="ledger-row">
              <span>New credit draws</span>
              <b>{s?.drawsPaused ? "Paused" : "Enabled"}</b>
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={!manager || tx.pending || !s}
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
              </button>
              <button
                className="secondary-button"
                disabled={!manager || tx.pending || !s}
                onClick={() =>
                  tx.run("Update borrowing pause", () => [
                    vaultCall("setPauses", [
                      s!.depositsPaused,
                      !s!.drawsPaused,
                    ]),
                  ])
                }
              >
                {s?.drawsPaused ? "Resume" : "Pause"} borrowing
              </button>
            </div>
            <p className="text-note">
              Repayment, recovery, share transfers, and queue
              requests/cancellations remain available.
            </p>
          </div>
        </Panel>
        <Panel title="Manager handover" aside="TWO-STEP OWNERSHIP">
          <div className="panel-body">
            {pendingManager && (
              <>
                <div className="notice">
                  This wallet is the nominated next manager.
                </div>
                <button
                  className="primary-button section-space"
                  disabled={tx.pending}
                  onClick={() =>
                    tx.run("Accept manager ownership", () => [
                      vaultCall("acceptOwnership"),
                    ])
                  }
                >
                  Accept manager role ↗
                </button>
              </>
            )}
            <div className="form-field">
              <label htmlFor="next-owner">Nominate next manager wallet</label>
              <input
                id="next-owner"
                className="plain-input address"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="0x…"
              />
            </div>
            <button
              className="secondary-button"
              disabled={!manager || tx.pending}
              onClick={() =>
                tx.run("Nominate next manager", () => {
                  if (!isAddress(newOwner) || /^0x0{40}$/i.test(newOwner))
                    throw new Error("Enter a valid manager wallet.");
                  return [vaultCall("transferOwnership", [newOwner])];
                })
              }
            >
              Nominate manager ↗
            </button>
            <p className="text-note">
              The nominated wallet must accept on-chain. Local demo credentials
              can nominate your Tempo Wallet using the documented CLI helper.
            </p>
          </div>
        </Panel>
      </div>
      {selected && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="writeoff-title"
          >
            <p className="eyebrow">MANAGER LOSS RECOGNITION</p>
            <h2 id="writeoff-title">
              Write off loan PF-{selected.id.toString()}?
            </h2>
            <p>
              The pool’s NAV will fall by the execution-time carrying value.
              Principal and interest remain repayable, and further accrual
              stops.
            </p>
            <div className="ledger-row">
              <span>Current carrying value</span>
              <b>{money(selected.debt, 6)}</b>
            </div>
            <div className="form-field section-space">
              <label htmlFor="writeoff-reason">Reason</label>
              <textarea
                id="writeoff-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="button-row">
              <button
                className="primary-button danger-button"
                disabled={!manager || tx.pending}
                onClick={async () => {
                  const hash = await tx.run("Recognize full write-off", () => [
                    vaultCall("writeOff", [selected.id, batchHash(reason)]),
                  ]);
                  if (hash) setWriteOffId(undefined);
                }}
              >
                Confirm full write-off
              </button>
              <button
                className="secondary-button"
                disabled={tx.pending}
                onClick={() => setWriteOffId(undefined)}
              >
                Cancel
              </button>
            </div>
            <TxStatus {...tx} />
          </div>
        </div>
      )}
    </>
  );
}
