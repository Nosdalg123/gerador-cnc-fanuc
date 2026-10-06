/* Nucleo do gerador CNC - funcoes puras (roda no navegador e no Node).
   Padrao de saida: programas validados da pasta "Exemplos de programacao" (Samoel).
   Cada gerador devolve o codigo e tambem a "cena" do simulador (percurso da ferramenta
   marcado com a linha do G-code de cada movimento). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CNC = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- utilitarios ---------- */
  // numero no estilo da casa: .45 em vez de 0.45
  function fmt(n) {
    n = Number(n);
    if (!isFinite(n)) return '0';
    var s = String(Math.round(n * 10000) / 10000);
    if (/^0\./.test(s)) s = s.slice(1);
    else if (/^-0\./.test(s)) s = '-' + s.slice(2);
    return s;
  }
  // comentario CNC: maiusculo, sem acento, sem parenteses
  function ascii(s, max) {
    s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[()]/g, ' ').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    return max ? s.slice(0, max) : s;
  }
  function tcode(t) { return String(t == null ? '' : t).replace(/\D/g, '').padStart(4, '0').slice(-4); }
  function nomeArquivo(s) {
    return ascii(s).replace(/[^A-Z0-9._-]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
  }
  function mesAno(d) {
    d = d || new Date();
    var m = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][d.getMonth()];
    return m + '/' + d.getFullYear();
  }
  function plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function num(x) { var v = Number(x); return isFinite(v) ? v : 0; }

  /* Maquina / placa usadas so na simulacao. VALORES PROVISORIOS: confirmar no manual da ML-600L. */
  var DEFAULT_MAQ = { xMax: 400, zMax: 400, rapido: 20000, grip: 25, chuckD: 260 };

  /* ---------- montagem do programa a partir de uma lista de variaveis ---------- */
  // def: {sec, n, val (numero) | expr (string) | raw (texto), c (comentario), efeito (dicionario)}
  function blocoVariaveis(defs) {
    var lines = [], sec = null;
    defs.forEach(function (d) {
      if (d.sec !== sec) {
        if (sec !== null) lines.push('');
        lines.push('(' + d.sec + ')');
        sec = d.sec;
      }
      var v = d.expr != null ? d.expr : (d.raw != null ? d.raw : fmt(d.val));
      lines.push('#' + d.n + '=' + v + '(' + ascii(d.c) + ')');
    });
    return lines;
  }
  function dicionario(defs) {
    return defs.map(function (d) {
      var calc = d.sec === 'CALCULOS';
      return {
        variavel: '#' + d.n,
        tipo: calc ? 'calculo (nao editar)' : 'entrada',
        valor: d.expr != null ? d.expr : (d.raw != null ? d.raw : fmt(d.val)),
        descricao: d.c,
        efeito: d.efeito || ''
      };
    });
  }

  /* ---------- percurso da ferramenta (para o simulador) ---------- */
  function PathB(start) { this.moves = []; this.pos = { x: start.x, z: start.z }; }
  PathB.prototype.rapid = function (x, z, line, label, tool) {
    this.moves.push({ t: 'r', x: x, z: z, line: line, label: label || '', tool: tool });
    this.pos = { x: x, z: z };
  };
  PathB.prototype.feed = function (x, z, f, line, label, tool) {
    this.moves.push({ t: 'f', x: x, z: z, f: f, line: line, label: label || '', tool: tool });
    this.pos = { x: x, z: z };
  };
  // passada de rosca (G76): avanco = passo; o simulador conta o tempo mas nao remove material
  PathB.prototype.thread = function (x, z, pitch, line, label, tool) {
    this.moves.push({ t: 't', x: x, z: z, f: pitch, line: line, label: label || '', tool: tool });
    this.pos = { x: x, z: z };
  };
  // arco no plano (z, r): centro (zc, rc), raio R, angulos th0->th1 (graus, medidos a partir de +Z)
  PathB.prototype.arc = function (zc, rc, R, th0, th1, f, line, label, tool) {
    var n = 14;
    for (var i = 1; i <= n; i++) {
      var th = (th0 + (th1 - th0) * i / n) * Math.PI / 180;
      this.feed(2 * (rc + R * Math.sin(th)), zc + R * Math.cos(th), f, line, label, tool);
    }
  };
  // arco por dois pontos (z, r) e raio R (como G2/G3 com R). G3 = anti-horario no plano (z p/ direita, r p/ cima).
  function arcPts(p0, p1, R, ccw, n) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var d = Math.hypot(dx, dy), h = Math.sqrt(Math.max(0, R * R - d * d / 4));
    var s = ccw ? 1 : -1, cz = mx + s * (-dy / d) * h, cr = my + s * (dx / d) * h;
    var a0 = Math.atan2(p0[1] - cr, p0[0] - cz), a1 = Math.atan2(p1[1] - cr, p1[0] - cz), da = a1 - a0, pts = [];
    if (ccw) { while (da <= 0) da += 2 * Math.PI; } else { while (da >= 0) da -= 2 * Math.PI; }
    for (var i = 0; i <= n; i++) { var a = a0 + da * i / n; pts.push([cz + R * Math.cos(a), cr + R * Math.sin(a)]); }
    return pts;
  }
  PathB.prototype.arcRP = function (p0, p1, R, ccw, f, line, label, tool) {
    var pts = arcPts(p0, p1, R, ccw, 14);
    for (var i = 1; i < pts.length; i++) this.feed(2 * pts[i][1], pts[i][0], f, line, label, tool);
  };
  // G75 (faceamento): passes em Z de zs ate zend, cada um em X de xs ate -1.
  // Manual ROMI/Fanuc 0i-TD: a ferramenta deve estar posicionada no comprimento da primeira passada;
  // Q = profundidade por passada em Z, R = afastamento em Z; ao fim volta ao ponto posicionado.
  // xT (opcional) = diametro final de cada passada: -1 no faceamento; o Ø usinado quando o G75 e usado para tornear (desbaste transversal)
  function cyc75(pb, xs, zs, zend, q, R, f, line, tool, xT) {
    var zi = [zs], xt = xT == null ? -1 : xT, lb = xT == null ? 'FACEAR' : 'TORNEAR (G75)';
    while (zi[zi.length - 1] > zend + 1e-9) zi.push(Math.max(zend, zi[zi.length - 1] - q));
    zi.forEach(function (z, i) {
      pb.feed(xt, z, f, line, lb, tool);
      pb.rapid(xt, z + R, line, lb, tool);
      pb.rapid(xs, z + R, line, lb, tool);
      pb.rapid(xs, i < zi.length - 1 ? zi[i + 1] : zs, line, lb, tool);
    });
  }
  // G74 (torneamento): a ferramenta deve estar posicionada no diametro da primeira passada;
  // P = profundidade de corte no RAIO (mm), R = afastamento no raio; ao fim volta ao ponto posicionado.
  function cyc74(pb, xs, zs, xf, zend, p, R, f, line, tool) {
    var xi = [xs];
    while (xi[xi.length - 1] > xf + 1e-9) xi.push(Math.max(xf, xi[xi.length - 1] - 2 * p));
    xi.forEach(function (x, i) {
      pb.feed(x, zend, f, line, 'TORNEAR', tool);
      pb.rapid(x + 2 * R, zend, line, 'TORNEAR', tool);
      pb.rapid(x + 2 * R, zs, line, 'TORNEAR', tool);
      pb.rapid(i < xi.length - 1 ? xi[i + 1] : xs, zs, line, 'TORNEAR', tool);
    });
  }

  function simTool(tool, kind) {
    if (kind === 'canal' || kind === 'canalext' || kind === 'canalint') return { kind: kind, largura: Number(tool.largura) || 4.5, vc: Number(tool.vc), rpm: Number(tool.rpm), modo: tool.modo || 'G96' };
    if (kind === 'rosca' || kind === 'roscaint') return { kind: kind, vc: 0, rpm: Number(tool.rpm), modo: 'G97' };
    if (kind === 'broca') return { kind: 'broca', largura: Number(tool.diametro) || 10, vc: Number(tool.vc), rpm: Number(tool.rpm), modo: tool.modo || 'G97' };
    if (kind === 'interna') return { kind: 'interna', ang: Number(tool.angulo) || 80, raio: Number(tool.raio) || 0, vc: Number(tool.vc), rpm: Number(tool.rpm), modo: tool.modo || 'G96' };
    return { kind: 'rombo', ang: Number(tool.angulo) || 80, raio: Number(tool.raio) || 0, vc: Number(tool.vc), rpm: Number(tool.rpm), modo: tool.modo || 'G96' };
  }

  function arcPoints(zc, rc, R, th0, th1, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var th = (th0 + (th1 - th0) * i / n) * Math.PI / 180;
      pts.push([zc + R * Math.cos(th), rc + R * Math.sin(th)]);
    }
    return pts;
  }

  /* ---------- blocos comuns ---------- */
  // Desbaste do faceamento + cilindragem (primeira ferramenta).
  // c: {P, pb, v (nomes das variaveis), n (valores), acab (bool), xH}
  // Com acab: o faceamento para em Z = acabF e a cilindragem em dRough = dUs + acabT (sobremetal de acabamento).
  function faceTurn(c) {
    var v = c.v, n = c.n, P = c.P, pb = c.pb, T = 'a';
    var aF = !!(c.acab && n.acabF > 0), aT = !!(c.acab && n.acabT > 0);
    var zE = aF ? v.acabF : '0', zEn = aF ? n.acabF : 0;
    var dR = aT ? v.dRough : v.dUs, dRn = aT ? n.dRough : n.dUs;
    P('G0Z' + v.sobre, 'g0z11');
    pb.rapid(c.xH, n.sobreZ, 'g0z11', 'APROXIMACAO', T);
    P('G0X' + v.dBruto + '(DIAMETRO BRUTO)', 'g0x2a');
    pb.rapid(n.dBruto, n.sobreZ, 'g0x2a', 'APROXIMACAO', T);
    P('IF[' + (aF ? v.sobre + '-' + v.acabF : v.sobre) + 'LE' + v.incFace + ']GOTO10', 'if1');
    P('G0Z' + v.zIni, 'g0zini');
    P('G75X-1Z' + zE + 'P999999Q' + v.qFace + 'R.5F' + v.av + '(FACEAR)', 'g75a');
    P('GOTO50', 'goto50');
    P('N10G0Z' + zE, 'n10');
    P('G75X-1Z' + zE + 'P999999Q' + v.qFace + 'R.5F' + v.av + '(FACEAR)', 'g75b');
    if (n.sobreZ - zEn <= n.incFace) {
      pb.rapid(n.dBruto, zEn, 'n10', 'APROXIMACAO', T);
      cyc75(pb, n.dBruto, zEn, zEn, n.incFace, 0.5, n.av, 'g75b', T);
    } else {
      pb.rapid(n.dBruto, n.sobreZ - n.incFace, 'g0zini', 'APROXIMACAO', T);
      cyc75(pb, n.dBruto, n.sobreZ - n.incFace, zEn, n.incFace, 0.5, n.av, 'g75a', T);
    }
    P('N50G0Z' + v.sobre, 'n50');
    pb.rapid(n.dBruto, n.sobreZ, 'n50', 'APROXIMACAO', T);
    P('G0X' + v.dBruto + '(DIAMETRO BRUTO)', 'g0x2b');
    var xEnd;
    if (c.trans) {
      // desbaste TRANSVERSAL do diametro: G75 com a ferramenta em X bruto; cada passada desce em X ate o Ø e o Z avanca Q (como o faceamento)
      var g75t = 'G75X' + dR + 'Z-' + v.lUsin + 'P999999Q' + v.qFace + 'R.5F' + v.av + '(TORNEAR)';
      P('IF[' + (aF ? v.lUsin + '+' + v.acabF : v.lUsin) + 'LE' + v.incFace + ']GOTO20', 'if2');
      P('G0Z' + (aF ? '[' + v.acabF + '-' + v.incFace + ']' : '-' + v.incFace), 'g0zt');
      P(g75t, 'g74a');
      P('GOTO60', 'goto60');
      P('N20G0Z-' + v.lUsin, 'n20');
      P(g75t, 'g74b');
      if (n.lUsin + zEn <= n.incFace) {
        pb.rapid(n.dBruto, -n.lUsin, 'n20', 'APROXIMACAO', T);
        cyc75(pb, n.dBruto, -n.lUsin, -n.lUsin, n.incFace, 0.5, n.av, 'g74b', T, dRn);
      } else {
        pb.rapid(n.dBruto, zEn - n.incFace, 'g0zt', 'APROXIMACAO', T);
        cyc75(pb, n.dBruto, zEn - n.incFace, -n.lUsin, n.incFace, 0.5, n.av, 'g74a', T, dRn);
      }
      xEnd = n.dBruto;
    } else {
      P('IF[' + v.dBruto + '-' + dR + 'LT[' + v.incTorn + '*2]]GOTO20', 'if2');
      P('G74X' + dR + 'Z-' + v.lUsin + 'P' + v.pTorn + 'Q999999R.5F' + v.av + '(TORNEAR)', 'g74a');
      P('GOTO60', 'goto60');
      P('N20G0X' + dR, 'n20');
      P('G74X' + dR + 'Z-' + v.lUsin + 'P' + v.pTorn + 'Q999999R.5F' + v.av + '(TORNEAR)', 'g74b');
      if (n.dBruto - dRn < n.incTorn * 2) {
        pb.rapid(dRn, n.sobreZ, 'n20', 'APROXIMACAO', T);
        cyc74(pb, dRn, n.sobreZ, dRn, -n.lUsin, n.incTorn, 0.5, n.av, 'g74b', T);
        xEnd = dRn;
      } else {
        cyc74(pb, n.dBruto, n.sobreZ, dRn, -n.lUsin, n.incTorn, 0.5, n.av, 'g74a', T);
        xEnd = n.dBruto;
      }
    }
    P('N60G0Z' + v.sobre + '(SOBREMETAL EM Z)', 'n60');
    pb.rapid(xEnd, n.sobreZ, 'n60', 'APROXIMACAO', T);
  }

  // Raio de quina + acabamento (faceamento e cilindragem) da matriz solida/tubular.
  // Sem sobremetal de acabamento gera exatamente o bloco original (so o raio).
  function finishBlock(c) {
    var v = c.v, n = c.n, P = c.P, pb = c.pb, T = 'a';
    var aF = !!(c.acab && n.acabF > 0), aT = !!(c.acab && n.acabT > 0), fin = aF || aT;
    var fv = fin ? v.avA : v.av, fn = fin ? n.avA : n.av;
    if (aF) {
      P('G0X' + v.dBruto + '(DIAMETRO BRUTO)', 'g0x2c'); pb.rapid(n.dBruto, n.sobreZ, 'g0x2c', 'ACAB. FACEAMENTO', T);
      P('G0Z0', 'g0z0f'); pb.rapid(n.dBruto, 0, 'g0z0f', 'ACAB. FACEAMENTO', T);
      P('G1X-1F' + v.avA + '(ACABAMENTO FACEAMENTO)', 'g1xf'); pb.feed(-1, 0, n.avA, 'g1xf', 'ACAB. FACEAMENTO', T);
    }
    if (c.raio) {
      if (aF) {
        P('G0Z1', 'z1a'); pb.rapid(-1, 1, 'z1a', 'RAIO', T);
        P('X' + v.xRaio, 'xraio'); pb.rapid(n.xRaio, 1, 'xraio', 'RAIO', T);
      } else {
        P('X' + v.xRaio, 'xraio'); pb.rapid(n.xRaio, n.sobreZ, 'xraio', 'RAIO', T);
        P('G0Z1', 'z1'); pb.rapid(n.xRaio, 1, 'z1', 'RAIO', T);
      }
      P('G1Z0F' + v.avA, 'g1z0'); pb.feed(n.xRaio, 0, n.avA, 'g1z0', 'RAIO', T);
      P('G3X' + v.dUs + 'Z-' + v.raio + 'R' + v.raio + 'F' + fv, 'g3');
      pb.arc(-n.raio, n.xRaio / 2, n.raio, 0, 90, fn, 'g3', 'RAIO', T);
      if (aT) { P('G1Z-' + v.lUsin + 'F' + fv + '(ACABAMENTO CILINDRAGEM)', 'g1zod'); pb.feed(n.dUs, -n.lUsin, fn, 'g1zod', 'ACAB. CILINDRAGEM', T); }
    } else if (aT) {
      P('G0Z1', 'z1'); pb.rapid(pb.pos.x, 1, 'z1', 'ACAB. CILINDRAGEM', T);
      P('X' + v.dUs, 'xfin'); pb.rapid(n.dUs, 1, 'xfin', 'ACAB. CILINDRAGEM', T);
      P('G1Z-' + v.lUsin + 'F' + fv + '(ACABAMENTO CILINDRAGEM)', 'g1zod'); pb.feed(n.dUs, -n.lUsin, fn, 'g1zod', 'ACAB. CILINDRAGEM', T);
    } else if (aF) {
      P('G0Z1', 'z1'); pb.rapid(-1, 1, 'z1', 'RETORNO', T);
    }
  }

  function cabTroca(P, v, tcomment, tvar) {
    P('G21G90G40G80');
    P('G28U0(PT DE TROCA)', 'g28i');
    P('G0Z' + v.ptZ + '(PT DE TROCA)', 'g0zi');
    P('T' + tvar + '(' + tcomment + ')');
    P('G54');
  }

  // cena do simulador a partir do perfil acabado (polilinha da face ate o fundo da peca)
  function cenaGen(dBruto, maq, sobreZ, lPeca, outline, hStock, focoR0, lFoco, extra) {
    var rB = dBruto / 2;
    var cena = {
      bruto: { d: dBruto, z0: sobreZ, z1: -lPeca },
      chuck: { zFace: -lPeca + maq.grip, zBack: -lPeca - 20, rOut: maq.chuckD / 2 },
      outline: outline,
      hStock: hStock, // sobremetal radial a remover no diametro
      foco: { z0: -lFoco - 8, z1: sobreZ + 18, r0: focoR0, r1: rB + 8 }, // janela do "zoom no perfil"
      maq: maq
    };
    for (var k in extra) cena[k] = extra[k];
    cena.protect = [[0, 0]].concat(outline).concat([[-lPeca, 0]]);
    return cena;
  }
  // perfil da matriz: raio de quina + cilindro ate lUsin + bruto ate o fundo
  function perfilQuina(dBruto, lPeca, dUs, lUsin, raio) {
    var rB = dBruto / 2, r17 = dUs / 2, lu = Math.min(lUsin, lPeca), outline;
    if (raio > 0) outline = arcPoints(-raio, r17 - raio, raio, 0, 90, 14);
    else outline = [[0, r17]];
    outline.push([-lu, r17], [-lu, rB], [-lPeca, rB]);
    return outline;
  }

  function resolverLinhas(path, idx) {
    path.forEach(function (m) { m.line = typeof m.line === 'string' ? (idx[m.line] != null ? idx[m.line] : -1) : m.line; });
  }

  function validarTool(tool, id, papel, tipos, erros, avisos) {
    if (!tool) { erros.push('Selecione a ' + papel.toLowerCase() + ' no banco de ferramentas.'); return; }
    if (tipos.indexOf(tool.tipo) < 0) avisos.push(papel + ': a ferramenta selecionada é do tipo "' + tool.tipo + '".');
    var rosca = id === 't6' || id === 't7', fixo = (id === 't3' && tool.modo === 'G97') || rosca; // broca em RPM fixo e rosca (G97, avanco = passo) nao usam Vc nem avanco
    if (!fixo && !(Number(tool.vc) > 0)) erros.push(papel + ' sem velocidade de corte (Vc).');
    if (!(Number(tool.rpm) > 0)) erros.push(papel + ' sem limite de RPM.');
    if (!rosca && !(Number(tool.avDesb) > 0)) erros.push(papel + ' sem avanço de corte.');
    if (id === 't1') {
      if (!(Number(tool.incFace) > 0)) erros.push(papel + ' sem incremento de faceamento.');
      if (!(Number(tool.incTorn) > 0)) erros.push(papel + ' sem incremento de torneamento (cilindragem).');
      if (num(tool.acabFace) < 0 || num(tool.acabTorn) < 0) erros.push(papel + ': sobremetal de acabamento não pode ser negativo.');
    }
    if (Number(tool.sentido) !== 3 && Number(tool.sentido) !== 4) erros.push(papel + ': sentido de giro deve ser 3 (M3) ou 4 (M4).');
    if (rosca && tool.modo !== 'G97') avisos.push(papel + ' cadastrada em Vc constante (G96): o roscamento usa RPM fixo (G97) com o RPM do cadastro.');
    if (tool.modo === 'G97' && !fixo) avisos.push(papel + ' cadastrada em RPM fixo (G97); este programa usa G96 (Vc constante).');
  }

  function metaPadrao(meta, g, f) {
    return {
      nome: (meta && meta.nome) ? meta.nome : g.nomeAuto(f),
      autor: (meta && meta.autor) ? meta.autor : 'FERRAMENTARIA',
      data: (meta && meta.data) ? meta.data : mesAno()
    };
  }
  function maqPadrao(meta) {
    var maq = Object.assign({}, DEFAULT_MAQ, meta && meta.maq);
    maq.xHome = maq.xHome != null ? maq.xHome : maq.xMax;
    return maq;
  }
  // fixacao na placa: comprimento preso (pedido nas medidas, padrao 25) e pressao opcional (M34 = nivel 1, M35 = nivel 2; manual ROMI 0i-TD cap. 14)
  var GRIP_PADRAO = 25;
  // sentido do desbaste: longitudinal (passes ao longo de Z) ou transversal (passes de frente, ao longo de X)
  var SENT_OPC = [['long', 'Longitudinal (G71): passes ao longo de Z'], ['trans', 'Transversal (G72): passes de frente, ao longo de X']];
  var SENT_TORN_OPC = [['long', 'Longitudinal (G74): passes ao longo de Z'], ['trans', 'Transversal (G75): passes de frente, ao longo de X']];
  var SENT_TORN_HINT = 'Como desbastar o diâmetro: longitudinal = G74 (padrão da casa); transversal = G75 em fatias de frente, com o incremento do faceamento. Altera só o desbaste do Ø.';
  function camposFixacao(pressaoPadrao, sufixo, quando) {
    var s = sufixo || '', q = quando ? ' ' + quando : '';
    var out = [{ grupo: 'Fixação na placa', id: 'grip' + s, label: 'Comprimento preso na placa' + q, unit: 'mm', def: GRIP_PADRAO,
      hint: 'Quanto do bloco fica dentro das castanhas (padrão ' + GRIP_PADRAO + '). Define a zona de colisão do simulador.' }];
    // pressao da placa (M34/M35) nao e mais campo da peca: vem das Configuracoes (f.pressao, preenchido pelo app)
    return out;
  }
  function fixacao(f, meta, erros, chave) {
    var maq = maqPadrao(meta), k = chave || 'grip';
    if (f[k] !== undefined) {
      var g = Number(f[k]);
      if (g > 0) maq.grip = g; else erros.push('Informe o comprimento preso na placa (maior que zero).');
    }
    var pr = f.pressao == null ? '' : String(f.pressao);
    if (pr !== '' && pr !== 'M34' && pr !== 'M35') { erros.push('Pressão da placa inválida.'); pr = ''; }
    return { maq: maq, pr: pr };
  }
  function txtPressao(pr) {
    if (!pr) return '';
    return ' A pressão da placa é selecionada com ' + pr + ' (nível ' + (pr === 'M34' ? '1' : '2') + ', manual ROMI) logo depois de ligar o refrigerante.';
  }
  function lerCampos(f, ks) { var n = {}; ks.forEach(function (k) { n[k] = Number(f[k]); }); return n; }
  function cabecalhoPrograma(P, mt) {
    P('%'); P('<' + nomeArquivo(mt.nome) + '.txt>'); P(''); P('(' + ascii(mt.autor) + ' - ' + mt.data + ')'); P('');
  }
  function textoAcab(aF, aT, avA) {
    if (!(aF > 0) && !(aT > 0)) return 'Não há sobremetal para acabamento: o último passe do desbaste já é o final.';
    return 'O desbaste deixa ' + (aF > 0 ? fmt(aF) + ' mm em Z (faceamento)' : 'nada em Z') + ' e ' + (aT > 0 ? fmt(aT) + ' mm no Ø (cilindragem)' : 'nada no Ø') +
      ' para o acabamento, que é feito em passe único a F' + fmt(avA) + (aF > 0 ? ' (faceamento primeiro, depois o contorno)' : '') + '.';
  }
  var TXT_ACAB_F = 'Sobremetal de acabamento em Z (faceamento). O desbaste do faceamento para neste valor e um passe de acabamento em Z0 remove o resto.';
  var TXT_ACAB_T = 'Sobremetal de acabamento no diametro (cilindragem). O desbaste fica este valor acima do diametro final e o acabamento remove o resto.';

  /* ---------- gerador: MATRIZ SOLIDA ---------- */
  var MATRIZ_SOLIDA = {
    id: 'matriz_solida',
    titulo: 'Matriz sólida',
    refPrograma: 'MATRIZ.SOLIDA.txt',
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo', tipos: ['externa', 'faceamento'] }
    ],
    campos: [
      { grupo: 'Bloco bruto', id: 'dBruto', label: 'Ø bruto', unit: 'mm', def: 201, hint: 'Diâmetro do bloco bruto (já com sobremetal)' },
      { grupo: 'Bloco bruto', id: 'lBruto', label: 'Comprimento bruto', unit: 'mm', def: 52, hint: 'Comprimento total do bloco' },
      { grupo: 'Peça final', id: 'dFinal', label: 'Ø final nominal', unit: 'mm', def: 200, hint: 'Cota do desenho' },
      { grupo: 'Peça final', id: 'lPeca', label: 'Comprimento final da peça', unit: 'mm', def: 50, hint: 'Face acabada (Z0) até a outra face. Sobremetal Z = bruto − final' },
      { grupo: 'Peça final', id: 'lUsin', label: 'Comprimento de usinagem em Z', unit: 'mm', def: 14, hint: 'Quanto o diâmetro é torneado a partir do Z0 (atenção p/ não colidir na placa)' },
      { grupo: 'Peça final', avancado: 'Raios e folgas', id: 'raio', label: 'Raio de quina', unit: 'mm', def: 3, hint: '0 = sem raio' },
      { grupo: 'Peça final', avancado: 'Raios e folgas', id: 'folga', label: 'Folga no Ø final', unit: 'mm', def: 1, hint: 'Matriz sólida: 1 mm menor que o nominal (padrão da casa)' },
      { grupo: 'Sentido do desbaste', id: 'sentTorn', tipo: 'select', label: 'Desbaste do diâmetro', def: 'long', opcoes: SENT_TORN_OPC, hint: SENT_TORN_HINT }
    ].concat(camposFixacao('')),
    nomeAuto: function (f) { return 'MATRIZ.SOLIDA.D' + fmt(f.dFinal); },
    derivados: function (f) {
      return [['Ø usinado', fmt(f.dFinal - f.folga) + ' mm'], ['Sobremetal Z', fmt(f.lBruto - f.lPeca) + ' mm'], ['Sobremetal no Ø', fmt((f.dBruto - (f.dFinal - f.folga)) / 2) + ' mm/lado']];
    },

    gerar: function (f, tools, meta) {
      var tool = tools && tools.t1;
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dBruto', 'lBruto', 'dFinal', 'lPeca', 'lUsin', 'raio', 'folga']);
      var dUs = n.dFinal - n.folga, sobreZ = n.lBruto - n.lPeca, trans = f.sentTorn === 'trans';
      var fx = fixacao(f, meta, erros), maq = fx.maq;

      if (!(n.dFinal > 0)) erros.push('Informe o Ø final.');
      if (!(n.dBruto > 0)) erros.push('Informe o Ø bruto.');
      if (!(n.lBruto > 0)) erros.push('Informe o comprimento bruto.');
      if (!(n.lPeca > 0)) erros.push('Informe o comprimento final da peça.');
      if (!(n.lUsin > 0)) erros.push('Informe o comprimento de usinagem em Z.');
      if (n.raio < 0 || n.folga < 0 || isNaN(n.raio) || isNaN(n.folga)) erros.push('Raio e folga não podem ser negativos.');
      if (!erros.length) {
        if (n.dBruto <= dUs) erros.push('Ø bruto (' + fmt(n.dBruto) + ') deve ser maior que o Ø usinado (' + fmt(dUs) + ').');
        if (sobreZ < 0) erros.push('Comprimento bruto é menor que o comprimento final da peça.');
        if (n.raio > 0 && dUs - 2 * n.raio <= 0) erros.push('Raio grande demais para o diâmetro.');
        var livre = n.lPeca - maq.grip;
        if (n.lUsin > livre) erros.push('Comprimento de usinagem (' + fmt(n.lUsin) + ') passa do trecho livre fora da placa (' + fmt(livre) + ' = peça ' + fmt(n.lPeca) + ' − preso ' + fmt(maq.grip) + '): a ferramenta bateria nas castanhas.');
        else if (livre - n.lUsin < 1) avisos.push('Folga de só ' + fmt(livre - n.lUsin) + ' mm entre o fim da usinagem e as castanhas.');
        if (n.lUsin > n.lPeca) avisos.push('Comprimento de usinagem maior que o comprimento da peça.');
        if (n.dBruto - n.dFinal < 0) avisos.push('Ø bruto menor que o Ø final nominal: confira as medidas.');
        if (sobreZ === 0) avisos.push('Sobremetal em Z é zero: o faceamento corta direto em Z0.');
      }
      validarTool(tool, 't1', 'Ferramenta de faceamento/torneamento', ['externa', 'faceamento'], erros, avisos);
      var acabF = 0, acabT = 0;
      if (tool && !erros.length) {
        acabF = num(tool.acabFace); acabT = num(tool.acabTorn);
        if (acabF > 0 && acabF >= sobreZ) avisos.push('Sobremetal de acabamento em Z (' + fmt(acabF) + ') não é menor que o sobremetal em Z (' + fmt(sobreZ) + '): o desbaste do faceamento não remove nada.');
        if (acabT > 0 && dUs + acabT >= n.dBruto) avisos.push('Sobremetal de acabamento no Ø faz o desbaste do diâmetro não remover material.');
      }
      if (erros.length) return { erros: erros, avisos: avisos };

      var T = tcode(tool.t), raio = n.raio > 0, aF = acabF > 0, aT = acabT > 0, fin = aF || aT;
      var av = Number(tool.avAcab) > 0 ? Number(tool.avAcab) : 0.15;

      var defs = [
        { sec: 'MEDIDAS FINAIS', n: 1, val: n.dFinal, c: 'DIAMETRO FINAL', efeito: 'Cota nominal do diametro externo. O diametro usinado = #1 - #6.' },
        { sec: 'MEDIDAS FINAIS', n: 9, val: n.lPeca, c: 'COMPRIMENTO FINAL DA PECA', efeito: 'Define o sobremetal em Z (#11 = #8 - #9).' },
        { sec: 'MEDIDAS FINAIS', n: 3, val: n.lUsin, c: 'COMPRIMENTO USINAGEM EM Z', efeito: 'Profundidade do torneamento a partir de Z0. Tambem entra no bruto da simulacao (G1900). Atencao p/ nao colidir na placa.' },
        { sec: 'BRUTO', n: 2, val: n.dBruto, c: 'DIAMETRO BRUTO', efeito: 'Diametro do bloco. Inicio do faceamento e do torneamento e bruto da simulacao (G1900).' },
        { sec: 'BRUTO', n: 8, val: n.lBruto, c: 'COMPRIMENTO BRUTO', efeito: 'Comprimento do bloco. Com #9 define o sobremetal em Z.' },
        { sec: 'FERRAMENTAS', n: 101, raw: T, c: tool.nome, efeito: 'Numero da ferramenta (T) do faceamento, torneamento e raio, vindo do banco de ferramentas.' },
        { sec: 'PARAMETROS', n: 4, val: Number(tool.rpm), c: 'LIMITE DE RPM', efeito: 'Limite de rotacao (G50) para G96.' },
        { sec: 'PARAMETROS', n: 5, val: Number(tool.vc), c: 'VELOCIDADE DE CORTE', efeito: 'Vc em m/min (G96).' },
        { sec: 'PARAMETROS', n: 15, val: Number(tool.avDesb), c: 'AVANCO CORTE', efeito: 'Avanco (mm/rot) do desbaste: faceamento, torneamento e raio.' },
        { sec: 'PARAMETROS', n: 16, val: av, c: fin ? 'AVANCO APROXIMACAO E ACABAMENTO' : 'AVANCO APROXIMACAO', efeito: fin ? 'Avanco da aproximacao em Z0 e de todos os passes de acabamento.' : 'Avanco da aproximacao em Z0 antes do raio.' },
        { sec: 'PARAMETROS', n: 18, val: Number(tool.incTorn), c: 'INCREMENTO DE CORTE TORNEAMENTO', efeito: 'Profundidade de corte por passe no raio, no torneamento (G74).' },
        { sec: 'PARAMETROS', n: 13, val: Number(tool.incFace), c: 'INCREMENTO FACEAMENTO', efeito: 'Profundidade de corte por passe em Z, no faceamento (G75)' + (trans ? ' e espessura das fatias do desbaste transversal do diametro (Q do G75).' : '.') }
      ];
      if (raio) defs.push({ sec: 'PARAMETROS', n: 22, val: n.raio, c: 'RAIO', efeito: 'Raio de quina (G3). Para tirar o raio, apague o bloco do raio no final do programa.' });
      defs.push(
        { sec: 'PARAMETROS', n: 6, val: n.folga, c: 'FOLGA NO DIAMETRO FINAL (' + ((meta && meta.rotFolga) || 'MATRIZ SOLIDA 1MM') + ')', efeito: 'Quanto o diametro usinado fica abaixo do nominal.' + ((meta && meta.rotFolga) ? '' : ' Matriz solida: 1 mm.') },
        { sec: 'PARAMETROS', n: 12, val: Number(tool.sentido), c: 'SENTIDO DE GIRO', efeito: '4 = M4, 3 = M3.' }
      );
      if (aT) defs.push({ sec: 'PARAMETROS', n: 23, val: acabT, c: 'SOBREMETAL ACABAMENTO NO DIAMETRO', efeito: TXT_ACAB_T });
      if (aF) defs.push({ sec: 'PARAMETROS', n: 24, val: acabF, c: 'SOBREMETAL ACABAMENTO EM Z', efeito: TXT_ACAB_F });
      defs.push(
        { sec: 'CALCULOS', n: 11, expr: '#8-#9', c: 'SOBREMETAL EM Z', efeito: 'Material a facear em Z.' },
        { sec: 'CALCULOS', n: 14, expr: '#13*1000', c: 'INCREMENTO FACEAMENTO EM 0.001MM', efeito: 'Valor Q do G75.' },
        { sec: 'CALCULOS', n: 17, expr: '#1-#6', c: 'DIAMETRO USINADO', efeito: 'Diametro final que o torneamento realmente usina.' },
        { sec: 'CALCULOS', n: 19, expr: '#18*1000', c: 'INCREMENTO TORNEAMENTO EM 0.001MM', efeito: 'Valor P do G74.' }
      );
      if (aT) defs.push({ sec: 'CALCULOS', n: 25, expr: '#17+#23', c: 'DIAMETRO DO DESBASTE', efeito: 'Diametro onde o desbaste para (usinado + sobremetal de acabamento).' });
      if (raio) defs.push(
        { sec: 'CALCULOS', n: 130, expr: '#22*2', c: 'RAIO X 2', efeito: 'Variacao de diametro do raio.' },
        { sec: 'CALCULOS', n: 21, expr: '#17-#130', c: 'INICIO DO RAIO EM X', efeito: 'Diametro onde comeca o arco.' }
      );
      defs.push(
        { sec: 'CALCULOS', n: 136, expr: '#11+250', c: 'PT DE TROCA EM Z', efeito: 'Posicao Z segura de troca de ferramenta.' },
        { sec: 'CALCULOS', n: 137, expr: '#11-#13', c: 'INICIO DO FACEAMENTO EM Z', efeito: 'Z onde o G75 comeca (sobremetal - 1 incremento).' }
      );
      if (trans) defs = defs.filter(function (d) { return d.n !== 18 && d.n !== 19; }); // incremento radial do G74 nao e usado no desbaste transversal

      var mt = metaPadrao(meta, MATRIZ_SOLIDA, f);
      var L = [], idx = {};
      var P = function (s, key) { if (key) idx[key] = L.length; L.push(s); };
      cabecalhoPrograma(P, mt);
      blocoVariaveis(defs).forEach(function (s) { P(s); });
      P(''); P('G1900D#2L#3K0.'); P('');

      var v = { dBruto: '#2', sobre: '#11', incFace: '#13', qFace: '#14', av: '#15', avA: '#16', dUs: '#17', incTorn: '#18', pTorn: '#19', xRaio: '#21', raio: '#22', lUsin: '#3', ptZ: '#136', zIni: '#137', acabF: '#24', acabT: '#23', dRough: '#25' };
      var nn = { dBruto: n.dBruto, sobreZ: sobreZ, incFace: Number(tool.incFace), av: Number(tool.avDesb), avA: av, dUs: dUs, incTorn: Number(tool.incTorn), lUsin: n.lUsin, raio: n.raio, xRaio: dUs - 2 * n.raio, acabF: acabF, acabT: acabT, dRough: dUs + acabT };
      var z136 = sobreZ + 250;
      var pb = new PathB({ x: maq.xHome, z: z136 });

      cabTroca(P, v, 'FACEAMENTO E TORNEAMENTO', '#101');
      P('G96S#5M#12'); P('G50S#4'); P('M8'); if (fx.pr) P(fx.pr); P('');
      var cc = { P: P, pb: pb, v: v, n: nn, raio: raio, acab: true, xH: maq.xHome, trans: trans };
      faceTurn(cc);
      finishBlock(cc);
      P('G0Z#136(PT DE TROCA)', 'endz'); pb.rapid(pb.pos.x, z136, 'endz', 'RETORNO', 'a');
      P('G28U0(PT DE TROCA)', 'g28'); pb.rapid(maq.xHome, z136, 'g28', 'RETORNO', 'a');
      P('M9'); P(''); P('M30'); P('%');

      resolverLinhas(pb.moves, idx);
      var cena = cenaGen(n.dBruto, maq, sobreZ, n.lPeca, perfilQuina(n.dBruto, n.lPeca, dUs, n.lUsin, n.raio), (n.dBruto - dUs) / 2 + acabT / 2, dUs / 2 - 18, Math.min(n.lUsin, n.lPeca), {
        path: pb.moves, start: { x: maq.xHome, z: z136 }, tools: { a: simTool(tool) }
      });

      /* estrategia */
      var radial = (n.dBruto - dUs) / 2;
      var passesTorn = Math.max(1, Math.ceil((radial - acabT / 2) / Number(tool.incTorn)));
      var passesFace = (sobreZ - acabF) <= Number(tool.incFace) ? 1 : Math.ceil((sobreZ - acabF) / Number(tool.incFace));
      var est = [];
      est.push('Uma única ferramenta (T' + T + ' - ' + tool.nome + ') faz faceamento, torneamento e raio de quina, com Vc constante (G96, ' + fmt(tool.vc) + ' m/min) limitada a ' + fmt(tool.rpm) + ' RPM por G50 e giro M' + Number(tool.sentido) + '. A origem G54 fica na face acabada (Z0). O bloco bruto Ø' + fmt(n.dBruto) + ' x ' + fmt(n.lBruto) + ' deixa ' + fmt(sobreZ) + ' mm de sobremetal em Z e ' + fmt(radial) + ' mm por lado no diâmetro.');
      est.push(((sobreZ - acabF) <= Number(tool.incFace)
        ? 'O sobremetal em Z a desbastar (' + fmt(sobreZ - acabF) + ' mm) é menor ou igual ao incremento de faceamento (' + fmt(tool.incFace) + ' mm), então o G75 faceia em passe único.'
        : 'O faceamento usa G75 a partir de Z = sobremetal − incremento, descendo em passes de ' + fmt(tool.incFace) + ' mm (' + plural(passesFace, 'passe', 'passes') + ') até Z' + fmt(acabF) + '.')
        + (trans
          ? ' Em seguida o desbaste do diâmetro é TRANSVERSAL: o G75 desce de frente do Ø' + fmt(n.dBruto) + ' até Ø' + fmt(dUs + acabT) + ' em fatias de ' + fmt(tool.incFace) + ' mm em Z (' + plural(Math.max(1, Math.ceil((n.lUsin + acabF) / Number(tool.incFace))), 'fatia', 'fatias') + ') até ' + fmt(n.lUsin) + ' mm de profundidade. Cada fatia corta toda a profundidade radial de uma vez: confira se a pastilha aguenta.'
          : ' Em seguida o G74 torneia do Ø' + fmt(n.dBruto) + ' até Ø' + fmt(dUs + acabT) + ' por ' + fmt(n.lUsin) + ' mm em Z, com ' + fmt(tool.incTorn) + ' mm de profundidade por passe no raio (' + plural(passesTorn, 'passe', 'passes') + '). Se o sobremetal for menor que dois incrementos, o programa usina direto no diâmetro de desbaste, evitando passe no ar.'));
      est.push((raio ? 'O raio de quina R' + fmt(n.raio) + ' é feito em G3, com aproximação em Z0 a F' + fmt(av) + '. ' : 'Sem raio de quina (raio = 0). ')
        + textoAcab(acabF, acabT, av) + ' Ao terminar, a ferramenta recua ao ponto de troca (G28U0, Z' + fmt(z136) + '), desliga o refrigerante e finaliza com M30.');

      return { erros: [], avisos: avisos, code: L.join('\n'), estrategia: est, dicionario: dicionario(defs), nome: nomeArquivo(mt.nome) + '.txt', cena: cena };
    }
  };

  /* ---------- gerador: MATRIZ TUBULAR (encaixe / rebaixo central) ---------- */
  var MATRIZ_TUBULAR = {
    id: 'matriz_tubular',
    titulo: 'Matriz tubular',
    refPrograma: 'MATRIZ.TUBULAR.ENCAIXE.txt',
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo', tipos: ['externa', 'faceamento'] },
      { id: 't2', papel: 'Ferramenta de encaixe (canal frontal)', tipos: ['encaixe'] }
    ],
    campos: [
      { grupo: 'Bloco bruto', id: 'dBruto', label: 'Ø bruto', unit: 'mm', def: 230, hint: 'Diâmetro do bloco bruto (já com sobremetal)' },
      { grupo: 'Bloco bruto', id: 'lBruto', label: 'Comprimento bruto', unit: 'mm', def: 72, hint: 'Comprimento total do bloco' },
      { grupo: 'Peça final', id: 'dFinal', label: 'Ø da matriz (nominal)', unit: 'mm', def: 225, hint: 'Cota do desenho' },
      { grupo: 'Peça final', id: 'lPeca', label: 'Comprimento final da peça', unit: 'mm', def: 70, hint: 'Face acabada (Z0) até a outra face. Sobremetal Z = bruto − final' },
      { grupo: 'Peça final', id: 'lUsin', label: 'Comprimento de usinagem em Z', unit: 'mm', def: 31, hint: 'Atenção p/ não colidir na placa' },
      { grupo: 'Peça final', avancado: 'Raios e folgas', id: 'raio', label: 'Raio de quina', unit: 'mm', def: 3, hint: '0 = sem raio' },
      { grupo: 'Peça final', avancado: 'Raios e folgas', id: 'folga', label: 'Folga no Ø final', unit: 'mm', def: 0.3, hint: 'Padrão da casa: 0,3 mm abaixo do nominal' },
      { grupo: 'Encaixe (rebaixo central)', id: 'prof', label: 'Profundidade do rebaixo', unit: 'mm', def: 4, hint: 'Profundidade final do rebaixo central' },
      { grupo: 'Encaixe (rebaixo central)', id: 'dEnc', label: 'Ø de início do encaixe', unit: 'mm', def: 188, hint: 'Diâmetro da primeira camada (exemplo: Ø matriz − 37)' },
      { grupo: 'Encaixe (rebaixo central)', id: 'passoEnc', label: 'Passo no Ø entre camadas', unit: 'mm', def: 6, hint: 'Quanto o Ø diminui a cada camada' },
      { grupo: 'Sentido do desbaste', id: 'sentTorn', tipo: 'select', label: 'Desbaste do diâmetro', def: 'long', opcoes: SENT_TORN_OPC, hint: SENT_TORN_HINT }
    ].concat(camposFixacao('')),
    nomeAuto: function (f) { return 'MATRIZ.TUBULAR.ENCAIXE.D' + fmt(f.dFinal); },
    derivados: function (f) {
      return [['Ø usinado', fmt(f.dFinal - f.folga) + ' mm'], ['Sobremetal Z', fmt(f.lBruto - f.lPeca) + ' mm'], ['Sobremetal no Ø', fmt((f.dBruto - (f.dFinal - f.folga)) / 2) + ' mm/lado']];
    },

    gerar: function (f, tools, meta) {
      var t1 = tools && tools.t1, t2 = tools && tools.t2;
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dBruto', 'lBruto', 'dFinal', 'lPeca', 'lUsin', 'raio', 'folga', 'prof', 'dEnc', 'passoEnc']);
      var dUs = n.dFinal - n.folga, sobreZ = n.lBruto - n.lPeca, trans = f.sentTorn === 'trans';
      var fx = fixacao(f, meta, erros), maq = fx.maq;

      if (!(n.dFinal > 0)) erros.push('Informe o Ø da matriz.');
      if (!(n.dBruto > 0)) erros.push('Informe o Ø bruto.');
      if (!(n.lBruto > 0)) erros.push('Informe o comprimento bruto.');
      if (!(n.lPeca > 0)) erros.push('Informe o comprimento final da peça.');
      if (!(n.lUsin > 0)) erros.push('Informe o comprimento de usinagem em Z.');
      if (!(n.prof > 0)) erros.push('Informe a profundidade do rebaixo.');
      if (!(n.dEnc > 0)) erros.push('Informe o Ø de início do encaixe.');
      if (!(n.passoEnc > 0)) erros.push('Informe o passo no Ø entre camadas.');
      if (n.raio < 0 || n.folga < 0 || isNaN(n.raio) || isNaN(n.folga)) erros.push('Raio e folga não podem ser negativos.');
      if (!erros.length) {
        if (n.dBruto <= dUs) erros.push('Ø bruto (' + fmt(n.dBruto) + ') deve ser maior que o Ø usinado (' + fmt(dUs) + ').');
        if (sobreZ < 0) erros.push('Comprimento bruto é menor que o comprimento final da peça.');
        if (n.raio > 0 && dUs - 2 * n.raio <= 0) erros.push('Raio grande demais para o diâmetro.');
        var livre = n.lPeca - maq.grip;
        if (n.lUsin > livre) erros.push('Comprimento de usinagem (' + fmt(n.lUsin) + ') passa do trecho livre fora da placa (' + fmt(livre) + ' = peça ' + fmt(n.lPeca) + ' − preso ' + fmt(maq.grip) + '): a ferramenta bateria nas castanhas.');
        else if (livre - n.lUsin < 1) avisos.push('Folga de só ' + fmt(livre - n.lUsin) + ' mm entre o fim da usinagem e as castanhas.');
        if (n.lUsin > n.lPeca) avisos.push('Comprimento de usinagem maior que o comprimento da peça.');
        if (n.prof >= n.lPeca) erros.push('A profundidade do rebaixo não pode ser maior que a peça.');
        if (sobreZ === 0) avisos.push('Sobremetal em Z é zero: o faceamento corta direto em Z0.');
      }
      validarTool(t1, 't1', 'Ferramenta de faceamento/torneamento', ['externa', 'faceamento'], erros, avisos);
      validarTool(t2, 't2', 'Ferramenta de encaixe', ['encaixe'], erros, avisos);
      if (t2) {
        if (!(Number(t2.largura) > 0)) erros.push('Ferramenta de encaixe sem largura do canal (cadastre no banco).');
        if (!(Number(t2.incCanal) > 0)) erros.push('Ferramenta de encaixe sem incremento de corte do encaixe (cadastre no banco).');
        if (!(Number(t2.avAcab) > 0)) erros.push('Ferramenta de encaixe sem avanço de rampa/aproximação (cadastre no banco).');
      }
      var layers = [], x19f = 0, d, inc, w, acabF = 0, acabT = 0;
      if (!erros.length) {
        inc = Number(t2.incCanal); w = Number(t2.largura);
        acabF = num(t1.acabFace); acabT = num(t1.acabTorn);
        if (n.prof <= inc) erros.push('A profundidade do rebaixo (' + fmt(n.prof) + ') deve ser maior que o incremento de corte do encaixe (' + fmt(inc) + ').');
        if (n.passoEnc / 2 > w) avisos.push('O passo radial (' + fmt(n.passoEnc / 2) + ' mm) é maior que a largura do canal (' + fmt(w) + ' mm): ficarão degraus sem usinar.');
        var rRim0 = n.dEnc / 2 + w, rTop = dUs / 2 - n.raio;
        if (rRim0 >= rTop - 1) erros.push('O encaixe começa perto demais do diâmetro externo: não sobra parede (Ø de início + canal deve ficar menor que o Ø usinado − raio).');
        if (acabF > 0 && acabF >= sobreZ) avisos.push('Sobremetal de acabamento em Z (' + fmt(acabF) + ') não é menor que o sobremetal em Z (' + fmt(sobreZ) + '): o desbaste do faceamento não remove nada.');
      }
      if (!erros.length) {
        var x18 = n.dEnc, x19 = n.dEnc - n.passoEnc, guard = 0; d = inc;
        do { layers.push({ x18: x18, x19: x19, d: d }); x18 -= n.passoEnc; x19 -= n.passoEnc; d += inc; guard++; } while (d < n.prof && guard < 200);
        x19f = x19;
        if (x19f < 0) erros.push('As camadas passam do centro da peça (Ø final do encaixe ' + fmt(x19f) + '). Reduza o passo ou a profundidade.');
        if (guard >= 200) erros.push('Número de camadas excessivo.');
      }
      if (erros.length) return { erros: erros, avisos: avisos };

      var T1 = tcode(t1.t), T2 = tcode(t2.t), raio = n.raio > 0, aF = acabF > 0, aT = acabT > 0, fin = aF || aT;
      var av = Number(t1.avAcab) > 0 ? Number(t1.avAcab) : 0.15;

      var defs = [
        { sec: 'MEDIDAS FINAIS', n: 1, val: n.dFinal, c: 'DIAMETRO MATRIZ', efeito: 'Cota nominal do diametro externo. O diametro usinado = #1 - #10.' },
        { sec: 'MEDIDAS FINAIS', n: 4, val: n.lPeca, c: 'COMPRIMENTO FINAL DA PECA', efeito: 'Define o sobremetal em Z (#11 = #8 - #4).' },
        { sec: 'MEDIDAS FINAIS', n: 2, val: n.lUsin, c: 'COMPRIMENTO USINAGEM EM Z (ATENCAO P/ NAO COLIDIR NA PLACA)', efeito: 'Profundidade do torneamento a partir de Z0 e comprimento do bruto da simulacao (G1900).' },
        { sec: 'MEDIDAS FINAIS', n: 3, val: n.prof, c: 'PROFUNDIDADE REBAIXO CENTRAL', efeito: 'Profundidade final do rebaixo central, feito em camadas pela ferramenta de encaixe.' },
        { sec: 'ENCAIXE', n: 18, val: n.dEnc, c: 'DIAMETRO INICIAL DO ENCAIXE', efeito: 'Diametro da primeira camada do encaixe. ATENCAO: o programa altera esta variavel durante o laco (reinicie o programa pelo comeco).' },
        { sec: 'ENCAIXE', n: 20, val: n.passoEnc, c: 'PASSO NO DIAMETRO ENTRE CAMADAS', efeito: 'Quanto o diametro diminui a cada camada do encaixe.' },
        { sec: 'BRUTO', n: 7, val: n.dBruto, c: 'DIAMETRO BRUTO', efeito: 'Diametro do bloco. Inicio do faceamento/torneamento e bruto da simulacao (G1900).' },
        { sec: 'BRUTO', n: 8, val: n.lBruto, c: 'COMPRIMENTO BRUTO', efeito: 'Comprimento do bloco. Com #4 define o sobremetal em Z.' },
        { sec: 'FERRAMENTAS', n: 101, raw: T1, c: t1.nome, efeito: 'Ferramenta do faceamento, torneamento e raio (banco de ferramentas).' },
        { sec: 'FERRAMENTAS', n: 102, raw: T2, c: t2.nome, efeito: 'Ferramenta do encaixe (banco de ferramentas).' },
        { sec: 'PARAMETROS', n: 5, val: Number(t1.vc), c: 'VELOCIDADE DE CORTE', efeito: 'Vc em m/min (G96) da ferramenta 1.' },
        { sec: 'PARAMETROS', n: 6, val: Number(t1.rpm), c: 'LIMITE ROTACAO', efeito: 'Limite de RPM (G50) da ferramenta 1.' },
        { sec: 'PARAMETROS', n: 13, val: Number(t1.avDesb), c: 'AVANCO FACEAMENTO E TORNEAMENTO', efeito: 'Avanco (mm/rot) do desbaste: faceamento, torneamento e raio.' },
        { sec: 'PARAMETROS', n: 16, val: av, c: fin ? 'AVANCO APROXIMACAO E ACABAMENTO' : 'AVANCO APROXIMACAO RAIO', efeito: fin ? 'Avanco da aproximacao em Z0 e de todos os passes de acabamento.' : 'Avanco da aproximacao em Z0 antes do raio.' },
        { sec: 'PARAMETROS', n: 9, val: Number(t1.incFace), c: 'INCREMENTO FACEAMENTO', efeito: 'Profundidade de corte por passe em Z, no faceamento (G75)' + (trans ? ' e espessura das fatias do desbaste transversal do diametro (Q do G75).' : '.') },
        { sec: 'PARAMETROS', n: 26, val: Number(t1.incTorn), c: 'INCREMENTO TORNEAMENTO', efeito: 'Profundidade de corte por passe no raio, no torneamento (G74).' }
      ];
      if (raio) defs.push({ sec: 'PARAMETROS', n: 28, val: n.raio, c: 'RAIO', efeito: 'Raio de quina (G3). Para tirar o raio, apague o bloco do raio.' });
      defs.push(
        { sec: 'PARAMETROS', n: 10, val: n.folga, c: 'FOLGA NO DIAMETRO FINAL', efeito: 'Quanto o diametro usinado fica abaixo do nominal (0.3 padrao).' },
        { sec: 'PARAMETROS', n: 15, val: Number(t1.sentido), c: 'SENTIDO DE GIRO FERRAMENTA 1', efeito: '4 = M4, 3 = M3.' }
      );
      if (aT) defs.push({ sec: 'PARAMETROS', n: 32, val: acabT, c: 'SOBREMETAL ACABAMENTO NO DIAMETRO', efeito: TXT_ACAB_T });
      if (aF) defs.push({ sec: 'PARAMETROS', n: 33, val: acabF, c: 'SOBREMETAL ACABAMENTO EM Z', efeito: TXT_ACAB_F });
      defs.push(
        { sec: 'PARAMETROS', n: 50, val: Number(t2.vc), c: 'VELOCIDADE DE CORTE ENCAIXE', efeito: 'Vc em m/min (G96) da ferramenta de encaixe.' },
        { sec: 'PARAMETROS', n: 51, val: Number(t2.rpm), c: 'LIMITE ROTACAO ENCAIXE', efeito: 'Limite de RPM (G50) da ferramenta de encaixe.' },
        { sec: 'PARAMETROS', n: 52, val: Number(t2.avDesb), c: 'AVANCO ENCAIXE', efeito: 'Avanco (mm/rot) do corte em direcao ao centro (X0).' },
        { sec: 'PARAMETROS', n: 22, val: Number(t2.avAcab), c: 'AVANCO ANGULO ENCAIXE', efeito: 'Avanco (mm/rot) da rampa/descida de cada camada.' },
        { sec: 'PARAMETROS', n: 14, val: inc, c: 'INCREMENTO DE CORTE P/ ENCAIXE', efeito: 'Profundidade que cada camada do encaixe aumenta.' },
        { sec: 'PARAMETROS', n: 53, val: Number(t2.sentido), c: 'SENTIDO DE GIRO ENCAIXE', efeito: '4 = M4, 3 = M3.' },
        { sec: 'CALCULOS', n: 11, expr: '#8-#4', c: 'SOBREMETAL EM Z', efeito: 'Material a facear em Z.' },
        { sec: 'CALCULOS', n: 12, expr: '#9*1000', c: 'INCREMENTO FACEAMENTO EM 0.001MM', efeito: 'Valor Q do G75.' },
        { sec: 'CALCULOS', n: 19, expr: '#18-#20', c: 'DIAMETRO FINAL DA CAMADA', efeito: 'Diametro onde a rampa da camada termina.' },
        { sec: 'CALCULOS', n: 25, expr: '#1-#10', c: 'DIAMETRO USINADO', efeito: 'Diametro final que o torneamento usina.' },
        { sec: 'CALCULOS', n: 27, expr: '#26*1000', c: 'INCREMENTO TORNEAMENTO EM 0.001MM', efeito: 'Valor P do G74.' }
      );
      if (aT) defs.push({ sec: 'CALCULOS', n: 34, expr: '#25+#32', c: 'DIAMETRO DO DESBASTE', efeito: 'Diametro onde o desbaste para (usinado + sobremetal de acabamento).' });
      if (raio) defs.push(
        { sec: 'CALCULOS', n: 29, expr: '#28*2', c: 'RAIO X 2', efeito: 'Variacao de diametro do raio.' },
        { sec: 'CALCULOS', n: 30, expr: '#25-#29', c: 'INICIO DO RAIO EM X', efeito: 'Diametro onde comeca o arco.' }
      );
      defs.push(
        { sec: 'CALCULOS', n: 31, expr: '#14', c: 'INCREMENTO FIXO DO ENCAIXE', efeito: 'Copia fixa de #14 (que cresce no laco).' },
        { sec: 'CALCULOS', n: 130, expr: '#11+250', c: 'PT DE TROCA EM Z', efeito: 'Posicao Z segura de troca de ferramenta.' },
        { sec: 'CALCULOS', n: 135, expr: '#11-#9', c: 'INICIO DO FACEAMENTO EM Z', efeito: 'Z onde o G75 comeca (sobremetal - 1 incremento).' }
      );
      if (trans) defs = defs.filter(function (d) { return d.n !== 26 && d.n !== 27; }); // incremento radial do G74 nao e usado no desbaste transversal

      var mt = metaPadrao(meta, MATRIZ_TUBULAR, f);
      var L = [], idx = {};
      var P = function (s, key) { if (key) idx[key] = L.length; L.push(s); };
      cabecalhoPrograma(P, mt);
      blocoVariaveis(defs).forEach(function (s) { P(s); });
      P(''); P('G1900D#7L#2K0.'); P('');

      var v = { dBruto: '#7', sobre: '#11', incFace: '#9', qFace: '#12', av: '#13', avA: '#16', dUs: '#25', incTorn: '#26', pTorn: '#27', xRaio: '#30', raio: '#28', lUsin: '#2', ptZ: '#130', zIni: '#135', acabF: '#33', acabT: '#32', dRough: '#34' };
      var nn = { dBruto: n.dBruto, sobreZ: sobreZ, incFace: Number(t1.incFace), av: Number(t1.avDesb), avA: av, dUs: dUs, incTorn: Number(t1.incTorn), lUsin: n.lUsin, raio: n.raio, xRaio: dUs - 2 * n.raio, acabF: acabF, acabT: acabT, dRough: dUs + acabT };
      var z130 = sobreZ + 250;
      var pb = new PathB({ x: maq.xHome, z: z130 });

      cabTroca(P, v, 'FACEAMENTO E TORNEAMENTO', '#101');
      P('G96S#5M#15'); P('G50S#6'); P('M8'); if (fx.pr) P(fx.pr); P('');
      var cc = { P: P, pb: pb, v: v, n: nn, raio: raio, acab: true, xH: maq.xHome, trans: trans };
      faceTurn(cc);
      finishBlock(cc);
      P('G0X#7', 'g0x7'); pb.rapid(n.dBruto, pb.pos.z, 'g0x7', 'RETORNO', 'a');
      P('G28U0(PT DE TROCA)', 'g28a'); pb.rapid(maq.xHome, pb.pos.z, 'g28a', 'RETORNO', 'a');
      P('G0Z#130(PT DE TROCA)', 'g0z130a'); pb.rapid(maq.xHome, z130, 'g0z130a', 'RETORNO', 'a');
      P('');
      P('T#102(ENCAIXE)'); P('G54'); P('G96S#50M#53'); P('G50S#51');
      P('G0X#18(INICIO ENCAIXE)', 'g0x18'); pb.rapid(n.dEnc, z130, 'g0x18', 'ENCAIXE', 'b');
      P('Z1', 'z1b'); pb.rapid(n.dEnc, 1, 'z1b', 'ENCAIXE', 'b');
      P('');
      P('N100', 'n100');
      P('X#18(APROXIMACAO X PARA ENTRADA DO ENCAIXE)', 'x18');
      P('G1X#19Z-#14F#22', 'g1ramp');
      P('X0F#52', 'x0');
      P('G0Z2', 'g0z2');
      P('#18=#18-#20'); P('#19=#19-#20'); P('#14=#14+#31');
      P('N200IF[#14LT#3]GOTO100', 'n200');
      P('X#19', 'xfin');
      P('G1X#19Z-#3F#22', 'g1fin');
      P('X0F#52', 'x0b');
      P('G0Z10', 'g0z10');
      P('G28U0', 'g28b');
      P('G0Z#130', 'endz');
      P('M9'); P(''); P('M30'); P('%');

      var f22 = Number(t2.avAcab), f52 = Number(t2.avDesb), zc = 1;
      layers.forEach(function (ly) {
        pb.rapid(ly.x18, zc, 'x18', 'ENCAIXE', 'b');
        pb.feed(ly.x19, -ly.d, f22, 'g1ramp', 'ENCAIXE', 'b');
        pb.feed(0, -ly.d, f52, 'x0', 'ENCAIXE', 'b');
        pb.rapid(0, 2, 'g0z2', 'ENCAIXE', 'b'); zc = 2;
      });
      pb.rapid(x19f, 2, 'xfin', 'ENCAIXE', 'b');
      pb.feed(x19f, -n.prof, f22, 'g1fin', 'ENCAIXE', 'b');
      pb.feed(0, -n.prof, f52, 'x0b', 'ENCAIXE', 'b');
      pb.rapid(0, 10, 'g0z10', 'RETORNO', 'b');
      pb.rapid(maq.xHome, 10, 'g28b', 'RETORNO', 'b');
      pb.rapid(maq.xHome, z130, 'endz', 'RETORNO', 'b');

      resolverLinhas(pb.moves, idx);
      var rRimIn = n.dEnc / 2 + w;
      var cena = cenaGen(n.dBruto, maq, sobreZ, n.lPeca, perfilQuina(n.dBruto, n.lPeca, dUs, n.lUsin, n.raio), (n.dBruto - dUs) / 2 + acabT / 2, dUs / 2 - 18, Math.min(n.lUsin, n.lPeca), {
        path: pb.moves, start: { x: maq.xHome, z: z130 }, tools: { a: simTool(t1), b: simTool(t2, 'canal') }
      });
      // peca protegida = aro externo (a ferramenta de encaixe nao pode passar do Ø de inicio + canal)
      cena.protect = [[0, rRimIn]].concat(cena.outline).concat([[-n.lPeca, rRimIn]]);
      cena.ignore = [[-n.lPeca - 1, -1], [0, -1], [0, rRimIn], [-n.lPeca - 1, rRimIn]];

      /* estrategia */
      var radial = (n.dBruto - dUs) / 2;
      var passesTorn = Math.max(1, Math.ceil((radial - acabT / 2) / Number(t1.incTorn)));
      var passesFace = (sobreZ - acabF) <= Number(t1.incFace) ? 1 : Math.ceil((sobreZ - acabF) / Number(t1.incFace));
      var est = [];
      est.push('A ferramenta T' + T1 + ' (' + t1.nome + ') faceia, torneia e faz o raio de quina (G96, ' + fmt(t1.vc) + ' m/min, máx. ' + fmt(t1.rpm) + ' RPM, M' + Number(t1.sentido) + '). O bloco bruto Ø' + fmt(n.dBruto) + ' x ' + fmt(n.lBruto) + ' deixa ' + fmt(sobreZ) + ' mm de sobremetal em Z e ' + fmt(radial) + ' mm por lado. ' +
        ((sobreZ - acabF) <= Number(t1.incFace) ? 'O sobremetal em Z a desbastar cabe em um passe, então o G75 faceia direto. ' : 'O G75 faceia em ' + plural(passesFace, 'passe', 'passes') + ' de ' + fmt(t1.incFace) + ' mm. ') +
        (trans
          ? 'O desbaste do diâmetro é TRANSVERSAL: o G75 desce de frente até Ø' + fmt(dUs + acabT) + ' (nominal − folga ' + fmt(n.folga) + (aT ? ' + sobremetal de acabamento' : '') + ') em fatias de ' + fmt(t1.incFace) + ' mm em Z (' + plural(Math.max(1, Math.ceil((n.lUsin + acabF) / Number(t1.incFace))), 'fatia', 'fatias') + ') até ' + fmt(n.lUsin) + ' mm'
          : 'O G74 torneia até Ø' + fmt(dUs + acabT) + ' (nominal − folga ' + fmt(n.folga) + (aT ? ' + sobremetal de acabamento' : '') + ') por ' + fmt(n.lUsin) + ' mm, em ' + plural(passesTorn, 'passe', 'passes') + ' de ' + fmt(t1.incTorn) + ' mm no raio') + (raio ? ', e o raio R' + fmt(n.raio) + ' fecha a quina em G3. ' : '. ') + textoAcab(acabF, acabT, av) + txtPressao(fx.pr));
      est.push('Depois a ferramenta de encaixe T' + T2 + ' (' + t2.nome + ', canal de ' + fmt(w) + ' mm) faz o rebaixo central em ' + plural(layers.length + 1, 'camada', 'camadas') + ': cada camada desce em rampa (F' + fmt(f22) + ') enquanto o Ø cai ' + fmt(n.passoEnc) + ' mm, e depois corta até o centro (X0, F' + fmt(f52) + '). A profundidade cresce ' + fmt(inc) + ' mm por camada até ' + fmt(n.prof) + ' mm; a última camada é uma descida reta em Ø' + fmt(x19f) + '.');
      est.push('O Ø de início do encaixe (Ø' + fmt(n.dEnc) + ') e o passo (' + fmt(n.passoEnc) + ' mm) são entradas do programa. O laço (N100…N200) altera #18, #19 e #14, por isso o programa deve ser reiniciado pelo começo. Ao final a ferramenta sobe, vai ao ponto de troca (Z' + fmt(z130) + ') e o programa termina em M30.');

      return { erros: [], avisos: avisos, code: L.join('\n'), estrategia: est, dicionario: dicionario(defs), nome: nomeArquivo(mt.nome) + '.txt', cena: cena };
    }
  };

  /* ---------- gerador: ESPINA - CABECA (base CABECA.ESPINA.NOVO) ----------
     Cabeca (boss) na face: desbaste do rebaixo por mergulhos axiais em degraus de diametro,
     acabamento em G70 e repasse do contorno, como no programa da casa. */
  var ESPINA_CABECA = {
    id: 'espina_cabeca',
    titulo: 'Espina - cabeça',
    refPrograma: 'CABECA.ESPINA.NOVO.txt',
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo (desbaste e acabamento)', tipos: ['externa', 'faceamento'] }
    ],
    campos: [
      { grupo: 'Bloco bruto', id: 'dBruto', label: 'Ø bruto', unit: 'mm', def: 256, hint: 'Diâmetro do bloco bruto (já com sobremetal)' },
      { grupo: 'Bloco bruto', id: 'lBruto', label: 'Comprimento bruto', unit: 'mm', def: 72, hint: 'Comprimento total do bloco' },
      { grupo: 'Peça final', id: 'dFinal', label: 'Ø final nominal', unit: 'mm', def: 245, hint: 'Diâmetro externo da espina' },
      { grupo: 'Peça final', id: 'lPeca', label: 'Comprimento final da peça', unit: 'mm', def: 70, hint: 'Face acabada (Z0) até a outra face. Sobremetal Z = bruto − final' },
      { grupo: 'Peça final', id: 'lUsin', label: 'Comprimento de usinagem em Z', unit: 'mm', def: 30, hint: 'Comprimento do Ø externo torneado (atenção p/ não colidir na placa)' },
      { grupo: 'Peça final', id: 'folgaD', label: 'Folga no Ø final', unit: 'mm', def: 0.3, hint: 'Padrão da casa: 0,3 mm abaixo do nominal' },
      { grupo: 'Cabeça', id: 'dCab', label: 'Ø da cabeça', unit: 'mm', def: 145, hint: 'Diâmetro da cabeça (cilindro na face)' },
      { grupo: 'Cabeça', id: 'lCab', label: 'Comprimento da cabeça', unit: 'mm', def: 25, hint: 'Profundidade do rebaixo ao redor da cabeça' },
      { grupo: 'Cabeça', id: 'folgaL', label: 'Folga no comprimento da cabeça', unit: 'mm', def: 0.2, hint: 'Padrão da casa: o ombro fica 0,2 mm antes do comprimento nominal' },
      { grupo: 'Cabeça', id: 'rPonta', label: 'Raio da ponta da cabeça', unit: 'mm', def: 1, hint: 'Raio na face da cabeça (R1 no exemplo)' },
      { grupo: 'Cabeça', id: 'rOmbro', label: 'Raio do ombro', unit: 'mm', def: 3, hint: 'Raio na quina entre o ombro e o Ø externo (R3 no exemplo)' },
      { grupo: 'Cabeça', id: 'avFinal', label: 'Avanço final do mergulho', unit: 'mm/rot', def: 0.05, hint: 'Avanço dos últimos 2 mm do mergulho (padrão da casa .05)' }
    ],
    nomeAuto: function (f) { return 'CABECA.ESPINA.D' + fmt(f.dFinal) + '.C' + fmt(f.dCab); },
    derivados: function (f) {
      return [['Ø usinado', fmt(f.dFinal - f.folgaD) + ' mm'], ['Sobremetal Z', fmt(f.lBruto - f.lPeca) + ' mm'], ['Rebaixo ao redor', fmt((f.dFinal - f.dCab) / 2) + ' mm/lado']];
    },

    gerar: function (f, tools, meta) {
      var tool = tools && tools.t1;
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dBruto', 'lBruto', 'dFinal', 'lPeca', 'lUsin', 'folgaD', 'dCab', 'lCab', 'folgaL', 'rPonta', 'rOmbro', 'avFinal']);
      var dUs = n.dFinal - n.folgaD, sobreZ = n.lBruto - n.lPeca;
      var fx = fixacao(f, meta, erros), maq = fx.maq;

      ['dBruto', 'lBruto', 'dFinal', 'lPeca', 'lUsin', 'dCab', 'lCab', 'avFinal'].forEach(function (k) {
        if (!(n[k] > 0)) erros.push('Informe: ' + ESPINA_CABECA.campos.filter(function (c) { return c.id === k; })[0].label + '.');
      });
      ['folgaD', 'folgaL', 'rPonta', 'rOmbro'].forEach(function (k) { if (!(n[k] >= 0)) erros.push('Valor inválido: ' + ESPINA_CABECA.campos.filter(function (c) { return c.id === k; })[0].label + '.'); });
      validarTool(tool, 't1', 'Ferramenta de faceamento/torneamento', ['externa', 'faceamento'], erros, avisos);
      var acabT = 0, acabF = 0;
      if (!erros.length) {
        acabT = num(tool.acabTorn); acabF = num(tool.acabFace);
        if (n.dBruto <= dUs) erros.push('Ø bruto (' + fmt(n.dBruto) + ') deve ser maior que o Ø usinado (' + fmt(dUs) + ').');
        if (sobreZ < 0) erros.push('Comprimento bruto é menor que o comprimento final da peça.');
        if (n.dCab + 2 * acabT >= n.dFinal - 2 * n.rOmbro - 2 * Number(tool.incTorn)) erros.push('A cabeça é grande demais para o Ø final: não sobra rebaixo para usinar.');
        if (n.rPonta * 2 >= n.dCab) erros.push('Raio da ponta da cabeça grande demais.');
        if (n.lCab - n.folgaL - acabF <= 2) erros.push('Comprimento da cabeça pequeno demais (precisa ser maior que 2 mm + folgas).');
        if (n.lCab + n.rOmbro > n.lUsin) erros.push('Comprimento de usinagem (' + fmt(n.lUsin) + ') menor que o comprimento da cabeça + raio do ombro (' + fmt(n.lCab + n.rOmbro) + ').');
        var livre = n.lPeca - maq.grip;
        if (n.lUsin > livre) erros.push('Comprimento de usinagem (' + fmt(n.lUsin) + ') passa do trecho livre fora da placa (' + fmt(livre) + ' = peça ' + fmt(n.lPeca) + ' − preso ' + fmt(maq.grip) + '): a ferramenta bateria nas castanhas.');
        else if (livre - n.lUsin < 1) avisos.push('Folga de só ' + fmt(livre - n.lUsin) + ' mm entre o fim da usinagem e as castanhas.');
        if (n.lUsin > n.lPeca) avisos.push('Comprimento de usinagem maior que o comprimento da peça.');
        if (sobreZ === 0) avisos.push('Sobremetal em Z é zero: o faceamento corta direto em Z0.');
        if (!(acabT > 0) && !(acabF > 0)) avisos.push('Sem sobremetal de acabamento (Ø e Z = 0 na ferramenta/incrementos): o G70 só repassa o perfil sem remover material. O programa da casa usa .1 no Ø e .08 em Z — ajuste em "Incrementos de corte".');
      }
      if (erros.length) return { erros: erros, avisos: avisos };

      var T = tcode(tool.t);
      var incX = Number(tool.incTorn), incZ = Number(tool.incFace);
      var avF = Number(tool.avAcab) > 0 ? Number(tool.avAcab) : 0.25;
      var z27 = n.lCab - n.folgaL, z20 = n.lCab + n.rOmbro, z140 = z27 - acabF, z141 = n.lCab - 2;
      var x22 = n.dCab - 2 * n.rPonta, x21 = n.dFinal - 2 * n.rOmbro, x138 = n.dCab + acabT, x998 = incX * 2;
      if (z140 < z141) avisos.push('O mergulho rápido (' + fmt(z141) + ' mm) passa do fundo do mergulho (' + fmt(z140) + ' mm): os últimos mm saem no avanço final.');

      var defs = [
        { sec: 'MEDIDAS FINAIS', n: 3, val: n.dFinal, c: 'DIAMETRO FINAL', efeito: 'Cota nominal do diametro externo. O diametro usinado = #3 - #18.' },
        { sec: 'MEDIDAS FINAIS', n: 15, val: n.lPeca, c: 'COMPRIMENTO FINAL DA PECA', efeito: 'Define o sobremetal em Z (#2 = #14 - #15).' },
        { sec: 'MEDIDAS FINAIS', n: 4, val: n.lUsin, c: 'COMPRIMENTO USINAGEM EM Z', efeito: 'Comprimento do diametro externo torneado e do bruto da simulacao (G1900). Atencao p/ nao colidir na placa.' },
        { sec: 'MEDIDAS FINAIS', n: 5, val: n.lCab, c: 'COMPRIMENTO DA CABECA', efeito: 'Profundidade do rebaixo ao redor da cabeca.' },
        { sec: 'MEDIDAS FINAIS', n: 6, val: n.dCab, c: 'DIAMETRO CABECA', efeito: 'Diametro da cabeca.' },
        { sec: 'RAIOS E FOLGAS', n: 17, val: n.rPonta, c: 'RAIO DA PONTA DA CABECA', efeito: 'Raio (G3) na face da cabeca.' },
        { sec: 'RAIOS E FOLGAS', n: 16, val: n.rOmbro, c: 'RAIO DO OMBRO', efeito: 'Raio (G3) entre o ombro e o diametro externo.' },
        { sec: 'RAIOS E FOLGAS', n: 18, val: n.folgaD, c: 'FOLGA NO DIAMETRO FINAL', efeito: 'Quanto o diametro usinado fica abaixo do nominal.' },
        { sec: 'RAIOS E FOLGAS', n: 19, val: n.folgaL, c: 'FOLGA NO COMPRIMENTO DA CABECA', efeito: 'O ombro fica este valor antes do comprimento nominal da cabeca.' },
        { sec: 'BRUTO', n: 1, val: n.dBruto, c: 'DIAMETRO BRUTO', efeito: 'Diametro do bloco. Inicio do faceamento/torneamento e bruto da simulacao (G1900).' },
        { sec: 'BRUTO', n: 14, val: n.lBruto, c: 'COMPRIMENTO BRUTO', efeito: 'Comprimento do bloco. Com #15 define o sobremetal em Z.' },
        { sec: 'FERRAMENTAS', n: 103, raw: T, c: tool.nome, efeito: 'Ferramenta do desbaste e do acabamento, vinda do banco de ferramentas.' },
        { sec: 'PARAMETROS', n: 8, val: Number(tool.rpm), c: 'LIMITE DE ROTACAO', efeito: 'Limite de RPM (G50) para G96.' },
        { sec: 'PARAMETROS', n: 11, val: Number(tool.vc), c: 'VELOCIDADE DE CORTE', efeito: 'Vc em m/min (G96).' },
        { sec: 'PARAMETROS', n: 9, val: Number(tool.avDesb), c: 'AVANCO PARA DESBASTE', efeito: 'Avanco (mm/rot) do desbaste: faceamento, torneamento e mergulhos.' },
        { sec: 'PARAMETROS', n: 10, val: avF, c: 'AVANCO PARA ACABAMENTO', efeito: 'Avanco (mm/rot) do ciclo de acabamento (G70) e do repasse.' },
        { sec: 'PARAMETROS', n: 7, val: n.avFinal, c: 'AVANCO PARA FINAL DO DESBASTE', efeito: 'Avanco dos ultimos 2 mm do mergulho no fundo do rebaixo.' },
        { sec: 'PARAMETROS', n: 12, val: incX, c: 'INCREMENTO DE CORTE EM X', efeito: 'Profundidade por passe no raio do torneamento e largura de cada mergulho do rebaixo.' },
        { sec: 'PARAMETROS', n: 13, val: incZ, c: 'INCREMENTO CORTE EM Z', efeito: 'Profundidade de corte por passe em Z, no faceamento (G75).' },
        { sec: 'PARAMETROS', n: 137, val: acabT, c: 'SOBREMETAL ACABAMENTO DIAMETRO', efeito: 'Sobremetal no diametro da cabeca deixado pelos mergulhos para o acabamento.' },
        { sec: 'PARAMETROS', n: 139, val: acabF, c: 'SOBREMETAL ACABAMENTO COMPRIMENTO', efeito: 'Sobremetal em Z deixado no fundo do rebaixo para o acabamento.' },
        { sec: 'PARAMETROS', n: 23, val: Number(tool.sentido), c: 'SENTIDO DE GIRO', efeito: '4 = M4, 3 = M3.' },
        { sec: 'CALCULOS', n: 2, expr: '#14-#15', c: 'SOBREMETAL EM Z', efeito: 'Material a facear em Z.' },
        { sec: 'CALCULOS', n: 20, expr: '#5+#16', c: 'COMPRIMENTO DA CABECA MAIS RAIO DO OMBRO', efeito: 'Z final do raio do ombro.' },
        { sec: 'CALCULOS', n: 21, expr: '#3-[#16*2]', c: 'INICIO DO RAIO DO OMBRO EM X', efeito: 'Diametro onde comeca o raio do ombro.' },
        { sec: 'CALCULOS', n: 22, expr: '#6-[#17*2]', c: 'INICIO DO RAIO DA PONTA EM X', efeito: 'Diametro onde comeca o raio da ponta da cabeca.' },
        { sec: 'CALCULOS', n: 25, expr: '#13*1000', c: 'INCREMENTO FACEAMENTO EM 0.001MM', efeito: 'Valor Q do G75.' },
        { sec: 'CALCULOS', n: 27, expr: '#5-#19', c: 'POSICAO DO OMBRO EM Z', efeito: 'Z do ombro (comprimento da cabeca menos a folga).' },
        { sec: 'CALCULOS', n: 28, expr: '#3-#18', c: 'DIAMETRO USINADO', efeito: 'Diametro final que o torneamento usina.' },
        { sec: 'CALCULOS', n: 130, expr: '#2+250', c: 'PT DE TROCA EM Z', efeito: 'Posicao Z segura de troca de ferramenta.' },
        { sec: 'CALCULOS', n: 135, expr: '#2-#13', c: 'INICIO DO FACEAMENTO EM Z', efeito: 'Z onde o G75 comeca (sobremetal - 1 incremento).' },
        { sec: 'CALCULOS', n: 136, expr: '#12*1000', c: 'INCREMENTO TORNEAMENTO EM 0.001MM', efeito: 'Valor P do G74.' },
        { sec: 'CALCULOS', n: 138, expr: '#6+#137', c: 'DIAMETRO DA CABECA COM SOBREMETAL', efeito: 'Diametro onde para o ultimo mergulho (cabeca + sobremetal).' },
        { sec: 'CALCULOS', n: 140, expr: '#27-#139', c: 'FUNDO DO MERGULHO EM Z', efeito: 'Z do fundo do mergulho (ombro menos sobremetal).' },
        { sec: 'CALCULOS', n: 141, expr: '#5-2', c: 'FIM DO MERGULHO RAPIDO EM Z', efeito: 'Z onde o mergulho passa do avanco de desbaste para o avanco final.' },
        { sec: 'CALCULOS', n: 150, expr: '#3', c: 'DIAMETRO DO MERGULHO (VARIA NO LACO)', efeito: 'Diametro do mergulho atual; o laco o reduz a cada passe. ATENCAO: reinicie o programa pelo comeco.' },
        { sec: 'CALCULOS', n: 998, expr: '#12*2', c: 'PASSO DO MERGULHO NO DIAMETRO', efeito: 'Quanto o diametro do mergulho diminui a cada passe.' },
        { sec: 'CALCULOS', n: 997, expr: '#138+#998', c: 'DIAMETRO PARA SAIR DO LACO', efeito: 'O laco repete enquanto o diametro do mergulho for maior que este.' }
      ];

      var mt = metaPadrao(meta, ESPINA_CABECA, f);
      var L = [], idx = {};
      var P = function (s, key) { if (key) idx[key] = L.length; L.push(s); };
      cabecalhoPrograma(P, mt);
      blocoVariaveis(defs).forEach(function (s) { P(s); });
      P(''); P('G1900D#1L#4K0.'); P('');

      var v = { dBruto: '#1', sobre: '#2', incFace: '#13', qFace: '#25', av: '#9', avA: '#10', dUs: '#28', incTorn: '#12', pTorn: '#136', lUsin: '#4', ptZ: '#130', zIni: '#135' };
      var nn = { dBruto: n.dBruto, sobreZ: sobreZ, incFace: incZ, av: Number(tool.avDesb), avA: avF, dUs: dUs, incTorn: incX, lUsin: n.lUsin, acabF: 0, acabT: 0, dRough: dUs };
      var z130 = sobreZ + 250;
      var pb = new PathB({ x: maq.xHome, z: z130 });

      cabTroca(P, v, 'FACEAMENTO E TORNEAMENTO', '#103');
      P('G96S#11M#23'); P('G50S#8'); P('M8'); if (fx.pr) P(fx.pr); P('');
      P('(USAR GOTO80 AQUI PARA REPETIR ACABAMENTO)'); P('');
      faceTurn({ P: P, pb: pb, v: v, n: nn, raio: false, acab: false, xH: maq.xHome });
      var A = 'a';
      P('');
      P('(DESBASTE CABECA)');
      P('G0Z1', 'g0z1a'); pb.rapid(pb.pos.x, 1, 'g0z1a', 'DESBASTE CABECA', A);
      P('X#3', 'x3'); pb.rapid(n.dFinal, 1, 'x3', 'DESBASTE CABECA', A);
      P('N300', 'n300');
      P('#150=#150-#998');
      P('G0X#150', 'g0x150');
      P('G1Z-#141F#9', 'g1z141');
      P('G1Z-#140F#7', 'g1z140');
      P('X[#150+#998]F#9', 'xback');
      P('G0Z1', 'g0z1b');
      P('IF[#150GT#997]GOTO300', 'if300');
      var d150 = n.dFinal, loops = 0;
      do {
        d150 -= x998; loops++;
        pb.rapid(d150, 1, 'g0x150', 'DESBASTE CABECA', A);
        pb.feed(d150, -z141, Number(tool.avDesb), 'g1z141', 'DESBASTE CABECA', A);
        pb.feed(d150, -z140, n.avFinal, 'g1z140', 'DESBASTE CABECA', A);
        pb.feed(d150 + x998, -z140, Number(tool.avDesb), 'xback', 'DESBASTE CABECA', A);
        pb.rapid(d150 + x998, 1, 'g0z1b', 'DESBASTE CABECA', A);
      } while (d150 > x138 + x998 && loops < 500);
      P('G0Z1', 'g0z1c');
      P('X#138', 'x138'); pb.rapid(x138, 1, 'x138', 'DESBASTE CABECA', A);
      P('G1Z-#140F#9', 'g1z140b'); pb.feed(x138, -z140, Number(tool.avDesb), 'g1z140b', 'DESBASTE CABECA', A);
      P('G0Z1', 'g0z1d'); pb.rapid(x138, 1, 'g0z1d', 'DESBASTE CABECA', A);
      P('');
      P('N80', 'n80');
      P('G0X#1', 'g0x1'); pb.rapid(n.dBruto, 1, 'g0x1', 'ACABAMENTO', A);
      P('G0Z1');
      P('(CICLO DE ACABAMENTO)');
      P('G70P1Q2F#10', 'g70');
      P('N1G0X#22', 'n1');
      P('G1Z0', 'g1z0');
      if (n.rPonta > 0) P('G3X#6Z-#17R#17', 'g3a'); // raio 0 = quina viva: sem G3 (R0 e invalido)
      P('G1Z-#27', 'g1z27');
      P(n.rOmbro > 0 ? 'X#21' : 'X#28', 'x21');
      if (n.rOmbro > 0) P('G3X#28Z-#20R#16', 'g3b');
      P('G1Z-#4', 'g1z4');
      P('N2G0X#28', 'n2');
      P('G28U0', 'g28');
      P('G0Z#130', 'endz');
      P('M9'); P(''); P('M30'); P('%');

      // contorno acabado: percorrido pelo G70 e repassado em seguida como movimentos normais
      var pTip0 = [0, x22 / 2], pTip1 = [-n.rPonta, n.dCab / 2], pSh0 = [-z27, x21 / 2], pSh1 = [-z20, dUs / 2];
      function contorno(label) {
        pb.rapid(x22, 1, 'n1', label, A);
        pb.feed(x22, 0, avF, 'g1z0', label, A);
        if (n.rPonta > 0) pb.arcRP(pTip0, pTip1, n.rPonta, true, avF, 'g3a', label, A);
        pb.feed(n.dCab, -z27, avF, 'g1z27', label, A);
        pb.feed(n.rOmbro > 0 ? x21 : dUs, -z27, avF, 'x21', label, A);
        if (n.rOmbro > 0) pb.arcRP(pSh0, pSh1, n.rOmbro, true, avF, 'g3b', label, A);
        pb.feed(dUs, -n.lUsin, avF, 'g1z4', label, A);
      }
      contorno('ACABAMENTO (G70)');
      pb.rapid(n.dBruto, -n.lUsin, 'g70', 'ACABAMENTO (G70)', A);
      pb.rapid(n.dBruto, 1, 'g70', 'ACABAMENTO (G70)', A);
      contorno('REPASSE DO CONTORNO');
      pb.rapid(maq.xHome, -n.lUsin, 'g28', 'RETORNO', A);
      pb.rapid(maq.xHome, z130, 'endz', 'RETORNO', A);

      resolverLinhas(pb.moves, idx);
      var outline = [[0, x22 / 2]];
      if (n.rPonta > 0) outline = outline.concat(arcPts(pTip0, pTip1, n.rPonta, true, 12).slice(1));
      outline.push([-z27, n.dCab / 2]);
      if (n.rOmbro > 0) { outline.push([-z27, x21 / 2]); outline = outline.concat(arcPts(pSh0, pSh1, n.rOmbro, true, 12).slice(1)); }
      else outline.push([-z27, dUs / 2]);
      // meta.perfil (espina de dois lados): o Ø externo alem de lUsin ja foi torneado no outro lado
      var perf = meta && meta.perfil, rTail = perf ? perf.dTail / 2 : n.dBruto / 2;
      outline.push([-n.lUsin, dUs / 2], [-n.lUsin, rTail], [-n.lPeca, rTail]);
      var cena = cenaGen(n.dBruto, maq, sobreZ, n.lPeca, outline, (n.dBruto - dUs) / 2, n.dCab / 2 - 14, Math.min(n.lUsin, n.lPeca), {
        path: pb.moves, start: { x: maq.xHome, z: z130 }, tools: { a: simTool(tool) }
      });
      if (perf && perf.bruto) cena.bruto.perfil = perf.bruto;
      cena.foco.r0 = Math.max(-10, n.dCab / 2 - 14);

      var est = [];
      est.push('Uma única ferramenta (T' + T + ' - ' + tool.nome + ') faz tudo, com Vc constante (G96, ' + fmt(tool.vc) + ' m/min) limitada a ' + fmt(tool.rpm) + ' RPM por G50 e giro M' + Number(tool.sentido) + '.' + txtPressao(fx.pr) + ' O bloco bruto Ø' + fmt(n.dBruto) + ' x ' + fmt(n.lBruto) + ' deixa ' + fmt(sobreZ) + ' mm de sobremetal em Z. Faceamento em G75 (passes de ' + fmt(incZ) + ' mm) e torneamento do Ø externo até Ø' + fmt(dUs) + ' por ' + fmt(n.lUsin) + ' mm em G74 (passes de ' + fmt(incX) + ' mm no raio).');
      est.push('O rebaixo ao redor da cabeça (Ø' + fmt(n.dCab) + ' x ' + fmt(n.lCab) + ' mm) é desbastado por mergulhos axiais: a cada passe o diâmetro cai ' + fmt(x998) + ' mm (' + fmt(incX) + ' mm no raio) em ' + plural(loops, 'passe', 'passes') + ' do Ø' + fmt(n.dFinal - x998) + ' até perto da cabeça, mais um último mergulho em Ø' + fmt(x138) + '. Cada mergulho desce rápido (F' + fmt(Number(tool.avDesb)) + ') até Z' + fmt(z141) + ' e termina devagar (F' + fmt(n.avFinal) + ') até Z' + fmt(z140) + ', deixando ' + fmt(acabT) + ' mm no Ø da cabeça e ' + fmt(acabF) + ' mm em Z para o acabamento.');
      est.push('O acabamento usa o ciclo G70 (F' + fmt(avF) + ') sobre o contorno N1–N2: ' + (n.rPonta > 0 ? 'raio R' + fmt(n.rPonta) : 'quina viva (sem raio)') + ' na ponta da cabeça, ombro em Z' + fmt(z27) + ', ' + (n.rOmbro > 0 ? 'raio R' + fmt(n.rOmbro) : 'quina viva (sem raio)') + ' no ombro e Ø externo. Como no programa da casa, o contorno fica depois da chamada do G70 e por isso é executado uma segunda vez em movimento normal (um repasse). Para repetir só o acabamento, coloque GOTO80 no começo do programa. Ao terminar, vai ao ponto de troca (Z' + fmt(z130) + ') e finaliza com M30.');

      return { erros: [], avisos: avisos, code: L.join('\n'), estrategia: est, dicionario: dicionario(defs), nome: nomeArquivo(mt.nome) + '.txt', cena: cena };
    }
  };

  /* ---------- gerador: ENCAIXE (espina e alimentador) - base ENCAIXE.ESPINA.E.ALIMENTADOR ---------- */
  var ESPINA_ENCAIXE = {
    id: 'espina_encaixe',
    titulo: 'Encaixe (espina e alimentador)',
    refPrograma: 'ENCAIXE.ESPINA.E.ALIMENTADOR.txt',
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo (desbaste e acabamento)', tipos: ['externa', 'faceamento'] }
    ],
    campos: [
      { grupo: 'Bloco bruto', id: 'dBruto', label: 'Ø bruto', unit: 'mm', def: 204, hint: 'Diâmetro do bloco bruto (já com sobremetal)' },
      { grupo: 'Bloco bruto', id: 'lBruto', label: 'Comprimento bruto', unit: 'mm', def: 101, hint: 'Comprimento total do bloco' },
      { grupo: 'Peça final', id: 'dFinal', label: 'Ø final nominal', unit: 'mm', def: 200, hint: 'Cota do desenho' },
      { grupo: 'Peça final', id: 'lPeca', label: 'Comprimento final da peça', unit: 'mm', def: 100, hint: 'Face acabada (Z0) até a outra face. Sobremetal Z = bruto − final' },
      { grupo: 'Peça final', id: 'lUsin', label: 'Comprimento de usinagem em Z', unit: 'mm', def: 70, hint: 'Comprimento do Ø externo torneado (atenção p/ não colidir na placa)' },
      { grupo: 'Peça final', id: 'folga', label: 'Folga no Ø final', unit: 'mm', def: 0.3, hint: 'Padrão da casa: 0,3 mm abaixo do nominal' },
      { grupo: 'Encaixe', id: 'lEnc', label: 'Comprimento do encaixe', unit: 'mm', def: 10.1, hint: 'Profundidade do encaixe a partir da face' },
      { grupo: 'Encaixe', id: 'hEnc', label: 'Redução no Ø do encaixe', unit: 'mm', def: 10, hint: 'Ø do encaixe = Ø final − este valor (altura × 2)' },
      { grupo: 'Encaixe', id: 'rFace', label: 'Raio da face do encaixe', unit: 'mm', def: 5, hint: 'Raio na ponta (face) do encaixe' },
      { grupo: 'Encaixe', id: 'rEnc', label: 'Raio do ombro do encaixe', unit: 'mm', def: 3, hint: 'Raio entre o ombro do encaixe e o Ø externo' }
    ],
    nomeAuto: function (f) { return 'ENCAIXE.ESPINA.D' + fmt(f.dFinal); },
    derivados: function (f) {
      return [['Ø usinado', fmt(f.dFinal - f.folga) + ' mm'], ['Ø do encaixe', fmt(f.dFinal - f.hEnc) + ' mm'], ['Sobremetal Z', fmt(f.lBruto - f.lPeca) + ' mm']];
    },

    gerar: function (f, tools, meta) {
      var tool = tools && tools.t1;
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dBruto', 'lBruto', 'dFinal', 'lPeca', 'lUsin', 'folga', 'lEnc', 'hEnc', 'rFace', 'rEnc']);
      var dUs = n.dFinal - n.folga, dEncF = n.dFinal - n.hEnc, sobreZ = n.lBruto - n.lPeca;
      var fx = fixacao(f, meta, erros), maq = fx.maq;

      ['dBruto', 'lBruto', 'dFinal', 'lPeca', 'lUsin', 'lEnc', 'hEnc', 'rFace', 'rEnc'].forEach(function (k) {
        if (!(n[k] > 0)) erros.push('Informe: ' + ESPINA_ENCAIXE.campos.filter(function (c) { return c.id === k; })[0].label + '.');
      });
      if (!(n.folga >= 0)) erros.push('Folga inválida.');
      validarTool(tool, 't1', 'Ferramenta de faceamento/torneamento', ['externa', 'faceamento'], erros, avisos);
      var acabT = 0, acabF = 0;
      if (!erros.length) {
        acabT = num(tool.acabTorn); acabF = num(tool.acabFace);
        if (n.dBruto <= dUs) erros.push('Ø bruto (' + fmt(n.dBruto) + ') deve ser maior que o Ø usinado (' + fmt(dUs) + ').');
        if (sobreZ < 0) erros.push('Comprimento bruto é menor que o comprimento final da peça.');
        if (dEncF - 2 * n.rFace <= 0) erros.push('Raio da face grande demais para o Ø do encaixe.');
        if (n.rFace > n.hEnc / 2 + 1e-9) avisos.push('O raio da face (' + fmt(n.rFace) + ') é maior que a altura do encaixe (' + fmt(n.hEnc / 2) + ' mm no raio): o arco não fecha no Ø do encaixe.');
        if (n.rEnc > n.hEnc / 2 + 1e-9) erros.push('O raio do ombro (' + fmt(n.rEnc) + ') não cabe na altura do encaixe (' + fmt(n.hEnc / 2) + ' mm no raio).');
        if (n.lEnc < n.rFace) erros.push('Comprimento do encaixe menor que o raio da face.');
        if (n.lEnc + n.rEnc > n.lUsin) erros.push('Comprimento de usinagem (' + fmt(n.lUsin) + ') menor que o encaixe + raio do ombro (' + fmt(n.lEnc + n.rEnc) + ').');
        var livre = n.lPeca - maq.grip;
        if (n.lUsin > livre) erros.push('Limite de usinagem (' + fmt(n.lUsin) + ') passa do trecho livre fora da placa (' + fmt(livre) + ' = peça ' + fmt(n.lPeca) + ' − preso ' + fmt(maq.grip) + '): a ferramenta bateria nas castanhas.');
        else if (livre - n.lUsin < 1) avisos.push('Folga de só ' + fmt(livre - n.lUsin) + ' mm entre o fim da usinagem e as castanhas.');
        if (n.lUsin > n.lPeca) avisos.push('Comprimento de usinagem maior que o comprimento da peça.');
        if (acabF > 0 && acabF >= sobreZ) avisos.push('Sobremetal de acabamento em Z (' + fmt(acabF) + ') não é menor que o sobremetal em Z (' + fmt(sobreZ) + '): o desbaste do faceamento não remove nada.');
        if (sobreZ === 0) avisos.push('Sobremetal em Z é zero: o faceamento corta direto em Z0.');
      }
      if (erros.length) return { erros: erros, avisos: avisos };

      var T = tcode(tool.t), aF = acabF > 0, aT = acabT > 0, fin = aF || aT;
      var incF = Number(tool.incFace), incT = Number(tool.incTorn);
      var av = Number(tool.avDesb), avA = Number(tool.avAcab) > 0 ? Number(tool.avAcab) : 0.1;
      var fv = fin ? avA : av;
      var z21 = n.lEnc + n.rEnc, x108 = n.dFinal - 2 * n.rEnc, x19 = dEncF - 2 * n.rFace;
      var dODr = dUs + acabT, dEncR = dEncF + acabT, x137 = dODr - 2 * incT;
      var direct = (dODr - dEncR) <= 2 * incT;

      var defs = [
        { sec: 'MEDIDAS FINAIS', n: 1, val: n.dFinal, c: 'DIAMETRO FINAL', efeito: 'Cota nominal do diametro externo. O diametro usinado = #1 - #14.' },
        { sec: 'MEDIDAS FINAIS', n: 13, val: n.lPeca, c: 'COMPRIMENTO FINAL DA PECA', efeito: 'Define o sobremetal em Z (#11 = #12 - #13).' },
        { sec: 'MEDIDAS FINAIS', n: 2, val: n.lUsin, c: 'COMPRIMENTO DA USINAGEM NO EIXO Z', efeito: 'Comprimento do diametro externo torneado e do bruto da simulacao (G1900). Atencao p/ nao colidir na placa.' },
        { sec: 'MEDIDAS FINAIS', n: 3, val: n.lEnc, c: 'COMPRIMENTO DO ENCAIXE', efeito: 'Profundidade do encaixe a partir da face.' },
        { sec: 'MEDIDAS FINAIS', n: 136, val: n.hEnc, c: 'REDUCAO NO DIAMETRO DO ENCAIXE', efeito: 'Diametro do encaixe = #1 - #136 (altura do encaixe x 2).' },
        { sec: 'MEDIDAS FINAIS', n: 14, val: n.folga, c: 'FOLGA NO DIAMETRO FINAL', efeito: 'Quanto o diametro usinado fica abaixo do nominal.' },
        { sec: 'BRUTO', n: 5, val: n.dBruto, c: 'DIAMETRO BRUTO', efeito: 'Diametro do bloco. Inicio do faceamento/torneamento e bruto da simulacao (G1900).' },
        { sec: 'BRUTO', n: 12, val: n.lBruto, c: 'COMPRIMENTO BRUTO', efeito: 'Comprimento do bloco. Com #13 define o sobremetal em Z.' },
        { sec: 'RAIOS', n: 24, val: n.rEnc, c: 'RAIO DO ENCAIXE', efeito: 'Raio (G3) entre o ombro do encaixe e o diametro externo.' },
        { sec: 'RAIOS', n: 25, val: n.rFace, c: 'RAIO DA FACE', efeito: 'Raio (G3) na ponta do encaixe.' },
        { sec: 'FERRAMENTAS', n: 101, raw: T, c: tool.nome, efeito: 'Ferramenta do desbaste e do acabamento, vinda do banco de ferramentas.' },
        { sec: 'PARAMETROS', n: 4, val: incF, c: 'INCREMENTO FACEAMENTO', efeito: 'Profundidade de corte por passe em Z, no faceamento (G75).' },
        { sec: 'PARAMETROS', n: 6, val: incT, c: 'INCREMENTO TORNEAMENTO', efeito: 'Profundidade de corte por passe no raio (G74), no diametro externo e no encaixe.' },
        { sec: 'PARAMETROS', n: 8, val: Number(tool.rpm), c: 'LIMITE ROTACAO', efeito: 'Limite de RPM (G50) para G96.' },
        { sec: 'PARAMETROS', n: 9, val: Number(tool.vc), c: 'VELOCIDADE DE CORTE', efeito: 'Vc em m/min (G96).' },
        { sec: 'PARAMETROS', n: 15, val: av, c: 'AVANCO DE CORTE', efeito: 'Avanco (mm/rot) do desbaste' + (fin ? '.' : ' e do contorno do encaixe.') },
        { sec: 'PARAMETROS', n: 7, val: avA, c: fin ? 'AVANCO APROXIMACAO E ACABAMENTO' : 'AVANCO APROXIMACAO', efeito: fin ? 'Avanco da aproximacao em Z0 e de todos os passes de acabamento.' : 'Avanco da aproximacao em Z0 antes do raio da face.' },
        { sec: 'PARAMETROS', n: 10, val: Number(tool.sentido), c: 'SENTIDO DE GIRO', efeito: '4 = M4, 3 = M3.' }
      ];
      if (aT) defs.push({ sec: 'PARAMETROS', n: 20, val: acabT, c: 'SOBREMETAL ACABAMENTO NO DIAMETRO', efeito: TXT_ACAB_T });
      if (aF) defs.push({ sec: 'PARAMETROS', n: 23, val: acabF, c: 'SOBREMETAL ACABAMENTO EM Z', efeito: TXT_ACAB_F });
      defs.push(
        { sec: 'CALCULOS', n: 11, expr: '#12-#13', c: 'SOBREMETAL EM Z', efeito: 'Material a facear em Z.' },
        { sec: 'CALCULOS', n: 16, expr: '#1-#136', c: 'DIAMETRO DO ENCAIXE', efeito: 'Diametro final do encaixe.' },
        { sec: 'CALCULOS', n: 17, expr: '#6*1000', c: 'INCREMENTO TORNEAMENTO EM 0.001MM', efeito: 'Valor P do G74.' },
        { sec: 'CALCULOS', n: 22, expr: '#1-#14', c: 'DIAMETRO USINADO', efeito: 'Diametro final do torneamento externo.' }
      );
      if (aT) defs.push(
        { sec: 'CALCULOS', n: 28, expr: '#22+#20', c: 'DIAMETRO EXTERNO DO DESBASTE', efeito: 'Diametro onde o desbaste externo para (usinado + sobremetal de acabamento).' },
        { sec: 'CALCULOS', n: 27, expr: '#16+#20', c: 'DIAMETRO DO ENCAIXE NO DESBASTE', efeito: 'Diametro onde o desbaste do encaixe para (encaixe + sobremetal de acabamento).' }
      );
      defs.push(
        { sec: 'CALCULOS', n: 21, expr: '#3+#24', c: 'Z FINAL DO RAIO DO ENCAIXE', efeito: 'Z onde termina o raio entre o ombro e o diametro externo.' },
        { sec: 'CALCULOS', n: 26, expr: '#4*1000', c: 'INCREMENTO FACEAMENTO EM 0.001MM', efeito: 'Valor Q do G75.' },
        { sec: 'CALCULOS', n: 105, expr: '#25*2', c: 'RAIO DA FACE X 2', efeito: 'Variacao de diametro do raio da face.' },
        { sec: 'CALCULOS', n: 106, expr: '#24*2', c: 'RAIO DO ENCAIXE X 2', efeito: 'Variacao de diametro do raio do ombro.' },
        { sec: 'CALCULOS', n: 108, expr: '#1-#106', c: 'INICIO DO RAIO DO OMBRO EM X', efeito: 'Diametro onde comeca o raio do ombro.' },
        { sec: 'CALCULOS', n: 19, expr: '#16-#105', c: 'INICIO DO RAIO DA FACE EM X', efeito: 'Diametro onde comeca o raio da face.' },
        { sec: 'CALCULOS', n: 130, expr: '#11+250', c: 'PT DE TROCA EM Z', efeito: 'Posicao Z segura de troca de ferramenta.' },
        { sec: 'CALCULOS', n: 135, expr: '#11-#4', c: 'INICIO DO FACEAMENTO EM Z', efeito: 'Z onde o G75 comeca (sobremetal - 1 incremento).' },
        { sec: 'CALCULOS', n: 137, expr: (aT ? '#28' : '#22') + '-[#6*2]', c: 'INICIO DO DESBASTE DO ENCAIXE EM X', efeito: 'Diametro da primeira passada do desbaste do encaixe (externo menos 1 incremento).' }
      );

      var mt = metaPadrao(meta, ESPINA_ENCAIXE, f);
      var L = [], idx = {};
      var P = function (s, key) { if (key) idx[key] = L.length; L.push(s); };
      cabecalhoPrograma(P, mt);
      blocoVariaveis(defs).forEach(function (s) { P(s); });
      P(''); P('G1900D#5L#2K0.'); P('');

      var v = { dBruto: '#5', sobre: '#11', incFace: '#4', qFace: '#26', av: '#15', avA: '#7', dUs: '#22', incTorn: '#6', pTorn: '#17', lUsin: '#2', ptZ: '#130', zIni: '#135', acabF: '#23', acabT: '#20', dRough: '#28' };
      var nn = { dBruto: n.dBruto, sobreZ: sobreZ, incFace: incF, av: av, avA: avA, dUs: dUs, incTorn: incT, lUsin: n.lUsin, acabF: acabF, acabT: acabT, dRough: dODr };
      var z130 = sobreZ + 250;
      var pb = new PathB({ x: maq.xHome, z: z130 }), A = 'a';

      cabTroca(P, v, 'FACEAMENTO E TORNEAMENTO', '#101');
      P('G96S#9M#10'); P('G50S#8'); P('M8'); if (fx.pr) P(fx.pr); P('');
      faceTurn({ P: P, pb: pb, v: v, n: nn, raio: false, acab: true, xH: maq.xHome });
      P('');
      var dOD = aT ? '#28' : '#22', dEnc = aT ? '#27' : '#16';
      P('IF[' + dOD + '-' + dEnc + 'LE[#6*2]]GOTO30', 'if30');
      P('G0Z2', 'g0z2a');
      P('G0X#137', 'g0x137');
      P('G74X' + dEnc + 'Z-#3P#17Q999999R.5F#15(DESBASTE DO ENCAIXE)', 'g74c');
      P('GOTO70', 'goto70');
      P('N30G0Z2', 'n30');
      P('G0X' + dEnc, 'g0xenc');
      P('G74X' + dEnc + 'Z-#3P#17Q999999R.5F#15(DESBASTE DO ENCAIXE)', 'g74d');
      P('N70G0Z2', 'n70');
      if (direct) {
        pb.rapid(pb.pos.x, 2, 'n30', 'DESBASTE ENCAIXE', A);
        pb.rapid(dEncR, 2, 'g0xenc', 'DESBASTE ENCAIXE', A);
        cyc74(pb, dEncR, 2, dEncR, -n.lEnc, incT, 0.5, av, 'g74d', A);
      } else {
        pb.rapid(pb.pos.x, 2, 'g0z2a', 'DESBASTE ENCAIXE', A);
        pb.rapid(x137, 2, 'g0x137', 'DESBASTE ENCAIXE', A);
        cyc74(pb, x137, 2, dEncR, -n.lEnc, incT, 0.5, av, 'g74c', A);
      }
      pb.rapid(pb.pos.x, 2, 'n70', 'ACABAMENTO', A);
      if (aF) {
        P('G0X#16(ACABAMENTO DA FACE DO ENCAIXE)', 'g0x16f'); pb.rapid(dEncF, 2, 'g0x16f', 'ACAB. FACEAMENTO', A);
        P('G1Z0F#7', 'g1z0f'); pb.feed(dEncF, 0, avA, 'g1z0f', 'ACAB. FACEAMENTO', A);
        P('G1X-1F#7', 'g1xf'); pb.feed(-1, 0, avA, 'g1xf', 'ACAB. FACEAMENTO', A);
        P('G0Z2', 'g0z2f'); pb.rapid(-1, 2, 'g0z2f', 'ACAB. FACEAMENTO', A);
      }
      P('X#19', 'x19'); pb.rapid(x19, 2, 'x19', 'ACABAMENTO', A);
      P('G1Z0F#7', 'g1z0'); pb.feed(x19, 0, avA, 'g1z0', 'ACABAMENTO', A);
      P('G3X#16Z-#25R#25F' + (fin ? '#7' : '#15'), 'g3a');
      var q0 = [0, x19 / 2], q1 = [-n.rFace, dEncF / 2];
      pb.arcRP(q0, q1, n.rFace, true, fv, 'g3a', 'ACABAMENTO', A);
      P('G1Z-#3', 'g1z3'); pb.feed(dEncF, -n.lEnc, fv, 'g1z3', 'ACABAMENTO', A);
      P('X#108', 'x108'); pb.feed(x108, -n.lEnc, fv, 'x108', 'ACABAMENTO', A);
      P('G3X#22Z-#21R#24', 'g3b');
      pb.arcRP([-n.lEnc, x108 / 2], [-z21, dUs / 2], n.rEnc, true, fv, 'g3b', 'ACABAMENTO', A);
      if (aT) { P('G1Z-#2(ACABAMENTO DO DIAMETRO EXTERNO)', 'g1zod'); pb.feed(dUs, -n.lUsin, fv, 'g1zod', 'ACABAMENTO', A); }
      P('G28U0', 'g28'); pb.rapid(maq.xHome, pb.pos.z, 'g28', 'RETORNO', A);
      P('G0Z#130', 'endz'); pb.rapid(maq.xHome, z130, 'endz', 'RETORNO', A);
      P('M9'); P(''); P('M30'); P('%');

      resolverLinhas(pb.moves, idx);
      var outline = [[0, x19 / 2]].concat(arcPts(q0, q1, n.rFace, true, 12).slice(1));
      outline.push([-n.lEnc, dEncF / 2], [-n.lEnc, x108 / 2]);
      outline = outline.concat(arcPts([-n.lEnc, x108 / 2], [-z21, dUs / 2], n.rEnc, true, 12).slice(1));
      outline.push([-n.lUsin, dUs / 2], [-n.lUsin, n.dBruto / 2], [-n.lPeca, n.dBruto / 2]);
      var cena = cenaGen(n.dBruto, maq, sobreZ, n.lPeca, outline, (n.dBruto - dUs) / 2, dEncF / 2 - 18, Math.min(n.lUsin, n.lPeca), {
        path: pb.moves, start: { x: maq.xHome, z: z130 }, tools: { a: simTool(tool) }
      });

      var radial = (n.dBruto - dUs) / 2;
      var est = [];
      est.push('Uma única ferramenta (T' + T + ' - ' + tool.nome + ') faz faceamento, torneamento externo, encaixe e raios, com Vc constante (G96, ' + fmt(tool.vc) + ' m/min) limitada a ' + fmt(tool.rpm) + ' RPM por G50 e giro M' + Number(tool.sentido) + '.' + txtPressao(fx.pr) + ' O bloco bruto Ø' + fmt(n.dBruto) + ' x ' + fmt(n.lBruto) + ' deixa ' + fmt(sobreZ) + ' mm de sobremetal em Z e ' + fmt(radial) + ' mm por lado no diâmetro.' + txtPressao(fx.pr));
      est.push('Faceamento em G75 (passes de ' + fmt(incF) + ' mm até Z' + fmt(acabF) + ') e torneamento do Ø externo até Ø' + fmt(dODr) + ' por ' + fmt(n.lUsin) + ' mm em G74 (passes de ' + fmt(incT) + ' mm no raio). Depois o encaixe é desbastado em G74 de Ø' + fmt(direct ? dEncR : x137) + ' até Ø' + fmt(dEncR) + ' por ' + fmt(n.lEnc) + ' mm (' + (direct ? 'passe único, pois o rebaixo é menor que dois incrementos' : 'começando um incremento abaixo do Ø externo, para não gastar passe no ar') + ').');
      est.push('O contorno do encaixe é feito em uma passada: raio R' + fmt(n.rFace) + ' na face, cilindro Ø' + fmt(dEncF) + ' até Z' + fmt(n.lEnc) + ', ombro até Ø' + fmt(x108) + ' e raio R' + fmt(n.rEnc) + ' até o Ø externo. ' + textoAcab(acabF, acabT, avA) + ' Ao terminar vai ao ponto de troca (Z' + fmt(z130) + ') e finaliza com M30.');

      return { erros: [], avisos: avisos, code: L.join('\n'), estrategia: est, dicionario: dicionario(defs), nome: nomeArquivo(mt.nome) + '.txt', cena: cena };
    }
  };

  /* ---------- gerador: ESPINA (peca completa, dois lados) ----------
     Desenho: A = Ø do corpo, B = Ø do encaixe, C = comprimento do encaixe, D = comprimento do corpo,
     E = comprimento da cabeca, F = Ø da cabeca, G = C + D.
     Lado 1 = lado do encaixe (base ENCAIXE.ESPINA.E.ALIMENTADOR): faceia, torneia o Ø A por G e faz o encaixe.
     Lado 2 = lado da cabeca (base CABECA.ESPINA.NOVO): peca virada, faceia, acaba o Ø A na cabeca e faz a cabeca. */
  var ESPINA = {
    id: 'espina',
    titulo: 'Espina (2 lados)',
    refPrograma: 'ENCAIXE.ESPINA.E.ALIMENTADOR.txt + CABECA.ESPINA.NOVO.txt',
    desenho: 'espina',
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo (desbaste e acabamento)', tipos: ['externa', 'faceamento'] }
    ],
    // pos = posicao [x, y] da caixa de digitacao no desenho (viewBox 340 x 320)
    campos: [
      { grupo: 'Desenho', id: 'dFinal', letra: 'A', label: 'Ø do corpo', unit: 'mm', def: 245, pos: [44, 120], hint: 'Ø externo da espina' },
      { grupo: 'Desenho', id: 'dEnc', letra: 'B', label: 'Ø do encaixe', unit: 'mm', def: 235, pos: [50, 276], hint: 'Ø do encaixe (lado 1)' },
      { grupo: 'Desenho', id: 'lEnc', letra: 'C', label: 'Comprimento do encaixe', unit: 'mm', def: 10.1, pos: [92, 16], hint: 'Comprimento do encaixe (lado 1)' },
      { grupo: 'Desenho', id: 'lCorpo', letra: 'D', label: 'Comprimento do corpo', unit: 'mm', def: 60, pos: [176, 44], hint: 'Comprimento do corpo no Ø A' },
      { grupo: 'Desenho', id: 'lCab', letra: 'E', label: 'Comprimento da cabeça', unit: 'mm', def: 25, pos: [256, 16], hint: 'Comprimento da cabeça (lado 2)' },
      { grupo: 'Desenho', id: 'dCab', letra: 'F', label: 'Ø da cabeça', unit: 'mm', def: 145, pos: [296, 252], hint: 'Ø da cabeça (lado 2)' },
      { grupo: 'Bloco bruto', id: 'dBruto', label: 'Ø bruto', unit: 'mm', def: 256, hint: 'Diâmetro do bloco bruto (já com sobremetal)' },
      { grupo: 'Bloco bruto', id: 'lBruto', label: 'Comprimento bruto', unit: 'mm', def: 99, hint: 'Comprimento total do bloco (precisa ser maior que C + D + E)' },
      { grupo: 'Bloco bruto', id: 'sobre1', label: 'Sobremetal em Z no lado 1', unit: 'mm', def: 2, hint: 'O restante do sobremetal fica para o lado 2' },
      { grupo: 'Limites de usinagem do Ø A', id: 'lim1', opt: true, label: 'Limite do lado 1 (a partir da face do encaixe)', unit: 'mm', def: '', hint: 'Até onde o lado 1 torneia o Ø A. Vazio = G (C + D). Não pode passar do trecho livre fora da placa.' },
      { grupo: 'Limites de usinagem do Ø A', id: 'lim2', opt: true, label: 'Limite do lado 2 (a partir da face da cabeça)', unit: 'mm', def: '', hint: 'Até onde o lado 2 torneia o Ø A. Vazio = automático: cobre o que o lado 1 deixou + 2 mm de sobreposição (no mínimo E + raio do ombro + 2).' },
      { grupo: 'Raios e folgas', avancado: 'Raios e folgas', id: 'rFace', label: 'Raio da face do encaixe', unit: 'mm', def: 5, hint: 'Lado 1: raio na ponta do encaixe' },
      { grupo: 'Raios e folgas', avancado: 'Raios e folgas', id: 'rEnc', label: 'Raio do ombro do encaixe', unit: 'mm', def: 3, hint: 'Lado 1: raio entre o ombro do encaixe e o Ø A' },
      { grupo: 'Raios e folgas', avancado: 'Raios e folgas', id: 'rPonta', label: 'Raio da ponta da cabeça', unit: 'mm', def: 1, hint: 'Lado 2: raio na face da cabeça' },
      { grupo: 'Raios e folgas', avancado: 'Raios e folgas', id: 'rOmbro', label: 'Raio do ombro da cabeça', unit: 'mm', def: 3, hint: 'Lado 2: raio entre o ombro e o Ø A' },
      { grupo: 'Raios e folgas', avancado: 'Raios e folgas', id: 'folga', label: 'Folga no Ø A', unit: 'mm', def: 0.3, hint: 'Padrão da casa: 0,3 mm abaixo do nominal' },
      { grupo: 'Raios e folgas', avancado: 'Raios e folgas', id: 'folgaL', label: 'Folga no comprimento da cabeça', unit: 'mm', def: 0.2, hint: 'Padrão da casa: o ombro fica 0,2 mm antes do comprimento nominal' },
      { grupo: 'Raios e folgas', avancado: 'Raios e folgas', id: 'avFinal', label: 'Avanço final do mergulho', unit: 'mm/rot', def: 0.05, hint: 'Lado 2: avanço dos últimos 2 mm do mergulho' }
    ].concat(camposFixacao('', '1', '· lado 1 (preso pela cabeça)'), camposFixacao('', '2', '· lado 2 (preso pelo encaixe)')),
    nomeAuto: function (f) { return 'ESPINA.D' + fmt(f.dFinal); },
    // valores calculados mostrados no desenho
    desenhoDerivados: function (f) { return { G: fmt(f.lEnc + f.lCorpo) }; },
    // limites efetivos: lado 1 vazio = G; lado 2 vazio = cobre o que o lado 1 deixou + 2 mm (minimo: cabeca + ombro + 2)
    limites: function (f) {
      var G = f.lEnc + f.lCorpo, total = G + f.lCab;
      var l1 = isFinite(f.lim1) ? f.lim1 : G;
      var min2 = f.lCab + f.rOmbro + 2, auto2 = Math.max(min2, total - l1 + 2);
      return { G: G, total: total, l1: l1, min2: min2, auto2: auto2, l2: isFinite(f.lim2) ? f.lim2 : auto2 };
    },
    placeholders: function (f) { var L = ESPINA.limites(f); return { lim1: 'auto = G = ' + fmt(L.G), lim2: 'auto = ' + fmt(L.auto2) }; },
    derivados: function (f) {
      var L = ESPINA.limites(f), sobre2 = f.lBruto - f.sobre1 - L.total;
      return [['G (C + D)', fmt(L.G) + ' mm'], ['Comprimento total', fmt(L.total) + ' mm'], ['Limite Ø A lado 1 / lado 2', fmt(L.l1) + ' / ' + fmt(L.l2) + ' mm'], ['Sobreposição dos limites', fmt(L.l1 + L.l2 - L.total) + ' mm'], ['Ø usinado', fmt(f.dFinal - f.folga) + ' mm'], ['Sobremetal Z lado 1 / lado 2', fmt(f.sobre1) + ' / ' + fmt(sobre2) + ' mm']];
    },

    gerar: function (f, tools, meta) {
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dFinal', 'dEnc', 'lEnc', 'lCorpo', 'lCab', 'dCab', 'dBruto', 'lBruto', 'sobre1', 'lim1', 'lim2', 'rFace', 'rEnc', 'rPonta', 'rOmbro', 'folga', 'folgaL', 'avFinal', 'grip1', 'grip2']);
      if (f.grip1 === undefined) n.grip1 = GRIP_PADRAO;
      if (f.grip2 === undefined) n.grip2 = GRIP_PADRAO;
      ESPINA.campos.forEach(function (c) {
        if (c.opt || c.tipo === 'select') return;
        if (['rFace', 'rEnc', 'rPonta', 'rOmbro', 'folga', 'folgaL', 'sobre1'].indexOf(c.id) >= 0) { if (!(n[c.id] >= 0)) erros.push('Valor inválido: ' + c.label + '.'); }
        else if (!(n[c.id] > 0)) erros.push('Informe: ' + (c.letra ? c.letra + ' - ' : '') + c.label + '.');
      });
      if (erros.length) return { erros: erros, avisos: avisos };
      var G = n.lEnc + n.lCorpo, total = G + n.lCab, sobre2 = n.lBruto - n.sobre1 - total, dUs = n.dFinal - n.folga;
      if (n.dEnc >= n.dFinal) erros.push('B (Ø do encaixe) deve ser menor que A (Ø do corpo).');
      if (n.dCab >= n.dFinal) erros.push('F (Ø da cabeça) deve ser menor que A (Ø do corpo).');
      if (sobre2 < 0) erros.push('Comprimento bruto (' + fmt(n.lBruto) + ') insuficiente: precisa de pelo menos C + D + E + sobremetal do lado 1 = ' + fmt(total + n.sobre1) + ' mm.');
      if (n.dBruto <= dUs) erros.push('Ø bruto (' + fmt(n.dBruto) + ') deve ser maior que o Ø usinado (' + fmt(dUs) + ').');
      // limites de usinagem do Ø A: lado 1 a partir da face do encaixe, lado 2 a partir da face da cabeca.
      // Juntos precisam cobrir o comprimento total (lim1 + lim2 >= total); o lado 2 automatico cobre o que o lado 1 deixou + 2 mm.
      var LM = ESPINA.limites({ lEnc: n.lEnc, lCorpo: n.lCorpo, lCab: n.lCab, rOmbro: n.rOmbro, lim1: n.lim1, lim2: n.lim2 });
      var lim1 = LM.l1, lim2 = LM.l2, ovl = lim1 + lim2 - total;
      if (lim1 <= 0 || lim2 <= 0) erros.push('Os limites de usinagem precisam ser maiores que zero.');
      if (lim1 > total + 1e-9) erros.push('Limite do lado 1 (' + fmt(lim1) + ') maior que o comprimento total da espina (' + fmt(total) + ').');
      if (lim2 > total + 1e-9) erros.push('Limite do lado 2 (' + fmt(lim2) + ') maior que o comprimento total da espina (' + fmt(total) + ').');
      if (lim2 < LM.min2 - 1e-9) erros.push('Limite do lado 2 (' + fmt(lim2) + ') não chega ao ombro da cabeça: precisa de pelo menos E + raio do ombro + 2 = ' + fmt(LM.min2) + ' mm.');
      if (!erros.length) {
        if (ovl < -1e-9) erros.push('Os limites não se encontram: o lado 1 torneia até ' + fmt(lim1) + ' mm e o lado 2 até ' + fmt(lim2) + ' mm, mas a espina tem ' + fmt(total) + ' mm. Sobra uma faixa de ' + fmt(-ovl) + ' mm no Ø bruto sem usinar.');
        else if (ovl < 0.5) avisos.push('Os limites quase não se sobrepõem (' + fmt(ovl) + ' mm): pode ficar degrau no encontro dos dois lados. O normal é 1 a 2 mm de sobreposição.');
        if (lim1 > G + 1e-9) avisos.push('Limite do lado 1 (' + fmt(lim1) + ') passa de G (' + fmt(G) + '): o lado 1 já torneia ' + fmt(lim1 - G) + ' mm da região da cabeça e parte do torneamento do lado 2 corta em vazio.');
        if (lim1 < n.grip2) avisos.push('O lado 2 prende ' + fmt(n.grip2) + ' mm na placa, mas o lado 1 só torneou ' + fmt(lim1) + ' mm: as castanhas pegam um trecho ainda bruto.');
      }
      if (erros.length) return { erros: erros, avisos: avisos };

      var mt = metaPadrao(meta, ESPINA, f);
      var base = nomeArquivo(mt.nome);
      var f1 = { dBruto: n.dBruto, lBruto: n.lBruto, dFinal: n.dFinal, lPeca: n.lBruto - n.sobre1, lUsin: lim1, folga: n.folga, lEnc: n.lEnc, hEnc: n.dFinal - n.dEnc, rFace: n.rFace, rEnc: n.rEnc, grip: n.grip1, pressao: f.pressao };
      var f2 = { dBruto: n.dBruto, lBruto: n.lBruto - n.sobre1, dFinal: n.dFinal, lPeca: total, lUsin: lim2, folgaD: n.folga, dCab: n.dCab, lCab: n.lCab, folgaL: n.folgaL, rPonta: n.rPonta, rOmbro: n.rOmbro, avFinal: n.avFinal, grip: n.grip2, pressao: f.pressao };
      var m1 = { nome: base + '.LADO.01', autor: mt.autor, data: mt.data, maq: meta && meta.maq };
      var zT = -(total - lim1); // fim (em Z do lado 2) do trecho ja torneado no lado 1
      var m2 = { nome: base + '.LADO.02', autor: mt.autor, data: mt.data, maq: meta && meta.maq,
        // lado 2: o Ø A ja foi torneado no lado 1 ate o limite; so o restante (cabeca + sobremetal) continua no Ø bruto
        perfil: { dTail: dUs, bruto: [{ z0: sobre2, z1: zT, d: n.dBruto }, { z0: zT, z1: -total, d: dUs }] } };
      var r1 = ESPINA_ENCAIXE.gerar(f1, tools, m1), r2 = ESPINA_CABECA.gerar(f2, tools, m2);
      (r1.erros || []).forEach(function (e) { erros.push('Lado 1 (encaixe): ' + e); });
      (r2.erros || []).forEach(function (e) { erros.push('Lado 2 (cabeça): ' + e); });
      (r1.avisos || []).forEach(function (e) { avisos.push('Lado 1: ' + e); });
      (r2.avisos || []).forEach(function (e) { avisos.push('Lado 2: ' + e); });
      if (erros.length) return { erros: erros, avisos: avisos };

      var intro1 = 'LADO 1 (encaixe, primeira operação): o bloco é preso pelo lado da cabeça, que continua bruto. Este lado faceia (sobremetal ' + fmt(n.sobre1) + ' mm), torneia o Ø A até o limite de ' + fmt(lim1) + ' mm' + (Math.abs(lim1 - G) < 1e-9 ? ' (G = C + D)' : ' (G = ' + fmt(G) + ')') + ' e faz o encaixe B ' + fmt(n.dEnc) + ' x C ' + fmt(n.lEnc) + '.';
      var intro2 = 'LADO 2 (cabeça, segunda operação): vire a peça e prenda pelo lado do encaixe já usinado. O sobremetal restante em Z é ' + fmt(sobre2) + ' mm. A região da cabeça (E ' + fmt(n.lCab) + ' + sobremetal) ainda está no Ø bruto; o resto do Ø A já foi torneado no lado 1 (até ' + fmt(lim1) + ' mm a partir da face do encaixe). Este lado torneia o Ø A até o limite de ' + fmt(lim2) + ' mm a partir da face da cabeça, com ' + fmt(ovl) + ' mm de sobreposição com o lado 1.';
      var lados = [
        Object.assign({}, r1, { id: 'l1', titulo: 'Lado 1 · Encaixe', estrategia: [intro1].concat(r1.estrategia) }),
        Object.assign({}, r2, { id: 'l2', titulo: 'Lado 2 · Cabeça', estrategia: [intro2].concat(r2.estrategia) })
      ];
      return { erros: [], avisos: avisos, lados: lados };
    }
  };

  /* ---------- gerador: PECA SIMPLES (lista de trechos, 1 ou 2 lados) ----------
     Trechos, da face (Z0) ao fundo: cilindro, cone, chanfro, raio (cantos) e canal externo.
     Contorno em G71 + G70 (estilo PORTA.MATRIZ / CABECA.ESPINA.ANTIGO); canal em G75 com a ferramenta de canal.
     G71 tipo I exige diametro que nao diminui para dentro; o que diminui e feito pelo outro lado (lado 2). */
  var PS_MAX = 12, PS_VAR0 = 200, PS_ZVAR0 = 130, EPS = 1e-6;
  var PS_FORMAS = {
    cil: { nome: 'Cilindro', rot: ['Ø', 'Comprimento'] },
    cone: { nome: 'Cone', rot: ['Ø inicial', 'Ø final', 'Comprimento'] },
    chanfro: { nome: 'Chanfro', rot: ['Tamanho C'], canto: true },
    raio: { nome: 'Raio', rot: ['Raio R'], canto: true },
    canal: { nome: 'Canal externo', rot: ['Ø do fundo', 'Posição Z', 'Largura'] },
    rosca: { nome: 'Rosca externa', rot: ['Ø nominal', 'Comprimento', 'Passo'] }
  };
  function psN(x) { return (x === '' || x == null) ? NaN : Number(x); }
  /* ---------- rosca (G76) ----------
     A rosca e um cilindro com uma operacao G76 por cima: externa = cilindro no Ø nominal (o G76 desce ate o fundo do filete);
     interna = furo mandrilado no Ø menor da porca (D1) e o G76 sobe ate o Ø nominal. Assim ela herda a posicao sequencial, o canto
     de entrada (chanfro) e o canal de alivio depois dela. Formulas: apostila "Calculo de Roscas" (metrica ISO 60 graus) e manual ROMI 0i-TD (G76). */
  function psRoscaD1(d, p) { return Math.round((d - 1.0825 * p) * 100) / 100; }
  function psRoscaPar(d, p, interna) { // altura do filete (no raio), passadas e 1a profundidade (Q = altura / raiz da qtd de passadas, como no manual da ROMI)
    var he = interna ? (d - psRoscaD1(d, p)) / 2 : 0.61343 * p, n = Math.max(6, Math.min(16, Math.round(he / 0.14)));
    return { d: d, p: p, he: Math.round(he * 1000) / 1000, n: n, pMic: Math.round(he * 1000), qMic: Math.round(1000 * he / Math.sqrt(n)) };
  }
  // variaveis da rosca do trecho k: passo, comprimento da rosca, qtd de passadas e as contas do G76 (altura do filete, P e Q em milesimos)
  function psRoscaVars(k, par, out, nm, SEC, vP, nL, rl, interna, vDnom, vD1) {
    var he = '#' + (380 + k), pv = '#' + (400 + k), qv = '#' + (420 + k), nv = '#' + (440 + k);
    out.defs.push({ sec: SEC, n: nL - 1, val: par.p, c: nm + 'ROSCA PASSO', efeito: 'Passo da rosca (F do G76). Rosca metrica ISO de 60 graus.' },
      { sec: SEC, n: nL, val: rl, c: nm + 'ROSCA COMPRIMENTO', efeito: 'Comprimento roscado a partir do inicio do trecho (o canal de alivio depois dela fica fora deste valor).' },
      { sec: SEC, n: 440 + k, val: par.n, c: nm + 'ROSCA QTD DE PASSADAS', efeito: 'Passadas do G76 para chegar ao fundo do filete; so define o primeiro passe (Q = altura / raiz da quantidade).' });
    if (interna) out.defs.push({ sec: SEC, n: 460 + k, val: par.d, c: nm + 'ROSCA DIAMETRO NOMINAL', efeito: 'Diametro maior da rosca interna (o G76 sobe ate aqui). O furo mandrilado fica no diametro menor da porca: Ø nominal - 1,0825 x passo.' });
    out.calcs.push(
      { sec: 'CALCULOS', n: 380 + k, expr: interna ? '[' + vDnom + '-' + vD1 + ']/2' : '0.61343*' + vP, c: nm + 'ROSCA ALTURA DO FILETE', efeito: interna ? 'Altura do filete da porca no raio = (Ø nominal - Ø do furo) / 2.' : 'Altura do filete no raio = 0,61343 x passo (apostila Calculo de Roscas). O G76 desce ate o diametro nominal menos 2 x esta altura.' },
      { sec: 'CALCULOS', n: 400 + k, expr: 'ROUND[' + he + '*1000]', c: nm + 'ROSCA ALTURA EM 0.001MM', efeito: 'Valor P do G76 (altura do filete, milesimos de mm no raio).' },
      { sec: 'CALCULOS', n: 420 + k, expr: 'ROUND[' + he + '*1000/SQRT[' + nv + ']]', c: nm + 'ROSCA 1A PASSADA EM 0.001MM', efeito: 'Valor Q do G76 (profundidade da 1a passada = altura / raiz da qtd de passadas, como no manual da ROMI; as seguintes crescem com a raiz).' });
    return { vh: he, vpm: pv, vqm: qv, he: par.he, n: par.n, pMic: par.pMic, qMic: par.qMic };
  }
  function psNormRosca(lista, int) { // rosca/irosca -> cilindro (guardando a rosca em _rosca); o resto passa igual
    var tp = int ? 'irosca' : 'rosca';
    if (!Array.isArray(lista) || !lista.some(function (it) { return it && it.tipo === tp; })) return lista;
    return lista.map(function (it) {
      if (!it || it.tipo !== tp) return it;
      var a = psN(it.a), p = psN(it.c), r = Object.assign({}, it, { tipo: int ? 'icil' : 'cil', _rosca: { d: a, l: psN(it.b), p: p } });
      if (int && a > 0 && p > 0) r.a = psRoscaD1(a, p);
      return r;
    });
  }
  function addS(a, b) { return a === '0' ? b : '[' + a + '+' + b + ']'; }
  function subS(a, b) { return '[' + a + '-' + b + ']'; }
  function xmS(d, s) { return '[' + d + '-' + s + '*2]'; }
  function xpS(d, s) { return '[' + d + '+' + s + '*2]'; }
  function zS(sym) { return sym === '0' ? 'Z0' : 'Z-' + sym; }

  // raio do perfil (polilinha [z, r], z <= 0 decrescente) na profundidade d (positiva); ignora degraus verticais
  function psRaioEm(pts, d) {
    var z = -d;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (a[0] - b[0] < EPS) continue;
      if (z <= a[0] + EPS && z >= b[0] - EPS) return a[1] + (b[1] - a[1]) * (a[0] - z) / (a[0] - b[0]);
    }
    return pts.length ? pts[pts.length - 1][1] : 0;
  }
  // primeira profundidade (z negativo) em que o perfil atinge o raio rl, vindo da face
  function psAcerto(cp, rl) {
    for (var i = 0; i < cp.length - 1; i++) {
      var a = cp[i], b = cp[i + 1];
      if (a[1] >= rl - 1e-9) return a[0];
      if (b[1] >= rl - 1e-9) return a[0] + (b[0] - a[0]) * (rl - a[1]) / (b[1] - a[1]);
    }
    return cp[cp.length - 1][0];
  }

  // canal sequencial (item canal com seq:true, so Ø do fundo e largura): entra logo depois do ultimo elemento, ocupa a largura dele e o Ø em volta e o do
  // cilindro anterior (que passa a incluir a largura do canal); o proximo elemento comeca depois do canal. Vira o canal "absoluto" do gerador (posicao Z calculada).
  function psSeq(lista, err) {
    if (!Array.isArray(lista) || !lista.some(function (it) { return it && it.seq; })) return lista;
    var out = [], z = 0, prev = null;
    lista.forEach(function (it, k) {
      if (it.tipo === 'cil') { var c = Object.assign({}, it); out.push(c); z += psN(it.b) || 0; prev = c; }
      else if (it.tipo === 'cone') { out.push(it); z += psN(it.c) || 0; prev = null; }
      else if (it.tipo === 'canal' && it.seq) {
        var w = psN(it.c), P0 = 'trecho ' + (k + 1) + ' (Canal externo): ';
        if (!prev) { err(P0 + 'o canal entra logo depois de um cilindro (ele ocupa o fim do cilindro anterior): coloque um cilindro antes dele.'); out.push(it); return; }
        if (!(w > 0)) { out.push(it); return; }
        out.push(Object.assign({}, it, { b: z, seq: false }));
        prev.b = (psN(prev.b) || 0) + w; z += w;
      } else out.push(it);
    });
    return out;
  }

  // Constroi o contorno (G71) a partir da lista. Devolve {ok, defs, calcs, moves, pts, canais, zEnd, hMax, ...}
  function psContorno(lista, R0, dBrutoSym, rot, erros, modo) {
    var out = { ok: true, defs: [], calcs: [], moves: [], pts: [], canais: [], zEnd: 0, hMax: 0, somaL: 0 };
    var nErr = erros.length;
    function err(m) { erros.push(rot + m); }
    lista = psSeq(lista, err);
    if (erros.length > nErr) { out.ok = false; return out; }
    if (!Array.isArray(lista) || !lista.length) { err('adicione ao menos um trecho (cilindro ou cone).'); out.ok = false; return out; }
    if (lista.length > PS_MAX) { err('no máximo ' + PS_MAX + ' trechos por lado.'); out.ok = false; return out; }
    var pieces = [], marks = [], anch = [], zPrev = '0', zNum = 0;
    lista.forEach(function (it, k) {
      var t = it.tipo, F = PS_FORMAS[t], nm = 'TRECHO ' + (k + 1) + ' ', P0 = 'trecho ' + (k + 1) + ' (' + (it._rosca ? PS_FORMAS.rosca.nome : F ? F.nome : t) + '): ';
      var a = psN(it.a), b = psN(it.b), c = psN(it.c), vA = '#' + (PS_VAR0 + 4 * k), vB = '#' + (PS_VAR0 + 4 * k + 1), vC = '#' + (PS_VAR0 + 4 * k + 2), nA = PS_VAR0 + 4 * k;
      if (!F) { err(P0 + 'forma desconhecida.'); return; }
      var SEC = 'TRECHOS - DA FACE AO FUNDO';
      if (t === 'cil') {
        if (!(a > 0) || !(b > 0)) { err(P0 + 'informe Ø e comprimento maiores que zero.'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + 'CILINDRO DIAMETRO', efeito: 'Diametro final do trecho cilindrico.' },
          { sec: SEC, n: nA + 1, val: b, c: nm + 'CILINDRO COMPRIMENTO', efeito: 'Comprimento do trecho em Z. Entra na soma que posiciona os trechos seguintes.' });
        var ros = null;
        if (it._rosca) { // rosca externa: Ø nominal = este cilindro; passo e altura do filete nas variaveis seguintes
          var rp = it._rosca, rl = rp.l, rps = psRoscaPar(a, rp.p, false);
          if (!(rp.p > 0) || !(rl > 0)) { err(P0 + 'informe Ø nominal, comprimento e passo maiores que zero.'); return; }
          if (rps.he * 2 > a - 1) { err(P0 + 'o passo (' + fmt(rp.p) + ') é grande demais para o Ø ' + fmt(a) + ': a altura do filete não cabe.'); return; }
          ros = Object.assign({ d: a, l: rl, p: rp.p, vd: vA, vl: '#' + (nA + 3), vp: vC, nome: P0 }, psRoscaVars(k, rps, out, nm, SEC, vC, nA + 3, rl, false, null));
        }
        zNum += b; var zv = '#' + (PS_ZVAR0 + k);
        out.calcs.push({ sec: 'CALCULOS', n: PS_ZVAR0 + k, expr: zPrev === '0' ? vB : zPrev + '+' + vB, c: nm + 'Z FINAL', efeito: 'Profundidade (a partir de Z0) onde o trecho termina.' });
        pieces.push({ k: k, id: it.id, t: t, d1: a, d2: a, d1s: vA, d2s: vA, L: b, zS: zPrev === '0' ? '0' : zPrev, zN0: zNum - b, zE: zv, zN1: zNum, marks: marks, rosca: ros });
        zPrev = zv; marks = [];
      } else if (t === 'cone') {
        if (!(a > 0) || !(b > 0) || !(c > 0)) { err(P0 + 'informe Ø inicial, Ø final e comprimento maiores que zero.'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + 'CONE DIAMETRO INICIAL', efeito: 'Diametro no inicio do cone (lado da face).' },
          { sec: SEC, n: nA + 1, val: b, c: nm + 'CONE DIAMETRO FINAL', efeito: 'Diametro no fim do cone.' },
          { sec: SEC, n: nA + 2, val: c, c: nm + 'CONE COMPRIMENTO', efeito: 'Comprimento do cone em Z.' });
        zNum += c; var zv2 = '#' + (PS_ZVAR0 + k);
        out.calcs.push({ sec: 'CALCULOS', n: PS_ZVAR0 + k, expr: zPrev === '0' ? vC : zPrev + '+' + vC, c: nm + 'Z FINAL', efeito: 'Profundidade (a partir de Z0) onde o cone termina.' });
        pieces.push({ k: k, id: it.id, t: t, d1: a, d2: b, d1s: vA, d2s: vB, L: c, zS: zPrev === '0' ? '0' : zPrev, zN0: zNum - c, zE: zv2, zN1: zNum, marks: marks });
        zPrev = zv2; marks = [];
      } else if (t === 'chanfro' || t === 'raio') {
        if (!(a > 0)) { err(P0 + 'informe o tamanho maior que zero.'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + (t === 'chanfro' ? 'CHANFRO TAMANHO' : 'RAIO'), efeito: t === 'chanfro' ? 'Chanfro a 45 graus: o corte tira este valor nos dois lados do canto.' : 'Raio (G2/G3) de arredondamento do canto.' });
        if (it.alvo !== undefined) { // canto escolhido: alvo = id do cilindro, onde = 'ini' (quina na entrada do trecho) ou 'fim' (pe do degrau no fim do trecho)
          if (!it.alvo) { err(P0 + 'escolha o canto onde o ' + (t === 'chanfro' ? 'chanfro' : 'raio') + ' vai.'); return; }
          anch.push({ m: { t: t, size: a, sym: vA, nome: P0 }, alvo: it.alvo, onde: it.onde === 'fim' ? 'fim' : 'ini' });
        } else marks.push({ t: t, size: a, sym: vA, canto: it.canto === 'int' ? 'int' : 'ext', nome: P0 });
      } else if (t === 'canal') {
        if (!(a > 0) || !(b >= 0) || !(c > 0)) { err(P0 + 'informe Ø do fundo, posição Z e largura (maiores que zero).'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + 'CANAL DIAMETRO DO FUNDO', efeito: 'Diametro no fundo do canal (G75 desce ate aqui).' },
          { sec: SEC, n: nA + 1, val: b, c: nm + 'CANAL POSICAO Z', efeito: 'Distancia da face (Z0) ate a parede do canal mais proxima da face.' },
          { sec: SEC, n: nA + 2, val: c, c: nm + 'CANAL LARGURA', efeito: 'Largura do canal em Z (precisa ser maior ou igual a largura da ferramenta).' });
        out.canais.push({ k: k, d: a, z: b, w: c, vd: vA, vz: vB, vw: vC, nome: P0 });
      }
    });
    if (erros.length > nErr) { out.ok = false; return out; }
    if (!pieces.length) { err('adicione ao menos um cilindro ou cone.'); out.ok = false; return out; }
    var finalMarks = marks, rPrev = 0, hMax = 0;
    pieces.forEach(function (pc, j) {
      var P0 = 'trecho ' + (pc.k + 1) + ' (' + PS_FORMAS[pc.t].nome + '): ';
      if (pc.d1 > 2 * R0 + EPS || pc.d2 > 2 * R0 + EPS) err(P0 + 'diâmetro maior que o Ø bruto (' + fmt(2 * R0) + ').');
      if (j > 0 && pc.d1 / 2 < rPrev - EPS) err(P0 + 'o diâmetro diminui (Ø' + fmt(2 * rPrev) + ' → Ø' + fmt(pc.d1) + ') indo para o fundo. O G71 não faz isso: esse trecho precisa ser feito pelo outro lado (use 2 lados) ou reordene.');
      if (pc.d2 < pc.d1 - EPS) err(P0 + 'cone que diminui (Ø' + fmt(pc.d1) + ' → Ø' + fmt(pc.d2) + ') indo para o fundo. O G71 não faz isso: faça esse cone pelo outro lado (use 2 lados).');
      rPrev = Math.max(rPrev, pc.d2 / 2);
    });
    if (erros.length > nErr) { out.ok = false; return out; }

    // cantos (chanfro/raio): tx[j] = convexo no inicio da peca j; tc[j] = concavo no fim da peca j
    var tx = pieces.map(function () { return null; }), tc = pieces.map(function () { return null; });
    function aplica(lista, j, ehFim) { // lista de marcas de uma parede; j = peca depois (ou pieces.length no fim)
      lista.forEach(function (m) {
        if (m.canto === 'ext') {
          if (ehFim) { err(m.nome + 'não há canto externo depois do último trecho (o fim é um degrau para cima). Use canto interno.'); return; }
          if (tx[j]) { err(m.nome + 'só um chanfro/raio externo por canto.'); return; }
          tx[j] = m;
        } else {
          if (j === 0) { err(m.nome + 'não há canto interno antes do primeiro trecho (é a face). Use canto externo.'); return; }
          if (tc[j - 1]) { err(m.nome + 'só um chanfro/raio interno por canto.'); return; }
          tc[j - 1] = m;
        }
      });
    }
    pieces.forEach(function (pc, j) { aplica(pc.marks, j, false); });
    aplica(finalMarks, pieces.length, true);
    anch.forEach(function (q) { // cantos escolhidos pelo id do trecho (nao dependem da posicao na lista)
      var j = -1; pieces.forEach(function (pc, i) { if (pc.id != null && pc.id === q.alvo) j = i; });
      if (j < 0) { err(q.m.nome + 'o canto escolhido não existe mais (o trecho foi removido ou mudou).'); return; }
      if (q.onde === 'ini') { if (tx[j]) err(q.m.nome + 'só um chanfro/raio externo por canto.'); else tx[j] = q.m; }
      else if (tc[j]) err(q.m.nome + 'só um chanfro/raio interno por canto.'); else tc[j] = q.m;
    });
    pieces.forEach(function (pc, j) {
      var r1 = pc.d1 / 2, rBef = j ? pieces[j - 1].d2 / 2 : 0, h = r1 - rBef;
      if (tx[j]) {
        if (pc.t !== 'cil') err(tx[j].nome + 'chanfro/raio só em cilindro (o trecho seguinte é um cone).');
        else if (h < EPS) err(tx[j].nome + 'não há degrau entre os trechos para formar o canto.');
        else if (tx[j].size > h + EPS && j > 0) err(tx[j].nome + 'o tamanho (' + fmt(tx[j].size) + ') é maior que a altura do degrau (' + fmt(h) + ').');
        else if (tx[j].size > h + EPS) err(tx[j].nome + 'o tamanho (' + fmt(tx[j].size) + ') é maior que o raio do trecho (' + fmt(h) + ').');
      }
      if (tc[j]) {
        var rNext = j + 1 < pieces.length ? pieces[j + 1].d1 / 2 : R0, hh = rNext - pc.d2 / 2;
        if (pc.t !== 'cil') err(tc[j].nome + 'chanfro/raio só em cilindro (o trecho anterior é um cone).');
        else if (hh < EPS) err(tc[j].nome + 'não há degrau depois do trecho para formar o canto.');
        else if (tc[j].size > hh + EPS) err(tc[j].nome + 'o tamanho (' + fmt(tc[j].size) + ') é maior que a altura do degrau (' + fmt(hh) + ').');
        if (j + 1 < pieces.length && tx[j + 1] && tx[j + 1].size + tc[j].size > hh + EPS) err(tc[j].nome + 'os dois cantos do mesmo degrau (' + fmt(tc[j].size) + ' + ' + fmt(tx[j + 1].size) + ') não cabem na altura ' + fmt(hh) + '.');
      }
      var sum = (tx[j] ? tx[j].size : 0) + (tc[j] ? tc[j].size : 0);
      if (sum > pc.L + EPS) err('trecho ' + (pc.k + 1) + ': os cantos (' + fmt(sum) + ') não cabem no comprimento (' + fmt(pc.L) + ').');
    });
    if (erros.length > nErr) { out.ok = false; return out; }

    // movimentos do contorno (codigo + geometria)
    var mv = out.moves, cur = null;
    function push(code, key, g, to, R) { mv.push({ code: code, key: key, g: g, from: cur, to: to, R: R }); cur = [to[0] == null ? (cur ? cur[0] : 0) : to[0], to[1]]; }
    pieces.forEach(function (pc, j) {
      var r1 = pc.d1 / 2, r2 = pc.d2 / 2, x = tx[j], c = tc[j], key = 'ps' + j;
      if (j === 0) {
        if (modo === 'G72') { // G72 tipo I: o primeiro bloco do contorno anda so em Z; depois entra em X na face
          push('N1G0Z0', 'psn1', 'G0', [0, R0]);
          push('G1X' + (x ? xmS(pc.d1s, x.sym) : pc.d1s), 'psz0', 'G1', [0, r1 - (x ? x.size : 0)]);
        } else {
          push('N1G0X' + (x ? xmS(pc.d1s, x.sym) : pc.d1s), 'psn1', 'G0', [null, r1 - (x ? x.size : 0)]);
          push('Z0', 'psz0', 'G0', [0, r1 - (x ? x.size : 0)]);
        }
      } else if (r1 - pieces[j - 1].d2 / 2 > EPS) {
        push('G1X' + (x ? xmS(pc.d1s, x.sym) : pc.d1s), key + 'w', 'G1', [-pc.zN0, r1 - (x ? x.size : 0)]);
      }
      if (x) {
        var zc = addS(pc.zS, x.sym), tz = [-(pc.zN0 + x.size), r1];
        if (x.t === 'chanfro') push('G1X' + pc.d1s + 'Z-' + zc, key + 'c', 'G1', tz);
        else push('G3X' + pc.d1s + 'Z-' + zc + 'R' + x.sym, key + 'c', 'G3', tz, x.size);
      }
      var zEs = c ? subS(pc.zE, c.sym) : pc.zE, zEn = pc.zN1 - (c ? c.size : 0);
      if (pc.t === 'cil') push('G1Z-' + zEs, key + 'l', 'G1', [-zEn, r2]);
      else push('G1X' + pc.d2s + 'Z-' + pc.zE, key + 'l', 'G1', [-zEn, r2]);
      if (c) {
        var tz2 = [-pc.zN1, r2 + c.size];
        if (c.t === 'chanfro') push('G1X' + xpS(pc.d2s, c.sym) + 'Z-' + pc.zE, key + 'k', 'G1', tz2);
        else push('G2X' + xpS(pc.d2s, c.sym) + 'Z-' + pc.zE + 'R' + c.sym, key + 'k', 'G2', tz2, c.size);
      }
    });
    push('N2G0X' + dBrutoSym, 'psn2', 'G0', [null, R0]);
    // F so no primeiro movimento de corte (vale para a execucao normal e para o G70)
    for (var q = 0; q < mv.length; q++) if (mv[q].g !== 'G0') { mv[q].code += 'F#7'; break; }
    // polilinha numerica do contorno
    var pts = [];
    mv.forEach(function (m, i) {
      if (m.key === 'psn1') return;
      var to = [m.to[0] == null ? m.from[0] : m.to[0], m.to[1]];
      if (m.key === 'psz0') { pts.push([0, to[1]]); return; }
      if ((m.g === 'G2' || m.g === 'G3') && m.R) arcPts(m.from, to, m.R, m.g === 'G3', 12).slice(1).forEach(function (p) { pts.push(p); });
      else pts.push(to);
    });
    out.pts = pts; out.pieces = pieces;
    out.zEnd = pieces[pieces.length - 1].zN1; out.somaL = out.zEnd;
    pieces.forEach(function (pc, j) { var rb = j ? pieces[j - 1].d2 / 2 : 0; hMax = Math.max(hMax, pc.d1 / 2 - rb); });
    hMax = Math.max(hMax, R0 - pieces[pieces.length - 1].d2 / 2);
    out.hMax = hMax;
    return out;
  }

  /* ---------- trechos INTERNOS (furo + mandrilamento) ----------
     Furo: broca no eixo (G83, como ALIMENTADOR.ENCAIXE.INTERNO). Mandrilamento: G71/G72 interno + G70 a partir do furo
     (como PORTA.MATRIZ.INTERNO), blocos N3-N4. O diametro nao pode AUMENTAR indo para o fundo (a barra nao faz sub-corte). */
  var PS_MAX_INT = 8, PS_IVAR0 = 300, PS_IZVAR0 = 150;
  var CANTOS_INT = [['boca', 'Entrada do furo (na face)'], ['fundo', 'Fundo (parede × fundo)']];
  var PS_FORMAS_INT = {
    furo: { nome: 'Furo (broca)', rot: ['Ø do furo', 'Profundidade'] },
    icil: { nome: 'Cilindro interno', rot: ['Ø', 'Comprimento'] },
    icone: { nome: 'Cone interno', rot: ['Ø na boca', 'Ø no fundo', 'Comprimento'] },
    ichanfro: { nome: 'Chanfro interno', rot: ['Tamanho C'], canto: true, cantos: CANTOS_INT },
    iraio: { nome: 'Raio interno', rot: ['Raio R'], canto: true, cantos: CANTOS_INT },
    icanal: { nome: 'Canal interno', rot: ['Ø do fundo', 'Posição Z', 'Largura'] },
    irosca: { nome: 'Rosca interna', rot: ['Ø nominal', 'Comprimento', 'Passo'] }
  };

  /* ---------- cantos (onde um chanfro/raio pode ser feito) ----------
     Um canto e identificado pelo id do trecho (cilindro) e por onde: 'ini' = quina na entrada do trecho (face ou degrau, convexa),
     'fim' = pe do degrau no fim do trecho (concavo; no ultimo trecho externo e o degrau ate o bruto, no ultimo interno e o fundo). */
  var _idN = 0;
  function psNovoId() { _idN++; return 'e' + Date.now().toString(36) + _idN.toString(36) + Math.random().toString(36).slice(2, 5); }
  function psPecasLista(lista, int) { // trechos que formam o perfil (cil/cone), em ordem, com z (profundidade, negativa) e raios
    var pcs = [], z = 0;
    psNormRosca(lista || [], int).forEach(function (it) {
      if (it.tipo === (int ? 'icanal' : 'canal') && it.seq) { var cw = psN(it.c) || 0, ult = pcs[pcs.length - 1]; if (ult && ult.cil) { ult.z1 -= cw; z += cw; } else if (ult) ult.sem = true; return; }
      var cil = it.tipo === (int ? 'icil' : 'cil'), cone = it.tipo === (int ? 'icone' : 'cone');
      if (!cil && !cone) return;
      var a = psN(it.a), b = psN(it.b), c = psN(it.c), d1 = a, d2 = cil ? a : b, L = cil ? b : c;
      pcs.push({ id: it.id, cil: cil, r1: d1 / 2, r2: d2 / 2, z0: -z, z1: -(z + (L || 0)) });
      z += L || 0;
    });
    return pcs;
  }
  // externo: R0 = raio do bruto (o ultimo degrau sobe ate ele)
  function psCantos(lista, R0) {
    var pcs = psPecasLista(lista, false), out = [];
    if (!(R0 > 0)) R0 = 1e9;
    pcs.forEach(function (pc, j) {
      if (!pc.cil) return;
      var rBef = j ? pcs[j - 1].r2 : 0, rNext = j + 1 < pcs.length ? pcs[j + 1].r1 : R0, ultimo = j === pcs.length - 1;
      if (pc.r1 - rBef > EPS) out.push({ alvo: pc.id, onde: 'ini', ext: true, z: pc.z0, r: pc.r1, rot: j ? 'Quina do degrau · Ø' + fmt(2 * rBef) + ' → Ø' + fmt(2 * pc.r1) : 'Quina da face · Ø' + fmt(2 * pc.r1) });
      if (rNext - pc.r2 > EPS) out.push({ alvo: pc.id, onde: 'fim', ext: false, z: pc.z1, r: pc.r2, rot: 'Pé do degrau · Ø' + fmt(2 * pc.r2) + ' → ' + (ultimo ? 'bruto Ø' + fmt(2 * R0) : 'Ø' + fmt(2 * rNext)) });
    });
    return out;
  }
  // interno: rF = raio do furo piloto (o fundo do ultimo trecho desce ate ele); sem rF o canto do fundo nao e listado
  function psCantosInt(lista, rF) {
    var pcs = psPecasLista(lista, true), out = [];
    pcs.forEach(function (pc, j) {
      if (!pc.cil) return;
      var ultimo = j === pcs.length - 1, rBef = j ? pcs[j - 1].r2 : null, rNext = ultimo ? (rF > 0 ? rF : null) : pcs[j + 1].r1;
      if (!j) out.push({ alvo: pc.id, onde: 'ini', ext: true, z: pc.z0, r: pc.r1, rot: 'Entrada do furo · Ø' + fmt(2 * pc.r1) });
      else if (rBef - pc.r1 > EPS) out.push({ alvo: pc.id, onde: 'ini', ext: true, z: pc.z0, r: pc.r1, rot: 'Quina do degrau · Ø' + fmt(2 * rBef) + ' → Ø' + fmt(2 * pc.r1) });
      if (rNext != null && pc.r2 - rNext > EPS) out.push({ alvo: pc.id, onde: 'fim', ext: false, z: pc.z1, r: pc.r2, rot: (ultimo ? 'Fundo · Ø' + fmt(2 * pc.r2) + ' → furo Ø' + fmt(2 * rNext) : 'Pé do degrau · Ø' + fmt(2 * pc.r2) + ' → Ø' + fmt(2 * rNext)) });
    });
    return out;
  }
  // listas antigas (chanfro/raio soltos, canto pela posicao) -> ids em todos os itens e canto ancorado (alvo/onde). Altera a lista no lugar.
  function psMigra(lista, int) {
    (lista || []).forEach(function (it) { if (!it.id) it.id = psNovoId(); });
    var cil = int ? 'icil' : 'cil', cone = int ? 'icone' : 'cone', mk = int ? ['ichanfro', 'iraio'] : ['chanfro', 'raio'];
    var antigos = (lista || []).filter(function (it) { return mk.indexOf(it.tipo) >= 0 && it.alvo === undefined; });
    if (!antigos.length) return lista;
    if (int) {
      var pcs = lista.filter(function (it) { return it.tipo === cil || it.tipo === cone; });
      if (!pcs.length) return lista;
      antigos.forEach(function (m) { var fundo = m.canto === 'fundo'; m.alvo = (fundo ? pcs[pcs.length - 1] : pcs[0]).id; m.onde = fundo ? 'fim' : 'ini'; delete m.canto; });
      return lista;
    }
    var pend = [], prev = null;
    lista.forEach(function (it) {
      if (it.tipo === cil || it.tipo === cone) {
        pend.forEach(function (m) { if (m.canto === 'int') { if (prev) { m.alvo = prev.id; m.onde = 'fim'; delete m.canto; } } else { m.alvo = it.id; m.onde = 'ini'; delete m.canto; } });
        pend = []; prev = it;
      } else if (antigos.indexOf(it) >= 0) pend.push(it);
    });
    pend.forEach(function (m) { if (m.canto === 'int' && prev) { m.alvo = prev.id; m.onde = 'fim'; delete m.canto; } });
    return lista;
  }
  var USIN_OPC = [['ambos', 'Externo e interno'], ['ext', 'Só externo'], ['int', 'Só interno']];
  // ferramentas realmente usadas na peca simples (a secao Ferramentas mostra so estas): faceamento sempre; canal, broca e barra conforme as listas e o que usinar de cada lado
  function psUsos(f) {
    var lados = [[f.usin1, f.trechos1, f.internos1]];
    if (f.lados === '2') lados.push([f.usin2, f.trechos2, f.internos2]);
    var u = { canal: false, canalI: false, furo: false, mand: false, rosca: false, roscaI: false };
    lados.forEach(function (l) {
      var ext = l[0] !== 'int', itn = l[0] !== 'ext';
      if (ext && Array.isArray(l[1]) && l[1].some(function (it) { return it.tipo === 'canal'; })) u.canal = true;
      if (ext && Array.isArray(l[1]) && l[1].some(function (it) { return it.tipo === 'rosca'; })) u.rosca = true;
      if (itn && Array.isArray(l[2]) && l[2].some(function (it) { return it.tipo === 'irosca'; })) u.roscaI = true;
      if (itn && Array.isArray(l[2])) {
        if (l[2].some(function (it) { return it.tipo === 'furo'; })) u.furo = true;
        if (psTemMand(l[2])) u.mand = true;
        if (l[2].some(function (it) { return it.tipo === 'icanal'; })) u.canalI = true;
      }
    });
    return u;
  }
  function psTemMand(l) { return Array.isArray(l) && l.some(function (it) { return it.tipo === 'icil' || it.tipo === 'icone' || it.tipo === 'irosca'; }); }

  /* ---------- bruto que ja vem com furo(s) (tubo, barra furada, peca pre-furada) ----------
     Lista de diametros internos da face onde o furo comeca para dentro. Vale como furo piloto do mandrilamento
     (dispensa a broca) e entra no bruto e na peca acabada do simulador. */
  var PS_MAX_BINT = 4, PS_BVAR0 = 360;
  var PS_FORMAS_BINT = { bcil: { nome: 'Diâmetro interno do bruto', rot: ['Ø', 'Comprimento'] } };

  // corta uma polilinha (z, r) em z <= zm
  function clipLinhaZ(pts, zm) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], ina = a[0] <= zm + EPS;
      if (ina) out.push(a);
      if (i < pts.length - 1) {
        var b = pts[i + 1], inb = b[0] <= zm + EPS;
        if (ina !== inb) out.push([zm, a[1] + (b[1] - a[1]) * (zm - a[0]) / (b[0] - a[0])]);
      }
    }
    return out;
  }
  // geometria do furo do bruto num programa: b = {pieces:[{d, L, vd, vL}], desdeAqui, zOpp}; zNear = face do bloco neste programa; lFrame = comprimento do bloco abaixo de Z0
  function psBrutoGeom(b, zNear, lFrame) {
    var segs = [], z = b.desdeAqui ? zNear : b.zOpp;
    b.pieces.forEach(function (pc, k) {
      var zTop, zBot;
      if (b.desdeAqui) { zTop = z; zBot = z - pc.L; z = zBot; } else { zBot = z; zTop = z + pc.L; z = zTop; }
      var t = Math.min(zTop, zNear), bt = Math.max(zBot, -lFrame);
      if (t - bt > EPS) segs.push({ k: k, r: pc.d / 2, zTop: t, zBot: bt, vd: pc.vd, vL: pc.vL });
    });
    if (!segs.length) return null;
    segs.sort(function (p, q) { return q.zTop - p.zTop; });
    var IN = [[segs[0].zTop, 0]];
    segs.forEach(function (s) { IN.push([s.zTop, s.r], [s.zBot, s.r]); });
    IN.push([segs[segs.length - 1].zBot, 0]);
    var fin = clipLinhaZ(IN, 0), polyFin = (IN[0][0] > EPS ? [[0, 0]] : []).concat(fin);
    // furo uniforme de ponta a ponta do bloco -> o G1901 (coluna com orificio) descreve o bruto
    var uniforme = segs.length === 1 && segs[0].zTop >= zNear - EPS && segs[0].zBot <= -lFrame + EPS;
    return { segs: segs, IN: IN, INfin: fin, polyFull: IN.slice(), polyFin: polyFin, uniforme: uniforme };
  }
  // furo existente que serve de piloto na face z = 0: continuo da face ate a profundidade zEnd; devolve {d (menor Ø no trecho), p (profundidade alcancada), vd}
  function psPilotoBruto(segs, zEnd) {
    var cur = 0, rmin = 1e9, vd = null, g = 0, s;
    while (g++ < 20) {
      s = segs.filter(function (x) { return x.zTop >= cur - EPS && x.zBot < cur - EPS; })[0];
      if (!s) break;
      if (-cur < zEnd - EPS && s.r < rmin) { rmin = s.r; vd = s.vd; }
      cur = s.zBot;
    }
    if (!(rmin < 1e9) || -cur < zEnd - EPS) return null;
    return { d: 2 * rmin, p: -cur, vd: vd };
  }

  // primeira cota z (<= 0) em que o raio do contorno interno (polilinha z decrescente) cai abaixo de rl
  function psAcertoInt(cp, rl) {
    for (var i = 0; i < cp.length - 1; i++) {
      var a = cp[i], b = cp[i + 1];
      if (a[1] < rl - 1e-9) return a[0];
      if (b[1] < rl - 1e-9) return a[0] + (b[0] - a[0]) * (a[1] - rl) / (a[1] - b[1]);
    }
    return cp[cp.length - 1][0];
  }

  // canal interno sequencial (item icanal com seq:true: so Ø do fundo e largura): entra logo depois do ultimo cilindro interno e ocupa a largura dele
  // (o cilindro anterior passa a incluir a largura do canal); o proximo elemento comeca depois do canal.
  function psSeqInt(lista, err) {
    if (!Array.isArray(lista) || !lista.some(function (it) { return it && it.tipo === 'icanal' && it.seq; })) return lista;
    var out = [], z = 0, prev = null;
    lista.forEach(function (it, k) {
      if (it.tipo === 'icil') { var c = Object.assign({}, it); out.push(c); z += psN(it.b) || 0; prev = c; }
      else if (it.tipo === 'icone') { out.push(it); z += psN(it.c) || 0; prev = null; }
      else if (it.tipo === 'icanal' && it.seq) {
        var w = psN(it.c), P0 = 'interno ' + (k + 1) + ' (Canal interno): ';
        if (!prev) { err(P0 + 'o canal entra logo depois de um cilindro interno (ele ocupa o fim do cilindro anterior): coloque um cilindro interno antes dele.'); out.push(it); return; }
        if (!(w > 0)) { out.push(it); return; }
        out.push(Object.assign({}, it, { b: z, seq: false }));
        prev.b = (psN(prev.b) || 0) + w; z += w;
      } else out.push(it);
    });
    return out;
  }

  // lista de trechos internos -> {ok, furo, pieces, defs, calcs, moves, pts, zEnd, piso}
  // modo: 'G71' (longitudinal) ou 'G72' (transversal). Blocos do contorno: N3 .. N4.
  function psContornoInt(lista, o, erros, rot, modo, stock) {
    var out = { ok: true, defs: [], calcs: [], moves: [], pts: [], pieces: [], canais: [], furo: null, zEnd: 0, piso: false };
    var nErr = erros.length;
    function err(m) { erros.push(rot + m); }
    lista = psSeqInt(lista, err);
    if (erros.length > nErr) { out.ok = false; return out; }
    if (lista.length > PS_MAX_INT) { err('no máximo ' + PS_MAX_INT + ' trechos internos por lado.'); out.ok = false; return out; }
    var SEC = 'TRECHOS INTERNOS - DA FACE AO FUNDO', pieces = [], marks = { boca: null, fundo: null }, anch = [], furo = null, zPrev = '0', zNum = 0;
    lista.forEach(function (it, k) {
      var t = it.tipo, F = PS_FORMAS_INT[t], nm = 'INTERNO ' + (k + 1) + ' ', P0 = 'interno ' + (k + 1) + ' (' + (it._rosca ? PS_FORMAS_INT.irosca.nome : F ? F.nome : t) + '): ';
      var a = psN(it.a), b = psN(it.b), c = psN(it.c), nA = PS_IVAR0 + 4 * k, vA = '#' + nA, vB = '#' + (nA + 1), vC = '#' + (nA + 2);
      if (!F) { err(P0 + 'forma desconhecida.'); return; }
      if (t === 'furo') {
        if (!(a > 0) || !(b > 0)) { err(P0 + 'informe Ø e profundidade maiores que zero.'); return; }
        if (furo) { err(P0 + 'só um furo por lado (o furo piloto de onde o mandrilamento parte).'); return; }
        furo = { k: k, d: a, p: b, vd: vA, vp: vB, nome: P0 };
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + 'FURO DIAMETRO', efeito: 'Diametro do furo feito pela broca. Tambem e o ponto de partida do mandrilamento (G71/G72 interno).' },
          { sec: SEC, n: nA + 1, val: b, c: nm + 'FURO PROFUNDIDADE', efeito: 'Profundidade do furo a partir da face (G83 desce ate aqui).' });
      } else if (t === 'icil') {
        if (!(a > 0) || !(b > 0)) { err(P0 + 'informe Ø e comprimento maiores que zero.'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + 'CILINDRO INTERNO DIAMETRO', efeito: 'Diametro final do trecho mandrilado.' },
          { sec: SEC, n: nA + 1, val: b, c: nm + 'CILINDRO INTERNO COMPRIMENTO', efeito: 'Comprimento do trecho em Z. Entra na soma que posiciona os trechos seguintes.' });
        var rosI = null;
        if (it._rosca) { // rosca interna: o furo mandrilado fica no Ø menor da porca (D1); o G76 sobe ate o Ø nominal
          var rpI = it._rosca, rpar = psRoscaPar(rpI.d, rpI.p, true);
          if (!(rpI.d > 0) || !(rpI.p > 0) || !(rpI.l > 0)) { err(P0 + 'informe Ø nominal, comprimento e passo maiores que zero.'); return; }
          if (!(a > 0) || rpar.he < 0.05) { err(P0 + 'o passo (' + fmt(rpI.p) + ') não cabe no Ø ' + fmt(rpI.d) + '.'); return; }
          rosI = Object.assign({ d: rpI.d, d1: a, l: rpI.l, p: rpI.p, vd: '#' + (460 + k), vd1: vA, vl: '#' + (nA + 3), vp: vC, nome: P0 }, psRoscaVars(k, rpar, out, nm, SEC, vC, nA + 3, rpI.l, true, '#' + (460 + k), vA));
          out.defs.forEach(function (d) { if (d.n === nA) { d.c = nm + 'ROSCA FURO (DIAMETRO MENOR D1)'; d.efeito = 'Furo mandrilado para a rosca interna: Ø nominal - 1,0825 x passo (apostila Calculo de Roscas).'; } });
        }
        zNum += b; var zv = '#' + (PS_IZVAR0 + k);
        out.calcs.push({ sec: 'CALCULOS', n: PS_IZVAR0 + k, expr: zPrev === '0' ? vB : zPrev + '+' + vB, c: nm + 'Z FINAL', efeito: 'Profundidade (a partir de Z0) onde o trecho interno termina.' });
        pieces.push({ k: k, id: it.id, t: t, d1: a, d2: a, d1s: vA, d2s: vA, L: b, zS: zPrev, zN0: zNum - b, zE: zv, zN1: zNum, rosca: rosI });
        zPrev = zv;
      } else if (t === 'icone') {
        if (!(a > 0) || !(b > 0) || !(c > 0)) { err(P0 + 'informe Ø na boca, Ø no fundo e comprimento maiores que zero.'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + 'CONE INTERNO DIAMETRO NA BOCA', efeito: 'Diametro no inicio do cone (lado da face).' },
          { sec: SEC, n: nA + 1, val: b, c: nm + 'CONE INTERNO DIAMETRO NO FUNDO', efeito: 'Diametro no fim do cone (mais fundo).' },
          { sec: SEC, n: nA + 2, val: c, c: nm + 'CONE INTERNO COMPRIMENTO', efeito: 'Comprimento do cone em Z.' });
        zNum += c; var zv2 = '#' + (PS_IZVAR0 + k);
        out.calcs.push({ sec: 'CALCULOS', n: PS_IZVAR0 + k, expr: zPrev === '0' ? vC : zPrev + '+' + vC, c: nm + 'Z FINAL', efeito: 'Profundidade (a partir de Z0) onde o cone interno termina.' });
        pieces.push({ k: k, id: it.id, t: t, d1: a, d2: b, d1s: vA, d2s: vB, L: c, zS: zPrev, zN0: zNum - c, zE: zv2, zN1: zNum });
        zPrev = zv2;
      } else if (t === 'icanal') {
        if (!(a > 0) || !(b >= 0) || !(c > 0)) { err(P0 + 'informe Ø do fundo, posição Z e largura (maiores que zero).'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + 'CANAL INTERNO DIAMETRO DO FUNDO', efeito: 'Diametro no fundo do canal interno (o G75 interno sobe ate aqui).' },
          { sec: SEC, n: nA + 1, val: b, c: nm + 'CANAL INTERNO POSICAO Z', efeito: 'Distancia da face (Z0) ate a parede do canal mais proxima da face.' },
          { sec: SEC, n: nA + 2, val: c, c: nm + 'CANAL INTERNO LARGURA', efeito: 'Largura do canal em Z (precisa ser maior ou igual a largura da ferramenta).' });
        out.canais.push({ k: k, d: a, z: b, w: c, vd: vA, vz: vB, vw: vC, nome: P0 });
      } else { // ichanfro / iraio
        if (!(a > 0)) { err(P0 + 'informe o tamanho maior que zero.'); return; }
        if (it.alvo !== undefined) { // canto escolhido pelo id do trecho interno (ini = quina na entrada do trecho, fim = pe do degrau/fundo no fim do trecho)
          if (!it.alvo) { err(P0 + 'escolha o canto onde o ' + (t === 'ichanfro' ? 'chanfro' : 'raio') + ' vai.'); return; }
          out.defs.push({ sec: SEC, n: nA, val: a, c: nm + (t === 'ichanfro' ? 'CHANFRO INTERNO TAMANHO' : 'RAIO INTERNO'), efeito: t === 'ichanfro' ? 'Chanfro a 45 graus no canto escolhido.' : 'Raio (G2/G3) do canto escolhido.' });
          anch.push({ m: { t: t === 'ichanfro' ? 'chanfro' : 'raio', size: a, sym: vA, nome: P0 }, alvo: it.alvo, onde: it.onde === 'fim' ? 'fim' : 'ini' });
          return;
        }
        var pos = it.canto === 'fundo' ? 'fundo' : 'boca';
        if (marks[pos]) { err(P0 + 'só um chanfro/raio na ' + (pos === 'boca' ? 'entrada' : 'parte do fundo') + '.'); return; }
        out.defs.push({ sec: SEC, n: nA, val: a, c: nm + (t === 'ichanfro' ? 'CHANFRO INTERNO TAMANHO' : 'RAIO INTERNO'), efeito: t === 'ichanfro' ? 'Chanfro a 45 graus no canto escolhido.' : 'Raio (G2/G3) do canto escolhido.' });
        marks[pos] = { t: t === 'ichanfro' ? 'chanfro' : 'raio', size: a, sym: vA, pos: pos, nome: P0 };
      }
    });
    if (erros.length > nErr) { out.ok = false; return out; }
    if (!furo) {
      // sem broca: o furo que o bruto ja traz serve de piloto (se for continuo da face ate a profundidade do mandrilamento)
      var pil = (stock && pieces.length) ? psPilotoBruto(stock, zNum) : null;
      if (!pil) {
        err(pieces.length ? 'adicione o "Furo (broca)" ou informe, em "Bruto com furo existente", um furo que vá da face até a profundidade do mandrilamento (' + fmt(zNum) + ' mm): o mandrilamento parte de um furo piloto.' : 'adicione o "Furo (broca)": o mandrilamento e os cantos partem do furo piloto.');
        out.ok = false; return out;
      }
      furo = { k: -1, d: pil.d, p: pil.p, vd: pil.vd, vp: null, nome: 'furo existente do bruto: ', existente: true };
    }
    out.furo = furo;
    var rF = furo.d / 2;
    if (furo.d >= 2 * o.R0 - EPS) err(furo.nome + 'o Ø do furo (' + fmt(furo.d) + ') não cabe no bloco (Ø' + fmt(2 * o.R0) + ').');
    if (furo.p > o.lPeca + EPS) err(furo.nome + 'a profundidade do furo (' + fmt(furo.p) + ') passa do comprimento da peça (' + fmt(o.lPeca) + ').');
    if (erros.length > nErr) { out.ok = false; return out; }
    if (!pieces.length) {
      if (marks.boca || marks.fundo || anch.length) err('chanfro/raio interno precisa de um cilindro interno (mandrilamento) para valer.');
      if (out.canais.length) err('o canal interno precisa de um cilindro interno (mandrilamento) onde ficar.');
      out.ok = erros.length === nErr; out.pieces = pieces; return out;
    }
    var zEnd = zNum; out.zEnd = zEnd; out.pieces = pieces;
    var rPrev = 1e9;
    pieces.forEach(function (pc) {
      var P0 = 'interno ' + (pc.k + 1) + ' (' + PS_FORMAS_INT[pc.t].nome + '): ';
      if (pc.d1 < furo.d - EPS || pc.d2 < furo.d - EPS) err(P0 + 'diâmetro menor que o furo (Ø' + fmt(furo.d) + '): ' + (furo.existente ? 'o furo que o bruto já traz' : 'a broca') + ' já abriu esse diâmetro.');
      if (pc.d1 / 2 > rPrev + EPS) err(P0 + 'o diâmetro aumenta (Ø' + fmt(2 * rPrev) + ' → Ø' + fmt(pc.d1) + ') indo para o fundo. A barra não faz sub-corte: troque a ordem ou faça esse trecho por outro lado.');
      if (pc.d2 > pc.d1 + EPS) err(P0 + 'cone que aumenta (Ø' + fmt(pc.d1) + ' → Ø' + fmt(pc.d2) + ') indo para o fundo. A barra não faz sub-corte.');
      rPrev = Math.min(rPrev, pc.d2 / 2);
    });
    if (furo.p < zEnd - EPS) err(furo.nome + 'a profundidade do furo (' + fmt(furo.p) + ') é menor que a do mandrilamento (' + fmt(zEnd) + '): a barra não tem furo para entrar.');
    var last = pieces[pieces.length - 1], first = pieces[0], bo = marks.boca, fu = marks.fundo;
    out.piso = last.d2 / 2 > rF + EPS;
    // marcas por trecho: mi[j] = quina na entrada do trecho j (convexa), mf[j] = canto no fim do trecho j (pe do degrau; no ultimo, o fundo)
    var mi = pieces.map(function () { return null; }), mf = pieces.map(function () { return null; });
    if (bo) mi[0] = bo;
    if (fu) mf[pieces.length - 1] = fu;
    anch.forEach(function (q) {
      var j = -1; pieces.forEach(function (pc, i) { if (pc.id != null && pc.id === q.alvo) j = i; });
      if (j < 0) { err(q.m.nome + 'o canto escolhido não existe mais (o trecho foi removido ou mudou).'); return; }
      var lista2 = q.onde === 'ini' ? mi : mf;
      if (lista2[j]) err(q.m.nome + 'só um chanfro/raio por canto.'); else lista2[j] = q.m;
    });
    pieces.forEach(function (pc, j) {
      var b0 = mi[j], b1 = mf[j], ultimo = j === pieces.length - 1, r1 = pc.d1 / 2, r2 = pc.d2 / 2;
      if (b0) {
        if (pc.t !== 'icil') err(b0.nome + (j === 0 ? 'chanfro/raio na entrada só em cilindro (o primeiro trecho é um cone).' : 'chanfro/raio só em cilindro (este trecho é um cone).'));
        else if (j === 0) { if (b0.size > pc.L + EPS) err(b0.nome + 'o tamanho (' + fmt(b0.size) + ') não cabe no comprimento do primeiro trecho (' + fmt(pc.L) + ').'); }
        else {
          var h0 = pieces[j - 1].d2 / 2 - r1;
          if (h0 < EPS) err(b0.nome + 'não há degrau antes deste trecho para formar o canto.');
          else if (b0.size > h0 + EPS) err(b0.nome + 'o tamanho (' + fmt(b0.size) + ') é maior que a largura do degrau (' + fmt(h0) + ').');
          else if (b0.size > pc.L + EPS) err(b0.nome + 'o tamanho (' + fmt(b0.size) + ') não cabe no comprimento do trecho (' + fmt(pc.L) + ').');
        }
      }
      if (b1) {
        var h1 = r2 - (ultimo ? rF : pieces[j + 1].d1 / 2);
        if (pc.t !== 'icil') err(b1.nome + (ultimo ? 'chanfro/raio no fundo só em cilindro (o último trecho é um cone).' : 'chanfro/raio só em cilindro (este trecho é um cone).'));
        else if (ultimo && !out.piso) err(b1.nome + 'não há fundo (o último Ø é igual ao furo): o canto não existe.');
        else if (!ultimo && h1 < EPS) err(b1.nome + 'não há degrau depois deste trecho para formar o canto.');
        else if (b1.size > h1 + EPS) err(b1.nome + 'o tamanho (' + fmt(b1.size) + ') é maior que a largura do ' + (ultimo ? 'fundo' : 'degrau') + ' (' + fmt(h1) + ').');
        else if (b1.size + (b0 ? b0.size : 0) > pc.L + EPS) err(b1.nome + 'o tamanho (' + fmt(b1.size) + ') não cabe no comprimento do trecho (' + fmt(pc.L) + ').');
        if (!ultimo && mi[j + 1] && b1.size + mi[j + 1].size > h1 + EPS) err(b1.nome + 'os dois cantos do mesmo degrau (' + fmt(b1.size) + ' + ' + fmt(mi[j + 1].size) + ') não cabem na largura ' + fmt(h1) + '.');
      }
    });
    // canais internos: cada um dentro de um cilindro interno (nao atravessa cone nem degrau), mais fundo que a parede e sem tocar os cantos do trecho
    out.canais.sort(function (p, q) { return p.z - q.z; });
    out.canais.forEach(function (cn, i) {
      var pj = -1; pieces.forEach(function (pc, j) { if (pc.t === 'icil' && pc.zN0 <= cn.z + EPS && pc.zN1 >= cn.z + cn.w - EPS) pj = j; });
      if (pj < 0) { err(cn.nome + 'o canal precisa ficar inteiro dentro de um cilindro interno (não atravessa cone nem degrau).'); return; }
      var pc = pieces[pj];
      cn.rs = pc.d1s; cn.r = pc.d1 / 2; cn.j = pj;
      if (cn.d / 2 < cn.r + 0.2) err(cn.nome + 'o Ø do fundo (' + fmt(cn.d) + ') precisa ser maior que o Ø do cilindro onde o canal fica (' + fmt(pc.d1) + ').');
      if (cn.d / 2 > o.R0 - 0.3) err(cn.nome + 'o Ø do fundo (' + fmt(cn.d) + ') não cabe no bloco (Ø' + fmt(2 * o.R0) + ').');
      if (i && cn.z < out.canais[i - 1].z + out.canais[i - 1].w - EPS) err(cn.nome + 'o canal sobrepõe o canal interno anterior.');
      if (cn.z + cn.w > o.lPeca + EPS) err(cn.nome + 'o canal passa do comprimento da peça.');
      if (mi[pj] && cn.z < pc.zN0 + mi[pj].size - EPS) err(cn.nome + 'o canal invade o ' + (mi[pj].t === 'chanfro' ? 'chanfro' : 'raio') + ' da entrada deste trecho.');
      if (mf[pj] && cn.z + cn.w > pc.zN1 - mf[pj].size + EPS) err(cn.nome + 'o canal invade o ' + (mf[pj].t === 'chanfro' ? 'chanfro' : 'raio') + ' do fim deste trecho.');
    });
    if (erros.length > nErr) { out.ok = false; return out; }

    // movimentos (codigo + geometria); N3 .. N4
    var mv = out.moves, cur = null;
    function push(code, key, g, to, R) { mv.push({ code: code, key: key, g: g, from: cur, to: to, R: R }); cur = [to[0] == null ? (cur ? cur[0] : 0) : to[0], to[1]]; }
    pieces.forEach(function (pc, j) {
      var r1 = pc.d1 / 2, r2 = pc.d2 / 2, key = 'pi' + j, cb = mi[j], cf = mf[j];
      if (j === 0) {
        var rm = r1 + (cb ? cb.size : 0), xm = cb ? xpS(pc.d1s, cb.sym) : pc.d1s;
        if (modo === 'G72') {
          push('N3G0Z0', 'pin3', 'G0', [0, rF]);
          push('G1X' + xm, 'piz0', 'G1', [0, rm]);
        } else {
          push('N3G0X' + xm, 'pin3', 'G0', [null, rm]);
          push('Z0', 'piz0', 'G0', [0, rm]);
        }
        if (cb) {
          var tz = [-cb.size, r1];
          if (cb.t === 'chanfro') push('G1X' + pc.d1s + 'Z-' + cb.sym, key + 'c', 'G1', tz);
          else push('G2X' + pc.d1s + 'Z-' + cb.sym + 'R' + cb.sym, key + 'c', 'G2', tz, cb.size);
        }
      } else if (cb) { // quina na entrada do degrau (lado de dentro): rampa ate r1 + tamanho e chanfro/raio ate o diametro do trecho
        if (pieces[j - 1].d2 / 2 - r1 > EPS) push('G1X' + xpS(pc.d1s, cb.sym), key + 'w', 'G1', [-pc.zN0, r1 + cb.size]);
        var tzq = [-(pc.zN0 + cb.size), r1], zq = addS(pc.zS, cb.sym);
        if (cb.t === 'chanfro') push('G1X' + pc.d1s + 'Z-' + zq, key + 'c', 'G1', tzq);
        else push('G2X' + pc.d1s + 'Z-' + zq + 'R' + cb.sym, key + 'c', 'G2', tzq, cb.size);
      } else if (pieces[j - 1].d2 / 2 - r1 > EPS) {
        push('G1X' + pc.d1s, key + 'w', 'G1', [-pc.zN0, r1]);
      }
      var zEs = cf ? subS(pc.zE, cf.sym) : pc.zE, zEn = pc.zN1 - (cf ? cf.size : 0);
      if (pc.t === 'icil') push('G1Z-' + zEs, key + 'l', 'G1', [-zEn, r2]);
      else push('G1X' + pc.d2s + 'Z-' + pc.zE, key + 'l', 'G1', [-zEn, r2]);
      if (cf) {
        var tz2 = [-pc.zN1, r2 - cf.size];
        if (cf.t === 'chanfro') push('G1X' + xmS(pc.d2s, cf.sym) + 'Z-' + pc.zE, key + 'k', 'G1', tz2);
        else push('G3X' + xmS(pc.d2s, cf.sym) + 'Z-' + pc.zE + 'R' + cf.sym, key + 'k', 'G3', tz2, cf.size);
      }
    });
    push('N4' + (out.piso ? 'G1' : 'G0') + 'X' + furo.vd, 'pin4', out.piso ? 'G1' : 'G0', [null, rF]);
    // F so no primeiro movimento de corte
    for (var q = 0; q < mv.length; q++) if (mv[q].g !== 'G0') { mv[q].code += 'F#73'; break; }
    var pts = [];
    mv.forEach(function (m) {
      if (m.key === 'pin3') return;
      var to = [m.to[0] == null ? m.from[0] : m.to[0], m.to[1]];
      if (m.key === 'piz0') { pts.push([0, to[1]]); return; }
      if ((m.g === 'G2' || m.g === 'G3') && m.R) arcPts(m.from, to, m.R, m.g === 'G3', 12).slice(1).forEach(function (p) { pts.push(p); });
      else pts.push(to);
    });
    out.pts = pts;
    // perfil acabado com os canais (a barra de mandrilar nao faz o canal: ele e feito depois, pela ferramenta de canal interno)
    var pf = pts.slice();
    out.canais.forEach(function (cn) {
      var rN = cn.r, a = [-cn.z, rN], d = [-(cn.z + cn.w), rN];
      pf = pf.filter(function (p) { return p[0] > -cn.z + EPS; }).concat([a, [-cn.z, cn.d / 2], [-(cn.z + cn.w), cn.d / 2], d], pf.filter(function (p) { return p[0] < -(cn.z + cn.w) + EPS; }));
    });
    out.ptsFin = pf;
    return out;
  }

  // cavidade da peca acabada (furo + mandrilamento): IN = polilinha da boca ao eixo (ou ao fundo, se passante), poly = poligono fechado
  function psCavidade(ci, lPeca) {
    var f = ci.furo, rF = f.d / 2, IN = [], through = f.p >= lPeca - EPS, pEnd = Math.min(f.p, lPeca), cpts = ci.ptsFin || ci.pts;
    if (cpts.length) cpts.forEach(function (p) { IN.push([p[0], p[1]]); }); else IN.push([0, rF]);
    if (pEnd - (-IN[IN.length - 1][0]) > EPS) IN.push([-pEnd, rF]);
    if (!through) IN.push([-pEnd, 0]);
    var poly = [[0, 0]].concat(IN);
    if (through) poly.push([-lPeca, 0]);
    return { IN: IN, poly: poly, through: through };
  }

  // G71 tipo I INTERNO: niveis em r de (rF + U) ate o maior raio do contorno (- sobremetal); cada passe corta em Z ate o contorno.
  // Passa final no contorno com sobremetal (du no Ø, dw em Z) e volta ao ponto de partida (no Ø do furo).
  function cyc71i(pb, cp, o) {
    var rMax = -1, line = o.line, T = o.tool;
    cp.forEach(function (p) { rMax = Math.max(rMax, p[1]); });
    var lim = rMax - o.du / 2, levels = [], r = o.rF + o.U;
    while (r < lim - 1e-9) { levels.push(r); r += o.U; }
    if (lim > o.rF + 1e-6) levels.push(lim);
    levels.forEach(function (rl) {
      var stop = Math.min(0, psAcertoInt(cp, rl + o.du / 2) + o.dw);
      if (stop > -1e-6) return;
      pb.rapid(2 * rl, o.zA, line, 'MANDRILAR G71', T);
      pb.feed(2 * rl, stop, o.f, line, 'MANDRILAR G71', T);
      pb.rapid(2 * (rl - o.Rr), stop + o.Rr, line, 'MANDRILAR G71', T);
      pb.rapid(2 * (rl - o.Rr), o.zA, line, 'MANDRILAR G71', T);
    });
    pb.rapid(2 * (cp[0][1] - o.du / 2), o.zA, line, 'MANDRILAR G71', T);
    cp.forEach(function (p) {
      pb.feed(2 * (p[1] - o.du / 2), Math.min(0, p[0] + o.dw), o.f, line, 'MANDRILAR G71', T);
    });
    pb.rapid(o.xA, o.zA, line, 'MANDRILAR G71', T);
  }

  // G72 tipo I (desbaste TRANSVERSAL, externo ou interno): niveis em Z a cada W; cada passe corta em X ate o contorno.
  // Contorno deslocado do sobremetal (du/2 no raio, dw em Z). Externo: corta de R0 ate o raio; interno: do furo para fora.
  function cyc72(pb, cp, o) {
    var line = o.line, T = o.tool, sg = o.interno ? -1 : 1, zFim = cp[cp.length - 1][0] + o.dw, lv = [], z = -o.W;
    while (z > zFim + 1e-9) { lv.push(z); z -= o.W; }
    if (zFim < -1e-6) lv.push(zFim);
    lv.forEach(function (zk) {
      var rc = psRaioEm(cp, -zk + o.dw) + sg * o.du / 2;
      pb.rapid(o.xA, zk, line, 'DESBASTE G72', T);
      pb.feed(2 * rc, zk, o.f, line, 'DESBASTE G72', T);
      pb.rapid(2 * rc, zk + o.Rr, line, 'DESBASTE G72', T);
      pb.rapid(o.xA, zk + o.Rr, line, 'DESBASTE G72', T);
    });
    pb.rapid(o.xA, o.zA, line, 'DESBASTE G72', T);
    pb.rapid(2 * (cp[0][1] + sg * o.du / 2), o.zA, line, 'DESBASTE G72', T);
    cp.forEach(function (p) {
      pb.feed(2 * (p[1] + sg * o.du / 2), Math.min(0, p[0] + o.dw), o.f, line, 'DESBASTE G72', T);
    });
    pb.rapid(o.xA, o.zA, line, 'DESBASTE G72', T);
  }

  // G83 (furacao com bicada): a partir do plano R (zR) desce q por bicada, recua ao plano R e volta (rapido) ate 1 mm acima do fundo anterior
  function cycG83(pb, zR, zEnd, q, f, line, T) {
    var z = zR, prev = zR;
    while (z > zEnd + 1e-9) {
      z = Math.max(zEnd, z - q);
      if (prev < zR) pb.rapid(0, prev + 1, line, 'FURAR', T);
      pb.feed(0, z, f, line, 'FURAR', T);
      pb.rapid(0, zR, line, 'FURAR', T);
      prev = z;
    }
  }

  // Ciclo G71 tipo I (desbaste): niveis em X de (R0 - U) ate o inicio do contorno (+ sobremetal); cada passe corta em Z ate o contorno.
  // Depois uma passada no contorno com sobremetal (du no Ø, dw em Z) e volta ao ponto de partida.
  function cyc71(pb, cp, o) {
    var rFloor = cp[0][1] + o.du / 2, levels = [], r = o.R0 - o.U, T = o.tool, line = o.line;
    while (r > rFloor + 1e-9) { levels.push(r); r -= o.U; }
    if (o.R0 > rFloor + 1e-6) levels.push(rFloor);
    levels.forEach(function (rl) {
      var stop = Math.min(0, psAcerto(cp, rl - o.du / 2) + o.dw);
      pb.rapid(2 * rl, o.zA, line, 'DESBASTE G71', T);
      pb.feed(2 * rl, stop, o.f, line, 'DESBASTE G71', T);
      pb.rapid(2 * rl + 2 * o.Rr, stop + o.Rr, line, 'DESBASTE G71', T);
      pb.rapid(2 * rl + 2 * o.Rr, o.zA, line, 'DESBASTE G71', T);
    });
    pb.rapid(2 * rFloor, o.zA, line, 'DESBASTE G71', T);
    cp.forEach(function (p) {
      pb.feed(2 * (p[1] + o.du / 2), Math.min(0, p[0] + o.dw), o.f, line, 'DESBASTE G71', T);
    });
    pb.rapid(o.xA, o.zA, line, 'DESBASTE G71', T);
  }

  // G75 em canal externo: ferramenta posicionada em (xs, zs) = canto da ponta do lado da face; desce em P ate xf; Q em Z ate ze.
  function cycCanal(pb, xs, zs, ze, xf, p, q, R, f, line, T) {
    var zi = [zs];
    while (zi[zi.length - 1] > ze + 1e-9) zi.push(Math.max(ze, zi[zi.length - 1] - q));
    zi.forEach(function (z, i) {
      if (i > 0) pb.rapid(xs, z, line, 'CANAL', T);
      var x = xs;
      while (x - 2 * p > xf + 1e-9) {
        x -= 2 * p;
        pb.feed(x, z, f, line, 'CANAL', T);
        pb.rapid(x + 2 * R, z, line, 'CANAL', T);
        pb.rapid(x, z, line, 'CANAL', T);
      }
      pb.feed(xf, z, f, line, 'CANAL', T);
      pb.rapid(xs, z, line, 'CANAL', T);
    });
    pb.rapid(xs, zs, line, 'CANAL', T);
  }

  // G75 em canal interno: ferramenta posicionada em (xs, zs) = canto da ponta do lado da face, dentro do furo; sobe em P ate xf (Ø maior); Q em Z ate ze.
  function cycCanalI(pb, xs, zs, ze, xf, p, q, R, f, line, T) {
    var zi = [zs];
    while (zi[zi.length - 1] > ze + 1e-9) zi.push(Math.max(ze, zi[zi.length - 1] - q));
    zi.forEach(function (z, i) {
      if (i > 0) pb.rapid(xs, z, line, 'CANAL INTERNO', T);
      var x = xs;
      while (x + 2 * p < xf - 1e-9) {
        x += 2 * p;
        pb.feed(x, z, f, line, 'CANAL INTERNO', T);
        pb.rapid(x - 2 * R, z, line, 'CANAL INTERNO', T);
        pb.rapid(x, z, line, 'CANAL INTERNO', T);
      }
      pb.feed(xf, z, f, line, 'CANAL INTERNO', T);
      pb.rapid(xs, z, line, 'CANAL INTERNO', T);
    });
    pb.rapid(xs, zs, line, 'CANAL INTERNO', T);
  }

  // G76 (rosca): passadas a Q*raiz(i) ate a altura do filete + passadas de acabamento; cada uma avanca em Z (passo = avanco) e recua em X.
  // O simulador acompanha o percurso e o tempo, mas nao remove material (o filete helicoidal nao existe na meia secao 2D).
  function cycRosca(pb, o) {
    var deps = [], i = 1, d;
    do { d = Math.min(o.he, o.q * Math.sqrt(i)); deps.push(d); i++; } while (d < o.he - 1e-9 && i < 60);
    for (var m = 0; m < (o.m || 1); m++) deps.push(o.he);
    deps.forEach(function (dp) {
      var x = o.ext ? o.xBase - 2 * dp : o.xBase + 2 * dp;
      pb.rapid(x, o.zA, o.line, 'ROSCA G76', o.T);
      pb.thread(x, o.zE, o.p, o.line, 'ROSCA G76', o.T);
      pb.rapid(o.xA, o.zE, o.line, 'ROSCA G76', o.T);
      pb.rapid(o.xA, o.zA, o.line, 'ROSCA G76', o.T);
    });
  }

  // faceamento em G75 (mesmo bloco do faceTurn, sem a cilindragem)
  function psFace(P, pb, v, n) {
    var T = 'a';
    P('G0Z' + v.sobre + '(SOBREMETAL EM Z)', 'g0z11'); pb.rapid(n.xH, n.sobreZ, 'g0z11', 'APROXIMACAO', T);
    P('G0X' + v.dBruto + '(DIAMETRO BRUTO)', 'g0x2a'); pb.rapid(n.dBruto, n.sobreZ, 'g0x2a', 'APROXIMACAO', T);
    P('IF[' + v.sobre + 'LE' + v.incFace + ']GOTO10', 'if1');
    P('G0Z' + v.zIni, 'g0zini');
    P('G75X-1Z0P999999Q' + v.qFace + 'R.5F' + v.av + '(FACEAR)', 'g75a');
    P('GOTO50', 'goto50');
    P('N10G0Z0', 'n10');
    P('G75X-1Z0P999999Q' + v.qFace + 'R.5F' + v.av + '(FACEAR)', 'g75b');
    if (n.sobreZ <= n.incFace) {
      pb.rapid(n.dBruto, 0, 'n10', 'APROXIMACAO', T);
      cyc75(pb, n.dBruto, 0, 0, n.incFace, 0.5, n.av, 'g75b', T);
    } else {
      pb.rapid(n.dBruto, n.sobreZ - n.incFace, 'g0zini', 'APROXIMACAO', T);
      cyc75(pb, n.dBruto, n.sobreZ - n.incFace, 0, n.incFace, 0.5, n.av, 'g75a', T);
    }
    P('N50G0Z' + v.sobre, 'n50'); pb.rapid(n.dBruto, n.sobreZ, 'n50', 'APROXIMACAO', T);
  }

  // um programa (um lado). o = {nome, lista, dBruto, lBruto, lPeca, grip, pressao, rot, tools, meta, outro}
  // o.outro (lado 2): {pts, zEnd, lBrutoOutro, canais} = contorno final do lado 1 (para o bruto e o perfil protegido do simulador)
  function psLado(o) {
    var erros = [], avisos = [], t1 = o.tools && o.tools.t1, t2 = o.tools && o.tools.t2, t3 = o.tools && o.tools.t3, t4 = o.tools && o.tools.t4, t5 = o.tools && o.tools.t5, t6 = o.tools && o.tools.t6, t7 = o.tools && o.tools.t7, rot = o.rot || '';
    var R0 = o.dBruto / 2, sobreZ = o.lBruto - o.lPeca;
    var sentE = o.sentE === 'trans' ? 'G72' : 'G71', sentI = o.sentI === 'trans' ? 'G72' : 'G71';
    var fx = fixacao({ grip: o.grip, pressao: o.pressao }, o.meta, erros), maq = fx.maq;
    var ext = o.ext !== false, opInt = o.int !== false; // usinar o externo e/ou o interno neste lado
    var ct = ext ? psContorno(psNormRosca(o.lista, false), R0, '#1', rot, erros, sentE) : { ok: true, defs: [], calcs: [], moves: [], pts: [[0, R0]], canais: [], pieces: [], zEnd: 0, hMax: 0, somaL: 0 }; // so interno: o externo fica no Ø bruto
    var internos = opInt ? psNormRosca(o.internos, true) : [];
    // trechos internos (furo + mandrilamento); lista vazia = sem operacao interna
    var bIn = o.brutoInt, implicito = false;
    if (!(bIn && bIn.pieces.length) && Array.isArray(internos) && psTemMand(internos) && !internos.some(function (it) { return it.tipo === 'furo'; })) {
      // sem broca e sem furo informado no bruto: o bloco e considerado ja furado (passante) com o menor diametro do perfil interno
      var dm = Infinity, vm = null;
      internos.forEach(function (it, k) {
        var a = psN(it.a), b = psN(it.b), v0 = '#' + (PS_IVAR0 + 4 * k);
        if (it.tipo === 'icil' && a > 0 && a < dm) { dm = a; vm = v0; }
        else if (it.tipo === 'icone' && a > 0 && b > 0) { if (a < dm) { dm = a; vm = v0; } if (b < dm) { dm = b; vm = '#' + (PS_IVAR0 + 4 * k + 1); } }
      });
      if (isFinite(dm)) { bIn = { pieces: [{ d: dm, L: o.lBruto, vd: vm, vL: null }], desdeAqui: true, zOpp: -o.lPeca }; implicito = true; }
    }
    var bi = (bIn && bIn.pieces.length) ? psBrutoGeom(bIn, sobreZ, o.lPeca) : null; // furo(s) que o bruto ja traz
    var ci = (Array.isArray(internos) && internos.length) ? psContornoInt(internos, { R0: R0, lPeca: o.lPeca }, erros, rot, sentI, bi && bi.segs) : null;
    if (!ext && !ci) erros.push(rot + 'Só interno: adicione o furo ou o mandrilamento em "Internos" deste lado.');
    validarTool(t1, 't1', 'Ferramenta de faceamento/torneamento', ['externa', 'faceamento'], erros, avisos);
    var temCanal = ct.ok && ct.canais.length > 0;
    var temPil = !!(ci && ci.ok && ci.furo), temFuro = temPil && !ci.furo.existente, temMand = !!(ci && ci.ok && ci.pieces.length > 0);
    if (temFuro) {
      validarTool(t3, 't3', 'Ferramenta de furação', ['furacao'], erros, avisos);
      if (t3) {
        if (!(Number(t3.incTorn) > 0)) erros.push(rot + 'Ferramenta de furação sem incremento de bicada (cadastre no banco, campo "incremento de cilindragem").');
        if (Number(t3.diametro) > 0 && Math.abs(Number(t3.diametro) - ci.furo.d) > 0.01) avisos.push(rot + 'O Ø do furo (' + fmt(ci.furo.d) + ') é diferente do Ø cadastrado da broca (' + fmt(t3.diametro) + '): confira a ferramenta escolhida.');
        if (!(Number(t3.diametro) > 0)) avisos.push(rot + 'A ferramenta de furação não tem Ø cadastrado: a simulação desenha a broca com o Ø do furo.');
      }
    }
    if (temMand) {
      validarTool(t4, 't4', 'Ferramenta de mandrilamento interno', ['interna'], erros, avisos);
      if (t4) {
        if (sentI === 'G71' && !(Number(t4.incTorn) > 0)) erros.push(rot + 'Ferramenta de mandrilamento sem incremento de cilindragem (U do G71 interno).');
        if (sentI === 'G72' && !(Number(t4.incFace) > 0) && !(Number(t4.incTorn) > 0)) erros.push(rot + 'Ferramenta de mandrilamento sem incremento (W do G72 interno).');
        if (num(t4.acabFace) < 0 || num(t4.acabTorn) < 0) erros.push(rot + 'Mandrilamento: sobremetal de acabamento não pode ser negativo.');
      }
    }
    if (temCanal) {
      validarTool(t2, 't2', 'Ferramenta de canal', ['encaixe'], erros, avisos);
      if (t2) {
        if (!(Number(t2.largura) > 0)) erros.push(rot + 'Ferramenta de canal sem largura (cadastre no banco).');
        if (!(Number(t2.incCanal) > 0)) erros.push(rot + 'Ferramenta de canal sem incremento de corte (cadastre no banco).');
      }
    }
    var temCanalI = !!(ci && ci.ok && ci.canais.length > 0);
    if (temCanalI) {
      validarTool(t5, 't5', 'Ferramenta de canal interno', ['encaixe'], erros, avisos);
      if (t5) {
        if (!(Number(t5.largura) > 0)) erros.push(rot + 'Ferramenta de canal interno sem largura (cadastre no banco).');
        if (!(Number(t5.incCanal) > 0)) erros.push(rot + 'Ferramenta de canal interno sem incremento de corte (cadastre no banco).');
        ci.canais.forEach(function (cn) {
          if (Number(t5.largura) > 0 && cn.w + 1e-9 < Number(t5.largura)) erros.push(rot + cn.nome + 'largura do canal (' + fmt(cn.w) + ') menor que a largura da ferramenta (' + fmt(t5.largura) + ').');
        });
      }
    }
    // roscas (G76): externas no perfil, internas no mandrilamento
    var rosE = ct.ok ? ct.pieces.filter(function (p) { return p.rosca; }) : [], rosI = (ci && ci.ok) ? ci.pieces.filter(function (p) { return p.rosca; }) : [];
    var temRosca = rosE.length > 0, temRoscaI = rosI.length > 0;
    function chkRosca(tl, id, papel, pcs) {
      validarTool(tl, id, papel, ['rosca'], erros, avisos);
      pcs.forEach(function (pc) {
        var r = pc.rosca;
        if (tl && Number(tl.rpm) > 0 && Number(tl.rpm) > 5000 / r.p + 1e-9) erros.push(rot + r.nome + 'RPM ' + fmt(tl.rpm) + ' passa do limite do G76 para o passo ' + fmt(r.p) + ': RPM máx. = 5000 / passo = ' + fmt(Math.floor(5000 / r.p)) + ' (manual ROMI 0i-TD).');
        if (r.l > pc.L + EPS) erros.push(rot + r.nome + 'o comprimento da rosca (' + fmt(r.l) + ') passa do comprimento do trecho (' + fmt(pc.L) + ').');
        if (pc.zN1 - pc.zN0 - r.l < EPS) avisos.push(rot + r.nome + 'a rosca termina no fim do trecho, sem canal de alívio depois: a saída da rosca pode bater no ressalto/fundo. Coloque um "Canal" logo depois da rosca.');
      });
      if (tl && !(Number(tl.rpm) > 0)) erros.push(rot + papel + ': a ferramenta de rosca precisa de RPM (G97) cadastrado.');
    }
    if (temRosca) chkRosca(t6, 't6', 'Ferramenta de rosca externa', rosE);
    if (temRoscaI) {
      chkRosca(t7, 't7', 'Ferramenta de rosca interna', rosI);
      rosI.forEach(function (pc) { if (pc.rosca.d / 2 > R0 - 0.5) erros.push(rot + pc.rosca.nome + 'o Ø nominal (' + fmt(pc.rosca.d) + ') não cabe no bloco (Ø' + fmt(2 * R0) + ').'); });
    }
    if (sobreZ < -EPS) erros.push(rot + 'Comprimento bruto (' + fmt(o.lBruto) + ') menor que o comprimento final (' + fmt(o.lPeca) + ').');
    if (erros.length) return { erros: erros, avisos: avisos };

    // canais: validacao e posicao
    var wT = temCanal ? Number(t2.largura) : 0, zMaxCanal = 0;
    var canais = ct.canais.slice().sort(function (a, b) { return a.z - b.z; });
    canais.forEach(function (cn, i) {
      var rmin = 1e9;
      for (var s = 0; s <= 20; s++) rmin = Math.min(rmin, psRaioEm(ct.pts.concat([[-ct.zEnd, R0], [-o.lPeca, R0]]), cn.z + cn.w * s / 20));
      if (cn.d / 2 > rmin - 0.2) erros.push(rot + cn.nome + 'o Ø do fundo (' + fmt(cn.d) + ') precisa ficar abaixo do Ø da peça no canal (' + fmt(2 * rmin) + ').');
      if (cn.w + 1e-9 < wT) erros.push(rot + cn.nome + 'largura do canal (' + fmt(cn.w) + ') menor que a largura da ferramenta (' + fmt(wT) + ').');
      if (i && cn.z < canais[i - 1].z + canais[i - 1].w - 1e-9) erros.push(rot + cn.nome + 'o canal sobrepõe o canal anterior.');
      if (cn.z + cn.w > o.lPeca + EPS) erros.push(rot + cn.nome + 'o canal passa do comprimento da peça.');
      zMaxCanal = Math.max(zMaxCanal, cn.z + cn.w);
    });
    var prof = Math.max(ct.zEnd, zMaxCanal), livre = o.lPeca - maq.grip;
    if (prof > livre + EPS) erros.push(rot + 'A usinagem chega a ' + fmt(prof) + ' mm da face, mas o trecho livre fora da placa é ' + fmt(livre) + ' (peça ' + fmt(o.lPeca) + ' − preso ' + fmt(maq.grip) + '): a ferramenta bateria nas castanhas.');
    else if (livre - prof < 1) avisos.push(rot + 'Folga de só ' + fmt(livre - prof) + ' mm entre o fim da usinagem e as castanhas.');
    if (sobreZ < EPS) avisos.push(rot + 'Sobremetal em Z é zero: o faceamento corta direto em Z0.');
    if (erros.length) return { erros: erros, avisos: avisos };

    var acabT = num(t1.acabTorn), acabF = num(t1.acabFace);
    var T1 = tcode(t1.t), T2 = temCanal ? tcode(t2.t) : '', av = Number(t1.avAcab) > 0 ? Number(t1.avAcab) : 0.15;
    var incX = Number(t1.incTorn), incZ = Number(t1.incFace), avD = Number(t1.avDesb);
    var defs = [
      { sec: 'MEDIDAS FINAIS', n: 3, val: o.lPeca, c: o.duplo ? 'COMPRIMENTO DA PECA NESTA OPERACAO' : 'COMPRIMENTO FINAL DA PECA', efeito: 'Define o sobremetal em Z (#13 = #2 - #3) e o fundo da peca na simulacao.' },
      { sec: 'BRUTO', n: 1, val: o.dBruto, c: 'DIAMETRO BRUTO', efeito: 'Diametro do bloco. Inicio do faceamento, ponto de partida do G71 e bruto da simulacao (G1900).' },
      { sec: 'BRUTO', n: 2, val: o.lBruto, c: 'COMPRIMENTO BRUTO', efeito: 'Comprimento do bloco. Com #3 define o sobremetal em Z.' },
      { sec: 'FERRAMENTAS', n: 101, raw: T1, c: t1.nome, efeito: 'Ferramenta do faceamento e do desbaste/acabamento do perfil (banco de ferramentas).' }
    ];
    if (bi && !implicito) { // furo(s) que o bruto ja traz: variaveis na secao BRUTO, logo depois do comprimento bruto
      var bdefs = [];
      o.brutoInt.pieces.forEach(function (pc, k) {
        bdefs.push({ sec: 'BRUTO', n: PS_BVAR0 + 2 * k, val: pc.d, c: 'BRUTO FURO ' + (k + 1) + ' DIAMETRO', efeito: 'Diametro interno que o bloco ja traz' + (o.brutoInt.desdeAqui ? ' (a partir da face deste lado).' : ' (a partir da face do outro lado).') + (bi.uniforme && k === 0 ? ' Alimenta o G1901 (coluna com orificio) do bruto da simulacao.' : ' So informativo no programa: o G1900/G1901 nao descreve furo escalonado ou cego.') },
          { sec: 'BRUTO', n: PS_BVAR0 + 2 * k + 1, val: pc.L, c: 'BRUTO FURO ' + (k + 1) + ' COMPRIMENTO', efeito: 'Comprimento deste diametro interno, contado da face onde o furo comeca.' });
      });
      defs.splice.apply(defs, [3, 0].concat(bdefs));
    }
    if (temCanal) defs.push({ sec: 'FERRAMENTAS', n: 102, raw: T2, c: t2.nome, efeito: 'Ferramenta de canal (banco de ferramentas).' });
    var T3 = temFuro ? tcode(t3.t) : '', T4 = temMand ? tcode(t4.t) : '';
    if (temFuro) defs.push({ sec: 'FERRAMENTAS', n: 103, raw: T3, c: t3.nome, efeito: 'Ferramenta de furacao (broca, G83).' });
    if (temMand) defs.push({ sec: 'FERRAMENTAS', n: 104, raw: T4, c: t4.nome, efeito: 'Ferramenta de mandrilamento interno (barra).' });
    var wTI = temCanalI ? Number(t5.largura) : 0, T5 = temCanalI ? tcode(t5.t) : '';
    if (temCanalI) defs.push({ sec: 'FERRAMENTAS', n: 105, raw: T5, c: t5.nome, efeito: 'Ferramenta de canal interno (banco de ferramentas).' });
    var T6 = temRosca ? tcode(t6.t) : '', T7 = temRoscaI ? tcode(t7.t) : '';
    var zAe = Math.max(3, Math.ceil(2 * Math.max.apply(null, rosE.map(function (p) { return p.rosca.p; }).concat([0])))), zAi = Math.max(3, Math.ceil(2 * Math.max.apply(null, rosI.map(function (p) { return p.rosca.p; }).concat([0]))));
    if (temRosca) defs.push({ sec: 'FERRAMENTAS', n: 106, raw: T6, c: t6.nome, efeito: 'Ferramenta de rosca externa (banco de ferramentas).' });
    if (temRoscaI) defs.push({ sec: 'FERRAMENTAS', n: 107, raw: T7, c: t7.nome, efeito: 'Ferramenta de rosca interna (banco de ferramentas).' });
    ct.defs.forEach(function (d) { defs.push(d); });
    if (ci) ci.defs.forEach(function (d) { defs.push(d); });
    defs.push(
      { sec: 'PARAMETROS', n: 4, val: Number(t1.rpm), c: 'LIMITE DE RPM', efeito: 'Limite de rotacao (G50) para G96.' },
      { sec: 'PARAMETROS', n: 5, val: Number(t1.vc), c: 'VELOCIDADE DE CORTE', efeito: 'Vc em m/min (G96).' },
      { sec: 'PARAMETROS', n: 6, val: avD, c: 'AVANCO DESBASTE', efeito: 'Avanco (mm/rot) do faceamento e do G71.' },
      { sec: 'PARAMETROS', n: 7, val: av, c: 'AVANCO ACABAMENTO', efeito: 'Avanco (mm/rot) da passada no contorno e do G70.' },
      { sec: 'PARAMETROS', n: 9, val: incZ, c: 'INCREMENTO FACEAMENTO', efeito: 'Profundidade de corte por passe em Z no faceamento (G75)' + (sentE === 'G72' ? ' e tambem o passe em Z do desbaste transversal (W do G72).' : '.') },
      { sec: 'PARAMETROS', n: 10, val: Number(t1.sentido), c: 'SENTIDO DE GIRO', efeito: '4 = M4, 3 = M3.' },
      { sec: 'PARAMETROS', n: 11, val: acabT, c: 'SOBREMETAL ACABAMENTO NO DIAMETRO', efeito: 'U do ' + sentE + ': material deixado no diametro para o acabamento (G70). 0 = sem sobremetal.' },
      { sec: 'PARAMETROS', n: 12, val: acabF, c: 'SOBREMETAL ACABAMENTO EM Z', efeito: 'W do ' + sentE + ': material deixado em Z nos degraus para o acabamento (G70). 0 = sem sobremetal.' }
    );
    if (sentE !== 'G72') defs.splice(defs.findIndex(function (d) { return d.n === 9; }), 0,
      { sec: 'PARAMETROS', n: 8, val: incX, c: 'INCREMENTO DE CORTE NO RAIO', efeito: 'Profundidade de corte por passe no G71 (U do primeiro bloco).' });
    if (!ext) defs = defs.filter(function (d) { return d.sec !== 'PARAMETROS' || [7, 8, 11, 12].indexOf(d.n) < 0; }); // so interno: sem G71/G72 e G70 externos
    if (temCanal) {
      defs.push(
        { sec: 'PARAMETROS', n: 50, val: Number(t2.vc), c: 'VELOCIDADE DE CORTE CANAL', efeito: 'Vc em m/min (G96) da ferramenta de canal.' },
        { sec: 'PARAMETROS', n: 51, val: Number(t2.rpm), c: 'LIMITE ROTACAO CANAL', efeito: 'Limite de RPM (G50) da ferramenta de canal.' },
        { sec: 'PARAMETROS', n: 52, val: Number(t2.avDesb), c: 'AVANCO CANAL', efeito: 'Avanco (mm/rot) do G75 do canal.' },
        { sec: 'PARAMETROS', n: 53, val: Number(t2.sentido), c: 'SENTIDO DE GIRO CANAL', efeito: '4 = M4, 3 = M3.' },
        { sec: 'PARAMETROS', n: 54, val: Number(t2.incCanal), c: 'INCREMENTO DO CANAL NO RAIO', efeito: 'Profundidade por descida do G75 no canal (P).' },
        { sec: 'PARAMETROS', n: 56, val: Math.round(wT * 0.8 * 100) / 100, c: 'PASSO EM Z DO CANAL', efeito: 'Deslocamento em Z entre descidas quando o canal e mais largo que a ferramenta (Q). Use menos que a largura da ferramenta.' },
        { sec: 'PARAMETROS', n: 58, val: wT, c: 'LARGURA DA FERRAMENTA DE CANAL', efeito: 'Largura da pastilha de canal (vem do banco). O ponto programado e o canto do lado da face.' }
      );
    }
    var incI = temMand ? (sentI === 'G72' ? (Number(t4.incFace) > 0 ? Number(t4.incFace) : Number(t4.incTorn)) : Number(t4.incTorn)) : 0;
    var acabIT = temMand ? num(t4.acabTorn) : 0, acabIF = temMand ? num(t4.acabFace) : 0, avIA = temMand && Number(t4.avAcab) > 0 ? Number(t4.avAcab) : (temMand ? Number(t4.avDesb) : 0);
    if (temFuro) defs.push(
      { sec: 'PARAMETROS', n: 60, val: Number(t3.rpm), c: 'RPM FIXO FURACAO', efeito: 'Rotacao fixa (G97) da broca; tambem e o limite G50.' },
      { sec: 'PARAMETROS', n: 61, val: Number(t3.avDesb), c: 'AVANCO FURACAO', efeito: 'Avanco do G83.' },
      { sec: 'PARAMETROS', n: 62, val: Number(t3.incTorn), c: 'INCREMENTO DE BICADA', efeito: 'Quanto a broca desce por bicada antes de recuar para quebrar o cavaco (Q do G83).' },
      { sec: 'PARAMETROS', n: 63, val: Number(t3.sentido), c: 'SENTIDO DE GIRO FURACAO', efeito: '3 = M3, 4 = M4.' }
    );
    if (temMand) defs.push(
      { sec: 'PARAMETROS', n: 70, val: Number(t4.vc), c: 'VELOCIDADE DE CORTE INTERNA', efeito: 'Vc em m/min (G96) do mandrilamento.' },
      { sec: 'PARAMETROS', n: 71, val: Number(t4.rpm), c: 'LIMITE RPM INTERNA', efeito: 'Limite de rotacao (G50) do mandrilamento.' },
      { sec: 'PARAMETROS', n: 72, val: Number(t4.avDesb), c: 'AVANCO DESBASTE INTERNO', efeito: 'Avanco do ' + sentI + ' interno.' },
      { sec: 'PARAMETROS', n: 73, val: avIA, c: 'AVANCO ACABAMENTO INTERNO', efeito: 'Avanco da passada no contorno e do G70 interno.' },
      { sec: 'PARAMETROS', n: 74, val: incI, c: sentI === 'G72' ? 'INCREMENTO EM Z INTERNO' : 'INCREMENTO NO RAIO INTERNO', efeito: sentI === 'G72' ? 'W do G72 interno: profundidade por passe em Z (desbaste transversal).' : 'U do G71 interno: profundidade de corte por passe no raio.' },
      { sec: 'PARAMETROS', n: 75, val: Number(t4.sentido), c: 'SENTIDO DE GIRO INTERNA', efeito: '4 = M4, 3 = M3.' },
      { sec: 'PARAMETROS', n: 76, val: acabIT, c: 'SOBREMETAL ACABAMENTO INTERNO NO DIAMETRO', efeito: 'U (negativo no interno) do ' + sentI + ': material deixado no diametro para o G70. 0 = sem sobremetal.' },
      { sec: 'PARAMETROS', n: 77, val: acabIF, c: 'SOBREMETAL ACABAMENTO INTERNO EM Z', efeito: 'W do ' + sentI + ' interno: material deixado em Z para o G70. 0 = sem sobremetal.' }
    );
    if (temCanalI) defs.push(
      { sec: 'PARAMETROS', n: 80, val: Number(t5.vc), c: 'VELOCIDADE DE CORTE CANAL INTERNO', efeito: 'Vc em m/min (G96) da ferramenta de canal interno.' },
      { sec: 'PARAMETROS', n: 81, val: Number(t5.rpm), c: 'LIMITE ROTACAO CANAL INTERNO', efeito: 'Limite de RPM (G50) da ferramenta de canal interno.' },
      { sec: 'PARAMETROS', n: 82, val: Number(t5.avDesb), c: 'AVANCO CANAL INTERNO', efeito: 'Avanco (mm/rot) do G75 do canal interno.' },
      { sec: 'PARAMETROS', n: 83, val: Number(t5.sentido), c: 'SENTIDO DE GIRO CANAL INTERNO', efeito: '4 = M4, 3 = M3.' },
      { sec: 'PARAMETROS', n: 84, val: Number(t5.incCanal), c: 'INCREMENTO DO CANAL INTERNO NO RAIO', efeito: 'Profundidade por avanco do G75 no canal interno (P), do furo para fora.' },
      { sec: 'PARAMETROS', n: 86, val: Math.round(wTI * 0.8 * 100) / 100, c: 'PASSO EM Z DO CANAL INTERNO', efeito: 'Deslocamento em Z entre passadas quando o canal e mais largo que a ferramenta (Q). Use menos que a largura da ferramenta.' },
      { sec: 'PARAMETROS', n: 88, val: wTI, c: 'LARGURA DA FERRAMENTA DE CANAL INTERNO', efeito: 'Largura da pastilha de canal interno (vem do banco). O ponto programado e o canto do lado da face.' }
    );
    if (temRosca) defs.push(
      { sec: 'PARAMETROS', n: 90, val: Number(t6.rpm), c: 'RPM FIXO ROSCA EXTERNA', efeito: 'Rotacao fixa (G97) do roscamento; no G76 o RPM nao pode passar de 5000 / passo.' },
      { sec: 'PARAMETROS', n: 91, val: Number(t6.sentido), c: 'SENTIDO DE GIRO ROSCA EXTERNA', efeito: '4 = M4, 3 = M3.' },
      { sec: 'PARAMETROS', n: 92, val: zAe, c: 'ENTRADA EM Z DA ROSCA EXTERNA', efeito: 'Quanto antes do inicio da rosca a ferramenta fica posicionada (distancia para o carro chegar ao avanco do passo): pelo menos 2 x passo.' }
    );
    if (temRoscaI) defs.push(
      { sec: 'PARAMETROS', n: 93, val: Number(t7.rpm), c: 'RPM FIXO ROSCA INTERNA', efeito: 'Rotacao fixa (G97) do roscamento interno; no G76 o RPM nao pode passar de 5000 / passo.' },
      { sec: 'PARAMETROS', n: 94, val: Number(t7.sentido), c: 'SENTIDO DE GIRO ROSCA INTERNA', efeito: '4 = M4, 3 = M3.' },
      { sec: 'PARAMETROS', n: 95, val: zAi, c: 'ENTRADA EM Z DA ROSCA INTERNA', efeito: 'Quanto antes do inicio da rosca a ferramenta fica posicionada: pelo menos 2 x passo.' }
    );
    if (temRosca || temRoscaI) defs.push(
      { sec: 'PARAMETROS', n: 97, val: 100, c: 'G76 PROFUNDIDADE MINIMA DE CORTE', efeito: 'Q do 1o bloco do G76 (milesimos de mm no raio): nenhuma passada fica mais rasa que isto. Valor do exemplo do manual ROMI.' },
      { sec: 'PARAMETROS', n: 98, val: 0.1, c: 'G76 SOBREMETAL DO ULTIMO PASSE', efeito: 'R do 1o bloco do G76 (mm no raio): profundidade da ultima passada. Valor do exemplo do manual ROMI.' }
    );
    defs.push(
      { sec: 'CALCULOS', n: 13, expr: '#2-#3', c: 'SOBREMETAL EM Z', efeito: 'Material a facear em Z.' },
      { sec: 'CALCULOS', n: 14, expr: '#9*1000', c: 'INCREMENTO FACEAMENTO EM 0.001MM', efeito: 'Valor Q do G75 do faceamento.' },
      { sec: 'CALCULOS', n: 15, expr: '#13+250', c: 'PT DE TROCA EM Z', efeito: 'Posicao Z segura de troca de ferramenta.' },
      { sec: 'CALCULOS', n: 16, expr: '#13-#9', c: 'INICIO DO FACEAMENTO EM Z', efeito: 'Z onde o G75 comeca (sobremetal - 1 incremento).' }
    );
    ct.calcs.forEach(function (d) { defs.push(d); });
    if (ci) ci.calcs.forEach(function (d) { defs.push(d); });
    if (temFuro) defs.push({ sec: 'CALCULOS', n: 64, expr: '#62*1000', c: 'INCREMENTO DE BICADA EM 0.001MM', efeito: 'Valor Q do G83 (milesimos de mm).' });
    if (temCanalI) defs.push(
      { sec: 'CALCULOS', n: 85, expr: '#84*1000', c: 'INCREMENTO DO CANAL INTERNO EM 0.001MM', efeito: 'Valor P do G75 do canal interno.' },
      { sec: 'CALCULOS', n: 87, expr: '#86*1000', c: 'PASSO EM Z DO CANAL INTERNO EM 0.001MM', efeito: 'Valor Q do G75 do canal interno.' }
    );
    if (temCanal) defs.push(
      { sec: 'CALCULOS', n: 55, expr: '#54*1000', c: 'INCREMENTO DO CANAL EM 0.001MM', efeito: 'Valor P do G75 do canal.' },
      { sec: 'CALCULOS', n: 57, expr: '#56*1000', c: 'PASSO EM Z DO CANAL EM 0.001MM', efeito: 'Valor Q do G75 do canal.' }
    );

    var mt = metaPadrao(o.meta, { nomeAuto: function () { return o.nome; } }, {});
    mt.nome = o.nome;
    var L = [], idx = {};
    var P = function (s, key) { if (key) idx[key] = L.length; L.push(s); };
    cabecalhoPrograma(P, mt);
    blocoVariaveis(defs).forEach(function (s) { P(s); });
    P('');
    if (bi && bi.uniforme) P('G1901D#1E' + bi.segs[0].vd + 'L#2K0.(BRUTO COM FURO PASSANTE' + (implicito ? ' - CONSIDERADO' : '') + ')');
    else {
      P('G1900D#1L#2K0.');
      if (bi && !implicito) P('(BRUTO COM FURO EXISTENTE NAO DESENHADO NO G1900: VER VARIAVEIS #' + PS_BVAR0 + ' EM DIANTE)');
    }
    P('');

    var v = { dBruto: '#1', sobre: '#13', incFace: '#9', qFace: '#14', av: '#6', zIni: '#16', ptZ: '#15' };
    var z15 = sobreZ + 250, pb = new PathB({ x: maq.xHome, z: z15 });
    cabTroca(P, v, 'FACEAMENTO E PERFIL', '#101');
    P('G96S#5M#10'); P('G50S#4'); P('M8'); if (fx.pr) P(fx.pr); P('');
    psFace(P, pb, v, { xH: maq.xHome, sobreZ: sobreZ, dBruto: o.dBruto, incFace: incZ, av: avD });
    P('');
    if (ext) {
      P('(DESBASTE DO PERFIL)');
      P('G0Z1', 'g0z1a'); pb.rapid(o.dBruto, 1, 'g0z1a', 'APROXIMACAO', 'a');
      P('X#1', 'g0x1a'); pb.rapid(o.dBruto, 1, 'g0x1a', 'APROXIMACAO', 'a');
      var cp = ct.pts.slice(); // o contorno ja comeca em (0, r)
      if (sentE === 'G72') {
        P('G72W#9R.5', 'g71a');
        P('G72P1Q2U#11W#12F#6', 'g71');
        cyc72(pb, cp, { xA: o.dBruto, zA: 1, W: incZ, Rr: 0.5, du: acabT, dw: acabF, f: avD, line: 'g71', tool: 'a', interno: false });
      } else {
        P('G71U#8R.5', 'g71a');
        P('G71P1Q2U#11W#12F#6', 'g71');
        cyc71(pb, cp, { R0: R0, xA: o.dBruto, zA: 1, U: incX, Rr: 0.5, du: acabT, dw: acabF, f: avD, line: 'g71', tool: 'a' });
      }
      // contorno (executado uma vez em movimento normal, como nos programas da casa)
      var runC = function (feed, key, label) {
        ct.moves.forEach(function (m) {
          var z = m.to[0] == null ? pb.pos.z : m.to[0], k = key || m.key;
          if (m.g === 'G0') pb.rapid(2 * m.to[1], z, k, label, 'a');
          else if (m.g === 'G1') pb.feed(2 * m.to[1], z, feed, k, label, 'a');
          else pb.arcRP(m.from, [z, m.to[1]], m.R, m.g === 'G3', feed, k, label, 'a');
        });
      };
      ct.moves.forEach(function (m) { P(m.code, m.key); });
      runC(av, null, 'CONTORNO');
      P('');
      P('G0Z1', 'g0z1b'); pb.rapid(pb.pos.x, 1, 'g0z1b', 'RETORNO', 'a');
      P('X#1', 'g0x1b'); pb.rapid(o.dBruto, 1, 'g0x1b', 'RETORNO', 'a');
      P('(CICLO DE ACABAMENTO)');
      P('G70P1Q2F#7', 'g70');
      // G70: parte do ponto A, segue o contorno e volta a A
      ct.moves.forEach(function (m) {
        var z = m.to[0] == null ? pb.pos.z : m.to[0];
        if (m.g === 'G0') pb.rapid(2 * m.to[1], z, 'g70', 'ACABAMENTO (G70)', 'a');
        else if (m.g === 'G1') pb.feed(2 * m.to[1], z, av, 'g70', 'ACABAMENTO (G70)', 'a');
        else pb.arcRP(m.from, [z, m.to[1]], m.R, m.g === 'G3', av, 'g70', 'ACABAMENTO (G70)', 'a');
      });
      pb.rapid(o.dBruto, 1, 'g70', 'ACABAMENTO (G70)', 'a');
    }

    // canais
    if (temCanal) {
      P('');
      P('(CANAL)');
      P('G28U0(PT DE TROCA)', 'g28c'); pb.rapid(maq.xHome, pb.pos.z, 'g28c', 'TROCA', 'a');
      P('G0Z#15(PT DE TROCA)', 'g0zc'); pb.rapid(maq.xHome, z15, 'g0zc', 'TROCA', 'a');
      P('T#102(CANAL)');
      P('G54');
      P('G96S#50M#53'); P('G50S#51');
      var pK = Number(t2.incCanal), qK = Math.round(wT * 0.8 * 100) / 100, fK = Number(t2.avDesb);
      canais.forEach(function (cn, i) {
        P('(CANAL ' + (cn.k + 1) + ')');
        if (i) { P('G28U0', 'g28n' + i); pb.rapid(maq.xHome, pb.pos.z, 'g28n' + i, 'CANAL', 'b'); } // recua em X antes de andar em Z
        var zs = -cn.z, ze = -(cn.z + cn.w - wT);
        // diametro de partida: maior Ø da peca na regiao do canal + 2
        var rmaxC = 0, symC = '#1';
        ct.pieces.forEach(function (pc) {
          if (pc.zN1 > cn.z + EPS && pc.zN0 < cn.z + cn.w - EPS && pc.d2 / 2 >= rmaxC) { rmaxC = pc.d2 / 2; symC = pc.d2s; }
        });
        if (!(rmaxC > 0)) { rmaxC = R0; symC = '#1'; }
        var xs = 2 * rmaxC + 2;
        P('G0Z-' + cn.vz, 'cz' + i); pb.rapid(maq.xHome, zs, 'cz' + i, 'CANAL', 'b');
        P('X[' + symC + '+2]', 'cx' + i); pb.rapid(xs, zs, 'cx' + i, 'CANAL', 'b');
        P('G75X' + cn.vd + 'Z-[' + cn.vz + '+' + cn.vw + '-#58]P#55Q#57R.5F#52', 'c75' + i);
        cycCanal(pb, xs, zs, ze, cn.d, pK, qK, 0.5, fK, 'c75' + i, 'b');
      });
    }
    var ltool = function () { return pb.moves.length ? pb.moves[pb.moves.length - 1].tool : 'a'; };

    // rosca externa (G76): depois do perfil e dos canais (o canal de alivio fica antes da rosca)
    var zExpr = function (zS, v) { return zS === '0' ? v : '[' + v + '-' + zS + ']'; };
    var zFim = function (zS, vl) { return zS === '0' ? vl : '[' + zS + '+' + vl + ']'; };
    if (temRosca) {
      P(''); P('(ROSCA EXTERNA)');
      P('G28U0(PT DE TROCA)', 'g28r'); pb.rapid(maq.xHome, pb.pos.z, 'g28r', 'TROCA', ltool());
      P('G0Z#15(PT DE TROCA)', 'g0zr'); pb.rapid(maq.xHome, z15, 'g0zr', 'TROCA', ltool());
      P('T#106(ROSCA EXTERNA)'); P('G54'); P('M5');
      P('G97S#90M#91'); P('G50S#90'); P('M8');
      rosE.forEach(function (pc, j) {
        var r = pc.rosca, zs = -pc.zN0 + zAe, ze = -(pc.zN0 + r.l), xA = r.d + 4;
        P('(ROSCA ' + (pc.k + 1) + ')');
        P('G0Z' + zExpr(pc.zS, '#92'), 'rz' + j); pb.rapid(maq.xHome, zs, 'rz' + j, 'ROSCA', 'f');
        P('X[' + r.vd + '+4]', 'rx' + j); pb.rapid(xA, zs, 'rx' + j, 'ROSCA', 'f');
        P('G76P010060Q#97R#98', 'r76a' + j);
        P('G76X[' + r.vd + '-' + r.vh + '*2]Z-' + zFim(pc.zS, r.vl) + 'P' + r.vpm + 'Q' + r.vqm + 'F' + r.vp, 'r76' + j);
        cycRosca(pb, { ext: true, xBase: r.d, he: r.he, q: r.qMic / 1000, m: 1, xA: xA, zA: zs, zE: ze, p: r.p, line: 'r76' + j, T: 'f' });
        P('G28U0', 'rg28' + j); pb.rapid(maq.xHome, zs, 'rg28' + j, 'ROSCA', 'f');
      });
    }

    // furacao: broca no eixo com G83 (bicada), como ALIMENTADOR.ENCAIXE.INTERNO
    if (temFuro) {
      var fD = ci.furo;
      P(''); P('(FURACAO)');
      P('G28U0(PT DE TROCA)', 'g28d'); pb.rapid(maq.xHome, pb.pos.z, 'g28d', 'TROCA', ltool());
      P('G0Z#15(PT DE TROCA)', 'g0zd'); pb.rapid(maq.xHome, z15, 'g0zd', 'TROCA', ltool());
      P('T#103(FURACAO)'); P('G54'); P('M5');
      P('G97S#60M#63'); P('G50S#60');
      P('G0Z20', 'dz20'); pb.rapid(maq.xHome, 20, 'dz20', 'FURACAO', 'c');
      P('X0', 'dx0'); pb.rapid(0, 20, 'dx0', 'FURACAO', 'c');
      P('Z2', 'dz2'); pb.rapid(0, 2, 'dz2', 'FURACAO', 'c');
      P('M8');
      P('G83Z-' + fD.vp + 'Q#64F#61', 'g83');
      cycG83(pb, 2, -fD.p, Number(t3.incTorn), Number(t3.avDesb), 'g83', 'c');
      P('G80', 'g80');
      P('M9');
    }

    // mandrilamento interno (G71/G72 interno + G70), blocos N3-N4, como PORTA.MATRIZ.INTERNO
    if (temMand) {
      var rFi = ci.furo.d / 2, cpi = ci.pts.slice(), xAi = ci.furo.d;
      P(''); P('(MANDRILAMENTO INTERNO)');
      P('G28U0(PT DE TROCA)', 'g28m'); pb.rapid(maq.xHome, pb.pos.z, 'g28m', 'TROCA', ltool());
      P('G0Z#15(PT DE TROCA)', 'g0zm'); pb.rapid(maq.xHome, z15, 'g0zm', 'TROCA', ltool());
      P('T#104(MANDRILAMENTO INTERNO)'); P('G54'); P('M5');
      P('G96S#70M#75'); P('G50S#71');
      P('G0Z20', 'mz20'); pb.rapid(maq.xHome, 20, 'mz20', 'MANDRILAR', 'd');
      P('X' + ci.furo.vd, 'mx0'); pb.rapid(xAi, 20, 'mx0', 'MANDRILAR', 'd');
      P('Z1', 'mz1'); pb.rapid(xAi, 1, 'mz1', 'MANDRILAR', 'd');
      P('M8');
      if (sentI === 'G72') {
        P('G72W#74R.5', 'gi71a');
        P('G72P3Q4U-#76W#77F#72', 'gi71');
        cyc72(pb, cpi, { xA: xAi, zA: 1, W: incI, Rr: 0.5, du: acabIT, dw: acabIF, f: Number(t4.avDesb), line: 'gi71', tool: 'd', interno: true });
      } else {
        P('G71U#74R.5', 'gi71a');
        P('G71P3Q4U-#76W#77F#72', 'gi71');
        cyc71i(pb, cpi, { rF: rFi, xA: xAi, zA: 1, U: incI, Rr: 0.5, du: acabIT, dw: acabIF, f: Number(t4.avDesb), line: 'gi71', tool: 'd' });
      }
      var runI = function (feed, key, label) {
        ci.moves.forEach(function (m) {
          var z = m.to[0] == null ? pb.pos.z : m.to[0], k = key || m.key;
          if (m.g === 'G0') pb.rapid(2 * m.to[1], z, k, label, 'd');
          else if (m.g === 'G1') pb.feed(2 * m.to[1], z, feed, k, label, 'd');
          else pb.arcRP(m.from, [z, m.to[1]], m.R, m.g === 'G3', feed, k, label, 'd');
        });
      };
      ci.moves.forEach(function (m) { P(m.code, m.key); });
      runI(avIA, null, 'CONTORNO INTERNO');
      P('');
      P('G0Z1', 'gi0z1'); pb.rapid(pb.pos.x, 1, 'gi0z1', 'RETORNO', 'd');
      P('X' + ci.furo.vd, 'gi0x'); pb.rapid(xAi, 1, 'gi0x', 'RETORNO', 'd');
      P('(CICLO DE ACABAMENTO INTERNO)');
      P('G70P3Q4F#73', 'gi70');
      runI(avIA, 'gi70', 'ACABAMENTO INTERNO (G70)');
      pb.rapid(xAi, 1, 'gi70', 'ACABAMENTO INTERNO (G70)', 'd');
    }

    // canal interno (G75 do furo para fora), depois do mandrilamento
    if (temCanalI) {
      P(''); P('(CANAL INTERNO)');
      P('G28U0(PT DE TROCA)', 'g28i'); pb.rapid(maq.xHome, pb.pos.z, 'g28i', 'TROCA', ltool());
      P('G0Z#15(PT DE TROCA)', 'g0zi'); pb.rapid(maq.xHome, z15, 'g0zi', 'TROCA', ltool());
      P('T#105(CANAL INTERNO)'); P('G54'); P('M5');
      P('G96S#80M#83'); P('G50S#81');
      P('G0Z20', 'iz20'); pb.rapid(maq.xHome, 20, 'iz20', 'CANAL INTERNO', 'e');
      P('M8');
      var pI = Number(t5.incCanal), qI = Math.round(wTI * 0.8 * 100) / 100, fI = Number(t5.avDesb);
      ci.canais.forEach(function (cn, i) {
        P('(CANAL INTERNO ' + (cn.k + 1) + ')');
        // diametro de partida: menor Ø do caminho da face ate o canal, menos 2 (a pastilha passa pelo furo mais estreito)
        var dMin = 1e9, symI = cn.rs;
        ci.pieces.forEach(function (pc) {
          if (pc.zN0 < cn.z + cn.w - EPS) {
            if (pc.d1 < dMin) { dMin = pc.d1; symI = pc.d1s; }
            if (pc.d2 < dMin) { dMin = pc.d2; symI = pc.d2s; }
          }
        });
        var zsI = -cn.z, zeI = -(cn.z + cn.w - wTI), xsI = dMin - 2;
        P('X[' + symI + '-2]', 'ix' + i); pb.rapid(xsI, i ? wTI + 1 : 20, 'ix' + i, 'CANAL INTERNO', 'e');
        P('G0Z-' + cn.vz, 'iz' + i); pb.rapid(xsI, zsI, 'iz' + i, 'CANAL INTERNO', 'e');
        P('G75X' + cn.vd + 'Z-[' + cn.vz + '+' + cn.vw + '-#88]P#85Q#87R.5F#82', 'i75' + i);
        cycCanalI(pb, xsI, zsI, zeI, cn.d, pI, qI, 0.5, fI, 'i75' + i, 'e');
        P('G0Z[#88+1]', 'iz1' + i); pb.rapid(xsI, wTI + 1, 'iz1' + i, 'CANAL INTERNO', 'e'); // a pastilha (largura #88) sai inteira da face antes de subir em X
      });
    }
    // rosca interna (G76): depois do mandrilamento (o furo no Ø menor da porca) e do canal interno (alivio)
    if (temRoscaI) {
      P(''); P('(ROSCA INTERNA)');
      P('G28U0(PT DE TROCA)', 'g28s'); pb.rapid(maq.xHome, pb.pos.z, 'g28s', 'TROCA', ltool());
      P('G0Z#15(PT DE TROCA)', 'g0zs'); pb.rapid(maq.xHome, z15, 'g0zs', 'TROCA', ltool());
      P('T#107(ROSCA INTERNA)'); P('G54'); P('M5');
      P('G97S#93M#94'); P('G50S#93');
      P('G0Z20', 'sz20'); pb.rapid(maq.xHome, 20, 'sz20', 'ROSCA', 'g');
      P('M8');
      rosI.forEach(function (pc, j) {
        var r = pc.rosca, zs = -pc.zN0 + zAi, ze = -(pc.zN0 + r.l), xA = r.d1 - 4;
        P('(ROSCA INTERNA ' + (pc.k + 1) + ')');
        P('X[' + r.vd1 + '-4]', 'sx' + j); pb.rapid(xA, 20, 'sx' + j, 'ROSCA', 'g');
        P('G0Z' + zExpr(pc.zS, '#95'), 'sz' + j); pb.rapid(xA, zs, 'sz' + j, 'ROSCA', 'g');
        P('G76P010060Q#97R#98', 's76a' + j);
        P('G76X' + r.vd + 'Z-' + zFim(pc.zS, r.vl) + 'P' + r.vpm + 'Q' + r.vqm + 'F' + r.vp, 's76' + j);
        cycRosca(pb, { ext: false, xBase: r.d1, he: r.he, q: r.qMic / 1000, m: 1, xA: xA, zA: zs, zE: ze, p: r.p, line: 's76' + j, T: 'g' });
        P('G0Z20', 'sz20' + j); pb.rapid(xA, 20, 'sz20' + j, 'ROSCA', 'g');
      });
    }
    P('G28U0(PT DE TROCA)', 'g28'); pb.rapid(maq.xHome, pb.pos.z, 'g28', 'RETORNO', pb.moves.length ? pb.moves[pb.moves.length - 1].tool : 'a');
    P('G0Z#15(PT DE TROCA)', 'endz'); pb.rapid(maq.xHome, z15, 'endz', 'RETORNO', pb.moves[pb.moves.length - 1].tool);
    P('M9'); P(''); P('M30'); P('%');
    resolverLinhas(pb.moves, idx);

    // perfil acabado (z, r): contorno + canais + fundo
    var outline = ct.pts.slice();
    canais.forEach(function (cn) {
      var rN = psRaioEm(outline.concat([[-ct.zEnd, R0], [-o.lPeca, R0]]), cn.z), rF = psRaioEm(outline.concat([[-ct.zEnd, R0], [-o.lPeca, R0]]), cn.z + cn.w + 1e-4); // 1e-4 alem da parede: se o canal termina num degrau, o raio do outro lado e o do degrau
      var before = outline.filter(function (p) { return p[0] > -cn.z + EPS; }), after = outline.filter(function (p) { return p[0] < -(cn.z + cn.w) - EPS; });
      outline = before.concat([[-cn.z, rN], [-cn.z, cn.d / 2], [-(cn.z + cn.w), cn.d / 2], [-(cn.z + cn.w), rF]], after);
    });
    var lado1Pts = outline.concat([[-o.lPeca, R0]]);       // contorno completo deste lado ate o fundo (para o lado 2)
    var full = outline.slice();
    var bruto = null;
    if (o.outro) {
      // lado 2: o contorno do lado 1 (espelhado) completa a peca acabada e define o bruto
      // z2 = -lPeca - z1; da maior cota (sobremetal do lado 2) ate a face do lado 1
      var ot = o.outro, mapa = ot.pts.map(function (p) { return [-o.lPeca - p[0], p[1]]; }).reverse();
      full = full.concat(mapa.filter(function (p) { return p[0] <= -ct.zEnd + EPS; })); // peca acabada: so o que fica depois do contorno deste lado
      bruto = [];
      for (var i = 0; i < mapa.length - 1; i++) {
        var top = mapa[i], bot = mapa[i + 1];
        if (top[0] - bot[0] > EPS) bruto.push({ z0: top[0], z1: bot[0], d: 2 * top[1], d1: 2 * bot[1] });
      }
    } else full.push([-o.lPeca, R0]);

    // rosca interna: o filete chega ao Ø nominal; a parede ate o perfil externo acabado nao pode acabar
    rosI.forEach(function (pc) {
      var wm = 1e9, wz = 0;
      for (var rs = 0; rs <= 8; rs++) { var zq = pc.zN0 + pc.rosca.l * rs / 8, wl = psRaioEm(full, zq) - pc.rosca.d / 2; if (wl < wm) { wm = wl; wz = zq; } }
      if (wm < 0.3) erros.push(rot + pc.rosca.nome + 'a rosca (Ø' + fmt(pc.rosca.d) + ') fura a parede: sobra ' + fmt(wm) + ' mm até o perfil externo em Z' + fmt(wz) + '.');
      else if (wm < 1.5) avisos.push(rot + pc.rosca.nome + 'parede fina na rosca interna: ' + fmt(wm) + ' mm em Z' + fmt(wz) + '.');
    });
    if (erros.length) return { erros: erros, avisos: avisos };
    // cavidade (furo + mandrilamento): parede minima entre o interno e o perfil externo acabado
    var cavOwn = temPil ? psCavidade(ci, o.lPeca) : null;
    var cavINs = [];
    if (cavOwn) cavINs.push(cavOwn.IN);
    if (bi) cavINs.push(bi.INfin);
    if (cavINs.length) {
      var wMin = 1e9, wZ = 0;
      cavINs.forEach(function (IN) {
        for (var si = 0; si < IN.length - 1; si++) {
          var qa = IN[si], qb = IN[si + 1];
          for (var sk = 0; sk <= 12; sk++) {
            var uz = qa[0] + (qb[0] - qa[0]) * sk / 12, ur = qa[1] + (qb[1] - qa[1]) * sk / 12;
            if (ur <= 0) continue;
            var wall = psRaioEm(full, -uz) - ur;
            if (wall < wMin) { wMin = wall; wZ = -uz; }
          }
        }
      });
      if (wMin < 0.3) erros.push(rot + 'O furo/mandrilamento fura a parede: a distância até o perfil externo é ' + fmt(wMin) + ' mm em Z' + fmt(wZ) + ' (reduza o Ø interno ou aumente o externo).');
      else if (wMin < 2) avisos.push(rot + 'Parede muito fina entre o interno e o externo: ' + fmt(wMin) + ' mm em Z' + fmt(wZ) + '.');
      if (erros.length) return { erros: erros, avisos: avisos };
    }
    var cena = cenaGen(o.dBruto, maq, sobreZ, o.lPeca, full, ct.hMax, Math.max(-10, ct.pts[0][1] - 14), Math.min(prof, o.lPeca), {
      path: pb.moves, start: { x: maq.xHome, z: z15 },
      tools: (function () {
        var tl = { a: simTool(t1) };
        if (temCanal) tl.b = simTool(t2, 'canalext');
        if (temFuro) tl.c = simTool(Object.assign({}, t3, { diametro: ci.furo.d }), 'broca');
        if (temMand) tl.d = simTool(t4, 'interna');
        if (temCanalI) tl.e = simTool(t5, 'canalint');
        if (temRosca) tl.f = simTool(t6, 'rosca');
        if (temRoscaI) tl.g = simTool(t7, 'roscaint');
        return tl;
      })()
    });
    if (bruto) cena.bruto.perfil = bruto;
    // cavidades da peca acabada (para o simulador e a meia secao): as deste lado + as feitas no outro lado (espelhadas)
    var holes = [], ints = [], vaz = [];
    if (cavOwn) { holes.push(cavOwn.poly); ints.push(cavOwn.IN); }
    if (bi) { holes.push(bi.polyFin); ints.push(bi.INfin); vaz.push(bi.polyFull); }
    if (o.outro && o.outro.cav) {
      var mp = function (p) { return [-o.lPeca - p[0], p[1]]; };
      var polyM = o.outro.cav.poly.map(mp);
      holes.push(polyM); ints.push(o.outro.cav.IN.map(mp)); vaz.push(polyM);
    }
    if (holes.length) { cena.holes = holes; cena.interiores = ints; }
    if (vaz.length) cena.bruto.vazios = vaz;

    // estrategia
    var est = [];
    est.push('A ferramenta T' + T1 + ' (' + t1.nome + ') faceia e usina o perfil com Vc constante (G96, ' + fmt(t1.vc) + ' m/min) limitada a ' + fmt(t1.rpm) + ' RPM por G50 e giro M' + Number(t1.sentido) + '.' + txtPressao(fx.pr) + ' O bloco bruto Ø' + fmt(o.dBruto) + ' x ' + fmt(o.lBruto) + ' deixa ' + fmt(sobreZ) + ' mm de sobremetal em Z. O faceamento é G75 (passes de ' + fmt(incZ) + ' mm).');
    var nCil = ct.pieces.filter(function (p) { return p.t === 'cil'; }).length, nCone = ct.pieces.length - nCil;
    if (!ext) est.push('Só interno neste lado: não há torneamento externo, o bloco mantém o Ø bruto (Ø' + fmt(o.dBruto) + ') e só é feito o faceamento antes das operações internas.');
    if (ext) est.push('O perfil tem ' + plural(nCil, 'cilindro', 'cilindros') + (nCone ? ' e ' + plural(nCone, 'cone', 'cones') : '') + ', com ' + fmt(ct.zEnd) + ' mm da face ao último trecho, e fica no bloco N1–N2. ' + (sentE === 'G72'
      ? 'O desbaste é TRANSVERSAL: o G72 corta de frente, em passes ao longo de X a cada ' + fmt(incZ) + ' mm em Z (W, R.5)'
      : 'O desbaste é LONGITUDINAL: o G71 corta ao longo de Z, em passes de ' + fmt(incX) + ' mm no raio (R.5)') + ', deixando ' + (acabT > 0 ? fmt(acabT) + ' mm no Ø' : 'nada no Ø') + ' e ' + (acabF > 0 ? fmt(acabF) + ' mm em Z' : 'nada em Z') + ' (U/W). Como nos programas da casa, o contorno depois do ' + sentE + ' é executado uma vez em movimento normal (F' + fmt(av) + ') e o G70 passa o acabamento de novo.');
    if (temCanal) est.push('Depois a ferramenta de canal T' + T2 + ' (' + t2.nome + ', largura ' + fmt(wT) + ' mm) faz ' + plural(canais.length, 'canal', 'canais') + ' em G75: desce ' + fmt(t2.incCanal) + ' mm por vez até o Ø do fundo' + (canais.some(function (c) { return c.w > wT + 1e-9; }) ? ' e anda ' + fmt(wT * 0.8) + ' mm em Z entre descidas nos canais mais largos' : '') + '. O ponto programado é o canto da pastilha do lado da face.');
    if (implicito) {
      est.push('Sem "Furo (broca)" e sem furo informado no bruto, o programa considera que o bloco já vem com furo passante de Ø' + fmt(bi.segs[0].r * 2) + ' (o menor diâmetro do perfil interno). O mandrilamento parte dele, sem broca; os trechos maiores são abertos pela barra. Se o bloco não tiver esse furo, adicione o "Furo (broca)".');
      avisos.push(rot + 'Considerado furo passante existente no bruto, Ø' + fmt(bi.segs[0].r * 2) + ' (menor Ø do perfil interno), pois não há "Furo (broca)". Se o bloco for maciço, adicione o furo.');
    }
    if (bi && !implicito) est.push('O bloco já traz' + plural(o.brutoInt.pieces.length, 'diâmetro interno', 'diâmetros internos') + ' (' + o.brutoInt.pieces.map(function (p) { return 'Ø' + fmt(p.d) + ' x ' + fmt(p.L); }).join(', ') + ', a partir da face ' + (o.brutoInt.desdeAqui ? 'deste lado' : 'do outro lado') + '): ele fica vazio no bruto da simulação e permanece na peça acabada' + (bi.uniforme ? '; o bruto é descrito em G1901 (coluna com orifício)' : '') + (temPil && ci.furo.existente ? '. Sem broca: o mandrilamento parte do furo existente (Ø' + fmt(ci.furo.d) + ').' : '.'));
    if (temFuro) est.push('Furação: a broca T' + T3 + ' (' + t3.nome + ') faz o furo Ø' + fmt(ci.furo.d) + ' x ' + fmt(ci.furo.p) + ' mm no eixo com G83 (RPM fixo ' + fmt(t3.rpm) + ', bicada de ' + fmt(t3.incTorn) + ' mm, avanço ' + fmt(t3.avDesb) + '), posicionada em X0 Z2.' + (cavOwn && cavOwn.through ? ' O furo é passante (chega ao fundo da peça): confira a saída da broca.' : ''));
    if (temMand) {
      var maxD = Math.max.apply(null, ci.pieces.map(function (p) { return Math.max(p.d1, p.d2); }));
      est.push('Mandrilamento interno: a barra T' + T4 + ' (' + t4.nome + ') parte do Ø do furo (X' + fmt(ci.furo.d) + ', Z1) e abre o interior até Ø' + fmt(maxD) + ' em ' + fmt(ci.zEnd) + ' mm de profundidade, no bloco N3–N4. ' + (sentI === 'G72'
        ? 'O desbaste é TRANSVERSAL (G72 interno, passes em Z de ' + fmt(incI) + ' mm).'
        : 'O desbaste é LONGITUDINAL (G71 interno, passes de ' + fmt(incI) + ' mm no raio).') + ' U é negativo no interno: sobremetal ' + (acabIT > 0 ? fmt(acabIT) + ' mm no Ø' : 'zero no Ø') + ' e ' + (acabIF > 0 ? fmt(acabIF) + ' mm em Z' : 'zero em Z') + '. O contorno roda uma vez em movimento normal e o G70 faz o acabamento. O diâmetro nunca aumenta indo para o fundo (sem sub-corte).');
    }
    if (temCanalI) est.push('Canal interno: depois do mandrilamento, a ferramenta T' + T5 + ' (' + t5.nome + ', largura ' + fmt(wTI) + ' mm) entra no furo e faz ' + plural(ci.canais.length, 'canal', 'canais') + ' em G75, do furo para fora: sobe ' + fmt(t5.incCanal) + ' mm por vez até o Ø do fundo' + (ci.canais.some(function (c) { return c.w > wTI + 1e-9; }) ? ' e anda ' + fmt(wTI * 0.8) + ' mm em Z entre passadas nos canais mais largos' : '') + '. O ponto programado é o canto da pastilha do lado da face; ela parte do menor Ø do caminho (−2 mm) para passar pelo furo.');
    var txtRosca = function (pcs, interna) {
      return pcs.map(function (pc) { var r = pc.rosca; return (interna ? 'M' + fmt(r.d) + '×' + fmt(r.p) + ' interna (furo Ø' + fmt(r.d1) + ' = Ø − 1,0825 × passo)' : 'M' + fmt(r.d) + '×' + fmt(r.p)) + ', ' + fmt(r.l) + ' mm, altura do filete ' + fmt(r.he) + ' mm em ' + r.n + ' passadas (1ª de ' + fmt(r.qMic / 1000) + ' mm)'; }).join('; ');
    };
    if (temRosca) est.push('Rosca externa: a ferramenta T' + T6 + ' (' + t6.nome + ') faz ' + txtRosca(rosE, false) + ' em G76 com RPM fixo (G97, ' + fmt(t6.rpm) + ' RPM). Ela espera ' + fmt(zAe) + ' mm antes do início da rosca para o avanço (passo) estabilizar, com X ' + 4 + ' mm acima do Ø nominal. O cilindro é torneado no Ø nominal; o G76 desce 0,61343 × passo no raio. O simulador mostra o percurso e o tempo das passadas, mas não desenha o filete.');
    if (temRoscaI) est.push('Rosca interna: depois do mandrilamento, a ferramenta T' + T7 + ' (' + t7.nome + ') faz ' + txtRosca(rosI, true) + ' em G76 (RPM fixo ' + fmt(t7.rpm) + '), entrando pelo furo (X do furo − 4) e subindo até o Ø nominal. O simulador mostra o percurso e o tempo, mas não desenha o filete.');
    est.push('Ao terminar, a ferramenta recua ao ponto de troca (G28U0, Z' + fmt(z15) + '), desliga o refrigerante e finaliza com M30.');

    return { erros: [], avisos: avisos, code: L.join('\n'), estrategia: est, dicionario: dicionario(defs), nome: nomeArquivo(mt.nome) + '.txt', cena: cena,
      _geo: { pts: lado1Pts, zEnd: ct.zEnd, canais: canais, cav: cavOwn } };
  }

  var PECA_SIMPLES = {
    id: 'peca_simples',
    titulo: 'Peça simples (lista de trechos)',
    refPrograma: 'PORTA.MATRIZ.txt (G71) + CABECA.ESPINA.ANTIGO.txt (G70)',
    usaDesenho: true,   // perfil, comprimento final e lados vem de um desenho salvo (aba Desenho da peça); campos doDesenho nao aparecem no formulario
    formas: PS_FORMAS,
    max: PS_MAX,
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo (G71 e G70)', tipos: ['externa', 'faceamento'] },
      { id: 't2', papel: 'Ferramenta de canal', tipos: ['encaixe'], opcional: true, usado: function (f) { return psUsos(f).canal; } },
      { id: 't3', papel: 'Broca de furação', tipos: ['furacao'], opcional: true, usado: function (f) { return psUsos(f).furo; } },
      { id: 't4', papel: 'Barra de mandrilamento interno', tipos: ['interna'], opcional: true, usado: function (f) { return psUsos(f).mand; } },
      { id: 't5', papel: 'Ferramenta de canal interno', tipos: ['encaixe'], opcional: true, usado: function (f) { return psUsos(f).canalI; } },
      { id: 't6', papel: 'Ferramenta de rosca externa', tipos: ['rosca'], opcional: true, usado: function (f) { return psUsos(f).rosca; } },
      { id: 't7', papel: 'Ferramenta de rosca interna', tipos: ['rosca'], opcional: true, usado: function (f) { return psUsos(f).roscaI; } }
    ],
    campos: [
      { grupo: 'Bloco bruto', id: 'dBruto', label: 'Ø bruto', unit: 'mm', def: 62, hint: 'Diâmetro do bloco bruto' },
      { grupo: 'Bloco bruto', id: 'lBruto', label: 'Comprimento bruto', unit: 'mm', def: 102, hint: 'Comprimento total do bloco' },
      { grupo: 'Bloco bruto', avancado: 'Bruto com furo existente', id: 'brutoInt', tipo: 'trechos', label: 'Diâmetros internos que o bruto já tem', sub: ' · da face onde o furo começa, para dentro', formas: PS_FORMAS_BINT, max: PS_MAX_BINT, def: [] },
      { grupo: 'Bloco bruto', avancado: 'Bruto com furo existente', id: 'brutoIntLado', tipo: 'select', label: 'O furo do bruto começa na face do', def: '1', opcoes: [['1', 'Lado 1 (face usinada primeiro)'], ['2', 'Lado 2 (face oposta)']],
        quando: function (f) { return Array.isArray(f.brutoInt) && f.brutoInt.length > 0; }, hint: 'Cada linha é um diâmetro, um depois do outro, contados da face onde o furo começa. Comprimento total igual ao do bloco = furo passante. Com furo existente a broca é dispensada: o mandrilamento parte dele.' },
      { grupo: 'Peça', doDesenho: true, id: 'lPeca', label: 'Comprimento final da peça', unit: 'mm', def: 100, hint: 'Do Z0 do lado 1 até a outra face. Sobremetal em Z = bruto − final' },
      { grupo: 'Peça', doDesenho: true, id: 'lados', tipo: 'select', label: 'Lados a usinar', def: '1', opcoes: [['1', '1 lado'], ['2', '2 lados (vira a peça)']], hint: 'Com 2 lados, cada lado tem a sua lista de trechos, contada a partir da própria face.' },
      { grupo: 'Peça', id: 'sobre1', label: 'Sobremetal em Z no lado 1', unit: 'mm', def: 1, quando: function (f) { return f.lados === '2'; }, hint: 'O restante do sobremetal fica para o lado 2' },
      { grupo: 'Operações', id: 'usin1', tipo: 'select', label: 'O que usinar · lado 1', def: 'ambos', opcoes: USIN_OPC, hint: 'Externo e interno, só o externo (perfil, canais) ou só o interno (furo e mandrilamento; o faceamento continua).' },
      { grupo: 'Operações', id: 'usin2', tipo: 'select', label: 'O que usinar · lado 2', def: 'ambos', opcoes: USIN_OPC, quando: function (f) { return f.lados === '2'; } },
      { grupo: 'Trechos', doDesenho: true, id: 'trechos1', tipo: 'trechos', label: 'Lado 1 · externo', quando: function (f) { return f.usin1 !== 'int'; }, def: [
        { tipo: 'chanfro', a: 1, canto: 'ext' }, { tipo: 'cil', a: 40, b: 20 }, { tipo: 'cone', a: 40, b: 60, c: 10 },
        { tipo: 'cil', a: 60, b: 30 }, { tipo: 'canal', a: 50, b: 43, c: 4.5 }] },
      { grupo: 'Trechos', doDesenho: true, id: 'trechos2', tipo: 'trechos', label: 'Lado 2 · externo (contado a partir da face do lado 2)', quando: function (f) { return f.lados === '2' && f.usin2 !== 'int'; }, def: [
        { tipo: 'chanfro', a: 1, canto: 'ext' }, { tipo: 'cil', a: 50, b: 15 }] },
      { grupo: 'Trechos internos (furo e mandrilamento)', doDesenho: true, id: 'internos1', tipo: 'trechos', label: 'Internos · lado 1', formas: PS_FORMAS_INT, max: PS_MAX_INT, quando: function (f) { return f.usin1 !== 'ext'; }, def: [] },
      { grupo: 'Trechos internos (furo e mandrilamento)', doDesenho: true, id: 'internos2', tipo: 'trechos', label: 'Internos · lado 2', formas: PS_FORMAS_INT, max: PS_MAX_INT, quando: function (f) { return f.lados === '2' && f.usin2 !== 'ext'; }, def: [] },
      { grupo: 'Sentido do desbaste', id: 'sentE1', tipo: 'select', label: 'Perfil externo · lado 1', def: 'long', opcoes: SENT_OPC, quando: function (f) { return f.usin1 !== 'int'; }, hint: 'Longitudinal = passes ao longo de Z (G71). Transversal = passes de frente, ao longo de X (G72).' },
      { grupo: 'Sentido do desbaste', id: 'sentI1', tipo: 'select', label: 'Mandrilamento interno · lado 1', def: 'long', opcoes: SENT_OPC, quando: function (f) { return f.usin1 !== 'ext' && psTemMand(f.internos1); }, hint: 'Só vale com cilindro/cone interno (o furo da broca não tem sentido).' },
      { grupo: 'Sentido do desbaste', id: 'sentE2', tipo: 'select', label: 'Perfil externo · lado 2', def: 'long', opcoes: SENT_OPC, quando: function (f) { return f.lados === '2' && f.usin2 !== 'int'; } },
      { grupo: 'Sentido do desbaste', id: 'sentI2', tipo: 'select', label: 'Mandrilamento interno · lado 2', def: 'long', opcoes: SENT_OPC, quando: function (f) { return f.lados === '2' && f.usin2 !== 'ext' && psTemMand(f.internos2); } }
    ].concat(camposFixacao('', '1', '· lado 1'), [{ grupo: 'Fixação na placa', id: 'grip2', label: 'Comprimento preso na placa · lado 2', unit: 'mm', def: GRIP_PADRAO, quando: function (f) { return f.lados === '2'; }, hint: 'Quanto da peça fica dentro das castanhas no lado 2 (padrão ' + GRIP_PADRAO + ').' }]),
    nomeAuto: function (f) { return (f.desenhoNome ? nomeArquivo(f.desenhoNome) : 'PECA.SIMPLES') + '.D' + fmt(f.dBruto); },
    derivados: function (f) {
      var soma = function (l) { return (l || []).reduce(function (s, it) { return s + (it.tipo === 'cil' ? psN(it.b) || 0 : it.tipo === 'cone' ? psN(it.c) || 0 : 0); }, 0); };
      var d = [['Ø bruto', fmt(f.dBruto) + ' mm'], ['Trechos lado 1', fmt(soma(f.trechos1)) + ' mm']];
      if (f.lados === '2') d.push(['Trechos lado 2', fmt(soma(f.trechos2)) + ' mm'], ['Faixa sem usinar', fmt(f.lPeca - soma(f.trechos1) - soma(f.trechos2)) + ' mm']);
      return d;
    },

    gerar: function (f, tools, meta) {
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dBruto', 'lBruto', 'lPeca', 'sobre1', 'grip1', 'grip2']);
      if (f.grip1 === undefined) n.grip1 = GRIP_PADRAO;
      if (f.grip2 === undefined) n.grip2 = GRIP_PADRAO;
      var dois = String(f.lados) === '2';
      if (!(n.dBruto > 0)) erros.push('Informe o Ø bruto.');
      if (!(n.lBruto > 0)) erros.push('Informe o comprimento bruto.');
      if (!(n.lPeca > 0)) erros.push('Informe o comprimento final da peça.');
      if (dois && !(n.sobre1 >= 0)) erros.push('Sobremetal do lado 1 inválido.');
      if (erros.length) return { erros: erros, avisos: avisos };
      // furo(s) que o bloco ja traz (opcional)
      var bPieces = [], bLado = String(f.brutoIntLado) === '2' ? '2' : '1';
      if (Array.isArray(f.brutoInt) && f.brutoInt.length) {
        if (f.brutoInt.length > PS_MAX_BINT) erros.push('Bruto com furo: no máximo ' + PS_MAX_BINT + ' diâmetros internos.');
        var bTot = 0;
        f.brutoInt.forEach(function (it, k) {
          var d = psN(it.a), L = psN(it.b), P0 = 'bruto com furo, linha ' + (k + 1) + ': ';
          if (!(d > 0) || !(L > 0)) { erros.push(P0 + 'informe Ø e comprimento maiores que zero.'); return; }
          if (d > n.dBruto - 1) erros.push(P0 + 'o Ø interno (' + fmt(d) + ') não deixa parede no bloco (Ø' + fmt(n.dBruto) + ').');
          bTot += L;
          bPieces.push({ d: d, L: L, vd: '#' + (PS_BVAR0 + 2 * k), vL: '#' + (PS_BVAR0 + 2 * k + 1) });
        });
        if (bTot > n.lBruto + EPS) erros.push('Bruto com furo: os comprimentos somam ' + fmt(bTot) + ', mais que o comprimento do bloco (' + fmt(n.lBruto) + ').');
        if (erros.length) return { erros: erros, avisos: avisos };
      }
      var mt = metaPadrao(meta, PECA_SIMPLES, f), base = nomeArquivo(mt.nome);
      var mk = function (nome) { return { nome: nome, autor: mt.autor, data: mt.data, maq: meta && meta.maq }; };
      var bi1 = function (lado, zOpp) { return bPieces.length ? { pieces: bPieces, desdeAqui: bLado === lado, zOpp: zOpp } : null; };
      if (!dois) {
        var r = psLado({ nome: base, ext: f.usin1 !== 'int', int: f.usin1 !== 'ext', lista: f.trechos1, brutoInt: bi1('1', -n.lPeca), internos: f.internos1, sentE: f.sentE1, sentI: f.sentI1, dBruto: n.dBruto, lBruto: n.lBruto, lPeca: n.lPeca, grip: n.grip1, pressao: f.pressao, rot: '', tools: tools, meta: mk(base) });
        if (r.erros && r.erros.length) return { erros: r.erros, avisos: r.avisos || [] };
        delete r._geo;
        return r;
      }
      var sobre2 = n.lBruto - n.lPeca - n.sobre1;
      if (sobre2 < -EPS) return { erros: ['Comprimento bruto (' + fmt(n.lBruto) + ') menor que o comprimento final + sobremetal do lado 1 (' + fmt(n.lPeca + n.sobre1) + ').'], avisos: avisos };
      var lPecaL1 = n.lBruto - n.sobre1;
      var r1 = psLado({ nome: base + '.LADO.01', ext: f.usin1 !== 'int', int: f.usin1 !== 'ext', lista: f.trechos1, brutoInt: bi1('1', -lPecaL1), internos: f.internos1, sentE: f.sentE1, sentI: f.sentI1, dBruto: n.dBruto, lBruto: n.lBruto, lPeca: lPecaL1, grip: n.grip1, pressao: f.pressao, rot: 'Lado 1: ', duplo: true, tools: tools, meta: mk(base + '.LADO.01') });
      if (r1.erros && r1.erros.length) return { erros: r1.erros, avisos: r1.avisos || [] };
      // o lado 1 visto da outra face: contorno ate o fundo do bloco (lPecaL1 = peca + sobremetal do lado 2)
      var geo = r1._geo;
      var r2 = psLado({ nome: base + '.LADO.02', ext: f.usin2 !== 'int', int: f.usin2 !== 'ext', lista: f.trechos2, brutoInt: bi1('2', -(n.lPeca + n.sobre1)), internos: f.internos2, sentE: f.sentE2, sentI: f.sentI2, dBruto: n.dBruto, lBruto: n.lBruto - n.sobre1, lPeca: n.lPeca, grip: n.grip2, pressao: f.pressao, rot: 'Lado 2: ', duplo: true, tools: tools, meta: mk(base + '.LADO.02'),
        outro: { pts: geo.pts.concat([]), zEnd: geo.zEnd, cav: geo.cav } });
      if (r2.erros && r2.erros.length) return { erros: r2.erros, avisos: (r1.avisos || []).concat(r2.avisos || []) };
      var z2 = r2._geo.zEnd, gap = n.lPeca - geo.zEnd - z2;
      if (gap < -EPS && !f.permiteSobrepor) return { erros: ['Os trechos dos dois lados se sobrepõem: lado 1 usina ' + fmt(geo.zEnd) + ' mm, lado 2 usina ' + fmt(z2) + ' mm e a peça tem só ' + fmt(n.lPeca) + ' mm.'], avisos: avisos };
      avisos = (r1.avisos || []).concat(r2.avisos || []);
      if (gap < -EPS) avisos.push('Os dois lados usinam a mesma região por ' + fmt(-gap) + ' mm (peça fina): o lado 2 trabalha dentro do que o lado 1 já tornou. Confira o perfil.');
      if (gap > EPS && f.usin1 !== 'int' && f.usin2 !== 'int') avisos.push('Faixa central de ' + fmt(gap) + ' mm fica no Ø bruto (' + fmt(n.dBruto) + '): nenhum dos lados usina essa região.');
      // fixacao no lado 2: o trecho preso deve ser cilindrico
      var rr = []; for (var s = 0; s <= 10; s++) rr.push(psRaioEm(geo.pts.concat([[-geo.zEnd, n.dBruto / 2], [-n.lPeca, n.dBruto / 2]]), n.grip2 * s / 10));
      if (Math.max.apply(null, rr) - Math.min.apply(null, rr) > 0.01) avisos.push('O lado 2 prende ' + fmt(n.grip2) + ' mm na placa sobre um trecho do lado 1 que não é um cilindro único: confira a fixação.');
      delete r1._geo; delete r2._geo;
      var intro1 = 'LADO 1 (primeira operação): o bloco é preso pelo lado oposto, ainda bruto. Faceia (sobremetal ' + fmt(n.sobre1) + ' mm) e usina os trechos do lado 1 até ' + fmt(geo.zEnd) + ' mm da face.';
      var intro2 = 'LADO 2 (segunda operação): vire a peça e prenda pelo lado 1 já usinado. Faceia o sobremetal restante (' + fmt(sobre2) + ' mm) e usina os trechos do lado 2 até ' + fmt(z2) + ' mm da face; o bruto da simulação já traz o perfil feito no lado 1.';
      return { erros: [], avisos: avisos, lados: [
        Object.assign({}, r1, { id: 'l1', titulo: 'Lado 1', estrategia: [intro1].concat(r1.estrategia) }),
        Object.assign({}, r2, { id: 'l2', titulo: 'Lado 2', estrategia: [intro2].concat(r2.estrategia) })
      ] };
    }
  };

  /* ---------- gerador: PORTA-MATRIZ ----------
     PORTA.MATRIZ.txt (externo: faceamento + perfil G71 com trecho em angulo, encaixe, raio e diametro apos o encaixe) e
     PORTA.MATRIZ.INTERNO.txt (mandrilamento com raio na boca, partindo do furo que o bloco ja tem).
     Monta a lista de trechos e usa o mesmo motor da peca simples (G71 + G70). O comprimento do angulo segue a formula do programa da casa:
     Z = FUP[TAN[angulo] * (Ø fim - Ø inicio)] (arredondado para cima, em mm). */
  function psBase() {
    var b = {}; PECA_SIMPLES.campos.forEach(function (c) { b[c.id] = c.tipo === 'trechos' ? JSON.parse(JSON.stringify(c.def)) : c.tipo === 'select' ? String(c.def) : Number(c.def); });
    return b;
  }
  function usinDe(ext, int) { return ext && int ? 'ambos' : int ? 'int' : 'ext'; }
  var TIPO_L_OPC = [['raio', 'Raio (G2/G3, como no PORTA.MATRIZ.INTERNO)'], ['chanfro', 'Chanfro a 45°']];
  var PORTA_MATRIZ = {
    id: 'porta_matriz',
    titulo: 'Porta-matriz (2 lados)',
    refPrograma: 'PORTA.MATRIZ.txt (lado 1) + PORTA.MATRIZ.INTERNO.txt (lado 2)',
    preview: true,
    desenho: 'porta_matriz',   // esquema com as letras do croqui (app.js, DESENHOS.porta_matriz)
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo (G71 e G70)', tipos: ['externa', 'faceamento'] },
      { id: 't4', papel: 'Barra de mandrilamento interno', tipos: ['interna'] }
    ],
    campos: [
      { grupo: 'Desenho', id: 'lPeca', letra: 'A', label: 'Comprimento final da peça', unit: 'mm', def: 158, pos: [171, 292], hint: 'Do Z0 do lado 1 (cone) ao Z0 do lado 2 (face do furo Ø D)' },
      { grupo: 'Desenho', id: 'lInt', letra: 'B', label: 'Comprimento do furo Ø D', unit: 'mm', def: 150, pos: [182, 190], hint: 'Profundidade do mandrilamento, a partir da face do lado 2' },
      { grupo: 'Desenho', id: 'dFuro', letra: 'C', label: 'Ø do furo que o bloco já tem', unit: 'mm', def: 190, pos: [46, 216], hint: 'Furo passante do bloco (Ø C); o mandrilamento parte dele' },
      { grupo: 'Desenho', id: 'dInt', letra: 'D', label: 'Ø do furo maior', unit: 'mm', def: 200, pos: [182, 122], hint: 'Ø final do mandrilamento no lado 2' },
      { grupo: 'Desenho', id: 'd3', letra: 'E', label: 'Ø do corpo', unit: 'mm', def: 308.5, pos: [302, 160], hint: 'Ø externo maior, depois do rebaixo' },
      { grupo: 'Desenho', id: 'lEnc', letra: 'F', label: 'Comprimento do rebaixo', unit: 'mm', def: 64, pos: [130, 18], hint: 'Da face do cone (Z0 do lado 1) até o degrau; inclui o trecho em ângulo' },
      { grupo: 'Desenho', id: 'rEnc', letra: 'G', label: 'Raio externo do degrau', unit: 'mm', def: 2, pos: [214, 22], hint: 'Raio na quina entre o Ø do corpo (E) e o rebaixo (0 = sem raio)' },
      { grupo: 'Desenho', id: 'cExt', letra: 'H', label: 'Chanfro externo da face', unit: 'mm', def: 2, pos: [298, 28], hint: 'Chanfro a 45° na quina externa da face do lado 2 (0 = sem chanfro)' },
      { grupo: 'Desenho', id: 'ang', letra: 'I', label: 'Ângulo do cone', unit: '°', def: 10, pos: [46, 20], hint: 'Fórmula da casa: comprimento do ângulo em Z = TAN(ângulo) × (Ø M − Ø K), arredondado para cima' },
      { grupo: 'Desenho', id: 'd2', letra: 'M', label: 'Ø do rebaixo', unit: 'mm', def: 293, pos: [46, 62], hint: 'Ø do rebaixo (fim do ângulo e do encaixe)' },
      { grupo: 'Desenho', id: 'd1', letra: 'K', label: 'Ø na face do cone', unit: 'mm', def: 259, pos: [46, 104], hint: 'Diâmetro na face (Z0 do lado 1), onde começa o ângulo' },
      { grupo: 'Desenho', id: 'rBoca', letra: 'L', label: 'Borda do furo (raio ou chanfro)', unit: 'mm', def: 3, pos: [182, 156], hint: 'Na boca do furo Ø D (lado 2) e na entrada do furo Ø C (lado 1); 0 = sem' },
      { grupo: 'Bloco bruto', id: 'dBruto', label: 'Ø bruto', unit: 'mm', def: 315, hint: 'Diâmetro do bloco bruto (já com sobremetal)' },
      { grupo: 'Bloco bruto', id: 'lBruto', label: 'Comprimento bruto', unit: 'mm', def: 160, hint: 'Comprimento total do bloco' },
      { grupo: 'Bloco bruto', id: 'sobre1', label: 'Sobremetal em Z no lado 1', unit: 'mm', def: 1, hint: 'O que o lado 1 faceia; o resto do sobremetal (bruto − A − este valor) fica para o lado 2' },
      { grupo: 'Divisão entre os lados', id: 'lUsin1', label: 'Até onde o lado 1 torneia o Ø E', unit: 'mm', def: 70, hint: 'Da face do cone, igual ao "comprimento final após o encaixe" do PORTA.MATRIZ; o lado 2 torneia o resto (A − este valor) a partir da outra face' },
      { grupo: 'Divisão entre os lados', id: 'tipoL', tipo: 'select', label: 'Borda do furo (L)', def: 'raio', opcoes: TIPO_L_OPC, hint: 'O PORTA.MATRIZ.INTERNO da casa usa raio na boca; o croqui mostra chanfro' },
      { grupo: 'Sentido do desbaste', id: 'sentE', tipo: 'select', label: 'Perfil externo (os 2 lados)', def: 'long', opcoes: SENT_OPC },
      { grupo: 'Sentido do desbaste', id: 'sentI', tipo: 'select', label: 'Mandrilamento interno', def: 'long', opcoes: SENT_OPC }
    ].concat(camposFixacao('', '1', '· lado 1'), camposFixacao('', '2', '· lado 2')),
    nomeAuto: function (f) { return 'PORTA.MATRIZ.D' + fmt(f.dBruto); },
    derivados: function () { return []; },
    gerar: function (f, tools, meta) {
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dBruto', 'lBruto', 'sobre1', 'lPeca', 'd1', 'ang', 'd2', 'lEnc', 'rEnc', 'd3', 'cExt', 'lUsin1', 'dFuro', 'dInt', 'lInt', 'rBoca', 'grip1', 'grip2']);
      var Lz = 0;
      if (!(n.dBruto > 0)) erros.push('Informe o Ø bruto.');
      if (!(n.lBruto > 0)) erros.push('Informe o comprimento bruto.');
      if (!(n.lPeca > 0)) erros.push('Informe o comprimento final da peça (A).');
      if (!(n.sobre1 >= 0)) erros.push('Sobremetal do lado 1 inválido.');
      if (!erros.length && n.lBruto < n.lPeca + n.sobre1 - 1e-9) erros.push('Comprimento bruto (' + fmt(n.lBruto) + ') menor que o comprimento final (A) + sobremetal do lado 1 (' + fmt(n.lPeca + n.sobre1) + ').');
      if (!erros.length) {
        if (!(n.d1 > 0) || !(n.d2 > 0) || !(n.d3 > 0)) erros.push('Informe os três diâmetros externos: Ø K (face do cone), Ø M (rebaixo) e Ø E (corpo).');
        else if (!(n.ang > 0 && n.ang < 90)) erros.push('O ângulo (I) precisa estar entre 0 e 90 graus.');
        else if (!(n.d2 > n.d1)) erros.push('O Ø do rebaixo M (' + fmt(n.d2) + ') precisa ser maior que o Ø K na face do cone (' + fmt(n.d1) + ').');
        else if (n.d3 < n.d2) erros.push('O Ø do corpo E (' + fmt(n.d3) + ') não pode ser menor que o Ø do rebaixo M (' + fmt(n.d2) + '): o G71 só faz diâmetro que não diminui para o fundo.');
        else {
          Lz = Math.ceil(Math.tan(n.ang * Math.PI / 180) * (n.d2 - n.d1) - 1e-9);
          if (!(n.lEnc > Lz)) erros.push('O comprimento do ângulo (' + fmt(Lz) + ' mm = TAN ' + fmt(n.ang) + '° × ' + fmt(n.d2 - n.d1) + ', para cima) não cabe no comprimento do rebaixo F (' + fmt(n.lEnc) + ').');
          if (!(n.rEnc >= 0)) erros.push('O raio G não pode ser negativo.');
          else if (!(n.lUsin1 >= n.lEnc + n.rEnc)) erros.push('O quanto o lado 1 torneia o Ø E (' + fmt(n.lUsin1) + ') precisa ser pelo menos F + raio G (' + fmt(n.lEnc + n.rEnc) + ').');
          if (n.d3 === n.d2 && n.rEnc > 0) erros.push('Sem degrau entre o rebaixo M e o corpo E (diâmetros iguais): use raio G = 0.');
          if (!(n.cExt >= 0)) erros.push('O chanfro H não pode ser negativo.');
          if (!(n.lUsin1 < n.lPeca)) erros.push('O lado 1 torneia ' + fmt(n.lUsin1) + ' mm, que não deixa nada para o lado 2: precisa ser menor que A (' + fmt(n.lPeca) + ').');
        }
      }
      if (!erros.length) {
        if (!(n.dFuro > 0) || !(n.dInt > 0) || !(n.lInt > 0)) erros.push('Informe Ø C (furo do bloco), Ø D e B (comprimento do furo D).');
        else if (!(n.dInt >= n.dFuro)) erros.push('O Ø D (' + fmt(n.dInt) + ') não pode ser menor que o furo que o bloco já tem, Ø C (' + fmt(n.dFuro) + ').');
        else if (!(n.rBoca >= 0)) erros.push('A borda do furo (L) não pode ser negativa.');
        else if (n.lInt > n.lPeca + 1e-9) erros.push('O furo Ø D (B = ' + fmt(n.lInt) + ' mm) passa do comprimento final da peça (A = ' + fmt(n.lPeca) + ' mm).');
      }
      if (erros.length) return { erros: erros, avisos: avisos };
      var raioL = f.tipoL !== 'chanfro', lBruto = n.lBruto, len2 = n.lPeca - n.lUsin1;
      var f2 = psBase();
      Object.assign(f2, { dBruto: n.dBruto, lBruto: lBruto, lPeca: n.lPeca, lados: '2', sobre1: n.sobre1, usin1: 'ambos', usin2: 'ambos', sentE1: f.sentE || 'long', sentE2: f.sentE || 'long', sentI1: f.sentI || 'long', sentI2: f.sentI || 'long', grip1: n.grip1, grip2: n.grip2, pressao: f.pressao, brutoIntLado: '1',
        brutoInt: [{ tipo: 'bcil', a: n.dFuro, b: lBruto }] });
      // lado 1 (PORTA.MATRIZ): cone K -> M, rebaixo M ate F, Ø E (raio G na quina do degrau) ate lUsin1; borda L na entrada do furo C
      f2.trechos1 = [{ id: 'pm1', tipo: 'cone', a: n.d1, b: n.d2, c: Lz }, { id: 'pm2', tipo: 'cil', a: n.d2, b: n.lEnc - Lz }, { id: 'pm3', tipo: 'cil', a: n.d3, b: n.lUsin1 - n.lEnc }];
      if (n.rEnc > 0) f2.trechos1.push({ tipo: 'raio', a: n.rEnc, alvo: 'pm3', onde: 'ini' });
      f2.internos1 = [];
      if (n.rBoca > 0) f2.internos1 = [{ id: 'pc1', tipo: 'icil', a: n.dFuro, b: n.rBoca + 1 }, { tipo: raioL ? 'iraio' : 'ichanfro', a: n.rBoca, alvo: 'pc1', onde: 'ini' }];
      else f2.usin1 = 'ext';
      // lado 2 (PORTA.MATRIZ.INTERNO): Ø E ate encontrar o lado 1 com chanfro H na quina da face; furo Ø D por B com borda L na boca
      f2.trechos2 = [{ id: 'pm4', tipo: 'cil', a: n.d3, b: len2 }];
      if (n.cExt > 0) f2.trechos2.push({ tipo: 'chanfro', a: n.cExt, alvo: 'pm4', onde: 'ini' });
      f2.internos2 = [{ id: 'pi1', tipo: 'icil', a: n.dInt, b: n.lInt }];
      if (n.rBoca > 0) f2.internos2.push({ tipo: raioL ? 'iraio' : 'ichanfro', a: n.rBoca, alvo: 'pi1', onde: 'ini' });
      var r = PECA_SIMPLES.gerar(f2, tools, meta);
      if (r.erros && r.erros.length) return r;
      var bd = n.rBoca > 0 ? (raioL ? 'raio R' : 'chanfro C') + fmt(n.rBoca) : '';
      var i1 = 'LADO 1 (PORTA.MATRIZ): faceia (sobremetal ' + fmt(n.sobre1) + ' mm) e torneia o cone Ø' + fmt(n.d1) + ' → Ø' + fmt(n.d2) + ' (ângulo ' + fmt(n.ang) + '°, ' + fmt(Lz) + ' mm de Z = FUP[TAN × ' + fmt(n.d2 - n.d1) + ']), o rebaixo Ø' + fmt(n.d2) + ' até Z' + fmt(n.lEnc) + (n.rEnc > 0 ? ', raio R' + fmt(n.rEnc) + ' no degrau' : '') + ' e o Ø' + fmt(n.d3) + ' até Z' + fmt(n.lUsin1) + '.' + (bd ? ' A entrada do furo Ø' + fmt(n.dFuro) + ' recebe ' + bd + '.' : '');
      var i2 = 'LADO 2 (PORTA.MATRIZ.INTERNO): vire a peça. Torneia o Ø' + fmt(n.d3) + ' por ' + fmt(len2) + ' mm (até encontrar o lado 1)' + (n.cExt > 0 ? ' com chanfro C' + fmt(n.cExt) + ' na quina da face' : '') + ' e manda o furo Ø' + fmt(n.dInt) + ' por ' + fmt(n.lInt) + ' mm a partir do furo Ø' + fmt(n.dFuro) + ' que o bloco já traz' + (bd ? ', com ' + bd + ' na boca' : '') + '. O programa usa o mesmo motor da peça simples (G71 + G70).';
      r.lados[0].estrategia = [i1].concat(r.lados[0].estrategia); r.lados[1].estrategia = [i2].concat(r.lados[1].estrategia);
      return r;
    }
  };  /* ---------- gerador: ALIMENTADOR PADRAO (2 lados) ----------
     LADO.01.EXT.E.CONE.txt: faceamento, Ø externo ate o comprimento de usinagem, raio na face e cone interno (G71 interno) a partir do furo que o bloco ja tem.
     LADO.02.ENCAIXE.txt (= ENCAIXE.ESPINA.E.ALIMENTADOR): faceamento, Ø externo, encaixe (menor Ø) com raio na face e raio no ombro.
     Monta as listas de trechos dos 2 lados e usa o motor da peca simples (G71 + G70). O Ø maior do cone interno vem do angulo:
     Ø maior = Ø menor + 2 × TAN[angulo] × espessura (15 graus e 25 mm de espessura dao os 153,397 do exemplo). */
  var ALIMENTADOR = {
    id: 'alimentador',
    titulo: 'Alimentador padrão (2 lados)',
    refPrograma: 'LADO.01.EXT.E.CONE.txt + LADO.02.ENCAIXE.txt',
    preview: true,
    ferramentas: [
      { id: 't1', papel: 'Faceamento / torneamento externo (G71 e G70)', tipos: ['externa', 'faceamento'] },
      { id: 't4', papel: 'Barra de mandrilamento interno (cone do lado 1)', tipos: ['interna'] }
    ],
    campos: [
      { grupo: 'Bloco bruto', id: 'dExt', label: 'Ø externo final (nominal)', unit: 'mm', def: 200, hint: 'Cota do desenho' },
      { grupo: 'Bloco bruto', id: 'sobreD', label: 'Sobremetal no Ø', unit: 'mm', def: 2, hint: 'Ø bruto = Ø externo + este valor' },
      { grupo: 'Bloco bruto', id: 'dFuro', label: 'Ø do furo que o bloco já tem', unit: 'mm', def: 138, hint: 'O furo passa de ponta a ponta. No exemplo da casa o mandrilamento parte de Ø138 (Ø interno menor − 2).' },
      { grupo: 'Bloco bruto', id: 'sobre1', label: 'Sobremetal em Z no lado 1', unit: 'mm', def: 0 },
      { grupo: 'Bloco bruto', id: 'sobre2', label: 'Sobremetal em Z no lado 2', unit: 'mm', def: 3.5 },
      { grupo: 'Peça', id: 'espessura', label: 'Espessura da peça', unit: 'mm', def: 25, hint: 'Comprimento final (Z0 do lado 1 até o Z0 do lado 2)' },
      { grupo: 'Peça', id: 'dInt', label: 'Ø interno menor', unit: 'mm', def: 140, hint: 'Ø do furo no fundo do cone (lado 2 da peça)' },
      { grupo: 'Peça', id: 'angCone', label: 'Ângulo do cone interno', unit: '°', def: 15, hint: 'Ø maior do cone (na face do lado 1) = Ø interno menor + 2 × TAN(ângulo) × espessura' },
      { grupo: 'Peça', avancado: 'Raios e folgas', id: 'folga', label: 'Folga no Ø externo', unit: 'mm', def: 0.3, hint: 'Padrão da casa: 0,3 mm abaixo do nominal' },
      { grupo: 'Lado 1 · externo e cone', id: 'lUsin1', label: 'Comprimento da usinagem em Z', unit: 'mm', def: 14, hint: 'Quanto o Ø externo é torneado a partir da face do lado 1' },
      { grupo: 'Lado 1 · externo e cone', avancado: 'Raios e folgas', id: 'rFace1', label: 'Raio da face (lado 1)', unit: 'mm', def: 3 },
      { grupo: 'Lado 2 · encaixe', id: 'lEnc', label: 'Comprimento do encaixe', unit: 'mm', def: 10.1, hint: 'Trecho reto do encaixe, a partir da face do lado 2' },
      { grupo: 'Lado 2 · encaixe', id: 'hEnc', label: 'Redução no Ø do encaixe', unit: 'mm', def: 8, hint: 'Ø do encaixe = Ø externo final − este valor' },
      { grupo: 'Lado 2 · encaixe', id: 'lUsin2', label: 'Comprimento da usinagem em Z', unit: 'mm', def: 15, hint: 'Ø externo torneado a partir da face do lado 2 (precisa passar do encaixe + raio do ombro)' },
      { grupo: 'Lado 2 · encaixe', avancado: 'Raios e folgas', id: 'rFace2', label: 'Raio da face do encaixe', unit: 'mm', def: 3 },
      { grupo: 'Lado 2 · encaixe', avancado: 'Raios e folgas', id: 'rEnc', label: 'Raio do ombro do encaixe', unit: 'mm', def: 3, hint: 'O raio entra depois do trecho reto do encaixe (como no programa da casa)' },
      { grupo: 'Sentido do desbaste', id: 'sentE', tipo: 'select', label: 'Perfil externo (os 2 lados)', def: 'long', opcoes: SENT_OPC },
      { grupo: 'Sentido do desbaste', id: 'sentI', tipo: 'select', label: 'Cone interno · lado 1', def: 'long', opcoes: SENT_OPC }
    ].concat(camposFixacao('', '1', '· lado 1').concat(camposFixacao('', '2', '· lado 2')).map(function (c) { return Object.assign({}, c, { def: c.id === 'grip2' ? 8 : 10, hint: 'Peça fina (' + 'espessura + sobremetais): preso curto para a usinagem do lado caber fora da placa. ' + (c.hint || '') }); })),
    nomeAuto: function (f) { return 'ALIMENTADOR.D' + fmt(f.dExt); },
    derivados: function () { return []; },
    gerar: function (f, tools, meta) {
      var erros = [], avisos = [];
      var n = lerCampos(f, ['dExt', 'sobreD', 'dFuro', 'sobre1', 'sobre2', 'espessura', 'dInt', 'angCone', 'folga', 'lUsin1', 'rFace1', 'lEnc', 'hEnc', 'lUsin2', 'rFace2', 'rEnc', 'grip1', 'grip2']);
      ['dExt', 'dFuro', 'espessura', 'dInt', 'lUsin1', 'lEnc', 'hEnc', 'lUsin2'].forEach(function (k) { if (!(n[k] > 0)) erros.push('Informe um valor maior que zero em ' + ({ dExt: 'Ø externo final', dFuro: 'Ø do furo que o bloco já tem', espessura: 'espessura da peça', dInt: 'Ø interno menor', lUsin1: 'comprimento da usinagem do lado 1', lEnc: 'comprimento do encaixe', hEnc: 'redução no Ø do encaixe', lUsin2: 'comprimento da usinagem do lado 2' }[k]) + '.'); });
      ['sobreD', 'sobre1', 'sobre2', 'folga', 'rFace1', 'rFace2', 'rEnc'].forEach(function (k) { if (!(n[k] >= 0)) erros.push('Valor inválido (não pode ser negativo): ' + ({ sobreD: 'sobremetal no Ø', sobre1: 'sobremetal em Z do lado 1', sobre2: 'sobremetal em Z do lado 2', folga: 'folga no Ø', rFace1: 'raio da face do lado 1', rFace2: 'raio da face do encaixe', rEnc: 'raio do ombro do encaixe' }[k]) + '.'); });
      if (!(n.angCone > 0 && n.angCone < 90)) erros.push('O ângulo do cone interno precisa estar entre 0 e 90 graus.');
      if (erros.length) return { erros: erros, avisos: avisos };
      var dUs = n.dExt - n.folga, dEnc = n.dExt - n.hEnc, dMaior = n.dInt + 2 * Math.tan(n.angCone * Math.PI / 180) * n.espessura;
      var lEncT = n.lEnc + n.rEnc, lBruto = n.espessura + n.sobre1 + n.sobre2;
      if (!(dFuroOk(n))) erros.push('O furo que o bloco já tem (Ø' + fmt(n.dFuro) + ') não pode ser maior que o Ø interno menor (Ø' + fmt(n.dInt) + ').');
      if (!(n.lUsin2 > lEncT)) erros.push('O comprimento da usinagem do lado 2 (' + fmt(n.lUsin2) + ') precisa passar do encaixe + raio do ombro (' + fmt(lEncT) + ').');
      if (!(dEnc > n.dInt)) erros.push('O Ø do encaixe (' + fmt(dEnc) + ') precisa ser maior que o Ø interno menor (' + fmt(n.dInt) + ').');
      if (erros.length) return { erros: erros, avisos: avisos };
      var f2 = psBase();
      Object.assign(f2, { permiteSobrepor: true, dBruto: n.dExt + n.sobreD, lBruto: lBruto, lPeca: n.espessura, lados: '2', sobre1: n.sobre1, usin1: 'ambos', usin2: 'ext', sentE1: f.sentE || 'long', sentE2: f.sentE || 'long', sentI1: f.sentI || 'long', grip1: n.grip1, grip2: n.grip2, pressao: f.pressao, brutoIntLado: '1',
        brutoInt: [{ tipo: 'bcil', a: n.dFuro, b: lBruto }] });
      f2.trechos1 = [{ id: 'al1', tipo: 'cil', a: dUs, b: n.lUsin1 }];
      if (n.rFace1 > 0) f2.trechos1.push({ tipo: 'raio', a: n.rFace1, alvo: 'al1', onde: 'ini' });
      f2.internos1 = [{ id: 'ai1', tipo: 'icone', a: dMaior, b: n.dInt, c: n.espessura }];
      f2.trechos2 = [{ id: 'al2', tipo: 'cil', a: dEnc, b: lEncT }, { id: 'al3', tipo: 'cil', a: dUs, b: n.lUsin2 - lEncT }];
      if (n.rFace2 > 0) f2.trechos2.push({ tipo: 'raio', a: n.rFace2, alvo: 'al2', onde: 'ini' });
      if (n.rEnc > 0) f2.trechos2.push({ tipo: 'raio', a: n.rEnc, alvo: 'al2', onde: 'fim' });
      f2.internos2 = [];
      var r = PECA_SIMPLES.gerar(f2, tools, meta);
      if (r.erros && r.erros.length) return r;
      var i1 = 'LADO 1: faceia, torneia o Ø' + fmt(dUs) + ' por ' + fmt(n.lUsin1) + ' mm' + (n.rFace1 > 0 ? ' com raio R' + fmt(n.rFace1) + ' na face' : '') + ' e manda o cone interno (Ø' + fmt(dMaior) + ' → Ø' + fmt(n.dInt) + ' em ' + fmt(n.espessura) + ' mm; Ø maior = Ø' + fmt(n.dInt) + ' + 2 × TAN ' + fmt(n.angCone) + '° × ' + fmt(n.espessura) + ') a partir do furo Ø' + fmt(n.dFuro) + ' que o bloco já traz.';
      var i2 = 'LADO 2 (encaixe): vire a peça. Faceia e torneia o Ø' + fmt(dUs) + ' por ' + fmt(n.lUsin2) + ' mm, com encaixe Ø' + fmt(dEnc) + ' reto por ' + fmt(n.lEnc) + ' mm' + (n.rFace2 > 0 ? ', raio R' + fmt(n.rFace2) + ' na face' : '') + (n.rEnc > 0 ? ' e raio R' + fmt(n.rEnc) + ' no ombro (depois do trecho reto)' : '') + '. O programa usa o motor da peça simples (G71 + G70).';
      r.lados[0].estrategia = [i1].concat(r.lados[0].estrategia); r.lados[1].estrategia = [i2].concat(r.lados[1].estrategia);
      return r;
    }
  };
  function dFuroOk(n) { return n.dFuro <= n.dInt + EPS; }
  /* ---------- gerador: BA / BAT ----------
     BA.E.BAT.txt tem a mesma estrutura da matriz solida (faceamento G75, torneamento G74 ate o comprimento de usinagem e raio de quina G3);
     muda so o padrao da casa: folga de 0,3 mm no Ø final. Reaproveita o gerador da matriz solida. */
  var BA_PADRAO = { dBruto: 229, lBruto: 53, dFinal: 225, lPeca: 50, lUsin: 14, raio: 3, folga: 0.3 };
  var BA_BAT = Object.assign({}, MATRIZ_SOLIDA, {
    id: 'ba_bat',
    titulo: 'BA / BAT',
    refPrograma: 'BA.E.BAT.txt',
    campos: MATRIZ_SOLIDA.campos.map(function (c) {
      var o = Object.assign({}, c);
      if (BA_PADRAO[c.id] !== undefined) o.def = BA_PADRAO[c.id];
      if (c.id === 'folga') o.hint = 'BA/BAT: 0,3 mm menor que o nominal (padrão da casa)';
      return o;
    }),
    nomeAuto: function (f) { return 'BA.D' + fmt(f.dFinal); },
    gerar: function (f, tools, meta) {
      var m = Object.assign({}, meta, { rotFolga: 'BA E BAT 0.3MM' });
      if (!m.nome) m.nome = BA_BAT.nomeAuto(f);
      return MATRIZ_SOLIDA.gerar(f, tools, m);
    }
  });

  var GERADORES = { matriz_solida: MATRIZ_SOLIDA, ba_bat: BA_BAT, matriz_tubular: MATRIZ_TUBULAR, porta_matriz: PORTA_MATRIZ, alimentador: ALIMENTADOR, espina: ESPINA, peca_simples: PECA_SIMPLES };
  // geradores de um lado so (usados pela espina; acessiveis para teste)
  var INTERNOS = { espina_cabeca: ESPINA_CABECA, espina_encaixe: ESPINA_ENCAIXE };

  // geometrias planejadas (aparecem desabilitadas na interface)
  var PLANEJADOS = [
  ];

  return { psCantos: psCantos, psCantosInt: psCantosInt, psMigra: psMigra, psRoscaD1: psRoscaD1, fmt: fmt, ascii: ascii, tcode: tcode, nomeArquivo: nomeArquivo, mesAno: mesAno, DEFAULT_MAQ: DEFAULT_MAQ, GERADORES: GERADORES, INTERNOS: INTERNOS, PLANEJADOS: PLANEJADOS };
});


