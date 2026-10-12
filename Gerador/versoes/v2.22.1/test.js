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
  // Regressão v2.19: raio na quina de entrada do CONE (Ø40 -> Ø120 -> Ø163).
  const coneBase=[{id:'rc-cil',tipo:'cil',a:40,b:60},{id:'rc-cone',tipo:'cone',a:120,b:163,c:45}];
  const coneCantos=C.psCantos(coneBase,85);
  if(!coneCantos.some(c=>c.alvo==='rc-cone'&&c.onde==='ini'))
    throw Error('Regressão: quina na entrada do cone não aparece para selecionar');
  const rounded=T.gerar(ps({dBruto:170,lBruto:180,lPeca:160,trechos1:[...coneBase,{tipo:'raio',a:3,alvo:'rc-cone',onde:'ini'}]}),{t1,t2},M);
  if((rounded.erros||[]).length)throw Error('Raio R3 cone não aceito: '+rounded.erros.join(' | '));
  const textCone=rounded.code||(rounded.lados||[]).map(l=>l.code||'').join('\n');
  if(!/G3X[^\n]+Z-[^\n]+R3/.test(textCone))throw Error('Raio na entrada do cone não produziu G3 R3');
  const largeCone=T.gerar(ps({dBruto:170,lBruto:180,lPeca:160,trechos1:[...coneBase,{tipo:'raio',a:90,alvo:'rc-cone',onde:'ini'}]}),{t1,t2},M);
  if(!(largeCone.erros||[]).some(x=>/não cabe na entrada do cone/.test(x)))
    throw Error('Raio acima do espaço do cone não foi bloqueado');
  // internos: degrau entre dois cilindros
  const I=[{id:'i1',tipo:'icil',a:60,b:20},{id:'i2',tipo:'icil',a:45,b:20},{id:'i3',tipo:'icil',a:35,b:15}];
  console.log('\n== CANTOS internos:',C.psCantosInt(I,15).map(c=>c.alvo+'/'+c.onde+' '+c.rot).join(' | '));
  const furo={tipo:'furo',a:30,b:60};
  chk(run('PS interno: quina do degrau (raio) + pe do degrau (chanfro) + fundo','peca_simples',big({internos1:[furo,...I,{tipo:'iraio',a:2,alvo:'i2',onde:'ini'},{tipo:'ichanfro',a:1.5,alvo:'i1',onde:'fim'},{tipo:'ichanfro',a:1,alvo:'i3',onde:'fim'},{tipo:'iraio',a:1,alvo:'i1',onde:'ini'}]}),{t1,t2,t3,t4}));
  chk(run('PS interno erro: canto maior que o degrau','peca_simples',big({internos1:[furo,...I,{tipo:'ichanfro',a:9,alvo:'i2',onde:'ini'}]}),{t1,t2,t3,t4}));
  chk(run('PS interno erro: dois cantos do mesmo degrau nao cabem','peca_simples',big({internos1:[furo,...I,{tipo:'ichanfro',a:4,alvo:'i1',onde:'fim'},{tipo:'ichanfro',a:4,alvo:'i2',onde:'ini'}]}),{t1,t2,t3,t4}));
}

// ---- v1.4.0: canal sequencial (entra depois do ultimo elemento e ocupa a largura dele) ----
{
  const M={autor:'FERRAMENTARIA',data:'OUT/2026'}, T=C.GERADORES.peca_simples;
  const cod=(f)=>{ const r=T.gerar(f,{t1,t2},M); return r.code?r.code:'ERRO '+JSON.stringify(r.erros); };
  const seq=ps({trechos1:[{id:'a',tipo:'cil',a:40,b:20},{tipo:'canal',a:30,c:4.5,seq:true},{id:'b',tipo:'cil',a:50,b:10}]});
  const abs=ps({trechos1:[{id:'a',tipo:'cil',a:40,b:24.5},{tipo:'canal',a:30,b:20,c:4.5},{id:'b',tipo:'cil',a:50,b:10}]});
  const a=cod(seq), b=cod(abs);
  console.log('\n== CANAL SEQUENCIAL equivale ao canal por Z absoluto (cil 20 + canal 4.5 = cil 24.5, canal em Z20):', a===b?'SIM':'NAO', a.startsWith('ERRO')?a:'');
  const r2=cod(ps({trechos1:[{id:'a',tipo:'cil',a:40,b:20},{tipo:'canal',a:30,c:4.5,seq:true},{tipo:'canal',a:30,c:4.5,seq:true},{id:'b',tipo:'cil',a:50,b:10}]}));
  console.log('== 2 canais seguidos (o 2o comeca onde o 1o termina):',r2.startsWith('ERRO')?r2:'ok (Z20 e Z24.5)');
  chk(run('PS canal sequencial no fim da peca','peca_simples',ps({trechos1:[{id:'a',tipo:'cil',a:40,b:30},{tipo:'canal',a:30,c:4.5,seq:true}]}),{t1,t2}));
  chk(run('PS erro: canal sequencial como 1o elemento','peca_simples',ps({trechos1:[{tipo:'canal',a:30,c:4.5,seq:true},{tipo:'cil',a:40,b:30}]}),{t1,t2}));
  chk(run('PS erro: canal sequencial depois de cone','peca_simples',ps({trechos1:[{tipo:'cone',a:30,b:40,c:10},{tipo:'canal',a:25,c:4.5,seq:true}]}),{t1,t2}));
  console.log('== CANTOS com canal sequencial:',C.psCantos([{id:'a',tipo:'cil',a:40,b:20},{tipo:'canal',a:30,c:4.5,seq:true},{id:'b',tipo:'cil',a:50,b:10}],31).map(c=>c.alvo+'/'+c.onde+' z='+c.z).join(' | '));
}

// ---- v1.5.0 etapa 1: BA / BAT (mesma estrutura da matriz solida, folga .3) ----
{
  const B=C.GERADORES.ba_bat, d={}; B.campos.forEach(c=>d[c.id]=c.def);
  chk(run('BA/BAT padrao (exemplo BA.E.BAT: Ø225, usin 14, folga .3, raio 3)','ba_bat',d,{t1}));
  const r=B.gerar(d,{t1},{autor:'FERRAMENTARIA',data:'OUT/2026'}), s=C.GERADORES.matriz_solida.gerar({...d},{t1},{autor:'FERRAMENTARIA',data:'OUT/2026',nome:r.nome&&'x'});
  const norm=(x)=>x.code.split('\n').filter(l=>!/^<|FOLGA NO DIAMETRO|^#\d+=.*MATRIZ|BA\.D|MATRIZ\.SOLIDA/.test(l)).join('\n');
  console.log('== BA/BAT gera o mesmo programa da matriz sólida com os mesmos valores (fora nome/comentário da folga):', norm(r)===norm(s)?'SIM':'NAO', '| nome:',r.nome,'| #17 (Ø usinado) =', (r.code.match(/#6=([\d.]+)/)||[])[1]);
}

// ---- porta-matriz (2 lados, croqui com letras A-L; antes v1.6.0 em 1 lado) ----
{
  const P=C.GERADORES.porta_matriz, d={}; P.campos.forEach(c=>d[c.id]=c.def);
  chk(run('PORTA-MATRIZ 2 lados padrao (croqui A-L)','porta_matriz',d,{t1,t4}));
  const r=P.gerar(d,{t1,t4},{autor:'FERRAMENTARIA',data:'OUT/2026'});
  if(r.lados){ const L=r.lados[0].code.split('\n'); const i=L.findIndex(x=>/^N1/.test(x)); console.log('-- lado 1 contorno externo:\n'+L.slice(i,i+9).join('\n')); console.log('-- comprimento do angulo (esperado 6 = FUP[TAN10*34]):', (r.lados[0].code.match(/#\d+=6\(TRECHO 1 CONE COMPRIMENTO/)||['nao achei'])[0]);
    const L2=r.lados[1].code.split('\n'); const j=L2.findIndex(x=>/^N3/.test(x)); console.log('-- lado 2 contorno interno:\n'+L2.slice(j,j+6).join('\n')); const k=L2.findIndex(x=>/^N1/.test(x)); console.log('-- lado 2 contorno externo:\n'+L2.slice(k,k+5).join('\n')); }
  chk(run('PORTA-MATRIZ borda do furo em chanfro','porta_matriz',{...d,tipoL:'chanfro'},{t1,t4}));
  chk(run('PORTA-MATRIZ sem borda (L=0) e sem chanfro externo (H=0)','porta_matriz',{...d,rBoca:0,cExt:0},{t1,t4}));
  chk(run('PORTA-MATRIZ transversal G72','porta_matriz',{...d,sentE:'trans',sentI:'trans'},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: Ø M menor que Ø K','porta_matriz',{...d,d2:250},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: Ø E menor que Ø M','porta_matriz',{...d,d3:290},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: F curto para o angulo','porta_matriz',{...d,lEnc:5},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: lado 1 torneia menos que F + G','porta_matriz',{...d,lUsin1:65},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: lado 1 torneia ate A (nada para o lado 2)','porta_matriz',{...d,lUsin1:158},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: Ø D menor que Ø C','porta_matriz',{...d,dInt:180},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: B passa de A','porta_matriz',{...d,lInt:200},{t1,t4}));
  chk(run('PORTA-MATRIZ erro: bruto menor que A + sobremetal','porta_matriz',{...d,lBruto:158},{t1,t4}));
}
// ---- v1.7.0 etapa 3: alimentador padrao (2 lados) ----
{
  const A=C.GERADORES.alimentador, d={}; A.campos.forEach(c=>d[c.id]=c.def);
  chk(run('ALIMENTADOR padrao (exemplos LADO.01 e LADO.02)','alimentador',d,{t1,t4}));
  const r=A.gerar(d,{t1,t4},{autor:'FERRAMENTARIA',data:'OUT/2026'});
  if(r.lados){ r.lados.forEach((l,i)=>{ const L=l.code.split('\n'); const a=L.findIndex(x=>/^N1/.test(x)); const b=L.findIndex(x=>/^N3/.test(x)); console.log('-- lado '+(i+1)+' contorno externo:\n'+L.slice(a,a+9).join('\n')); if(b>=0) console.log('-- lado '+(i+1)+' contorno interno:\n'+L.slice(b,b+6).join('\n')); }); console.log('-- Ø maior do cone (esperado 153.397):', r.lados[0].code.split('\n').filter(x=>/CONE INTERNO DIAMETRO NA BOCA/.test(x)).join(' ')); }
  chk(run('ALIMENTADOR transversal G72','alimentador',{...d,sentE:'trans',sentI:'trans'},{t1,t4}));
  chk(run('ALIMENTADOR erro: furo maior que o Ø interno','alimentador',{...d,dFuro:150},{t1,t4}));
  chk(run('ALIMENTADOR erro: usinagem do lado 2 curta','alimentador',{...d,lUsin2:12},{t1,t4}));
  chk(run('ALIMENTADOR erro: encaixe menor que o Ø interno','alimentador',{...d,hEnc:70},{t1,t4}));
  chk(run('ALIMENTADOR erro: raio maior que o degrau do encaixe','alimentador',{...d,rEnc:5,rFace2:2,lUsin2:20},{t1,t4}));
}
// ---- v1.8.0 etapa 4: canal interno (G75 do furo para fora, ferramenta t5) ----
{
  const T=C.GERADORES.peca_simples, M={autor:'FERRAMENTARIA',data:'OUT/2026'}, t5={...t2,nome:'CANAL INTERNO 4.5',t:'0808'};
  const furo=[{tipo:'furo',a:30,b:50}];
  const ci=(extra)=>big({internos1:[...furo,{id:'i1',tipo:'icil',a:60,b:30},{tipo:'icanal',a:70,c:4.5,seq:true},{id:'i2',tipo:'icil',a:45,b:15},...extra]});
  chk(run('PS canal interno sequencial (fim do cilindro, antes do degrau)','peca_simples',ci([]),{t1,t2,t3,t4,t5}));
  { const r=T.gerar(ci([]),{t1,t2,t3,t4,t5},M); if(r.code){ const L=r.code.split('\n'); const i=L.findIndex(x=>/\(CANAL INTERNO\)/.test(x)); console.log('-- bloco do canal interno:\n'+L.slice(i,i+14).join('\n')); console.log('-- ferramentas no dicionario:', (r.dicionario||[]).length?'ok':'-'); console.log('-- cena: ferramenta e =', r.cena.tools&&r.cena.tools.e&&r.cena.tools.e.kind); } }
  chk(run('PS canal interno por Z absoluto (formato antigo, no meio do cilindro)','peca_simples',big({internos1:[...furo,{id:'i1',tipo:'icil',a:60,b:40},{tipo:'icanal',a:70,b:15,c:4.5}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS 2 canais internos no mesmo cilindro (largos: mais de uma passada em Z)','peca_simples',big({internos1:[{tipo:'furo',a:30,b:70},{id:'i1',tipo:'icil',a:60,b:30},{tipo:'icanal',a:70,c:9,seq:true},{id:'i2',tipo:'icil',a:60,b:1},{tipo:'icanal',a:68,c:4.5,seq:true},{id:'i3',tipo:'icil',a:45,b:10}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS canal interno so interno, sem furo (bruto furado)','peca_simples',big({usin1:'int',internos1:[{id:'i1',tipo:'icil',a:50,b:30},{tipo:'icanal',a:60,c:4.5,seq:true},{tipo:'icil',a:40,b:20}]}),{t1,t2,t4,t5}));
  chk(run('PS canal interno no lado 2 (2 lados)','peca_simples',big({lados:'2',sobre1:1,lPeca:80,trechos1:[{tipo:'cil',a:100,b:30}],trechos2:[{tipo:'cil',a:100,b:30}],internos1:[...furo,{tipo:'icil',a:50,b:20}],internos2:[{tipo:'furo',a:30,b:40},{id:'i1',tipo:'icil',a:50,b:20},{tipo:'icanal',a:62,c:4.5,seq:true}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS canal interno + chanfro na entrada e raio no fundo','peca_simples',big({internos1:[...furo,{id:'i1',tipo:'icil',a:60,b:30},{tipo:'icanal',a:70,c:4.5,seq:true},{id:'i2',tipo:'icil',a:45,b:15},{tipo:'ichanfro',a:1,alvo:'i1',onde:'ini'}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS erro: canal interno como 1o elemento','peca_simples',big({internos1:[{tipo:'icanal',a:70,c:4.5,seq:true},{tipo:'icil',a:60,b:30}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS erro: canal interno depois de cone interno','peca_simples',big({internos1:[...furo,{tipo:'icone',a:60,b:50,c:10},{tipo:'icanal',a:70,c:4.5,seq:true}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS erro: Ø do fundo do canal menor que o do cilindro','peca_simples',big({internos1:[...furo,{tipo:'icil',a:60,b:30},{tipo:'icanal',a:58,c:4.5,seq:true}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS erro: Ø do fundo do canal maior que o bloco','peca_simples',big({internos1:[...furo,{tipo:'icil',a:60,b:30},{tipo:'icanal',a:110,c:4.5,seq:true}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS erro: canal interno mais estreito que a ferramenta','peca_simples',big({internos1:[...furo,{tipo:'icil',a:60,b:30},{tipo:'icanal',a:70,c:3,seq:true}]}),{t1,t2,t3,t4,t5}));
  chk(run('PS erro: sem ferramenta de canal interno (t5)','peca_simples',ci([]),{t1,t2,t3,t4}));
  chk(run('PS erro: canal interno fura a parede','peca_simples',big({internos1:[...furo,{tipo:'icil',a:60,b:30},{tipo:'icanal',a:101,c:4.5,seq:true}]}),{t1,t2,t3,t4,t5}));
  console.log('== CANTOS com canal interno sequencial:',C.psCantosInt([{id:'a',tipo:'icil',a:60,b:20},{tipo:'icanal',a:70,c:4.5,seq:true},{id:'b',tipo:'icil',a:45,b:10}],15).map(c=>c.alvo+'/'+c.onde+' z='+c.z).join(' | '));
}
// ---- v1.9.0 etapa 5: rosca externa e interna (G76) ----
{
  const T=C.GERADORES.peca_simples, M={autor:'FERRAMENTARIA',data:'OUT/2026'}, t6={nome:'ROSCA 60 GRAUS',t:'0505',tipo:'rosca',modo:'G97',vc:0,rpm:800,avDesb:0,sentido:4}, t7={...t6,nome:'ROSCA INTERNA 60',t:'0909'};
  const re=[{id:'a',tipo:'cil',a:20,b:10},{id:'r',tipo:'rosca',a:30,b:20,c:2},{tipo:'canal',a:26,c:4.5,seq:true},{id:'b',tipo:'cil',a:50,b:15}];
  chk(run('PS rosca externa M30x2 com canal de alivio','peca_simples',big({trechos1:re}),{t1,t2,t6}));
  { const r=T.gerar(big({trechos1:re}),{t1,t2,t6},M); if(r.code){ const L=r.code.split('\n'); const i=L.findIndex(x=>/\(ROSCA EXTERNA\)/.test(x)); console.log('-- bloco da rosca externa:\n'+L.slice(i,i+16).join('\n')); console.log('-- variaveis da rosca:\n'+L.filter(x=>/ROSCA/.test(x)&&/^#/.test(x)).join('\n')); } }
  chk(run('PS rosca externa com chanfro na entrada (id da rosca)','peca_simples',big({trechos1:[{id:'a',tipo:'cil',a:20,b:10},{id:'r',tipo:'rosca',a:30,b:20,c:2},{tipo:'canal',a:26,c:4.5,seq:true},{id:'b',tipo:'cil',a:50,b:15},{tipo:'chanfro',a:1,alvo:'r',onde:'ini'}]}),{t1,t2,t6}));
  chk(run('PS rosca externa na face (1o elemento) sem alivio = aviso','peca_simples',big({trechos1:[{id:'r',tipo:'rosca',a:40,b:25,c:1.5},{tipo:'cil',a:60,b:10}]}),{t1,t6}));
  const ri=[{tipo:'furo',a:20,b:60},{id:'i1',tipo:'icil',a:40,b:10},{id:'r',tipo:'irosca',a:36,b:20,c:2},{tipo:'icanal',a:42,c:4.5,seq:true}];
  chk(run('PS rosca interna M36x2 (furo no Ø menor, canal de alivio)','peca_simples',big({internos1:ri}),{t1,t2,t3,t4,t5:t2,t7}));
  { const r=T.gerar(big({internos1:ri}),{t1,t2,t3,t4,t5:t2,t7},M); if(r.code){ const L=r.code.split('\n'); const i=L.findIndex(x=>/\(ROSCA INTERNA\)/.test(x)); console.log('-- bloco da rosca interna:\n'+L.slice(i,i+16).join('\n')); console.log('-- furo mandrilado D1 (esperado 36-1.0825*2 = 33.84):', (r.code.match(/ROSCA FURO[^\n]*/)||[''])[0].slice(0,60), '|', (r.code.split('\n').filter(x=>/^#3\d\d=33/.test(x))||[]).join(' ')); } }
  chk(run('PS rosca interna sozinha (so interno, bruto furado)','peca_simples',big({usin1:'int',internos1:[{tipo:'irosca',a:36,b:20,c:2}]}),{t1,t2,t4,t7}));
  chk(run('PS rosca externa + interna no mesmo lado','peca_simples',big({trechos1:[{id:'a',tipo:'cil',a:60,b:10},{id:'r',tipo:'rosca',a:70,b:20,c:2},{tipo:'canal',a:66,c:4.5,seq:true},{tipo:'cil',a:100,b:15}],internos1:ri}),{t1,t2,t3,t4,t5:t2,t6,t7}));
  chk(run('PS rosca no lado 2 (2 lados)','peca_simples',big({lados:'2',sobre1:1,lPeca:80,trechos1:[{tipo:'cil',a:100,b:30}],trechos2:[{id:'a',tipo:'cil',a:20,b:10},{tipo:'rosca',a:30,b:20,c:2},{tipo:'canal',a:26,c:4.5,seq:true}]}),{t1,t2,t6}));
  chk(run('PS erro: rosca sem ferramenta de rosca','peca_simples',big({trechos1:re}),{t1,t2}));
  chk(run('PS erro: RPM da rosca acima de 5000/passo','peca_simples',big({trechos1:re}),{t1,t2,t6:{...t6,rpm:3000}}));
  chk(run('PS erro: rosca sem passo','peca_simples',big({trechos1:[{tipo:'rosca',a:30,b:20,c:''}]}),{t1,t6}));
  chk(run('PS erro: passo grande demais para o Ø','peca_simples',big({trechos1:[{tipo:'rosca',a:6,b:20,c:5}]}),{t1,t6}));
  chk(run('PS erro: rosca interna fura a parede','peca_simples',big({internos1:[{tipo:'furo',a:20,b:60},{tipo:'irosca',a:100,b:20,c:2}]}),{t1,t2,t3,t4,t7}));
  chk(run('PS erro: rosca interna menor que o furo','peca_simples',big({internos1:[{tipo:'furo',a:34,b:60},{tipo:'irosca',a:36,b:20,c:2}]}),{t1,t2,t3,t4,t7}));
  console.log('== CANTOS com rosca:',C.psCantos(re,51).map(c=>c.alvo+'/'+c.onde+' z='+c.z).join(' | '));
}
// ---- v2.2.0: modulo Simulacao (leitor de programa pronto) ----
require('./testprog.js');
// ---- v2.7.0: diagnostico de erros do programa com causa e solucao ----
require('./testdiag.js');
