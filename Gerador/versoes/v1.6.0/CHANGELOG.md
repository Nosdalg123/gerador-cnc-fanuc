# Histórico de versões — Gerador CNC Torno

Cada melhoria gera uma versão (`MAIOR.MENOR.CORREÇÃO`, ex.: 1.1.1). Uma cópia completa de cada versão fica em `versoes/vX.Y.Z/`.

**Para voltar a uma versão:** copie o conteúdo de `versoes/vX.Y.Z/` por cima da pasta do gerador (menos a pasta `versoes`). Os dados (ferramentas, valores digitados) ficam no navegador e não são afetados.

**Para guardar uma nova versão:** `node versionar.js 1.2.0` (escreva antes a entrada abaixo; a cópia leva o texto junto).

---

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
