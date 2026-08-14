export type FixtureFields = {
  fixtureID: bigint;
  localTeamID: bigint;
  visitorTeamID: bigint;
  startingAt: bigint;
};

export type StatusFields = FixtureFields & {
  status: bigint;
  winnerTeamID: bigint;
};

/**
 * Unsigned display fields. Never use these for settlement.
 * Live oracle (2026) uses camelCase; snake_case is rejected by the parser.
 */
export type FixtureDisplay = {
  localTeamName: string;
  localTeamCode: string;
  visitorTeamName: string;
  visitorTeamCode: string;
};

export type FixtureData = FixtureFields &
  FixtureDisplay & {
    timestamp?: bigint;
  };

export type StatusData = StatusFields & {
  timestamp?: bigint;
};

export type SignedOracleEnvelope<T> = {
  data: T;
  signature: string;
  publicKey: string;
};

export type JsonFixtureData = {
  fixtureID: number;
  localTeamID: number;
  visitorTeamID: number;
  startingAt: number;
  localTeamName: string;
  localTeamCode: string;
  visitorTeamName: string;
  visitorTeamCode: string;
  timestamp?: number;
};

export type JsonStatusData = {
  fixtureID: number;
  localTeamID: number;
  visitorTeamID: number;
  startingAt: number;
  status: number;
  winnerTeamID: number;
  timestamp?: number;
};
