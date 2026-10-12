# CNC v2.22.0 — Desenho da peça: quatro caminhos

Revisão criada a partir de `revisoes/v2.21.0-dxf-assistente-3-etapas` sem modificar essa branch nem a `main`.

## Menu Desenho da peça
1. **Criar desenho** — edição manual de elementos geométricos, chama a ação existente `dsNovo` (que oferece confirmação quando há alterações não salvas).
2. **Importar PDF** — abre o importador PDF já existente.
3. **Importar DXF** — abre exclusivamente o assistente CAD de três etapas da v2.21: importação/vista; edição/construção; revisão/rascunho.
4. **Importar DXF único — Em construção** — mostra somente um painel reservado; não importa, converte ou exporta nada até instruções futuras.

Botão **Voltar aos 4 caminhos** fica disponível no cabeçalho e substitui os retornos dos importadores que antes direcionavam para a edição manual. O código do importador DXF anterior permanece preservado, mas não aparece como quinta entrada. Navegação a partir do Gerador (abrir ou criar desenho) ainda leva diretamente ao editor manual.

## Arquivo real localizado, mas teste com bytes pendente
O arquivo original **`Disco 7'' - Empurrador P2 - 7'' -26-4-24.DXF`** foi localizado na Biblioteca CNC, em `/CNC/`, tamanho informado **1.586.484 bytes**; também existe o DXF original do Copo 7.

Tentativas de recuperar os bytes para executar `testdxfreal.js` falharam: `files.materialize` retornou **"This Project file does not have an authorized raw-byte materialization path"**, e `files.read` não extrai texto do `image/vnd.dxf`. Portanto não é correto afirmar que o teste com o arquivo real passou ou falhou; foi bloqueado pelo acesso à cópia binária. É preciso disponibilizar esse DXF como anexo desta conversa ou como arquivo acessível diretamente ao projeto de testes.

Reproduções geométricas que passaram na v2.21: ARC com extremos nativos, folgas de 0,18 / 3,5 / 9,849 mm, cruzamentos e segmentos coincidentes, projeção de 107 mm, sem liberar G-code CNC.

## Verificações
`node testdxfwizard.js`: regressão de entidades.
`node testdxfwizardui.mjs`: navegador Chromium (entrada pelo novo caminho 3).
`node testdesenhoroutesui.mjs`: quatro entradas, retornos, DXF único reservado.
