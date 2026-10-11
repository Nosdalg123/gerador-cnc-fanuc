/* Regressao para reconciliacao de cotas provenientes de varias vistas do mesmo PDF.
   node testpdfreconcile.js */
const assert=require('assert');
const R=require('./pdfreconcile.js'),A=require('./pdfaudit.js'),O=require('./pdforientation.js');
const model=[{tipo:'cil',side:'1',a:50,b:30},{tipo:'icil',side:'1',a:20,b:30}];
const dimensions=[
{id:'l-total',tipo:'comprimento',valor:30,view:'lateral',rotulo:'30'},
{id:'l-ext',tipo:'diametro',valor:50,view:'lateral',rotulo:'Ø50'},
{id:'f-furo',tipo:'diametro',valor:20,view:'frontal',rotulo:'Ø20'}
];
const start=R.evaluate(model,30,dimensions,{},{},{targetView:'lateral'});
assert(!start.ready,'Não se permite salvar contorno com dimensões ainda não cotadas');
assert(start.summary.missing>=2,'Cota de outra vista e profundidades nao podem ser inferidas');
const inHole=start.slots.find(s=>s.key==='seg:1:a');
assert(!inHole.verified,'Ø da frontal sem vínculo não confirma automaticamente trecho longitudinal');
assert(inHole.suggestions.includes('f-furo'),'Ø20 da frontal deve ser sugerido');
const bound=R.bind(model,30,'seg:1:a',start.dimensions.find(d=>d.id==='f-furo'));
assert(bound&&bound.model[1].a===20,'Cota pode completar o furo após vínculo explícito');
const manual={total:true,'seg:0:b':true,'seg:1:b':true};
const linked=R.evaluate(bound.model,30,dimensions,{'seg:1:a':'f-furo'},manual,{targetView:'lateral'});
assert(linked.ready,'Vínculos únicos e medidas revisadas devem liberar perfil simples');
const conflict=R.evaluate([{tipo:'cil',side:'1',a:50,b:30}],30,dimensions.concat([
{id:'front-conflict',tipo:'diametro',valor:52,view:'frontal',rotulo:'Ø52',featureKey:'seg:0:a'},
{id:'side-linked',tipo:'diametro',valor:50,view:'lateral',rotulo:'Ø50',featureKey:'seg:0:a'}
]),{},{},{targetView:'lateral'});
assert(conflict.slots.find(s=>s.key==='seg:0:a').conflict,'Duas cotas incompatíveis não podem ser substituídas silenciosamente');
const selected=R.evaluate([{tipo:'cil',side:'1',a:50,b:30}],30,dimensions.concat([
{id:'front-conflict',tipo:'diametro',valor:52,view:'frontal',featureKey:'seg:0:a'},
{id:'side-linked',tipo:'diametro',valor:50,view:'lateral',featureKey:'seg:0:a'}
]),{'seg:0:a':'side-linked'},{},{targetView:'lateral'});
assert(!selected.slots.find(s=>s.key==='seg:0:a').conflict,'Usuário pode escolher explicitamente a cota correta');
const blockedDetail=A.verify({trechos1:[{tipo:'cil',a:50,b:30}]},[{tipo:'raio',valor:3.5,rotulo:'R3,50'}]);
assert(!blockedDetail.ready,'Raio que nao existe no desenho deve bloquear a versão CNC');
const radius=A.verify({trechos1:[{tipo:'raio',a:3.5}]},[{tipo:'raio',valor:3.5,rotulo:'R3,50'}]);
assert(radius.ready,'Raio incorporado pode ser revalidado após conferência');
const screw=A.verify({internos1:[{tipo:'irosca',a:8,b:50,c:1.25}]},[{tipo:'rosca_furo',valor:8,profundidade:50,rotulo:'M8 x50'}]);
assert(!screw.ready,'M8x50 sem passo nao pode liberar automaticamente a rosca');
const orient=O.suggest([{tipo:'cil',a:50,b:20,side:'1'},{tipo:'cil',a:30,b:20,side:'1'}],'1');
assert.strictEqual(orient.face,'end','Face sugerida é a oposta se G71 nao permite diametro decrescente');
assert(orient.needsConfirmation);
console.log('PDF multi-vistas: 11 cenários passaram (vínculo, cotas ausentes, conflito, recursos e Z0).');
