/* Reconhecimento de cotas de secoes anulares simples a partir do texto posicionado
   de PDFs vetoriais. Somente sugestoes: a conferência humana é obrigatoria. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CNCPDFRecon=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function number(s){if(!/^\s*\d{1,5}(?:[.,]\d{1,4})?\s*$/.test(s))return null;var n=Number(s.trim().replace(',','.'));return n>0&&n<=20000?n:null}
function candidates(items){
 var all=[],arr=items||[];
 arr.forEach(function(it,i){
  var raw=String(it.str||'').trim(),m=raw.match(/^(?:[Ø⌀Φφ]|DIA(?:METRO)?[ .:]*)?\s*(\d{1,5}(?:[.,]\d{1,4})?)$/i);
  if(!m)return;
  var n=number(m[1]);if(n===null)return;
  var t=it.transform||[1,0,0,1,0,0],angle=Math.atan2(Number(t[1])||0,Number(t[0])||1);
  var vertical=Math.abs(Math.sin(angle))>0.65,diam=/[Ø⌀Φφ]|DIA/i.test(raw);
  all.push({n:n,x:Number(t[4])||0,y:Number(t[5])||0,vertical:vertical,diam:diam,raw:raw,index:i});
 });
 return all;
}
function recognize(items){
 var a=candidates(items),diam=a.filter(function(q){return q.diam});
 var axial=a.filter(function(q){return q.vertical&&!q.diam});
 // SolidWorks pode codificar o simbolo Ø em uma fonte especial que não é extraída.
 // Exige a combinação 2 cotas paralelas na secao e 1 comprimento perpendicular.
 if(diam.length<2){
  var horiz=a.filter(function(q){return !q.vertical&&!q.diam});
  var groups=[];
  horiz.forEach(function(q){var hit=groups.find(function(g){return Math.abs(g.x-q.x)<20&&Math.abs(g.y-q.y)>5&&Math.abs(g.y-q.y)<100});if(hit)hit.values.push(q);else groups.push({x:q.x,y:q.y,values:[q]})});
  groups.sort(function(x,y){return y.values.length-x.values.length});
  if(groups.length&&groups[0].values.length===2)diam=groups[0].values;
 }
 // Evita inferir geometria em desenhos com muitas cotas ou multiplas vistas ambiguas.
 if(diam.length!==2||axial.length!==1)return {ok:false,candidates:a,reason:'Geometria não reconhecida com segurança: confirme e informe manualmente os trechos.'};
 var nums=diam.map(function(q){return q.n}).sort(function(x,y){return x-y}),length=axial[0].n;
 if(nums[0]===nums[1]||!length)return {ok:false,candidates:a,reason:'Cotas insuficientes ou repetidas.'};
 return {ok:true,tipo:'anel_cilindrico',externo:nums[1],interno:nums[0],comprimento:length,confidence:'revisar',candidates:a,
  explanation:'Sugestão de cilindro anular com furo passante; verificar seção e valores indicados no PDF.'};
}
return {recognize:recognize,candidates:candidates};
});
