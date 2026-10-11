/* Casos de regressão do Disco 7": somente cotas e geometria sintetizada,
   SEM anexar o PDF original ao repositório. Rode: node testpdfdisco.js */
const assert=require('assert');
const D=require('./pdfdimensions.js'),V=require('./pdfviews.js');
const G=require('./pdfvector.js'),O=require('./pdforientation.js'),P=require('./pdfprofile.js');
const H=s=>({str:s,transform:[9,0,0,9,225,100]});
const Z=s=>({str:s,transform:[0,-9,9,0,82,250]});
const typed=D.summary([H('109,50'),H('105'),H('69,85'),H('60'),H('37'),H('10'),
 Z('162,80 CANTO VIVO'),Z('121,39'),Z('86,92'),Z('14,20'),Z('M39 P2'),
 H('R20'),H('R3,50'),Z('61°')],'horizontal');
assert.strictEqual(typed.candidateLength,109.5);
assert.strictEqual(typed.candidateDiameter,162.8);
assert.deepStrictEqual(typed.rays.map(x=>x.valor),[20,3.5]);
assert.strictEqual(typed.angles[0].valor,61);
assert.strictEqual(typed.threads[0].rotulo,'M39 P2');
assert.strictEqual(D.text('M8 x50').tipo,'rosca_furo');
assert.strictEqual(D.text('26-4-24'),null);
assert(typed.complex);
function box(x1,y1,x2,y2,count){return{x1,y1,x2,y2,cx:(x1+x2)/2,cy:(y1+y2)/2,width:x2-x1,height:y2-y1,count}};
const regions=V.boxes([box(484.4,111.6,792,419.3,518),box(534,161.3,742.4,369.6,111),box(169.2,111.6,376.1,419.3,383)],841.89,595.276);
assert.strictEqual(regions[0].kind,'lateral');
assert.strictEqual(regions[1].kind,'frontal');
assert(regions[0].view.x1<82/841.89&&regions[0].view.x2>424/841.89,'Recorte longitudinal inclui as cotas de Ø');
assert(regions[0].view.y1<33/595.276,'Recorte inclui cota 109,50');
assert(regions[0].view.x2<602/841.89,'Recorte longitudinal exclui rosca M8 da vista frontal');
// Polilinha sintetizada de um contorno complexo, com degraus e transições.
// Pontos representam tipos de detalhes vistos em desenhos reais, não a peça de produção.
const K=[[0,39],[58.55,40.34],[60.18,91.82],[63.99,110.8],[69.96,121.5],[104.73,162.45],[106.9,44.23],[109.5,15.33]];
const line=(x1,y1,x2,y2,path)=>({x1,y1,x2,y2,path});
const x0=169.21,x1=376.09,cy=265.44,yscale=(419.27-111.62)/162.8;
function interp(z){
 for(let k=1;k<K.length;k++)if(z<=K[k][0]){
  const p=K[k-1],q=K[k],u=(z-p[0])/(q[0]-p[0]);return p[1]+(q[1]-p[1])*u;
 }
 return K[K.length-1][1];
}
const xs=[],top=[],bottom=[];
for(let j=0;j<=200;j++){let z=109.5*j/200,x=x0+(x1-x0)*j/200,d=interp(z);xs.push(x);top.push(cy-d*yscale/2);bottom.push(cy+d*yscale/2)}
let path=[];
for(let j=1;j<xs.length;j++){path.push(line(xs[j-1],top[j-1],xs[j],top[j],22));path.push(line(xs[j-1],bottom[j-1],xs[j],bottom[j],22))}
const side=V.boxes([box(484.4,111.6,792,419.3,518),box(169.2,111.6,376.1,419.3,383)],841.89,595.276)[0].view;
const region={x1:side.x1*841.89,y1:side.y1*595.276,x2:side.x2*841.89,y2:side.y2*595.276};
const traced=G.traceOutline(path,162.8,109.5,region);
assert(traced&&traced.ok,'Contorno lateral sintético precisa ser detectado');
assert(traced.items.length>3,'Trechos do perfil precisam aparecer');
assert(Math.abs(traced.items.reduce((s,q)=>s+q.b,0)-109.5)<.0001,'Comprimento total exato');
assert(P.analyze(traced.items,109.5).ok,'Perfil deve ser interpretável pelo CNC');
const backwards=O.reverse(traced.items,'1');
assert.deepStrictEqual(O.reverse(backwards,'1'),traced.items,'Reversão dupla preserva a geometria');
assert(!O.inspect(traced.items,'1').ok,'Perfil com retorno acentuado pede verificação de usinabilidade');
console.log('PDF Disco: classificação, separação de vistas, orientação CNC e perfil vetorial de teste aprovados.');
