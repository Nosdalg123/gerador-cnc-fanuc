/* Regressão DXF do Model Space: coordenadas e cotas nativas foram
   extraídas dos DXFs reais Disco 7" e Copo 7" enviados pelo usuário.
   node testdxf.js */
const assert=require('assert'),DX=require('./dxfcore.js'),P=require('./dxfprofile.js');
function entity(name,tags){
 return ['0',name].concat(tags.flatMap(kv=>[String(kv[0]),String(kv[1])]));
}
const header=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
const tail=['0','ENDSEC','0','EOF'];
function read(...ents){return DX.read(header.concat(ents.flat(),tail).join('\r\n')+'\r\n')}
const ln=(id,x1,y1,x2,y2)=>entity('LINE',[[5,id],[10,x1],[20,y1],[11,x2],[21,y2]]);
const arc=(id,x,y,r,a,b)=>entity('ARC',[[5,id],[10,x],[20,y],[40,r],[50,a],[51,b]]);
const circle=(id,x,y,r)=>entity('CIRCLE',[[5,id],[10,x],[20,y],[40,r]]);
const dim=(id,angle,x1,y1,x2,y2,label)=>entity('DIMENSION',[[5,id],[70,160],[1,label],[50,angle],[13,x1],[23,y1],[14,x2],[24,y2],[10,x2],[20,y2]]);
const rdim=(id,cx,cy,px,py)=>entity('DIMENSION',[[5,id],[70,164],[1,'<>'],[10,cx],[20,cy],[15,px],[25,py]]);
const disc=read(
 ln('d1',194.5407756872,255.9355806289,159.390008428,235.2301963515),
 arc('d2',169.5407756872,217.9976131426,20,120.5,180),
 ln('d3',89.5407756872,194.0355806289,146.0407756872,194.0355806289),
 circle('d4',337.7286449871,174.5355806289,81.4),
 circle('d5',337.7286449871,174.5355806289,60.69),
 circle('d6',337.7286449871,174.5355806289,43.46),
 dim('d7',90,159.390008428,235.2301963515,159.390008428,113.8409649063,'%%c<>'),
 dim('d8',0,89.5407756872,194.0355806289,199.0407756872,194.0355806289,'<>'),
 rdim('d9',169.5407756872,131.0735481151,151.6358686831,122.162077688),
 entity('TEXT',[[5,'p1'],[410,'Layout1'],[67,1],[1,'PAPER ONLY'],[10,900],[20,900]])
);
assert.strictEqual(disc.units,4);
assert.strictEqual(disc.geometry.length,6);
assert.strictEqual(disc.dimensions.length,3);
assert(Math.abs(disc.dimensions[0].measure-121.3892)<.01);
assert(Math.abs(disc.dimensions[1].measure-109.5)<.001);
assert(Math.abs(disc.dimensions[2].measure-20)<.001);
assert(!disc.entities.some(e=>e.text==='PAPER ONLY'),'Paper space excluído');
const discHint=P.sectionSuggestion(disc);
assert(discHint&&Math.abs(discHint.axis-174.53558)<.01,'Centro da vista frontal determina possível eixo X0');
assert(discHint.rect.x2<337.7286,'Vista frontal não deve entrar na seção');
const exploded=P.segments(disc.geometry);
assert(exploded.some(s=>s.kind==='arc'&&Math.abs(s.r-20)<1e-7));
assert(P.svg(disc,discHint.rect,{axis:discHint.axis}).includes('data-unit-scale='));
const cup=read(
 ln('c1',120.2483983558,360.8605253536,106.2483983558,360.8605253536),
 ln('c2',167.820220627,355.8605253536,120.2483983558,360.8605253536),
 arc('c3',255.2483983558,346.3605253536,6,180,270),
 circle('c4',455.5,268.36,92.5),circle('c5',455.5,268.36,80),circle('c6',455.5,268.36,65),
 dim('c7',90,106.2483983558,360.8605253536,106.2483983558,175.8605253536,'%%c<>'),
 dim('c8',0,106.2483983558,360.8605253536,291.2483983558,360.8605253536,'<>'),
 rdim('c9',157.7483983558,240.8605253536,151.2483983558,240.8605253536),
 entity('SPLINE',[[5,'cs'],[71,3],[10,130],[20,290],[10,150],[20,300],[10,169],[20,307]])
);
assert.strictEqual(cup.dimensions.length,3);
assert.strictEqual(cup.dimensions[0].measure,185);
assert.strictEqual(cup.dimensions[1].measure,185);
assert.strictEqual(cup.dimensions[2].measure,6.5);
assert.strictEqual(cup.geometry.filter(e=>e.type==='SPLINE').length,1);
const hint=P.sectionSuggestion(cup);
assert(hint&&Math.abs(hint.axis-268.36)<.001);
const analysis=P.analyze(cup,hint.rect,hint.axis,'',new Set());
assert(!analysis.canExport,'Sem Z0 e sem seleção NÃO libera código CNC');
assert(analysis.alerts.some(v=>v.includes('SPLINE')),'Curva não traduzida precisa aparecer');
const a={uid:'first',kind:'line',a:[100,200],b:[120,200]};
const b={uid:'second',kind:'line',a:[120,200],b:[140,220]};
const tree=P.connectivity([a,b]);
assert.strictEqual(tree.components,1);assert.strictEqual(tree.gaps.length,2);
const c=P.classify(b,180,'esquerda');
assert.strictEqual(c.kind,'cone');assert.strictEqual(c.c,20);
const flipped=P.classify(b,180,'direita');
assert.strictEqual(flipped.a,c.b);assert.strictEqual(flipped.b,c.a);
console.log('DXF: LINE/ARC/CIRCLE/SPLINE, unidade mm, Ø/raio nativo, seção, cadeia, Z0 e isolamento de layout passaram.');
