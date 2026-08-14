import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Field, PrivateKey, UInt64 } from 'o1js';
import { describe, expect, it } from 'vitest';
import { PersistentBetStorage } from '../BetStorage.js';
import { BetInfo } from '../structs.js';

function sampleBet(_indexSalt: number) {
  return new BetInfo({
    userPublicKey: PrivateKey.random().toPublicKey(),
    teamID: Field(38),
    amount: UInt64.from(1_000_000_000n),
    marketNonce: Field(1),
  });
}

describe('PersistentBetStorage', () => {
  it('round-trips bets through a JSON file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bets-'));
    const file = join(dir, 'tree.json');
    const storage = new PersistentBetStorage(file);
    const bet = sampleBet(0);
    storage.addBet(bet);
    await storage.persist();
    const raw = await readFile(file, 'utf8');
    expect(raw).toContain('"version": 1');
    const loaded = await PersistentBetStorage.load(file);
    expect(loaded.nextIndex).toBe(1n);
    expect(loaded.getMerkleRoot().toString()).toBe(storage.getMerkleRoot().toString());
    expect(loaded.getBet(0n)?.userBase58).toBe(bet.userPublicKey.toBase58());
  });

  it('serializes a witness that reconstructs the same path', async () => {
    const storage = new PersistentBetStorage();
    storage.addBet(sampleBet(0));
    const json = storage.witnessJson(0n);
    const reconstructed = storage.witnessFromJson(json);
    expect(reconstructed.calculateRoot(Field(storage.getBet(0n)!.leafHash)).toString()).toBe(
      storage.getMerkleRoot().toString()
    );
  });

  it('does not allocate the same leaf under concurrent withLock', async () => {
    const storage = new PersistentBetStorage();
    const indices = await Promise.all(
      [0, 1, 2, 3].map(() =>
        storage.withLock(async () => {
          const index = storage.nextIndex;
          storage.addBet(sampleBet(Number(index)));
          return index;
        })
      )
    );
    expect(new Set(indices.map(String)).size).toBe(4);
    expect(storage.nextIndex).toBe(4n);
  });
});
