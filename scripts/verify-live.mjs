import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { erc20Abi, keccak256, toHex, parseEventLogs } from "viem";
import {
  ASSET,
  publicClient,
  accountFor,
  artifact,
  sendCalls,
  approval,
  contractCall,
  writeJson,
  preflight,
} from "./network.mjs";
const manifest = JSON.parse(readFileSync("deployments/moderato.json"));
const vault = manifest.vaultAddress,
  abi = artifact("PaymentFinanceVault").abi;
const borrower = accountFor("BORROWER").address,
  investor = accountFor("INVESTOR_A").address;
const call = (name, args = []) => contractCall(vault, abi, name, args);
const read = (name, args = [], blockNumber) =>
  publicClient.readContract({
    address: vault,
    abi,
    functionName: name,
    args,
    blockNumber,
  });
const balance = (address, blockNumber) =>
  publicClient.readContract({
    address: ASSET,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
    blockNumber,
  });
const nonce = Date.now();
const ref = (name) => keccak256(toHex(`LIVE-${nonce}-${name}`));
const report = {
  vaultAddress: vault,
  startedAt: new Date().toISOString(),
  assertions: [],
  transactions: [],
  snapshots: [],
};
const save = () => writeJson("deployments/live-verification.json", report);
const check = (name, actual, expected = true) => {
  assert.deepEqual(actual, expected, name);
  report.assertions.push(name);
  console.log(`PASS ${name}`);
  save();
};
const events = (receipt) => parseEventLogs({ abi, logs: receipt.logs });
async function tx(label, role, calls, options) {
  const receipt = await sendCalls(role, calls, options);
  report.transactions.push({
    label,
    role,
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
  });
  save();
  console.log(`${label}: ${receipt.transactionHash}`);
  return receipt;
}
async function snapshot(label, blockNumber) {
  const result = await read("getPoolSnapshot", [], blockNumber);
  report.snapshots.push({
    label,
    blockNumber: blockNumber ?? (await publicClient.getBlockNumber()),
    ...result,
  });
  save();
  return result;
}
// Revalue the preceding block's portfolio at the operation's actual timestamp.
async function navBeforeAtReceipt(receipt) {
  const previous = receipt.blockNumber - 1n;
  const { timestamp } = await publicClient.getBlock({
    blockNumber: receipt.blockNumber,
  });
  const ids = await read("getActiveLoanIds", [], previous);
  let nav = await balance(vault, previous);
  for (const id of ids) {
    const loan = await read("getLoan", [id], previous);
    nav +=
      loan.principalOutstanding +
      loan.interestAccrued +
      (loan.principalOutstanding * 1800n * (timestamp - loan.lastAccruedAt) +
        loan.accrualRemainder) /
        315360000000n;
  }
  return nav;
}
async function draw(label, amount, tenor) {
  const batchRef = ref(label);
  const receipt = await tx(label, "BORROWER", [
    call("draw", [amount, tenor, batchRef]),
  ]);
  const event = events(receipt).find((e) => e.eventName === "LoanDrawn");
  check(
    `${label}: draw conserves NAV`,
    await read("totalAssets", [], receipt.blockNumber),
    await navBeforeAtReceipt(receipt),
  );
  const topic = keccak256(
    toHex("TransferWithMemo(address,address,uint256,bytes32)"),
  );
  check(
    `${label}: matching transfer memo`,
    receipt.logs.some(
      (log) =>
        log.address.toLowerCase() === ASSET.toLowerCase() &&
        log.topics[0] === topic &&
        log.topics.includes(batchRef),
    ),
  );
  return { id: event.args.loanId, batchRef };
}
async function fullRepay(label, loan, role = "BORROWER", settlement = false) {
  const debt = (await read("previewDebt", [loan.id]))[2];
  const max = debt + 10_000n;
  const receipt = await tx(label, role, [
    approval(vault, max),
    settlement
      ? call("repaySettlement", [borrower, loan.batchRef, max])
      : call("repayAll", [loan.id, max]),
  ]);
  check(`${label}: loan settled`, (await read("getLoan", [loan.id])).status, 3);
  return receipt;
}
async function waitOverdue(id) {
  const loan = await read("getLoan", [id]);
  console.log(`Waiting for real block timestamp > ${loan.dueAt}`);
  const deadline = Date.now() + 150_000;
  while ((await publicClient.getBlock()).timestamp <= loan.dueAt) {
    if (Date.now() > deadline)
      throw new Error("Testnet timestamp did not advance before timeout");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
await preflight();
check(
  "Main pool starts without active loans",
  (await read("getActiveLoanIds")).length,
  0,
);
await snapshot("seeded");
const first = await draw("48-hour working capital", 600_000_000n, 172800n);
let receipt = await tx("Partial interest-first repayment", "BORROWER", [
  approval(vault, 100_000_000n),
  call("repay", [first.id, 100_000_000n]),
]);
check(
  "Partial repayment conserves NAV",
  await read("totalAssets", [], receipt.blockNumber),
  await navBeforeAtReceipt(receipt),
);
let allocation = events(receipt).find((e) => e.eventName === "LoanRepaid").args;
check(
  "Partial allocation sums to payment",
  allocation.paidInterest + allocation.paidPrincipal,
  100_000_000n,
);
check(
  "Interest allocated before principal",
  (await read("getLoan", [first.id])).interestAccrued,
  0n,
);
receipt = await fullRepay("Full repayment reopens line", first);
check(
  "Full repayment conserves NAV",
  await read("totalAssets", [], receipt.blockNumber),
  await navBeforeAtReceipt(receipt),
);
check(
  "Borrowing capacity restored",
  await read("availableCredit", [borrower]),
  750_000_000n,
);
const second = await draw("60-second demonstration", 600_000_000n, 60n);
await waitOverdue(second.id);
check(
  "Overdue borrower draw reason",
  (await read("availableToDraw", [borrower]))[1],
  4,
);
receipt = await tx(
  "Rejected overdue draw",
  "BORROWER",
  [call("draw", [1_000_000n, 60n, ref("rejected")])],
  { allowRevert: true },
);
check("Overdue draw receipt reverted", receipt.status, "reverted");
const ownedShares = await read("balanceOf", [investor]);
receipt = await tx("Escrow investor A shares", "INVESTOR_A", [
  call("requestRedeem", [ownedShares]),
]);
check(
  "Escrow preserves total supply",
  await read("balanceOf", [vault]),
  ownedShares,
);
check(
  "Pending request exists",
  (await read("pendingRequestOf", [investor])) > 0n,
);
receipt = await tx(
  "Rejected overdue processing",
  "INVESTOR_B",
  [call("processRedemptions", [10n])],
  { allowRevert: true },
);
check("Overdue processing receipt reverted", receipt.status, "reverted");
receipt = await fullRepay(
  "Settlement provider repays matching batch",
  second,
  "SETTLEMENT",
  true,
);
check(
  "Settlement repayment conserves NAV",
  await read("totalAssets", [], receipt.blockNumber),
  await navBeforeAtReceipt(receipt),
);
const settledEvent = events(receipt).find(
  (e) => e.eventName === "SettlementRepaid",
);
check(
  "Distinct settlement payer recorded",
  settledEvent.args.payer.toLowerCase(),
  accountFor("SETTLEMENT").address.toLowerCase(),
);
check(
  "Matching settlement batch recorded",
  settledEvent.args.batchRef,
  second.batchRef,
);
const investorBalanceBefore = await balance(investor);
receipt = await tx("Permissionless FIFO investor payout", "INVESTOR_B", [
  call("processRedemptions", [10n]),
]);
const payout = events(receipt).find(
  (e) => e.eventName === "RedemptionProcessed",
).args;
check(
  "Investor received exact payout",
  await balance(investor),
  investorBalanceBefore + payout.assets,
);
check("Escrowed shares burned", await read("balanceOf", [vault]), 0n);
check(
  "Pending pointer cleared",
  await read("pendingRequestOf", [investor]),
  0n,
);
await snapshot("after-investor-payout");
const third = await draw("Separate loss scenario", 50_000_000n, 60n);
await waitOverdue(third.id);
receipt = await tx("Manager recognizes full loss", "MANAGER", [
  call("writeOff", [third.id, ref("simulated-default")]),
]);
const loss = events(receipt).find((e) => e.eventName === "LoanWrittenOff").args
  .carryingValue;
check(
  "Write-off reduces NAV once",
  await read("totalAssets", [], receipt.blockNumber),
  (await navBeforeAtReceipt(receipt)) - loss,
);
check(
  "Written-off loan removed from active ledger",
  (await read("getActiveLoanIds")).length,
  0,
);
const frozen = (await read("previewDebt", [third.id]))[2];
await snapshot("after-writeoff");
receipt = await tx("Partial written-off debt recovery", "SETTLEMENT", [
  approval(vault, 10_000_000n),
  call("repay", [third.id, 10_000_000n]),
]);
check(
  "Recovery increases NAV exactly once",
  await read("totalAssets", [], receipt.blockNumber),
  (await navBeforeAtReceipt(receipt)) + 10_000_000n,
);
check(
  "Written-off debt has frozen interest",
  (await read("previewDebt", [third.id]))[2],
  frozen - 10_000_000n,
);
receipt = await fullRepay(
  "Recover remaining written-off debt",
  third,
  "SETTLEMENT",
  true,
);
const recovered = events(receipt).find((e) => e.eventName === "LoanRecovered")
  .args.assets;
check(
  "Final recovery increases NAV once",
  await read("totalAssets", [], receipt.blockNumber),
  (await navBeforeAtReceipt(receipt)) + recovered,
);
check(
  "Default exposure cleared",
  await read("principalExposure", [borrower]),
  0n,
);
check(
  "Manager reapproval still required",
  (await read("getBorrower", [borrower])).config.enabled,
  false,
);
await tx("Manager reapproves recovered borrower", "MANAGER", [
  call("configureBorrower", [
    borrower,
    true,
    750_000_000n,
    172800n,
    (await read("getBorrower", [borrower])).config.diligenceHash,
  ]),
]);
// Restore the demo pool to two funded investors and a normal live loan.
const minShares =
  ((await read("previewDeposit", [500_000_000n])) * 995n) / 1000n;
await tx("Investor A replenishes demonstration position", "INVESTOR_A", [
  approval(vault, 500_000_000n),
  call("depositWithMinShares", [500_000_000n, investor, minShares]),
]);
await draw("Staged 48-hour live loan", 600_000_000n, 172800n);
await snapshot("ready-for-demo");
report.completedAt = new Date().toISOString();
report.passed = true;
save();
console.log(
  `Completed ${report.assertions.length} live assertions. Testnet receipts saved in deployments/live-verification.json.`,
);
