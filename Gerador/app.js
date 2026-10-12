(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var K_TOOLS = 'cnc.tools.v1', K_SEEDED = 'cnc.seeded.v1', K_FORM = 'cnc.form.v2', K_THEME = 'cnc.theme.v2';

  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem storage: segue sem salvar */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- banco de ferramentas (com ferramentas-semente adicionadas uma unica vez) ---------- */
  var tools = load(K_TOOLS, null);
  if (!Array.isArray(tools)) tools = [];
  var seeded = load(K_SEEDED, []);
  if (!Array.isArray(seeded)) seeded = [];
  window.CNC_SEED_TOOLS.forEach(function (s) {
    if (seeded.indexOf(s.seedKey) >= 0) { // ja recebida: so completa campos novos (ex.: diametro da broca) sem mexer no que o usuario editou
      tools.forEach(function (t) { if (t.seedKey === s.seedKey && t.diametro == null && s.diametro != null) t.diametro = s.diametro; });
      return;
    }
    // banco ja existente (versao anterior): reaproveita a ferramenta equivalente em vez de duplicar
    var ja = tools.filter(function (t) { return t.seedKey === s.seedKey || (!t.seedKey && CNC.tcode(t.t) === s.t && t.nome === s.nome); })[0];
    if (ja) { ja.seedKey = s.seedKey; ['angulo', 'largura', 'incCanal'].forEach(function (k) { if (ja[k] == null && s[k] != null) ja[k] = s[k]; }); }
    else { var c = JSON.parse(JSON.stringify(s)); c.id = uid(); tools.push(c); }
    seeded.push(s.seedKey);
  });
  save(K_TOOLS, tools); save(K_SEEDED, seeded);

  /* ---------- estado ---------- */
  var state = load(K_FORM, {}) || {};
  state.vals = state.vals || {};
  state.toolByTipo = state.toolByTipo || {};
  state.over = state.over || {};          // incrementos alterados so nesta programacao, por tipo de peca
  state.lado = state.lado || 0;
  state.maq = Object.assign({}, CNC.DEFAULT_MAQ, state.maq || {});
  state.tipo = CNC.GERADORES[state.tipo] ? state.tipo : 'matriz_solida';
  state.autor = state.autor || 'FERRAMENTARIA';
  state.dataManual = state.dataManual || '';   // vazio = data automatica (mes/ano de hoje)
  state.pressao = state.pressao === 'M34' || state.pressao === 'M35' ? state.pressao : '';
  state.dicas = !!state.dicas;                // mostrar todas as explicacoes dos campos
  function dataEfetiva() { return String(state.dataManual || '').trim() || CNC.mesAno(); }
  var lastResult = null, lastCur = null, outTab = 'code';

  function persist() { save(K_FORM, { tipo: state.tipo, vals: state.vals, autor: state.autor, dataManual: state.dataManual, pressao: state.pressao, dicas: state.dicas, toolByTipo: state.toolByTipo, nome: state.nome, nomeManual: state.nomeManual, maq: state.maq, over: state.over, lado: state.lado, desenhoSel: state.desenhoSel }); }

  /* ---------- navegacao ---------- */
  function showView(v) {
    if (!$('#view-desenho').hidden && v !== 'desenho') CNCDesenhos.aoSair();
    $('#view-gerador').hidden = v !== 'gerador';
    $('main').classList.toggle('fixo', v === 'gerador');   // gerador: formulario e saida rolam separados
    $('#view-ferr').hidden = v !== 'ferr';
    $('#view-cfg').hidden = v !== 'cfg';
    $('#view-desenho').hidden = v !== 'desenho';
    $('#view-sim').hidden = v !== 'sim';
    $('#nav-sim').setAttribute('aria-selected', v === 'sim');
    $('#nav-desenho').setAttribute('aria-selected', v === 'desenho');
    $('#nav-gerador').setAttribute('aria-selected', v === 'gerador');
    $('#nav-ferr').setAttribute('aria-selected', v === 'ferr');
    $('#nav-cfg').setAttribute('aria-selected', v === 'cfg');
    if (v !== 'sim') ProgView.ocultar();
    if (v === 'ferr') { SimView.hide(); renderTools(); }
    else if (v === 'cfg') { SimView.hide(); buildCfg(); }
    else if (v === 'desenho') { SimView.hide(); CNCDesenhos.mostrar(); }
    else if (v === 'sim') { SimView.hide(); ProgView.mostrar(); }
    else { fillDesenhoSel(); renderToolSelects(); render(); if (outTab === 'sim') SimView.show(); }
  }
  $('#nav-gerador').onclick = function () { showView('gerador'); };
  $('#nav-ferr').onclick = function () { showView('ferr'); };
  $('#nav-sim').onclick = function () { showView('sim'); };
  $('#nav-desenho').onclick = function () { showView('desenho'); };
  $('#nav-cfg').onclick = function () { showView('cfg'); };
  var TEMAS = [['light', 'Claro'], ['dark', 'Escuro'], ['alumasa', 'Alumasa']];
  function temaAtual() {
    var cur = document.documentElement.getAttribute('data-theme');
    if (TEMAS.some(function (x) { return x[0] === cur; })) return cur;
    return 'alumasa';   // tema padrao
  }
  function temaRotulo() { var c = temaAtual(); $('#nav-tema').textContent = 'Tema: ' + TEMAS.filter(function (x) { return x[0] === c; })[0][1]; }
  $('#nav-tema').onclick = function () {
    var i = TEMAS.map(function (x) { return x[0]; }).indexOf(temaAtual()), next = TEMAS[(i + 1) % TEMAS.length][0];
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(K_THEME, next); } catch (e) { }
    temaRotulo(); SimView.redraw(); ProgView.redraw();
  };
  try { var th = localStorage.getItem(K_THEME); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) { }
  temaRotulo();

  $$('.tabs button').forEach(function (b) {
    b.onclick = function () {
      outTab = b.dataset.out;
      $$('.tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      ['code', 'sim', 'est', 'dic'].forEach(function (k) { $('#out-' + k).hidden = k !== outTab; });
      if (outTab === 'sim') SimView.show(); else SimView.hide();
    };
  });

  /* ---------- explicacoes dos campos: escondidas, abrem pelo "i" (ou todas, em Configuracoes) ---------- */
  var INFO_BTN = '<button type="button" class="info" aria-expanded="false" aria-label="Explicação" title="Explicação">i</button>';
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button.info'); if (!b) return;
    e.preventDefault();
    var alvo = b.dataset.alvo ? $(b.dataset.alvo) : (b.closest('.field') || b.closest('.grow') || b.parentNode).querySelector('.dica');
    if (!alvo) return;
    var on = alvo.classList.toggle('show'); b.setAttribute('aria-expanded', on);
  });
  // o cabecalho fica fixo: a coluna de saida desce a altura dele
  function medeCabecalho() { document.documentElement.style.setProperty('--hh', $('header').offsetHeight + 'px'); }
  medeCabecalho(); window.addEventListener('resize', medeCabecalho);
  if (window.ResizeObserver) new ResizeObserver(medeCabecalho).observe($('header'));
  $('#verTag').textContent = 'v' + (window.CNC_VERSAO || '?');

  /* ---------- desenhos com caixas de digitacao nas letras ---------- */
  var DESENHOS = {
    espina: {
      extra: { G: [168, 306] },           // G e calculado (C + D): caixa so de leitura
      legenda: 'Lado 1 = encaixe (B × C) · Lado 2 = cabeça (F × E) · G = C + D',
      svg: '<svg viewBox="0 0 340 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<line class="axis" x1="118" y1="170" x2="274" y2="170"/>' +
        '<rect class="piece" x="130" y="98" width="14" height="144"/>' +
        '<rect class="piece" x="144" y="90" width="62" height="160"/>' +
        '<rect class="piece" x="206" y="132" width="52" height="76"/>' +
        // linhas de extensao
        '<path class="ext" d="M130 96V66M144 88V66M206 88V66M258 130V66M144 90H80M144 250H80M130 98H104M130 242H104M258 132H290M258 208H290M130 244V284M206 252V284"/>' +
        // cotas (linha + marcas)
        '<path class="dim" d="M130 70H144M130 66V74M144 66V74M144 70H206M206 66V74M206 70H258M258 66V74"/>' +
        '<path class="dim" d="M84 90V250M80 90H88M80 250H88M108 98V242M104 98H112M104 242H112M286 132V208M282 132H290M282 208H290M130 280H206M130 276V284M206 276V284"/>' +
        // chamadas das caixas
        '<path class="lead" d="M96 29L137 69M176 57V69M250 29L232 69M80 120H84M86 270L108 240M290 239L286 209M168 293V281"/>' +
        '</svg>'
    },
    porta_matriz: {   // croqui do porta-matriz (maior que o da espina): cone (lado 1) a esquerda, face do furo Ø D (lado 2) a direita; cada cota tem a sua "pista" para as linhas nao se cruzarem
      vb: [560, 440], cls: 'pm',
      extra: {},
      legenda: 'Lado 1 = cone e rebaixo (K I M F G E) e borda L do furo C · Lado 2 = Ø E com chanfro H e furo D × B com borda L · A = comprimento final',
      svg: '<svg viewBox="0 0 560 440" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<line class="axis" x1="195" y1="215" x2="440" y2="215"/>' +
        '<polygon class="piece" points="215,135 235,119 300,119 300,99 408,99 420,111 420,319 408,331 300,331 300,311 235,311 215,295"/>' +
        '<polygon class="cav" points="215,149 225,155 265,155 265,145 408,145 420,133 420,297 408,285 265,285 265,275 225,275 215,281"/>' +
        // linhas de extensao
        '<path class="ext" d="M215 131V56M300 95V56M235 119H44M235 311H44M215 135H96M215 295H96M215 155H148M215 275H148M424 99H474M424 331H474M215 299V400M420 335V400M265 289V364M420 323V364M215 135H255"/>' +
        // cotas (linha + marcas)
        '<path class="dim" d="M215 62H300M215 58V66M300 58V66M48 119V311M44 119H52M44 311H52M100 135V295M96 135H104M96 295H104M152 155V275M148 155H156M148 275H156M470 99V331M466 99H474M466 331H474M215 395H420M215 391V399M420 391V399M265 360H420M265 356V364M420 356V364M285 145V285M281 145H289M281 285H289M245 135A30 30 0 0 0 238 117"/>' +
        // chamadas das caixas
        '<path class="lead" d="M257 40V62M345 40L303 97M433 40L416 104M192 127H224M303 175H285M387 225L415 140"/>' +
        '<text x="215" y="430" text-anchor="start">◄ lado 1 (cone)</text><text x="420" y="430" text-anchor="end">lado 2 (furo D) ►</text>' +
        '</svg>'
    }
  };  function desenhoHtml(g) {
    var d = DESENHOS[g.desenho]; if (!d) return '';
    var vb = d.vb || [340, 320], h = '<div class="full"><div class="dwg' + (d.cls ? ' ' + d.cls : '') + '">' + d.svg;
    g.campos.forEach(function (c) {
      if (!c.pos) return;
      h += '<label class="dwg-f" style="left:' + (c.pos[0] / vb[0] * 100) + '%;top:' + (c.pos[1] / vb[1] * 100) + '%" title="' + esc(c.label + ' (' + c.unit + ')') + '">' +
        '<span class="ltr">' + esc(c.letra) + '</span><input id="f_' + c.id + '" data-k="' + c.id + '" type="number" step="any" inputmode="decimal" aria-label="' + esc(c.letra + ' - ' + c.label) + '"></label>';
    });
    Object.keys(d.extra).forEach(function (k) {
      h += '<label class="dwg-f ro" style="left:' + (d.extra[k][0] / vb[0] * 100) + '%;top:' + (d.extra[k][1] / vb[1] * 100) + '%" title="Calculado"><span class="ltr">' + k + '</span><input id="dwg_' + k + '" readonly tabindex="-1" aria-label="' + k + ' (calculado)"></label>';
    });
    return h + '</div><div class="dwg-leg">' + esc(d.legenda) + '</div></div>';
  }

  /* ---------- formulario ---------- */
  function ger() { return CNC.GERADORES[state.tipo]; }

  function buildTipo() {
    var h = '';
    Object.keys(CNC.GERADORES).forEach(function (id) {
      h += '<option value="' + id + '"' + (id === state.tipo ? ' selected' : '') + '>' + esc(CNC.GERADORES[id].titulo) + '</option>';
    });
    CNC.PLANEJADOS.forEach(function (p) { h += '<option disabled>' + esc(p.titulo) + ' (em breve)</option>'; });
    $('#tipo').innerHTML = h;
  }

  /* ---------- lista de trechos (peca simples) ---------- */
  var CANTOS = [['ext', 'Canto externo (quina)'], ['int', 'Canto interno (pé do degrau)']];
  var CANTOS_FALLBACK = CANTOS;
  function trechosHtml(g, c, lista) {
    var FM = c.formas || g.formas, MX = c.max || g.max;
    var h = '<div class="tr-box" data-list="' + c.id + '"><div class="tr-title">' + esc(c.label) + esc(c.sub != null ? c.sub : ' · da face (Z0) ao fundo') + '</div>';
    lista.forEach(function (it, i) {
      var F = FM[it.tipo] || { nome: it.tipo, rot: [] }, campos = '', CT = F.cantos || CANTOS_FALLBACK;
      F.rot.forEach(function (r, q) {
        var k = ['a', 'b', 'c'][q];
        campos += '<label class="tr-f"><span>' + esc(r) + '</span><input type="number" step="any" inputmode="decimal" data-i="' + i + '" data-f="' + k + '" value="' + esc(it[k] == null ? '' : it[k]) + '" aria-label="' + esc('Trecho ' + (i + 1) + ' ' + F.nome + ' ' + r) + '"></label>';
      });
      if (F.canto) campos += '<label class="tr-f tr-canto"><span>Canto</span><select data-i="' + i + '" data-f="canto">' + CT.map(function (o) { return '<option value="' + o[0] + '"' + ((it.canto || CT[0][0]) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
      h += '<div class="tr-row"><span class="tr-n">' + (i + 1) + '</span><span class="tr-nome">' + esc(F.nome) + '</span><div class="tr-campos">' + campos + '</div>' +
        '<div class="tr-btn"><button type="button" class="btn sm" data-act="up" data-i="' + i + '" title="Subir" aria-label="Subir trecho ' + (i + 1) + '"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button type="button" class="btn sm" data-act="down" data-i="' + i + '" title="Descer" aria-label="Descer trecho ' + (i + 1) + '"' + (i < lista.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<button type="button" class="btn sm danger" data-act="del" data-i="' + i + '" title="Remover" aria-label="Remover trecho ' + (i + 1) + '">×</button></div></div>';
    });
    if (!lista.length) h += '<div class="note">Nenhum trecho. Adicione abaixo.</div>';
    h += '<div class="tr-add">' + Object.keys(FM).map(function (k) { return '<button type="button" class="btn sm" data-act="add" data-t="' + k + '"' + (lista.length >= MX ? ' disabled' : '') + '>+ ' + esc(FM[k].nome) + '</button>'; }).join('') + '</div></div>';
    return h;
  }
  function trechoNovo(t) {
    return { cil: { tipo: 'cil', a: '', b: '' }, cone: { tipo: 'cone', a: '', b: '', c: '' }, chanfro: { tipo: 'chanfro', a: 1, canto: 'ext' }, raio: { tipo: 'raio', a: 1, canto: 'ext' }, canal: { tipo: 'canal', a: '', b: '', c: '' },
      bcil: { tipo: 'bcil', a: '', b: '' }, furo: { tipo: 'furo', a: '', b: '' }, icil: { tipo: 'icil', a: '', b: '' }, icone: { tipo: 'icone', a: '', b: '', c: '' }, ichanfro: { tipo: 'ichanfro', a: 1, canto: 'boca' }, iraio: { tipo: 'iraio', a: 1, canto: 'boca' } }[t];
  }
  function bindTrechos(g, vals) {
    $$('#campos .tr-box').forEach(function (box) {
      var id = box.dataset.list, lista = vals[id];
      $$('input[data-f],select[data-f]', box).forEach(function (el) {
        el.oninput = function () { lista[+el.dataset.i][el.dataset.f] = el.value; persist(); render(); };
      });
      $$('button[data-act]', box).forEach(function (b) {
        b.onclick = function () {
          var i = +b.dataset.i, a = b.dataset.act;
          if (a === 'add') lista.push(trechoNovo(b.dataset.t));
          else if (a === 'del') lista.splice(i, 1);
          else if (a === 'up' && i > 0) { var t = lista[i]; lista[i] = lista[i - 1]; lista[i - 1] = t; }
          else if (a === 'down' && i < lista.length - 1) { var t2 = lista[i]; lista[i] = lista[i + 1]; lista[i + 1] = t2; }
          persist(); buildCampos(); render();
        };
      });
    });
  }

  // html de um campo (lista de trechos, select ou numero)
  function campoHtml(g, c, vals) {
    if (c.tipo === 'trechos') {
      if (!Array.isArray(vals[c.id])) vals[c.id] = JSON.parse(JSON.stringify(c.def));
      return '<div class="full"' + (c.quando ? ' data-quando="' + c.id + '"' : '') + '>' + trechosHtml(g, c, vals[c.id]) + '</div>';
    }
    var v = vals[c.id] != null ? vals[c.id] : c.def;
    var ctl = c.tipo === 'select'
      ? '<select id="f_' + c.id + '" data-k="' + c.id + '">' + c.opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
      : '<div class="unit"><input id="f_' + c.id + '" data-k="' + c.id + '" type="number" step="any" inputmode="decimal" value="' + esc(v) + '"><span>' + esc(c.unit) + '</span></div>';
    return '<div class="field"' + (c.quando ? ' data-quando="' + c.id + '"' : '') + '><label for="f_' + c.id + '">' + esc(c.label) + (c.hint ? INFO_BTN : '') + '</label>' + ctl +
      (c.hint ? '<div class="dica">' + esc(c.hint) + '</div>' : '') + '</div>';
  }

  /* blocos recolhidos ("avancado"): campos raramente alterados ficam escondidos atras de um botao, so com o resumo dos valores */
  var advAberto = {};
  function advKey(nome) { return state.tipo + '|' + nome; }
  // resumo na propria linha do bloco fechado: so o que foi alterado (abreviado) ou "padrão"
  var CURTO = { rFace: 'R face', rEnc: 'R ombro enc.', rPonta: 'R ponta', rOmbro: 'R ombro cab.', folga: 'Folga Ø', rFace1: 'R face 1', rFace2: 'R face enc.', folgaL: 'Folga L', avFinal: 'Av. final', raio: 'R quina' };
  function advResumo(g, f) {
    $$('#campos .adv').forEach(function (box) {
      var nome = box.dataset.adv, partes = [];
      g.campos.forEach(function (c) {
        if (c.avancado !== nome || (c.quando && !c.quando(f))) return;
        var v = f[c.id];
        if (c.tipo === 'trechos') { var n = Array.isArray(v) ? v.length : 0; partes.push(n ? '<i>' + n + (n === 1 ? ' trecho' : ' trechos') + '</i>' : 'nenhum'); return; }
        if (c.tipo === 'select') { if (String(v) !== String(c.def)) { var op = c.opcoes.filter(function (o) { return o[0] === String(v); })[0]; partes.push('<i>' + esc(op ? op[1].replace(/ \(.*$/, '') : String(v)) + '</i>'); } return; }
        if (!(Number(v) === Number(c.def))) partes.push(esc(CURTO[c.id] || c.label) + ' <i>' + (isNaN(v) ? '—' : esc(CNC.fmt(v))) + '</i>');
      });
      $('.adv-sum', box).innerHTML = partes.length ? partes.join(' · ') : 'padrão';
    });
  }  function advUi() {
    $$('#campos .adv').forEach(function (box) {
      var ab = !!advAberto[advKey(box.dataset.adv)];
      $('.adv-body', box).hidden = !ab;
      $('.adv-sum', box).hidden = ab; // aberto: os proprios campos mostram os valores
      $('.adv-head', box).setAttribute('aria-expanded', ab);
    });
  }

  function buildCampos() {
    var g = ger(), h = '', grupo = null, vals = state.vals[state.tipo] = state.vals[state.tipo] || {}, advFeitos = {};
    if (g.desenho) h += desenhoHtml(g);
    if (g.usaDesenho) h += '<div class="field full"><label for="selDesenho">Importar desenho salvo' + INFO_BTN + '</label><div class="ds-row"><select id="selDesenho"></select><button type="button" class="btn sm primary" id="dsUsar">Usar desenho</button><button type="button" class="btn sm" id="dsEditar">Editar desenho</button><button type="button" class="btn sm" id="dsNovoG">Novo</button></div><div class="dica">O perfil (externo e interno), o comprimento final e os lados vêm do desenho salvo na operação Desenho da peça. Aqui você só informa o bruto e como usinar.</div><div class="note" id="dsInfo"></div></div>';
    g.campos.forEach(function (c) {
      if (c.pos || c.doDesenho) return; // pos: vai no desenho da espina; doDesenho: vem do desenho salvo
      if (c.avancado) { // todos os campos do mesmo bloco recolhido saem juntos, no lugar do primeiro
        if (advFeitos[c.avancado]) return;
        advFeitos[c.avancado] = true;
        h += '<div class="full adv" data-adv="' + esc(c.avancado) + '"><button type="button" class="adv-head" aria-expanded="false"><span class="adv-arrow" aria-hidden="true">▸</span>' + esc(c.avancado) + '<span class="adv-sum"></span></button>' +
          '<div class="adv-body row" hidden>';
        g.campos.forEach(function (c2) { if (c2.avancado === c.avancado && !c2.pos && !c2.doDesenho) h += campoHtml(g, c2, vals); });
        h += '</div></div>';
        grupo = c.avancado;
        return;
      }
      if (c.grupo !== grupo) { h += '<div class="group-title"' + (c.quando ? ' data-quando-g="' + esc(c.grupo) + '"' : '') + '>' + esc(c.grupo) + '</div>'; grupo = c.grupo; }
      h += campoHtml(g, c, vals);
    });
    $('#campos').innerHTML = h;
    $$('#campos .adv-head').forEach(function (b) { b.onclick = function () { var k = advKey(b.closest('.adv').dataset.adv); advAberto[k] = !advAberto[k]; advUi(); }; });
    advUi();
    bindTrechos(g, vals);
    if (g.usaDesenho) {
      fillDesenhoSel();
      $('#selDesenho').onchange = function () { state.desenhoSel = this.value; persist(); infoDesenho(); render(); };
      $('#dsUsar').onclick = function () {
        state.desenhoSel = $('#selDesenho').value;
        persist(); infoDesenho(); render();
      };
      $('#dsEditar').onclick = function () { if (state.desenhoSel) CNCDesenhos.abrir(state.desenhoSel); showView('desenho'); root.CNCDrawingNavigator?.open('manual'); };
      $('#dsNovoG').onclick = function () { CNCDesenhos.novo(); showView('desenho'); root.CNCDrawingNavigator?.open('manual'); };
    }
    g.campos.forEach(function (c) { // caixas do desenho: valor inicial
      if (!c.pos) return; var el = $('#f_' + c.id); if (el) el.value = vals[c.id] != null ? vals[c.id] : c.def;
    });
    $$('#campos [data-k]').forEach(function (i) {
      i.oninput = function () { vals[i.dataset.k] = i.value; persist(); render(); };
    });
  }

  /* ---------- desenho da peca escolhido (peca simples) ---------- */
  function desenhoAtual() { return state.desenhoSel ? CNCDesenhos.obter(state.desenhoSel) : null; }
  function infoDesenho() {
    var d = desenhoAtual(), el = $('#dsInfo'); if (!el) return;
    if (!d) { el.textContent = 'Nenhum desenho: crie um em Desenho da peça.'; return; }
    var n = ['trechos1', 'trechos2', 'internos1', 'internos2'].reduce(function (s, k) { return s + (d.lados === '2' || k.slice(-1) === '1' ? d[k].length : 0); }, 0);
    el.textContent = (d.lados === '2' ? '2 lados' : '1 lado') + ' · comprimento final ' + CNC.fmt(Number(d.lPeca)) + ' mm · ' + n + (n === 1 ? ' elemento' : ' elementos') +
      (n === 0 ? ' · ⚠ desenho vazio: clique em Editar, adicione os elementos e salve' : '') +
      (d.cadOrigem ? ' · DXF: '+esc(d.cadOrigem.arquivo)+' · Z0 '+esc(d.cadOrigem.faceZ0)+(d.cadOrigem.incompleto?' · ⛔ INCOMPLETO: confirmar no editor':d.cadOrigem.verificado?' · CAD conferido':' · rascunho') : '') +
      (d.pdfOrientacao ? ' · PDF: eixo ' + esc(d.pdfOrientacao.eixoPDF) + ', face Z0 ' + esc(d.pdfOrientacao.faceZ0PDF) + (d.pdfOrientacao.editadoDepoisDaImportacao ? ' · ⚠ orientação a rever após edição' : '') : '') +
      (CNCDesenhos.sujoId() === d.id ? ' · ⚠ há alterações deste desenho ainda não salvas no editor (o Gerador usa a versão salva)' : '');
  }
  function fillDesenhoSel() {
    var s = $('#selDesenho'); if (!s) return;
    var ls = CNCDesenhos.lista();
    if (!ls.some(function (x) { return x.id === state.desenhoSel; })) state.desenhoSel = ls.length ? ls[0].id : '';
    s.innerHTML = ls.length ? ls.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === state.desenhoSel ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') : '<option value="">(nenhum desenho salvo)</option>';
    persist(); infoDesenho();
  }
  CNCDesenhos.onMudou = function (id) { if (id && CNCDesenhos.obter(id)) state.desenhoSel = id; fillDesenhoSel(); render(); };

  function vals() {
    var f = {}, v = state.vals[state.tipo] || {};
    ger().campos.forEach(function (c) {
      var x = v[c.id] === undefined ? c.def : v[c.id];
      f[c.id] = c.tipo === 'trechos' ? JSON.parse(JSON.stringify(x)) : c.tipo === 'select' ? String(x) : (x === '' ? NaN : Number(x));
    });
    f.pressao = state.pressao;   // vem das Configuracoes (nao e mais campo da peca)
    if (ger().usaDesenho) { // perfil, comprimento final e lados vem do desenho salvo
      var d = desenhoAtual();
      f.desenhoNome = d ? d.nome : ''; f.lPeca = d ? Number(d.lPeca) : NaN; f.lados = d ? d.lados : '1';
      ['trechos1', 'trechos2', 'internos1', 'internos2'].forEach(function (k) { f[k] = d ? d[k] : []; });
      ['1', '2'].forEach(function (k) { // lado so com furo/mandrilamento no desenho: 'externo e interno' vira so interno (nao pede perfil externo)
        if (f['usin' + k] === 'ambos' && !f['trechos' + k].length && f['internos' + k].length) f['usin' + k] = 'int';
      });
    }
    return f;
  }
  // campos condicionais (ex.: so aparecem com 2 lados)
  function aplicaQuando(g, f) {
    g.campos.forEach(function (c) {
      if (!c.quando) return;
      var el = $('[data-quando="' + c.id + '"]'); if (el) el.hidden = !c.quando(f);
    });
    // titulo de grupo: some quando todos os campos do grupo estao ocultos
    $$('#campos [data-quando-g]').forEach(function (t) {
      var nome = t.dataset.quandoG;
      t.hidden = !g.campos.some(function (c) { return c.grupo === nome && !c.avancado && !c.doDesenho && (!c.quando || c.quando(f)); });
    });
  }

  /* meia secao da peca (a partir da cena do simulador): face a direita (como no simulador), eixo embaixo (pecaview.js) */
  function previewSvg(cena) { return PecaView.previewSvg(cena, 420, 190, null, 'pv'); }

  function toolSel() {
    var m = state.toolByTipo[state.tipo];
    if (!m || typeof m !== 'object') m = state.toolByTipo[state.tipo] = {};
    return m;
  }
  function renderToolSelects() {
    var g = ger(), sel = toolSel(), h = '';
    g.ferramentas.forEach(function (slot) {
      var list = tools.filter(function (t) { return slot.tipos.indexOf(t.tipo) >= 0; });
      var cur = sel[slot.id];
      if (!list.some(function (t) { return t.id === cur; })) cur = list.length ? list[0].id : '';
      sel[slot.id] = cur;
      h += '<div class="toolblock" data-slot="' + slot.id + '"><label for="ferr_' + slot.id + '">' + esc(slot.papel) + '</label><select id="ferr_' + slot.id + '" data-slot="' + slot.id + '">' +
        (list.length ? list.map(function (t) { return '<option value="' + t.id + '"' + (t.id === cur ? ' selected' : '') + '>T' + CNC.tcode(t.t) + ' · ' + esc(t.nome) + '</option>'; }).join('')
          : '<option value="">Nenhuma ferramenta compatível cadastrada</option>') +
        '</select><div class="toolline" id="info_' + slot.id + '"></div></div>';
    });
    $('#ferrBox').innerHTML = h;
    $$('#ferrBox select').forEach(function (s) {
      s.onchange = function () { sel[s.dataset.slot] = s.value; persist(); buildInc(); render(); };
    });
    buildInc();
  }
  function toolById(id) { return tools.filter(function (t) { return t.id === id; })[0] || null; }

  /* incrementos: padrao da ferramenta, alteravel so nesta programacao */
  var INC = [
    { k: 'incFace', t: 'Faceamento · desbaste', h: 'incremento: profundidade por passe em Z' },
    { k: 'incTorn', t: 'Cilindragem · desbaste', h: 'incremento: profundidade por passe no raio' },
    { k: 'acabFace', t: 'Faceamento · acabamento', h: 'sobremetal deixado em Z para o acabamento (0 = sem acabamento)' },
    { k: 'acabTorn', t: 'Cilindragem · acabamento', h: 'sobremetal deixado no Ø para o acabamento (0 = sem acabamento)' }
  ];
  function overrides() { return state.over[state.tipo] || {}; }
  function ovValido(v) { return v !== undefined && v !== '' && isFinite(Number(v)); }
  var incAberto = false;
  // resumo recolhido: padrao da ferramenta (ou valor alterado) dos 4 incrementos
  function incResumo() {
    var base = toolById(toolSel().t1), ov = overrides();
    if (!base) { $('#incResumo').innerHTML = '<span class="note">Selecione a ferramenta de faceamento/torneamento para ver os incrementos.</span>'; return; }
    $('#incResumo').innerHTML = INC.map(function (c) {
      var alt = ovValido(ov[c.k]), val = alt ? Number(ov[c.k]) : Number(base[c.k]) || 0;
      return '<span class="chip' + (alt ? ' ovr' : '') + '">' + esc(c.t) + ': <b>' + esc(CNC.fmt(val)) + '</b>' + (alt ? ' (alterado)' : '') + '</span>';
    }).join('');
  }
  function incUi() {
    $('#incBox').hidden = !incAberto;
    $('#incEdit').textContent = incAberto ? 'Fechar edição' : 'Editar incrementos';
    $('#incEdit').setAttribute('aria-expanded', incAberto);
    $('#incReset').hidden = !INC.some(function (c) { return ovValido(overrides()[c.k]); });
    incResumo();
  }
  $('#incEdit').onclick = function () { incAberto = !incAberto; incUi(); };
  function buildInc() {
    var base = toolById(toolSel().t1), ov = overrides(), h = '';
    INC.forEach(function (c) {
      var std = base ? Number(base[c.k]) || 0 : 0;
      h += '<div class="field inc-f"><label for="inc_' + c.k + '">' + esc(c.t) + '</label>' +
        '<div class="unit"><input id="inc_' + c.k + '" data-k="' + c.k + '" type="number" step="any" min="0" inputmode="decimal" placeholder="' + esc(CNC.fmt(std)) + '" value="' + esc(ovValido(ov[c.k]) ? ov[c.k] : '') + '"' + (base ? '' : ' disabled') + '><span>mm</span></div>' +
        '<div class="std">Padrão da ferramenta: <b>' + esc(CNC.fmt(std)) + '</b> · ' + esc(c.h) + '</div></div>';
    });
    $('#incBox').innerHTML = h;
    $$('#incBox input').forEach(function (i) {
      i.classList.toggle('ovr', ovValido(i.value));
      i.oninput = function () {
        var o = state.over[state.tipo] = state.over[state.tipo] || {};
        if (ovValido(i.value)) o[i.dataset.k] = i.value; else delete o[i.dataset.k];
        i.classList.toggle('ovr', ovValido(i.value));
        persist(); incNota(); render();
      };
    });
    incNota();
  }
  function incNota() {
    var n = INC.filter(function (c) { return ovValido(overrides()[c.k]); }).length;
    $('#incNota').textContent = n ? n + (n === 1 ? ' valor alterado' : ' valores alterados') + ' só nesta programação (o banco não muda).' : 'Usando o padrão cadastrado na ferramenta (aba Ferramentas).';
    incUi();
  }
  $('#incReset').onclick = function () { delete state.over[state.tipo]; persist(); buildInc(); render(); };

  // ferramentas efetivas: banco + incrementos alterados na programacao
  function currentTools() {
    var sel = toolSel(), o = {}, ov = overrides();
    ger().ferramentas.forEach(function (s) {
      var t = toolById(sel[s.id]);
      if (t && s.id === 't1') {
        t = Object.assign({}, t);
        INC.forEach(function (c) { if (ovValido(ov[c.k])) t[c.k] = Number(ov[c.k]); });
      }
      o[s.id] = t;
    });
    return o;
  }

  // uma linha so: o que o operador confere no comando (o resto vem do banco e fica no texto ao passar o mouse)
  function toolInfoHtml(tool, slot) {
    if (!tool) return 'Cadastre uma ferramenta compatível na aba Ferramentas.';
    var T = 'T' + CNC.tcode(tool.t), fm = CNC.fmt, partes;
    if (slot.id === 't6' || slot.id === 't7') partes = ['<b>' + T + '</b>', 'RPM fixo ' + fm(tool.rpm) + ' (máx. 5000/passo)'];
    else if (slot.id === 't3') partes = ['<b>' + T + '</b>', (tool.modo === 'G97' ? 'RPM fixo ' : 'RPM máx. ') + fm(tool.rpm), 'F ' + fm(tool.avDesb), 'bicada ' + fm(tool.incTorn), tool.diametro ? 'Ø' + fm(tool.diametro) : ''];
    else {
      partes = ['<b>' + T + '</b>', 'Vc ' + fm(tool.vc), 'máx. ' + fm(tool.rpm) + ' rpm', 'F ' + fm(tool.avDesb) + (slot.id === 't2' || slot.id === 't5' ? ' · camada ' + fm(tool.incCanal) : slot.id === 't4' ? '' : '/' + fm(tool.avAcab))];
      if ((slot.id === 't2' || slot.id === 't5') && tool.largura) partes.push('canal ' + fm(tool.largura));
    }
    partes.push('M' + tool.sentido);
    var det = ['Pastilha: ' + (tool.pastilha || '—')];
    if (slot.id !== 't3' && slot.id !== 't6' && slot.id !== 't7') det.push('Raio de ponta: ' + (tool.raio === '' || tool.raio == null ? 'ponta viva' : fm(tool.raio)), 'Ângulo: ' + (tool.angulo ? fm(tool.angulo) : '80') + '°', tool.apSuporte ? 'Suporte κ' + fm(tool.apSuporte) + '°' : 'Suporte: aresta de trás reta', 'Av. acabamento: ' + fm(tool.avAcab));
    return '<span title="' + esc(det.join(' · ')) + '">' + partes.filter(Boolean).join(' · ') + '</span>';
  }
  /* ---------- maquina / placa ---------- */
  function buildMaq() {
    $$('#maqCard input[data-m]').forEach(function (i) {
      i.value = state.maq[i.dataset.m];
      i.oninput = function () { var v = Number(i.value); if (isFinite(v) && i.value !== '') { state.maq[i.dataset.m] = v; persist(); render(); } };
    });
  }
  $('#m_reset').onclick = function () { state.maq = Object.assign({}, CNC.DEFAULT_MAQ); persist(); buildMaq(); render(); };

  /* ---------- configuracoes (autor, data, pressao da placa, dicas) ---------- */
  function aplicaDicas() { document.body.classList.toggle('dicas', !!state.dicas); }
  function buildCfg() {
    $('#autor').value = state.autor; $('#data').value = state.dataManual; $('#pressao').value = state.pressao; $('#cfgDicas').checked = state.dicas;
    $('#dataDica').textContent = 'Vazio = automática (hoje: ' + CNC.mesAno() + '). Vai no cabeçalho do programa.';
    $('#verTxt').textContent = window.CNC_VERSAO || '?';
    buildMaq();
  }
  $('#autor').oninput = function () { state.autor = this.value.trim() ? this.value : 'FERRAMENTARIA'; persist(); };
  $('#data').oninput = function () { state.dataManual = this.value; persist(); };
  $('#pressao').onchange = function () { state.pressao = this.value; persist(); };
  $('#cfgDicas').onchange = function () { state.dicas = this.checked; persist(); aplicaDicas(); };
  aplicaDicas();
  /* ---------- metadados ---------- */
  $('#tipo').onchange = function () { state.tipo = this.value; state.nome = ''; state.lado = 0; persist(); buildCampos(); renderToolSelects(); render(); };
  $('#nome').oninput = function () { state.nome = this.value; persist(); render(); };
  $('#nomeManual').onchange = function () { state.nomeManual = this.checked; persist(); render(); };

  function renderLadoSel(r) {
    var box = $('#ladoSel');
    if (!r.lados) { box.hidden = true; box.innerHTML = ''; return; }
    if (state.lado >= r.lados.length) state.lado = 0;
    box.hidden = false;
    box.innerHTML = r.lados.map(function (l, i) {
      return '<button type="button" role="tab" data-i="' + i + '" aria-selected="' + (i === state.lado) + '">' + esc(l.titulo) + '<small>' + esc(l.nome) + '</small></button>';
    }).join('');
    $$('#ladoSel button').forEach(function (b) { b.onclick = function () { state.lado = +b.dataset.i; persist(); render(); }; });
  }

  /* ---------- render principal ---------- */
  function render() {
    var g = ger(), f = vals(), tl = currentTools();
    $('#nomeManual').checked = !!state.nomeManual;
    var nomeInput = $('#nome');
    nomeInput.readOnly = !state.nomeManual;
    if (!state.nomeManual) { nomeInput.value = g.nomeAuto(f); state.nome = nomeInput.value; }
    else if (document.activeElement !== nomeInput) nomeInput.value = state.nome || g.nomeAuto(f);

    aplicaQuando(g, f);
    advResumo(g, f);
    if (g.placeholders) { var ph = g.placeholders(f); Object.keys(ph).forEach(function (k) { var el = $('#f_' + k); if (el) el.placeholder = ph[k]; }); }
    if (g.desenhoDerivados) { var dd = g.desenhoDerivados(f); Object.keys(dd).forEach(function (k) { var el = $('#dwg_' + k); if (el) el.value = dd[k]; }); }
    g.ferramentas.forEach(function (slot) {
      var el = $('#info_' + slot.id); if (el) el.innerHTML = toolInfoHtml(tl[slot.id], slot);
      var bl = $('.toolblock[data-slot="' + slot.id + '"]'); if (bl) bl.hidden = !!(slot.usado && !slot.usado(f)); // so as ferramentas que o processo usa
    });

    var draftCAD=g.usaDesenho&&desenhoAtual()&&desenhoAtual().cadOrigem&&desenhoAtual().cadOrigem.incompleto;
    var r = draftCAD ? { erros: ['Desenho DXF é um RASCUNHO INCOMPLETO: abra Desenho da peça, corrija raios, roscas, furos e trechos omitidos e clique em Confirmar revisão completa do CAD antes de gerar código.'], avisos: [] }
      : g.usaDesenho && !desenhoAtual() ? { erros: ['Escolha um desenho da peça (ou crie um na operação Desenho da peça).'], avisos: [] }
      : g.gerar(f, tl, { nome: state.nome, autor: state.autor, data: dataEfetiva(), maq: state.maq });
    lastResult = r;
    renderLadoSel(r);
    var cur = r.lados ? r.lados[state.lado] : r;
    lastCur = cur;

    $('#msgs').innerHTML = (r.erros || []).map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join('') +
      (r.avisos || []).map(function (m) { return '<div class="msg warn">' + esc(m) + '</div>'; }).join('');

    var ok = !(r.erros && r.erros.length);
    $('#copiar').disabled = !ok; $('#baixar').disabled = !ok;
    $('#baixar2').hidden = !(ok && r.lados); $('#baixar2').disabled = !ok;
    $('#baixar').textContent = r.lados && ok ? 'Baixar este lado (.txt)' : 'Baixar .txt';
    $('#codigo').textContent = ok ? cur.code : 'Corrija os itens em vermelho para gerar o programa.';
    $('#out-est').innerHTML = ok ? cur.estrategia.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') : '<p class="note">Sem estratégia: há erros nas medidas.</p>';
    $('#tbDic').innerHTML = ok ? '<tr><th>Variável</th><th>Tipo</th><th>Valor</th><th>Descrição</th><th>O que altera</th></tr>' +
      cur.dicionario.map(function (d) {
        return '<tr><td class="mono">' + esc(d.variavel) + '</td><td>' + esc(d.tipo) + '</td><td class="mono">' + esc(d.valor) + '</td><td>' + esc(d.descricao) + '</td><td>' + esc(d.efeito) + '</td></tr>';
      }).join('') : '';
    SimView.setResult(ok ? cur : null);
    var pv = $('#preview');
    if (pv) {
      pv.hidden = !((g.formas || g.preview) && ok);
      if ((g.formas || g.preview) && ok) {
        var tabs = r.lados ? '<div class="pv-tabs" role="tablist" aria-label="Lado mostrado no gráfico">' + r.lados.map(function (l, i) {
          return '<button type="button" role="tab" data-i="' + i + '" aria-selected="' + (i === state.lado) + '">' + esc(l.titulo) + '</button>';
        }).join('') + '</div>' : '';
        var leg = 'Meia seção' + (r.lados ? ' · ' + esc(cur.titulo) : '') + ' da peça acabada (tracejado = bloco bruto' + (r.lados && state.lado > 0 ? ' já com o lado 1 feito' : '') + ')';
        pv.innerHTML = '<div class="pv-head"><div class="pv-leg">' + leg + '</div>' + tabs + '</div>' + previewSvg(cur.cena);
        $$('#preview .pv-tabs button').forEach(function (b) { b.onclick = function () { state.lado = +b.dataset.i; persist(); render(); }; });
      }
    }
  }

  $('#copiar').onclick = function () {
    if (!lastCur || !lastCur.code) return;
    var done = function (ok) { $('#copiado').textContent = ok ? 'Copiado.' : 'Não foi possível copiar; selecione o texto manualmente.'; setTimeout(function () { $('#copiado').textContent = ''; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastCur.code).then(function () { done(true); }, function () { done(false); });
    else { var ta = document.createElement('textarea'); ta.value = lastCur.code; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { } ta.remove(); done(ok); }
  };
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function baixar(res) { download(res.nome, res.code.replace(/\n/g, '\r\n') + '\r\n'); } // CRLF como nos programas da casa
  $('#baixar').onclick = function () { if (lastCur && lastCur.code) baixar(lastCur); };
  $('#baixar2').onclick = function () {
    if (!lastResult || !lastResult.lados) return;
    lastResult.lados.forEach(function (l, i) { setTimeout(function () { baixar(l); }, i * 400); });
  };

  /* ---------- banco de ferramentas (aba) ---------- */
  var TIPOS = { externa: 'Externa', faceamento: 'Faceamento', interna: 'Interna', encaixe: 'Encaixe/canal', furacao: 'Furação', rosca: 'Rosca', outra: 'Outra' };
  function renderTools() {
    var rows = tools.slice().sort(function (a, b) { return CNC.tcode(a.t).localeCompare(CNC.tcode(b.t)) || a.nome.localeCompare(b.nome); });
    $('#tbFerr').innerHTML = rows.length ? '<tr><th>T</th><th>Nome</th><th>Tipo</th><th>Pastilha</th><th>Vc · RPM</th><th>Avanço</th><th>Incrementos (desbaste / acabamento)</th><th>Giro</th><th></th></tr>' +
      rows.map(function (t) {
        var pas = (t.pastilha || '—') + (t.raio !== '' && t.raio != null ? ' · r' + CNC.fmt(t.raio) : '') + (t.tipo === 'encaixe' && t.largura ? ' · canal ' + CNC.fmt(t.largura) : (t.angulo ? ' · ' + CNC.fmt(t.angulo) + '°' : '')) + (t.apSuporte ? ' · κ' + CNC.fmt(t.apSuporte) + '°' : '');
        var inc = t.tipo === 'encaixe' ? 'camada ' + CNC.fmt(t.incCanal)
          : '<div>Faceamento: <b>' + CNC.fmt(t.incFace || 0) + '</b> / acab. <b>' + CNC.fmt(t.acabFace || 0) + '</b></div><div>Cilindragem: <b>' + CNC.fmt(t.incTorn || 0) + '</b> / acab. <b>' + CNC.fmt(t.acabTorn || 0) + '</b></div>';
        return '<tr><td class="mono">' + CNC.tcode(t.t) + '</td><td>' + esc(t.nome) + (t.obs ? '<div class="note">' + esc(t.obs) + '</div>' : '') + '</td><td>' + esc(TIPOS[t.tipo] || t.tipo) + '</td>' +
          '<td>' + esc(pas) + '</td>' +
          '<td>' + (t.modo === 'G97' ? 'fixo ' + CNC.fmt(t.rpm) : CNC.fmt(t.vc) + ' · ' + CNC.fmt(t.rpm)) + '</td>' +
          '<td>' + CNC.fmt(t.avDesb) + (Number(t.avAcab) ? ' / ' + CNC.fmt(t.avAcab) : '') + '</td>' +
          '<td>' + inc + '</td><td>M' + t.sentido + '</td>' +
          '<td style="white-space:nowrap"><button class="btn sm" data-a="ed" data-id="' + t.id + '">Editar</button> <button class="btn sm" data-a="dup" data-id="' + t.id + '">Duplicar</button> <button class="btn sm danger" data-a="del" data-id="' + t.id + '">Excluir</button></td></tr>';
      }).join('') : '<tr><td class="empty">Nenhuma ferramenta cadastrada.</td></tr>';
    $$('#tbFerr button').forEach(function (b) {
      b.onclick = function () {
        var t = toolById(b.dataset.id);
        if (!t) return;
        if (b.dataset.a === 'ed') openDlg(t);
        if (b.dataset.a === 'dup') { var c = JSON.parse(JSON.stringify(t)); c.id = uid(); delete c.seedKey; c.nome += ' (COPIA)'; tools.push(c); save(K_TOOLS, tools); renderTools(); }
        if (b.dataset.a === 'del' && confirm('Excluir a ferramenta T' + CNC.tcode(t.t) + ' - ' + t.nome + '?')) {
          tools = tools.filter(function (x) { return x.id !== t.id; }); save(K_TOOLS, tools); renderTools();
        }
      };
    });
  }

  var dlg = $('#dlgFerr'), frm = $('#frmFerr'), editingId = null;
  // desenhos esquematicos (meia vista: peca em cinza, ferramenta em linha) de cada tipo
  var TIPOS_DEF = [
    { id: 'externa', nome: 'Externa', sub: 'desbaste / torneamento', svg: '<rect class="wk" x="4" y="30" width="56" height="10"/><path d="M60 5 H34 L21 25 L26 29 L39 15 H60 Z"/>' },
    { id: 'faceamento', nome: 'Faceamento', sub: 'de frente', svg: '<rect class="wk" x="4" y="4" width="16" height="36"/><path d="M60 12 V28 H38 L22 24 V20 L38 12 Z"/>' },
    { id: 'interna', nome: 'Interna', sub: 'mandrilar / barra', svg: '<rect class="wk" x="4" y="4" width="56" height="10"/><rect class="wk" x="4" y="32" width="56" height="8"/><path d="M62 22 H36 L29 15 L25 18 L32 28 H62 Z"/>' },
    { id: 'encaixe', nome: 'Encaixe / canal', sub: 'canal frontal ou radial', svg: '<path class="wk" d="M4 26 H26 V35 H38 V26 H60 V40 H4 Z"/><rect x="28" y="4" width="8" height="31"/>' },
    { id: 'furacao', nome: 'Furação', sub: 'broca no eixo', svg: '<rect class="wk" x="4" y="6" width="26" height="32"/><path d="M62 16 H36 L22 22 L36 28 H62 Z"/>' },
    { id: 'rosca', lado: 'externa', nome: 'Rosca externa', sub: 'porta-pastilha de roscar externo: inserto triangular apontado para o perfil externo', svg: '<path class="wk" d="M3 34H61V43H3Z"/><path d="M36 3H60V22H48L40 29H27V23H36Z"/><path d="M37 3V21L28 28"/><polygon class="tip" points="26,22 39,22 32,34"/><circle class="tip-hole" cx="32.3" cy="25.9" r="2"/><path d="M8 34v-6m7 6v-6m7 6v-6" stroke-dasharray="2 2"/>' },
    { id: 'rosca', lado: 'interna', nome: 'Rosca interna', sub: 'barra de roscar interna com haste longa, pescoço reduzido e pastilha triangular na ponta', svg: '<path class="wk" d="M22 9H61V33H22Z"/><path d="M61 12H25Q20 12 17 16L12 20L17 25Q20 29 25 29H61"/><path d="M24 17H61M24 25H61"/><path stroke-dasharray="4 3" d="M19 21H61"/><polygon class="tip" points="5,21 14,16 15,27"/><circle class="tip-hole" cx="10.5" cy="21.3" r="1.8"/>' },
    { id: 'outra', nome: 'Outra', sub: 'qualquer outra', svg: '<circle cx="32" cy="22" r="15"/><path d="M27 18 C27 11 38 11 38 18 C38 23 32 23 32 28"/><path d="M32 33 V34"/>' }
  ];
  function buildTipoGrid() {
    $('#tipoGrid').innerHTML = TIPOS_DEF.map(function (d) {
      return '<button type="button" class="tipo-card" role="radio" aria-checked="false" data-tipo="' + d.id + '" data-rosca-lado="' + (d.lado || '') + '" title="' + esc(d.sub) + '"><svg viewBox="0 0 64 44" aria-hidden="true">' + d.svg + '</svg><span>' + esc(d.nome) + '</span></button>';
    }).join('');
    $$('#tipoGrid .tipo-card').forEach(function (b) {
      b.onclick = function () {
        var antes = frm.elements.tipo.value;
        frm.elements.tipo.value = b.dataset.tipo;
        frm.elements.roscaLado.value = b.dataset.tipo === 'rosca' ? b.dataset.roscaLado : '';
        if (!editingId && antes !== b.dataset.tipo) { // ferramenta nova: broca = RPM fixo e M3; os demais tipos = Vc constante e M4
          if (b.dataset.tipo === 'furacao') { frm.elements.modo.value = 'G97'; frm.elements.sentido.value = '3'; }
          else if (b.dataset.tipo === 'rosca') { frm.elements.modo.value = 'G97'; frm.elements.sentido.value = '4'; }
          else if (antes === 'furacao' || antes === 'rosca') { frm.elements.modo.value = 'G96'; frm.elements.sentido.value = '4'; }
        }
        syncTipo();
      };
    });
  }
  // mostra so os campos que fazem sentido para o tipo escolhido (ex.: Ø da broca so em furacao)
  function syncTipo() {
    var tp = frm.elements.tipo.value || 'externa', cap = tp.charAt(0).toUpperCase() + tp.slice(1);
    $('#tipoGrid .tipo-card').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.tipo === tp && (tp !== 'rosca' || b.dataset.roscaLado === (frm.elements.roscaLado.value || 'externa'))));
    });
    $$('[data-tipos]', frm).forEach(function (el) { el.hidden = el.dataset.tipos.split(' ').indexOf(tp) < 0; });
    $$('label[data-lbl-padrao]', frm).forEach(function (l) { l.textContent = l.dataset['lbl' + cap] || l.dataset.lblPadrao; });
  }
  buildTipoGrid();
  var NUMS = ['raio', 'angulo', 'apSuporte', 'largura', 'diametro', 'vc', 'rpm', 'avDesb', 'avAcab', 'incFace', 'incTorn', 'incCanal', 'acabFace', 'acabTorn'];
  function openDlg(t) {
    editingId = t ? t.id : null;
    $('#dlgTitulo').textContent = t ? 'Editar ferramenta' : 'Nova ferramenta';
    var d = t || { tipo: 'externa', modo: 'G96', sentido: 4 };
    Array.prototype.forEach.call(frm.elements, function (el) {
      if (!el.name) return;
      el.value = d[el.name] == null ? '' : d[el.name];
    });
    if (frm.elements.tipo.value === 'rosca' && !frm.elements.roscaLado.value) frm.elements.roscaLado.value = 'externa';
    syncTipo();
    dlg.showModal();
  }
  $('#ferrNova').onclick = function () { openDlg(null); };
  $('#dlgFerrCancel').onclick = function () { dlg.close(); };
  frm.onsubmit = function (e) {
    e.preventDefault();
    if (!frm.reportValidity()) return;
    var old = editingId ? toolById(editingId) : null;
    var o = { id: editingId || uid() };
    if (old && old.seedKey) o.seedKey = old.seedKey;
    Array.prototype.forEach.call(frm.elements, function (el) {
      if (!el.name) return;
      o[el.name] = NUMS.indexOf(el.name) >= 0 ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
    });
    o.nome = CNC.ascii(o.nome); o.t = CNC.tcode(o.t); o.sentido = Number(o.sentido);
    var i = tools.map(function (x) { return x.id; }).indexOf(o.id);
    if (i >= 0) tools[i] = o; else tools.push(o);
    save(K_TOOLS, tools); dlg.close(); renderTools();
  };

  $('#ferrExp').onclick = function () {
    download('banco-ferramentas.json', JSON.stringify({ versao: 3, ferramentas: tools }, null, 2), 'application/json');
  };
  $('#ferrImp').onclick = function () { $('#ferrFile').click(); };
  $('#ferrFile').onchange = function () {
    var file = this.files[0]; this.value = '';
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result);
        var arr = Array.isArray(j) ? j : j.ferramentas;
        if (!Array.isArray(arr)) throw new Error('formato');
        arr = arr.filter(function (t) { return t && t.nome && t.t; });
        if (!arr.length) throw new Error('vazio');
        if (!confirm('Importar ' + arr.length + ' ferramenta(s)? As de mesmo ID serão substituídas; as demais, adicionadas.')) return;
        arr.forEach(function (t) {
          t.id = t.id || uid();
          var i = tools.map(function (x) { return x.id; }).indexOf(t.id);
          if (i >= 0) tools[i] = t; else tools.push(t);
        });
        save(K_TOOLS, tools); renderTools();
      } catch (e) { alert('Arquivo inválido. Use um .json exportado por esta tela.'); }
    };
    rd.readAsText(file);
  };

  /* ---------- inicio ---------- */
  SimView.init();
  ProgView.init({ tools: function () { return tools; }, maq: function () { return state.maq; } });
  $('main').classList.add('fixo');
  buildTipo(); buildCampos(); buildMaq(); renderToolSelects(); render();
})();
