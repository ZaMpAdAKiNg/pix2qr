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

Produção (`pix2qr.xyz`) e stage (`stage.pix2qr.xyz`) são servidos pela
Cloudflare, em Workers com assets estáticos: `wrangler.jsonc`, `_headers` e
`_redirects`. O stage pede login do Cloudflare Access. O `vercel.json` continua
no repositório enquanto o projeto antigo existe como rollback; até ele sair,
cabeçalhos e redirects mudam nos dois arquivos juntos, e
`test/hosting-config.test.js` e o gate `--post` falham se divergirem. Nenhum id
de conta entra no repositório.

### Publicação só pelo Git

Produção e stage são publicados **só pelo Git**, pelo Workers Builds da
Cloudflare:

| Branch | Worker | Build | Deploy |
| --- | --- | --- | --- |
| `main` | `pix2qr` | `npm ci && bash scripts/build.sh` | `npx wrangler deploy` |
| `stage` | `pix2qr-stage` | `npm ci && bash scripts/build.sh` | `npx wrangler deploy --env stage` |

- O merge de um PR em `main` é a publicação em produção.
- O `wrangler` fica em `devDependencies` com versão exata e entra pelo
  `package-lock.json`. Como o `npm ci` roda antes, o `npx wrangler` do deploy
  usa essa versão e não baixa a última. O Dependabot propõe a atualização toda
  semana, junto das outras dependências npm.
- O workflow `deploy-check` roda a cada push em `main`. Ele espera até 15 min
  até `https://pix2qr.xyz/sw.js` trazer `pix2qr-pwa-<sha7>` do commit. Se o
  build falhar ou não publicar, o workflow falha, e o GitHub manda o e-mail de
  falha. O stage fica de fora porque pede login.

### Atualizar o stage

O branch `stage` é protegido no GitHub: não aceita force push nem pode ser
apagado. Ele só anda por fast-forward a partir de `main`:

```bash
git fetch origin
git push origin origin/main:stage
```

Se o push for recusado, o `stage` tem commit que não está em `main`. Não force:
leve esse commit para `main` por PR primeiro.

### Emergência: publicar desta máquina

Use só quando o Workers Builds estiver fora do ar e a produção precisar de
correção, sempre a partir de um commit que já está em `main`, depois dos gates
locais e com login no `wrangler`:

```bash
npm ci
bash scripts/build.sh
npx wrangler deploy             # produção (pix2qr)
npx wrangler deploy --env stage # stage (pix2qr-stage)
```

Para voltar à versão anterior, use `npx wrangler rollback`, ou
`npx wrangler rollback --env stage` para o stage. O mesmo vale pelo painel da
Cloudflare: Workers › o Worker › Implantações. O rollback só troca a versão
servida; o próximo merge em `main` publica de novo pelo Git.

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
