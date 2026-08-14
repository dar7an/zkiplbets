import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DemoRuntime, errorMessage } from './market.js';

const PORT = Number(process.env.DEMO_PORT ?? 8787);
const runtime = new DemoRuntime();

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function cors(res: ServerResponse, extra: Record<string, string> = {}) {
  for (const [k, v] of Object.entries({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...extra,
  })) {
    res.setHeader(k, v);
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  cors(res, { 'Content-Type': 'application/json; charset=utf-8' });
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, err: unknown) {
  const message = errorMessage(err);
  const status = /not found|no bet|load a fixture/i.test(message) ? 400 : 400;
  json(res, status, { ok: false, error: message });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, mode: 'LocalBlockchain demo' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      json(res, 200, { ok: true, state: runtime.snapshot() });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/accounts') {
      json(res, 200, { ok: true, accounts: runtime.listAccounts() });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/witness/')) {
      const index = BigInt(url.pathname.slice('/witness/'.length));
      json(res, 200, { ok: true, ...runtime.getWitness(index) });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/fixture') {
      const hash = await runtime.loadRecordedFixture();
      json(res, 200, { ok: true, txHash: hash, state: runtime.snapshot() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/place-bet') {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        accountIndex?: number;
        teamID?: string;
        amountNanomina?: string;
      };
      if (body.accountIndex === undefined || !body.teamID || !body.amountNanomina) {
        throw new Error('accountIndex, teamID, and amountNanomina are required');
      }
      const result = await runtime.placeBet(
        body.accountIndex,
        BigInt(body.teamID),
        BigInt(body.amountNanomina)
      );
      json(res, 200, {
        ok: true,
        txHash: result.txHash,
        index: result.index,
        state: runtime.snapshot(),
        accounts: runtime.listAccounts(),
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/lock') {
      const txHash = await runtime.lock();
      json(res, 200, { ok: true, txHash, state: runtime.snapshot() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/settle') {
      const body = JSON.parse((await readBody(req)) || '{}') as { winner?: 'local' | 'visitor' };
      if (body.winner !== 'local' && body.winner !== 'visitor') {
        throw new Error('winner must be "local" or "visitor"');
      }
      const txHash = await runtime.settle(body.winner);
      json(res, 200, { ok: true, txHash, state: runtime.snapshot() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/void') {
      const txHash = await runtime.voidMarket();
      json(res, 200, { ok: true, txHash, state: runtime.snapshot() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/claim') {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        betIndex?: string;
        feePayerIndex?: number;
      };
      if (body.betIndex === undefined || body.feePayerIndex === undefined) {
        throw new Error('betIndex and feePayerIndex are required');
      }
      const txHash = await runtime.claim(BigInt(body.betIndex), body.feePayerIndex);
      json(res, 200, {
        ok: true,
        txHash,
        state: runtime.snapshot(),
        accounts: runtime.listAccounts(),
      });
      return;
    }
    json(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    fail(res, err);
  }
}

const server = createServer((req, res) => {
  void handle(req, res);
});

await runtime.boot();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`LocalBlockchain demo listening on http://127.0.0.1:${PORT}`);
  console.log(`zkApp ${runtime.zkApp.address.toBase58()}`);
  console.log('This is a local ledger. It is not a wallet and not Devnet.');
});
