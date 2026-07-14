# pix2qr — Gerador de QR Code PIX com processamento local

> Gere e leia QR Codes PIX (BR Code / EMV-MPM) inteiramente no navegador.
> **Sem cadastro e sem backend de pagamentos.** Funciona offline como PWA.

🔗 **https://pix2qr.xyz**

PIX é o sistema de pagamento instantâneo do Banco Central do Brasil. Esta
ferramenta gera e decodifica o conteúdo PIX no próprio dispositivo: chaves,
valores, nomes, cidades, payloads e imagens selecionadas não são enviados pelo
pix2qr. Há telemetria técnica de acesso e uso, descrita em [PRIVACY.md](PRIVACY.md).

## Aviso importante

O pix2qr é uma ferramenta independente: não é banco, PSP nem serviço do Banco
Central do Brasil, não é oficial, afiliado ou endossado por essas instituições e
não oferece orientação financeira ou jurídica. Ele apenas gera e exibe dados
localmente; não inicia, intermedeia, autoriza, garante nem estorna pagamentos PIX.
Antes de confirmar no app do banco, confira o nome do recebedor, a chave PIX e o
valor.

Este site e seu código são fornecidos **como estão**, sem garantias. Na máxima
medida permitida pela legislação aplicável, o projeto e seu desenvolvedor não se
responsabilizam por uso indevido, dados incorretos informados pelo usuário,
pagamentos enviados ao destinatário errado, falhos ou duplicados, perdas
financeiras nem consequências diretas ou indiretas decorrentes do uso. Nada neste
aviso exclui direitos ou responsabilidades que a lei brasileira não permita
excluir.

## Funcionalidades

- **Gerar QR Code PIX** a partir de CPF, CNPJ numérico ou alfanumérico, e-mail
  ASCII, telefone E.164 (`+...`) ou EVP (UUID hexadecimal canônico). CPF/CNPJ
  usam os dígitos verificadores oficiais; entradas são normalizadas para a
  gramática da API DICT 2.12.0.
- **Ler/decodificar** um QR Code PIX existente (upload de imagem ou foto) e
  convertê-lo em Copia-e-Cola.
- **Re-renderizar** um Copia-e-Cola como QR Code, validando o CRC16.
- **Resumo do pagamento** ao colar um Copia-e-Cola: valor, recebedor, cidade —
  distinguindo QR **estático** (valor fixo) de **dinâmico** (valor resolvido pelo
  PSP no app do banco) e os três cenários de **Pix Automático** (somente
  recorrência, estático + recorrência e dinâmico + recorrência). O pix2qr não
  acessa as URLs do PSP.
- **Valor opcional** com formatação BR (`R$ 1.234,56`).
- **Offline-first** (Service Worker) e **instalável** como PWA.

## Privacidade

Toda geração e decodificação do conteúdo PIX roda em JavaScript no navegador. Não
há backend, banco de dados ou log de pagamentos do pix2qr. O Umami recebe
telemetria técnica de acesso e eventos de uso; os eventos
definidos pelo projeto não incluem chave, valor, nome, cidade, payload ou imagem.
Query, fragmento e parâmetros de referência são removidos antes do envio; URL e
referrer, quando presentes, ficam reduzidos a origem + caminho, e a preferência
Do Not Track do navegador é respeitada.
Veja os dados e limites conhecidos em [PRIVACY.md](PRIVACY.md).

As validações de engenharia são baseadas no
[DICT API 2.12.0](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/API-DICT.html),
[cálculo do DV do CNPJ alfanumérico da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj), no
[Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf),
no [Manual do BR Code](https://www.bcb.gov.br/content/estabilidadefinanceira/spb_docs/ManualBRCode.pdf)
e no padrão [EMV Merchant-Presented QR](https://www.emvco.com/emv-technologies/qr-codes/).
Isso não constitui homologação, certificação regulatória nem parecer de
conformidade jurídica ou LGPD.

## Rodar localmente

É um site estático sem build em runtime — qualquer servidor HTTP serve:

```bash
git clone https://github.com/ZaMpAdAKiNg/pix2qr.git
cd pix2qr
python3 -m http.server 8000      # ou: npx serve .
# abra http://localhost:8000
```

O artefato de deploy usa dependências fixadas e uma allowlist pública:

```bash
npm ci
bash scripts/build.sh
# saída pública: dist/
```

> **Service Worker:** ao testar mudanças de JS/HTML localmente, limpe o SW e os
> caches (DevTools → Application → Service Workers → Unregister + Clear storage),
> senão o cache antigo mascara o que mudou.

### Testes

O núcleo puro de PIX (`pix-core.js`) tem testes sem dependências:

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

## Arquitetura

- **HTML/CSS/JS vanilla**, zero framework, sem bundler.
- [`pix-core.js`](pix-core.js) — núcleo **puro** e testável: CRC16, montagem/parse
  TLV (EMV-MPM), parsing de chave e de Copia-e-Cola, normalização de valor.
- [`app.js`](app.js) — camada de UI/DOM (consome `pix-core.js`).
- [`analytics-privacy.js`](analytics-privacy.js) — redação first-party antes do
  Umami.
- [`image-metadata.js`](image-metadata.js) — lê dimensões PNG/JPEG/GIF/WebP antes
  do decode e bloqueia imagens acima de 25 megapixels.
- [`sw.js`](sw.js) — Service Worker com shell versionado e atômico: HTML, núcleo,
  UI e encode/decode de QR só trocam juntos depois de baixar e validar todos os
  recursos; a versão anterior permanece funcional offline se o update falhar.
- Libs vendadas (jsQR, node-qrcode) — ver [THIRD_PARTY.md](THIRD_PARTY.md).
- Hospedado na Vercel (estático); CSP estrita, headers de hardening em
  [`vercel.json`](vercel.json).

## Contribuindo

PRs são bem-vindos. Leia [CONTRIBUTING.md](CONTRIBUTING.md). O fluxo resumido:

1. Faça um fork e crie um branch.
2. Se mexer no núcleo, rode `node --test test/*.test.js` (o CI exige verde).
3. **Toda mudança de comportamento gera uma entrada no `CHANGELOG.md`** (seção
   `## [Não lançado]`) — o CI exige isso quando o PR toca código/HTML/SW.
   Exceção pra mudanças irrelevantes: `[skip changelog]` no título do PR.
4. Abra um PR contra `main`. **`main` tem checks obrigatórios** (`sanity`,
   `build-gates` e `e2e-smoke`). A política pública também exige PR e resolução
   de conversas. Cada PR recebe um preview protegido na Vercel; o merge em
   `main` dispara o deploy de produção em `pix2qr.xyz`.

**Regra de ouro (app financeiro):** nunca exibir nem gerar um valor/chave de
pagamento que possa estar **errado**. Entrada ambígua vira erro explícito, nunca
um número coagido silenciosamente. Veja os testes de `normalizeValorParaPayload`.

## Licença

[MIT](LICENSE).
