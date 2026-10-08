import type { Address, Hash, Hex } from 'viem';
export type Snapshot = {
  cash: bigint; principal: bigint; interest: bigint; nav: bigint; shares: bigint;
  hasOverdue: boolean; pendingRequests: bigint; queueHead: bigint; queueTail: bigint;
  depositsPaused: boolean; drawsPaused: boolean; interestPaid: bigint; writtenOff: bigint;
  recovered: bigint; timestamp: bigint;
};
export type Loan = {
  borrower: Address; batchRef: Hex; originalPrincipal: bigint; principalOutstanding: bigint;
  interestAccrued: bigint; accrualRemainder: bigint; drawnAt: bigint; dueAt: bigint;
  lastAccruedAt: bigint; status: number;
};
export type LoanRecord = Loan & { id: bigint; interest: bigint; debt: bigint; transactionHash?: Hash };
export type Borrower = {
  config: { enabled: boolean; creditLimit: bigint; maxTenorSeconds: bigint; diligenceHash: Hex };
  principalOutstanding: bigint; unresolvedWrittenOffLoans: bigint; activeLoanIds: readonly bigint[];
};
export type Redemption = { id: bigint; owner: Address; shares: bigint; requestedAt: bigint; status: number; estimatedAssets: bigint };
export type Activity = { eventName: string; args: Record<string, unknown>; transactionHash: Hash; blockNumber: bigint; logIndex: number };
export const drawReasons = [
  'Available to draw', 'Borrower is not approved', 'Unresolved written-off debt', 'New borrowing is paused',
  'Borrower has an overdue loan', 'Investor redemptions are pending', 'Invalid amount, tenor, or batch reference',
  'Active loan limit reached', 'Credit limit reached', 'Pool cash reserve would be breached',
];
