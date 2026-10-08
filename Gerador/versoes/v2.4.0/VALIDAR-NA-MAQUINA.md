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
- **G73 (2.4.0) — U/W do 1º bloco:** lidos como afastamento **total** do perfil (padrão Fanuc), dividido em `R` cortes (1º corte a `U + U_acab/2`, último só no sobremetal de acabamento). O manual da ROMI (0i-TD, cap. 8.4) descreve `U` e `W` como valor **por passada** (`U = (excesso − acabamento) ÷ R`), e os exemplos dele coincidem com a leitura "total" só quando `R = 2`. Rodar a seco um G73 com `R = 3` e ver as posições dos cortes. Também confirmar: o ponto de partida do ciclo (corte inicial diagonal em G0 até o primeiro ponto do perfil deslocado) e o retorno ao ponto de partida depois de cada corte (X, depois Z).
- **G41/G42 (2.4.0):** a simulação usa a compensação ideal. Partida pela normal do 2º bloco (tipo C), canto interno pelo ponto de encontro, **canto externo em arco** em volta do vértice (o comando pode ligar os pontos por reta, o que deixa um resquício mínimo no canto), saída com o G40 no bloco de movimento. Não replica os alarmes de interferência (P/S 041 e semelhantes). A posição da ponta (quadrante 1 a 9) não é cadastrada: vale a do inserto da simulação (externa = ponta 3, interna = ponta 2). Conferir na máquina a **geometria da ferramenta** (raio e quadrante no corretor) e a partida/saída com a ferramenta longe da peça (Z maior que o raio).

## O que o simulador não mostra
- O **filete da rosca** (só percurso e tempo das passadas).
- A haste/porta-ferramenta (só a pastilha); folga de haste em furos pequenos e canais internos fica por conta do operador.
- Interferência da placa no perfil externo além do que o card "Máquina e placa" descreve.