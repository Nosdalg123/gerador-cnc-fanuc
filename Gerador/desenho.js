/* Desenho da peca: monta o perfil (externo e interno, 1 ou 2 lados) com elementos e cotas, salva com nome e reabre para alterar.
   O Gerador (peca simples) importa o desenho salvo e so pede o bruto. Os dados ficam no navegador (localStorage) e podem ser exportados/importados em .json. */
(function (root) {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  function uid() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem storage: segue sem salvar */ } }
  var CNC = root.CNC, fmt = CNC.fmt, g = CNC.GERADORES.peca_simples, PV = root.PecaView;
  var K_DES = 'cnc.desenhos.v1', K_WORK = 'cnc.desenho.work.v1';
  var campo = function (id) { return g.campos.filter(function (c) { return c.id === id; })[0]; };
  var FM = { ext: g.formas, int: campo('internos1').formas };
  var LISTAS = ['trechos1', 'trechos2', 'internos1', 'internos2'];

  /* ---------- elementos: nome, cotas, desenho ---------- */
  var AX = 190;
  function tk(x, y, v) { return v ? 'M' + x + ' ' + (y - 4) + 'V' + (y + 4) : 'M' + (x - 4) + ' ' + y + 'H' + (x + 4); }
  function dH(x1, x2, y, ya, yb) { return '<path class="ext" d="M' + x1 + ' ' + ya + 'V' + (y - 5) + 'M' + x2 + ' ' + yb + 'V' + (y - 5) + '"/><path class="dim" d="M' + x1 + ' ' + y + 'H' + x2 + tk(x1, y, 1) + tk(x2, y, 1) + '"/>'; }
  function dV(y1, y2, x, xa, xb) { return '<path class="ext" d="M' + xa + ' ' + y1 + 'H' + (xa > x ? x + 5 : x - 5) + 'M' + xb + ' ' + y2 + 'H' + (xb > x ? x + 5 : x - 5) + '"/><path class="dim" d="M' + x + ' ' + y1 + 'V' + y2 + tk(x, y1, 0) + tk(x, y2, 0) + '"/>'; }
  var ld = function (d) { return '<path class="lead" d="' + d + '"/>'; };
  var BLK = '<polygon class="piece" points="96,190 96,72 240,72 240,190"/>';
  var cav = function (p) { return p.charAt(0) === 'M' ? '<path class="cav" d="' + p + '"/>' : '<polygon class="cav" points="' + p + '"/>'; };
  var DW = {
    cil: function () { return { svg: '<polygon class="piece" points="96,190 96,78 240,78 240,190"/>' + dV(78, 190, 74, 96, 96) + dH(96, 240, 52, 78, 78), box: { a: [36, 134], b: [168, 26] } }; },
    cone: function () { return { svg: '<polygon class="piece" points="96,190 96,124 240,84 240,190"/>' + dV(84, 190, 262, 240, 240) + dV(124, 190, 74, 96, 96) + dH(96, 240, 52, 124, 84), box: { a: [304, 137], b: [36, 157], c: [168, 26] } }; },
    canal: function (it, zc) { return { semFace: true, svg: '<polygon class="piece" points="96,190 96,78 106,78 106,130 150,130 150,78 240,78 240,190"/><path class="ext" d="M106 78H150"/><path class="ext" d="M150 190V216"/>' + dV(130, 190, 74, 106, 106) + dH(106, 150, 52, 78, 78) + '<text x="150" y="227" text-anchor="middle">começa em Z' + fmt(zc) + '</text><text x="195" y="170" text-anchor="middle">anterior</text>', box: { a: [36, 160], c: [128, 26] } }; },
    canalz: function () { return { svg: '<polygon class="piece" points="96,190 96,78 146,78 146,130 190,130 190,78 240,78 240,190"/>' + dV(130, 190, 74, 146, 146) + dH(190, 240, 52, 78, 78) + dH(146, 190, 52, 78, 78) + ld('M246 40L222 52M160 40L166 52'), box: { a: [36, 160], b: [262, 26], c: [150, 26] } }; },
    rosca: function () { return { svg: '<polygon class="piece" points="96,190 96,78 114,78 123,70 132,78 141,70 150,78 159,70 168,78 177,70 186,78 195,70 204,78 213,70 222,78 240,78 240,190"/>' + dV(78, 190, 74, 96, 96) + dH(96, 240, 52, 78, 78) + '<path class="dim" d="M123 70V58M141 70V58"/><text x="132" y="54" text-anchor="middle">passo</text>', box: { a: [36, 134], b: [168, 26], c: [190, 58] } }; },
    furo: function () { return { svg: BLK + cav('240,190 240,130 150,130 130,190') + dV(130, 190, 262, 240, 240) + dH(150, 240, 44, 130, 72), box: { a: [304, 160], b: [195, 20] } }; },
    icil: function () { return { svg: BLK + cav('240,190 240,120 140,120 140,190') + dV(120, 190, 262, 240, 240) + dH(140, 240, 44, 120, 72), box: { a: [304, 155], b: [190, 20] } }; },
    icone: function () { return { svg: BLK + cav('240,190 240,112 130,138 130,190') + dV(112, 190, 262, 240, 240) + dV(138, 190, 74, 130, 130) + dH(130, 240, 44, 138, 72), box: { a: [304, 151], b: [36, 164], c: [185, 20] } }; },
    irosca: function () { return { svg: BLK + cav('240,190 240,128 222,128 213,120 204,128 195,120 186,128 177,120 168,128 159,120 150,128 140,128 140,190') + dV(120, 190, 262, 240, 240) + dH(140, 240, 44, 128, 72), box: { a: [304, 150], b: [190, 20], c: [150, 74] } }; },
    icanal: function (it, zc) { return { semFace: true, svg: BLK + cav('240,190 240,128 190,128 190,94 150,94 150,128 130,128 130,190') + '<path class="ext" d="M190 190V216"/>' + dV(94, 190, 262, 190, 190) + dH(150, 190, 44, 94, 94) + '<text x="190" y="227" text-anchor="middle">começa em Z' + fmt(zc) + '</text><text x="215" y="165" text-anchor="middle">anterior</text>', box: { a: [304, 135], c: [140, 20] } }; }
  };
  // pictogramas (face a direita)
  var IC = {
    cil: '<rect class="wk" x="12" y="10" width="40" height="24"/>',
    cone: '<polygon class="wk" points="12,34 12,18 52,8 52,34"/>',
    chanfro: '<polygon class="wk" points="12,34 12,10 40,10 52,22 52,34"/>',
    raio: '<path class="wk" d="M12 34V10H34A18 18 0 0 1 52 28V34Z"/>',
    canal: '<polygon class="wk" points="12,34 12,10 26,10 26,24 38,24 38,10 52,10 52,34"/>',
    rosca: '<polygon class="wk" points="12,34 12,16 19,10 26,16 33,10 40,16 47,10 52,13 52,34"/>',
    furo: '<rect class="wk" x="8" y="6" width="48" height="32"/><polygon class="cv" points="56,38 56,24 30,24 24,38"/>',
    icil: '<rect class="wk" x="8" y="6" width="48" height="32"/><polygon class="cv" points="56,38 56,22 26,22 26,38"/>',
    icone: '<rect class="wk" x="8" y="6" width="48" height="32"/><polygon class="cv" points="56,38 56,16 26,26 26,38"/>',
    ichanfro: '<rect class="wk" x="8" y="6" width="48" height="32"/><polygon class="cv" points="56,38 56,16 48,24 26,24 26,38"/>',
    iraio: '<rect class="wk" x="8" y="6" width="48" height="32"/><path class="cv" d="M56 38V16A8 8 0 0 0 48 24H26V38Z"/>',
    icanal: '<rect class="wk" x="8" y="6" width="48" height="32"/><polygon class="cv" points="56,38 56,24 40,24 40,16 32,16 32,24 26,24 26,38"/>',
    irosca: '<rect class="wk" x="8" y="6" width="48" height="32"/><polygon class="cv" points="56,38 56,22 50,16 44,22 38,16 32,22 26,22 26,38"/>'
  };
  // marca: chanfro/raio (nao tem desenho fixo: o canto e escolhido no proprio desenho da peca)
  var EL = {
    cil: { g: 'ext', l: 'trechos', nome: 'Cilindro', d: { a: 40, b: 20 }, dica: 'Ø do cilindro e quanto ele avança em Z a partir do trecho anterior (o primeiro começa na face, Z0).' },
    cone: { g: 'ext', l: 'trechos', nome: 'Cone', d: { a: 40, b: 60, c: 10 }, dica: 'Ø inicial (lado da face), Ø final (lado do fundo) e o comprimento em Z.' },
    chanfro: { g: 'ext', l: 'trechos', nome: 'Chanfro', marca: true, d: { a: 1 }, dica: 'Chanfro a 45° no canto escolhido no desenho; o tamanho é o cateto.' },
    raio: { g: 'ext', l: 'trechos', nome: 'Raio', marca: true, d: { a: 1 }, dica: 'Arredondamento do canto escolhido no desenho.' },
    canal: { g: 'ext', l: 'trechos', nome: 'Canal', d: { a: 30, c: 4.5, seq: true }, rot: ['Ø do fundo', 'Largura'], keys: ['a', 'c'], dica: 'Entra logo depois do último elemento (que precisa ser um cilindro) e ocupa a largura do canal; o próximo elemento começa depois dele. Largura maior ou igual à da ferramenta de canal.' },
    canalz: { g: 'ext', l: 'trechos', oculto: true, nome: 'Canal', rot: ['Ø do fundo', 'Posição Z', 'Largura'], dica: 'Canal do formato antigo: a posição Z é medida da face (Z0). Para o formato sequencial, apague e adicione de novo.' },
    rosca: { g: 'ext', l: 'trechos', nome: 'Rosca externa', d: { a: 30, b: 20, c: 2 }, rot: ['Ø nominal', 'Comprimento da rosca', 'Passo'], dica: 'Rosca métrica ISO de 60° em G76. O cilindro é torneado no Ø nominal e o G76 desce 0,61343 × passo. Coloque um Canal logo depois dela (alívio) para a ferramenta sair.' },
    furo: { g: 'int', l: 'internos', nome: 'Furo (broca)', d: { a: 18, b: 70 }, dica: 'Furo feito com broca no centro: Ø e profundidade a partir da face. Só um por lado.' },
    icil: { g: 'int', l: 'internos', nome: 'Cilindro interno', d: { a: 24, b: 30 }, dica: 'Mandrilamento: Ø e comprimento a partir da face. Perfil escalonado = vários cilindros internos, um depois do outro (Ø não aumenta para o fundo).' },
    icone: { g: 'int', l: 'internos', nome: 'Cone interno', d: { a: 24, b: 18, c: 20 }, dica: 'Ø na boca (lado da face), Ø no fundo e comprimento.' },
    ichanfro: { g: 'int', l: 'internos', nome: 'Chanfro interno', marca: true, d: { a: 1 }, dica: 'Chanfro a 45° no canto escolhido no desenho (entrada, degrau ou fundo).' },
    iraio: { g: 'int', l: 'internos', nome: 'Raio interno', marca: true, d: { a: 1 }, dica: 'Arredondamento do canto escolhido no desenho (entrada, degrau ou fundo).' },
    icanal: { g: 'int', l: 'internos', nome: 'Canal interno', d: { a: 30, c: 4.5, seq: true }, rot: ['Ø do fundo', 'Largura'], keys: ['a', 'c'], dica: 'Entra logo depois do último cilindro interno (ele ocupa o fim desse cilindro); o próximo elemento começa depois do canal. Ø do fundo maior que o do cilindro; largura maior ou igual à da ferramenta de canal interno.' },
    irosca: { g: 'int', l: 'internos', nome: 'Rosca interna', d: { a: 30, b: 20, c: 2 }, rot: ['Ø nominal', 'Comprimento da rosca', 'Passo'], dica: 'Rosca métrica ISO de 60° em G76. O furo é mandrilado no Ø menor (Ø nominal − 1,0825 × passo) e o G76 sobe até o Ø nominal. Coloque um Canal interno depois dela (alívio).' }
  };
  var LET = ['A', 'B', 'C'];
  var rotulos = function (tp) { return EL[tp].rot || (FM[EL[tp].g][tp] || {}).rot || []; };
  var chaves = function (tp) { return EL[tp].keys || ['a', 'b', 'c'].slice(0, rotulos(tp).length); };
  var tipoEl = function (it) { return it.tipo === 'canal' && !it.seq ? 'canalz' : it.tipo; };
  function resumo(it) {
    var n = EL[it.tipo].nome, a = it.a, b = it.b, c = it.c, w = work;
    switch (it.tipo) {
      case 'cil': case 'icil': return n + ' Ø' + fmt(a) + ' × ' + fmt(b);
      case 'cone': case 'icone': return n + ' Ø' + fmt(a) + ' → Ø' + fmt(b) + ' × ' + fmt(c);
      case 'chanfro': case 'ichanfro': return n + ' ' + fmt(a) + ' × 45° <small>' + esc(rotCanto(it)) + '</small>';
      case 'raio': case 'iraio': return n + ' R' + fmt(a) + ' <small>' + esc(rotCanto(it)) + '</small>';
      case 'rosca': case 'irosca': return (it.tipo === 'irosca' ? 'Rosca interna' : 'Rosca externa') + ' M' + fmt(a) + '×' + fmt(c) + ' · ' + fmt(b) + ' mm';
      case 'icanal': return n + ' Ø' + fmt(a) + ' · larg. ' + fmt(c);
      case 'canal': return it.seq ? n + ' Ø' + fmt(a) + ' · larg. ' + fmt(c) : n + ' Ø' + fmt(a) + ' · Z' + fmt(b) + ' · larg. ' + fmt(c) + ' <small>(Z da face)</small>';
      case 'furo': return n + ' Ø' + fmt(a) + ' prof. ' + fmt(b);
    }
    return n;
  }
  function rotCanto(it) {
    var cs = cantosDe(it.tipo === 'ichanfro' || it.tipo === 'iraio' ? 'int' : 'ext', work, ui.lado), q = cs.filter(function (x) { return x.alvo === it.alvo && x.onde === it.onde; })[0];
    return q ? q.rot : '(canto que não existe mais)';
  }

  /* ---------- armazenamento ---------- */
  function norm(d) { // ids em todos os itens e cantos ancorados (listas do gerador anterior)
    d.lados = String(d.lados) === '2' ? '2' : '1';
    LISTAS.forEach(function (k) { d[k] = Array.isArray(d[k]) ? d[k] : []; CNC.psMigra(d[k], k.indexOf('internos') === 0); });
    return d;
  }
  function vazio() { return { id: null, nome: '', lados: '1', lPeca: 100, dRef: '', trechos1: [], trechos2: [], internos1: [], internos2: [] }; }
  function seed() {
    var d = { nome: 'Exemplo · eixo escalonado', lados: '1', lPeca: 100, dRef: '', trechos1: clone(campo('trechos1').def), trechos2: clone(campo('trechos2').def), internos1: [], internos2: [] };
    try { // peca simples digitada no gerador anterior vira o primeiro desenho
      var fm = JSON.parse(localStorage.getItem('cnc.form.v2') || 'null'), v = fm && fm.vals && fm.vals.peca_simples;
      if (v && Array.isArray(v.trechos1)) {
        d.nome = 'Peça simples · do gerador anterior'; d.lados = v.lados === '2' ? '2' : '1';
        if (v.lPeca !== '' && isFinite(Number(v.lPeca))) d.lPeca = Number(v.lPeca);
        LISTAS.forEach(function (k) { if (Array.isArray(v[k])) d[k] = clone(v[k]); });
      }
    } catch (e) { }
    d.id = uid(); d.alterado = new Date().toISOString();
    return norm(d);
  }
  var lista = load(K_DES, null);
  if (!Array.isArray(lista)) { lista = [seed()]; save(K_DES, lista); }
  lista.forEach(norm);
  var work = load(K_WORK, null);
  if (!work || typeof work !== 'object') work = clone(lista[0]);
  norm(work);
  var ui = { lado: 1 };
  function persistWork() { save(K_WORK, work); }
  function strip(d) { var c = clone(d); delete c.alterado; delete c.criado; return c; }
  function salvoDe(id) { return lista.filter(function (x) { return x.id === id; })[0]; }
  function sujo() { var s = work.id && salvoDe(work.id); return !s || JSON.stringify(strip(s)) !== JSON.stringify(strip(work)); }
  function avisaMudou(id) { if (api.onMudou) api.onMudou(id || null); }

  /* ---------- geracao do desenho (usa o gerador real) ---------- */
  var SEED = root.CNC_SEED_TOOLS, seedTool = function (k) { return SEED.filter(function (s) { return s.seedKey === k; })[0]; };
  function dRefEfetivo(w) {
    var d = Number(w.dRef);
    if (d > 0) return d;
    var mx = 0;
    ['trechos1', 'trechos2'].forEach(function (k) { (w[k] || []).forEach(function (it) {
      var ds = it.tipo === 'cil' || it.tipo === 'rosca' ? [it.a] : it.tipo === 'cone' ? [it.a, it.b] : [];
      ds.forEach(function (v) { if (Number(v) > mx) mx = Number(v); });
    }); });
    ['internos1', 'internos2'].forEach(function (k) { (w[k] || []).forEach(function (it) { // o bloco precisa conter o Ø do fundo do canal interno
      if ((it.tipo === 'icanal' || it.tipo === 'irosca') && Number(it.a) > mx) mx = Number(it.a);
    }); });
    return mx > 0 ? mx + 4 : 60;
  }
  function buildF(w) {
    var f = {}; g.campos.forEach(function (c) { f[c.id] = c.tipo === 'trechos' ? clone(c.def) : c.tipo === 'select' ? String(c.def) : Number(c.def); });
    var dois = w.lados === '2';
    f.dBruto = dRefEfetivo(w); f.lPeca = Number(w.lPeca); f.lados = w.lados; f.sobre1 = 1; f.lBruto = f.lPeca + (dois ? 2 : 1);
    f.grip1 = 1; f.grip2 = 1; f.pressao = '';   // so geometria: a fixacao e escolhida no Gerador
    ['1', '2'].forEach(function (k) {
      f['trechos' + k] = clone(w['trechos' + k]); f['internos' + k] = clone(w['internos' + k]);
      var e = w['trechos' + k].length > 0, i = w['internos' + k].length > 0;
      f['usin' + k] = e && i ? 'ambos' : i ? 'int' : 'ext';
    });
    f.brutoInt = []; f.brutoIntLado = '1';
    return f;
  }
  function rodar(w, lado) {
    var f = buildF(w), tl = { t1: seedTool('w0101'), t2: Object.assign({}, seedTool('enc0303')), t3: Object.assign({}, seedTool('tmax0303')), t4: seedTool('int0606'), t5: Object.assign({}, seedTool('enc0303')), t6: seedTool('ros0505'), t7: seedTool('ros0505') };
    var ci = w.internos1.concat(w.internos2).filter(function (x) { return x.tipo === 'icanal' && Number(x.c) > 0; }).map(function (x) { return Number(x.c); });
    if (ci.length) tl.t5.largura = Math.min.apply(null, ci);
    var fr = w.internos1.concat(w.internos2).filter(function (x) { return x.tipo === 'furo'; })[0];
    if (fr && Number(fr.a) > 0) tl.t3.diametro = Number(fr.a);                   // a broca acompanha o furo (so geometria)
    var cn = w.trechos1.concat(w.trechos2).filter(function (x) { return x.tipo === 'canal' && Number(x.c) > 0; }).map(function (x) { return Number(x.c); });
    if (cn.length) tl.t2.largura = Math.min.apply(null, cn);                     // a ferramenta de canal nao e criterio do desenho
    var r = g.gerar(f, tl, { nome: 'DESENHO', autor: 'DESENHO', data: 'DESENHO' });
    var cur = r.lados ? r.lados[Math.min(lado, r.lados.length) - 1] : r;
    var ruido = /placa|preso|ferramenta|broca|fixa/i;
    return { r: r, cena: cur && cur.cena, erros: r.erros || [], avisos: (r.avisos || []).filter(function (m) { return !ruido.test(m); }) };
  }
  function cantosDe(grupo, w, lado) {
    var lst = w[(grupo === 'int' ? 'internos' : 'trechos') + lado] || [];
    if (grupo === 'ext') return CNC.psCantos(lst, dRefEfetivo(w) / 2);
    var fr = lst.filter(function (x) { return x.tipo === 'furo'; })[0];
    return CNC.psCantosInt(lst, fr && Number(fr.a) > 0 ? Number(fr.a) / 2 : 0);
  }
  var lista_ = function (tp, w) { return (w || work)[EL[tp].l + ui.lado]; };

  /* ---------- tela ---------- */
  function seg(el, itens, atual, fn) {
    el.innerHTML = itens.map(function (x) { return '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (String(atual) === String(x[0])) + '">' + x[1] + '</button>'; }).join('');
    $$('button', el).forEach(function (b) { b.onclick = function () { fn(b.dataset.v); }; });
  }
  function pal(el, grupo) {
    el.innerHTML = Object.keys(EL).filter(function (k) { return EL[k].g === grupo && !EL[k].oculto; }).map(function (k) {
      var e = EL[k];
      return '<button type="button" class="pp-el" data-t="' + k + '"' + (e.soon ? ' disabled title="Em breve"' : '') + '><svg viewBox="0 0 64 44" aria-hidden="true">' + IC[k] + '</svg>' + esc(e.nome) + (e.soon ? '<small>em breve</small>' : '') + '</button>';
    }).join('');
    $$('button', el).forEach(function (b) { b.onclick = function () { abre(b.dataset.t, -1); }; });
  }
  function cabecalho() {
    var h = '<option value="">— desenho novo (ainda não salvo) —</option>';
    lista.forEach(function (d) { h += '<option value="' + esc(d.id) + '"' + (d.id === work.id ? ' selected' : '') + '>' + esc(d.nome) + '</option>'; });
    $('#dsSel').innerHTML = h;
    if (document.activeElement !== $('#dsNome')) $('#dsNome').value = work.nome;
    if (document.activeElement !== $('#dsLPeca')) $('#dsLPeca').value = work.lPeca;
    if (document.activeElement !== $('#dsDRef')) $('#dsDRef').value = work.dRef;
    $('#dsDRef').placeholder = 'auto = ' + fmt(dRefEfetivo(Object.assign({}, work, { dRef: '' })));
    seg($('#dsLados'), [['1', '1 lado'], ['2', '2 lados (vira a peça)']], work.lados, function (v) { work.lados = v; if (v === '1') ui.lado = 1; mudou(); });
    var s = sujo();
    $('#dsEstado').innerHTML = s ? '<b>● alterações não salvas</b>' + (work.id ? '' : ' (desenho novo)') : '✓ salvo';
    $('#dsSalvar').disabled = !s || !String(work.nome).trim();
    $('#dsExcluir').disabled = !work.id;
    $('#dsDup').disabled = !work.id;
  }
  function listas() {
    var h = '';
    [['ext', 'Perfil externo'], ['int', 'Interno']].forEach(function (G) {
      var arr = work[(G[0] === 'int' ? 'internos' : 'trechos') + ui.lado];
      h += '<div class="pp-grp">' + G[1] + (work.lados === '2' ? ' · lado ' + ui.lado : '') + '</div><div class="pp-list">';
      if (!arr.length) h += '<div class="pp-vazio">Nenhum elemento. Escolha na paleta acima.</div>';
      arr.forEach(function (it, i) {
        h += '<div class="pp-row" data-g="' + G[0] + '" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><svg class="pp-ic" viewBox="0 0 64 44" aria-hidden="true">' + IC[it.tipo] + '</svg><span class="t">' + resumo(it) + '</span>' +
          '<span class="pp-btn"><button type="button" class="btn sm" data-a="up" title="Subir"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="btn sm" data-a="down" title="Descer"' + (i < arr.length - 1 ? '' : ' disabled') + '>↓</button><button type="button" class="btn sm danger" data-a="del" title="Remover">×</button></span></div>';
      });
      h += '</div>';
    });
    $('#dsListas').innerHTML = h;
    $$('#dsListas .pp-row').forEach(function (row) {
      var arr = work[(row.dataset.g === 'int' ? 'internos' : 'trechos') + ui.lado], i = +row.dataset.i;
      row.onclick = function (e) {
        var b = e.target.closest('button[data-a]');
        if (!b) { abre(tipoEl(arr[i]), i); return; }
        if (b.dataset.a === 'del') arr.splice(i, 1);
        else if (b.dataset.a === 'up' && i > 0) { var t = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = t; }
        else if (b.dataset.a === 'down' && i < arr.length - 1) { var t2 = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t2; }
        mudou();
      };
    });
  }
  function grafico() {
    var o = rodar(work, ui.lado);
    $('#dsMsgs').innerHTML = o.erros.map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join('') + o.avisos.map(function (m) { return '<div class="msg warn">' + esc(m) + '</div>'; }).join('');
    var tem = work.trechos1.length + work.trechos2.length + work.internos1.length + work.internos2.length;
    if (o.cena) { $('#dsGraf').innerHTML = PV.previewSvg(o.cena, 640, 300, null, 'pp-pv'); $('#dsGraf').dataset.ok = '1'; }
    else if (!$('#dsGraf').dataset.ok) $('#dsGraf').innerHTML = '';
    $('#dsResumo').textContent = !tem ? 'Desenho vazio: escolha elementos na paleta.' : o.erros.length ? 'Corrija os itens em vermelho (o desenho mostra o último estado válido).' : 'Linha tracejada = bloco bruto de referência (Ø ' + fmt(dRefEfetivo(work)) + '); no Gerador vale o bruto que você digitar.';
  }
  function tela() {
    cabecalho();
    [$('#dsLado'), $('#dsLado2')].forEach(function (el) {
      el.hidden = work.lados !== '2';
      if (!el.hidden) seg(el, [[1, 'Lado 1'], [2, 'Lado 2']], ui.lado, function (v) { ui.lado = +v; tela(); });
    });
    listas(); grafico();
    var pending=work.pdfControle&&work.pdfControle.pendencias||[],panel=$('#dsPdfRevisao');
    panel.hidden=!pending.length;
    $('#dsPdfPendencias').textContent=pending.length?'Ainda não liberados para o Gerador: '+pending.map(p=>p.rotulo+' ('+(p.view||'outra vista')+')').join(' · '):'';
  }
  function mudou() { persistWork(); tela(); }

  /* ---------- salvar / abrir / excluir ---------- */
  function abrirId(id) {
    var d = id && salvoDe(id);
    work = d ? clone(d) : vazio(); ui.lado = 1; persistWork(); tela();
  }
  function confirmaDescartar() { return !sujo() || (!work.trechos1.length && !work.trechos2.length && !work.internos1.length && !work.internos2.length && !work.id) || confirm('O desenho aberto tem alterações não salvas. Descartar?'); }
  $('#dsSel').onchange = function () { var v = this.value; if (!confirmaDescartar()) { cabecalho(); return; } abrirId(v); };
  $('#dsNovo').onclick = function () { if (!confirmaDescartar()) return; abrirId(null); };
  $('#dsNome').oninput = function () { work.nome = this.value; persistWork(); cabecalho(); };
  $('#dsLPeca').oninput = function () { work.lPeca = this.value; mudou(); };
  $('#dsDRef').oninput = function () { work.dRef = this.value; mudou(); };
  function salvar() {
    if(work.pdfControle&&work.pdfControle.pendencias&&work.pdfControle.pendencias.length){
      alert('O desenho ainda possui características do PDF não verificadas: '+work.pdfControle.pendencias.map(q=>q.rotulo).join(', ')+'.\nAdicione os elementos no editor e use "Verificar detalhes" antes de salvar.');
      return false;
    }
    if (!String(work.nome).trim()) return false;
    work.nome = String(work.nome).trim();
    var agora = new Date().toISOString();
    if (work.id && salvoDe(work.id)) { var i = lista.indexOf(salvoDe(work.id)); work.alterado = agora; lista[i] = clone(work); }
    else { work.id = uid(); work.criado = agora; work.alterado = agora; lista.push(clone(work)); }
    save(K_DES, lista); persistWork(); tela(); avisaMudou(work.id);
    return true;
  }
  $('#dsSalvar').onclick = salvar;
  $('#dsPdfVerificar').onclick = function(){
    var current=work.pdfControle;
    if(!current||!current.pendencias||!current.pendencias.length)return;
    var report=root.CNCPDFAuditoria&&root.CNCPDFAuditoria.verify(work,current.pendencias);
    if(!report){alert('Auditoria geométrica indisponível.');return}
    if(!report.ready){current.pendencias=report.unresolved;persistWork();tela();alert('Ainda há detalhes que não podem ser associados com segurança ao perfil CNC: '+report.unresolved.map(q=>q.rotulo).join(', '));return}
    if(!confirm('Todos os detalhes obrigatórios possuem elementos correspondentes. Você conferiu suas posições, cotas e orientação no PDF e deseja liberar o desenho para salvar?'))return;
    current.pendencias=[];current.status='confirmado';current.confirmadoEm=new Date().toISOString();
    persistWork();tela();
  };
  $('#dsDup').onclick = function () {
    if (!work.id) return; var c = clone(work); c.id = uid(); c.nome = work.nome + ' (cópia)'; c.criado = c.alterado = new Date().toISOString();
    lista.push(c); save(K_DES, lista); work = clone(c); ui.lado = 1; persistWork(); tela(); avisaMudou(); $('#dsNome').focus(); $('#dsNome').select();
  };
  $('#dsExcluir').onclick = function () {
    if (!work.id || !confirm('Excluir o desenho "' + work.nome + '"? Programas já gerados não mudam, mas o Gerador deixa de poder usá-lo.')) return;
    lista = lista.filter(function (x) { return x.id !== work.id; }); save(K_DES, lista);
    work = lista.length ? clone(lista[0]) : vazio(); ui.lado = 1; persistWork(); tela(); avisaMudou();
  };
  $('#dsExp').onclick = function () {
    var blob = new Blob([JSON.stringify({ tipo: 'cnc-desenhos', versao: 1, desenhos: lista }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'desenhos-pecas.json'; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#dsImp').onclick = function () { $('#dsFile').click(); };
  $('#dsFile').onchange = function () {
    var f = this.files[0]; if (!f) return; var inp = this;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result), arr = Array.isArray(j) ? j : j.desenhos, n = 0;
        if (!Array.isArray(arr)) throw new Error('formato');
        arr.forEach(function (d) {
          if (!d || typeof d !== 'object' || !d.nome) return;
          var c = norm(clone(d)), ja = c.id && salvoDe(c.id);
          if (ja && JSON.stringify(strip(ja)) === JSON.stringify(strip(c))) return;   // igual: nada a fazer
          if (ja || !c.id) { c.id = uid(); c.nome = c.nome + (ja ? ' (importado)' : ''); }
          lista.push(c); n++;
        });
        save(K_DES, lista); tela(); avisaMudou();
        alert(n ? n + (n === 1 ? ' desenho importado.' : ' desenhos importados.') : 'Nenhum desenho novo no arquivo.');
      } catch (e) { alert('Arquivo inválido: não é uma lista de desenhos exportada por este gerador.'); }
      inp.value = '';
    };
    rd.readAsText(f);
  };

  /* ---------- janela do elemento ---------- */
  var cur = null;   // {tp, idx, it}
  function inicial(tp, arr) { // novo elemento ja vem coerente com o anterior (Ø externo so cresce para o fundo; interno so diminui)
    var ult = null, n = function (v) { return Number(v) > 0 ? Number(v) : null; };
    arr.forEach(function (x) { var d = x.tipo === 'cil' || x.tipo === 'icil' || x.tipo === 'rosca' ? n(x.a) : x.tipo === 'irosca' ? n(CNC.psRoscaD1(Number(x.a), Number(x.c))) : x.tipo === 'cone' || x.tipo === 'icone' ? n(x.b) : null; if (d) ult = d; });
    if (!ult) return {};
    if (tp === 'cil' || tp === 'icil') return { a: ult };
    if (tp === 'rosca') return { a: ult };
    if (tp === 'irosca') return { a: ult + 2 };
    if (tp === 'cone') return { a: ult, b: ult + 10 };
    if (tp === 'icone') return { a: ult, b: Math.max(1, ult - 6) };
    if (tp === 'icanal') return { a: ult + 6 };
    return {};
  }
  function comItem(w) { // copia do desenho com o item em edicao aplicado
    var t = clone(w), tp = cur.tp, arr = t[EL[tp].l + ui.lado];
    if (cur.idx >= 0) arr[cur.idx] = clone(cur.it); else arr.push(clone(cur.it));
    return t;
  }
  function semItem(w) {
    var t = clone(w), arr = t[EL[cur.tp].l + ui.lado];
    if (cur.idx >= 0) arr.splice(cur.idx, 1);
    return t;
  }
  // Z onde o elemento comeca = fim do elemento anterior da mesma lista (o 1o comeca na face, Z0)
  function cursorZ(tp, idx) {
    var arr = (work[EL[tp].l + ui.lado] || []), fim = idx >= 0 ? idx : arr.length, z = 0, int = EL[tp].g === 'int';
    for (var i = 0; i < fim; i++) {
      var it = arr[i], n = function (v) { return Number(v) > 0 ? Number(v) : 0; };
      if (int) z += it.tipo === 'icil' || it.tipo === 'irosca' ? n(it.b) : it.tipo === 'icone' ? n(it.c) : (it.tipo === 'icanal' && it.seq) ? n(it.c) : 0;
      else z += it.tipo === 'cil' || it.tipo === 'rosca' ? n(it.b) : it.tipo === 'cone' ? n(it.c) : (it.tipo === 'canal' && it.seq) ? n(it.c) : 0;
    }
    return z;
  }
  function desenhoDlg() {
    var tp = cur.tp, it = cur.it, zc = cursorZ(tp, cur.idx), d = DW[tp](it, zc), ks = chaves(tp), h = '<svg viewBox="0 0 340 230" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line class="axis" x1="60" y1="190" x2="326" y2="190"/>' + d.svg +
      (d.semFace ? '' : '<text x="240" y="214" text-anchor="middle">' + (zc > 0 ? 'início: Z' + fmt(zc) : 'face (Z0)') + '</text>') + '<text x="96" y="214" text-anchor="middle">fundo</text></svg>';
    ks.forEach(function (k, q) {
      var pos = d.box[k]; if (!pos) return;
      h += '<label class="dwg-f" style="left:' + (pos[0] / 340 * 100) + '%;top:' + (pos[1] / 230 * 100) + '%" title="' + esc(rotulos(tp)[q]) + '"><span class="ltr">' + LET[q] + '</span><input data-k="' + k + '" type="number" step="any" inputmode="decimal" aria-label="' + esc(LET[q] + ' - ' + rotulos(tp)[q]) + '" value="' + esc(it[k] == null ? '' : it[k]) + '"></label>';
    });
    $('#dlgDwg').innerHTML = h;
    $$('#dlgDwg input').forEach(function (i) { i.oninput = function () { cur.it[i.dataset.k] = i.value; miniPv(); }; });
  }
  function miniPv() {
    var o = rodar(comItem(work), ui.lado), er = o.erros[0], cena = o.cena;
    if (!cena) cena = rodar(semItem(work), ui.lado).cena;   // com erro: mostra a peca sem este elemento
    $('#dlgPv').innerHTML = (cena ? PV.previewSvg(cena, 520, 170, null, 'pp-pv') : '') + (er ? '<div class="msg err" style="margin-top:6px">' + esc(er) + '</div>' : '');
  }
  // chanfro/raio: o canto e escolhido no proprio desenho da peca (pontos numerados) ou na lista
  function pickDlg() {
    var tp = cur.tp, grupo = EL[tp].g, base = semItem(work), o = rodar(base, ui.lado), cs = cantosDe(grupo, base, ui.lado);
    var usados = (base[EL[tp].l + ui.lado] || []).filter(function (x) { return x.alvo; }).map(function (x) { return x.alvo + '|' + x.onde; });
    cur.cs = cs;
    if (!cur.it.alvo || !cs.some(function (q) { return q.alvo === cur.it.alvo && q.onde === cur.it.onde; })) {
      var livre = cs.filter(function (q) { return usados.indexOf(q.alvo + '|' + q.onde) < 0; })[0];
      if (livre) { cur.it.alvo = livre.alvo; cur.it.onde = livre.onde; } else { cur.it.alvo = ''; }
    }
    var marks = cs.map(function (q, i) { return { n: i + 1, z: q.z, r: q.r, rot: q.rot, on: q.alvo === cur.it.alvo && q.onde === cur.it.onde }; });
    var h = '<div class="pick-graf">' + (o.cena ? PV.previewSvg(o.cena, 600, 250, marks, 'pp-pv') : '<div class="msg err">' + esc(o.erros[0] || 'Desenhe antes o perfil da peça.') + '</div>') + '</div>';
    if (!cs.length) h += '<div class="msg warn">Não há cantos disponíveis neste lado: crie antes os cilindros ' + (grupo === 'int' ? 'internos (mandrilamento)' : 'do perfil') + ' e verifique se há degrau entre eles.</div>';
    h += '<div class="pick-lista" role="radiogroup" aria-label="Canto">' + cs.map(function (q, i) {
      var v = q.alvo + '|' + q.onde, ocup = usados.indexOf(v) >= 0, on = q.alvo === cur.it.alvo && q.onde === cur.it.onde;
      return '<label class="pk' + (ocup ? ' off' : '') + '"><input type="radio" name="pk" value="' + esc(v) + '"' + (on ? ' checked' : '') + (ocup ? ' disabled' : '') + '><b>' + (i + 1) + '</b> ' + esc(q.rot) + (ocup ? ' <small>(já tem chanfro/raio)</small>' : '') + '</label>';
    }).join('') + '</div>';
    h += '<div class="pick-tam"><label for="pkTam">' + (tp.indexOf('chanfro') >= 0 ? 'Tamanho do chanfro (C, cateto a 45°)' : 'Raio R') + '</label><div class="unit"><input id="pkTam" type="number" step="any" inputmode="decimal" value="' + esc(cur.it.a == null ? '' : cur.it.a) + '"><span>mm</span></div></div>';
    $('#dlgPick').innerHTML = h;
    function marca(v) { var p = v.split('|'); cur.it.alvo = p[0]; cur.it.onde = p[1]; pickDlg(); pickErro(); var t = $('#pkTam'); if (t) t.focus(); }
    $$('#dlgPick g.pv-mk').forEach(function (m) {
      var q = cs[+m.dataset.n - 1], ocup = usados.indexOf(q.alvo + '|' + q.onde) >= 0;
      if (ocup) { m.classList.add('off'); return; }
      m.onclick = function () { marca(q.alvo + '|' + q.onde); };
      m.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); marca(q.alvo + '|' + q.onde); } };
    });
    $$('#dlgPick input[name="pk"]').forEach(function (r) { r.onchange = function () { marca(r.value); }; });
    $('#pkTam').oninput = function () { cur.it.a = this.value; pickErro(); };
  }
  // erros que o elemento em edicao cria (desenho incompleto, como lado 2 ainda vazio, nao conta)
  function novosErros() {
    var antes = rodar(semItem(work), ui.lado).erros;
    return rodar(comItem(work), ui.lado).erros.filter(function (m) { return antes.indexOf(m) < 0 && !/adicione ao menos/.test(m); });
  }
  function pickErro() { // erro novo causado por este canto (tamanho que nao cabe, canto inexistente...)
    var er = novosErros()[0];
    $('#dlgErr').hidden = !er; $('#dlgErr').textContent = er || '';
  }
  function abre(tp, idx) {
    var arr = lista_(tp), it = idx >= 0 ? clone(arr[idx]) : Object.assign({ tipo: tp, id: uid() }, clone(EL[tp].d), inicial(tp, arr));
    cur = { tp: tp, idx: idx, it: it };
    $('#dlgT').textContent = EL[tp].nome + (work.lados === '2' ? ' · lado ' + ui.lado : '') + (idx >= 0 ? ' (editar)' : '');
    $('#dlgOk').textContent = idx >= 0 ? 'Salvar' : 'Adicionar à peça';
    var rot = rotulos(tp);
    var z0 = cursorZ(tp, idx), ini = EL[tp].marca || tp === 'furo' || tp === 'canalz' ? '' : (z0 > 0 ? 'Começa em Z' + fmt(z0) + ' (fim do elemento anterior). ' : 'Começa na face (Z0). ');
    $('#dlgSub').textContent = ini + (EL[tp].marca ? '' : rot.map(function (r, q) { return LET[q] + ' = ' + r; }).join(' · ') + '. ') + (EL[tp].dica || '');
    $('#dlgDwg').hidden = !!EL[tp].marca; $('#dlgPick').hidden = !EL[tp].marca; $('#dlgPvBox').hidden = !!EL[tp].marca;
    $('#dlgErr').hidden = true;
    if (EL[tp].marca) { it.a = it.a == null ? 1 : it.a; pickDlg(); pickErro(); }
    else { desenhoDlg(); miniPv(); }
    $('#dlgEl').showModal();
    var f1 = EL[tp].marca ? $('#pkTam') : $('#dlgDwg input'); if (f1) { f1.focus(); f1.select(); }
  }
  $('#dlgCancel').onclick = function () { $('#dlgEl').close(); };
  $('#frmEl').onsubmit = function (e) {
    var it = cur.it, ok = true;
    chaves(cur.tp).forEach(function (k) { var v = Number(it[k]); if (it[k] === '' || it[k] == null || !isFinite(v) || v < 0 || (k === 'a' && EL[cur.tp].marca && !(v > 0))) ok = false; });
    if (EL[cur.tp].marca && !it.alvo) { $('#dlgErr').textContent = 'Escolha o canto onde vai (clique num ponto numerado do desenho ou na lista).'; $('#dlgErr').hidden = false; e.preventDefault(); return; }
    if (!ok) { e.preventDefault(); $('#dlgErr').textContent = 'Preencha todas as cotas com números.'; $('#dlgErr').hidden = false; return; }
    // nao deixa entrar um elemento que cria erro novo no desenho (diametro que diminui, canto grande demais...)
    var novos = novosErros();
    if (novos.length) { e.preventDefault(); $('#dlgErr').textContent = novos[0]; $('#dlgErr').hidden = false; return; }
    var arr = lista_(cur.tp);
    if (cur.idx >= 0) arr[cur.idx] = clone(it); else arr.push(clone(it));
    mudou();
  };

  /* ---------- API para o resto do app ---------- */
  var api = {
    lista: function () { return lista.map(function (d) { return { id: d.id, nome: d.nome }; }); },
    obter: function (id) { var d = salvoDe(id); return d ? clone(d) : null; },
    abrir: function (id) { abrirId(id); },
    novo: function () { abrirId(null); },
    importarPDF: function (dados) {
      if (!confirmaDescartar()) return false;
      var novo = vazio();
      novo.nome = String(dados.nome || 'Desenho PDF').trim();
      novo.lPeca = dados.lPeca;
      novo.dRef = dados.dRef;
      novo.lados = dados.items.some(function (it) { return it.side === '2'; }) ? '2' : '1';
      if(Array.isArray(dados.pendencias)&&dados.pendencias.length){
        novo.pdfControle={origem:'PDF vetorial',status:'revisao',
          orientacao:dados.orientacao||null,pendencias:clone(dados.pendencias)};
      }
      dados.items.forEach(function (it) {
        var el = { id: uid(), tipo: it.tipo, a: it.a, b: it.b };
        if (it.tipo === 'cone' || it.tipo === 'icone') el.c = it.c;
        novo[(it.tipo.charAt(0) === 'i' ? 'internos' : 'trechos') + it.side].push(el);
      });
      work = norm(novo); ui.lado = 1; persistWork(); tela();
      return true;
    },
    salvarPDF: function (dados) {
      if (!api.importarPDF(dados)) return null;
      if (!salvar()) return null;
      return work.id;
    },
    mostrar: function () { tela(); },
    sujoId: function () { return work.id && sujo() ? work.id : null; },   // id do desenho salvo que tem alteracoes ainda nao salvas no editor
    // ao sair da tela do desenho: oferece salvar (o Gerador so enxerga o que foi salvo)
    aoSair: function () {
      if (!sujo()) return;
      var tem = work.trechos1.length + work.trechos2.length + work.internos1.length + work.internos2.length;
      if (!String(work.nome).trim()) { if (tem) alert('Este desenho ainda não tem nome e não foi salvo. Volte em Desenho da peça, dê um nome e clique em Salvar para usá-lo no Gerador.'); return; }
      if (confirm('Salvar o desenho "' + String(work.nome).trim() + '" antes de sair?\n\nO Gerador só usa desenhos salvos. (Cancelar mantém como rascunho, sem salvar.)')) salvar();
    },
    onMudou: null
  };
  pal($('#dsPalExt'), 'ext'); pal($('#dsPalInt'), 'int');
  root.CNCDesenhos = api;
})(window);
