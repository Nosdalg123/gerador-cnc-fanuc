/* Leitura conservadora de perfis simetricos vetoriais em vistas de torno.
   Nao aceita sombras, arcos livres, vistas ortograficas sem simetria nem PDFs rasterizados.
   Dimensoes derivadas de desenho sao SUGESTOES, sempre exigem confirmacao. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFVetorial=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function transform(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]}
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
function extract(list,ops,viewport){
 if(!list||!ops||!viewport)return [];
 var matrix=[1,0,0,1,0,0],stack=[],out=[],lim=20000;
 function point(x,y){var p=transform(matrix,x,y);return viewport.convertToViewportPoint(p[0],p[1])}
 function add(p,q){if(out.length>=lim)return;out.push({x1:p[0],y1:p[1],x2:q[0],y2:q[1],path:i})}
 for(var i=0;i<list.fnArray.length;i++){
  var fn=list.fnArray[i],args=list.argsArray[i];
  if(fn===ops.save){stack.push(matrix.slice());continue}
  if(fn===ops.restore){matrix=stack.pop()||[1,0,0,1,0,0];continue}
  if(fn===ops.transform){matrix=multiply(matrix,args);continue}
  if(fn!==ops.constructPath)continue;
  var operation=args[0],coords=args[1],k=0,pos=null,start=null;
  for(var j=0;j<operation.length;j++){
   var op=operation[j];
   if(op===ops.moveTo){pos=point(coords[k++],coords[k++]);start=pos}
   else if(op===ops.lineTo){var n=point(coords[k++],coords[k++]);if(pos)add(pos,n);pos=n}
   else if(op===ops.rectangle){var x=coords[k++],y=coords[k++],w=coords[k++],h=coords[k++];var p0=point(x,y),p1=point(x+w,y),p2=point(x+w,y+h),p3=point(x,y+h);add(p0,p1);add(p1,p2);add(p2,p3);add(p3,p0);pos=p0;start=p0}
   else if(op===ops.closePath){if(pos&&start)add(pos,start);pos=start}
   else if(op===ops.curveTo){k+=6;pos=null}
   else if(op===ops.curveTo2){k+=4;pos=null}
   else if(op===ops.curveTo3){k+=4;pos=null}
  }
 }
 return out;
}
function traceVertical(lines,diam,length,region){
 if(!(diam>0&&length>0)||!Array.isArray(lines))return null;
 var v=lines.filter(function(s){
  if(region){var mx=(s.x1+s.x2)/2,my=(s.y1+s.y2)/2;if(mx<region.x1||mx>region.x2||my<region.y1||my>region.y2)return false}
  return true;
 });
 var vertical=v.filter(s=>Math.abs(s.x2-s.x1)<2.2&&Math.abs(s.y2-s.y1)>=9).map(s=>({
  x:(s.x1+s.x2)/2,top:Math.min(s.y1,s.y2),bottom:Math.max(s.y1,s.y2),h:Math.abs(s.y2-s.y1)}));
 if(vertical.length<4)return null;
 var tallest=Math.max(...vertical.map(q=>q.h)),large=vertical.filter(q=>q.h>tallest*.55);
 if(large.length<4)return null;
 var expected=diam/length,choices=[];
 for(var i=0;i<large.length;i++)for(var j=i+1;j<large.length;j++){
  var x1=Math.min(large[i].x,large[j].x),x2=Math.max(large[i].x,large[j].x),width=x2-x1;
  var overlap=Math.min(large[i].bottom,large[j].bottom)-Math.max(large[i].top,large[j].top);
  if(overlap<.52*tallest||width<30)continue;
  var size=Math.max(large[i].h,large[j].h),delta=Math.abs(width/size-expected)/expected;
  if(delta<.12)choices.push({x1,x2,top:Math.max(large[i].top,large[j].top),bottom:Math.min(large[i].bottom,large[j].bottom),delta});
 }
 if(!choices.length)return null;
 choices.sort((a,b)=>a.delta-b.delta);
 var best=choices[0],center=(best.x1+best.x2)/2,pxPerMm=(best.x2-best.x1)/diam,span=best.bottom-best.top;
 if(!(pxPerMm>0)||Math.abs(span/pxPerMm-length)>Math.max(.8,length*.13))return null;
 function pairedAt(y){
  var points=vertical.filter(q=>q.top<=y-2&&q.bottom>=y+2).map(q=>q.x),radii=[];
  points.forEach(function(x){if(x>=center-3)return;
   var target=2*center-x;
   if(points.some(z=>Math.abs(z-target)<Math.max(2.2,pxPerMm*.3)))radii.push(center-x);
  });
  radii.sort((a,b)=>a-b);return radii;
 }
 var samples=[],step=Math.max(2,Math.min(6,pxPerMm*.5));
 for(var y=best.top+3;y<best.bottom-3;y+=step){
  var pp=pairedAt(y);if(pp.length>=1){
   samples.push({y,rOut:pp[pp.length-1],rIn:pp.length>1?pp[0]:0});
  }
 }
 if(samples.length<12)return null;
 // Cortes sem linhas verticais confiaveis nao sao extrapolados.
 var coverage=samples.length*step/span;
 if(coverage<.63)return null;
 function rounded(n){return Math.max(.01,Math.round(n*100)/100)}
 function compress(name){
  var rows=[],first=null;
  samples.forEach(function(s){
   var rad=s[name],d=rad?2*rad/pxPerMm:0;
   if(name==='rOut'&&!(d>0))return;
   var roundD=Math.round(d*2)/2;
   if(first===null||Math.abs(first.d-roundD)>1.1){rows.push({start:s.y,end:s.y,d:roundD});first=rows[rows.length-1]}
   else first.end=s.y;
  });
  return rows.filter(r=>r.end-r.start>=Math.max(4,span*.03));
 }
 var ext=compress('rOut'),inside=compress('rIn').filter(r=>r.d>0);
 if(!ext.length||ext.length>8||inside.length>8)return null;
 function modelSegments(rr,internal){
  if(!rr.length)return[];
  return rr.map(function(q,i){
   var next=rr[i+1],mm=next?(next.start-q.start)/pxPerMm:length-(q.start-rr[0].start)/pxPerMm;
   return {side:'1',tipo:internal?'icil':'cil',a:rounded(q.d),b:rounded(mm),c:''};
  });
 }
 var out=modelSegments(ext,false),inn=modelSegments(inside,true);
 if(out.some(q=>!(q.b>0))||inn.some(q=>!(q.b>0)))return null;
 return {ok:true,items:out.concat(inn),confidence:'contorno-aproximado',warning:'Contorno inferido das linhas vetoriais: medidas sem cota explícita são aproximações e exigem revisão.',axis:'vertical',diameter:diam,length:length};
}
/* Contorno lateral: extrai envelope de UMA forma vetorial extensa.
   Não usa linhas de cota, quadro da folha ou círculos da vista frontal.
   Arcos são aproximações poligonais e precisam de revisão no editor completo. */
function traceOutline(lines,diam,length,region){
 if(!(diam>0&&length>0)||!Array.isArray(lines))return null;
 var byPath={};lines.forEach(function(seg){
  if(seg.path==null)return;
  var group=byPath[seg.path]||(byPath[seg.path]=[]);
  group.push(seg);
 });
 var groups=[];
 Object.keys(byPath).forEach(function(id){
  var segs=byPath[id];if(segs.length<90)return;
  var xx=[],yy=[];segs.forEach(function(s){xx.push(s.x1,s.x2);yy.push(s.y1,s.y2)});
  var minX=Math.min.apply(null,xx),maxX=Math.max.apply(null,xx),minY=Math.min.apply(null,yy),maxY=Math.max.apply(null,yy),w=maxX-minX,h=maxY-minY;
  if(w<80||h<80)return;
  if(region&&(minX<region.x1-2||maxX>region.x2+2||minY<region.y1-2||maxY>region.y2+2))return;
  var delta=Math.abs(w/h-length/diam)/(length/diam);
  if(delta<.16)groups.push({segs:segs,x0:minX,x1:maxX,y0:minY,y1:maxY,score:delta,axis:'horizontal'});
  var inverse=Math.abs(h/w-length/diam)/(length/diam);
  if(inverse<.16)groups.push({segs:segs,x0:minY,x1:maxY,y0:minX,y1:maxX,score:inverse,axis:'vertical'});
 });
 if(!groups.length)return null;
 groups.sort(function(a,b){return a.score-b.score||b.segs.length-a.segs.length});
 var best=groups[0],ss=best.segs.map(function(q){
  return best.axis==='horizontal'?q:{x1:q.y1,y1:q.x1,x2:q.y2,y2:q.x2};
 });
 var w=best.x1-best.x0,h=best.y1-best.y0,scaleD=h/diam,points=[];
 for(var i=0;i<=200;i++){
  var x=best.x0+0.8+(w-1.6)*i/200,ys=[];
  ss.forEach(function(l){
   if(Math.abs(l.x2-l.x1)<1e-8)return;
   if(x<Math.min(l.x1,l.x2)||x>Math.max(l.x1,l.x2))return;
   var y=l.y1+(l.y2-l.y1)*(x-l.x1)/(l.x2-l.x1);
   if(Number.isFinite(y))ys.push(y);
  });
  if(ys.length<2)continue;
  var d=(Math.max.apply(null,ys)-Math.min.apply(null,ys))/scaleD;
  if(d>0&&d<diam*1.03)points.push({z:(x-best.x0)/w*length,d:d});
 }
 if(points.length<80)return null;
 function distance(p,a,b){
  var dx=b.z-a.z,dy=b.d-a.d,den=Math.hypot(dx,dy)||1;
  return Math.abs(dy*p.z-dx*p.d+b.z*a.d-b.d*a.z)/den;
 }
 function rdp(pts,eps){
  if(pts.length<=2)return pts;
  var far=0,idx=0;
  for(var j=1;j<pts.length-1;j++){var dist=distance(pts[j],pts[0],pts[pts.length-1]);if(dist>far){far=dist;idx=j}}
  if(far<=eps)return [pts[0],pts[pts.length-1]];
  return rdp(pts.slice(0,idx+1),eps).slice(0,-1).concat(rdp(pts.slice(idx),eps));
 }
 // Extremos correspondem à face esquerda e direita da vista.
 points[0].z=0;points[points.length-1].z=length;
 var selected=[],eps=1.4;
 for(var attempt=0;attempt<10;attempt++){selected=rdp(points,eps);if(selected.length<=13)break;eps*=1.4}
 if(selected.length<2||selected.length>13)return null;
 var items=[],sum=0;
 for(var k=0;k<selected.length-1;k++){
  var a=selected[k],b=selected[k+1],L=k===selected.length-2?length-sum:b.z-a.z;
  if(L<.05)return null;
  var da=Math.round(a.d*100)/100,db=Math.round(b.d*100)/100;
  if(Math.abs(da-db)<1.2)items.push({tipo:'cil',side:'1',a:(da+db)/2,b:Math.round(L*1000)/1000,c:''});
  else items.push({tipo:'cone',side:'1',a:da,b:Math.round(L*1000)/1000,c:db});
  sum+=L;
 }
 if(items.length>12)return null;
 // A soma das cotas arredondadas deve coincidir exatamente com o comprimento final.
 var others=items.slice(0,-1).reduce(function(sum,q){return sum+q.b},0);
 items[items.length-1].b=Math.round((length-others)*1000)/1000;
 if(!(items[items.length-1].b>0))return null;
 return {ok:true,items:items,length:length,diameter:diam,axis:best.axis,
   confidence:'contorno-vetorial-aproximado',
   warning:'Contorno principal aproximado do PDF vetorial. Degraus, raios, furos, roscas, usinabilidade e fixação exigem revisão; não usar como código final.'};
}
function trace(lines,diam,length,region){
 var vertical=traceVertical(lines,diam,length,region);
 if(vertical)return vertical;
 var flipped=(lines||[]).map(s=>({x1:s.y1,y1:s.x1,x2:s.y2,y2:s.x2}));
 var r=region?{x1:region.y1,y1:region.x1,x2:region.y2,y2:region.x2}:null;
 var horizontal=traceVertical(flipped,diam,length,r);
 if(horizontal)horizontal.axis='horizontal';
 return horizontal||traceOutline(lines,diam,length,region);
}
return {extract,trace,traceOutline,multiply};
});
