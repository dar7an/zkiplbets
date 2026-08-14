import {
  Field,
  MerkleTree,
  MerkleWitness,
  Poseidon,
  PublicKey,
  Struct,
  UInt64,
} from 'o1js';
import { BETS_TREE_HEIGHT } from '@zk-cricket/shared';

export { BETS_TREE_HEIGHT };
export const MAX_BETS = 2 ** (BETS_TREE_HEIGHT - 1);

export class BetsMerkleWitness extends MerkleWitness(BETS_TREE_HEIGHT) {}

export const EMPTY_MERKLE_ROOT = new MerkleTree(BETS_TREE_HEIGHT).getRoot();

export class BetInfo extends Struct({
  userPublicKey: PublicKey,
  teamID: Field,
  amount: UInt64,
  marketNonce: Field,
}) {
  hash(): Field {
    return Poseidon.hash(BetInfo.toFields(this));
  }
}

export function claimedLeafHash(betHash: Field): Field {
  return Poseidon.hash([betHash, Field(1)]);
}

export class BetPlacedEvent extends Struct({
  index: Field,
  teamID: Field,
  amount: UInt64,
}) {}

export class ClaimedEvent extends Struct({
  teamID: Field,
  payout: UInt64,
}) {}
