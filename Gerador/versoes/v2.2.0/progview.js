/* Modulo Simulacao: cola um programa pronto, lista as ferramentas (comando T) com o desenho do formato e simula
   na mesma janela de simulacao do Gerador (SimView.create('ps')). Leitura do programa: progsim.js (CNCProg). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fx(v) { return String(Math.round(Number(v) * 100) / 100); }

  var K = 'cnc.progsim.v1';
  var api = null, sv = null, res = null, ativo = false, timer = 0, sigAnt = '';
  var st = { texto: '', ferr: {}, orient: {}, b: { d: '', sobre: '', livre: '', grip: '', furoD: '' } };

  var EXEMPLO = [
    '(EXEMPLO - PECA SIMPLES: FACEAR, DESBASTAR COM G71 E ACABAR COM G70)',
    '#1=62(DIAMETRO BRUTO)',
    '#2=1(SOBREMETAL EM Z)',
    '#3=250(PT DE TROCA EM Z)',
    '',
    'G1900D#1L40K0.',
    '',
    'G21G90G40G80',
    'G28U0(PT DE TROCA)',
    'G0Z#3(PT DE TROCA)',
    'T0101(DESBASTE EXTERNO)',
    'G54',
    'G96S300M4',
    'G50S2000',
    'M8',
    '',
    '(FACEAMENTO)',
    'G0Z#2',
    'G0X#1',
    'G75X-1Z0P999999Q1000R.5F.45(FACEAR)',
    '',
    '(DESBASTE DO PERFIL)',
    'G0Z#2',
    'X#1',
    'G71U3R.5',
    'G71P1Q2U0W0F.45',
    'N1G0X30',
    'Z0',
    'G1X40Z-1F.15',
    'Z-20',
    'G3X50Z-25R5',
    'G1X60',
    'Z-35',
    'N2G0X#1',
    '',
    'G0Z#2',
    'X#1',
    '(ACABAMENTO)',
    'G70P1Q2F.15',
    '',
    'G28U0',
    'G0Z#3',
    'M9',
    'M30'
  ].join('\n');

  /* ---------- armazenamento ---------- */
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(K) || 'null');
      if (v && typeof v === 'object') {
        st.texto = typeof v.texto === 'string' ? v.texto : '';
        st.ferr = v.ferr && typeof v.ferr === 'object' ? v.ferr : {};
        st.orient = v.orient && typeof v.orient === 'object' ? v.orient : {};
        st.b = Object.assign(st.b, v.b || {});
      }
    } catch (e) { /* sem storage: segue em branco */ }
  }
  function save() { try { localStorage.setItem(K, JSON.stringify(st)); } catch (e) { /* ignora */ } }

  /* ---------- ferramentas do banco x codigos T do programa ---------- */
  function tcode(t) { return CNC.tcode(t); } // banco: aceita 'T0101', '101' ou '0101'
  function escolhida(f) { // ferramenta do banco para o codigo T de f (escolha salva, senao a de mesmo codigo)
    var tools = api.tools(), id = st.ferr[f.codigo];
    if (id === '') return null;
    var t = id ? tools.filter(function (x) { return x.id === id; })[0] : null;
    if (t) return t;
    var iguais = tools.filter(function (x) { return tcode(x.t) === f.codigo; });
    if (!iguais.length) return null;
    return iguais.filter(function (x) { return x.tipo === f.sug.tipo; })[0] || iguais[0];
  }
  var ORIENT = {
    encaixe: [['canal', 'Canal frontal (na face, corta em Z)'], ['canalext', 'Canal externo (radial)'], ['canalint', 'Canal interno (radial)']],
    rosca: [['rosca', 'Rosca externa'], ['roscaint', 'Rosca interna']]
  };
  function orientDe(f, t) {
    if (!t || !ORIENT[t.tipo]) return null;
    var lista = ORIENT[t.tipo].map(function (o) { return o[0]; }), v = st.orient[f.codigo];
    if (v && lista.indexOf(v) >= 0) return v;
    return f.sug.orient && lista.indexOf(f.sug.orient) >= 0 ? f.sug.orient : lista[0];
  }
  var TIPOS = { externa: 'Externa', faceamento: 'Faceamento', interna: 'Interna', encaixe: 'Encaixe/canal', furacao: 'Furação', rosca: 'Rosca', outra: 'Outra' };
  function rotuloTool(t) { return 'T' + tcode(t.t) + ' — ' + t.nome + ' · ' + (TIPOS[t.tipo] || t.tipo); }

  /* ---------- desenho do formato da ferramenta (o mesmo poligono que o simulador usa) ---------- */
  function legendaForma(f, t) {
    var past = t && t.pastilha ? 'Pastilha ' + esc(t.pastilha) + ' · ' : '';
    switch (f.kind) {
      case 'interna': return 'Barra de mandrilar (dentro do furo) · ' + past + 'ponta ' + fx(f.ang) + '°' + (f.raio ? ' · raio ' + fx(f.raio) : '');
      case 'canal': return 'Ferramenta de canal ' + fx(f.largura) + ' mm · canal frontal (corta em Z, na face)';
      case 'canalext': return 'Ferramenta de canal ' + fx(f.largura) + ' mm · canal externo (radial)';
      case 'canalint': return 'Ferramenta de canal ' + fx(f.largura) + ' mm · canal interno (radial)';
      case 'rosca': return 'Ferramenta de rosca 60° · externa';
      case 'roscaint': return 'Ferramenta de rosca 60° · interna';
      case 'broca': return 'Broca Ø' + fx(f.largura) + ' mm (furação no eixo)';
      default: return (t ? '' : 'Pastilha padrão (nenhuma ferramenta escolhida) · ') + past + 'ponta ' + fx(f.ang) + '°' + (f.raio ? ' · raio ' + fx(f.raio) : '');
    }
  }
  function svgFerr(f) {
    var sh = CNCSim.toolShape(f), bb = sh.bb;
    var zmin = Math.min(bb[0], 0), zmax = Math.max(bb[1], 0), rmin = Math.min(bb[2], 0), rmax = Math.max(bb[3], 0);
    var W = 176, H = 100, m = 16, bw = Math.max(zmax - zmin, 1), bh = Math.max(rmax - rmin, 1);
    var sc = Math.min((W - 2 * m) / bw, (H - 2 * m) / bh, 10), px = (W - bw * sc) / 2, py = (H - bh * sc) / 2;
    function X(z) { return px + (z - zmin) * sc; }
    function Y(r) { return H - py - (r - rmin) * sc; }
    var pts = sh.pts.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ');
    var tx = X(0), ty = Y(0), o = '<svg class="ps-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Formato da ferramenta como aparece na simulação">';
    if (f.kind === 'broca') o += '<line class="eixo" x1="2" x2="' + (W - 2) + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '"/><text class="m" x="4" y="' + (ty + 10).toFixed(1) + '">eixo da peça</text>';
    o += '<polygon class="f" points="' + pts + '"/>';
    o += '<path class="tip" d="M' + (tx - 6).toFixed(1) + ' ' + ty.toFixed(1) + 'H' + (tx + 6).toFixed(1) + 'M' + tx.toFixed(1) + ' ' + (ty - 6).toFixed(1) + 'V' + (ty + 6).toFixed(1) + '"/>';
    o += '<text class="m" x="4" y="11">← peça / placa</text><text class="m" x="' + (W - 4) + '" y="' + (H - 4) + '" text-anchor="end">+Z →   ↑ +X</text>';
    return o + '</svg>';
  }

  /* ---------- leitura do programa ---------- */
  function ler() {
    clearTimeout(timer);
    var txt = $('#psTexto').value;
    st.texto = txt; save();
    res = null;
    if (txt.trim()) {
      try { res = CNCProg.interpretar(txt, { maq: api.maq() }); }
      catch (e) { $('#psMsgs').innerHTML = '<div class="msg err">Erro interno ao ler o programa: ' + esc(e && e.message) + '</div>'; }
    }
    sigAnt = assinatura();
    renderMsgs(); renderFerr(); renderBruto(); simular();
  }
  function assinatura() { return JSON.stringify([st.texto, st.ferr, st.orient, st.b, api.maq(), api.tools()]); }
  function agenda() { clearTimeout(timer); timer = setTimeout(ler, 350); }

  function linhasUteis(t) { return t.split(/\r?\n/).filter(function (l) { return l.trim() !== '' && l.trim() !== '%'; }).length; }
  function renderMsgs() {
    var box = $('#psMsgs'), rs = $('#psResumo');
    if (!res) { if (!$('#psTexto').value.trim()) { box.innerHTML = ''; rs.textContent = 'Nenhum programa colado.'; } return; }
    rs.innerHTML = '<b>' + linhasUteis(res.texto) + '</b> linhas · <b>' + res.ferramentas.length + '</b> ferramenta' + (res.ferramentas.length === 1 ? '' : 's') + ' · <b>' + res.moves.length + '</b> movimentos · ' +
      (res.erros.length ? '<b style="color:var(--err)">' + res.erros.length + ' erro' + (res.erros.length === 1 ? '' : 's') + '</b>' : '0 erros') + ' · ' + res.avisos.length + ' aviso' + (res.avisos.length === 1 ? '' : 's');
    function item(cls, m) { return '<div class="msg ' + cls + ' ps-msg" data-l="' + m.linha + '" title="Clique para ir à linha"><b>Linha ' + (m.linha + 1) + ':</b> ' + esc(m.texto) + '</div>'; }
    box.innerHTML = res.erros.map(function (m) { return item('err', m); }).join('') + res.avisos.map(function (m) { return item('warn', m); }).join('');
    $$('.ps-msg', box).forEach(function (el) { el.onclick = function () { irParaLinha(+el.dataset.l); }; });
  }
  function irParaLinha(n) {
    var ta = $('#psTexto'), L = ta.value.split('\n'), a = 0, i;
    for (i = 0; i < n && i < L.length; i++) a += L[i].length + 1;
    ta.focus(); ta.setSelectionRange(a, a + (L[n] ? L[n].length : 0));
    var alt = parseFloat(getComputedStyle(ta).lineHeight) || 19;
    ta.scrollTop = Math.max(0, n * alt - ta.clientHeight / 2);
  }

  /* ---------- cartoes das ferramentas ---------- */
  function infoPrograma(f) {
    var m = res.moves.filter(function (x) { return x.tool === f.codigo && x.t === 'f' && x.spin; })[0];
    if (!m) return '';
    var s = m.spin;
    return 'No programa: ' + (s.modo === 'G96' ? 'G96 Vc ' + fx(s.vc) + (s.rpm ? ' (limite ' + fx(s.rpm) + ' rpm)' : '') : 'G97 ' + fx(s.rpm) + ' rpm') + ' · avanço ' + fx(m.f) + ' mm/rot';
  }
  function infoBanco(t) {
    if (!t) return '';
    return 'No banco: ' + (t.modo === 'G97' ? 'RPM fixo ' + fx(t.rpm) : 'Vc ' + fx(t.vc) + ' · limite ' + fx(t.rpm) + ' rpm') + ' · avanço ' + fx(t.avDesb);
  }
  function renderFerr() {
    var box = $('#psFerr');
    if (!res) { box.innerHTML = '<div class="note">' + ($('#psTexto').value.trim() ? 'Não foi possível ler o programa.' : 'Cole um programa para ver as ferramentas usadas.') + '</div>'; return; }
    if (!res.ferramentas.length) { box.innerHTML = '<div class="note">Nenhum comando T com movimentos foi encontrado no programa.</div>'; return; }
    var tools = api.tools().slice().sort(function (a, b) { return tcode(a.t).localeCompare(tcode(b.t)) || a.nome.localeCompare(b.nome); });
    box.innerHTML = res.ferramentas.map(function (f) {
      var t = escolhida(f), or = orientDe(f, t), forma = CNCProg.formaFerr(t, or), iguais = tools.filter(function (x) { return tcode(x.t) === f.codigo; }), outras = tools.filter(function (x) { return tcode(x.t) !== f.codigo; });
      var opt = function (x) { return '<option value="' + esc(x.id) + '"' + (t && t.id === x.id ? ' selected' : '') + '>' + esc(rotuloTool(x)) + '</option>'; };
      var sel = '<select data-code="' + f.codigo + '" data-k="tool" aria-label="Ferramenta do banco para T' + f.codigo + '">' +
        '<option value=""' + (!t ? ' selected' : '') + '>— nenhuma (pastilha padrão 80°) —</option>' +
        (iguais.length ? '<optgroup label="Mesmo código T' + f.codigo + ' no banco">' + iguais.map(opt).join('') + '</optgroup>' : '') +
        (outras.length ? '<optgroup label="Outras ferramentas do banco">' + outras.map(opt).join('') + '</optgroup>' : '') + '</select>';
      var ori = t && ORIENT[t.tipo] ? '<label>Posição de uso</label><select data-code="' + f.codigo + '" data-k="orient" aria-label="Posição de uso da ferramenta T' + f.codigo + '">' +
        ORIENT[t.tipo].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === or ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' : '';
      var aviso = '';
      if (!t) aviso = '<div class="ps-aviso">' + (iguais.length ? 'Escolha a ferramenta.' : 'Nenhuma ferramenta do banco tem o código T' + f.codigo + ': escolha uma na lista (ou cadastre em Ferramentas). Enquanto isso o simulador usa uma pastilha padrão de 80°.') + '</div>';
      else if (tcode(t.t) !== f.codigo) aviso = '<div class="ps-aviso">Atenção: o código da ferramenta escolhida (T' + tcode(t.t) + ') é diferente do T' + f.codigo + ' do programa.</div>';
      var sug = f.sug.tipo !== (t && t.tipo) && t ? '<div class="ps-cap">O programa usa esta ferramenta como <b>' + esc((TIPOS[f.sug.tipo] || f.sug.tipo).toLowerCase()) + '</b>; a escolhida é do tipo ' + esc((TIPOS[t.tipo] || t.tipo).toLowerCase()) + '.</div>' : '';
      var prog = infoPrograma(f), banco = infoBanco(t);
      return '<div class="ps-tool' + (t ? '' : ' sem') + '">' +
        '<div class="ps-tool-top"><span class="ps-t">T' + f.codigo + '</span><span class="ps-desc">' + esc(f.comentario || '(sem comentário no programa)') + '</span>' +
        '<span class="note">' + f.nMov + ' movimentos · ' + f.nCorte + ' de corte · linha ' + (f.linhaT + 1) + '</span></div>' +
        '<div class="ps-tool-body"><div><label>Ferramenta do banco</label>' + sel + ori + aviso + sug +
        (prog ? '<div class="ps-cap">' + esc(prog) + '</div>' : '') + (banco ? '<div class="ps-cap">' + esc(banco) + '</div>' : '') + '</div>' +
        '<div>' + svgFerr(forma) + '<div class="ps-cap">' + legendaForma(forma, t) + '</div></div></div></div>';
    }).join('');
    $$('select', box).forEach(function (s) {
      s.onchange = function () {
        if (s.dataset.k === 'tool') { st.ferr[s.dataset.code] = s.value; delete st.orient[s.dataset.code]; }
        else st.orient[s.dataset.code] = s.value;
        save(); sigAnt = assinatura(); renderFerr(); renderBruto(); simular();
      };
    });
  }

  /* ---------- bruto e fixacao ---------- */
  function renderBruto() {
    var sg = res ? res.sugestao : null, maq = api.maq(), ph = function (id, txt) { var el = $(id); el.placeholder = txt; el.classList.toggle('auto', true); };
    ph('#psD', sg && sg.d ? 'auto: ' + fx(sg.d) + (sg.fonteD === 'G1900' ? ' (G1900)' : '') : 'informe o Ø');
    ph('#psSobre', sg ? 'auto: ' + fx(sg.sobre) : 'auto');
    ph('#psLivre', sg ? 'auto: ' + fx(sg.livre) : 'auto');
    ph('#psGrip', 'auto: ' + fx(maq.grip || 25));
    ph('#psFuro', sg && sg.furoD ? 'auto: Ø' + fx(sg.furoD) : 'maciço');
    $$('#psBruto input').forEach(function (el) { if (document.activeElement !== el) el.value = st.b[el.dataset.b] == null ? '' : st.b[el.dataset.b]; });
  }

  /* ---------- simulacao ---------- */
  function simular() {
    if (!sv) return;
    if (!res) { sv.setResult(null); sv.setAviso($('#psTexto').value.trim() ? 'Não foi possível ler o programa.' : 'Cole um programa para simular.'); $('#psTitulo').textContent = ''; return; }
    if (!res.moves.length) { sv.setResult(null); sv.setAviso('O programa não tem movimentos para simular.'); $('#psTitulo').textContent = ''; return; }
    var cfg = { d: st.b.d, sobre: st.b.sobre, livre: st.b.livre, grip: st.b.grip, furoD: st.b.furoD, maq: api.maq(), ferr: {} };
    res.todasFerr.forEach(function (f) { var t = escolhida(f); cfg.ferr[f.codigo] = { tool: t, orient: orientDe(f, t) }; });
    var cena = CNCProg.montarCena(res, cfg), b = cena.bruto;
    $('#psTitulo').textContent = 'bruto Ø' + fx(b.d) + (b.vazios ? ' furo Ø' + fx(cfg.furoD || res.sugestao.furoD) : '') + ' · livre ' + fx(-cena.chuck.zFace) + ' mm';
    sv.setResult({ cena: cena, code: res.texto });
  }

  /* ---------- entradas do usuario ---------- */
  function lerArquivo(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var buf = rd.result, txt;
      try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('windows-1252').decode(buf); }
      $('#psTexto').value = txt; ler();
    };
    rd.readAsArrayBuffer(file);
  }
  function nota(t) { var rs = $('#psResumo'); rs.textContent = t; }

  function init(a) {
    api = a; load();
    sv = SimView.create('ps'); sv.init();
    var ta = $('#psTexto'); ta.value = st.texto;
    $$('#psBruto input').forEach(function (el) {
      el.value = st.b[el.dataset.b] == null ? '' : st.b[el.dataset.b];
      el.oninput = function () { st.b[el.dataset.b] = el.value; save(); sigAnt = ''; clearTimeout(timer); timer = setTimeout(function () { sigAnt = assinatura(); simular(); }, 250); };
    });
    $('#psBrutoAuto').onclick = function () { st.b = { d: '', sobre: '', livre: '', grip: '', furoD: '' }; save(); renderBruto(); sigAnt = assinatura(); simular(); };
    ta.addEventListener('input', agenda);
    ta.addEventListener('paste', function () { setTimeout(ler, 30); });
    $('#psColar').onclick = function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) { ta.value = t; ler(); }, function () { nota('O navegador não liberou a área de transferência: clique na caixa e use Ctrl+V.'); ta.focus(); });
      } else { nota('Clique na caixa e use Ctrl+V para colar.'); ta.focus(); }
    };
    $('#psAbrir').onclick = function () { $('#psFile').click(); };
    $('#psFile').onchange = function () { var f = this.files[0]; this.value = ''; if (f) lerArquivo(f); };
    $('#psExemplo').onclick = function () { ta.value = EXEMPLO; ler(); };
    $('#psLimpar').onclick = function () {
      if (ta.value.length > 80 && !confirm('Limpar o programa colado?')) return;
      ta.value = ''; ler();
    };
    if (st.texto) { /* a leitura acontece ao abrir a aba */ }
  }
  function mostrar() {
    ativo = true;
    if (assinatura() !== sigAnt) ler();
    else renderBruto();
    sv.show();
  }
  function ocultar() { ativo = false; if (sv) sv.hide(); }

  window.ProgView = { init: init, mostrar: mostrar, ocultar: ocultar, redraw: function () { if (sv && ativo) sv.redraw(); } };
})();
