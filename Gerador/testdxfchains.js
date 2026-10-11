/* Regressão de cadeias DXF ramificadas e pontos com tolerância real.
   node testdxfchains.js */
const assert=require('assert'),DX=require('./dxfcore.js'),C=require('./dxfchains.js');
const line=(id,a,b)=>({uid:id,kind:'line',a,b});
const b=[line('a',[0,20],[10,20]),line('b',[10,20],[20,25]),line('c',[10,20],[10,12]),
 line('d',[20,25],[30,25]),line('e',[40,10],[50,10])];
const graph=C.build(b,{axis:0,tol:.16});
assert.strictEqual(graph.segments,5);
assert(graph.bifurcations.some(x=>x.degree===3),'Bifurcação deve ser detectada');
assert(graph.chains.length>=4,'O grafo bifurcado não pode virar uma única cadeia falsa');
assert(!graph.chains.some(x=>x.ids.includes('a')&&x.ids.includes('b')&&x.ids.includes('c')),'Não misturar os dois caminhos da bifurcação');
assert(graph.chains.some(x=>x.ids.includes('b')&&x.ids.includes('d')),'Deve preservar o caminho sem ramificações intermediárias');
const close=C.build([line('one',[.079,15],[10,15]),line('two',[10.08,15],[20,15])],{axis:0,tol:.16});
assert.strictEqual(close.chains.length,1,'Pontos próximos devem conectar mesmo em fronteiras da grade');
const apart=C.build([line('one',[0,15],[10,15]),line('two',[10.18,15],[20,15])],{axis:0,tol:.16});
assert.strictEqual(apart.chains.length,2,'Lacunas acima da tolerância não podem ser soldadas automaticamente');
const arc={uid:'R3',kind:'arc',c:[25,20],r:3,start:90,end:180};
const rad=C.build([arc],{axis:0,tol:.16});
assert(rad.chains.some(q=>q.arcCount===1),'Raios nativos permanecem cadeias');
const selected=C.segmentCoverage(graph.chains,new Set(['a']));
assert(selected.has('a')&&!selected.has('c'),'Seleção não deve absorver caminhos que se separam na bifurcação');
console.log('DXF chains: 9 verificações de nós, tolerância, bifurcação, arco e seleção aprovadas.');
