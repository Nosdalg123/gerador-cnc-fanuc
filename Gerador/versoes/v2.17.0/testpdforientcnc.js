/* Testa orientação da vista contra a geração Fanuc real:
   node testpdforientcnc.js */
const assert=require('assert'),C=require('./core.js'),O=require('./pdforientation.js');
global.window={};
require('./seed.js');
const TS=window.CNC_SEED_TOOLS;
function tool(k){return TS.find(t=>t.seedKey===k)}
const tools={t1:tool('w0101'),t2:tool('enc0303'),t3:tool('tmax0303'),t4:tool('int0606'),t5:tool('enc0303'),t6:tool('ros0505'),t7:tool('ros0505')};
const ger=C.GERADORES.peca_simples;
function make(rows){
 let f={};ger.campos.forEach(c=>f[c.id]=JSON.parse(JSON.stringify(c.def)));
 Object.assign(f,{dBruto:62,lBruto:60,lPeca:50,lados:'1',grip1:2,sobre1:1,brutoInt:[],brutoIntLado:'1',usin1:'ext',sentE1:'long',
  trechos1:rows,trechos2:[],internos1:[],internos2:[]});
 return f;
}
const view=[{tipo:'cil',a:30,b:20,side:'1'},{tipo:'cil',a:50,b:20,side:'1'}];
const lhs=O.fromDrawing(view,'horizontal','esquerda','1');
const rhs=O.fromDrawing(view,'horizontal','direita','1');
const meta={nome:'TESTE.ORIENTACAO.PDF',autor:'TESTE',data:'11/10/2026'};
const ok=ger.gerar(make(lhs),tools,meta);
assert.deepStrictEqual(ok.erros,[],'Z0 no primeiro degrau deve passar na geometria G71');
assert(ok.code.includes('G71'),'Codigo G71 esperado');
const reverse=ger.gerar(make(rhs),tools,meta);
assert(reverse.erros.some(e=>/diâmetro diminui/.test(e)),'Peça espelhada para Z0 oposto deve ser rejeitada por G71');
assert(!reverse.code,'Orientação incompatível não pode gerar código');
assert.strictEqual(O.orientation('horizontal','esquerda','1').zAvanca,'negativo');
console.log('Fanuc: face Z0 escolhida preserva sentido de Z, G71 aceita um lado e rejeita espelhamento incompatível.');
