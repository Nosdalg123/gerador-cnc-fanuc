# Histórico de versões — Gerador CNC Torno

Cada melhoria gera uma versão (`MAIOR.MENOR.CORREÇÃO`, ex.: 1.1.1). Uma cópia completa de cada versão fica em `versoes/vX.Y.Z/`.

**Para voltar a uma versão:** copie o conteúdo de `versoes/vX.Y.Z/` por cima da pasta do gerador (menos a pasta `versoes`). Os dados (ferramentas, valores digitados) ficam no navegador e não são afetados.

**Para guardar uma nova versão:** `node versionar.js 1.2.0` (escreva antes a entrada abaixo; a cópia leva o texto junto).

---

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
