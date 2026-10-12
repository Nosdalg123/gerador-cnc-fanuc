/* Convencao explicita de orientacao para torno CNC.
   PDF horizontal: origem visual à esquerda ou direita; PDF vertical: topo ou base.
   O perfil salvo SEMPRE comeca na face Z0, avanca para Z negativo e guarda diametros X. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFOrientacao=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function isValid(axis,face){
 return (axis==='horizontal'&&['esquerda','direita'].includes(face))||
        (axis==='vertical'&&['superior','inferior'].includes(face));
}
function shouldReverse(axis,face){
 if(!isValid(axis,face))throw new Error('Eixo ou face Z0 não definidos.');
 return face==='direita'||face==='inferior';
}
function flip(items,side){
 side=String(side||'1');
 var all=(items||[]).map(q=>Object.assign({},q));
 function group(internal){
  var matches=all.map((q,i)=>({q,i})).filter(v=>v.q.side===side&&(v.q.tipo[0]==='i')===internal);
  var rev=matches.map(v=>v.q).reverse().map(q=>{
   var n=Object.assign({},q);
   if(n.tipo==='cone'||n.tipo==='icone'){var d=n.a;n.a=n.c;n.c=d}
   return n;
  });
  matches.forEach((v,i)=>{all[v.i]=rev[i]});
 }
 group(false);group(true);return all;
}
function fromDrawing(items,axis,face,side){
 if(!isValid(axis,face))return (items||[]).map(q=>Object.assign({},q));
 return shouldReverse(axis,face)?flip(items,side):items.map(q=>Object.assign({},q));
}
function orientation(axis,face,side){
 if(!isValid(axis,face))return null;
 return {eixoPDF:axis,faceZ0PDF:face,lado:String(side||'1'),origem:'Z0',zAvanca:'negativo',xModo:'diametro',automatico:false};
}
return {isValid,shouldReverse,flip,fromDrawing,orientation};
});
