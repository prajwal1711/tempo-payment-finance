import fixture from "../../fixtures/borrower.json";
import { keccak256, toHex } from "viem";
export { fixture };
export const diligenceHash = keccak256(toHex(JSON.stringify(fixture)));
