// Regenera os cinco ícones raster do app instalado a partir de icons/favicon.svg
// (símbolo S da Salaria, PIX-15). O Chrome local só rasteriza o SVG num canvas;
// o PNG é codificado aqui, com zlib e filtro fixo, para que duas rodadas gerem
// os mesmos bytes e o formato seja sempre RGBA 8-bit. Ferramenta de autoria:
// não entra no dist/.
//
//   node scripts/render-icons.mjs
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'icons/favicon.svg');
const SOURCE_SHA256 = '86d8b44b6408033390584c877fba30362ba9b3486b7814cdb51a21e294730889';

// Maskable: o círculo seguro tem raio 0,4 × lado (25,6 no viewBox 64). As
// pontas do traço (largura 6, extremidades retas) ficam em (53,17) e (11,47),
// a ≈25,81 do centro: na escala nativa o S seria cortado. A 0,85 a ponta mais
// distante cai para ≈21,94.
const MASKABLE_SCALE = 0.85;
const SAFE_RADIUS = 0.4 * 64;
const STROKE_CORNERS = [[53, 17], [53, 23], [11, 41], [11, 47]];

const TARGETS = [
  { file: 'icons/icon-192.png', size: 192, purpose: 'any' },
  { file: 'icons/icon-512.png', size: 512, purpose: 'any' },
  { file: 'icons/icon-1024.png', size: 1024, purpose: 'any' },
  { file: 'icons/icon-192-maskable.png', size: 192, purpose: 'maskable' },
  { file: 'icons/icon-512-maskable.png', size: 512, purpose: 'maskable' },
];

function farthestCorner(scale) {
  return Math.max(...STROKE_CORNERS.map(([x, y]) => Math.hypot((x - 32) * scale, (y - 32) * scale)));
}

function maskableSvg(svg) {
  const rect = '<rect width="64" height="64" fill="#1f2a26" rx="14"/>';
  if (!svg.includes(rect)) throw new Error('favicon.svg: rect esperado não encontrado');
  return svg
    .replace(rect, '<rect width="64" height="64" fill="#1f2a26"/>')
    .replace('<path ', `<path transform="translate(32 32) scale(${MASKABLE_SCALE}) translate(-32 -32)" `);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, filtro adaptativo, sem entrelaçamento
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro None em toda linha: saída estável
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function rasterize(page, svg, size) {
  const pixels = await page.evaluate(async ({ source, size }) => {
    const image = new Image(size, size);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('SVG não carregou'));
      image.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, size, size);
    return Array.from(context.getImageData(0, 0, size, size).data);
  }, { source: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, size });
  return Buffer.from(pixels);
}

const svg = await readFile(SOURCE, 'utf8');
const sourceSha = createHash('sha256').update(svg).digest('hex');
if (sourceSha !== SOURCE_SHA256) throw new Error(`favicon.svg mudou: sha256 ${sourceSha}`);
const reach = farthestCorner(MASKABLE_SCALE);
if (reach > SAFE_RADIUS) throw new Error(`maskable: ponta a ${reach.toFixed(2)} > ${SAFE_RADIUS}`);
console.log(`maskable: ponta mais distante ${farthestCorner(1).toFixed(2)} → ${reach.toFixed(2)} (raio seguro ${SAFE_RADIUS})`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>render-icons</title>');
  for (const target of TARGETS) {
    const source = target.purpose === 'maskable' ? maskableSvg(svg) : svg;
    const png = encodePng(target.size, target.size, await rasterize(page, source, target.size));
    await writeFile(path.join(ROOT, target.file), png);
    const sha = createHash('sha256').update(png).digest('hex');
    console.log(`${sha}  ${target.file} (${target.size}×${target.size}, ${target.purpose})`);
  }
} finally {
  await browser.close();
}
