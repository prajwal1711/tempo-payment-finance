import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { erc20Abi, keccak256, parseEventLogs, parseUnits, toHex } from "viem";
import {
  ASSET,
  accountFor,
  approval,
  artifact,
  contractCall,
  preflight,
  publicClient,
  sendCalls,
  writeJson,
} from "./network.mjs";

// Testnet-only staging. Rerunning resumes from contract state and the saved batch,
// rather than depositing another million or opening a duplicate loan.
const deployment = JSON.parse(readFileSync("deployments/moderato.json"));
const fixture = JSON.parse(readFileSync("fixtures/million-demo.json"));
const path = "deployments/million-demo.json";
const abi = artifact("PaymentFinanceVault").abi;
const vault = deployment.vaultAddress;
const borrower = accountFor("BORROWER").address;
const target = parseUnits(fixture.poolTarget, 6);
const principal = parseUnits(fixture.prefundingRequirement, 6);
const limit = parseUnits(fixture.creditLimit, 6);
const tenor = BigInt(fixture.standardSettlementDelayHours * 3600);
const read = async (functionName, args = [], blockNumber) => {
  await delay(350);
  return publicClient.readContract({
    address: vault,
    abi,
    functionName,
    args,
    blockNumber,
  });
};
process.on("uncaughtException", (error) => {
  console.error(error.shortMessage || error.message);
  console.error(
    "Staging stopped. Confirm current chain state and rerun to resume; do not delete its manifest.",
  );
  process.exitCode = 1;
});
const call = (name, args = []) => contractCall(vault, abi, name, args);
const previous = existsSync(path) ? JSON.parse(readFileSync(path)) : undefined;
if (previous && previous.vaultAddress.toLowerCase() !== vault.toLowerCase())
  throw new Error("Staging manifest belongs to another vault");
const report = previous || {
  chainId: deployment.chainId,
  vaultAddress: vault,
  assetAddress: ASSET,
  borrowerAddress: borrower,
  fixture,
  createdAt: new Date().toISOString(),
  batchLabel: `ALPHA-REMIT-UK-IN-500K-${Date.now()}`,
  transactions: [],
};
report.batchRef ||= keccak256(toHex(report.batchLabel));
writeJson(path, report);
await preflight();
assert.equal(deployment.chainId, 42431);
assert.equal(
  borrower.toLowerCase(),
  deployment.demoBorrowerAddress.toLowerCase(),
);
assert.equal(
  (await read("owner")).toLowerCase(),
  accountFor("MANAGER").address.toLowerCase(),
);

async function transact(label, role, calls) {
  await delay(40000);
  const receipt = await sendCalls(role, calls);
  report.transactions.push({
    label,
    role,
    hash: receipt.transactionHash,
    block: receipt.blockNumber,
  });
  writeJson(path, report);
  console.log(
    `${label}: ${deployment.explorerUrl}/tx/${receipt.transactionHash}`,
  );
  return receipt;
}
async function assetBalance(role) {
  return publicClient.readContract({
    address: ASSET,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [accountFor(role).address],
  });
}

let loanId = await read("loanForBatch", [borrower, report.batchRef]);
if (loanId === 0n) {
  let snapshot = await read("getPoolSnapshot");
  assert.equal(
    snapshot.pendingRequests,
    0n,
    "Resolve pending redemptions before staging",
  );
  assert.equal(snapshot.depositsPaused, false, "Deposits are paused");
  assert.equal(snapshot.drawsPaused, false, "Draws are paused");
  const config = await read("getBorrower", [borrower]);
  assert.equal(config.unresolvedWrittenOffLoans, 0n, "Unresolved default");
  for (const id of await read("getActiveLoanIds")) {
    const loan = await read("getLoan", [id]);
    assert.equal(
      loan.borrower.toLowerCase(),
      borrower.toLowerCase(),
      "Unexpected active borrower",
    );
    assert.ok(
      loan.principalOutstanding <= parseUnits("1000", 6),
      "Refusing to settle an unexpected large loan",
    );
    const debt = (await read("previewDebt", [id]))[2];
    const bound = debt + parseUnits("1", 6);
    assert.ok(
      (await assetBalance("SETTLEMENT")) >= bound,
      "Settlement wallet needs funding",
    );
    await transact(`Settle previous loan ${id}`, "SETTLEMENT", [
      approval(vault, bound),
      call("repaySettlement", [borrower, loan.batchRef, bound]),
    ]);
    assert.equal((await read("getLoan", [id])).status, 3);
  }
  snapshot = await read("getPoolSnapshot");
  assert.equal(snapshot.principal, 0n);
  assert.ok(
    snapshot.nav <= target,
    "Pool already exceeds target; refusing to withdraw investor assets",
  );
  for (const role of ["INVESTOR_A", "INVESTOR_B"]) {
    snapshot = await read("getPoolSnapshot");
    const gap = target - snapshot.nav;
    const address = accountFor(role).address;
    const held = await read("balanceOf", [address]);
    const value = await read("convertToAssets", [held]);
    const investorTarget = parseUnits(fixture.investorPositionTarget, 6);
    const needed = investorTarget > value ? investorTarget - value : 0n;
    const amount = role === "INVESTOR_B" ? gap : needed < gap ? needed : gap;
    if (amount === 0n) continue;
    assert.ok((await assetBalance(role)) >= amount, `${role} needs funding`);
    const minimumShares =
      ((await read("previewDeposit", [amount])) * 995n) / 1000n;
    await transact(`Deposit ${role}`, role, [
      approval(vault, amount),
      call("depositWithMinShares", [amount, address, minimumShares]),
    ]);
  }
  assert.equal((await read("getPoolSnapshot")).nav, target);
  const current = await read("getBorrower", [borrower]);
  if (
    !current.config.enabled ||
    current.config.creditLimit !== limit ||
    BigInt(current.config.maxTenorSeconds) !== tenor
  ) {
    await transact("Approve 750,000 AlphaUSD credit line", "MANAGER", [
      call("configureBorrower", [
        borrower,
        true,
        limit,
        tenor,
        current.config.diligenceHash,
      ]),
    ]);
  }
  const [drawable, reason] = await read("availableToDraw", [borrower]);
  assert.equal(reason, 0);
  assert.ok(drawable >= principal);
  const receipt = await transact(
    "Alpha Remit draws 500,000 AlphaUSD",
    "BORROWER",
    [call("draw", [principal, tenor, report.batchRef])],
  );
  const event = parseEventLogs({ abi, logs: receipt.logs }).find(
    (e) => e.eventName === "LoanDrawn",
  );
  assert.ok(event, "Draw event missing");
  loanId = event.args.loanId;
  const memoEvents = parseEventLogs({
    abi: [
      {
        type: "event",
        name: "TransferWithMemo",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "amount", type: "uint256", indexed: false },
          { name: "memo", type: "bytes32", indexed: true },
        ],
      },
    ],
    logs: receipt.logs,
  });
  assert.ok(
    memoEvents.some(
      (e) =>
        e.address.toLowerCase() === ASSET.toLowerCase() &&
        e.args.from.toLowerCase() === vault.toLowerCase() &&
        e.args.to.toLowerCase() === borrower.toLowerCase() &&
        e.args.amount === principal &&
        e.args.memo === report.batchRef,
    ),
    "Matching AlphaUSD draw memo missing",
  );
}

// Bypass viem's short-lived latest-block cache after a mutation. Never verify
// new debt against a snapshot from before its successful draw receipt.
const latestBlock = await publicClient.getBlockNumber({ cacheTime: 0 });
const confirmedBlock = report.transactions.reduce(
  (last, tx) => (BigInt(tx.block) > last ? BigInt(tx.block) : last),
  0n,
);
const blockNumber = latestBlock > confirmedBlock ? latestBlock : confirmedBlock;
const snapshot = await read("getPoolSnapshot", [], blockNumber);
const loan = await read("getLoan", [loanId], blockNumber);
const config = await read("getBorrower", [borrower], blockNumber);
assert.equal(
  loan.status,
  1,
  "Staged loan is no longer active; do not silently recreate it",
);
assert.equal(loan.principalOutstanding, principal);
assert.equal(snapshot.principal, principal);
assert.equal(snapshot.cash, target - principal);
assert.equal(
  snapshot.hasOverdue,
  false,
  "Staged loan has matured; prepare a new scenario explicitly",
);
assert.equal(config.config.creditLimit, limit);
const investors = [];
for (const role of ["INVESTOR_A", "INVESTOR_B"]) {
  const address = accountFor(role).address;
  const heldShares = await read("balanceOf", [address], blockNumber);
  investors.push({
    role,
    address,
    heldShares,
    positionValue: await read("convertToAssets", [heldShares], blockNumber),
  });
}
Object.assign(report, {
  loanId,
  blockNumber,
  snapshot,
  loan,
  investors,
  verifiedAt: new Date().toISOString(),
});
writeJson(path, report);
// Public fixture metadata only. Financial amounts are still read from the chain.
writeJson("src/lib/million-demo.json", {
  ...fixture,
  loanId,
  batchRef: report.batchRef,
  batchLabel: report.batchLabel,
  borrowerAddress: borrower,
  drawnAt: loan.drawnAt,
  dueAt: loan.dueAt,
  drawTransaction: report.transactions.find(
    (t) => t.label === "Alpha Remit draws 500,000 AlphaUSD",
  )?.hash,
});
console.log(
  JSON.stringify(
    { loanId, blockNumber, snapshot, investors },
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ),
);
