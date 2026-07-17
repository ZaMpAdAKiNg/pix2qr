# Software e assets de terceiros

O pix2qr serve localmente os componentes abaixo. Os textos integrais de licença
ficam em [`licenses/`](licenses/) e também entram no artefato público `dist/`.

| Componente | Versão / origem fixada | Uso | Arquivo | Licença |
|---|---|---|---|---|
| **jsQR** | npm `jsqr@1.4.0`, `gitHead 49a9633`, integridade npm registrada no lock | Decodificar QR de imagem | [`jsQR.min.js`](jsQR.min.js) | [Apache-2.0](licenses/jsQR-Apache-2.0.txt) |
| **node-qrcode** | npm `qrcode@1.5.4`, commit `3848ed2`, integridade npm registrada no lock | Renderizar QR | [`qrcode.min.js`](qrcode.min.js) | [MIT](licenses/node-qrcode-MIT.txt) |
| **dijkstrajs** | npm `dijkstrajs@1.0.3`, commit `49ad1ec` | Transitivo incluído no bundle browser do node-qrcode | dentro de `qrcode.min.js` | [MIT](licenses/dijkstrajs-MIT.txt) |
| **Umami tracker** | snapshot do script cloud em 2026-07-06 | Telemetria técnica | [`umami.js`](umami.js) | [MIT](licenses/umami-MIT.txt) |
| **Outfit** | Google Fonts `v15`, variante variável latin; URL e hash no lock | Fonte local | [`fonts/outfit-latin.woff2`](fonts/outfit-latin.woff2) | [OFL-1.1](licenses/Outfit-OFL-1.1.txt) |

O `qrcode.min.js` usa o caminho browser do node-qrcode; dependências de CLI e
renderização PNG no Node (`yargs` e `pngjs`) não fazem parte desse bundle. O
transitivo executado no browser é o `dijkstrajs`, inventariado acima.

## O que o gate comprova

O arquivo de repositório `third-party.lock.json` registra o SHA-256 de cada asset
e licença distribuídos. O gate `scripts/check-vendored.mjs`, também mantido no
repositório, confere os bytes a cada CI. Isso detecta qualquer alteração local
silenciosa sem publicar tooling interno no site.

Hash local não é, sozinho, prova de procedência ou reprodutibilidade. Os bundles
minificados atuais de jsQR/node-qrcode ainda precisam de uma receita de rebuild
determinística que reproduza exatamente os bytes, e o snapshot cloud do Umami
não fornece um commit de build verificável. Até essa receita existir, uma
atualização deve partir do pacote/commit fixado, revisar o diff, preservar os
textos de licença e atualizar conscientemente o lock.

Todo o código original do pix2qr permanece sob a [licença MIT](LICENSE).
