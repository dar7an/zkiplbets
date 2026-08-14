import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Field, MerkleTree, PublicKey, UInt64 } from 'o1js';
import { BetInfo, BetsMerkleWitness, BETS_TREE_HEIGHT, claimedLeafHash } from './structs.js';

export type StoredBet = {
  index: string;
  userBase58: string;
  teamID: string;
  amount: string;
  marketNonce: string;
  leafHash: string;
  claimed: boolean;
};

type FileShape = {
  version: 1;
  height: number;
  nextIndex: string;
  bets: StoredBet[];
};

export type WitnessJson = { isLeft: boolean; sibling: string }[];

function leafForStored(bet: StoredBet): Field {
  const hash = Field(bet.leafHash);
  return bet.claimed ? claimedLeafHash(hash) : hash;
}

export class PersistentBetStorage {
  tree: MerkleTree;
  nextIndex: bigint;
  bets: StoredBet[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath?: string) {
    this.tree = new MerkleTree(BETS_TREE_HEIGHT);
    this.nextIndex = 0n;
  }

  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = prev.then(() => gate);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  getMerkleRoot(): Field {
    return this.tree.getRoot();
  }

  getWitness(index: bigint): BetsMerkleWitness {
    return new BetsMerkleWitness(this.tree.getWitness(index));
  }

  witnessJson(index: bigint): WitnessJson {
    return this.tree.getWitness(index).map((node) => ({
      isLeft: node.isLeft,
      sibling: node.sibling.toString(),
    }));
  }

  witnessFromJson(json: WitnessJson): BetsMerkleWitness {
    return new BetsMerkleWitness(
      json.map((node) => ({
        isLeft: node.isLeft,
        sibling: Field(node.sibling),
      }))
    );
  }

  addBet(bet: BetInfo): StoredBet {
    const index = this.nextIndex;
    const leafHash = bet.hash();
    this.tree.setLeaf(index, leafHash);
    const stored: StoredBet = {
      index: index.toString(),
      userBase58: bet.userPublicKey.toBase58(),
      teamID: bet.teamID.toString(),
      amount: bet.amount.toString(),
      marketNonce: bet.marketNonce.toString(),
      leafHash: leafHash.toString(),
      claimed: false,
    };
    this.bets.push(stored);
    this.nextIndex += 1n;
    return stored;
  }

  markClaimed(index: bigint): StoredBet {
    const stored = this.bets.find((b) => b.index === index.toString());
    if (!stored) throw new Error(`No bet at index ${index}`);
    if (stored.claimed) throw new Error(`Bet ${index} is already claimed`);
    stored.claimed = true;
    this.tree.setLeaf(index, claimedLeafHash(Field(stored.leafHash)));
    return stored;
  }

  getBet(index: bigint): StoredBet | undefined {
    return this.bets.find((b) => b.index === index.toString());
  }

  toBetInfo(stored: StoredBet): BetInfo {
    return new BetInfo({
      userPublicKey: PublicKey.fromBase58(stored.userBase58),
      teamID: Field(stored.teamID),
      amount: UInt64.from(stored.amount),
      marketNonce: Field(stored.marketNonce),
    });
  }

  async persist(): Promise<void> {
    if (!this.filePath) return;
    const payload: FileShape = {
      version: 1,
      height: BETS_TREE_HEIGHT,
      nextIndex: this.nextIndex.toString(),
      bets: this.bets,
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
    await rename(tmp, this.filePath);
  }

  static async load(filePath: string): Promise<PersistentBetStorage> {
    const storage = new PersistentBetStorage(filePath);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return storage;
      throw err;
    }
    const parsed = JSON.parse(raw) as FileShape;
    if (parsed.version !== 1 || parsed.height !== BETS_TREE_HEIGHT) {
      throw new Error('Unsupported bet storage file');
    }
    storage.nextIndex = BigInt(parsed.nextIndex);
    storage.bets = parsed.bets;
    for (const bet of parsed.bets) {
      storage.tree.setLeaf(BigInt(bet.index), leafForStored(bet));
    }
    return storage;
  }
}
