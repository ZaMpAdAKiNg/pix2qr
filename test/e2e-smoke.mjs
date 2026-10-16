// Gate E2E do artefato público: gera um QR na página, decodifica e confere
// payload, chave sintética, valor e validação estrita do pix-core.
// Roda depois de `bash scripts/build.sh`: node test/e2e-smoke.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const require = createRequire(import.meta.url);
const C = require(path.join(DIST, 'pix-core.js'));

const PORT = 8437;
// UUID v4 deliberadamente sintético; não corresponde a uma chave de teste real.
const CHAVE = '00000000-0000-4000-8000-000000000000';
const NOME = 'Loja Teste';
const CIDADE = 'Brasilia';
const VALOR = '12,34';
const COMPOSITE_CASES = [
  {
    payload: '00020126180014br.gov.bcb.pix5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304F2DA',
    label: 'somente recorrência',
    value: 'Sem pagamento imediato',
  },
  {
    payload: '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865406100.505802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac12000263042875',
    label: 'pagamento estático',
    value: 'R$ 100,50',
  },
  {
    payload: '00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd4415204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304FB42',
    label: 'pagamento dinâmico',
    value: 'Definido pelo recebedor',
  },
];

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: DIST, stdio: 'ignore' });
const fail = (msg) => { console.error('E2E FAIL:', msg); server.kill(); process.exit(1); };

try {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });

  await page.fill('#chave-input', CHAVE);
  await page.fill('#nome-input', NOME);
  await page.fill('#cidade-input', CIDADE);

  // Blur não pode apagar intenção inválida e transformar o resultado em QR de
  // valor aberto. O click provoca blur antes do handler de geração.
  await page.fill('#valor-input', '1e3');
  await page.click('#gerar-btn');
  const invalidError = ((await page.textContent('#error-msg')) ?? '').trim();
  if (!invalidError.includes('Valor inválido')) fail('valor inválido não bloqueou a geração após blur');
  if (await page.inputValue('#valor-input') !== '1e3') fail('blur apagou o valor inválido');
  if (((await page.textContent('#payload-display')) ?? '').trim()) fail('valor inválido gerou payload');

  // Falha/ausência do decoder usado na auto-verificação também precisa falhar
  // fechado; restaura a própria lib da página antes do happy path.
  await page.fill('#valor-input', VALOR);
  await page.evaluate(() => {
    window.__pix2qrSavedJsQR = window.jsQR;
    window.jsQR = undefined;
  });
  await page.click('#gerar-btn');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const verifyError = ((await page.textContent('#error-msg')) ?? '').trim();
  if (!verifyError.includes('Falha ao verificar')) fail('jsQR ausente não bloqueou a geração');
  if (((await page.textContent('#payload-display')) ?? '').trim()) fail('falha de verificação deixou payload ativo');
  await page.evaluate(() => {
    window.jsQR = window.__pix2qrSavedJsQR;
    delete window.__pix2qrSavedJsQR;
  });

  await page.click('#gerar-btn');

  // Poll no lado Node: waitForFunction depende de eval, bloqueado pela CSP.
  let payload = '';
  for (let i = 0; i < 50 && !payload; i++) {
    payload = ((await page.textContent('#payload-display', { timeout: 1000 }).catch(() => '')) ?? '').trim();
    if (!payload) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!payload) fail('#payload-display não ganhou conteúdo em 5s após gerar');

  const decoded = await page.evaluate(async () => {
    if (!window.jsQR) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/jsQR.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    const element = document.querySelector('#qr-container canvas, #qr-container img');
    if (!element) return null;
    const canvas = document.createElement('canvas');
    const width = element.naturalWidth || element.width;
    const height = element.naturalHeight || element.height;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(element, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return window.jsQR(image.data, width, height)?.data || null;
  });

  // UI dos três vetores oficiais do Manual Pix 2.9: recorrência nunca pode ser
  // rotulada como pagamento estático, e o cenário sem trilho não oferece valor.
  for (const scenario of COMPOSITE_CASES) {
    await page.fill('#chave-input', scenario.payload);
    const modeLabel = ((await page.textContent('#mode-label')) ?? '').trim();
    const kind = ((await page.textContent('#cc-kind')) ?? '').trim();
    const value = ((await page.textContent('#cc-valor')) ?? '').trim();
    if (modeLabel !== 'Pix Automático') fail(`modo composto incorreto: ${modeLabel}`);
    if (!kind.includes(scenario.label)) fail(`tipo composto incorreto: ${kind}`);
    if (!value.includes(scenario.value)) fail(`valor composto incorreto: ${value}`);
    if (scenario.label === 'somente recorrência' && await page.locator('#cc-add-valor').isVisible()) {
      fail('Pix Automático somente recorrência ofereceu edição de valor');
    }
  }
  // Página de impressão (P1 SEO): a placa é gerada pelo MESMO core, o preview
  // fica visível e o PNG baixa de verdade. Sem rewrite local, o alvo é o .html.
  const placaPage = await browser.newPage();
  placaPage.setDefaultTimeout(8000);
  await placaPage.goto(`http://localhost:${PORT}/qr-code-pix-para-imprimir.html`, { waitUntil: 'load' });
  await placaPage.fill('#chave-input', CHAVE);
  await placaPage.fill('#nome-input', NOME);
  await placaPage.fill('#cidade-input', CIDADE);
  await placaPage.click('#gerar-btn');
  await placaPage.waitForSelector('#placa-preview canvas', { state: 'visible' });
  // jsQR não faz parte da página de impressão; entra aqui só pra decodificar o preview.
  await placaPage.addScriptTag({ url: '/jsQR.min.js' });
  const placaDecoded = await placaPage.evaluate(() => {
    const canvas = document.querySelector('#placa-preview canvas');
    const context = canvas.getContext('2d');
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(image.data, canvas.width, canvas.height)?.data || null;
  });
  if (!placaDecoded || !C.validaCopiaCola(placaDecoded)) fail('QR da placa não decodifica em payload válido');
  const download = await Promise.all([
    placaPage.waitForEvent('download'),
    placaPage.click('#download-btn'),
  ]).then(([d]) => d);
  if (!/\.png$/.test(download.suggestedFilename())) fail(`download da placa não é PNG: ${download.suggestedFilename()}`);
  await placaPage.close();

  // Alguns Chrome locais demoram indefinidamente no shutdown mesmo após todas
  // as páginas fecharem. O processo do teste termina logo abaixo; não deixe a
  // limpeza do browser transformar um gate verde em hang.
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);

  if (!payload.startsWith('000201')) fail('payload não parece EMV');
  if (!decoded) fail('QR não renderizou ou não decodificou');
  if (decoded !== payload) fail(`QR (${decoded.length}c) ≠ payload exibido (${payload.length}c)`);
  if (!C.validaCopiaCola(payload)) fail('CRC/estrutura inválida segundo pix-core');
  const parsed = C.parseCopiaCola(payload);
  if (!parsed || parsed.chave !== CHAVE) fail('chave sintética divergiu no roundtrip');
  if (parsed.valor !== '12.34') fail('valor sintético divergiu no roundtrip');

  console.log('E2E PASS:', payload.length, 'chars, QR = payload, estrutura/CRC ok');
  server.kill();
  process.exit(0);
} catch (error) {
  fail(error.message);
}
