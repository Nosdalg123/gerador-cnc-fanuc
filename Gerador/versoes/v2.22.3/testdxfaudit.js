/* Verificação do gate de exportação de CAD: node testdxfaudit.js */
const assert=require('assert'),A=require('./dxfaudit.js');
const L=(uid,a,b)=>({uid,kind:'line',a,b});
const external={selected:[L('e0',[0,30],[20,30]),L('e1',[20,30],[50,40])],classified:[{kind:'cil'},{kind:'cone'}],
 connection:{components:1,branches:[],gaps:[[0,30],[50,40]]}};
const native=[{kind:0,diameter:false,angle:0,measure:50},{kind:0,diameter:false,angle:0,measure:20}];
function check(overrides){return A.check(Object.assign({doc:{units:4},axis:0,face:'esquerda',length:50,external,internal:{selected:[],classified:[]},
 nativeDimensions:native,candidateSegments:[],threadNotes:0,unsupportedCurves:0},overrides||{}))}
assert(check().ok,'Dois trechos conectados, cotas coerentes e sem pendências devem passar');
assert(!check({face:''}).ok,'Face Z0 pendente precisa bloquear');
assert(!check({length:45}).ok,'Comprimento incorreto precisa bloquear');
assert(!check({doc:{units:1}}).ok,'Polegadas exigem conversão');
const open={...external,selected:[L('e0',[0,30],[20,30]),L('e1',[23,30],[50,40])]};
assert(!check({external:open}).ok,'Lacuna axial precisa bloquear');
const overlapping={...external,selected:[L('e0',[0,30],[30,30]),L('e1',[20,30],[50,40])]};
assert(!check({external:overlapping}).ok,'Sobreposição axial precisa bloquear');
const split={...external,connection:{components:2,branches:[],gaps:[[0,30],[20,30],[23,30],[50,40]]}};
assert(!check({external:split}).ok,'Grupo fragmentado precisa bloquear');
const rawArc={uid:'R3',kind:'arc',c:[20,30],r:3,start:0,end:90};
assert(!check({candidateSegments:[rawArc]}).ok,'Arco que falta converter não pode sumir');
assert(!check({threadNotes:1}).ok,'Rosca não programada precisa bloquear');
assert(!check({unsupportedCurves:1}).ok,'SPLINE não programada precisa bloquear');
assert(!check({nativeDimensions:[{kind:0,diameter:false,angle:0,measure:65}]}).ok,'Cota CAD axial discordante precisa bloquear');
console.log('DXF audit: 11 verificações de continuidade, raio, rosca, Z0, unidade e comprimento aprovadas.');
