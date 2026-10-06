# Gerador CNC parametrizado (Fanuc) — Torno ML-600L — Alumasa

Contexto para qualquer sessão do Claude (qualquer conta). Leia isto primeiro, depois `Gerador/CHANGELOG.md`.

## O que é
Aplicação web local (HTML/JS puro, sem build) que gera programas Fanuc (G71/G70/G72/G75/G74/G76, macros #vars) para o torno ML-600L, a partir de parâmetros e de um desenho de peça. Inclui simulador XZ, banco de ferramentas e testes de regressão.

## Estado atual
- **Versão 2.1.2** (06/10/2026) — plano de 6 etapas concluído em 2.0.0; 2.1.x refinou o porta-matriz (desenho com cotas A–M, 2 lados).
- Geometrias: matriz sólida, matriz tubular, espina (2 lados), BA/BAT, porta-matriz (2 lados), alimentador padrão (2 lados), peça simples (desenho livre com cilindro/cone/canal externo e interno/rosca G76/chanfro/raio).
- Operações do menu: Gerador, Desenho da peça, Ferramentas; Configurações no cabeçalho.

## Estrutura (pasta `Gerador/`)
- `core.js` núcleo/geradores de código · `app.js` interface do Gerador · `desenho.js` + `pecaview.js` Desenho da peça · `sim.js`/`simview.js` simulador · `seed.js` ferramentas de partida · `version.js` número da versão · `test.js` testes · `versionar.js` cria cópia em `versoes/`
- `Exemplos de programaçaõ/` programas validados da casa (referência de verdade) · `Manuais da maquina/` · `EXEMPLO PORTA MATRIZ.jpg` croqui.

## Como rodar
- Uso normal: abrir `Gerador/index.html` no navegador (dados ficam no navegador, localStorage).
- Teste local com servidor: `node Gerador/serve.js` (porta 5173; `.claude/launch.json` já configura).
- Testes: `cd Gerador; node test.js` (deve passar sem `VARS INDEF` nem `NaN`).

## Regras de trabalho (decididas pelo usuário)
- **Cada melhoria = nova versão** `MAIOR.MENOR.CORREÇÃO`: escrever antes a entrada no topo de `CHANGELOG.md`, atualizar `version.js`, rodar `node versionar.js X.Y.Z` (copia completa em `versoes/vX.Y.Z/`).
- Código gerado deve conferir com os programas validados da casa quando existe exemplo; casos antigos devem permanecer **idênticos** (testes de regressão).
- O que não tem exemplo da casa vai para `VALIDAR-NA-MAQUINA.md`; rodar a seco antes de cortar.
- Idioma: português do Brasil. Comentários do programa CNC em maiúsculas entre parênteses.

## Pendências
- Validar na máquina real tudo o que está em `Gerador/VALIDAR-NA-MAQUINA.md` (limites da ML-600L, canal interno, rosca G76, alimentador, G72 interno, T-MAX, pastilha/raio de ponta).
- Novas geometrias/ajustes entram como nova versão a partir de 2.1.3 / 2.2.0.
