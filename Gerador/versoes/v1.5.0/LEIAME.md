# Gerador CNC Torno

Abrir: dois cliques em `index.html` (Chrome ou Edge). Não precisa instalar nada nem estar online.

## Fluxo
1. **Tipo de peça** → medidas (bloco bruto + peça final) → **ferramentas** do banco → **incrementos de corte**.
2. O programa sai no padrão da ferramentaria (clone dos programas validados), com todas as variáveis no topo.
3. Abas: **Código CNC**, **Simulador**, **Estratégia**, **Dicionário de variáveis**.
4. Copiar ou baixar `.txt` (quebra de linha Windows). Peças de dois lados têm um seletor **Lado 1 / Lado 2** e o botão **Baixar os 2 lados**.

## Geometrias
| Tipo | Base | Ferramentas |
|---|---|---|
| Matriz sólida | `MATRIZ.SOLIDA.txt` | faceamento/torneamento externo |
| BA / BAT | `BA.E.BAT.txt` (mesma estrutura da matriz sólida; folga padrão 0,3 mm, Ø225/usinagem 14/raio 3) | faceamento/torneamento externo |
| Matriz tubular | `MATRIZ.TUBULAR.ENCAIXE.txt` | externa + encaixe (canal frontal) |
| Espina (2 lados) | `ENCAIXE.ESPINA.E.ALIMENTADOR.txt` (lado 1) + `CABECA.ESPINA.NOVO.txt` (lado 2) | externa (desbaste e acabamento) |
| Peça simples (desenho salvo) | `PORTA.MATRIZ.txt` (G71) + `CABECA.ESPINA.ANTIGO.txt` (G70) + `PORTA.MATRIZ.INTERNO.txt` + `ALIMENTADOR.ENCAIXE.INTERNO.txt` | externa + canal, broca e barra interna (opcionais) |

Em breve: porta-matriz e alimentador padrão. Cada geometria nova é um objeto em `core.js` (campos + `gerar()`).

### Peça simples (desenho salvo)
**Desde a v1.3.0 a peça simples não é mais desenhada no Gerador:** o perfil, o comprimento final e os lados vêm de um **desenho salvo** na operação **Desenho da peça** (ver abaixo). No Gerador você escolhe o desenho (botões **Editar** e **Novo** levam ao editor), digita o bruto (Ø, comprimento, furo existente, sobremetal do lado 1) e define como usinar (o que usinar de cada lado, sentido do desbaste, fixação na placa). A meia seção do desenho escolhido aparece na seção Medidas (face à direita, como no simulador). O que está descrito a seguir sobre trechos vale para os elementos do desenho.
- **Trechos:** `Cilindro` (Ø, comprimento), `Cone` (Ø inicial, Ø final, comprimento), `Chanfro` (tamanho C a 45°), `Raio` (R) e `Canal externo` (Ø do fundo, posição Z da parede mais próxima da face, largura). Botões ↑ ↓ × reordenam e removem; até 12 por lado.
- **Chanfro/raio** valem para o canto escolhido (ver "Chanfro e raio em um canto escolhido"). Só em cilindro (não em cone) e com degrau entre os trechos.
- **Código:** faceamento em G75; perfil em G71 (U = incremento da ferramenta, W/U de acabamento = sobremetais da ferramenta ou do card de incrementos) + o contorno em N1–N2 + G70. Cada medida é uma variável (`#200` em diante, 4 por trecho) e os Z acumulados são calculados (`#131...`). O canal sai em G75 com a ferramenta de canal (largura, incremento e avanço vêm do banco; canal mais largo que a ferramenta anda em Z a 80% da largura).
- **Limite do G71 tipo I:** o diâmetro não pode diminuir indo para o fundo (nem cone que diminui). O que diminui para dentro é feito pelo **outro lado**: use "2 lados".
- **2 lados:** cada lado tem a sua lista, contada da própria face; "Sobremetal em Z no lado 1" divide o sobremetal (o resto vai para o lado 2). O lado 2 simula o bruto já com o perfil do lado 1. A faixa central que nenhum lado usina fica no Ø bruto (aviso). A soma dos dois lados não pode passar do comprimento da peça.
- **Não inclui ainda:** canal interno e rosca.
- Padrão inicial = exemplo de peça (chanfro, Ø40, cone, Ø60, canal) para ver o funcionamento; troque pelas suas medidas.
- **Gráfico com seletor de lado:** com "2 lados", o gráfico da meia seção tem os botões **Lado 1 | Lado 2** (mesmo seletor do código e do simulador: trocar em um troca em todos). No Lado 2 o tracejado é o bloco já com o lado 1 feito.

#### O que usinar: externo, interno ou ambos
Select **"O que usinar · lado 1/2"** (grupo "Operações", um por lado): *Externo e interno* (padrão), *Só externo* ou *Só interno*. Os campos do que não será usinado somem da tela.
- **Só externo:** a lista de internos é ignorada (nenhuma broca nem barra).
- **Só interno:** não há perfil nem canal externo, o bloco fica no Ø bruto; o **faceamento continua** (ele define o Z0). Precisa de furo ou mandrilamento na lista interna (senão dá erro). Em dois lados cada lado escolhe o seu (ex.: lado 1 externo e lado 2 só interno); o aviso de "faixa central no Ø bruto" não aparece quando algum lado é só interno.

#### Trechos internos (furo + mandrilamento)
Segunda lista por lado, "Internos · lado 1/2", também da face (Z0) ao fundo. Fica vazia por padrão (sem operação interna).
- **Furo (broca):** Ø do furo e profundidade. Sai em `G83` no eixo (`X0`, plano `Z2`, bicada = incremento da broca no banco, RPM fixo `G97`), como no `ALIMENTADOR.ENCAIXE.INTERNO`. Só um por lado. É o furo piloto de onde o mandrilamento parte. Se a broca tem Ø cadastrado diferente do furo, aparece aviso.
- **Cilindro interno** (Ø, comprimento) e **Cone interno** (Ø na boca, Ø no fundo, comprimento): mandrilamento com a barra, `G71`/`G72` interno + `G70` nos blocos **N3–N4**, partindo do Ø do furo (`X#furo`, `Z1`), como no `PORTA.MATRIZ.INTERNO`. `U` sai negativo no interno (sobremetal do Ø e de Z vêm da ferramenta interna do banco; 0 = sem sobremetal).
- **Chanfro interno / Raio interno:** canto **entrada do furo** (na face), **degrau** entre dois cilindros internos ou **fundo** (parede × fundo, só se o último Ø for maior que o furo). Só em cilindro.
- **Sem broca, perfil escalonado:** se a lista interna não tem "Furo (broca)" e o bruto não tem furo informado, o programa **considera que o bloco já vem com furo passante** com o **menor Ø do perfil** (o último trecho) e o mandrilamento parte dele; aparece um aviso amarelo dizendo isso. Assim um perfil de 2 ou mais diâmetros com comprimentos diferentes funciona só com cilindros/cones internos. Bloco maciço: adicione o "Furo (broca)". O bruto da simulação já vem com esse furo (e sai em `G1901`).
- **Regras:** o Ø **não pode aumentar** indo para o fundo (a barra não faz sub-corte: use o outro lado); nenhum Ø interno menor que o furo; a profundidade do furo ≥ a do mandrilamento e ≤ comprimento da peça (igual = furo passante, com aviso de saída da broca); parede entre o interno e o externo menor que 0,3 mm = erro, menor que 2 mm = aviso.
- **Ferramentas:** o formulário ganha "Broca" (tipo Furação) e "Barra de mandrilamento" (tipo Interna). O cadastro de ferramenta tem o campo **Diâmetro da broca**.
- **Com 2 lados** os furos dos dois lados aparecem juntos no gráfico e no simulador; o bruto do lado 2 já vem com o furo do lado 1.
- Ordem no programa: faceamento + perfil externo → canal → furação → mandrilamento. Cada ferramenta volta ao ponto de troca antes da próxima.

#### Bruto com furo existente (recolhido)
Bloco "Bruto com furo existente" logo abaixo do bloco bruto, **recolhido** (só o resumo; botão **Editar**). Para tubo, barra furada ou peça pré-furada.
- Lista de **diâmetros internos** (Ø e comprimento), um depois do outro, contados da face onde o furo começa (select: lado 1 ou lado 2; com 1 lado, "lado 2" = face oposta). Comprimento total igual ao do bloco = furo passante. Até 4 linhas.
- **Dispensa a broca:** sem o item "Furo (broca)", o mandrilamento parte do furo existente (Ø = o menor diâmetro dentro da profundidade mandrilada; o furo precisa ir da face até essa profundidade, senão o programa pede a broca). Com broca e furo existente, a broca só alarga o que for menor.
- No código: variáveis `#360…` na seção BRUTO. Furo passante de um só diâmetro sai como `G1901D#1E#360L#2K0.` (coluna com orifício, manual Fanuc); furo escalonado ou cego fica no `G1900` com um comentário (o G1900/G1901 não descreve furo escalonado). No simulador o furo já vem vazio no bruto e permanece na peça acabada (aparece no gráfico). Só na peça simples.

## Campos recolhidos ("Raios e folgas")
Raios e folgas ficam **recolhidos** nas matrizes sólida e tubular e na espina: na própria linha do título aparece só o que foi alterado (ex.: `R ponta 0`) ou **padrão**; clicar no título abre os campos. Os valores recolhidos continuam valendo no programa.

## Sentido do desbaste (longitudinal × transversal)
Select **"Sentido do desbaste"** onde a troca é possível. O padrão é sempre longitudinal (programa idêntico ao validado).
| Onde | Longitudinal | Transversal |
|---|---|---|
| Peça simples · perfil externo (por lado) | `G71` (passes ao longo de Z, incremento no raio) | `G72` (passes de frente ao longo de X, passe em Z = incremento de faceamento) |
| Peça simples · mandrilamento (por lado) | `G71` interno | `G72` interno |
| Matriz sólida / tubular · desbaste do Ø | `G74` (padrão da casa) | `G75` em fatias de frente (Q = incremento de faceamento; cada fatia corta toda a profundidade radial) |
- O contorno e o `G70` são os mesmos nos dois sentidos; no `G72` o primeiro bloco do contorno anda só em Z (`N1G0Z0`), como pede o ciclo.
- As mesmas regras de monotonia valem nos dois (diâmetro externo não diminui indo ao fundo; interno não aumenta).
- A espina não tem o select: a cabeça já é desbastada por mergulhos axiais e o encaixe segue o programa da casa.

### Espina
O desenho da seção "Medidas" tem as caixas de digitação nas letras: **A** Ø do corpo, **B** Ø do encaixe, **C** comprimento do encaixe, **D** comprimento do corpo, **E** comprimento da cabeça, **F** Ø da cabeça, **G = C + D** (calculado).
- **Lado 1 (encaixe):** o bloco é preso pelo lado da cabeça (que continua bruto). Faceia, torneia o Ø A por G e faz o encaixe B × C com R na face e no ombro.
- **Lado 2 (cabeça):** peça virada, presa pelo lado do encaixe. Faceia, acaba o Ø A só até o ombro e faz a cabeça F × E (mergulhos axiais, G70 e repasse, como no programa da casa).
- O sobremetal em Z é dividido: o lado 1 recebe o valor digitado e o resto vai para o lado 2. Comprimento bruto precisa ser maior que C + D + E.
- O lado 2 simula o bruto escalonado (Ø bruto na região da cabeça, Ø A já torneado no resto).

- **Limites de usinagem do Ø A:** dois campos opcionais. **Lado 1** conta a partir da face do encaixe (vazio = G = C + D) e **lado 2** a partir da face da cabeça (vazio = automático: cobre o que o lado 1 deixou + 2 mm, no mínimo E + raio do ombro + 2). Os dois precisam se encontrar: lado 1 + lado 2 ≥ comprimento total (senão sobra uma faixa no Ø bruto e o programa não sai). Sobreposição menor que 0,5 mm gera aviso. Cada limite também não pode passar do trecho livre fora da placa do seu lado. O bruto do lado 2 acompanha o limite do lado 1.

## Fixação na placa (todas as geometrias)
- **Comprimento preso na placa:** pedido em "2 · Medidas" (padrão 25 mm; a espina pede um valor por lado). Se a usinagem passar do trecho livre (peça − preso) o programa **não é gerado** (erro); folga menor que 1 mm gera aviso. Os valores de máquina (Ø da placa, cursos) ficam em **Configurações**.
- **Pressão da placa:** fica em **Configurações** (vale para todos os programas, não aparece mais nas medidas). `M34` = nível 1, `M35` = nível 2 (manual ROMI 0i-TD, cap. 14, funções M). "Padrão da máquina (sem comando)" não escreve nada (é o padrão). Os programas da casa de espina usam M34: selecione "Nível 1 (M34)" se quiser igualar. A linha sai logo depois do `M8`.

## Banco de ferramentas
Aba **Ferramentas**: cadastra T, tipo, pastilha, raio de ponta, ângulo, largura do canal, Vc, RPM, avanços, incrementos (faceamento, cilindragem, encaixe), **sobremetal de acabamento** (em Z e no Ø) e giro.
Fica salvo no navegador; use **Exportar/Importar (.json)** como cópia de segurança. Os valores iniciais vêm dos programas de exemplo: confirme.

## Incrementos de corte (card 4)
Quatro valores: **faceamento · desbaste**, **cilindragem · desbaste**, **faceamento · acabamento**, **cilindragem · acabamento**. O padrão fica cadastrado na **tabela de ferramentas** (aba Ferramentas, coluna "Incrementos").
- O card vem **recolhido**, só com o resumo dos 4 valores. O botão **Editar incrementos** abre os campos; digitar um valor altera só aquela programação (o banco não muda) e marca o resumo como "(alterado)". "Voltar ao padrão da ferramenta" aparece quando há alteração.
- Desbaste = profundidade por passe (Z no faceamento, raio na cilindragem).
- Acabamento = sobremetal que o desbaste deixa para um passe de acabamento (0 = sem acabamento, o padrão dos programas da casa). O acabamento usa o avanço de aproximação/acabamento da ferramenta e faz o contorno (raio incluído).
- Matriz sólida e tubular só ganham passes de acabamento se o valor for maior que zero; com zero o programa é idêntico ao validado.
- Espina: o acabamento de cilindragem vira o sobremetal no Ø da cabeça (`#137`, casa = .1) e o de faceamento o sobremetal no fundo do rebaixo (`#139`, casa = .08). Com zero, o G70 só repassa o perfil.

## Simulador (corte 2D XZ, meia seção)
- Percurso construído a partir da geometria (não lê o G-code); cada movimento sabe a linha do G-code que o gerou, e ela é destacada.
- Ciclos `G74`/`G75` seguem o manual ROMI/Fanuc 0i-TD: ferramenta já posicionada na 1ª passada, `P` é incremento no raio, `R` é afastamento.
- Alertas: colisão com a placa, corte dentro da peça acabada, G0 dentro do material, fora de curso, sobra de material (por região, ignorando lascas de canto).
- A placa segura o **diâmetro externo** (castanhas de r acima do bruto até o Ø da placa) e, atrás da peça, é inteira: ferramentas dentro do furo não colidem com as castanhas. Furo (broca, retângulo do Ø do furo) e barra interna (pastilha espelhada, dentro do furo) têm formas próprias; as cavidades da peça acabada entram na verificação de "corte indevido" e "sobra".
- Tempo de ciclo estimado = corte (avanço × RPM do G96, limitado por G50) + rápidos. Não inclui troca de ferramenta nem aceleração.
- Pastilha desenhada com ângulo e raio de ponta cadastrados; a referência é o canto do inserto (zerado na face e no Ø). Não há compensação de raio (G41/G42), como nos programas da casa.
- **Máquina/placa** (Configurações): valores provisórios, confirmar no manual da ML-600L.
- Teclas: espaço = executar/pausar; ← → = movimento a movimento. Roda do mouse = zoom; arrastar = mover.

## Desenvolvimento
- `core.js` (geradores + percurso), `sim.js` (motor da simulação), `simview.js` (tela do simulador), `app.js` (interface do Gerador, Ferramentas e Configurações), `desenho.js` (operação Desenho da peça), `pecaview.js` (meia seção compartilhada), `seed.js` (ferramentas iniciais), `style.css` (visual), `version.js` (número da versão), `versionar.js` (guarda uma versão em `versoes/`).
- `node test.js` roda os geradores e a análise do simulador no terminal (inclui colisão forçada); `node test.js -v` imprime o código das espinas.
- `serve.js` + `../.claude/launch.json`: servidor local só para testar no painel de preview; não é necessário para usar.

## Tela e temas
- **Painéis independentes (v1.2.0):** em telas largas a página não rola. O formulário (etapas 1 a 4) e o painel da direita (Código CNC · Simulador · Estratégia · Dicionário, com o seletor Lado 1/2) têm **rolagem própria** e ocupam a altura da tela: rolar um não mexe no outro. A barra de abas fica presa no topo do painel. Em telas estreitas (menos de 960 px) volta a rolagem normal da página.
- **Blocos recolhidos com seta (▸):** "Bruto com furo existente" e "Raios e folgas" começam fechados, com um resumo curto na própria linha do título; clique no título para abrir. Aberto, o resumo some (os campos mostram os valores).
- **3 · Ferramentas** mostra só o que o processo usa: faceamento/torneamento sempre; canal só se houver canal externo; broca só com "Furo (broca)"; barra só com mandrilamento (respeitando "O que usinar" de cada lado).
- **Menu lateral (v1.2.0):** abaixo do logo ficam as operações (**Gerador**, **Ferramentas**); no cabeçalho ficam as coisas do sistema (**Configurações** e **Tema**).
- **Temas:** o padrão é o **Alumasa** (v1.2.0); o botão Tema alterna **Alumasa → Claro → Escuro** e a escolha fica salva. O tema Alumasa usa as cores do site (azul #102A56, laranja #FF5518, fundo cinza claro).
- **Cadastro de ferramenta:** o tipo é escolhido em cartões com o **desenho** de cada ferramenta (externa, faceamento, interna, encaixe/canal, furação, rosca, outra). Só aparecem os campos do tipo: Ø da broca só em furação, largura do canal só em encaixe, ângulo/raio/sobremetais só nas de torneamento; em furação "incremento" vira **bicada** e o RPM é fixo. Ferramenta nova de furação já vem em G97/M3.

## Raio zero
"Raio da ponta/ombro da cabeça" (espina) = 0 agora vira **quina viva** (sem G3). Antes gerava G3 ... R0 (inválido na máquina) e o simulador mostrava tempo "NaN:aN" e uma "sobra de material" enorme. O simulador também passou a ignorar movimento com coordenada inválida, para um valor ruim nunca contaminar o tempo de ciclo.

## Cabeçalho fixo, Configurações e explicações (v1.1.0)
- **Cabeçalho fixo:** a barra com o logo, o nome e as abas fica no topo durante a rolagem (a coluna de saída desce a altura dela).
- **Configurações** (aba no cabeçalho): **Autor** (padrão FERRAMENTARIA), **Data** (vazio = automática, mês/ano de hoje; dá para fixar um texto, ex.: NOV/2026), **Pressão da placa** (M34/M35), valores da **máquina e placa** (só simulação), **mostrar todas as explicações** e a versão. Autor e data saíram da tela do gerador.
- **Explicações suprimidas:** cada campo tem um botão **ⓘ** ao lado do nome; clicar mostra/oculta a explicação daquele campo. Em Configurações → Aparência dá para mostrar todas de uma vez. O mesmo vale para a nota da seção 3 e para a ajuda do simulador.
- **Informativos calculados removidos** (G, comprimento total, limites, Ø usinado, sobremetais): se precisar, voltam.
- **Ferramenta escolhida em uma linha só** (T, Vc, RPM máx., avanços, giro); pastilha, raio e ângulo aparecem ao passar o mouse.
- **Versões:** o número aparece ao lado do título. `CHANGELOG.md` resume cada versão e `versoes/vX.Y.Z/` guarda uma cópia completa; `node versionar.js 1.2.0` cria a próxima. Para voltar, copie a pasta da versão por cima da pasta do gerador.
- `style.css` agora é um arquivo separado (antes ficava dentro do `index.html`).

## Desenho da peça (v1.3.0)
Operação no menu lateral, abaixo do Gerador. Aqui a peça simples é **desenhada uma vez, salva com um nome e reaproveitada** no Gerador.
- **Desenho salvo:** escolha na lista para abrir e alterar. Botões **Salvar** (habilita quando há alteração e nome), **Novo**, **Duplicar**, **Excluir**, **Exportar/Importar (.json)** (cópia de segurança ou levar para outro computador; ao importar, o que já existe igual é ignorado e conflitos entram como "(importado)"). O desenho em edição é guardado automaticamente (rascunho) e "● alterações não salvas" avisa o que ainda não foi salvo. Fica no navegador, como o banco de ferramentas.
- **O que o desenho guarda:** perfil externo e interno de cada lado, comprimento final da peça e número de lados. **O que fica no Gerador:** bruto (Ø, comprimento, furo existente, sobremetal do lado 1), o que usinar de cada lado, sentido do desbaste e fixação na placa. O **Ø do bruto do desenho é só referência** (vazio = automático: maior Ø + 4): serve para validar o desenho e listar os cantos; no Gerador vale o bruto digitado (e o programa revalida: ex. um raio que não cabe no degrau até o bruto).
- **Elementos** (paleta): Cilindro, Cone, Chanfro, Raio, Canal; Furo (broca), Cilindro interno, Cone interno, Chanfro interno, Raio interno. Rosca e canal interno aparecem "em breve" (o gerador ainda não faz). Cada um abre uma **janela com o desenho e as cotas editáveis** (A, B, C), no mesmo padrão do desenho da espina, e uma meia seção "como fica na peça". Novos cilindros/cones já vêm coerentes com o anterior.
- **Chanfro e raio:** a janela mostra o perfil já desenhado com **pontos numerados nos cantos disponíveis**; clique no ponto (ou escolha na lista) e digite o tamanho. Cantos que já têm chanfro/raio ficam esmaecidos.
- **Validação ao adicionar:** o elemento não entra se criar um erro novo no desenho (diâmetro que diminui, raio maior que o degrau...); a mensagem aparece na própria janela.
- **Gerador:** a seção Medidas começa por "Desenho da peça" (lista dos salvos). O nome do programa passa a usar o nome do desenho. Quem já tinha uma peça simples digitada no gerador anterior encontra um desenho "Peça simples · do gerador anterior" criado sozinho; senão, um exemplo.
- A prévia `previa-peca-simples.html` foi removida (a operação a substitui; continua nas cópias de `versoes/`).
## Chanfro e raio em um canto escolhido (v1.2.0)
Antes, chanfro/raio eram itens soltos e o canto dependia da posição deles na lista (e, no primeiro, parecia que só dava para fazer no bruto). Agora cada chanfro/raio tem **"Canto onde vai"**, uma lista montada a partir do perfil que já está na lista:
- **Externo:** *Quina da face*, *Quina do degrau Ø A → Ø B* (aresta do diâmetro maior) e *Pé do degrau* (canto de dentro, inclusive o último degrau até o bruto).
- **Interno:** *Entrada do furo*, *Quina do degrau*, *Pé do degrau* e *Fundo*. Antes só existiam a entrada e o fundo; agora também os degraus entre dois cilindros internos.
- O canto fica preso ao **trecho** (não à posição): se você reordena ou insere trechos, o chanfro/raio continua no mesmo canto; se o trecho é apagado, aparece o erro "o canto escolhido não existe mais".
- Só em cilindros (em cone continua não valendo). Cada canto aceita um chanfro/raio; dois cantos do mesmo degrau precisam caber na altura/largura dele.
- Listas antigas são convertidas sozinhas ao abrir, e o programa gerado é **idêntico** ao de antes (conferido em `node test.js`).
- Um novo chanfro/raio já vem no primeiro canto livre.

## Elementos em sequência (v1.4.0)
No Desenho da peça cada elemento começa **onde o anterior termina** (o primeiro, na face Z0); a janela mostra "Começa em Z…" e o desenho marca o início.
- **Cilindro, cone e os internos** já eram assim (o comprimento é do próprio elemento).
- **Canal sequencial (novo padrão):** só **Ø do fundo** e **largura**. Ele entra logo depois do último elemento (que precisa ser um **cilindro**) e ocupa a largura: o Ø em volta é o do cilindro anterior (que passa a incluir a largura do canal) e o próximo elemento começa depois do canal. Ex.: Cilindro Ø40×20 · Canal Ø30 larg. 4,5 · Cilindro Ø50×10 gera o mesmo programa que "Cilindro Ø40×24,5 + canal na posição Z20". Dois canais seguidos: o segundo começa onde o primeiro termina. Canal como primeiro elemento ou depois de cone dá erro (explica na tela).
- **Canais antigos** (com "Posição Z" medida da face) continuam funcionando e abrindo (marcados "(Z da face)"); para o formato novo, apague e adicione de novo.
- **Furo (broca):** continua medido da face (é uma operação separada, antes do mandrilamento).