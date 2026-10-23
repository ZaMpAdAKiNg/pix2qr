# DNA visual para o pix2qr — PIX-6

Especificação para home, placa, privacidade e licenças. Base auditada: `9d24d09`, em 22/10/2026. Entrega documental; os cards de implementação aplicam este contrato em `stage`. O pix2qr mantém nome, símbolo, conteúdo e comportamento próprios; exceção: o símbolo S da Salaria é o favicon das quatro páginas, por decisão do dono em 2026-10-22 (seção 2).

## 1. Tokens, tipografia, layout e motion

### Evidência e precedência

| Fonte | Confiança | Uso e limite |
|---|---|---|
| `marca/tema.css`, referência local somente leitura | provided | Autoridade para nomes e valores congelados; prevalece sobre o kit antigo, inclusive placeholder e semânticas. |
| `direcoes/b/{b.module.css,ui.tsx,topo.tsx,campos.tsx,lateral.tsx,index.tsx}` | provided | Vocabulário, dimensões, estados e efeitos descritos abaixo. Nenhum código de componente é redistribuído. |
| Kit `ig-landing/audit/design-dna/{DESIGN.md,design-contract.md,design-tokens.json,motion.css,components.html}` | provided | Histórico de captura de 14/10/2026 do domínio anterior, salaria.tech; não é uma medição nova de salaria.money. |
| Capturas históricas `screenshots/hero.png`, `screenshots/mobile/fold.png`, estados `10-pay-glass-flag-focus.png` e `11-lift-on-hover-hover.png` | provided | Conferência visual da hierarquia pesada, superfícies e pílulas; cópias privadas em `../pix2qr-design-ref/pix-6/`. |
| `https://salaria.money` | observed | Tentativa em Chrome em 22/10/2026 falhou com `ERR_NAME_NOT_RESOLVED`; registro privado `../pix2qr-design-ref/pix-6/live.json`. Nenhum estado ao vivo é afirmado. |
| HTML, `app.js`, `placa.js`, fonte e hashes do pix2qr | observed | Inventário local e integridade; a tabela da seção 4 cobre os IDs atuais. |
| Extensões `--pix-*`, select, tabs, toast e adaptações de acessibilidade | inferred | Decisões deste contrato para fechar lacunas do produto; não são tokens nem estados medidos da marca. |

O aspecto desejado é verde-grafite escuro, superfícies discretamente elevadas, um acento brasa, títulos Outfit densos e informação técnica mono. O formulário e a saída continuam próximos; não importar a composição longa da landing histórica. O material privado permanece fora do repositório. O escopo de um único Markdown substitui a emissão do kit completo da skill: nenhum `design-system/`, screenshot, fonte ou fixture novo neste PR.

### Tokens congelados — `provided`, origem `marca/tema.css`

Transcrever estas declarações em `:root` no CSS estático. Os nomes e valores são idênticos à fonte; `@theme` e os resets curinga de Tailwind não são transportados. As variáveis de família apontam para aliases locais, definidos abaixo. As cores de identificação no fim da paleta são preservadas para paridade, mas ficam sem uso visual no pix2qr; em particular, `--color-pix` não vira acento.

```css
:root {
  --color-bg: #161e1b;
  --color-surface: #1f2a26;
  --color-surface-2: #2a3531;
  --color-surface-3: #26312d;
  --color-campo: #121815;
  --color-border: #333c38;
  --color-border-strong: #a9b5b0;
  --color-grid-line: #3a4642;
  --color-fg: #f7f9f8;
  --color-fg-muted: #d6ddd9;
  --color-fg-subtle: #a1aca7;
  --color-fg-faint: #6a7672;
  --color-fg-placeholder: #a1aca7;
  --color-fg-on-accent: #ffffff;
  --color-white: #ffffff;
  --color-black: #000000;
  --color-accent: #e64a2e;
  --color-accent-strong: #cf4227;
  --color-accent-deep: #b83a20;
  --color-accent-soft: #ee7358;
  --color-accent-glint: #f5a08e;
  --color-sucesso: #a6d8bd;
  --color-aviso: #f2c46b;
  --color-erro: #f59aa6;
  --color-polygon: #6c00f6;
  --color-tron: #ff060a;
  --color-tether: #26a17b;
  --color-pix: #1fa9a0;
  --radius-campo: 16px;
  --radius-vidro: 16px;
  --radius-cartao: 24px;
  --shadow-cartao: 0 4px 16px rgba(0, 0, 0, 0.35);
  --shadow-lift: 0 16px 48px rgba(0, 0, 0, 0.55);
  --shadow-dialogo: 0 32px 80px rgba(0, 0, 0, 0.4);
  --shadow-cta: 0 8px 24px rgba(230, 74, 46, 0.32);
  --tracking-display: -0.025em;
  --tracking-titulo: -0.02em;
  --tracking-mono: -0.005em;
  --tracking-rotulo: 0.12em;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-padrao: cubic-bezier(0.4, 0, 0.2, 1);
  --font-sans: var(--font-outfit), system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-display: var(--font-outfit), system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

Camadas de consumo: identidade = cores, famílias e tracking; estrutura = raios e escala abaixo; fallback = semânticas e motion; aliases = famílias; extensões = `--pix-*`. Não renomear os tokens congelados para os nomes do kit antigo.

### Extensões do pix2qr — `inferred`, sem equivalentes em `tema.css`

Valores derivados do vocabulário da direção B, com escolhas explícitas de adaptação. São o contrato de implementação, não evidência de tokens de origem.

```css
:root {
  --font-outfit: 'Outfit';
  --font-plex-mono: 'IBM Plex Mono';
  --pix-radius-pill: 9999px;
  --pix-space-1: 4px;
  --pix-space-2: 8px;
  --pix-space-3: 12px;
  --pix-space-4: 16px;
  --pix-space-5: 20px;
  --pix-space-6: 24px;
  --pix-space-8: 32px;
  --pix-space-10: 40px;
  --pix-space-12: 48px;
  --pix-space-16: 64px;
  --pix-container-shell: 87.5rem;
  --pix-container-tool: 44rem;
  --pix-container-prose: 44rem;
  --pix-gutter: clamp(1rem, 4vw, 1.5rem);
  --pix-section-gap: clamp(1.5rem, 4vw, 2.5rem);
  --pix-z-decoration: -1;
  --pix-z-content: 0;
  --pix-z-nav: 30;
  --pix-z-backdrop: 40;
  --pix-z-dialog: 41;
  --pix-z-toast: 50;
  --pix-duration-fast: 150ms;
  --pix-duration-control: 200ms;
  --pix-duration-surface: 300ms;
  --pix-duration-dialog: 320ms;
}
```

A direção B fornece passos de 4px, cartão principal até 44rem e quadro até 87.5rem acima de 1440px (`b.module.css`, `index.tsx`); não copiar suas colunas laterais. Aqui: ferramenta e textos até 44rem, centralizados; duas colunas apenas em `.row-two` a partir de 640px; abaixo, uma coluna. Ações quebram linha sem rolagem horizontal. 320px deve funcionar; provas visuais em 390×844 e 1280px. `--pix-z-nav: 30` e backdrop 40 seguem `topo.tsx`/`carteiras.tsx`; diálogo 41 e toast 50 são ordenação nova. Criar contexto isolado para decoração negativa, sem ocultar foco.

### Escala tipográfica de implementação — `inferred`

Base de 16px, zoom do usuário preservado. Origem dos níveis: título de abertura 40–56px/900 e título de estado 28–32px/800 em `direcoes/b/index.tsx`; rótulos de 11px em `ui.tsx`; a escala compacta adapta isso às quatro páginas.

| Nível / destino | Família | Tamanho | Peso | Altura de linha | Tracking |
|---|---|---|---|---|---|
| H1 / hero | display | `clamp(2.5rem, 5vw, 3.5rem)` | 900 | 1.02 | `--tracking-display` |
| H2 / seção e resultado | display | `clamp(1.75rem, 3vw, 2rem)` | 800 | 1.2 | `--tracking-titulo` |
| H3 / diálogo e subseção | display | 1.5rem | 800 | 1.25 | `--tracking-titulo` |
| Introdução | sans | 1.125rem | 400 | 1.6 | 0 |
| Corpo / input / CTA | sans | 1rem | 400 / 400 / 600 | 1.6 / 1.5 / 1.5 | 0 |
| Label / ajuda / links | sans | .875rem | 500 / 400 / 500 | 1.5 | 0 |
| Rótulo técnico / chip | mono | .6875rem (11px) | 500 | 1.5 | `--tracking-rotulo` |
| Número / chave / payload / CRC / versão / data | mono | herda o nível, mínimo .875rem em conteúdo copiável | 400; 500 no destaque | 1.5 | `--tracking-mono` |
| Valor de destaque | mono | `clamp(1.375rem, 3vw, 2rem)` | 500 | 1.2 | `--tracking-mono` |

Usar `font-variant-numeric: tabular-nums` em números. Todo número, inclusive em inputs, tamanhos de placa, versões, datas e dados técnicos, usa mono; texto corrido continua Outfit. Nada abaixo de 11px. Títulos não dependem de JS, reveal ou opacidade inicial zero.

### Motion e efeitos

`provided`: easings congelados acima; direção B usa controles 200ms, véu 240ms, diálogo 320ms; vidro `blur(18px) saturate(1.35)` com gradiente branco de 7,5% a 2,5%, reflexo de 10%, sombras externas `0 28px 72px rgb(0 0 0 / .5)` e internas de 7%/6%. Grade 48px, linha `--color-grid-line` a 38%, brilho radial brasa a 13%, máscara até 72%; barra móvel blur 12px com bg a 94%. Esses efeitos são referência privada, não código a copiar.

`inferred`: começar com cartões opacos `--color-surface` e `--shadow-cartao`, sem blur no formulário nem atrás do QR; vidro fica opcional apenas no topo, com fallback opaco. Hover muda cor/borda em 200ms `--ease-padrao`; superfícies 300ms; `:active` em ações `scale(.97)`. Sem animação em layout, conteúdo ou dados. A fonte B tem borda girando `rotate(1turn)` em 5s linear (9s em espera), varredura de -100% a 100% em 1.6s e pulso com opacidade .35 no meio em 1.8s. Não transportar essas animações de espera para operações locais instantâneas. Não introduzir canvas de efeito, WebGL ou runner de reveal.

`provided`, `tema.css`: em `prefers-reduced-motion: reduce`, todos os elementos e pseudo-elementos recebem duração de animação e transição `0.01ms !important`, uma iteração e `scroll-behavior: auto !important`. `inferred`: também remover transform de hover/active e animações ambientais; conteúdo permanece visível em todos os casos.

## 2. Fontes, arquivos e licenças

`observed`: `fc-scan fonts/outfit-latin.woff2` lista Thin a Black e intervalo variável; o SHA-256 coincide byte a byte com o arquivo variável 100–900 da referência. O `@font-face` atual já declara `font-weight: 100 900`. Portanto 800 e 900 são reais, sem síntese e sem substituição. Declarar `font-display: swap`, `font-style: normal`, servir apenas de mesma origem. Usar no máximo **400 e 500** de Plex Mono; nunca solicitar 600/700/800 dessa família. Aplicar `font-synthesis: none` onde necessário.

| Arquivo | SHA-256 observado | Licença / destino |
|---|---|---|
| `fonts/outfit-latin.woff2` | `92684e4acde79ef07758cd09380b7e01e9824d8b061eddeda046f78c166d7b12` | OFL 1.1; Existente; preservado |
| `marca/fontes/Outfit-100a900-latin.woff2` | `92684e4acde79ef07758cd09380b7e01e9824d8b061eddeda046f78c166d7b12` | OFL 1.1; Referência idêntica, não duplicar |
| `marca/fontes/IBMPlexMono-400-latin.woff2` | `c36f509c0a8f9f85f29cb44bc8701d8a9e0b14c499e77a884f789ead7093a7ac` | OFL 1.1; Proposto: fonts/ibm-plex-mono-400-latin.woff2 |
| `marca/fontes/IBMPlexMono-500-latin.woff2` | `a76f53ca6612e7b3828eec2311098675b7f9849ae4169a8bcef6302aec02a6c0` | OFL 1.1; Proposto: fonts/ibm-plex-mono-500-latin.woff2 |

`provided`: licença OFL 1.1 e origem em `marca/PROVENIENCIA.md`; Outfit já tem `licenses/Outfit-OFL-1.1.txt`. No card que adicionar Plex, incluir seu texto OFL completo e copyrights, conferir os bytes do arquivo de licença e registrar também seu SHA-256 no lock. Este card não adiciona fontes nem declara hash de licença que ainda não foi incorporada. Assets novos exigem allowlist do build, gate de artefato, precache quando shell, `third-party.lock.json`, `THIRD_PARTY.md` e página de licenças.

### Favicon (símbolo S da Salaria)

Por decisão do dono em 2026-10-22, o favicon das quatro páginas é o símbolo S da Salaria, usado somente como favicon. `apple-touch-icon`, os ícones do `manifest.webmanifest` e `icons/icon-1024.png` continuam os do PIX QR.

| Arquivo | SHA-256 | Origem / licença |
|---|---|---|
| `icons/favicon.svg` | `86d8b44b6408033390584c877fba30362ba9b3486b7814cdb51a21e294730889` | Cópia byte a byte de `salaria.money/app/icon.svg`, o favicon oficial segundo `marca/PROVENIENCIA.md`. Símbolo da Salaria, marca do dono, direitos reservados, fora da licença MIT do código. |
| `icons/favicon-32.png` | `2b4573308a9b4561c532abd69de71b931f410a15d6f428c5b74aa57e46e58739` | Fallback 32×32 renderizado desse SVG pelo Chrome local (playwright-core), cantos transparentes. Mesma nota de marca. |

## 3. Componentes e estados

### Regras comuns

Estados da direção B são `provided` quando indicados; qualquer complemento é `inferred`. Todos os controles: alvo mínimo 44×44px, label visível ou nome acessível, foco `outline: 2px solid var(--color-accent)` com offset 3px, sem trocar raio. Não recortar o anel. Se um wrapper recorta, abrir espaço; não herdar automaticamente o foco interno da referência. Borda `--color-border` é decorativa; delimitação essencial de inputs e seleções usa `--color-border-strong` (contraste na seção 5). Erros sempre ícone + mensagem + associação, nunca só cor. Não criar interação em superfícies estáticas.

| Componente / proveniência | Default | Hover | Focus | Active / selecionado | Disabled | Erro |
|---|---|---|---|---|---|---|
| Primário, B `BotaoCta` (`provided`) | pílula, altura 52px, px 24px, gap 10px, fg-on-accent / accent-strong, shadow-cta | accent-deep | anel comum | accent-deep, scale(.97) | surface-2 + fg-subtle, sem sombra/transform; busy mantém accent-deep + texto e `aria-busy` | mensagem associada, não botão vermelho (`inferred`) |
| Secundário, B `BotaoContorno` (`provided`, borda adaptada) | pílula, altura 44px, px 16px, fg-muted, transparente, border-strong | fg, border-strong | anel comum | scale(.97) | sem operação; fg-subtle, sem opacidade global (`inferred`, evita apagar texto) | mensagem ao lado (`inferred`) |
| Fantasma, B `BotaoCopiar` (`provided`) | pílula, 44px, px 10px, fg-subtle | branco 6% sobre base, fg | anel comum | scale(.97); confirmação Check + sucesso | fg-subtle, sem evento (`inferred`) | anúncio de falha, opção de cópia manual (`inferred`) |
| Texto e select, B `campos.tsx` + adaptação (`inferred` para select) | campo, raio 16px, altura 52px, px 16px, fg / campo, border-strong; placeholder fg-placeholder | border-strong | anel comum externo | mantém superfície; select conserva controle nativo | `disabled`, surface-2 + fg-subtle; readOnly continua selecionável | border-erro + texto erro, CircleAlert, `aria-invalid`, `aria-describedby` |
| Status, B `Selo` (`provided`, contraste composto a validar) | pílula 11px/500 mono; fg-subtle, branco 5%, borda 12%; neutro/sucesso/aviso | não interativo | não recebe foco | tom semântico + ícone e texto; brasa usa accent-soft apenas sobre base/surface | não se aplica a status | erro usa erro + CircleAlert (`inferred`) |
| Cartão de seção (`inferred`, material B) | surface, raio 24px, shadow-cartao, padding 24px (16px no mobile) | estático; sem lift arbitrário | só descendentes operáveis | sem estado próprio | não se aplica | aviso interno preserva estrutura |
| Topo/nav (`inferred`, origem `Topo`) | bg opaco, borda border; altura mínima 56px, ícone próprio, links fg-muted | links fg e sublinhado | anel nos links/botões | link atual `aria-current=page`, fg | links não são desabilitados artificialmente | avisos PWA separados |
| Rodapé (`inferred`, kit) | bg, texto fg-subtle ≥14px, links fg-muted sublinhados, quebra de linha | fg | anel com espaço | sem mudança de conteúdo | não se aplica | não se aplica |
| Alerta/aviso, B `Aviso` (`provided`) | raio campo, padding 16×12px, gap 12px; corpo fg-muted, borda e ícone semânticos | estático | link interno com anel | sem estado próprio | não se aplica | erro, CircleAlert; preservar roles existentes |
| Toast (`inferred`) | surface, fg, raio vidro, shadow-lift, posição fixa abaixo do diálogo, `role=status` | sem hover estrutural | só botão de fechar, se existir | sucesso Check; não desloca foco | não se aplica | erro com mensagem; falha importante persiste junto à ação |
| Tabs (`inferred`, vocabulário de seletor B) | trilho campo, pílulas fg-subtle, alvo ≥44px, border-strong | fg | anel comum | surface-2 + fg, borda strong, `aria-selected=true` | fg-subtle + aria-disabled; sem ativação | erro no painel associado; sem inventar tabs onde não há |
| Bloco mono (`inferred`) | campo + fg-muted, raio campo, padding 16px, mono 14px/1.5; wrap anywhere, texto selecionável | estático | foco só na ação de cópia | seleção nativa legível | mantém leitura | falha de cópia textual, sem esconder payload |
| Área QR (`provided` pelo pix2qr) | preto sobre branco, quiet zone 4 módulos, sem efeito ou textura | sem alterar matriz | anel fora da quiet zone no alvo de download | feedback no botão, nunca no QR | sem QR até resultado válido | saída anterior removida/invisível conforme lógica; erro fora da imagem |
| Instalar PWA (`inferred`, secundário B) | pílula secundária, Download; mantém `hidden` e lógica existentes | fg | anel comum | feedback nativo ou abre diálogo existente | indisponível continua oculto conforme código | mensagem acessível; não prometer instalação suportada onde não há |

Toast é um componente disponível para feedback se o card de UI o adotar; o estado atual usa texto no próprio botão. Tabs são somente especificação reutilizável: não substituir os rádios de tamanho por tabs. Para abas reais futuras: roving tabindex, setas, Home/End e painéis associados; não acrescentar JavaScript só para decoração. Select não existe no inventário atual; preservar rádios nativos da placa.

### Cobertura de dados e formulário — `inferred`, preservando fluxo atual

| Estado | Renderização exigida |
|---|---|
| Loading | Somente durante leitura de imagem/geração assíncrona real: texto de progresso + aria-busy; sem espera artificial. |
| Empty | Formulário utilizável, resultado oculto; sem valores fictícios. |
| Error | Mensagem local, associação e alerta existentes; sem QR antigo apresentado como atual. |
| Populated | QR válido + payload selecionável + ações + aviso de conferência. |
| Edge | Chave/payload longo quebra sem truncar dados; zoom 200%, teclado, mobile 320px; QR preserva matriz. |
| Untouched | Sem mensagens de erro novas antes da interação. |
| Dirty-valid | Tipo identificado, campos condicionais e resumo seguem a lógica vigente. |
| Submitted-pending | Evitar envio duplicado enquanto ocupado, preservar label e foco, resultado anunciado ao concluir. |

### Ícones — `inferred`, seleção para o pix2qr

Lucide como SVG inline estático, sem React, pacote de runtime ou CDN: **QrCode, ScanLine, ArrowRight, Copy, Download, Image, Check, CircleAlert, TriangleAlert, Info, WifiOff, X, ChevronDown, ExternalLink, Printer, Heart**. Associação: marca própria/gerar = QrCode/ArrowRight; scanner = ScanLine; cópia = Copy/Check; PNG/SVG/instalação = Download; imagem = Image; offline = WifiOff; erro/aviso = CircleAlert/TriangleAlert/Info; modal = X; FAQ = ChevronDown; impressão = Printer; apoio = Heart; link externo = ExternalLink. Ícone de marca próprio e marca GitHub existente permanecem próprios.

SVG: viewBox 0 0 24 24, stroke currentColor, stroke-width 2, sem fill, pontas/arcos arredondados; tamanho 18–20px com alvo 44px. Decorativos com `aria-hidden=true` e `focusable=false`; botão mantém rótulo. Lucide tem licença ISC; preservar texto completo, copyrights e aviso Feather quando aplicável. Fixar versão/commit e hash no card que incorporar os traços, sem copiar SVGs de `direcoes/b`. A versão do pacote privado não é dependência do pix2qr.

## 4. Mapeamento de páginas e invariantes

`observed`: IDs extraídos do HTML atual; `inferred`: destinos visuais. Todos os IDs abaixo são **inalterados**, inclusive seus `hidden`, `inert`, roles e relações ARIA. Os mesmos IDs em páginas diferentes continuam válidos em seus documentos respectivos. Não transportar conteúdo de outra marca.

### Home — seções sem ID

| Seletor / seção | Componente / tokens |
|---|---|
| `.topbar`, `.topbar-inner`, `.topbar-logo`, `.topbar-actions` | topo/nav; bg, fg, border, display 800; símbolo pix2qr preservado |
| `.page`, primeira `.card` | container-tool, gutter; cartão 24px/surface/shadow-cartao |
| `.card-title`, `.card-subtitle` | hero compacto H1 900; introdução fg-muted; título visível sem JS |
| `.field`, `.field-hint`, `.row-two` | campo/label/ajuda; nome/cidade Outfit, chave/valor mono; grid responsivo |
| `.safety-notice`, `.result-check`, `.key-hint` | aviso; aviso + fg-muted; conteúdo preservado |
| `.result-header`, `.check-badge`, `.result-header-text` | cabeçalho de resultado; sucesso e H2; preservar foco programático |
| `.cc-row`, `.cc-label`, `.cc-value` | linhas de resumo; labels fg-subtle; dados fg/fg-muted; números mono |
| `.action-row`, `.tip-jar`, `.donate-row`, `.donate-copy` | ações fantasma, apoio secundário; endereços mono, fg-muted |
| `.faq`, `details`, `summary`, `.faq-answer` | seção 24px; acordeão nativo, fg, resposta fg-muted; aberto não usa laranja pequeno |
| `.legal-notice` | seção E-E-A-T/aviso; H2 e corpo legível; metodologia e todos os links preservados |
| `footer`, `.footer-meta`, `.github-repo-link` | rodapé/nav; autoria, links internos e públicos preservados |
| `noscript` | aviso legível em surface; mantém conteúdo e fallback |

### Home — todos os IDs

| ID inalterado | Componente / tokens ou comportamento preservado |
|---|---|
| `offline-chip` | status neutro com WifiOff; fg-subtle/surface; estado offline existente |
| `install-btn` | instalar PWA; secundário, fg-muted/border-strong |
| `chave-input` | campo mono, campo/fg/border-strong; inclusive payload de entrada |
| `qr-file-input` | input de arquivo oculto inalterado; sem mudança visual |
| `scan-qr-btn` | secundário com ScanLine; alvo 44px |
| `mode-tag` | chip de tipo; surface-2/fg, sem ponto piscando |
| `mode-label` | rótulo de status mono 11px/500, fg-subtle |
| `cc-summary` | cartão de resumo, surface/fg; aria-live preservado |
| `cc-row-kind` | linha de resumo, surface; visibilidade condicional inalterada |
| `cc-kind` | texto de resumo fg-muted; números internos mono |
| `cc-row-valor` | linha de resumo, surface; visibilidade condicional inalterada |
| `cc-valor` | valor mono 500, fg |
| `cc-row-psp` | linha de resumo, surface; visibilidade condicional inalterada |
| `cc-psp` | texto de resumo fg-muted; números internos mono |
| `cc-row-recurrence` | linha de resumo, surface; visibilidade condicional inalterada |
| `cc-recurrence` | texto de resumo fg-muted; números internos mono |
| `cc-row-chave` | linha de resumo, surface; visibilidade condicional inalterada |
| `cc-chave` | valor mono 500, fg |
| `cc-row-nome` | linha de resumo, surface; visibilidade condicional inalterada |
| `cc-nome` | texto de resumo fg-muted; números internos mono |
| `cc-row-cidade` | linha de resumo, surface; visibilidade condicional inalterada |
| `cc-cidade` | texto de resumo fg-muted; números internos mono |
| `cc-add-valor` | grupo de campo/ajuda, surface |
| `cc-add-valor-input` | campo de valor mono 500, campo/fg |
| `extra-fields` | grupo condicional de campos; visibilidade inalterada |
| `nome-input` | campo Outfit, campo/fg |
| `nome-warn` | aviso inline, aviso + ícone e texto |
| `cidade-input` | campo Outfit, campo/fg |
| `cidade-warn` | aviso inline, aviso + ícone e texto |
| `valor-input` | campo de valor mono 500, campo/fg |
| `error-msg` | alerta de erro, erro + CircleAlert; role/aria-live preservados |
| `gerar-btn` | primário, fg-on-accent/accent-strong, shadow-cta |
| `result` | container de saída; classe visible e estado inicial inalterados |
| `key-hint` | aviso de identificação, fg-muted/aviso |
| `qr-container` | alvo de download, branco/preto, foco externo; role/tabindex preservados |
| `qr-wrap` | QR sem tema; branco/preto e quiet zone 4 módulos |
| `payload-display` | bloco mono 400, campo/fg-muted; wrap anywhere |
| `copy-btn` | fantasma Copy/Check, confirmação sucesso |
| `download-btn` | fantasma Download, fg-muted |
| `download-svg-btn` | fantasma Download, fg-muted |
| `copy-img-btn` | fantasma Image/Check, confirmação sucesso |
| `donate-toggle` | secundário/fantasma; aria-expanded/controls preservados |
| `donate-panel` | cartão de apoio surface; inert/open preservados |
| `evm-addr` | bloco mono 400; conteúdo próprio inalterado |
| `ln-addr` | bloco mono 400; conteúdo próprio inalterado |
| `faq-title` | H2 display 800; fg, tracking-titulo |
| `legal-title` | H2 E-E-A-T display 800; fg |
| `install-modal` | backdrop/dialog, z-backdrop/z-dialog, surface, radius-cartao, shadow-dialogo; foco/Escape existentes |
| `install-modal-title` | H3 display 800 fg; conteúdo dinâmico inalterado |
| `install-modal-desc` | corpo fg-muted; texto dinâmico inalterado |
| `install-modal-steps` | lista fg-muted; números mono, conteúdo dinâmico inalterado |
| `install-modal-close` | primário, fg-on-accent/accent-strong |

### Placa — estrutura e todos os IDs

Topo `.topbar` e rodapé seguem os mesmos componentes; `main.card` é seção surface/24px, `.doc-kicker` rótulo ≥11px e `.lead` introdução. `.presets`, `legend`, `.preset-options` mantêm rádios nativos `name=preset`, valores `a4`, `a5`, `balcao` e labels; vestimenta de pílula selecionada surface-2/fg, alvo 44px, foco e borda forte. Não criar select nem alterar tamanhos físicos. Seções `.card.doc` de instruções e FAQ preservam todos os textos, headings, links e `details`.

| ID inalterado | Componente / tokens ou comportamento preservado |
|---|---|
| `titulo` | H1 display 900/fg |
| `chave-input` | campo mono, campo/fg/border-strong |
| `nome-input` | campo Outfit, campo/fg |
| `cidade-input` | campo Outfit, campo/fg |
| `valor-input` | campo de valor mono 500, campo/fg |
| `error-msg` | alerta erro; roles preservados |
| `gerar-btn` | primário accent-strong/fg-on-accent |
| `preview-wrap` | seção de prévia; hidden preservado |
| `placa-preview` | imagem clara da placa, sem filtro, sombra só fora da imagem |
| `print-btn` | primário Printer, accent-strong/fg-on-accent |
| `download-btn` | secundário Download, fg-muted |
| `como-title` | H2 display 800/fg; instruções inalteradas |
| `faq-title` | H2 display 800/fg; FAQ inalterada |
| `print-area` | saída clara exclusiva de impressão; aria-hidden e medidas físicas inalterados |

### Privacidade e licenças — sem IDs próprios

`observed`: nenhuma das duas páginas tem atributo `id` próprio (o atributo `data-website-id` não é ID de DOM).

| Página / elemento | Componente / tokens |
|---|---|
| Ambas: `.topbar`, `.topbar-inner`, `.topbar-logo`, links de retorno | topo/nav próprio, bg/fg, foco comum; navegação inalterada |
| Ambas: `.page`, `main.card.doc` | container-prose 44rem; cartão surface/24px; sem alteração semântica |
| Ambas: `.doc-kicker`, `h1`, `h2`, `p`, listas | rótulo ≥11px; H1 900/H2 800, corpo fg-muted/1.6; headings e conteúdo inalterados |
| Privacidade: seções de processamento local, telemetria, armazenamento/PWA, limites e reporte | corpo/aviso; fg-muted; todos os parágrafos e referências mantidos |
| Ambas: `code`, hashes, datas, versões, caminhos técnicos | bloco/texto mono 400, fg; links com sublinhado e foco |
| Licenças: `.components`, `.component`, `.component-head` | lista de cartões surface-2/16px; H2 fg; 16–24px de respiro |
| Licenças: `.license-badge` | chip neutro com link; fg-muted, alvo 44px, borda forte e foco |
| Licenças: `.component-facts`, `dt`, `dd` | linhas de resumo; fg-subtle/fg-muted, versões mono, quebra de palavras |
| Ambas: `.doc-disclaimer`, footer / `.footer-meta` | aviso e rodapé; fg-subtle ≥14px, links fg-muted |

### Invariantes de implementação

JSON-LD deve permanecer byte-idêntico ao bloco atual; manter hash da CSP, metadados SEO, canonical, autor, headings, FAQ e E-E-A-T. Preservar todos os IDs, nomes dos campos, `data-*` (inclusive `data-target` de doação), seletores comportamentais `.visible`, `.open`, `.success`, `.copied`, handlers e textos próprios. Preservar comportamento local, sem requests de dados PIX, e política de telemetria anônima. Nenhum script inline ou origem externa nova. Dados sintéticos apenas em validação.

Assets públicos futuros entram na allowlist de `scripts/build.sh`, em `scripts/check-artifact.mjs` e no `APP_SHELL` quando shell; terceiros entram também no inventário/licenças. Atualizar `theme_color`, `background_color` e meta theme-color para bg na implementação, com CHANGELOG e testes PWA. Screenshots públicos futuros mostram somente pix2qr com dados sintéticos. Não produzir mudança de lógica ou de conteúdo SEO sob pretexto de reskin.

## 5. Contraste e acessibilidade

`observed`: cálculo WCAG 2.x sobre os hex congelados (sRGB linearizado, `(Lmaior+.05)/(Lmenor+.05)`), arredondado a duas casas. Valores sem transparência. Base/surface/surface-2 são os únicos fundos de texto permitidos nesta tabela. Campos têm tabela própria. Recalcular se houver mistura, vidro, overlay ou novo fundo.

| Texto / token | bg | surface | surface-2 | Uso |
|---|---:|---:|---:|---|
| `fg` | 16.07:1 | 14.01:1 | 12.02:1 | texto principal |
| `fg-muted` | 12.30:1 | 10.73:1 | 9.20:1 | texto secundário |
| `fg-subtle` | 7.26:1 | 6.33:1 | 5.43:1 | ajuda/label |
| `fg-faint` | 3.60:1 | 3.14:1 | 2.69:1 | só decoração/desabilitado |
| `accent` | 4.36:1 | 3.80:1 | 3.26:1 | somente grande negrito ou decoração |
| `accent-soft` | 5.85:1 | 5.10:1 | 4.38:1 | texto pequeno só em bg/surface |
| `sucesso` | 10.67:1 | 9.30:1 | 7.98:1 | ícone + mensagem |
| `aviso` | 10.43:1 | 9.09:1 | 7.80:1 | ícone + mensagem |
| `erro` | 8.14:1 | 7.09:1 | 6.09:1 | ícone + mensagem |

| Combinação adicional | Contraste | Decisão |
|---|---:|---|
| `white` sobre `accent-strong` | 4.71:1 | CTA pequeno aprovado |
| `white` sobre `accent-deep` | 5.73:1 | hover/active CTA aprovado |
| `white` sobre `accent` | 3.90:1 | reprovado para CTA pequeno |
| `fg` sobre `campo` | 17.02:1 | texto de input |
| `fg-placeholder` sobre `campo` | 7.69:1 | placeholder |
| `border-strong` sobre `campo` | 8.50:1 | limite essencial de input |
| `border-strong` sobre `surface-2` | 6.01:1 | limite/seleção essencial |
| `border` sobre `surface` | 1.30:1 | só separador decorativo |
| `black` sobre `white` | 21.00:1 | matriz do QR e impressão |

Regra vinculante: laranja `--color-accent` em texto apenas **≥18,66px em negrito (≥700)**, também verificando mínimo 3:1 sobre o fundo real; como margem prática, usar 19px. Abaixo disso usar fg/fg-muted ou accent-soft somente nos fundos aprovados (≥4,5:1). Texto comum ≥4,5:1; informação essencial de contorno/foco ≥3:1. O anel accent tem ≥3:1 nos três fundos listados, mas não deve ser desenhado diretamente sobre o CTA: offset 3px deixa o anel sobre fundo escuro. Em impressão clara usar foco/texto preto. Não usar fg-faint como ajuda, placeholder ou informação necessária; não atenuar todo o componente com opacity.

Chips com tintas semânticas, hover branco 6% e vidro exigem aferição do composto na implementação; não presumir que o contraste da cor pura se mantém. Usar texto fg sobre tintas se necessário. Links pequenos ficam fg-muted + sublinhado; contraste não depende só de cor. Conferir alvos ≥44px, ordem/foco por teclado, zoom 200%, axe sem serious/critical e reduced-motion. As regras de erro e status mantêm texto e ícone.

## 6. Fora da marca, exceções e entrega

| Manter | Adaptar ao pix2qr | Não copiar |
|---|---|---|
| Verde-grafite, brasa, Outfit pesada, mono nos dados | Hierarquia compacta com formulário e resultado próximos | Wordmark, símbolo ou identidade literal de outra marca (exceção: o símbolo S da Salaria somente como favicon, decisão do dono em 2026-10-22) |
| Pílulas, campos 16px, cartões 24px | Opacidade estável no formulário; contraste e foco externo | Código de componentes, screenshots e referências privadas |
| Motion lento nos efeitos e feedback curto nos controles | Operações locais sem espera artificial | WebGL, globo/moedas 3D, números que mudam sem fonte |
| Texto técnico preciso | Conteúdo próprio e nomes acessíveis preservados | Copy, fluxos ou regras de outro produto |

Fora da marca: verde esmeralda, hexágono como símbolo, Inter, acento azul/roxo, hero com gradiente azul-roxo, cores de identificação como tema, tipo abaixo de 11px, título invisível até JS, foco que troca raio, excesso de brilho e movimento contínuo no QR. Nenhum microtexto do kit histórico é autorização para baixar o mínimo de 11px.

Exceções obrigatórias: QR preto em fundo branco opaco com **quiet zone de quatro módulos**, inclusive PNG/SVG/clipboard; sem inversão em dark mode, `filter`, transparência ou textura. A prévia, canvas exportado e `@media print` da placa permanecem claros, com texto preto, medidas A4/A5/balcão preservadas, sem sombras decorativas nem fundo verde impresso. Conteúdo e recursos de impressão continuam acessíveis. O pix2qr preserva seu nome e ícone próprios.

Riscos e lacunas: o domínio atual não respondeu; estados da direção B foram lidos em arquivos, não executados ao vivo nesta rodada. Capturas do kit são históricas. Select/tabs/toast são adaptações explicitamente inferidas; não criar novas jornadas só para demonstrá-los. A tipografia/spacing novos precisam de validação visual nas quatro páginas. Transparências exigem contraste composto. As licenças de fontes/ícones novos devem ser incorporadas junto com seus arquivos no card de implementação. Esta especificação não afirma UI implementada nem resultado de Lighthouse.

Operação dos próximos cards: ler esta spec, preservar invariantes da seção 4, implementar em worktree própria sobre `stage`, comprovar primeiro formulário/resultado em desktop e mobile; depois placa e documentos. Conteúdo visível sem JS e QR decodificável são critérios iniciais. Rodar os 11 gates do CONTRIBUTING nos cards de código, CI do PR verde, Lighthouse ≥90 nas quatro categorias, axe, teclado, offline/instalação e screenshots pix2qr a 1280 e 390×844. `main` aguarda aprovação do dono.

Checklist documental do PIX-6:

- [x] Tokens congelados com mesmos nomes/valores; extensões separadas e inferidas.
- [x] Pesos e hashes de fontes verificados; somente dois pesos de Plex propostos.
- [x] Todos os componentes pedidos e seis estados definidos, com N/A explícito quando estáticos.
- [x] Todos os IDs das quatro páginas cobertos e conteúdo/JSON-LD/seletores protegidos.
- [x] Contraste calculado e exceções QR/print explícitas.
- [x] Referências privadas fora do repo; entrega pública só deste Markdown.
- [ ] Aprovação visual da UI: responsabilidade dos cards de implementação, após este contrato.
