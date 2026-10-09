/* Diagnostico de programa Fanuc (torno) - sem dependencia de DOM.
   Junta tudo o que pode estar errado num programa em uma lista unica, cada item com: gravidade, linha, mensagem, causa, solucao e (quando da)
   uma correcao pronta para aplicar no texto. Fontes: erros/avisos do leitor (progsim.js), verificacoes estaticas do proprio texto (lint),
   avisos da compensacao G41/G42 e alertas do simulador (colisao, curso, rapido no material, sobra).
   Padrao seguido: Fanuc ISO com Macro B. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./progsim.js'));
  else root.CNCDiag = factory(root.CNCProg);
})(typeof self !== 'undefined' ? self : this, function (Prog) {
  'use strict';

  /* ---------- catalogo: um registro por tipo de erro ---------- */
  // sev: erro (o programa nao roda certo) | aviso (roda, mas pode dar errado) | dica (observacao)
  // gerador: solucao quando o programa veio do Gerador (o ajuste e num parametro, nao na linha de G-code)
  var CAT = {
    /* --- sintaxe --- */
    comAberto: { sev: 'erro', grupo: 'Sintaxe', titulo: 'Parênteses sem par', causa: 'Um "(" abre um comentário e a linha acaba sem o ")" (ou sobrou um ")" sem abertura). O comando pode alarmar ou tratar o resto do bloco como comentário.',
      solucao: ['Feche o comentário com ")" no fim da linha.', 'Não use "(" nem ")" dentro do texto do comentário.'] },
    colchete: { sev: 'erro', grupo: 'Sintaxe', titulo: 'Colchetes [ ] sem par', causa: 'O número de "[" e "]" não bate: a expressão macro ficou incompleta.',
      solucao: ['Cada [ precisa de um ] — inclusive nos aninhados, como G0Z[[#1+#2]*#3].', 'Funções (SIN, COS, TAN, SQRT, ABS, ROUND, FIX, FUP) também levam colchetes: SQRT[#1*#1+#2*#2].'] },
    charInvalido: { sev: 'erro', grupo: 'Sintaxe', titulo: 'Caractere inválido no bloco', causa: 'Há um caractere que não existe no código ISO/Fanuc fora de comentário (aspas, dois-pontos, $, @, chaves, letra acentuada, travessão).',
      solucao: ['Apague o caractere, ou passe o texto para dentro de um comentário entre parênteses (em maiúsculas e sem acento).', 'Ao copiar de Word, e-mail ou PDF entram aspas, travessões e espaços especiais que não aparecem na tela: digite de novo o trecho.'] },
    letraSemValor: { sev: 'erro', grupo: 'Sintaxe', titulo: 'Endereço sem valor', causa: 'Uma letra de endereço (X, Z, F, S...) aparece sem número nem variável depois dela.',
      solucao: ['Escreva o valor logo depois da letra: X50. ou F.2, ou use variável: X#1.', 'Se a letra faz parte de um texto, ponha o texto entre parênteses.'] },
    sintaxe: { sev: 'erro', grupo: 'Sintaxe', titulo: 'Número ou expressão não reconhecido', causa: 'O leitor não conseguiu interpretar o trecho: número mal escrito, operador solto ou conta sem colchetes.',
      solucao: ['Números só com dígitos e um ponto decimal (12.5). Dois pontos ou letras no meio do número dão erro.', 'Contas pedem colchetes: X[#1+5], não X#1+5. Dentro deles valem + − * / e AND, OR, XOR, MOD.', 'Comparações (EQ, NE, GT, LT, GE, LE) só dentro de IF[...] e WHILE[...].'] },
    atribuicao: { sev: 'erro', grupo: 'Sintaxe', titulo: 'Atribuição de variável incompleta', causa: 'A variável #n não recebeu "=" com um valor válido.',
      solucao: ['Escreva #10=25 ou #10=[#1+#2].', 'Se o valor vem de uma conta, confira divisão por zero e raiz de número negativo.'] },
    enderecoRepetido: { sev: 'aviso', grupo: 'Sintaxe', titulo: 'Mesma letra duas vezes no bloco', causa: 'Uma letra de endereço (X, Z, F, S...) aparece mais de uma vez no mesmo bloco. Vale só o último valor, ou o comando alarma. Só G e M podem repetir.',
      solucao: ['Apague o valor repetido ou separe em dois blocos.'] },
    grupoG: { sev: 'aviso', grupo: 'Sintaxe', titulo: 'Dois códigos G do mesmo grupo no bloco', causa: 'Códigos do mesmo grupo se cancelam (G0/G1/G2/G3, G90/G91, G94/G95, G96/G97, G98/G99, G40/G41/G42, G20/G21): só o último vale.',
      solucao: ['Deixe um só código por grupo no bloco.'] },

    /* --- variaveis e fluxo --- */
    varNaoDef: { sev: 'aviso', grupo: 'Variáveis e fluxo', titulo: 'Variável usada antes de receber valor', causa: 'A variável é lida antes de qualquer #n=valor. O comando a trata como vazia (valor 0) e o endereço fica sem valor.',
      solucao: ['Atribua a variável no cabeçalho, antes do primeiro uso: #10=25.', 'Se é variável do sistema (#5221 e parecidas, corretores) ou vem de macro da máquina, o simulador não a conhece: confira o valor na máquina.'] },
    divZero: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'Divisão por zero', causa: 'Uma conta divide (ou faz MOD) por uma variável que vale 0.',
      solucao: ['Confira o divisor: variável zerada, sem valor ou com a medida errada.', 'Proteja antes da conta: IF[#5EQ0]GOTO99 e trate o caso no N99.'] },
    raizNeg: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'Raiz quadrada de número negativo', causa: 'SQRT recebeu um valor menor que zero (medidas que não fecham o triângulo).',
      solucao: ['Confira os valores sob a raiz, por ex. SQRT[#1*#1-#2*#2] com #2 maior que #1.'] },
    gotoSemN: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'GOTO para bloco que não existe', causa: 'O número do GOTO não corresponde a nenhum bloco N do programa.',
      solucao: ['Crie o bloco de destino (ex.: N20G0Z5) ou corrija o número do GOTO.', 'O N precisa estar colado no começo do bloco de destino.'] },
    ifSemGoto: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'IF sem GOTO nem THEN', causa: 'Depois da condição IF[...] falta o que fazer.',
      solucao: ['Escreva IF[#1GT3]GOTO20 ou IF[#1GT3]THEN#2=1.'] },
    whileErro: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'WHILE e END sem par', causa: 'Um WHILE[...]DOn não tem o ENDn correspondente depois dele (ou um ENDn não tem WHILE antes).',
      solucao: ['Todo WHILE[...]DO1 precisa de um END1 depois, com o mesmo número.', 'Laços aninhados usam números diferentes (DO1 dentro de DO2 etc.).'] },
    laco: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'Laço sem fim', causa: 'O programa executa blocos demais sem terminar: a condição do WHILE (ou o GOTO) nunca muda.',
      solucao: ['Dentro do laço altere a variável testada (ex.: #1=#1+1).', 'Confira o sentido da comparação (LT no lugar de GT).'] },
    subNaoAchado: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'Subprograma não encontrado (M98)', causa: 'O M98 chama um subprograma O.... que não está no texto.',
      solucao: ['Cole o subprograma no mesmo texto, depois do M30 do principal (linha O....).', 'Confira o número em M98P....'] },
    subAninhado: { sev: 'erro', grupo: 'Variáveis e fluxo', titulo: 'Subprogramas aninhados demais', causa: 'Subprogramas chamam outros em cadeia (ou um chama a si mesmo) além do limite.',
      solucao: ['Reduza os níveis de chamada e confira se algum subprograma chama a si mesmo.'] },
    semM99: { sev: 'aviso', grupo: 'Variáveis e fluxo', titulo: 'Subprograma sem M99', causa: 'O texto acaba dentro de um subprograma: falta o M99 que devolve ao programa principal.',
      solucao: ['Termine o subprograma com M99.'] },
    truncado: { sev: 'aviso', grupo: 'Variáveis e fluxo', titulo: 'Movimentos demais', causa: 'O programa gera mais movimentos do que o simulador acompanha (laço longo ou passos minúsculos).',
      solucao: ['Confira laços WHILE/GOTO e passos muito pequenos em G74/G75 (P e Q).'] },

    /* --- estrutura --- */
    semFim: { sev: 'aviso', grupo: 'Estrutura', titulo: 'Programa sem M30', causa: 'O programa acaba sem M30 (nem M02): o comando não volta ao início nem para o fuso e a refrigeração.',
      solucao: ['Acrescente M30 na última linha, depois do M9 e do retorno à troca.', 'Subprogramas terminam com M99, não com M30.'] },
    codigoAposM30: { sev: 'dica', grupo: 'Estrutura', titulo: 'Blocos depois do M30', causa: 'O que vem depois do M30 não é executado (só subprogramas O.... chamados por M98).',
      solucao: ['Apague esses blocos ou coloque-os num subprograma (O....) terminado em M99.'] },
    semM9: { sev: 'dica', grupo: 'Estrutura', titulo: 'Refrigeração não desligada', causa: 'O M8 liga a refrigeração e não há M9 antes do fim. Em muitos comandos o M30 já desliga, mas isso depende da máquina.',
      solucao: ['Coloque M9 antes do M30, como nos programas da casa.'] },

    /* --- movimentos --- */
    arcoSemRI: { sev: 'erro', grupo: 'Movimentos', titulo: 'Arco sem R nem I/K', causa: 'G2/G3 precisa do raio (R) ou do centro (I e K) e do ponto final (X, Z).',
      solucao: ['Informe R (positivo = arco menor que 180°) ou I/K: no torno I é a distância em RAIO no eixo X e K a distância em Z, do início do arco ao centro.', 'Confira também se o bloco tem X e/ou Z do ponto final.'] },
    arcoRPequeno: { sev: 'aviso', grupo: 'Movimentos', titulo: 'Raio do arco menor que a metade da corda', causa: 'O R informado não alcança do ponto inicial ao final. O comando alarma; o simulador ajustou para uma semicircunferência.',
      solucao: ['Aumente o R: ele precisa ser pelo menos a metade da distância entre o início e o fim do arco.', 'Lembre que X é DIÂMETRO: a diferença em X vale a metade em raio. Um erro comum é calcular o R com o X inteiro.'] },
    arcoHerdado: { sev: 'aviso', grupo: 'Movimentos', titulo: 'Bloco depois de arco sem G', causa: 'G2/G3 são modais: um bloco só com X/Z logo depois de um arco continua sendo arco e, sem R nem I/K, o comando alarma.',
      solucao: ['Escreva G1 (ou G0) no bloco que deve ser reta.', 'Repita G2/G3 com R ou I/K em cada arco.'] },
    g20: { sev: 'aviso', grupo: 'Movimentos', titulo: 'Polegadas (G20)', causa: 'O simulador trata os valores como milímetros.',
      solucao: ['Use G21 (milímetros), ou confira as medidas à parte na máquina.'] },
    g53: { sev: 'aviso', grupo: 'Movimentos', titulo: 'G53 não simulado', causa: 'O G53 move em coordenada de máquina; o simulador ignora esse movimento.',
      solucao: ['Para o ponto de troca use G28U0 / G28W0, que o simulador entende.'] },
    g50xz: { sev: 'aviso', grupo: 'Movimentos', titulo: 'G50 com X/Z (preset de coordenadas)', causa: 'O G50 (ou G92, no sistema B/C e no Siemens em modo ISO) com X/Z redefine a posição da ferramenta; o simulador não aplica esse preset.',
      solucao: ['Use G50 (ou G92) só com S (limite de rotação) e deixe a origem para G54 e os corretores.'] },
    gIgnorado: { sev: 'aviso', grupo: 'Movimentos', titulo: 'Código G não simulado', causa: 'O comando aceita esse código, mas o simulador não o executa: o percurso simulado pode divergir do real.',
      solucao: ['Rode o programa a seco na máquina e confira esse bloco.', 'Se o código é só de preparação (plano, sistema de coordenadas), pode ser ignorado.'] },

    /* --- ferramenta, rotacao e avanco --- */
    semT: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Corte antes de qualquer T', causa: 'Há movimento de corte sem ter chamado uma ferramenta (T).',
      solucao: ['Chame a ferramenta antes do primeiro corte, depois do retorno à troca: G28U0 e T0101.'] },
    semF: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Corte sem avanço (F)', causa: 'Há G1/G2/G3 (ou ciclo) sem F definido. No comando isso gera alarme.',
      solucao: ['Coloque F no primeiro bloco de corte ou antes dele: G1X50.F.3 (mm/rot em G99).', 'Nos ciclos o F fica no bloco com P e Q (G71P1Q2...F.3).'] },
    semS: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Corte sem rotação definida', causa: 'O corte começa sem S: nenhum G97 S... nem G96 S... foi comandado.',
      solucao: ['Defina a rotação: G97S800M3 (rpm fixo) ou G96S250M4 (velocidade de corte constante) com G50S1500 de limite.'] },
    semGiro: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Corte com o fuso desligado', causa: 'Não há M3 nem M4 (ou há um M5) antes do primeiro corte.',
      solucao: ['Ligue o fuso antes do corte: G96S250M4 ou G97S800M3 (o sentido, M3 ou M4, depende da ferramenta).', 'Depois de um M5, religue antes do próximo corte.'] },
    g96semG50: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'G96 sem limite de rotação (G50 S)', causa: 'Em velocidade de corte constante a rotação sobe quando o diâmetro diminui; sem G50 S o fuso pode chegar à rotação máxima da máquina perto do centro.',
      solucao: ['Escreva G50S1500 (rpm máximo) depois do G96 e antes do corte. Em comando Siemens no modo ISO (G291) o limite é o G92S1500.', 'Para furar e rosquear use G97 com rpm fixo.'],
      gerador: ['No Gerador o limite de rpm vem do cadastro da ferramenta: preencha "limite de rpm".'] },
    avAlto: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Avanço muito alto para mm/rot', causa: 'O F está em mm por rotação (G99) e vale mais de 1,5 — parece um valor de mm/min.',
      solucao: ['Confira a unidade: F.3 = 0,3 mm/rot; F300 só vale em mm/min (G98).', 'Se o avanço é mm/min, escreva G98 antes e volte para G99 depois.'] },
    avBaixo: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Avanço minúsculo em mm/min', causa: 'Com G98 o F é mm/min e o valor informado dá menos de 0,003 mm por rotação — parece um valor de mm/rot.',
      solucao: ['Use F em mm/min (ex.: F150) ou volte a G99 para trabalhar em mm/rot.'] },
    trocaSemRecuo: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Troca de ferramenta sem recuar', causa: 'Entre o último corte e o novo T não há G28/G30: a torre gira com a ferramenta ainda perto da peça e pode bater nela ou na placa.',
      solucao: ['Recue antes de cada T: G28U0 (e G28W0 se precisar), como nos programas da casa.'] },
    g28Abs: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'G28/G30 com X ou Z absoluto', causa: 'O G28 passa primeiro pelo ponto intermediário informado. Com X ou Z absolutos (G28X0) a ferramenta vai até a coordenada, possivelmente por dentro da peça, antes de ir à referência.',
      solucao: ['Use incremental: G28U0 (e G28W0): o ponto intermediário é onde a ferramenta já está.'] },
    furoG96: { sev: 'aviso', grupo: 'Ferramenta e rotação', titulo: 'Furação em G96', causa: 'No centro da peça (X0) o G96 pede rotação infinita: o fuso sobe ao limite durante a furação.',
      solucao: ['Use G97 com rpm fixo para furar, rosquear e rebarbar no centro (ex.: G97S900M3).'] },
    g83semQ: { sev: 'dica', grupo: 'Ferramenta e rotação', titulo: 'G83 sem Q (bicada)', causa: 'Sem Q a broca desce de uma vez, sem quebrar nem retirar o cavaco.',
      solucao: ['Informe Q (em milésimos de mm, ex.: Q5000 = 5 mm por bicada) para furos fundos.'] },

    /* --- ciclos --- */
    cicloSemPar: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Ciclo sem o bloco de parâmetros', causa: 'O G71/G72/G73 de duas linhas precisa da primeira linha (profundidade e retorno) antes da linha com P e Q.',
      solucao: ['Escreva antes: G71U2.R1. (profundidade e retorno), G72W2.R1. ou G73U8.W0.R4 (afastamento total e número de cortes).'] },
    cicloSemContorno: { sev: 'erro', grupo: 'Ciclos', titulo: 'Ciclo aponta para bloco que não existe', causa: 'O P ou o Q do ciclo (G70–G73) não corresponde a um bloco N depois dele.',
      solucao: ['P e Q são números de bloco: G71P1Q2 precisa de N1 e N2 no programa.', 'Se vários contornos repetem N1/N2, o ciclo usa o primeiro achado depois do próprio ciclo.'] },
    cicloProf: { sev: 'erro', grupo: 'Ciclos', titulo: 'Profundidade de corte zero ou negativa', causa: 'O U do G71 (ou W do G72) está zero ou ausente: o ciclo não consegue cortar.',
      solucao: ['Coloque a profundidade por passada, positiva: G71U2.R1.'] },
    cicloContornoCurto: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Contorno com poucos movimentos', causa: 'Entre N(P) e N(Q) há menos de dois movimentos: o ciclo não tem perfil para seguir.',
      solucao: ['Confira os números P e Q e se os blocos do contorno têm X e Z.'] },
    contornoSemG01: { sev: 'erro', grupo: 'Ciclos', titulo: 'Primeiro bloco do contorno sem G0/G1', causa: 'O bloco N(P) do contorno precisa de G0 ou G1. Sem isso o comando acusa alarme ao executar o G70–G73.',
      solucao: ['Escreva G0 (aproximação) ou G1 no bloco inicial do contorno: N1G0X50.', 'É o formato dos programas da casa (N1G0X..., N2G0X...).'] },
    g71ii: { sev: 'aviso', grupo: 'Ciclos', titulo: 'G71 tipo II simulado como tipo I', causa: 'O primeiro bloco do contorno tem X e Z (G71 tipo II). O simulador trata como tipo I.',
      solucao: ['Para o tipo I deixe o primeiro bloco só com X (N1G0X50.) e ande em Z no bloco seguinte.', 'Se quer o tipo II (cavidades), confira o resultado a seco na máquina.'] },
    g71cav: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Cavidade no contorno do G71', causa: 'O contorno sobe e desce em X (cavidade). O simulador desbasta como tipo I e a cavidade pode ficar sem usinar no desbaste.',
      solucao: ['Retire a cavidade do contorno do G71 e faça com G75 (canal) ou G72.', 'Ou use o G71 tipo II, se o comando tiver.'] },
    cicloEixo: { sev: 'dica', grupo: 'Ciclos', titulo: 'Contorno anda nos dois sentidos do eixo principal', causa: 'No G71 o contorno deve andar sempre no mesmo sentido em Z (no G72, em X). Aqui ele volta. O simulador desbasta como se andasse num sentido só.',
      solucao: ['Se a volta é de propósito (programa que já roda na máquina), ignore esta dica.', 'Se não, confira o sinal de Z nos blocos do contorno.'] },
    g71Sinal: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Sinal do sobremetal de acabamento (U)', causa: 'No G71 externo o U de acabamento é positivo; no interno (mandrilar) é negativo. Com o sinal trocado o desbaste corta dentro do perfil.',
      solucao: ['Troque o sinal do U no bloco G71P Q U W F.', 'Confira se o contorno vai de fora para dentro (externo) ou de dentro para fora (interno).'] },
    g73sinal: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Sinais do G73 inconsistentes', causa: 'O U do primeiro bloco (afastamento) tem sinal contrário ao U de acabamento. O simulador usou a direção do acabamento.',
      solucao: ['Use o mesmo sinal nos dois: positivo no externo, negativo no interno.'] },
    g70F: { sev: 'aviso', grupo: 'Ciclos', titulo: 'G70 sem F', causa: 'O G70 não traz F. O F do bloco G71 vale só no desbaste; no acabamento valem os F dos blocos do contorno ou o do G70.',
      solucao: ['Escreva o F no G70 (G70P1Q2F.15) ou nos blocos do contorno.'] },
    cicloSemCurso: { sev: 'aviso', grupo: 'Ciclos', titulo: 'G74/G75 sem curso', causa: 'O ponto final do ciclo é igual à posição atual no eixo principal: não há o que cortar.',
      solucao: ['G74 precisa do Z final (G74X...Z...), G75 do X final (G75X...Z...). Confira a posição de partida antes do ciclo.'] },
    pqUnidade: { sev: 'aviso', grupo: 'Ciclos', titulo: 'P/Q do G74/G75 fora da unidade', causa: 'No G74/G75, P e Q são em milésimos de mm e sem ponto decimal: Q3000 = 3 mm. Q3 ou Q2.5 valem micrometros.',
      solucao: ['Multiplique por 1000: 3 mm → Q3000. Use valor inteiro, sem ponto.'] },
    g76Param: { sev: 'aviso', grupo: 'Ciclos', titulo: 'G76 sem altura, 1ª profundidade ou passo', causa: 'O bloco de execução do G76 precisa de P (altura do filete), Q (1ª profundidade) e F (passo).',
      solucao: ['G76X(Ø do fundo)Z(fim)P(altura em µm)Q(1ª passada em µm)F(passo): ex. G76X65.56Z5P2600Q75F4.'] },
    g76semPre: { sev: 'aviso', grupo: 'Ciclos', titulo: 'G76 sem o bloco de parâmetros', causa: 'Falta a primeira linha do G76 (acabamento, saída, ângulo, profundidade mínima).',
      solucao: ['Escreva antes: G76P010060Q100R0.1 (1 passada de acabamento, saída 0, rosca de 60°, mínimo 0,1 mm, sobremetal 0,1).'] },
    g76G96: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Rosca em G96', causa: 'Em velocidade de corte constante a rotação muda a cada passada e o passo não acompanha: a rosca sai errada.',
      solucao: ['Use G97 com rpm fixo antes do G76 (ex.: G97S400M3).'] },
    g76Rpm: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Rosca com avanço (rpm × passo) alto demais', causa: 'O avanço da rosca é rpm × passo. Acima de 6000 mm/min o eixo costuma não acompanhar.',
      solucao: ['Baixe a rotação: rpm ≈ 5000 ÷ passo (passo 2 → ~2500 rpm; passo 4 → ~1250 rpm).'] },
    g76Altura: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Altura do filete grande para o passo', causa: 'A altura (P) passa de 75% do passo. Na rosca métrica ISO é cerca de 61% do passo.',
      solucao: ['Confira o P: ele é em micrômetros (P1230 = 1,23 mm, passo 2). Para ISO use 0,6134 × passo.'] },
    g76Ang: { sev: 'aviso', grupo: 'Ciclos', titulo: 'Ângulo da rosca não aceito', causa: 'Os 2 últimos dígitos do P do primeiro bloco são o ângulo e só aceitam 80, 60, 55, 30, 29 ou 00.',
      solucao: ['Rosca métrica: 60. P010060 = 1 acabamento, saída 0, 60°.'] },
    g76Acab: { sev: 'dica', grupo: 'Ciclos', titulo: 'Muitas passadas de acabamento no G76', causa: 'Os 2 primeiros dígitos do P (mm de mmrraa) são o número de passadas de acabamento. Mais de 3 repete a mesma profundidade várias vezes.',
      solucao: ['Se não é de propósito, use P010060 (1 passada de acabamento).'] },

    /* --- compensacao do raio --- */
    compSemRaio: { sev: 'aviso', grupo: 'Compensação G41/G42', titulo: 'G41/G42 com ferramenta sem raio de ponta', causa: 'O banco de ferramentas não tem raio para a ferramenta (ou ela não é pastilha de torneamento): a simulação segue a ponta programada.',
      solucao: ['Cadastre o raio de ponta da pastilha em Ferramentas e escolha a ferramenta na simulação.', 'Na máquina, confira o raio e o quadrante da ponta (1 a 9) no corretor.'],
      gerador: ['Cadastre o raio de ponta da ferramenta em Ferramentas, ou desligue a compensação no campo "Compensação do raio de ponta".'] },
    compInterf: { sev: 'aviso', grupo: 'Compensação G41/G42', titulo: 'Interferência do raio de ponta em canto interno', causa: 'O movimento num canto interno é menor que o raio da ponta: a ferramenta cortaria além do contorno (alarme de interferência no comando).',
      solucao: ['Aumente o canto interno do desenho (raio maior que o da ponta) ou use uma pastilha de raio menor.', 'Evite degraus menores que o raio da ponta no contorno compensado.'] },
    compTroca: { sev: 'aviso', grupo: 'Compensação G41/G42', titulo: 'Troca de ferramenta com compensação ligada', causa: 'O G41/G42 continua ativo no T seguinte: a compensação passa para a outra ferramenta e o posicionamento da saída sai errado.',
      solucao: ['Cancele com G40, num bloco com movimento de afastamento, antes do T.'] },
    compFim: { sev: 'aviso', grupo: 'Compensação G41/G42', titulo: 'Compensação nunca cancelada (G40)', causa: 'O G41/G42 foi ligado e não há G40 até o fim do programa.',
      solucao: ['Cancele com G40 num bloco de saída (ex.: G40G0X..) antes do retorno e do M30.'] },

    /* --- alertas do simulador --- */
    simPlaca: { sev: 'erro', grupo: 'Simulação', titulo: 'Colisão com a placa', causa: 'A pastilha ou o porta-ferramenta chega nas castanhas.',
      solucao: ['Pare o corte a pelo menos 1 a 2 mm das castanhas: diminua o comprimento usinado em Z.', 'Puxe a peça para fora da placa (mais comprimento livre) ou use castanhas mais baixas/moles.', 'Confira o Ø da placa e o comprimento preso informados (Configurações e card "Bruto e fixação").'],
      gerador: ['Aumente o comprimento livre da peça ou reduza o comprimento de usinagem.', 'Confira "Máquina e placa" (Ø da placa e comprimento preso).'] },
    simPeca: { sev: 'erro', grupo: 'Simulação', titulo: 'Corte dentro da peça acabada', causa: 'A ferramenta passa por uma região que deveria ficar como peça: sobremetal errado, ponto de partida, contorno ou pastilha que não cabe no perfil.',
      solucao: ['Confira o sobremetal de acabamento (U/W) e o sinal: externo positivo, interno negativo.', 'Confira o ponto de partida do ciclo (Z de aproximação) e os blocos do contorno.', 'A pastilha pode ser grande para o perfil: use uma de ângulo menor (55° no lugar de 80°) em cantos e cones que descem para a placa; cadastre o ângulo do suporte em Ferramentas.', 'Com G41/G42: confira o lado (G42 externo, G41 interno), o raio e o quadrante da ponta.'],
      gerador: ['Confira os sobremetais de acabamento e a ferramenta escolhida (ângulo da pastilha e do suporte, em Ferramentas).'] },
    simRapido: { sev: 'erro', grupo: 'Simulação', titulo: 'Avanço rápido (G0) dentro do material', causa: 'Um movimento em G0 atravessa material ainda não cortado: no real a ferramenta bate e quebra.',
      solucao: ['Aproxime em G0 só até 1 a 2 mm antes do material e entre com G1 e F.', 'Ande primeiro em X ou em Z para sair da peça (X maior que o Ø do bruto, ou Z positivo) e só depois ao ponto de partida.', 'Confira se o Ø e o comprimento do bruto da simulação são os reais.'],
      gerador: ['Confira o Ø do bruto, o comprimento do bruto e o sobremetal em Z: o rápido usa essas medidas.'] },
    simLimiteX: { sev: 'aviso', grupo: 'Simulação', titulo: 'Fora do curso em X', causa: 'O X passa do curso da máquina (Configurações).',
      solucao: ['Reduza o X (diâmetro) ou confira o curso cadastrado em Configurações.', 'Pontos de troca muito afastados também estouram: diminua o X do ponto de troca.'] },
    simLimiteXneg: { sev: 'aviso', grupo: 'Simulação', titulo: 'X abaixo do centro', causa: 'A ferramenta vai para X negativo: passa do centro da peça.',
      solucao: ['Troque o X negativo por 0 (ou -1 em faceamento para limpar o centro) e confira o sinal da variável.'] },
    simLimiteZ: { sev: 'aviso', grupo: 'Simulação', titulo: 'Fora do curso em Z (positivo)', causa: 'O Z passa do curso positivo da máquina (Configurações).',
      solucao: ['Reduza o Z do ponto de troca/recuo ou confira o curso cadastrado em Configurações.'] },
    simLimiteZneg: { sev: 'aviso', grupo: 'Simulação', titulo: 'Fora do curso em Z (negativo)', causa: 'O Z passa do curso negativo da máquina (Configurações).',
      solucao: ['Diminua o comprimento usinado ou confira o curso cadastrado em Configurações.'] },
    simSobra: { sev: 'aviso', grupo: 'Simulação', titulo: 'Sobra de material no fim do programa', causa: 'Ficou material que o perfil acabado não deveria ter: incremento grande, pastilha curta, ciclo que não cobre toda a região ou contorno incompleto.',
      solucao: ['Diminua o incremento de corte (U do G71) ou acrescente uma passada.', 'Confira se o ciclo de desbaste cobre a região (ponto de partida e Z final).', 'Confira o comprimento da pastilha e se há cavidade que o desbaste não alcança.'],
      gerador: ['Diminua os incrementos de corte ou confira a ferramenta escolhida e os sobremetais.'] },

    /* --- sem tipo conhecido --- */
    geral: { sev: 'aviso', grupo: 'Outros', titulo: 'Observação do leitor', causa: 'O leitor encontrou algo que não esperava neste ponto.',
      solucao: ['Leia a mensagem, corrija a linha indicada e confira a simulação de novo.'] }
  };

  /* ---------- classificacao das mensagens antigas do leitor (as novas ja trazem cod) ---------- */
  var REGRAS = [
    [/^Variável #\d+ usada antes/, 'varNaoDef'],
    [/falta fechar \]|falta \] depois de|falta \[ depois de/, 'colchete'],
    [/valor ausente depois da letra/, 'letraSemValor'],
    [/caractere inesperado "[0-9.]"/, 'sintaxe'],
    [/caractere inesperado/, 'charInvalido'],
    [/falta "=" na atribuição|valor inválido para #/, 'atribuicao'],
    [/expressão não reconhecida|texto inesperado|número inválido|número da variável/, 'sintaxe'],
    [/divisão por zero|MOD por zero/, 'divZero'],
    [/raiz quadrada de número negativo/, 'raizNeg'],
    [/^GOTO N\d+: bloco não encontrado/, 'gotoSemN'],
    [/IF sem GOTO/, 'ifSemGoto'],
    [/WHILE sem|END\d+ sem WHILE/, 'whileErro'],
    [/provável laço sem fim/, 'laco'],
    [/subprograma O\d+ não está/, 'subNaoAchado'],
    [/aninhados demais/, 'subAninhado'],
    [/falta M99/, 'semM99'],
    [/Programa gera mais de/, 'truncado'],
    [/arco G\d sem R nem I|arco sem ponto final/, 'arcoSemRI'],
    [/menor que a metade da corda/, 'arcoRPequeno'],
    [/sem G depois de um arco/, 'arcoHerdado'],
    [/^G20 /, 'g20'],
    [/^G53 /, 'g53'],
    [/G50 com X\/Z/, 'g50xz'],
    [/não é simulado e foi ignorado/, 'gIgnorado'],
    [/antes de qualquer comando T/, 'semT'],
    [/Corte sem avanço F/, 'semF'],
    [/Corte sem rotação definida/, 'semS'],
    [/sem o bloco G7[123] /, 'cicloSemPar'],
    [/não achei o bloco N/, 'cicloSemContorno'],
    [/contorno com menos de 2 movimentos/, 'cicloContornoCurto'],
    [/profundidade de corte \(/, 'cicloProf'],
    [/G71 tipo II/, 'g71ii'],
    [/sobe e desce em X \(cavidade\)/, 'g71cav'],
    [/G73: o sinal de U/, 'g73sinal'],
    [/G70 sem F/, 'g70F'],
    [/G74 sem curso|G75 sem curso/, 'cicloSemCurso'],
    [/G76 sem altura do filete/, 'g76Param'],
    [/G76 sem o bloco G76 P Q R/, 'g76semPre'],
    [/não tem raio de ponta/, 'compSemRaio'],
    [/interferência/, 'compInterf']
  ];
  function classifica(texto) {
    for (var k = 0; k < REGRAS.length; k++) if (REGRAS[k][0].test(texto || '')) return REGRAS[k][1];
    return 'geral';
  }

  // alerta do simulador (sim.js analyze) -> codigo do catalogo
  function codAlerta(a) {
    var t = a.text || '';
    if (a.type === 'placa') return 'simPlaca';
    if (a.type === 'peca') return 'simPeca';
    if (a.type === 'rapido') return 'simRapido';
    if (a.type === 'sobra') return 'simSobra';
    if (/abaixo do centro/.test(t)) return 'simLimiteXneg';
    if (/abaixo do curso de Z/.test(t)) return 'simLimiteZneg';
    if (/curso de Z/.test(t)) return 'simLimiteZ';
    return 'simLimiteX';
  }
  function deAlerta(a) { var c = codAlerta(a); return Object.assign({ cod: c }, CAT[c]); }

  /* ---------- verificacao estatica do texto (acha o que nao foi executado tambem) ---------- */
  function varre(ln) { // separa codigo de comentarios como o leitor: ( ) aninhados e ; ate o fim da linha
    var depth = 0, code = '', sobra = false, k, c;
    for (k = 0; k < ln.length; k++) {
      c = ln.charAt(k);
      if (c === '(') depth++;
      else if (c === ')') { if (depth > 0) depth--; else sobra = true; }
      else if (depth > 0) continue;
      else if (c === ';') break;
      else code += c;
    }
    return { code: code, aberto: depth > 0, sobra: sobra };
  }
  // palavras (letra + valor) de um bloco ja sem espacos; null se encontrar algo que nao sabe quebrar (os outros testes cuidam)
  function palavras(rest) {
    var out = [], k = 0, n = rest.length, l, v0, c, depth;
    while (k < n) {
      l = rest.charAt(k);
      if (!(l >= 'A' && l <= 'Z')) return null;
      k++; v0 = k;
      while (k < n && (rest.charAt(k) === '+' || rest.charAt(k) === '-')) k++;
      if (rest.charAt(k) === '#') { k++; while (k < n && rest.charAt(k) >= '0' && rest.charAt(k) <= '9') k++; }
      else {
        var f = /^(SIN|COS|TAN|ASIN|ACOS|ATAN|SQRT|ABS|ROUND|FIX|FUP|LN|EXP)(?=\[)/.exec(rest.slice(k));
        if (f) k += f[1].length;
        if (rest.charAt(k) === '[') { depth = 0; do { c = rest.charAt(k); if (c === '[') depth++; else if (c === ']') depth--; k++; } while (k < n && depth > 0); }
        else while (k < n && /[0-9.]/.test(rest.charAt(k))) k++;
      }
      out.push({ l: l, v: rest.slice(v0, k) });
      if (rest.charAt(k) === '.') k++; // "#3." aparece em programas da casa
    }
    return out;
  }
  var GRUPOS = [[0, 1, 2, 3], [90, 91], [94, 95], [96, 97], [98, 99], [40, 41, 42], [20, 21]];

  function lint(texto) {
    var prep = Prog.prepara(texto), B = prep.blocos, raw = prep.linhas, out = [], i, k;
    var temN = {};
    B.forEach(function (b) { if (b.n != null) temN[b.n] = true; });
    var oProg = {}, alvoGoto = {};
    B.forEach(function (b) {
      if (b.kind === 'o') oProg[b.o] = true;
      var mg2 = (b.kind === 'goto' || b.kind === 'if') && /GOTO(\d+)/.exec(b.rest);
      if (mg2) alvoGoto[parseInt(mg2[1], 10)] = true;
    });
    function add(linha, cod, texto2, extra) { out.push(Object.assign({ linha: linha, cod: cod, texto: texto2, origem: 'lint' }, extra || {})); }
    var primeiroFim = -1;
    for (i = 0; i < raw.length; i++) {
      var v = varre(raw[i]), b = B[i], s = b.s;
      if (v.aberto) add(i, 'comAberto', 'Comentário aberto com "(" e sem o ")" correspondente.');
      else if (v.sobra) add(i, 'comAberto', 'Há um ")" sem o "(" correspondente.');
      if (s === '' || s.charAt(0) === '%' || s.charAt(0) === '<') continue;
      // colchetes
      var dep = 0, bad = false;
      for (k = 0; k < s.length; k++) { if (s.charAt(k) === '[') dep++; else if (s.charAt(k) === ']') { dep--; if (dep < 0) bad = true; } }
      if (bad || dep !== 0) add(i, 'colchete', dep > 0 ? 'Faltam ' + dep + ' "]" para fechar a expressão.' : 'Há "]" a mais, sem "[" correspondente.');
      // caracteres que nao existem no ISO/Fanuc
      var mc = /[^A-Z0-9#.+\-*\/=\[\],%]/.exec(s);
      if (mc) add(i, 'charInvalido', 'Caractere "' + mc[0] + '" não é válido num bloco (só dentro de comentário).');
      // GOTO / IF..GOTO para N inexistente
      if (b.kind === 'goto' || b.kind === 'if') {
        var mg = /GOTO(\d+)/.exec(b.rest);
        if (mg && !temN[parseInt(mg[1], 10)]) add(i, 'gotoSemN', 'GOTO N' + parseInt(mg[1], 10) + ': não existe bloco N' + parseInt(mg[1], 10) + ' no programa.');
        if (b.kind === 'if' && !/GOTO|THEN/.test(b.rest)) add(i, 'ifSemGoto', 'IF sem GOTO nem THEN.');
      }
      // WHILE / END
      if (b.kind === 'while') {
        var md = /DO(\d+)$/.exec(b.rest), achou = false;
        if (!md) add(i, 'whileErro', 'WHILE sem DOn no fim da linha.');
        else { for (k = i + 1; k < B.length; k++) if (B[k].kind === 'end' && B[k].rest === 'END' + md[1]) { achou = true; break; } if (!achou) add(i, 'whileErro', 'WHILE...DO' + md[1] + ' sem o END' + md[1] + ' depois dele.'); }
      }
      if (b.kind === 'end') {
        var me = b.rest.slice(3), ach2 = false;
        for (k = i - 1; k >= 0; k--) if (B[k].kind === 'while' && new RegExp('DO' + me + '$').test(B[k].rest)) { ach2 = true; break; }
        if (!ach2) add(i, 'whileErro', 'END' + me + ' sem o WHILE...DO' + me + ' antes dele.');
      }
      if (b.kind !== 'normal') continue;
      var ps = palavras(b.rest);
      if (!ps) continue;
      // endereco repetido (so G e M podem)
      var cont = {}, rep = null;
      ps.forEach(function (p) { if (p.l === 'G' || p.l === 'M') return; cont[p.l] = (cont[p.l] || 0) + 1; if (cont[p.l] === 2 && !rep) rep = p.l; });
      if (rep) add(i, 'enderecoRepetido', 'A letra ' + rep + ' aparece mais de uma vez no bloco.');
      // codigos G do mesmo grupo
      var gs = ps.filter(function (p) { return p.l === 'G' && /^\d+\.?\d*$/.test(p.v); }).map(function (p) { return Math.round(parseFloat(p.v) * 10) / 10; });
      GRUPOS.forEach(function (gr) {
        var presentes = gr.filter(function (g) { return gs.indexOf(g) >= 0; });
        if (presentes.length > 1) add(i, 'grupoG', 'G' + presentes.join(' e G') + ' no mesmo bloco: só o último vale.');
      });
      // M98 com subprograma ausente
      var m98 = ps.some(function (p) { return p.l === 'M' && parseFloat(p.v) === 98; }), pp = ps.filter(function (p) { return p.l === 'P' && /^\d+$/.test(p.v); })[0];
      if (m98 && pp) { var pn = parseInt(pp.v, 10); if (pn > 9999) pn = pn % 10000; if (!oProg[pn]) add(i, 'subNaoAchado', 'M98: subprograma O' + pn + ' não está no texto colado.'); }
      if (primeiroFim < 0 && ps.some(function (p) { return p.l === 'M' && (parseFloat(p.v) === 30 || parseFloat(p.v) === 2); })) primeiroFim = i;
    }
    // blocos depois do M30 que nao sao subprograma
    if (primeiroFim >= 0) {
      for (i = primeiroFim + 1; i < B.length; i++) {
        if (B[i].kind === 'o') break;
        if (B[i].n != null && alvoGoto[B[i].n]) break; // rotulo de desvio (IF..GOTO) depois do M30: o fluxo chega la
        if (B[i].kind === 'vazio') continue;
        add(i, 'codigoAposM30', 'Este bloco vem depois do M30 (linha ' + (primeiroFim + 1) + ') e não será executado.');
        break;
      }
    }
    return out;
  }

  /* ---------- correcoes prontas ---------- */
  // fix = {op, linha, ...}; aplicar() sabe fazer: subst (re/rep), fimLinha (texto), insAntes / insDepois (texto)
  function acharFim(linhas) { // ultima linha com M30/M02
    var k, s;
    for (k = linhas.length - 1; k >= 0; k--) { s = varre(linhas[k]).code.replace(/\s+/g, '').toUpperCase(); if (/M0*30(?!\d)|M0*2(?!\d)/.test(s)) return k; }
    return -1;
  }
  function fixPara(it, linhas) {
    var L = it.linha, ln = linhas[L] == null ? '' : linhas[L], f = null, k, m;
    switch (it.cod) {
      case 'comAberto':
        if (/aberto com/.test(it.texto)) f = { op: 'fimLinha', texto: ')', rotulo: 'Fechar o comentário com ")" no fim da linha', exato: true };
        break;
      case 'semFim': f = { op: 'insDepois', texto: 'M30', rotulo: 'Acrescentar M30 depois desta linha', exato: true }; break;
      case 'semM9': f = { op: 'insAntes', texto: 'M9', rotulo: 'Inserir M9 antes do fim do programa', exato: true }; break;
      case 'compFim':
        k = acharFim(linhas);
        if (k >= 0) { f = { op: 'insAntes', linha: k, texto: 'G40', rotulo: 'Inserir G40 antes do fim do programa (confira o bloco de saída)', exato: false }; }
        break;
      case 'compTroca': f = { op: 'insAntes', texto: 'G40', rotulo: 'Inserir G40 antes desta troca (confira o bloco de saída)', exato: false }; break;
      case 'trocaSemRecuo': f = { op: 'insAntes', texto: 'G28U0', rotulo: 'Inserir G28U0 (recuo em X) antes da troca', exato: false }; break;
      case 'g96semG50': f = { op: 'insDepois', texto: 'G50S2000', rotulo: 'Inserir G50S2000 depois do G96 (ajuste o limite de rpm)', exato: false }; break;
      case 'contornoSemG01': if (/^\s*N\s*\d+/i.test(ln) && !/^\s*N\s*\d+\s*G/i.test(ln)) f = { op: 'subst', re: '^(\\s*N\\s*\\d+)', rep: '$1G0', rotulo: 'Colocar G0 no início do bloco do contorno', exato: false }; break;
      case 'g28Abs':
        m = varre(ln).code.replace(/\s+/g, '').toUpperCase();
        if (/G0?(28|30)(?!\d)/.test(m)) f = { op: 'subst', re: '([XZ])(-?\\d*\\.?\\d+|#\\d+)', flags: 'gi', rep: '__XZ__', rotulo: 'Trocar X/Z absolutos por incremental (U0 / W0)', exato: false };
        break;
    }
    if (!f) return null;
    if (f.linha == null) f.linha = L;
    var alvo = linhas[f.linha] == null ? '' : linhas[f.linha];
    if (f.op === 'subst') f.antes = alvo, f.depois = aplicarLinha(alvo, f);
    else if (f.op === 'fimLinha') f.antes = alvo, f.depois = alvo.replace(/\s+$/, '') + f.texto;
    if ((f.op === 'subst' || f.op === 'fimLinha') && f.antes === f.depois) return null;
    return f;
  }
  function aplicarLinha(ln, f) {
    if (f.op === 'fimLinha') return ln.replace(/\s+$/, '') + f.texto;
    if (f.rep === '__XZ__') { // so a parte de codigo da linha: o comentario fica como esta
      var cut = ln.search(/[(;]/), code = cut < 0 ? ln : ln.slice(0, cut), tail = cut < 0 ? '' : ln.slice(cut);
      return code.replace(new RegExp(f.re, f.flags || 'gi'), function (_, l) { return l.toUpperCase() === 'X' ? 'U0' : 'W0'; }) + tail;
    }
    return ln.replace(new RegExp(f.re, f.flags || 'i'), f.rep);
  }
  var ORDEM_OP = { subst: 0, fimLinha: 0, insDepois: 1, insAntes: 2 };
  function aplicar(texto, fixes) {
    var L = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n'), feitos = {};
    (fixes || []).slice().sort(function (a, b) { return b.linha - a.linha || ORDEM_OP[a.op] - ORDEM_OP[b.op]; }).forEach(function (f) {
      var chave = f.op + '|' + f.linha + '|' + (f.texto || f.re);
      if (feitos[chave]) return; feitos[chave] = 1;
      if (f.op === 'subst' || f.op === 'fimLinha') { if (L[f.linha] != null) L[f.linha] = aplicarLinha(L[f.linha], f); }
      else if (f.op === 'insAntes') L.splice(f.linha, 0, f.texto);
      else if (f.op === 'insDepois') L.splice(f.linha + 1, 0, f.texto);
    });
    return L.join('\n');
  }

  /* ---------- lista final ---------- */
  var ORDEM_SEV = { erro: 0, aviso: 1, dica: 2 };
  // res = resultado de CNCProg.interpretar; texto = programa; opt.extras = avisos de fora do leitor (ex.: compensacao, cena.compAvisos)
  function diagnosticar(res, texto, opt) {
    opt = opt || {};
    var lista = [], visto = {}, vistoLC = {}, linhas = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n');
    function add(m, origem) {
      var cod = m.cod || classifica(m.texto), ent = CAT[cod] || CAT.geral, chave = m.linha + '|' + cod + '|' + m.texto;
      if (visto[chave]) return; visto[chave] = 1;
      if (origem === 'lint') { if (vistoLC[m.linha + '|' + cod]) return; } else vistoLC[m.linha + '|' + cod] = 1; // o que o leitor ja achou na linha nao se repete
      var sev = origem === 'erro' ? 'erro' : ent.sev;
      var it = { cod: cod, sev: sev, linha: m.linha, texto: m.texto, grupo: ent.grupo, titulo: ent.titulo, causa: ent.causa, solucao: ent.solucao, gerador: ent.gerador || null, origem: origem };
      it.fix = fixPara(it, linhas);
      lista.push(it);
    }
    if (res) {
      (res.erros || []).forEach(function (m) { add(m, 'erro'); });
      (res.avisos || []).forEach(function (m) { add(m, 'aviso'); });
      (res.dicas || []).forEach(function (m) { add(m, 'dica'); });
    }
    (opt.extras || []).forEach(function (m) { add(m, 'aviso'); });
    lint(texto).forEach(function (m) { add(m, 'lint'); });
    lista.sort(function (a, b) { return ORDEM_SEV[a.sev] - ORDEM_SEV[b.sev] || a.linha - b.linha; });
    return lista.slice(0, 120);
  }
  function resumo(lista) {
    var r = { erro: 0, aviso: 0, dica: 0 };
    lista.forEach(function (it) { r[it.sev]++; });
    return r;
  }
  function fixesExatos(lista) { return lista.filter(function (it) { return it.fix && it.fix.exato; }).map(function (it) { return it.fix; }); }

  // programa direto do texto (usado na janela do Gerador): interpreta, junta os avisos extras e devolve a lista
  function analisarTexto(texto, maq, extras) {
    var res = Prog.interpretar(texto, { maq: maq || {} });
    return diagnosticar(res, texto, { extras: extras });
  }

  /* ---------- HTML (compartilhado pelas duas telas) ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var ROTULO = { erro: 'ERRO', aviso: 'AVISO', dica: 'DICA' };
  function listaHtml(ul, itens) { return '<' + ul + ' class="dg-sol">' + itens.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</' + ul + '>'; }
  // opt: origem 'gerador' mostra a solucao do Gerador (quando existe); opt.aplicar = true mostra o botao de aplicar a correcao
  function corpo(it, opt) {
    opt = opt || {};
    var sol = opt.origem === 'gerador' && it.gerador ? it.gerador.concat([]) : it.solucao;
    var h = '<div class="dg-causa"><b>Por que acontece:</b> ' + esc(it.causa) + '</div><div class="dg-como"><b>Como corrigir:</b>' + listaHtml('ul', sol) + '</div>';
    if (it.fix && opt.aplicar) {
      var f = it.fix, prev = f.op === 'insAntes' || f.op === 'insDepois' ? '<code>+ ' + esc(f.texto) + '</code>' : '<code class="dg-antes">' + esc(f.antes.trim()) + '</code><code class="dg-depois">' + esc(f.depois.trim()) + '</code>';
      h += '<div class="dg-fix"><b>Correção sugerida:</b> ' + esc(f.rotulo) + (f.exato ? '' : ' <i>(confira o valor antes de usar)</i>') + prev +
        '<button type="button" class="btn sm dg-aplica" data-k="' + opt.idx + '">Aplicar</button></div>';
    }
    return h;
  }
  function html(lst, opt) {
    opt = opt || {};
    if (!lst.length) return '<div class="alert-ok">Nenhum problema de programação encontrado.</div>';
    return lst.map(function (it, i) {
      var o = Object.assign({}, opt, { idx: i });
      return '<div class="dg dg-' + it.sev + '" data-l="' + it.linha + '" data-i="' + i + '" title="Clique para ir à linha">' +
        '<div class="dg-top"><span class="dg-sev">' + ROTULO[it.sev] + '</span><b class="dg-tit">' + esc(it.titulo) + '</b><span class="dg-lin">linha ' + (it.linha + 1) + '</span></div>' +
        '<div class="dg-msg">' + esc(it.texto) + '</div>' +
        '<details class="dg-det"><summary>Causa e como corrigir</summary>' + corpo(it, o) + '</details></div>';
    }).join('');
  }
  // detalhe de um alerta do simulador (colisao etc.): o mesmo texto de causa e solucao
  function htmlAlerta(a, opt) {
    var it = deAlerta(a);
    return '<details class="dg-det dg-alerta"><summary>Causa e como corrigir</summary>' + corpo(it, opt) + '</details>';
  }

  return { CAT: CAT, classifica: classifica, codAlerta: codAlerta, deAlerta: deAlerta, lint: lint, diagnosticar: diagnosticar, analisarTexto: analisarTexto,
    resumo: resumo, fixesExatos: fixesExatos, aplicar: aplicar, html: html, htmlAlerta: htmlAlerta };
});
