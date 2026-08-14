import { RAKE_BPS } from '@zk-cricket/shared';
import { Field, Provable, UInt64 } from 'o1js';

if (RAKE_BPS !== 0n) {
  throw new Error(
    'BetMarket implements 0 rake in-circuit. Update circuitParimutuelPayout before changing RAKE_BPS.'
  );
}

/** Constrained floor(numerator / denominator). Remainder is unconstrained beyond 0 ≤ r < d. */
export function floorDiv(numerator: Field, denominator: Field): Field {
  denominator.assertNotEquals(Field(0), 'division by zero');
  const q = Provable.witness(Field, () => Field(numerator.toBigInt() / denominator.toBigInt()));
  const r = Provable.witness(Field, () => Field(numerator.toBigInt() % denominator.toBigInt()));
  q.mul(denominator).add(r).assertEquals(numerator);
  r.assertLessThan(denominator);
  return q;
}

export function fieldToUInt64(x: Field): UInt64 {
  const bits = x.toBits(64);
  return UInt64.fromBits(bits);
}

/**
 * payout = floor(stake × total / winning). Dust remains in the zkApp.
 * Safe for UInt64 balances because payout ≤ total when stake ≤ winning.
 */
export function circuitParimutuelPayout(
  stake: UInt64,
  totalPool: UInt64,
  winningPool: UInt64
): UInt64 {
  winningPool.assertGreaterThan(UInt64.zero, 'winning pool is empty');
  const q = floorDiv(stake.value.mul(totalPool.value), winningPool.value);
  q.assertLessThanOrEqual(totalPool.value);
  return fieldToUInt64(q);
}
