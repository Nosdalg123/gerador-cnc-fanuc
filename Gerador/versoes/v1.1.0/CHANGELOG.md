# Histórico de versões — Gerador CNC Torno

Cada melhoria gera uma versão (`MAIOR.MENOR.CORREÇÃO`, ex.: 1.1.1). Uma cópia completa de cada versão fica em `versoes/vX.Y.Z/`.

**Para voltar a uma versão:** copie o conteúdo de `versoes/vX.Y.Z/` por cima da pasta do gerador (menos a pasta `versoes`). Os dados (ferramentas, valores digitados) ficam no navegador e não são afetados.

**Para guardar uma nova versão:** `node versionar.js 1.2.0` (escreva antes a entrada abaixo; a cópia leva o texto junto).

---

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
