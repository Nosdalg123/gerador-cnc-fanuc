/* Classificador de cotas de desenhos mecânicos vetoriais.
   Não transforma medidas de outras vistas ou notas técnicas em geometria.
   Fonte: texto posicionado no PDF, preservado para conferência humana. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFCotas=factory();
})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 function val(s){var v=Number(String(s).replace(',','.'));return Number.isFinite(v)&&v>0&&v<=20000?v:null}
 function text(s){
  var raw=String(s||'').replace(/\s+/g,' ').trim(),m;
  if(!raw||/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(raw))return null;
  if((m=raw.match(/^M\s*(\d+(?:[.,]\d+)?)\s*[Pp]\s*(\d+(?:[.,]\d+)?)\b/i)))
   return {tipo:'rosca',valor:val(m[1]),passo:val(m[2]),rotulo:'M'+m[1]+' P'+m[2]};
  if((m=raw.match(/^M\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\b/i)))
   return {tipo:'rosca_furo',valor:val(m[1]),profundidade:val(m[2]),rotulo:'M'+m[1]+' × '+m[2]};
  if((m=raw.match(/^[Rr]\s*(\d+(?:[.,]\d+)?)\b/)))
   return {tipo:'raio',valor:val(m[1]),rotulo:'R'+m[1]};
  if((m=raw.match(/^(\d+(?:[.,]\d+)?)\s*[°º]/)))
   return {tipo:'angulo',valor:val(m[1]),rotulo:m[1]+'°'};
  if((m=raw.match(/^[Ø⌀Φφ]\s*(\d+(?:[.,]\d+)?)/i)))
   return {tipo:'diametro',valor:val(m[1]),rotulo:'Ø'+m[1]};
  if((m=raw.match(/^(\d+(?:[.,]\d+)?)(?:\s*CANTO\s*VIVO)?$/i)))
   return {tipo:'numerica',valor:val(m[1]),cantoVivo:/CANTO\s*VIVO/i.test(raw),rotulo:raw};
  return null;
 }
 function extract(items,orientation){
  var axis=orientation==='vertical'?'vertical':'horizontal';
  return (items||[]).map(function(it,i){
   var data=text(it.str);if(!data||data.valor==null)return null;
   var t=it.transform||[1,0,0,1,0,0],angle=Math.atan2(Number(t[1])||0,Number(t[0])||1);
   // Inclui textos girados 90 graus e textos inclinados de raio.
   var vertical=Math.abs(Math.sin(angle))>0.70, direction=vertical?'vertical':'horizontal';
   var inferred=data.tipo==='numerica'?(direction===axis?'comprimento':'diametro'):data.tipo;
   // Nota com "CANTO VIVO" neste tipo de desenho geralmente é cota do diâmetro.
   if(data.cantoVivo)inferred='diametro';
   return {tipo:inferred,valor:data.valor,rotulo:data.rotulo,original:String(it.str||'').trim(),x:Number(t[4])||0,y:Number(t[5])||0,direcao:direction,confirma:true,index:i,...(data.passo?{passo:data.passo}:{}),...(data.profundidade?{profundidade:data.profundidade}:{})};
  }).filter(Boolean);
 }
 function summary(items,orientation){
  var all=extract(items,orientation),kind=type=>all.filter(q=>q.tipo===type);
  var lengths=kind('comprimento'),diameters=kind('diametro');
  var candidateLength=lengths.length?Math.max(...lengths.map(q=>q.valor)):null;
  var candidateDiameter=diameters.length?Math.max(...diameters.map(q=>q.valor)):null;
  return {all:all,lengths:lengths,diameters:diameters,
   rays:kind('raio'),angles:kind('angulo'),threads:kind('rosca').concat(kind('rosca_furo')),
   candidateLength:candidateLength,candidateDiameter:candidateDiameter,
   complex:lengths.length>1||diameters.length>2||kind('raio').length>0||kind('angulo').length>0||kind('rosca').length>0||kind('rosca_furo').length>0};
 }
 return {text:text,extract:extract,summary:summary};
});
