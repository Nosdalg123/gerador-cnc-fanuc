# Teste real — Disco 7″ / Empurrador P2 (v2.11.0)

Fonte de teste: PDF de uma página fornecido pelo usuário, **Disco 7'' - Empurrador P2 - 7'' -26-4-24.pdf**. Não incluir o PDF original no repositório.

## Vistas encontradas
- Perfil lateral esquerdo, com cotas axiais, diametrais, arcos e rosca.
- Vista frontal circular à direita, com chamada M8 x50.
- Vista isométrica ilustrativa embaixo à esquerda.

O sistema **não deve misturar** vistas, assumir automaticamente qual face fica na placa, nem reduzir as geometrias complexas a cilindros se faltam raios, ângulos ou roscas.

## Cotas extraídas diretamente da primeira página
- Cotas axiais exibidas: 109,50; 105; 69,85; 60; 37; 10.
- Outras cotas lineares e diametrais a classificar pela extensão das linhas: 162,80 CANTO VIVO; 121,39; 86,92; 14,20.
- R20, R3,50, 61°, M39 P2 e M8 x50.
- Nem todos os símbolos e associações de linha/cota chegam como texto contínuo; **uma medida sem Ø não pode ser rotulada automaticamente como diâmetro**.

## Erro encontrado em 2.10.0 e corrigido
O leitor tomava o maior número de linhas horizontais para Ø externo e o maior de linhas verticais para comprimento, sem verificar o papel da cota. No desenho testado, números de diferentes funções podiam fabricar uma geometria falsa.

Agora o importador:
1. Destaca cotas legíveis, diferenciando raios, roscas, ângulos e números sem tipo.
2. Exige **selecionar a vista** (região no PDF) para habilitar salvamento.
3. Exige indicar **eixo do desenho** e **face Z0 voltada à ferramenta**, sem supor qual lado fica na placa.
4. Reverte a sequência e os cones externos/internos ao inverter Z0 (conservando todos os valores).
5. Guarda a orientação confirmada no desenho salvo e mostra-a no Gerador.
6. **Bloqueia salvar como contorno confirmado** quando a vista contém elementos ainda não representáveis no editor PDF (R, rosca, ângulo), evitando perder operações necessárias.
7. Conserva o editor manual para completar o contorno antes de usinar.

## Testes automatizados
- `node testpdfdisco.js`: 26 checagens cobrindo os 15 trechos de texto das cotas do PDF, classificação e inversão de face.
- `node testpdforientcnc.js`: motor real Fanuc. Perfil Ø30→Ø50 da face ao fundo foi aceito, enquanto a orientação inversa Ø50→Ø30 foi rejeitada pelo G71.
- Mantidos: `node testpdf.js`, `node testpdfview.js`, `node testpdfscale.js`.

## Pendentes
- Testar visualmente no Chrome/Edge com o arquivo original, inclusive zoom, seleção de vista e salvamento.
- Reconstrução **integral automática** de arco R20, raio R3,50, rosca M39 P2, furo/rosca M8 x50 e transição de 61° **não está disponível**. O PDF fornece informação, mas o módulo ainda não tem associação robusta de cotas às entidades e curvas do CAD.
- Conferir fixação real, origem Z0, ferramentas e percurso antes de qualquer operação na máquina.

Aprovado nos testes de lógica **não significa** peça liberada para produção.
