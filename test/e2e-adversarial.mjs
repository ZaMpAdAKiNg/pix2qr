// Adversarial browser gate for the exact dist/ artifact. Every PIX value and
// key below is deliberately synthetic; example.invalid is reserved for tests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNoPageDiagnostics,
  launchBrowserPage,
  startStaticServer,
  waitFor,
} from './e2e-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const require = createRequire(import.meta.url);
const PixCore = require(path.join(DIST, 'pix-core.js'));

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'mobile-390x844', width: 390, height: 844 },
];
const PUBLIC_IMAGE_ASSETS = [
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/icon-1024.png',
  'icons/icon-192-maskable.png',
  'icons/icon-192.png',
  'icons/icon-512-maskable.png',
  'icons/icon-512.png',
  'icons/screenshot-narrow.png',
  'icons/screenshot-wide.png',
];

// Ícones do app instalado (PIX-15): `any` com cantos transparentes; maskable
// opaco #1f2a26 até a borda e com o S inteiro dentro do círculo seguro do
// Android (raio 0,4 × lado).
const APP_ICONS_ANY = new Set(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-1024.png']);
const APP_ICONS_MASKABLE = new Set(['icons/icon-192-maskable.png', 'icons/icon-512-maskable.png']);

const analyticsEndpoint = /^https:\/\/(?:cloud\.umami\.is|gateway\.umami\.is|api-gateway\.umami\.dev)\//;

async function text(page, selector) {
  return ((await page.textContent(selector)) || '').trim();
}

async function assertNoRenderedPayment(page, context) {
  assert.equal(await text(page, '#payload-display'), '', `${context}: payload remained visible`);
  assert.equal(await page.locator('#qr-wrap canvas, #qr-wrap img').count(), 0, `${context}: QR remained visible`);
  assert.equal(await page.locator('#result').evaluate((element) => element.classList.contains('visible')), false,
    `${context}: result card remained visible`);
}

async function waitForPayload(page, description = 'synthetic payload') {
  return waitFor(async () => {
    const payload = await text(page, '#payload-display');
    const qrCount = await page.locator('#qr-wrap canvas').count();
    return payload && qrCount === 1 ? payload : '';
  }, { timeoutMs: 8_000, intervalMs: 50, description });
}

async function fillSyntheticForm(page, label, amount = '12,34') {
  const key = `e2e-${label}@example.invalid`;
  await page.fill('#chave-input', key);
  await page.fill('#nome-input', 'LOJA E2E');
  await page.fill('#cidade-input', 'BRASILIA');
  await page.fill('#valor-input', amount);
  return key;
}

async function generateAndValidate(page, label, amount = '12,34') {
  const key = await fillSyntheticForm(page, label, amount);
  await page.click('#gerar-btn');
  const payload = await waitForPayload(page, `${label} generated payload`);
  assert.equal(PixCore.validaCopiaCola(payload), true, `${label}: Node core rejected generated payload`);
  const parsed = PixCore.parseCopiaCola(payload);
  assert.equal(parsed?.chave, key, `${label}: synthetic key diverged`);
  assert.equal(parsed?.valor, amount.replace(',', '.'), `${label}: synthetic amount diverged`);
  assert.equal(await page.evaluate((value) => window.validaCopiaCola(value), payload), true,
    `${label}: browser core rejected generated payload`);
  return { key, payload };
}

function finishPayload(body) {
  const withCrcHeader = `${body}6304`;
  return withCrcHeader + PixCore.crc16(withCrcHeader);
}

function makePaddedStatic(targetBytes) {
  const original = PixCore.generatePayload(
    'boundary@example.invalid',
    'LOJA LIMITE',
    'BRASILIA',
    '',
    'LIMIT1024',
  );
  const entries = PixCore.parseTLVStrict(original, true).entries;
  let remaining = targetBytes - new TextEncoder().encode(original).length;
  const extensions = [];
  let id = 2;
  while (remaining > 0) {
    let fieldBytes = Math.min(103, remaining);
    const tail = remaining - fieldBytes;
    if (tail > 0 && tail < 5) fieldBytes -= 5 - tail;
    assert.ok(fieldBytes >= 5 && fieldBytes <= 103);
    const valueBytes = fieldBytes - 4;
    const value = valueBytes >= 2 ? `é${'x'.repeat(valueBytes - 2)}` : 'x';
    extensions.push(PixCore.tlv(id++, value));
    remaining -= fieldBytes;
  }
  assert.ok(id <= 26);
  const body = entries[0].raw
    + extensions.join('')
    + entries.slice(1).map((entry) => entry.raw).join('');
  const payload = finishPayload(body);
  assert.equal(new TextEncoder().encode(payload).length, targetBytes);
  return payload;
}

async function exercisePayloadByteBoundary(page, label) {
  const atLimit = makePaddedStatic(1024);
  const overLimit = makePaddedStatic(1025);
  assert.equal(await page.getAttribute('#chave-input', 'maxlength'), '1024');

  await page.fill('#chave-input', atLimit);
  assert.equal(await page.inputValue('#chave-input'), atLimit,
    `${label}: valid 1024-byte BR Code was truncated by the DOM`);
  assert.equal(await page.evaluate((value) => window.validaCopiaCola(value), atLimit), true,
    `${label}: browser core rejected the 1024-byte boundary`);
  await page.click('#gerar-btn');
  assert.equal(await waitForPayload(page, `${label} 1024-byte render`), atLimit,
    `${label}: valid 1024-byte BR Code did not render byte-for-byte`);

  await page.fill('#chave-input', overLimit);
  assert.equal(await page.inputValue('#chave-input'), overLimit,
    `${label}: DOM hid the core 1025-byte rejection by truncating input`);
  assert.equal(await page.evaluate((value) => window.validaCopiaCola(value), overLimit), false,
    `${label}: browser core accepted a 1025-byte BR Code`);
}

async function exerciseInvalidAmounts(page, label) {
  const initial = await generateAndValidate(page, `${label}-stale-amount`);
  assert.ok(initial.payload);
  await page.fill('#valor-input', '1e3');
  await assertNoRenderedPayment(page, `${label}: editing amount did not clear stale result`);

  for (const invalidAmount of ['1e3', '12.345', '-1', '0', '99999999999,99']) {
    await page.fill('#valor-input', invalidAmount);
    await page.click('#gerar-btn');
    assert.match(await text(page, '#error-msg'), /Valor inválido/,
      `${label}: invalid amount ${invalidAmount} was not rejected`);
    assert.equal(await page.inputValue('#valor-input'), invalidAmount,
      `${label}: invalid amount ${invalidAmount} was silently erased`);
    await assertNoRenderedPayment(page, `${label}: invalid amount ${invalidAmount}`);
  }
}

async function exerciseStaleKeyAndCorruptPayload(page, label) {
  const { payload } = await generateAndValidate(page, `${label}-stale-key`, '45,67');
  await page.fill('#chave-input', `changed-${label}@example.invalid`);
  await assertNoRenderedPayment(page, `${label}: editing key did not clear stale result`);

  const last = payload.at(-1);
  const corrupted = `${payload.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;
  await page.fill('#chave-input', corrupted);
  await page.click('#gerar-btn');
  assert.match(await text(page, '#error-msg'), /Copia e Cola inválido/,
    `${label}: corrupted CRC was not rejected`);
  await assertNoRenderedPayment(page, `${label}: corrupted payload`);
}

// Erro de chave = ícone + mensagem + associação programática (nunca só cor):
// o campo recebe aria-invalid/aria-describedby e perde os dois ao corrigir.
async function errorState(page) {
  return page.evaluate(() => {
    const input = document.getElementById('chave-input');
    const describedBy = input.getAttribute('aria-describedby');
    const alert = describedBy ? document.getElementById(describedBy) : null;
    const svg = document.querySelector('#error-msg svg');
    return {
      ariaInvalid: input.getAttribute('aria-invalid'),
      describedBy,
      alertIsErrorMsg: alert !== null && alert.id === 'error-msg' && alert.getAttribute('role') === 'alert',
      alertText: alert ? alert.textContent.trim() : '',
      alertVisible: getComputedStyle(document.getElementById('error-msg')).display !== 'none',
      iconVisible: svg !== null && svg.getAttribute('aria-hidden') === 'true'
        && getComputedStyle(svg).display !== 'none',
      borderColor: getComputedStyle(input).borderColor,
      errorColor: getComputedStyle(document.documentElement).getPropertyValue('--color-erro').trim(),
    };
  });
}

async function exerciseInvalidKeyErrorState(page, label) {
  await page.fill('#chave-input', 'abc');
  await page.locator('#chave-input').blur();
  let state = await errorState(page);
  assert.equal(state.ariaInvalid, 'true', `${label}: invalid key on blur did not set aria-invalid`);
  assert.equal(state.describedBy, 'error-msg', `${label}: invalid key did not associate #error-msg`);
  assert.ok(state.alertIsErrorMsg && state.alertVisible, `${label}: aria-describedby does not resolve to the visible alert`);
  assert.match(state.alertText, /Chave PIX inválida/, `${label}: invalid key message missing`);
  assert.ok(state.iconVisible, `${label}: error alert has no visible aria-hidden icon`);
  assert.equal(state.borderColor, hexToRgb(state.errorColor),
    `${label}: invalid key did not paint the --color-erro border`);
  await assertNoRenderedPayment(page, `${label}: invalid key left a result`);

  await page.click('#gerar-btn');
  state = await errorState(page);
  assert.equal(state.ariaInvalid, 'true', `${label}: generate with invalid key did not keep aria-invalid`);

  await page.fill('#chave-input', `fix-${label}@example.invalid`);
  state = await errorState(page);
  assert.equal(state.ariaInvalid, null, `${label}: correcting the key did not clear aria-invalid`);
  assert.equal(state.describedBy, null, `${label}: correcting the key did not clear aria-describedby`);
  assert.equal(state.alertVisible, false, `${label}: correcting the key left the alert visible`);
  assert.notEqual(state.borderColor, hexToRgb(state.errorColor), `${label}: error border persisted`);
  const { payload } = await generateAndValidate(page, `${label}-after-error`, '12,34');
  assert.ok(payload, `${label}: valid key after error did not generate`);
  state = await errorState(page);
  assert.equal(state.ariaInvalid, null, `${label}: generated QR kept aria-invalid`);
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

function pngWithDeclaredDimensions(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function exerciseImageScanAndGuards(page, label) {
  const { payload } = await generateAndValidate(page, `${label}-scan-source`, '78,90');
  const dataUrl = await page.locator('#qr-wrap canvas').evaluate((source) => {
    const quietZone = 40;
    const output = document.createElement('canvas');
    output.width = source.width + quietZone * 2;
    output.height = source.height + quietZone * 2;
    const context = output.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, quietZone, quietZone);
    return output.toDataURL('image/png');
  });
  const syntheticQrPng = Buffer.from(dataUrl.split(',')[1], 'base64');

  // These values must be cleared before the uploaded QR is interpreted.
  await page.fill('#nome-input', 'STALE E2E');
  await page.fill('#cidade-input', 'STALE CITY');
  await page.fill('#valor-input', '99,99');
  await page.setInputFiles('#qr-file-input', {
    name: 'synthetic-qr.png',
    mimeType: 'image/png',
    buffer: syntheticQrPng,
  });
  const scannedPayload = await waitForPayload(page, `${label} scanned synthetic QR`);
  assert.equal(scannedPayload, payload, `${label}: scan did not preserve the synthetic payload`);
  assert.equal(await page.inputValue('#chave-input'), payload, `${label}: scan input diverged`);
  assert.equal(await page.inputValue('#nome-input'), '', `${label}: scan retained stale name`);
  assert.equal(await page.inputValue('#cidade-input'), '', `${label}: scan retained stale city`);
  assert.equal(await page.inputValue('#valor-input'), '', `${label}: scan retained stale amount`);

  await page.setInputFiles('#qr-file-input', {
    name: 'synthetic-not-an-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image; synthetic fixture only'),
  });
  await waitFor(() => text(page, '#error-msg'), {
    description: `${label} unsupported image rejection`,
  });
  assert.match(await text(page, '#error-msg'), /Formato não suportado/,
    `${label}: malformed image was not rejected before decode`);
  await assertNoRenderedPayment(page, `${label}: malformed image`);

  await page.setInputFiles('#qr-file-input', {
    name: 'synthetic-oversized-dimensions.png',
    mimeType: 'image/png',
    buffer: pngWithDeclaredDimensions(6_000, 6_000),
  });
  await waitFor(async () => (await text(page, '#error-msg')).includes('25 megapixels'), {
    description: `${label} image dimension guard`,
  });
  assert.match(await text(page, '#error-msg'), /grande demais.*25 megapixels/i,
    `${label}: excessive declared dimensions reached the decoder`);
  await assertNoRenderedPayment(page, `${label}: oversized declared image`);
}

async function exerciseDownloads(page, label) {
  await generateAndValidate(page, `${label}-downloads`, '23,45');
  for (const [selector, extension] of [['#download-btn', '.png'], ['#download-svg-btn', '.svg']]) {
    const downloadPromise = page.waitForEvent('download');
    await page.click(selector);
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().startsWith('pix2qr-'), `${label}: unexpected download prefix`);
    assert.ok(download.suggestedFilename().endsWith(extension), `${label}: unexpected ${extension} filename`);
    assert.equal(await download.failure(), null, `${label}: ${extension} download failed`);
  }
}

async function sweepPublicImageAssets(page) {
  assert.equal(PUBLIC_IMAGE_ASSETS.length, 9);
  for (const relativePath of PUBLIC_IMAGE_ASSETS) {
    const bytes = await readFile(path.join(DIST, relativePath));
    const mime = relativePath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    const inspection = await page.evaluate(async ({ source, asset }) => {
      const image = new Image();
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`could not load ${asset}`));
      });
      image.src = source;
      await loaded;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      // Distância (em frações do lado) do pixel cor de brasa mais afastado do centro.
      let emberReach = 0;
      const center = pixels.width / 2;
      for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
          const i = (y * pixels.width + x) * 4;
          if (pixels.data[i] > 200 && pixels.data[i + 1] < 120 && pixels.data[i + 2] < 100) {
            emberReach = Math.max(emberReach, Math.hypot(x + 0.5 - center, y + 0.5 - center) / pixels.width);
          }
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        decodedLength: decoded?.data?.length || 0,
        corner: Array.from(pixels.data.slice(0, 4)),
        emberReach,
      };
    }, {
      source: `data:${mime};base64,${bytes.toString('base64')}`,
      asset: relativePath,
    });
    assert.ok(inspection.width > 0 && inspection.height > 0, `${relativePath}: image did not decode`);
    assert.equal(inspection.decodedLength, 0,
      `${relativePath}: public image contains a decodable QR (${inspection.decodedLength} chars)`);
    if (APP_ICONS_ANY.has(relativePath)) {
      assert.equal(inspection.corner[3], 0, `${relativePath}: corner (0,0) must be transparent`);
    }
    if (APP_ICONS_MASKABLE.has(relativePath)) {
      assert.deepEqual(inspection.corner, [31, 42, 38, 255], `${relativePath}: corner (0,0) must be opaque #1f2a26`);
      assert.ok(inspection.emberReach > 0, `${relativePath}: S stroke not found`);
      assert.ok(inspection.emberReach <= 0.4,
        `${relativePath}: S stroke reaches ${inspection.emberReach.toFixed(3)} × side, outside the maskable safe zone`);
    }
  }
}

async function runViewport(staticServer, viewport) {
  const session = await launchBrowserPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const { page, diagnostics } = session;
  try {
    await page.route(analyticsEndpoint, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    }));
    await page.goto(`${staticServer.origin}/`, { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => typeof window.jsQR), 'function', `${viewport.label}: jsQR missing`);

    await exerciseInvalidAmounts(page, viewport.label);
    await exerciseStaleKeyAndCorruptPayload(page, viewport.label);
    await exerciseInvalidKeyErrorState(page, viewport.label);

    if (viewport.label === 'desktop') {
      await exercisePayloadByteBoundary(page, viewport.label);
      await exerciseImageScanAndGuards(page, viewport.label);
      await exerciseDownloads(page, viewport.label);
      await sweepPublicImageAssets(page);
    } else {
      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        contentWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(layout.contentWidth <= layout.viewportWidth,
        `${viewport.label}: horizontal overflow ${layout.contentWidth} > ${layout.viewportWidth}`);
    }

    // Let deferred UI callbacks and rejected resource work surface before gate.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assertNoPageDiagnostics(diagnostics);
  } finally {
    await session.close();
  }
}

async function exerciseDoNotTrack(staticServer) {
  const session = await launchBrowserPage({ viewport: { width: 800, height: 700 } });
  const { context, page, diagnostics } = session;
  let analyticsRequests = 0;
  let documentDntHeader = '';
  try {
    await context.setExtraHTTPHeaders({ DNT: '1' });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'doNotTrack', {
        configurable: true,
        get: () => '1',
      });
    });
    page.on('request', async (request) => {
      if (request.isNavigationRequest() && request.url() === `${staticServer.origin}/`) {
        documentDntHeader = (await request.allHeaders()).dnt || '';
      }
    });
    await page.route(analyticsEndpoint, (route) => {
      analyticsRequests++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`${staticServer.origin}/`, { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => navigator.doNotTrack), '1', 'DNT navigator signal was not active');
    await waitFor(() => documentDntHeader || false, {
      timeoutMs: 1_000,
      intervalMs: 20,
      description: 'DNT document request header',
    });
    assert.equal(documentDntHeader, '1', 'DNT request header was not sent');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(analyticsRequests, 0, 'vendored Umami sent analytics despite DNT=1');
    assertNoPageDiagnostics(diagnostics);
  } finally {
    await session.close();
  }
}

const staticServer = await startStaticServer({ rootDirectory: DIST });
try {
  for (const viewport of VIEWPORTS) await runViewport(staticServer, viewport);
  await exerciseDoNotTrack(staticServer);
  console.log('ADVERSARIAL E2E PASS: desktop + 390x844, invalid/stale/scan/image/download/PNG/DNT gates');
} finally {
  await staticServer.close();
}
