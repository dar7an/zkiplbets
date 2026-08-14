import { describe, expect, it } from 'vitest';
import { minaToNanomina, nanominaToMina } from './money.js';

describe('nanomina conversion', () => {
  it('converts whole MINA without float error', () => {
    expect(minaToNanomina('2')).toBe(2_000_000_000n);
    expect(nanominaToMina(2_000_000_000n)).toBe('2');
  });

  it('converts fractional MINA up to 9 decimals', () => {
    expect(minaToNanomina('1.5')).toBe(1_500_000_000n);
    expect(minaToNanomina('0.000000001')).toBe(1n);
    expect(nanominaToMina(1n)).toBe('0.000000001');
  });

  it('rejects more than 9 decimals and negatives', () => {
    expect(() => minaToNanomina('1.0000000001')).toThrow();
    expect(() => minaToNanomina('-1')).toThrow();
  });
});
