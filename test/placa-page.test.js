// Invariantes da página /qr-code-pix-para-imprimir (P1 da estratégia SEO):
// fiação de descoberta (sitemap, link interno da home), a ferramenta de placa
// carregada por arquivos (nunca inline) e o CSS de impressão que é a razão de
// existir da página. pages.test.js cobre o shell comum; aqui é o específico.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const read = (name) => readFileSync(require.resolve(`../${name}`), 'utf8');

test('sitemap publica a URL limpa da página de impressão', () => {
  assert.match(read('sitemap.xml'), /<loc>https:\/\/pix2qr\.xyz\/qr-code-pix-para-imprimir<\/loc>/);
});

test('home tem link interno para a página de impressão', () => {
  assert.match(read('index.html'), /href="\/qr-code-pix-para-imprimir"/);
});

test('página de impressão carrega o core PIX, o QRCode e o script da placa', () => {
  const html = read('qr-code-pix-para-imprimir.html');
  assert.match(html, /<script src="\/pix-core\.js" defer><\/script>/);
  assert.match(html, /<script src="\/qrcode\.min\.js" defer><\/script>/);
  assert.match(html, /<script src="\/placa\.js" defer><\/script>/);
});

test('página de impressão tem CSS @media print que isola a placa', () => {
  const html = read('qr-code-pix-para-imprimir.html');
  assert.match(html, /@media print/);
});

test('placa.js entra no deploy pela allowlist e pelo gate do artefato', () => {
  assert.match(read('scripts/build.sh'), /\bplaca\.js\b/);
  assert.match(read('scripts/check-artifact.mjs'), /'placa\.js'/);
});

test('telemetria da placa usa somente eventos enumerados, sem conteúdo PIX', () => {
  const js = read('placa.js');
  const tracks = [...js.matchAll(/umami\.track\('([^']+)'(?:,\s*(\{[^}]*\}))?\)/g)];
  assert.ok(tracks.length >= 3, 'placa.js sem eventos de funil');
  const names = tracks.map((match) => match[1]);
  for (const expected of ['tool-start', 'print-action', 'plate-downloaded']) {
    assert.ok(names.includes(expected), `evento ${expected} ausente`);
  }
  for (const [, , data] of tracks) {
    if (!data) continue;
    assert.doesNotMatch(data, /chave|valor|nome|cidade|payload/i,
      `data de evento referencia conteúdo PIX: ${data}`);
  }
});
