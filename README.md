# Match market (Mina parimutuel)

A **binary parimutuel match-winner market** on Mina. You back one side of a
single cricket fixture. Stakes are real MINA held in a zkApp. When the match
has a winner, winners split the pool; losers get 0. Tie, no-result, abandoned,
or cancelled voids the market and refunds stakes.

This is not a trader, not an order book, and not a trustless unlimited
sportsbook. The previous README claimed those things. They were not true.

## What is actually on-chain

- Schnorr verification of a SportMonks oracle signature. Field order is
  `[fixtureID, localTeamID, visitorTeamID, startingAt]` (status adds
  `[status, winnerTeamID]`). That encoding matches
  [sportmonksoracle](https://github.com/dar7an/sportmonksoracle).
- A Poseidon commitment of those fixture fields plus a **market nonce**, so an
  old result cannot pay a new market.
- Merkle-append of `Poseidon(user, teamID, amount, marketNonce)` into a tree of
  **height 8 → 128 tickets**, not unlimited bets. Claims need a witness from
  the operator. Without a witness, you cannot claim.
- Escrow: `placeBet` transfers nanomina (1 MINA = 10⁹) into the zkApp.
- Lock, settle, void, claim. Settle only on oracle status `Finished` with a
  winner in `{local, visitor}`. Void on cancelled, or finished with no side
  that played (tie).

Trusted oracle public key (set once with `initialize()`, rotate by redeploy):

`B62qp7eyQ9RKwdYBLWNzxmfKntP6dPDrTSQ1ukyYsV4FoTkJH6sfuPU`

Team **names** are unsigned display data. Signed IDs are what the circuit
checks. The UI reads camelCase `localTeamName` from the live oracle schema.

Parimutuel, 0 rake:

```
payout_i = floor( stake_i × (Σ stakes) / (Σ winning stakes) )
```

Integer dust stays in the zkApp. Losers receive 0.

## Repo layout

```
shared/      Fixture/status types, SportMonks allowlist, parimutuel math
contracts/   BetMarket zkApp, persistent Merkle operator, LocalBlockchain demo
web/         Vite + React 19 ticket UI
```

Node 22, TypeScript 5.8, o1js ^2.15, Vitest, ESLint 9. Unit tests use mock
proofs (`proofsEnabled: false`). A real-proof smoke exists as
`npm run test:proofs -w @zk-cricket/contracts` (slow; not in PR CI).

Live oracle fetches are gated: `RUN_LIVE_ORACLE=1 npm run test:live -w @zk-cricket/contracts`.

## Local demo

You do not need Devnet keys.

```bash
npm install
npm run demo
```

This starts:

- LocalBlockchain + zkApp at `http://127.0.0.1:8787`
- UI at `http://localhost:5173`

In the UI choose **Open local demo** (not a wallet). Load the recorded
England vs Sri Lanka fixture if it is not already set, place MINA on both
sides with two demo accounts, lock, settle or void, then claim. Place bet
only reports success when the server returns a transaction hash.

Auro: **Connect Auro wallet** calls `window.mina.requestAccounts`. There is no
Devnet zkApp address in this checkout, so Auro cannot place a bet here. The UI
says that instead of faking a transaction.

## Tests

```bash
npm test          # shared unit tests + contract constraint tests
npm run test:e2e  # two bettors, settle, winner paid, loser 0, void refund
npm run test:ui   # Chrome against a running `npm run demo` (not in CI)
npm run lint
npm run typecheck
```

`npm audit` on this lockfile is clean. The old Jest 27 / `form-data` tree is gone.

Covered failures: invalid signature, wrong sender, occupied leaf, team not in
the fixture, `updateFixture` after bets exist, zero stake, double settle.

## Devnet deploy

`config.json` deploy aliases are empty until you run zkapp-cli. Local demo is
the supported path.

1. Install [zkapp-cli](https://docs.minaprotocol.com/zkapps/tutorials/hello-world).
2. `zk config` in this repo; fund a fee payer via the Mina faucet.
3. Compile with proofs: `npx tsx -e "import { BetMarket } from './contracts/src/Bet.ts'; await BetMarket.compile()"`
   (or a small deploy script using the same `BetMarket` class).
4. Deploy the `BetMarket` class, then call `initialize(oraclePublicKey)` signed
   with the zkApp key. Use the production oracle key above for live SportMonks
   signatures.
5. Point the web app at that address and send transactions through Auro. Do
   not ship a UI that toasts success without a tx hash.

## Limits you should not paper over

- One active fixture.
- 128 tickets.
- Operator stores the Merkle tree (file-backed JSON + mutex). The operator can
  withhold witnesses.
- Oracle key compromise is market compromise.
- Demo proving uses mock proofs. Real proofs are a separate, slow compile.

Apache-2.0. Built on Mina / o1js.
