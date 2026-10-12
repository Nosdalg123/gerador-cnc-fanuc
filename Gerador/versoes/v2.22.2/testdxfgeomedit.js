/* Regressão: editar somente semiperfil superior em CAD 2D (sem CNC liberado). */
const assert=require('assert'),D=require('./dxfcore.js'),P=require('./dxfprofile.js'),G=require('./dxfgeomedit.js');
const L=(id,a,b)=>({id,type:'LINE',a:[...a],b:[...b]});
const geo=[
 L('outer',[0,20],[80,20]),
 L('cross',[40,9],[40,31]),
 L('next',[95,12],[95,38]),
 L('lower',[0,-20],[80,-20])
];
const rect={x1:-5,x2:110,y1:-30,y2:50};
const original=JSON.stringify(geo);
const trim=G.trimAtIntersection(geo,'outer:0','ini',0,rect);
assert(trim.ok,'Corte no cruzamento');
assert(Math.abs(trim.newB[0]-40)<.001,'Manter ponta inicial, cortar resto');
const broken=G.splitAtIntersections(geo,'outer:0',0,rect,new Set());
assert(broken.ok&&broken.sections.length===2,'Quebrar em dois trechos no cruzamento');
const duplicate=JSON.parse(JSON.stringify(geo));
const kids=G.applySplit(duplicate,'outer:0',broken.sections,'USER_SPLIT');
assert(kids.ok&&kids.added.length===2,'Quebra cria duas entidades independentes');
assert(!duplicate.some(x=>x.id==='outer'),'Entidade original substituída na cópia');
assert(JSON.stringify(geo)===original,'A fonte permanece intacta');
const next=G.nearestForward(geo,'outer:0','fim',0,rect,new Set());
assert(next.ok&&next.target==='next'&&Math.abs(next.mm-15)<.001,'Extender até próxima linha à direita');
const backward=G.nearestForward(geo,'outer:0','ini',0,rect,new Set());
assert(!backward.ok,'Sem destino para extensão do início');
const hidden=G.nearestForward(geo,'outer:0','fim',0,rect,new Set(['next:0']));
assert(!hidden.ok,'Linha apagada não é destino de extensão');
const none=G.trimAtIntersection([L('single',[0,20],[100,20])],'single:0','ini',0,rect);
assert(!none.ok,'Sem cruzamento não corta por adivinhação');
const doc={units:4,geometry:geo,entities:[],dimensions:[]};
const svg=P.svg(doc,rect,{axis:0,face:'direita',upperOnly:true,external:new Set(['outer:0']),internal:new Set(),selected:new Set(['outer:0']),candidate:new Set(),hidden:new Set(),focus:'outer:0'});
assert(svg.includes('data-selected-focus="true"'),'Linha selecionada tem destaque persistente');
assert(svg.includes('data-construction="true"'),'Parte inferior renderizada como construção');
assert(svg.includes('stroke-dasharray="6 5"'),'Inferior tracejado');
assert(!svg.includes('data-cad-segment="lower:0"'),'Linha inferior original não pode ser selecionável no semiperfil');
assert(svg.includes('data-cad-hit="outer:0"'),'Área de clique ampliada');
assert(!svg.includes('NaN'),'Escala permanece válida');
console.log('Perfil superior: cortar, quebrar, extensão automática, seleção explícita e construção inferior aprovados.');
{
 const line=L('tangent',[9.999998,15],[9.999998,-15]),arc={id:'r',type:'ARC',c:[6.5,0],r:3.5,start:0,end:90};
 const hit=G.trimAtIntersection([line,arc],'tangent:0','ini',NaN,null);
 assert(hit.ok&&Math.abs(hit.point[1])<1e-8,'Corte quase tangente preserva coordenada nativa da ponta');
 const quarter={id:'q',type:'ARC',c:[0,0],r:100,start:0,end:90};
 assert(!G.hitsOnLine(L('outside',[99,-1],[101,-1]),[quarter],NaN,null).length,
  'Amostragem não pode aceitar ponto fora do arco grande');
}
