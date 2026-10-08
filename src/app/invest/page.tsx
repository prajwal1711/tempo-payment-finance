"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, isAddress, type Address } from "viem";
import {
  approveCall,
  usePool,
  usePosition,
  useRedemptions,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import { readVault, vaultAddress } from "@/lib/chain";
import deployment from "@/lib/deployment.json";
import { money, parseAmount, shares, short } from "@/lib/format";
import {
  AmountField,
  Metric,
  PageHeader,
  Panel,
  TxStatus,
  QueryError,
} from "@/components/ui";

export default function Invest() {
  const account = useAccount();
  const viewAddress =
    account.address || (deployment.investorAAddress as Address);
  const pool = usePool();
  const position = usePosition(viewAddress);
  const redemptions = useRedemptions();
  const tx = useTransaction();
  const [amount, setAmount] = useState("100");
  const [redeemShares, setRedeemShares] = useState("10");
  const [transferShares, setTransferShares] = useState("10");
  const [receiver, setReceiver] = useState("");
  const p = position.data;
  const s = pool.data?.snapshot;
  const requests = redemptions.data?.filter(
    (request) => request.owner.toLowerCase() === viewAddress.toLowerCase(),
  );
  return (
    <>
      <PageHeader
        eyebrow="Investor workspace"
        title="Capital with a purpose."
        subtitle="Supply payment working capital and own transferable tPF shares. Your share value follows the pool’s earnings and recognized losses."
      />
      <QueryError
        error={position.error}
        retry={() => position.refetch()}
        label="wallet balances"
      />
      <QueryError
        error={redemptions.error}
        retry={() => redemptions.refetch()}
        label="redemption history"
      />

      {!account.address && (
        <div className="notice" style={{ marginBottom: 20 }}>
          Viewing demo investor A ({short(viewAddress)}) in read-only mode.
          Connect Tempo Wallet to view and manage your own position.
        </div>
      )}
      <div className="metrics">
        <Metric
          label="Estimated position value"
          value={p ? money(p.ownedValue + p.queuedValue) : "—"}
          note="Includes shares currently queued"
        />
        <Metric
          label="Shares in wallet"
          value={shares(p?.ownedShares)}
          note="tPF · transferable ownership"
          icon="◈"
        />
        <Metric
          label="Shares in queue"
          value={shares(p?.pending?.shares || 0n)}
          note="Remain exposed to earnings and losses"
          icon="◷"
        />
        <Metric
          label="Pool share value"
          value={money(pool.data?.sharePrice, 6)}
          note="Variable redemption value per tPF"
        />
      </div>
      <div className="grid-two grid-equal">
        <Panel title="Supply capital" aside="ONE SIGNATURE">
          <div className="panel-body">
            <AmountField
              label="Deposit amount"
              value={amount}
              onChange={setAmount}
              note={`Wallet balance: ${money(p?.assets, 6)} AlphaUSD`}
            />
            <div className="ledger-row">
              <span>Underlying asset</span>
              <b>AlphaUSD · Tempo testnet</b>
            </div>
            <div className="ledger-row">
              <span>Minimum-share tolerance</span>
              <b>0.5%</b>
            </div>
            <div className="ledger-row">
              <span>Protocol fee</span>
              <b>0%</b>
            </div>
            <div className="button-row">
              <button
                className="primary-button full-width"
                disabled={
                  !tx.connected ||
                  tx.pending ||
                  s?.depositsPaused ||
                  (!!s && s.nav === 0n && s.shares > 0n)
                }
                onClick={() =>
                  tx.run("Deposit capital", async () => {
                    const assets = parseAmount(amount);
                    if (!account.address) throw new Error("Connect a wallet.");
                    if (p && assets > p.assets)
                      throw new Error("Insufficient AlphaUSD balance.");
                    const quotedShares = (await readVault("previewDeposit", [
                      assets,
                    ])) as bigint;
                    const minimum = (quotedShares * 995n) / 1000n;
                    return [
                      approveCall(assets),
                      vaultCall("depositWithMinShares", [
                        assets,
                        account.address,
                        minimum,
                      ]),
                    ];
                  })
                }
              >
                {tx.pending
                  ? "Transaction in progress…"
                  : "Deposit & receive shares"}
                <span>↗</span>
              </button>
            </div>
            <div className="text-note">
              Approval and deposit execute together in one atomic Tempo
              transaction. Shares are issued at current NAV.
            </div>
            {s?.depositsPaused && (
              <div className="notice warning section-space">
                New deposits are paused by the manager.
              </div>
            )}
            <div className="text-note">
              Need test tokens? Use the faucet in Tempo Wallet. Fees use
              PathUSD; your fee balance is {money(p?.fees, 6)}.
            </div>
          </div>
        </Panel>
        <Panel title="Request an exit" aside="FIFO QUEUE">
          <div className="panel-body">
            <AmountField
              label="Shares to redeem"
              value={redeemShares}
              onChange={setRedeemShares}
              token="tPF"
              note="Minimum 10 tPF. One pending request per wallet."
            />
            <button
              className="secondary-button"
              disabled={!p?.ownedShares}
              onClick={() => setRedeemShares(formatUnits(p!.ownedShares, 18))}
            >
              Use all wallet shares
            </button>
            <div className="ledger-row">
              <span>Pool cash available</span>
              <b>{money(s?.cash)}</b>
            </div>
            <div className="ledger-row">
              <span>Requests pending</span>
              <b>{s?.pendingRequests.toString() || "0"}</b>
            </div>
            {p && p.pendingId > 0n && (
              <div className="ledger-row">
                <span>Your queue position</span>
                <b>
                  #
                  {(
                    redemptions.data?.filter(
                      (r) => r.status === 1 && r.id <= p.pendingId,
                    ).length || 1
                  ).toString()}{" "}
                  · request {p.pendingId.toString()}
                </b>
              </div>
            )}
            <div className="notice section-space">
              The payout is valued when processed. Queued shares continue to
              earn and absorb losses. No fixed-dollar payout is reserved.
            </div>
            <div className="button-row">
              <button
                className="primary-button full-width"
                disabled={
                  !tx.connected || tx.pending || (!!p && p.pendingId !== 0n)
                }
                onClick={() =>
                  tx.run("Queue redemption", async () => {
                    const quantity = parseAmount(redeemShares, 18);
                    if (quantity < 10n * 10n ** 18n)
                      throw new Error("The minimum request is 10 tPF.");
                    if (p && quantity > p.ownedShares)
                      throw new Error("Insufficient shares.");
                    return [vaultCall("requestRedeem", [quantity])];
                  })
                }
              >
                Queue redemption<span>→</span>
              </button>
              {p?.pendingId !== undefined && p.pendingId > 0n && (
                <button
                  className="secondary-button full-width"
                  disabled={!tx.connected || tx.pending}
                  onClick={() =>
                    tx.run("Cancel redemption", () => [
                      vaultCall("cancelRedeem", [p.pendingId]),
                    ])
                  }
                >
                  Cancel request #{p.pendingId.toString()}
                </button>
              )}
            </div>
            {s?.hasOverdue && (
              <div className="notice warning section-space">
                An active loan is overdue. Requests and cancellations remain
                available; processing waits for repayment or loss recognition.
              </div>
            )}
          </div>
        </Panel>
      </div>
      <TxStatus {...tx} />
      <div className="section-space">
        <Panel
          title="Your redemption history"
          aside={
            <button
              className="secondary-button"
              disabled={
                !tx.connected ||
                tx.pending ||
                !s ||
                s.pendingRequests === 0n ||
                s.hasOverdue
              }
              onClick={() =>
                tx.run("Process FIFO queue", () => [
                  vaultCall("processRedemptions", [10n]),
                ])
              }
            >
              Process available exits ↗
            </button>
          }
        >
          {requests?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Shares</th>
                    <th>Payout / estimate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={String(request.id)}>
                      <td>#{request.id.toString()}</td>
                      <td>{shares(request.shares)}</td>
                      <td>
                        {money(
                          request.status === 2
                            ? request.paidAssets
                            : request.estimatedAssets,
                          6,
                        )}
                        <small>
                          {request.status === 1
                            ? "Variable until processing"
                            : request.status === 2
                              ? "Actual paid amount"
                              : "Request cancelled"}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`badge ${request.status === 1 ? "warning" : "muted"}`}
                        >
                          {["", "PENDING", "PAID", "CANCELLED"][request.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No redemption requests for this wallet.</div>
          )}
        </Panel>
      </div>
      <div className="section-space grid-two grid-equal">
        <Panel title="Transfer ownership" aside="ERC-20 SHARES">
          <div className="panel-body">
            <div className="form-field">
              <label htmlFor="share-receiver">Recipient wallet</label>
              <input
                id="share-receiver"
                className="plain-input address"
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                placeholder="0x…"
              />
            </div>
            <AmountField
              label="Shares to transfer"
              value={transferShares}
              onChange={setTransferShares}
              token="tPF"
            />
            <button
              className="secondary-button"
              disabled={!tx.connected || tx.pending}
              onClick={() =>
                tx.run("Transfer tPF shares", () => {
                  if (
                    !isAddress(receiver) ||
                    receiver.toLowerCase() === vaultAddress.toLowerCase()
                  )
                    throw new Error(
                      "Enter a valid recipient other than the vault.",
                    );
                  return [
                    vaultCall("transfer", [
                      receiver,
                      parseAmount(transferShares, 18),
                    ]),
                  ];
                })
              }
            >
              Transfer shares ↗
            </button>
            <p className="text-note">
              Ownership moves with the token. Escrowed shares cannot be
              transferred until the request is cancelled.
            </p>
          </div>
        </Panel>
        <Panel title="How your position works">
          <div className="panel-body">
            <ul className="checklist">
              <li>
                Shares represent a proportional claim on current pool assets.
              </li>
              <li>
                Borrower pricing is 18% APR; investor returns depend on
                utilization and losses.
              </li>
              <li>Withdrawals need available cash and follow request order.</li>
              <li>
                Recovered debt benefits shareholders holding shares at recovery
                time.
              </li>
            </ul>
          </div>
        </Panel>
      </div>
    </>
  );
}
