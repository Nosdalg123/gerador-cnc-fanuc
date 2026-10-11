/* Regressão v2.10.0: node testpdfscale.js */
const assert=require('assert');
const P=require('./pdfprofile.js'),V=require('./pdfvector.js');
const anel=[{tipo:'cil',side:'1',a:50,b:30,c:''},{tipo:'icil',side:'1',a:20,b:30,c:''}];
const res=P.svg(anel,30);
assert(res.ok,'Anel 50 x 20 x 30 deve projetar');
assert(res.uniform,'A escala deve ser a mesma em X e Ø');
assert(Math.abs(res.drawn.length/res.drawn.diameter-.6)<1e-8,'30/50 = relação geométrica real');
assert(res.svg.includes('data-edit-total'),'Cota total deve ser editável');
assert(res.svg.includes('data-edit-index="0"'),'Cota externa deve ser editável');
assert(res.svg.includes('data-edit-index="1"'),'Cota interna deve ser editável');
assert(res.svg.includes('Ø50')&&res.svg.includes('Ø20')&&res.svg.includes('30 mm'),'Todas as cotas da Peça1');
const rect=[
 {x1:470.5,y1:241.9,x2:470.5,y2:411.9},
 {x1:754,y1:241.9,x2:754,y2:411.9},
 {x1:555.5,y1:241.9,x2:555.5,y2:411.9},
 {x1:668.9,y1:241.9,x2:668.9,y2:411.9},
 {x1:439.3,y1:241.9,x2:439.3,y2:411.9},
 {x1:612,y1:236.2,x2:612,y2:417.6}
];
const region={x1:430,y1:170,x2:770,y2:455};
const vertical=V.trace(rect,50,30,region);
assert(vertical&&vertical.ok,'Deve recuperar seção vertical mesmo com linha de cota e eixo');
assert.deepStrictEqual(vertical.items.map(x=>[x.tipo,x.a,x.b]),[['cil',50,30],['icil',20,30]]);
const horizontal=V.trace(rect.map(x=>({x1:x.y1,y1:x.x1,x2:x.y2,y2:x.x2})),50,30,{x1:170,y1:430,x2:455,y2:770});
assert(horizontal&&horizontal.ok&&horizontal.axis==='horizontal','Deve interpretar seção horizontal');
assert(!V.trace([],50,30,null),'Sem contorno não é permitido inferir');
assert(!P.analyze([{tipo:'cil',side:'1',a:50,b:12}],30).ok,'Contorno parcial não pode ser salvo');
assert(!P.analyze([{tipo:'cil',side:'1',a:30,b:30},{tipo:'icil',side:'1',a:35,b:30}],30).ok,'Furo maior que peça bloqueado');
const cone=P.svg([{tipo:'cone',side:'1',a:50,b:30,c:45}],30);
assert(cone.ok&&cone.uniform,'Cone usa a mesma escala nos dois eixos');
console.log('PDF escala: 11 verificações aprovadas; edição, proporção e eixos vertical/horizontal.');
