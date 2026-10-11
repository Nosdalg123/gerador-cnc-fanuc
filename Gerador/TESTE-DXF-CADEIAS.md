# Auditoria de importação CAD DXF — versão 2.14.0

## Origem e escopo
Analisados os DXFs originais enviados pelo usuário: **Disco 7″ / Empurrador P2** e **Copo 7″ / Empurrador P2**, utilizando `ezdxf` 1.4.4. Nenhum desenho original foi publicado no repositório.

| Medida | Disco 7″ | Copo 7″ |
|---|---:|---:|
| Model Space: entidades | 167 | 262 |
| LINE | 82 | 152 |
| ARC | 15 | 21 |
| CIRCLE | 10 | 13 |
| LWPOLYLINE | 9 | 2 |
| SPLINE | 0 | 2 |
| DIMENSION | 15 | 31 |
| Unidade | mm | mm |
| Eixo CAD sugerido (Y) | 174,53558 | 268,36053 |
| Vista sugerida: entidades | 40 | 119 |

## Causa raiz encontrada na 2.13.0
O botão **Sugerir cadeia de contorno** selecionava **a maior componente conectada inteira**, assumindo implicitamente que ela era um único contorno externo. Isso é falso nestes CADs.

Foi realizada análise independente da topologia do semiperfil superior: o Copo tem cerca de 53 segmentos de linha/arco e uma grande componente de 49 segmentos com **12 pontos de ramificação**; o Disco tem vários grupos descontínuos (aprox. 6, 5 e 4 segmentos entre os maiores). Os caminhos ramificados contêm superfícies externas, internas e linhas auxiliares. O erro impedia uma reconstrução segura e dava a impressão de que o importador não compreendia o CAD.

## Correções implementadas
1. **`dxfchains.js`**: separa os caminhos em cadeias topológicas, interrompendo cada cadeia em pontas ou bifurcações. União de vértices por distância real em mm (tolerância 0,16), evitando falsos resultados por arredondamento de coordenadas. Não assume que a maior componente é a peça.
2. **`dxfimport.js` e `index.html`**: exibe as cadeias separadamente, com quantidade de segmentos, extensão em Z, número de arcos, presença de bifurcações; permite atribuir cada caminho ao contorno externo ou interno. Clique na entidade mostra Ø inicial, Ø final, comprimento ou raio original.
3. **`dxfprofile.js`**: continuidade calculada por distância geométrica em vez de bins de arredondamento. Avisos de bifurcações e pontas com **coordenadas CAD e diâmetros**, indicando onde corrigir o perfil.
4. **`dxfaudit.js`**: bloqueia exportação se faltarem Z0, eixo, unidade mm, contorno externo completo, coerência entre comprimento e DIMENSION axial, sequência em Z sem sobreposição/lacunas, raios não representados, SPLINE ou roscas pendentes. Faz verificação independente do contorno interno.
5. **`desenho.js`**: corrigida confirmação de revisão CAD para atualizar de fato a lista salva usada pelo Gerador; alterações posteriores reabrem o estado incompleto.
6. **Importação DXF grande**: feedback visível antes de ler e analisar 1–3 MB de entidades CAD.
7. **Alternância PDF/DXF**: ao entrar no PDF, fecha painel DXF para impedir interfaces sobrepostas.

## Procedimento para Disco e Copo
1. Importe o arquivo `.DXF` no módulo **Importar CAD DXF**, confirme a vista sugerida e o eixo X0.
2. Para essas peças, não use **Localizar cadeias reais** como aprovação CNC. O botão apenas organiza os caminhos candidatos; selecione individualmente as superfícies que correspondem ao desenho.
3. Clique nos segmentos para conferir comprimento, Ø e raios exatos; compare-os com as cotas nativas e as vistas do CAD.
4. Para conexões abertas, raio, rosca, cavidade ou curva sem equivalência imediata, salve **rascunho CAD** e conclua a geometria no editor manual.
5. Defina face Z0 apenas quando conhecer a fixação real. Rascunho sem Z0 é permitido; código CNC não.
6. Depois de realmente reconstruir e validar todos os elementos no editor, utilize **Confirmar revisão completa do CAD**; a confirmação agora persiste o desenho salvo.
7. Simule e confira código, ferramentas, mandrilamento, fixação, sentido do programa, colisões e sobremetais antes de levar à máquina.

## Testes realizados e reproduzíveis
- `testdxf.js`: parser DXF, medidas, raios, SPLINE, eixo e seleção de layout em fixtures sintéticas baseadas nos DXFs.
- `testdxfchains.js`: caminhos ramificados, tolerância de conexão, lacunas, arco e bifurcação.
- `testdxfaudit.js`: 11 verificações do gate CNC de Z0, unidade, comprimento, arcos, roscas e continuidade.
- `testdxfreal.js` pode ser executado com os **DXFs originais** localmente (`node testdxfreal.js "Disco...DXF" "Copo...DXF"`); os DXFs não são armazenados neste GitHub.
- Seis testes PDF/rotina Fanuc legados permanecem disponíveis.

## Limites
**Não há reconstrução automática integral comprovada do Disco nem do Copo.** A nova lógica identifica partes reais, oferece correção assistida e evita juntá-las indevidamente. Arc-to-corner, SPLINE, canais, cavidades, transições e roscas ainda exigem operações CNC específicas, editadas/validadas manualmente quando não modeladas com confiança. Nenhum programa foi validado em máquina real e não houve teste ponta a ponta no navegador nesta execução.

O botão de confirmação do editor é responsabilidade do usuário e não substitui validação de usinagem.
