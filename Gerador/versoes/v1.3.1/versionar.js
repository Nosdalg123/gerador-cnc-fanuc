// Guarda uma versao do gerador: node versionar.js 1.2.0
// Grava version.js e copia os arquivos do app para versoes/v1.2.0/ (para voltar depois: copie o conteudo dessa pasta de volta).
// O resumo do que mudou fica em CHANGELOG.md (escrever antes de rodar, para a copia levar o texto junto).
var fs = require('fs'), path = require('path');
var ver = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('Uso: node versionar.js 1.2.0'); process.exit(1); }
var raiz = __dirname, dest = path.join(raiz, 'versoes', 'v' + ver);
if (fs.existsSync(dest)) { console.error('A versao ' + ver + ' ja existe em versoes/. Use outro numero.'); process.exit(1); }
fs.writeFileSync(path.join(raiz, 'version.js'), "window.CNC_VERSAO = '" + ver + "';\n");
function copia(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach(function (e) {
    if (e.name === 'versoes' || e.name === 'node_modules' || e.name === '.claude') return;
    var s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copia(s, d); else fs.copyFileSync(s, d);
  });
}
copia(raiz, dest);
console.log('Versao ' + ver + ' guardada em ' + dest);
