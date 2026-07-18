const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const helpersPromise = import('./e2e-helpers.mjs');

test('static server uses an ephemeral port, serves HEAD/GET, and closes idempotently', async (t) => {
  const H = await helpersPromise;
  const root = await mkdtemp(path.join(os.tmpdir(), 'pix2qr-e2e-server-'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Synthetic fixture</title>');
  await writeFile(path.join(root, 'fixture.txt'), 'synthetic-only');
  t.after(() => rm(root, { recursive: true, force: true }));

  const staticServer = await H.startStaticServer({ rootDirectory: root });
  t.after(() => staticServer.close());
  assert.ok(staticServer.port > 0);

  const index = await fetch(`${staticServer.origin}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /^text\/html/);
  assert.match(await index.text(), /Synthetic fixture/);

  const head = await fetch(`${staticServer.origin}/fixture.txt`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(Buffer.byteLength('synthetic-only')));
  assert.equal(await head.text(), '');

  // Clean URLs: o servidor espelha o default da Vercel, senão o E2E não
  // consegue exercer /privacidade — a URL que o site realmente publica.
  await writeFile(path.join(root, 'documento.html'), '<!doctype html><title>Clean URL fixture</title>');
  const cleanUrl = await fetch(`${staticServer.origin}/documento`);
  assert.equal(cleanUrl.status, 200);
  assert.match(cleanUrl.headers.get('content-type'), /^text\/html/);
  assert.match(await cleanUrl.text(), /Clean URL fixture/);

  const missing = await fetch(`${staticServer.origin}/missing.txt`);
  assert.equal(missing.status, 404);
  const missingCleanUrl = await fetch(`${staticServer.origin}/nao-existe`);
  assert.equal(missingCleanUrl.status, 404);
  const rejectedMethod = await fetch(`${staticServer.origin}/fixture.txt`, { method: 'POST' });
  assert.equal(rejectedMethod.status, 405);

  await staticServer.close();
  await staticServer.close();
});

test('static path resolver contains encoded traversal inside the public root', async () => {
  const H = await helpersPromise;
  const root = path.resolve(os.tmpdir(), 'pix2qr-public-root');
  assert.equal(H.resolveStaticPath(root, '/asset.js'), path.join(root, 'asset.js'));
  assert.equal(H.resolveStaticPath(root, '/%2e%2e%2fsecret.txt'), null);
  assert.equal(H.resolveStaticPath(root, '/%00invalid'), null);
});

test('page diagnostics capture console/page errors, support detach, and fail closed', async () => {
  const H = await helpersPromise;
  const page = new EventEmitter();
  const capture = H.capturePageDiagnostics(page);
  const fakeConsole = (type, text) => ({
    type: () => type,
    text: () => text,
    location: () => ({ url: 'http://127.0.0.1/synthetic.js', lineNumber: 1 }),
  });

  page.emit('console', fakeConsole('log', 'synthetic log'));
  page.emit('console', fakeConsole('error', 'synthetic console failure'));
  page.emit('pageerror', new Error('synthetic page failure'));
  assert.equal(capture.diagnostics.console.length, 2);
  assert.equal(capture.diagnostics.pageErrors.length, 1);
  assert.throws(
    () => H.assertNoPageDiagnostics(capture.diagnostics),
    /synthetic console failure[\s\S]*synthetic page failure|synthetic page failure[\s\S]*synthetic console failure/,
  );

  capture.detach();
  page.emit('console', fakeConsole('error', 'detached failure'));
  assert.equal(capture.diagnostics.console.length, 2);

  H.assertNoPageDiagnostics(
    { console: [{ type: 'error', text: 'allowed synthetic' }], pageErrors: [] },
    { allowedConsoleErrors: [/allowed synthetic/] },
  );
});

test('waitFor returns the first truthy value and reports bounded timeouts', async () => {
  const H = await helpersPromise;
  let attempts = 0;
  const result = await H.waitFor(() => (++attempts === 3 ? 'ready' : ''), {
    timeoutMs: 250,
    intervalMs: 1,
    description: 'synthetic readiness',
  });
  assert.equal(result, 'ready');
  assert.equal(attempts, 3);

  await assert.rejects(
    H.waitFor(() => false, { timeoutMs: 10, intervalMs: 1, description: 'never-ready fixture' }),
    /timed out waiting for never-ready fixture/,
  );
});
