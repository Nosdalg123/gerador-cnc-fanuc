# Importação DXF — semiperfil superior e edição por interseção (v2.17.0)

## Objetivo
O operador trabalha **somente sobre o perfil da metade superior** de uma seção longitudinal. A metade inferior é desenhada como **construção tracejada**, calculada pelo espelhamento da geometria superior selecionada em torno do eixo do torno, sem se tornar entidade CNC ou alvo de seleção.

## Controles simplificados
1. **Clique em uma linha superior:** apenas SELECIONA, com traço laranja espesso. Não inclui/exclui automaticamente da geometria CNC. Área sensível para clique ampliada.
2. **Excluir selecionada:** remove a entidade da cópia de trabalho; desfazer recupera. Nenhuma exclusão ao clicar na linha.
3. **Cortar até cruzamento:** somente para LINE; seleciona a ponta que deve permanecer (inicial/final) e mostra prévia tracejada. O corte é calculado pela interseção com outras entidades, não por estimativa de tela.
4. **Quebrar nas conexões:** divide LINE em entidades LINE independentes onde há interseções internas. As filhas herdam a seleção externa/interna quando apropriado; podem ser clicadas e excluídas isoladamente.
5. **Estender até próxima linha:** oferece escolha da ponta e prévia da distância em milímetros até o primeiro encontro real com LINE ou ARC; exige confirmação.
6. **Estender por medida:** mantém ferramenta existente para digitar a extensão em mm. A edição é colinear e reversível.
7. **Edição avançada:** mantém os modos anteriores, incluindo apagar por retângulo, mas a interface padrão privilegia seleção + botão.
8. **Z0:** botões simples existentes, sem inferência de orientação física.

## Preservação
- O painel CAD original não é alterado.
- O painel do torno usa apenas o semiperfil superior como geometria editável; elementos inferiores originais não são clicáveis e as projeções espelhadas são linhas tracejadas não interativas.
- O rascunho armazena as extensões/cortes das entidades originais, as linhas adicionadas por quebra, IDs de linhas originais substituídas e seleções/ocultações, sem duplicar todo o arquivo CAD.
- O desenho editado mantém o bloqueio de liberação automática para CNC até revisão.

## Testes
- `testdxfgeomedit.js`: interseção real, corte mantendo ponta inicial, quebra em entidades independentes, extensão até linha, destino ausente/ocultado, origem preservada, semiperfil e inferior tracejado.
- `testdxfui.mjs`: Chromium com DXF sintético; seleção com destaque, excluir apenas após botão, corte, quebra, extensão automática, desfazer, alternar vista, comandos anteriores e rascunho.
- GitHub Actions também executa a suíte DXF/PDF/Fanuc.

## Limitações explícitas
- Cortar e quebrar modificam atualmente entidades **LINE**, não SPLINE, ARC, blocos ou LWPOLYLINE. Arcos são preservados e podem ser destinos para extensão, mas não cortados pela ferramenta LINE.
- A extensão até uma linha só é sugerida quando o prolongamento da linha realmente cruza uma entidade do recorte. Nenhuma extensão é inventada quando não há destino.
- A parte inferior tracejada é uma **representação visual de construção** do perfil superior escolhido, não a geometria inferior CAD validada.
- A escolha de lado livre/Z0, associação de raios, roscas, cavidades, operações de usinagem e verificação de máquina continuam exigindo conferência.
- Os testes UI usam um DXF sintético; é necessária a verificação visual de Disco 7″ e Copo 7″ antes de qualquer uso industrial.
