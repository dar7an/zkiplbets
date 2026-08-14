export type StoredBet = {
  index: string;
  userBase58: string;
  teamID: string;
  amount: string;
  marketNonce: string;
  leafHash: string;
  claimed: boolean;
};

export type DemoAccount = {
  index: number;
  label: string;
  publicKey: string;
  balanceNanomina: string;
  balanceMina: string;
};

export type FixtureJson = {
  fixtureID: number;
  localTeamID: number;
  visitorTeamID: number;
  startingAt: number;
  localTeamName: string;
  localTeamCode: string;
  visitorTeamName: string;
  visitorTeamCode: string;
};

export type MarketState = {
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
  fixture: FixtureJson | null;
  bets: StoredBet[];
  merkleRoot: string;
  zkAppBalanceNanomina: string;
};

export type ApiOk<T> = T & { ok: true };
export type ApiErr = { ok: false; error: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as ApiOk<T> | ApiErr;
  if (!res.ok || !body.ok) {
    const message = 'error' in body ? body.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export function getState() {
  return request<{ state: MarketState }>('/state');
}

export function getAccounts() {
  return request<{ accounts: DemoAccount[] }>('/accounts');
}

export function health() {
  return request<{ mode: string }>('/health');
}

export function loadFixture() {
  return request<{ txHash: string; state: MarketState }>('/fixture', { method: 'POST' });
}

export function placeBet(input: {
  accountIndex: number;
  teamID: string;
  amountNanomina: string;
}) {
  return request<{
    txHash: string;
    index: string;
    state: MarketState;
    accounts: DemoAccount[];
  }>('/place-bet', { method: 'POST', body: JSON.stringify(input) });
}

export function lockMarket() {
  return request<{ txHash: string; state: MarketState }>('/lock', { method: 'POST' });
}

export function settleMarket(winner: 'local' | 'visitor') {
  return request<{ txHash: string; state: MarketState }>('/settle', {
    method: 'POST',
    body: JSON.stringify({ winner }),
  });
}

export function voidMarket() {
  return request<{ txHash: string; state: MarketState }>('/void', { method: 'POST' });
}

export function claimBet(betIndex: string, feePayerIndex: number) {
  return request<{ txHash: string; state: MarketState; accounts: DemoAccount[] }>(
    '/claim',
    {
      method: 'POST',
      body: JSON.stringify({ betIndex, feePayerIndex }),
    }
  );
}
