/* Vínculo conservador de cotas e características entre vistas vetoriais.
   A correspondência por valor é SUGESTÃO e nunca altera a geometria sem confirmação.
   O mesmo featureKey em vistas diferentes representa referência explícita da mesma característica. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFReconciliar=factory();
})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 function num(v){var n=Number(v);return Number.isFinite(n)&&n>0&&n<=20000?n:null}
 function nearly(x,y,tol){return Math.abs(x-y)<=Math.max(tol||.02,Math.max(x,y)*.0001)}
 function klass(type){return ['diametro','comprimento','raio','angulo','rosca','rosca_furo'].indexOf(type)>=0?type:'desconhecida'}
 function id(i,key){return 'seg:'+i+':'+key}
 function slots(model,length){
  var list=[],add=(key,title,type,v,editable,owner)=>list.push({key,title,type,value:num(v),editable:editable!==false,owner:owner||null});
  add('total','Comprimento total','comprimento',length,true,{kind:'total'});
  (model||[]).forEach(function(q,i){
   var interno=String(q.tipo||'').charAt(0)==='i',cone=q.tipo==='icone'||q.tipo==='cone';
   var tag=(interno?'Furo':'Perfil externo')+' · lado '+(q.side||'1')+' · trecho '+(i+1);
   add(id(i,'a'),tag+' · Ø inicial','diametro',q.a,true,{index:i,field:'a'});
   add(id(i,'b'),tag+' · comprimento','comprimento',q.b,true,{index:i,field:'b'});
   if(cone)add(id(i,'c'),tag+' · Ø final','diametro',q.c,true,{index:i,field:'c'});
  });
  return list;
 }
 function normal(d,i){
  var ty=klass(d.tipo),n=num(d.valor);
  if(!n||ty==='desconhecida')return null;
  return {id:String(d.id||('cota:'+i)),tipo:ty,valor:n,rotulo:String(d.rotulo||String(d.valor)),view:String(d.view||'não identificada'),
   featureKey:d.featureKey?String(d.featureKey):null,source:d.source||'pdf-vetorial',explicit:d.explicit!==false};
 }
 function uniqueDims(ds){
  var seen={},out=[];
  ds.forEach(function(d,i){var n=normal(d,i);if(!n)return;var k=n.id;if(seen[k])k+=':'+i;n.id=k;seen[k]=true;out.push(n)});
  return out;
 }
 function evaluate(model,length,dimensions,links,manual,options){
  var sl=slots(model,length),ds=uniqueDims(dimensions||[]),bindings=links||{},confirmed=manual||{},targetView=options&&options.targetView||'lateral',issues=[],report=[],used={};
  sl.forEach(function(s){
   var matched=ds.filter(d=>d.featureKey===s.key&&d.tipo===s.type);
   var values=matched.map(d=>d.valor),unique=[];
   values.forEach(n=>{if(!unique.some(v=>nearly(n,v)))unique.push(n)});
   var chosen=ds.find(d=>d.id===bindings[s.key]&&d.tipo===s.type);
   var conflict=unique.length>1&&!chosen;
   var auto=matched.length&&unique.length===1?matched[0]:null;
   // Cross-view value match only nominates a candidate; it does not establish feature identity.
   var plausible=ds.filter(d=>d.tipo===s.type&&s.value!=null&&nearly(s.value,d.valor));
   var inView=plausible.filter(d=>d.view===targetView);
   var competingSlots=sl.filter(t=>t.type===s.type&&t.value!=null&&s.value!=null&&nearly(t.value,s.value));
   var direct=inView.length===1&&competingSlots.length===1?inView[0]:null;
   var evidence=chosen||auto||direct||null;
   var verified=!!(confirmed[s.key]||evidence&&!conflict&&s.value!==null&&nearly(evidence.valor,s.value));
   if(chosen&&!nearly(chosen.valor,s.value)){verified=false;issues.push({type:'divergencia',key:s.key,message:s.title+': geometria e cota selecionada não coincidem.'})}
   if(conflict){verified=false;issues.push({type:'conflito',key:s.key,message:s.title+': cotas incompatíveis para a mesma característica.'})}
   if(!verified)issues.push({type:'pendente',key:s.key,message:s.title+': dimensão não confirmada.'});
   if(evidence)used[evidence.id]=true;
   report.push(Object.assign({},s,{verified,conflict,evidence:evidence&&evidence.id||null,
     status:conflict?'conflito':verified?confirmed[s.key]?'confirmada pelo usuário':'cotada':'pendente',
     suggestions:plausible.map(d=>d.id),possible:ds.filter(d=>d.tipo===s.type).map(d=>d.id)}));
  });
  // Características anotadas (raios/roscas etc.) devem ser explicitamente incorporadas ao modelo CNC.
  ds.filter(d=>['raio','angulo','rosca','rosca_furo'].indexOf(d.tipo)>=0).forEach(d=>{
   var handled=confirmed['detail:'+d.id]===true;
   if(!handled)issues.push({type:'detalhe',key:'detail:'+d.id,message:d.rotulo+' ('+d.tipo+') na vista '+d.view+' requer tratamento geométrico.'});
  });
  var details=ds.filter(d=>['raio','angulo','rosca','rosca_furo'].indexOf(d.tipo)>=0);
  return {slots:report,dimensions:ds,details,issues,ready:issues.length===0,
   summary:{verified:report.filter(q=>q.verified).length,total:report.length,conflicts:report.filter(q=>q.conflict).length,missing:report.filter(q=>!q.verified).length}};
 }
 function bind(model,length,key,dimension,manual){
  var m=(model||[]).map(q=>Object.assign({},q)),total=Number(length);
  if(!dimension||!num(dimension.valor))return null;
  var target=slots(m,total).find(s=>s.key===key);
  if(!target||target.type!==dimension.tipo)return null;
  var n=Number(dimension.valor);
  if(key==='total')total=n;
  else{
   var i=target.owner.index,field=target.owner.field;
   if(!m[i])return null;
   m[i][field]=n;
  }
  return {model:m,length:total,verifiedKey:key,dimensionId:dimension.id};
 }
 return {slots,evaluate,bind,nearly,uniqueDims};
});
