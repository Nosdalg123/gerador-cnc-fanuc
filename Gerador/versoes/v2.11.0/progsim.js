/* Leitor de programa Fanuc (torno) para o modulo Simulacao - sem dependencia de DOM.
   Recebe o texto de um programa ja pronto (macros #var, IF/GOTO, WHILE, subprogramas, G0-G3, G28, G40-G42, G50, G70-G76, G83, G96/G97, T, M)
   e devolve o percurso da ferramenta no mesmo formato que os geradores entregam ao simulador (sim.js), mais a lista de ferramentas
   usadas, avisos/erros por linha e sugestoes de bruto. Coordenadas: X = diametro, Z = eixo (como no programa).
   Os ciclos seguem os mesmos criterios dos geradores (core.js), para que um programa gerado e depois colado aqui simule igual. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./sim.js'));
  else root.CNCProg = factory(root.CNC, root.CNCSim);
})(typeof self !== 'undefined' ? self : this, function (CNC, Sim) {
  'use strict';
  var DEG = Math.PI / 180, MAX_BLOCOS = 400000, MAX_MOV = 150000;

  function tcode(v) { return String(Math.round(Math.abs(Number(v) || 0))).padStart(4, '0').slice(-4); }
  function ErroLeitura(msg) { this.msg = msg; }

  /* ---------- visor decodificado ---------- */
  // numero como aparece no visor: sem zeros a mais e sem notacao cientifica
  function numTxt(v) {
    var r = Math.round(v * 10000) / 10000;
    return r === 0 ? '0' : r.toFixed(4).replace(/\.?0+$/, '');
  }
  // palavra do bloco no visor: numero escrito direto fica igual; variavel ou expressao vira [valor]
  function decPalavra(l, src, v) {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(src)) return l + src;
    return l + '[' + (l === 'T' ? tcode(v) : numTxt(v)) + ']';
  }

  /* ---------- limpeza das linhas ---------- */
  // tira comentarios "( ... )" e ";", espacos e minusculas; guarda o texto do comentario
  function limpa(ln) {
    var com = [], s = '', depth = 0, cur = '', k, c;
    for (k = 0; k < ln.length; k++) {
      c = ln.charAt(k);
      if (c === '(') { if (depth === 0) cur = ''; else cur += c; depth++; }
      else if (c === ')') { if (depth > 0) { depth--; if (depth === 0) com.push(cur); else cur += c; } }
      else if (depth > 0) cur += c;
      else if (c === ';') break;
      else s += c;
    }
    if (depth > 0) com.push(cur);
    s = s.replace(/\s+/g, '').toUpperCase();
    if (s.charAt(0) === '/') s = s.slice(1);
    return { s: s, com: com.join(' ').replace(/\s+/g, ' ').trim() };
  }
  function prepara(texto) {
    var txt = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n'), raw = txt.split('\n');
    var blocos = raw.map(function (ln, i) {
      var L = limpa(ln), s = L.s, b = { i: i, s: s, com: L.com, n: null, rest: s, kind: 'normal', o: null };
      if (s === '') { b.kind = 'vazio'; return b; }
      if (s.charAt(0) === '%' || s.charAt(0) === '<') { b.kind = 'vazio'; return b; }
      var mo = /^O(\d+)$/.exec(s);
      if (mo) { b.kind = 'o'; b.o = parseInt(mo[1], 10); return b; }
      var mn = /^N(\d+)(.*)$/.exec(s);
      if (mn) { b.n = parseInt(mn[1], 10); b.rest = mn[2]; }
      var r = b.rest;
      if (r === '') b.kind = 'vazio';
      else if (r.indexOf('IF[') === 0) b.kind = 'if';
      else if (r.indexOf('GOTO') === 0) b.kind = 'goto';
      else if (r.indexOf('WHILE[') === 0) b.kind = 'while';
      else if (/^END\d+$/.test(r)) b.kind = 'end';
      else if (r.charAt(0) === '#') b.kind = 'atrib';
      return b;
    });
    return { blocos: blocos, texto: txt, linhas: raw };
  }

  /* ---------- geometria auxiliar ---------- */
  // pontos de um arco no plano (z, r), do p0 ao p1, centro (cz, cr); ccw = G3
  function arcoPontos(p0, p1, cz, cr, ccw) {
    var R = Math.hypot(p0[0] - cz, p0[1] - cr), a0 = Math.atan2(p0[1] - cr, p0[0] - cz), a1 = Math.atan2(p1[1] - cr, p1[0] - cz), da = a1 - a0, pts = [], k;
    if (ccw) { while (da <= 1e-12) da += 2 * Math.PI; } else { while (da >= -1e-12) da -= 2 * Math.PI; }
    var n = Math.max(6, Math.min(90, Math.ceil(Math.abs(da) / (5 * DEG))));
    for (k = 1; k <= n; k++) { var a = a0 + da * k / n; pts.push([cz + R * Math.cos(a), cr + R * Math.sin(a)]); }
    pts[pts.length - 1] = [p1[0], p1[1]];
    return pts;
  }
  // centro do arco a partir de R (R < 0 = arco maior que 180 graus)
  function centroPorR(p0, p1, R, ccw) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1], d = Math.hypot(dx, dy);
    if (d < 1e-9) return null;
    var Ra = Math.abs(R), h = Math.sqrt(Math.max(0, Ra * Ra - d * d / 4)), s = (ccw ? 1 : -1) * (R < 0 ? -1 : 1);
    return [mx + s * (-dy / d) * h, my + s * (dx / d) * h, Ra * Ra < d * d / 4 - 1e-6];
  }
  function sinal(v) { return v < 0 ? -1 : 1; }

  /* ---------- interpretador ---------- */
  function interpretar(texto, opt) {
    opt = opt || {};
    var maq = opt.maq || {};
    var xHome = maq.xHome != null ? Number(maq.xHome) : (Number(maq.xMax) || 400);
    var zHome = maq.zHome != null ? Number(maq.zHome) : (Number(maq.zMax) || 300);
    var prep = prepara(texto), B = prep.blocos, NB = B.length;
    var V = {}, varCom = {}, avisos = [], dicas = [], erros = [], visto = {}, moves = [], ferr = {}, ordem = [], g1900 = null;
    var fim = false, truncado = false, executou = false, pilha = [], passos = 0;

    // cod = codigo do catalogo de diagnosticos (diagnostico.js); mensagens antigas sem cod sao classificadas la pelo texto
    function aviso(i, t, chave, cod) {
      var k = chave || (i + ':' + t);
      if (visto[k]) return; visto[k] = 1;
      if (avisos.length < 80) avisos.push({ linha: i, texto: t, cod: cod });
    }
    function dica(i, t, chave, cod) { // observacao sem risco imediato (nao conta como aviso)
      var k = chave || (i + ':' + t);
      if (visto[k]) return; visto[k] = 1;
      if (dicas.length < 40) dicas.push({ linha: i, texto: t, cod: cod });
    }
    function erro(i, t, cod) { if (erros.length < 60) erros.push({ linha: i, texto: t, cod: cod }); }
    function falha(msg) { throw new ErroLeitura(msg); }

    /* ----- expressoes ----- */
    var R = null;
    function ch() { return R.s.charAt(R.p); }
    function inicio(str) { return R.s.substr(R.p, str.length) === str; }
    function lerVar(n) {
      if (n === 0) return 0;
      if (V[n] === undefined) {
        if (n >= 3000) return 0;
        aviso(R.linha, 'Variável #' + n + ' usada antes de receber valor (tratada como 0).', 'var' + n);
        return 0;
      }
      return V[n];
    }
    function indice() { // logo depois do '#'
      var c = ch();
      if (c === '[') { R.p++; var v = expr(); if (ch() === ']') R.p++; else falha('falta fechar ]'); return Math.round(v); }
      if (c === '#') { R.p++; return Math.round(lerVar(indice())); }
      var m = /^\d+/.exec(R.s.substr(R.p));
      if (!m) falha('número da variável (#) inválido');
      R.p += m[0].length; return parseInt(m[0], 10);
    }
    function funcao() {
      var m = /^(SIN|COS|TAN|ASIN|ACOS|ATAN|SQRT|ABS|BIN|BCD|ROUND|FIX|FUP|LN|EXP|POW|ADP)/.exec(R.s.substr(R.p));
      if (!m) falha('expressão não reconhecida perto de "' + R.s.substr(R.p, 8) + '"');
      var nome = m[1], a, b;
      R.p += nome.length;
      if (ch() !== '[') falha('falta [ depois de ' + nome);
      R.p++; a = expr(); if (ch() !== ']') falha('falta ] depois de ' + nome); R.p++;
      switch (nome) {
        case 'SIN': return Math.sin(a * DEG);
        case 'COS': return Math.cos(a * DEG);
        case 'TAN': return Math.tan(a * DEG);
        case 'ASIN': return Math.asin(a) / DEG;
        case 'ACOS': return Math.acos(a) / DEG;
        case 'ATAN':
          if (ch() === '/' && R.s.charAt(R.p + 1) === '[') { R.p += 2; b = expr(); if (ch() === ']') R.p++; return Math.atan2(a, b) / DEG; }
          return Math.atan(a) / DEG;
        case 'SQRT': if (a < 0) falha('raiz quadrada de número negativo'); return Math.sqrt(a);
        case 'ABS': return Math.abs(a);
        case 'ROUND': return sinal(a) * Math.round(Math.abs(a));
        case 'FIX': return Math.floor(a);
        case 'FUP': return Math.ceil(a);
        case 'LN': return Math.log(a);
        case 'EXP': return Math.exp(a);
        default: return a; // BIN, BCD, ADP, POW: sem efeito aqui
      }
    }
    function primario() {
      var c = ch();
      if (c === '[') { R.p++; var v = expr(); if (ch() === ']') R.p++; else falha('falta fechar ]'); return v; }
      if (c === '#') { R.p++; return lerVar(indice()); }
      if ((c >= '0' && c <= '9') || c === '.') {
        var m = /^\d*\.?\d*/.exec(R.s.substr(R.p));
        R.p += m[0].length;
        var nv = parseFloat(m[0]);
        if (isNaN(nv)) falha('número inválido'); return nv;
      }
      if (c >= 'A' && c <= 'Z') return funcao();
      falha(c ? 'caractere inesperado "' + c + '"' : 'valor ausente depois da letra');
    }
    function unario() {
      var c = ch();
      if (c === '+') { R.p++; return unario(); }
      if (c === '-') { R.p++; return -unario(); }
      return primario();
    }
    function mul() {
      var a = unario(), b;
      for (;;) {
        if (ch() === '*') { R.p++; a *= unario(); }
        else if (ch() === '/') { R.p++; b = unario(); if (b === 0) falha('divisão por zero'); a /= b; }
        else if (inicio('AND')) { R.p += 3; b = unario(); a = Math.round(a) & Math.round(b); }
        else if (inicio('MOD')) { R.p += 3; b = unario(); if (b === 0) falha('MOD por zero'); a = a % b; }
        else return a;
      }
    }
    function soma() {
      var a = mul(), b;
      for (;;) {
        if (ch() === '+') { R.p++; a += mul(); }
        else if (ch() === '-') { R.p++; a -= mul(); }
        else if (inicio('XOR')) { R.p += 3; b = mul(); a = Math.round(a) ^ Math.round(b); }
        else if (inicio('OR')) { R.p += 2; b = mul(); a = Math.round(a) | Math.round(b); }
        else return a;
      }
    }
    function expr() {
      var a = soma(), op, b;
      for (;;) {
        op = /^(EQ|NE|GT|LT|GE|LE)/.exec(R.s.substr(R.p, 2));
        if (!op) return a;
        R.p += 2; b = soma();
        switch (op[1]) {
          case 'EQ': a = Math.abs(a - b) < 1e-9 ? 1 : 0; break;
          case 'NE': a = Math.abs(a - b) >= 1e-9 ? 1 : 0; break;
          case 'GT': a = a > b ? 1 : 0; break;
          case 'LT': a = a < b ? 1 : 0; break;
          case 'GE': a = a >= b - 1e-9 ? 1 : 0; break;
          default: a = a <= b + 1e-9 ? 1 : 0;
        }
      }
    }
    // "#n=expr" (uma ou mais atribuicoes seguidas) a partir da posicao atual
    function atribuicoes(b) {
      while (ch() === '#') {
        R.p++;
        var idx = indice();
        if (ch() !== '=') falha('falta "=" na atribuição da variável #' + idx);
        R.p++;
        var v = expr();
        if (!isFinite(v)) falha('valor inválido para #' + idx);
        V[idx] = v;
        if (b && b.com) varCom[idx] = b.com;
      }
      if (R.p < R.s.length) falha('texto inesperado "' + R.s.substr(R.p, 10) + '"');
    }
    function palavras(s, linha) {
      R = { s: s, p: 0, linha: linha };
      var out = [], c, l, p0, vi;
      while (R.p < s.length) {
        c = ch();
        if (!(c >= 'A' && c <= 'Z')) falha('caractere inesperado "' + c + '"');
        l = c; R.p++;
        vi = null;
        if (l === 'T' && ch() === '#') { var mv = /^#(\d+)/.exec(s.substr(R.p)); if (mv) vi = parseInt(mv[1], 10); }
        p0 = R.p;
        var vv = unario();
        out.push({ l: l, v: vv, varIdx: vi, p0: p0, src: s.slice(p0, R.p) });
        if (ch() === '.') R.p++; // "#3." (ponto depois de variavel) aparece em programas da casa
      }
      return out;
    }

    /* ----- estado da maquina ----- */
    var st = { x: xHome, z: zHome, mode: 0, abs: true, f: 0, fmin: false, tool: null, modo: 'G97', vc: 0, rpm: 0, lim: 0, spinObj: null, cyc83: null, c71: null, c72: null, c73: null, cRe: null, c76: null, comp: 0, compOff: false,
      giro: false, refri: false, emTrabalho: false, linhaModo: -1, linhaComp: -1, linhaFim: -1 };
    var decAtual = ''; // bloco em execucao com variaveis e expressoes ja calculadas (visor decodificado)
    function snapshot() { return { x: st.x, z: st.z, mode: st.mode, abs: st.abs, f: st.f, fmin: st.fmin, comp: st.comp }; }
    function restaura(s) { st.x = s.x; st.z = s.z; st.mode = s.mode; st.abs = s.abs; st.f = s.f; st.fmin = s.fmin; st.comp = s.comp; }
    function spin() {
      if (!st.spinObj) st.spinObj = st.modo === 'G96' ? { modo: 'G96', vc: st.vc, rpm: st.lim } : { modo: 'G97', vc: 0, rpm: st.rpm };
      return st.spinObj;
    }
    function rpmDe(sp, x) {
      var lim = Number(sp.rpm) || 2000;
      if (sp.modo === 'G97') return lim;
      return Math.min(lim, 1000 * (Number(sp.vc) || 100) / (Math.PI * Math.max(Math.abs(x), 1)));
    }
    function fichaFerr(code, i, b) {
      var f = ferr[code];
      if (!f) {
        f = ferr[code] = { codigo: code, ordem: ordem.length, comentario: '', linhaT: i, linhas: [], nMov: 0, nCorte: 0, ops: {}, xCorteMin: 1e9, xCorteMax: -1e9, zCorteMin: 1e9, zCorteMax: -1e9, zAntes: null, preAvanco: true };
        ordem.push(code);
      }
      if (b) {
        if (f.linhas.length < 30) f.linhas.push(i);
        if (b.com && !f.comentario) f.comentario = b.com;
      }
      return f;
    }
    function trocaFerramenta(p, i, b) {
      var code = tcode(p.v), f = fichaFerr(code, i, b);
      if (!f.comentario && p.varIdx != null && varCom[p.varIdx]) f.comentario = varCom[p.varIdx];
      if (st.tool !== code) {
        if (st.comp && code !== '0000') aviso(i, 'Troca de ferramenta (T' + code + ') com G' + st.comp + ' ainda ativo (ligado na linha ' + (st.linhaComp + 1) + ').', 'compTroca' + i, 'compTroca');
        if (st.emTrabalho && st.tool && st.tool !== '0000' && code !== '0000') aviso(i, 'Troca da T' + st.tool + ' para a T' + code + ' sem recuar antes: não há G28/G30 depois do último corte.', 'trocaRec' + i, 'trocaSemRecuo');
        st.tool = code; st.emTrabalho = false;
      }
    }

    /* ----- emissao de movimentos (ctx.cap = leitura de contorno, sem emitir) ----- */
    function emite(t, x, z, f, i, label, ctx) {
      if (ctx && ctx.cap) { ctx.cap.push({ t: t, x: x, z: z }); st.x = x; st.z = z; return; }
      if (moves.length >= MAX_MOV) { truncado = true; fim = true; st.x = x; st.z = z; return; }
      if (Math.abs(x - st.x) < 1e-9 && Math.abs(z - st.z) < 1e-9) return; // movimento nulo
      var tool = st.tool || '0000';
      if (!st.tool) {
        if (t !== 'r') aviso(i, 'Avanço de corte antes de qualquer comando T: a ferramenta ficou indefinida.', 'semT');
        if (!ferr['0000']) fichaFerr('0000', i, { com: '(sem comando T no programa)' });
      }
      var fi = ferr[tool], m = { t: t, x: x, z: z, line: i, label: label, tool: tool, spin: spin(), dec: decAtual, comp: st.compOff ? 0 : st.comp };
      if (t !== 'r') {
        m.f = f; st.emTrabalho = true;
        if (!st.giro) aviso(i, 'Corte sem o fuso ligado: nenhum M3/M4 foi comandado antes do primeiro corte.', 'semGiro', 'semGiro');
      }
      moves.push(m);
      fi.nMov++;
      if (t === 'r') { if (fi.preAvanco && z > 0.001 && z <= 20.001) fi.zAntes = fi.zAntes == null ? z : Math.min(fi.zAntes, z); }
      else {
        fi.preAvanco = false; fi.nCorte++;
        fi.xCorteMin = Math.min(fi.xCorteMin, x, st.x); fi.xCorteMax = Math.max(fi.xCorteMax, x, st.x);
        fi.zCorteMin = Math.min(fi.zCorteMin, z, st.z); fi.zCorteMax = Math.max(fi.zCorteMax, z, st.z);
      }
      st.x = x; st.z = z;
    }
    function rapido(x, z, i, label, ctx) { emite('r', x, z, 0, i, label || 'RÁPIDO (G0)', ctx); }
    function avanco(x, z, i, label, ctx, fOver) {
      var f = fOver != null ? fOver : fRev((st.x + x) / 2, i);
      emite('f', x, z, f, i, label || 'AVANÇO (G1)', ctx);
    }
    function fRev(xm, i) { // avanco em mm/rot (converte mm/min usando a rotacao)
      var f = st.f;
      if (!(f > 0)) { aviso(i, 'Corte sem avanço F definido: usei 0,1 mm/rot.', 'semF'); f = 0.1; }
      if (st.fmin) {
        var rpm = rpmDe(spin(), xm), fm = f; f = f / Math.max(rpm, 1);
        if (f < 0.003) aviso(i, 'Avanço F' + numTxt(fm) + ' em mm/min (G98/G94) a ' + Math.round(rpm) + ' rpm dá só ' + numTxt(f) + ' mm/rot: parece um valor de mm/rot com o modo mm/min ligado.', 'avBaixo' + numTxt(fm), 'avBaixo');
      } else if (f > 1.5) aviso(i, 'Avanço F' + numTxt(f) + ' em mm/rot (G99/G95) é muito alto: parece um valor de mm/min com o modo mm/rot ligado.', 'avAlto' + numTxt(f), 'avAlto');
      return f;
    }
    function checaS(i) {
      if (st.modo === 'G97' && !(st.rpm > 0) || st.modo === 'G96' && !(st.vc > 0)) aviso(i, 'Corte sem rotação definida (G96/G97 com S): usei o padrão do simulador.', 'semS');
      if (st.modo === 'G96' && !(st.lim > 0)) { var lm = st.linhaModo >= 0 ? st.linhaModo : i; aviso(lm, 'G96 sem limite de rotação (G50 S) antes do corte: perto do centro o fuso sobe até a rotação máxima da máquina.', 'g96lim' + lm, 'g96semG50'); }
    }

    function alvo(w) {
      var x = st.x, z = st.z;
      if (st.abs) {
        if (w.X != null) x = w.X; else if (w.U != null) x = st.x + w.U;
        if (w.Z != null) z = w.Z; else if (w.W != null) z = st.z + w.W;
      } else {
        x = st.x + (w.X != null ? w.X : (w.U || 0));
        z = st.z + (w.Z != null ? w.Z : (w.W || 0));
      }
      return { x: x, z: z };
    }
    function temCoord(w) { return w.X != null || w.Z != null || w.U != null || w.W != null; }

    function mover(modo, w, i, ctx, herdado) {
      var a = alvo(w);
      if (modo > 1 && herdado && w.R == null && w.I == null && w.K == null) { // bloco sem G logo depois de um arco, sem R/I/K: segue em linha reta
        aviso(i, 'Bloco sem G depois de um arco (G' + modo + ') e sem R/I/K: simulado como G1.', 'arcoh' + i);
        modo = 1;
      }
      if (modo === 0) { rapido(a.x, a.z, i, 'RÁPIDO (G0)', ctx); return; }
      if (modo === 1) { checaS(i); avanco(a.x, a.z, i, 'AVANÇO (G1)', ctx); return; }
      // arcos
      var p0 = [st.z, st.x / 2], p1 = [a.z, a.x / 2], ccw = modo === 3, c = null, k;
      if (w.R != null && w.R !== 0) {
        c = centroPorR(p0, p1, w.R, ccw);
        if (c && c[2]) aviso(i, 'Raio R' + w.R + ' menor que a metade da corda: o arco foi ajustado a uma semicircunferência.', 'rarc' + i);
      } else if (w.I != null || w.K != null) c = [st.z + (w.K || 0), st.x / 2 + (w.I || 0)];
      else falha('arco G' + modo + ' sem R nem I/K');
      if (!c) return;
      checaS(i);
      var pts = arcoPontos(p0, p1, c[0], c[1], ccw), f = fRev((st.x + a.x) / 2, i);
      for (k = 0; k < pts.length; k++) emite('f', 2 * pts[k][1], pts[k][0], f, i, 'ARCO (G' + modo + ')', ctx);
    }

    /* ----- ciclos ----- */
    function acha(n, de) {
      var k;
      for (k = de + 1; k < NB; k++) if (B[k].n === n) return k;
      for (k = 0; k <= de && k < NB; k++) if (B[k].n === n) return k;
      return -1;
    }
    function capturaPerfil(iP, iQ, i) { // percorre os blocos P..Q sem emitir: devolve os pontos do contorno
      var salvo = snapshot(), ctx = { cap: [], sub: true }, j;
      for (j = iP; j <= iQ; j++) execSimples(B[j], j, ctx);
      restaura(salvo);
      return ctx.cap;
    }
    // o primeiro bloco do contorno (N do P) precisa de G0 ou G1, senao o comando alarma; variavel no G (G#) nao da para conferir
    function checaContorno(iP, i, nome) {
      var r = B[iP].rest;
      if (r === '' || r.indexOf('G#') >= 0 || /G0?[01](?!\d)/.test(r)) return;
      aviso(iP, nome + ' (linha ' + (i + 1) + '): o primeiro bloco do contorno (N' + B[iP].n + ') não tem G0 nem G1.', 'sem01' + iP, 'contornoSemG01');
    }
    function nota(i, key) { var f = st.tool && ferr[st.tool]; if (f) f.ops[key] = (f.ops[key] || 0) + 1; }

    function ciclo71(w, i, tipo) { // G71 (longitudinal) e G72 (transversal): w = bloco com P Q U W F
      var par = tipo === 71 ? st.c71 : st.c72, nome = 'G' + tipo;
      if (!par) { aviso(i, nome + ' sem o bloco ' + nome + (tipo === 71 ? ' U R' : ' W R') + ' antes: usei profundidade 1 e retorno 1.', 'sempar' + tipo); par = { d: 1, e: 1 }; }
      var iP = acha(Math.round(w.P), i), iQ = iP < 0 ? -1 : acha(Math.round(w.Q), iP);
      if (iP < 0 || iQ < 0) { erro(i, nome + ': não achei o bloco N' + (iP < 0 ? Math.round(w.P) : Math.round(w.Q)) + ' do contorno.', 'cicloSemContorno'); return; }
      checaContorno(iP, i, nome);
      var cap = capturaPerfil(iP, iQ, i), f = w.F != null ? w.F : st.f, du = w.U != null ? w.U : 0, dw = w.W != null ? w.W : 0, d = par.d, e = par.e;
      if (!(f > 0)) f = st.f;
      var fr = f > 0 ? (st.fmin ? f / Math.max(rpmDe(spin(), st.x), 1) : f) : fRev(st.x, i);
      if (cap.length < 2) { aviso(i, nome + ': contorno com menos de 2 movimentos; ciclo ignorado.', 'cap' + i); return; }
      if (!(d > 0)) { erro(i, nome + ': profundidade de corte (' + (tipo === 71 ? 'U' : 'W') + ') deve ser maior que zero.', 'cicloProf'); return; }
      checaS(i); nota(i, 'g' + tipo);
      var eixoSobe = false, eixoDesce = false; // eixo principal do ciclo (Z no G71, X no G72) tem de andar sempre no mesmo sentido
      for (k = 1; k < cap.length; k++) {
        var dEixo = tipo === 71 ? cap[k].z - cap[k - 1].z : cap[k].x - cap[k - 1].x;
        if (dEixo > 0.01) eixoSobe = true; if (dEixo < -0.01) eixoDesce = true;
      }
      if (eixoSobe && eixoDesce) dica(iP, nome + ' (linha ' + (i + 1) + '): o contorno volta em ' + (tipo === 71 ? 'Z' : 'X') + ' (anda nos dois sentidos); o simulador desbasta como se andasse só num sentido. Alguns comandos alarmam esse formato.', 'eixo' + i, 'cicloEixo');
      var xA = st.x, zA = st.z, rA = xA / 2, PZ = [], PR = [], k;
      cap.forEach(function (p) { PZ.push(p.z + dw); PR.push(p.x / 2 + du / 2); });
      var n = cap.length, lab = 'DESBASTE ' + nome;
      if (tipo === 71) {
        var r0 = cap[0].x / 2, ext = r0 < rA - 1e-6 ? true : (r0 > rA + 1e-6 ? false : du >= 0 && !(du === 0 && 1 / du < 0));
        if (du !== 0 && (ext ? du < 0 : du > 0)) aviso(i, 'G71 ' + (ext ? 'externo' : 'interno') + ' com U' + numTxt(du) + ': o sobremetal de acabamento deve ser ' + (ext ? 'positivo' : 'negativo') + ' (senão o desbaste corta dentro do perfil).', 'g71sinal' + i, 'g71Sinal');
        var sg = ext ? 1 : -1, rFloor = ext ? Math.min.apply(null, PR) : Math.max.apply(null, PR), lv = [], r = rA - sg * d;
        if (Math.abs(cap[0].z - zA) > 0.01) aviso(i, 'G71 tipo II (primeiro bloco do contorno com Z) foi simulado como tipo I.', 'g71ii');
        var subiu = false, desceu = false;
        for (k = 1; k < n; k++) { if (PR[k] > PR[k - 1] + 0.01) subiu = true; if (PR[k] < PR[k - 1] - 0.01) desceu = true; }
        if (subiu && desceu) aviso(i, 'G71: o contorno sobe e desce em X (cavidade): o simulador desbasta como tipo I e pode deixar a cavidade sem usinar no desbaste.', 'g71cav');
        while (sg * (r - rFloor) > 1e-9 && lv.length < 3000) { lv.push(r); r -= sg * d; }
        if (sg * (rA - rFloor) > 1e-6) lv.push(rFloor);
        if (ext) nota(i, 'ext'); else { nota(i, 'int'); var fi71 = st.tool && ferr[st.tool]; if (fi71) fi71.ops.intXA = fi71.ops.intXA == null ? xA : Math.min(fi71.ops.intXA, xA); }
        lv.forEach(function (rl) {
          var stop = PZ[n - 1], q;
          if (sg * (PR[0] - rl) >= -1e-9) stop = PZ[0];
          else for (q = 1; q < n; q++) {
            if (sg * (PR[q] - rl) >= -1e-9) { var den = PR[q] - PR[q - 1]; stop = Math.abs(den) < 1e-12 ? PZ[q] : PZ[q - 1] + (rl - PR[q - 1]) / den * (PZ[q] - PZ[q - 1]); break; }
          }
          stop = Math.min(zA, stop);
          if (stop >= zA - 1e-6) return;
          rapido(2 * rl, zA, i, lab);
          avanco(2 * rl, stop, i, lab, null, fr);
          rapido(2 * (rl + sg * e), stop + e, i, lab);
          rapido(2 * (rl + sg * e), zA, i, lab);
        });
      } else {
        var rEnd = cap[n - 1].x / 2, ext2 = rEnd < rA - 1e-6 ? true : (rEnd > rA + 1e-6 ? false : du >= 0 && !(du === 0 && 1 / du < 0));
        var zFloor = Math.min.apply(null, PZ), lz = [], z = zA - d;
        while (z > zFloor + 1e-9 && lz.length < 3000) { lz.push(z); z -= d; }
        if (zFloor < zA - 1e-6) lz.push(zFloor);
        if (ext2) nota(i, 'ext'); else nota(i, 'int');
        lz.forEach(function (zl) {
          var rs = PR[n - 1], q; // primeiro cruzamento do contorno com o nivel Z (de fora para dentro no externo, do furo para fora no interno)
          for (q = 1; q < n; q++) {
            var za = PZ[q - 1], zb = PZ[q];
            if (Math.abs(za - zl) < 1e-9 && Math.abs(zb - zl) < 1e-9) { rs = PR[q - 1]; break; }
            if ((za - zl) * (zb - zl) <= 0) { rs = PR[q - 1] + (zl - za) / (zb - za) * (PR[q] - PR[q - 1]); break; }
          }
          rapido(xA, zl, i, lab);
          if (ext2 ? 2 * rs >= xA - 1e-6 : 2 * rs <= xA + 1e-6) return;
          avanco(2 * rs, zl, i, lab, null, fr);
          rapido(2 * rs, zl + e, i, lab);
          rapido(xA, zl + e, i, lab);
        });
      }
      // passada no contorno com sobremetal e volta ao ponto de partida
      rapido(2 * PR[0], Math.min(zA, PZ[0]), i, lab);
      for (k = 1; k < n; k++) avanco(2 * PR[k], Math.min(zA, PZ[k]), i, lab, null, fr);
      rapido(xA, zA, i, lab);
    }

    function ciclo70(w, i) { // acabamento: repete os blocos P..Q com o avanco do G70 e volta ao ponto de partida
      var iP = acha(Math.round(w.P), i), iQ = iP < 0 ? -1 : acha(Math.round(w.Q), iP);
      if (iP < 0 || iQ < 0) { erro(i, 'G70: não achei o bloco N' + (iP < 0 ? Math.round(w.P) : Math.round(w.Q)) + ' do contorno.', 'cicloSemContorno'); return; }
      nota(i, 'g70');
      var xA = st.x, zA = st.z, fAnt = st.f, ctx = { forcaF: true, sub: true }, j, dCiclo = decAtual;
      if (w.F != null) st.f = w.F; else aviso(i, 'G70 sem F: usei o avanço em vigor.', 'g70f');
      checaS(i);
      for (j = iP; j <= iQ; j++) execSimples(B[j], j, ctx);
      decAtual = dCiclo;
      rapido(xA, zA, i, 'RETORNO (G70)');
      st.f = w.F != null ? w.F : fAnt;
    }

    function ciclo73(w, i) { // G73: repete o contorno P..Q deslocado (desbaste paralelo ao perfil). 1o bloco: U/W = afastamento TOTAL (raio e Z), R = numero de cortes
      var par = st.c73;
      if (!par) { aviso(i, 'G73 sem o bloco G73 U W R antes: usei 1 corte sem afastamento.', 'sempar73'); par = { di: 0, dk: 0, d: 1 }; }
      var iP = acha(Math.round(w.P), i), iQ = iP < 0 ? -1 : acha(Math.round(w.Q), iP);
      if (iP < 0 || iQ < 0) { erro(i, 'G73: não achei o bloco N' + (iP < 0 ? Math.round(w.P) : Math.round(w.Q)) + ' do contorno.', 'cicloSemContorno'); return; }
      checaContorno(iP, i, 'G73');
      var cap = capturaPerfil(iP, iQ, i), f = w.F != null ? w.F : st.f, du = w.U != null ? w.U : 0, dw = w.W != null ? w.W : 0, d = par.d, lab = 'DESBASTE G73';
      if (!(f > 0)) f = st.f;
      var fr = f > 0 ? (st.fmin ? f / Math.max(rpmDe(spin(), st.x), 1) : f) : fRev(st.x, i);
      if (cap.length < 2) { aviso(i, 'G73: contorno com menos de 2 movimentos; ciclo ignorado.', 'cap' + i); return; }
      checaS(i); nota(i, 'g73');
      var xA = st.x, zA = st.z, dirX = du !== 0 ? sinal(du) : (par.di < 0 ? -1 : 1), j;
      if (par.di !== 0 && sinal(par.di) !== dirX) aviso(i, 'G73: o sinal de U do primeiro bloco é contrário ao U de acabamento; usei a direção do acabamento.', 'g73sinal');
      if (dirX > 0) nota(i, 'ext'); else { nota(i, 'int'); var fi73 = st.tool && ferr[st.tool]; if (fi73) fi73.ops.intXA = fi73.ops.intXA == null ? xA : Math.min(fi73.ops.intXA, xA); }
      var di = Math.abs(par.di) * dirX, dk = par.dk;
      for (j = 1; j <= d; j++) {
        var fr_j = d > 1 ? (d - j) / (d - 1) : 1, sr = du / 2 + di * fr_j, sz = dw + dk * fr_j; // deslocamento do perfil neste corte: no raio e em Z (o ultimo fica so com o sobremetal de acabamento)
        cap.forEach(function (p) {
          if (p.t === 'r') rapido(p.x + 2 * sr, p.z + sz, i, lab); else avanco(p.x + 2 * sr, p.z + sz, i, lab, null, fr);
        });
        rapido(xA, cap[cap.length - 1].z + sz, i, lab);
        rapido(xA, zA, i, lab);
      }
    }

    function ciclo74(w, i) { // G74: passes em X (P) com avanco longo em Z ate Z (Q = bicada em Z; sem X = furacao com bicada no eixo)
      var xs = st.x, zs = st.z, a = alvo(w), temX = w.X != null || w.U != null, xf = temX ? a.x : xs, ze = a.z;
      var p = (w.P || 0) / 1000, q = (w.Q || 0) / 1000, Rr = w.R != null ? w.R : (st.cRe != null ? st.cRe : 0.5), dz = sinal(ze - zs), sx = temX && xf - xs > 1e-9 ? 1 : -1, fr, lab = temX ? 'TORNEAR (G74)' : 'FURAR (G74)';
      if (Math.abs(ze - zs) < 1e-9) { aviso(i, 'G74 sem curso em Z.', 'g74z' + i); return; }
      checaS(i); nota(i, temX ? 'g74' : 'g74furo');
      if (!temX && st.modo === 'G96') aviso(i, 'Furação (G74 sem X) em G96: a broca no centro (X0) faria o fuso subir ao limite de rotação.', 'furo96' + i, 'furoG96');
      fr = fRev((xs + xf) / 2, i);
      var xi = [xs];
      if (temX && p > 0) while (sx * (xf - xi[xi.length - 1]) > 1e-9 && xi.length < 3000) xi.push(sx < 0 ? Math.max(xf, xi[xi.length - 1] - 2 * p) : Math.min(xf, xi[xi.length - 1] + 2 * p));
      xi.forEach(function (x, k) {
        var zc = zs, zn;
        if (q > 0 && q < Math.abs(ze - zs) - 1e-9) {
          while (dz * (ze - zc) > 1e-9) {
            zn = dz < 0 ? Math.max(ze, zc - q) : Math.min(ze, zc + q);
            avanco(x, zn, i, lab, null, fr);
            if (Math.abs(zn - ze) > 1e-9) rapido(x, zn - dz * Rr, i, lab);
            zc = zn;
          }
        } else avanco(x, ze, i, lab, null, fr);
        var xr = temX ? x - sx * 2 * Rr : x, xn = k < xi.length - 1 ? xi[k + 1] : xs;
        if (temX) { rapido(xr, ze, i, lab); rapido(xr, zs, i, lab); rapido(xn, zs, i, lab); }
        else rapido(x, zs, i, lab);
      });
    }

    function ciclo75(w, i) { // G75: passes em Z (Q) cortando em X ate X (P = passo em X; passo grande = corte unico, como no faceamento)
      var xs = st.x, zs = st.z, a = alvo(w), xf = a.x, ze = a.z, p = (w.P || 0) / 1000, q = (w.Q || 0) / 1000, Rr = w.R != null ? w.R : (st.cRe != null ? st.cRe : 0.5);
      var dz = sinal(ze - zs), sx = sinal(xf - xs), fr = fRev((xs + xf) / 2, i), zi = [zs], single = !(p > 0) || 2 * p >= Math.abs(xs - xf) - 1e-9;
      if (Math.abs(xf - xs) < 1e-9) { aviso(i, 'G75 sem curso em X.', 'g75x' + i); return; }
      checaS(i);
      if (q > 0) while (dz * (ze - zi[zi.length - 1]) > 1e-9 && zi.length < 5000) zi.push(dz < 0 ? Math.max(ze, zi[zi.length - 1] - q) : Math.min(ze, zi[zi.length - 1] + q));
      var lab = single ? (xf <= 0.5 ? 'FACEAR (G75)' : 'CANAL/TORNEAR (G75)' ) : 'CANAL (G75)';
      if (xf > 0.5 && !single) nota(i, sx < 0 ? 'canalExt' : 'canalInt'); else nota(i, xf <= 0.5 ? 'g75face' : 'g75tornear');
      zi.forEach(function (z, k) {
        var zn = k < zi.length - 1 ? zi[k + 1] : zs;
        if (single) {
          avanco(xf, z, i, lab, null, fr);
          rapido(xf, z - dz * Rr, i, lab);
          rapido(xs, z - dz * Rr, i, lab);
          rapido(xs, zn, i, lab);
        } else {
          if (k > 0) rapido(xs, z, i, lab);
          var x = xs;
          while (sx * (xf - (x + sx * 2 * p)) > 1e-9) {
            x += sx * 2 * p;
            avanco(x, z, i, lab, null, fr);
            rapido(x - sx * 2 * Rr, z, i, lab);
            rapido(x, z, i, lab);
          }
          avanco(xf, z, i, lab, null, fr);
          rapido(xs, z, i, lab);
        }
      });
      if (!single) rapido(xs, zs, i, lab);
    }

    function ciclo76(w, i) { // G76 em 2 blocos: o primeiro guarda os parametros, o segundo roda as passadas
      var semXZ = w.X == null && w.Z == null && w.U == null && w.W == null;
      if (semXZ) {
        var P1 = Math.round(w.P || 0), ang76 = P1 % 100, m76 = Math.floor(P1 / 10000);
        st.c76 = { m: m76 || 1, qmin: (w.Q || 0) / 1000, rfin: w.R || 0 };
        if ([0, 29, 30, 55, 60, 80].indexOf(ang76) < 0) aviso(i, 'G76: ângulo da rosca ' + ang76 + '° (últimos 2 dígitos do P) não é um dos aceitos (0, 29, 30, 55, 60, 80).', 'g76ang' + i, 'g76Ang');
        if (m76 > 3) dica(i, 'G76: P' + P1 + ' pede ' + m76 + ' passadas de acabamento (2 primeiros dígitos do P) — o usual é 1 (P010060).', 'g76acab' + i, 'g76Acab');
        return;
      }
      var xA = st.x, zA = st.z, a = alvo(w), xf = a.x, zE = a.z, he = (w.P || 0) / 1000, q = (w.Q || 0) / 1000, pitch = w.F || 0, m = st.c76 ? st.c76.m : 1;
      if (!(he > 0) || !(q > 0) || !(pitch > 0)) { aviso(i, 'G76 sem altura do filete (P), 1ª profundidade (Q) ou passo (F): rosca ignorada.', 'g76p' + i); return; }
      if (!st.c76) aviso(i, 'G76 sem o bloco G76 P Q R antes: usei 1 passada de acabamento.', 'g76pre');
      if (st.modo === 'G96') aviso(i, 'G76 em G96: a rotação varia com o diâmetro e o passo da rosca sai errado (rosca pede G97).', 'g76g96' + i, 'g76G96');
      else if (spin().rpm * pitch > 6000) aviso(i, 'G76: ' + Math.round(spin().rpm) + ' rpm × passo ' + numTxt(pitch) + ' = ' + Math.round(spin().rpm * pitch) + ' mm/min de avanço da rosca, acima do que o eixo costuma aguentar.', 'g76rpm' + i, 'g76Rpm');
      if (he > 0.75 * pitch) aviso(i, 'G76: altura do filete P' + numTxt(he * 1000) + ' (' + numTxt(he) + ' mm) maior que 75% do passo ' + numTxt(pitch) + ' (rosca métrica ISO ≈ 61%).', 'g76alt' + i, 'g76Altura');
      var ext = xf < xA, xBase = ext ? xf + 2 * he : xf - 2 * he, deps = [], k = 1, d;
      do { d = Math.min(he, q * Math.sqrt(k)); deps.push(d); k++; } while (d < he - 1e-9 && k < 60);
      for (var mm = 0; mm < m; mm++) deps.push(he);
      checaS(i); nota(i, ext ? 'g76' : 'g76int');
      deps.forEach(function (dp) {
        var x = ext ? xBase - 2 * dp : xBase + 2 * dp;
        rapido(x, zA, i, 'ROSCA G76');
        emite('t', x, zE, pitch, i, 'ROSCA G76');
        rapido(xA, zE, i, 'ROSCA G76');
        rapido(xA, zA, i, 'ROSCA G76');
      });
    }

    function ciclo83(w, i, repete) { // furacao com bicada em X atual: desce Q por bicada, recua ao plano R e volta
      var c = repete ? st.cyc83 : { zEnd: null, q: 0, R: null, f: null };
      if (!repete) {
        var a0 = alvo(w); c.zEnd = a0.z; c.q = (w.Q || 0) / 1000; c.R = w.R != null ? w.R : st.z; c.f = w.F != null ? w.F : st.f;
        if (w.F != null) st.f = w.F;
        st.cyc83 = c;
        if (st.modo === 'G96') aviso(i, 'Furação (G83) em G96: a broca no centro (X0) faria o fuso subir ao limite de rotação.', 'furo96' + i, 'furoG96');
        if (!(c.q > 0)) dica(i, 'G83 sem Q: o furo é feito de uma só descida, sem quebra de cavaco nem retirada para limpar.', 'g83q' + i, 'g83semQ');
      }
      var x = st.x;
      if (repete) { var a1 = alvo(w); if (w.X != null || w.U != null) { rapido(a1.x, st.z, i, 'FURAR (G83)'); x = a1.x; } if (w.Z != null) c.zEnd = w.Z; }
      checaS(i); nota(i, 'g83');
      var zR = c.R, zc = zR, prev = zR, q = c.q > 0 ? c.q : Math.abs(c.zEnd - zR), fr = fRev(x, i);
      if (Math.abs(st.z - zR) > 1e-9) rapido(x, zR, i, 'FURAR (G83)');
      var guarda = 0;
      while (zc > c.zEnd + 1e-9 && guarda++ < 5000) {
        zc = Math.max(c.zEnd, zc - q);
        if (prev < zR - 1e-9) rapido(x, Math.min(zR, prev + 1), i, 'FURAR (G83)');
        avanco(x, zc, i, 'FURAR (G83)', null, fr);
        rapido(x, zR, i, 'FURAR (G83)');
        prev = zc;
      }
    }

    function retorno(w, i, ctx) { // G28 / G30: vai (se pedido) ao ponto intermediario e depois a referencia dos eixos citados
      var ix = w.X != null || w.U != null, iz = w.Z != null || w.W != null;
      if (!ix && !iz) return;
      var a = alvo(w);
      // X/Z absolutos no G28: o ponto intermediario e esse; mais perto da peca que a posicao atual = a torre passa por ele
      if (st.abs && ((w.X != null && w.X < st.x - 1e-6) || (w.Z != null && w.Z < st.z - 1e-6))) aviso(i, 'G28/G30 com ' + (w.X != null && w.X < st.x - 1e-6 ? 'X' + numTxt(w.X) : 'Z' + numTxt(w.Z)) + ' absoluto: o ponto intermediário fica mais perto da peça que a posição atual (X' + numTxt(st.x) + ' Z' + numTxt(st.z) + ').', 'g28abs' + i, 'g28Abs');
      st.emTrabalho = false;
      if (Math.abs(a.x - st.x) > 1e-9 || Math.abs(a.z - st.z) > 1e-9) rapido(a.x, a.z, i, 'RÁPIDO (G28: PONTO INTERMEDIÁRIO)', ctx);
      rapido(ix ? xHome : st.x, iz ? zHome : st.z, i, 'RETORNO À REFERÊNCIA (G28)', ctx);
    }

    /* ----- um bloco "normal" (palavras) ----- */
    // devolve o proximo bloco (pc) quando o proprio bloco desvia (ciclos G71/G72, M98/M99), senao null
    function execSimples(b, i, ctx) {
      ctx = ctx || {};
      if (b.kind === 'atrib') { R = { s: b.rest, p: 0, linha: i }; atribuicoes(b); return null; }
      if (b.kind !== 'normal') return null;
      var ps = palavras(b.rest, i), w = {}, G = [], M = [], tp = null, k;
      if (!ctx.cap) decAtual = (b.n != null ? 'N' + b.n + ' ' : '') + ps.map(function (p) { return decPalavra(p.l, p.src, p.v); }).join('');
      ps.forEach(function (p) {
        if (p.l === 'G') G.push(Math.round(p.v * 10) / 10);
        else if (p.l === 'M') M.push(Math.round(p.v));
        else if (p.l === 'T') tp = p;
        else w[p.l] = p.v;
      });
      var mov = null, cic = null, home = false, g50 = false, g1900b = 0, semMov = false;
      G.forEach(function (g) {
        switch (g) {
          case 0: case 1: case 2: case 3: mov = g; st.mode = g; break;
          case 4: semMov = true; break; // pausa: X/P/U sao tempo, nao movimento
          case 28: case 30: home = true; break;
          case 17: case 18: case 19: case 21: case 54: case 55: case 56: case 57: case 58: case 59: case 61: case 62: case 63: case 64: case 69: break;
          case 290: case 291: break; // Siemens: G290 = modo Siemens, G291 = modo ISO (Fanuc); so troca o dialeto, nao move nada
          case 20: aviso(i, 'G20 (polegadas): o simulador trata os valores como milímetros.', 'g20'); break;
          case 40: st.comp = 0; break; // cancela a compensacao do raio de ponta; o movimento deste bloco (se houver) e o de saida
          case 41: case 42: st.comp = g; st.linhaComp = i; break; // o raio e a posicao da ponta vem da ferramenta do banco (aplicado em montarCena)
          case 50: g50 = true; break;
          case 92: // ISO (sistema B/C, tambem no Siemens em G291): G92 so com S = limite de rotacao em G96 (como o G50 S); com X/Z e preset ou ciclo de rosca
            if (w.S != null && !temCoord(w)) g50 = true;
            else { semMov = true; aviso(i, 'G92 não é simulado e foi ignorado (o bloco inteiro foi pulado).', 'g92'); }
            break;
          case 53: aviso(i, 'G53 (coordenada da máquina) não é simulado.', 'g53'); break;
          case 70: case 71: case 72: case 73: case 74: case 75: case 76: case 83: cic = g; break;
          case 80: st.cyc83 = null; break;
          case 90: st.abs = true; break;
          case 91: st.abs = false; break;
          case 94: case 98: st.fmin = true; break;
          case 95: case 99: st.fmin = false; break;
          case 96: st.modo = 'G96'; st.spinObj = null; st.linhaModo = i; break;
          case 97: st.modo = 'G97'; st.spinObj = null; st.linhaModo = i; break;
          case 1900: case 1901: g1900b = g; break;
          default: semMov = true; aviso(i, 'G' + g + ' não é simulado e foi ignorado (o bloco inteiro foi pulado).', 'g' + g);
        }
      });
      if (w.F != null && !ctx.forcaF) st.f = w.F;
      if (w.S != null) {
        if (g50) st.lim = w.S;
        else if (st.modo === 'G96') st.vc = w.S;
        else st.rpm = w.S;
        st.spinObj = null;
      }
      if (g50 && temCoord(w)) aviso(i, 'G50 com X/Z (preset de coordenadas) não é simulado.', 'g50xz');
      var fimBloco = false, call = null, ret = false;
      M.forEach(function (m) {
        if (m === 30 || m === 2) { fimBloco = true; st.linhaFim = i; }
        else if (m === 98) call = w.P;
        else if (m === 99) ret = true;
        else if (m === 3 || m === 4) st.giro = true; // o sentido de giro nao altera o percurso
        else if (m === 5) st.giro = false;
        else if (m === 8) st.refri = true;
        else if (m === 9) st.refri = false;
      });
      if (tp && !ctx.cap) trocaFerramenta(tp, i, b);
      if (g1900b) { if (!g1900) g1900 = { d: w.D, l: w.L, k: w.K, linha: i }; if (g1900b === 1901 && w.E != null) g1900.e = w.E; }
      else if (home) { if (!ctx.cap) retorno(w, i, ctx); }
      else if (cic != null) {
        if (ctx.cap) return null;
        if (cic !== 70) st.compOff = true; // so o G70 (acabamento) segue a compensacao; os desbastes ignoram G41/G42, como no Fanuc
        try {
          switch (cic) {
            case 70: ciclo70(w, i); break;
            case 71: case 72:
              if (w.P == null && w.Q == null) { if (cic === 71) st.c71 = { d: w.U != null ? w.U : 1, e: w.R != null ? w.R : 0.5 }; else st.c72 = { d: w.W != null ? w.W : 1, e: w.R != null ? w.R : 0.5 }; }
              else ciclo71(w, i, cic); // como nos programas da casa, os blocos N(P)..N(Q) seguintes rodam depois em movimento normal
              break;
            case 73:
              if (w.P == null && w.Q == null) st.c73 = { di: w.U != null ? w.U : 0, dk: w.W != null ? w.W : 0, d: w.R != null ? Math.max(1, Math.round(w.R)) : 1 };
              else ciclo73(w, i);
              break;
            case 74: case 75:
              if (!temCoord(w) && w.R != null) { st.cRe = w.R; break; }
              ['P', 'Q'].forEach(function (l) { // P/Q em milesimos de mm, sem ponto: Q2.5 ou Q3 viram micrometros
                var v = w[l];
                if (v != null && v > 0 && (v !== Math.round(v) || v < 20)) aviso(i, 'G' + cic + ': ' + l + numTxt(v) + ' vale só ' + numTxt(v / 1000) + ' mm (P e Q são em milésimos de mm, sem ponto decimal).', 'pq' + i + l, 'pqUnidade');
              });
              if (cic === 74) ciclo74(w, i); else ciclo75(w, i);
              break;
            case 76: ciclo76(w, i); break;
            case 83: ciclo83(w, i, false); break;
          }
        } finally { st.compOff = false; }
      } else if (temCoord(w) && !g50 && !semMov) {
        if (st.cyc83 && mov == null && !ctx.cap) ciclo83(w, i, true);
        else mover(st.mode, w, i, ctx, mov == null);
      } else if (mov === 2 || mov === 3) falha('arco sem ponto final');
      if (ctx.cap) return null;
      if (fimBloco) { fim = true; return null; }
      if (call != null) {
        var pn = Math.round(call), rep = 1;
        if (pn > 9999) { rep = Math.floor(pn / 10000); pn = pn % 10000; }
        if (w.L != null) rep = Math.max(1, Math.round(w.L));
        for (k = 0; k < NB; k++) if (B[k].kind === 'o' && B[k].o === pn) break;
        if (k >= NB) { erro(i, 'M98: subprograma O' + pn + ' não está no texto colado.'); return null; }
        if (pilha.length > 20) { erro(i, 'M98: subprogramas aninhados demais.'); return null; }
        pilha.push({ ret: i + 1, ini: k + 1, rep: rep });
        return k + 1;
      }
      if (ret) {
        if (!pilha.length) { fim = true; st.linhaFim = i; return null; }
        var topo = pilha[pilha.length - 1];
        if (topo.rep > 1) { topo.rep--; return topo.ini; }
        pilha.pop(); return topo.ret;
      }
      return null;
    }

    /* ----- laco principal ----- */
    function alvoDesvio(b, i) { // le o numero depois de GOTO
      var n = Math.round(unario()), k = acha(n, i);
      if (k < 0) falha('GOTO N' + n + ': bloco não encontrado');
      return k;
    }
    function bloco(i) {
      var b = B[i];
      switch (b.kind) {
        case 'vazio': return i + 1;
        case 'o':
          if (executou && !pilha.length) { fim = true; return i + 1; }
          return i + 1;
        case 'goto': R = { s: b.rest, p: 4, linha: i }; executou = true; return alvoDesvio(b, i);
        case 'if': {
          executou = true;
          R = { s: b.rest, p: 2, linha: i };
          var cond = primario();
          if (inicio('GOTO')) { R.p += 4; var k = alvoDesvio(b, i); return cond ? k : i + 1; }
          if (inicio('THEN')) { R.p += 4; if (cond) atribuicoes(b); return i + 1; }
          falha('IF sem GOTO nem THEN');
          return i + 1;
        }
        case 'while': {
          executou = true;
          R = { s: b.rest, p: 5, linha: i };
          var c2 = primario(), md = /^DO(\d+)/.exec(R.s.substr(R.p));
          if (!md) falha('WHILE sem DOn');
          if (c2) return i + 1;
          for (var j = i + 1; j < NB; j++) if (B[j].kind === 'end' && B[j].rest === 'END' + md[1]) return j + 1;
          falha('WHILE sem o END' + md[1] + ' correspondente');
          return i + 1;
        }
        case 'end': {
          var m = b.rest.slice(3);
          for (var q = i - 1; q >= 0; q--) if (B[q].kind === 'while' && new RegExp('DO' + m + '$').test(B[q].rest)) return q;
          falha('END' + m + ' sem WHILE correspondente');
          return i + 1;
        }
        default: {
          executou = true;
          var nx = execSimples(b, i, null);
          return nx == null ? i + 1 : nx;
        }
      }
    }
    var pc = 0;
    while (pc < NB && !fim) {
      if (++passos > MAX_BLOCOS) { erro(pc, 'Mais de ' + MAX_BLOCOS + ' blocos executados: provável laço sem fim (WHILE/GOTO).'); break; }
      try { pc = bloco(pc); }
      catch (e) {
        if (e instanceof ErroLeitura) { erro(pc, e.msg); pc++; }
        else throw e;
      }
    }
    if (truncado) erro(NB - 1, 'Programa gera mais de ' + MAX_MOV + ' movimentos: a simulação foi cortada aqui.', 'truncado');
    var ultima = NB - 1;
    while (ultima > 0 && (B[ultima].s === '' || B[ultima].s.charAt(0) === '%')) ultima--;
    if (st.linhaFim < 0 && executou && !pilha.length && !truncado && !erros.length) aviso(ultima, 'O programa termina sem M30 (nem M02): o comando não reinicia nem para o fuso e a refrigeração.', 'semFim', 'semFim');
    if (st.comp) aviso(st.linhaComp, 'G' + st.comp + ' ligado na linha ' + (st.linhaComp + 1) + ' e nunca cancelado (G40) até o fim do programa.', 'compFim', 'compFim');
    if (st.refri && st.linhaFim >= 0) dica(st.linhaFim, 'Refrigeração ligada (M8) e nunca desligada (M9) antes do fim do programa.', 'semM9', 'semM9');
    if (!fim && pc >= NB && NB && pilha.length) aviso(NB - 1, 'Fim do texto dentro de um subprograma (falta M99).', 'semM99');

    /* ----- ferramentas e sugestoes ----- */
    var lista = ordem.map(function (code) { return ferr[code]; });
    lista.forEach(function (f) {
      f.sug = sugereTipo(f);
      if (f.xCorteMin > f.xCorteMax) { f.xCorteMin = f.xCorteMax = f.zCorteMin = f.zCorteMax = null; }
    });
    var usadas = lista.filter(function (f) { return f.nMov > 0 && (f.codigo !== '0000' || f.nCorte > 0); });
    var sug = sugestoes(moves, usadas, g1900, xHome);
    return { moves: moves, ferramentas: usadas, todasFerr: lista, erros: erros, avisos: avisos, dicas: dicas, g1900: g1900, sugestao: sug, start: { x: xHome, z: zHome }, linhas: prep.linhas.length, texto: prep.texto, blocosExec: passos, truncado: truncado };
  }

  // palpite do tipo de ferramenta (para pre-selecionar no banco) a partir do que o programa faz com ela
  function sugereTipo(f) {
    var o = f.ops, com = String(f.comentario || '').toUpperCase(), tipo = 'externa', kind = null;
    if (o.g83 || o.g74furo || /BROCA|FURA|T-MAX|TMAX/.test(com)) tipo = 'furacao';
    else if (o.g76 || o.g76int || /ROSCA|THREAD/.test(com)) { tipo = 'rosca'; kind = o.g76int ? 'roscaint' : 'rosca'; }
    else if (o.canalExt || o.canalInt || /CANAL|ENCAIXE|RANHURA|GROOVE/.test(com)) { tipo = 'encaixe'; kind = o.canalExt ? 'canalext' : (o.canalInt ? 'canalint' : 'canal'); }
    else if (o.int || /INTERN|MANDR|BARRA/.test(com)) tipo = 'interna';
    else if (/FACE/.test(com) && !o.g71 && !o.g74) tipo = 'faceamento';
    return { tipo: tipo, orient: kind };
  }
  function sugestoes(moves, usadas, g1900, xHome) {
    var dMax = 0, zFeedMin = 0, xs = [], rmin = 1e9, rmax = -1e9, zmin = 1e9, zmax = -1e9, sobre = 0;
    moves.forEach(function (m) {
      if (m.x < xHome - 1e-6 && m.x > dMax) dMax = m.x;
      if (m.t !== 'r') { if (m.z < zFeedMin) zFeedMin = m.z; rmin = Math.min(rmin, m.x / 2); rmax = Math.max(rmax, m.x / 2); zmin = Math.min(zmin, m.z); zmax = Math.max(zmax, m.z); }
    });
    var prim = usadas.filter(function (f) { return f.nCorte > 0; })[0];
    if (prim && prim.zAntes != null) sobre = prim.zAntes;
    var num = function (v) { return v != null && isFinite(v) && v > 0 ? Number(v) : null; };
    var furoAuto = null; // bruto ja furado: o primeiro trabalho do programa e mandrilar (sem broca antes)
    if (usadas.length && usadas[0].sug.tipo === 'interna') furoAuto = num(usadas[0].ops.intXA) || (usadas[0].xCorteMin > 0.5 ? usadas[0].xCorteMin : null);
    var d = g1900 && num(g1900.d) ? Number(g1900.d) : (dMax > 0 ? dMax : null);
    var fundo = Math.ceil(-zFeedMin), livre = g1900 && num(g1900.l) ? Math.max(Number(g1900.l), fundo > Number(g1900.l) ? fundo + 3 : 0) : Math.max(10, fundo + 5);
    var foco = zmin < 1e8 ? { z0: zmin - 8, z1: Math.min(zmax, sobre + 20) + 8, r0: Math.max(-10, rmin - 8), r1: rmax + 8 } : { z0: -50, z1: 30, r0: -10, r1: 60 };
    return { d: d, sobre: sobre, livre: livre, furoD: g1900 && num(g1900.e) ? Number(g1900.e) : furoAuto, foco: foco, fonteD: g1900 && num(g1900.d) ? 'G1900' : 'programa' };
  }

  /* ---------- compensacao do raio de ponta (G41/G42) ---------- */
  // O simulador posiciona a pastilha pelo canto virtual (ponta de referencia). Com G41/G42 o centro do raio de ponta fica a rn do contorno
  // programado: G41 a esquerda e G42 a direita do sentido do percurso, no plano (z, r) com +Z a direita e +X acima (externa em cima, interna embaixo).
  // Partida (como o tipo C do Fanuc): o centro vai ao fim do 1o bloco deslocado pela normal do 2o bloco. Saida (G40): ponto de encontro com o
  // bloco de saida e depois reta ate o ponto programado. Canto interno = ponto de encontro das retas deslocadas; canto externo = arco de raio rn.
  function narizDe(forma) { // raio e vetor "referencia -> centro do raio de ponta" (z, r) das pastilhas de torneamento do simulador (vem do proprio formato, com o giro do suporte)
    if (!forma || (forma.kind !== 'rombo' && forma.kind !== 'interna')) return null;
    var rn = Number(forma.raio) || 0, sh = rn > 0.001 ? Sim.toolShape(forma) : null;
    return sh && sh.nose ? { rn: rn, cz: sh.nose[0], cr: sh.nose[1] } : null;
  }
  function segComp(A, B, m, lado, saida) {
    var dz = B[0] - A[0], dr = B[1] - A[1], len = Math.hypot(dz, dr);
    if (len < 1e-9) return null;
    var d = [dz / len, dr / len];
    return { A: A, B: B, d: d, n: lado === 41 ? [-d[1], d[0]] : [d[1], -d[0]], len: len, m: m, saida: !!saida };
  }
  function compTrecho(segs, nz, lado, ref, out, avisa) {
    var rn = nz.rn, cur = [ref[0] + nz.cz, ref[1] + nz.cr], S = segs.length, j, q;
    function vai(sg, c, direto) { // leva o centro (ou, se direto, a propria ponta de referencia) ao ponto c
      var rz = direto ? c[0] : c[0] - nz.cz, rr = direto ? c[1] : c[1] - nz.cr, mv = {};
      Object.keys(sg.m).forEach(function (kk) { mv[kk] = sg.m[kk]; });
      mv.x = 2 * rr; mv.z = rz; mv.label = (sg.m.label || '') + ' · G' + (sg.saida ? 40 : lado);
      out.push(mv); ref = [rz, rr]; cur = [rz + nz.cz, rr + nz.cr];
    }
    function desloca(p, nrm) { return [p[0] + rn * nrm[0], p[1] + rn * nrm[1]]; }
    vai(segs[0], desloca(segs[0].B, S > 1 ? segs[1].n : segs[0].n)); // partida
    for (j = 1; j < S; j++) {
      var sg = segs[j], nx = segs[j + 1];
      if (sg.saida) { vai(sg, sg.B, true); break; }
      if (!nx) { vai(sg, desloca(sg.B, sg.n)); break; }
      var cr = sg.d[0] * nx.d[1] - sg.d[1] * nx.d[0], cs = sg.n[0] * nx.n[0] + sg.n[1] * nx.n[1], giro = lado === 41 ? cr : -cr, ang = Math.acos(Math.max(-1, Math.min(1, cs)));
      var M = 1 + cs > 1e-6 ? [sg.B[0] + rn * (sg.n[0] + nx.n[0]) / (1 + cs), sg.B[1] + rn * (sg.n[1] + nx.n[1]) / (1 + cs)] : desloca(sg.B, sg.n);
      if (ang < 6 * DEG) vai(sg, M); // quase reto (arcos em passos de 5 graus)
      else if (giro > 0) { // canto interno: o percurso dobra para o lado da ferramenta
        var B2 = desloca(nx.B, nx.n);
        if ((M[0] - cur[0]) * sg.d[0] + (M[1] - cur[1]) * sg.d[1] < -1e-6 || (B2[0] - M[0]) * nx.d[0] + (B2[1] - M[1]) * nx.d[1] < -1e-6)
          avisa(sg.m.line, 'G' + lado + ': num canto interno o movimento é menor que o raio de ponta (interferência): a ferramenta cortaria além do contorno. Confira o contorno e o raio da pastilha.', 'int' + sg.m.line);
        vai(sg, M);
      } else { // canto externo: arco de raio rn em volta do vertice
        var a0 = Math.atan2(sg.n[1], sg.n[0]), da = Math.atan2(nx.n[1], nx.n[0]) - a0, np;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        np = Math.max(1, Math.ceil(Math.abs(da) / (10 * DEG)));
        for (q = 0; q <= np; q++) vai(sg, [sg.B[0] + rn * Math.cos(a0 + da * q / np), sg.B[1] + rn * Math.sin(a0 + da * q / np)]);
      }
    }
    return ref;
  }
  // moves: percurso do leitor (m.comp = 0, 41 ou 42); tools: formas do simulador por codigo T. Devolve {path, avisos}
  function compensar(moves, start, tools) {
    if (!moves.some(function (m) { return m.comp; })) return { path: moves, avisos: [] };
    var out = [], avisos = [], visto = {}, n = moves.length, k = 0, prog = [start.z, start.x / 2], ref = prog;
    function avisa(linha, texto, chave) { if (visto[chave]) return; visto[chave] = 1; avisos.push({ linha: linha, texto: texto }); }
    while (k < n) {
      var m = moves[k], e, cancel, nz, segs, q, p0, last;
      if (!m.comp) { out.push(m); prog = [m.z, m.x / 2]; ref = prog; k++; continue; }
      e = k; // trecho compensado: movimentos seguidos com o mesmo G41/G42 e a mesma ferramenta; o primeiro movimento sem compensacao e a saida
      while (e + 1 < n && moves[e + 1].comp === m.comp && moves[e + 1].tool === m.tool) e++;
      cancel = e + 1 < n && !moves[e + 1].comp && moves[e + 1].tool === m.tool ? e + 1 : -1;
      last = cancel >= 0 ? cancel : e;
      nz = narizDe(tools[m.tool]);
      if (!nz) {
        avisa(m.line, 'G' + m.comp + ' ativo com a ferramenta T' + m.tool + ', mas ela não tem raio de ponta no banco (ou não é pastilha de torneamento): simulado sem compensação, na ponta programada.', 'sr' + m.tool);
        for (q = k; q <= e; q++) out.push(moves[q]);
        prog = [moves[e].z, moves[e].x / 2]; ref = prog; k = e + 1; continue;
      }
      segs = []; p0 = prog;
      for (q = k; q <= last; q++) {
        var sg = segComp(p0, [moves[q].z, moves[q].x / 2], moves[q], m.comp, q === cancel);
        if (sg) { segs.push(sg); p0 = sg.B; }
      }
      if (segs.length === 1 && segs[0].saida) out.push(moves[cancel]); // so restou o movimento de saida: nada a compensar
      else if (segs.length) ref = compTrecho(segs, nz, m.comp, ref, out, avisa);
      prog = [moves[last].z, moves[last].x / 2];
      k = last + 1;
    }
    return { path: out, avisos: avisos };
  }

  /* ---------- cena para o simulador ---------- */
  // tipo de forma no simulador (sim.js toolShape) a partir da ferramenta do banco; orient = orientacao escolhida (canal/rosca)
  function kindDe(t, orient) {
    if (!t) return null;
    switch (t.tipo) {
      case 'interna': return 'interna';
      case 'encaixe': return orient === 'canalext' || orient === 'canalint' ? orient : 'canal';
      case 'furacao': return 'broca';
      case 'rosca': return orient === 'roscaint' ? 'roscaint' : 'rosca';
      default: return null;
    }
  }
  function formaFerr(t, orient) { // objeto de ferramenta do simulador
    if (!t) return { kind: 'rombo', ang: 80, raio: 0, vc: 0, rpm: 0, modo: 'G97' };
    return CNC.simTool(t, kindDe(t, orient));
  }
  // cfg: {d, sobre, livre, grip, furoD, maq, ferr: {codigo: {tool, orient}}}  (campos vazios = automatico)
  function montarCena(res, cfg) {
    cfg = cfg || {};
    var maq = Object.assign({}, CNC.DEFAULT_MAQ, cfg.maq || {});
    if (maq.xHome == null) maq.xHome = maq.xMax;
    var sg = res.sugestao, pos = function (v) { return v !== '' && v != null && isFinite(v) && Number(v) > 0 ? Number(v) : null; };
    var d = pos(cfg.d) || sg.d || 100, sobre = cfg.sobre !== '' && cfg.sobre != null && isFinite(cfg.sobre) && Number(cfg.sobre) >= 0 ? Number(cfg.sobre) : sg.sobre;
    var livre = pos(cfg.livre) || sg.livre, grip = pos(cfg.grip) || maq.grip || 25, furoD = pos(cfg.furoD) || sg.furoD;
    var bruto = { d: d, z0: sobre, z1: -(livre + grip) };
    if (furoD && furoD < d) bruto.vazios = [[[sobre + 5, -1], [bruto.z1 - 5, -1], [bruto.z1 - 5, furoD / 2], [sobre + 5, furoD / 2]]];
    var tools = {};
    res.todasFerr.forEach(function (f) {
      var c = cfg.ferr && cfg.ferr[f.codigo];
      tools[f.codigo] = formaFerr(c && c.tool, c && c.orient);
    });
    if (!tools['0000']) tools['0000'] = formaFerr(null);
    var comp = compensar(res.moves, res.start, tools), F = sg.foco;
    return {
      bruto: bruto,
      chuck: { zFace: -livre, zBack: bruto.z1 - 20, rOut: maq.chuckD / 2 },
      outline: [], hStock: 0,
      foco: { z0: Math.min(F.z0, -livre), z1: Math.max(F.z1, sobre + 5), r0: F.r0, r1: Math.max(F.r1, 5) },
      maq: maq, semPerfil: true,
      path: comp.path, compAvisos: comp.avisos, compensada: true, start: { x: res.start.x, z: res.start.z }, tools: tools
    };
  }

  // Programa do Gerador: os movimentos do acabamento marcados com comp (G41/G42) ganham o desvio do raio de ponta da ferramenta que o gerador usou
  // (cena.tools). A cena original nao e alterada; cena que ja vem compensada (modulo Simulacao) ou sem compensacao volta como veio.
  function comCompensacao(cena) {
    if (!cena || cena.compensada || !cena.path || !cena.path.some(function (m) { return m.comp; })) return cena;
    return Object.assign({}, cena, { path: compensar(cena.path, cena.start, cena.tools).path, compensada: true });
  }

  // Programa do Gerador: o percurso vem do core.js (sem o texto decodificado). Le o mesmo codigo e devolve a cena com o texto de cada linha
  // (primeira execucao da linha); a cena original nao e alterada. Cena que ja traz o texto (modulo Simulacao) volta como veio.
  function comDecodificado(cena, texto, maq) {
    if (!cena || !cena.path || !cena.path.length || cena.path[0].dec || !texto) return cena;
    var R = interpretar(texto, { maq: maq || cena.maq }), mapa = {};
    R.moves.forEach(function (m) { if (mapa[m.line] === undefined) mapa[m.line] = m.dec; });
    return Object.assign({}, cena, { path: cena.path.map(function (m) { return mapa[m.line] ? Object.assign({}, m, { dec: mapa[m.line] }) : m; }) });
  }

  return { interpretar: interpretar, prepara: prepara, montarCena: montarCena, formaFerr: formaFerr, kindDe: kindDe, tcode: tcode, compensar: compensar, numTxt: numTxt, comDecodificado: comDecodificado, comCompensacao: comCompensacao };
});
