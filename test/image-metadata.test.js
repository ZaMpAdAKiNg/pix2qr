const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../image-metadata.js');

function png(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes.buffer;
}

test('lê dimensões PNG antes do decode e aplica limite de pixels', () => {
  const normal = M.readImageDimensions(png(2000, 1500));
  assert.deepEqual(normal, { format: 'png', width: 2000, height: 1500 });
  assert.equal(M.hasSafeImageDimensions(normal), true);
  assert.equal(M.hasSafeImageDimensions(M.readImageDimensions(png(30000, 30000))), false);
});

test('lê cabeçalhos sintéticos GIF e JPEG sem materializar pixels', () => {
  const gif = Uint8Array.from([0x47,0x49,0x46,0x38,0x39,0x61,0x40,0x01,0xf0,0x00]);
  assert.deepEqual(M.readImageDimensions(gif.buffer), { format: 'gif', width: 320, height: 240 });

  const jpeg = Uint8Array.from([
    0xff,0xd8, 0xff,0xc0, 0x00,0x0b, 0x08, 0x00,0xf0, 0x01,0x40, 0x03,0x01,0x11,0x00,
  ]);
  assert.deepEqual(M.readImageDimensions(jpeg.buffer), { format: 'jpeg', width: 320, height: 240 });
});

test('lê cabeçalho WebP VP8X sem decodificar a imagem', () => {
  const webp = new Uint8Array(30);
  webp.set(Buffer.from('RIFF'), 0);
  webp.set(Buffer.from('WEBP'), 8);
  webp.set(Buffer.from('VP8X'), 12);
  const view = new DataView(webp.buffer);
  view.setUint32(16, 10, true);
  // VP8X armazena width-1 e height-1 em 24 bits little-endian.
  webp.set([0x3f, 0x01, 0x00], 24); // 320 - 1
  webp.set([0xef, 0x00, 0x00], 27); // 240 - 1
  assert.deepEqual(M.readImageDimensions(webp.buffer), { format: 'webp', width: 320, height: 240 });
});

test('formato desconhecido ou cabeçalho truncado é rejeitado antes do decode', () => {
  assert.equal(M.readImageDimensions(new Uint8Array([1, 2, 3]).buffer), null);
  assert.equal(M.readImageDimensions(Uint8Array.from([0xff, 0xd8, 0xff]).buffer), null);
});

test('dimensão pós-decode deve coincidir e reaplica o limite de 25 MP', () => {
  const header = { format: 'png', width: 2000, height: 1500 };
  assert.equal(M.hasConsistentDecodedImageDimensions(header, 2000, 1500), true);
  assert.equal(M.hasConsistentDecodedImageDimensions(header, 2001, 1500), false);
  assert.equal(M.hasConsistentDecodedImageDimensions(header, 0, 1500), false);
  assert.equal(M.hasConsistentDecodedImageDimensions(header, NaN, 1500), false);
  assert.equal(M.hasConsistentDecodedImageDimensions(header, 5001, 5000), false);
  assert.equal(M.hasConsistentDecodedImageDimensions(
    { format: 'png', width: 5000, height: 5000 }, 5000, 5000,
  ), true);
  assert.equal(M.hasConsistentDecodedImageDimensions(
    { format: 'png', width: 5000, height: 5001 }, 5000, 5001,
  ), false);
});

test('JPEG orientado por EXIF aceita eixos trocados, outros formatos não', () => {
  assert.equal(M.hasConsistentDecodedImageDimensions(
    { format: 'jpeg', width: 4032, height: 3024 }, 3024, 4032,
  ), true);
  for (const format of ['png', 'webp', 'gif']) {
    assert.equal(M.hasConsistentDecodedImageDimensions(
      { format, width: 4032, height: 3024 }, 3024, 4032,
    ), false, format);
  }
});
