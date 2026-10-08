"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { isAddress, type Address } from "viem";
import {
  approveCall,
  useBorrower,
  useLoans,
  usePool,
  useTransaction,
  vaultCall,
} from "@/lib/hooks";
import { readVault, publicClient } from "@/lib/chain";
import deployment from "@/lib/deployment.json";
import {
  batchHash,
  money,
  parseAmount,
  projectedInterest,
  short,
  timestamp,
} from "@/lib/format";
import { drawReasons, type Borrower } from "@/lib/types";
import {
  AmountField,
  InterestTicker,
  LoanStatus,
  LoanTable,
  Metric,
  PageHeader,
  Panel,
  TxStatus,
  QueryError,
} from "@/components/ui";

export default function Borrow() {
  const account = useAccount();
  const [borrowerInput, setBorrowerInput] = useState(
    deployment.demoBorrowerAddress,
  );
  const borrowerAddress = (
    isAddress(borrowerInput) ? borrowerInput : deployment.demoBorrowerAddress
  ) as Address;
  const borrower = useBorrower(borrowerAddress);
  const pool = usePool();
  const allLoans = useLoans();
  const tx = useTransaction();
  const [amount, setAmount] = useState("600");
  const [reference, setReference] = useState("UK-IN-CARD-NEW");
  const [tenor, setTenor] = useState("172800");
  const [selectedId, setSelectedId] = useState<bigint>();
  const [partialAmount, setPartialAmount] = useState("100");
  const loans = allLoans.data?.loans.filter(
    (loan) => loan.borrower.toLowerCase() === borrowerAddress.toLowerCase(),
  );
  const selected =
    loans?.find((loan) => loan.id === selectedId) ||
    loans?.find((loan) => loan.status === 1 || loan.status === 2) ||
    loans?.[0];
  const b = borrower.data;
  const sameWallet =
    account.address?.toLowerCase() === borrowerAddress.toLowerCase();
  let projection: bigint | undefined;
  try {
    projection = projectedInterest(parseAmount(amount), BigInt(tenor));
  } catch {}
  return (
    <>
      <PageHeader
        eyebrow="Borrower workspace / illustrative UK → India"
        title="Payout now. Settle later."
        subtitle="An approved revolving credit line for remittance prefunding. Draw stablecoins into your wallet, pay for elapsed time, and reopen capacity through repayment."
      />
      <QueryError
        error={borrower.error}
        retry={() => borrower.refetch()}
        label="borrower credit"
      />
      <QueryError
        error={allLoans.error}
        retry={() => allLoans.refetch()}
        label="loan history"
      />

      <div className="notice" style={{ marginBottom: 20 }}>
        <b>Northstar Remit · fictional company.</b> Card/acquirer settlement
        evidence is simulated. FX, destination prefunding and payouts are
        handled by the borrower.
      </div>
      <div className="metrics">
        <Metric
          label="Approved credit limit"
          value={money(b?.borrower.config.creditLimit)}
          note="Manager-approved principal limit"
        />
        <Metric
          label="Principal outstanding"
          value={money(b?.borrower.principalOutstanding)}
          note="Includes unresolved written-off principal"
          icon="⇄"
        />
        <Metric
          label="Unused credit limit"
          value={money(b?.credit)}
          note="Reopens with principal repayment"
          icon="↻"
        />
        <Metric
          label="Currently drawable"
          value={money(b?.drawable)}
          note={b ? drawReasons[b.reason] : "Loading borrower status"}
          icon="↗"
        />
      </div>
      <div className="grid-two grid-equal">
        <Panel title="Draw working capital" aside="18% APR · 4.93 BPS/DAY">
          <div className="panel-body">
            <div className="form-field">
              <label htmlFor="borrower-wallet">Borrower wallet</label>
              <input
                id="borrower-wallet"
                className="plain-input address"
                value={borrowerInput}
                onChange={(e) => setBorrowerInput(e.target.value)}
              />
              <div className="button-row" style={{ marginTop: 8 }}>
                <button
                  className="secondary-button"
                  disabled={!account.address}
                  onClick={() => setBorrowerInput(account.address!)}
                >
                  Use connected wallet
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setBorrowerInput(deployment.demoBorrowerAddress)
                  }
                >
                  Demo borrower
                </button>
              </div>
            </div>
            <AmountField
              label="Draw amount"
              value={amount}
              onChange={setAmount}
              note={`Available pool cash: ${money(pool.data?.snapshot.cash)}`}
            />
            <div className="form-field">
              <label htmlFor="batch-reference">
                Settlement batch reference
              </label>
              <input
                id="batch-reference"
                className="plain-input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <small>
                Hashed into a permanent loan reference and TIP-20 transfer memo.
              </small>
            </div>
            <div className="form-field">
              <label htmlFor="loan-tenor">Loan tenor</label>
              <select
                id="loan-tenor"
                value={tenor}
                onChange={(e) => setTenor(e.target.value)}
              >
                <option value="172800">
                  48 hours · standard settlement delay
                </option>
                <option value="60">
                  60 seconds · testnet overdue demonstration
                </option>
              </select>
              {tenor === "60" && (
                <small>
                  Short maturity only. Interest still accrues at the real 18%
                  annual rate.
                </small>
              )}
            </div>
            <div className="ledger-row">
              <span>Projected cost for selected tenor</span>
              <b>{money(projection, 6)}</b>
            </div>
            <div className="ledger-row">
              <span>Illustrative purpose</span>
              <b>Bridge card-settlement prefunding</b>
            </div>
            <div className="ledger-row">
              <span>Loan security</span>
              <b>Unsecured · manual approval</b>
            </div>
            <button
              className="primary-button full-width section-space"
              disabled={
                !tx.connected ||
                !sameWallet ||
                tx.pending ||
                !b ||
                b.reason !== 0
              }
              onClick={async () => {
                const hash = await tx.run("Draw working capital", async () => {
                  if (!isAddress(borrowerInput))
                    throw new Error("Enter a valid borrower address.");
                  const assets = parseAmount(amount);
                  const batchRef = batchHash(reference);
                  const block = await publicClient.getBlockNumber({
                    cacheTime: 0,
                  });
                  const [capacity, configuration, existing] = await Promise.all(
                    [
                      readVault("availableToDraw", [borrowerAddress], block),
                      readVault("getBorrower", [borrowerAddress], block),
                      readVault(
                        "loanForBatch",
                        [borrowerAddress, batchRef],
                        block,
                      ),
                    ],
                  );
                  const [drawable, reason] = capacity as [bigint, number];
                  if (reason !== 0) throw new Error(drawReasons[reason]);
                  if (assets > drawable)
                    throw new Error(
                      `Currently drawable amount is ${money(drawable, 6)} AlphaUSD.`,
                    );
                  if (
                    BigInt(tenor) >
                    (configuration as Borrower).config.maxTenorSeconds
                  )
                    throw new Error("This tenor exceeds the approved maximum.");
                  if (existing !== 0n)
                    throw new Error(
                      "This batch reference has already been used. Enter a new reference.",
                    );
                  return [vaultCall("draw", [assets, BigInt(tenor), batchRef])];
                });
                if (hash) setReference(`UK-IN-CARD-${Date.now()}`);
              }}
            >
              Draw to borrower wallet <span>↗</span>
            </button>
            {!sameWallet && (
              <p className="text-note">
                Connect the approved borrower wallet {short(borrowerAddress)} to
                draw. Any wallet may repay a loan.
              </p>
            )}
            {b && b.reason !== 0 && (
              <div className="notice warning section-space">
                {drawReasons[b.reason]}
              </div>
            )}
          </div>
        </Panel>
        <Panel
          title="Loan servicing"
          aside={
            selected
              ? `PF-${selected.id.toString().padStart(3, "0")}`
              : "NO LOAN SELECTED"
          }
        >
          <div className="panel-body">
            {selected ? (
              <>
                <div className="ledger-row">
                  <span>Loan status</span>
                  <LoanStatus
                    loan={selected}
                    at={allLoans.data?.timestamp || 0n}
                  />
                </div>
                <div className="ledger-row">
                  <span>Principal remaining</span>
                  <b>{money(selected.principalOutstanding, 6)}</b>
                </div>
                <div className="ledger-row">
                  <span>Maturity</span>
                  <b>{timestamp(selected.dueAt)}</b>
                </div>
                <InterestTicker
                  loan={selected}
                  at={allLoans.data?.timestamp || 0n}
                />
                <div className="ledger-row">
                  <span>Debt at latest block</span>
                  <b>{money(selected.debt, 6)}</b>
                </div>
                <div className="document section-space">
                  <b>Settlement reference</b>
                  <br />
                  <span className="address">{selected.batchRef}</span>
                  <br />
                  Memo accompanies repayments and identifies this borrower’s
                  batch.
                </div>
                <AmountField
                  label="Partial repayment"
                  value={partialAmount}
                  onChange={setPartialAmount}
                  note="Payment covers accrued interest first, then principal."
                />
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={
                      !tx.connected || tx.pending || selected.debt === 0n
                    }
                    onClick={() =>
                      tx.run("Partial loan repayment", () => {
                        const assets = parseAmount(partialAmount);
                        return [
                          approveCall(assets),
                          vaultCall("repay", [selected.id, assets]),
                        ];
                      })
                    }
                  >
                    Repay amount
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      !tx.connected || tx.pending || selected.debt === 0n
                    }
                    onClick={() =>
                      tx.run("Repay full loan", async () => {
                        const [principal, , debt] = (await readVault(
                          "previewDebt",
                          [selected.id],
                        )) as bigint[];
                        const maximum =
                          debt + projectedInterest(principal, 60n) + 10n;
                        return [
                          approveCall(maximum),
                          vaultCall("repayAll", [selected.id, maximum]),
                        ];
                      })
                    }
                  >
                    Repay full debt ↗
                  </button>
                </div>
                <p className="text-note">
                  One approval-and-repayment signature. Exact debt is calculated
                  at execution; only principal payment restores principal
                  capacity.
                </p>
              </>
            ) : (
              <div className="empty">
                Draw a loan to begin servicing.
                <br />
                Repayment remains available during pauses and delinquency.
              </div>
            )}
          </div>
        </Panel>
      </div>
      <TxStatus {...tx} />
      <Panel
        title="Borrower credit history"
        aside="ACTUAL CONTRACT RECORDS"
        className="section-space"
      >
        <LoanTable
          loans={loans}
          at={allLoans.data?.timestamp}
          onSelect={(loan) => setSelectedId(loan.id)}
        />
      </Panel>
    </>
  );
}
