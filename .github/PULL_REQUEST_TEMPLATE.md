<!-- Obrigado pelo PR! Mantenha-o pequeno e focado. -->

## O que muda
<!-- Descreva o que e por quê. -->

## Tipo
- [ ] 🐛 Correção de bug
- [ ] ✨ Feature
- [ ] ♻️ Refactor / chore
- [ ] 📝 Docs

## Checklist
- [ ] **Atualizei o `CHANGELOG.md`** (`## [Não lançado]`) se a mudança afeta comportamento/usuário. *(O CI exige — exceção: `[skip changelog]` no título do PR.)*
- [ ] Se mexi no núcleo (`pix-core.js`), rodei `node --test test/*.test.js` e está verde.
- [ ] Se a mudança afeta **valor/chave/recebedor**, validei que não gera nem exibe um valor **errado** (a regra de ouro do projeto).
- [ ] Testei no navegador com cache/Service Worker limpos.
- [ ] Fixtures são integralmente sintéticas; não embuti segredo, dado pessoal,
      chave PIX registrada, cobrança real nem token de PSP.
