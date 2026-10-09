import type { Activity } from "./types";
export type HistoryRange = "1D" | "7D" | "All";
export const financialEvents = new Set([
  "Deposit",
  "RedemptionProcessed",
  "LoanDrawn",
  "LoanRepaid",
  "LoanRecovered",
  "LoanWrittenOff",
  "Transfer",
  "RedemptionRequested",
  "RedemptionCancelled",
]);
export function sampleTimes(start: bigint, end: bigint, range: HistoryRange) {
  const lookback =
    range === "1D" ? 86400n : range === "7D" ? 604800n : end - start;
  const from = end - lookback > start ? end - lookback : start;
  let step = range === "1D" ? 3600n : range === "7D" ? 21600n : 86400n;
  if (range === "All" && (end - from) / step > 62n)
    step = ((end - from) / 62n / 86400n + 1n) * 86400n;
  const times = [from];
  for (let time = (from / step + 1n) * step; time < end; time += step)
    times.push(time);
  if (end !== from) times.push(end);
  return times;
}
export function eventBlocks(events: Activity[], first: bigint, last: bigint) {
  const blocks = new Set<bigint>();
  for (const event of events)
    if (
      financialEvents.has(event.eventName) &&
      event.blockNumber >= first &&
      event.blockNumber <= last
    ) {
      if (event.blockNumber > first) blocks.add(event.blockNumber - 1n);
      blocks.add(event.blockNumber);
    }
  return [...blocks];
}
export function combinedShares(
  held: bigint,
  pending?: { shares: bigint; status: number },
) {
  return held + (pending?.status === 1 ? pending.shares : 0n);
}
export function belongsToWallet(event: Activity, address: string) {
  const owner = address.toLowerCase();
  return Object.values(event.args).some(
    (value) => typeof value === "string" && value.toLowerCase() === owner,
  );
}
