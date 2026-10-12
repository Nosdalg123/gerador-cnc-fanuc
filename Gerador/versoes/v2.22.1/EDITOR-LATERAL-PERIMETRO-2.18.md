# Editor CAD v2.18 — painel lateral e perímetro assistido

## Referências comerciais
- AutoCAD EXTEND: uso rápido de entidades visíveis como limites; modo clássico usa limites escolhidos.
- QCAD Trim/Extend: seleção por região/próximo da extremidade e comprimento exato.
A interface CNC simplifica o fluxo para o operador: selecionar, visualizar seta, inverter, confirmar.

## Interface
- Painel de comandos à esquerda, separado em Importar e visualizar, Construir perímetro, Selecionar e editar, Referência e Z0, Revisar desenho.
- CAD editável à direita; metade inferior é construção espelhada e não será escolhida como contorno ativo.
- Permanecem Trocar vista, Desfazer, CAD original e diagnósticos.

## Alongar linha
1. Clicar na entidade; a extremidade mais próxima do clique passa a ser a proposta inicial.
2. Escolher Estender até próxima linha para calcular limite ou Estender por medida para digitar milímetros.
3. Visualizar seta da ponta e prévia tracejada.
4. Inverter no botão lateral ou no ícone junto à ponta (quando existe destino geométrico válido).
5. Confirmar para alterar só cópia do CAD.
Se não há interseção à frente, não alongar arbitrariamente.

## Construir perímetro — primeira etapa implementada
1. Clicar em Marcar linhas do perímetro.
2. Clicar nas entidades que definem a metade superior; repetir clique desfaz marcação.
3. Clicar em Construir perímetro.
4. O sistema exige um único conjunto conectado, sem bifurcação e com zero ou duas extremidades livres.
5. Se válido, isola os segmentos marcados na cópia e deixa o usuário revisar cotas/continuidade.

## Limitações e próximas verificações
- O construtor v2.18 ainda NÃO calcula automaticamente qual segmento conservar em cruzamentos internos ou sobreposições. É preciso Cortar/Quebrar antes de construir.
- A validação usa tolerância geométrica de 0,15 unidade CAD assumida como mm. Confirmar unidades antes de usar.
- A construção não é uma nova entidade DXF única, e sim uma seleção isolada de segmentos conectados.
- Não assume que um perfil superior aberto seja uma figura fechada: duas pontas podem ser legítimas no torneamento.
- Raios, roscas, SPLINE, fixação, face Z0 e conversão segura para G-code continuam sujeitos a auditoria.
- Ainda não foi possível executar os testes locais do navegador nesta sessão. Necessário smoke Chromium, seleção visual e regressão com Disco 7 e Copo 7 antes de integrar à main.
