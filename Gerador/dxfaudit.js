/* Gate de segurança: dados CAD medidos vs perfil CNC selecionado.
   Não infere fixação nem converte raios, roscas e splines em retas. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCDXFAuditoria=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function num(x){return x==null||x===''?NaN:Number(x)}
function unique(arr){return [...new Set(arr)]}
function check(args){
 args=args||{};
 const ex=args.external,inside=args.internal,doc=args.doc,face=args.face,axis=num(args.axis),length=num(args.length);
 let problems=[];
 if(!doc||doc.units!==4)problems.push('DXF em unidade diferente de milímetros ou não informado.');
 if(!Number.isFinite(axis))problems.push('Eixo X0 não definido.');
 if(face!=='esquerda'&&face!=='direita')problems.push('Face Z0 não definida na preparação.');
 if(!(length>0))problems.push('Comprimento nominal não informado.');
 if(!ex||!ex.selected||!ex.selected.length)problems.push('Selecione ao menos uma cadeia externa.');
 if(ex&&ex.connection){
  if(ex.connection.components!==1)problems.push('Perfil externo com '+ex.connection.components+' cadeias desconectadas.');
  if(ex.connection.branches.length)problems.push('Perfil externo com bifurcações não resolvidas.');
  if(ex.connection.gaps.length!==2)problems.push('Perfil externo precisa ter duas extremidades abertas, não '+ex.connection.gaps.length+'.');
 }
 const groups=[['externo',ex],['interno',inside]];
 groups.forEach(([label,g])=>{
  if(!g||!g.selected||!g.selected.length)return;
  if(g.connection&&g.connection.components!==1)problems.push('Perfil '+label+' tem partes desconectadas.');
  if(g.classified&&g.classified.some(t=>t.kind!=='cil'&&t.kind!=='cone'))
   problems.push('Perfil '+label+' contém arco, face/degrau ou curva ainda sem tradução CNC.');
  let intervals=g.selected.map(s=>{
   let a=s.kind==='line'&&s.a?s.a[0]:null,b=s.kind==='line'&&s.b?s.b[0]:null;
   return a===null||b===null?null:{lo:Math.min(a,b),hi:Math.max(a,b),id:s.uid};
  }).filter(Boolean).sort((a,b)=>a.lo-b.lo);
  for(let i=1;i<intervals.length;i++){
   const prev=intervals[i-1],now=intervals[i];
   if(now.lo<prev.hi-.16)problems.push('Sobreposição axial no perfil '+label+' perto de '+now.lo.toFixed(3)+' mm CAD.');
   else if(now.lo>prev.hi+.16)problems.push('Lacuna axial no perfil '+label+' de '+(now.lo-prev.hi).toFixed(3)+' mm.');
  }
  if(label==='externo'&&Number.isFinite(length)&&intervals.length){
   const span=Math.max(...intervals.map(t=>t.hi))-Math.min(...intervals.map(t=>t.lo));
   if(Math.abs(span-length)>.15)problems.push('Projeção axial externa '+span.toFixed(3)+' mm diferente do comprimento nominal '+length.toFixed(3)+' mm.');
  }
 });
 const native=(args.nativeDimensions||[]).filter(d=>d&&d.measure>0&&d.kind===0&&!d.diameter&&Math.abs(Math.sin(Number(d.angle||0)*Math.PI/180))<.15);
 if(native.length&&length>0){
  const max=Math.max(...native.map(d=>d.measure));
  if(Math.abs(max-length)>.20)problems.push('Comprimento informado '+length.toFixed(3)+' mm difere da maior cota axial CAD '+max.toFixed(3)+' mm.');
 }
 let candidate=args.candidateSegments||[],chosen=new Set([...(ex?.selected||[]).map(s=>s.uid),...(inside?.selected||[]).map(s=>s.uid)]);
 const arcs=candidate.filter(s=>s.kind==='arc');
 if(arcs.length){
  const missing=arcs.filter(s=>!chosen.has(s.uid));
  if(missing.length)problems.push(missing.length+' arco(s) CAD na seção não associados; confira cada raio/canto.');
  // mesmo um arco selecionado não é tradutível atualmente
  if(arcs.some(s=>chosen.has(s.uid)))problems.push('Raios CAD selecionados exigem conversão de canto antes de exportar.');
 }
 if((args.unsupportedCurves||0)>0)problems.push('SPLINE/ELLIPSE CAD ainda sem tradução CNC.');
 if((args.threadNotes||0)>0)problems.push('Roscas/furos CAD identificados; confirmar operações próprias no editor.');
 return {ok:problems.length===0,problems:unique(problems)};
}
return {check};
});
