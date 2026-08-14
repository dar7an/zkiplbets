import { MarketPhase } from '@zk-cricket/shared';
import {
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  Signature,
  UInt32,
  UInt64,
} from 'o1js';
import { BetMarket } from '../Bet.js';
import { PersistentBetStorage } from '../BetStorage.js';
import { signFixture, signStatus } from '../oracle.js';
import { unpackMarketStateOffchain } from '../packedState.js';
import { BetInfo } from '../structs.js';

export const proofsEnabled = process.env.RUN_PROOFS === '1';

export type FixtureArgs = {
  fixtureID: bigint;
  localTeamID: bigint;
  visitorTeamID: bigint;
  startingAt: bigint;
};

export type TestContext = {
  Local: Awaited<ReturnType<typeof Mina.LocalBlockchain>>;
  deployer: Mina.TestPublicKey;
  bettorA: Mina.TestPublicKey;
  bettorB: Mina.TestPublicKey;
  zkApp: BetMarket;
  zkAppKey: PrivateKey;
  zkAppAddress: PublicKey;
  oracleKey: PrivateKey;
  oraclePk: PublicKey;
  storage: PersistentBetStorage;
  fixture: FixtureArgs;
  marketNonce: bigint;
};

const FEE = 0;

export async function sendTx(
  sender: Mina.TestPublicKey,
  extraKeys: PrivateKey[],
  fn: () => Promise<void>
) {
  const txn = await Mina.transaction({ sender, fee: FEE }, fn);
  await txn.prove();
  await txn.sign([sender.key, ...extraKeys]).send();
  return txn;
}

export async function setupMarket(opts?: {
  oracle?: 'local' | 'production';
  productionOraclePk?: string;
}): Promise<TestContext> {
  const Local = await Mina.LocalBlockchain({ proofsEnabled });
  Mina.setActiveInstance(Local);
  const [deployer, bettorA, bettorB] = Local.testAccounts;
  const zkAppKey = PrivateKey.random();
  const zkAppAddress = zkAppKey.toPublicKey();
  const zkApp = new BetMarket(zkAppAddress);
  const oracleKey = PrivateKey.random();
  const oraclePk =
    opts?.oracle === 'production' && opts.productionOraclePk
      ? PublicKey.fromBase58(opts.productionOraclePk)
      : oracleKey.toPublicKey();

  await sendTx(deployer, [zkAppKey], async () => {
    AccountUpdate.fundNewAccount(deployer);
    await zkApp.deploy();
  });
  await sendTx(deployer, [], async () => {
    await zkApp.initialize(oraclePk);
  });

  const fixture: FixtureArgs = {
    fixtureID: 67377n,
    localTeamID: 38n,
    visitorTeamID: 39n,
    startingAt: 1_700_000_000_000n,
  };

  return {
    Local,
    deployer,
    bettorA,
    bettorB,
    zkApp,
    zkAppKey,
    zkAppAddress,
    oracleKey,
    oraclePk,
    storage: new PersistentBetStorage(),
    fixture,
    marketNonce: 0n,
  };
}

export async function openFixture(ctx: TestContext, fixture = ctx.fixture) {
  const signature = signFixture(ctx.oracleKey, fixture);
  await sendTx(ctx.bettorA, [], async () => {
    await ctx.zkApp.updateFixture(
      Field(fixture.fixtureID),
      Field(fixture.localTeamID),
      Field(fixture.visitorTeamID),
      Field(fixture.startingAt),
      signature
    );
  });
  ctx.fixture = fixture;
  ctx.marketNonce += 1n;
}

export async function openFixtureWithSignature(
  ctx: TestContext,
  fixture: FixtureArgs,
  signature: Signature
) {
  await sendTx(ctx.bettorA, [], async () => {
    await ctx.zkApp.updateFixture(
      Field(fixture.fixtureID),
      Field(fixture.localTeamID),
      Field(fixture.visitorTeamID),
      Field(fixture.startingAt),
      signature
    );
  });
  ctx.fixture = fixture;
  ctx.marketNonce += 1n;
}

export function makeBet(
  ctx: TestContext,
  user: PublicKey,
  teamID: bigint,
  amount: bigint
): BetInfo {
  return new BetInfo({
    userPublicKey: user,
    teamID: Field(teamID),
    amount: UInt64.from(amount),
    marketNonce: Field(ctx.marketNonce),
  });
}

export async function placeBet(
  ctx: TestContext,
  sender: Mina.TestPublicKey,
  teamID: bigint,
  amount: bigint
) {
  const bet = makeBet(ctx, sender, teamID, amount);
  const witness = ctx.storage.getWitness(ctx.storage.nextIndex);
  await sendTx(sender, [], async () => {
    await ctx.zkApp.placeBet(
      bet,
      witness,
      Field(ctx.fixture.fixtureID),
      Field(ctx.fixture.localTeamID),
      Field(ctx.fixture.visitorTeamID),
      Field(ctx.fixture.startingAt)
    );
  });
  ctx.storage.addBet(bet);
  return bet;
}

export async function lockAtKickoff(ctx: TestContext) {
  const { genesisTimestamp, slotTime } = ctx.Local.getNetworkConstants();
  const start = ctx.fixture.startingAt;
  const genesis = genesisTimestamp.toBigInt();
  if (start > genesis) {
    const slots = (start - genesis) / slotTime.toBigInt() + 2n;
    ctx.Local.setGlobalSlot(UInt32.from(slots));
  }
  await sendTx(ctx.deployer, [], async () => {
    await ctx.zkApp.lockAtKickoff(
      Field(ctx.fixture.fixtureID),
      Field(ctx.fixture.localTeamID),
      Field(ctx.fixture.visitorTeamID),
      Field(ctx.fixture.startingAt)
    );
  });
}

export async function settleWinner(ctx: TestContext, winnerTeamID: bigint) {
  const payload = {
    ...ctx.fixture,
    status: 3n,
    winnerTeamID,
  };
  const signature = signStatus(ctx.oracleKey, payload);
  await sendTx(ctx.deployer, [], async () => {
    await ctx.zkApp.settle(
      Field(payload.fixtureID),
      Field(payload.localTeamID),
      Field(payload.visitorTeamID),
      Field(payload.startingAt),
      Field(payload.status),
      Field(payload.winnerTeamID),
      signature
    );
  });
}

export async function voidMarket(
  ctx: TestContext,
  status = 4n,
  winnerTeamID = 0n
) {
  const payload = {
    ...ctx.fixture,
    status,
    winnerTeamID,
  };
  const signature = signStatus(ctx.oracleKey, payload);
  await sendTx(ctx.deployer, [], async () => {
    await ctx.zkApp.voidMarket(
      Field(payload.fixtureID),
      Field(payload.localTeamID),
      Field(payload.visitorTeamID),
      Field(payload.startingAt),
      Field(payload.status),
      Field(payload.winnerTeamID),
      signature
    );
  });
}

export async function claimBet(ctx: TestContext, index: bigint, feePayer: Mina.TestPublicKey) {
  const stored = ctx.storage.getBet(index);
  if (!stored) throw new Error('missing bet');
  const bet = ctx.storage.toBetInfo(stored);
  const witness = ctx.storage.getWitness(index);
  await sendTx(feePayer, [], async () => {
    await ctx.zkApp.claim(
      bet,
      witness,
      Field(ctx.fixture.fixtureID),
      Field(ctx.fixture.localTeamID),
      Field(ctx.fixture.visitorTeamID),
      Field(ctx.fixture.startingAt)
    );
  });
  ctx.storage.markClaimed(index);
}

export function readPhase(ctx: TestContext): number {
  return unpackMarketStateOffchain(ctx.zkApp.packedState.get().toBigInt()).phase;
}

export function expectPhase(ctx: TestContext, phase: (typeof MarketPhase)[keyof typeof MarketPhase]) {
  const actual = readPhase(ctx);
  if (actual !== phase) {
    throw new Error(`expected phase ${phase}, got ${actual}`);
  }
}

export function balance(pk: PublicKey): bigint {
  return Mina.getBalance(pk).toBigInt();
}
