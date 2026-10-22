# Changelog

Todas as mudanças relevantes do **pix2qr** — gerador de QR Code PIX com conteúdo
de pagamento processado localmente e sem cadastro.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O projeto é entregue por deploy contínuo (sem versionamento semver), então as
entradas são agrupadas por data.

## [Não lançado]

- [PIX-12] Estado de erro do campo PIX com ícone CircleAlert, `aria-invalid` e `aria-describedby` ligando o campo a `#error-msg`, borda e anel `--color-erro`; tudo limpa ao corrigir a chave. Coberto no E2E adversarial.

- Adiciona link para converter USDT em PIX com a Salaria.tech no topo das quatro páginas, com faixa responsiva e foco acessível.

- Unifica Placa, Privacidade e Licenças com o visual da home, compartilhando CSS e preservando a impressão clara e a exportação PNG.

- [PIX-7] Home com tokens verde-grafite/brasa, títulos Outfit 900, Plex Mono local e ícones Lucide. Campos e ações acessíveis, foco visível, layout responsivo e manifest atualizado; conteúdo, hooks e QR preservados.

### Fixed
- [PIX-11] **Placa imprimível alcançável com o Service Worker ativo**:
  `/qr-code-pix-para-imprimir` entrou em `DOCUMENT_PAGES` de `sw.js`. Antes,
  qualquer navegação para a placa depois de uma visita à home era respondida
  pelo `/index.html` do cache e o usuário via o gerador na URL da placa, online
  e offline. Agora a navegação vai à rede (rewrite da plataforma) e, offline,
  resulta em erro de rede explícito, nunca na home. Coberto em `test/sw.test.js`
  e no `test/pwa-e2e.mjs` (navegação online com SW controlando e offline).

### Added
- **Ambiente de stage em `stage.pix2qr.xyz`** (branch `stage`): `vercel.json`
  envia `X-Robots-Tag: noindex, nofollow` só nesse host, e o Umami das quatro
  páginas ganhou `data-domains="pix2qr.xyz,localhost,127.0.0.1"` — stage e
  previews não contam no painel; os hosts locais ficam para os E2E provarem o
  envio. Coberto por `test/analytics-privacy.test.js`.
- **Página `/qr-code-pix-para-imprimir`**: nova ferramenta de placa PIX
  imprimível — preview em A4, A5 ou 10×15 cm desenhado em canvas local com o
  mesmo core de payload da home, impressão isolada por `@media print` e
  download em PNG. Fiação completa: rewrite na plataforma, sitemap, allowlist
  de build/artefato, link interno da home e testes (estáticos + fluxo E2E de
  geração, decodificação do preview e download). Telemetria da página segue o
  contrato de privacidade: eventos `tool-start`/`placa-preview`/`print-action`/
  `plate-downloaded` carregam apenas modo/preset enumerado.
- **Autoria e metodologia visíveis na home**: a seção de aviso agora cita o
  Manual de Padrões para Iniciação do Pix (BR Code) do Banco Central e a
  especificação EMV® QRCPS como fontes da geração/validação, com link para o
  código aberto; o rodapé declara o mantenedor e o JSON-LD ganhou `author`.
  Invariantes cobertos por teste (`test/seo-eeat.test.js`).
- **Evento `tool-start` no funil de uso**: a primeira interação com a
  ferramenta em cada carga de página (digitar chave ou abrir o scanner) emite
  um evento único com apenas o modo enumerado (`type`/`scan`) — nunca conteúdo
  PIX. Permite medir taxa de início sem novos dados coletados; provado no E2E
  de privacidade.

### Security
- **umami.js vendorizado atualizado para o snapshot cloud 2026-10-22**: o ativo
  local foi realinhado ao upstream `cloud.umami.is/script.js` (issue #14); o
  novo sha256 está registrado em `third-party.lock.json` e `THIRD_PARTY.md`.
  Diff revisado: endpoint inalterado (`gateway.umami.is/api/send`), sem novos
  domínios, sem `eval`/`Function`, sem expansão de storage/cookies/
  fingerprinting; `data-before-send` e a exclusão de query/hash seguem
  respeitados. Únicas mudanças semânticas: novo atributo opt-in
  `data-distinct-id` (não usado pelo pix2qr, logo sem efeito) e guarda
  defensiva no handler de clique. CSPs intocadas.
- **Precache atômico não depende mais de roteamento da plataforma**:
  `/privacidade` e `/licencas` saíram do `APP_SHELL`. A instalação do Service
  Worker é um `Promise.all` que aborta inteira em qualquer resposta não-200, e
  essas URLs só resolvem via rewrite — um erro de configuração na plataforma
  derrubaria o offline de *todos* os usuários. Agora o pior caso de um rewrite
  ausente é 404 nas duas páginas: visível e reversível, sem brick de offline.
- **Minificador falha fechado em comentários HTML truncados**: remoção por
  scanner determinístico evita marcadores residuais em sequências aninhadas e
  aborta o build quando um comentário não tem fechamento.
- **Gramática DICT 2.12.0 e CNPJ alfanumérico**: CPF, CNPJ, PHONE, EMAIL e EVP
  seguem as expressões atuais do BCB; e-mail Unicode deixa de ser aceito, PHONE
  usa E.164, EVP aceita UUID hexadecimal de qualquer versão e CNPJ alfanumérico
  usa o cálculo de DV oficial da Receita Federal.
- **Telemetria sem parâmetros de usuário**: Umami exclui query/hash e usa
  `data-before-send`, reduzindo URL/referrer a origem + caminho, respeita DNT e
  tem E2E de rede com probes sintéticos em URL, referência e formulário.
- **Imagem limitada antes do decode**: PNG/JPEG/GIF/WebP têm cabeçalho e
  dimensões lidos em até 1 MiB antes de criar `Image`; arquivos acima de 25 MP
  ou sem formato reconhecido são rejeitados antes da decodificação integral.
- **Parser PIX agora falha fechado**: TLVs precisam ser consumidos por inteiro,
  ordenados e sem IDs duplicados; GUI, moeda, país, campos obrigatórios, modo
  estático/dinâmico, chave, montante, txid e controles invisíveis são validados
  antes de qualquer resumo ou re-renderização.
- **Fixtures públicas integralmente sintéticas**: payloads e identificadores
  originados de casos de campo foram removidos e substituídos por dados
  reservados/gerados nos testes.
- **Artefato de deploy por allowlist**: a Vercel passa a servir somente `dist/`;
  testes, workflows, scripts e tooling local não entram mais no site.
- **Actions imutáveis e permissões mínimas**: actions oficiais fixadas por SHA,
  token padrão explicitamente read-only, credenciais não persistidas nos jobs de
  PR e timeouts adicionados.
- **HSTS fase 2 — `max-age` de 2 anos + `preload`**: `vercel.json` passa a
  enviar `Strict-Transport-Security: max-age=63072000; includeSubDomains;
  preload`, elevando o TTL de 1 para 2 anos e sinalizando o domínio para a
  lista de preload dos navegadores (HTTPS obrigatório no domínio e subdomínios).
- **umami.js vendorizado atualizado para o snapshot cloud 2026-08-08**: o ativo
  local foi realinhado ao upstream `cloud.umami.is/script.js`; o novo sha256
  está registrado em `third-party.lock.json` e `THIRD_PARTY.md`. Endpoint
  inalterado (`gateway.umami.is/api/send`), sem novos domínios, sem
  `eval`/`Function` e sem expansão de storage/cookies/fingerprinting.
- **Dependências de build atualizadas**: `esbuild` 0.25.5 → 0.28.2 e
  `playwright-core` 1.53.0 → 1.62.1 (devDeps), reduzindo a superfície de
  vulnerabilidades conhecidas do tooling.

### Added
- **Dependabot habilitado para npm e GitHub Actions**: `.github/dependabot.yml`
  passa a abrir PRs automáticos de atualização para os dois ecossistemas,
  mantendo dependências e actions oficiais em dia sem intervenção manual.

### Fixed
- **Privacidade e Licenças abrem em qualquer forma do endereço**: as páginas já
  eram servidas corretamente em `/privacidade` e `/licencas`, mas variações do
  mesmo endereço — com barra no final ou terminando em `.html` — ainda caíam no
  gerador de QR para quem tinha o app instalado. Agora todas as formas abrem a
  página pedida.
- **Páginas de documento deixam de servir o gerador de QR**: o Service Worker
  mapeava *toda* navegação para `/index.html`, então quem tinha o app instalado
  (ou já havia visitado o site) clicava em "Privacidade" no rodapé e recebia o
  gerador renderizado na URL `/privacidade`. Agora a navegação para
  `/privacidade` e `/licencas` não é interceptada pelo SW: vai à rede e serve a
  própria página. Qualquer outra navegação continua caindo no app shell.
- **URLs limpas passam a ser declaradas, não presumidas**: `vercel.json` ganhou
  `rewrites` de `/privacidade` e `/licencas` para os respectivos `.html`. O
  `cleanUrls` da Vercel tem default `false` e o projeto não o declarava — as
  URLs publicadas em canonical, sitemap e rodapé responderiam 404 em produção.
  Um teste passa a exigir rewrite para toda URL limpa publicada.
- **Botão "Instalar app" respeita o atributo `[hidden]`**: a regra autoral
  `.btn { display: inline-flex }` vencia em especificidade a UA stylesheet
  (`[hidden] { display: none }`), mantendo o botão visível quando a PWA não
  estava disponível para instalação. Corrigido com `.btn[hidden] { display: none }`
  seguindo o mesmo idioma do `.status-chip[hidden]` já presente.
- **Primeira aba da PWA acompanha updates futuros**: o `clients.claim()` da
  instalação inicial continua sem recarregar, mas deixa a aba armada para que a
  próxima versão atômica faça exatamente um reload e não mantenha JS antigo.
- **QRs densos preservam módulos inteiros**: o canvas cresce de acordo com a
  versão do QR, mantendo pelo menos 4 pixels por módulo; PNG e clipboard usam
  quiet zone exata de 4 módulos sem deformar payloads no limite de 1024 bytes.
- **Valor adicional não atravessa leituras**: trocar/scanear um Copia-e-Cola
  limpa o valor pendente antes da geração, evitando reaproveitar montante entre
  destinatários.
- **Adicionar valor preserva o payload importado**: a nova mutação insere apenas
  o campo 54 e recalcula o CRC, mantendo todos os TLVs originais byte a byte.
- **CPF/telefone sem coerção**: onze dígitos puros são CPF; telefone canônico
  exige `+` e E.164. Formas brasileiras explicitamente pontuadas continuam
  normalizadas, e lixo em torno de chaves é rejeitado.
- **Valores ambíguos são rejeitados**: agrupamentos quebrados, espaços internos,
  notação científica (inclusive o limiar numérico de `toFixed`) e valor inválido
  não viram outro número nem QR aberto, mesmo após o campo perder foco.
- **Workflow de frescor do Umami volta a ser YAML válido**: o corpo multilinha da
  issue é montado dentro do bloco shell corretamente.

### Changed
- **Privacidade e Licenças viram páginas de verdade**: `/privacidade` e
  `/licencas` substituem o markdown cru que `/PRIVACY.md` e `/THIRD_PARTY.md`
  serviam em produção — HTML com o mesmo shell do app (header, rodapé, CSS
  inline, `lang="pt-BR"`), cada uma com title, description e canonical próprios.
  O texto dos documentos foi preservado; só a apresentação mudou. As URLs
  antigas passam a redirecionar (308) para as novas, e o rodapé aponta direto
  para elas. Nenhum script inline ou JSON-LD novo: a CSP segue intocada.
- **Nenhum markdown é mais servido pelo site**: `SECURITY.md`, `LICENSE`,
  `PRIVACY.md` e `THIRD_PARTY.md` saem da allowlist do build e do precache do
  Service Worker — passam a viver só no GitHub, de onde já eram lidos. Três dos
  endereços antigos redirecionam para o conteúdo novo (`/PRIVACY.md` e
  `/THIRD_PARTY.md` para as páginas, `/SECURITY.md` para o blob do repositório);
  `/LICENSE` não redireciona e responde 404 direto. Em qualquer caso, o pior
  resultado possível é um 404 — nunca markdown cru.
- **Repositório público visível no primeiro viewport**: o header agora exibe um
  link acessível para o GitHub com o logo da plataforma e o rótulo "Repo
  público", preservando o layout responsivo e a CSP sem assets externos.
- **Sitemap sincronizado com a atualização pública**: o `lastmod` da URL
  canônica agora reflete a mudança significativa de links do header.
- **Sitemap lista as páginas novas**: `/privacidade` e `/licencas` entram no
  `sitemap.xml` como URLs próprias (`priority` 0.3), tornando-as descobríveis
  por crawlers junto da home.
- **Analytics simplificada para Umami somente**: o Vercel Web Analytics foi
  removido do HTML, da CSP, da documentação e dos testes de rede.
- **Endereço Lightning de doação atualizado** a pedido do mantenedor, sem
  impacto nos fluxos de geração ou leitura de QR PIX.
- **Código-fonte público descobrível**: o site passa a ligar o repositório no
  rodapé e nos metadados JSON-LD (`sameAs` e `codeRepository`).
- Parser reconhece o GUI Pix em qualquer Merchant Account Information 26..51 e
  modela `isComposto`/`recurrenceLocation` nos três cenários oficiais de Pix
  Automático. A UI distingue recorrência de pagamento e só permite adicionar
  valor quando existe trilho estático.
- Service Worker baixa e valida o shell inteiro — HTML, núcleo PIX, UI, helpers
  e encode/decode de QR — antes de ativar um novo cache versionado. Falha, 4xx,
  MIME incompatível ou timeout abortam a atualização e preservam integralmente
  a versão anterior; abas controladas recarregam uma vez após a troca, evitando
  qualquer combinação de HTML novo com lógica de pagamento antiga.
- Claims de privacidade agora distinguem processamento local do conteúdo PIX de
  telemetria técnica; alegações absolutas de coleta/conformidade foram removidas.
- Inventário de terceiros corrige o jsQR para Apache-2.0, inclui Outfit,
  dijkstrajs e textos integrais de licença, e descreve honestamente o limite entre
  integridade por hash e proveniência reproduzível.

### Added
- Aviso de independência, verificação no app do banco, ausência de garantia e
  limite de responsabilidade no site, README e resumo para LLMs.
- `PRIVACY.md` e `CONTRIBUTING.md`, incluindo regra obrigatória de fixtures
  sintéticas.
- E2E adversarial de desktop e mobile cobrindo estado residual, CRC inválido,
  imagens malformadas, downloads, DNT e todos os PNGs publicados.

### Fixed
- **Badge "Offline" fantasma**: o chip vermelho "Offline" no topo ficava
  visível mesmo com o navegador online — o CSS `.status-chip{display:inline-flex}`
  vencia o atributo `[hidden]` em especificidade, então o `offlineChip.hidden`
  do `app.js` não surtia efeito. Corrigido com `.status-chip[hidden]{display:none}`.
  Num gerador de QR de pagamento, um "OFFLINE" permanente passava impressão de
  app quebrado/desconectado.

### Accessibility
- **QR gerado agora é anunciado por leitores de tela**: o `<canvas>` do QR
  recebeu `role="img"` + `aria-label` ("QR Code PIX gerado — escaneie no app do
  banco"). Antes o canvas não tinha descrição textual (o Copia-e-Cola em texto
  segue como a alternativa acessível ao conteúdo).
- **Nome falado do link do repositório bate com o texto na tela**: o link "Repo
  público" era anunciado por leitores de tela com uma descrição que não começava
  pelo rótulo visível, então quem navega por comando de voz não conseguia
  ativá-lo dizendo o que estava lendo. A descrição passa a começar pelo próprio
  texto do botão.
- **Contorno de foco do teclado bem mais visível**: botões e links passam a
  receber um anel roxo claro de contraste alto quando alcançados pelo teclado,
  no lugar do brilho sutil que quase desaparecia sobre os fundos mais claros.
- **Link "Repo público" mais fácil de acertar no celular**: a área de toque do
  link no topo das páginas cresceu, sem alterar a altura da barra nem o visual
  do site.

### Changed
- **Supply chain do build pinada**: `esbuild` e `playwright-core` agora vêm de
  `package.json` + `package-lock.json` (versões exatas, integridade verificada)
  instalados com `npm ci` — o `minify.mjs` deixa de usar `npx` (que baixava o
  binário na hora do build, sem verificação de lockfile). Na Vercel, o build
  instala pelo lockfile e publica exclusivamente a allowlist em `dist/`.
- **Umami self-hosted + CSP sem script de terceiro**: o tracker
  (`cloud.umami.is/script.js`) agora é vendored como `umami.js` e servido da
  própria origem — **nenhum script de terceiro executa mais na página**; o
  `script-src` da CSP cai pra `'self'` + hash do JSON-LD. A coleta continua
  indo pro `gateway.umami.is` (endpoint default do script, já no
  `connect-src`). Frescor vigiado pelo workflow semanal `umami-freshness`
  (abre/atualiza issue quando o upstream muda — alerta, nunca quebra
  silenciosa); integridade local pinada em `third-party.lock.json`.
- **Minificação no deploy** (`scripts/minify.mjs`, chamado pelo `build.sh`): os
  arquivos servidos (app.js, sw.js, pix-core.js, CSS inline e HTML do
  index.html, manifest) são minificados no build da Vercel — **≈−43% de bytes
  gzip** transferidos (32.729 → 18.687 no conjunto app.js + index.html +
  sw.js + manifest + pix-core.js) — mantendo a fonte legível no git. Invariantes
  preservados: JSON-LD byte-idêntico (hash fixado na CSP do vercel.json),
  identifiers do pix-core.js intactos (globals consumidos por app.js e testes),
  injeção do `CACHE_NAME` antes da minificação. `SKIP_MINIFY=1` pula o passo.
  Validado por experimentos repetidos de build e regressão antes da adoção.
- **Gates mecânicos do artefato no CI** (`scripts/check-artifact.mjs` + jobs
  `build-gates` e `e2e-smoke` no guardrails): cada invariante da minificação
  virou verificação automática contra o artefato pós-build — hash CSP do
  JSON-LD preservado, `CACHE_NAME` injetado antes do minify (e pattern do sed
  consumido), globals do `pix-core.js` sobreviventes (lista canônica em
  `scripts/pix-core-globals.txt`, validada contra a fonte a cada CI), unit
  tests re-executados contra o pix-core minificado e E2E de smoke, privacidade,
  PWA/update offline e cenários adversariais. Eles servem o output do build,
  geram e leem QR na página real, conferem CRC/parse, falhas de rede e ausência
  de estado residual ou telemetria sob DNT.

### Added
- **HSTS (fase de ramp)**: header `Strict-Transport-Security: max-age=604800;
  includeSubDomains` em todas as respostas. Fecha downgrade pra HTTP em visitas
  repetidas; após ~4 semanas de bake, bump planejado pra `max-age=63072000` +
  `preload` e submissão ao hstspreload.org — protegendo também a **primeira**
  visita contra SSL-strip (o cenário de troca da chave Pix exibida). Plano e
  decisões deliberadas de não-adoção documentados no `SECURITY.md`.
- **Procedência das libs vendored verificada no CI**: `third-party.lock.json`
  registra versão, origem, licença e sha256 de `jsQR.min.js` e
  `qrcode.min.js`; o job `sanity` confere byte a byte a cada push/PR
  (`scripts/check-vendored.mjs`). Troca de bytes nas libs sem diff explícito
  no lock fica vermelha — supply chain das dependências que parseiam payloads
  Pix ganha uma base explícita de integridade local.
- **Aviso de chave cadastrada**: ao gerar um QR a partir de uma **chave** (CPF,
  CNPJ, e-mail, telefone ou aleatória), o resultado mostra um aviso âmbar:
  "Confirme que [a chave] está cadastrada como chave PIX no banco de quem vai
  receber — senão o pagamento não será reconhecido." Um QR pix2qr é EMV-válido e
  escaneia, mas se a chave não estiver registrada no PSP do recebedor, o app do
  banco recusa — confusão que costuma ser relatada como "não escaneia". Não
  aparece em Copia-e-Cola (já vem de um PSP, com a chave registrada).
- **PSP no resumo de QR Dinâmico**: ao colar/escanear um Copia-e-Cola dinâmico, o
  resumo mostra **"Resolvido por: `<host>`"** (ex.: `pix.example.invalid`) — o
  domínio do PSP que resolve o valor real no app do banco. Sinal de confiança: o
  usuário vê se é o banco esperado ou um domínio estranho. Complementa o fix do
  "R$ 1,00" (além de dizer que o valor vem do recebedor, mostra **quem**).
- **Fallback `<noscript>`**: mensagem clara quando o JavaScript está desabilitado
  (antes a tela ficava vazia), explicando que o conteúdo PIX roda localmente.
- **Open-source readiness**: `LICENSE` (MIT), `README.md`, `SECURITY.md` (disclosure
  via GitHub Private Vulnerability Reporting), templates de issue/PR e
  `THIRD_PARTY.md` (jsQR 1.4.0/Apache-2.0 e node-qrcode 1.5.4/MIT).
- **Pipeline `main` protegida + previews de PR**: `main` exige PR + testes antes
  do merge; cada contribuição recebe preview protegido na Vercel e somente
  `main` publica produção. CI exige entrada no CHANGELOG pra toda mudança de
  comportamento.

### Fixed
- **Crítico (pagamento-errado) — valor placeholder de QR Dinâmico exibido como
  confiável**: o resumo do Copia-e-Cola checava o valor embutido (campo 54) **antes**
  de `isDinamico`, assumindo que QR Dinâmico nunca traz valor. Mas PSPs emitem um
  placeholder no campo 54 de cobranças dinâmicas observadas em campo — o valor
  real é resolvido pelo PSP no app do banco no momento do pagamento. O resumo
  exibia o placeholder como valor confiável. Agora checa
  `isDinamico` **antes** do valor: QR Dinâmico mostra "Definido pelo recebedor (QR
  dinâmico)" em vez do número embutido. O QR gerado já era fiel ao payload original —
  o bug era só no display do resumo.
- **Crítico (pagamento-errado) — chave acentuada corrompida no parse**: `parseTLV`
  fatiava o payload por *code units* (UTF-16) enquanto a EMV-MPM mede o length em
  *bytes* UTF-8. Uma fixture como `josé@example.com` era lida com um caractere do
  campo seguinte anexado. Ao colar um Copia-e-Cola
  legítimo com email acentuado e **adicionar valor**, o QR reconstruído pagava a chave
  **errada**. `parseTLV` agora opera sobre os bytes (encode/decode UTF-8), alinhado ao
  `tlv()`. Emails acentuados são ubíquos no Brasil — alta probabilidade de ocorrência.
- **Crítico (pagamento-errado) — QR fisicamente malformado**: `tlv()` usava
  `padStart(2)`, que não trunca; um campo com ≥ 100 bytes emitia um length de 3 dígitos
  (ex.: `"106"`) no slot de 2 dígitos da EMV, gerando um TLV que **mesmo um parser de
  banco correto lê errado** (a chave PIX se perde) — e que ainda passava no CRC e na
  auto-verificação. Alcançável por email muito longo (o guard de 77 contava code units,
  não bytes) ou txid de ~100 chars. `tlv()` agora **lança** acima de 99 bytes; o handler
  mostra erro em vez de gerar um QR de pagamento quebrado.
- **Crítico (pagamento-errado) — valor stale no scanner**: escanear um QR de chave
  *nua* (não Copia-e-Cola) reaproveitava o valor/nome digitados numa operação anterior e
  o auto-Gerar embutia esse valor **sem callout visível**, cobrando uma quantia não pedida
  do destinatário recém-escaneado. O scanner agora zera Nome/Cidade/Valor antes de injetar
  a chave lida.
- **`parseTLV` — length estrito**: aceita apenas length de 2 dígitos (`/^\d{2}$/`);
  payload com length malformado (ex.: `"5A"`) interrompe o parse em vez de truncar o campo
  silenciosamente.
- **Resultado stale ao editar o formulário**: depois de gerar um QR, mudar chave/nome/
  cidade/valor deixava o QR e o payload exibidos obsoletos — "Copiar"/"Baixar" pegavam o
  payload da configuração anterior. Editar qualquer campo agora invalida o resultado, forçando
  clicar "Gerar" de novo (evita copiar um código de pagamento que não corresponde ao formulário).
- **Analytics (Umami) zerado**: o painel parou de registrar acessos por **dois**
  motivos simultâneos, ambos causados por um deploy do Umami no `script.js` deles.
  (1) O `integrity` (SRI) fixo no script de terceiros passou a falhar quando o Umami
  publicou uma versão nova *in-place* — o navegador bloqueava o script inteiro. O SRI
  foi removido (a allowlist de origem do CSP em `script-src` mantém a contenção; SRI
  fixo em recurso de terceiros versionado in-place é um anti-pattern). (2) O Umami
  migrou o endpoint de ingestão para `gateway.umami.is`, que não estava no `connect-src`
  do CSP, bloqueando a batida `/api/send`. Host adicionado ao `connect-src` (meta + header).

## [2026-06-06]

### Added
- **Núcleo testável**: funções puras de PIX (CRC16, montagem TLV/EMV, parsing de
  chave e de Copia-e-Cola, normalização de valor, geração de payload) extraídas
  para `pix-core.js`, com suíte de testes (`node --test`, 34 casos) rodando no CI.
- **Auto-verificação do QR**: todo QR gerado é decodificado de volta e só é exibido
  se escanear exatamente para o payload — rede de segurança contra erro de encoding.
- **Download em SVG** (vetorial, nítido em qualquer escala — ideal para impressão).
- **Copiar imagem** do QR direto para a área de transferência.

### Changed
- **Biblioteca de QR** trocada de `davidshimjs/qrcodejs` (sem manutenção) para
  **node-qrcode** (referência, mantida e amplamente usada), empacotada como arquivo
  único sem build em runtime.
- **Service worker** passa a usar *stale-while-revalidate* para o código da aplicação:
  serve do cache instantaneamente (funciona offline) e revalida em segundo plano,
  evitando que o usuário fique preso em uma versão antiga — sem nunca depender de rede.

### Fixed
- **Crítico (valores)**: montantes com separador de milhar (ex.: `1.234,56`) eram
  truncados silenciosamente para `1,23`. A normalização agora trata os formatos
  brasileiro e internacional corretamente e **rejeita** entradas ambíguas, inválidas
  ou que arredondam para zero — nunca embute um valor errado.
- **Geração de QR para boletos/contas longas**: payloads PIX de ~200 bytes em nível
  de correção ECC H falhavam com "code length overflow" (defeito na biblioteca antiga).
- **Referência (txid)** do lojista preservada ao adicionar um valor a um Copia-e-Cola
  estático escaneado (antes era substituída por um placeholder).
- **Acessibilidade**: contraste elevado para WCAG AA em textos auxiliares, foco movido
  para o resultado ao gerar (leitores de tela anunciam), e estado ARIA/`inert` no
  painel de doação.

### Security
- **CSP** endurecida e servida via cabeçalho HTTP (`object-src`, `base-uri`,
  `form-action`, `frame-ancestors`), além de `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` e `Permissions-Policy` (câmera/microfone/geolocalização desativados).
- **Leitor de QR por upload**: limite de dimensão na imagem antes de processar, evitando
  travamento da aba com imagens muito grandes.

## [2026-05-24]

### Changed
- Geração em ECC H e alta resolução para máxima compatibilidade de leitura
  (câmeras ruins, fotos em ângulo, impressão).
- Quiet zone do PNG baixado ajustada para uma moldura mais enxuta.

## [2026-05-20]

### Added
- Resumo do pagamento ao colar um Copia-e-Cola (valor, chave, recebedor, cidade).
- Distinção entre QR **estático** e **dinâmico** no resumo.
- Possibilidade de **adicionar um valor** a um QR estático sem valor embutido.

## [2026-04-23 – 2026-04-28]

### Added
- **Caminho inverso**: decodificar uma imagem de QR Code para extrair a chave /
  Copia-e-Cola.
- Validação estrita da chave PIX (e-mail, telefone +55, CPF/CNPJ com dígito
  verificador, chave aleatória UUIDv4) e verificação de CRC do Copia-e-Cola.
- Desambiguação entre CPF inválido e telefone para entradas de 11 dígitos.
- Aviso suave quando Nome/Cidade contêm dígitos.
- Botão de instalar PWA com suporte multiplataforma; *hardening* de PWA
  (ícones maskable, versionamento de cache automático por deploy).
- Otimizações de descoberta orgânica e visibilidade em buscadores/LLMs.

### Fixed
- Invalida QR/payload anterior quando a entrada passa a ser inválida.
- Diversos ajustes de UI (layout inicial, FAQ, painel de doação).

### Security
- CSP sem `unsafe-inline`: JavaScript inline extraído para arquivos externos.

## [2026-02-25 – 2026-02-26]

### Added
- Versão inicial: geração de QR Code PIX com processamento local no navegador.
- Suporte a PWA e fonte auto-hospedada.

### Security
- CSP, Subresource Integrity em scripts externos e limites de tamanho nas entradas.
