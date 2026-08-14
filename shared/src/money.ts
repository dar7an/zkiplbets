import { NANOMINA_PER_MINA } from './constants.js';

export function minaToNanomina(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) {
    throw new Error('Enter a MINA amount with at most 9 decimal places');
  }
  const [whole = '0', frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '000000000').slice(0, 9);
  return BigInt(whole) * NANOMINA_PER_MINA + BigInt(fracPadded);
}

export function nanominaToMina(nano: bigint): string {
  const sign = nano < 0n ? '-' : '';
  const abs = nano < 0n ? -nano : nano;
  const whole = abs / NANOMINA_PER_MINA;
  const frac = abs % NANOMINA_PER_MINA;
  if (frac === 0n) return `${sign}${whole.toString()}`;
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}.${fracStr}`;
}

export function formatMina(nano: bigint, digits = 3): string {
  const mina = Number(nano) / Number(NANOMINA_PER_MINA);
  if (!Number.isFinite(mina)) return nanominaToMina(nano);
  return mina.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
