import { asNonNegativeBigInt } from './encoding.js';
import type {
  FixtureData,
  JsonFixtureData,
  JsonStatusData,
  SignedOracleEnvelope,
  StatusData,
} from './types.js';

const SNAKE_KEYS = [
  'localteam_name',
  'localteam_code',
  'visitorteam_name',
  'visitorteam_code',
] as const;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Missing ${key} (camelCase). Live oracle uses localTeamName, not localteam_name.`);
  }
  return v;
}

function requireNumberish(obj: Record<string, unknown>, key: string): bigint {
  const v = obj[key];
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') {
    return asNonNegativeBigInt(v, key);
  }
  throw new Error(`Missing ${key}`);
}

export function parseFixtureData(raw: unknown): FixtureData {
  const obj = requireRecord(raw, 'fixture data');
  for (const key of SNAKE_KEYS) {
    if (key in obj) {
      throw new Error(
        `Rejected snake_case key "${key}". Use camelCase (localTeamName) from the live oracle schema.`
      );
    }
  }
  return {
    fixtureID: requireNumberish(obj, 'fixtureID'),
    localTeamID: requireNumberish(obj, 'localTeamID'),
    visitorTeamID: requireNumberish(obj, 'visitorTeamID'),
    startingAt: requireNumberish(obj, 'startingAt'),
    localTeamName: requireString(obj, 'localTeamName'),
    localTeamCode: requireString(obj, 'localTeamCode'),
    visitorTeamName: requireString(obj, 'visitorTeamName'),
    visitorTeamCode: requireString(obj, 'visitorTeamCode'),
    timestamp: obj.timestamp === undefined ? undefined : requireNumberish(obj, 'timestamp'),
  };
}

export function parseStatusData(raw: unknown): StatusData {
  const obj = requireRecord(raw, 'status data');
  return {
    fixtureID: requireNumberish(obj, 'fixtureID'),
    localTeamID: requireNumberish(obj, 'localTeamID'),
    visitorTeamID: requireNumberish(obj, 'visitorTeamID'),
    startingAt: requireNumberish(obj, 'startingAt'),
    status: requireNumberish(obj, 'status'),
    winnerTeamID: requireNumberish(obj, 'winnerTeamID'),
    timestamp: obj.timestamp === undefined ? undefined : requireNumberish(obj, 'timestamp'),
  };
}

export function parseSignedEnvelope<T>(
  raw: unknown,
  parseData: (data: unknown) => T
): SignedOracleEnvelope<T> {
  const obj = requireRecord(raw, 'oracle envelope');
  const signature = obj.signature;
  const publicKey = obj.publicKey;
  if (typeof signature !== 'string' || signature.length < 8) {
    throw new Error('Oracle envelope is missing a signature');
  }
  if (typeof publicKey !== 'string' || !publicKey.startsWith('B62')) {
    throw new Error('Oracle envelope is missing a Mina public key');
  }
  return {
    data: parseData(obj.data),
    signature,
    publicKey,
  };
}

export function fixtureDataToJson(data: FixtureData): JsonFixtureData {
  return {
    fixtureID: Number(data.fixtureID),
    localTeamID: Number(data.localTeamID),
    visitorTeamID: Number(data.visitorTeamID),
    startingAt: Number(data.startingAt),
    localTeamName: data.localTeamName,
    localTeamCode: data.localTeamCode,
    visitorTeamName: data.visitorTeamName,
    visitorTeamCode: data.visitorTeamCode,
    timestamp: data.timestamp === undefined ? undefined : Number(data.timestamp),
  };
}

export function statusDataToJson(data: StatusData): JsonStatusData {
  return {
    fixtureID: Number(data.fixtureID),
    localTeamID: Number(data.localTeamID),
    visitorTeamID: Number(data.visitorTeamID),
    startingAt: Number(data.startingAt),
    status: Number(data.status),
    winnerTeamID: Number(data.winnerTeamID),
    timestamp: data.timestamp === undefined ? undefined : Number(data.timestamp),
  };
}

export function formatKickoff(startingAtMs: bigint): string {
  const date = new Date(Number(startingAtMs));
  if (Number.isNaN(date.getTime())) return 'Unknown kickoff';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date) + ' UTC';
}
