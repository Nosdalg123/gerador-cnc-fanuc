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
    ['peca simples G73', 'peca_simples', Object.assign({}, d, { sentE1: 'par' }), { t1, t2 }],
    ['peca simples G73 com acabamento', 'peca_simples', Object.assign({}, d, { sentE1: 'par' }), { t1: Object.assign({}, t1, acab), t2 }],
    ['peca simples G42', 'peca_simples', Object.assign({}, d, { compRaio: 'sim' }), { t1, t2 }],
    ['peca simples G73 + G42', 'peca_simples', Object.assign({}, d, { sentE1: 'par', compRaio: 'sim' }), { t1, t2 }],
    ['peca simples furo + mandril G71 + G42/G41', 'peca_simples', big({ internos1: intA, compRaio: 'sim' }), { t1, t2, t3, t4 }],
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
      const sg = new S.Sim(P.comCompensacao(l.cena)), sp = new S.Sim(P.comCompensacao(Object.assign({}, l.cena, { path: R.moves, start: R.start, tools: tm })));
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

/* ---- visor decodificado (v2.4.0): linha em execucao com variaveis e expressoes calculadas ---- */
{
  const R = run('#1=2\n#2=2\n#3=2\nG0Z[[#1+#2]*#3]\nM30');
  ok(R.moves[0].dec === 'G0Z[8]', 'decodificado: G0Z[[#1+#2]*#3] -> G0Z[8]', R.moves[0].dec);
  const R2 = run('#2=201\n#101=0101\nT#101G0X#2Z-5.F.2\nN10G0X[SQRT[16]]Z[-#2/100]\nG0X[SIN[30]*100]Z[TAN[45]]\nM30');
  ok(R2.moves[0].dec === 'T[0101]G0X[201]Z-5.F.2', 'decodificado: variavel solta vira [valor], numero escrito fica igual, T#var vira T[0101]', R2.moves[0].dec);
  ok(R2.moves[1].dec === 'N10 G0X[4]Z[-2.01]', 'decodificado: rotulo N, funcao e divisao', R2.moves[1].dec);
  ok(R2.moves[2].dec === 'G0X[50]Z[1]', 'decodificado: SIN e TAN (em graus)', R2.moves[2].dec);
  const R3 = run('#1=0\nWHILE[#1LT3]DO1\n#1=#1+1\nG0X[100+#1]Z0\nEND1\nM30');
  ok(R3.moves.map(m => m.dec).join('|') === 'G0X[101]Z0|G0X[102]Z0|G0X[103]Z0', 'decodificado: o mesmo bloco no laco mostra o valor de cada volta', R3.moves.map(m => m.dec));
  ok(P.numTxt(0.30000000000000004) === '0.3' && P.numTxt(100) === '100' && P.numTxt(-0.00001) === '0' && P.numTxt(1 / 3) === '0.3333' && P.numTxt(-12.5) === '-12.5', 'decodificado: formato dos numeros (sem zeros a mais)');
  const R4 = run('#1=10\nT0101\nG96S200M4\nG0X80Z2\nG71U1R.5\nG71P10Q20U.5W.1F.2\nN10G0X[#1*2]Z2\nG1Z-20\nN20X50\nG0X80Z2\nG70P10Q20\nM30');
  const g70 = R4.moves.filter(m => m.label === 'RETORNO (G70)')[0], cont = R4.moves.filter(m => m.line === 6);
  ok(g70 && g70.dec === 'G70P10Q20', 'decodificado: o retorno do G70 mostra o bloco G70 (nao o ultimo do contorno)', g70 && g70.dec);
  ok(cont.length === 2 && cont.every(m => m.dec === 'N10 G0X[20]Z2'), 'decodificado: bloco N10 do contorno, no movimento normal e dentro do G70', cont.map(m => m.dec));
  // a cena e o estado do simulador carregam o texto decodificado
  const sim = new S.Sim(P.montarCena(R, {}));
  ok(sim.segs.length === 1 && sim.segs[0].dec === 'G0Z[8]', 'decodificado: o segmento do simulador leva o texto', sim.segs.map(s => s.dec));
  sim.seek(sim.total / 2);
  ok(sim.state().dec === 'G0Z[8]', 'decodificado: estado do simulador devolve o texto');
}

/* ---- G73: desbaste paralelo ao perfil (v2.4.0) ---- */
{
  const perfil = 'N100 G0 X23 Z2\nN110 G1 Z0 F.18\nN120 X25 Z-1\nN130 Z-9\nN140 X50 Z-25\nN150 Z-45\nN160 X80 Z-55';
  const prog = (u1, r1, u2) => 'T0101\nG96S240M4\nG0 X90 Z5\nG73 ' + u1 + ' R' + r1 + '\nG73 P100 Q160 ' + u2 + ' F.2\n' + perfil + '\nG70 P100 Q160\nM30';
  const R = run(prog('U2 W1.35', 2, 'U2 W.3'));
  const g = R.moves.filter(m => m.label === 'DESBASTE G73');
  ok(R.erros.length === 0, 'G73 (exemplo ROMI): sem erro', R.erros);
  const volta = g.filter(m => near(m.x, 90) && near(m.z, 5));
  ok(volta.length === 2, 'G73 R2 = 2 cortes (2 retornos ao ponto de partida)', volta.length);
  ok(near(g[0].x, 29) && near(g[0].z, 3.65), '1o corte: perfil deslocado U/2+afastamento = 3 no raio e W+afastamento = 1,65 em Z', [g[0].x, g[0].z]);
  const ini2 = g.filter(m => m.t === 'r' && near(m.x, 25) && near(m.z, 2.3))[0];
  ok(!!ini2, 'ultimo corte: so o sobremetal de acabamento (U2 -> 1 no raio, W.3)', g.map(m => [m.x, m.z]).slice(8, 12));
  const R3 = run(prog('U4 W3', 3, 'U2 W.3'));
  const ini3 = R3.moves.filter(m => m.label === 'DESBASTE G73' && m.t === 'r' && m.z > 1.9 && m.x < 40).map(m => m.x);
  ok(ini3.join(',') === '33,29,25', 'G73 R3 U4: cortes em 5, 3 e 1 mm do perfil no raio (X33, X29, X25)', ini3);
  const R4 = run(prog('U4 W3', 1, 'U2 W.3'));
  const ini4 = R4.moves.filter(m => m.label === 'DESBASTE G73' && m.t === 'r' && m.z > 1.9 && m.x < 40).map(m => m.x);
  ok(ini4.join(',') === '33', 'G73 R1: corte unico com o afastamento inteiro', ini4);
  ok(!R.avisos.some(a => /G73/.test(a.texto)), 'G73 correto (U/W = afastamento total, padrao Fanuc): sem aviso', R.avisos.map(a => a.texto));
  // interno (exemplo ROMI): U de acabamento negativo manda a direcao do afastamento
  const Ri = run('T0606\nG96S215M4\nG0 X27 Z6\nG73 U1 W1.2 R3\nG73 P100 Q120 U-2 W.4 F.3\nN100 G0 X72 Z2\nN110 G1 Z0 F.2\nN120 X60 Z-10\nG70 P100 Q120\nM30');
  const gi = Ri.moves.filter(m => m.label === 'DESBASTE G73' && m.t === 'r' && m.z > 1.5 && m.x > 60).map(m => m.x);
  ok(Ri.erros.length === 0 && gi[0] < gi[gi.length - 1] && near(gi[gi.length - 1], 70), 'G73 interno: o perfil desloca para dentro do furo e o ultimo corte para em X70 (U-2)', gi);
  ok(Ri.avisos.some(a => /sinal de U/.test(a.texto)), 'G73 interno: aviso quando o U do 1o bloco tem sinal contrario ao do acabamento');
  // material: G73 + G70 deixam o perfil acabado
  const cena = P.montarCena(R, { d: 85, sobre: 3, livre: 70, grip: 25 });
  const sim = new S.Sim(cena); sim.analyze(); sim.seek(sim.total);
  ok(sobra(sim, -5, 13.5) === 0 && sobra(sim, -5, 11.5) === 1, 'G73+G70: cilindro Ø25 acabado (ar a 1 mm fora, material a 1 mm dentro)', [sobra(sim, -5, 13.5), sobra(sim, -5, 11.5)]);
  ok(sobra(sim, -35, 26) === 0 && sobra(sim, -35, 24) === 1, 'G73+G70: cilindro Ø50 acabado', [sobra(sim, -35, 26), sobra(sim, -35, 24)]);
}

/* ---- G41/G42: compensacao do raio de ponta (v2.4.0) ---- */
{
  const ferrR = (raio, tipo) => ({ ferr: { '0101': { tool: { t: '0101', tipo: tipo || 'externa', raio, angulo: 80, vc: 200, rpm: 2000, modo: 'G96' }, orient: null } } });
  const ref = (m, rn, interna) => ({ z: m.z + rn, r: m.x / 2 + (interna ? -rn : rn) }); // centro do raio de ponta a partir da ponta de referencia
  const R = run('T0101\nG96S200M4\nG0 X60 Z5\nG42\nG0 X40 Z2\nG1 Z-20 F.2\nX50\nG40 G0 X100 Z5\nM30');
  ok(R.erros.length === 0 && R.moves.map(m => m.comp).join(',') === '0,42,42,42,0', 'G42: o leitor marca os movimentos compensados e a saida (G40)', R.moves.map(m => m.comp));
  ok(!R.avisos.some(a => /G41|G42/.test(a.texto) && /não é simulada/.test(a.texto)), 'G42: nao avisa mais que a compensacao nao e simulada');
  const c = P.montarCena(R, Object.assign({ d: 60, sobre: 0, livre: 50 }, ferrR(0.8)));
  const p = c.path;
  ok(near(p[0].x, 60) && near(p[0].z, 5), 'G42: movimento antes do G42 fica como programado');
  ok(near(p[1].x, 40) && near(p[1].z, 1.2, 0.005), 'G42 partida: a ponta vai para Z2 - rn (o centro do raio fica em Z2, na normal do 2o bloco)', [p[1].x, p[1].z]);
  ok(near(p[2].x, 40) && near(p[2].z, -20, 0.005), 'G42 canto interno: a ponta de referencia chega no canto programado (X40 Z-20)', [p[2].x, p[2].z]);
  ok(near(p[3].x, 47.7373, 5e-3) && near(p[3].z, -20, 0.005), 'G42 saida: ponto de encontro com o bloco de saida (inclinado) em X47,737', [p[3].x, p[3].z]);
  ok(near(p[4].x, 100) && near(p[4].z, 5) && /G40/.test(p[4].label), 'G40: a saida termina no ponto programado', p[4]);
  ok(/G42/.test(p[1].label), 'G42: o rotulo do movimento mostra a compensacao');
  ok(c.compAvisos.length === 0, 'G42 com raio no banco: sem aviso', c.compAvisos);
  // ferramenta sem raio: simula como programado e avisa
  const c0 = P.montarCena(R, Object.assign({ d: 60, sobre: 0, livre: 50 }, ferrR('')));
  ok(c0.path.every((m, i) => near(m.x, R.moves[i].x) && near(m.z, R.moves[i].z)), 'G42 sem raio de ponta: segue a ponta programada');
  ok(c0.compAvisos.length === 1 && /raio de ponta/.test(c0.compAvisos[0].texto), 'G42 sem raio de ponta: aviso', c0.compAvisos);
  // interna (G41): o raio fica do lado do eixo
  const Ri = run('T0101\nG96S200M4\nG0 X20 Z2\nG41\nG0 X30 Z2\nG1 Z-20 F.1\nX20\nG40 G0 X15 Z5\nM30');
  const ci = P.montarCena(Ri, Object.assign({ d: 60, sobre: 0, livre: 50, furoD: 16 }, ferrR(0.8, 'interna'))).path;
  ok(near(ci[1].x, 30) && near(ci[1].z, 1.2, 0.005), 'G41 interno, partida: X30 Z2-rn', [ci[1].x, ci[1].z]);
  ok(near(ci[2].x, 30) && near(ci[2].z, -20, 0.005), 'G41 interno, fundo do furo: a ponta chega em X30 Z-20', [ci[2].x, ci[2].z]);
  // canto externo: o centro do raio contorna o vertice em arco de raio rn
  const Re = run('T0101\nG96S200M4\nG0 X60 Z5\nG42\nG0 X40 Z2\nG1 Z-20 F.2\nX30\nZ-30\nG40 G0 X100 Z5\nM30');
  const pe = P.montarCena(Re, Object.assign({ d: 60, sobre: 0, livre: 50 }, ferrR(0.8))).path;
  const arco = pe.filter(m => m.t === 'f' && m.z < -20.7 && m.z > -21.7 && m.x > 38 && m.x < 41);
  const dist = arco.map(m => { const cc = ref(m, 0.8); return Math.hypot(cc.z - -20, cc.r - 20); });
  ok(arco.length >= 2 && dist.every(d => near(d, 0.8, 2e-3)), 'G42 canto externo: o centro do raio de ponta passa a 0,8 do vertice (arco)', dist);
  // material: cone a 45 graus. Com G42 a superficie fica na linha programada; sem compensacao fica deslocada.
  const cone = comp => 'T0101\nG96S200M4\nG0 X70 Z5\n' + (comp ? 'G42\n' : '') + 'G0 X30 Z5\nG1 Z0 F.2\nX50 Z-10\nZ-30\n' + (comp ? 'G40 ' : '') + 'G0 X80 Z5\nM30'; // aproxima em Z5 (> raio 2,4): o nariz da pastilha nao entra na face
  const dev = (txt) => {
    const Rc = run(txt), cc = P.montarCena(Rc, Object.assign({ d: 60, sobre: 0, livre: 50 }, ferrR(2.4)));
    cc.bruto.perfil = [{ z0: 0, z1: -10, d: 2 * (15 + 2.5), d1: 2 * (25 + 2.5) }, { z0: -10, z1: -75, d: 2 * (25 + 2.5) }]; cc.bruto.z0 = 0; cc.bruto.z1 = -75; // bruto = cone com 2,5 mm de sobremetal no raio
    const sm = new S.Sim(cc); sm.analyze(); sm.seek(sm.total);
    let maxd = 0; for (let z = -9; z <= -1; z += 1) { let rs = -1; for (let r = 40; r > 0; r -= 0.25) if (sobra(sm, z, r)) { rs = r; break; } maxd = Math.max(maxd, Math.abs(rs - (15 - z))); }
    return maxd;
  };
  const dComp = dev(cone(true)), dSem = dev(cone(false));
  ok(dComp <= 0.5, 'G42 cone 45 graus: a superficie acabada fica na linha programada (desvio <= 0,5 mm, a grade do simulador e 0,5)', dComp.toFixed(2));
  ok(dSem >= 0.6 && dSem - dComp >= 0.4, 'sem compensacao o mesmo programa deixa o cone deslocado (desvio >= 0,6 mm e bem maior que com G42)', dSem.toFixed(2) + ' x ' + dComp.toFixed(2));
}

/* ---- angulo de posicao do suporte (kappa) no banco: o inserto gira e nao corta alem de perfil que desce para a placa (v2.6.0) ---- */
{
  const sh0 = S.toolShape({ kind: 'rombo', ang: 80, raio: 0.8 });
  ok(near(sh0.nose[0], 0.8, 2e-3) && near(sh0.nose[1], 0.8, 2e-3), 'suporte: sem kappa o centro do raio de ponta fica a (rn, rn) da ponta (como sempre)', sh0.nose);
  const shI0 = S.toolShape({ kind: 'interna', ang: 80, raio: 0.8 });
  ok(near(shI0.nose[0], 0.8, 2e-3) && near(shI0.nose[1], -0.8, 2e-3), 'suporte: barra interna sem kappa, centro a (rn, -rn)', shI0.nose);
  ok(S.toolShape({ kind: 'rombo', ang: 80, raio: 0 }).nose === null, 'suporte: ponta viva nao tem centro de raio');
  [[80, 95], [55, 93], [35, 93], [80, 0], [80, 90]].forEach(([ang, ap]) => ['rombo', 'interna'].forEach(kind => {
    const sh = S.toolShape({ kind, ang, raio: 1.2, ap }), arco = kind === 'rombo' ? sh.pts.slice(0, 9) : sh.pts.slice(-9);
    ok(arco.every(p => near(Math.hypot(p[0] - sh.nose[0], p[1] - sh.nose[1]), 1.2, 1e-9)), 'suporte: ' + kind + ' ponta ' + ang + '° kappa ' + ap + ': o arco do nariz esta a rn do centro', arco.map(p => Math.hypot(p[0] - sh.nose[0], p[1] - sh.nose[1]).toFixed(4)));
  }));
  // a aresta de tras sobe phi = 180 - kappa - ponta (55 graus em suporte de 93: 32 graus)
  const sh55 = S.toolShape({ kind: 'rombo', ang: 55, raio: 0, ap: 93 }), p0 = sh55.pts[0], p1 = sh55.pts[1];
  ok(near(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI, 32, 1e-6), 'suporte: ponta 55 em kappa 93 = aresta de tras subindo 32 graus', Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI);
  // efeito: cone que desce para a placa (como o do FRENTE.COPO): sem kappa a aresta de tras corta alem do perfil
  const cone = 'T0101\nG96S200M4\nG0 X200 Z5\nG0 X188 Z2\nG1 Z-15 F.3\nX175 Z-61.57\nZ-70\nG0 X200 Z5\nM30';
  const desvio = (ferr) => {
    const Rc = run(cone), cc = P.montarCena(Rc, { d: 190, sobre: 2, livre: 100, ferr: { '0101': { tool: ferr, orient: null } } });
    const a = 0.8; // bruto = perfil acabado + 0,8 mm no raio
    cc.bruto.perfil = [{ z0: 2, z1: -15, d: 2 * (94 + a) }, { z0: -15, z1: -61.57, d: 2 * (94 + a), d1: 2 * (87.5 + a) }, { z0: -61.57, z1: -125, d: 2 * (87.5 + a) }]; cc.bruto.z0 = 2; cc.bruto.z1 = -125;
    const sm = new S.Sim(cc); sm.analyze(); sm.seek(sm.total);
    let md = 0; for (let z = -8; z >= -58; z -= 5) { let rs = -1; for (let r = 100; r > 0; r -= 0.25) if (sobra(sm, z, r)) { rs = r; break; } md = Math.max(md, Math.abs(rs - (z >= -15 ? 94 : 94 + (z + 15) * 6.5 / 46.57))); } // perfil: cilindro r94 ate Z-15, cone ate r87,5 em Z-61,57
    return md;
  };
  const base = { t: '0101', tipo: 'externa', raio: 0.4, angulo: 55, vc: 200, rpm: 2000, modo: 'G96' };
  const dSem = desvio(base), dCom = desvio(Object.assign({}, base, { apSuporte: 93 }));
  ok(dSem >= 0.9, 'suporte: sem kappa o cone que desce para a placa e cortado alem do perfil (>= 0,9 mm)', dSem.toFixed(2));
  ok(dCom <= 0.6, 'suporte: com kappa 93 (ponta 55) o cone fica no perfil (<= 0,6 mm)', dCom.toFixed(2));
  // G42 junto com o suporte girado: a superficie continua na linha programada
  const cone45 = 'T0101\nG96S200M4\nG0 X70 Z5\nG42\nG0 X30 Z5\nG1 Z0 F.2\nX50 Z-10\nZ-30\nG40 G0 X80 Z5\nM30';
  const Rg = run(cone45), cg = P.montarCena(Rg, { d: 60, sobre: 0, livre: 50, ferr: { '0101': { tool: Object.assign({}, base, { raio: 2.4, apSuporte: 93 }), orient: null } } });
  cg.bruto.perfil = [{ z0: 0, z1: -10, d: 2 * (15 + 2.5), d1: 2 * (25 + 2.5) }, { z0: -10, z1: -75, d: 2 * (25 + 2.5) }]; cg.bruto.z0 = 0; cg.bruto.z1 = -75;
  const sg = new S.Sim(cg); sg.analyze(); sg.seek(sg.total);
  let md2 = 0; for (let z = -9; z <= -1; z += 1) { let rs = -1; for (let r = 40; r > 0; r -= 0.25) if (sobra(sg, z, r)) { rs = r; break; } md2 = Math.max(md2, Math.abs(rs - (15 - z))); }
  ok(md2 <= 0.5, 'suporte: G42 com a pastilha girada (ponta 55, kappa 93, raio 2,4) deixa o cone 45 graus na linha programada', md2.toFixed(2));
}

/* ---- visor decodificado tambem na janela do Gerador (v2.5.0): programa gerado + texto de cada linha ---- */
{
  const t1 = { nome: 'W', t: '0101', tipo: 'externa', modo: 'G96', vc: 300, rpm: 2000, avDesb: .45, avAcab: .15, incFace: 1, incTorn: 3, sentido: 4, angulo: 80, raio: 0.8 };
  const g = C.GERADORES.matriz_solida.gerar({ dBruto: 201, lBruto: 52, dFinal: 200, lPeca: 50, lUsin: 14, raio: 3, folga: 1 }, { t1 }, { autor: 'F', data: 'OUT/2026' });
  const sem = g.cena.path.filter(m => m.dec);
  const cd = P.comDecodificado(g.cena, g.code, g.cena.maq);
  ok(sem.length === 0, 'Gerador: a cena do core.js nao traz o texto decodificado', sem.length);
  ok(cd !== g.cena && cd.path.length === g.cena.path.length && g.cena.path.every(m => !m.dec), 'Gerador: comDecodificado devolve uma copia e nao altera a cena original');
  const comDec = cd.path.filter(m => m.dec).length;
  ok(comDec >= cd.path.length * 0.9, 'Gerador: o texto decodificado cobre quase todos os movimentos', comDec + ' de ' + cd.path.length);
  const linhas = g.code.split('\n'), m1 = cd.path.find(m => /^G0Z\[?\d/.test(m.dec || '') || /^G0Z/.test(m.dec || ''));
  ok(!!m1 && /\[/.test(m1.dec) && !/#/.test(m1.dec), 'Gerador: variavel do codigo gerado aparece com o valor, sem #', m1 && m1.dec + ' <- ' + linhas[m1.line]);
  ok(cd.path.every(m => !m.dec || !/#/.test(m.dec)), 'Gerador: nenhum texto decodificado fica com variavel (#)');
  ok(P.comDecodificado(cd, g.code, g.cena.maq) === cd, 'Gerador: cena que ja traz o texto volta como veio');
  const sim = new S.Sim(cd); sim.analyze(); sim.seek(sim.total * 0.3);
  ok(typeof sim.state().dec === 'string', 'Gerador: o estado do simulador devolve o texto');
}

/* ---- programas da casa COPO BRUTO P2/P3 (funcionam na maquina): G73, G72 interno, G74, G76, GOTO entre operacoes (v2.5.0) ---- */
{
  const dir = path.join(__dirname, '..', 'Exemplos de programaçaõ', 'COPO BRUTO P2 P3'), le = n => fs.readFileSync(path.join(dir, n)).toString('latin1');
  if (fs.existsSync(dir)) {
    const F = run(le('FRENTE.COPO.BRUTO.P2.P3.txt'));
    ok(F.erros.length === 0 && F.avisos.length === 0, 'COPO FRENTE: le sem erro e sem aviso', F.erros.concat(F.avisos).map(e => (e.linha + 1) + ':' + e.texto));
    ok(F.ferramentas.map(f => f.codigo).join(',') === '1010,0404,0606,0808', 'COPO FRENTE: ferramentas 1010, 0404, 0606 e 0808', F.ferramentas.map(f => f.codigo));
    const g = F.moves.filter(m => m.label === 'DESBASTE G73'), voltas = g.filter(m => m.t === 'r' && near(m.x, 193) && near(m.z, 3));
    ok(voltas.length === 8, 'COPO FRENTE: G73 R8 = 8 cortes', voltas.length);
    const ini = []; g.forEach((m, i) => { if (i === 0 || (near(g[i - 1].x, 193) && near(g[i - 1].z, 3))) ini.push(m.x); }); // 1o movimento de cada corte
    ok(near(ini[0], 201) && near(ini[ini.length - 1], 185) && ini.length === 8, 'COPO FRENTE: G73 U8 = 1o corte 8 mm no raio acima do perfil (X201) e o ultimo no perfil (X185)', ini);
    ok(ini.every((x, i) => i === 0 || near(ini[i - 1] - x, 16 / 7, 1e-6)), 'COPO FRENTE: cortes igualmente espacados (U8 dividido em 7 intervalos)', ini);
    ok(g[0].dec === 'G73P1Q2U0W0F.3', 'COPO FRENTE: visor decodificado do bloco G73', g[0].dec);
    ok(F.moves.some(m => m.label === 'FURAR (G74)') && F.moves.some(m => m.label === 'DESBASTE G72') && F.moves.some(m => m.label === 'RETORNO (G70)'), 'COPO FRENTE: furacao G74, desbaste G72 interno e acabamento G70');
    const T = run(le('TRAS.COPO.BRUTO.P2.P3.txt'));
    ok(T.erros.length === 0 && T.avisos.length === 0, 'COPO TRAS: le sem erro e sem aviso', T.erros.concat(T.avisos).map(e => (e.linha + 1) + ':' + e.texto));
    ok(T.ferramentas.map(f => f.codigo).join(',') === '0101,0404,0606,0808', 'COPO TRAS: ferramentas 0101, 0404, 0606 e 0808', T.ferramentas.map(f => f.codigo));
    ok(T.moves.some(m => m.label === 'ROSCA G76') && T.moves.some(m => m.label === 'DESBASTE G71') && T.moves.some(m => m.label === 'FURAR (G74)'), 'COPO TRAS: rosca G76 interna, G71 e furacao G74');
    // GOTO93: o acabamento externo roda com a mesma ferramenta, sem repetir a troca (N71)
    ok(T.moves.filter(m => m.line === 65).length === 0, 'COPO TRAS: o GOTO pula o bloco de troca de ferramenta do acabamento (N71)');
    const c = P.montarCena(T, { maq: MAQ }), sim = new S.Sim(c); sim.analyze(); sim.seek(sim.total);
    let rs = -1; for (let r = 100; r > 0; r -= 0.25) if (sobra(sim, -37, r)) { rs = r; break; }
    ok(Math.abs(rs - 87.5) <= 0.5, 'COPO TRAS: cilindro externo acabado em Ø175 (r 87,5)', rs);
  }
}

console.log('#### MODULO SIMULACAO:', total, 'verificacoes,', falhas, 'falha' + (falhas === 1 ? '' : 's'));
if (falhas) process.exitCode = 1;
