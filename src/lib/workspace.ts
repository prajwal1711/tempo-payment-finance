import type { Borrower } from "./types";
export function workspaceEligibility(
  address?: string,
  borrower?: Borrower,
  owner?: string,
  pendingOwner?: string,
) {
  const wallet = address?.toLowerCase();
  const isOwner = !!wallet && wallet === owner?.toLowerCase();
  const isPendingOwner = !!wallet && wallet === pendingOwner?.toLowerCase();
  const configured =
    !!wallet &&
    !!borrower &&
    (borrower.config.enabled ||
      borrower.config.creditLimit > 0n ||
      borrower.principalOutstanding > 0n ||
      borrower.unresolvedWrittenOffLoans > 0n);
  return {
    investor: true,
    borrower: configured,
    manager: isOwner || isPendingOwner,
    isOwner,
    isPendingOwner,
  };
}
