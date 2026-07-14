// Gates mecânicos do artefato de deploy — invocado pelo CI (guardrails.yml)
// e rodável localmente. A minificação (scripts/minify.mjs) transforma a cópia
// allowlisted em dist/, então o que o cliente recebe NÃO é a fonte do git;
// estes gates provam, contra o artefato real, os invariantes que
// uma minificação errada quebraria:
//
//   --pre   ANTES do build: a lista canônica de globals do pix-core.js
//           (scripts/pix-core-globals.txt) bate com o que a fonte declara.
//           Lista desatualizada = gate mentiroso, por isso ela é validada
//           contra o código a cada CI, nunca mantida de memória.
//   --post  DEPOIS do build, contra os arquivos minificados:
//           (a) JSON-LD byte-idêntico — o sha256 dele está fixado na CSP
//               (vercel.json + meta do index.html); alterá-lo mata o site;
//           (b) CACHE_NAME do deploy presente no sw.js E o pattern que o
//               sed do build.sh consome ausente — pega tanto "não injetou"
//               quanto "minificou ANTES do sed" (cache PWA nunca invalida);
//           (c) todos os globals do pix-core.js sobrevivem no artefato
//               (--minify-identifiers os destruiria; app.js quebra em runtime).
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2];
const fail = (msg) => { console.error(`GATE FAIL: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`gate ok: ${msg}`);

const GLOBALS_FILE = 'scripts/pix-core-globals.txt';
const DIST = 'dist';
const dist = (name) => `${DIST}/${name}`;
const readGlobalsList = () => readFileSync(GLOBALS_FILE, 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

// Declarações top-level da fonte: function/class/const/let/var no início de
// linha (o corpo das funções é indentado, então ^ só casa o nível do módulo).
const extractGlobals = (src) => [...src.matchAll(
  /^(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
)].map((m) => m[1] || m[2]);

if (mode === '--pre') {
  const declared = extractGlobals(readFileSync('pix-core.js', 'utf8'));
  const listed = readGlobalsList();
  const missing = declared.filter((n) => !listed.includes(n));
  const stale = listed.filter((n) => !declared.includes(n));
  if (missing.length) fail(`pix-core.js declara globals fora da lista canônica: ${missing.join(', ')} → adicione em ${GLOBALS_FILE}`);
  if (stale.length) fail(`lista canônica cita globals que não existem mais na fonte: ${stale.join(', ')} → remova de ${GLOBALS_FILE}`);
  ok(`lista canônica de globals em dia (${listed.length} nomes)`);
  process.exit(0);
}

if (mode !== '--post') {
  console.error('uso: node scripts/check-artifact.mjs --pre | --post');
  process.exit(2);
}

// ---- (a) JSON-LD byte-idêntico: hash CSP preservado ----
const html = readFileSync(dist('index.html'), 'utf8');
const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]);
if (ldBlocks.length === 0) fail('nenhum bloco JSON-LD no index.html pós-build — o minify o destruiu');
const vercelCsp = readFileSync('vercel.json', 'utf8');
const metaCsp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
if (!metaCsp) fail('meta CSP sumiu do index.html pós-build');
for (const block of ldBlocks) {
  const hash = `sha256-${createHash('sha256').update(block).digest('base64')}`;
  if (!vercelCsp.includes(hash)) fail(`hash do JSON-LD pós-build (${hash}) ≠ hash fixado na CSP do vercel.json — site inteiro morto por CSP no deploy`);
  if (!metaCsp.includes(hash)) fail(`hash do JSON-LD pós-build (${hash}) não está na meta CSP do index.html`);
}
ok(`JSON-LD byte-idêntico (${ldBlocks.length} bloco(s), hash CSP preservado)`);

// ---- (b) CACHE_NAME injetado, e injetado ANTES do minify ----
// A versão é recomputada com a MESMA regra do build.sh; divergência entre os
// dois tornaria o gate mentiroso — mudou lá, mude aqui.
const version = process.env.VERCEL_GIT_COMMIT_SHA
  ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  : execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const sw = readFileSync(dist('sw.js'), 'utf8');
const cacheName = `pix2qr-pwa-${version}`;
if (!sw.includes(cacheName)) fail(`sw.js pós-build não contém "${cacheName}" — o sed do build.sh não injetou o CACHE_NAME (cache PWA dos clientes para de invalidar)`);
if (/^const CACHE_NAME = "/m.test(sw)) fail('sw.js pós-build ainda casa o pattern do sed (^const CACHE_NAME = ") — o minify não rodou, ou rodou ANTES da injeção');
ok(`CACHE_NAME=${cacheName} injetado e sw.js minificado na ordem certa`);

// ---- (c) globals do pix-core sobrevivem à minificação ----
const core = readFileSync(dist('pix-core.js'), 'utf8');
const lost = readGlobalsList().filter((name) => !new RegExp(`\\b${name}\\b`).test(core));
if (lost.length) fail(`globals do pix-core.js destruídos pela minificação: ${lost.join(', ')} — app.js quebraria em runtime`);
ok('todos os globals do pix-core.js sobrevivem no artefato');

// ---- (d) dist contém somente arquivos públicos explicitamente permitidos ----
const walk = (dir, prefix = '') => readdirSync(dir).flatMap((name) => {
  const rel = prefix ? `${prefix}/${name}` : name;
  const full = `${dir}/${name}`;
  const info = lstatSync(full);
  if (info.isSymbolicLink()) fail(`dist contém symlink fora do contrato: ${rel}`);
  if (info.isDirectory()) return walk(full, rel);
  if (!info.isFile()) fail(`dist contém entrada não regular: ${rel}`);
  return [rel];
});
const publicRoot = [
  'index.html', 'app.js', 'pix-core.js', 'analytics-privacy.js', 'image-metadata.js',
  'qrcode.min.js', 'jsQR.min.js',
  'umami.js', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'llms.txt', 'sw.js',
  'LICENSE', 'SECURITY.md', 'THIRD_PARTY.md', 'PRIVACY.md',
];
const expectedFiles = [
  ...publicRoot,
  'icons/favicon-32.png', 'icons/icon-1024.png',
  'icons/icon-192-maskable.png', 'icons/icon-192.png',
  'icons/icon-512-maskable.png', 'icons/icon-512.png',
  'icons/screenshot-narrow.png', 'icons/screenshot-wide.png',
  'fonts/outfit-latin.woff2',
  'licenses/Outfit-OFL-1.1.txt', 'licenses/dijkstrajs-MIT.txt',
  'licenses/jsQR-Apache-2.0.txt', 'licenses/node-qrcode-MIT.txt',
  'licenses/umami-MIT.txt',
].sort();
const actualFiles = walk(DIST).sort();
const missingFiles = expectedFiles.filter((name) => !actualFiles.includes(name));
const extraFiles = actualFiles.filter((name) => !expectedFiles.includes(name));
if (missingFiles.length) fail(`dist sem arquivos públicos obrigatórios: ${missingFiles.join(', ')}`);
if (extraFiles.length) fail(`dist contém arquivos fora da allowlist: ${extraFiles.join(', ')}`);
ok(`allowlist pública do dist confirmada (${actualFiles.length} arquivos; sem test/scripts/.github)`);

console.log('[check-artifact] todos os gates passaram');
