import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { chromium } from 'playwright-core';

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function resolveStaticPath(rootDirectory, rawUrl) {
  const root = path.resolve(rootDirectory);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl || '/', 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;

  const candidate = path.resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  return candidate;
}

function sendText(response, statusCode, body, headOnly = false) {
  const payload = Buffer.from(body);
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-length': String(payload.length),
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(headOnly ? undefined : payload);
}

export function createStaticRequestHandler(rootDirectory) {
  const root = path.resolve(rootDirectory);
  return async (request, response) => {
    const headOnly = request.method === 'HEAD';
    if (request.method !== 'GET' && !headOnly) {
      response.setHeader('allow', 'GET, HEAD');
      sendText(response, 405, 'Method Not Allowed\n');
      return;
    }

    let assetPath = resolveStaticPath(root, request.url);
    if (!assetPath) {
      sendText(response, 400, 'Bad Request\n', headOnly);
      return;
    }

    let assetStat;
    try {
      assetStat = await stat(assetPath);
      if (assetStat.isDirectory()) {
        assetPath = path.join(assetPath, 'index.html');
        assetStat = await stat(assetPath);
      }
    } catch {
      // Espelha os rewrites declarados em vercel.json: /privacidade serve
      // privacidade.html. NÃO é default da plataforma — cleanUrls tem default
      // `false` na Vercel. Sem isto o E2E não consegue exercer as URLs que o
      // site publica de verdade (rodapé, canonical e sitemap apontam todos
      // para a forma sem extensão).
      const cleanUrlPath = `${assetPath}.html`;
      try {
        if (path.extname(assetPath)) throw new Error('não é candidato a clean URL');
        assetStat = await stat(cleanUrlPath);
        assetPath = cleanUrlPath;
      } catch {
        sendText(response, 404, 'Not Found\n', headOnly);
        return;
      }
    }

    if (!assetStat.isFile()) {
      sendText(response, 404, 'Not Found\n', headOnly);
      return;
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': String(assetStat.size),
      'content-type': CONTENT_TYPES.get(path.extname(assetPath).toLowerCase()) || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    if (headOnly) {
      response.end();
      return;
    }

    const stream = createReadStream(assetPath);
    stream.on('error', () => {
      if (!response.headersSent) sendText(response, 500, 'Internal Server Error\n');
      else response.destroy();
    });
    stream.pipe(response);
  };
}

export async function startStaticServer({
  rootDirectory,
  host = '127.0.0.1',
  port = 0,
  closeTimeoutMs = 2_000,
} = {}) {
  if (!rootDirectory) throw new TypeError('rootDirectory is required');

  const sockets = new Set();
  const server = http.createServer(createStaticRequestHandler(rootDirectory));
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('static server did not expose a TCP address');
  }

  let closePromise;
  const close = () => {
    if (closePromise) return closePromise;
    closePromise = new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceTimer);
        resolve();
      };
      const forceTimer = setTimeout(() => {
        server.closeAllConnections?.();
        for (const socket of sockets) socket.destroy();
        finish();
      }, closeTimeoutMs);

      server.close(finish);
      server.closeIdleConnections?.();
    });
    return closePromise;
  };

  return {
    host,
    port: address.port,
    origin: `http://${host}:${address.port}`,
    server,
    close,
  };
}

export function capturePageDiagnostics(page) {
  const diagnostics = { console: [], pageErrors: [] };
  const onConsole = (message) => {
    diagnostics.console.push({
      type: message.type(),
      text: message.text(),
      location: message.location?.() || {},
    });
  };
  const onPageError = (error) => {
    diagnostics.pageErrors.push(error?.stack || error?.message || String(error));
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    diagnostics,
    detach() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

function matchesAllowedConsoleError(text, allowedConsoleErrors) {
  return allowedConsoleErrors.some((matcher) => (
    matcher instanceof RegExp ? matcher.test(text) : text.includes(String(matcher))
  ));
}

export function assertNoPageDiagnostics(diagnostics, { allowedConsoleErrors = [] } = {}) {
  const consoleErrors = diagnostics.console.filter((entry) => (
    entry.type === 'error' && !matchesAllowedConsoleError(entry.text, allowedConsoleErrors)
  ));
  if (!diagnostics.pageErrors.length && !consoleErrors.length) return;

  const details = [
    ...diagnostics.pageErrors.map((error) => `pageerror: ${error}`),
    ...consoleErrors.map((entry) => `console.error: ${entry.text}`),
  ];
  throw new Error(`unexpected browser diagnostics:\n${details.join('\n')}`);
}

async function closeWithin(operation, timeoutMs) {
  await Promise.race([
    Promise.resolve().then(operation).catch(() => undefined),
    delay(timeoutMs),
  ]);
}

export async function launchBrowserPage({
  viewport = { width: 1280, height: 900 },
  channel = 'chrome',
  headless = true,
  acceptDownloads = true,
  closeTimeoutMs = 3_000,
} = {}) {
  const browser = await chromium.launch({ channel, headless });
  let context;
  try {
    context = await browser.newContext({ viewport, acceptDownloads });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const capture = capturePageDiagnostics(page);
    let closePromise;
    return {
      browser,
      context,
      page,
      diagnostics: capture.diagnostics,
      close() {
        if (closePromise) return closePromise;
        closePromise = (async () => {
          capture.detach();
          await closeWithin(() => context.close(), closeTimeoutMs);
          await closeWithin(() => browser.close(), closeTimeoutMs);
        })();
        return closePromise;
      },
    };
  } catch (error) {
    await closeWithin(() => context?.close(), closeTimeoutMs);
    await closeWithin(() => browser.close(), closeTimeoutMs);
    throw error;
  }
}

export async function waitFor(check, {
  timeoutMs = 5_000,
  intervalMs = 50,
  description = 'condition',
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  const suffix = lastError ? `; last error: ${lastError.message}` : '';
  throw new Error(`timed out waiting for ${description}${suffix}`);
}

