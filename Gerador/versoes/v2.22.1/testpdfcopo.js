/* Regressão baseada no TEXTO e nas POSIÇÕES reais da página 1 do PDF:
   "Copo 7'' - Empurrador P2 - 7''  -5-9-24.pdf".
   Fonte: get_text('dict') do PDF original (página 841,89 × 595,276 pt).
   node testpdfcopo.js */
const assert=require('assert');
const D=require('./pdfdimensions.js'),S=require('./pdfregions.js');
const R=require('./pdfrecognizer.js'),V=require('./pdfvector.js'),O=require('./pdforientation.js');
const H=595.276,W=841.89;
function span(t,x1,y1,x2,y2){return {str:t,width:x2-x1,height:y2-y1,transform:[1,0,0,1,x1,H-y2]}}
const actual=[
 span('185',42.8,200.1,55.1,217.6),span('162',59.8,200.1,72.1,217.6),
 span('136,02',76.8,193.9,89.1,223.9),span('116',93.9,200.1,106.1,217.6),
 span('104',110.9,200.1,123.1,217.6),span('14',152.6,61.7,167.6,73.9),
 span('61,57',179.7,44.1,207.2,56.4),span('6°',224.3,64.2,238.9,79.9),
 span('22,50',152.8,363.0,180.3,375.3),span('45',175,380,190,392.3),
 span('70',192.7,397,207.7,409.3),span('100',211.5,411.2,231.5,423.5),
 span('112',248.1,431,268.1,443.3),span('185',278.8,458.3,298.8,470.6),
 span('106',231.1,27.1,251.1,39.4),span('115',327,53.4,347,65.7),
 span('42',226.1,203,238.4,215.5),span('60',269.9,200,282.2,212.5),
 span('72',294.1,206.2,306.3,218.7),span('m10',325.7,352,348.2,364.3),
 span('M64 P4',424.6,276.5,462.5,291.5),span('79,10',446.8,196.4,459.1,221.4),
 span('175',460.9,200.1,473.2,217.6),span('R3',555.1,432.2,575.5,452.6),
 span('R6,50',451.2,430.2,482.5,455.4),span('R3',530.9,352,551.4,370.9),
 span('10',533.8,382.9,548.8,395.2),span('6',466.7,356.6,478.9,366.6),
 span('R3',566,416.6,585.8,434.1),
 span('SEÇÃO Y-Y',305.2,379.8,362.9,394.8),span('DETALHE Z',489.8,460.4,543.5,475.4),
 span('Y',672.2,41.9,678.7,56.9),span('Y',672.2,373.1,678.7,388.2),
 span('1:10',546.7,552.4,565.4,566.1),
 span('Alterado Rosca para M64 P4 - Criado sistema novo de trava',111.2,503.4,346.5,514.3)
];
const viewport={transform:[1,0,0,-1,0,H],scale:1,width:W,height:H};
const util={transform:(a,b)=>[
 a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
 a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
 a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]
]};
function crop(x1,y1,x2,y2){
 return S.filter(actual,viewport,util,{x1:x1/W,y1:y1/H,x2:x2/W,y2:y2/H});
}
const main=crop(0,0,465,490),detail=crop(450,341,610,485),front=crop(590,20,820,395),revisions=crop(0,495,840,585);
const mainText=main.map(x=>x.str),detailText=detail.map(x=>x.str);
assert(mainText.includes('M64 P4'),'A rosca da seção precisa ser lida');
assert(mainText.includes('m10'),'A indicação m10 também é relevante');
assert(mainText.includes('6°'),'Inclinação da seção precisa ser lida');
assert(!mainText.includes('R6,50'),'Raio do detalhe não pode contaminar a seção');
assert(!mainText.includes('DETALHE Z'),'Legenda do detalhe não pode pertencer à seção');
assert(!mainText.some(x=>x.startsWith('Alterado Rosca')),'Quadro de revisão excluído');
assert(detailText.includes('R6,50')&&detailText.includes('R3'),'O Detalhe Z deve manter seus próprios raios');
assert(!detailText.includes('M64 P4'),'Detalhe Z não herda rosca principal');
assert(front.every(x=>['Y'].includes(x.str)),'Vista frontal não herda as cotas das outras regiões no teste');
assert(revisions.some(x=>x.str.startsWith('Alterado Rosca')),'Quadro de revisão continua acessível, mas isolado');
const summary=D.summary(main);
assert.strictEqual(summary.byType.rosca,2);
assert.strictEqual(summary.byType.angulo,1);
assert.strictEqual(summary.byType.linear_sem_tipo,mainText.filter(x=>/^\d+(?:,\d+)?$/.test(x)).length);
assert.strictEqual(summary.byType.diametro||0,0,'Fontes PDF suprimem Ø: não inventar diametros');
assert(!R.recognize(main).ok,'Copo complexo não pode ser reduzido a anel Ø/comp. simplificado');
assert.strictEqual(D.parse('m10').kind,'rosca');
assert.strictEqual(D.parse('M64 P4').passo,4);
assert.strictEqual(D.parse('R6,50').value,6.5);
assert.strictEqual(D.parse('6°').kind,'angulo');
assert.strictEqual(D.parse('SEÇÃO Y-Y').kind,'marcador_vista');
assert.strictEqual(D.parse('DETALHE Z').kind,'marcador_vista');
assert.strictEqual(D.parse('1:10'),null,'Escala impressa não é cota');
assert.strictEqual(D.parse('Alterado Rosca para M64 P4'),null,'Revisão não é cota');
const mk=(n,x)=>Array.from({length:n},(_,i)=>({x1:x+i*.01,y1:80,x2:x+2+i*.01,y2:150}));
assert(!V.complexity(mk(300,10),{x1:0,y1:0,x2:600,y2:300}).complexo);
assert(V.complexity(mk(950,10),{x1:0,y1:0,x2:600,y2:300}).complexo);
assert.strictEqual(O.orientation('horizontal','',1),null,'Face Z0 pendente não deve virar orientação inventada');
console.log('Copo 7: classificação de cotas, regiões, detalhes, revisão, complexidade e Z0 aprovados.');
