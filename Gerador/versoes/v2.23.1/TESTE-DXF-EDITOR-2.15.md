# DXF 2.15.0 — editor interativo de contornos

## Objetivo
Resolver as interações solicitadas para o módulo CAD do Gerador CNC: perfil inicial reconhecido automaticamente, correções clicando em entidades, extensão de linhas, remoção por clique e por retângulo, botão direto para Z0 e retângulo visível na seleção da vista.

## Funcionalidade implementada
- Ao importar um DXF, a vista longitudinal sugerida é usada para construir uma **proposta automática** de contorno. A heurística considera cadeias conectadas, extensão axial, afastamento radial e raio máximo sugerido pelos círculos concêntricos. Sugere o contorno externo e, quando há separação radial e sobreposição axial suficientes, também um candidato interno. **Não confirma geometria CNC automaticamente**.
- No painel projetado, o usuário pode adicionar linha ao perfil externo/interno, desmarcar sem apagar, apagar somente uma linha por clique, ou apagar as linhas que cruzam um **retângulo de seleção visível durante o arraste**.
- **Estender linha**: escolher a entidade LINE, informar comprimento em mm e indicar ponta inicial ou final. A nova coordenada é calculada por vetor unitário colinear, sem alterar a direção da linha. Polilinhas e arcos não são estendidos por esse comando: exigem correção da geometria CAD de origem.
- **Desfazer** mantém histórico de até 25 alterações; **Restaurar desenho original** repõe as entidades sem alterações. O painel 1 sempre utiliza o CAD original, enquanto o painel 2 usa uma cópia de trabalho.
- Z0: botões **Z0 na esquerda**, **Z0 na direita** e **Z0 pendente**, sincronizados ao seletor de face. A projeção mostra a face escolhida com indicação tracejada; a posição real na máquina ainda exige preparação.
- **Delimitar outra vista**: overlay retangular azul desenhado em SVG durante o pointermove, capturando mouse/ponteiro e mostrando a caixa final no painel original. Zoom preservado.
- Rascunhos guardam CAD original uma única vez, mais alterações de linhas, exclusões, perfil externo/interno, região, eixo, Z0 e nome. O original não é modificado.
- Arquivos CAD modificados ou parcialmente interpretados não são enviados diretamente ao Gerador sem revisão completa; o editor manual conserva o estado **incompleto** até confirmação e validação.

## Verificações
- `testdxfedit.js`: proposta inicial, exclusão de segmentos da proposta, extensão nas duas extremidades, validação de medidas, detecção de interseção por quadro, arcos e escala espelhada.
- `testdxfui.mjs`: Chromium/Playwright testa retângulo **enquanto arrasta** no painel original e no quadro de exclusão, botões Z0, adição/exclusão, extensão, desfazer e salvamento/restauração de rascunho.
- Workflow: `.github/workflows/cnc-dxf-qa.yml` inclui os testes de DXF, PDF, Fanuc, motor original e navegador.

## Análise dos DXFs reais
Arquivos originais recebidos: **Disco 7″** (167 entidades, 15 DIMENSION, 82 LINE, 15 ARC) e **Copo 7″** (262 entidades, 31 DIMENSION, 152 LINE, 21 ARC, 2 SPLINE). Ambos têm a seção longitudinal e a vista frontal no mesmo Model Space, com unidade milímetros.

A auditoria independente do CAD mostrou que o Disco possui trechos externos axiais descontínuos; o Copo contém cadeias internas e externas concorrentes. Por isso a proposta pode selecionar mais de uma cadeia sem tentar preencher lacunas geometricamente sem suporte.

## Limitações e segurança
- A seleção automática inicial é uma sugestão assistida, não uma reconstrução CAD/CAM garantidamente completa.
- O comando de estender atua **somente em LINE** e não resolve sozinho canais, roscas, concordâncias, SPLINE, cavidades ou raios no Fanuc.
- A exclusão é reversível na cópia de trabalho; nenhuma linha é removida do DXF original enviado.
- Salvar rascunho pode funcionar sem Z0. **Gerar código CNC exige** posição Z0, contornos completos e revisão das operações, ferramentas, fixação e simulação.
- Testes no Chromium usam DXF sintético construído com características dos originais; a reabertura visual dos arquivos industriais permanece recomendada antes de qualquer fabricação.
