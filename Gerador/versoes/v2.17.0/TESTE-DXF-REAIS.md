# Auditoria real DXF: Disco 7″ e Copo 7″ — v2.13.0

Esta auditoria usa **os dois DXFs originais enviados nesta conversa** (não foram enviados ao repositório), além das versões PDF anteriores. Os resultados abaixo foram lidos dos arquivos CAD via `ezdxf` 1.4.4 e comparados com a implementação JavaScript sem dependências externas.

## Estrutura real dos dois desenhos

| Indicador (Model Space) | Disco 7″ | Copo 7″ |
|---|---:|---:|
| `$INSUNITS` | 4 = mm | 4 = mm |
| Entidades em `Model` | 167 | 262 |
| Cotas nativas `DIMENSION` | 15 | 31 |
| `LINE` | 82 | 152 |
| `ARC` | 15 | 21 |
| `CIRCLE` | 10 | 13 |
| `LWPOLYLINE` | 9 | 2 |
| `SPLINE` | 0 | 2 |
| `MTEXT` | 32 | 31 |

**As vistas não estão separadas por camadas**: a geometria do Model Space está na camada `0`. É necessário separar por posição, grupos geométricos e seleção visual.

O arquivo Copo possui ainda layouts adicionais `desbaste` e `Detalhes`. O Disco possui `detalhes`. Essas entidades não são importadas automaticamente junto ao Model Space.

## Localização automática sugerida da vista de torneamento

A análise encontrou círculos concêntricos nas vistas frontais. O centro vertical deles coincidiu com o eixo de rotação desenhado na seção:

| Indicador (coordenadas CAD, mm) | Disco | Copo |
|---|---:|---:|
| Centro do eixo sugerido (Y) | 174,5356 | 268,3605 |
| Área sugerida: mínimo X / Y | 86,5408 / 90,1356 | 103,2484 / 172,8605 |
| Área sugerida: máximo X / Y | 202,6962 / 258,9356 | 294,2484 / 363,8605 |
| Entidades na região sugerida | 40 | 119 |
| Cotas nativas ligadas geometricamente à seção | 15 | 25 |

A sugestão **não equivale a confirmação de Z0 nem garante perfil completo**. O usuário pode delimitar outra vista manualmente.

## Medição real com entidades DIMENSION

- Disco: `DIMENSION` linear Ø121,389; Ø86,924; 60; 37; 105; 109,50; raios R20 e R3,50, entre outros.
- Copo: Ø185; Ø116; Ø136,019; Ø162; Ø175; Ø79,104; Ø72; Ø42; Ø60; Ø104; comprimentos 14; 61,572; 22,5; 45; 70; 100; 112; 185 mm, entre outros.
- O CAD registra também **dimensões angulares de suplemento**, por exemplo 174° quando o desenho impresso mostra 6°. Nunca se deve interpretar 174° como inclinação de torneamento sem conferir a orientação e o lado do arco.
- M39 P2 e M64 P4 são anotações/indicações de operação, não contornos externos comuns. Uma rosca exige representação e estratégia próprias.

## Arquitetura implementada

1. `dxfcore.js`: parser DXF ASCII, coordenadas originais de LINE, ARC, CIRCLE, LWPOLYLINE (inclusive bulge), SPLINE racional e entidades DIMENSION. Exclui Paper Space. Detecta unidade CAD.
2. `dxfprofile.js`: sugestão de seção usando círculos concêntricos, projeção SVG de escala uniforme, ligação de pontos e análise de contornos, raios, cones, faces, ramificações, SPLINE e lacunas.
3. `dxfimport.js`: visão CAD e perfil projetado em dois painéis, seleção/correção direta de segmentos externo/interno, eixo X0, face Z0, cotas nativas, anotações, rascunhos locais.
4. `pdfvector.js` e `pdfimport.js`: em PDF sem reconhecimento dimensional suficiente, mostra uma **prévia vetorial não validada** no segundo painel em vez de espaço vazio.
5. `desenho.js`/`app.js`: a origem CAD persiste com o desenho. Transferência de trechos parciais ao editor manual fica marcada como **INCOMPLETA**. A geração CNC fica bloqueada até haver confirmação explícita da revisão no editor.

## Fluxo seguro de correção do usuário

- Abra o DXF e confira a vista sugerida; clique em **Delimitar outra vista** quando necessário.
- Confira/ajuste o eixo X0 em coordenadas CAD. A face Z0 pode ficar pendente em um rascunho.
- O desenho verdadeiro aparece em escala proporcional, preservando linhas, arcos e SPLINE.
- Clique nos elementos que pertencem aos perfis externo ou interno. Laranja = seleção, azul/verde-água = entidade candidata.
- A análise acusa perfis abertos, pontas desconectadas, ramificações, faces e raios sem tradução CNC. A lista de cotas nativas ajuda na conferência.
- Clique em **Salvar rascunho CAD** para guardar o trabalho sem liberar usinagem.
- Para completar raios e outras operações ainda sem mapeamento CNC, use **Corrigir trechos no editor manual**. Os elementos com tradução segura (cilindro/cone) são transferidos como rascunho, **não como peça concluída**.
- Após completar e revisar, clique no editor em **Confirmar revisão completa do CAD**. Alterações posteriores reabrem a pendência. A conferência de fixação, ferramentas e simulação continua obrigatória.

## Limitações explícitas

- DWG binário requer exportação para DXF ASCII; o módulo não é um interpretador DWG.
- HATCH, LEADER, OLE e símbolos inseridos (INSERT) não fazem parte da topologia reconhecida. A interface informa a contagem de tipos auxiliares ignorados.
- Curvas e arcos são desenhados geometricamente, mas associação automática universal de R/canto/rosca ao código Fanuc ainda não está pronta.
- Contornos complexos dos dois arquivos **ainda não são convertidos integral e automaticamente para programa CNC**. O novo ganho é preservar geometria CAD real e permitir correção assistida sem inventar cotas.
- A unidade é convertida apenas quando documentada em milímetros. Se `$INSUNITS` não for 4, é necessário confirmar/exportar em mm.
- Dados locais do navegador, inclusive rascunhos, não são compartilhados automaticamente entre computadores ou navegadores.
- Sem teste visual end-to-end com navegador nesta execução; foram executados testes de sintaxe/lógica e auditoria dos arquivos reais, não testes físicos de usinagem.

## Testes

- `testdxf.js`: fixture reproduzível com valores de coordenadas DXF dos arquivos originais; verifica cota nativa, raio, polilinha/arco, SPLINE, separação de Model/Paper e orientação.
- `testpdf.js`, `testpdfview.js`, `testpdfscale.js`, `testpdfdisco.js`, `testpdforientcnc.js`, `testpdfcopo.js`: regressões anteriores.
- Auditoria independente `ezdxf` dos dois anexos confirmou as tabelas acima.
