# Gerador CNC parametrizado (Fanuc) — Torno ML-600L — Alumasa

Contexto para qualquer sessão do Claude (qualquer conta). Leia isto primeiro, depois `Gerador/CHANGELOG.md`.

## O que é
Aplicação web local (HTML/JS puro, sem build) que gera programas Fanuc (G71/G70/G72/G75/G74/G76, macros #vars) para o torno ML-600L, a partir de parâmetros e de um desenho de peça. Inclui simulador XZ, banco de ferramentas e testes de regressão.

## Estado atual
- **Versão 2.3.0** (08/10/2026) — **tela de entrada com 3 usuários**: `admin` (tudo), `simu` (só Simulação e Ferramentas), `desenho` (só Desenho da peça). Trava de uso, não de segurança (ver `acesso.js`).
- Plano de 6 etapas concluído em 2.0.0; 2.1.x refinou o porta-matriz; 2.2.0/2.2.1 criaram o módulo Simulação (cola programa pronto, lê as ferramentas T, escolhe do banco com desenho de inserto + suporte e simula numa janela própria).
- Geometrias: matriz sólida, matriz tubular, espina (2 lados), BA/BAT, porta-matriz (2 lados), alimentador padrão (2 lados), peça simples (desenho livre com cilindro/cone/canal externo e interno/rosca G76/chanfro/raio).
- Operações do menu: Gerador, Desenho da peça, Ferramentas, **Simulação**; Configurações no cabeçalho.

## Estrutura (pasta `Gerador/`)
- `core.js` núcleo/geradores de código · `app.js` interface do Gerador · `acesso.js` tela de entrada e permissões por usuário (senhas em SHA-256; para trocar, ver o topo do arquivo) · `desenho.js` + `pecaview.js` Desenho da peça · `sim.js`/`simview.js` simulador (`SimView.create(prefixo)`: uma janela por tela) · `progsim.js` leitor/interpretador de programa Fanuc colado · `progview.js` tela do módulo Simulação · `seed.js` ferramentas de partida · `version.js` número da versão · `test.js` testes (chama `testprog.js`, que inclui a comparação gerado × lido) · `versionar.js` cria cópia em `versoes/`
- `Exemplos de programaçaõ/` programas validados da casa (referência de verdade) · `Manuais da maquina/` · `EXEMPLO PORTA MATRIZ.jpg` croqui.

## Como rodar
- Uso normal: abrir `Gerador/index.html` no navegador (dados ficam no navegador, localStorage).
- Teste local com servidor: `node Gerador/serve.js` (porta 5173; `.claude/launch.json` já configura).
- Testes: `cd Gerador; node test.js` (deve passar sem `VARS INDEF` nem `NaN`, e terminar com `0 falhas` no módulo Simulação).

## Regras de trabalho (decididas pelo usuário)
- **Cada melhoria = nova versão** `MAIOR.MENOR.CORREÇÃO`: escrever antes a entrada no topo de `CHANGELOG.md`, atualizar `version.js`, rodar `node versionar.js X.Y.Z` (copia completa em `versoes/vX.Y.Z/`).
- **Toda versão nova vai para o GitHub** (repo privado `Nosdalg123/gerador-cnc-fanuc`): depois de `versionar.js` e `node test.js` OK, fazer `git add -A`, `git commit -m "vX.Y.Z - resumo"` e `git push`, sem precisar pedir. Fora do repo (`.gitignore`): `Manuais da maquina/`, `.claude/`.
- Código gerado deve conferir com os programas validados da casa quando existe exemplo; casos antigos devem permanecer **idênticos** (testes de regressão).
- O que não tem exemplo da casa vai para `VALIDAR-NA-MAQUINA.md`; rodar a seco antes de cortar.
- Idioma: português do Brasil. Comentários do programa CNC em maiúsculas entre parênteses.

## Pendências
- Validar na máquina real tudo o que está em `Gerador/VALIDAR-NA-MAQUINA.md` (limites da ML-600L, canal interno, rosca G76, alimentador, G72 interno, T-MAX, pastilha/raio de ponta).
- Validar na máquina também as suposições do leitor de programas (seção "Módulo Simulação" do `VALIDAR-NA-MAQUINA.md`).
- Novas geometrias/ajustes entram como nova versão a partir de 2.2.2 / 2.3.0.

## Índice do código (economia de tokens)
- Antes de fazer buscas textuais amplas (grep) ou ler arquivos inteiros, leia primeiro o `PROJECT_INDEX.json` para localizar as declarações e linhas exatas (cada símbolo = `[nome, tipo, linha_inicio, linha_fim, pai]`).
- Carregue no contexto apenas as faixas de linhas estritamente necessárias para a tarefa (Read com `offset`/`limit`). `core.js` tem ~2.850 linhas: nunca leia inteiro.
- Sempre que criar novos arquivos ou renomear/adicionar funções estruturais, execute `python indexer.py` para manter o índice sincronizado (`python indexer.py --check` só confere). O índice ignora `versoes/` (cópias), `Manuais da maquina/` e caches.

