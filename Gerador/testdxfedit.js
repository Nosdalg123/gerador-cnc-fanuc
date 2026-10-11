/* Regressão de proposta automática e edição CAD segura: node testdxfedit.js */
const assert=require('assert'),DX=require('./dxfcore.js'),E=require('./dxfedit.js'),P=require('./dxfprofile.js');
const line=(id,a,b)=>({id,type:'LINE',layer:'0',a:[...a],b:[...b]});
const doc={units:4,geometry:[
 line('a',[0,25],[20,25]),line('b',[20,25],[40,24]),line('c',[40,24],[60,24]),
 line('other',[0,8],[6,8])
],dimensions:[],entities:[]};
const rect={x1:-2,y1:0,x2:62,y2:30};
const result=E.autoSelect(doc,rect,0);
assert(result.externo.length>=3,'A proposta automática deve selecionar o contorno superior conectado.');
assert(result.externo.includes('a:0')&&result.externo.includes('b:0')&&result.externo.includes('c:0'));
assert(!result.externo.includes('other:0'),'A proposta externa não deve misturar o perfil interno.');
assert(result.ambiguous,'Proposta nunca equivale a aprovação CNC');
const original=JSON.stringify(doc.geometry);
const grown=E.extendLine(doc.geometry,'c:0','fim',5);
assert(grown.ok);assert.equal(doc.geometry[2].b[0],65);
assert.equal(doc.geometry[2].b[1],24);
assert.equal(E.extendLine(doc.geometry,'c:0','ini',3).ok,true);
assert.equal(doc.geometry[2].a[0],37);
assert(!E.extendLine(doc.geometry,'c:0','fim',-2).ok);
assert(!E.extendLine(doc.geometry,'abc:9','fim',5).ok);
assert(original!==JSON.stringify(doc.geometry),'A cópia de trabalho pode ser alterada');
const originalSegment=P.segments([line('long',[2,15],[58,15])])[0];
const tr=E.viewTransform(rect,'direita'),mid=tr([30,15]);
const box=E.rectBounds([mid[0]-2,mid[1]-6],[mid[0]+2,mid[1]+6]);
assert(E.selectRectSegments([originalSegment],box,rect,'direita').includes('long:0'),'Quadro corta uma linha mesmo sem conter suas pontas');
const away=E.rectBounds([mid[0]-2,mid[1]-80],[mid[0]+2,mid[1]-70]);
assert.deepEqual(E.selectRectSegments([originalSegment],away,rect,'direita'),[]);
const mirror=E.viewTransform(rect,'esquerda');
assert(Math.abs((mirror([30,15])[0]+tr([30,15])[0])-900)<1e-6,'Inversão da face não muda escala');
const arc={uid:'arc:0',kind:'arc',type:'ARC',c:[30,15],r:10,start:0,end:180};
const point=tr([30,25]);
assert(E.selectRectSegments([arc],E.rectBounds([point[0]-3,point[1]-3],[point[0]+3,point[1]+3]),rect,'direita').length===1);
console.log('DXF editor: proposta automática, 2 extensões, área de limpeza, espelhamento Z0 e arcos aprovados.');
