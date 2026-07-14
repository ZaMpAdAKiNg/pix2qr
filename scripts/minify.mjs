// Minificação de deploy, invocada por scripts/build.sh (nunca em dev).
// Transforma IN-PLACE somente a cópia em BUILD_DIR (dist/ no build oficial);
// a fonte legível do checkout permanece intocada.
//
// Restrições que NÃO podem ser violadas:
//   - JSON-LD do index.html fica byte-idêntico: o vercel.json fixa o hash
//     sha256 dele na CSP (script-src). Minificar = hash quebrado no header.
//   - pix-core.js NÃO passa por --minify-identifiers: os nomes top-level
//     (generatePayload, parseChave, …) são globals consumidos pelo app.js
//     e pelo module.exports dos testes.
//   - sw.js só é minificado DEPOIS do build.sh injetar o CACHE_NAME
//     (a ordem é garantida pelo próprio build.sh).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// esbuild LOCAL, instalado via npm ci (versão exata + integridade verificada
// pelo package-lock.json) — nada de npx buscar binário na hora do build.
// Sem fallback silencioso: ausente = erro com instrução.
const ESBUILD_BIN = 'node_modules/.bin/esbuild';
if (!existsSync(ESBUILD_BIN)) {
  console.error('[minify] esbuild local ausente — rode `npm ci` antes do build');
  process.exit(1);
}
const esbuild = (args, input) =>
  execFileSync(ESBUILD_BIN, args,
    input === undefined ? { stdio: 'inherit' } : { input, encoding: 'utf8' });

const BUILD_DIR = process.env.BUILD_DIR || '.';
const target = (name) => join(BUILD_DIR, name);

// JS: app.js e sw.js são self-contained (nenhum global deles é referenciado
// de fora), então minificação completa. pix-core.js preserva identifiers.
esbuild([target('app.js'), '--minify', `--outfile=${target('app.js')}`, '--allow-overwrite']);
esbuild([target('sw.js'), '--minify', `--outfile=${target('sw.js')}`, '--allow-overwrite']);
esbuild([target('analytics-privacy.js'), '--minify', `--outfile=${target('analytics-privacy.js')}`, '--allow-overwrite']);
esbuild([target('image-metadata.js'), '--minify', `--outfile=${target('image-metadata.js')}`, '--allow-overwrite']);
esbuild([target('pix-core.js'), '--minify-whitespace', '--minify-syntax', `--outfile=${target('pix-core.js')}`, '--allow-overwrite']);

// index.html: protege os blocos JSON-LD (hash na CSP), depois minifica
// CSS inline (esbuild via stdin), remove comentários HTML e indentação.
let html = readFileSync(target('index.html'), 'utf8');
const ldBlocks = [];
html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, (m) => {
  ldBlocks.push(m);
  return `\x00LD${ldBlocks.length - 1}\x00`;
});
html = html.replace(/(<style>)([\s\S]*?)(<\/style>)/g,
  (m, a, css, b) => a + esbuild(['--minify', '--loader=css'], css).trim() + b);
html = html.replace(/<!--[\s\S]*?-->/g, '');
html = html.replace(/^[ \t]+/gm, '');
html = html.replace(/\n{2,}/g, '\n');
html = html.replace(/\x00LD(\d+)\x00/g, (m, i) => ldBlocks[Number(i)]);
writeFileSync(target('index.html'), html);

// manifest: JSON re-serializado compacto.
writeFileSync(target('manifest.webmanifest'),
  JSON.stringify(JSON.parse(readFileSync(target('manifest.webmanifest'), 'utf8'))));

console.log('[minify] ok: JS first-party, sw.js, pix-core.js, index.html, manifest.webmanifest');
