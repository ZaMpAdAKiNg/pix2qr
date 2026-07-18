// Regressões estruturais do app shell atômico. A prova v1→v2, reload único,
// falhas assimétricas e offline roda em pwa-e2e.mjs num Chromium real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const swSource = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8');
const appSource = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
const criticalScripts = [
  '/app.js',
  '/pix-core.js',
  '/analytics-privacy.js',
  '/image-metadata.js',
  '/qrcode.min.js',
  '/jsQR.min.js',
];

test('instala o app shell inteiro antes de ativar a nova versão', () => {
  for (const script of criticalScripts) {
    assert.match(swSource, new RegExp(`"${script.replace('.', '\\.')}"`));
  }
  assert.match(swSource, /"\/"/);
  assert.match(swSource, /"\/index\.html"/);
  assert.match(swSource, /"\/umami\.js"/);
  assert.match(swSource, /Promise\.all\(APP_SHELL\.map/);
  assert.match(swSource, /fetchWithTimeout\(request, 10000\)/);
  assert.match(swSource, /readBodyWithTimeout\(response, pathname, 10000\)/);
  assert.match(swSource, /response\.status !== 200/);
  assert.match(swSource, /expectedKind === "html"/);
  assert.match(swSource, /expectedKind === "javascript"/);
  assert.match(swSource, /await caches\.delete\(CACHE_NAME\);\s*const cache = await caches\.open\(CACHE_NAME\)/);
  assert.match(swSource, /fetchUrl\.searchParams\.set\("__pwa_cache", CACHE_NAME\)/);
  assert.match(swSource, /cache\.put\(cacheKey, response\)/);
  assert.match(swSource, /await caches\.delete\(CACHE_NAME\)/);
  assert.match(swSource, /installVersionedShell\(\)[\s\S]*\.then\(\(\) => self\.skipWaiting\(\)\)/);

  // O cache só abre depois que todos os bodies foram materializados e validados.
  assert.ok(
    swSource.indexOf('const entries = await Promise.all')
      < swSource.indexOf('const cache = await caches.open(CACHE_NAME)'),
  );
});

// O precache é atômico: um único item não-200 aborta a instalação e derruba o
// offline de TODO usuário. Por isso ele só pode conter caminhos que resolvem
// independentemente de configuração de roteamento da plataforma. As URLs limpas
// das páginas de documento dependem de um rewrite declarado em vercel.json —
// se um dia voltarem para cá, um erro de roteamento vira brick de offline.
test('o precache atômico não contém nenhum caminho que dependa de rewrite', () => {
  const start = swSource.indexOf('const APP_SHELL = [');
  const appShell = swSource.slice(start, swSource.indexOf('];', start));
  assert.doesNotMatch(appShell, /DOCUMENT_PAGES/);
  for (const cleanUrl of ['/privacidade', '/licencas']) {
    assert.doesNotMatch(appShell, new RegExp(`"${cleanUrl}"`), cleanUrl);
  }
  // Todo item do shell é servido por um arquivo real do artefato: "/" (index)
  // ou um caminho com extensão. Nada de extensionless dependente de rewrite.
  const paths = [...appShell.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 10, 'APP_SHELL vazio ou não parseado');
  for (const pathname of paths) {
    assert.ok(pathname === '/' || /\.[a-z0-9]+$/i.test(pathname), `shell depende de rewrite: ${pathname}`);
  }
});

test('navegação e todos os scripts críticos são cache-only no CACHE_NAME ativo', () => {
  const fetchHandler = swSource.slice(swSource.indexOf('self.addEventListener("fetch"'));
  // Navegação para página de documento NÃO é interceptada: sem precache, servir
  // do cache devolveria o gerador (ou 503). O bypass precisa vir ANTES do
  // respondWith de navegação. A prova real (SW ativo, online) está em pwa-e2e.mjs.
  assert.match(fetchHandler, /request\.mode === "navigate"/);
  assert.match(
    fetchHandler,
    /if \(request\.mode === "navigate" && DOCUMENT_PAGE_PATHS\.has\(reqUrl\.pathname\)\) return;/,
  );
  assert.match(fetchHandler, /const shellPath = request\.mode === "navigate" \? "\/index\.html" : reqUrl\.pathname;/);
  assert.ok(
    fetchHandler.indexOf('DOCUMENT_PAGE_PATHS.has(reqUrl.pathname)) return;')
      < fetchHandler.indexOf('event.respondWith'),
    'o bypass das páginas de documento precisa preceder o respondWith de navegação',
  );
  assert.match(swSource, /const DOCUMENT_PAGE_PATHS = new Set\(DOCUMENT_PAGES\)/);
  assert.match(swSource, /"\/privacidade"/);
  assert.match(swSource, /"\/licencas"/);
  assert.match(fetchHandler, /VERSIONED_SHELL_PATHS\.has\(shellPath\)/);
  assert.match(fetchHandler, /caches\.open\(CACHE_NAME\)/);
  assert.match(fetchHandler, /cache\.match\(shellPath\)/);
  assert.match(fetchHandler, /status: 503/);
  assert.doesNotMatch(fetchHandler, /fetchWithTimeout/);
  assert.doesNotMatch(swSource, /NETWORK_FIRST_CODE_PATHS/);
  assert.doesNotMatch(swSource, /cacheThenReturn|cachedOrResponse/);
  assert.doesNotMatch(fetchHandler, /event\.waitUntil\s*\(/);
});

test('registro força update sem cache e mantém a primeira aba armada para updates futuros', () => {
  assert.match(appSource, /const hadController = Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(appSource, /let controllerSeen = navigator\.serviceWorker\.controller/);
  assert.match(appSource, /controllerchange[\s\S]*if \(!controllerSeen\)[\s\S]*controllerSeen = navigator\.serviceWorker\.controller[\s\S]*return/);
  assert.match(appSource, /controllerchange[\s\S]*window\.location\.reload\(\)/);
  assert.match(appSource, /let reloadStarted = false/);
  assert.match(appSource, /if \(reloadStarted\) return/);
  assert.doesNotMatch(appSource, /controllerchange[\s\S]*\{ once: true \}/);
  assert.match(
    appSource,
    /serviceWorker\.register\('\/sw\.js', \{\s*updateViaCache: 'none',?\s*\}\)/,
  );
  assert.match(appSource, /if \(hadController && !registration\.installing\)/);
  assert.match(appSource, /await registration\.update\(\)/);
});
