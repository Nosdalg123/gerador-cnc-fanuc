/* Orientação explícita do contorno longitudinal em relação ao eixo Z do torno.
   Lado A = primeiro extremo da vista; Lado B = extremo oposto.
   Inverter muda a sequência CNC e troca a boca/fundo de cada cone. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFOrient=factory();
})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 function reverse(model,side){
  var sid=String(side||'1'),isPart=q=>String(q.side||'1')===sid;
  var group=function(q){return q.tipo&&q.tipo[0]==='i'?'int':'ext'};
  var out=(model||[]).map(q=>Object.assign({},q));
  ['ext','int'].forEach(function(g){
   var indexes=[],parts=[];
   out.forEach(function(q,i){if(isPart(q)&&group(q)===g){indexes.push(i);parts.push(q)}});
   parts.reverse().forEach(function(q,i){
    var n=Object.assign({},q);
    if(n.tipo==='cone'||n.tipo==='icone'){var start=n.a;n.a=n.c;n.c=start}
    out[indexes[i]]=n;
   });
  });
  return out;
 }
 function inspect(model,side){
  var ext=(model||[]).filter(q=>String(q.side||'1')===String(side||'1')&&q.tipo&&q.tipo[0]!=='i');
  var problems=[],end=null;
  ext.forEach(function(q,k){var begin=Number(q.a),final=q.tipo==='cone'?Number(q.c):begin;
   if(end!=null&&begin<end-1e-6)problems.push('degrau de Ø'+end+' para Ø'+begin+' diminui para dentro');
   if(final<begin-1e-6)problems.push('cone Ø'+begin+' para Ø'+final+' diminui para dentro');
   end=final;
  });
  return {ok:problems.length===0,problems:problems,
   note:problems.length?'O desbaste G71 tipo I pode rejeitar esta orientação. Verifique a face escolhida ou outra estratégia no Gerador.':'Sentido externo compatível com a regra de crescimento de diâmetro do G71 tipo I (não comprova fixação segura).'};
 }
 return {reverse:reverse,inspect:inspect};
});
