// Prova real do app shell atômico no Chromium, sem rede externa: primeira
// instalação sem reload, promoção v1→v2 com um reload controlado, rejeição de
// candidatos assimétricos e operação offline integral.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const HOST = '127.0.0.1';
const SW_TIMEOUT_MS = 10_000;
const SYNTHETIC_TIMEOUT_MS = SW_TIMEOUT_MS + 1_000;
const CACHE_PREFIX = 'pix2qr-pwa-e2e-';
const CRITICAL_SCRIPTS = [
  '/app.js',
  '/pix-core.js',
  '/analytics-privacy.js',
  '/image-metadata.js',
  '/qrcode.min.js',
  '/jsQR.min.js',
];

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

function send(response, status, contentType, body) {
  if (response.destroyed || response.writableEnded) return;
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': String(payload.length),
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  });
  response.end(payload);
}

async function createSyntheticServer() {
  const sourceEntries = await Promise.all([
    '/index.html',
    '/sw.js',
    ...CRITICAL_SCRIPTS,
  ].map(async (pathname) => [pathname, await readFile(path.join(DIST, pathname), 'utf8')]));
  const sources = new Map(sourceEntries);
  assert.match(
    sources.get('/sw.js'),
    /pix2qr-pwa-[A-Za-z0-9_-]+/,
    'dist/sw.js precisa ter cache versionado',
  );

  const state = {
    version: 'v1',
    fault: null,
    hits: Object.create(null),
    faultHits: Object.create(null),
  };
  const pendingTimers = new Set();
  const sockets = new Set();

  const record = (bucket, pathname) => {
    bucket[pathname] = (bucket[pathname] || 0) + 1;
  };

  const versionedAsset = (pathname, version) => {
    if (pathname === '/' || pathname === '/index.html') {
      return {
        body: sources.get('/index.html').replace(
          '</head>',
          `<meta name="pwa-fixture-version" content="${version}"></head>`,
        ),
        contentType: 'text/html; charset=utf-8',
      };
    }
    if (CRITICAL_SCRIPTS.includes(pathname)) {
      const marker = [
        `/*PWA_FIXTURE_VERSION=${version}*/`,
        'window.__PWA_SCRIPT_VERSIONS__=window.__PWA_SCRIPT_VERSIONS__||{};',
        `window.__PWA_SCRIPT_VERSIONS__[${JSON.stringify(pathname)}]=${JSON.stringify(version)};`,
      ].join('');
      return {
        body: `${sources.get(pathname)}\n;${marker}\n`,
        contentType: 'text/javascript; charset=utf-8',
      };
    }
    if (pathname === '/sw.js') {
      return {
        body: sources.get('/sw.js').replace(
          /pix2qr-pwa-[A-Za-z0-9_-]+/,
          `${CACHE_PREFIX}${version}`,
        ),
        contentType: 'text/javascript; charset=utf-8',
      };
    }
    return null;
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        send(response, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n');
        return;
      }

      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      const requestedVersion = state.version;
      const requestedFault = state.fault && state.fault.targets.includes(pathname)
        ? state.fault.mode
        : null;
      const dynamicAsset = versionedAsset(pathname, requestedVersion);
      record(state.hits, pathname);

      if (requestedFault) {
        record(state.faultHits, pathname);
        const sentinel = `NETWORK_FAULT_${requestedFault}_${pathname}`;
        if (requestedFault === '404') {
          send(response, 404, 'text/plain; charset=utf-8', sentinel);
          return;
        }
        if (requestedFault === '500') {
          send(response, 500, 'text/plain; charset=utf-8', sentinel);
          return;
        }
        if (requestedFault === 'mime') {
          send(response, 200, 'application/octet-stream', sentinel);
          return;
        }
        if (requestedFault === 'timeout') {
          const timer = setTimeout(() => {
            pendingTimers.delete(timer);
            if (dynamicAsset) send(response, 200, dynamicAsset.contentType, dynamicAsset.body);
          }, SYNTHETIC_TIMEOUT_MS);
          pendingTimers.add(timer);
          return;
        }
        throw new Error(`fault sintético desconhecido: ${requestedFault}`);
      }

      if (dynamicAsset) {
        send(response, 200, dynamicAsset.contentType, dynamicAsset.body);
        return;
      }

      const resolved = path.resolve(DIST, `.${pathname}`);
      if (resolved !== DIST && !resolved.startsWith(`${DIST}${path.sep}`)) {
        send(response, 400, 'text/plain; charset=utf-8', 'Bad Request\n');
        return;
      }
      // Clean URLs, espelhando o default da Vercel: /privacidade serve
      // privacidade.html. É a forma que o SW precacheia e que o rodapé linka.
      const candidates = path.extname(resolved) ? [resolved] : [resolved, `${resolved}.html`];
      let served;
      for (const candidate of candidates) {
        try {
          served = { body: await readFile(candidate), file: candidate };
          break;
        } catch {
          // próximo candidato
        }
      }
      if (!served) {
        send(response, 404, 'text/plain; charset=utf-8', 'Not Found\n');
        return;
      }
      const contentType = CONTENT_TYPES.get(path.extname(served.file).toLowerCase())
        || 'application/octet-stream';
      send(response, 200, contentType, served.body);
    } catch (error) {
      if (!response.headersSent) {
        send(response, 500, 'text/plain; charset=utf-8', `Synthetic server error: ${error.message}\n`);
      } else {
        response.destroy();
      }
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, HOST);
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string', 'servidor sintético sem porta TCP');

  return {
    origin: `http://${HOST}:${address.port}`,
    state,
    resetHits() {
      state.hits = Object.create(null);
      state.faultHits = Object.create(null);
    },
    async close() {
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
      await new Promise((resolve) => {
        const force = setTimeout(() => {
          server.closeAllConnections?.();
          for (const socket of sockets) socket.destroy();
          resolve();
        }, 1_000);
        server.close(() => {
          clearTimeout(force);
          resolve();
        });
        server.closeIdleConnections?.();
      });
    },
  };
}

async function pageVersions(page) {
  return page.evaluate((scripts) => ({
    html: document.querySelector('meta[name="pwa-fixture-version"]')?.content || null,
    scripts: Object.fromEntries(scripts.map((pathname) => [
      pathname,
      window.__PWA_SCRIPT_VERSIONS__?.[pathname] || null,
    ])),
  }), CRITICAL_SCRIPTS);
}

function assertVersionPair(actual, expected, message) {
  assert.equal(actual.html, expected, `${message}: HTML=${actual.html}`);
  for (const pathname of CRITICAL_SCRIPTS) {
    assert.equal(
      actual.scripts[pathname],
      expected,
      `${message}: ${pathname}=${actual.scripts[pathname]}`,
    );
  }
}

async function cacheState(page) {
  return page.evaluate(async ({ prefix, scripts }) => {
    const keys = (await caches.keys()).filter((key) => key.startsWith(prefix)).sort();
    const active = keys.at(-1);
    const result = { keys, html: null, scripts: Object.fromEntries(scripts.map((item) => [item, null])) };
    if (!active) return result;

    const cache = await caches.open(active);
    const html = await (await cache.match('/index.html'))?.text();
    result.html = /pwa-fixture-version[^>]+content="([^"]+)"/.exec(html || '')?.[1] || null;
    await Promise.all(scripts.map(async (pathname) => {
      const source = await (await cache.match(pathname))?.text();
      result.scripts[pathname] = /PWA_FIXTURE_VERSION=([^*]+)\*\//.exec(source || '')?.[1] || null;
    }));
    return result;
  }, { prefix: CACHE_PREFIX, scripts: CRITICAL_SCRIPTS });
}

function assertAtomicCache(actual, expectedVersion, message) {
  assert.deepEqual(actual.keys, [`${CACHE_PREFIX}${expectedVersion}`], `${message}: caches`);
  assert.equal(actual.html, expectedVersion, `${message}: HTML no cache`);
  for (const pathname of CRITICAL_SCRIPTS) {
    assert.equal(actual.scripts[pathname], expectedVersion, `${message}: ${pathname} no cache`);
  }
}

async function waitFor(page, predicate, description, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() <= deadline) {
    lastValue = await predicate();
    if (lastValue) return lastValue;
    await page.waitForTimeout(50);
  }
  throw new Error(`PWA E2E FAIL: timeout aguardando ${description}; último valor: ${JSON.stringify(lastValue)}`);
}

async function waitForRegistrationIdle(page) {
  await waitFor(
    page,
    () => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration && !registration.installing && !registration.waiting;
    }),
    'registro de Service Worker ocioso',
  );
}

async function expectRejectedUpdate(page, description) {
  return page.evaluate(async (label) => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error(`${label}: registro ausente`);

    return new Promise((resolve, reject) => {
      let observedWorker;
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) reject(new Error(`${label}: worker candidato não ficou redundante`));
      }, 25_000);

      const finish = (state) => {
        if (settled) return;
        if (state === 'activated') {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`${label}: worker inválido foi ativado`));
        } else if (state === 'redundant') {
          settled = true;
          clearTimeout(timeout);
          resolve(state);
        }
      };
      const observe = (worker) => {
        if (!worker || worker === observedWorker) return;
        observedWorker = worker;
        worker.addEventListener('statechange', () => finish(worker.state));
        finish(worker.state);
      };
      registration.addEventListener('updatefound', () => observe(registration.installing));
      void registration.update().then(() => observe(registration.installing)).catch((error) => {
        if (!observedWorker && !settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }, description);
}

function assertEveryShellAssetWasFetched(hits, description) {
  for (const pathname of ['/', '/index.html', ...CRITICAL_SCRIPTS]) {
    assert.ok(hits[pathname] >= 1, `${description}: ${pathname} não foi buscado pelo instalador`);
  }
}

let browser;
let context;
let syntheticServer;

try {
  syntheticServer = await createSyntheticServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  context = await browser.newContext({ serviceWorkers: 'allow' });
  await context.addInitScript(() => {
    window.__PWA_INSTALL_ERRORS__ = [];
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'PWA_INSTALL_ERROR') {
        window.__PWA_INSTALL_ERRORS__.push(event.data.detail || 'unknown');
      }
    });
  });
  const workerDiagnostics = [];
  context.on('serviceworker', (worker) => {
    worker.on('console', (message) => workerDiagnostics.push(message.text()));
  });
  const page = await context.newPage();
  page.on('console', (message) => workerDiagnostics.push(`page:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => workerDiagnostics.push(`pageerror:${error.stack || error.message}`));
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(20_000);

  let mainFrameNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations += 1;
  });

  await page.goto(`${syntheticServer.origin}/`, { waitUntil: 'load' });
  await Promise.race([
    page.evaluate(() => navigator.serviceWorker.ready),
    new Promise((_, reject) => setTimeout(async () => {
      const registrationState = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return {
          installing: registration?.installing?.state || null,
          waiting: registration?.waiting?.state || null,
          active: registration?.active?.state || null,
          caches: await caches.keys(),
        };
      }).catch((error) => ({ diagnosticError: error.message }));
      const installErrors = await page.evaluate(() => window.__PWA_INSTALL_ERRORS__ || []);
      reject(new Error(
        `PWA E2E FAIL: primeira instalação não ativou; hits=${JSON.stringify(syntheticServer.state.hits)}; worker=${JSON.stringify(workerDiagnostics)}; registration=${JSON.stringify(registrationState)}; install=${JSON.stringify(installErrors)}`,
      ));
    }, 20_000)),
  ]);
  await waitFor(
    page,
    () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    'controller v1 assumir a primeira aba',
  );
  await page.waitForTimeout(300);
  assert.equal(mainFrameNavigations, 1, 'PWA E2E FAIL: primeira instalação recarregou a página');
  assertVersionPair(await pageVersions(page), 'v1', 'primeira instalação');
  await waitFor(
    page,
    async () => {
      const cached = await cacheState(page);
      return cached.keys.length === 1
        && cached.keys[0] === `${CACHE_PREFIX}v1`
        && cached.html === 'v1'
        && CRITICAL_SCRIPTS.every((pathname) => cached.scripts[pathname] === 'v1');
    },
    'cache atômico v1',
  );
  assertAtomicCache(await cacheState(page), 'v1', 'primeira instalação');

  // A própria aba da primeira instalação precisa continuar ouvindo a próxima
  // troca de controller; não recarregamos manualmente para provar esse caso.
  await waitForRegistrationIdle(page);
  assertVersionPair(await pageVersions(page), 'v1', 'primeira aba controlada por v1');
  assert.equal(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.updateViaCache),
    'none',
    'PWA E2E FAIL: registro não fixou updateViaCache=none',
  );

  syntheticServer.state.version = 'v2';
  syntheticServer.state.fault = null;
  syntheticServer.resetHits();
  const navigationsBeforePromotion = mainFrameNavigations;
  const controlledReload = page.waitForNavigation({ waitUntil: 'load', timeout: 15_000 });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error('registro v1 ausente');
    void registration.update();
  });
  await controlledReload;
  await waitForRegistrationIdle(page);
  await page.waitForTimeout(300);

  assert.equal(
    mainFrameNavigations,
    navigationsBeforePromotion + 1,
    'PWA E2E FAIL: promoção v2 não fez exatamente um reload controlado',
  );
  assertEveryShellAssetWasFetched(syntheticServer.state.hits, 'promoção v2');
  assertVersionPair(await pageVersions(page), 'v2', 'promoção v1→v2');
  assertAtomicCache(await cacheState(page), 'v2', 'promoção v1→v2');

  // HTML candidato fresco, mas cada um dos seis scripts críticos falha por sua
  // vez. Todos os demais bytes v3 respondem normalmente; ainda assim nenhum
  // candidato pode ativar nem causar reload/skew na aba v2.
  const scriptFaults = ['404', '500', 'mime', 'timeout', '404', '500'];
  for (const [index, pathname] of CRITICAL_SCRIPTS.entries()) {
    const mode = scriptFaults[index];
    const candidate = `v3-script-${index + 1}-${mode}`;
    syntheticServer.state.version = candidate;
    syntheticServer.state.fault = { mode, targets: [pathname] };
    syntheticServer.resetHits();
    const navigationsBeforeFailure = mainFrameNavigations;

    assert.equal(await expectRejectedUpdate(page, `${candidate}:${pathname}`), 'redundant');
    await page.waitForTimeout(150);
    assertEveryShellAssetWasFetched(syntheticServer.state.hits, candidate);
    assert.ok(
      syntheticServer.state.faultHits[pathname] >= 1,
      `${candidate}: fault não atingiu ${pathname}`,
    );
    assert.equal(
      mainFrameNavigations,
      navigationsBeforeFailure,
      `${candidate}: candidato rejeitado causou reload`,
    );
    assertVersionPair(await pageVersions(page), 'v2', `${candidate}: aba ativa`);
    assertAtomicCache(await cacheState(page), 'v2', `${candidate}: cache ativo`);
  }

  // Inverso assimétrico: os seis scripts v3 estão frescos, mas HTML falha. Os
  // quatro modos adversariais devem preservar o mesmo par completo v2.
  for (const mode of ['404', '500', 'mime', 'timeout']) {
    const candidate = `v3-html-${mode}`;
    syntheticServer.state.version = candidate;
    syntheticServer.state.fault = { mode, targets: ['/', '/index.html'] };
    syntheticServer.resetHits();
    const navigationsBeforeFailure = mainFrameNavigations;

    assert.equal(await expectRejectedUpdate(page, candidate), 'redundant');
    await page.waitForTimeout(150);
    assertEveryShellAssetWasFetched(syntheticServer.state.hits, candidate);
    assert.ok(
      syntheticServer.state.faultHits['/'] >= 1
        && syntheticServer.state.faultHits['/index.html'] >= 1,
      `${candidate}: fault não atingiu os dois HTMLs do shell`,
    );
    assert.equal(
      mainFrameNavigations,
      navigationsBeforeFailure,
      `${candidate}: candidato rejeitado causou reload`,
    );
    assertVersionPair(await pageVersions(page), 'v2', `${candidate}: aba ativa`);
    assertAtomicCache(await cacheState(page), 'v2', `${candidate}: cache ativo`);
  }

  syntheticServer.state.version = 'v2';
  syntheticServer.state.fault = null;
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  assertVersionPair(await pageVersions(page), 'v2', 'reload offline');
  await page.fill('#chave-input', 'privacy-offline@example.invalid');
  await page.fill('#nome-input', 'Loja Offline');
  await page.fill('#cidade-input', 'Brasilia');
  await page.fill('#valor-input', '12,34');
  await page.click('#gerar-btn');
  const payload = ((await page.textContent('#payload-display')) ?? '').trim();
  assert.ok(
    payload.startsWith('000201') && payload.endsWith(`6304${payload.slice(-4)}`),
    'PWA E2E FAIL: geração local offline não produziu payload EMV',
  );
  const parsed = await page.evaluate((value) => window.parseCopiaCola(value), payload);
  assert.equal(parsed?.chave, 'privacy-offline@example.invalid');
  assert.equal(parsed?.valor, '12.34');

  // Navegação real para as páginas de documento com o SW ATIVO e a rede
  // OFFLINE: só passa se elas estiverem no precache E o handler de navegação
  // servir a própria página. É a jornada do clique no rodapé dentro do app.
  // Antes do carve-out DOCUMENT_PAGE_PATHS, toda navegação era mapeada para
  // "/index.html" e estas URLs devolviam o gerador de QR.
  for (const [pathname, heading] of [
    ['/privacidade', 'Privacidade'],
    ['/licencas', 'Software e assets de terceiros'],
  ]) {
    await page.goto(`${syntheticServer.origin}${pathname}`, { waitUntil: 'load' });
    assert.equal(
      new URL(page.url()).pathname,
      pathname,
      `PWA E2E FAIL: navegação offline saiu de ${pathname}`,
    );
    assert.equal(
      (await page.textContent('h1'))?.trim(),
      heading,
      `PWA E2E FAIL: ${pathname} offline não serviu a página do documento (app shell do gerador no lugar dela?)`,
    );
    assert.equal(
      await page.locator('#gerar-btn').count(),
      0,
      `PWA E2E FAIL: ${pathname} offline serviu o gerador de QR`,
    );
  }

  await context.setOffline(false);
  console.log(
    'PWA E2E PASS: shell HTML+6 scripts atômico, reload único, faults assimétricos, PIX offline e páginas de documento offline',
  );
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
} finally {
  await Promise.race([
    context?.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  await Promise.race([
    browser?.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  await syntheticServer?.close();
}
