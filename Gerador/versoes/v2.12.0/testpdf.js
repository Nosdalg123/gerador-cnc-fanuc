/* Testes do reconhecimento de desenho PDF: node testpdf.js */
const assert=require('assert');
const R=require('./pdfrecognizer.js');
function t(str,x,y,vertical){return {str,transform:vertical?[0,8,-8,0,x,y]:[8,0,0,8,x,y]};}
const p=R.recognize([t('50',611,400),t('20',611,380),t('30',435,270,true),t('11/10/2026',530,40)]);
assert(p.ok,'Reconhecimento de anel falhou');
assert.strictEqual(p.externo,50);assert.strictEqual(p.interno,20);assert.strictEqual(p.comprimento,30);
assert.strictEqual(R.recognize([t('50',611,400),t('20',611,380),t('10',611,360),t('30',435,270,true)]).ok,false);
assert.strictEqual(R.recognize([t('Peça1',100,100)]).ok,false);
console.log('PDF: 3 cenarios aprovados; Peça1 = Ø50 externo, Ø20 interno, comprimento 30.');
