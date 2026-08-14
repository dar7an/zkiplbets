/**
 * Merkle height 8 in o1js means leafCount = 2^(height-1) = 128.
 * This is a hard cap, not “unlimited bets”. Raising height grows the
 * witness (and circuit) linearly; 128 is enough for a local / Devnet demo.
 */
export const BETS_TREE_HEIGHT = 8;
export const MAX_BETS = 2 ** (BETS_TREE_HEIGHT - 1);

export const NANOMINA_PER_MINA = 1_000_000_000n;

/** Basis points. 0 = no vig. Any non-zero rake must be documented in the UI. */
export const RAKE_BPS = 0n;

export const PRODUCTION_ORACLE_PUBLIC_KEY =
  'B62qp7eyQ9RKwdYBLWNzxmfKntP6dPDrTSQ1ukyYsV4FoTkJH6sfuPU';

export const MarketPhase = {
  Idle: 0,
  Open: 1,
  Locked: 2,
  Settled: 3,
  Voided: 4,
} as const;

export type MarketPhase = (typeof MarketPhase)[keyof typeof MarketPhase];

export const PHASE_LABEL: Record<MarketPhase, string> = {
  [MarketPhase.Idle]: 'Idle',
  [MarketPhase.Open]: 'Open',
  [MarketPhase.Locked]: 'Locked',
  [MarketPhase.Settled]: 'Settled',
  [MarketPhase.Voided]: 'Voided',
};
