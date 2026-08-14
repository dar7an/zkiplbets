import type { ReactNode } from 'react';

type Props = {
  busy: boolean;
  onLoadFixture: () => Promise<void>;
  onLock: () => Promise<void>;
  onSettle: (winner: 'local' | 'visitor') => Promise<void>;
  onVoid: () => Promise<void>;
  localName: string;
  visitorName: string;
};

export function OperatorPanel({
  busy,
  onLoadFixture,
  onLock,
  onSettle,
  onVoid,
  localName,
  visitorName,
}: Props) {
  return (
    <section className="rounded-2xl bg-panel p-6 ring-1 ring-line">
      <h2 className="text-sm font-semibold tracking-wide text-ink-faint uppercase">
        Operator · LocalBlockchain demo
      </h2>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        These actions submit real LocalBlockchain transactions. They are not
        hidden behind a fake wallet. On Devnet, lock/settle/void would be anyone
        submitting a valid oracle signature.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <OpButton disabled={busy} onClick={() => void onLoadFixture()}>
          Load fixture
        </OpButton>
        <OpButton disabled={busy} onClick={() => void onLock()}>
          Lock market
        </OpButton>
        <OpButton disabled={busy} onClick={() => void onSettle('local')}>
          Settle {localName}
        </OpButton>
        <OpButton disabled={busy} onClick={() => void onSettle('visitor')}>
          Settle {visitorName}
        </OpButton>
        <OpButton disabled={busy} onClick={() => void onVoid()}>
          Void market
        </OpButton>
      </div>
    </section>
  );
}

function OpButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-xl bg-panel-2 px-3 py-2 text-sm font-medium ring-1 ring-line transition-transform duration-150 enabled:hover:scale-[0.99] enabled:active:scale-[0.96] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
