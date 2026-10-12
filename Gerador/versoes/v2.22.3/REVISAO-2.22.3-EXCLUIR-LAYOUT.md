# Revisão 2.22.3 — 12/10/2026

Na etapa 2, clique em uma linha ou arco para realçar a entidade em laranja e use **Excluir linha selecionada**. **Desfazer** recupera o trecho e sua marcação anterior. Exclusões ficam no rascunho salvo e no JSON exportado; o DXF original permanece intacto. Em polilinhas, só o trecho em foco é excluído. Reparos e sugestões ignoram os trechos excluídos.

A janela de ferramentas falhava antes de abrir porque a seleção do tipo tratava um elemento como uma lista. A consulta agora percorre todos os cartões. O cabeçalho e os botões ficam fora da área rolável, deixando o último campo acessível. O painel lateral do editor calcula a altura útil abaixo do cabeçalho; zoom e caixas de seleção também receberam ajustes.

## Verificação

- Chromium, CAD sintético: excluir/desfazer LINE, ARC e trecho de polilinha, preservando o trecho vizinho; abrir ferramenta, alternar os oito tipos, salvar e editar. Nenhum erro JavaScript.
- Layout: 1366×768, 1024×600, 768×800 e 390×844; janela dentro da tela, campos sem sobreposição e página sem transbordamento horizontal.
- Geometria: cortar/quebrar/estender não usam trecho excluído de uma polilinha como destino; outros trechos continuam válidos.
- Disco/Copo reais: cliques, exclusão/desfazer, arcos, corte/quebra e rascunho preservados. Copo também salva/reabre uma exclusão sem alterar a fonte. Perfis anteriores: Disco 9 trechos/4 arcos/109,50 mm; Copo 30 trechos/7 arcos/185 mm.
- Regressões do gerador, importadores, revisão, programas, diálogos e rotas do desenho executadas. Novo teste sintético incluído no GitHub Actions.

Os arquivos de fabricação permanecem fora do GitHub. O bloqueio CNC e as pendências de conferência dimensional da versão 2.22.2 continuam válidos; esta revisão corrige controles e apresentação.
