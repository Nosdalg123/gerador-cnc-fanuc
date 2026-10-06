const C=require('./core.js'), S=require('./sim.js');
const t1={nome:'W - DESBASTE EXTERNO',t:'0101',tipo:'externa',modo:'G96',vc:300,rpm:2000,avDesb:.45,avAcab:.15,incFace:1,incTorn:3,sentido:4,angulo:80,raio:0.8};
const t2={nome:'ENCAIXE 4.5',t:'0303',tipo:'encaixe',modo:'G96',vc:250,rpm:2000,avDesb:.3,avAcab:.15,incCanal:1.175,largura:4.5,sentido:4};
const fs={dBruto:201,lBruto:52,dFinal:200,lPeca:50,lUsin:14,raio:3,folga:1};
const ft={dBruto:230,lBruto:72,dFinal:225,lPeca:70,lUsin:31,raio:3,folga:.3,prof:4,dEnc:188,passoEnc:6};
const fc={dBruto:256,lBruto:72,dFinal:245,lPeca:70,lUsin:30,folgaD:.3,dCab:145,lCab:25,folgaL:.2,rPonta:1,rOmbro:3,avFinal:.05};
const fe={dBruto:204,lBruto:101,dFinal:200,lPeca:100,lUsin:70,folga:.3,lEnc:10.1,hEnc:10,rFace:5,rEnc:3};
const acab={acabFace:.08,acabTorn:.1};
const verbose=process.argv.includes('-v');
function run(nome,g,f,tools,mod,pre){
  const G=pre?null:(C.GERADORES[g]||C.INTERNOS[g]); const r=pre||G.gerar(f,tools,{maq:mod,autor:'FERRAMENTARIA',data:'OUT/2026'});
  if(r.lados&&!pre){ const out=r.lados.map((l,i)=>run(nome+' > '+l.titulo,null,null,null,null,l)); return {r,lados:out}; }
  if(r.erros.length){console.log('\n==',nome,'ERROS',r.erros);return r}
  const sim=new S.Sim(r.cena); const a=sim.analyze();
  console.log('\n==',nome,'| segs',sim.segs.length,'tempo',a.total.toFixed(1)+'s corte',a.tCut.toFixed(1),'rapido',a.tRapid.toFixed(1),'sobra',a.sobraArea.toFixed(2),'avisos',r.avisos.length);
  r.avisos.forEach(x=>console.log('  AVISO',x));
  a.alerts.forEach(x=>console.log('  ALERTA',x.type,'linha',x.line,(r.code.split('\n')[x.line]||'').slice(0,40),'|',x.text));
  return {r,sim,a};
}
function vars(code){const d=new Set(),bad=[];code.split('\n').forEach((l,i)=>{const m=l.match(/^#(\d+)=([^()]*)/);const body=l.replace(/\([^)]*\)/g,'');
 // variaveis atribuidas no meio do programa tambem contam
 const asg=body.match(/^#(\d+)=(.*)$/); const src=m?m[2]:(asg?asg[2]:body);
 [...src.matchAll(/#(\d+)/g)].forEach(x=>{if(!d.has(x[1]))bad.push((i+1)+':#'+x[1])});if(m)d.add(m[1]);else if(asg)d.add(asg[1]);});return bad}
function chk(x){ if(x&&x.r&&x.r.code){const b=vars(x.r.code); if(b.length)console.log('  VARS INDEF',b)} return x}
chk(run('SOLIDA padrao','matriz_solida',fs,{t1}));
chk(run('SOLIDA com acabamento .08/.1','matriz_solida',fs,{t1:{...t1,...acab}}));
chk(run('SOLIDA acab so diametro','matriz_solida',fs,{t1:{...t1,acabTorn:.2}}));
chk(run('SOLIDA acab so face','matriz_solida',fs,{t1:{...t1,acabFace:.3}}));
chk(run('SOLIDA acab sem raio','matriz_solida',{...fs,raio:0},{t1:{...t1,...acab}}));
chk(run('SOLIDA acab sobremetal grande','matriz_solida',{...fs,dBruto:210,lBruto:56},{t1:{...t1,acabFace:.5,acabTorn:.6,incFace:1.5,incTorn:2}}));
chk(run('TUBULAR com acabamento','matriz_tubular',ft,{t1:{...t1,...acab},t2}));
chk(run('CABECA padrao (acab 0)','espina_cabeca',fc,{t1}));
chk(run('CABECA casa (.1/.08)','espina_cabeca',fc,{t1:{...t1,...acab}}));
// colisao forcada no simulador: gera com grip pequeno (passa na validacao) e depois fecha a placa na cena
{ const r=C.INTERNOS.espina_cabeca.gerar({...fc,lPeca:40,lBruto:42,grip:5},{t1:{...t1,...acab}},{autor:'FERRAMENTARIA',data:'OUT/2026'}); r.cena.chuck.zFace+=20; chk(run('CABECA placa forcada (simulador)',null,null,null,null,r)); }
chk(run('CABECA lUsin alem do trecho livre (erro de validacao)','espina_cabeca',{...fc,lPeca:40,lBruto:42},{t1:{...t1,...acab}}));
chk(run('SOLIDA grip alto (erro)','matriz_solida',{...fs,grip:40},{t1}));
chk(run('SOLIDA pressao M35 + grip 30','matriz_solida',{...fs,grip:30,pressao:'M35'},{t1}));
chk(run('ENCAIXE padrao','espina_encaixe',fe,{t1}));
chk(run('ENCAIXE com acabamento','espina_encaixe',fe,{t1:{...t1,...acab}}));
chk(run('ENCAIXE altura 8 (passe unico)','espina_encaixe',{...fe,hEnc:8,rFace:4,rEnc:3},{t1:{...t1,...acab}}));
chk(run('ENCAIXE sem sobremetal Z','espina_encaixe',{...fe,lBruto:100},{t1}));
const fesp={dFinal:245,dEnc:235,lEnc:10.1,lCorpo:60,lCab:25,dCab:145,dBruto:256,lBruto:99,sobre1:2,rFace:5,rEnc:3,rPonta:1,rOmbro:3,folga:.3,folgaL:.2,avFinal:.05};
chk(run('ESPINA 2 lados (acab 0)','espina',fesp,{t1}));
chk(run('ESPINA 2 lados (casa .1/.08)','espina',fesp,{t1:{...t1,...acab}}));
chk(run('ESPINA bruto curto','espina',{...fesp,lBruto:90},{t1}));
chk(run('ESPINA limite lado 1 = 71 (M34)','espina',{...fesp,lim1:71,pressao:'M34'},{t1}));
chk(run('ESPINA limite lado 1 = 60 (< G: lado 2 automatico cobre o resto)','espina',{...fesp,lim1:60},{t1}));
chk(run('ESPINA limite lado 2 = 20 (nao chega ao ombro, erro)','espina',{...fesp,lim2:20},{t1}));
chk(run('ESPINA limites nao se encontram (lado1 40 + lado2 40 < 95.1, erro)','espina',{...fesp,lim1:40,lim2:40},{t1}));
chk(run('ESPINA limites 70.1 + 25.5 (sobreposicao pequena, aviso)','espina',{...fesp,lim1:70.1,lim2:30},{t1}));
chk(run('ESPINA limite lado 2 = 50 explicito','espina',{...fesp,lim2:50},{t1}));
chk(run('ESPINA limite lado 1 alem da placa (erro)','espina',{...fesp,lim1:80},{t1}));
chk(run('ESPINA grip 1 = 35 (erro: G nao cabe)','espina',{...fesp,grip1:35},{t1}));
{ const r=C.GERADORES.espina.gerar({...fesp,pressao:'M34'},{t1},{}); console.log('\nM34 no lado 1:',/\nM34\n/.test(r.lados[0].code),' no lado 2:',/\nM34\n/.test(r.lados[1].code)); const r0=C.GERADORES.espina.gerar({...fesp,pressao:''},{t1},{}); console.log('sem pressao -> M34 ausente:',!/M34/.test(r0.lados[0].code+r0.lados[1].code)); }
chk(run('ESPINA B>=A','espina',{...fesp,dEnc:250},{t1}));
// ---- peca simples ----
const T=C.GERADORES.peca_simples, dflt={}; T.campos.forEach(c=>dflt[c.id]=c.def);
const ps=(o)=>({...dflt,...o});
chk(run('PECA SIMPLES padrao (1 lado, com canal)','peca_simples',ps({}),{t1,t2}));
chk(run('PECA SIMPLES acabamento .3/.05','peca_simples',ps({}),{t1:{...t1,acabTorn:.3,acabFace:.05},t2}));
chk(run('PECA SIMPLES sem canal','peca_simples',ps({trechos1:[{tipo:'cil',a:40,b:30},{tipo:'raio',a:3,canto:'int'},{tipo:'cil',a:60,b:20}]}),{t1}));
chk(run('PECA SIMPLES raio e chanfro nos cantos','peca_simples',ps({trechos1:[{tipo:'raio',a:2,canto:'ext'},{tipo:'cil',a:30,b:20},{tipo:'raio',a:3,canto:'int'},{tipo:'chanfro',a:2,canto:'ext'},{tipo:'cil',a:50,b:25},{tipo:'chanfro',a:1.5,canto:'int'}]}),{t1}));
chk(run('PECA SIMPLES 2 lados','peca_simples',ps({lados:'2',sobre1:1,lPeca:100,trechos1:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:40,b:20},{tipo:'cone',a:40,b:60,c:10}],trechos2:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:50,b:30},{tipo:'canal',a:44,b:10,c:4.5}]}),{t1,t2}));
chk(run('PECA SIMPLES erro: diametro diminui','peca_simples',ps({trechos1:[{tipo:'cil',a:60,b:20},{tipo:'cil',a:40,b:20}]}),{t1,t2}));
chk(run('PECA SIMPLES erro: cone que diminui','peca_simples',ps({trechos1:[{tipo:'cone',a:60,b:40,c:20}]}),{t1,t2}));
chk(run('PECA SIMPLES erro: chanfro em cone','peca_simples',ps({trechos1:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cone',a:40,b:60,c:20}]}),{t1,t2}));
chk(run('PECA SIMPLES erro: canal mais estreito que a ferramenta','peca_simples',ps({trechos1:[{tipo:'cil',a:60,b:30},{tipo:'canal',a:50,b:10,c:3}]}),{t1,t2}));
chk(run('PECA SIMPLES erro: passa da placa','peca_simples',ps({lPeca:60,lBruto:62}),{t1,t2}));
chk(run('PECA SIMPLES erro: sem ferramenta de canal','peca_simples',ps({}),{t1}));
// ---- matrizes: desbaste transversal do diametro (G75) ----
chk(run('SOLIDA transversal (G75)','matriz_solida',{...fs,sentTorn:'trans'},{t1}));
chk(run('SOLIDA transversal com acabamento .08/.1','matriz_solida',{...fs,sentTorn:'trans'},{t1:{...t1,...acab}}));
chk(run('SOLIDA transversal lUsin menor que incremento','matriz_solida',{...fs,sentTorn:'trans',lUsin:.8},{t1}));
chk(run('SOLIDA transversal sobremetal grande no Ø','matriz_solida',{...fs,dBruto:210,lBruto:56,sentTorn:'trans'},{t1:{...t1,incFace:2}}));
chk(run('TUBULAR transversal com acabamento','matriz_tubular',{...ft,sentTorn:'trans'},{t1:{...t1,...acab},t2}));
{ const r=C.GERADORES.matriz_solida.gerar({...fs,sentTorn:'trans'},{t1:{...t1,...acab}},{autor:'FERRAMENTARIA',data:'OUT/2026'}); if(verbose) console.log('\n---- solida transversal\n'+r.code); }
// ---- peca simples: sentido do desbaste e trechos internos ----
const t3={nome:'T-MAX 42MM (FURACAO)',t:'0303',tipo:'furacao',modo:'G97',vc:0,rpm:1000,avDesb:.2,incTorn:3,sentido:3,diametro:30};
const t4={nome:'DESBASTE INTERNO',t:'0606',tipo:'interna',modo:'G96',vc:280,rpm:2000,avDesb:.3,avAcab:.2,incFace:0,incTorn:1,sentido:4,angulo:80,raio:.4};
const trE=[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:100,b:50}];
const big=(o)=>ps({dBruto:102,lBruto:82,lPeca:80,trechos1:trE,...o});
const intA=[{tipo:'furo',a:30,b:50},{tipo:'icil',a:60,b:30},{tipo:'icil',a:45,b:20},{tipo:'ichanfro',a:1,canto:'boca'}];
chk(run('PS externo transversal (G72)','peca_simples',ps({sentE1:'trans'}),{t1,t2}));
chk(run('PS externo transversal com acabamento .3/.05','peca_simples',ps({sentE1:'trans'}),{t1:{...t1,acabTorn:.3,acabFace:.05},t2}));
chk(run('PS furo + mandrilamento longitudinal (G71)','peca_simples',big({internos1:intA}),{t1,t2,t3,t4}));
chk(run('PS furo + mandrilamento transversal (G72)','peca_simples',big({internos1:intA,sentI1:'trans'}),{t1,t2,t3,t4}));
chk(run('PS mandrilamento com acabamento .2/.1','peca_simples',big({internos1:intA}),{t1,t2,t3,t4:{...t4,acabTorn:.2,acabFace:.1}}));
chk(run('PS interno cone + raio de fundo','peca_simples',big({internos1:[{tipo:'furo',a:30,b:50},{tipo:'icil',a:60,b:20},{tipo:'icone',a:60,b:40,c:15},{tipo:'icil',a:40,b:10},{tipo:'iraio',a:3,canto:'fundo'},{tipo:'iraio',a:2,canto:'boca'}]}),{t1,t2,t3,t4}));
chk(run('PS so furo','peca_simples',big({internos1:[{tipo:'furo',a:30,b:50}]}),{t1,t2,t3}));
chk(run('PS furo passante + mandril','peca_simples',big({internos1:[{tipo:'furo',a:30,b:80},{tipo:'icil',a:50,b:80}]}),{t1,t2,t3,t4}));
chk(run('PS 2 lados com internos nos dois','peca_simples',big({lados:'2',sobre1:1,lPeca:80,trechos1:[{tipo:'cil',a:100,b:30}],trechos2:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:100,b:30}],
  internos1:[{tipo:'furo',a:30,b:60},{tipo:'icil',a:60,b:25}],internos2:[{tipo:'furo',a:30,b:30},{tipo:'icil',a:50,b:20}],sentI2:'trans',sentE2:'trans'}),{t1,t2,t3,t4}));
chk(run('PS mandrilamento sem furo (assume furo passante = menor Ø)','peca_simples',big({internos1:[{tipo:'icil',a:60,b:30}]}),{t1,t2,t3,t4}));
chk(run('PS perfil escalonado sem furo: Ø50x20 + Ø30x40 (assume passante Ø30)','peca_simples',big({internos1:[{tipo:'icil',a:50,b:20},{tipo:'icil',a:30,b:40}]}),{t1,t2,t4}));
chk(run('PS escalonado 3 diametros sem furo, transversal','peca_simples',big({internos1:[{tipo:'icil',a:60,b:15},{tipo:'icone',a:60,b:40,c:15},{tipo:'icil',a:30,b:20}],sentI1:'trans'}),{t1,t2,t4}));
chk(run('PS 2 lados escalonado sem furo nos dois lados','peca_simples',big({lados:'2',sobre1:1,lPeca:80,trechos1:[{tipo:'cil',a:100,b:30}],trechos2:[{tipo:'cil',a:100,b:30}],internos1:[{tipo:'icil',a:60,b:20},{tipo:'icil',a:40,b:30}],internos2:[{tipo:'icil',a:55,b:20},{tipo:'icil',a:40,b:20}]}),{t1,t2,t4}));
chk(run('PS escalonado sem furo + erro: diametro aumenta','peca_simples',big({internos1:[{tipo:'icil',a:30,b:20},{tipo:'icil',a:50,b:20}]}),{t1,t2,t4}));
chk(run('PS erro: Ø interno aumenta indo ao fundo','peca_simples',big({internos1:[{tipo:'furo',a:30,b:50},{tipo:'icil',a:50,b:20},{tipo:'icil',a:60,b:20}]}),{t1,t2,t3,t4}));
chk(run('PS erro: furo mais curto que o mandrilamento','peca_simples',big({internos1:[{tipo:'furo',a:30,b:20},{tipo:'icil',a:60,b:30}]}),{t1,t2,t3,t4}));
chk(run('PS erro: Ø interno menor que o furo','peca_simples',big({internos1:[{tipo:'furo',a:30,b:50},{tipo:'icil',a:25,b:30}]}),{t1,t2,t3,t4}));
chk(run('PS erro: parede furada','peca_simples',big({internos1:[{tipo:'furo',a:30,b:50},{tipo:'icil',a:100,b:30}]}),{t1,t2,t3,t4}));
chk(run('PS aviso: parede fina','peca_simples',big({internos1:[{tipo:'furo',a:30,b:50},{tipo:'icil',a:96,b:30}]}),{t1,t2,t3,t4}));
chk(run('PS erro: furo passa da peca','peca_simples',big({internos1:[{tipo:'furo',a:30,b:90}]}),{t1,t2,t3}));
chk(run('PS erro: sem broca selecionada','peca_simples',big({internos1:intA}),{t1,t2,t4}));
chk(run('PS erro: sem barra selecionada','peca_simples',big({internos1:intA}),{t1,t2,t3}));
// ---- raio 0 na cabeca (antes gerava G3 R0 e NaN no simulador) ----
chk(run('ESPINA raio ponta da cabeca = 0','espina',{...fesp,rPonta:0},{t1:{...t1,...acab}}));
chk(run('ESPINA raio do ombro da cabeca = 0','espina',{...fesp,rOmbro:0},{t1:{...t1,...acab}}));
chk(run('ESPINA os dois raios da cabeca = 0','espina',{...fesp,rPonta:0,rOmbro:0},{t1}));
// ---- so externo / so interno / ambos ----
chk(run('PS so externo (ignora internos)','peca_simples',big({usin1:'ext',internos1:intA}),{t1,t2}));
chk(run('PS so interno (sem externo)','peca_simples',big({usin1:'int',internos1:intA}),{t1,t2,t3,t4}));
chk(run('PS so interno, escalonado sem furo','peca_simples',big({usin1:'int',internos1:[{tipo:'icil',a:50,b:20},{tipo:'icil',a:30,b:40}]}),{t1,t2,t4}));
chk(run('PS so interno transversal','peca_simples',big({usin1:'int',sentI1:'trans',internos1:intA}),{t1,t2,t3,t4}));
chk(run('PS 2 lados: lado 1 externo, lado 2 so interno','peca_simples',big({lados:'2',sobre1:1,lPeca:80,usin1:'ext',usin2:'int',trechos1:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:100,b:40}],internos2:[{tipo:'furo',a:30,b:60},{tipo:'icil',a:50,b:30}]}),{t1,t2,t3,t4}));
chk(run('PS 2 lados: lado 1 so interno, lado 2 externo','peca_simples',big({lados:'2',sobre1:1,lPeca:80,usin1:'int',usin2:'ext',trechos2:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:100,b:40}],internos1:[{tipo:'furo',a:30,b:60},{tipo:'icil',a:50,b:30}]}),{t1,t2,t3,t4}));
chk(run('PS erro: so interno sem trechos internos','peca_simples',big({usin1:'int',internos1:[]}),{t1,t2}));
chk(run('PS so externo sem trechos externos (erro)','peca_simples',big({usin1:'ext',trechos1:[]}),{t1,t2}));
if(verbose){ const r=T.gerar(big({usin1:'int',internos1:intA}),{t1,t2,t3,t4},{autor:'FERRAMENTARIA',data:'OUT/2026'}); console.log('\n---- so interno\n'+r.code); }// ---- bruto com furo(s) existente(s) ----
const bI=(a,b)=>({tipo:'bcil',a,b});
const mandA=[{tipo:'icil',a:60,b:30},{tipo:'icil',a:45,b:20}];
chk(run('BRUTO tubo passante Ø40 + mandrilamento sem broca','peca_simples',big({brutoInt:[bI(40,82)],internos1:mandA}),{t1,t2,t4}));
chk(run('BRUTO furo escalonado Ø40x30 + Ø30x40, mandrila ate 50 (piloto Ø30)','peca_simples',big({brutoInt:[bI(40,30),bI(30,40)],internos1:mandA}),{t1,t2,t4}));
chk(run('BRUTO furo + broca maior (alarga)','peca_simples',big({brutoInt:[bI(20,82)],internos1:[{tipo:'furo',a:30,b:50},...mandA]}),{t1,t2,t3,t4}));
chk(run('BRUTO so furo existente (sem internos)','peca_simples',big({brutoInt:[bI(40,50)]}),{t1,t2}));
chk(run('BRUTO 2 lados: tubo passante, mandrila nos dois lados sem broca','peca_simples',big({lados:'2',sobre1:1,lPeca:80,brutoInt:[bI(40,82)],trechos1:[{tipo:'cil',a:100,b:30}],trechos2:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:100,b:30}],internos1:[{tipo:'icil',a:60,b:25}],internos2:[{tipo:'icil',a:50,b:20}],sentI2:'trans'}),{t1,t2,t4}));
chk(run('BRUTO 2 lados: furo cego do lado 2 (60) visto no lado 1','peca_simples',big({lados:'2',sobre1:1,lPeca:80,brutoInt:[bI(40,60)],brutoIntLado:'2',trechos1:[{tipo:'cil',a:100,b:30}],trechos2:[{tipo:'cil',a:100,b:30}],internos2:[{tipo:'icil',a:55,b:25}]}),{t1,t2,t4}));
chk(run('BRUTO erro: furo existente nao chega a profundidade do mandrilamento','peca_simples',big({brutoInt:[bI(30,20)],internos1:mandA}),{t1,t2,t4}));
chk(run('BRUTO erro: furo comeca na face oposta (sem piloto neste lado)','peca_simples',big({brutoInt:[bI(30,40)],brutoIntLado:'2',internos1:mandA}),{t1,t2,t4}));
chk(run('BRUTO erro: Ø sem parede','peca_simples',big({brutoInt:[bI(102,10)]}),{t1,t2}));
chk(run('BRUTO erro: comprimento maior que o bloco','peca_simples',big({brutoInt:[bI(30,50),bI(20,50)]}),{t1,t2}));
chk(run('BRUTO erro: Ø interno do mandrilamento menor que o piloto','peca_simples',big({brutoInt:[bI(40,82)],internos1:[{tipo:'icil',a:35,b:20}]}),{t1,t2,t4}));
if(verbose){ const r=T.gerar(big({brutoInt:[bI(40,82)],internos1:mandA}),{t1,t2,t4},{autor:'FERRAMENTARIA',data:'OUT/2026'}); console.log('\n---- bruto tubo\n'+r.code); }
if(verbose){ for (const [nm,o] of [['G71 interno',big({internos1:intA})],['G72 externo+interno',big({internos1:intA,sentI1:'trans',sentE1:'trans'})]]){ const r=T.gerar(o,{t1,t2,t3,t4},{autor:'FERRAMENTARIA',data:'OUT/2026'}); console.log('\n----',nm,'\n'+r.code); } }
if(verbose){ const r=T.gerar(ps({}),{t1,t2},{autor:'FERRAMENTARIA',data:'OUT/2026'}); console.log('\n---- peca simples\n'+r.code); }
if(verbose){ for (const [g,f,tl] of [['espina_cabeca',fc,{t1:{...t1,...acab}}],['espina_encaixe',fe,{t1:{...t1,...acab}}]]){ console.log('\n----',g); console.log((C.GERADORES[g]||C.INTERNOS[g]).gerar(f,tl,{autor:'FERRAMENTARIA',data:'OUT/2026'}).code); } }

// ---- v1.2.0: chanfro/raio em um canto escolhido (alvo = id do trecho, onde = ini/fim) ----
{
  const M={autor:'FERRAMENTARIA',data:'OUT/2026'}, T=C.GERADORES.peca_simples;
  const mig=(f)=>{ const g=JSON.parse(JSON.stringify(f)); ['trechos1','trechos2'].forEach(k=>g[k]&&C.psMigra(g[k],false)); ['internos1','internos2'].forEach(k=>g[k]&&C.psMigra(g[k],true)); return g; };
  const igual=(nome,f,tools)=>{ const a=T.gerar(f,tools,M), b=T.gerar(mig(f),tools,M); const ca=a.code||(a.lados&&a.lados.map(l=>l.code).join('|')), cb=b.code||(b.lados&&b.lados.map(l=>l.code).join('|')); console.log('\n== MIGRACAO',nome,'| codigo identico:',ca&&ca===cb?'SIM':'NAO',(a.erros||[]).length?JSON.stringify(a.erros)+' vs '+JSON.stringify(b.erros):''); };
  igual('padrao',ps({}),{t1,t2});
  igual('raio e chanfro nos cantos',ps({trechos1:[{tipo:'raio',a:2,canto:'ext'},{tipo:'cil',a:30,b:20},{tipo:'raio',a:3,canto:'int'},{tipo:'chanfro',a:2,canto:'ext'},{tipo:'cil',a:50,b:25},{tipo:'chanfro',a:1.5,canto:'int'}]}),{t1});
  igual('interno boca/fundo',big({internos1:[{tipo:'furo',a:30,b:50},{tipo:'icil',a:60,b:20},{tipo:'icone',a:60,b:40,c:15},{tipo:'icil',a:40,b:10},{tipo:'iraio',a:3,canto:'fundo'},{tipo:'iraio',a:2,canto:'boca'}]}),{t1,t2,t3,t4});
  igual('2 lados',ps({lados:'2',sobre1:1,lPeca:100,trechos1:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:40,b:20},{tipo:'cone',a:40,b:60,c:10}],trechos2:[{tipo:'chanfro',a:1,canto:'ext'},{tipo:'cil',a:50,b:30},{tipo:'canal',a:44,b:10,c:4.5}]}),{t1,t2});
  // cantos de degrau escolhidos pelo id (a ordem na lista nao importa)
  const L=[{id:'a',tipo:'cil',a:30,b:20},{id:'b',tipo:'cil',a:50,b:25},{id:'c',tipo:'cil',a:60,b:15}];
  console.log('\n== CANTOS externos:',C.psCantos(L,31).map(c=>c.alvo+'/'+c.onde+' '+c.rot).join(' | '));
  chk(run('PS canto escolhido: quina do degrau Ø30→Ø50 (raio) + pe do degrau Ø50→Ø60 (chanfro)','peca_simples',ps({trechos1:[{tipo:'raio',a:3,alvo:'b',onde:'ini'},...L,{tipo:'chanfro',a:2,alvo:'b',onde:'fim'}]}),{t1,t2}));
  chk(run('PS canto escolhido: pe do ultimo degrau ate o bruto','peca_simples',ps({trechos1:[...L,{tipo:'raio',a:1,alvo:'c',onde:'fim'}]}),{t1,t2}));
  chk(run('PS erro: canto sem escolher','peca_simples',ps({trechos1:[...L,{tipo:'raio',a:1,alvo:''}]}),{t1,t2}));
  chk(run('PS erro: canto de trecho removido','peca_simples',ps({trechos1:[...L,{tipo:'raio',a:1,alvo:'zz',onde:'ini'}]}),{t1,t2}));
  chk(run('PS erro: dois no mesmo canto','peca_simples',ps({trechos1:[...L,{tipo:'raio',a:1,alvo:'b',onde:'ini'},{tipo:'chanfro',a:1,alvo:'b',onde:'ini'}]}),{t1,t2}));
  chk(run('PS erro: raio maior que o degrau','peca_simples',ps({trechos1:[...L,{tipo:'raio',a:12,alvo:'b',onde:'ini'}]}),{t1,t2}));
  // internos: degrau entre dois cilindros
  const I=[{id:'i1',tipo:'icil',a:60,b:20},{id:'i2',tipo:'icil',a:45,b:20},{id:'i3',tipo:'icil',a:35,b:15}];
  console.log('\n== CANTOS internos:',C.psCantosInt(I,15).map(c=>c.alvo+'/'+c.onde+' '+c.rot).join(' | '));
  const furo={tipo:'furo',a:30,b:60};
  chk(run('PS interno: quina do degrau (raio) + pe do degrau (chanfro) + fundo','peca_simples',big({internos1:[furo,...I,{tipo:'iraio',a:2,alvo:'i2',onde:'ini'},{tipo:'ichanfro',a:1.5,alvo:'i1',onde:'fim'},{tipo:'ichanfro',a:1,alvo:'i3',onde:'fim'},{tipo:'iraio',a:1,alvo:'i1',onde:'ini'}]}),{t1,t2,t3,t4}));
  chk(run('PS interno erro: canto maior que o degrau','peca_simples',big({internos1:[furo,...I,{tipo:'ichanfro',a:9,alvo:'i2',onde:'ini'}]}),{t1,t2,t3,t4}));
  chk(run('PS interno erro: dois cantos do mesmo degrau nao cabem','peca_simples',big({internos1:[furo,...I,{tipo:'ichanfro',a:4,alvo:'i1',onde:'fim'},{tipo:'ichanfro',a:4,alvo:'i2',onde:'ini'}]}),{t1,t2,t3,t4}));
}