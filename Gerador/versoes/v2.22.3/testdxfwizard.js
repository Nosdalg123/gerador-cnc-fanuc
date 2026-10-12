'use strict';
/* Teste geométrico reproduzível: não depende de DXFs proprietários. */
const assert=require('assert');
const DX=require('./dxfcore.js'),W=require('./dxfwizardgeom.js');
const rect={x1:-20,y1:0,x2:300,y2:300},axis=0;
const line=(id,a,b)=>({id,type:'LINE',a,b});
const arc=(id,c,r,start,end)=>({id,type:'ARC',c,r,start,end});
const documentOf=geometry=>({geometry});
function model(geometry){
 const doc=documentOf(geometry),parts=W.collect(doc,rect,axis);
 return {doc,parts,selection:new Set(parts.map(p=>p.uid))};
}
{
 // ARC nativo não contém 'a' nem 'b', o construtor anterior rejeitava incorretamente.
 const a=model([
  line('l1',[0,10],[10,10]),
  arc('r1',[10,15],5,270,0),
  line('l2',[15,15],[40,15])
 ]);
 assert(a.parts.some(x=>x.uid==='r1:0'&&x.kind==='arc'&&x.start&&x.end),'ARC precisa ter extremos calculados');
 const graph=W.analyze(a.parts,a.selection);
 assert(graph.ok,'Linha + arco + linha precisa formar perfil conectado: '+JSON.stringify(graph));
 assert.equal(graph.ordered.length,3);
 assert(graph.hasArc);
}
{
 const a=model([line('l1',[0,10],[10,10]),line('l2',[10.18,10],[20,10]),line('l3',[20,10],[30,15])]);
 let graph=W.analyze(a.parts,a.selection);
 assert(!graph.ok && graph.components===2,'Folga de 0.18mm não deve passar despercebida');
 const options=W.proposal(graph),fix=options.find(x=>x.safe&&Math.abs(x.mm-.18)<1e-5);
 assert(fix,'Falha: não sugeriu união única 0.18 mm');
 assert(W.apply(a.doc.geometry,fix).ok,'Não aplicou união');
 graph=W.analyze(W.collect(a.doc,rect,axis),a.selection);
 assert(graph.ok,'Após união, cadeia deveria ficar contínua');
}
for(const gap of [3.5,9.849]){
 const a=model([line('l1',[0,10],[10,10]),line('l2',[10+gap,10],[30+gap,10])]);
 const g=W.analyze(a.parts,a.selection);
 assert(!g.ok&&g.components===2,'Falha na folga '+gap);
 const proposals=W.proposal(g);
 assert(proposals.some(p=>!p.safe&&Math.abs(p.mm-gap)<1e-5),'Extensão com confirmação ausente para '+gap);
 assert(!proposals.some(p=>p.safe&&Math.abs(p.mm-gap)<1e-5),'Não pode corrigir automaticamente '+gap+' mm');
}
{
 const a=model([line('a',[0,10],[20,10]),line('b',[10,0],[10,20])]);
 const g=W.analyze(a.parts,a.selection);
 assert(g.crossings.length===1&&!g.ok,'Cruzamento interno precisa impedir construção');
}
{
 const a=model([line('a',[0,10],[20,10]),line('b',[0,10],[20,10])]);
 const g=W.analyze(a.parts,a.selection);
 assert(g.duplicates.length>0&&!g.ok,'Duplicatas precisam ser sinalizadas');
}
{
 const a=model([line('a',[0,10],[107,10])]);
 const g=W.analyze(a.parts,a.selection);
 assert.equal(g.span,107,'Extensão axial precisa permanecer nativa (107, não 110)');
}
console.log('PASSOU: ARC nativo, grafo, folgas 0.18/3.500/9.849, cruzamentos, sobreposições e cota axial.');
{
 const a=model([line('vertical',[10,-15],[10,15]),line('horizontal',[10,15],[40,15])]);
 assert(W.analyze(a.parts,a.selection).ok,'LINE atravessando o eixo deve ser recortada na metade superior');
 const s=a.parts.find(x=>x.uid==='vertical:0');
 assert.deepEqual(s.start,[10,0]);assert.equal(s.clippedEnd,'ini');
 assert.deepEqual(a.doc.geometry[0].a,[10,-15],'Recorte não altera CAD');
}
{
 const P=require('./dxfprofile.js'),E=require('./dxfedit.js');
 const native=arc('curva',[0,0],10,270,90),doc=documentOf([native]);
 const parts=W.collect(doc,{x1:-20,y1:-20,x2:20,y2:20},0);
 assert.equal(parts.length,1,'Arco atravessando eixo deve permanecer selecionável');
 assert(Math.abs(parts[0].start[0]-10)<1e-8&&Math.abs(parts[0].start[1])<1e-8);
 assert.equal(parts[0].r,10,'Raio deve ser preservado');
 assert(P.segments(doc.geometry)[0].a,'ARC nativo precisa fornecer extremo ao construtor anterior');
 const near=model([line('reta',[0,10],[10,10]),arc('raio',[10,15],5,270,0),line('aux',[12,0],[12,20])]);
 const to=E.viewTransform(rect,''),target=[10+5/Math.sqrt(2),15-5/Math.sqrt(2)];
 assert.equal(E.nearestSegment(near.parts,to(target),rect,'','aux:0').uid,'raio:0',
  'Área sensível da linha vizinha não pode interceptar o clique sobre arco');
}
console.log('PASSOU: semiperfil LINE/ARC analítico, fonte imutável e clique no traço mais próximo.');
{
 const a=model([arc('upper',[10,10],5,0,180),arc('lower',[10,10],5,180,360)]);
 const g=W.analyze(a.parts,a.selection);
 assert(g.ok&&!g.duplicates.length,'Arcos opostos com as mesmas pontas formam uma curva fechada, não duplicatas');
 const t=model([line('a',[0,10],[20,10]),line('b',[10,0],[10,10])]);
 assert(W.analyze(t.parts,t.selection).crossings.length,'Conexão T no meio de linha deve ser detectada');
 const c=model([line('a',[0,15],[30,15]),arc('r',[15,10],10,0,180)]);
 assert(W.analyze(c.parts,c.selection).crossings.length,'LINE cruzando ARC precisa impedir construção');
 const overlap=model([line('a',[0,10],[20,10]),line('b',[10,10],[30,10]),line('c',[20,10],[10,10])]);
 assert(!W.analyze(overlap.parts,overlap.selection).ok,'Cadeia topológica com sobreposição parcial não é perímetro válido');
}
