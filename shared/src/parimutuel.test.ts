import { describe, expect, it } from 'vitest';
import { impliedShare, parimutuelPayout, poolMultiple } from './parimutuel.js';

describe('parimutuel payout', () => {
  it('pays stake × total / winning with 0 rake', () => {
    const stake = 2_000_000_000n;
    const local = 2_000_000_000n;
    const visitor = 1_000_000_000n;
    expect(parimutuelPayout(stake, local + visitor, local)).toBe(3_000_000_000n);
  });

  it('keeps integer dust in the remainder', () => {
    expect(parimutuelPayout(1n, 3n, 2n)).toBe(1n);
  });

  it('applies rake in basis points when configured', () => {
    const payout = parimutuelPayout(1_000_000_000n, 2_000_000_000n, 1_000_000_000n, 500n);
    expect(payout).toBe(1_900_000_000n);
  });

  it('rejects empty winning pool and zero stake', () => {
    expect(() => parimutuelPayout(0n, 1n, 1n)).toThrow(/greater than 0/);
    expect(() => parimutuelPayout(1n, 1n, 0n)).toThrow(/winning pool/);
  });
});

describe('implied pool share', () => {
  it('is stake_on_team / total_pool', () => {
    expect(impliedShare(2n, 3n)).toBeCloseTo(2 / 3);
    expect(poolMultiple(2n, 3n)).toBeCloseTo(1.5);
    expect(impliedShare(0n, 0n)).toBe(0);
    expect(poolMultiple(0n, 3n)).toBeNull();
  });
});
