# Histórico de versões — Gerador CNC Torno

Cada melhoria gera uma versão (`MAIOR.MENOR.CORREÇÃO`, ex.: 1.1.1). Uma cópia completa de cada versão fica em `versoes/vX.Y.Z/`.

**Para voltar a uma versão:** copie o conteúdo de `versoes/vX.Y.Z/` por cima da pasta do gerador (menos a pasta `versoes`). Os dados (ferramentas, valores digitados) ficam no navegador e não são afetados.

**Para guardar uma nova versão:** `node versionar.js 1.2.0` (escreva antes a entrada abaixo; a cópia leva o texto junto).

---

## 1.9.0 — 06/10/2026 — rosca externa e interna (G76)
- **Rosca externa e interna** no desenho da peça e no Gerador: cotas Ø nominal, comprimento e passo (métrica ISO 60°). Externa = cilindro no Ø nominal + G76; interna = furo mandrilado em Ø − 1,0825 × passo + G76 até o Ø nominal. Herdam posição sequencial, chanfro de entrada e canal de alívio depois delas.
- Código: blocos `(ROSCA EXTERNA)` / `(ROSCA INTERNA)` com `G97`, `G76P010060Q#97R#98` e `G76X Z P Q F` (altura, 1ª passada = altura ÷ √passadas); novos slots de ferramenta T6/T7 (`T#106`, `T#107`) e tipo de ferramenta **Rosca** no banco (semente T0505, RPM 800 — valor de partida a validar). RPM limitado a 5000 ÷ passo.
- Simulador: passada de rosca (`G76`) com tempo e percurso, sem remover material; forma da ferramenta de rosca; painel mostra "ROSCA (G76)".
- Correção: canal externo que termina num degrau gerava um perfil acabado com diagonal falsa no simulador (alerta de sobra indevido).
- Parede da rosca interna validada (erro < 0,3 mm, aviso < 1,5 mm); aviso quando a rosca termina sem canal de alívio.
- Testes novos (externa, com chanfro, sem alívio, interna, sozinha, externa + interna, lado 2; erros: sem ferramenta, RPM, sem passo, passo grande, fura parede, menor que o furo).
## 1.8.0 — 06/10/2026 — canal interno
- **Canal interno** no desenho da peça (elemento sequencial: Ø do fundo + largura, depois de um cilindro interno) e no Gerador: `G75` do furo para fora com a nova ferramenta de canal interno (slot T5, `T#105`, variáveis `#80`–`#88`), depois do mandrilamento.
- A pastilha recua em Z até sair da face antes de subir em X (o simulador apontou a colisão na primeira versão).
- Simulador: forma da pastilha de canal interno; o canal aparece na meia seção, na peça acabada e entra na verificação de parede fina.
- Bloco do desenho passa a conter o Ø do fundo do canal interno (Ø de referência automático).
- Testes novos (válidos: sequencial, Z absoluto, 2 canais, só interno, 2 lados, com chanfro; erros: 1º elemento, depois de cone, Ø menor, maior que o bloco, estreito, sem ferramenta, fura parede).
## 1.7.0 — 06/10/2026 — geometria Alimentador padrão
- **Alimentador padrão (2 lados)** em "Tipo de peça": lado 1 (externo, raio na face e cone interno por ângulo a partir do furo do bloco) e lado 2 (encaixe com raio na face e raio no ombro depois do trecho reto). Ø maior do cone calculado pelo ângulo (15° → 153,397).
- Núcleo: opção interna `permiteSobrepor` na peça simples (peça fina: sobreposição vira aviso, não erro). Lista de geometrias "em breve" ficou vazia.
- Testes novos (padrão, G72, 4 erros).

## 1.6.0 — 06/10/2026 — geometria Porta-matriz
- **Porta-matriz** em "Tipo de peça": externo (cone por ângulo com a fórmula da casa FUP[TAN × ΔØ], encaixe, raio no degrau, Ø após o encaixe) e interno (mandrilamento com raio na boca, partindo do furo do bloco), em um programa ou em separado ("O que usinar").
- Usa o motor da peça simples (G71 + G70); o contorno N1–N2 gerado confere com o do PORTA.MATRIZ.txt.
- O gráfico da meia seção agora também aparece nas geometrias dedicadas (campo `preview`).
- Testes novos (exemplos externo/interno, G72, 5 casos de erro); mandrilamento maior que a peça tem mensagem própria.

## 1.5.0 — 06/10/2026 — geometria BA / BAT
- **BA / BAT** entra em "Tipo de peça": o `BA.E.BAT.txt` tem a mesma estrutura da matriz sólida (G75, G74 até o comprimento de usinagem, raio de quina G3); muda o padrão da casa (folga de 0,3 mm no Ø final, exemplo Ø225, usinagem 14, raio 3). Reaproveita o gerador da matriz sólida (teste confirma programa idêntico com os mesmos valores).

## 1.4.0 — 06/10/2026 — elementos em sequência (canal sequencial)
- **Canal sequencial** no Desenho da peça: só Ø do fundo e largura; entra depois do último cilindro, ocupa a largura e o próximo elemento começa depois dele (some a "Posição Z" medida da face). Canais antigos seguem funcionando.
- A janela de cada elemento mostra **onde ele começa** (Z do fim do anterior) e o desenho marca o início.
- Núcleo: `psSeq` converte o canal sequencial no canal por Z do gerador (programa idêntico); cantos de degrau levam em conta a largura do canal.
- Testes novos (equivalência com canal por Z, 2 canais seguidos, erros).

## 1.3.1 — 06/10/2026 — correção: desenho não chegava ao Gerador
- **Erro corrigido:** "adicione ao menos um trecho (cilindro ou cone)" no Gerador. O Gerador só usa o desenho **salvo**; se o desenho foi salvo antes de ser desenhado (ou ficou com alterações sem salvar), chegava vazio.
- Ao sair da tela Desenho da peça com alterações não salvas, pergunta se quer **salvar** (e avisa se o desenho ainda não tem nome).
- No Gerador, a linha do desenho mostra aviso quando ele está **vazio** ou tem **alterações não salvas** no editor.
- Desenho só com furo/mandrilamento (sem perfil externo) não pede mais trecho externo: "Externo e interno" passa a usar só o interno naquele lado.

## 1.3.0 — 06/10/2026 — operação “Desenho da peça”
- **Nova operação Desenho da peça** (menu lateral): desenha a peça com elementos e janelas de cotas, **salva com nome**, reabre para alterar; duplicar, excluir, exportar/importar `.json`; rascunho automático.
- **Chanfro e raio** escolhem o canto **clicando num ponto numerado no desenho da peça** (ou numa lista); cantos ocupados ficam esmaecidos; o elemento só entra se não criar erro novo.
- **Gerador (peça simples) só pede o bruto:** escolhe o desenho salvo e digita o bruto; o editor de trechos saiu do Gerador. Peça digitada no gerador anterior vira um desenho automaticamente.
- Nome do programa usa o nome do desenho. Títulos de grupo vazios somem no Gerador.
- Novos arquivos: `pecaview.js` (meia seção compartilhada), `desenho.js` (operação). Prévia `previa-peca-simples.html` removida.
## 1.2.0 — 06/10/2026 — menu lateral, painéis independentes, tema Alumasa padrão, cantos escolhidos
- **Tema Alumasa como padrão** (quem já tinha escolhido outro tema volta para ele uma vez; a escolha seguinte fica salva).
- **Menu lateral** abaixo do logo com as operações (Gerador, Ferramentas); Configurações e Tema ficam no cabeçalho.
- **Painéis independentes:** formulário (etapas 1 a 4) e painel Código/Simulador/Estratégia/Dicionário com rolagem própria, cada um na altura da tela.
- **Chanfro e raio por canto escolhido** (externo e interno): lista “Canto onde vai” com quinas, pés de degrau, entrada do furo e fundo; o canto acompanha o trecho. Cantos de degrau entre cilindros internos agora são possíveis. Listas antigas migram sozinhas com programa idêntico.
- Testes novos em `test.js` (migração idêntica, cantos de degrau, erros de canto).
- Prévia da peça simples ainda usa o modelo antigo de canto; será trocada na 1.3.0 (Desenho da peça).

## 1.1.0 — 05/10/2026 — cabeçalho fixo, Configurações, telas mais enxutas
- **Controle de versões:** `CHANGELOG.md` (este arquivo), cópia completa de cada versão em `versoes/`, número da versão ao lado do título e `node versionar.js` para criar a próxima.
- **Cabeçalho fixo** durante a rolagem (a coluna de saída acompanha, abaixo dele).
- **Nova aba Configurações:** autor e data (data vazia = automática), pressão da placa (M34/M35, saiu das medidas e vale para todos os programas), máquina e placa (saiu do card 5), mostrar todas as explicações, versão.
- **Autor e data** saíram do card “Peça e programa”.
- **Explicações suprimidas:** botão ⓘ em cada campo (também na seção 3 e na ajuda do simulador); opção em Configurações para mostrar todas.
- **“Raios e folgas”** (e “Bruto com furo existente”) recolhidos com resumo de uma linha: só o que foi alterado, ou “padrão”.
- **Removidos os informativos calculados** (G, comprimento total, limites, Ø usinado, sobremetais, trechos…).
- **Ferramenta escolhida em uma linha** (T, Vc, RPM máx., avanços, giro).
- **Prévia navegável da peça simples** (`previa-peca-simples.html`): paleta de elementos, janela com desenho e cotas editáveis, peça montada. Ainda não substitui o editor atual.
- Interno: CSS separado em `style.css`; `serve.js` serve `.css`/`.png`. O gerador de código não mudou (testes idênticos à 1.0.0).

## 1.0.0 — ponto de partida (antes da rodada de 05/10/2026)
Estado do gerador quando o controle de versões foi criado:
- Geradores: matriz sólida, matriz tubular, espina (2 lados) e peça simples (trechos externos e internos, 1 ou 2 lados).
- Simulador XZ, banco de ferramentas com cartões de tipo, 3 temas (claro, escuro, Alumasa), coluna de saída acompanhando a rolagem.
- Blocos recolhidos (“Raios e folgas”, “Bruto com furo existente”), só aparecem as ferramentas usadas no processo.
