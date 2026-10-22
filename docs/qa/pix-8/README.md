# PIX-8 — evidências locais

Artefato `dist/` servido em localhost:8488; Chrome headless, 22/10/2026.

- 11 gates do CONTRIBUTING: exit 0, incluindo 100 testes na fonte e no artefato e os quatro E2E.
- Axe: zero violações nas três páginas em 1280×900, 390×844 e 320×800; nenhum overflow horizontal.
- Lighthouse mobile: Privacidade e Licenças 100/100/100/100; Placa 99/100/100/100 (Performance/Acessibilidade/Boas práticas/SEO). Scores em lighthouse-local.json.
- Canvas comparado via toDataURL contra HTML de origin/stage @ 2088aef, com os mesmos scripts e dados sintéticos: igualdade exata nos três presets.
- Bytes do PNG baixado iguais ao canvas; canvas de impressão igual ao preview. Mídia print emulada via Playwright/Chromium: fundo branco e navegação oculta, nos três presets.
- Screenshots das três páginas em desktop/mobile e da impressão nos três presets anexadas neste diretório. Só fixtures sintéticas.
- JSON-LD da home, código PIX, placa.js, CSP e rewrites inalterados.

As capturas de impressão mostram o canvas no viewport; dimensões físicas e margens continuam controladas pelo diálogo de impressão do navegador, como antes.
Validação HTTP após merge em stage cabe ao piloto. O preview remoto tem noindex obrigatório; SEO remoto não pode satisfazer ≥90 enquanto essa proteção estiver presente.
