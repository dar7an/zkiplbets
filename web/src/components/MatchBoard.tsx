import {
  formatKickoff,
  formatMina,
  impliedShare,
  poolMultiple,
} from '@zk-cricket/shared';
import type { MarketState } from '../lib/api';

const PHASE_COPY: Record<string, string> = {
  Idle: 'No fixture is loaded.',
  Open: 'Market is open. Stakes go into the zkApp escrow.',
  Locked: 'Market is locked. Wait for settlement or a void.',
  Settled: 'Match has a winner. Claim from a ticket that backed that side.',
  Voided: 'Match was voided. Claim a refund of the original stake.',
};

type Props = {
  state: MarketState;
};

export function MatchBoard({ state }: Props) {
  const fixture = state.fixture;
  if (!fixture) {
    return (
      <section className="rounded-2xl bg-panel p-8 ring-1 ring-line">
        <h2 className="text-lg font-semibold">Match board</h2>
        <p className="mt-3 max-w-prose text-ink-soft">
          No fixture is loaded. Use Load fixture in the operator panel to post
          England vs Sri Lanka (recorded oracle schema, signed by the demo key).
        </p>
      </section>
    );
  }

  const local = BigInt(state.localPool);
  const visitor = BigInt(state.visitorPool);
  const total = local + visitor;
  const localShare = impliedShare(local, total);
  const visitorShare = impliedShare(visitor, total);
  const localMult = poolMultiple(local, total);
  const visitorMult = poolMultiple(visitor, total);
  const winner = BigInt(state.winnerTeamID);
  const localWon = state.phaseLabel === 'Settled' && winner === BigInt(fixture.localTeamID);
  const visitorWon =
    state.phaseLabel === 'Settled' && winner === BigInt(fixture.visitorTeamID);

  return (
    <section className="rounded-2xl bg-panel ring-1 ring-line">
      <header className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
            Match winner · parimutuel
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {fixture.localTeamName} vs {fixture.visitorTeamName}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {formatKickoff(BigInt(fixture.startingAt))}
          </p>
        </div>
        <p className="rounded-full bg-panel-2 px-3 py-1 text-sm text-ink-soft ring-1 ring-line">
          {state.phaseLabel}
        </p>
      </header>

      <p className="px-6 pt-3 text-sm text-ink-soft" aria-live="polite">
        {PHASE_COPY[state.phaseLabel]}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-0 sm:grid-cols-[1fr_auto_1fr]">
        <TeamColumn
          code={fixture.localTeamCode}
          name={fixture.localTeamName}
          tone="home"
          pool={local}
          share={localShare}
          multiple={localMult}
          won={localWon}
          voided={state.phaseLabel === 'Voided'}
        />
        <div className="flex items-center justify-center px-2 py-4 text-xs tracking-[0.2em] text-ink-faint uppercase">
          vs
        </div>
        <TeamColumn
          code={fixture.visitorTeamCode}
          name={fixture.visitorTeamName}
          tone="away"
          pool={visitor}
          share={visitorShare}
          multiple={visitorMult}
          won={visitorWon}
          voided={state.phaseLabel === 'Voided'}
        />
      </div>

      <p className="mx-6 mt-2 text-xs text-ink-faint">Pool split</p>
      <div className="mx-6 mt-1 mb-6 h-2.5 overflow-hidden rounded-full bg-panel-2">
        <div className="flex h-full">
          <div
            className="bg-home transition-[width] duration-300 ease-out"
            style={{ width: total === 0n ? '50%' : `${localShare * 100}%` }}
          />
          <div
            className="bg-away transition-[width] duration-300 ease-out"
            style={{ width: total === 0n ? '50%' : `${visitorShare * 100}%` }}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line text-sm sm:grid-cols-4">
        <Stat label="Escrow" value={`${formatMina(BigInt(state.zkAppBalanceNanomina))} MINA`} />
        <Stat label="Tickets" value={`${state.betCount} / ${state.maxBets}`} />
        <Stat label="Fixture" value={`#${fixture.fixtureID}`} />
        <Stat label="Nonce" value={state.marketNonce} />
      </dl>
    </section>
  );
}

function TeamColumn({
  code,
  name,
  tone,
  pool,
  share,
  multiple,
  won,
  voided,
}: {
  code: string;
  name: string;
  tone: 'home' | 'away';
  pool: bigint;
  share: number;
  multiple: number | null;
  won: boolean;
  voided: boolean;
}) {
  const accent = tone === 'home' ? 'text-home' : 'text-away';
  return (
    <div className="px-6 py-4">
      <p className={`font-mono text-sm ${accent}`}>{code}</p>
      <p className="mt-1 text-xl font-semibold">{name}</p>
      <p className="mt-4 font-mono text-2xl tabular">
        {formatMina(pool)}
        <span className="ml-1 text-sm font-sans text-ink-faint">MINA</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Implied {totalOrDash(share)} of the pool
        {multiple !== null ? ` · ${multiple.toFixed(2)}× if this side wins now` : ''}
      </p>
      {won ? <p className="mt-2 text-sm text-accent">Settled winner</p> : null}
      {voided ? <p className="mt-2 text-sm text-ink-soft">Void — refunds</p> : null}
    </div>
  );
}

function totalOrDash(share: number): string {
  if (share === 0) return '0%';
  return `${Math.round(share * 1000) / 10}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-6 py-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="mt-1 font-mono tabular">{value}</dd>
    </div>
  );
}
