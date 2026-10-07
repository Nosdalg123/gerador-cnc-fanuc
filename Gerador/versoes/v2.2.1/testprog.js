/* Testes do modulo Simulacao (progsim.js): leitor de programa pronto. Chamado no fim do test.js (ou: node testprog.js). */
const fs = require('fs'), path = require('path');
const C = require('./core.js'), S = require('./sim.js'), P = require('./progsim.js');
let total = 0, falhas = 0;
function ok(cond, nome, extra) { total++; if (!cond) { falhas++; console.log('  FALHOU', nome, extra === undefined ? '' : extra); } else if (process.argv.includes('-v')) console.log('  ok', nome); }
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);
const MAQ = C.DEFAULT_MAQ;
const run = (txt, maq) => P.interpretar(txt, { maq: maq || MAQ });
const fim = (R) => R.moves[R.moves.length - 1];
// estado de uma celula (z, r) no fim da simulacao: 1 = ainda tem material
function sobra(sim, z, r) { const i = Math.floor((z - sim.zlo) / sim.cs), j = Math.floor((r - sim.rlo) / sim.cs); return sim.mat[j * sim.nz + i]; }
function simula(R, cfg) { const cena = P.montarCena(R, Object.assign({ maq: MAQ }, cfg || {})); const sim = new S.Sim(cena); const a = sim.analyze(); sim.seek(sim.total); return { sim, a, cena }; }

console.log('\n#### MODULO SIMULACAO (leitor de programa)');

/* ---- macros, expressoes e fluxo ---- */
{
  const R = run('#1=10\n#2=#1*2+[#1-4]/2\n#3=SQRT[16]+ABS[-3]\n#4=ROUND[2.5]+FIX[-1.5]+FUP[1.2]\nG0X#2Z#3\nX[#4*10]\nM30');
  ok(R.erros.length === 0, 'macros: sem erro', R.erros);
  ok(R.moves.length === 2 && near(R.moves[0].x, 23) && near(R.moves[0].z, 7), 'macros: #2=23 e #3=7', R.moves.map(m => [m.x, m.z]));
  ok(near(fim(R).x, 30), 'macros: ROUND[2.5]+FIX[-1.5]+FUP[1.2] = 3-2+2 = 3 -> X30', fim(R) && fim(R).x);
}
{
  const R = run('#1=5\nIF[#1GT3]GOTO20\nG0X100Z100\nN20G0X50Z50\nM30');
  ok(R.moves.length === 1 && near(R.moves[0].x, 50) && near(R.moves[0].z, 50), 'IF[..]GOTO pula o bloco', R.moves);
  const R2 = run('#1=1\nIF[#1GT3]GOTO20\nG0X100Z100\nN20G0X50Z50\nM30');
  ok(R2.moves.length === 2, 'IF falso nao desvia');
  const R3 = run('G0X10Z0\nGOTO9\nG0X99\nN9G0X20\nM30');
  ok(R3.moves.length === 2 && near(fim(R3).x, 20), 'GOTO direto');
  const R4 = run('G0X10\nGOTO77\nM30');
  ok(R4.erros.length === 1 && /N77/.test(R4.erros[0].texto), 'GOTO sem rotulo = erro com a linha', R4.erros);
}
{
  const R = run('#1=0\nWHILE[#1LT3]DO1\n#1=#1+1\nG0X[100+#1]Z0\nEND1\nM30');
  ok(R.moves.length === 3 && near(fim(R).x, 103), 'WHILE/DO/END (3 voltas)', R.moves.map(m => m.x));
  const R2 = run('#1=0\nWHILE[#1LT1]DO1\nG0X10\nEND1\nM30');
  ok(R2.erros.length === 1 && /laço/.test(R2.erros[0].texto), 'laco sem fim para com erro', R2.erros);
}
{
  const R = run('G0X10Z0\nM98P100L2\nG0X50\nM30\nO100\nG0W-1\nM99');
  ok(R.moves.length === 4 && near(R.moves[2].z, -2) && near(fim(R).x, 50), 'M98 P L2 (subprograma 2 vezes) e volta', R.moves.map(m => [m.x, m.z]));
  const R2 = run('G0X10\nM98P555\nM30');
  ok(R2.erros.length === 1, 'M98 sem subprograma = erro');
}
{
  const R = run('G0X10 Z5 (COMENTARIO (ANINHADO))\n/G0X20\n( SO COMENTARIO )\ng1x30z1f.1;fim\nM30');
  ok(R.moves.length === 3 && near(fim(R).x, 30) && near(fim(R).z, 1), 'comentarios, minusculas, "/" e ";"', R.moves.map(m => [m.x, m.z]));
}
{
  const R = run('G0X100Z10\nG91\nG1X-4Z-2F.1\nG90\nG1U-2W-1F.1\nM30');
  ok(near(R.moves[1].x, 96) && near(R.moves[1].z, 8), 'G91 incremental (X diametro)', R.moves.map(m => [m.x, m.z]));
  ok(near(fim(R).x, 94) && near(fim(R).z, 7), 'U/W incrementais em G90');
}

/* ---- ferramentas, G1900, rotacao ---- */
{
  const R = run('#101=0101(FERRAMENTA W)\n#102=303(CANAL)\nG1900D80.L30.K0.\nT#101\nG96S250M4\nG50S1800\nG0X85Z2\nG1Z-10F.3\nT#102(CANAL 4.5)\nG97S900M3\nG0X85Z2\nG1X70F.1\nM30');
  ok(R.ferramentas.length === 2 && R.ferramentas[0].codigo === '0101' && R.ferramentas[1].codigo === '0303', 'T#var: codigos 0101 e 0303 (4 digitos)', R.ferramentas.map(t => t.codigo));
  ok(R.ferramentas[0].comentario === 'FERRAMENTA W', 'descricao vem do comentario da variavel', R.ferramentas[0].comentario);
  ok(R.ferramentas[1].comentario === 'CANAL 4.5', 'descricao vem do comentario do T');
  ok(R.g1900 && near(R.g1900.d, 80) && near(R.g1900.l, 30), 'G1900D80.L30.K0.');
  const c1 = R.moves.find(m => m.tool === '0101' && m.t === 'f'), c2 = R.moves.find(m => m.tool === '0303' && m.t === 'f');
  ok(c1.spin.modo === 'G96' && near(c1.spin.vc, 250) && near(c1.spin.rpm, 1800), 'G96 S250 + G50 S1800 por movimento', c1.spin);
  ok(c2.spin.modo === 'G97' && near(c2.spin.rpm, 900), 'G97 S900', c2.spin);
  ok(R.sugestao.d === 80 && R.sugestao.livre === 30, 'bruto sugerido pelo G1900');
}
{
  const R = run('G1901D100E40L50K0.\nT0101\nG0X50Z2\nG1Z-5F.1\nM30');
  ok(R.sugestao.d === 100 && R.sugestao.furoD === 40, 'G1901 (bruto com furo)');
}
{
  const R = run('G0X100Z2\nG1Z-5\nM30');
  ok(R.avisos.some(a => /antes de qualquer comando T/.test(a.texto)), 'avanco antes do T avisa');
  const R2 = run('T0101\nG96S100\nG0X10Z1\nG1Z-5\nM30');
  ok(R2.avisos.some(a => /sem avanço/.test(a.texto)), 'G1 sem F avisa');
}

/* ---- ciclos: o material removido confere ---- */
const BASE = 'G1900D62L50K0.\nG21G90G40G80\nG28U0\nG0Z250\nT0101(DESBASTE)\nG54\nG96S300M4\nG50S2000\n';
{ // G71 + G70 externo: cilindro de Ø40 por 20 + Ø60 ate -35
  const R = run(BASE + 'G0Z1\nG0X62\nG71U3R.5\nG71P1Q2U0W0F.45\nN1G0X40\nZ0\nG1Z-20F.15\nX60\nZ-35\nN2G0X62\nG70P1Q2F.15\nG28U0\nG0Z250\nM30');
  ok(R.erros.length === 0 && R.ferramentas.length === 1, 'G71/G70: sem erro', R.erros);
  const { sim, a } = simula(R, { livre: 50 });
  ok(sobra(sim, -10, 21) === 0 && sobra(sim, -10, 19) === 1, 'G71: Ø40 limpo/ preservado em Z-10');
  ok(sobra(sim, -30, 29) === 1 && sobra(sim, -30, 31.5) === 0 || sobra(sim, -30, 30.5) === 0, 'G71: Ø60 preservado em Z-30');
  ok(a.alerts.filter(x => x.type === 'placa' || x.type === 'limite').length === 0, 'G71: sem colisao com a placa nem fora de curso', a.alerts.map(x => x.type + ':' + x.text));
}
{ // G72 externo (desbaste de frente)
  const R = run(BASE + 'G0Z1\nG0X62\nG72W2R.5\nG72P1Q2U0W0F.45\nN1G0Z-10\nN2G1X20F.15\nG70P1Q2F.15\nG28U0\nM30');
  ok(R.erros.length === 0, 'G72: sem erro', R.erros);
  const { sim } = simula(R, { livre: 50 });
  ok(sobra(sim, -5, 20) === 0 && sobra(sim, -5, 5) === 1 && sobra(sim, -11, 20) === 1, 'G72: faceia ate Z-10 (deixa o miolo Ø20) e preserva abaixo');
}
{ // G74 + G75 (turning/facing de casa)
  const R = run(BASE + 'G0Z1\nG0X62\nG75X-1Z0P999999Q1000R.5F.45\nG0Z1\nX58\nG74X50Z-20P3000Q999999R.5F.3\nM30');
  ok(R.erros.length === 0, 'G74/G75: sem erro', R.erros);
  const { sim } = simula(R, { livre: 50, sobre: 1 });
  ok(sobra(sim, 0.5, 5) === 0, 'G75: faceou ate o centro');
  ok(sobra(sim, -10, 26) === 0 && sobra(sim, -10, 24) === 1, 'G74: Ø50 em Z-10');
}
{ // furacao G83 com broca de 20 no eixo
  const R = run('G1900D62L50K0.\nT0404(BROCA 20)\nG97S800M3\nG0X0Z5\nG83Z-30Q5000F.1\nG80\nG0Z100\nM30');
  ok(R.erros.length === 0 && R.ferramentas[0].sug.tipo === 'furacao', 'G83: reconhece furacao', R.ferramentas.map(t => t.sug));
  const t = { nome: 'BROCA', t: '0404', tipo: 'furacao', diametro: 20, modo: 'G97', rpm: 800 };
  const { sim } = simula(R, { livre: 50, ferr: { '0404': { tool: t } } });
  ok(sobra(sim, -20, 5) === 0 && sobra(sim, -20, 12) === 1 && sobra(sim, -35, 5) === 1, 'G83: furo Ø20 ate Z-30');
}
{ // rosca G76 (so percurso e tempo; nao remove material)
  const R = run('G1900D40L40K0.\nT0505(ROSCA)\nG97S600M4\nG0X42Z5\nG76P010060Q100R.1\nG76X37.5Z-20P1227Q400F2\nG0X100\nM30');
  ok(R.erros.length === 0, 'G76: sem erro', R.erros);
  ok(R.moves.filter(m => m.t === 't').length >= 5 && R.ferramentas[0].sug.tipo === 'rosca', 'G76: passadas de rosca (t) e tipo rosca');
  ok(R.moves.filter(m => m.t === 't').every(m => near(m.f, 2)), 'G76: avanco = passo');
}
{ // arco: G3 com R e G2 com I/K; arco modal sem R vira reta com aviso
  const R = run('T0101\nG96S200M4\nG0X20Z1\nG1Z0F.1\nG3X30Z-5R5\nZ-10\nG2X40Z-15K-5\nM30');
  ok(R.erros.length === 0, 'arcos: sem erro', R.erros);
  ok(R.avisos.some(a => /sem G depois de um arco/.test(a.texto)), 'bloco sem G depois de arco avisa');
  const arco = R.moves.filter(m => /G3/.test(m.label));
  ok(arco.length >= 6 && near(arco[arco.length - 1].x, 30) && near(arco[arco.length - 1].z, -5), 'G3 termina no ponto', arco.length);
}
{ // G28 / limites
  const R = run('G28U0\nG0Z300\nT0101\nG0X50Z2\nG28U0\nG28W0\nM30', { xMax: 400, zMax: 400, chuckD: 260, rapido: 20000 });
  ok(near(R.moves.find(m => /G28/.test(m.label)).x, 400), 'G28U0 vai ao X de referencia (xMax)');
}

/* ---- programas da casa (pasta Exemplos): leem sem erro e viram simulacao ---- */
{
  const dir = path.join(__dirname, '..', 'Exemplos de programaçaõ');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  let n = 0;
  if (fs.existsSync(dir)) walk(dir).filter(f => /\.txt$/i.test(f)).forEach(f => {
    const R = run(fs.readFileSync(f).toString('latin1')), nome = path.basename(f);
    n++;
    ok(R.erros.length === 0, 'casa: ' + nome + ' le sem erro', R.erros.map(e => (e.linha + 1) + ':' + e.texto));
    ok(R.ferramentas.length >= 1 && R.moves.length > 5, 'casa: ' + nome + ' tem ferramentas e movimentos');
    const { a } = simula(R); ok(isFinite(a.total) && a.total > 0, 'casa: ' + nome + ' simula (tempo finito)');
  });
  console.log('  programas da casa lidos:', n);
}

/* ---- confere com o proprio gerador: mesmo programa gerado e colado = mesmo material removido ---- */
{
  const t1 = { nome: 'W', t: '0101', tipo: 'externa', modo: 'G96', vc: 300, rpm: 2000, avDesb: .45, avAcab: .15, incFace: 1, incTorn: 3, sentido: 4, angulo: 80, raio: 0.8 };
  const t2 = { nome: 'ENCAIXE 4.5', t: '0303', tipo: 'encaixe', modo: 'G96', vc: 250, rpm: 2000, avDesb: .3, avAcab: .15, incCanal: 1.175, largura: 4.5, sentido: 4 };
  const t4 = { nome: 'INT', t: '0606', tipo: 'interna', modo: 'G96', vc: 280, rpm: 2000, avDesb: .3, avAcab: .2, incFace: 0, incTorn: 1, sentido: 4, angulo: 80, raio: .4 };
  const t3 = { nome: 'T-MAX', t: '0404', tipo: 'furacao', modo: 'G97', vc: 0, rpm: 1000, avDesb: .2, incTorn: 3, sentido: 3, diametro: 30 };
  const t6 = { nome: 'ROSCA', t: '0505', tipo: 'rosca', modo: 'G97', vc: 0, rpm: 800, avDesb: 0, sentido: 4 };
  const acab = { acabFace: .08, acabTorn: .1 };
  const T = C.GERADORES.peca_simples, d = {}; T.campos.forEach(c => d[c.id] = c.def);
  const trE = [{ tipo: 'chanfro', a: 1, canto: 'ext' }, { tipo: 'cil', a: 100, b: 50 }];
  const big = o => Object.assign({}, d, { dBruto: 102, lBruto: 82, lPeca: 80, trechos1: trE }, o);
  const intA = [{ tipo: 'furo', a: 30, b: 50 }, { tipo: 'icil', a: 60, b: 30 }, { tipo: 'icil', a: 45, b: 20 }, { tipo: 'ichanfro', a: 1, canto: 'boca' }];
  const casos = [
    ['matriz solida', 'matriz_solida', { dBruto: 201, lBruto: 52, dFinal: 200, lPeca: 50, lUsin: 14, raio: 3, folga: 1 }, { t1 }],
    ['matriz solida c/ acabamento', 'matriz_solida', { dBruto: 201, lBruto: 52, dFinal: 200, lPeca: 50, lUsin: 14, raio: 3, folga: 1 }, { t1: Object.assign({}, t1, acab) }],
    ['matriz tubular', 'matriz_tubular', { dBruto: 230, lBruto: 72, dFinal: 225, lPeca: 70, lUsin: 31, raio: 3, folga: .3, prof: 4, dEnc: 188, passoEnc: 6 }, { t1: Object.assign({}, t1, acab), t2 }],
    ['espina cabeca', 'espina_cabeca', { dBruto: 256, lBruto: 72, dFinal: 245, lPeca: 70, lUsin: 30, folgaD: .3, dCab: 145, lCab: 25, folgaL: .2, rPonta: 1, rOmbro: 3, avFinal: .05 }, { t1: Object.assign({}, t1, acab) }],
    ['espina encaixe', 'espina_encaixe', { dBruto: 204, lBruto: 101, dFinal: 200, lPeca: 100, lUsin: 70, folga: .3, lEnc: 10.1, hEnc: 10, rFace: 5, rEnc: 3 }, { t1: Object.assign({}, t1, acab) }],
    ['peca simples + canal', 'peca_simples', Object.assign({}, d, { trechos1: [{ id: 'a', tipo: 'cil', a: 40, b: 20 }, { tipo: 'canal', a: 30, c: 4.5, seq: true }, { tipo: 'cil', a: 60, b: 10 }] }), { t1, t2 }],
    ['peca simples G72', 'peca_simples', Object.assign({}, d, { sentE1: 'trans' }), { t1, t2 }],
    ['peca simples furo + mandril G71', 'peca_simples', big({ internos1: intA }), { t1, t2, t3, t4 }],
    ['peca simples furo + mandril G72', 'peca_simples', big({ internos1: intA, sentI1: 'trans' }), { t1, t2, t3, t4 }],
    ['peca simples rosca externa', 'peca_simples', Object.assign({}, d, { dBruto: 120, lBruto: 102, lPeca: 100, trechos1: [{ id: 'a', tipo: 'cil', a: 20, b: 10 }, { id: 'r', tipo: 'rosca', a: 30, b: 20, c: 2 }, { tipo: 'canal', a: 26, c: 4.5, seq: true }, { id: 'b', tipo: 'cil', a: 50, b: 15 }] }), { t1, t2, t6 }]
  ];
  casos.forEach(([nome, g, f, tools]) => {
    const r = (C.GERADORES[g] || C.INTERNOS[g]).gerar(f, tools, { autor: 'F', data: 'OUT/2026' }), rs = r.lados || [r];
    rs.forEach((l, li) => {
      if (!l.code || !l.cena) { ok(false, 'gerador: ' + nome + ' gerou codigo', l.erros); return; }
      const R = P.interpretar(l.code, { maq: l.cena.maq });
      const gk = [...new Set(l.cena.path.map(m => m.tool))], mk = [...new Set(R.moves.map(m => m.tool))].filter(k => k !== '0000');
      const tm = { '0000': l.cena.tools[gk[0]] }; mk.forEach((k, i) => tm[k] = l.cena.tools[gk[i]]);
      const sg = new S.Sim(l.cena), sp = new S.Sim(Object.assign({}, l.cena, { path: R.moves, start: R.start, tools: tm }));
      const A = sg.analyze(), B = sp.analyze();
      sg.seek(sg.total); sp.seek(sp.total);
      let dif = 0, rem = 0; for (let k = 0; k < sg.mat.length; k++) { if (sg.mat[k] !== sp.mat[k]) dif++; if (sg.mat0[k] && !sg.mat[k]) rem++; }
      const nm = 'gerado x lido: ' + nome + (rs.length > 1 ? ' lado ' + (li + 1) : '');
      ok(R.erros.length === 0, nm + ' (sem erro de leitura)', R.erros);
      ok(dif <= Math.max(3, rem * 0.002), nm + ' (mesmo material removido)', dif + ' de ' + rem);
      ok(Math.abs(A.tCut - B.tCut) / A.tCut < 0.05, nm + ' (tempo de corte)', A.tCut.toFixed(1) + ' x ' + B.tCut.toFixed(1));
      const al = x => x.alerts.filter(a => a.type !== 'sobra').map(a => a.type).sort().join(',');
      ok(al(A) === al(B), nm + ' (mesmos alertas)', al(A) + ' x ' + al(B));
    });
  });
}

console.log('#### MODULO SIMULACAO:', total, 'verificacoes,', falhas, 'falha' + (falhas === 1 ? '' : 's'));
if (falhas) process.exitCode = 1;
