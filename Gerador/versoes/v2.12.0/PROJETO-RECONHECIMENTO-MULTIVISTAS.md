# Projeto técnico — interpretação multivistas para torno CNC (v2.12.0)

## Escopo aprovado
- **Geometria:** somente peças de revolução e suas características usináveis em torno: cilindros, cones, raios, chanfros, canais, furos coaxiais, roscas e perfis curvos.
- **Origem:** PDFs técnicos digitais/vetoriais; sem reconhecimento de PDFs fotografados ou digitalizados.
- **Medida ausente:** nunca completar por simples escala gráfica ou estimativa. Usar medida explícita ou valor matematicamente determinado por restrições comprovadas. Caso contrário, pendência obrigatória.
- **Conflitos entre vistas:** nenhuma preferência silenciosa; apresentar as origens, exigir escolha ou correção do usuário.
- **Orientação:** sugerir lado livre, origem Z0 e possíveis operações, mas exigir confirmação humana antes de usinar.
- **Recursos não suportados:** preservar a informação, impedir que ela desapareça do modelo salvo e bloquear a geração CNC até resolução.

## Modelo de dados e responsabilidades
1. **Vista PDF:** página, região normalizada, transformação/rotação, tipo (longitudinal, frontal, detalhe), confiabilidade de identificação.
2. **Entidade geométrica:** identificador estável e referência axial/radial, classe (linha, arco, curva), papel no contorno externo ou interno, proveniência vetorial da página, evidência de tangência e adjacência.
3. **Dimensão:** valor, unidade, tipo, símbolo, texto original, página/vista, origem do líder, entidades associadas, grau de verificação: explícita, deduzida por restrições, estimada pelo traço (NÃO liberada) ou informada pelo usuário.
4. **Grafo de restrições:** diâmetros, distâncias Z, tangências, raios, simetria, relações entre projeções. Uma contradição coloca o componente em conflito.
5. **Perfil CNC:** cadeia de eventos XZ com X em diâmetro e Z medido da face de referência para dentro da peça, incluindo arcos/chanfros/canais/roscas. Representação completa deve ser distinta de operações efetivamente suportadas pelo gerador.
6. **Auditoria:** pendências por característica e cota, origem da confirmação, opção de salvar ou bloqueio, orientação de placa/castanhas e registro do PDF de origem (metadados, não os bytes).

## Algoritmo planejado para reconhecimento extensivo
1. Extrair operadores vetoriais (inclusive Bézier/arcos) e texto posicionado, preservando matrizes de transformação; localizar quadros, legendas e revisões.
2. Propor vistas agrupando contornos, eixos de revolução e padrões circulares, permitindo escolha do operador. Não mesclar a vista frontal com a lateral apenas por proximidade na página.
3. Reconstruir o **contorno fechado** e classificar primitivas, quinas, linhas ocultas e regiões seccionadas; comparar as projeções com todas as vistas associadas para distinguir material, furo passante e rebaixo.
4. Associar cotas a entidades por linhas auxiliares, setas, pontos de contato e projeções compartilhadas. Equivalência entre características exige prova geométrica ou escolha expressa, não apenas valor numérico igual.
5. Resolver um sistema de restrições com detecção de subdeterminação, sobre-restrição e inconsistências. Manter equações e dependências auditáveis; sinalizar dimensões calculadas.
6. Associar furos, raios, canais e roscas da vista frontal ou de detalhes à posição axial correspondente, quando determinada. Recursos fora do eixo de revolução ficam fora do escopo e impedem conversão CNC automática.
7. Gerar uma representação geométrica integral (esboço paramétrico de revolução), independente de qualquer estratégia de G71; exibir na tela em escala proporcional uniforme.
8. Sugerir face Z0, sentido do perfil e possíveis fixações com base na geometria, acessibilidade e limites de G71/G72/G73. Sem dados de placa/ferramentas não afirmar segurança física.
9. Exigir conferência das características e medidas pendentes, emitir perfil salvo em formato compatível somente após auditoria concluída; em caso contrário manter rascunho bloqueado.

## Entregue na v2.12.0
- `pdfreconcile.js`: dimensões com origem, relacionamento explícito, sugestões de outras vistas, conflitos, lacunas e solução de comprimentos axiais com extremos já conhecidos.
- `pdforientation.js`: sugestão de face com confirmação, baseada em regra geométrica conservadora do G71 longitudinal.
- `pdfaudit.js`: auditoria mínima de raio/rosca; não deduz ângulos sem referencial nem passo de rosca sem cota.
- `pdfimport.js` / `index.html`: conferência visual por característica, associação e edição de cotas, confirmação e salvamento controlado.
- `desenho.js`, `app.js`, `core.js`: propagação de pendências para o editor e bloqueio de salvar/gerar onde estiverem presentes.
- `testpdfreconcile.js`: testes de cotas cruzadas, conflitos, falta de referência e bloqueios.

## NÃO entregue — restrições reais
- Reconstrução universal e exata de todas as curvas, tangências e perfis complexos.
- Reconhecimento de todas as setas e linhas auxiliares de cota ou associação automática de qualquer característica às outras vistas.
- Resolução automática de todos os detalhes do Disco 7″; M8 × 50 carece de dados suficientes para assumir um ciclo de rosca CNC.
- Cálculo de fixação segura sem castanhas, torre, setup e geometria das ferramentas.
- Garantia de correção para PDFs vetoriais arbitrários ou validação física na máquina.

## Critérios de aceite para versões seguintes
- Conjunto de pelo menos 20 PDFs técnicos vetoriais reais, com gabarito geométrico revisado pela ferramentaria, incluindo vistas invertidas e múltiplas folhas.
- Para cada segmento, comparar X inicial/final, Z inicial/final, tipo da primitiva, arredondamentos e tangências com cotas de referência.
- Testes de conflito em múltiplas vistas, de cotas insuficientes e de associações ambíguas; ausência de falsa liberação é mais importante do que taxa de reconhecimento.
- Regressão da interface de importação e da lista do Gerador, exportação JSON e histórico de desenhos.
- Simulação e avaliação de fixação das duas operações. Nunca transferir programa à máquina antes de validação especializada.

## Regra de projeto
**Uma geometria aproximada pode ser mostrada para conferência, mas nunca pode se transformar silenciosamente em dimensão certificada ou em código CNC.**
