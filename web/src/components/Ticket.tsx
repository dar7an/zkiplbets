import { formatMina, minaToNanomina } from '@zk-cricket/shared';
import { useMemo, useState, type FormEvent } from 'react';
import type { DemoAccount, MarketState } from '../lib/api';

type Side = 'local' | 'visitor';

type Props = {
  state: MarketState;
  account: DemoAccount | undefined;
  busy: boolean;
  error: string | null;
  lastTx: string | null;
  onPlaceBet: (teamID: string, amountNanomina: string) => Promise<void>;
  onClaim: (betIndex: string) => Promise<void>;
};

export function Ticket({
  state,
  account,
  busy,
  error,
  lastTx,
  onPlaceBet,
  onClaim,
}: Props) {
  const fixture = state.fixture;
  const [side, setSide] = useState<Side>('local');
  const [stake, setStake] = useState('1');
  const [stakeError, setStakeError] = useState<string | null>(null);

  const open = state.phaseLabel === 'Open';
  const terminal = state.phaseLabel === 'Settled' || state.phaseLabel === 'Voided';

  const amount = useMemo(() => {
    try {
      return minaToNanomina(stake);
    } catch {
      return null;
    }
  }, [stake]);

  if (!fixture) {
    return (
      <aside className="rounded-2xl bg-panel p-6 ring-1 ring-line">
        <h2 className="text-lg font-semibold">Ticket</h2>
        <p className="mt-3 text-sm text-ink-soft">
          Load a fixture before placing a stake.
        </p>
      </aside>
    );
  }

  const teamID = side === 'local' ? String(fixture.localTeamID) : String(fixture.visitorTeamID);
  const myBets = account
    ? state.bets.filter((b) => b.userBase58 === account.publicKey)
    : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amount === null || amount <= 0n) {
      setStakeError('Enter a stake greater than 0, with at most 9 decimal places.');
      return;
    }
    setStakeError(null);
    await onPlaceBet(teamID, amount.toString());
  }

  return (
    <aside className="rounded-2xl bg-panel ring-1 ring-line">
      <div className="px-6 pt-6">
        <h2 className="text-lg font-semibold">Place a ticket</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Stake MINA on a winner. Payout is parimutuel: your stake times the
          total pool, divided by the winning pool. Rake is 0.
        </p>
      </div>

      <form className="px-6 py-5" onSubmit={(e) => void submit(e)}>
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium">Back a team</legend>
          <div role="radiogroup" aria-label="Team to back" className="mt-3 grid gap-2">
            <TeamRadio
              checked={side === 'local'}
              onSelect={() => setSide('local')}
              name={fixture.localTeamName}
              code={fixture.localTeamCode}
              tone="home"
              disabled={!open || busy}
            />
            <TeamRadio
              checked={side === 'visitor'}
              onSelect={() => setSide('visitor')}
              name={fixture.visitorTeamName}
              code={fixture.visitorTeamCode}
              tone="away"
              disabled={!open || busy}
            />
          </div>
        </fieldset>

        <div className="mt-5">
          <label htmlFor="stake" className="text-sm font-medium">
            Stake (MINA)
          </label>
          <input
            id="stake"
            name="stake"
            inputMode="decimal"
            autoComplete="off"
            value={stake}
            disabled={!open || busy}
            onChange={(e) => setStake(e.target.value)}
            aria-invalid={stakeError ? true : undefined}
            aria-describedby={stakeError ? 'stake-error' : 'stake-hint'}
            className="mt-2 w-full rounded-xl bg-panel-2 px-3 py-3 font-mono tabular ring-1 ring-line disabled:opacity-60"
          />
          <p id="stake-hint" className="mt-2 text-xs text-ink-faint">
            1 MINA = 10⁹ nanomina. Amount must be greater than 0.
          </p>
          {stakeError ? (
            <p id="stake-error" className="mt-2 text-sm text-danger">
              {stakeError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!open || busy || !account}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-ink transition-transform duration-150 enabled:hover:scale-[0.99] enabled:active:scale-[0.96] disabled:opacity-50"
        >
          {busy ? 'Proving transaction…' : 'Place bet'}
        </button>
        {!open ? (
          <p className="mt-2 text-sm text-ink-soft">
            {state.phaseLabel === 'Locked'
              ? 'Market is locked. New tickets are closed.'
              : terminal
                ? 'Market is finished. Claim below if you have a ticket.'
                : 'Market is not open.'}
          </p>
        ) : null}
      </form>

      <div className="border-t border-line px-6 py-5" aria-live="polite">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {lastTx ? (
          <p className="mt-2 font-mono text-xs break-all text-ink-soft">
            Transaction {lastTx}
          </p>
        ) : null}
      </div>

      <div className="border-t border-line px-6 py-5">
        <h3 className="text-sm font-semibold">Your tickets</h3>
        {myBets.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            No tickets on this demo account yet. Place a bet to escrow MINA.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {myBets.map((bet) => {
              const local = bet.teamID === String(fixture.localTeamID);
              const team = local ? fixture.localTeamName : fixture.visitorTeamName;
              return (
                <li
                  key={bet.index}
                  className="rounded-xl bg-panel-2 px-3 py-3 ring-1 ring-line"
                >
                  <p className="text-sm">
                    #{bet.index} · {team} · {formatMina(BigInt(bet.amount))} MINA
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {bet.claimed ? 'Claimed' : terminal ? 'Ready to claim' : 'Open'}
                  </p>
                  {terminal && !bet.claimed ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onClaim(bet.index)}
                      className="mt-3 rounded-lg bg-panel px-3 py-2 text-sm font-medium ring-1 ring-line"
                    >
                      {state.phaseLabel === 'Voided' ? 'Claim refund' : 'Claim payout'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function TeamRadio({
  checked,
  onSelect,
  name,
  code,
  tone,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  name: string;
  code: string;
  tone: 'home' | 'away';
  disabled: boolean;
}) {
  const bar = tone === 'home' ? 'bg-home' : 'bg-away';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={`flex min-h-11 items-stretch overflow-hidden rounded-xl text-left ring-1 transition-[box-shadow,background-color] duration-150 ${
        checked ? 'bg-panel-2 ring-accent' : 'bg-canvas ring-line'
      } disabled:opacity-60`}
    >
      <span className={`w-1.5 ${bar}`} aria-hidden="true" />
      <span className="flex flex-1 items-center justify-between px-3 py-3">
        <span className="font-medium">{name}</span>
        <span className="font-mono text-xs text-ink-faint">{code}</span>
      </span>
    </button>
  );
}
