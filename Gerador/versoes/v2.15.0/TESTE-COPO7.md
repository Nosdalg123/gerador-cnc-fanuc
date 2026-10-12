# Teste de importação: Copo 7″ / Empurrador P2 (v2.12.0)

**Origem:** arquivo real enviado no chat, `Copo 7'' - Empurrador P2 - 7''  -5-9-24.pdf`; uma página PDF vetorial de 841,89 × 595,276 pt. O próprio arquivo não é incluído no GitHub.

## Vistas distintas na folha
- **Seção Y–Y (principal):** peça torneada com grande conicidade externa, degraus e cavidade interna, raios e roscas.
- **Vista frontal circular:** representa posições angulares/concentricidades; não se deve tratá-la como perfil longitudinal XZ.
- **Detalhe Z:** canto ampliado com diversos raios e cotas locais. Suas cotas não podem ser automaticamente transferidas para a seção sem associar a referência.
- **Quadro de revisões:** texto e metadados, não são cotas da geometria.

## Medidas lidas do PDF original (sem determinar ligação às linhas de cota)
- Comprimento nominal geral: **185 mm**. Cotas adicionais: 14, 22,50, 45, 61,57, 70, 100, 106, 112 e 115 mm.
- Diâmetros mostrados graficamente na seção: Ø185, Ø162, Ø136,02, Ø116, Ø104, Ø42, Ø60, Ø72, Ø79,10 e Ø175.
- Outros valores na seção: 11, 18, 45,50.
- Geometria/roscas: **6°**, **M64 P4**, texto **m10** (deve ser conferido pela linha de referência).
- Detalhe Z: R3 em múltiplas posições, R6,50, 6 e 10 mm.
- Escala do papel: **1:10**, indicada no carimbo. A escala geométrica da projeção CNC independe dessa escala impressa.

**Alerta:** extração de texto de fontes CAD pode omitir o glifo Ø, embora ele apareça no desenho renderizado. Números sem marcação de diâmetro **não podem ser promovidos automaticamente a diâmetros** apenas por serem verticais.

## Falhas encontradas e correções da branch
1. Em 2.11.0, `m10` minúsculo não era classificado como rosca; corrigido.
2. A seleção anterior classificava texto apenas pela posição da origem da string; agora usa seu retângulo orientado completo e interseção com a região.
3. O botão de legenda podia escolher uma caixa de tamanho arbitrário ao redor de “SEÇÃO Y-Y”, capturando o Detalhe Z. Agora a legenda **localiza**, mas a seleção é desenhada pelo usuário.
4. Antes de escolher a vista, a página inteira podia alimentar a reconstrução automática. Agora a escolha de vista precede o processamento geométrico.
5. PDFs densos de seção e hachura podem ser aproximados como cilindros sem representar curvaturas/roscas. Inserido bloqueio conservador para regiões com mais de 900 segmentos vetoriais, mesmo se uma geometria simplificada for obtida.
6. A face Z0 permanece sem pressuposição: **não existe orientação determinada pela folha**. A escolha exige identificação na preparação do torno.

## Testes
- `testpdfcopo.js`: fixture com textos, localizações em pontos e regiões da **página real**, derivado de extração vetorial. Testa classificação m10, M64 P4, 6°, R6,50, legendas, isolamento de quadro de revisão, restrição de vista frontal, veto a contorno anular falso, complexidade e Z0 indefinido.
- Executar também `testpdf.js`, `testpdfview.js`, `testpdfscale.js`, `testpdfdisco.js` e `testpdforientcnc.js`.

## Pendências que impedem fabricar automaticamente a peça
- O sistema **não reconstrói integralmente** transições de 6°, raios R3/R6,50, todas as paredes internas, rosca M64 P4 nem detalhes não visíveis da seção.
- A associação automática de cada cota à respectiva aresta/cilindro CAD ainda não está implementada para este caso. Isso requer reconstrução topológica, não só extração de texto.
- Teste visual de PDF.js no Chrome/Edge e validação na máquina não executados por estes testes de lógica.
- É necessária conferência das cotas e do plano de fixação. **Não liberar programa CNC gerado de uma simplificação do PDF.**
