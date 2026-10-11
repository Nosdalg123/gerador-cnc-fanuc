# Itens para validar na máquina (ML-600L)

Tudo o que o gerador faz foi conferido contra os programas validados da casa quando havia exemplo, e pelo simulador 2D. O que **não tem exemplo da casa** ou depende da máquina está listado aqui. Rode o primeiro programa de cada tipo **a seco / em ar** (sem material) antes de cortar.

## Antes de qualquer programa novo
- **Curso, Ø da placa e velocidade de rápido da ML-600L:** os valores do card "Máquina e placa" são provisórios. O simulador só alerta de colisão com a placa e de curso com base neles.
- **Ferramentas do banco:** as de partida vieram dos exemplos; pastilha e raio de ponta estão em branco. O sobremetal de acabamento da semente W é 0 (a casa usa 0,1 no Ø e 0,08 em Z na cabeça da espina).
- **Pressão da placa (M34/M35):** padrão sem comando; ajustar em Configurações se precisar.
- **Fixação:** o comprimento preso (padrão 25; 10 e 8 no alimentador) gera erro se a usinagem passar do trecho livre. Confira o valor real.

## Por geometria
| Item | O que conferir |
|---|---|
| Matriz sólida / tubular / espina | Conferidas com os programas da casa. `IF[#11LE#13]` e `IF[#2-#17LT[#18*2]]` em vez de 2 e 4,7 fixos; M9 incluído no fim do encaixe da espina; encaixe da espina começa o G74 um incremento abaixo do Ø externo. |
| BA / BAT | Usa a estrutura da matriz sólida (folga 0,3 e raio 3 do exemplo `BA.E.BAT`); confirmar se o programa real tem alguma diferença além do nome e do comentário da folga. |
| Porta-matriz (2 lados, croqui A–L) | Fórmula do ângulo `FUP[TAN × ΔØ]` (6 mm no exemplo). O croqui não diz até onde cada lado torneia o Ø E (padrão: lado 1 até 70 mm, lado 2 o resto); a borda L também na entrada do furo C; o chanfro H (o programa da casa não tem); sobremetal Z dividido entre os lados; |
| Alimentador | Os dois exemplos têm Ø interno menor diferente (140 e 130): aqui há um valor só. O faceamento do lado 2 passa por cima do furo (corta no ar); o da casa pára antes. Os dois lados trabalham uma região comum (peça fina). |
| G71/G72 interno | O mandrilamento sai em G71 interno (U negativo) + G70, blocos N3–N4. O G72 interno (transversal) não tem exemplo da casa. |
| Bruto com furo | `G1901` (coluna com orifício) só para furo passante uniforme; furo escalonado ou cego fica no `G1900` com comentário. |
| Furação | A semente T-MAX tem avanço 0,02 (da casa): confirmar a unidade (mm/rot ou outra). No simulador o tempo da furação fica enorme por isso. |
| Canal externo | Passo em Z entre descidas = 80% da largura da ferramenta. Chanfro/raio no pé de um degrau que encosta num canal não foi validado. |
| **Canal interno** (1.8.0) | Sentido do G75 interno (P/Q/R e retorno), folga de 1 mm no raio na aproximação (`-2` no Ø), recuo `G0Z[#88+1]`, e se a haste da barra de canal passa pelo menor furo do caminho (o gerador não verifica a haste). |
| **Rosca** (1.9.0) | Não há programa de rosca da casa. Conferir: `G76P010060Q100R0.1` (1 passada de acabamento, sem chanfro de saída, 60°), nº de passadas e 1ª profundidade (altura ÷ √N), entrada Z = 2 × passo e X ± 4, altura 0,61343 × passo (apostila; o exemplo do manual usa ≈ 0,65), sentido de giro, RPM (máx. 5000 ÷ passo), semente T0505/800 RPM, e se o cilindro deve ser torneado décimos abaixo do Ø nominal. A rosca interna fura em Ø nominal − 1,0825 × passo. |

## Módulo Simulação (programa colado) — suposições do leitor
O leitor segue os mesmos critérios dos geradores; o que não foi confirmado na máquina:
- **Blocos do contorno depois do G71/G72:** simulados como executados de novo em movimento normal (convenção dos programas da casa). Se a ROMI pulasse N(P)–N(Q), a simulação mostraria um repasse a mais.
- **G74/G75:** `P` e `Q` em milésimos de mm; `R` = afastamento em Z no fundo do corte (passo de X grande = corte único, como no faceamento) ou recuo em X entre as bicadas (canal). Primeira passada na posição atual da ferramenta.
- **G71/G72:** recuo de `R` a 45°; depois uma passada no contorno com os sobremetais `U/W`; no G72 os níveis em Z começam a um `W` abaixo do Z da posição (o gerador começa em Z0 − W: mesmo material, uma passada de ar a mais).
- **G76:** passadas em `Q·√n` até a altura `P`, mais `m` de acabamento (2 primeiros dígitos do `P` do 1º bloco); externa/interna pelo sentido do X.
- **Posição de referência (G28):** X = curso em X e Z = curso em +Z das Configurações (só afeta o tempo e a trajetória até a troca).
- **Bruto automático:** Ø e comprimento livre vêm de `G1900`; sobremetal = menor Z positivo (≤ 20) de aproximação da 1ª ferramenta que corta. Confira nos campos do card 3.
- **G73 (2.4.0):** `U/W` do 1º bloco = afastamento **total** do perfil (padrão Fanuc), dividido em `R` cortes (1º corte a `U + U_acab/2`, último só no sobremetal de acabamento). Confirmado pelo programa da casa `FRENTE.COPO.BRUTO.P2.P3` (`G73 U8 W-0 R8`: 8 cortes em 8 mm; "por passada" daria 64 mm). O manual da ROMI é de outra máquina e descreve por passada: serve só de exemplo. Ainda a confirmar na máquina: o ponto de partida do ciclo (corte inicial em G0 direto até o primeiro ponto do perfil deslocado) e o retorno ao ponto de partida depois de cada corte (X, depois Z).
- **Gerador com G73 (2.6.0):** o afastamento total (#20) sai do bruto sobre a parte mais funda do contorno e o número de cortes (#22) = ⌈#20 ÷ incremento⌉ + 1, com W (#21) = 0. Conferir: o 1º corte (afastado de #20) passa no ar sobre a parte mais funda; os cortes seguintes se aproximam igualmente; o último fica no perfil mais o sobremetal de acabamento. Rodar a seco antes de cortar.
- **Gerador com G41/G42 (2.6.0):** `G42` (externo) ou `G41` (interno) numa linha antes do `G70`, e o **último bloco do contorno cancela com `G40`** (`N2G40G0X#1`, `N4G40G1X#…`) para o retorno do G70 ao ponto de partida já ficar sem compensação (ligada, esse retorno puxaria o raio para dentro da peça). Conferir: partida do G70 (bloco N1 radial a partir do ponto de partida, com Z1 maior que o raio), saída no bloco com G40, o raio e o quadrante da ponta no corretor, e que o G70 compensado acompanha o perfil do desenho (cantos internos e externos). Se a máquina alarmar na partida ou na saída, anotar a mensagem.
- **Ângulo do suporte κ (2.6.0):** só afeta a simulação. Usar o valor do suporte real (93°, 95°…). A pastilha gira 180° − κ − ponta (limitado a 0–60°).
- **G41/G42 (2.4.0):** a simulação usa a compensação ideal. Partida pela normal do 2º bloco (tipo C), canto interno pelo ponto de encontro, **canto externo em arco** em volta do vértice (o comando pode ligar os pontos por reta, o que deixa um resquício mínimo no canto), saída com o G40 no bloco de movimento. Não replica os alarmes de interferência (P/S 041 e semelhantes). A posição da ponta (quadrante 1 a 9) não é cadastrada: vale a do inserto da simulação (externa = ponta 3, interna = ponta 2). Conferir na máquina a **geometria da ferramenta** (raio e quadrante no corretor) e a partida/saída com a ferramenta longe da peça (Z maior que o raio).

## Diagnóstico de programa (2.7.0) — regras que seguem o padrão Fanuc, a conferir na máquina
- **Primeiro bloco do contorno sem G0/G1** é tratado como erro (o comando alarma no G70–G73). Confirmar o alarme na máquina.
- **Contorno que volta no eixo principal (G71 em Z, G72 em X)** aparece só como dica: o PORTA.MATRIZ e a CABECA.ESPINA.ANTIGO da casa têm essa volta de 2 mm e funcionam.
- **Troca sem recuo:** só G28/G30 conta como recuo. Se a máquina aceita um G0 até o ponto de troca no lugar do G28, o aviso é só conservador.
- **G96 sem G50 S** e **corte sem M3/M4** são avisos de segurança; **limites de avanço** (F acima de 1,5 mm/rot parece mm/min) e de **rotação × passo** na rosca (6000 mm/min) são regras práticas, não limites da máquina.
- **G76:** ângulos aceitos 0, 29, 30, 55, 60 e 80; altura do filete acima de 75% do passo avisa (rosca ISO ≈ 61%).
- As correções sugeridas que não são "exatas" (G28U0 antes do T, G50S2000, G40 antes do M30 ou do T) são pontos de partida: conferir o valor e o bloco de saída antes de rodar.

## Comando Siemens 802D sl em modo ISO (2.7.1)
- O programa visto no comando (`\MPF\FUNDO-PF`) usa `G291` e sintaxe Fanuc **sem variáveis `#`**. **Confirmar se esse comando aceita Macro B** (`#1=…`, `IF…GOTO`, `WHILE…DO…END`): os programas do Gerador dependem disso. Se não aceitar, é preciso uma saída com números fixos.
- Conferir como o modo ISO do Siemens trata G73, G74, G75, G76, G83, G41/G42 e o retorno do G70, e se `G92 S` limita a rotação em G96 como o `G50 S` do Fanuc (é o que o leitor assume).
- Programas em modo Siemens nativo (`G290`, `CYCLE95`, parâmetros `R`, `T1 D1`, `CR=`) não são lidos.

## O que o simulador não mostra
- O **filete da rosca** (só percurso e tempo das passadas).
- A haste/porta-ferramenta (só a pastilha); folga de haste em furos pequenos e canais internos fica por conta do operador.
- Interferência da placa no perfil externo além do que o card "Máquina e placa" descreve.
## Desenhos convertidos de PDF (2.10.0)
- Conferir manualmente **vista selecionada, origem Z0, Ø externo/interno, comprimento, degraus e orientação dos lados**. A projeção mantém proporção correta em X e Ø, mas isso não garante a interpretação da peça.
- Cotas inferidas de linhas vetoriais são estimativas: substituir pelos valores explícitos do desenho antes de gerar código CNC. PDFs digitalizados ou com raios/chanfros não suportados requerem CAD ou digitação verificada.
- Antes de levar à máquina: validar fixação, ferramentas, compensações e simulação, executar a seco conforme procedimentos da ferramentaria.

## Orientação de importações PDF — v2.11.0
- [ ] Identificar a **face livre Z0** da fixação real antes de usar o desenho; escolher o eixo e a face no importador não determina automaticamente onde estão as castanhas.
- [ ] Comparar a seção selecionada do PDF, todas as cotas, e o perfil salvo em X (diâmetro), Z negativo; verificar cones invertidos e múltiplos lados.
- [ ] Desenhos como Disco 7″ possuem R20, R3,50, M39 P2, M8 x50 e 61°: o importador PDF **não reconstrói esses elementos automaticamente**; não transferir a geometria simplificada como peça aprovada para usinagem.
- [ ] Confirmar G71/G70, direção de corte, medidas de bruto, zona de fixação e trajetória a seco na máquina.
