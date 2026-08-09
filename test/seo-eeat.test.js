// E-E-A-T da home (P0 da estratégia SEO): autoria visível, fonte normativa
// citada e autor no JSON-LD. São invariantes de conteúdo que quebrariam em
// silêncio num refactor de copy — nenhum outro gate os cobre.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const indexHtmlPath = process.env.PIX_INDEX_PATH
  ? path.resolve(process.env.PIX_INDEX_PATH)
  : path.resolve(__dirname, '../index.html');
const html = readFileSync(indexHtmlPath, 'utf8');

const jsonLd = () => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'index.html sem bloco JSON-LD');
  return JSON.parse(match[1]);
};

test('JSON-LD declara o autor/mantenedor da aplicação', () => {
  const app = jsonLd()['@graph'].find((node) => node['@type'] === 'WebApplication');
  assert.ok(app, 'nó WebApplication ausente no JSON-LD');
  assert.equal(app.author && app.author['@type'], 'Person');
  assert.equal(app.author.name, 'ZaMpA');
  assert.equal(app.author.url, 'https://github.com/ZaMpAdAKiNg');
});

test('home cita a fonte normativa da validação (BR Code/Bacen) com link', () => {
  assert.match(html, /Manual de Padr[õo]es para Inicia[çc][ãa]o do Pix/i,
    'home não cita o Manual BR Code do Bacen');
  assert.match(html, /href="https:\/\/www\.bcb\.gov\.br\/[^"]*"/,
    'citação sem link para o bcb.gov.br');
});

test('home declara quem mantém o projeto', () => {
  assert.match(html, /Mantido por(?:\s|<a[^>]*>)*ZaMpA/i, 'autoria visível ausente na home');
});
