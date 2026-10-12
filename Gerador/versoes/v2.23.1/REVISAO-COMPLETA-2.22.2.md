# CNC v2.22.2 - Revisão completa dos DXFs Disco e Copo

Revisão de 12/10/2026, após autorização explícita de envio ao GitHub. Base: v2.22.1 publicada (`c3fb827e1d689807675dfca381190b7badfc8a91`), com CI aprovado. Nova branch: `revisoes/v2.22.2-revisao-completa`. `main` preservada.

## Resultado

O importador foi revisado da leitura ao salvamento/reabertura do rascunho, com cliques reais no navegador. A conferência do Disco agora inclui a face traseira curva e o comprimento total de 109,50 mm. A revisão do Copo mantém explícitos os elementos que a cadeia LINE/ARC não comprova: cota Ø79,104 e SPLINE superior 110. Nenhuma cota foi substituída para fazer o perfil fechar.

| Conferência | Disco | Copo |
|---|---:|---:|
| Geometrias Model Space | 116 | 190 |
| Cotas DIMENSION | 15 | 31 |
| Eixo CAD Y (mm) | 174,5355806289 | 268,3605253536 |
| Trechos da cadeia ensaiada | 9 | 30 |
| Arcos na cadeia | 4 | 7 |
| Extensão axial ensaiada (mm) | 109,50 | 185,00 |
| Face direita real CAD X (mm) | 199,0407756872 | 291,2483983558 |
| Conferência de cadeia/comprimento | Aprovada | Cadeia conectada; outras geometrias/cota pendentes |
| Liberação automática de CNC | Bloqueada | Bloqueada |

## Disco

1. Selecionar EF, EB, F3, E7, E5, F2, EA, ED e F1 (sufixo `:0`).
2. Cortar F3 preservando a ponta inicial até EB; cortar F2 preservando a ponta inicial até EA. Os trechos excedentes internos saem da cópia de trabalho, e a fonte permanece íntegra.
3. Preservar os arcos R3,50, R20 da frente, R20 da face traseira e R69,4783046852 da curva F1. O último valor vem da geometria CAD, não de uma aproximação da imagem.
4. Informar comprimento 109,50 mm e Z0 conforme a preparação. O ensaio usa face direita, coordenada CAD X 199,0407756872.

A cadeia de 105 mm da v2.22.1 cobria a região até o canto e não o comprimento total. A etapa 3 agora acusa essa seleção parcial, mesmo que ela seja conectada. O teste completa a seleção até 109,50 mm e verifica que esse aviso deixa de aparecer.

Rosca **M39 P2** é recuperada da própria DIMENSION; **M8 x50** é recuperada do texto de um INSERT. Essas indicações são operações, não linhas do contorno. A divisão entre comprimento roscado de 37 mm, trecho cilíndrico remanescente, rasgo frontal e furação exige associação às operações antes de gerar o programa real.

## Copo

A cadeia de ensaio é C7, C8, C9, CA, CB, CC, E7, D0, D1, D2, D3, D4, D5, D6, D7, D8, D9, DA, DB, DC, DD, DE, DF, E0, E1, E2, E3, E4, E5, E6 (sufixo `:0`). Cobre 185 mm, inclui sete arcos e mantém o perfil inferior em construção tracejada.

Essa cadeia não prova sozinha a totalidade da usinagem:

- **Cota 170: Ø79,1040764 (Ø79,10 no PDF).** Os pontos de referência não coincidem com vértices das linhas/arcos da vista longitudinal. Isso é um aviso de conferência, não uma afirmação de que a cota está errada. Confirmar a qual contorno/trecho ela se refere antes de programar essa região. O botão **Localizar cota** destaca os pontos sem alterar o CAD.
- **SPLINE 110, acima do eixo**, entre CAD X 249,2483983558 e 255,2483983558. A prévia preserva essa curva; ela ainda não é selecionável na cadeia LINE/ARC do assistente. O botão **Localizar curva** mostra a referência original. A curva 10D está abaixo do eixo e não é contada como pendência do semiperfil superior.
- **M64 P4 e M10** são mantidas como indicações de operação. A cota com texto literal `m10` mede geometricamente 8,5 mm entre linhas; o importador não interpreta 8,5 como diâmetro nominal da rosca M10.
- A geometria nativa inclui raios **R1, R3, R6 e R6,50** na seleção. Os raios da seção e do detalhe ampliado não devem ser intercambiados apenas por semelhança visual.

## Correções da revisão

- Notas TEXT/MTEXT em BLOCK/INSERT, inclusive blocos aninhados com transformação de escala/giro/base, são lidas como texto. Geometria de bloco continua sem conversão automática para contorno.
- Conferência da etapa 3 aponta maior cota axial da vista, diferença de comprimento, texto de cota alterado, referência de diâmetro sem vértice, notas de roscas e curvas especiais. Os resultados ficam no JSON do rascunho com `cncReady: false`.
- Cortes quase tangentes preservam a coordenada nativa da extremidade; não se escolhem raízes espúrias deslocadas cerca de 0,003 mm pelo ruído micrométrico de exportação.
- Interseções LINE/ARC e ARC/ARC, contatos em T e sobreposições parciais entram no diagnóstico. Arcos opostos com as mesmas pontas são reconhecidos como curvas diferentes.
- Z0 da prévia usa a extremidade real da seleção, não a margem do retângulo. O marcador não intercepta cliques sobre o perfil.
- Isolar o contorno oculta também referências SPLINE. Localizar a curva volta a mostrar a referência CAD, sem modificar as entidades.
- Resumo da etapa 3 encurtado. Quatro entradas preservadas; **DXF único permanece Em construção**.

## Testes

- `testdxfreal.js` com os dois originais: leitura, cotas, unidade mm, eixo e separação de vistas aprovadas.
- `testdxfrealui.mjs` com os dois originais: cliques reais, quebra/desfazer, cortes, bloqueio de extensão da ponta recortada, 105 versus 109,50 mm, curva traseira, Z0, localização da cota/SPLINE, isolamento, fonte íntegra e salvar/reabrir rascunho. Zero erros JavaScript.
- `testdxfreview.js`: perfil conectado parcial, rosca em DIMENSION, nota em INSERT transformado, texto divergente e bloqueio CNC.
- Regressões de entidades, grafo, auditoria, edição, importação, PDF, orientação, roscas, diálogos e interfaces anteriores aprovadas.
- Simulação Fanuc: **232 verificações, zero falhas**. Diagnóstico: **313 verificações, zero falhas**, com 16 programas da casa lidos/conferidos.
- Os testes reais recebem caminhos locais. DXFs/PDFs originais não foram enviados ao repositório público.

## Limite de liberação

Revisão de software/CAD concluída; isso não equivale a aprovar usinagem. O assistente preserva os desenhos e salva rascunhos, mas ainda não associa automaticamente os quatro arcos do Disco ou as operações/cavidades do Copo ao editor de programas. Não foi emitido G-code de produção para essas peças. Ferramentas, estratégia, fixação, ciclos, roscas e colisões precisam da definição de processo e da validação previstas em `VALIDAR-NA-MAQUINA.md`.

Referência consultada: [Autodesk Fusion - seleção de cadeia aberta/fechada](https://help.autodesk.com/cloudhelp/ENU/Fusion-CAM/files/MFG-GEOMETRY-SELECTION-CHAIN.htm). A escolha geométrica é conferida antes de definir uma operação.
