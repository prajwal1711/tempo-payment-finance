import assert from "node:assert/strict";
import { simulateCalls } from "viem/actions";
import type { Address } from "viem";
import { publicClient, readVault } from "../src/lib/chain";
import { approveCall, vaultCall } from "../src/lib/hooks";
import deployment from "../src/lib/deployment.json";
import { projectedInterest } from "../src/lib/format";
import type { Loan } from "../src/lib/types";
async function check(
  label: string,
  account: Address,
  calls: ReturnType<typeof vaultCall>[],
) {
  const result = await simulateCalls(publicClient, {
    account,
    calls,
    traceAssetChanges: false,
  });
  assert.ok(
    result.results.every((call) => call.status === "success"),
    `${label} simulation must succeed`,
  );
  console.log(
    `${label}: ${result.results.length} atomic calls simulated successfully`,
  );
}
async function main() {
  const shares = (await readVault("previewDeposit", [100000000n])) as bigint;
  await check("Investor deposit", deployment.investorAAddress as Address, [
    approveCall(100000000n),
    vaultCall("depositWithMinShares", [
      100000000n,
      deployment.investorAAddress,
      (shares * 995n) / 1000n,
    ]),
  ]);
  const ids = (await readVault("getActiveLoanIds")) as bigint[];
  const id = ids[0];
  assert.ok(id, "Existing active demo loan required");
  const loan = (await readVault("getLoan", [id])) as Loan;
  const [principal, , debt] = (await readVault("previewDebt", [
    id,
  ])) as bigint[];
  const maximum = debt + projectedInterest(principal, 60n) + 10n;
  await check(
    "Third-party partial repayment",
    deployment.demoSettlementProviderAddress as Address,
    [approveCall(1000000n), vaultCall("repay", [id, 1000000n])],
  );
  await check(
    "Third-party full repayment",
    deployment.demoSettlementProviderAddress as Address,
    [approveCall(maximum), vaultCall("repayAll", [id, maximum])],
  );
  await check(
    "Settlement-linked repayment",
    deployment.demoSettlementProviderAddress as Address,
    [
      approveCall(maximum),
      vaultCall("repaySettlement", [loan.borrower, loan.batchRef, maximum]),
    ],
  );
  const after = (await readVault("previewDebt", [id])) as bigint[];
  assert.equal(
    after[0],
    principal,
    "Simulation must not change actual principal",
  );
  console.log(
    "Read-only verification complete; no transactions signed or submitted.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
