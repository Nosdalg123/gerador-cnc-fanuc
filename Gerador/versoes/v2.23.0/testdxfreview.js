/* Regressões de cotas e notas omitidas no rascunho; não aprova CNC. */
const assert=require('assert'),DX=require('./dxfcore'),W=require('./dxfwizardgeom'),R=require('./dxfreview');
const region={x1:-1,y1:-1,x2:111,y2:31};
const geometry=[{id:'a',type:'LINE',a:[0,10],b:[50,10]},{id:'b',type:'LINE',a:[50,10],b:[100,20]}];
const dimensions=[{id:'total',kind:0,diameter:false,text:'<>',measure:110,angle:0,a:[0,10],b:[110,20]},
 {id:'thread',kind:0,diameter:false,text:'M<> P2',measure:39,angle:90,a:[0,10],b:[0,-10]}];
const doc={geometry,dimensions,entities:[],units:4};
const graph=W.analyze(W.collect(doc,region,0),new Set(['a:0','b:0']));
const review=R.check({doc,region,axis:0,face:'direita',length:100,graph,built:true});
assert(review.issues.some(q=>q.code==='axial_coverage'),'Perfil conectado parcial deve denunciar a cota total maior');
assert(review.operations.some(q=>q.text==='M39 P2'),'Rosca na DIMENSION precisa aparecer');
assert.equal(review.cncReady,false,'Conferência nunca equivale a liberação CNC');
{
 const groups=(type,pairs)=>['0',type,...pairs.flatMap(([a,b])=>[String(a),String(b)])];
 const data=[...groups('SECTION',[[2,'HEADER'],[9,'$INSUNITS'],[70,4]]),...groups('ENDSEC',[]),
  ...groups('SECTION',[[2,'BLOCKS']]),...groups('BLOCK',[[2,'NOTE'],[10,2],[20,3]]),
  ...groups('MTEXT',[[5,'text'],[10,4],[20,3],[1,'M8 x50']]),...groups('ENDBLK',[]),...groups('ENDSEC',[]),
  ...groups('SECTION',[[2,'ENTITIES']]),...groups('INSERT',[[5,'ins'],[2,'NOTE'],[10,20],[20,30],[41,2],[42,2],[50,90]]),
  ...groups('LINE',[[5,'line'],[10,0],[20,10],[11,100],[21,10]]),...groups('ENDSEC',[]),...groups('EOF',[])].join('\n');
 const parsed=DX.read(data),note=parsed.entities.find(q=>q.fromBlock);
 assert(note&&note.text==='M8 x50','Nota dentro de INSERT não pode desaparecer');
 assert(Math.abs(note.at[0]-20)<1e-8&&Math.abs(note.at[1]-34)<1e-8,'Escala, giro e base do bloco preservados');
 assert.equal(parsed.geometry.length,1,'Não transformar a nota em geometria CNC');
}
{
 const copied=JSON.parse(JSON.stringify(doc));copied.dimensions.push({id:'override',kind:0,text:'120',measure:110,angle:0,a:[0,10],b:[110,20]});
 const r=R.check({doc:copied,region,axis:0,face:'direita',length:100,graph,built:true});
 assert(r.issues.some(q=>q.code==='dimension_override'),'Texto de cota alterado exige revisão');
}
console.log('PASSOU: comprimento parcial, rosca em cota, nota de INSERT transformada, texto divergente e bloqueio CNC.');
