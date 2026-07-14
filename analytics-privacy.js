/* Redação first-party para o Umami.
 * Este arquivo precisa executar antes do tracker (ver index.html). */
(function initAnalyticsPrivacy(root) {
  function urlWithoutUserData(value) {
    if (!value) return value;
    try {
      const base = root.location?.origin || 'https://pix2qr.xyz';
      const url = new URL(value, base);
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function sanitizeAnalyticsPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const clean = { ...payload };
    if (typeof clean.url === 'string') clean.url = urlWithoutUserData(clean.url);
    if (typeof clean.referrer === 'string') clean.referrer = urlWithoutUserData(clean.referrer);
    return clean;
  }

  // Nome resolvido pelo data-before-send do Umami.
  root.pix2qrBeforeSend = (_type, payload) => sanitizeAnalyticsPayload(payload);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { urlWithoutUserData, sanitizeAnalyticsPayload };
  }
})(typeof window !== 'undefined' ? window : globalThis);
