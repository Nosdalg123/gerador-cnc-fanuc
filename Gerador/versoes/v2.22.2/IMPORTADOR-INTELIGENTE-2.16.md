# Importador inteligente CAD — versão 2.16.0

## Objetivo
Fluxo **importar → conferir apenas problemas → salvar**. O DXF abre com uma proposta automática de perfil longitudinal. O usuário pode trocar a vista, adicionar ou retirar segmentos com um clique e usar comandos mais complexos somente em **Edição avançada**.

## Interface simplificada
- O painel principal mostra a **projeção CAD**, em escala uniforme, com perfil externo em verde e perfil interno em azul. Linhas candidatas não selecionadas ficam destacadas em tom âmbar.
- **Trocar vista** oferece miniaturas da seção principal, vista frontal e folha completa, sem obrigar o usuário a desenhar uma seleção para ver opções. Caso o reconhecimento falhe, pode clicar em **Selecionar outra região** e usar o retângulo visível do editor existente.
- **Clique normal:** uma linha que está no perfil é retirada; uma linha não selecionada é acrescentada ao externo. Após clicar, aparecem ações contextuais: adicionar externo, adicionar interno, retirar, apagar da cópia ou estender.
- **Pontos a conferir:** o sistema destaca contorno externo ausente, cadeias separadas, bifurcações, arcos/CNC ainda não relacionados, SPLINE e roscas. Quando há ponta identificada, o usuário pode localizá-la visualmente.
- **Pequenas lacunas colineares:** proposta opcional de extensão até outra ponta já selecionada, apenas com distância entre 0,05 e 3 mm, erro transversal de no máximo 0,05 mm e sem destinos igualmente próximos. Requer confirmação explícita. Outras conexões seguem para revisão manual.
- **Z0:** três botões diretos para esquerda, direita ou pendente, com indicação visual na projeção. A escolha física depende da fixação.
- **Edição avançada:** mantém o conjunto de ferramentas da 2.15.0, incluindo apagar por clique/quadro, extensão manual, seleção de cadeias, recorte de vista, ajuste de eixo, desfazer e restaurar original.
- **Salvar desenho (rascunho)** continua permitido mesmo com Z0 pendente. O Gerador mantém proteção contra envio de contorno CNC incompleto ou editado sem revisão.

## Comportamentos essenciais de segurança
- A *seção principal* pode produzir proposta de perfil; a *vista frontal* e a *folha completa* são somente referências. A troca para essas opções limpa a seleção CNC e o eixo presumido.
- As miniaturas mostram geometria vetorial CAD real do arquivo importado, não imagens artificiais.
- O desenho original não é alterado pelas correções; as edições são feitas na cópia de trabalho.
- Não usar uma extensão ou associação de arco como geometria de usinagem aprovada sem conferir cotas e continuidade.
- Nenhum reconhecimento automático universal de roscas, raios, SPLINE, cavidades ou fixação foi alegado ou implementado nesta etapa.

## Testes
- `testdxfassist.js`: opções de vistas, diagnóstico topológico e proposta conservadora de extensão colinear.
- `testdxfui.mjs` (Chromium): projeção automática, tela simplificada, clique para retirar/adicionar, contexto, troca de vista frontal e volta à longitudinal, acesso ao modo avançado, Z0, seleção com retângulo, exclusão/estender/desfazer e rascunho.
- Mantidos os testes do DXF 2.15.0, PDF, Fanuc e a suíte original do Gerador no GitHub Actions.

## Validação pendente
Os dois arquivos industriais Disco 7" e Copo 7" foram usados como referência arquitetural nas versões anteriores, mas o teste de interface automatizado usa um DXF sintético; deve-se verificar visualmente no navegador a proposta de perfil nesses dois arquivos antes de utilizar para preparação de usinagem.
