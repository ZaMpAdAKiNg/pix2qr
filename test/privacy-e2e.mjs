// Prova de rede contra o artefato exato: query/hash/referrer e conteúdo de
// formulário sintético nunca podem aparecer nos requests do Umami.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 8438;
const URL_PROBE = 'URL_QUERY_PIX_PROBE';
const HASH_PROBE = 'URL_HASH_PIX_PROBE';
const REFERRER_PROBE = 'REFERRER_PIX_PROBE';
const FORM_KEY = 'privacy-probe@example.invalid';
const FORM_NAME = 'FORM PIX PROBE';
const FORM_CITY = 'PROBE CITY';

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: DIST, stdio: 'ignore' });
const fail = (message) => { throw new Error(`PRIVACY E2E FAIL: ${message}`); };

try {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const requests = [];

  await page.route('https://gateway.umami.is/**', async (route) => {
    const request = route.request();
    requests.push({ provider: 'umami', url: request.url(), body: request.postData() || '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const target = `http://localhost:${PORT}/?trace=${URL_PROBE}#${HASH_PROBE}`;
  const referrer = `http://localhost:${PORT}/source?trace=${REFERRER_PROBE}`;
  await page.goto(target, { waitUntil: 'load', referer: referrer });
  await page.fill('#chave-input', FORM_KEY);
  await page.fill('#nome-input', FORM_NAME);
  await page.fill('#cidade-input', FORM_CITY);
  await page.fill('#valor-input', '12,34');
  await page.click('#gerar-btn');

  for (let i = 0; i < 50 && !requests.some((item) => item.provider === 'umami'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);

  if (!requests.some((item) => item.provider === 'umami')) fail('nenhum request Umami observado');

  const forbidden = [URL_PROBE, HASH_PROBE, REFERRER_PROBE, FORM_KEY, FORM_NAME, FORM_CITY];
  for (const request of requests) {
    const serialized = `${request.url}\n${request.body}`.toLowerCase();
    for (const probe of forbidden) {
      if (serialized.includes(probe.toLowerCase())) fail(`${request.provider} vazou ${probe}`);
    }
    const body = request.body ? JSON.parse(request.body) : {};
    const payload = body.payload;
    if (payload.url !== `http://localhost:${PORT}/`) fail(`${request.provider} URL não foi reduzida: ${payload.url}`);
    if (payload.referrer && /[?#]/.test(payload.referrer)) fail(`${request.provider} referrer manteve search/hash`);
  }

  console.log(`PRIVACY E2E PASS: ${requests.length} requests redigidos (Umami)`);
  server.kill();
  process.exit(0);
} catch (error) {
  console.error(error.message);
  server.kill();
  process.exit(1);
} finally {
  server.kill();
}
