import { formatUnits, parseUnits, keccak256, toHex, type Hex } from 'viem';
export function money(value?: bigint, precision = 2) {
  if (value === undefined) return '—';
  const [integer, fraction = ''] = formatUnits(value, 6).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}${precision ? `.${fraction.padEnd(precision, '0').slice(0, precision)}` : ''}`;
}
export function shares(value?: bigint, precision = 4) {
  if (value === undefined) return '—';
  const [integer, fraction = ''] = formatUnits(value, 18).split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(precision, '0').slice(0, precision)}`;
}
export function parseAmount(input: string, decimals = 6) {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(input.trim())) throw new Error(`Enter a positive amount with at most ${decimals} decimal places.`);
  const amount = parseUnits(input.trim(), decimals);
  if (amount <= 0n) throw new Error('Amount must be greater than zero.');
  return amount;
}
export function batchHash(input: string): Hex {
  const reference = input.trim();
  if (!reference) throw new Error('Enter a settlement batch reference.');
  return /^0x[0-9a-fA-F]{64}$/.test(reference) ? reference as Hex : keccak256(toHex(reference));
}
export function short(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
export function timestamp(value: bigint) { return new Date(Number(value) * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
export function projectedInterest(principal: bigint, seconds: bigint) { return principal * 1800n * seconds / 315_360_000_000n; }
export function utilization(principal?: bigint, nav?: bigint) { return nav && principal !== undefined ? `${(Number(principal * 10_000n / nav) / 100).toFixed(1)}%` : '0.0%'; }
