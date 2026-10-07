/* Meia secao da peca (a partir da cena do simulador): face a direita (como no simulador), eixo embaixo.
   marks (opcional): pontos numerados e clicaveis sobre o desenho [{n, z, r, on}] - usados para escolher o canto de um chanfro/raio. */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function previewSvg(cena, W, H, marks, cls) {
    if (!cena || !cena.protect) return '';
    W = W || 420; H = H || 190;
    var P = cena.protect, m = 18, zmin = 0, rmax = 0;
    P.forEach(function (p) { zmin = Math.min(zmin, p[0]); rmax = Math.max(rmax, p[1]); });
    var per = cena.bruto && cena.bruto.perfil;
    if (per) per.forEach(function (s) { rmax = Math.max(rmax, s.d / 2, (s.d1 != null ? s.d1 : s.d) / 2); });
    rmax = Math.max(rmax, cena.bruto.d / 2);
    var zmax = Math.max(0, cena.bruto.z0), span = zmax - zmin;
    var s = Math.min((W - 2 * m) / span, (H - 2 * m - 10) / rmax);
    var X = function (z) { return (m + (z - zmin) * s).toFixed(1); }, Y = function (r) { return (H - m - r * s).toFixed(1); };
    var pts = P.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ');
    var bruto;
    if (per) bruto = per.map(function (q) { return X(q.z0) + ',' + Y(q.d / 2) + ' ' + X(q.z1) + ',' + Y((q.d1 != null ? q.d1 : q.d) / 2); }).join(' ');
    else bruto = X(cena.bruto.z0) + ',' + Y(0) + ' ' + X(cena.bruto.z0) + ',' + Y(cena.bruto.d / 2) + ' ' + X(cena.bruto.z1) + ',' + Y(cena.bruto.d / 2) + ' ' + X(cena.bruto.z1) + ',' + Y(0);
    // cavidades (furo + mandrilamento): pintadas com a cor do fundo por cima da peca, com o contorno interno marcado
    var cav = '', hs = cena.holes || [];
    hs.forEach(function (hp) { cav += '<polygon class="pv-hole" points="' + hp.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ') + '"/>'; });
    // contorno interno: segmentos que caem dentro de OUTRA cavidade (furos dos dois lados que se encontram) nao sao parede
    (cena.interiores || []).forEach(function (ip, q) {
      var d = '';
      for (var s2 = 0; s2 < ip.length - 1; s2++) {
        var a = ip[s2], b = ip[s2 + 1], mz = (a[0] + b[0]) / 2, mr = (a[1] + b[1]) / 2, dentro = false;
        if (a[0] > 0.0001 && b[0] > 0.0001) continue;
        hs.forEach(function (hp, q2) { if (q2 !== q && root.CNCSim.inPoly(hp, mz, mr)) dentro = true; });
        if (!dentro) d += 'M' + X(a[0]) + ' ' + Y(a[1]) + 'L' + X(b[0]) + ' ' + Y(b[1]);
      }
      if (d) cav += '<path class="pv-int" d="' + d + '"/>';
    });
    var mk = '';
    (marks || []).forEach(function (q) {
      mk += '<g class="pv-mk' + (q.on ? ' on' : '') + '" data-n="' + q.n + '" tabindex="0" role="button" aria-label="' + esc(q.rot || 'Canto ' + q.n) + '"><circle cx="' + X(q.z) + '" cy="' + Y(q.r) + '" r="10"/><text x="' + X(q.z) + '" y="' + (+Y(q.r) + 4) + '" text-anchor="middle">' + q.n + '</text></g>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + (cls || 'pv') + '" role="img" aria-label="Meia seção da peça"><polyline class="pv-bruto" points="' + bruto + '"/>' +
      '<polygon class="pv-piece" points="' + pts + '"/>' + cav +
      '<line class="pv-axis" x1="' + (m - 8) + '" y1="' + Y(0) + '" x2="' + (W - m + 8) + '" y2="' + Y(0) + '"/>' +
      '<text class="pv-t" x="' + X(0) + '" y="' + (H - 4) + '" text-anchor="middle">Z0 (face)</text>' +
      '<text class="pv-t" x="' + X(zmin) + '" y="' + (H - 4) + '" text-anchor="middle">fundo</text>' +
      '<text class="pv-t" x="' + (m) + '" y="12">Ø ' + root.CNC.fmt(2 * rmax) + ' (bruto)</text>' + mk + '</svg>';
  }
  root.PecaView = { previewSvg: previewSvg };
})(typeof window !== 'undefined' ? window : this);
