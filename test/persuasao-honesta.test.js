// Regras de comunicação do PIX-17 ("persuasão só com sinal verdadeiro"):
// cada pedido de ação tem um motivo ligado por aria-describedby, a home declara
// um limite real e o que o pix2qr nunca pede, os dois lugares onde o QR fica
// pronto sugerem o teste com valor baixo, e nenhuma página publicada carrega
// urgência, prova social ou comparação sem fonte. São invariantes de conteúdo:
// quebram em silêncio num ajuste de copy ou de markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const indexHtmlPath = process.env.PIX_INDEX_PATH
  ? path.resolve(process.env.PIX_INDEX_PATH)
  : path.resolve(__dirname, '../index.html');
const read = (name) => readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const home = readFileSync(indexHtmlPath, 'utf8');
const placa = read('qr-code-pix-para-imprimir.html');

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripTags = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// Tag de abertura do elemento com o id dado (atributos podem quebrar linha).
function openTag(html, id) {
  const match = html.match(new RegExp(`<[a-z][a-z0-9]*\\b[^>]*\\bid="${escapeRe(id)}"[^>]*>`, 'i'));
  assert.ok(match, `elemento #${id} ausente`);
  return match[0];
}

// Texto visível do elemento com o id dado.
function textOf(html, id) {
  const match = html.match(new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*\\bid="${escapeRe(id)}"[^>]*>([\\s\\S]*?)</\\1>`, 'i'));
  assert.ok(match, `elemento #${id} ausente ou sem fechamento`);
  return stripTags(match[2]);
}

function assertHasReason(html, id, page) {
  const describedBy = openTag(html, id).match(/\baria-describedby="([^"]+)"/);
  assert.ok(describedBy, `${page}: #${id} pede uma ação sem aria-describedby`);
  for (const reasonId of describedBy[1].split(/\s+/)) {
    const reason = textOf(html, reasonId);
    assert.ok(reason.length >= 20, `${page}: #${reasonId} (motivo de #${id}) está vazio ou curto demais`);
  }
}

test('home: cada botão e campo que pede uma ação tem um motivo ligado por aria-describedby', () => {
  const controls = [
    'chave-input', 'scan-qr-btn', 'cc-add-valor-input', 'nome-input', 'cidade-input', 'valor-input',
    'gerar-btn', 'qr-container', 'copy-btn', 'download-btn', 'download-svg-btn', 'copy-img-btn',
    'donate-toggle', 'install-btn',
  ];
  for (const id of controls) assertHasReason(home, id, 'home');
});

test('placa: cada botão e campo que pede uma ação tem um motivo ligado por aria-describedby', () => {
  for (const id of ['chave-input', 'nome-input', 'cidade-input', 'valor-input', 'gerar-btn', 'print-btn', 'download-btn']) {
    assertHasReason(placa, id, 'placa');
  }
  const presets = placa.match(/<fieldset class="presets"[^>]*>/);
  assert.ok(presets && /aria-describedby="preset-why"/.test(presets[0]), 'placa: tamanho da placa sem motivo');
  assert.ok(textOf(placa, 'preset-why').length >= 20);
});

test('home: frases de motivo batem com o que o código faz', () => {
  // Nome e cidade: os limites e os valores padrão citados saem do pix-core.
  const core = read('pix-core.js');
  assert.match(core, /normalizeText\(nome\s+\|\| 'PIX'\)\.slice\(0, 25\)/);
  assert.match(core, /normalizeText\(cidade \|\| 'SAO PAULO'\)\.slice\(0, 15\)/);
  assert.match(textOf(home, 'nome-why'), /25 caracteres.*"PIX"/);
  assert.match(textOf(home, 'cidade-why'), /15 caracteres.*"SAO PAULO"/);
  // Leitura de teste antes de exibir: a auto-verificação existe no app.js.
  const app = read('app.js');
  assert.match(app, /if \(!qrDecodificaPara\(qrCanvas, payload\)\)/);
  assert.match(textOf(home, 'gerar-why'), /leitura de teste/);
  // Nenhum caminho próprio envia conteúdo: o código não abre conexão. Os
  // comentários saem antes da busca (um deles explica por que NÃO usar fetch).
  const withoutComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const source of [app, read('placa.js'), core]) {
    assert.doesNotMatch(withoutComments(source),
      /\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bEventSource\b|[^.\w]fetch\(/);
  }
});

test('home: seção "O que o pix2qr não faz" declara 1 limite real e 3 coisas que nunca pede', () => {
  const section = home.match(/<section class="card limits" id="nao-faz"[\s\S]*?<\/section>/);
  assert.ok(section, 'seção #nao-faz ausente');
  const body = section[0];
  assert.match(body, /<h2 id="nao-faz-title">O que o pix2qr não faz<\/h2>/);
  assert.match(stripTags(body), /não se conecta a banco nenhum/);
  assert.match(stripTags(body), /não confere quem é o dono da chave nem avisa se o pagamento chegou/);
  const list = body.match(/<ul class="never-list">([\s\S]*?)<\/ul>/);
  assert.ok(list, 'lista do que nunca pede ausente');
  const items = list[1].match(/<li>/g) || [];
  assert.equal(items.length, 3, 'a lista do que o pix2qr nunca pede precisa ter 3 itens');
  for (const never of [/Senha, código de verificação ou token do banco/, /Cadastro ou login/, /Pagamento para usar/]) {
    assert.match(stripTags(list[1]), never);
  }
  // Defesa contra falso suporte, com o canal oficial identificado.
  assert.match(stripTags(body), /Falso suporte/);
  assert.match(body, /Canal oficial do projeto: <a href="https:\/\/github\.com\/ZaMpAdAKiNg\/pix2qr"/);
});

test('as quatro páginas levam à seção "O que o pix2qr não faz"', () => {
  const pages = { home, placa, privacidade: read('privacidade.html'), licencas: read('licencas.html') };
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /<a href="\/#nao-faz">O que o pix2qr não faz<\/a>/, name);
  }
});

test('QR pronto e placa sugerem o teste com valor baixo, de outra conta', () => {
  for (const [name, text] of [['home', textOf(home, 'result-test')], ['placa', textOf(placa, 'placa-test')]]) {
    assert.match(text, /Antes de imprimir/, name);
    assert.match(text, /valor baixo/, name);
    assert.match(text, /[Dd]e outra conta/, name);
    assert.match(text, /extrato/, name);
  }
  // A placa também avisa antes de gerar: o passo fica visível ao abrir a página.
  assert.match(stripTags(placa), /Teste antes de expor : de outra conta, pague um valor baixo/);
});

test('páginas e scripts publicados não carregam urgência, prova social nem comparação sem fonte', () => {
  // Mesmo padrão do passo de confirmação do card PIX-17.
  const forbidden = /vaga|só hoje|apenas hoje|cronômetro|countdown|milhares|depoimento|melhor que|mais rápido|mais segur/i;
  const published = {
    'index.html': home,
    'qr-code-pix-para-imprimir.html': placa,
    'privacidade.html': read('privacidade.html'),
    'licencas.html': read('licencas.html'),
    'app.js': read('app.js'),
    'placa.js': read('placa.js'),
    'llms.txt': read('llms.txt'),
    'manifest.webmanifest': read('manifest.webmanifest'),
  };
  for (const [name, content] of Object.entries(published)) {
    const hit = content.match(forbidden);
    assert.equal(hit, null, `${name}: "${hit && hit[0]}" — urgência, prova social ou comparação sem fonte`);
  }
  // Prova social estruturada também não entra sem base real.
  assert.doesNotMatch(home, /aggregateRating|"review"|ratingValue/);
});
