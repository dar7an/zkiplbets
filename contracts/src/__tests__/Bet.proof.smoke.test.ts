import { describe, expect, it } from 'vitest';
import { BetMarket } from '../Bet.js';
import { openFixture, placeBet, proofsEnabled, setupMarket } from './harness.js';

const RUN = process.env.RUN_PROOFS === '1';

describe.skipIf(!RUN)('real-proof smoke', () => {
  it(
    'compiles BetMarket and places one bet with proofsEnabled',
    async () => {
      expect(proofsEnabled).toBe(true);
      await BetMarket.compile();
      const ctx = await setupMarket();
      await openFixture(ctx);
      await placeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, 1_000_000_000n);
      expect(ctx.zkApp.localPool.get().toBigInt()).toBe(1_000_000_000n);
    },
    20 * 60_000
  );
});
