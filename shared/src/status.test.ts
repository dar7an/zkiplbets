import { describe, expect, it } from 'vitest';
import {
  isLockableStatus,
  isTerminalWinner,
  isVoidOutcome,
  mapSportmonksStatus,
  OracleStatus,
} from './status.js';

describe('SportMonks cricket status allowlist', () => {
  it('maps the oracle compact codes from source strings', () => {
    expect(mapSportmonksStatus('NS')).toBe(OracleStatus.NotStarted);
    expect(mapSportmonksStatus('1st Innings')).toBe(OracleStatus.InProgress);
    expect(mapSportmonksStatus('Innings Break')).toBe(OracleStatus.InProgress);
    expect(mapSportmonksStatus('Finished')).toBe(OracleStatus.Finished);
    expect(mapSportmonksStatus('Aban.')).toBe(OracleStatus.Cancelled);
    expect(mapSportmonksStatus('No Result')).toBe(OracleStatus.Cancelled);
    expect(mapSportmonksStatus('Tie')).toBe(OracleStatus.Cancelled);
  });

  it('settles only a finished match with a side that played', () => {
    expect(isTerminalWinner(3, 38n, 38n, 39n)).toBe(true);
    expect(isTerminalWinner(3, 0n, 38n, 39n)).toBe(false);
    expect(isTerminalWinner(1, 38n, 38n, 39n)).toBe(false);
    expect(isTerminalWinner(4, 38n, 38n, 39n)).toBe(false);
  });

  it('voids tie, NR/abandoned (cancelled), and finished-with-no-winner', () => {
    expect(isVoidOutcome(4, 0n, 38n, 39n)).toBe(true);
    expect(isVoidOutcome(3, 0n, 38n, 39n)).toBe(true);
    expect(isVoidOutcome(3, 99n, 38n, 39n)).toBe(true);
    expect(isVoidOutcome(3, 38n, 38n, 39n)).toBe(false);
    expect(isVoidOutcome(1, 0n, 38n, 39n)).toBe(false);
  });

  it('locks on any non-NS terminal or in-play status', () => {
    expect(isLockableStatus(1)).toBe(false);
    expect(isLockableStatus(2)).toBe(true);
    expect(isLockableStatus(3)).toBe(true);
    expect(isLockableStatus(4)).toBe(true);
  });
});
