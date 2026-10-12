# CNC v2.22.1 - Testes reais Disco e Copo

Base: `revisoes/v2.22.0-desenho-quatro-caminhos`, commit `9e53d2b`. Continuação de "Melhorias do editor CNC", agora com os quatro anexos acessíveis.

## Correções

- ARC nativo fornece extremos calculados pelo raio/ângulos reais, eliminando o falso erro de geometria não reconhecida no construtor anterior.
- LINE/ARC que atravessam o eixo recebem recorte superior analítico sem alterar a fonte. Não se inventam conexões entre entidades separadas. Uma ponta criada pelo recorte visual não pode ser estendida.
- Clique usa a distância ao traço e a posição fracionária de `pointerup`: neste Chromium, `MouseEvent.click` arredonda a posição e pode selecionar uma auxiliar vizinha. Transformações SVG consideram zoom e rolagem.
- Cortar, Quebrar nas conexões, Estender até próxima linha e zoom 100-400% estão na etapa 2. Aplicar/cancelar/trocar etapa fecha os controles de edição.
- Mantidos os quatro caminhos: Criar desenho, Importar PDF, Importar DXF (3 etapas), Importar DXF único - Em construção.

## Resultados reais

| Indicador | Disco | Copo |
|---|---:|---:|
| Geometrias Model Space | 116 | 190 |
| Cotas DIMENSION | 15 | 31 |
| Eixo CAD Y (mm) | 174,5355806289 | 268,3605253536 |
| Trechos do perímetro de teste | 6 | 30 |
| Arcos preservados na cadeia | 2 | 7 |
| Extensão axial de teste (mm) | 105,000 | 185,000 |

Disco: selecionar EF, EB, E7, E5, F2, F3 (todos sufixo :0). Quebrar F3 e desfazer, depois cortar preservando a ponta inicial até EB. Construir a cadeia. O ensaio também impede estender a ponta visual de F2 e verifica fechar extensão ao trocar etapa.

Copo: C7, C8, C9, CA, CB, CC, E7, D0, D1, D2, D3, D4, D5, D6, D7, D8, D9, DA, DB, DC, DD, DE, DF, E0, E1, E2, E3, E4, E5, E6 (sufixo :0). Esta é a borda superior da seção; furos transversais e anotações continuam referências para revisão. O clique no centro de D3 reproduzia a escolha incorreta da auxiliar 246 antes da correção do ponteiro.

## Verificação

- `testdxfreal.js` e `testdxfrealui.mjs` com ambos os originais: PASSOU. Clique real no Chromium, corte/quebra/desfazer, proteção do eixo, zoom, construir, salvar/reabrir rascunho, fonte íntegra e ARC no construtor anterior, sem erro JS.
- Regressões de entidades, grafo, auditoria, assistente, edição, PDF, orientação, roscas e diálogos: PASSOU.
- Gerador/simulador Fanuc: 232 verificações de simulação e 313 de diagnóstico, zero falhas.
- Interface: três etapas, quatro caminhos e importador anterior: PASSOU.

Execução opcional com arquivos locais (desenhos não incluídos no repositório):

```sh
node testdxfreal.js /caminho/Disco.DXF /caminho/Copo.DXF
node testdxfrealui.mjs /caminho/Disco.DXF /caminho/Copo.DXF
```

## Limites

Perímetro conectado é rascunho geométrico, não aprovação de usinagem. O ensaio Disco de 105 mm não representa automaticamente a face curva completa/cota total de 109,50 mm; o arco F1 continua disponível acima do eixo. Roscas M39 P2/M64 P4, raios, cavidades e detalhes de furação precisam de associação às operações e conferência com o desenho cotado. A sugestão automática permanece parcial nesses arquivos e exige completar a seleção. Não ajustar dimensões apenas para parecer completo.

Referência consultada: [Autodesk Fusion - selecionar e editar contornos](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/How-to-edit-contours-in-Fusion-360-CAM.html). O fluxo mantém escolha e revisão da cadeia pelo usuário.
