const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const indexHtmlPath = process.env.PIX_INDEX_PATH
  ? path.resolve(process.env.PIX_INDEX_PATH)
  : path.resolve(__dirname, '../index.html');

globalThis.location = { origin: 'https://pix2qr.xyz' };
const A = require('../analytics-privacy.js');

test('analytics reduz URL e referrer a origin + pathname sem mutar origem', () => {
  const input = {
    url: 'https://pix2qr.xyz/gerar?chave=PROBE#payload',
    referrer: 'https://example.invalid/origem?token=PROBE#frag',
    name: 'qr-generated',
  };
  const clean = A.sanitizeAnalyticsPayload(input);
  assert.deepEqual(clean, {
    url: 'https://pix2qr.xyz/gerar',
    referrer: 'https://example.invalid/origem',
    name: 'qr-generated',
  });
  assert.notEqual(clean, input);
  assert.match(input.url, /PROBE/);
});

test('analytics preserva payload/eventos e falha fechado em URL malformada', () => {
  assert.deepEqual(A.sanitizeAnalyticsPayload({ name: 'payload-copied', data: { source: 'button' } }), {
    name: 'payload-copied', data: { source: 'button' },
  });
  assert.equal(A.urlWithoutUserData('https://%'), '');
});

test('[hidden] override — .btn não fica visível quando [hidden] (F301 regressão)', () => {
  const html = readFileSync(indexHtmlPath, 'utf8');
  assert.match(html, /\.btn\[hidden\]\s*\{\s*display:\s*none/);
});

test('runtime usa somente Umami e mantém os filtros de privacidade', () => {
  const html = readFileSync(indexHtmlPath, 'utf8');
  const vercel = readFileSync(require.resolve('../vercel.json'), 'utf8');
  assert.match(html, /data-exclude-search="true"/);
  assert.match(html, /data-exclude-hash="true"/);
  assert.match(html, /data-do-not-track="true"/);
  assert.match(html, /data-before-send="pix2qrBeforeSend"/);
  assert.doesNotMatch(html, /_vercel\/insights|vitals\.vercel-insights\.com/i);
  assert.doesNotMatch(vercel, /vitals\.vercel-insights\.com/i);
  assert.match(html, /"codeRepository": "https:\/\/github\.com\/ZaMpAdAKiNg\/pix2qr"/);
  assert.match(html, />Código-fonte no GitHub<\/a>/);
  // O rodapé aponta para as páginas HTML, nunca de volta para o markdown cru.
  assert.match(html, /<a href="\/privacidade">Privacidade<\/a>/);
  assert.match(html, /<a href="\/licencas">Licenças de terceiros<\/a>/);
  assert.doesNotMatch(html, /href="\/(PRIVACY|THIRD_PARTY)\.md"/);
  assert.match(html, /class="github-repo-link" href="https:\/\/github\.com\/ZaMpAdAKiNg\/pix2qr"/);
  assert.match(html, /<span>Repo público<\/span>/);
});

test('stage não conta no Umami nem é indexado; produção segue intacta', () => {
  // As páginas extras só existem na fonte; o artefato minificado cobre o index.
  const pages = [indexHtmlPath];
  if (!process.env.PIX_INDEX_PATH) {
    for (const name of ['privacidade.html', 'licencas.html', 'qr-code-pix-para-imprimir.html']) {
      pages.push(path.resolve(__dirname, '..', name));
    }
  }
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /data-domains="pix2qr\.xyz,localhost,127\.0\.0\.1"/, page);
    assert.doesNotMatch(html, /data-domains="[^"]*stage\./, page);
  }
  const vercel = JSON.parse(readFileSync(require.resolve('../vercel.json'), 'utf8'));
  const robots = vercel.headers.filter((rule) =>
    rule.headers.some((h) => h.key.toLowerCase() === 'x-robots-tag'));
  assert.equal(robots.length, 1);
  assert.deepEqual(robots[0].has, [{ type: 'host', value: 'stage.pix2qr.xyz' }]);
  assert.deepEqual(robots[0].headers, [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]);
});
