/**
 * Compact status integers signed by sportmonksoracle.
 * Source mapping: sportmonksoracle `src/status.ts` (Aug 2026).
 *
 * The zkApp never sees SportMonks strings — only these integers — but the
 * string allowlist is encoded here so UI, tests, and docs cannot drift.
 */
export const OracleStatus = {
  NotStarted: 1,
  InProgress: 2,
  Finished: 3,
  Cancelled: 4,
} as const;

export type OracleStatus = (typeof OracleStatus)[keyof typeof OracleStatus];

/** SportMonks cricket strings the oracle maps to NotStarted (1). */
export const SPORTMONKS_NOT_STARTED = ['NS'] as const;

/** SportMonks cricket strings the oracle maps to InProgress (2). */
export const SPORTMONKS_IN_PROGRESS = [
  '1st Innings',
  'Innings Break',
  '2nd Innings',
  'Int.',
] as const;

/** SportMonks cricket strings the oracle maps to Finished (3). */
export const SPORTMONKS_FINISHED = ['Finished'] as const;

/**
 * SportMonks cricket strings that fall through to Cancelled (4) in the oracle.
 * Includes abandoned, no-result, postponed, cancelled, and anything unknown.
 * A Finished payload with winnerTeamID 0 is treated as a tie (void) even
 * though the compact status is Finished.
 */
export const SPORTMONKS_VOID_SOURCE = [
  'Aban.',
  'Abandoned',
  'Cancl.',
  'Cancelled',
  'No Result',
  'NR',
  'Postp.',
  'Postponed',
  'Walkover',
  'Awarded',
  'Tie',
] as const;

export const STATUS_LABEL: Record<OracleStatus, string> = {
  [OracleStatus.NotStarted]: 'Not started',
  [OracleStatus.InProgress]: 'In play',
  [OracleStatus.Finished]: 'Finished',
  [OracleStatus.Cancelled]: 'Cancelled',
};

export function mapSportmonksStatus(status: string): OracleStatus {
  if ((SPORTMONKS_NOT_STARTED as readonly string[]).includes(status)) {
    return OracleStatus.NotStarted;
  }
  if ((SPORTMONKS_IN_PROGRESS as readonly string[]).includes(status)) {
    return OracleStatus.InProgress;
  }
  if ((SPORTMONKS_FINISHED as readonly string[]).includes(status)) {
    return OracleStatus.Finished;
  }
  return OracleStatus.Cancelled;
}

export function isTerminalWinner(
  status: number,
  winnerTeamID: bigint,
  localTeamID: bigint,
  visitorTeamID: bigint
): boolean {
  return (
    status === OracleStatus.Finished &&
    winnerTeamID !== 0n &&
    (winnerTeamID === localTeamID || winnerTeamID === visitorTeamID)
  );
}

export function isVoidOutcome(
  status: number,
  winnerTeamID: bigint,
  localTeamID: bigint,
  visitorTeamID: bigint
): boolean {
  if (status === OracleStatus.Cancelled) return true;
  if (status !== OracleStatus.Finished) return false;
  if (winnerTeamID === 0n) return true;
  return winnerTeamID !== localTeamID && winnerTeamID !== visitorTeamID;
}

export function isLockableStatus(status: number): boolean {
  return (
    status === OracleStatus.InProgress ||
    status === OracleStatus.Finished ||
    status === OracleStatus.Cancelled
  );
}
