import { Field, Provable } from 'o1js';
import { MarketPhase } from '@zk-cricket/shared';

const PHASE_MASK = 8n;
const STATUS_MASK = 256n;
const NONCE_MASK = 1n << 32n;
const COUNT_MASK = 256n;

export type UnpackedState = {
  phase: Field;
  status: Field;
  marketNonce: Field;
  betCount: Field;
};

export function packMarketState(s: UnpackedState): Field {
  s.phase.assertLessThan(Field(5));
  s.status.assertLessThan(Field(STATUS_MASK));
  s.marketNonce.assertLessThan(Field(NONCE_MASK));
  s.betCount.assertLessThan(Field(COUNT_MASK));
  return s.phase
    .add(s.status.mul(Field(PHASE_MASK)))
    .add(s.marketNonce.mul(Field(PHASE_MASK * STATUS_MASK)))
    .add(s.betCount.mul(Field(PHASE_MASK * STATUS_MASK * NONCE_MASK)));
}

export function unpackMarketState(packed: Field): UnpackedState {
  const phase = Provable.witness(Field, () => Field(packed.toBigInt() % PHASE_MASK));
  const status = Provable.witness(Field, () =>
    Field((packed.toBigInt() / PHASE_MASK) % STATUS_MASK)
  );
  const marketNonce = Provable.witness(Field, () =>
    Field((packed.toBigInt() / (PHASE_MASK * STATUS_MASK)) % NONCE_MASK)
  );
  const betCount = Provable.witness(Field, () =>
    Field(
      (packed.toBigInt() / (PHASE_MASK * STATUS_MASK * NONCE_MASK)) % COUNT_MASK
    )
  );
  packMarketState({ phase, status, marketNonce, betCount }).assertEquals(packed);
  return { phase, status, marketNonce, betCount };
}

export function idlePackedState(): Field {
  return packMarketState({
    phase: Field(MarketPhase.Idle),
    status: Field(0),
    marketNonce: Field(0),
    betCount: Field(0),
  });
}

export function unpackMarketStateOffchain(packed: bigint): {
  phase: number;
  status: number;
  marketNonce: bigint;
  betCount: number;
} {
  return {
    phase: Number(packed % PHASE_MASK),
    status: Number((packed / PHASE_MASK) % STATUS_MASK),
    marketNonce: (packed / (PHASE_MASK * STATUS_MASK)) % NONCE_MASK,
    betCount: Number((packed / (PHASE_MASK * STATUS_MASK * NONCE_MASK)) % COUNT_MASK),
  };
}
