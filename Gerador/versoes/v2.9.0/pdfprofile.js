/* Projecao independente de geometria PDF no formato de trechos do CNC.
   O desenho e reconstruido exclusivamente a partir das cotas conferidas.
   Modulo puro, pode ser testado com Node: node testpdfview.js. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFPerfil=factory();
})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 function valid(n){return Number.isFinite(n)&&n>0&&n<=20000}
 function num(x){return typeof x==='string'&&x.trim()===''?NaN:Number(x)}
 function fmt(x){return String(Math.round(x*10000)/10000).replace('.',',')}
 function analyze(rows,total){
  var length=num(total),errors=[],warnings=[],items=[],sum={1:{ext:0,int:0},2:{ext:0,int:0}};
  if(!valid(length))errors.push('Informe o comprimento total da peça em milímetros.');
  if(!Array.isArray(rows)||!rows.length)errors.push('Adicione um trecho externo ou interno.');
  (rows||[]).forEach(function(r,i){
   var a=num(r.a),b=num(r.b),c=num(r.c),tp=r.tipo,side=String(r.side||'1');
   if(['cil','cone','icil','icone'].indexOf(tp)<0||['1','2'].indexOf(side)<0){errors.push('Elemento '+(i+1)+': tipo ou lado inválido.');return}
   if(!valid(a)||!valid(b)||(tp.indexOf('cone')>=0&&!valid(c))){errors.push('Elemento '+(i+1)+': confira diâmetro, comprimento e diâmetro final.');return}
   var isInt=tp.charAt(0)==='i',cat=isInt?'int':'ext';
   var item={tipo:tp,side:side,a:a,b:tp.indexOf('cone')>=0?c:b};
   if(tp.indexOf('cone')>=0)item.c=b;
   items.push(item);sum[side][cat]+=b;
  });
  if(valid(length)){
   ['1','2'].forEach(function(side){
    ['ext','int'].forEach(function(cat){
     if(sum[side][cat]>length+0.0001)errors.push('O perfil '+(cat==='ext'?'externo':'interno')+' do lado '+side+' excede o comprimento final.');
    });
   });
  }
  var externals=items.filter(function(t){return t.tipo==='cil'||t.tipo==='cone'});
  var internals=items.filter(function(t){return t.tipo==='icil'||t.tipo==='icone'});
  if(!externals.length)errors.push('Informe ao menos um trecho externo para projetar a peça completa.');
  if(valid(length)&&sum[1].ext<length-0.0001&&sum[2].ext===0)warnings.push('Perfil externo parcial: falta definir o trecho restante da peça.');
  if(items.some(function(t){return t.side==='2'}))warnings.push('Peça de dois lados: confira os limites e a orientação em cada face no editor manual.');
  // Aproximacao conservadora: ao longo dos pontos cotados, o diametro interno nunca pode ser maior que o externo.
  function at(list,side,z){var p=0;for(var i=0;i<list.length;i++){var q=list[i];if(q.side!==side)continue;var w=(q.tipo==='cone'||q.tipo==='icone')?q.c:q.b,begin=q.a,end=(q.tipo==='cone'||q.tipo==='icone')?q.b:q.a;if(z<=p+w+1e-7)return begin+(end-begin)*Math.max(0,Math.min(1,(z-p)/w));p+=w;}return null}
  ['1','2'].forEach(function(side){var zz=0,steps=[0];items.forEach(function(t){if(t.side!==side)return;var w=(t.tipo==='cone'||t.tipo==='icone')?t.c:t.b;if(t.tipo[0]==='i')return;zz+=w;steps.push(zz);});zz=0;items.forEach(function(t){if(t.side!==side||t.tipo[0]!=='i')return;zz+=(t.tipo==='icone'?t.c:t.b);steps.push(zz)});
   var max=Math.min(sum[side].ext,sum[side].int);steps.filter(function(z){return z<=max}).forEach(function(z){var x=at(externals,side,z),y=at(internals,side,z);if(x!==null&&y!==null&&y>=x-0.0001)errors.push('O Ø interno encosta ou ultrapassa o Ø externo no lado '+side+'.')});
  });
  errors=Array.from(new Set(errors));
  return {ok:errors.length===0,errors:errors,warnings:warnings,items:items,length:length,sum:sum};
 }
 function svg(rows,total){
  var a=analyze(rows,total);
  if(!a.ok)return {ok:false,svg:'',errors:a.errors,warnings:a.warnings,items:a.items};
  var colors={ink:'#203248',dim:'#426484',piece:'#d7e5f1',background:'#ffffff',axis:'#7791a9'};
  var W=760,H=340,center=190,left=100,right=626,bar=right-left,totalL=a.length,maxD=Math.max.apply(null,a.items.filter(function(t){return t.tipo==='cil'||t.tipo==='cone'}).map(function(t){return Math.max(t.a,t.tipo==='cone'?t.b:t.a)}));
  var ys=Math.min(2.9,92/(maxD/2)),xs=bar/totalL;
  var E=a.items.filter(function(t){return t.side==='1'&&t.tipo[0]!=='i'}),I=a.items.filter(function(t){return t.side==='1'&&t.tipo[0]==='i'});
  var two=a.items.some(function(t){return t.side==='2'});
  if(!E.length&&two){E=a.items.filter(function(t){return t.side==='2'&&t.tipo[0]!=='i'});I=a.items.filter(function(t){return t.side==='2'&&t.tipo[0]==='i'})}
  function coords(list){
   var z=0,pts=[];
   list.forEach(function(t){var len=(t.tipo==='cone'||t.tipo==='icone')?t.c:t.b,end=(t.tipo==='cone'||t.tipo==='icone')?t.b:t.a;
     if(!pts.length||pts[pts.length-1].z!==z||pts[pts.length-1].d!==t.a)pts.push({z:z,d:t.a});
     z+=len;pts.push({z:z,d:end});
   });return pts;
  }
  function xy(q,sign){return [right-q.z*xs,center+sign*q.d*ys/2]}
  function path(pts){if(!pts.length)return '';var top=pts.map(function(t){var p=xy(t,-1);return p.join(',')});var bottom=pts.slice().reverse().map(function(t){var p=xy(t,1);return p.join(',')});return 'M'+top.join(' L')+' L'+bottom.join(' L')+' Z'}
  function line(x1,y1,x2,y2,style){return '<line x1="'+x1.toFixed(2)+'" y1="'+y1.toFixed(2)+'" x2="'+x2.toFixed(2)+'" y2="'+y2.toFixed(2)+'" '+(style||'')+'/>'}
  function label(x,y,s,anchor){return '<text x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" text-anchor="'+(anchor||'middle')+'" fill="'+colors.ink+'" font-size="13" font-weight="600">'+s+'</text>'}
  var p=coords(E),inner=coords(I),html='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Projeção da peça CNC com diâmetros e comprimentos em milímetros">';
  html+='<defs><pattern id="pdfCncHatch" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="11" height="11" fill="'+colors.piece+'"/><line x1="0" y1="0" x2="0" y2="11" stroke="#a7c1d8" stroke-width="1.8"/></pattern><marker id="pdfCncArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="'+colors.dim+'"/></marker></defs>';
  html+='<rect width="'+W+'" height="'+H+'" fill="'+colors.background+'"/>';
  html+=line(60,center,right+40,center,'stroke="'+colors.axis+'" stroke-width="1.2" stroke-dasharray="12 5 2 5"');
  html+='<path d="'+path(p)+'" fill="url(#pdfCncHatch)" stroke="'+colors.ink+'" stroke-width="1.8"/>';
  if(inner.length)html+='<path d="'+path(inner)+'" fill="'+colors.background+'" stroke="'+colors.ink+'" stroke-width="1.5"/>';
  var extent=right-Math.min(a.length,a.sum[1].ext||a.sum[2].ext)*xs;
  // Dimensao axial total e as extremidades Z.
  html+=line(left,83,left,115,'stroke="'+colors.dim+'"')+line(right,83,right,115,'stroke="'+colors.dim+'"');
  html+=line(left,85,right,85,'stroke="'+colors.dim+'" stroke-width="1.3" marker-start="url(#pdfCncArrow)" marker-end="url(#pdfCncArrow)"');
  html+=label((left+right)/2,76,fmt(a.length)+' mm');
  html+=label(right,309,'Face Z0','end')+label(left,309,'Fundo','start');
  // Cotas axiais por elemento do perfil externo.
  var z=0;
  E.forEach(function(t,i){var len=t.tipo==='cone'?t.c:t.b,from=right-z*xs,to=right-(z+len)*xs;z+=len;
    if(E.length>1&&len*xs>=55){var y=115+(i%2)*19;html+=line(from,y,to,y,'stroke="'+colors.dim+'" marker-start="url(#pdfCncArrow)" marker-end="url(#pdfCncArrow)"');html+=label((from+to)/2,y-6,fmt(len));}
  });
  // Diâmetro externo (cota vertical na extremidade e chamadas dos degraus).
  var d0=p[0].d,ey=center-d0*ys/2,by=center+d0*ys/2;
  html+=line(663,ey,663,by,'stroke="'+colors.dim+'" stroke-width="1.3" marker-start="url(#pdfCncArrow)" marker-end="url(#pdfCncArrow)"');
  html+=line(right,ey,674,ey,'stroke="'+colors.dim+'"')+line(right,by,674,by,'stroke="'+colors.dim+'"');
  html+=label(680,center-5,'Ø'+fmt(d0),'start');
  // Diâmetro do primeiro furo a partir da face.
  if(inner.length){var id0=inner[0].d,iy=center-id0*ys/2,ib=center+id0*ys/2,ix=Math.max(left+80,right-100);
    html+=line(ix,iy,ix,ib,'stroke="'+colors.dim+'" stroke-width="1.3" marker-start="url(#pdfCncArrow)" marker-end="url(#pdfCncArrow)"');
    html+=label(ix-12,center-5,'Ø'+fmt(id0),'end');
  }
  // Cada degrau/cilindro adicional mostra a cota local na superficie cotada.
  var zx=0;
  E.forEach(function(t,i){var len=t.tipo==='cone'?t.c:t.b;if(i){var zmid=zx+len/2,tx=right-zmid*xs,dd=t.tipo==='cone'?t.b:t.a;
      html+=line(tx,center-dd*ys/2,tx,center-dd*ys/2-18,'stroke="'+colors.dim+'"');html+=label(tx,center-dd*ys/2-24,'Ø'+fmt(dd));}zx+=len;});
  var zi=0;I.forEach(function(t,i){var len=t.tipo==='icone'?t.c:t.b;if(i){var mid=zi+len/2,tx=right-mid*xs,dd=t.tipo==='icone'?t.b:t.a;html+=label(tx,center+dd*ys/2+25,'Ø'+fmt(dd));}zi+=len});
  if(two)html+=label(W/2,H-8,'Vista esquemática do lado 1 — confira o lado 2 no editor manual');
  else html+=label(W/2,H-8,'Corte XZ · cotas reais em mm · esquema não usado como escala');
  html+='</svg>';
  return {ok:true,svg:html,errors:[],warnings:a.warnings,items:a.items,length:a.length};
 }
 return {analyze:analyze,svg:svg};
});
