import type { FixtureFields, StatusFields } from './types.js';

/**
 * Exact Schnorr field order. Must match sportmonksoracle `oracleUtils.fixtureToFields`.
 * Do not insert timestamp — the oracle does not sign it.
 */
export function fixtureFieldOrder(f: FixtureFields): bigint[] {
  return [f.fixtureID, f.localTeamID, f.visitorTeamID, f.startingAt];
}

export function statusFieldOrder(s: StatusFields): bigint[] {
  return [
    s.fixtureID,
    s.localTeamID,
    s.visitorTeamID,
    s.startingAt,
    s.status,
    s.winnerTeamID,
  ];
}

export function asNonNegativeBigInt(value: number | bigint | string, label: string): bigint {
  const v = typeof value === 'bigint' ? value : BigInt(value);
  if (v < 0n) {
    throw new Error(`${label} must be non-negative`);
  }
  return v;
}
