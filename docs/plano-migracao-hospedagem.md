# Plano de migração da hospedagem do pix2qr

Card PIX-19 · levantamento de 25/11/2026 · só leitura: nada foi criado nem alterado na
Vercel, na Cloudflare, no DNS ou no domínio.

## Resposta curta

- **O Cloudflare serve o pix2qr inteiro.** O site é estático e não usa função nem
  variável de ambiente da Vercel. Todo cabeçalho, redirect, URL limpa e domínio tem
  equivalente na Cloudflare. Sair 100% da Vercel é viável, e o plano B (outra conta
  Vercel) só vale se o dono preferir não mudar de plataforma.
- **Recomendação: Workers com assets estáticos**, que a Cloudflare indica hoje para
  projeto novo no lugar do Pages ([Pages](https://developers.cloudflare.com/pages/):
  «Start new projects with Workers.»). O Pages também serviria.
- **Dois cuidados mandam na ordem do corte.** O domínio está na lista de *preload* de
  HSTS dos navegadores (C12): qualquer minuto sem certificado válido derruba o site para
  todo mundo, sem volta para HTTP. E o domínio foi registrado pela Vercel (C6), então
  sair 100% inclui transferir o registro, que vence em 23/02/2027.
- **Alvo de tempo fora do ar: zero.** O DNS muda primeiro, ainda apontando para a
  Vercel; o site só troca de casa depois que o certificado da Cloudflare estiver ativo,
  e a volta é um clique enquanto a Vercel continuar no ar.

As fontes estão marcadas assim: **C1…C17** são comandos que rodei nesta máquina, listados
no [apêndice](#apêndice--comandos-de-leitura-executados), e os links levam à documentação
oficial.

---

## 1. Inventário: o que o pix2qr usa hoje na Vercel

### 1.1 Conta, projeto e build

| Item | Hoje | Fonte |
|---|---|---|
| Conta/time dono | o time atual da Vercel (plano Pro), acessado pela CLI logada do dono | C1, C5 |
| Projeto | `pix2qr`, criado em 23/02/2026 | C3 |
| Framework | nenhum (`framework: null`), site estático HTML/CSS/JS | C3, `vercel.json` |
| Instalação e build | `npm ci` e `bash scripts/build.sh`, declarados no `vercel.json` (o painel não sobrescreve: `buildCommand`/`installCommand` nulos) | `vercel.json`, C3 |
| Saída | `dist/`, montado por allowlist em `scripts/build.sh` | `vercel.json`, `scripts/build.sh` |
| Funções de servidor | nenhuma: sem pasta `api/`, sem `functions` no `vercel.json`; Cron Jobs com `definitions: []` | repositório, C3 |
| Node do build | 24.x | C3 |
| Variáveis de ambiente | **nenhuma** cadastrada no projeto | C3 |
| Variável de sistema usada | `VERCEL_GIT_COMMIT_SHA`, para versionar o cache do service worker (`scripts/build.sh:12`, `scripts/check-artifact.mjs:73`); sem ela o build cai para `git rev-parse --short HEAD` | código; [doc Vercel](https://vercel.com/docs/environment-variables/system-environment-variables) |
| Integração com GitHub | o repositório público do pix2qr, branch de produção `main`, comentários do bot em PR ligados | C3 |
| Preview por branch | todo push em branch que não é `main` gera um preview (ex.: as branches do Dependabot e dos cards PIX-17/18) | C10 |
| Proteção dos previews | Vercel Authentication em tudo, exceto nos domínios de produção (`ssoProtection: all_except_custom_domains`); 1 token de bypass de automação | C3; [Deployment Protection](https://vercel.com/docs/deployment-protection) |
| Integrações do time | algumas, de outros projetos do time; nenhuma pôs variável no pix2qr | C15, C3 |
| Firewall/WAF | nenhuma regra própria encontrada | C3 |
| Retenção de deploys | 30 dias, mantendo os 10 últimos | C3 |

### 1.2 Cabeçalhos HTTP (`vercel.json` → `headers`)

Conferidos também na resposta real de `https://pix2qr.xyz/` (C11).

| Cabeçalho | Valor | Onde vale |
|---|---|---|
| `Content-Security-Policy` | política estrita com o hash do JSON-LD; precisa ficar em paridade com o `<meta>` das quatro páginas | todas as rotas |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (HSTS fase 2) | todas as rotas |
| `X-Frame-Options` | `DENY` | todas as rotas |
| `X-Content-Type-Options` | `nosniff` | todas as rotas |
| `Referrer-Policy` | `no-referrer` | todas as rotas |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | todas as rotas |
| `X-Robots-Tag` | `noindex, nofollow` | só no host `stage.pix2qr.xyz` |
| `Cache-Control` | não declarado; a Vercel manda `public, max-age=0, must-revalidate` | padrão da plataforma (C11) |

### 1.3 URLs limpas, redirects e 404

| Regra | Hoje (status real, C11) |
|---|---|
| `/privacidade`, `/licencas`, `/qr-code-pix-para-imprimir` | rewrite para o `.html`, 200. Rewrite explícito porque o `cleanUrls` da Vercel vem `false` por padrão ([vercel.json](https://vercel.com/docs/project-configuration/vercel-json#cleanurls)) |
| `/privacidade.html` | 200 (o `.html` também responde) |
| `/qr-code-pix-para-imprimir/` | 308 para sem barra (`trailingSlash: false`) |
| `www.pix2qr.xyz/*` | 308 para `https://pix2qr.xyz/*`, regra por host |
| `/PRIVACY.md` | 308 para `/privacidade` |
| `/THIRD_PARTY.md` | 308 para `/licencas` |
| `/SECURITY.md` | 308 para o `SECURITY.md` no GitHub |
| `http://` | redireciona para `https://` (plataforma) |
| rota inexistente | 404 com os cabeçalhos de segurança |

### 1.4 Domínios, DNS e registro

| Item | Hoje | Fonte |
|---|---|---|
| `pix2qr.xyz` | produção | C4 |
| `www.pix2qr.xyz` | ligado ao projeto; o redirect para o apex vem do `vercel.json`, não do painel | C4, `vercel.json` |
| `stage.pix2qr.xyz` | ligado à branch `stage` (`gitBranch: stage`), atrás do login da Vercel (a raiz responde 302 para `vercel.com/sso-api`) | C4, C11 |
| `pix2qr.vercel.app` | domínio automático da Vercel | C4 |
| Branch `stage` | hoje aponta para o mesmo commit de `main` | C16 |
| Registro do domínio | feito pela Vercel (revendedor Name.com), criado em 23/02/2026, **vence em 23/02/2027**, renovação US$ 13 | C6, C7 |
| DNS | `ns1/ns2.vercel-dns.com` | C6, C9 |
| Registros DNS | apex e `*` como ALIAS para a Vercel; CAA para `letsencrypt.org`, `pki.goog` e `sectigo.com`; 1 TXT `google-site-verification=***` (Search Console); sem MX | C8, C9 |
| DNSSEC | desligado (sem registro DS) | C17 |
| TTL do NS no `.xyz` | ~1 dia | C17 |
| HSTS preload | `pix2qr.xyz` está **preloaded** nos navegadores | C12 |

### 1.5 Analytics, PWA e o que é exclusivo da Vercel

| Item | Hoje | Fonte |
|---|---|---|
| Umami | `umami.js` vendorizado e servido pelo próprio site, envia para `gateway.umami.is`; `data-domains` limita a contagem a `pix2qr.xyz` e aos hosts locais | `index.html`, CHANGELOG |
| Vercel Web Analytics | desligado em 14/07/2026 e retirado do HTML e da CSP; o teste `test/analytics-privacy.test.js` proíbe o script dele | C3, CHANGELOG |
| Speed Insights | registrado no projeto, sem dados e sem script no site | C3 |
| PWA | `sw.js` com precache atômico; o nome do cache leva o commit do build (`CACHE_NAME`); as três páginas de documento vão sempre à rede | `sw.js`, `scripts/build.sh` |
| Gate do precache | `scripts/check-artifact.mjs --post` confere o `CACHE_NAME` injetado com a mesma regra do build | `scripts/check-artifact.mjs:70-80` |
| `robots.txt` | `Disallow: /_vercel/` (resto da época do Web Analytics) | `robots.txt` |
| Recursos exclusivos da Vercel em uso | só três: a variável `VERCEL_GIT_COMMIT_SHA`, o formato `vercel.json` e o login da Vercel no stage e nos previews. O resto é HTTP comum | todo o inventário acima |

### 1.6 O que no repositório depende do `vercel.json`

Uma migração precisa trocar a «fonte canônica» destes pontos:

- `scripts/check-artifact.mjs:60-66`: lê a CSP do `vercel.json` para conferir o hash do JSON-LD.
- `test/pages.test.js:21`: exige um rewrite no `vercel.json` para cada URL limpa.
- `test/analytics-privacy.test.js:45-76`: lê o `vercel.json` (CSP e `X-Robots-Tag` do stage).
- `test/e2e-helpers.mjs:78` e `test/pwa-e2e.mjs:160`: o servidor dos E2E imita os rewrites da Vercel.
- `.github/workflows/guardrails.yml:86`: a exigência de CHANGELOG cita `vercel.json`.
- Comentários em `index.html`, `privacidade.html`, `licencas.html`, `qr-code-pix-para-imprimir.html`, `sw.js`, `README.md`, `SECURITY.md` e `llms.txt` («Hospedado em Vercel»).

---

## 2. Viabilidade no Cloudflare

### 2.1 Pages ou Workers

A Cloudflare recomenda **Workers** para projeto novo: a página do Pages diz «Start new projects
with Workers.» e chama o Workers de «Cloudflare's primary platform for building applications»
([Pages](https://developers.cloudflare.com/pages/),
[migração Pages → Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)).
Para o pix2qr, o Workers também tem três vantagens concretas:

1. **404 de verdade por padrão.** No Pages, sem `404.html`, uma rota inexistente recebe a home
   («Pages' default single-page application behavior serves the root»,
   [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)), o que
   viraria soft 404 para o Google. No Workers, sem script, a resposta é `404 Not Found`
   ([Static Assets](https://developers.cloudflare.com/workers/static-assets/)).
2. **Requisição de asset estático é grátis e sem limite** («Requests to static assets are free and
   unlimited», [preços do Workers](https://developers.cloudflare.com/workers/platform/pricing/)).
3. **Stage como ambiente separado** no mesmo arquivo de configuração
   ([Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)).

O Pages continua uma opção aceitável. Se o dono preferir o Pages, a tabela abaixo vale igual, com duas
diferenças: ele precisa de um `404.html` e o stage é feito com alias de branch
([custom branch aliases](https://developers.cloudflare.com/pages/how-to/custom-branch-aliases/)).

### 2.2 Como cada item se traduz (Workers com assets estáticos)

| Hoje na Vercel | No Cloudflare | Fonte |
|---|---|---|
| `buildCommand` / `installCommand` | Workers Builds ligado ao GitHub, com build `npm ci && bash scripts/build.sh` e deploy `npx wrangler deploy` | [Builds config](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) |
| `outputDirectory: dist` | `assets.directory = "./dist"` no `wrangler.jsonc`, sem script de Worker | [Static Assets](https://developers.cloudflare.com/workers/static-assets/) |
| `VERCEL_GIT_COMMIT_SHA` | `WORKERS_CI_COMMIT_SHA` (Pages: `CF_PAGES_COMMIT_SHA`). **Mudança de código**: `build.sh` e `check-artifact.mjs` passam a aceitar as duas; sem isso, o fallback `git rev-parse` ainda funciona | [Builds config](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Pages build config](https://developers.cloudflare.com/pages/configuration/build-configuration/) |
| `headers` do `vercel.json` | arquivo `_headers` em `dist/` (até 100 regras) | [Headers](https://developers.cloudflare.com/workers/static-assets/headers/) |
| `X-Robots-Tag` só no stage | regra com URL absoluta `https://stage.pix2qr.xyz/*` no `_headers` | [Headers](https://developers.cloudflare.com/workers/static-assets/headers/) |
| HSTS 2 anos + preload | **no `_headers`**, mantendo `max-age=63072000`. O HSTS do painel da Cloudflare vai só até 12 meses, então não serve para manter o valor atual | [HSTS na Cloudflare](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/) |
| `Cache-Control` padrão | a Cloudflare manda o mesmo `public, max-age=0, must-revalidate` por padrão | [Headers](https://developers.cloudflare.com/workers/static-assets/headers/) |
| rewrites das URLs limpas | **não precisa de regra**: com `html_handling` padrão (`auto-trailing-slash`), `/privacidade` serve `privacidade.html` com 200 | [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) |
| `/privacidade.html` (hoje 200) | vira 307 para `/privacidade`. Melhora o SEO: some a URL duplicada | [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) |
| `/pagina/` → `/pagina` (hoje 308) | 307 para sem barra. Muda de permanente para temporário; as URLs publicadas já não têm barra, então o efeito em SEO é pequeno | [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) |
| `/PRIVACY.md`, `/THIRD_PARTY.md`, `/SECURITY.md` | três linhas no `_redirects` com status 301 ou 308 (destino externo é aceito) | [Redirects](https://developers.cloudflare.com/workers/static-assets/redirects/) |
| `www` → apex (regra por host) | **não dá no `_redirects`** («Domain-level redirects» ❌). Fica numa Single Redirect da zona (o plano Free tem 10), seguindo o exemplo oficial «Redirect from WWW to root», que preserva caminho e query | [Redirects](https://developers.cloudflare.com/workers/static-assets/redirects/), [www → root](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/), [Single Redirects](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/) |
| `http` → `https` | configuração «Always Use HTTPS» da zona; o preload de HSTS já força HTTPS nos navegadores (C12) | C12 |
| 404 | padrão do Workers sem script: 404 | [Static Assets](https://developers.cloudflare.com/workers/static-assets/) |
| domínio `pix2qr.xyz` | Custom Domain do Worker: a Cloudflare cria o DNS e o certificado. **Exige a zona na Cloudflare** | [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) |
| `stage.pix2qr.xyz` com a branch `stage` | segundo Worker (`pix2qr-stage`, via `env.stage`) ligado ao mesmo repositório, com branch de produção `stage` e Custom Domain próprio | [Environments](https://developers.cloudflare.com/workers/wrangler/environments/), [Builds avançado](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/) |
| login da Vercel no stage | Cloudflare Access na frente de `stage.pix2qr.xyz` (Zero Trust tem plano grátis; o limite de usuários não está na página oficial lida), ou só o `noindex` | [Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/) |
| preview por PR | Workers Builds faz build de toda branch que não é a de produção e publica uma URL de preview `<nome>-pix2qr.<subdomínio>.workers.dev`; **é pública por padrão**, e o Access pode protegê-la | [Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [Previews](https://developers.cloudflare.com/workers/previews/) |
| comentário do bot no PR | o Workers Builds publica o status no GitHub; o comentário com link igual ao da Vercel não foi confirmado na doc lida | não verificado |
| Umami | não muda: o script é do próprio site e envia para `gateway.umami.is` | `index.html` |
| TXT do Search Console | copiar para a zona da Cloudflare antes de trocar o DNS; sem ele, a verificação do Google cai | C8 |
| CAA | com Universal SSL, a Cloudflare acrescenta sozinha os CAA das autoridades que usa (Let's Encrypt, Google Trust Services, SSL.com) | [CAA](https://developers.cloudflare.com/ssl/edge-certificates/caa-records/), [CAs](https://developers.cloudflare.com/ssl/reference/certificate-authorities/) |

### 2.3 O que não dá, ou dá de outro jeito

- **Redirect por host no arquivo**: não existe; vira regra da zona (acima).
- **Login no stage idêntico ao da Vercel**: não existe; o equivalente é o Cloudflare Access.
- **Domínio sem a zona na Cloudflare**: o Workers não aceita domínio cujo DNS não esteja na
  Cloudflare («Workers does not support any domain whose nameservers are not managed by
  Cloudflare», [migração](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)).
  O Pages aceita subdomínio por CNAME externo, mas o apex também exige os nameservers da
  Cloudflare ([Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)).
  Na prática, **o DNS do pix2qr.xyz precisa ir para a Cloudflare** nos dois casos.

### 2.4 Armadilhas da Cloudflare que quebram o pix2qr se ficarem ligadas

- **Email Address Obfuscation vem ligada** («Cloudflare enables email address obfuscation
  automatically when you sign up»). Ela reescreve no HTML todo texto com cara de e-mail e injeta
  o script `email-decode.min.js`
  ([Email Address Obfuscation](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/)).
  O endereço Lightning de doação em `index.html:552` tem cara de e-mail e é copiado pelo botão
  «Copiar». A obfuscação também mudaria o HTML que os gates provam byte a byte. **Desligar na
  zona antes do corte.**
- **Rocket Loader** reescreve o carregamento dos scripts
  ([Rocket Loader](https://developers.cloudflare.com/speed/optimization/content/rocket-loader/)).
  Confirmar que está desligado.
- **Web Analytics automático** da Cloudflare injetaria um script de terceiro que a CSP barra e que
  as regras de privacidade do projeto não preveem. Deixar desligado; o Umami continua sendo a
  telemetria.

### 2.5 Acesso à Cloudflare nesta máquina

`wrangler whoami` (C13) mostra a conta Cloudflare do dono, logada por OAuth, com permissão de
escrita em Workers e Pages e só leitura de zona. A conta já hospeda outros projetos do dono, no
plano Free. **Ainda não existe zona `pix2qr.xyz`, nem Worker ou Pages do pix2qr** (C14). Criar a zona exige permissão que o token do wrangler não tem: isso é feito no painel.

---

## 3. Plano B: levar o projeto para outra conta Vercel

Fonte desta seção: [Transferring projects](https://vercel.com/docs/projects/transferring-projects),
salvo onde houver outro link.

**Vai junto:** deploys, variáveis de ambiente (o pix2qr não tem nenhuma), configuração do
projeto, domínios e aliases, ligação com o Git, configurações de segurança, Cron Jobs,
comentários de preview, Web Analytics, Speed Insights e região.

**Não vai:** integrações (precisa refazer), uso acumulado (zera), dados de monitoramento, logs de
build e de execução, Log Drains, Global Config e Blob. O pix2qr não usa Global Config, Blob nem
Log Drains.

**Domínio:** o apex registrado (`pix2qr.xyz`) vai com o projeto; subdomínios ficam «delegados».
O domínio também pode ser movido sozinho entre times (`vercel domains move pix2qr.xyz <time>`),
com os registros DNS preservados
([transfer your domain](https://vercel.com/docs/domains/working-with-domains/transfer-your-domain)).

**Quem faz e o que precisa:** quem inicia é dono do time de origem e membro do time de destino. O
destino precisa de um cartão cadastrado. Segundo a doc, a transferência leva de 10 s a 10 min,
sem tempo fora do ar; durante ela não dá para fazer deploy nem mudar configuração.

**Plano exigido:**
- **Hobby (grátis)** só aceita uso «personal or non-commercial» ([Termos, seção 4](https://vercel.com/legal/terms)).
  O pix2qr é grátis, mas mostra o banner da Salaria com `ref=PIX2QR` e pede doação, o que pode
  ser lido como uso comercial. A senha de preview também não existe no Hobby
  ([Deployment Protection](https://vercel.com/docs/deployment-protection)).
- **Pro:** US$ 20/mês, com 1 assento e US$ 20 de crédito de uso
  ([Pro](https://vercel.com/docs/plans/pro-plan)).

**Passos:**
1. Criar ou escolher o time de destino, cadastrar o cartão e adicionar como membro o dono do
   time atual.
2. No projeto `pix2qr`: Settings → Transfer → escolher o destino.
3. No destino: conferir domínios (apex, `www`, `stage` com a branch `stage`), a ligação com o
   GitHub (o app da Vercel precisa ter acesso ao repositório nesse time), a proteção de preview e
   o token de bypass, que é refeito do zero.
4. Mover o domínio registrado, se não tiver ido junto.
5. Testar com `curl -I` os cabeçalhos e redirects da seção 1.3.

O plano B não resolve o vencimento do domínio nem tira a dependência da Vercel. Ele só faz
sentido se o problema for **a conta atual**, não a plataforma.

---

## 4. Plano recomendado: Workers com assets estáticos, sem tempo fora do ar

A ordem existe por causa do HSTS preload (C12). O navegador não aceita nem HTTP nem certificado
inválido para `pix2qr.xyz`, então **nenhum registro passa a apontar para a Cloudflare antes de o
certificado dela estar ativo**. A Cloudflare dá essa mesma orientação: «Keep DNS records unproxied
until your certificate is active»
([Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/enable-universal-ssl/)).

### Fase 0: decisões e preparo (sem tocar em produção)

1. O dono responde às perguntas da seção 5.
2. Card de código (branch + PR, como sempre):
   - `wrangler.jsonc` com `assets.directory = "./dist"`, `html_handling` padrão, sem script, e
     `env.stage`;
   - `_headers` (os 6 cabeçalhos + `X-Robots-Tag` do stage) e `_redirects` (os 3 `.md`), na
     allowlist do `build.sh`;
   - `build.sh` e `check-artifact.mjs` aceitando `WORKERS_CI_COMMIT_SHA` além de
     `VERCEL_GIT_COMMIT_SHA`;
   - gates e testes lendo a CSP e o `X-Robots-Tag` do `_headers` **e** do `vercel.json`
     enquanto os dois existirem, para nenhum divergir no período de transição;
   - o `vercel.json` **fica**: a Vercel continua sendo a produção até o corte.
3. Criar o Worker `pix2qr` (e `pix2qr-stage`) ligado ao GitHub, **sem domínio próprio**. O site
   fica no ar só em `pix2qr.<subdomínio>.workers.dev`.

### Fase 1: testar sem mexer no DNS

Contra a URL `workers.dev`:
- `curl -I` em `/`, `/privacidade`, `/licencas`, `/qr-code-pix-para-imprimir`, `/privacidade.html`,
  `/qr-code-pix-para-imprimir/`, `/PRIVACY.md`, `/THIRD_PARTY.md`, `/SECURITY.md`, `/sw.js`,
  `/nao-existe`: os cabeçalhos da seção 1.2 e os status esperados da tabela 2.2;
- o HTML servido igual, byte a byte, ao `dist/index.html` do mesmo commit (prova que nada
  injetou script nem reescreveu o endereço Lightning);
- os quatro E2E apontados para a URL `workers.dev`, se o card de código der essa opção, ou ao
  menos a home, a placa e o fluxo PWA (instalar, ficar offline, voltar online) no navegador.

### Fase 2: DNS para a Cloudflare, ainda apontando para a Vercel

1. No painel da Cloudflare: adicionar a zona `pix2qr.xyz` (Free). Antes de qualquer outra
   coisa: **desligar** Email Address Obfuscation e Rocket Loader, e ligar «Always Use HTTPS».
2. Recriar os registros como **DNS only (nuvem cinza)**, com os valores de hoje: apex e `www` e
   `stage` para os endereços da Vercel (conferir com `dig` na hora; em 25/11 o apex respondia
   `216.150.1.65` e `216.150.1.193`, C9), o TXT do Search Console e o CAA. A varredura automática
   «is not guaranteed to find all existing DNS records», então conferir um por um
   ([full setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)).
3. DNSSEC está desligado (C17), então não há DS para remover antes.
4. Na Vercel, trocar os nameservers do domínio para os dois da Cloudflare. A Vercel permite isso
   mantendo o registro com ela
   ([managing nameservers](https://vercel.com/docs/domains/managing-nameservers)).
5. Esperar a zona ficar Active (até 24 h) e o Universal SSL ativo (15 min a 24 h depois da
   ativação). Durante tudo isso, **o tráfego ainda vai direto para a Vercel**, com o certificado
   da Vercel: o site não percebe.

### Fase 3: virar o stage, depois a produção

1. **Stage primeiro:** apagar o registro de `stage` e adicionar `stage.pix2qr.xyz` como Custom
   Domain do Worker `pix2qr-stage` (a Cloudflare cria o registro e emite um Advanced Certificate;
   não dá para criar Custom Domain onde já existe CNAME,
   [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).
   Se usar Access, configurar antes. Repetir os testes da fase 1 em `https://stage.pix2qr.xyz`.
2. **Produção:** em horário de pouco uso, apagar o registro do apex e adicionar `pix2qr.xyz` como
   Custom Domain do Worker `pix2qr`. Logo depois, `www` com nuvem laranja e a Single Redirect
   `www` → apex.
3. Repetir os testes em `https://pix2qr.xyz` e `https://www.pix2qr.xyz`.
4. **Tempo fora do ar esperado: zero.** O risco que sobra é o intervalo entre apagar o registro
   e o Custom Domain responder com certificado. Ele é ensaiado antes no stage, com a mesma
   mecânica.

### Fase 4: depois de estável (uma a duas semanas)

1. Na Vercel: tirar os domínios do projeto e desligar os deploys automáticos. O projeto fica
   parado para rollback, e só é apagado depois do registro transferido.
2. Transferir o **registro** do domínio para a Cloudflare Registrar: o `.xyz` é aceito
   ([TLD policies](https://www.cloudflare.com/tld-policies/)), a zona já precisa estar ativa, o
   domínio tem mais de 60 dias e o preço é o de custo, sem margem. O auth code sai do menu do
   domínio na Vercel, que só o dono do time vê. A transferência soma um ano à data de vencimento
   e pode levar até uma semana
   ([transferir para a Cloudflare](https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/),
   [transfer out da Vercel](https://vercel.com/docs/domains/working-with-domains/transfer-your-domain)).
   **Fazer bem antes de 23/02/2027**, para não pagar a renovação na Vercel.
3. Card de limpeza: tirar o `vercel.json`, a leitura dele nos gates e testes, o `Disallow:
   /_vercel/` do `robots.txt` e as menções à Vercel nos comentários, no README, no SECURITY.md e
   no `llms.txt`. A exigência de CHANGELOG da CI passa a citar `_headers`, `_redirects` e
   `wrangler.jsonc`.

### Rollback

| Momento | Como voltar | Tempo |
|---|---|---|
| Fases 0–1 | nada a desfazer: a produção não mudou | — |
| Fase 2 | na Vercel, devolver os nameservers `ns1/ns2.vercel-dns.com`. Os registros na Cloudflare já apontam para a Vercel, então nada quebra enquanto o DNS propaga | até ~1 dia de propagação, sem queda |
| Fase 3 | remover o Custom Domain do Worker e recriar o registro DNS only para os IPs da Vercel; o projeto da Vercel continua com o domínio e o certificado | minutos (TTL do registro) |
| Fase 4 | o projeto da Vercel parado pode receber o domínio de volta enquanto não for apagado | minutos |

**Regra:** a Vercel só é desligada depois que a Cloudflare tiver servido a produção sem
incidente por uma semana.

### Cuidados de SEO

- **Canonical e sitemap**: já usam `https://pix2qr.xyz/...` sem `.html` e sem barra; não mudam.
- **URL `.html`**: hoje responde 200 e passa a redirecionar para a URL limpa; a canônica já
  indicava a limpa.
- **Redirects permanentes**: `www` e os `.md` continuam permanentes (301/308). Só a barra final
  passa de 308 para 307.
- **404 continua 404**: por isso o Workers, e não o Pages sem `404.html`.
- **Search Console**: o TXT de verificação vai junto para a zona nova.
- **HSTS**: o mesmo cabeçalho de 2 anos com preload, pelo `_headers`. Nunca deixar um registro
  sem HTTPS: «Preload can make a website without HTTPS completely inaccessible»
  ([HSTS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/)).
- **`noindex` no stage** continua, agora no `_headers`.

### Custo

| Opção | Hospedagem | Domínio | Fonte |
|---|---|---|---|
| Cloudflare Workers (recomendado) | US$ 0: plano Free, assets estáticos grátis e sem limite, 3.000 min de build/mês | preço de custo do `.xyz` na Cloudflare (valor a conferir no painel na hora) | [preços Workers](https://developers.cloudflare.com/workers/platform/pricing/), [limites do Builds](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [Registrar](https://developers.cloudflare.com/registrar/about/) |
| Cloudflare Pages | US$ 0: 500 builds/mês, 20.000 arquivos | igual | [limites do Pages](https://developers.cloudflare.com/pages/platform/limits/) |
| Outra conta Vercel Hobby | US$ 0, só para uso não comercial | US$ 13/ano na Vercel | [Termos](https://vercel.com/legal/terms), C6 |
| Outra conta Vercel Pro | US$ 20/mês | US$ 13/ano na Vercel | [Pro](https://vercel.com/docs/plans/pro-plan), C6 |

---

## 5. Perguntas que só o dono responde

1. **Por que sair da conta atual, e com que urgência?** A resposta decide entre Cloudflare e
   plano B, e se a fase 2 pode esperar. Há um detalhe da conta registrado no card PIX-19, fora
   deste arquivo público.
2. **O DNS do pix2qr.xyz pode ir para a Cloudflare?** É obrigatório para o apex, tanto no Workers
   quanto no Pages.
3. **Workers (recomendado) ou Pages?**
4. **O stage precisa de login**, com o Cloudflare Access e o e-mail de quem entra, ou basta o
   `noindex`? E os previews de PR podem ser públicos?
5. **O registro do domínio vai para a Cloudflare Registrar** antes de 23/02/2027?
6. **No plano B: qual conta ou time de destino, e em que plano?** No Hobby, vale considerar o
   banner da Salaria e o pedido de doação diante da regra de uso não comercial.

---

## Apêndice: comandos de leitura executados

Todos rodaram em 25/11/2026 nesta máquina, só leitura. Valores sensíveis aparecem mascarados
(`***`).

| Id | Comando | Saída relevante |
|---|---|---|
| C1 | `vercel whoami`; `vercel teams ls` | o usuário do dono; o time atual da Vercel |
| C2 | `vercel project ls --scope <time atual>` | `pix2qr` → `https://pix2qr.xyz`, Node 24.x |
| C3 | `vercel api /v9/projects/pix2qr` | `framework: null`, build/install/output nulos (vêm do `vercel.json`), `link.productionBranch: main`, `ssoProtection.deploymentType: all_except_custom_domains`, `webAnalytics.disabledAt` 2026-07-14, `speedInsights.hasData: false`, `crons.definitions: []`, `env: []`, `gitComments.onPullRequest: true`, `deploymentExpiration` 30 dias/10 deploys |
| C4 | `vercel api /v9/projects/pix2qr/domains` | `stage.pix2qr.xyz` (`gitBranch: stage`), `pix2qr.xyz`, `www.pix2qr.xyz`, `pix2qr.vercel.app`; nenhum com redirect no painel |
| C5 | `vercel api /v2/teams/<time>` | plano `pro` |
| C6 | `vercel domains inspect pix2qr.xyz` | Registrar Vercel; Expiration 23 February 2027; Renewal Price $13 USD; nameservers `ns1/ns2.vercel-dns.com` |
| C7 | `whois pix2qr.xyz` | Registrar Name.com, Inc.; Creation Date 2026-02-23 |
| C8 | `vercel dns ls pix2qr.xyz` | TXT `google-site-verification=***`; CAA pki.goog, sectigo.com, letsencrypt.org; ALIAS apex e `*` para a Vercel |
| C9 | `dig +short {NS,A,CAA,MX,TXT} pix2qr.xyz` | A `216.150.1.65`, `216.150.1.193`; sem MX |
| C10 | `vercel api /v6/deployments?projectId=…` | produção a cada merge em `main` (último: `1795b79`, 23/10); previews das branches dos cards e do Dependabot |
| C11 | `curl -sS -o /dev/null -D - <url>` | `/` 200 com os 6 cabeçalhos; `www` 308 → apex; `/PRIVACY.md` 308 → `/privacidade`; `/SECURITY.md` 308 → GitHub; `/qr-code-pix-para-imprimir/` 308 → sem barra; `/privacidade.html` 200; `/nao-existe` 404; `stage` 302 → `vercel.com/sso-api`; `http://` → `https://` |
| C12 | `curl https://hstspreload.org/api/v2/status?domain=pix2qr.xyz` | `"status": "preloaded"` |
| C13 | `wrangler whoami` | logado por OAuth na conta Cloudflare do dono; escopos `workers (write)`, `pages (write)`, `zone (read)` |
| C14 | `wrangler pages project list`; API `GET /zones` e `GET /accounts/<id>/workers/scripts` | projetos, zonas e Workers de outros projetos do dono; nada do pix2qr |
| C15 | `vercel api /v1/integrations/configurations?view=account` | integrações de outros projetos do time; nenhuma variável no pix2qr (C3) |
| C16 | `git ls-remote origin stage main` | as duas em `1795b791c634` |
| C17 | `dig +short DS pix2qr.xyz`; `dig NS pix2qr.xyz` | sem DS (DNSSEC desligado); TTL do NS ≈ 86.000 s |
