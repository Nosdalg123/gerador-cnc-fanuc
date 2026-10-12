/* Testes do diagnostico de programa (diagnostico.js): um caso para cada tipo de erro do catalogo, correcoes, programas da casa e do Gerador.
   Chamado no fim do test.js (ou: node testdiag.js). */
const fs = require('fs'), path = require('path');
const C = require('./core.js'), S = require('./sim.js'), P = require('./progsim.js'), D = require('./diagnostico.js');
let total = 0, falhas = 0;
function ok(cond, nome, extra) { total++; if (!cond) { falhas++; console.log('  FALHOU', nome, extra === undefined ? '' : extra); } else if (process.argv.includes('-v')) console.log('  ok', nome); }
const MAQ = C.DEFAULT_MAQ;
const cob = {}; // codigos do catalogo que um programa real (ou alerta real) fez aparecer
const diag = (prog, maq) => D.diagnosticar(P.interpretar(prog, { maq: maq || MAQ }), prog, {});
function tem(prog, cod, nome, sev) {
  const L = diag(prog), it = L.find(x => x.cod === cod);
  ok(!!it, 'diag ' + cod + ': ' + nome, L.map(x => x.cod + '@' + (x.linha + 1)));
  if (it) { cob[cod] = true; if (sev) ok(it.sev === sev, 'diag ' + cod + ': gravidade ' + sev, it.sev); ok(it.solucao && it.solucao.length > 0 && it.causa && it.titulo, 'diag ' + cod + ': traz causa e solucao'); }
  return it;
}
function nao(prog, cod, nome) { const L = diag(prog); ok(!L.some(x => x.cod === cod), 'diag sem ' + cod + ': ' + nome, L.map(x => x.cod)); }

console.log('\n#### MODULO DIAGNOSTICO (erros do programa + solucoes)');

// programa-base correto: nenhum diagnostico
const CAB = 'G21G90G40G80\nG28U0\nT0101\nG96S250M4\nG50S1500\nM8\n', FIM = '\nG28U0\nM9\nM30';
{
  const bom = CAB + 'G0X80Z2\nG1Z-20F.2\nX90' + FIM;
  const L = diag(bom);
  ok(L.length === 0, 'programa correto: nenhum diagnostico', L.map(x => x.cod));
  ok(D.html(L).indexOf('Nenhum problema') >= 0, 'html: programa correto mostra "nenhum problema"');
}

/* ---- sintaxe ---- */
{
  const a = tem(CAB + 'G0X50(COMENTARIO\nG1Z-5F.2' + FIM, 'comAberto', 'comentario sem fechar', 'erro');
  ok(a && a.fix && a.fix.exato && a.fix.depois.endsWith(')'), 'comAberto: correcao fecha o parentese', a && a.fix);
  tem(CAB + 'G0X50)\nG1Z-5F.2' + FIM, 'comAberto', 'parentese sobrando');
  tem('#1=5\nG0X[#1+2\nM30', 'colchete', 'colchete aberto', 'erro');
  tem('G0X[5]]\nM30', 'colchete', 'colchete a mais');
  tem(CAB + 'G0X50@Z2' + FIM, 'charInvalido', 'caractere @', 'erro');
  tem(CAB + 'G0X"50"Z2' + FIM, 'charInvalido', 'aspas');
  tem(CAB + 'G0X\nG1Z-5F.2' + FIM, 'letraSemValor', 'X sem valor', 'erro');
  tem(CAB + 'G0X12.5.3Z2' + FIM, 'sintaxe', 'numero com dois pontos', 'erro');
  tem(CAB + '#10\nG0X50' + FIM, 'atribuicao', 'atribuicao sem =', 'erro');
  tem(CAB + 'G1X10X20F.2' + FIM, 'enderecoRepetido', 'X duas vezes', 'aviso');
  tem(CAB + 'G0G1X10F.2' + FIM, 'grupoG', 'G0 e G1', 'aviso');
  nao(CAB + 'G0X80Z2\nG21G90G40G80' + FIM, 'grupoG', 'G21 G90 G40 G80 sao grupos diferentes');
  nao(CAB + 'G0X80Z2\nG1X50Z-5F.2' + FIM, 'enderecoRepetido', 'X e Z uma vez cada');
}
/* ---- variaveis e fluxo ---- */
{
  tem(CAB + 'G0X#9Z2' + FIM, 'varNaoDef', 'variavel sem valor', 'aviso');
  tem(CAB + '#1=0\n#2=5/#1\nG0X50' + FIM, 'divZero', 'divisao por zero', 'erro');
  tem(CAB + '#1=SQRT[-4]\nG0X50' + FIM, 'raizNeg', 'raiz de negativo', 'erro');
  tem(CAB + 'GOTO77' + FIM, 'gotoSemN', 'GOTO sem rotulo', 'erro');
  tem(CAB + '#1=1\nIF[#1GT0]GOTO88\nG0X50' + FIM, 'gotoSemN', 'IF..GOTO sem rotulo (estatico, mesmo se nao executar)');
  tem(CAB + '#1=1\nIF[#1GT3]\nG0X50' + FIM, 'ifSemGoto', 'IF sem GOTO nem THEN', 'erro');
  tem(CAB + '#1=0\nWHILE[#1LT3]DO1\n#1=#1+1\nG0X50' + FIM, 'whileErro', 'WHILE sem END', 'erro');
  tem(CAB + 'G0X50\nEND1' + FIM, 'whileErro', 'END sem WHILE');
  tem(CAB + '#1=0\nWHILE[#1LT3]DO1\nG0X50\nEND1' + FIM, 'laco', 'laco sem fim', 'erro');
  tem(CAB + 'M98P500\nG0X50' + FIM, 'subNaoAchado', 'M98 sem subprograma', 'erro');
  tem(CAB + 'M98P100\nG0X50' + FIM + '\nO100\nM98P100\nM99', 'subAninhado', 'subprograma chama a si mesmo', 'erro');
  tem(CAB + 'M98P100\nM30\nO100\nG0W-1', 'semM99', 'subprograma sem M99', 'aviso');
  nao(CAB + 'M98P100' + FIM + '\nO100\nG0W-1\nM99', 'semM99', 'subprograma com M99');
}
/* ---- estrutura ---- */
{
  const f = tem(CAB + 'G0X80Z2\nG1Z-20F.2\n%'.replace('\n%', ''), 'semFim', 'programa sem M30', 'aviso');
  ok(f && f.fix && f.fix.op === 'insDepois' && f.fix.exato, 'semFim: correcao acrescenta M30');
  const f2 = tem(CAB + 'G0X80Z2\nG1Z-20F.2\nG28U0\nM30', 'semM9', 'M8 sem M9', 'dica');
  ok(f2 && f2.fix && f2.fix.texto === 'M9' && f2.linha === 9, 'semM9: aponta o M30 e propoe M9', f2 && [f2.linha, f2.fix]);
  tem(CAB + 'G0X80Z2\nM9\nM30\nG0X50\nG0Z5', 'codigoAposM30', 'bloco depois do M30', 'dica');
  nao(CAB + 'M98P100\nG28U0\nM9\nM30\nO100\nG0W-1\nM99', 'codigoAposM30', 'subprograma depois do M30 e normal');
  nao('#1=1\nIF[#1GT0]GOTO70\nG0X50\nM30\nN70\nG0X60\nM30', 'codigoAposM30', 'rotulo de desvio depois do M30 e alcancado');
}
/* ---- movimentos ---- */
{
  tem(CAB + 'G0X80Z2\nG2X60Z-5F.2' + FIM, 'arcoSemRI', 'arco sem R nem I/K', 'erro');
  tem(CAB + 'G0X20Z0\nG2X60Z-1R1F.2' + FIM, 'arcoRPequeno', 'R menor que a corda', 'aviso');
  tem(CAB + 'G0X80Z2\nG2X60Z-5R10F.2\nX50' + FIM, 'arcoHerdado', 'bloco sem G depois de arco', 'aviso');
  tem(CAB + 'G20\nG0X50Z2' + FIM, 'g20', 'G20 polegadas');
  tem(CAB + 'G53X0\nG0X50Z2' + FIM, 'g53', 'G53');
  tem(CAB + 'G50X100Z100\nG0X50Z2' + FIM, 'g50xz', 'G50 com X/Z');
  tem(CAB + 'G12X10\nG0X50Z2' + FIM, 'gIgnorado', 'G nao simulado');
}
/* ---- ferramenta, rotacao, avanco ---- */
{
  tem('G96S250M4\nG50S1500\nG0X80Z2\nG1Z-5F.2\nM9\nM30', 'semT', 'corte sem T', 'aviso');
  tem('T0101\nG96S250M4\nG50S1500\nG0X80Z2\nG1Z-5\nM30', 'semF', 'G1 sem F', 'aviso');
  tem('T0101\nM4\nG0X80Z2\nG1Z-5F.2\nM30', 'semS', 'corte sem S', 'aviso');
  tem('T0101\nG96S250\nG50S1500\nG0X80Z2\nG1Z-5F.2\nM30', 'semGiro', 'corte sem M3/M4', 'aviso');
  nao(CAB + 'G0X80Z2\nM5\nM4\nG1Z-5F.2' + FIM, 'semGiro', 'M5 e depois M4 antes do corte');
  const g = tem('T0101\nG96S250M4\nG0X80Z2\nG1Z-5F.2\nM30', 'g96semG50', 'G96 sem G50 S', 'aviso');
  ok(g && g.linha === 1 && g.fix && g.fix.op === 'insDepois', 'g96semG50: aponta a linha do G96 e propoe G50 depois dela', g && [g.linha, g.fix]);
  if (g) { const novo = D.aplicar('T0101\nG96S250M4\nG0X80Z2\nG1Z-5F.2\nM30', [g.fix]); ok(!diag(novo).some(x => x.cod === 'g96semG50'), 'g96semG50: depois de aplicar a correcao o aviso some', novo); }
  tem(CAB + 'G0X80Z2\nG1Z-5F300' + FIM, 'avAlto', 'F300 em mm/rot', 'aviso');
  tem(CAB + 'G98\nG0X80Z2\nG1Z-5F.2' + FIM, 'avBaixo', 'F.2 em mm/min', 'aviso');
  nao(CAB + 'G98\nG0X80Z2\nG1Z-5F300' + FIM, 'avBaixo', 'F300 em mm/min e normal');
  const t = tem(CAB + 'G0X80Z2\nG1Z-5F.2\nT0202\nG0X80Z2\nG1Z-8F.2' + FIM, 'trocaSemRecuo', 'T sem G28', 'aviso');
  ok(t && t.linha === 8 && t.fix && t.fix.texto === 'G28U0', 'trocaSemRecuo: aponta a linha do T e propoe G28U0', t && [t.linha, t.fix]);
  nao(CAB + 'G0X80Z2\nG1Z-5F.2\nG28U0\nT0202\nG96S250M4\nG0X80Z2\nG1Z-8F.2' + FIM, 'trocaSemRecuo', 'G28 antes do T');
  const a28 = tem(CAB + 'G0X100Z2\nG1Z-5F.2\nG28X0\nG0X50' + FIM, 'g28Abs', 'G28 com X absoluto', 'aviso');
  ok(a28 && a28.fix && a28.fix.depois.indexOf('G28U0') >= 0, 'g28Abs: correcao troca X0 por U0', a28 && a28.fix);
  nao(CAB + 'G0X100Z2\nG1Z-5F.2\nG28U0' + FIM, 'g28Abs', 'G28U0 incremental');
  tem('T0404\nG96S250M4\nG50S1500\nG0X0Z5\nG83Z-20Q5000R2F.1\nG80\nM9\nM30', 'furoG96', 'furacao em G96', 'aviso');
  tem('T0404\nG97S900M3\nG0X0Z5\nG83Z-20R2F.1\nG80\nM9\nM30', 'g83semQ', 'G83 sem Q', 'dica');
  nao('T0404\nG97S900M3\nG0X0Z5\nG83Z-20Q5000R2F.1\nG80\nM9\nM30', 'g83semQ', 'G83 com Q');
}
/* ---- ciclos ---- */
{
  const cont = 'N1G0X50\nG1Z-20\nN2X60\n';
  const ciclo = (par, chamada, c) => CAB + 'G0X70Z2\n' + par + chamada + '\n' + (c || cont) + 'G0X70Z2\nG70P1Q2F.1' + FIM;
  tem(ciclo('', 'G71P1Q2U.3W.05F.2'), 'cicloSemPar', 'G71 sem U R', 'aviso');
  tem(ciclo('G71U2R1\n', 'G71P1Q9U.3W.05F.2'), 'cicloSemContorno', 'P/Q para bloco inexistente', 'erro');
  tem(ciclo('G71U0R1\n', 'G71P1Q2U.3W.05F.2'), 'cicloProf', 'G71 com U0', 'erro');
  tem(ciclo('G71U2R1\n', 'G71P1Q1U.3W.05F.2', 'N1G0X50\n'), 'cicloContornoCurto', 'contorno de um movimento', 'aviso');
  const c1 = tem(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2', 'N1X50\nG1Z-20\nN2X60\n'), 'contornoSemG01', 'N1 sem G0/G1', 'erro');
  ok(c1 && c1.fix && c1.fix.depois.indexOf('N1G0X50') === 0, 'contornoSemG01: correcao poe G0 depois do N', c1 && c1.fix);
  if (c1) { const novo = D.aplicar(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2', 'N1X50\nG1Z-20\nN2X60\n'), [c1.fix]); ok(!diag(novo).some(x => x.cod === 'contornoSemG01'), 'contornoSemG01: depois de aplicar o erro some'); }
  nao(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2', 'N1G01X50\nG1Z-20\nN2X60\n'), 'contornoSemG01', 'G01 conta como G1');
  nao(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2', 'N1G0X50\nG1Z-20\nN2X60\n'), 'contornoSemG01', 'G0 no N1 esta certo');
  tem(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2', 'N1G0X50Z0\nG1Z-20\nN2X60\n'), 'g71ii', 'primeiro bloco com X e Z', 'aviso');
  tem(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2', 'N1G0X50\nG1Z-10\nX40\nZ-20\nX60\nZ-30\nN2X62\n'), 'g71cav', 'cavidade em X', 'aviso');
  tem(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2', 'N1G0X50\nG1Z-20\nX55\nZ-10\nN2X60\n'), 'cicloEixo', 'contorno volta em Z', 'dica');
  tem(ciclo('G71U2R1\n', 'G71P1Q2U-.3W.05F.2'), 'g71Sinal', 'G71 externo com U negativo', 'aviso');
  nao(ciclo('G71U2R1\n', 'G71P1Q2U.3W.05F.2'), 'g71Sinal', 'G71 externo com U positivo');
  tem(CAB + 'G0X70Z2\nG73U4W0R4\nG73P1Q2U-.3W.05F.2\nN1G0X50\nG1Z-20\nN2X60\nG70P1Q2F.1' + FIM, 'g73sinal', 'sinais do G73 inconsistentes', 'aviso');
  tem(CAB + 'G0X70Z2\nG71U2R1\nG71P1Q2U.3W.05F.2\nN1G0X50\nG1Z-20\nN2X60\nG0X70Z2\nG70P1Q2' + FIM, 'g70F', 'G70 sem F', 'aviso');
  tem(CAB + 'G0X50Z-10\nG75X50Z-20P3000Q2000F.2' + FIM, 'cicloSemCurso', 'G75 sem curso em X', 'aviso');
  tem(CAB + 'G0X60Z0\nG75X20Z-10P3Q2.5F.2' + FIM, 'pqUnidade', 'P3 e Q2.5 em micrometros', 'aviso');
  nao(CAB + 'G0X60Z0\nG75X20Z-10P3000Q2500F.2' + FIM, 'pqUnidade', 'P e Q em milesimos');
  nao(CAB + 'G0X60Z0\nG75X20Z-10P999999Q2500F.2' + FIM, 'pqUnidade', 'P999999');
  const rosca = (extra, p1, g2) => 'T0505\n' + (extra || 'G97S600M4') + '\nG0X70Z10\n' + (p1 === undefined ? 'G76P010060Q100R.1\n' : p1) + (g2 || 'G76X57.5Z-30P1230Q300F2') + FIM.replace('\nG28U0', '\nG0X200\nG28U0');
  tem(rosca(null, undefined, 'G76X57.5Z-30'), 'g76Param', 'G76 sem P Q F', 'aviso');
  tem(rosca(null, ''), 'g76semPre', 'G76 sem o primeiro bloco', 'aviso');
  tem(rosca('G96S250M4'), 'g76G96', 'rosca em G96', 'aviso');
  tem(rosca('G97S4000M4'), 'g76Rpm', '4000 rpm x passo 2', 'aviso');
  tem(rosca(null, undefined, 'G76X57.5Z-30P1800Q300F2'), 'g76Altura', 'altura 1,8 para passo 2', 'aviso');
  tem(rosca(null, 'G76P010045Q100R.1\n'), 'g76Ang', 'angulo 45', 'aviso');
  tem(rosca(null, 'G76P100060Q100R.1\n'), 'g76Acab', '10 passadas de acabamento', 'dica');
  nao(rosca(), 'g76Param', 'rosca correta');
  nao(rosca(), 'g76Rpm', 'rosca correta (600 rpm)');
}
/* ---- compensacao ---- */
{
  const ciclo = 'G0X70Z2\nG71U2R1\nG71P1Q2U.3W.05F.2\nN1G0X50\nG1Z-20\nN2X60\n';
  const ct = tem(CAB + 'G0X70Z2\nG42\nG1X60Z-10F.2\nT0202\nG28U0\nG40\nM9\nM30', 'compTroca', 'T com G42 ligado', 'aviso');
  ok(ct && ct.fix && ct.fix.texto === 'G40', 'compTroca: propoe G40 antes do T', ct && ct.fix);
  const cf = tem(CAB + 'G0X70Z2\nG42\nG1X60Z-10F.2\nG28U0\nM9\nM30', 'compFim', 'G42 nunca cancelado', 'aviso');
  ok(cf && cf.linha === 7 && cf.fix && cf.fix.linha === 11, 'compFim: aponta onde foi ligado e propoe G40 antes do M30', cf && [cf.linha, cf.fix]);
  if (cf) { const novo = D.aplicar(CAB + 'G0X70Z2\nG42\nG1X60Z-10F.2\nG28U0\nM9\nM30', [cf.fix]); ok(!diag(novo).some(x => x.cod === 'compFim'), 'compFim: depois de aplicar G40 o aviso some', novo); }
  // as duas mensagens que vem da montagem da cena (compensar) caem no catalogo certo
  ok(D.classifica('G42 ativo com a ferramenta T0101, mas ela não tem raio de ponta no banco (ou não é pastilha de torneamento): simulado sem compensação.') === 'compSemRaio', 'classifica: G41/G42 sem raio -> compSemRaio');
  ok(D.classifica('G42: num canto interno o movimento é menor que o raio de ponta (interferência): a ferramenta cortaria além do contorno.') === 'compInterf', 'classifica: canto interno -> compInterf');
  cob.compSemRaio = true; cob.compInterf = true;
  const cena = P.montarCena(P.interpretar(CAB + 'G0X70Z2\nG42\nG1X60Z-10F.2\nG40G0X80\nG28U0\nM9\nM30', { maq: MAQ }), { maq: MAQ });
  ok(cena.compAvisos.length >= 1, 'compensacao sem raio no banco gera aviso na cena', cena.compAvisos);
  const L = D.diagnosticar(null, '', { extras: cena.compAvisos });
  ok(L.length && L[0].cod === 'compSemRaio' && L[0].solucao.length, 'diagnostico junta o aviso da compensacao', L.map(x => x.cod));
}
/* ---- alertas do simulador ---- */
{
  const alerta = (type, text) => ({ type, text, line: 3, x: 50, z: -5 });
  const casos = [['placa', 'Colisão com a placa (castanhas) em X50 Z-5', 'simPlaca', 'erro'], ['peca', 'Corte dentro da peça acabada em X50 Z-5', 'simPeca', 'erro'], ['rapido', 'Avanço rápido (G0) dentro do material em X50 Z-5', 'simRapido', 'erro'],
    ['limite', 'X450 passa do curso de X (400)', 'simLimiteX', 'aviso'], ['limite', 'X-8 abaixo do centro', 'simLimiteXneg', 'aviso'], ['limite', 'Z450 passa do curso de Z (+400)', 'simLimiteZ', 'aviso'],
    ['limite', 'Z-460 abaixo do curso de Z (-450)', 'simLimiteZneg', 'aviso'], ['sobra', 'Sobra de material no fim do programa: maior região ≈ 9.0 mm²', 'simSobra', 'aviso']];
  casos.forEach(([tp, tx, cod, sev]) => {
    const it = D.deAlerta(alerta(tp, tx));
    ok(it.cod === cod && it.sev === sev && it.solucao.length >= 1 && it.causa, 'alerta do simulador (' + tp + ') -> ' + cod, it.cod);
    cob[cod] = true;
    ok(D.htmlAlerta(alerta(tp, tx)).indexOf('Como corrigir') > 0, 'alerta ' + cod + ': html com causa e solucao');
  });
  ok(D.deAlerta(alerta('placa', 'x')).gerador.length > 0, 'alerta placa: tem solucao especifica do Gerador');
  // alertas reais da simulacao viram diagnostico
  const R = P.interpretar('G1900D100L50K0\nT0101\nG96S250M4\nG50S1500\nG0X50Z-10\nM30', { maq: MAQ }), cena = P.montarCena(R, { maq: MAQ }), sim = new S.Sim(cena), an = sim.analyze();
  ok(an.alerts.length > 0 && D.deAlerta(an.alerts[0]).solucao.length > 0, 'alerta real da simulacao traz solucao', an.alerts.map(a => a.type));
}
/* ---- mensagens sem tipo, truncado e demais ---- */
{
  ok(D.classifica('qualquer coisa que o leitor nunca disse') === 'geral', 'classifica: mensagem desconhecida cai em "geral"');
  const L = D.diagnosticar({ erros: [{ linha: 0, texto: 'Mensagem nova do leitor' }], avisos: [], dicas: [] }, 'G0X10', {});
  ok(L.length === 1 && L[0].cod === 'geral' && L[0].sev === 'erro' && L[0].solucao.length, 'mensagem desconhecida vira item com solucao generica e fica como erro', L);
  ok(D.classifica('Programa gera mais de 150000 movimentos: a simulação foi cortada aqui.') === 'truncado', 'classifica: movimentos demais -> truncado');
  cob.truncado = true;
}

/* ---- aplicar correcoes ---- */
{
  const prog = ['T0101', 'G96S250M4', 'G0X100Z2', 'G1Z-5F.2(UM)', 'G28X0', 'M8', 'M30'].join('\n');
  const L = diag(prog), fx = L.filter(x => x.fix).map(x => x.fix);
  ok(fx.length >= 2, 'aplicar: varias correcoes juntas', L.map(x => x.cod));
  const novo = D.aplicar(prog, fx);
  const R = diag(novo);
  ok(!R.some(x => x.cod === 'g28Abs' || x.cod === 'g96semG50' || x.cod === 'semM9'), 'aplicar tudo: some o que tinha correcao', R.map(x => x.cod));
  ok(novo.indexOf('G28U0') > 0 && novo.indexOf('G50S2000') > 0 && /M9\nM30/.test(novo), 'aplicar tudo: o texto resultante tem as correcoes nos lugares certos', novo);
  ok(D.fixesExatos(L).every(f => f.exato), 'fixesExatos so devolve as exatas');
  ok(D.aplicar(prog, fx) === novo && D.aplicar(prog, fx.concat(fx)) === novo, 'aplicar: correcao repetida nao duplica');
  ok(/\(UM\)/.test(novo), 'aplicar: comentario da linha preservado');
}

/* ---- html ---- */
{
  const L = diag(CAB + 'G0X80Z2\nG1Z-5F300\nG28X0' + FIM);
  const h = D.html(L, { aplicar: true });
  ok(h.indexOf('dg-erro') > 0 || h.indexOf('dg-aviso') > 0, 'html: cartoes com a gravidade');
  ok(h.indexOf('Como corrigir') > 0 && h.indexOf('Por que acontece') > 0, 'html: causa e solucao');
  ok(h.indexOf('dg-aplica') > 0, 'html: botao de aplicar quando ha correcao');
  ok(D.html(L, {}).indexOf('dg-aplica') < 0, 'html: sem botao quando nao se aplica (janela do Gerador)');
  ok(h.indexOf('<script') < 0, 'html: sem script');
  const esc = D.html([{ cod: 'geral', sev: 'erro', linha: 0, texto: '<b>x</b> & "y"', titulo: 'T', causa: 'c', solucao: ['s'], fix: null }], {});
  ok(esc.indexOf('<b>x</b>') < 0 && esc.indexOf('&lt;b&gt;x') > 0, 'html: escapa o texto da mensagem');
}

/* ---- programas da casa: nenhum erro novo (so avisos que o leitor ja dava e dicas) ---- */
{
  const dir = path.join(__dirname, '..', 'Exemplos de programaçaõ');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const permitidos = { varNaoDef: 1, arcoHerdado: 1 }; // avisos que o leitor ja emitia nesses programas (variavel de valor externo; bloco sem G depois do arco)
  let n = 0;
  if (fs.existsSync(dir)) walk(dir).filter(f => /\.txt$/i.test(f)).forEach(f => {
    const t = fs.readFileSync(f).toString('latin1'), L = D.analisarTexto(t, MAQ), nome = path.basename(f);
    n++;
    ok(!L.some(x => x.sev === 'erro'), 'casa: ' + nome + ' sem erro no diagnostico', L.filter(x => x.sev === 'erro').map(x => x.cod));
    ok(L.filter(x => x.sev === 'aviso' && !permitidos[x.cod]).length === 0, 'casa: ' + nome + ' sem aviso novo', L.filter(x => x.sev === 'aviso' && !permitidos[x.cod]).map(x => x.cod + '@' + (x.linha + 1)));
  });
  console.log('  programas da casa conferidos:', n);
}

/* ---- programas do Gerador: nenhum erro de programacao ---- */
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
    ['matriz tubular', 'matriz_tubular', { dBruto: 230, lBruto: 72, dFinal: 225, lPeca: 70, lUsin: 31, raio: 3, folga: .3, prof: 4, dEnc: 188, passoEnc: 6 }, { t1: Object.assign({}, t1, acab), t2 }],
    ['espina cabeca', 'espina_cabeca', { dBruto: 256, lBruto: 72, dFinal: 245, lPeca: 70, lUsin: 30, folgaD: .3, dCab: 145, lCab: 25, folgaL: .2, rPonta: 1, rOmbro: 3, avFinal: .05 }, { t1: Object.assign({}, t1, acab) }],
    ['espina encaixe', 'espina_encaixe', { dBruto: 204, lBruto: 101, dFinal: 200, lPeca: 100, lUsin: 70, folga: .3, lEnc: 10.1, hEnc: 10, rFace: 5, rEnc: 3 }, { t1: Object.assign({}, t1, acab) }],
    ['peca simples + canal', 'peca_simples', Object.assign({}, d, { trechos1: [{ id: 'a', tipo: 'cil', a: 40, b: 20 }, { tipo: 'canal', a: 30, c: 4.5, seq: true }, { tipo: 'cil', a: 60, b: 10 }] }), { t1, t2 }],
    ['peca simples G72', 'peca_simples', Object.assign({}, d, { sentE1: 'trans' }), { t1, t2 }],
    ['peca simples G73 + G42', 'peca_simples', Object.assign({}, d, { sentE1: 'par', compRaio: 'sim' }), { t1, t2 }],
    ['peca simples furo + mandril G71 + G42/G41', 'peca_simples', big({ internos1: intA, compRaio: 'sim' }), { t1, t2, t3, t4 }],
    ['peca simples furo + mandril G72', 'peca_simples', big({ internos1: intA, sentI1: 'trans' }), { t1, t2, t3, t4 }],
    ['peca simples rosca externa', 'peca_simples', Object.assign({}, d, { dBruto: 120, lBruto: 102, lPeca: 100, trechos1: [{ id: 'a', tipo: 'cil', a: 20, b: 10 }, { id: 'r', tipo: 'rosca', a: 30, b: 20, c: 2 }, { tipo: 'canal', a: 26, c: 4.5, seq: true }, { id: 'b', tipo: 'cil', a: 50, b: 15 }] }), { t1, t2, t6 }]
  ];
  casos.forEach(([nome, g, f, tools]) => {
    const r = (C.GERADORES[g] || C.INTERNOS[g]).gerar(f, tools, { autor: 'F', data: 'OUT/2026' }), rs = r.lados || [r];
    rs.forEach((l, li) => {
      if (!l.code || !l.cena) { ok(false, 'gerador: ' + nome + ' gerou codigo', l.erros); return; }
      const L = D.analisarTexto(l.code, l.cena.maq), nm = 'Gerador: ' + nome + (rs.length > 1 ? ' lado ' + (li + 1) : '');
      ok(!L.some(x => x.sev === 'erro'), nm + ' sem erro de programacao', L.filter(x => x.sev === 'erro').map(x => x.cod + '@' + (x.linha + 1)));
      const av = L.filter(x => x.sev === 'aviso' && x.cod !== 'varNaoDef');
      ok(av.length === 0, nm + ' sem aviso de programacao', av.map(x => x.cod + '@' + (x.linha + 1) + ': ' + x.texto));
    });
  });
}

/* ---- Siemens em modo ISO (2.7.1): G92 S e G291 nao geram aviso falso ---- */
{
  const L = diag(['G291', 'G90G40G21G95', 'T0101', 'G96S1000', 'G92S1200M3', 'G0X64Z2', 'G1Z-5F.2', 'G28U0', 'M9', 'M30'].join('\n'));
  ok(!L.some(x => x.cod === 'gIgnorado' || x.cod === 'g96semG50'), 'diag Siemens ISO: G291 e G92 S sem aviso', L.map(x => x.cod));
  ok(D.CAT.g96semG50.solucao.join(' ').indexOf('G92') > 0, 'catalogo: g96semG50 cita o G92 S do Siemens em modo ISO');
}

/* ---- cobertura: todo tipo do catalogo foi exercitado ---- */
{
  const faltam = Object.keys(D.CAT).filter(c => c !== 'geral' && !cob[c]);
  ok(faltam.length === 0, 'cobertura: todo tipo de erro do catalogo tem caso de teste', faltam);
  ok(Object.keys(D.CAT).every(c => D.CAT[c].sev && D.CAT[c].grupo && D.CAT[c].titulo && D.CAT[c].causa && D.CAT[c].solucao.length), 'catalogo: todo registro tem gravidade, grupo, titulo, causa e solucao');
  console.log('  tipos de erro no catalogo:', Object.keys(D.CAT).length);
}

console.log('#### MODULO DIAGNOSTICO:', total, 'verificacoes,', falhas, 'falha' + (falhas === 1 ? '' : 's'));
if (falhas) process.exitCode = 1;
