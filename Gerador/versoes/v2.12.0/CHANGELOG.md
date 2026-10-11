# Histórico de versões — Gerador CNC Torno

Cada melhoria gera uma versão (`MAIOR.MENOR.CORREÇÃO`, ex.: 1.1.1). Uma cópia completa de cada versão fica em `versoes/vX.Y.Z/`.

**Para voltar a uma versão:** copie o conteúdo de `versoes/vX.Y.Z/` por cima da pasta do gerador (menos a pasta `versoes`). Os dados (ferramentas, valores digitados) ficam no navegador e não são afetados.

**Para guardar uma nova versão:** `node versionar.js 1.2.0` (escreva antes a entrada abaixo; a cópia leva o texto junto).

---

## 2.12.0 — 11/10/2026 — Reconciliação de cotas entre vistas e auditoria CNC
- Escopo firmado: somente geometrias de revolução e PDFs técnicos vetoriais; PDFs escaneados e recursos fora do eixo de rotação não são convertidos automaticamente.
- Novo `pdfreconcile.js`: separa dimensão extraída, característica CNC, vista de origem, referência explícita, estado conferido e vínculo escolhido pelo usuário.
- Medidas de outras vistas aparecem como **sugestões** de correspondência. O valor só é aplicado depois de associar a cota ao campo correto; valores iguais sem identidade da característica não bastam para provar o vínculo.
- Detecta dimensão sem cota confirmada, cota conflitante para a mesma característica, dimensão em outra vista e anotação não representada no perfil. O salvamento direto exige resolução de todas as pendências e escolha da face Z0.
- Solucionador `solveAxial`: calcula distâncias usando somas/diferenças de restrições axiais com extremos identificados; reporta falta de âncora e contradição, sem estimar dimensões por pixels. Ainda requer a associação confiável dos extremos das linhas de cota.
- Sugere face Z0 conforme limitações geométricas do G71, mas a aplicação exige decisão humana e conferência de fixação.
- Novo `pdfaudit.js`: controla raios, roscas e detalhes que exigem elementos explícitos; ao abrir rascunho no editor completo o salvamento fica bloqueado até revisão geométrica. O Gerador também impede código CNC se um desenho salvo contiver pendências.
- Desenhos conferidos guardam a origem do PDF, orientação e evidências das cotas juntamente com seu modelo CNC.
- Testes automatizados em `testpdfreconcile.js`, preservados todos os testes de versões anteriores. Não foi feita certificação de usinagem.
- **Limitação explícita:** ainda não existe reconhecedor universal de qualquer contorno curvo/raio/rosca, nem correspondência totalmente automática de todas as cotas entre vistas. A versão adiciona a infraestrutura e as verificações de segurança para evoluir esse reconhecimento.

## 2.11.0 — 11/10/2026 — Testes com Disco de Pressão 7″, orientação de torno e leitura por vista
- Avaliado PDF vetorial real de desenho mecânico com vista lateral, frontal, isométrica, vários comprimentos e diâmetros, M39 P2, M8×50, R3,50, R20 e 61°.
- Classificador de texto distingue comprimentos, diâmetros, raios, ângulos, roscas e chamadas roscadas. Datas e notas não entram como cotas.
- Detecção sugerida de vista lateral e frontal por contornos vetoriais da página; seleção manual também disponível. Os textos e linhas usados pertencem à vista selecionada.
- O operador escolhe explicitamente tipo de vista e qual extremidade corresponde à face Z0 no torno; o botão Salvar permanece bloqueado enquanto a orientação não estiver definida.
- Inversão troca a sequência dos elementos CNC e inverte início/fim dos cones. Checagem de perfil avisa quando o G71 tipo I rejeitaria um diâmetro que diminui em direção ao fundo.
- Novo algoritmo conservador usa a silhueta vetorial longitudinal para projetar um perfil externo APROXIMADO, sem confundir círculos da vista frontal. Aproximações e raios não são equivalentes a CAD.
- Se o PDF inclui raio, ângulo ou rosca que o painel simplificado não consegue guardar, bloqueia o salvamento direto e oferece transferência como rascunho para o editor completo, onde o usuário deve completar e conferir os detalhes antes de salvar.
- Novo teste `testpdfdisco.js` com cotas e geometrias de regressão derivadas de um exemplo, sem publicar o PDF original.
- Limites: não foi confirmada interpretação integral automática da peça complexa; detalhes internos e usinabilidade exigem revisão da ferramentaria; não foi feito teste de usinagem.

## 2.10.0 — 11/10/2026 — Escala proporcional, edição sobre cotas e seleção de vista no PDF
- Projeção XZ usa **escala geométrica uniforme**: o mesmo fator é aplicado ao comprimento e aos diâmetros (proporção X:Ø = 1:1), ajustada ao tamanho do painel; não promete escala física 1:1 em monitor.
- Cotas clicáveis na própria projeção, com edição de diâmetro, comprimento, cone e lado. É possível acrescentar/remover segmentos pelo painel, sem exibir uma lista técnica de partes.
- Campo **Nome do desenho** ao lado de um botão grande **Salvar desenho confirmado**. O botão só habilita após conferir a vista e confirmar a geometria.
- Usuário pode selecionar a vista correta por retângulo no PDF. Também aparecem atalhos quando uma legenda 'SEÇÃO/CORTE/VISTA' é detectada; a extração de cotas fica restrita à vista escolhida.
- Reconhecimento vetorial conservador de seções simétricas com segmentos retilíneos, tanto no eixo horizontal quanto vertical; além da identificação por texto de anéis simples.
- Perfis inferidos de linhas podem ter cotas aproximadas: exigem conferência e ajustes. Não se garante reconstrução universal de peças complexas, perfis com arcos, desenhos rasterizados, tolerâncias, detalhes escondidos ou cotas faltantes. Nunca se deve atribuir cotas a vistas diferentes sem seleção.
- Salva no mesmo formato da lista do Gerador, mantendo as versões anteriores isoladas. Testes em `testpdfscale.js`.
- **Atenção:** nada é executado na máquina. Simulador e revisão humana continuam obrigatórios.

## 2.9.0 — 11/10/2026 — Projeção CNC de PDF, confirmação e salvamento direto (branch isolada)
- Novo painel lado a lado: original PDF à esquerda e geometria CNC reconstruída à direita, independente da imagem e com cotas projetadas (Ø externo, Ø interno, comprimento total e trechos).
- Prévia SVG escalada somente para apresentação; os valores informados nas cotas, não os pixels, definem a geometria salva.
- Perfil recalculado ao editar qualquer cota, diâmetro, comprimento, cone ou lado; mudanças desmarcam a confirmação.
- Botão "Salvar desenho confirmado" só aparece após validação, nome informado e confirmação da geometria.
- Salva imediatamente o objeto de desenho padrão no mesmo localStorage e lista já utilizados pelo Gerador, selecionando o novo desenho automaticamente.
- Gerador de Peça simples mostra claramente "Importar desenho salvo" e lista os desenhos novos e manuais.
- Mantém o editor manual anterior e as versões 2.7.1 (main) e 2.8.0 (branch anterior) sem alterações.
- Limites: reconhecimento automático ainda direcionado a peça anular simples, sem OCR; dois lados requerem conferência no editor manual. É proibido rodar código CNC não validado na máquina.

## 2.8.0 — 11/10/2026 — Importação assistida de desenho PDF (branch isolada)
- Reconhecimento automático inicial de anéis cilíndricos com duas cotas de diâmetro e uma de comprimento (caso de teste: Peça1.pdf, Ø50/Ø20/30 mm). Pré-preenche os trechos externo e interno e exige confirmação da seção. Ainda não interpreta automaticamente peças escalonadas, cones múltiplos nem PDFs rasterizados.
- Nova opção "Importar desenho PDF" dentro de Desenho da peça, sem remover editor manual.
- Visualização do PDF original, escolha de página, zoom, rotação e arraste.
- Extração de texto e diâmetros candidatos de PDFs com texto via PDF.js (CDN; requer conexão); PDFs digitalizados usam conferência e transcrição manual.
- Montagem de trechos externos/internos, cilindros e cones, lados 1 e 2, com revisão explícita.
- Transfere somente rascunho para o editor atual, sem gerar CNC automaticamente; usuário revisa e salva.
- Limitação: não há OCR nem reconhecimento automático de contorno vetorial, furos, raios, chanfros, tolerâncias ou cotas associativas. Sem PDF.js conectado a visualização permanece disponível via navegador.
- Versão criada em branch separada; main 2.7.1 preservada.


## 2.7.1 — 09/10/2026 — Leitor entende o modo ISO do Siemens 802D sl (G291, G290 e G92 S)
- Programas da casa vistos no comando **Siemens SINUMERIK 802D sl** (pasta `\MPF\`, como o `FUNDO-PF`) são Fanuc em modo ISO: começam com `G291` (liga o modo ISO; `G290` volta ao modo Siemens) e usam G71/G70, G96, G95 e T0101 como os programas da casa.
- **`G92 S…` agora vale como limite de rotação em G96** (o equivalente do `G50 S` do Fanuc, no sistema B/C e no Siemens em modo ISO). Antes o leitor ignorava a linha e lia o `S` como velocidade de corte (`G96 S1000` + `G92 S1200` virava Vc 1200) e ainda dava um aviso falso de "G96 sem limite de rotação". `G92` com X/Z (preset de coordenadas ou ciclo de rosca do sistema A) continua ignorado, com aviso.
- **`G291` e `G290` passam em silêncio** (só trocam o dialeto; não movem nada). Um programa que entra no modo Siemens nativo (`G290`) e segue com `CYCLE95`, `R1=…` etc. continua sem suporte: essas linhas aparecem como erro.
- O texto do diagnóstico do "G96 sem limite" cita o `G92 S` do Siemens em modo ISO.
- Testes: `testprog.js` 223 → 232 verificações (trecho do programa `FUNDO-PF` lido sem aviso falso, Vc 1000 e limite 1200 rpm, G92 com X/Z ainda ignorado) e `testdiag.js` 311 → 313.
- A confirmar: se o comando aceita as variáveis `#` e `IF/GOTO/WHILE` (Macro B) em modo ISO — o programa visto não usa nenhuma — e como ele trata G73, G74, G75, G76 e G83 (ver `VALIDAR-NA-MAQUINA.md`).

## 2.7.0 — 09/10/2026 — Diagnóstico de erros do programa, com causa e solução para cada tipo
- **Novo módulo `diagnostico.js`**: junta tudo o que pode estar errado num programa Fanuc numa lista só. Cada item traz **gravidade** (erro, aviso ou dica), a **linha**, a mensagem do caso, **por que acontece** e **como corrigir**; quando dá para resolver no texto, traz a **correção pronta** (antes/depois). Catálogo com **73 tipos de erro**, em 8 grupos: Sintaxe, Variáveis e fluxo, Estrutura, Movimentos, Ferramenta e rotação, Ciclos, Compensação G41/G42 e Simulação. Padrão seguido: Fanuc ISO com Macro B.
- **Tela Simulação (programa colado)**: o painel sob o texto virou um painel de diagnóstico (erros primeiro, depois avisos e dicas; clique leva à linha). Cada cartão abre "Causa e como corrigir". Botões **Aplicar** (uma correção), **Aplicar N correções exatas** (todas as que não dependem de valor) e **Desfazer a última correção**. As correções "exatas" são as que não mudam valor nenhum (fechar parêntese, acrescentar M30, M9 antes do fim, G0 no contorno etc.); as demais mostram "confira o valor antes de usar".
- **Alertas do simulador** (colisão com a placa, corte na peça acabada, rápido no material, fora de curso, sobra de material) ganharam o mesmo "Causa e como corrigir", nas duas janelas. Na janela do **Gerador**, a solução fala em parâmetros do gerador (ex.: Ø e comprimento preso da placa, sobremetais, ferramenta escolhida) e há um bloco **Diagnóstico do programa gerado** com o mesmo leitor.
- **Verificações novas no leitor (`progsim.js`)**: corte com o fuso desligado (sem M3/M4); G96 sem limite de rotação (G50 S); avanço em unidade trocada (F300 em mm/rot, F.2 em mm/min); troca de ferramenta sem recuar (G28) e com G41/G42 ligado; G41/G42 nunca cancelado; G28/G30 com X ou Z absoluto (o ponto intermediário passa pela peça); furação em G96; G74/G75 com P/Q fora da unidade (milésimos de mm, sem ponto); G71 com U de sinal errado; primeiro bloco do contorno sem G0/G1; contorno que volta no eixo principal; G76 em G96, rotação × passo alta, altura do filete grande para o passo, ângulo não aceito e passadas de acabamento demais; programa sem M30; refrigeração sem M9.
- **Verificações estáticas** (acham o erro mesmo em linha que nunca é executada): parênteses e colchetes sem par, caracteres que não existem no ISO (aspas, @, acentos), mesma letra duas vezes no bloco, dois G do mesmo grupo, GOTO/IF para N inexistente, WHILE sem END (e o inverso), M98 sem subprograma, blocos depois do M30.
- Os avisos e erros antigos do leitor continuam iguais (só ganham o código do catálogo); os programas da casa e os gerados não ganham nenhum erro ou aviso novo (conferido nos 16 programas da casa e em 10 casos do Gerador). Tipos que a casa usa e o comando aceita (G71 com Z que volta, G76 com 10 passadas de acabamento, M30 sem M9) aparecem só como **dica**.
- Testes: novo `testdiag.js` (311 verificações) — um caso para cada tipo do catálogo, as correções (aplicar e conferir que o erro some), o HTML, os 16 programas da casa e os programas do Gerador; falha se algum tipo do catálogo ficar sem caso de teste. `testprog.js` continua com 223.
- Limites: o diagnóstico só enxerga o que o texto e a simulação mostram; não replica os alarmes numerados do comando, nem confere velocidade de corte por material, nem curso de rotação da máquina. A troca sem recuo considera recuo só o G28/G30 (o G0 até o ponto de troca sem G28 também é avisado).

## 2.6.0 — 09/10/2026 — Gerador gera G73 e G41/G42 + ângulo do suporte no banco de ferramentas
- **Ângulo de posição do suporte (κ) no banco de ferramentas** (tipos externa, faceamento e interna; vazio = como antes). A pastilha da simulação gira φ = 180° − κ − ponta no suporte: uma 55° em suporte de 93° tem a aresta de trás subindo 32°; uma 80° em suporte de 95°, 5°. Resolve o corte a mais que a aresta de trás reta fazia em perfis que **descem em direção à placa** (como o cone de 8° do `FRENTE.COPO`). Vale nas duas janelas de simulação, no desenho da ferramenta (Simulação) e na compensação G41/G42 (o centro do raio de ponta é calculado do formato real da pastilha).
- **G73 no Gerador**: o desbaste do perfil externo ganhou a opção **"Paralelo ao perfil (G73)"** (peça simples, porta-matriz e alimentador; para bruto forjado ou fundido já perto da forma final). Gera `G73U#20W#21R#22` + `G73P1Q2U#11W#12F#6`. O afastamento total (U, #20) sai do bruto sobre a parte mais funda do contorno (menos o sobremetal de acabamento, arredondado para cima em 0,1 mm), o número de cortes (R, #22) mantém cada corte no máximo no incremento de cilindragem da ferramenta (#8) e W (#21) é 0. O contorno N1–N2 roda uma vez em movimento normal e o G70 acaba, como no G71. A simulação do Gerador faz os mesmos cortes que o leitor (mesmo material removido, tempo e alertas nos testes).
- **G41/G42 no Gerador**: novo campo **"Compensação do raio de ponta (G41/G42)"**, grupo Acabamento (peça simples, porta-matriz e alimentador). Ligado, o acabamento sai com `G42` antes do `G70P1Q2` (perfil externo) e `G41` antes do `G70P3Q4` (mandrilamento interno), e o **último bloco do contorno cancela com G40** (`N2G40G0X#1`, `N4G40G1X#…`). Assim o retorno automático do G70 ao ponto de partida já sai da compensação: com ela ligada, esse retorno puxaria a ferramenta para dentro da peça (a simulação mostrou o raio entrando 0,6 mm). A simulação do Gerador desloca o acabamento do raio de ponta cadastrado; ferramenta sem raio gera aviso. Desligado (padrão), o programa é idêntico ao de antes.
- Por baixo: `progsim.js` ganha `comCompensacao`, o formato da pastilha (`sim.js`) passa a informar o centro do raio de ponta (`nose`), `core.js` ganha `cyc73` e o `simTool` leva `ap`.
- Programas do Gerador **sem** as opções novas ficam idênticos ao 2.5.0 (17 casos comparados: código, caminho da simulação, erros e avisos). Testes: `testprog.js` passa de 186 para 223 verificações (formato da pastilha com suporte, cone que desce para a placa, G73 e G42/G41 gerados × lidos).
- Limites: G73 só no perfil externo; G41/G42 só nas geometrias que usam o mesmo motor (peça simples, porta-matriz e alimentador) — matriz sólida, matriz tubular, espina e BA/BAT não têm a opção. O quadrante da ponta (1 a 9) não é cadastrado: vale o do inserto da simulação; raio e quadrante têm de estar no corretor da máquina.

## 2.5.0 — 09/10/2026 — programa decodificado também no Gerador + programas do COPO BRUTO P2/P3
- **Visor decodificado no projeto todo**: a janela de simulação do **Gerador** ganhou a mesma faixa verde do módulo Simulação (linha em execução + linha decodificada). Ela lê o próprio código gerado com o leitor de programas e mostra, por exemplo, `G0Z#11` → `G0Z[2]`, `G75…Q#14R.5F#15` → `G75…Q[1000]R.5F[0.45]`. Os geradores não mudaram: os programas gerados continuam **idênticos**.
- **Programas da casa que funcionam na máquina** (`Exemplos de programaçaõ/COPO BRUTO P2 P3/`): `FRENTE.COPO.BRUTO.P2.P3` (G73 `U8 W-0 R8` no perfil triangular, G72 interno com `U` negativo, G74 de furação, canal frontal com G74) e `TRAS.COPO.BRUTO.P2.P3` (G71/G70, G72 interno, G76 de rosca interna, `GOTO` entre operações). Os dois entram na leitura "programas da casa" do `testprog.js` (sem erro e sem aviso) e têm verificações próprias: ferramentas, **8 cortes do G73** com o 1º 8 mm (raio) acima do perfil e o último no perfil, espaçamento igual, texto decodificado, `GOTO` pulando a troca de ferramenta, cilindro Ø175 acabado.
- **G73 confirmado no padrão Fanuc**: o programa da casa (`G73 U8 R8`) só faz sentido com `U/W` = afastamento **total** do perfil. Saiu o aviso fixo que citava o manual da ROMI (de outra máquina, vale só como exemplo).
- Testes: `testprog.js` passa de 161 para 186 verificações; 16 programas da casa lidos.
- Observação conhecida (não é do G73): a pastilha da simulação tem a aresta de trás reta (horizontal). Num perfil que **desce em direção à placa** (como o cone de 8° do FRENTE), essa aresta corta além do perfil; com a ferramenta real, de suporte com folga, isso não acontece. Não há ainda um campo no banco de ferramentas para o ângulo do suporte.

## 2.4.0 — 08/10/2026 — Simulação: programa decodificado, G73 e G41/G42
- **Programa decodificado**: embaixo do código da janela de simulação do módulo Simulação, uma faixa mostra a linha em execução e, logo abaixo, a mesma linha já calculada (variáveis e expressões). Número escrito direto fica igual; variável ou expressão vira `[valor]`: com `#1=2 #2=2 #3=2`, `G0Z[[#1+#2]*#3]` aparece como `G0Z[8]`; `X#2` (com `#2=201`) como `X[201]`; `T#101` como `T[0101]`. Acompanha o simulador (executar, passo a passo, controle deslizante) e, nos laços `WHILE`, mostra o valor de cada volta. O bloco `G70` e o retorno dele mostram o próprio `G70`, e o contorno `N(P)…N(Q)` mostra os blocos dentro do ciclo.
- **Funções e colchetes**: o leitor já calculava colchetes aninhados e `SIN COS TAN ASIN ACOS ATAN SQRT ABS ROUND FIX FUP LN EXP` (e `AND OR XOR MOD`, `EQ NE GT LT GE LE`); agora tudo isso aparece decodificado. `ARROUND` não existe no Fanuc: vale `ROUND`.
- **G73 (desbaste paralelo ao perfil)**: `G73 U W R` + `G73 P Q U W F`. O contorno `N(P)…N(Q)` é repetido `R` vezes, deslocado do afastamento total `U` (raio) e `W` (Z) no 1º corte até só o sobremetal de acabamento no último; depois de cada corte volta ao ponto de partida. Direção em X pelo sinal do `U` de acabamento (avisa se o `U` do 1º bloco tiver sinal contrário). **Aviso fixo na tela**: `U/W` lidos como afastamento total (padrão Fanuc); o manual da ROMI os descreve por passada (a validar na máquina).
- **G41/G42 (compensação do raio de ponta)**: usa o **raio de ponta da ferramenta do banco** e o formato de inserto da simulação (externa e interna). A ponta de referência anda no contorno deslocado do raio (G41 esquerda, G42 direita). Partida pela normal do 2º bloco, canto interno pelo ponto de encontro, canto externo em arco, saída no bloco do G40. Os ciclos de desbaste (G71/G72/G73/G74/G75/G76/G83) ignoram a compensação e o G70 e os movimentos normais a seguem. Sem raio de ponta no banco: aviso e simula na ponta programada. O rótulo do movimento mostra `· G42` (ou `· G41`/`· G40`).
- `G40` agora cancela a compensação (antes só era ignorado); `G41/G42` deixaram de gerar o aviso "não é simulada".
- Testes: `testprog.js` passa de 124 para 161 verificações (decodificado, G73 com R1/R2/R3 e interno, G41/G42 externo e interno, canto externo em arco, cone a 45° com e sem compensação). Casos antigos do gerador e os 14 programas da casa continuam idênticos.
- Limites: a compensação não replica os alarmes de interferência do comando; a posição da ponta (quadrante) não é cadastrada (vale a do inserto da simulação); só a Simulação lê G41/G42 e G73 (o Gerador não os gera).

## 2.3.0 — 08/10/2026 — acesso por usuário (tela de entrada)
- **Tela de entrada**: o sistema abre pedindo usuário e senha. O acesso fica salvo na aba até clicar em **Sair** (botão no cabeçalho, com o nome do usuário).
- **Três usuários**, cada um com o menu limitado:
  - `admin` — tudo (Gerador, Desenho da peça, Ferramentas, Simulação e Configurações).
  - `simu` — só **Simulação** e **Ferramentas** (Configurações fica oculta).
  - `desenho` — só **Desenho da peça** (Configurações fica oculta).
- Cada usuário abre direto na primeira tela que tem permissão.
- As senhas não ficam em texto puro: o arquivo guarda o SHA-256 de cada uma (com prefixo fixo). Instruções para trocar uma senha estão no topo de `acesso.js`.
- **Limite**: é uma trava de uso, não de segurança. Quem tem os arquivos consegue ler o código; as senhas atuais são fáceis de adivinhar. Dados de ferramentas e de programas continuam no navegador, sem mudança.

## 2.2.1 — 07/10/2026 — Simulação: janela em painel próprio e desenho com inserto e suporte
- Módulo **Simulação**: a janela de simulação agora fica num **painel separado, em largura total**, abaixo dos cartões Programa, Ferramentas e Bruto (que ficam lado a lado). Canvas maior (520 px), código e alertas ao lado.
- **Desenho da ferramenta** mostra o **inserto** (laranja, com furo de fixação nas pastilhas) e o **suporte/haste** (cinza), na mesma orientação da simulação (esquerda = peça/placa, +Z → , +X ↑), com legenda e a cruz na ponta programada. Cada tipo tem o seu: pastilha rômbica (ângulo e raio do cadastro), barra de mandrilar, canal frontal, canal externo, canal interno, rosca externa/interna e broca (corpo + haste, eixo da peça tracejado). O desenho agora fica abaixo da escolha da ferramenta, com a largura do cartão.

## 2.2.0 — 07/10/2026 — módulo Simulação (programa pronto colado)
- **Novo item "Simulação" no menu** (ao lado de Gerador, Desenho da peça e Ferramentas): cole um programa Fanuc já pronto (ou abra o .txt) e simule sem passar pelo gerador. Três blocos: **1 · Programa** (caixa de colar, abrir arquivo, exemplo), **2 · Ferramentas do programa** e **3 · Bruto e fixação**, com a **mesma janela de simulação** do Gerador ao lado (executar, passo a passo, trajeto, pastilha, linha do código destacada, alertas, tempo de ciclo).
- **Leitor de programa (`progsim.js`)**: lê o texto como a máquina: variáveis `#`, expressões (`[ ]`, `SQRT`, `ROUND`, `FIX`, `FUP`, `ABS`, `SIN`…, `EQ/NE/GT/LT/GE/LE`, `AND/OR/MOD`), `IF[..]GOTO`, `IF..THEN`, `WHILE..DO/END`, `GOTO N`, subprogramas `M98 P.. L../M99`, comentários, `%`, `<NOME>`, `N`, `/`. Movimentos `G0/G1/G2/G3` (R ou I/K, absoluto/incremental, `U/W`), `G28`, `G50 S`, `G96/G97`, `G98/G99`, ciclos **G71/G72 + G70, G74, G75, G76 (2 blocos) e G83/G80** e `G1900/G1901` (bruto). Os ciclos seguem os mesmos critérios do gerador: um programa gerado e depois colado remove o mesmo material (conferido nos casos do `test.js`).
- **Ferramentas lidas do programa**: cada `T` (inclusive `T#101`) vira um cartão com o código (T0101), a descrição (comentário do T ou da variável), quantos movimentos/cortes e a linha. Ao lado, a **ferramenta do banco** (já vem escolhida pelo mesmo código T; se houver duas com o mesmo código, a de tipo compatível com o que o programa faz), a **posição de uso** (canal frontal/radial, rosca externa/interna) e o **desenho do formato** exatamente como o simulador o usa (cruz = ponta programada), com pastilha, ângulo, raio, largura ou Ø. Mostra também "No programa: G96 Vc … avanço …" × "No banco: …" para conferir. A escolha fica salva por código T.
- **Bruto e fixação**: Ø do bruto, sobremetal na face, comprimento livre (Z0 até a placa), preso na placa e furo existente. Campos vazios = automático (lidos de G1900/G1901 ou dos movimentos; o valor lido aparece em cinza). Rotação, Vc e avanço vêm do próprio programa (S/F), não do banco.
- **Avisos por linha** (clique para ir à linha): variável sem valor, laço sem fim, GOTO sem rótulo, G não simulado, G41/G42, arco sem R/I/K, avanço sem F ou antes do T. Sem peça acabada para comparar: não há alerta de "corte na peça" nem "sobra"; valem colisão com a placa, rápido no material e fora de curso.
- Por baixo: `simview.js` virou fábrica (`SimView.create('ps')`), o Gerador continua com a janela `sim`; `sim.js` aceita `spin` por movimento (S do programa) e `semPerfil`; `core.js` exporta `simTool`; `testprog.js` (124 verificações, chamado no fim do `test.js`).
- Convenção herdada dos programas da casa: depois do `G71/G72` os blocos `N(P)…N(Q)` rodam de novo em movimento normal (o `G70` ainda passa por cima). Limites desta versão: sem compensação de raio (G41/G42), sem G73/G12.1/eixo C, G71 tipo II simulado como tipo I, polegadas (G20) tratadas como mm.

## 2.1.2 — 06/10/2026 — desenho do porta-matriz maior e sem cruzamentos
- O croqui do porta-matriz ficou maior (viewBox 560 x 440, até 640 px) e foi redesenhado com cada cota numa pista própria: M, K e C aninhadas à esquerda, E à direita, F no alto, A e B embaixo e D dentro do furo; as linhas de extensão não se cruzam e as caixas ficam escalonadas. Chanfro H, raio G, borda L e ângulo I saem por linhas de chamada que não cruzam cotas. Legenda "lado 1 / lado 2" sob o desenho.
- DESENHOS (app.js) aceita b (tamanho do desenho) e cls por croqui.

## 2.1.1 — 06/10/2026 — cota M no porta-matriz
- A cota **M** do croqui (EXEMPLO PORTA MATRIZ.jpg) é o Ø do rebaixo: a letra J que eu tinha usado virou **M** (campos, mensagens, LEIAME) e o desenho ganhou a linha de cota M atravessando o rebaixo, como no exemplo. Caixas D, L e B deslocadas para não cobrir a linha.

## 2.1.0 — 06/10/2026 — porta-matriz com desenho e 2 lados
- **Porta-matriz** passa a ter o desenho com caixas de digitação nas letras (mesmo esquema da espina), a partir do croqui enviado: A comprimento final, B comprimento do furo D, C furo do bloco, D furo maior, E Ø do corpo, F comprimento do rebaixo, G raio externo do degrau, H chanfro externo, I ângulo, M Ø do rebaixo, K Ø na face do cone, L borda do furo.
- Sai em **2 lados**: lado 1 = PORTA.MATRIZ (cone, rebaixo, degrau com raio, Ø E, borda do furo C); lado 2 = PORTA.MATRIZ.INTERNO (Ø E com chanfro H, furo D × B com borda L). Novos campos: sobremetal do lado 1, até onde o lado 1 torneia o Ø E, tipo da borda L (raio ou chanfro). Saiu o "O que usinar".
- Testes do porta-matriz refeitos (padrão, chanfro, sem bordas, G72, 8 erros).
## 2.0.0 — 06/10/2026 — revisão final
- Fecha o plano das 6 etapas: BA/BAT, porta-matriz, alimentador, canal interno e rosca (G76), mais esta revisão.
- **VALIDAR-NA-MAQUINA.md:** lista única do que não tem exemplo da casa ou depende da máquina (limites da ML-600L, canal interno, roscas, alimentador, G72 interno, T-MAX) e do que o simulador não mostra.
- LEIAME atualizado (tabela de geometrias, trechos, ordem das operações no programa, elementos da paleta; saíram os "em breve" e o "não inclui ainda").
- Varredura completa do `node test.js`: sem `VARS INDEF` nem `NaN`; casos antigos idênticos ao 1.0 em código; os alertas de placa que aparecem são do teste de placa forçada.
## 1.9.0 — 06/10/2026 — rosca externa e interna (G76)
- **Rosca externa e interna** no desenho da peça e no Gerador: cotas Ø nominal, comprimento e passo (métrica ISO 60°). Externa = cilindro no Ø nominal + G76; interna = furo mandrilado em Ø − 1,0825 × passo + G76 até o Ø nominal. Herdam posição sequencial, chanfro de entrada e canal de alívio depois delas.
- Código: blocos `(ROSCA EXTERNA)` / `(ROSCA INTERNA)` com `G97`, `G76P010060Q#97R#98` e `G76X Z P Q F` (altura, 1ª passada = altura ÷ √passadas); novos slots de ferramenta T6/T7 (`T#106`, `T#107`) e tipo de ferramenta **Rosca** no banco (semente T0505, RPM 800 — valor de partida a validar). RPM limitado a 5000 ÷ passo.
- Simulador: passada de rosca (`G76`) com tempo e percurso, sem remover material; forma da ferramenta de rosca; painel mostra "ROSCA (G76)".
- Correção: canal externo que termina num degrau gerava um perfil acabado com diagonal falsa no simulador (alerta de sobra indevido).
- Parede da rosca interna validada (erro < 0,3 mm, aviso < 1,5 mm); aviso quando a rosca termina sem canal de alívio.
- Testes novos (externa, com chanfro, sem alívio, interna, sozinha, externa + interna, lado 2; erros: sem ferramenta, RPM, sem passo, passo grande, fura parede, menor que o furo).
## 1.8.0 — 06/10/2026 — canal interno
- **Canal interno** no desenho da peça (elemento sequencial: Ø do fundo + largura, depois de um cilindro interno) e no Gerador: `G75` do furo para fora com a nova ferramenta de canal interno (slot T5, `T#105`, variáveis `#80`–`#88`), depois do mandrilamento.
- A pastilha recua em Z até sair da face antes de subir em X (o simulador apontou a colisão na primeira versão).
- Simulador: forma da pastilha de canal interno; o canal aparece na meia seção, na peça acabada e entra na verificação de parede fina.
- Bloco do desenho passa a conter o Ø do fundo do canal interno (Ø de referência automático).
- Testes novos (válidos: sequencial, Z absoluto, 2 canais, só interno, 2 lados, com chanfro; erros: 1º elemento, depois de cone, Ø menor, maior que o bloco, estreito, sem ferramenta, fura parede).
## 1.7.0 — 06/10/2026 — geometria Alimentador padrão
- **Alimentador padrão (2 lados)** em "Tipo de peça": lado 1 (externo, raio na face e cone interno por ângulo a partir do furo do bloco) e lado 2 (encaixe com raio na face e raio no ombro depois do trecho reto). Ø maior do cone calculado pelo ângulo (15° → 153,397).
- Núcleo: opção interna `permiteSobrepor` na peça simples (peça fina: sobreposição vira aviso, não erro). Lista de geometrias "em breve" ficou vazia.
- Testes novos (padrão, G72, 4 erros).

## 1.6.0 — 06/10/2026 — geometria Porta-matriz
- **Porta-matriz** em "Tipo de peça": externo (cone por ângulo com a fórmula da casa FUP[TAN × ΔØ], encaixe, raio no degrau, Ø após o encaixe) e interno (mandrilamento com raio na boca, partindo do furo do bloco), em um programa ou em separado ("O que usinar").
- Usa o motor da peça simples (G71 + G70); o contorno N1–N2 gerado confere com o do PORTA.MATRIZ.txt.
- O gráfico da meia seção agora também aparece nas geometrias dedicadas (campo `preview`).
- Testes novos (exemplos externo/interno, G72, 5 casos de erro); mandrilamento maior que a peça tem mensagem própria.

## 1.5.0 — 06/10/2026 — geometria BA / BAT
- **BA / BAT** entra em "Tipo de peça": o `BA.E.BAT.txt` tem a mesma estrutura da matriz sólida (G75, G74 até o comprimento de usinagem, raio de quina G3); muda o padrão da casa (folga de 0,3 mm no Ø final, exemplo Ø225, usinagem 14, raio 3). Reaproveita o gerador da matriz sólida (teste confirma programa idêntico com os mesmos valores).

## 1.4.0 — 06/10/2026 — elementos em sequência (canal sequencial)
- **Canal sequencial** no Desenho da peça: só Ø do fundo e largura; entra depois do último cilindro, ocupa a largura e o próximo elemento começa depois dele (some a "Posição Z" medida da face). Canais antigos seguem funcionando.
- A janela de cada elemento mostra **onde ele começa** (Z do fim do anterior) e o desenho marca o início.
- Núcleo: `psSeq` converte o canal sequencial no canal por Z do gerador (programa idêntico); cantos de degrau levam em conta a largura do canal.
- Testes novos (equivalência com canal por Z, 2 canais seguidos, erros).

## 1.3.1 — 06/10/2026 — correção: desenho não chegava ao Gerador
- **Erro corrigido:** "adicione ao menos um trecho (cilindro ou cone)" no Gerador. O Gerador só usa o desenho **salvo**; se o desenho foi salvo antes de ser desenhado (ou ficou com alterações sem salvar), chegava vazio.
- Ao sair da tela Desenho da peça com alterações não salvas, pergunta se quer **salvar** (e avisa se o desenho ainda não tem nome).
- No Gerador, a linha do desenho mostra aviso quando ele está **vazio** ou tem **alterações não salvas** no editor.
- Desenho só com furo/mandrilamento (sem perfil externo) não pede mais trecho externo: "Externo e interno" passa a usar só o interno naquele lado.

## 1.3.0 — 06/10/2026 — operação “Desenho da peça”
- **Nova operação Desenho da peça** (menu lateral): desenha a peça com elementos e janelas de cotas, **salva com nome**, reabre para alterar; duplicar, excluir, exportar/importar `.json`; rascunho automático.
- **Chanfro e raio** escolhem o canto **clicando num ponto numerado no desenho da peça** (ou numa lista); cantos ocupados ficam esmaecidos; o elemento só entra se não criar erro novo.
- **Gerador (peça simples) só pede o bruto:** escolhe o desenho salvo e digita o bruto; o editor de trechos saiu do Gerador. Peça digitada no gerador anterior vira um desenho automaticamente.
- Nome do programa usa o nome do desenho. Títulos de grupo vazios somem no Gerador.
- Novos arquivos: `pecaview.js` (meia seção compartilhada), `desenho.js` (operação). Prévia `previa-peca-simples.html` removida.
## 1.2.0 — 06/10/2026 — menu lateral, painéis independentes, tema Alumasa padrão, cantos escolhidos
- **Tema Alumasa como padrão** (quem já tinha escolhido outro tema volta para ele uma vez; a escolha seguinte fica salva).
- **Menu lateral** abaixo do logo com as operações (Gerador, Ferramentas); Configurações e Tema ficam no cabeçalho.
- **Painéis independentes:** formulário (etapas 1 a 4) e painel Código/Simulador/Estratégia/Dicionário com rolagem própria, cada um na altura da tela.
- **Chanfro e raio por canto escolhido** (externo e interno): lista “Canto onde vai” com quinas, pés de degrau, entrada do furo e fundo; o canto acompanha o trecho. Cantos de degrau entre cilindros internos agora são possíveis. Listas antigas migram sozinhas com programa idêntico.
- Testes novos em `test.js` (migração idêntica, cantos de degrau, erros de canto).
- Prévia da peça simples ainda usa o modelo antigo de canto; será trocada na 1.3.0 (Desenho da peça).

## 1.1.0 — 05/10/2026 — cabeçalho fixo, Configurações, telas mais enxutas
- **Controle de versões:** `CHANGELOG.md` (este arquivo), cópia completa de cada versão em `versoes/`, número da versão ao lado do título e `node versionar.js` para criar a próxima.
- **Cabeçalho fixo** durante a rolagem (a coluna de saída acompanha, abaixo dele).
- **Nova aba Configurações:** autor e data (data vazia = automática), pressão da placa (M34/M35, saiu das medidas e vale para todos os programas), máquina e placa (saiu do card 5), mostrar todas as explicações, versão.
- **Autor e data** saíram do card “Peça e programa”.
- **Explicações suprimidas:** botão ⓘ em cada campo (também na seção 3 e na ajuda do simulador); opção em Configurações para mostrar todas.
- **“Raios e folgas”** (e “Bruto com furo existente”) recolhidos com resumo de uma linha: só o que foi alterado, ou “padrão”.
- **Removidos os informativos calculados** (G, comprimento total, limites, Ø usinado, sobremetais, trechos…).
- **Ferramenta escolhida em uma linha** (T, Vc, RPM máx., avanços, giro).
- **Prévia navegável da peça simples** (`previa-peca-simples.html`): paleta de elementos, janela com desenho e cotas editáveis, peça montada. Ainda não substitui o editor atual.
- Interno: CSS separado em `style.css`; `serve.js` serve `.css`/`.png`. O gerador de código não mudou (testes idênticos à 1.0.0).

## 1.0.0 — ponto de partida (antes da rodada de 05/10/2026)
Estado do gerador quando o controle de versões foi criado:
- Geradores: matriz sólida, matriz tubular, espina (2 lados) e peça simples (trechos externos e internos, 1 ou 2 lados).
- Simulador XZ, banco de ferramentas com cartões de tipo, 3 temas (claro, escuro, Alumasa), coluna de saída acompanhando a rolagem.
- Blocos recolhidos (“Raios e folgas”, “Bruto com furo existente”), só aparecem as ferramentas usadas no processo.
