# Teste Android — v2.23.0

A versão de navegador mantém Gerador, Desenho da peça, Ferramentas e Simulação. A interface passa a usar campos maiores, navegação compacta e formulários em uma coluna no celular. Em paisagem, os painéis continuam empilhados até 960 px.

No DXF, o desenho aparece antes dos formulários e os comandos Selecionar, Excluir linha e Desfazer ficam logo abaixo. **Ajustar à tela** volta ao zoom 100%; **+**, **−** e o controle deslizante ampliam até 400%. Arraste dentro do desenho ampliado para ver outras partes. O zoom é apenas visual, com escala uniforme nos dois eixos e coordenadas CAD intactas. Para delimitar uma vista, ative o botão e arraste o retângulo; tocar de novo cancela.

## Como testar no celular

1. Abra o link privado de teste no Chrome Android com a mesma conta ChatGPT proprietária do projeto.
2. Entre com o usuário do aplicativo. Os usuários iniciais continuam os mesmos da versão desktop.
3. Abra Desenho da peça → Importar DXF e selecione o arquivo na pasta Downloads do celular.
4. Confira vista/eixo/Z0; na etapa 2, toque numa linha, exclua e desfaça. Experimente ampliar e Ajustar à tela.
5. Na etapa 3, revise e salve o rascunho. Exporte JSON para transportar o trabalho entre celular e computador.

Os dados ficam no navegador de cada aparelho e endereço. Não há sincronização automática com o computador. PDF usa a biblioteca já adotada pelo projeto e precisa de acesso à internet. O site distribui somente os arquivos do aplicativo; desenhos de fabricação são importados localmente e não integram a publicação.

## Validação

`testandroidui.mjs` usa Chromium emulado, tela móvel, densidade 3 e toque: 360×800, 390×844, 412×915 e paisagem 844×390. Cobre login, navegação nos quatro módulos, desenho a 100% dentro da largura, mesma escala X/Y, zoom 125%/ajuste 100%, toque em linha/arco, excluir/desfazer, rascunho reaberto e coordenadas preservadas. Também verifica a janela de ferramentas dentro da tela e ausência de erros JavaScript.

A execução automatizada está no GitHub Actions. Um aparelho Android físico ainda precisa da conferência do usuário; a emulação não cobre diferenças de teclado, seletor de arquivos ou desempenho de cada aparelho. Validações CNC e pendências do Copo/Disco continuam conforme a revisão 2.22.2.
