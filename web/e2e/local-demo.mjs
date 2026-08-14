import { chromium } from 'playwright-core';

const ui = process.env.UI_URL ?? 'http://localhost:5173';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20_000);

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  else console.log('ok:', msg);
}

try {
  await page.goto(ui, { waitUntil: 'networkidle' });
  const title = await page.locator('h1').innerText();
  check(title.includes('Match market'), `title is "${title}"`);

  await page.getByRole('button', { name: 'Open local demo' }).click();
  await page.getByRole('heading', { name: /England vs Sri Lanka/ }).waitFor();
  check(true, 'recorded camelCase team names rendered');

  const board = await page.locator('section').filter({ hasText: 'England vs Sri Lanka' }).innerText();
  check(board.includes('ENG'), 'England code visible');
  check(board.includes('SL'), 'Sri Lanka code visible');
  check(board.includes('Open'), 'market is open');
  check(!board.includes('Team 1'), 'did not fall back to Team 1');

  await page.getByRole('radio', { name: /Sri Lanka/ }).click();
  await page.getByLabel('Stake (MINA)').fill('1');
  await page.getByRole('button', { name: 'Place bet' }).click();
  await page.getByText(/Transaction /).waitFor({ timeout: 15_000 });
  const tx = await page.locator('text=/Transaction /').innerText();
  check(/Transaction \w{10,}/.test(tx), `got tx hash: ${tx}`);

  const afterBet = await page.locator('section').filter({ hasText: 'England vs Sri Lanka' }).innerText();
  check(afterBet.includes('Implied'), 'implied pool share is shown');

  await page.getByLabel('Stake (MINA)').fill('0');
  await page.getByRole('button', { name: 'Place bet' }).click();
  await page.getByText('Enter a stake greater than 0', { exact: false }).waitFor();
  check(true, 'zero stake is rejected in the ticket');

  await page.getByRole('button', { name: 'Lock market' }).click();
  await page.getByText('New tickets are closed.').waitFor({ timeout: 15_000 });
  check(true, 'lock updates the board');

  await page.getByRole('button', { name: 'Settle Sri Lanka' }).click();
  await page.getByText('Settled winner').waitFor({ timeout: 15_000 });
  check(true, 'settle marks Sri Lanka as winner');

  await page.getByRole('button', { name: 'Claim payout' }).click();
  await page.getByText('Claimed').waitFor({ timeout: 15_000 });
  check(true, 'claim marks the ticket claimed');

  const html = await page.content();
  check(!html.includes('Wallet Connected'), 'no fake wallet-connected copy');
  check(!html.includes('href="#"'), 'no dummy hash links');
} catch (err) {
  failures.push(err instanceof Error ? err.message : String(err));
  await page.screenshot({ path: 'e2e-failure.png', fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('UI E2E failures:\n' + failures.map((f) => `- ${f}`).join('\n'));
  process.exit(1);
}
console.log('UI E2E passed');
