/* Extração conservadora de cotas/legendas em desenhos técnicos.
   Letras isoladas, revisões e escala impressa não viram cotas CNC. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFCotas=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const number=s=>Number(String(s).replace(',','.'));
function parse(str){
 var raw=String(str||'').trim(),m,n;
 if(!raw)return null;
 if((m=raw.match(/^(?:SE[CÇ][AÃ]O|SECTION|CORTE|DETALHE|DETAIL|VISTA)\b.*$/i)))
   return {kind:'marcador_vista',label:raw,value:null};
 if((m=raw.match(/^[mM]\s*(\d+(?:[.,]\d+)?)\s*(?:[Pp]\s*(\d+(?:[.,]\d+)?)|[xX×]\s*(\d+(?:[.,]\d+)?))?$/))){
   return {kind:'rosca',label:raw,value:number(m[1]),passo:m[2]?number(m[2]):null,profundidade:m[3]?number(m[3]):null};
 }
 if((m=raw.match(/^[Rr]\s*(\d+(?:[.,]\d+)?)$/)))return {kind:'raio',label:raw,value:number(m[1])};
 if((m=raw.match(/^(\d+(?:[.,]\d+)?)\s*°$/)))return {kind:'angulo',label:raw,value:number(m[1])};
 if((m=raw.match(/^(?:[Ø⌀Φφ]|DI[AÂ]METRO[: ]*)\s*(\d+(?:[.,]\d+)?)$/i)))
   return {kind:'diametro',label:raw,value:number(m[1])};
 if((m=raw.match(/^(\d+(?:[.,]\d+)?)(?:\s*(mm))?(?:\s+(CANTO\s+VIVO))?$/i))){
   n=number(m[1]);if(n<=0||n>20000)return null;
   return {kind:'linear_sem_tipo',label:raw,value:n,nota:m[3]||null};
 }
 return null;
}
function extract(items){
 return (items||[]).map(function(t,i){
  var v=parse(t.str);if(!v)return null;
  var mat=t.transform||[1,0,0,1,0,0],angle=Math.atan2(mat[1]||0,mat[0]||1);
  return Object.assign({index:i,x:Number(mat[4])||0,y:Number(mat[5])||0,orientacao:Math.abs(Math.sin(angle))>.65?'vertical':'horizontal'},v);
 }).filter(Boolean);
}
function summary(items){
 var dims=extract(items),byType={};
 dims.forEach(d=>{byType[d.kind]=(byType[d.kind]||0)+1});
 return {dims,byType,multiple:(byType.linear_sem_tipo||0)>3||(byType.rosca||0)>1||(byType.raio||0)>0||(byType.angulo||0)>0,
  note:'Cotas sem símbolo Ø permanecem sem tipo até conferir sua linha de chamada e a vista.'};
}
return {parse,extract,summary};
});
