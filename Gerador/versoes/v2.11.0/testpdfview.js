/* Regressao da projecao PDF -> elementos CNC: node testpdfview.js */
const assert=require('assert');
const R=require('./pdfrecognizer.js'), P=require('./pdfprofile.js');
const texts=[
 {str:'50',transform:[8,0,0,8,611,400]},
 {str:'20',transform:[8,0,0,8,611,383]},
 {str:'30',transform:[0,8,-8,0,433,270]},
 {str:'11/10/2026',transform:[8,0,0,8,540,80]}
];
const parsed=R.recognize(texts);
assert(parsed.ok,'Peça1 não foi identificada');
assert.deepStrictEqual([parsed.externo,parsed.interno,parsed.comprimento],[50,20,30]);
const elements=[{tipo:'cil',side:'1',a:parsed.externo,b:parsed.comprimento},{tipo:'icil',side:'1',a:parsed.interno,b:parsed.comprimento}];
const projected=P.svg(elements,parsed.comprimento);
assert(projected.ok);
assert(projected.svg.includes('Ø50'));
assert(projected.svg.includes('Ø20'));
assert(projected.svg.includes('30 mm'));
assert.deepStrictEqual(projected.items,[
 {tipo:'cil',side:'1',a:50,b:30},
 {tipo:'icil',side:'1',a:20,b:30}
]);
assert(!P.analyze([{tipo:'cil',side:'1',a:20,b:30},{tipo:'icil',side:'1',a:50,b:30}],30).ok,'Cota interna maior que externa deve falhar');
assert(!P.analyze(elements,20).ok,'Trechos acima do comprimento devem falhar');
const cone=P.analyze([{tipo:'cone',side:'1',a:50,b:30,c:45}],30);
assert(cone.ok);
assert.deepStrictEqual(cone.items[0],{tipo:'cone',side:'1',a:50,b:45,c:30},'Comprimento e Ø final no formato do CNC');
console.log('PDF CNC: reconhecimento Peça1, projeção cotada, tipos CNC e 3 validacoes OK.');
