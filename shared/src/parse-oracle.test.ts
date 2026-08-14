import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureFieldOrder, statusFieldOrder } from './encoding.js';
import { parseFixtureData, parseSignedEnvelope, parseStatusData } from './parse-oracle.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('field encoding', () => {
  it('preserves the public Schnorr field order for fixtures', () => {
    expect(
      fixtureFieldOrder({
        fixtureID: 66230n,
        localTeamID: 39n,
        visitorTeamID: 37n,
        startingAt: 1752154200000n,
      }).map(String)
    ).toEqual(['66230', '39', '37', '1752154200000']);
  });

  it('preserves the public Schnorr field order for status', () => {
    expect(
      statusFieldOrder({
        fixtureID: 66230n,
        localTeamID: 39n,
        visitorTeamID: 37n,
        startingAt: 1752154200000n,
        status: 3n,
        winnerTeamID: 39n,
      }).map(String)
    ).toEqual(['66230', '39', '37', '1752154200000', '3', '39']);
  });
});

describe('oracle JSON schema', () => {
  it('parses the recorded live camelCase fixture', () => {
    const raw = JSON.parse(
      readFileSync(join(fixturesDir, 'recorded-oracle-fixture.json'), 'utf8')
    ) as unknown;
    const env = parseSignedEnvelope(raw, parseFixtureData);
    expect(env.data.localTeamName).toBe('England');
    expect(env.data.visitorTeamName).toBe('Sri Lanka');
    expect(env.data.fixtureID).toBe(67377n);
    expect(env.publicKey.startsWith('B62')).toBe(true);
  });

  it('parses the recorded live status payload', () => {
    const raw = JSON.parse(
      readFileSync(join(fixturesDir, 'recorded-oracle-status.json'), 'utf8')
    ) as unknown;
    const env = parseSignedEnvelope(raw, parseStatusData);
    expect(env.data.status).toBe(1n);
    expect(env.data.winnerTeamID).toBe(0n);
  });

  it('rejects snake_case team names so the UI cannot show Team 1 / Team 2', () => {
    expect(() =>
      parseFixtureData({
        fixtureID: 1,
        localTeamID: 2,
        visitorTeamID: 3,
        startingAt: 4,
        localteam_name: 'England',
        localteam_code: 'ENG',
        visitorteam_name: 'Sri Lanka',
        visitorteam_code: 'SL',
      })
    ).toThrow(/snake_case/);
  });
});
