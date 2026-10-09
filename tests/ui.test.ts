import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sampleTimes,
  eventBlocks,
  combinedShares,
  belongsToWallet,
} from "../src/lib/history-core";
import {
  alpha,
  shares,
  batchHash,
  parseAmount,
  projectedInterest,
  timestamp,
} from "../src/lib/format";
import type { Activity } from "../src/lib/types";
const event = (
  name: string,
  block: bigint,
  args: Record<string, unknown> = {},
): Activity => ({
  eventName: name,
  blockNumber: block,
  args,
  transactionHash: "0x00",
  logIndex: 0,
});
test("AlphaUSD uses six decimals and explicit units", () => {
  assert.equal(alpha(1003040559n, 6), "1,003.040559 AlphaUSD");
  assert.equal(alpha(205n, 6), "0.000205 AlphaUSD");
  assert.equal(alpha(undefined), "— AlphaUSD");
  assert.equal(parseAmount("600.000001"), 600000001n);
  assert.throws(() => parseAmount("0"));
  assert.throws(() => parseAmount("0.0000001"));
});
test("tPF uses eighteen decimals without losing small holdings", () => {
  assert.equal(parseAmount("10", 18), 10n ** 19n);
  assert.equal(shares(499999837000000000000n), "499.9998");
});
test("queued shares preserve the combined position and cancelled requests do not add exposure", () => {
  const original = 500n * 10n ** 18n;
  assert.equal(
    combinedShares(original - 10n * 10n ** 18n, {
      shares: 10n * 10n ** 18n,
      status: 1,
    }),
    original,
  );
  assert.equal(
    combinedShares(original, { shares: 10n * 10n ** 18n, status: 3 }),
    original,
  );
  assert.equal(combinedShares(original), original);
});
test("sampling includes endpoints and never invents future values", () => {
  for (const range of ["1D", "7D", "All"] as const) {
    const times = sampleTimes(1791483389n, 1791494451n, range);
    assert.equal(times[0], 1791483389n);
    assert.equal(times.at(-1), 1791494451n);
    assert.ok(
      times.every((time) => time >= 1791483389n && time <= 1791494451n),
    );
  }
});
test("All stays bounded for a long history and zero-duration has one point", () => {
  assert.ok(sampleTimes(0n, 86400n * 1000n, "All").length <= 64);
  assert.deepEqual(sampleTimes(20n, 20n, "All"), [20n]);
  assert.ok(sampleTimes(0n, 604800n, "7D").length <= 30);
});
test("financial events retain before and after blocks without predeployment reads", () => {
  const blocks = eventBlocks(
    [
      event("Deposit", 10n),
      event("LoanWrittenOff", 14n),
      event("LoanRecovered", 14n),
      event("Approval", 15n),
    ],
    10n,
    20n,
  );
  assert.deepEqual(blocks, [10n, 13n, 14n]);
});
test("wallet history is address-scoped and case-insensitive", () => {
  assert.equal(
    belongsToWallet(
      event("Transfer", 1n, { from: "0xABC", to: "0xDEF" }),
      "0xabc",
    ),
    true,
  );
  assert.equal(
    belongsToWallet(event("Deposit", 1n, { owner: "0xDEF" }), "0xabc"),
    false,
  );
});
test("batch hashing, actual interest and UTC dates stay consistent", () => {
  const reference = batchHash("UK-IN-CARD-NEW");
  assert.equal(reference, batchHash(" UK-IN-CARD-NEW "));
  assert.equal(batchHash(reference), reference);
  assert.equal(projectedInterest(600000000n, 60n), 205n);
  assert.equal(projectedInterest(600000000n, 172800n), 591780n);
  assert.match(timestamp(1791483389n), /UTC/);
});

test("workspace eligibility follows the connected wallet and keeps disabled borrowers eligible for servicing", async () => {
  const { workspaceEligibility } = await import("../src/lib/workspace");
  const config = {
    config: {
      enabled: false,
      creditLimit: 750000000n,
      maxTenorSeconds: 172800n,
      diligenceHash: "0x00",
    },
    principalOutstanding: 600000000n,
    unresolvedWrittenOffLoans: 0n,
    activeLoanIds: [],
  } as import("../src/lib/types").Borrower;
  assert.equal(
    workspaceEligibility(undefined, config, "0xABC", "0xDEF").manager,
    false,
  );
  assert.equal(workspaceEligibility(undefined, config).borrower, false);
  assert.equal(
    workspaceEligibility("0xABC", config, "0xabc", "0xdef").isOwner,
    true,
  );
  const pending = workspaceEligibility("0xDEF", undefined, "0xabc", "0xdef");
  assert.equal(pending.manager, true);
  assert.equal(pending.isOwner, false);
  assert.equal(pending.isPendingOwner, true);
  assert.equal(workspaceEligibility("0x123", config).borrower, true);
  assert.equal(
    workspaceEligibility("0x123", undefined, "0xabc").manager,
    false,
  );
  assert.equal(workspaceEligibility("0x123", undefined).investor, true);
});
