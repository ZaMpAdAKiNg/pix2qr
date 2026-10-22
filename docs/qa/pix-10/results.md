# PIX-10 — validação local

- 11 gates do CONTRIBUTING: exit 0.
- Teste do banner: falhou sem implementação; passou nas quatro páginas.
- Layout e teclado: 320, 390, 719, 720, 768 e 1280 px; sem sobreposição ou overflow; alvo ≥44 px; foco 2 px e offset 3 px.
- Enter abre nova aba com ref=DAE e window.opener=null (destino interceptado no contexto do navegador).
- Lighthouse mobile: Performance 97, Accessibility 100, Best Practices 100, SEO 100; CLS 0.006461994728540877.
- Screenshots: artefato dist, Chrome headless, 1280×844 e 390×844. SW desabilitado só na captura para evitar fallback de URLs .html no servidor Python; PWA validada separadamente pelo gate existente.

Copy: “Converta USDT em PIX com a Salaria.tech”. Descreve a ação e o destino, sem promessa de prazo, segurança ou preço. Tipografia Outfit e tokens existentes mantidos.

Skills ausentes informadas pelo solicitante: web-design-guidelines, frontend-skill, escrita. Fallback: inspeção visual e testes locais de layout, teclado e Lighthouse.
