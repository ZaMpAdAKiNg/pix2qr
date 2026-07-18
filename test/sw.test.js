// Regressões estruturais do app shell atômico. A prova v1→v2, reload único,
// falhas assimétricas e offline roda em pwa-e2e.mjs num Chromium real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
    /if \(request\.mode === "navigate" && DOCUMENT_PAGE_PATHS\.has\(documentPagePathname\(reqUrl\.pathname\)\)\) return;/,
  );
  assert.match(fetchHandler, /const shellPath = request\.mode === "navigate" \? "\/index\.html" : reqUrl\.pathname;/);
  assert.ok(
    fetchHandler.indexOf('DOCUMENT_PAGE_PATHS.has(documentPagePathname(reqUrl.pathname))) return;')
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

// Os testes acima assertam sobre o TEXTO-FONTE do SW. Isso prova que o código
// existe, não que ele decide certo — uma regressão de roteamento passaria por
// acidente. O bloco abaixo EXECUTA o handler de fetch num contexto isolado com
// stubs e observa a única decisão que importa: houve respondWith ou não.
function loadFetchHandler(source) {
  const listeners = {};
  const noopCache = {
    match: async () => undefined,
    put: async () => {},
  };
  const sandbox = {
    self: {
      addEventListener: (type, handler) => { listeners[type] = handler; },
      location: { origin: 'https://pix2qr.xyz' },
      clients: { matchAll: async () => [], claim: async () => {} },
      skipWaiting: async () => {},
    },
    caches: {
      open: async () => noopCache,
      delete: async () => {},
      keys: async () => [],
    },
    fetch: async () => { throw new Error('o teste não deve tocar a rede'); },
    URL, Request, Response, Promise, setTimeout, clearTimeout, console,
  };
  vm.runInNewContext(source, sandbox);
  assert.ok(listeners.fetch, 'o SW não registrou listener de fetch');
  return listeners.fetch;
}

// true = o SW interceptou (serviria do cache/shell); false = passou para a rede.
function intercepts(fetchHandler, url, mode = 'navigate') {
  let responded = false;
  fetchHandler({
    request: { method: 'GET', mode, url },
    respondWith: (promise) => {
      responded = true;
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    },
  });
  return responded;
}

test('navegação para páginas de documento vai à rede em TODAS as variantes de caminho', () => {
  const fetchHandler = loadFetchHandler(swSource);
  const origin = 'https://pix2qr.xyz';

  // O SW roda ANTES da rede: nenhum rewrite/redirect da plataforma corrige uma
  // URL que ele mesmo curto-circuita. Se qualquer variante for interceptada, o
  // fallback de shell serve o GERADOR no lugar da página pedida.
  //   /privacidade.html → arquivo real do artefato (200 em produção)
  //   /privacidade/     → 404 da plataforma; errado, mas honesto — muito melhor
  //                       que 200 servindo a página errada
  for (const variant of [
    '/privacidade', '/privacidade/', '/privacidade.html',
    '/licencas', '/licencas/', '/licencas.html',
  ]) {
    assert.equal(
      intercepts(fetchHandler, `${origin}${variant}`),
      false,
      `SW interceptou ${variant} e serviria o gerador no lugar da página`,
    );
  }

  // A normalização não pode vazar para o shell: a raiz e o index continuam
  // sendo servidos pelo app shell versionado (offline do gerador depende disso).
  for (const shellUrl of ['/', '/index.html', '/qualquer-rota-desconhecida']) {
    assert.equal(
      intercepts(fetchHandler, `${origin}${shellUrl}`),
      true,
      `navegação para ${shellUrl} deixou de ser servida pelo app shell`,
    );
  }

  // Subrecursos do shell continuam cache-only; outra origem continua ignorada.
  assert.equal(intercepts(fetchHandler, `${origin}/app.js`, 'no-cors'), true);
  assert.equal(intercepts(fetchHandler, 'https://cloud.umami.is/script.js', 'no-cors'), false);
});

// A checagem sintática acima ("tem extensão, logo é arquivo") aceita qualquer
// caminho inventado: /ghost.js passaria verde, entraria no precache atômico,
// daria 404 e brickaria o offline de todo mundo — com o CI todo verde. O shell
// só é confiável se cruzado contra os arquivos que existem DE VERDADE.
test('todo item do APP_SHELL corresponde a um arquivo real no repositório', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const start = swSource.indexOf('const APP_SHELL = [');
  const appShell = swSource.slice(start, swSource.indexOf('];', start));
  const paths = [...appShell.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 10, 'APP_SHELL vazio ou não parseado — a checagem seria vácua');

  const missing = paths
    .map((pathname) => (pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')))
    .filter((relative) => !fs.existsSync(path.join(repoRoot, relative)));
  assert.deepEqual(
    missing,
    [],
    `APP_SHELL cita arquivos inexistentes (precache atômico falharia e derrubaria o offline): ${missing.join(', ')}`,
  );
});
