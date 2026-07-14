<!-- Codex-authored public project document. -->

# Privacidade

O pix2qr processa no navegador chaves PIX, valores, nomes, cidades, códigos
Copia-e-Cola, conteúdo decodificado, dados da área de transferência e imagens
selecionadas. O código da aplicação não envia esse conteúdo para um backend do
pix2qr, não cria conta e não o grava em banco de dados.

## Telemetria técnica

O site carrega o script vendorizado do Umami. A implementação atual pode
transmitir ao serviço de analytics metadados técnicos
como URL visitada, origem de referência, hostname, título da página, idioma,
dimensão da tela e informações usuais da requisição, além de eventos de uso com
categorias fixas (por exemplo, geração, cópia, download ou instalação).

Antes do tracker executar, `analytics-privacy.js` registra filtros first-party.
No Umami, `data-exclude-search`, `data-exclude-hash` e
`data-before-send` removem query/fragmento e reduzem URL/referrer a origem +
caminho; `data-do-not-track` respeita a preferência DNT do navegador. Um teste
de rede injeta probes sintéticos em query, hash, referrer e formulário e falha
se qualquer um aparecer nos requests do Umami.

Os eventos definidos em `app.js` não incluem chave PIX, valor, nome, cidade,
payload, conteúdo decodificado, texto copiado ou imagem. O repositório, porém,
não controla nem comprova sozinho as políticas, retenção e configuração dos
serviços de terceiros. Bloqueadores de conteúdo ou uso offline podem impedir a
telemetria.

## Armazenamento local e PWA

O Service Worker armazena apenas os arquivos estáticos necessários ao
funcionamento offline. O pix2qr não usa `localStorage`, `sessionStorage` ou
IndexedDB para persistir dados de pagamento. O navegador pode manter o conteúdo
visível na aba, na área de transferência, no histórico de downloads ou em caches
sob controle do próprio usuário.

## Limites e reporte

Não coloque chaves, payloads ou cobranças reais em issues, pull requests ou
fixtures. Para uma vulnerabilidade, use o canal privado indicado em
[SECURITY.md](SECURITY.md); se o botão de reporte privado não estiver disponível,
não publique o material sensível numa issue.

Esta descrição documenta o comportamento observável do código nesta versão e
não constitui parecer jurídico nem certificação de conformidade com a LGPD.
