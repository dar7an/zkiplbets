import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fixtureDataToJson,
  formatMina,
  OracleStatus,
  parseFixtureData,
  parseSignedEnvelope,
  type FixtureData,
  type JsonFixtureData,
} from '@zk-cricket/shared';
import {
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  UInt32,
  UInt64,
} from 'o1js';
import { BetMarket } from '../Bet.js';
import { PersistentBetStorage, type StoredBet } from '../BetStorage.js';
import { signFixture, signStatus } from '../oracle.js';
import { unpackMarketStateOffchain } from '../packedState.js';
import { BetInfo } from '../structs.js';

const FEE = 0;
const here = dirname(fileURLToPath(import.meta.url));
const recordedFixturePath = join(here, '../../../shared/fixtures/recorded-oracle-fixture.json');

export type DemoAccount = {
  index: number;
  label: string;
  publicKey: string;
  balanceNanomina: string;
  balanceMina: string;
};

export type DemoState = {
  mode: 'LocalBlockchain demo';
  proofsEnabled: false;
  zkAppAddress: string;
  oraclePublicKey: string;
  oracleKind: 'local-demo';
  phase: number;
  phaseLabel: string;
  status: number;
  marketNonce: string;
  betCount: number;
  maxBets: number;
  localPool: string;
  visitorPool: string;
  winnerTeamID: string;
  fixture: JsonFixtureData | null;
  bets: StoredBet[];
  merkleRoot: string;
  zkAppBalanceNanomina: string;
};

async function sendTx(
  sender: Mina.TestPublicKey,
  extra: PrivateKey[],
  fn: () => Promise<void>
) {
  const txn = await Mina.transaction({ sender, fee: FEE }, fn);
  await txn.prove();
  const pending = await txn.sign([sender.key, ...extra]).send();
  return pending.hash;
}

export class DemoRuntime {
  Local!: Awaited<ReturnType<typeof Mina.LocalBlockchain>>;
  zkApp!: BetMarket;
  zkAppKey!: PrivateKey;
  oracleKey!: PrivateKey;
  oraclePk!: PublicKey;
  storage!: PersistentBetStorage;
  fixture: FixtureData | null = null;
  marketNonce = 0n;
  deployer!: Mina.TestPublicKey;
  accounts: Mina.TestPublicKey[] = [];

  async boot() {
    this.Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(this.Local);
    this.accounts = [...this.Local.testAccounts];
    this.deployer = this.accounts[0]!;
    this.zkAppKey = PrivateKey.random();
    this.oracleKey = PrivateKey.random();
    this.oraclePk = this.oracleKey.toPublicKey();
    this.zkApp = new BetMarket(this.zkAppKey.toPublicKey());
    this.storage = new PersistentBetStorage(
      join(here, '../../.local-market/tree.json')
    );

    await sendTx(this.deployer, [this.zkAppKey], async () => {
      AccountUpdate.fundNewAccount(this.deployer);
      await this.zkApp.deploy();
    });
    await sendTx(this.deployer, [], async () => {
      await this.zkApp.initialize(this.oraclePk);
    });

    await this.loadRecordedFixture();
  }

  private recordedTemplate(): FixtureData {
    const raw = JSON.parse(readFileSync(recordedFixturePath, 'utf8')) as unknown;
    return parseSignedEnvelope(raw, parseFixtureData).data;
  }

  async loadRecordedFixture() {
    const data = this.recordedTemplate();
    await this.setFixture(data);
  }

  async setFixture(data: FixtureData) {
    if (this.storage.nextIndex !== 0n) {
      throw new Error('Fixture is frozen because bets exist');
    }
    const signature = signFixture(this.oracleKey, data);
    const hash = await sendTx(this.deployer, [], async () => {
      await this.zkApp.updateFixture(
        Field(data.fixtureID),
        Field(data.localTeamID),
        Field(data.visitorTeamID),
        Field(data.startingAt),
        signature
      );
    });
    this.fixture = data;
    this.marketNonce += 1n;
    await this.storage.persist();
    return hash;
  }

  async placeBet(accountIndex: number, teamID: bigint, amount: bigint) {
    if (!this.fixture) throw new Error('Load a fixture first');
    if (amount <= 0n) throw new Error('Stake must be greater than 0');
    const sender = this.requireAccount(accountIndex);
    return this.storage.withLock(async () => {
      const bet = new BetInfo({
        userPublicKey: sender,
        teamID: Field(teamID),
        amount: UInt64.from(amount),
        marketNonce: Field(this.marketNonce),
      });
      const index = this.storage.nextIndex;
      const witness = this.storage.getWitness(index);
      const txHash = await sendTx(sender, [], async () => {
        await this.zkApp.placeBet(
          bet,
          witness,
          Field(this.fixture!.fixtureID),
          Field(this.fixture!.localTeamID),
          Field(this.fixture!.visitorTeamID),
          Field(this.fixture!.startingAt)
        );
      });
      this.storage.addBet(bet);
      await this.storage.persist();
      return { txHash, index: index.toString() };
    });
  }

  async lock() {
    if (!this.fixture) throw new Error('Load a fixture first');
    this.advanceTo(this.fixture.startingAt);
    return sendTx(this.deployer, [], async () => {
      await this.zkApp.lockAtKickoff(
        Field(this.fixture!.fixtureID),
        Field(this.fixture!.localTeamID),
        Field(this.fixture!.visitorTeamID),
        Field(this.fixture!.startingAt)
      );
    });
  }

  async settle(winner: 'local' | 'visitor') {
    if (!this.fixture) throw new Error('Load a fixture first');
    const winnerTeamID =
      winner === 'local' ? this.fixture.localTeamID : this.fixture.visitorTeamID;
    const payload = {
      ...this.fixture,
      status: BigInt(OracleStatus.Finished),
      winnerTeamID,
    };
    const signature = signStatus(this.oracleKey, payload);
    return sendTx(this.deployer, [], async () => {
      await this.zkApp.settle(
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

  async voidMarket() {
    if (!this.fixture) throw new Error('Load a fixture first');
    const payload = {
      ...this.fixture,
      status: BigInt(OracleStatus.Cancelled),
      winnerTeamID: 0n,
    };
    const signature = signStatus(this.oracleKey, payload);
    return sendTx(this.deployer, [], async () => {
      await this.zkApp.voidMarket(
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

  async claim(betIndex: bigint, feePayerIndex: number) {
    if (!this.fixture) throw new Error('Load a fixture first');
    const stored = this.storage.getBet(betIndex);
    if (!stored) throw new Error('No bet at that index. Claims need an operator witness.');
    if (stored.claimed) throw new Error('This ticket is already claimed');
    const feePayer = this.requireAccount(feePayerIndex);
    const bet = this.storage.toBetInfo(stored);
    const witness = this.storage.getWitness(betIndex);
    const txHash = await sendTx(feePayer, [], async () => {
      await this.zkApp.claim(
        bet,
        witness,
        Field(this.fixture!.fixtureID),
        Field(this.fixture!.localTeamID),
        Field(this.fixture!.visitorTeamID),
        Field(this.fixture!.startingAt)
      );
    });
    this.storage.markClaimed(betIndex);
    await this.storage.persist();
    return txHash;
  }

  getWitness(index: bigint) {
    const stored = this.storage.getBet(index);
    if (!stored) throw new Error('No bet at that index');
    return {
      index: stored.index,
      bet: stored,
      witness: this.storage.witnessJson(index),
    };
  }

  snapshot(): DemoState {
    const packed = unpackMarketStateOffchain(this.zkApp.packedState.get().toBigInt());
    const phaseLabels = ['Idle', 'Open', 'Locked', 'Settled', 'Voided'] as const;
    return {
      mode: 'LocalBlockchain demo',
      proofsEnabled: false,
      zkAppAddress: this.zkApp.address.toBase58(),
      oraclePublicKey: this.oraclePk.toBase58(),
      oracleKind: 'local-demo',
      phase: packed.phase,
      phaseLabel: phaseLabels[packed.phase] ?? 'Unknown',
      status: packed.status,
      marketNonce: packed.marketNonce.toString(),
      betCount: packed.betCount,
      maxBets: 128,
      localPool: this.zkApp.localPool.get().toString(),
      visitorPool: this.zkApp.visitorPool.get().toString(),
      winnerTeamID: this.zkApp.winnerTeamID.get().toString(),
      fixture: this.fixture ? fixtureDataToJson(this.fixture) : null,
      bets: this.storage.bets,
      merkleRoot: this.zkApp.betsMerkleRoot.get().toString(),
      zkAppBalanceNanomina: this.zkApp.account.balance.get().toString(),
    };
  }

  listAccounts(): DemoAccount[] {
    return this.accounts.map((account, index) => {
      const nanomina = Mina.getBalance(account).toBigInt();
      return {
        index,
        label:
          index === 0
            ? 'Operator (LocalBlockchain demo)'
            : `Demo account ${index} (LocalBlockchain)`,
        publicKey: account.toBase58(),
        balanceNanomina: nanomina.toString(),
        balanceMina: formatMina(nanomina),
      };
    });
  }

  private requireAccount(index: number): Mina.TestPublicKey {
    const account = this.accounts[index];
    if (!account) throw new Error(`No demo account ${index}`);
    return account;
  }

  private advanceTo(startingAt: bigint) {
    const { genesisTimestamp, slotTime } = this.Local.getNetworkConstants();
    const genesis = genesisTimestamp.toBigInt();
    if (startingAt <= genesis) return;
    const slots = (startingAt - genesis) / slotTime.toBigInt() + 2n;
    this.Local.setGlobalSlot(UInt32.from(slots));
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
