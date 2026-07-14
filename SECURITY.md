# Política de Segurança

O pix2qr lida com **códigos de pagamento PIX**. Um bug que faça o app exibir ou
gerar um valor/chave **errado** tem impacto financeiro real — levamos isso a
sério e tratamos como a classe de bug mais crítica do projeto.

## Como reportar

**Não abra uma issue pública** para vulnerabilidades. Use o canal privado:

- **GitHub → aba *Security* → *Report a vulnerability*** (Private Vulnerability
  Reporting). É o canal preferido e não expõe o problema antes da correção.

Esse recurso precisa permanecer habilitado nas configurações do repositório. Se
o botão privado não aparecer, não publique o material sensível numa issue.

Inclua, se possível: passos para reproduzir, comportamento observado vs.
esperado e navegador/dispositivo. Use somente fixture sintética mínima; nunca
envie chave PIX registrada, Copia-e-Cola de cobrança real, token de PSP, dado de
cliente ou screenshot bancário.

## Versões suportadas

O projeto usa entrega contínua e dá suporte apenas ao código atualmente servido
em `https://pix2qr.xyz/` e ao `main` mais recente. Não há linhas antigas com
correções de segurança retroportadas.

## Escopo

Especialmente interessados em:

- **Pagamento-errado**: parsing/geração que produza valor, chave, recebedor ou
  CRC incorretos (ex.: truncamento de valor, corrupção de chave, confundir QR
  dinâmico com estático).
- Bypass de validação (CPF/CNPJ/UUID/telefone) que gere payload inválido.
- XSS / injeção via conteúdo do Copia-e-Cola escaneado ou colado.
- Falhas de CSP ou de isolamento que vazem dados do navegador.

Fora de escopo: ataques que exigem o dispositivo do usuário já comprometido;
problemas em serviços de terceiros (Vercel, Umami); o conteúdo resolvido por um
PSP em QR dinâmico (isso acontece no app do banco, fora deste projeto).

## O que esperar

- Confirmação de recebimento assim que possível.
- Como é um app estático com deploy contínuo, correções de segurança vão pra
  produção rápido após validação.
- Crédito no anúncio da correção, se desejar.

## Decisões de hardening

Registro do que está ativo, do que está em rollout e do que foi **deliberadamente
não adotado**, com o risco correspondente.

**Ativo:**
- CSP estrita (script-src `'self'` + hash do JSON-LD), `frame-ancestors 'none'`,
  `form-action 'none'`, `base-uri 'self'`, nosniff, Referrer-Policy `no-referrer`,
  Permissions-Policy mínima — via `vercel.json` e meta tag.
- Minificação de deploy com **gates mecânicos no CI** contra o artefato final
  (hash CSP do JSON-LD, `CACHE_NAME` do SW, globals do pix-core, E2E que gera e
  decodifica QR real). Ver `scripts/check-artifact.mjs`.
- Integridade dos assets vendorizados pinada por sha256 (`third-party.lock.json`),
  verificada a cada CI.
- Redação first-party de URL/referrer antes do Umami, com exclusão de
  query/hash e E2E de rede usando probes sintéticos.
- Upload limitado a PNG/JPEG/GIF/WebP: até 1 MiB do cabeçalho é inspecionado e
  dimensões acima de 25 MP são rejeitadas antes de criar `Image`; após o decode,
  as dimensões naturais precisam coincidir com o cabeçalho e o limite é aplicado
  novamente. Isso impede a classe comum de bomba por dimensão declarada, mas não
  substitui a segurança do decoder do navegador; arquivos malformados dentro do
  limite ainda são tratados pelo sandbox do browser e formatos sem cabeçalho
  reconhecido são recusados.

**Em rollout — HSTS:**
- Fase atual: `max-age=604800; includeSubDomains` (7 dias de bake).
- Após ~4 semanas sem incidente: bump pra `max-age=63072000; includeSubDomains;
  preload` + submissão em [hstspreload.org](https://hstspreload.org).
- Racional: SSL-strip na primeira visita é um risco relevante para um gerador de
  instruções de pagamento, pois pode trocar a chave exibida; preload reduz esse
  risco. O domínio é dedicado e os hosts publicados são HTTPS-only na Vercel;
  o custo de irreversibilidade é baixo.

**Deliberadamente não adotado (e por quê):**
- **SRI no Umami remoto** — não se aplica: o script executado é vendorizado e
  servido pela própria origem. Sua integridade local é fixada em
  `third-party.lock.json`; atualizações exigem revisão explícita.
- **COOP/COEP/CORP** — não há sessão, estado autenticado nem `window.opener`
  relevante; `rel=noopener` cobre o resíduo. Header sem ameaça nomeada.
- **Trusted Types** — sem sink dinâmico de HTML de terceiros; a CSP já bloqueia
  script injetado.
- **Remoção do `'unsafe-inline'` do style-src** — sem templating server-side,
  não há vetor de CSS injection que não passe por comprometer o próprio JS (e aí
  style-src não salva). Reavaliar se houver refactor de estilos por outro motivo.
- **CSP `report-uri`/`report-to` de terceiro** — adicionaria um endpoint externo
  recebendo dados de navegação; custo > benefício num app sem backend.
