# Histórico de versões — Gerador CNC Torno

Cada melhoria gera uma versão (`MAIOR.MENOR.CORREÇÃO`, ex.: 1.1.1). Uma cópia completa de cada versão fica em `versoes/vX.Y.Z/`.

**Para voltar a uma versão:** copie o conteúdo de `versoes/vX.Y.Z/` por cima da pasta do gerador (menos a pasta `versoes`). Os dados (ferramentas, valores digitados) ficam no navegador e não são afetados.

**Para guardar uma nova versão:** `node versionar.js 1.2.0` (escreva antes a entrada abaixo; a cópia leva o texto junto).

---

## 1.0.0 — ponto de partida (antes da rodada de 05/10/2026)
Estado do gerador quando o controle de versões foi criado:
- Geradores: matriz sólida, matriz tubular, espina (2 lados) e peça simples (trechos externos e internos, 1 ou 2 lados).
- Simulador XZ, banco de ferramentas com cartões de tipo, 3 temas (claro, escuro, Alumasa), coluna de saída acompanhando a rolagem.
- Blocos recolhidos (“Raios e folgas”, “Bruto com furo existente”), só aparecem as ferramentas usadas no processo.
