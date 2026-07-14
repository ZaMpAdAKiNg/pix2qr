/* Leitura limitada de dimensões antes de entregar a imagem ao decoder nativo.
 * Suporta os formatos aceitos pela UI: PNG, JPEG, GIF e WebP. */
(function initImageMetadata(root) {
  const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

  function dimensions(format, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
    return { format, width, height };
  }

  function readImageDimensions(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (bytes.length >= 24
        && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG'
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
        && ascii(bytes, 12, 4) === 'IHDR') {
      return dimensions('png', view.getUint32(16), view.getUint32(20));
    }

    if (bytes.length >= 10 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
      return dimensions('gif', view.getUint16(6, true), view.getUint16(8, true));
    }

    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 4 <= bytes.length) {
        while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
        while (offset < bytes.length && bytes[offset] === 0xff) offset++;
        if (offset >= bytes.length) break;
        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > bytes.length) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) break;
        const isSof = (marker >= 0xc0 && marker <= 0xc3)
          || (marker >= 0xc5 && marker <= 0xc7)
          || (marker >= 0xc9 && marker <= 0xcb)
          || (marker >= 0xcd && marker <= 0xcf);
        if (isSof && length >= 7) {
          return dimensions('jpeg', view.getUint16(offset + 5), view.getUint16(offset + 3));
        }
        offset += length;
      }
      return null;
    }

    if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      let offset = 12;
      while (offset + 8 <= bytes.length) {
        const kind = ascii(bytes, offset, 4);
        const size = view.getUint32(offset + 4, true);
        const data = offset + 8;
        if (data + size > bytes.length) break;
        if (kind === 'VP8X' && size >= 10) {
          const width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
          const height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16);
          return dimensions('webp', width, height);
        }
        if (kind === 'VP8L' && size >= 5 && bytes[data] === 0x2f) {
          const width = 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8);
          const height = 1 + (bytes[data + 2] >> 6) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 0x0f) << 10);
          return dimensions('webp', width, height);
        }
        if (kind === 'VP8 ' && size >= 10
            && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
          return dimensions('webp', view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff);
        }
        offset = data + size + (size % 2);
      }
    }
    return null;
  }

  function hasSafeImageDimensions(info, maxPixels = 25000000) {
    return Boolean(info && info.width > 0 && info.height > 0
      && info.width <= maxPixels && info.height <= maxPixels
      && info.width * info.height <= maxPixels);
  }

  // O cabeçalho é só uma pré-validação barata. Depois do decode nativo, as
  // dimensões reais precisam continuar dentro do limite e coincidir exatamente
  // com o que foi declarado; divergência indica arquivo ambíguo/poliglota ou
  // parser disagreement e deve falhar fechado antes de canvas/getImageData.
  function hasConsistentDecodedImageDimensions(info, decodedWidth, decodedHeight, maxPixels = 25000000) {
    const decoded = dimensions('decoded', decodedWidth, decodedHeight);
    if (!hasSafeImageDimensions(info, maxPixels) || !hasSafeImageDimensions(decoded, maxPixels)) return false;
    const exact = info.width === decoded.width && info.height === decoded.height;
    // Browsers aplicam EXIF Orientation durante o decode de JPEG. Orientações
    // 5..8 trocam os eixos em relação ao SOF lido no cabeçalho, sem alterar a
    // quantidade de pixels. Só JPEG recebe essa exceção; nos outros formatos,
    // width/height invertidos continuam indicando parser disagreement.
    const exifSwapped = info.format === 'jpeg'
      && info.width === decoded.height
      && info.height === decoded.width;
    return exact || exifSwapped;
  }

  root.readImageDimensions = readImageDimensions;
  root.hasSafeImageDimensions = hasSafeImageDimensions;
  root.hasConsistentDecodedImageDimensions = hasConsistentDecodedImageDimensions;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { readImageDimensions, hasSafeImageDimensions, hasConsistentDecodedImageDimensions };
  }
})(typeof window !== 'undefined' ? window : globalThis);
