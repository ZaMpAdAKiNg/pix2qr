// As páginas auxiliares são HTML estático servido pela mesma allowlist do
// index.html. Os invariantes provados aqui são os que quebram em silêncio:
// CSP (script inline mata a página inteira sem erro visível), identidade de
// SEO (title/description/canonical próprios) e o religamento dos links.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const read = (name) => readFileSync(require.resolve(`../${name}`), 'utf8');

const PAGES = [
  { file: 'privacidade.html', title: 'Privacidade — pix2qr', canonical: 'https://pix2qr.xyz/privacidade' },
  { file: 'licencas.html', title: 'Licenças de terceiros — pix2qr', canonical: 'https://pix2qr.xyz/licencas' },
  { file: 'qr-code-pix-para-imprimir.html', title: 'Placa PIX e QR Code para imprimir — grátis e local', canonical: 'https://pix2qr.xyz/qr-code-pix-para-imprimir' },
];

// A URL publicada (canonical, sitemap, rodapé) é a forma sem extensão. Ela só
// existe porque vercel.json declara um rewrite: cleanUrls tem default `false` na
// Vercel e este projeto não o declara — sem o rewrite, /privacidade dá 404 em
// produção e nenhum gate local percebe, porque a falha mora na plataforma.
test('vercel.json declara um rewrite para toda URL limpa publicada', () => {
  const { rewrites } = JSON.parse(read('vercel.json'));
  assert.ok(Array.isArray(rewrites), 'vercel.json não declara rewrites');
  for (const page of PAGES) {
    const cleanUrl = new URL(page.canonical).pathname;
    assert.notEqual(cleanUrl, `/${page.file}`, page.file);
    const rewrite = rewrites.find((entry) => entry.source === cleanUrl);
    assert.ok(rewrite, `sem rewrite para ${cleanUrl} — 404 em produção`);
    assert.equal(rewrite.destination, `/${page.file}`, cleanUrl);
  }
});

test('páginas auxiliares têm shell, lang e identidade de SEO próprios', () => {
  for (const page of PAGES) {
    const html = read(page.file);
    assert.match(html, /^<!DOCTYPE html>\n<html lang="pt-BR">/, page.file);
    assert.match(html, new RegExp(`<title>${page.title}</title>`), page.file);
    assert.match(html, /<meta name="description" content="[^"]{40,}"/, page.file);
    assert.match(html, new RegExp(`<link rel="canonical" href="${page.canonical}" />`), page.file);
    assert.match(html, /<meta http-equiv="Content-Security-Policy"/, page.file);
    // Mesmo shell do index: topbar com o link do repo e rodapé com o caminho de volta.
    assert.match(html, /class="github-repo-link" href="https:\/\/github\.com\/ZaMpAdAKiNg\/pix2qr"/, page.file);
    assert.match(html, /<a class="topbar-logo" href="\/">/, page.file);
    assert.match(html, /<a href="\/privacidade">Privacidade<\/a>/, page.file);
    assert.match(html, /<a href="\/licencas">Licenças de terceiros<\/a>/, page.file);
  }
});

test('páginas auxiliares não introduzem script inline (CSP: script-src self + 1 hash)', () => {
  for (const page of PAGES) {
    const html = read(page.file);
    // Todo <script> precisa ter src: sem src é inline (inclui JSON-LD, cujo
    // único hash na CSP é o do bloco do index.html — outro conteúdo é bloqueado).
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, page.file);
    assert.doesNotMatch(html, /application\/ld\+json/, page.file);
    assert.doesNotMatch(html, /\son[a-z]+="/, page.file);
    assert.match(html, /<script src="\/analytics-privacy\.js"><\/script>/, page.file);
  }
});

test('páginas auxiliares preservam as ressalvas dos documentos de origem', () => {
  assert.match(
    read('privacidade.html'),
    /não constitui parecer jurídico nem certificação de\s+conformidade com a LGPD/,
  );
  assert.match(
    read('licencas.html'),
    /Hash local não é, sozinho, prova de procedência ou reprodutibilidade/,
  );
});

test('os .md do projeto não carregam mais o comentário de autoria', () => {
  for (const doc of ['PRIVACY.md', 'THIRD_PARTY.md', 'CONTRIBUTING.md']) {
    assert.doesNotMatch(read(doc), /Codex-authored/, doc);
  }
});

test('as páginas entram no deploy pela allowlist e pelo gate do artefato', () => {
  const build = read('scripts/build.sh');
  const gate = read('scripts/check-artifact.mjs');
  for (const page of PAGES) {
    assert.match(build, new RegExp(`\\b${page.file.replace('.', '\\.')}\\b`), page.file);
    assert.match(gate, new RegExp(`'${page.file.replace('.', '\\.')}'`), page.file);
  }
  // Nenhum .md é servido pelo site: os documentos viram página HTML e o
  // markdown fica só no GitHub. Se um redirect falhar, o usuário recebe 404 —
  // nunca markdown cru, que é justamente o que estas páginas eliminam.
  const sw = read('sw.js');
  for (const doc of ['PRIVACY.md', 'SECURITY.md', 'THIRD_PARTY.md']) {
    const pattern = doc.replace('.', '\\.');
    assert.doesNotMatch(build, new RegExp(`\\b${pattern}\\b`), doc);
    assert.doesNotMatch(gate, new RegExp(`'${pattern}'`), doc);
    assert.doesNotMatch(sw, new RegExp(`"/${pattern}"`), doc);
  }
  assert.doesNotMatch(gate, /'LICENSE'/);
});

test('banner Salaria preserva destino e isolamento nas quatro páginas', () => {
  for (const file of ['index.html', ...PAGES.map(page => page.file)]) {
    const html = read(file);
    const links = [...html.matchAll(/<a\b[^>]*href="https:\/\/salaria\.tech\?ref=DAE"[^>]*>[\s\S]*?<\/a>/g)];
    assert.equal(links.length, 1, file);
    assert.match(links[0][0], /target="_blank"/);
    assert.match(links[0][0], /rel="noopener"/);
    assert.match(links[0][0], /Salaria\.tech/);
    assert.doesNotMatch(links[0][0], /\son\w+=|data-umami/);
  }
});

test('favicon SVG da Salaria declarado uma vez nas quatro páginas, com o PNG 32×32 de fallback', () => {
  const svgLink = '<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg" />';
  const pngLink = '<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />';
  for (const file of ['index.html', ...PAGES.map(page => page.file)]) {
    const html = read(file);
    assert.equal(html.split(svgLink).length - 1, 1, file);
    assert.equal(html.split(pngLink).length - 1, 1, file);
    assert.ok(html.indexOf(svgLink) < html.indexOf(pngLink), `${file}: SVG antes do PNG`);
  }
  assert.match(read('scripts/build.sh'), /\bicons\/favicon\.svg\b/);
  assert.match(read('scripts/check-artifact.mjs'), /'icons\/favicon\.svg'/);
  assert.match(read('sw.js'), /"\/icons\/favicon\.svg"/);
});
