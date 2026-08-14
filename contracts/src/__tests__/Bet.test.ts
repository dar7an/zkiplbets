import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_ORACLE_PUBLIC_KEY } from '@zk-cricket/shared';
import { Field, PrivateKey, Signature, UInt64 } from 'o1js';
import { beforeAll, describe, expect, it } from 'vitest';
import { BetMarket } from '../Bet.js';
import { BetInfo } from '../structs.js';
import { signFixture } from '../oracle.js';
import {
  makeBet,
  openFixture,
  openFixtureWithSignature,
  placeBet,
  proofsEnabled,
  sendTx,
  setupMarket,
} from './harness.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../shared/fixtures'
);

describe('BetMarket', () => {
  beforeAll(async () => {
    if (proofsEnabled) await BetMarket.compile();
  });

  it('deploys and initializes the oracle public key', async () => {
    const ctx = await setupMarket();
    expect(ctx.zkApp.oraclePublicKey.get().toBase58()).toBe(ctx.oraclePk.toBase58());
  });

  it('updates fixture state from a production-oracle hardcoded 2024 signature', async () => {
    const raw = JSON.parse(
      readFileSync(join(fixturesDir, 'hardcoded-2024-fixture.json'), 'utf8')
    ) as { data: { fixtureID: number; localTeamID: number; visitorTeamID: number; startingAt: number }; signature: string };
    const ctx = await setupMarket({
      oracle: 'production',
      productionOraclePk: PRODUCTION_ORACLE_PUBLIC_KEY,
    });
    const fixture = {
      fixtureID: BigInt(raw.data.fixtureID),
      localTeamID: BigInt(raw.data.localTeamID),
      visitorTeamID: BigInt(raw.data.visitorTeamID),
      startingAt: BigInt(raw.data.startingAt),
    };
    await openFixtureWithSignature(
      ctx,
      fixture,
      Signature.fromBase58(raw.signature)
    );
    expect(ctx.zkApp.fixtureCommitment.get().equals(Field(0)).toBoolean()).toBe(false);
  });

  it('updates fixture state from the recorded live oracle signature', async () => {
    const raw = JSON.parse(
      readFileSync(join(fixturesDir, 'recorded-oracle-fixture.json'), 'utf8')
    ) as {
      data: { fixtureID: number; localTeamID: number; visitorTeamID: number; startingAt: number };
      signature: string;
    };
    const ctx = await setupMarket({
      oracle: 'production',
      productionOraclePk: PRODUCTION_ORACLE_PUBLIC_KEY,
    });
    await openFixtureWithSignature(
      ctx,
      {
        fixtureID: BigInt(raw.data.fixtureID),
        localTeamID: BigInt(raw.data.localTeamID),
        visitorTeamID: BigInt(raw.data.visitorTeamID),
        startingAt: BigInt(raw.data.startingAt),
      },
      Signature.fromBase58(raw.signature)
    );
    expect(ctx.marketNonce).toBe(1n);
  });

  it('rejects an invalid fixture signature', async () => {
    const ctx = await setupMarket();
    const other = PrivateKey.random();
    const signature = signFixture(other, ctx.fixture);
    await expect(
      openFixtureWithSignature(ctx, ctx.fixture, signature)
    ).rejects.toThrow();
  });

  it('rejects a bet from the wrong sender', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    const bet = makeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, 1_000_000_000n);
    const witness = ctx.storage.getWitness(0n);
    await expect(
      sendTx(ctx.bettorB, [], async () => {
        await ctx.zkApp.placeBet(
          bet,
          witness,
          Field(ctx.fixture.fixtureID),
          Field(ctx.fixture.localTeamID),
          Field(ctx.fixture.visitorTeamID),
          Field(ctx.fixture.startingAt)
        );
      })
    ).rejects.toThrow();
  });

  it('rejects an occupied merkle leaf', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    await placeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, 1_000_000_000n);
    const bet = makeBet(ctx, ctx.bettorB, ctx.fixture.visitorTeamID, 1_000_000_000n);
    const staleWitness = ctx.storage.getWitness(0n);
    await expect(
      sendTx(ctx.bettorB, [], async () => {
        await ctx.zkApp.placeBet(
          bet,
          staleWitness,
          Field(ctx.fixture.fixtureID),
          Field(ctx.fixture.localTeamID),
          Field(ctx.fixture.visitorTeamID),
          Field(ctx.fixture.startingAt)
        );
      })
    ).rejects.toThrow();
  });

  it('rejects a team that is not in the fixture', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    await expect(
      placeBet(ctx, ctx.bettorA, 999n, 1_000_000_000n)
    ).rejects.toThrow();
  });

  it('rejects updateFixture after bets exist', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    await placeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, 1_000_000_000n);
    const next = { ...ctx.fixture, fixtureID: 1n };
    await expect(openFixture(ctx, next)).rejects.toThrow();
  });

  it('moves MINA into the zkApp on placeBet', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    const before = ctx.zkApp.account.balance.get().toBigInt();
    await placeBet(ctx, ctx.bettorA, ctx.fixture.localTeamID, 2_000_000_000n);
    const after = ctx.zkApp.account.balance.get().toBigInt();
    expect(after - before).toBe(2_000_000_000n);
    expect(ctx.zkApp.localPool.get().toBigInt()).toBe(2_000_000_000n);
  });

  it('rejects a zero stake', async () => {
    const ctx = await setupMarket();
    await openFixture(ctx);
    const bet = new BetInfo({
      userPublicKey: ctx.bettorA,
      teamID: Field(ctx.fixture.localTeamID),
      amount: UInt64.zero,
      marketNonce: Field(ctx.marketNonce),
    });
    const witness = ctx.storage.getWitness(0n);
    await expect(
      sendTx(ctx.bettorA, [], async () => {
        await ctx.zkApp.placeBet(
          bet,
          witness,
          Field(ctx.fixture.fixtureID),
          Field(ctx.fixture.localTeamID),
          Field(ctx.fixture.visitorTeamID),
          Field(ctx.fixture.startingAt)
        );
      })
    ).rejects.toThrow();
  });
});
