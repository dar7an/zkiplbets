import { MarketPhase, parimutuelPayout } from '@zk-cricket/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { BetMarket } from '../Bet.js';
import {
  balance,
  claimBet,
  expectPhase,
  lockAtKickoff,
  placeBet,
  proofsEnabled,
  settleWinner,
  setupMarket,
  voidMarket,
  openFixture,
} from './harness.js';

describe('BetMarket LocalBlockchain E2E', () => {
  beforeAll(async () => {
    if (proofsEnabled) await BetMarket.compile();
  });

  it('pays the winner the parimutuel pool and the loser nothing', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    const stakeA = 2_000_000_000n;
    const stakeB = 1_000_000_000n;
    await placeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, stakeA);
    await placeBet(ctx, ctx.bettorB, ctx.fixture.visitorTeamID, stakeB);
    await lockAtKickoff(ctx);
    expectPhase(ctx, MarketPhase.Locked);

    const beforeA = balance(ctx.bettorA);
    const beforeB = balance(ctx.bettorB);
    await settleWinner(ctx, ctx.fixture.localTeamID);
    expectPhase(ctx, MarketPhase.Settled);

    await claimBet(ctx, 0n, ctx.bettorA);
    await claimBet(ctx, 1n, ctx.bettorB);

    const expected = parimutuelPayout(stakeA, stakeA + stakeB, stakeA);
    expect(balance(ctx.bettorA) - beforeA).toBe(expected);
    expect(balance(ctx.bettorB) - beforeB).toBe(0n);
    expect(ctx.zkApp.account.balance.get().toBigInt()).toBe(0n);
  });

  it('refunds both sides on void', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    const stakeA = 1_000_000_000n;
    const stakeB = 3_000_000_000n;
    await placeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, stakeA);
    await placeBet(ctx, ctx.bettorB, ctx.fixture.visitorTeamID, stakeB);
    const beforeA = balance(ctx.bettorA);
    const beforeB = balance(ctx.bettorB);
    await voidMarket(ctx);
    expectPhase(ctx, MarketPhase.Voided);
    await claimBet(ctx, 0n, ctx.deployer);
    await claimBet(ctx, 1n, ctx.deployer);
    expect(balance(ctx.bettorA) - beforeA).toBe(stakeA);
    expect(balance(ctx.bettorB) - beforeB).toBe(stakeB);
  });

  it('settles once and rejects a second settle', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    await placeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, 1_000_000_000n);
    await settleWinner(ctx, ctx.fixture.localTeamID);
    await expect(settleWinner(ctx, ctx.fixture.localTeamID)).rejects.toThrow();
  });
});
