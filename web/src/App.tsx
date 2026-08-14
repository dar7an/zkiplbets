import { useCallback, useEffect, useState } from 'react';
import { MatchBoard } from './components/MatchBoard';
import { OperatorPanel } from './components/OperatorPanel';
import { Ticket } from './components/Ticket';
import {
  claimBet,
  getAccounts,
  getState,
  health,
  loadFixture,
  lockMarket,
  placeBet,
  settleMarket,
  voidMarket,
  type DemoAccount,
  type MarketState,
} from './lib/api';
import { auroAvailable, connectAuro } from './lib/auro';

type Session =
  | { kind: 'none' }
  | { kind: 'demo' }
  | { kind: 'auro'; address: string };

export default function App() {
  const [session, setSession] = useState<Session>({ kind: 'none' });
  const [demoUp, setDemoUp] = useState<boolean | null>(null);
  const [state, setState] = useState<MarketState | null>(null);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [accountIndex, setAccountIndex] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auroError, setAuroError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ state: next }, { accounts: list }] = await Promise.all([
      getState(),
      getAccounts(),
    ]);
    setState(next);
    setAccounts(list);
  }, []);

  useEffect(() => {
    void health()
      .then(() => setDemoUp(true))
      .catch(() => setDemoUp(false));
  }, []);

  useEffect(() => {
    if (session.kind !== 'demo') return;
    setLoadError(null);
    void refresh().catch((err: unknown) => {
      setLoadError(err instanceof Error ? err.message : 'Unable to load market state');
    });
  }, [session.kind, refresh]);

  const account = accounts[accountIndex] ?? accounts[1] ?? accounts[0];

  async function run(fn: () => Promise<{ txHash?: string | Promise<string> } | void>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result && 'txHash' in result && result.txHash) {
        setLastTx(String(await result.txHash));
      }
      await refresh();
    } catch (err) {
      setLastTx(null);
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            Mina · cricket
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Match market</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            A binary parimutuel on the match winner. Not an order book, not a
            sportsbook, not unlimited. Bets are MINA in a zkApp escrow.
          </p>
        </div>
        <SessionBadge session={session} account={account} />
      </header>

      {session.kind === 'none' ? (
        <Gate
          demoUp={demoUp}
          auroError={auroError}
          onDemo={() => setSession({ kind: 'demo' })}
          onAuro={async () => {
            setAuroError(null);
            try {
              const address = await connectAuro();
              setSession({ kind: 'auro', address });
            } catch (err) {
              setAuroError(err instanceof Error ? err.message : 'Auro request failed');
            }
          }}
        />
      ) : null}

      {session.kind === 'auro' ? <AuroNotice address={session.address} /> : null}

      {session.kind === 'demo' && loadError ? (
        <p className="mt-8 rounded-2xl bg-panel p-6 text-danger ring-1 ring-line">
          {loadError}. Start the demo with <code className="font-mono">npm run demo</code>.
        </p>
      ) : null}

      {session.kind === 'demo' && !state && !loadError ? (
        <p className="mt-8 text-ink-soft">Loading market state…</p>
      ) : null}

      {session.kind === 'demo' && state ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
          <div className="grid gap-6">
            <MatchBoard state={state} />
            <AccountPicker
              accounts={accounts}
              accountIndex={accountIndex}
              onChange={setAccountIndex}
            />
            <OperatorPanel
              busy={busy}
              localName={state.fixture?.localTeamName ?? 'local'}
              visitorName={state.fixture?.visitorTeamName ?? 'visitor'}
              onLoadFixture={() => run(() => loadFixture())}
              onLock={() => run(() => lockMarket())}
              onSettle={(winner) => run(() => settleMarket(winner))}
              onVoid={() => run(() => voidMarket())}
            />
          </div>
          <Ticket
            state={state}
            account={account}
            busy={busy}
            error={error}
            lastTx={lastTx}
            onPlaceBet={(teamID, amountNanomina) =>
              run(() =>
                placeBet({
                  accountIndex: account?.index ?? 1,
                  teamID,
                  amountNanomina,
                })
              )
            }
            onClaim={(betIndex) =>
              run(() => claimBet(betIndex, account?.index ?? 1))
            }
          />
        </div>
      ) : null}

      <TrustFooter />
    </div>
  );
}

function Gate({
  demoUp,
  auroError,
  onDemo,
  onAuro,
}: {
  demoUp: boolean | null;
  auroError: string | null;
  onDemo: () => void;
  onAuro: () => void;
}) {
  return (
    <section className="mt-10 grid gap-4 rounded-2xl bg-panel p-8 ring-1 ring-line sm:grid-cols-2">
      <div>
        <h2 className="text-lg font-semibold">Use LocalBlockchain demo</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Talks to a local Mina ledger on this machine. Place bet only succeeds
          with a real transaction hash. This is not a wallet.
        </p>
        <button
          type="button"
          onClick={onDemo}
          className="mt-5 min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        >
          Open local demo
        </button>
        <p className="mt-3 text-xs text-ink-faint">
          {demoUp === false
            ? 'Demo server is not reachable on :8787.'
            : demoUp
              ? 'Demo server is up.'
              : 'Checking demo server…'}
        </p>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Connect Auro wallet</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Requests accounts from <code className="font-mono">window.mina</code>.
          There is no Devnet zkApp in this checkout, so placing a bet on-chain
          from Auro is disabled until you deploy.
        </p>
        <button
          type="button"
          onClick={onAuro}
          disabled={!auroAvailable()}
          className="mt-5 min-h-11 rounded-xl bg-panel-2 px-4 py-2 text-sm font-medium ring-1 ring-line disabled:opacity-50"
        >
          {auroAvailable() ? 'Connect Auro wallet' : 'Auro is not installed'}
        </button>
        {auroError ? <p className="mt-3 text-sm text-danger">{auroError}</p> : null}
      </div>
    </section>
  );
}

function AuroNotice({ address }: { address: string }) {
  return (
    <section className="mt-8 rounded-2xl bg-panel p-6 ring-1 ring-line">
      <h2 className="text-lg font-semibold">Auro account</h2>
      <p className="mt-2 font-mono text-sm break-all">{address}</p>
      <p className="mt-3 max-w-prose text-sm text-ink-soft">
        No Devnet zkApp address is configured, so this app will not pretend to
        place a bet. Deploy with zkapp-cli, set the address, then wire Auro
        signing. Until then, use the LocalBlockchain demo for a real escrow
        path.
      </p>
    </section>
  );
}

function SessionBadge({
  session,
  account,
}: {
  session: Session;
  account: DemoAccount | undefined;
}) {
  if (session.kind === 'demo') {
    return (
      <p className="rounded-full bg-panel px-3 py-1 text-sm ring-1 ring-line">
        LocalBlockchain demo
        {account ? ` · ${account.label}` : ''}
      </p>
    );
  }
  if (session.kind === 'auro') {
    return (
      <p className="rounded-full bg-panel px-3 py-1 text-sm ring-1 ring-line">
        Auro · {session.address.slice(0, 8)}…
      </p>
    );
  }
  return null;
}

function AccountPicker({
  accounts,
  accountIndex,
  onChange,
}: {
  accounts: DemoAccount[];
  accountIndex: number;
  onChange: (index: number) => void;
}) {
  const usable = accounts.filter((a) => a.index !== 0);
  return (
    <div className="rounded-2xl bg-panel p-5 ring-1 ring-line">
      <label htmlFor="demo-account" className="text-sm font-medium">
        Demo account
      </label>
      <select
        id="demo-account"
        className="mt-2 w-full rounded-xl bg-panel-2 px-3 py-3 ring-1 ring-line"
        value={accountIndex}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {usable.map((a) => (
          <option key={a.index} value={a.index}>
            {a.label} · {a.balanceMina} MINA
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-ink-faint">
        Pre-funded LocalBlockchain keys. Not Auro. Not “wallet connected”.
      </p>
    </div>
  );
}

function TrustFooter() {
  return (
    <footer className="mt-12 max-w-3xl text-xs leading-relaxed text-ink-faint">
      <p>
        Trusted oracle public key on-chain. Unsigned team names are display-only.
        Merkle tree holds at most 128 tickets (height 8). Claims require an
        operator witness. Tie, no-result, abandoned, and cancelled void and
        refund. There is no Terms or Privacy page because this is a local demo,
        not a public book.
      </p>
    </footer>
  );
}
