/* Controle de detalhes oriundos de PDFs complexos.
   Nao libera um rascunho por simples clique: compara tipos e cotas com elementos do editor.
   Cotas angulares sem referência, roscas sem passo e geometrias não suportadas
   continuam bloqueadas até implementação ou revisão técnica especializada. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFAuditoria=factory();
})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 function near(a,b){return Number.isFinite(+a)&&Number.isFinite(+b)&&Math.abs(+a- +b)<=Math.max(.025,Math.max(Math.abs(a),Math.abs(b))*.0001)}
 function verify(drawing,issues){
  var all=['trechos1','trechos2','internos1','internos2'].reduce(function(a,k){return a.concat((drawing&&drawing[k])||[])},[]);
  var resolved=[],unresolved=[];
  (issues||[]).forEach(function(q){
   var ok=false,type=q.tipo,v=q.valor;
   if(type==='raio')ok=all.some(e=>(e.tipo==='raio'||e.tipo==='iraio')&&near(e.a,v));
   else if(type==='rosca')ok=all.some(e=>(e.tipo==='rosca'||e.tipo==='irosca')&&near(e.a,v)&&near(e.c,q.passo));
   else if(type==='rosca_furo')ok=all.some(e=>e.tipo==='irosca'&&near(e.a,v)&&near(e.b,q.profundidade)&&Number(e.c)>0&&q.passo!=null&&near(e.c,q.passo));
   // angulos podem se referir ao eixo ou face: nao supor referencial.
   // Recursos não associados e cotas sem fonte explícita não são liberados.
   var entry={tipo:type,valor:v,rotulo:q.rotulo||type,view:q.view||'não identificada',passo:q.passo,profundidade:q.profundidade};
   (ok?resolved:unresolved).push(entry);
  });
  return {ready:unresolved.length===0,resolved:resolved,unresolved:unresolved};
 }
 return {verify:verify,near:near};
});
