# Gerador CNC parametrizado (Fanuc) — Torno ML-600L — Alumasa

Contexto para qualquer sessão do Claude (qualquer conta). Leia isto primeiro, depois `Gerador/CHANGELOG.md`.

## O que é
Aplicação web local (HTML/JS puro, sem build) que gera programas Fanuc (G71/G70/G72/G75/G74/G76, macros #vars) para o torno ML-600L, a partir de parâmetros e de um desenho de peça. Inclui simulador XZ, banco de ferramentas e testes de regressão.

## Estado atual
- **Versão 2.22.2 na branch revisoes/v2.22.2-revisao-completa** (12/10/2026; main preservada): revisão real completa do importador, Disco com face curva/109,50 mm, conferência dimensional e roscas/notas de blocos; localizar cota/curva do Copo e Z0 na extremidade real. Relatório `Gerador/REVISAO-COMPLETA-2.22.2.md`. CNC dos CADs reais continua bloqueado: ainda não há associação automática de curvas/operações; Copo precisa conferir Ø79,10 e SPLINE 110.
- **Versão 2.22.1 na branch revisoes/v2.22.1-teste-dxf-real** (12/10/2026; main preservada): testes reais Disco/Copo concluídos, seleção precisa do ponteiro, recorte LINE/ARC no eixo sem alterar a fonte; corte/quebra/extensão por interseção na etapa 2. Consultar `Gerador/REVISAO-2.22.1-DXF-REAL.md`. Os anexos estão organizados em CNC/Referencias, com índice persistente `CNC-Memoria-Consulta.md`; não enviar DXFs/PDFs de fabricação ao repositório público.
- **Versão 2.17.0 na branch feature/perfil-superior-cad-v2.17.0** (11/10/2026; main preservada): semiperfil superior editável, inferior construção, seleção explícita, corte/quebra e extensão por interseção; Gerador/TESTE-SEMIPERFIL-2.17.md.\n- **Versão 2.16.0 na branch feature/importador-inteligente-v2.16.0** (11/10/2026; main preservada): fluxo importar/conferir/salvar, troca de vista por miniaturas, seleção simples e reparos contextuais; detalhes em Gerador/IMPORTADOR-INTELIGENTE-2.16.md.\n- **Versão 2.15.0 na branch feature/dxf-editor-interativo-v2.15.0** (11/10/2026; main 2.7.1): reconhecimento automático assistido de cadeias DXF, retângulos visíveis, edição por clique/quadro, extensão LINE, desfazer, Z0 simples e rascunhos; consultar Gerador/TESTE-DXF-EDITOR-2.15.md.\n- **Versão 2.14.0 na branch feature/dxf-perfis-v2.14.0** (11/10/2026; main 2.7.1): correção da maior componente DXF, cadeias e bifurcações, auditoria de segurança CNC, persistência de confirmação e testes dos CADs reais; ver Gerador/TESTE-DXF-CADEIAS.md.\n- **Versão 2.13.0 na branch feature/dxf-geometria-v2.13.0** (11/10/2026; main em 2.7.1): parser DXF CAD real com geometria vetorial e DIMENSION, seleção de contorno, escala uniforme, correção no editor, rascunhos bloqueados no Gerador e prévia vetorial PDF; detalhes em Gerador/TESTE-DXF-REAIS.md.\n- **Versão 2.12.0 na branch feature/pdf-copo-v2.12.0** (11/10/2026; main 2.7.1): caso de teste Copo 7″, seleção por extensão da cota, reconhecimento m10/R3/R6,50/6°, bloqueio em seção densa; limites no Gerador/TESTE-COPO7.md.\n- **Versão 2.11.0 na branch feature/pdf-orientacao-disco-v2.11.0** (11/10/2026; main em 2.7.1): cotas do Disco 7″, escolha obrigatória de vista e face Z0, proteção contra dimensões ambiguas, metadados de orientação, testes G71. Veja Gerador/TESTE-DISCO7.md.\n- **Versão 2.10.0 na branch feature/pdf-escala-v2.10.0** (11/10/2026; main preservada em 2.7.1) — importação de PDF com seleção de vista, escala uniforme em X/Ø, edição clicando nas cotas e salvamento na lista do Gerador. Limitações e testes no LEIAME/CHANGELOG.\n- **Versão 2.7.1** (09/10/2026) — leitor entende o modo ISO do Siemens 802D sl: `G291`/`G290` em silêncio e `G92 S` = limite de rotação em G96 (como o `G50 S`). Falta confirmar se esse comando aceita Macro B (`#`), ver `VALIDAR-NA-MAQUINA.md`.
- **2.7.0** (09/10/2026) — **diagnóstico de erros do programa** (`diagnostico.js`, 73 tipos de erro, cada um com causa, solução e, quando dá, correção pronta com Aplicar/Desfazer na tela Simulação); alertas do simulador também trazem causa e solução; bloco "Diagnóstico do programa gerado" na janela do Gerador. Testes em `testdiag.js`.
- **2.6.0** (09/10/2026) — o **Gerador gera G73** (opção "Paralelo ao perfil" no desbaste externo) e **G41/G42** (campo "Compensação do raio de ponta" no Acabamento; o último bloco do contorno cancela com G40 para o retorno do G70 sair da compensação); banco de ferramentas ganhou o **ângulo do suporte κ** (a pastilha da simulação gira 180° − κ − ponta). Valem para peça simples, porta-matriz e alimentador; sem as opções o programa é idêntico ao de antes.
- **2.5.0** (09/10/2026) — o **programa decodificado** (faixa verde sob o código: `G0Z[[#1+#2]*#3]` → `G0Z[8]`) vale também na janela de simulação do Gerador; programas da casa `COPO BRUTO P2 P3` (G73, G72 interno, G74, G76) em `Exemplos de programaçaõ/` e nos testes.
- **2.4.0** — Simulação ganhou o visor decodificado, ciclo **G73** (padrão Fanuc: U/W = afastamento total, confirmado pelo programa da casa) e **G41/G42** (raio de ponta vem do banco; sem raio = aviso). (O Gerador passou a gerar os dois na 2.6.0.)
- **2.3.0** — **tela de entrada com 3 usuários**: `admin` (tudo), `simu` (só Simulação e Ferramentas), `desenho` (só Desenho da peça). Trava de uso, não de segurança (ver `acesso.js`).
- Plano de 6 etapas concluído em 2.0.0; 2.1.x refinou o porta-matriz; 2.2.0/2.2.1 criaram o módulo Simulação (cola programa pronto, lê as ferramentas T, escolhe do banco com desenho de inserto + suporte e simula numa janela própria).
- Geometrias: matriz sólida, matriz tubular, espina (2 lados), BA/BAT, porta-matriz (2 lados), alimentador padrão (2 lados), peça simples (desenho livre com cilindro/cone/canal externo e interno/rosca G76/chanfro/raio).
- Operações do menu: Gerador, Desenho da peça, Ferramentas, **Simulação**; Configurações no cabeçalho.

## Estrutura (pasta `Gerador/`)
- `core.js` núcleo/geradores de código · `app.js` interface do Gerador · `acesso.js` tela de entrada e permissões por usuário (senhas em SHA-256; para trocar, ver o topo do arquivo) · `desenho.js` + `pecaview.js` Desenho da peça · `sim.js`/`simview.js` simulador (`SimView.create(prefixo)`: uma janela por tela) · `progsim.js` leitor/interpretador de programa Fanuc colado · `diagnostico.js` catálogo de erros com causa/solução e correções (usado pela Simulação e pela janela do Gerador) · `progview.js` tela do módulo Simulação · `seed.js` ferramentas de partida · `version.js` número da versão · `test.js` testes (chama `testprog.js`, que inclui a comparação gerado × lido, e `testdiag.js`, um caso por tipo de erro do catálogo) · `versionar.js` cria cópia em `versoes/`
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

## Formato das respostas e padrão CNC (instruções do usuário, valem em toda sessão)
# Output Guidelines
- Do not stream internal thoughts, tool traces, or intermediate debugging steps.
- Keep final summaries concise, technical, and structured.
- Use only: Overview, Files Changed, Test Status, and Pending Machine Validations.
- CNC Standard: Always follow strict Fanuc ISO (Macro B).

## Pendências
- Validar na máquina real tudo o que está em `Gerador/VALIDAR-NA-MAQUINA.md` (limites da ML-600L, canal interno, rosca G76, alimentador, G72 interno, T-MAX, pastilha/raio de ponta).
- Validar na máquina também as suposições do leitor de programas (seção "Módulo Simulação" do `VALIDAR-NA-MAQUINA.md`).
- Novas geometrias/ajustes entram como nova versão a partir de 2.2.2 / 2.3.0.

## Índice do código (economia de tokens)
- Antes de fazer buscas textuais amplas (grep) ou ler arquivos inteiros, leia primeiro o `PROJECT_INDEX.json` para localizar as declarações e linhas exatas (cada símbolo = `[nome, tipo, linha_inicio, linha_fim, pai]`).
- Carregue no contexto apenas as faixas de linhas estritamente necessárias para a tarefa (Read com `offset`/`limit`). `core.js` tem ~2.850 linhas: nunca leia inteiro.
- Sempre que criar novos arquivos ou renomear/adicionar funções estruturais, execute `python indexer.py` para manter o índice sincronizado (`python indexer.py --check` só confere). O índice ignora `versoes/` (cópias), `Manuais da maquina/` e caches.

