// Vercel e Cloudflare descrevem o mesmo site até o corte do DNS: o vercel.json
// continua servindo a produção e _headers, _redirects e wrangler.jsonc preparam
// o Worker que vai substituí-la. Estes testes provam, na fonte, que os dois
// lados não divergem — uma divergência só apareceria no dia da troca, já com
// o tráfego de verdade em cima. O gate scripts/check-artifact.mjs --post repete
// a paridade dos cabeçalhos contra o dist/ publicado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const {
  parseHeadersFile,
  parseRedirectsFile,
  parseJsonc,
  vercelGlobalHeaders,
  cloudflareGlobalHeaders,
} = require('../scripts/hosting-config.js');

const read = (name) => readFileSync(require.resolve(`../${name}`), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const headerRules = parseHeadersFile(read('_headers'));
const redirects = parseRedirectsFile(read('_redirects'));
const wrangler = parseJsonc(read('wrangler.jsonc'));

test('cabeçalhos globais do _headers são os do vercel.json, valor por valor', () => {
  const fromVercel = vercelGlobalHeaders(vercel);
  const fromCloudflare = cloudflareGlobalHeaders(headerRules);
  assert.ok(fromVercel.length >= 6, 'vercel.json perdeu cabeçalhos globais');
  assert.deepEqual(fromCloudflare, fromVercel);
  // Uma única regra global: a Cloudflare junta com vírgula o mesmo cabeçalho
  // vindo de duas regras, o que corromperia CSP e HSTS.
  assert.equal(headerRules.filter((rule) => rule.pattern === '/*').length, 1);
});

test('HSTS de dois anos com preload e CSP igual à do <meta> do index', () => {
  const global = new Map(cloudflareGlobalHeaders(headerRules).map((h) => [h.key, h.value]));
  // O domínio está na lista de preload dos navegadores: encurtar o max-age ou
  // tirar o preload é um pedido de remoção, não um ajuste.
  assert.equal(global.get('Strict-Transport-Security'), 'max-age=63072000; includeSubDomains; preload');
  const meta = read('index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  assert.ok(meta, 'meta CSP sumiu do index.html');
  const hashes = (csp) => [...csp.matchAll(/'sha256-[^']+'/g)].map((m) => m[0]);
  assert.deepEqual(hashes(global.get('Content-Security-Policy')), hashes(meta));
});

test('_redirects repete os redirects por caminho do vercel.json, com o mesmo status', () => {
  const byPath = vercel.redirects.filter((rule) => !rule.has);
  assert.deepEqual(
    redirects.map(({ source, destination, status }) => ({ source, destination, status })),
    byPath.map((rule) => ({
      source: rule.source,
      destination: rule.destination,
      status: rule.permanent ? 308 : 307,
    })),
  );
  // O www → apex é regra por host: não cabe no _redirects e fica na zona.
  const byHost = vercel.redirects.filter((rule) => rule.has);
  assert.deepEqual(byHost.map((rule) => rule.has), [[{ type: 'host', value: 'www.pix2qr.xyz' }]]);
  assert.ok(redirects.every((rule) => rule.source.startsWith('/')), 'redirect por domínio não funciona no _redirects');
});

test('wrangler.jsonc: só assets, produção em workers.dev e stage sem endereço público', () => {
  assert.equal(wrangler.name, 'pix2qr');
  assert.equal(wrangler.main, undefined);
  assert.match(wrangler.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(wrangler.workers_dev, true);
  assert.equal(wrangler.preview_urls, false);
  // O stage só abre com login (Cloudflare Access em stage.pix2qr.xyz): um
  // *.workers.dev ou uma URL de versão seriam uma porta lateral sem login.
  assert.equal(wrangler.env.stage.workers_dev, false);
  assert.equal(wrangler.env.stage.preview_urls, false);
  // Nada de domínio próprio antes do corte do DNS.
  for (const config of [wrangler, wrangler.env.stage]) {
    assert.equal(config.routes, undefined);
    assert.equal(config.route, undefined);
  }
});

test('repositório público: nenhum id de conta ou subdomínio de conta nos arquivos da Cloudflare', () => {
  assert.equal(wrangler.account_id, undefined);
  assert.equal(wrangler.env.stage.account_id, undefined);
  for (const file of ['wrangler.jsonc', '_headers', '_redirects']) {
    const text = read(file);
    assert.doesNotMatch(text, /\b[0-9a-f]{32}\b/, `${file}: parece um id de conta da Cloudflare`);
    // O único endereço workers.dev permitido é o padrão com placeholders.
    for (const match of text.matchAll(/[\w:.-]+\.workers\.dev/g)) {
      assert.equal(match[0], 'https://:version.:subdomain.workers.dev'.replace('https://', ''), `${file}: ${match[0]}`);
    }
  }
});

test('_headers e _redirects entram no dist pela allowlist e pelo gate', () => {
  const build = read('scripts/build.sh');
  const gate = read('scripts/check-artifact.mjs');
  for (const file of ['_headers', '_redirects']) {
    assert.match(build, new RegExp(`\\b${file}\\b`), file);
    assert.match(gate, new RegExp(`'${file}'`), file);
  }
  // O wrangler.jsonc é configuração de deploy, não arquivo do site.
  assert.doesNotMatch(build, /wrangler\.jsonc/);
});

test('build e gate aceitam o SHA do commit da Vercel e da Cloudflare', () => {
  const build = read('scripts/build.sh');
  const gate = read('scripts/check-artifact.mjs');
  for (const source of [build, gate]) {
    assert.match(source, /VERCEL_GIT_COMMIT_SHA/);
    assert.match(source, /WORKERS_CI_COMMIT_SHA/);
  }
});

test('parsers dos arquivos de hospedagem', () => {
  assert.deepEqual(parseHeadersFile('# c\n/*\n  A: 1\n\thttps-B: x: y\n\nhttps://h/*\n  C: z\n'), [
    { pattern: '/*', headers: [{ key: 'A', value: '1' }, { key: 'https-B', value: 'x: y' }] },
    { pattern: 'https://h/*', headers: [{ key: 'C', value: 'z' }] },
  ]);
  assert.throws(() => parseHeadersFile('  A: 1\n'), /antes de qualquer padrão/);
  assert.throws(() => parseHeadersFile('/*\n  sem-dois-pontos\n'), /Nome: valor/);
  assert.deepEqual(parseRedirectsFile('# c\n/a /b 308\n/c https://x.invalid/d\n'), [
    { source: '/a', destination: '/b', status: 308 },
    { source: '/c', destination: 'https://x.invalid/d', status: 302 },
  ]);
  assert.throws(() => parseRedirectsFile('/a\n'), /formato/);
  assert.deepEqual(parseJsonc('// x\n{ "a": "http://b//c", /* y */ "d": "e\\"//" }'), { a: 'http://b//c', d: 'e"//' });
});
