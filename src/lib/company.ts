import deployment from "./deployment.json";
import { fixture } from "./fixture";
import { short } from "./format";
import { parseUnits } from "viem";

// A presentation alias for the existing demo wallet. The deployed diligence
// hash and original underwriting fixture remain intact.
export const sampleCompany = {
  name: "Alpha Remit",
  corridor: "UK → India",
  settlementAmount: parseUnits(fixture.expectedSettlementAmount, 6),
  fundingAmount: parseUnits(fixture.prefundingRequirement, 6),
  delaySeconds: BigInt(fixture.standardSettlementDelayHours * 3600),
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
