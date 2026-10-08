/* Motor de simulacao 2D (corte XZ, meia secao) - sem dependencia de DOM.
   Coordenadas do percurso: X = diametro, Z = eixo. Internamente: (z, r) com r = X/2 em mm.
   Material = grade de celulas; a pastilha remove celulas durante os movimentos de corte. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CNCSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DEG = Math.PI / 180;
  var MARGEM = 0.03; // mm: tolerancia p/ encostar sem contar como colisao

  /* ---------- geometria da ferramenta (poligono convexo, anti-horario) ---------- */
  // Ponto de referencia (0,0) = ponta programada. Eixos: [z, r].
  function toolShape(tool) {
    var pts = [], i;
    if (tool.kind === 'canal') {
      var w = Math.max(0.5, Number(tool.largura) || 4.5), L = 12;
      // canto interno (lado do centro) = ponto programado; largura cresce para fora (+r)
      pts = [[0, 0], [L, 0], [L, w], [0, w]];
    } else if (tool.kind === 'canalext') {
      // canal externo (radial): largura em Z, corpo para fora (+r); ponto programado = canto da ponta do lado da face (+z)
      var we = Math.max(0.5, Number(tool.largura) || 4.5), Le = 14;
      pts = [[-we, 0], [0, 0], [0, Le], [-we, Le]];
    } else if (tool.kind === 'canalint') {
      // canal interno (radial): a barra fica dentro do furo (lado do eixo, -r) e a pastilha corta para fora (+r); ponto programado = canto da ponta do lado da face (+z)
      var wi = Math.max(0.5, Number(tool.largura) || 4.5), Li = 8;
      pts = [[-wi, 0], [-wi, -Li], [0, -Li], [0, 0]];
    } else if (tool.kind === 'rosca' || tool.kind === 'roscaint') {
      // ferramenta de rosca 60 graus: ponta em V; externa fica fora (+r) com a ponta para o eixo, interna dentro (-r) com a ponta para fora
      var hr = 8, ar = hr * Math.tan(30 * DEG);
      pts = tool.kind === 'rosca' ? [[0, 0], [ar, hr], [-ar, hr]] : [[0, 0], [-ar, -hr], [ar, -hr]];
    } else if (tool.kind === 'broca') {
      // broca (furacao no eixo): ponta programada = centro da ponta; o corpo cobre de r = 0 ate o raio da broca e recua em +z
      var rd = Math.max(0.5, (Number(tool.largura) || 10) / 2), Ld = 40;
      pts = [[0, 0], [Ld, 0], [Ld, rd], [0, rd]];
    } else {
      var a = (Number(tool.ang) || 80) * DEG, rn = Math.max(0, Number(tool.raio) || 0), Lb = 12;
      var u1 = [1, 0], u2 = [Math.cos(a), Math.sin(a)];
      var E1 = [Lb * u1[0], Lb * u1[1]], E2 = [Lb * u2[0], Lb * u2[1]];
      var far = [E1[0] + E2[0], E1[1] + E2[1]];
      if (rn > 0.001) {
        var half = a / 2, d = rn / Math.sin(half);
        var bx = u1[0] + u2[0], by = u1[1] + u2[1], bl = Math.hypot(bx, by);
        var C = [d * bx / bl, d * by / bl];
        var th2 = 90 * DEG + a, th1 = 270 * DEG, n = 8;
        for (i = 0; i <= n; i++) {
          var th = th2 + (th1 - th2) * i / n;
          pts.push([C[0] + rn * Math.cos(th), C[1] + rn * Math.sin(th)]);
        }
      } else pts.push([0, 0]);
      pts.push(E1, far, E2);
      // referencia = canto do inserto real (zerado encostando na face e no Ø), nao o canto virtual:
      // sem compensacao de raio (G41/G42) o raio de ponta so deixa a sobra do canto, nao uma camada na face
      var zm = 1e9, rm = 1e9;
      pts.forEach(function (p) { if (p[0] < zm) zm = p[0]; if (p[1] < rm) rm = p[1]; });
      pts = pts.map(function (p) { return [p[0] - zm, p[1] - rm]; });
      if (tool.kind === 'interna') {
        // mandrilamento: a barra fica dentro do furo (lado do eixo, -r) e a pastilha corta para fora (+r);
        // espelha em r (ponta continua sendo o ponto programado) e mantem o sentido anti-horario
        pts = pts.map(function (p) { return [p[0], -p[1]]; }).reverse();
      }
    }
    // arestas
    var edges = [], zmin = 1e9, zmax = -1e9, rmin = 1e9, rmax = -1e9;
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      var ex = q[0] - p[0], ey = q[1] - p[1], len = Math.hypot(ex, ey);
      if (len > 1e-9) edges.push([p[0], p[1], ex, ey, len]);
      zmin = Math.min(zmin, p[0]); zmax = Math.max(zmax, p[0]); rmin = Math.min(rmin, p[1]); rmax = Math.max(rmax, p[1]);
    }
    return { pts: pts, edges: edges, bb: [zmin, zmax, rmin, rmax] };
  }
  function insideShape(sh, dz, dr) {
    var E = sh.edges;
    for (var i = 0; i < E.length; i++) {
      var e = E[i];
      if ((e[2] * (dr - e[1]) - e[3] * (dz - e[0])) < MARGEM * e[4]) return false;
    }
    return true;
  }
  function inPoly(poly, pz, pr) { // par-impar
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > pr) !== (b[1] > pr) && pz < (b[0] - a[0]) * (pr - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  function distPoly(poly, pz, pr) { // menor distancia do ponto as arestas do poligono
    var best = 1e9;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[j], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, ((pz - a[0]) * dx + (pr - a[1]) * dy) / l2)) : 0;
      var d = Math.hypot(pz - (a[0] + t * dx), pr - (a[1] + t * dy));
      if (d < best) best = d;
    }
    return best;
  }

  /* ---------- simulador ---------- */
  function Sim(scene) {
    var self = this;
    this.scene = scene;
    var B = scene.bruto, maq = scene.maq;
    // bruto cilindrico (d) ou com perfil: [{z0, z1, d, d1?}], de cima para baixo; d1 (opcional) = diametro em z1 (trecho conico)
    var perfil = B.perfil || null;
    this.rB = B.d / 2;
    if (perfil) perfil.forEach(function (s) { self.rB = Math.max(self.rB, s.d / 2, (s.d1 != null ? s.d1 : s.d) / 2); });
    function rAt(z) {
      if (!perfil) return B.d / 2;
      for (var q = 0; q < perfil.length; q++) {
        var s = perfil[q];
        if (z >= s.z1 && z <= s.z0) {
          if (s.d1 == null || s.z0 === s.z1) return s.d / 2;
          return (s.d + (s.d1 - s.d) * (s.z0 - z) / (s.z0 - s.z1)) / 2;
        }
      }
      return -1;
    }
    this.cs = 0.5;
    var chuck = scene.chuck;
    this.zlo = Math.min(B.z1, chuck ? chuck.zBack : B.z1) - 3;
    this.zhi = B.z0 + 20;
    this.rlo = -3;
    this.rhi = Math.max(this.rB, chuck ? chuck.rOut : 0) + 3;
    this.nz = Math.ceil((this.zhi - this.zlo) / this.cs);
    this.nr = Math.ceil((this.rhi - this.rlo) / this.cs);
    var n = this.nz * this.nr;
    this.mat0 = new Uint8Array(n);
    this.chk = new Uint8Array(n);
    this.prot = new Uint8Array(n);
    this.clear = new Uint8Array(n); // celulas que deveriam estar vazias no fim
    var i, j, cz, cr, k, rcol = new Float64Array(this.nz);
    for (i = 0; i < this.nz; i++) rcol[i] = rAt(this.zlo + (i + 0.5) * this.cs); // raio do bruto por coluna (uma vez so)
    // furos/cavidades: scene.holes = cavidades da peca ACABADA (poligonos z,r); B.vazios = cavidades que o bruto ja traz (feitas em outra operacao)
    var holes = scene.holes || [], vazios = B.vazios || [];
    function emLista(L, z, r) { for (var q = 0; q < L.length; q++) if (inPoly(L[q], z, r)) return true; return false; }
    function distLista(L, z, r) { var m = 1e9; for (var q = 0; q < L.length; q++) m = Math.min(m, distPoly(L[q], z, r)); return m; }
    for (j = 0; j < this.nr; j++) {
      cr = this.rlo + (j + 0.5) * this.cs;
      for (i = 0; i < this.nz; i++) {
        cz = this.zlo + (i + 0.5) * this.cs; k = j * this.nz + i;
        if (cz >= B.z1 && cz <= B.z0 && cr >= 0 && cr <= rcol[i] && !(vazios.length && emLista(vazios, cz, cr))) this.mat0[k] = 1;
        // placa: as castanhas seguram o diametro externo (r acima do bruto); atras da peca a placa e inteira. Dentro do furo nao ha castanha.
        if (chuck && cz >= chuck.zBack && cz <= chuck.zFace && cr <= chuck.rOut && (cz < B.z1 || rcol[i] < 0 || cr >= rcol[i] - 0.01)) this.chk[k] = 1;
        var naCav = holes.length && emLista(holes, cz, cr);
        if (this.mat0[k] && scene.protect && inPoly(scene.protect, cz, cr) && !naCav) this.prot[k] = 1;
        // "deveria estar vazia no fim": fora da peca acabada e a mais de 0,15 mm dela (ignora lascas de resolucao)
        if (!scene.semPerfil && this.mat0[k] && !this.prot[k] && !(scene.ignore && inPoly(scene.ignore, cz, cr)) && // semPerfil: programa colado, sem peca acabada para comparar
          (!scene.protect || distPoly(scene.protect, cz, cr) > 0.15) && (!naCav || distLista(holes, cz, cr) > 0.15)) this.clear[k] = 1;
      }
    }
    this.shapes = {};
    Object.keys(scene.tools).forEach(function (key) { self.shapes[key] = toolShape(scene.tools[key]); });

    // segmentos com tempo
    var pos = { x: scene.start.x, z: scene.start.z }, t = 0, segs = [];
    scene.path.forEach(function (m) {
      var dx = (m.x - pos.x) / 2, dz = m.z - pos.z, len = Math.hypot(dx, dz);
      if (!(len >= 1e-9)) return; // ignora movimento nulo ou com coordenada invalida (NaN): nao contamina o tempo de ciclo
      var tool = scene.tools[m.tool] || {}, rpm = 0, dur;
      if (m.t === 'r') dur = len / ((maq.rapido || 20000) / 60);
      else {
        rpm = self.rpmAt((pos.x + m.x) / 2, m.spin || tool); // m.spin: G96/G97 e S do proprio programa (modulo Simulacao)
        dur = len / Math.max(1e-6, (m.f || 0.1) * rpm / 60);
      }
      segs.push({ x0: pos.x, z0: pos.z, x1: m.x, z1: m.z, len: len, t0: t, dur: dur, type: m.t, line: m.line, tool: m.tool, label: m.label || '', f: m.f || 0, rpm: rpm, dec: m.dec || '' });
      t += dur; pos = { x: m.x, z: m.z };
    });
    this.segs = segs; this.total = t;
    // grupos por linha de G-code (para passo a passo)
    var groups = [];
    segs.forEach(function (s, idx) {
      var g = groups[groups.length - 1];
      if (g && g.line === s.line) { g.t1 = s.t0 + s.dur; g.last = idx; }
      else groups.push({ line: s.line, t0: s.t0, t1: s.t0 + s.dur, first: idx, last: idx });
    });
    this.groups = groups;
    this.reset();
  }

  Sim.prototype.rpmAt = function (x, tool) {
    var lim = Number(tool.rpm) || 2000;
    if (tool.modo === 'G97') return lim;
    var vc = Number(tool.vc) || 100;
    return Math.min(lim, 1000 * vc / (Math.PI * Math.max(Math.abs(x), 1)));
  };

  Sim.prototype.reset = function () {
    this.mat = new Uint8Array(this.mat0);
    this.t = 0;
  };

  Sim.prototype.posAt = function (t) {
    var segs = this.segs;
    if (!segs.length) return { x: this.scene.start.x, z: this.scene.start.z, seg: -1 };
    t = Math.max(0, Math.min(this.total, t));
    // busca binaria
    var lo = 0, hi = segs.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (segs[mid].t0 < t) lo = mid; else hi = mid - 1; } // estrito: no limite entre movimentos vale o que acabou de executar
    var s = segs[lo], u = s.dur > 0 ? Math.min(1, Math.max(0, (t - s.t0) / s.dur)) : 1;
    if (t < segs[0].t0) { return { x: this.scene.start.x, z: this.scene.start.z, seg: 0, s: segs[0] }; }
    return { x: s.x0 + (s.x1 - s.x0) * u, z: s.z0 + (s.z1 - s.z0) * u, seg: lo, s: s, u: u };
  };

  // percorre [t0,t1] chamando fn(seg, x, z) a cada passo
  Sim.prototype._walk = function (t0, t1, fn) {
    var segs = this.segs;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], e = s.t0 + s.dur;
      if (e <= t0) continue;
      if (s.t0 >= t1) break;
      var u0 = Math.max(0, (t0 - s.t0) / s.dur), u1 = Math.min(1, (t1 - s.t0) / s.dur);
      var stepLen = s.type === 'f' ? this.cs / 2 : this.cs;
      var n = Math.max(1, Math.ceil(s.len * (u1 - u0) / stepLen));
      for (var k = 1; k <= n; k++) {
        var u = u0 + (u1 - u0) * k / n;
        fn(s, i, s.x0 + (s.x1 - s.x0) * u, s.z0 + (s.z1 - s.z0) * u, s.t0 + s.dur * u);
      }
    }
  };

  // aplica a ferramenta em (x,z); cut = remove material; devolve contadores
  Sim.prototype._stamp = function (key, x, z, cut, info) {
    var sh = this.shapes[key]; if (!sh) return;
    var tz = z, tr = x / 2, bb = sh.bb, cs = this.cs;
    var i0 = Math.max(0, Math.floor((tz + bb[0] - this.zlo) / cs)), i1 = Math.min(this.nz - 1, Math.floor((tz + bb[1] - this.zlo) / cs));
    var j0 = Math.max(0, Math.floor((tr + bb[2] - this.rlo) / cs)), j1 = Math.min(this.nr - 1, Math.floor((tr + bb[3] - this.rlo) / cs));
    var mat = this.mat, chk = this.chk, prot = this.prot;
    for (var j = j0; j <= j1; j++) {
      var cr = this.rlo + (j + 0.5) * cs - tr;
      for (var i = i0; i <= i1; i++) {
        var k = j * this.nz + i;
        if (!mat[k] && !chk[k]) continue;
        var cz = this.zlo + (i + 0.5) * cs - tz;
        if (!insideShape(sh, cz, cr)) continue;
        if (chk[k]) { if (info) info.chuck++; continue; }
        if (cut) { mat[k] = 0; if (info && prot[k]) info.gouge++; }
        else if (info) info.mat++;
      }
    }
  };

  // avanca a simulacao ate t (se t menor que o atual, recomeca)
  Sim.prototype.seek = function (t) {
    t = Math.max(0, Math.min(this.total, t));
    if (t < this.t) this.reset();
    var self = this;
    this._walk(this.t, t, function (s, i, x, z) {
      if (s.type === 'f') self._stamp(s.tool, x, z, true, null);
    });
    this.t = t;
    return this.state();
  };

  Sim.prototype.state = function () {
    var p = this.posAt(this.t), s = p.s;
    return { t: this.t, x: p.x, z: p.z, seg: p.seg, line: s ? s.line : -1, type: s ? s.type : 'r', tool: s ? s.tool : 'a', label: s ? s.label : '', f: s ? s.f : 0, rpm: s ? s.rpm : 0, dec: s ? s.dec : '' };
  };

  // analise completa: tempos e alertas
  Sim.prototype.analyze = function () {
    var self = this, sc = this.scene, maq = sc.maq, alerts = [], seen = {};
    var saveMat = this.mat, saveT = this.t;
    this.mat = new Uint8Array(this.mat0);
    // um alerta por (tipo, linha do G-code); repeticoes viram contagem
    function add(type, s, i, x, z, text, tt) {
      var key = type + ':' + s.line;
      if (seen[key]) { seen[key].n++; return; }
      var a = { type: type, t: tt, seg: i, line: s.line, x: x, z: z, text: text, label: s.label, n: 1 };
      seen[key] = a;
      if (alerts.length < 60) alerts.push(a);
    }
    // limites minimos de sobreposicao (celulas de 0,25 mm2): evita ruido de raspadas de decimos de mm
    var MIN_RAPIDO = 6, MIN_PECA = 3;
    this._walk(0, this.total, function (s, i, x, z, tt) {
      var info = { chuck: 0, gouge: 0, mat: 0 };
      self._stamp(s.tool, x, z, s.type === 'f', info);
      if (info.chuck) add('placa', s, i, x, z, 'Colisão com a placa (castanhas) em X' + fx(x) + ' Z' + fx(z), tt);
      if (info.gouge >= MIN_PECA) add('peca', s, i, x, z, 'Corte dentro da peça acabada em X' + fx(x) + ' Z' + fx(z), tt);
      if (s.type === 'r' && info.mat >= MIN_RAPIDO) add('rapido', s, i, x, z, 'Avanço rápido (G0) dentro do material em X' + fx(x) + ' Z' + fx(z), tt);
      if (maq.xMax && x > maq.xMax) add('limite', s, i, x, z, 'X' + fx(x) + ' passa do curso de X (' + maq.xMax + ')', tt);
      if (x < -5) add('limite', s, i, x, z, 'X' + fx(x) + ' abaixo do centro', tt);
      if (maq.zMax && z > maq.zMax) add('limite', s, i, x, z, 'Z' + fx(z) + ' passa do curso de Z (+' + maq.zMax + ')', tt);
      if (maq.zMin != null && z < maq.zMin) add('limite', s, i, x, z, 'Z' + fx(z) + ' abaixo do curso de Z (' + maq.zMin + ')', tt);
    });
    // alerta com o tempo exato do primeiro passo problemático: usa t0 do segmento
    alerts.forEach(function (a) {
      if (a.n > 1) a.text += ' (e mais ' + (a.n - 1) + ' ponto' + (a.n > 2 ? 's' : '') + ' nesta linha)';
    });
    alerts.sort(function (a, b) { return a.t - b.t; });
    // sobra de material
    var left = 0, k, cs = this.cs, nz = this.nz, nr = this.nr, seen2 = new Uint8Array(this.mat.length), big = { n: 0, sz: 0, sr: 0 };
    for (k = 0; k < this.mat.length; k++) {
      if (!(this.clear[k] && this.mat[k])) continue;
      left++;
      if (seen2[k]) continue;
      // aglomerado conectado (8 vizinhos) de celulas que deveriam estar vazias
      var stack = [k], cnt = 0, sz = 0, sr = 0; seen2[k] = 1;
      while (stack.length) {
        var c = stack.pop(), ci = c % nz, cj = (c - ci) / nz; cnt++; sz += ci; sr += cj;
        for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
          var ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= nz || nj >= nr) continue;
          var nk = nj * nz + ni; if (seen2[nk] || !(this.clear[nk] && this.mat[nk])) continue;
          seen2[nk] = 1; stack.push(nk);
        }
      }
      if (cnt > big.n) big = { n: cnt, sz: sz / cnt, sr: sr / cnt };
    }
    var area = left * cs * cs, bigArea = big.n * cs * cs;
    // a folga da aresta da pastilha (ex.: 80 graus => 10 graus) deixa uma cunha normal no ombro
    var ta = sc.tools.a, cunha = 0;
    if (ta && ta.kind === 'rombo' && sc.hStock > 0) cunha = 0.5 * sc.hStock * sc.hStock * Math.tan((90 - (ta.ang || 80)) * DEG);
    if (bigArea > 4 + 1.3 * cunha) {
      var bz = this.zlo + (big.sz + 0.5) * cs, bx = 2 * (this.rlo + (big.sr + 0.5) * cs);
      alerts.push({ type: 'sobra', t: this.total, seg: this.segs.length - 1, line: -1, x: bx, z: bz, text: 'Sobra de material no fim do programa: maior região ≈ ' + bigArea.toFixed(1) + ' mm² perto de X' + fx(bx) + ' Z' + fx(bz) + '. Confira incrementos, comprimento da pastilha e o perfil.', label: '' });
    }
    // tempos
    var tCut = 0, tRap = 0, dCut = 0, dRap = 0;
    this.segs.forEach(function (s) { if (s.type !== 'r') { tCut += s.dur; dCut += s.len; } else { tRap += s.dur; dRap += s.len; } });
    this.mat = saveMat; this.t = saveT;
    return { alerts: alerts, total: this.total, tCut: tCut, tRapid: tRap, dCut: dCut, dRapid: dRap, sobraArea: area };
  };
  function fx(v) { return (Math.round(v * 100) / 100).toString(); }

  Sim.prototype.toolPoly = function (key, x, z) {
    var sh = this.shapes[key]; if (!sh) return [];
    return sh.pts.map(function (p) { return [z + p[0], x / 2 + p[1]]; });
  };

  return { Sim: Sim, toolShape: toolShape, inPoly: inPoly };
});



