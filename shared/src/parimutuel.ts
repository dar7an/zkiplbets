import { RAKE_BPS } from './constants.js';

/**
 * Parimutuel payout in nanomina.
 *
 *   payout_i = floor( stake_i × netTotal / winningPool )
 *   netTotal = floor( totalPool × (10000 - rakeBps) / 10000 )
 *
 * Losers are not paid here (callers pass the winning pool only).
 * Integer division remainder stays in the zkApp.
 */
export function parimutuelPayout(
  stake: bigint,
  totalPool: bigint,
  winningPool: bigint,
  rakeBps: bigint = RAKE_BPS
): bigint {
  if (stake <= 0n) throw new Error('stake must be greater than 0');
  if (totalPool <= 0n) throw new Error('total pool must be greater than 0');
  if (winningPool <= 0n) throw new Error('winning pool must be greater than 0');
  if (stake > winningPool) throw new Error('stake cannot exceed the winning pool');
  if (winningPool > totalPool) throw new Error('winning pool cannot exceed total pool');
  if (rakeBps < 0n || rakeBps >= 10000n) throw new Error('rake must be in [0, 10000)');

  const netTotal = (totalPool * (10000n - rakeBps)) / 10000n;
  return (stake * netTotal) / winningPool;
}

/** Implied pool share for a side: teamPool / totalPool, or 0 if empty. */
export function impliedShare(teamPool: bigint, totalPool: bigint): number {
  if (totalPool <= 0n) return 0;
  return Number(teamPool) / Number(totalPool);
}

/** Current parimutuel multiple if this side wins now (total / team). */
export function poolMultiple(teamPool: bigint, totalPool: bigint): number | null {
  if (teamPool <= 0n) return null;
  return Number(totalPool) / Number(teamPool);
}
