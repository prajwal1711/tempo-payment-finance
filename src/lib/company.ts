import deployment from "./deployment.json";
import { fixture } from "./fixture";
import demoScenario from "../../fixtures/million-demo.json";
import stagedDemo from "./million-demo.json";
import type { Loan } from "./types";
import { short } from "./format";
import { parseUnits } from "viem";

// A presentation alias for the existing demo wallet. The deployed diligence
// hash and original underwriting fixture remain intact.
export const sampleCompany = {
  name: "Alpha Remit",
  corridor: "UK → India",
  settlementAmount: parseUnits(demoScenario.expectedSettlementAmount, 6),
  fundingAmount: parseUnits(demoScenario.prefundingRequirement, 6),
  creditLimit: demoScenario.creditLimit,
  fundingInput: demoScenario.prefundingRequirement,
  investorDepositInput: demoScenario.investorPositionTarget,
  delaySeconds: BigInt(demoScenario.standardSettlementDelayHours * 3600),
};
export const assetColors = {
  cash: "#0f766e",
  principal: "#6366f1",
  interest: "#d97706",
};
export function isSampleCompany(address?: string) {
  return (
    address?.toLowerCase() === deployment.demoBorrowerAddress.toLowerCase()
  );
}
export function companyName(address?: string) {
  return isSampleCompany(address)
    ? sampleCompany.name
    : address
      ? `Company ${short(address)}`
      : "Company";
}

// Settlement fixtures are presentation evidence, never debt accounting.
// Preserve the small original scenario for historical loans; associate the
// million-scale record with its exact on-chain batch, not every company loan.
export function settlementFixtureForLoan(loan: Loan) {
  if (!isSampleCompany(loan.borrower)) return undefined;
  if (loan.batchRef.toLowerCase() === stagedDemo.batchRef.toLowerCase())
    return stagedDemo;
  if (loan.drawnAt < BigInt(stagedDemo.drawnAt)) return fixture;
  return undefined;
}
