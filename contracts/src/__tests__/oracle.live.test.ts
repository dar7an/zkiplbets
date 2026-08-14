import { PRODUCTION_ORACLE_PUBLIC_KEY, parseFixtureData, parseSignedEnvelope } from '@zk-cricket/shared';
import { PublicKey, Signature } from 'o1js';
import { describe, expect, it } from 'vitest';
import { verifyFixture } from '../oracle.js';

const LIVE = process.env.RUN_LIVE_ORACLE === '1';

describe.skipIf(!LIVE)('live SportMonks oracle', () => {
  it('verifies the currently signed fixture against the production public key', async () => {
    const response = await fetch('https://sportmonksoracle.vercel.app/fixture');
    expect(response.ok).toBe(true);
    const envelope = parseSignedEnvelope(await response.json(), parseFixtureData);
    expect(envelope.publicKey).toBe(PRODUCTION_ORACLE_PUBLIC_KEY);
    const ok = verifyFixture(
      PublicKey.fromBase58(envelope.publicKey),
      envelope.data,
      Signature.fromBase58(envelope.signature)
    );
    expect(ok).toBe(true);
  });
});
