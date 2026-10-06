/* Interface do simulador: canvas (corte XZ), controles, codigo destacado, alertas. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fx(v, d) { return (Math.round(v * Math.pow(10, d == null ? 2 : d)) / Math.pow(10, d == null ? 2 : d)).toString(); }
  function mmss(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  var cv, ctx, mc, mctx, sim = null, res = null, codeLines = [], analysis = null;
  var view = { s: 3, ox: 0, oy: 0, follow: false };
  var st = { t: 0, playing: false, speed: 10, trace: true, tool: true, dirty: true, last: 0, raf: 0, lineShown: -2 };
  var pending = null, buildTimer = 0, active = false;
  var cols = {};

  function readCols() {
    var cs = getComputedStyle(document.documentElement);
    ['bg', 'mat', 'chuck', 'outline', 'feed', 'rapid', 'toolcut', 'toolrapid', 'alert', 'axis', 'text'].forEach(function (k) {
      cols[k] = cs.getPropertyValue('--sim-' + k).trim() || '#888';
    });
  }

  /* ---------- montagem ---------- */
  function build() {
    if (!pending || !pending.cena) { sim = null; analysis = null; renderSide(); st.dirty = true; draw(); return; }
    res = pending; codeLines = res.code.split('\n');
    sim = new CNCSim.Sim(res.cena);
    analysis = sim.analyze();
    mc = document.createElement('canvas'); mc.width = sim.nz; mc.height = sim.nr; mctx = mc.getContext('2d');
    sim.reset(); st.t = 0; st.playing = false; st.lineShown = -2;
    fit();
    renderSide(); updateControls(); st.dirty = true; draw();
  }

  function setResult(r) {
    pending = r && r.cena ? r : null;
    if (!active) return;
    clearTimeout(buildTimer);
    buildTimer = setTimeout(build, 120);
  }
  function show() { active = true; resize(); if (!sim || sim.scene !== (pending && pending.cena)) build(); else { st.dirty = true; draw(); } }
  function hide() { active = false; pause(); }

  /* ---------- vista ---------- */
  function resize() {
    var w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sim) fit(); st.dirty = true; draw();
  }
  function fit() {
    if (!sim) return;
    var B = sim.scene.bruto, w = cv.clientWidth || 600, h = cv.clientHeight || 400;
    var zmin = B.z1 - 8, zmax = B.z0 + 20, rmin = -10, rmax = sim.rB + 14;
    view.s = Math.min(w / (zmax - zmin), h / (rmax - rmin));
    view.ox = w / 2 - (zmin + zmax) / 2 * view.s;
    view.oy = h / 2 + (rmin + rmax) / 2 * view.s;
  }
  function fitProfile() {
    if (!sim) return;
    var F = sim.scene.foco, w = cv.clientWidth || 600, h = cv.clientHeight || 400;
    view.s = Math.min(w / (F.z1 - F.z0), h / (F.r1 - F.r0));
    view.ox = w / 2 - (F.z0 + F.z1) / 2 * view.s;
    view.oy = h / 2 + (F.r0 + F.r1) / 2 * view.s;
  }
  function sx(z) { return view.ox + z * view.s; }
  function sy(r) { return view.oy - r * view.s; }

  /* ---------- desenho ---------- */
  function draw() {
    if (!ctx || !active) return;
    var w = cv.clientWidth, h = cv.clientHeight;
    readCols();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cols.bg; ctx.fillRect(0, 0, w, h);
    if (!sim) {
      ctx.fillStyle = cols.text; ctx.font = '14px system-ui,sans-serif';
      ctx.fillText('Corrija os erros nas medidas para simular.', 20, 30);
      return;
    }
    var s = view.s, i, k;
    if (view.follow) {
      var pf = sim.posAt(st.t); view.ox = w / 2 - pf.z * s; view.oy = h / 2 + (pf.x / 2) * s;
    }
    // material e placa (grade)
    var img = mctx.createImageData(sim.nz, sim.nr), d = img.data, mat = sim.mat, chk = sim.chk;
    var cm = rgb(cols.mat), cc = rgb(cols.chuck), j, p, kk;
    for (j = 0; j < sim.nr; j++) {
      var rowOff = (sim.nr - 1 - j) * sim.nz;
      for (i = 0; i < sim.nz; i++) {
        kk = j * sim.nz + i; p = (rowOff + i) * 4;
        if (chk[kk]) { d[p] = cc[0]; d[p + 1] = cc[1]; d[p + 2] = cc[2]; d[p + 3] = 255; }
        else if (mat[kk]) { d[p] = cm[0]; d[p + 1] = cm[1]; d[p + 2] = cm[2]; d[p + 3] = 255; }
      }
    }
    mctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mc, 0, 0, sim.nz, sim.nr, sx(sim.zlo), sy(sim.rhi), sim.nz * sim.cs * s, sim.nr * sim.cs * s);

    // eixo
    ctx.strokeStyle = cols.axis; ctx.lineWidth = 1; ctx.setLineDash([10, 4, 2, 4]);
    ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(w, sy(0)); ctx.stroke(); ctx.setLineDash([]);
    // Z0
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), h); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cols.axis; ctx.font = '11px system-ui,sans-serif'; ctx.fillText('Z0', sx(0) + 4, 12);

    // perfil acabado
    var ol = sim.scene.outline;
    ctx.strokeStyle = cols.outline; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
    ctx.beginPath();
    for (i = 0; i < ol.length; i++) { if (i === 0) ctx.moveTo(sx(ol[i][0]), sy(ol[i][1])); else ctx.lineTo(sx(ol[i][0]), sy(ol[i][1])); }
    ctx.stroke(); ctx.setLineDash([]);

    // trajeto percorrido
    if (st.trace) {
      var segs = sim.segs, n = 0;
      ctx.lineWidth = 1;
      for (k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.strokeStyle = k === 0 ? cols.rapid : cols.feed;
        ctx.setLineDash(k === 0 ? [3, 4] : []);
        for (i = 0; i < segs.length; i++) {
          var sg = segs[i]; if (sg.t0 >= st.t) break;
          if ((sg.type === 'r') !== (k === 0)) continue;
          var u = Math.min(1, (st.t - sg.t0) / sg.dur);
          ctx.moveTo(sx(sg.z0), sy(sg.x0 / 2));
          ctx.lineTo(sx(sg.z0 + (sg.z1 - sg.z0) * u), sy((sg.x0 + (sg.x1 - sg.x0) * u) / 2));
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // pastilha
    var stt = sim.state();
    var tipx = sx(stt.z), tipy = sy(stt.x / 2);
    if (st.tool) {
      var poly = sim.toolPoly(stt.tool, stt.x, stt.z);
      ctx.beginPath();
      poly.forEach(function (q, idx) { if (idx === 0) ctx.moveTo(sx(q[0]), sy(q[1])); else ctx.lineTo(sx(q[0]), sy(q[1])); });
      ctx.closePath();
      ctx.fillStyle = stt.type !== 'r' ? cols.toolcut : cols.toolrapid;
      ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = cols.text; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.strokeStyle = cols.alert; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tipx - 6, tipy); ctx.lineTo(tipx + 6, tipy); ctx.moveTo(tipx, tipy - 6); ctx.lineTo(tipx, tipy + 6); ctx.stroke();

    // alertas ja alcancados
    if (analysis) analysis.alerts.forEach(function (a) {
      if (a.type === 'sobra' || a.t > st.t + 1e-9) return;
      ctx.strokeStyle = cols.alert; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(a.z), sy(a.x / 2), 10, 0, Math.PI * 2); ctx.stroke();
    });

    // ferramenta fora da vista
    if (tipx < -10 || tipx > w + 10 || tipy < -10 || tipy > h + 10) {
      ctx.fillStyle = cols.text; ctx.font = '12px system-ui,sans-serif';
      ctx.fillText('Ferramenta fora da vista: X' + fx(stt.x, 1) + ' Z' + fx(stt.z, 1), 12, h - 12);
    }
    // escala
    var nice = [1, 2, 5, 10, 20, 50, 100], len = 10;
    for (i = 0; i < nice.length; i++) { len = nice[i]; if (len * s > 60) break; }
    ctx.strokeStyle = cols.text; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(w - 16 - len * s, h - 16); ctx.lineTo(w - 16, h - 16); ctx.stroke();
    ctx.fillStyle = cols.text; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(len + ' mm', w - 16, h - 22); ctx.textAlign = 'left';
    ctx.fillText('Z →   X ↑ (meia seção)', 10, 14);

    updateReadout(stt);
    st.dirty = false;
  }
  function rgb(c) {
    c = String(c).trim();
    if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
    var m = c.match(/\d+/g) || [128, 128, 128]; return [+m[0], +m[1], +m[2]];
  }

  /* ---------- leitura / controles ---------- */
  function updateReadout(stt) {
    $('#simPos').textContent = 'X' + fx(stt.x) + '  Z' + fx(stt.z);
    $('#simMode').textContent = stt.type === 'f' ? 'AVANÇO F' + fx(stt.f, 3) + ' · ' + Math.round(stt.rpm) + ' RPM' : stt.type === 't' ? 'ROSCA (G76) · passo ' + fx(stt.f, 3) + ' · ' + Math.round(stt.rpm) + ' RPM' : 'RÁPIDO (G0)';
    $('#simMode').className = 'sim-badge ' + (stt.type !== 'r' ? 'cut' : 'rapid');
    $('#simLabel').textContent = stt.label || '—';
    $('#simTime').textContent = mmss(st.t) + ' / ' + mmss(sim.total);
    $('#simSlider').value = String(Math.round(st.t * 100));
    if (stt.line !== st.lineShown) { st.lineShown = stt.line; highlightLine(stt.line); }
  }
  function highlightLine(line) {
    var box = $('#simCode'), prev = box.querySelector('.ln.on');
    if (prev) prev.classList.remove('on');
    if (line < 0) return;
    var el = box.querySelector('.ln[data-i="' + line + '"]');
    if (el) {
      el.classList.add('on');
      var top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
      box.scrollTop = Math.max(0, top);
    }
  }
  function renderSide() {
    var box = $('#simCode');
    box.innerHTML = codeLines.map(function (l, i) { return '<div class="ln" data-i="' + i + '"><span class="no">' + (i + 1) + '</span>' + esc(l) + '</div>'; }).join('');
    var al = $('#simAlerts'), stats = $('#simStats'), marks = $('#simMarks');
    if (!analysis) { al.innerHTML = ''; stats.innerHTML = ''; marks.innerHTML = ''; return; }
    stats.innerHTML = '<span class="chip">Tempo de ciclo ≈ <b>' + mmss(analysis.total) + '</b></span>' +
      '<span class="chip">Corte <b>' + mmss(analysis.tCut) + '</b> (' + fx(analysis.dCut, 0) + ' mm)</span>' +
      '<span class="chip">Rápido <b>' + mmss(analysis.tRapid) + '</b> (' + fx(analysis.dRapid, 0) + ' mm)</span>';
    var real = analysis.alerts;
    al.innerHTML = real.length ? real.map(function (a, i) {
      var linha = a.line >= 0 ? ' · linha ' + (a.line + 1) : '';
      return '<button class="alert-item ' + a.type + '" data-i="' + i + '"><b>' + tituloAlerta(a.type) + '</b>' + esc(a.text) + linha + '</button>';
    }).join('') : '<div class="alert-ok">Nenhuma colisão, corte indevido ou fora de curso detectado.</div>';
    Array.prototype.forEach.call(al.querySelectorAll('.alert-item'), function (b) {
      b.onclick = function () { var a = analysis.alerts[+b.dataset.i]; pause(); seek(Math.max(0, a.t + (a.type === 'sobra' ? 0 : 0.01))); };
    });
    marks.innerHTML = real.filter(function (a) { return a.type !== 'sobra'; }).map(function (a) {
      return '<i style="left:' + (sim.total ? 100 * a.t / sim.total : 0) + '%"></i>';
    }).join('');
    $('#simSlider').max = String(Math.round(sim.total * 100));
  }
  function tituloAlerta(t) {
    return { placa: 'COLISÃO COM A PLACA', peca: 'CORTE NA PEÇA ACABADA', rapido: 'RÁPIDO NO MATERIAL', limite: 'FORA DE CURSO', sobra: 'SOBRA DE MATERIAL' }[t] || t;
  }
  function updateControls() {
    $('#simPlay').textContent = st.playing ? '⏸' : '▶';
    $('#simPlay').title = st.playing ? 'Pausar' : 'Executar';
    $('#simPlay').setAttribute('aria-label', st.playing ? 'Pausar' : 'Executar');
  }

  /* ---------- reproducao ---------- */
  function seek(t) {
    if (!sim) return;
    sim.seek(t); st.t = sim.t; st.dirty = true; draw();
  }
  function tick(now) {
    if (!st.playing || !sim) return;
    var dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
    var nt = st.t + dt * st.speed;
    if (nt >= sim.total) { nt = sim.total; st.playing = false; updateControls(); }
    sim.seek(nt); st.t = sim.t; draw();
    if (st.playing) st.raf = requestAnimationFrame(tick);
  }
  function play() {
    if (!sim) return;
    if (st.t >= sim.total) { sim.reset(); st.t = 0; }
    st.playing = true; st.last = performance.now(); updateControls();
    cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(tick);
  }
  function pause() { st.playing = false; cancelAnimationFrame(st.raf); updateControls(); }

  function stepSeg(dir) {
    if (!sim || !sim.segs.length) return; pause();
    var segs = sim.segs, cur = Math.max(0, sim.posAt(st.t).seg), g = segs[cur], e = 1e-6, t;
    if (dir > 0) t = st.t < g.t0 + g.dur - e ? g.t0 + g.dur : segs[Math.min(cur + 1, segs.length - 1)].t0 + segs[Math.min(cur + 1, segs.length - 1)].dur;
    else t = st.t > g.t0 + e ? g.t0 : segs[Math.max(cur - 1, 0)].t0;
    seek(t);
  }
  function stepLine(dir) {
    if (!sim || !sim.groups.length) return; pause();
    var G = sim.groups, e = 1e-6, gi = 0, i;
    for (i = 0; i < G.length; i++) { if (G[i].t0 <= st.t + e) gi = i; }
    var g = G[gi], t;
    if (dir > 0) t = st.t < g.t1 - e ? g.t1 : G[Math.min(gi + 1, G.length - 1)].t1;
    else t = st.t > g.t0 + e ? g.t0 : G[Math.max(gi - 1, 0)].t0;
    seek(t);
  }

  /* ---------- eventos ---------- */
  function init() {
    cv = $('#simCanvas'); ctx = cv.getContext('2d');
    $('#simPlay').onclick = function () { st.playing ? pause() : play(); };
    $('#simReset').onclick = function () { pause(); seek(0); };
    $('#simPrevSeg').onclick = function () { stepSeg(-1); };
    $('#simNextSeg').onclick = function () { stepSeg(1); };
    $('#simPrevLine').onclick = function () { stepLine(-1); };
    $('#simNextLine').onclick = function () { stepLine(1); };
    $('#simSpeed').onchange = function () { st.speed = +this.value; };
    $('#simSlider').oninput = function () { pause(); seek(+this.value / 100); };
    $('#simTrace').onchange = function () { st.trace = this.checked; st.dirty = true; draw(); };
    $('#simToolShow').onchange = function () { st.tool = this.checked; st.dirty = true; draw(); };
    $('#simFollow').onchange = function () { view.follow = this.checked; if (!view.follow) { /* mantem a vista atual */ } st.dirty = true; draw(); };
    $('#simFit').onclick = function () { $('#simFollow').checked = false; view.follow = false; fit(); draw(); };
    $('#simFitProfile').onclick = function () { $('#simFollow').checked = false; view.follow = false; fitProfile(); draw(); };
    $('#simCode').onclick = function (e) {
      var ln = e.target.closest ? e.target.closest('.ln') : null; if (!ln || !sim) return;
      var i = +ln.dataset.i, first = -1, k;
      for (k = 0; k < sim.segs.length; k++) { if (sim.segs[k].line === i) { first = sim.segs[k].t0; break; } }
      if (first >= 0) { pause(); seek(first + 1e-6); }
    };
    // zoom e arraste
    cv.addEventListener('wheel', function (e) {
      if (!sim) return; e.preventDefault();
      var rect = cv.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var f = e.deltaY < 0 ? 1.18 : 1 / 1.18, ns = Math.max(0.3, Math.min(200, view.s * f));
      if (!view.follow) { view.ox = mx - (mx - view.ox) * ns / view.s; view.oy = my - (my - view.oy) * ns / view.s; }
      view.s = ns; draw();
    }, { passive: false });
    var drag = null;
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) {
      if (!drag || !sim) return;
      if (view.follow) { view.follow = false; $('#simFollow').checked = false; }
      view.ox = drag.ox + e.clientX - drag.x; view.oy = drag.oy + e.clientY - drag.y; draw();
    });
    cv.addEventListener('pointerup', function () { drag = null; });
    window.addEventListener('resize', function () { if (active) resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { if (active) resize(); }).observe(cv);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (active) draw(); });
    // atalhos quando o simulador esta visivel e o foco nao esta em campo de texto
    document.addEventListener('keydown', function (e) {
      if (!active || /INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
      if (e.key === ' ') { e.preventDefault(); st.playing ? pause() : play(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepSeg(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepSeg(-1); }
    });
  }

  window.SimView = { init: init, setResult: setResult, show: show, hide: hide, redraw: function () { st.dirty = true; draw(); } };
})();
