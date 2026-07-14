const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

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

test('runtime usa somente Umami e mantém os filtros de privacidade', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  const vercel = readFileSync(require.resolve('../vercel.json'), 'utf8');
  assert.match(html, /data-exclude-search="true"/);
  assert.match(html, /data-exclude-hash="true"/);
  assert.match(html, /data-do-not-track="true"/);
  assert.match(html, /data-before-send="pix2qrBeforeSend"/);
  assert.doesNotMatch(html, /_vercel\/insights|vitals\.vercel-insights\.com/i);
  assert.doesNotMatch(vercel, /vitals\.vercel-insights\.com/i);
  assert.match(html, /"codeRepository": "https:\/\/github\.com\/ZaMpAdAKiNg\/pix2qr"/);
  assert.match(html, />Código-fonte no GitHub<\/a>/);
});
