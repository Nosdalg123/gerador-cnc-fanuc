# Assistente DXF experimental 2.21.0 — três etapas

Esta revisão foi criada a partir de `revisoes/v2.20.2-layout-ferramentas`, sem alterar a revisão anterior ou a `main`.

## Como abrir
1. Abra `Gerador/index.html` desta revisão.
2. Em **Desenho da peça**, clique **Novo importador DXF · 3 etapas (teste)**. O importador DXF anterior continua no botão separado.
3. **Etapa 1**: carregue DXF ASCII, escolha a seção longitudinal, confira eixo central e comprimento nominal, ou selecione outra região arrastando um retângulo. Pode deixar Z0 pendente.
4. **Etapa 2**: clique nas entidades da metade superior para marcar ou desmarcar o perímetro (LINE e ARC incluídos); clique **Construir e isolar perímetro**. Se houver bifurcações, sobreposições ou mais de um grupo, o diagnóstico mostra os pontos e não constrói falsamente uma cadeia.
5. Use **Localizar** para mostrar uma folga na prévia; **Prévia** e **Confirmar ajuste** só ficam disponíveis quando há solução colinear explícita. **Reparar somente folgas pequenas** mexe em LINE nativa por até **0,20 mm**, com confirmação do usuário. Valores maiores, inclusive 3,500 e 9,849 mm, só são propostos individualmente quando a extensão é colinear e inequívoca. Clique **Desfazer** para recuperar.
6. **Etapa 3**: confira comprimento, Z0, cotas CAD e pendências; salve como rascunho de teste no navegador ou exporte JSON. O rascunho pode ser reaberto neste módulo. **Não gera nem libera código CNC**.

## Principais correções
- O construtor anterior exigia `.a` e `.b` em cada trecho. Entidades `ARC` nativas armazenam centro/raio/ângulos, sem necessariamente trazer essas propriedades. O módulo `dxfwizardgeom.js` calcula extremidades com `DX.sample` antes de montar o grafo de conectividade.
- Clique/seleção usam caminhos SVG `data-cad-hit` com área de acerto ampliada, independente dos modos avançados do editor anterior.
- A extensão só aparece durante a ferramenta **Estender uma linha** e fecha no botão **Cancelar extensão**; não fica permanentemente na tela.
- As regiões inadequadas são detectadas como referência (vista frontal/folha inteira) até eixo e seção longitudinal serem indicados.
- Não apaga automaticamente entidades do CAD para esconder problemas. As demais linhas podem permanecer como referência e o arquivo original nunca é modificado.

## Limites importantes
- O DXF original **Disco 7'' - Empurrador P2 - 7'' -26-4-24.dxf** não estava disponível na sessão para ensaio real. O teste sintético reproduz arcos, folgas de 0,180, 3,500 e 9,849 mm, cruzamentos e sobreposições, mas a inspeção dimensional do arquivo real permanece pendente.
- A divergência **107 mm projetados versus 110 mm nominais** não é uma correção automática segura. Tampouco a diferença **110 mm informado versus 109,5 mm cotado**; deve-se conferir orientação, vista e entidade associada à cota.
- G71, raios/roscas, perfil completo e fixação continuam exigindo validação CNC. Uma cadeia geométrica conectada NÃO é uma trajetória de usinagem aprovada.
- `LWPOLYLINE` e `ARC` podem entrar no contorno. Os ajustes automáticos não modificam essas entidades; só `LINE` nativa é editada.
- Os testes de browser usam DXF gerado artificialmente; são uma verificação de interface, não homologação industrial.

## Referências
O modo diagnóstico segue as ideias dos comandos **Check Sketch for Feature** e **Repair Sketch** do SolidWorks: localizar entidades duplicadas, sobreposições, pontos com mais de duas conexões, pequenas folgas e separá-las da geometria válida. Não replica o software comercial, mas usa esse padrão de operação.

## Testes
- `node testdxfwizard.js`: arcos nativos, conectividade, folgas pequenas e grandes, interseção interna, duplicata, dimensão axial.
- `node testdxfwizardui.mjs`: Chromium / Playwright — importação DXF, passos, seleção dos arcos, reparo, controles de extensão e salvamento do rascunho.
