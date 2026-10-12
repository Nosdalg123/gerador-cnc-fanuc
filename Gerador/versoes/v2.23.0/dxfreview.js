/* Conferência de cotas e anotações CAD. Não gera nem aprova programa CNC. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./dxfcore.js'),require('./dxfprofile.js'));
 else root.CNCDXFReview=factory(root.CNCDXF,root.CNCDXFPerfil);
})(typeof self!=='undefined'?self:this,function(DX,P){
'use strict';
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
function label(d){
 const value=d.measure===null?'?':fmt(d.measure);
 return String(d.text||'<>').replace(/%%c/gi,'Ø').replace(/<>/g,value);
}
function check({doc,sourceDoc,region,axis,face,graph,length,built}){
 const source=sourceDoc||doc,issues=[],notes=[],dims=source&&region?DX.nativeCotas(source.dimensions,region):[];
 const add=(code,message,detail={})=>issues.push({code,message,...detail});
 const axial=dims.filter(d=>!d.diameter&&!/\bM\s*\d|M<>/i.test(d.text||'')&&d.measure>0&&
  (d.kind===0&&Math.abs(Math.sin((d.angle||0)*Math.PI/180))<.00001||
   d.kind===1&&Math.abs(d.b[1]-d.a[1])<.01)).sort((a,b)=>b.measure-a.measure);
 const reference=axial[0]||null,nominal=Number(length),span=graph?.span||0;
 if(!source||source.units!==4)add('units','Confirme a unidade em milímetros.');
 if(!Number.isFinite(axis))add('axis','Defina o eixo central da vista longitudinal.');
 if(!['esquerda','direita'].includes(face))add('face','Escolha a face Z0 de referência.');
 if(!graph?.ok)add('chain','A seleção ainda não forma uma cadeia contínua sem interseções ou sobreposições.');
 if(!built)add('build','Construa e isole o perímetro antes da conferência final.');
 if(!(nominal>0))add('length','Informe o comprimento nominal da peça.');
 else if(Math.abs(nominal-span)>.02)add('selected_length','Seleção: '+fmt(span)+' mm; comprimento informado: '+fmt(nominal)+' mm. Confira as extremidades.');
 if(reference&&Math.abs(reference.measure-span)>.02)
  add('axial_coverage','Maior cota axial da vista: '+label(reference)+' mm; a seleção cobre '+fmt(span)+' mm. Pode faltar parte do perfil.');
 const vertices=source&&region?P.segments(source.geometry,region).flatMap(s=>[s.a,s.b]).filter(Boolean):[];
 const unmatched=[];
 for(const d of dims){
  const literal=String(d.text||'').match(/^\s*(?:%%c|[Ø⌀])?\s*(\d+(?:[.,]\d+)?)\s*$/i);
  if(literal&&d.measure>0&&Math.abs(Number(literal[1].replace(',','.'))-d.measure)>.02)
   add('dimension_override','Cota '+d.id+': texto '+label(d)+' difere da medida CAD '+fmt(d.measure)+' mm.');
  if(!d.diameter||![0,1].includes(d.kind)||!d.a||!d.b)continue;
  const da=Math.min(...vertices.map(p=>dist(p,d.a))),db=Math.min(...vertices.map(p=>dist(p,d.b)));
  if(da>.05&&db>.05){
   unmatched.push({id:d.id,label:label(d),measure:d.measure,nearestVertex:Math.min(da,db)});
   add('diameter_reference','Cota '+label(d)+': nenhum vértice correspondente encontrado nas linhas/arcos da vista. Conferir no desenho cotado.',
    {dimensionId:d.id,points:[d.a,d.b],label:'Cota '+label(d)});
  }
 }
 const textNotes=(source?.entities||[]).filter(e=>e.text).map(e=>({id:e.id,text:e.text,scope:'folha'}))
  .concat(dims.map(d=>({id:d.id,text:label(d),scope:'cota'})));
 const used=new Set();
 for(const n of textNotes){
  const matches=n.text.match(/\bM\s*\d+(?:[.,]\d+)?(?:\s*(?:P\s*\d+(?:[.,]\d+)?|[x×]\s*\d+(?:[.,]\d+)?))?/gi)||[];
  for(const text of matches){const key=text.replace(/\s/g,'').toUpperCase();
   if(!used.has(key)){used.add(key);notes.push({id:n.id,text:text.toUpperCase(),scope:n.scope})}
  }
 }
 const radii=[...new Set((graph?.chosen||[]).filter(s=>s.kind==='arc').map(s=>Number(s.r.toFixed(6))))].sort((a,b)=>a-b);
 const curves=source&&region?DX.cut(source.geometry,region).filter(e=>['SPLINE','ELLIPSE'].includes(e.type)&&
  (!Number.isFinite(axis)||DX.sample(e,96).some(p=>p[1]>=axis))):[],special=curves.length;
 if(special){const points=DX.sample(curves[0],1);
  add('special_curve',special+' curva(s) especial(is) acima do eixo ainda não integram a cadeia LINE/ARC. Conferir e converter no editor CAD.',
   {entityId:curves[0].id,points:[points[0],points[points.length-1]],label:'Curva '+curves[0].id});
 }
 const geometryConsistent=issues.length===0;
 return {geometryConsistent,cncReady:false,issues,operations:notes,radii,specialCurves:special,
  faceReferenceX:face==='direita'?graph?.maxX:face==='esquerda'?graph?.minX:null,
  axialReference:reference?{id:reference.id,value:reference.measure,label:label(reference)}:null,
  selectedLength:span,nominalLength:nominal>0?nominal:null,unmatchedDimensions:unmatched,
  status:geometryConsistent?'Cadeia e comprimento conferidos; operações CNC ainda não associadas.':'Há medidas ou partes do contorno para conferir.',
  cncReason:'Rascunho CAD. Raios, roscas, furações, ferramentas e estratégia ainda precisam de associação ao editor CNC.'};
}
return {check,label};
});
