#!/usr/bin/env bash
# Build hook invocado pela Vercel (ou localmente). Gera dist/ sem alterar fontes.
# Injeta o SHA do commit no CACHE_NAME do service worker pra invalidar
# automaticamente o cache de todos os clientes a cada deploy.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Fonte da versão, em ordem de preferência:
#   1. $VERCEL_GIT_COMMIT_SHA  (disponível em builds da Vercel)
#   2. git rev-parse --short HEAD  (dev local com git)
#   3. timestamp UNIX  (fallback)
if [[ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]]; then
  VERSION="${VERCEL_GIT_COMMIT_SHA:0:7}"
elif command -v git >/dev/null 2>&1 && git rev-parse --short HEAD >/dev/null 2>&1; then
  VERSION="$(git rev-parse --short HEAD)"
else
  VERSION="$(date +%s)"
fi

CACHE_NAME="pix2qr-pwa-${VERSION}"

# O deploy publica somente uma allowlist em dist/. Código-fonte de testes,
# workflows, documentação interna e tooling nunca entram no artefato web.
rm -rf dist
mkdir -p dist/icons dist/fonts dist/licenses
ROOT_FILES=(
  index.html privacidade.html licencas.html qr-code-pix-para-imprimir.html
  app.js placa.js pix-core.js analytics-privacy.js image-metadata.js
  qrcode.min.js jsQR.min.js umami.js
  manifest.webmanifest robots.txt sitemap.xml llms.txt sw.js
)
ICON_FILES=(
  icons/favicon-32.png icons/icon-1024.png icons/icon-192-maskable.png
  icons/icon-192.png icons/icon-512-maskable.png icons/icon-512.png
  icons/screenshot-narrow.png icons/screenshot-wide.png
)
FONT_FILES=(fonts/outfit-latin.woff2)
LICENSE_FILES=(
  licenses/Outfit-OFL-1.1.txt licenses/dijkstrajs-MIT.txt
  licenses/jsQR-Apache-2.0.txt licenses/node-qrcode-MIT.txt
  licenses/umami-MIT.txt
)

# A allowlist não se expande por wildcard e nunca segue symlink. Um arquivo
# novo só entra no deploy após revisão e inclusão explícita aqui + no gate.
for file in "${ROOT_FILES[@]}" "${ICON_FILES[@]}" "${FONT_FILES[@]}" "${LICENSE_FILES[@]}"; do
  if [[ ! -f "$file" || -L "$file" ]]; then
    echo "[build] arquivo público ausente, não regular ou symlink: $file" >&2
    exit 1
  fi
done
cp "${ROOT_FILES[@]}" dist/
cp "${ICON_FILES[@]}" dist/icons/
cp "${FONT_FILES[@]}" dist/fonts/
cp "${LICENSE_FILES[@]}" dist/licenses/

# Injeta a versão somente no artefato. O checkout fonte permanece intocado.
sed -i.bak -E 's|^(const CACHE_NAME = ")[^"]*(";.*)$|\1'"${CACHE_NAME}"'\2|' dist/sw.js
rm -f dist/sw.js.bak

echo "[build] CACHE_NAME = ${CACHE_NAME}"
grep -E '^const CACHE_NAME' dist/sw.js

# Minifica os arquivos servidos — precisa rodar DEPOIS do sed acima, porque
# o minify apaga o pattern ^const CACHE_NAME que o sed usa. SKIP_MINIFY=1
# pula (útil pra depurar o build localmente com a fonte legível).
if [[ "${SKIP_MINIFY:-0}" != "1" ]]; then
  BUILD_DIR=dist node scripts/minify.mjs
fi

echo "[build] artefato público isolado em dist/"
