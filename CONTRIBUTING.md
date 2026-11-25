# Contribuindo

Contribuições pequenas e focadas são bem-vindas. O pix2qr manipula instruções de
pagamento, então a regra principal é falhar fechado: nunca adivinhar chave, valor,
destinatário ou estrutura PIX ambígua.

## Dados de teste

- Use somente fixtures sintéticas, documentadas e sem vínculo com pagamentos.
- Prefira `example.com`, `.invalid`, identificadores gerados no próprio teste e
  DDDs deliberadamente não roteáveis.
- Nunca inclua chave PIX registrada, Copia-e-Cola de cobrança real, token de PSP,
  telefone/e-mail pessoal, screenshot bancário ou dado de cliente.
- Não peça esses dados em issue. Um bug financeiro ou de segurança segue o canal
  privado de [SECURITY.md](SECURITY.md).

## Gates locais

```bash
npm ci
node --test test/*.test.js
node scripts/check-vendored.mjs
node scripts/check-artifact.mjs --pre
bash scripts/build.sh
node scripts/check-artifact.mjs --post
PIX_CORE_PATH=dist/pix-core.js node --test test/*.test.js
node test/e2e-smoke.mjs
node test/privacy-e2e.mjs
node test/pwa-e2e.mjs
node test/e2e-adversarial.mjs
```

O build público fica em `dist/`. Ele deve conter apenas a allowlist verificada
pelo gate de artefato; testes, workflows e tooling não são publicados.
Os quatro E2E usam um Chrome local e exercitam o mesmo artefato minificado.

## Hospedagem

A produção ainda é servida pela Vercel (`vercel.json`). A Cloudflare já tem a
configuração equivalente para Workers com assets estáticos: `wrangler.jsonc`,
`_headers` e `_redirects`. Enquanto os dois lados existirem, cabeçalhos e
redirects mudam nos dois arquivos juntos; `test/hosting-config.test.js` e o
gate `--post` falham se divergirem. Para publicar no endereço `*.workers.dev`,
depois dos gates: `npx wrangler deploy --env=""`. O ambiente `stage` só é
publicado quando o domínio `stage.pix2qr.xyz` e o login do Cloudflare Access
estiverem prontos. Nenhum id de conta entra no repositório.

## Pull request

- Atualize `CHANGELOG.md` quando o comportamento mudar.
- Inclua regressão sintética para mudanças em `pix-core.js` ou caminhos de PIX.
- Preserve JavaScript/HTML/CSS estático, CSP estrita e processamento local do
  conteúdo de pagamento.
- Mudanças de analytics, backend, dependência externa em runtime ou relaxamento
  de CSP exigem decisão explícita do mantenedor.

## Licença das contribuições

Ao enviar uma contribuição, você concorda que ela será disponibilizada sob a
mesma licença [MIT](LICENSE) do projeto e declara que tem o direito de submeter
esse conteúdo. Não envie código, textos, imagens ou outros materiais de terceiros
sem autorização compatível com essa licença.
