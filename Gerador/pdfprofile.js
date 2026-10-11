/* Geometria cotada para revisão do PDF: 1 unidade = 1 mm nos dois eixos.
   A ampliação de tela é uniforme, preservando as proporções X:Ø.
   Sem inferir dimensões a partir de pixels para a programação CNC. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFPerfil=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function num(v){return v==null||String(v).trim()===''?NaN:Number(v)}
function valid(n){return Number.isFinite(n)&&n>0&&n<=20000}
function fmt(n){return String(Math.round(n*10000)/10000).replace('.',',')}
function analyze(rows,total){
 var length=num(total), errors=[],warnings=[],items=[],sum={1:{ext:0,int:0},2:{ext:0,int:0}};
 if(!valid(length))errors.push('Informe um comprimento total válido.');
 if(!Array.isArray(rows)||!rows.length)errors.push('Nenhum contorno identificado nesta vista.');
 (rows||[]).forEach(function(r,i){
  var a=num(r.a),b=num(r.b),c=num(r.c),tp=r.tipo,side=String(r.side||'1');
  if(['cil','cone','icil','icone'].indexOf(tp)<0||['1','2'].indexOf(side)<0){errors.push('Cota '+(i+1)+': elemento não suportado no editor CNC.');return}
  if(!valid(a)||!valid(b)||(tp.indexOf('cone')>=0&&!valid(c))){errors.push('Cota '+(i+1)+': diâmetro ou comprimento inválido.');return}
  items.push({tipo:tp,side:side,a:a,b:tp.indexOf('cone')>=0?c:b,...(tp.indexOf('cone')>=0?{c:b}:{})});
  sum[side][tp[0]==='i'?'int':'ext']+=b;
 });
 if(valid(length))['1','2'].forEach(function(side){['ext','int'].forEach(function(cat){
  if(sum[side][cat]>length+0.0001)errors.push('Contorno '+cat+' do lado '+side+' excede o comprimento total.');
 })});
 var ext=items.filter(t=>t.tipo[0]!=='i'),inside=items.filter(t=>t.tipo[0]==='i');
 if(!ext.length)errors.push('A vista ainda não contém um contorno externo.');
 if(valid(length)&&ext.length&&sum[1].ext+sum[2].ext<length-0.0001)errors.push('Contorno externo incompleto: a peça precisa cobrir todo o comprimento antes de salvar.');
 function at(list,side,z){var p=0;for(var i=0;i<list.length;i++){var q=list[i];if(q.side!==side)continue;var span=q.tipo.indexOf('cone')>=0?q.c:q.b;if(z<=p+span+1e-7)return q.a+((q.tipo.indexOf('cone')>=0?q.b:q.a)-q.a)*Math.min(1,Math.max(0,(z-p)/span));p+=span}return null}
 ['1','2'].forEach(function(side){var cuts=[0],p=0;[ext,inside].forEach(function(list){p=0;list.forEach(function(q){if(q.side!==side)return;p+=q.tipo.indexOf('cone')>=0?q.c:q.b;cuts.push(p)})});
  cuts.forEach(function(z){var e=at(ext,side,z),i=at(inside,side,z);if(e!=null&&i!=null&&i>=e-0.0001)errors.push('O Ø interno é maior ou igual ao externo no lado '+side+'.')});
 });
 if(items.some(q=>q.side==='2'))warnings.push('Confira a orientação dos lados 1 e 2 no editor CNC.');
 return {ok:errors.length===0,errors:[...new Set(errors)],warnings: warnings,items,length,sum};
}
function scaleFor(length,maxD,W,H){return Math.min((W-255)/length,(H-160)/maxD)}
function svg(rows,total,options){
 var a=analyze(rows,total);if(!a.ok)return {ok:false,svg:'',errors:a.errors,warnings:a.warnings,items:a.items};
 var side=String(options&&options.side||'1'),ext=[],inside=[],zE=0,zI=0;
 rows.forEach(function(r,i){if(String(r.side||'1')!==side)return;var t={index:i,tipo:r.tipo,a:num(r.a),b:num(r.b),c:num(r.c)};(r.tipo[0]==='i'?inside:ext).push(t)});
 if(!ext.length)return {ok:false,svg:'',errors:['Sem geometria externa deste lado.'],warnings:a.warnings,items:a.items};
 var W=760,H=460,maxD=Math.max(...ext.map(q=>Math.max(q.a,q.tipo==='cone'?q.c:q.a)));
 var scale=scaleFor(a.length,maxD,W,H),spanX=scale*a.length;
 var cx=(W-75)/2,cy=H/2+10,left=cx-spanX/2,right=cx+spanX/2;
 var ink='#244059',dim='#2463a7',paper='#ffffff',fill='#d5e5f2',axis='#91a7be';
 function x(z){return right-z*scale}
 function y(d,sign){return cy+sign*d/2*scale}
 function ln(x1,y1,x2,y2,style){return '<line x1="'+x1.toFixed(3)+'" y1="'+y1.toFixed(3)+'" x2="'+x2.toFixed(3)+'" y2="'+y2.toFixed(3)+'" '+(style||'')+'/>'}
 function text(px,py,val,anchor){return '<text x="'+px.toFixed(2)+'" y="'+py.toFixed(2)+'" text-anchor="'+(anchor||'middle')+'" font-size="14" fill="'+ink+'" font-weight="650">'+val+'</text>'}
 function profile(list){
  var z=0,pts=[];list.forEach(function(t){var end=t.tipo.indexOf('cone')>=0?t.c:t.a;if(!pts.length||pts[pts.length-1].z!==z||pts[pts.length-1].d!==t.a)pts.push({z,d:t.a});z+=t.b;pts.push({z,d:end})});return pts;
 }
 function path(points){if(!points.length)return '';return 'M'+points.map(q=>x(q.z).toFixed(2)+','+y(q.d,-1).toFixed(2)).join(' L')+' L'+points.slice().reverse().map(q=>x(q.z).toFixed(2)+','+y(q.d,1).toFixed(2)).join(' L')+' Z'}
 function clickLabel(px,py,val,index,key,hint){
  var prop=index==null?'total':index,attr=index==null?'data-edit-total="1"':'data-edit-index="'+index+'" data-edit-key="'+key+'"';
  return '<g class="pdf-cota-edit" role="button" tabindex="0" '+attr+' aria-label="Editar '+hint+'" style="cursor:pointer"><rect x="'+(px-33).toFixed(1)+'" y="'+(py-18).toFixed(1)+'" width="66" height="24" rx="5" fill="#e6f2ff" stroke="#aac8e2"/>'+text(px,py,val)+'</g>';
 }
 var po=profile(ext),pi=profile(inside);
 var out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Perfil CNC cotado em escala proporcional X igual a Y" data-mm-to-unit="'+scale.toFixed(6)+'" data-uniform-scale="true">';
 out+='<defs><pattern id="pdfHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="'+fill+'"/><path d="M0 0V10" stroke="#abc5d7" stroke-width="1"/></pattern></defs>';
 out+='<rect width="'+W+'" height="'+H+'" fill="'+paper+'"/>';
 out+=ln(left-36,cy,right+43,cy,'stroke="'+axis+'" stroke-width="1.2" stroke-dasharray="8 5 2 5"');
 out+='<path d="'+path(po)+'" fill="url(#pdfHatch)" stroke="'+ink+'" stroke-width="2.3"/>';
 if(pi.length)out+='<path d="'+path(pi)+'" fill="'+paper+'" stroke="'+ink+'" stroke-width="1.9"/>';
 out+=ln(left,55,left,y(maxD,-1)-6,'stroke="'+dim+'" stroke-width="1"')+ln(right,55,right,y(maxD,-1)-6,'stroke="'+dim+'" stroke-width="1"');
 out+=ln(left,79,right,79,'stroke="'+dim+'" stroke-width="1.3"');
 out+=clickLabel(cx,67,fmt(a.length)+' mm',null,'total','comprimento total');
 out+=text(right,442,'Z0','end')+text(left,442,'Fundo','start');
 var zs=0;
 ext.forEach(function(t,i){
  var mid=zs+t.b/2,tx=x(mid),da=t.tipo==='cone'?t.c:t.a,yTop=y(Math.max(t.a,da),-1),next=zs+t.b;
  out+='<rect data-edit-index="'+t.index+'" data-edit-key="segment" class="pdf-piece-edit" x="'+Math.min(x(zs),x(next)).toFixed(1)+'" y="'+yTop.toFixed(1)+'" width="'+(t.b*scale).toFixed(1)+'" height="'+(Math.max(t.a,da)*scale).toFixed(1)+'" fill="#000" fill-opacity="0" style="cursor:pointer"><title>Editar trecho da peça</title></rect>';
  if(ext.length>1){out+=clickLabel(tx,Math.max(108,yTop-19),fmt(t.b),t.index,'b','comprimento do trecho '+(i+1));}
  out+=clickLabel(Math.min(W-59,Math.max(58,x(next)-20)),Math.max(145,yTop-29), 'Ø'+fmt(t.a),t.index,'a','diâmetro externo');
  if(t.tipo==='cone')out+=clickLabel(tx,Math.min(H-45,y(da,1)+29),'Ø'+fmt(da),t.index,'c','diâmetro final do cone');
  zs=next;
 });
 if(inside.length){
  var zi=0;
  inside.forEach(function(t,i){
   var tx=x(zi+t.b/2),di=t.tipo==='icone'?t.c:t.a;
   out+=clickLabel(tx,cy+8,'Ø'+fmt(t.a),t.index,'a','diâmetro interno');
   if(inside.length>1)out+=clickLabel(tx,Math.min(H-42,y(maxD,1)+26),fmt(t.b),t.index,'b','comprimento do furo');
   if(t.tipo==='icone')out+=clickLabel(tx,cy+35,'Ø'+fmt(di),t.index,'c','diâmetro final do cone interno');
   zi+=t.b;
  });
 }
 out+=text(W/2,H-7,'Escala proporcional em X e Ø · 1 mm = '+scale.toFixed(2)+' unidades SVG · clique nas cotas');
 out+='</svg>';
 return {ok:true,svg:out,errors:[],warnings:a.warnings,items:a.items,scale,drawn:{length:spanX,diameter:maxD*scale},uniform:true};
}
return {analyze,svg,scaleFor};
});
