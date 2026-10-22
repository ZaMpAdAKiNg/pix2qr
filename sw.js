const CACHE_NAME = "pix2qr-pwa-dev"; // substituído por scripts/build.sh no deploy
// Páginas de documento: URLs limpas resolvidas por rewrite declarado em
// vercel.json (/privacidade → privacidade.html). Elas NÃO entram no APP_SHELL:
// o precache é atômico e um único item não-200 abortaria a instalação inteira,
// derrubando o offline de todo mundo por causa de uma questão de roteamento.
// Cada navegação para elas vai à rede; nenhum requisito pede que funcionem
// offline. O handler de fetch precisa dispensá-las explicitamente — senão o
// app shell do gerador (ou um 503) seria servido no lugar delas.
const DOCUMENT_PAGES = [
  "/privacidade",
  "/licencas",
];

const APP_SHELL = [
  "/",
  "/index.html",
  "/site.css",
  "/app.js",
  "/pix-core.js",
  "/analytics-privacy.js",
  "/image-metadata.js",
  "/qrcode.min.js",
  "/jsQR.min.js",
  "/umami.js",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/icons/icon-192.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/favicon-32.png",
  "/fonts/outfit-latin.woff2",
  "/fonts/ibm-plex-mono-400-latin.woff2",
  "/fonts/ibm-plex-mono-500-latin.woff2",

];

// HTML, código crítico e dependências locais formam uma unidade indivisível.
// Cada deploy usa outro CACHE_NAME; nenhum item do shell recebe refresh isolado.
const VERSIONED_SHELL_PATHS = new Set(APP_SHELL);
const DOCUMENT_PAGE_PATHS = new Set(DOCUMENT_PAGES);

// A mesma página de documento é alcançável por variantes de caminho:
// /privacidade, /privacidade/ e /privacidade.html (o arquivo real do artefato).
// O SW roda ANTES da rede, então nenhum rewrite ou redirect da plataforma
// corrige uma URL que ele próprio curto-circuitou — a normalização tem de
// acontecer aqui. Sem ela, as variantes caem no fallback de shell e o gerador é
// servido no lugar da página pedida, com status 200.
function documentPagePathname(pathname) {
  let normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith(".html")) normalized = normalized.slice(0, -".html".length);
  return normalized === "" ? "/" : normalized;
}

// O instalador também valida o tipo dos bytes executáveis. cache.addAll()
// rejeita HTTP não-2xx, mas aceitaria HTML de erro servido como status 200 no
// lugar de JavaScript; isso ativaria um cache completo porém inutilizável.
function expectedShellKind(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "html";
  if (pathname.endsWith(".js")) return "javascript";
  return "asset";
}

function isUsableShellResponse(response, expectedKind) {
  if (!response || response.status !== 200) return false;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (expectedKind === "html") return contentType.includes("text/html");
  if (expectedKind === "javascript") return contentType.includes("javascript");
  return true;
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${new URL(request.url).pathname}`)), ms);
    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (err)      => { clearTimeout(timer); reject(err); }
    );
  });
}

function readBodyWithTimeout(response, pathname, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`body timeout: ${pathname}`)), ms);
    response.arrayBuffer().then(
      (body) => { clearTimeout(timer); resolve(body); },
      (err)  => { clearTimeout(timer); reject(err); }
    );
  });
}

async function installVersionedShell() {
  try {
    // Cada body é materializado antes de entrar no cache. Isso libera conexões
    // enquanto os demais recursos baixam e só cria o candidato depois que TODO
    // o shell passou por status, MIME e timeout.
    const entries = await Promise.all(APP_SHELL.map(async (pathname) => {
      const cacheKey = new Request(new URL(pathname, self.location.origin));
      const fetchUrl = new URL(cacheKey.url);
      fetchUrl.searchParams.set("__pwa_cache", CACHE_NAME);
      // URL exclusiva do instalador evita coalescer a resposta com o mesmo
      // script que a aba ainda está carregando. O cache recebe a chave canônica.
      const request = new Request(fetchUrl, {
        cache: "no-store",
      });
      const response = await fetchWithTimeout(request, 10000);
      if (!isUsableShellResponse(response, expectedShellKind(pathname))) {
        throw new Error(`invalid app shell response: ${pathname}`);
      }
      const body = await readBodyWithTimeout(response, pathname, 10000);
      const cachedResponse = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      return [cacheKey, cachedResponse];
    }));

    await caches.delete(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    for (const [cacheKey, response] of entries) await cache.put(cacheKey, response);
  } catch (error) {
    // Uma tentativa falha nunca deixa cache candidato parcial para o retry.
    const detail = String(error && (error.stack || error.message || error));
    console.error("PWA_INSTALL_ERROR", detail);
    await caches.delete(CACHE_NAME);
    // Diagnóstico local para a aba que iniciou o update; não contém conteúdo
    // PIX nem faz request externo. Ajuda a diferenciar rede, MIME e Cache API.
    try {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "PWA_INSTALL_ERROR", detail });
    } catch (_) {
      // O erro original continua sendo a causa da falha de instalação.
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  // skipWaiting() só roda depois do shell inteiro baixar e validar. Se qualquer
  // item falhar, o worker candidato fica redundante e o controller/cache antigo
  // continuam íntegros.
  event.waitUntil(
    installVersionedShell()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Bypass para qualquer origem que não seja a nossa (Umami e CDNs).
  // Evita que o cache local cresça com recursos de terceiros.
  const reqUrl = new URL(request.url);
  if (reqUrl.origin !== self.location.origin) return;

  // Navegar para uma página de documento não é responsabilidade do SW: elas não
  // estão no precache, então interceptar só produziria o app shell do gerador no
  // lugar delas (ou o 503 de shell indisponível). Sem respondWith, o browser
  // busca na rede e o rewrite da Vercel resolve a URL limpa. Os subrecursos
  // delas (scripts, fontes) continuam vindo do shell versionado abaixo.
  if (request.mode === "navigate" && DOCUMENT_PAGE_PATHS.has(documentPagePathname(reqUrl.pathname))) return;

  // Qualquer outra navegação cai no app shell do gerador.
  const shellPath = request.mode === "navigate" ? "/index.html" : reqUrl.pathname;
  if (request.mode === "navigate" || VERSIONED_SHELL_PATHS.has(shellPath)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(shellPath).then((cached) => cached || new Response(
          "App shell indisponível",
          { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
        ))
      )
    );
    return;
  }

  // Assets não pertencentes ao shell podem usar cache de runtime; eles nunca
  // são HTML nem código que participa da geração/leitura PIX.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;
          return cache.put(request, response.clone())
            .then(() => response, () => response);
        });
      })
    )
  );
});
