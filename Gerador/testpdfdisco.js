/* Testes v2.11.0 com 15 legendas de cota extraídas da primeira página real:
   Disco 7'' - Empurrador P2 - 7'' -26-4-24.pdf
   node testpdfdisco.js */
const assert=require('assert');
const D=require('./pdfdimensions.js'),O=require('./pdforientation.js'),R=require('./pdfrecognizer.js');
const drawing=[
 ['M8 x50',602.4,68,0],['60',215.1,123.6,0],['10',167,325.7,0],['37',195.7,201.2,0],
 ['14,20',140.3,283.6,1],['61°',344.7,279.1,1],['R20',253.1,377.9,0],['R3,50',242.3,347.7,0],
 ['M39 P2',116.5,289.8,1],['121,39',67.4,284.1,1],['86,92',96.5,280.4,1],
 ['69,85',219.1,103.8,0],['105',224.6,81.3,0],['109,50',252.8,47.3,0],
 ['162,80 CANTO VIVO',438.5,339.1,1]
].map(function(r){return {str:r[0],transform:r[3]?[0,-1,1,0,r[1],r[2]]:[1,0,0,1,r[1],r[2]]}});
const analysis=D.summary(drawing);
assert.strictEqual(drawing.length,15);
assert.strictEqual(analysis.dims.length,15,'Todas as cotas legíveis devem ser mantidas');
assert.strictEqual(analysis.byType.rosca,2);
assert.strictEqual(analysis.byType.raio,2);
assert.strictEqual(analysis.byType.angulo,1);
assert.strictEqual(analysis.byType.linear_sem_tipo,10);
assert(analysis.multiple,'O desenho inclui cotas e vistas concorrentes');
assert.strictEqual(D.parse('M39 P2').passo,2);
assert.strictEqual(D.parse('M8 x50').profundidade,50);
assert.strictEqual(D.parse('162,80 CANTO VIVO').value,162.8);
assert.strictEqual(D.parse('R3,50').value,3.5);
assert.strictEqual(R.recognize(drawing).ok,false,'Não pode gerar geometria falsa em PDF com várias vistas');
assert(O.isValid('horizontal','esquerda'));
assert(O.isValid('horizontal','direita'));
assert(!O.isValid('horizontal','superior'));
assert(!O.isValid('vertical','direita'));
const origin=[
 {side:'1',tipo:'cil',a:30,b:20,c:''},
 {side:'1',tipo:'cone',a:30,b:20,c:50},
 {side:'1',tipo:'icil',a:12,b:15,c:''},
 {side:'1',tipo:'icone',a:12,b:15,c:8},
 {side:'2',tipo:'cil',a:70,b:9,c:''}
];
const flipped=O.flip(origin,'1');
assert.deepStrictEqual(flipped[0],{side:'1',tipo:'cone',a:50,b:20,c:30});
assert.deepStrictEqual(flipped[1],{side:'1',tipo:'cil',a:30,b:20,c:''});
assert.deepStrictEqual(flipped[2],{side:'1',tipo:'icone',a:8,b:15,c:12});
assert.deepStrictEqual(flipped[3],{side:'1',tipo:'icil',a:12,b:15,c:''});
assert.deepStrictEqual(flipped[4],origin[4]);
assert.deepStrictEqual(O.flip(flipped,'1'),origin,'Dupla inversão restaura todas as cotas');
assert.deepStrictEqual(O.fromDrawing(origin,'horizontal','esquerda','1'),origin);
assert.deepStrictEqual(O.fromDrawing(origin,'horizontal','direita','1'),flipped);
assert.deepStrictEqual(O.fromDrawing(origin,'vertical','inferior','1'),flipped);
const metadata=O.orientation('horizontal','esquerda','1');
assert.deepStrictEqual([metadata.origem,metadata.zAvanca,metadata.xModo],['Z0','negativo','diametro']);
console.log('Disco 7: 25 verificações de cotas, segurança da leitura e inversão X/Z aprovadas.');
