import { MarketPhase, OracleStatus } from '@zk-cricket/shared';
import {
  AccountUpdate,
  Field,
  method,
  Permissions,
  Poseidon,
  Provable,
  PublicKey,
  Signature,
  SmartContract,
  state,
  State,
  UInt64,
} from 'o1js';
import { idlePackedState, packMarketState, unpackMarketState } from './packedState.js';
import { circuitParimutuelPayout } from './payout.js';
import {
  BetInfo,
  BetPlacedEvent,
  BetsMerkleWitness,
  claimedLeafHash,
  ClaimedEvent,
  EMPTY_MERKLE_ROOT,
  MAX_BETS,
} from './structs.js';

function assertFixtureBinding(
  commitment: Field,
  fixtureID: Field,
  localTeamID: Field,
  visitorTeamID: Field,
  startingAt: Field,
  marketNonce: Field
) {
  Poseidon.hash([
    fixtureID,
    localTeamID,
    visitorTeamID,
    startingAt,
    marketNonce,
  ]).assertEquals(commitment, 'fixture does not match this market');
}

function assertOpenOrLocked(phase: Field) {
  phase
    .equals(Field(MarketPhase.Open))
    .or(phase.equals(Field(MarketPhase.Locked)))
    .assertTrue('market is not open or locked');
}

export class BetMarket extends SmartContract {
  /**
   * Trusted SportMonks oracle. Compromise of this key is compromise of
   * every market. There is no rotation method; redeploy to change it.
   */
  @state(PublicKey) oraclePublicKey = State<PublicKey>();
  /** Poseidon(fixtureID, localTeamID, visitorTeamID, startingAt, marketNonce) */
  @state(Field) fixtureCommitment = State<Field>();
  @state(Field) betsMerkleRoot = State<Field>();
  @state(UInt64) localPool = State<UInt64>();
  @state(UInt64) visitorPool = State<UInt64>();
  @state(Field) packedState = State<Field>();
  @state(Field) winnerTeamID = State<Field>();

  events = {
    'bet-placed': BetPlacedEvent,
    'bet-claimed': ClaimedEvent,
  };

  init() {
    super.init();
    this.account.permissions.set({
      ...Permissions.default(),
      send: Permissions.proof(),
    });
    this.oraclePublicKey.set(PublicKey.empty());
    this.fixtureCommitment.set(Field(0));
    this.betsMerkleRoot.set(EMPTY_MERKLE_ROOT);
    this.localPool.set(UInt64.zero);
    this.visitorPool.set(UInt64.zero);
    this.packedState.set(idlePackedState());
    this.winnerTeamID.set(Field(0));
  }

  /** One-shot. First caller after deploy sets the trusted oracle. */
  @method async initialize(oraclePk: PublicKey) {
    this.oraclePublicKey.getAndRequireEquals().isEmpty().assertTrue('already initialized');
    oraclePk.isEmpty().assertFalse('oracle public key is required');
    this.oraclePublicKey.set(oraclePk);
  }

  @method async updateFixture(
    fixtureID: Field,
    localTeamID: Field,
    visitorTeamID: Field,
    startingAt: Field,
    signature: Signature
  ) {
    const oraclePk = this.oraclePublicKey.getAndRequireEquals();
    signature
      .verify(oraclePk, [fixtureID, localTeamID, visitorTeamID, startingAt])
      .assertTrue('invalid fixture signature');

    this.betsMerkleRoot
      .getAndRequireEquals()
      .assertEquals(EMPTY_MERKLE_ROOT, 'fixture is frozen because bets exist');

    const packed = unpackMarketState(this.packedState.getAndRequireEquals());
    packed.betCount.assertEquals(Field(0), 'fixture is frozen because bets exist');
    packed.phase
      .equals(Field(MarketPhase.Idle))
      .or(packed.phase.equals(Field(MarketPhase.Open)))
      .assertTrue('cannot replace a locked or settled market');

    const newNonce = packed.marketNonce.add(1);
    newNonce.assertLessThan(Field(1n << 32n));

    this.fixtureCommitment.set(
      Poseidon.hash([fixtureID, localTeamID, visitorTeamID, startingAt, newNonce])
    );
    this.localPool.set(UInt64.zero);
    this.visitorPool.set(UInt64.zero);
    this.winnerTeamID.set(Field(0));
    this.packedState.set(
      packMarketState({
        phase: Field(MarketPhase.Open),
        status: Field(OracleStatus.NotStarted),
        marketNonce: newNonce,
        betCount: Field(0),
      })
    );
  }

  @method async placeBet(
    bet: BetInfo,
    path: BetsMerkleWitness,
    fixtureID: Field,
    localTeamID: Field,
    visitorTeamID: Field,
    startingAt: Field
  ) {
    const packed = unpackMarketState(this.packedState.getAndRequireEquals());
    packed.phase.assertEquals(Field(MarketPhase.Open), 'market is not open');
    packed.betCount.assertLessThan(Field(MAX_BETS), 'market is full (128 bets)');

    assertFixtureBinding(
      this.fixtureCommitment.getAndRequireEquals(),
      fixtureID,
      localTeamID,
      visitorTeamID,
      startingAt,
      packed.marketNonce
    );

    bet.marketNonce.assertEquals(packed.marketNonce, 'bet is for a different market');
    bet.amount.assertGreaterThan(UInt64.zero, 'stake must be greater than 0');
    bet.teamID
      .equals(localTeamID)
      .or(bet.teamID.equals(visitorTeamID))
      .assertTrue('team is not in this fixture');

    const sender = this.sender.getUnconstrained();
    bet.userPublicKey.assertEquals(sender);
    const senderUpdate = AccountUpdate.createSigned(sender);
    senderUpdate.send({ to: this, amount: bet.amount });

    const root = this.betsMerkleRoot.getAndRequireEquals();
    path.calculateRoot(Field(0)).assertEquals(root, 'leaf is not empty');
    this.betsMerkleRoot.set(path.calculateRoot(bet.hash()));

    const isLocal = bet.teamID.equals(localTeamID);
    const localPool = this.localPool.getAndRequireEquals();
    const visitorPool = this.visitorPool.getAndRequireEquals();
    this.localPool.set(Provable.if(isLocal, UInt64, localPool.add(bet.amount), localPool));
    this.visitorPool.set(
      Provable.if(isLocal, UInt64, visitorPool, visitorPool.add(bet.amount))
    );

    this.packedState.set(
      packMarketState({
        ...packed,
        betCount: packed.betCount.add(1),
      })
    );

    this.emitEvent(
      'bet-placed',
      new BetPlacedEvent({
        index: packed.betCount,
        teamID: bet.teamID,
        amount: bet.amount,
      })
    );
  }

  /** Lock once chain time has reached startingAt (milliseconds). */
  @method async lockAtKickoff(
    fixtureID: Field,
    localTeamID: Field,
    visitorTeamID: Field,
    startingAt: Field
  ) {
    const packed = unpackMarketState(this.packedState.getAndRequireEquals());
    packed.phase.assertEquals(Field(MarketPhase.Open), 'market is not open');
    assertFixtureBinding(
      this.fixtureCommitment.getAndRequireEquals(),
      fixtureID,
      localTeamID,
      visitorTeamID,
      startingAt,
      packed.marketNonce
    );
    startingAt.assertLessThan(Field(1n << 64n));
    const start = UInt64.Unsafe.fromField(startingAt);
    this.network.timestamp.requireBetween(start, UInt64.MAXINT());
    this.packedState.set(
      packMarketState({
        ...packed,
        phase: Field(MarketPhase.Locked),
      })
    );
  }

  /** Lock when the oracle says the match is no longer NS. */
  @method async lockFromOracle(
    fixtureID: Field,
    localTeamID: Field,
    visitorTeamID: Field,
    startingAt: Field,
    status: Field,
    winnerTeamID: Field,
    signature: Signature
  ) {
    const packed = unpackMarketState(this.packedState.getAndRequireEquals());
    packed.phase.assertEquals(Field(MarketPhase.Open), 'market is not open');
    assertFixtureBinding(
      this.fixtureCommitment.getAndRequireEquals(),
      fixtureID,
      localTeamID,
      visitorTeamID,
      startingAt,
      packed.marketNonce
    );

    const oraclePk = this.oraclePublicKey.getAndRequireEquals();
    signature
      .verify(oraclePk, [fixtureID, localTeamID, visitorTeamID, startingAt, status, winnerTeamID])
      .assertTrue('invalid status signature');

    status.equals(Field(OracleStatus.NotStarted)).assertFalse('status is still not started');

    this.packedState.set(
      packMarketState({
        ...packed,
        phase: Field(MarketPhase.Locked),
        status,
      })
    );
  }

  @method async settle(
    fixtureID: Field,
    localTeamID: Field,
    visitorTeamID: Field,
    startingAt: Field,
    status: Field,
    winnerTeamID: Field,
    signature: Signature
  ) {
    const packed = unpackMarketState(this.packedState.getAndRequireEquals());
    assertOpenOrLocked(packed.phase);
    assertFixtureBinding(
      this.fixtureCommitment.getAndRequireEquals(),
      fixtureID,
      localTeamID,
      visitorTeamID,
      startingAt,
      packed.marketNonce
    );

    const oraclePk = this.oraclePublicKey.getAndRequireEquals();
    signature
      .verify(oraclePk, [fixtureID, localTeamID, visitorTeamID, startingAt, status, winnerTeamID])
      .assertTrue('invalid status signature');

    status.assertEquals(Field(OracleStatus.Finished), 'settle requires a finished match');
    winnerTeamID
      .equals(localTeamID)
      .or(winnerTeamID.equals(visitorTeamID))
      .assertTrue('settle requires a winner in this fixture');
    winnerTeamID.equals(Field(0)).assertFalse();

    this.winnerTeamID.set(winnerTeamID);
    this.packedState.set(
      packMarketState({
        ...packed,
        phase: Field(MarketPhase.Settled),
        status,
      })
    );
  }

  @method async voidMarket(
    fixtureID: Field,
    localTeamID: Field,
    visitorTeamID: Field,
    startingAt: Field,
    status: Field,
    winnerTeamID: Field,
    signature: Signature
  ) {
    const packed = unpackMarketState(this.packedState.getAndRequireEquals());
    assertOpenOrLocked(packed.phase);
    assertFixtureBinding(
      this.fixtureCommitment.getAndRequireEquals(),
      fixtureID,
      localTeamID,
      visitorTeamID,
      startingAt,
      packed.marketNonce
    );

    const oraclePk = this.oraclePublicKey.getAndRequireEquals();
    signature
      .verify(oraclePk, [fixtureID, localTeamID, visitorTeamID, startingAt, status, winnerTeamID])
      .assertTrue('invalid status signature');

    const cancelled = status.equals(Field(OracleStatus.Cancelled));
    const finishedNoWinner = status
      .equals(Field(OracleStatus.Finished))
      .and(
        winnerTeamID
          .equals(Field(0))
          .or(winnerTeamID.equals(localTeamID).or(winnerTeamID.equals(visitorTeamID)).not())
      );
    cancelled.or(finishedNoWinner).assertTrue('status is not a void outcome');

    this.packedState.set(
      packMarketState({
        ...packed,
        phase: Field(MarketPhase.Voided),
        status,
      })
    );
  }

  @method async claim(
    bet: BetInfo,
    path: BetsMerkleWitness,
    fixtureID: Field,
    localTeamID: Field,
    visitorTeamID: Field,
    startingAt: Field
  ) {
    const packed = unpackMarketState(this.packedState.getAndRequireEquals());
    const isVoid = packed.phase.equals(Field(MarketPhase.Voided));
    const isSettled = packed.phase.equals(Field(MarketPhase.Settled));
    isVoid.or(isSettled).assertTrue('market is not terminal');

    assertFixtureBinding(
      this.fixtureCommitment.getAndRequireEquals(),
      fixtureID,
      localTeamID,
      visitorTeamID,
      startingAt,
      packed.marketNonce
    );
    bet.marketNonce.assertEquals(packed.marketNonce, 'bet is for a different market');

    const root = this.betsMerkleRoot.getAndRequireEquals();
    path.calculateRoot(bet.hash()).assertEquals(root, 'witness does not match this bet');
    this.betsMerkleRoot.set(path.calculateRoot(claimedLeafHash(bet.hash())));

    const localPool = this.localPool.getAndRequireEquals();
    const visitorPool = this.visitorPool.getAndRequireEquals();
    const total = localPool.add(visitorPool);
    const winner = this.winnerTeamID.getAndRequireEquals();
    const winningPool = Provable.if(winner.equals(localTeamID), UInt64, localPool, visitorPool);
    const safeWinning = Provable.if(
      winningPool.equals(UInt64.zero),
      UInt64,
      UInt64.one,
      winningPool
    );
    const winPayout = circuitParimutuelPayout(bet.amount, total, safeWinning);
    const isWin = bet.teamID.equals(winner);
    const payout = Provable.if(
      isVoid,
      UInt64,
      bet.amount,
      Provable.if(isWin, UInt64, winPayout, UInt64.zero)
    );

    this.send({ to: bet.userPublicKey, amount: payout });
    this.emitEvent(
      'bet-claimed',
      new ClaimedEvent({
        teamID: bet.teamID,
        payout,
      })
    );
  }
}
