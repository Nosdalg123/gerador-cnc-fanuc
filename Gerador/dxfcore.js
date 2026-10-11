/* Importador de entidades DXF ASCII, sem dependências externas.
   DXF é CAD: coordenadas e raios reais em unidade da origem.
   Nunca transforma linha de cota em perfil CNC. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCDXF=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function read(text){
 if(typeof text!=='string'||text.length>35e6)throw Error('DXF inválido ou acima de 35 MB.');
 if(text.indexOf('AutoCAD Binary DXF')>=0)throw Error('DXF binário: exporte como DXF ASCII R2000.');
 const ls=text.split(/\r\n|\n|\r/),data=[];for(let i=0;i+1<ls.length;i+=2){const code=Number(ls[i].trim());if(!Number.isInteger(code))continue;data.push([code,ls[i+1].trim()]);}
 const get=(g,n,d)=>{let a=g.find(p=>p[0]===n);return a?a[1]:d},num=(g,n,d=0)=>{let v=Number(get(g,n,d));return Number.isFinite(v)?v:d};
 const arr=(g,n)=>g.filter(p=>p[0]===n).map(p=>p[1]);
 let section='',units=0,ents=[],unsupported={},i=0,entities=0,dimensions=[];
 while(i<data.length){
  const [code,value]=data[i];
  if(code===0&&value==='SECTION'){i++;section=get(data.slice(i,i+2),2,'');continue}
  if(code===0&&value==='ENDSEC'){section='';i++;continue}
  if(section==='HEADER'&&code===9&&value==='$INSUNITS'){units=Number(data[i+1]&&data[i+1][1])||0;i+=2;continue}
  if(section!=='ENTITIES'||code!==0){i++;continue}
  if(value==='ENDSEC'){section='';i++;continue}
  const typ=value,j=i+1;let k=j;while(k<data.length&&data[k][0]!==0)k++;
  const g=data.slice(j,k);i=k;
  const layout=get(g,410,'Model'),paper=num(g,67,0);if(paper===1||(layout!=='Model'&&layout!=='MODEL'&&layout!==''))continue;
  const common={id:get(g,5,String(entities++)),layer:get(g,8,'0'),type:typ};
  const put=e=>{if(e)ents.push(Object.assign({},common,e))};
  if(typ==='LINE'){put({a:[num(g,10),num(g,20)],b:[num(g,11),num(g,21)]});continue}
  if(typ==='ARC'){put({c:[num(g,10),num(g,20)],r:num(g,40),start:num(g,50),end:num(g,51)});continue}
  if(typ==='CIRCLE'){put({c:[num(g,10),num(g,20)],r:num(g,40)});continue}
  if(typ==='LWPOLYLINE'){
   let v=[],at=null;g.forEach(([c,x])=>{if(c===10){at={x:Number(x),y:0,bulge:0};v.push(at)}else if(at&&c===20)at.y=Number(x);else if(at&&c===42)at.bulge=Number(x)});
   put({v:v,closed:(num(g,70)&1)!==0});continue;
  }
  if(typ==='SPLINE'){
   const xs=arr(g,10).map(Number),ys=arr(g,20).map(Number),fx=arr(g,11).map(Number),fy=arr(g,21).map(Number);
   put({degree:num(g,71,3),control:xs.map((x,i)=>[x,ys[i]||0]),fit:fx.map((x,i)=>[x,fy[i]||0]),weights:arr(g,41).map(Number),knots:arr(g,40).map(Number),approximation:true});continue;
  }
  if(typ==='ELLIPSE'){put({c:[num(g,10),num(g,20)],major:[num(g,11),num(g,21)],ratio:num(g,40),start:num(g,41),end:num(g,42),approximation:true});continue}
  if(typ==='DIMENSION'){
   let text=get(g,1,'<>'),kind=num(g,70)&7;const a=[num(g,13),num(g,23)],b=[num(g,14),num(g,24)],dx=b[0]-a[0],dy=b[1]-a[1],theta=num(g,50)*Math.PI/180;
   let measured=kind===0?Math.abs(dx*Math.cos(theta)+dy*Math.sin(theta)):kind===1?Math.hypot(dx,dy):NaN;
   if(kind===4||kind===5){const p=[num(g,15),num(g,25)];let r=Math.hypot(p[0]-num(g,10),p[1]-num(g,20));measured=kind===5?2*r:r;}
   // DIMENSION radius/diameter without extension points: preserve native parameters for review.
   const d={id:common.id,type:'DIMENSION',kind:kind,diameter:/%%c|[Ø⌀]/i.test(text),text:text,
    measure:Number.isFinite(measured)?Math.round(measured*1e5)/1e5:null,
    measureKind:kind===4?'raio':kind===5?'diametro':kind===2?'angulo_a_conferir':kind===0||kind===1?'linear':'outro',
    position:[num(g,10),num(g,20)],a:a,b:b,angle:num(g,50),layer:common.layer};
   dimensions.push(d);continue;
  }
  if(typ==='TEXT'||typ==='MTEXT'){
   let raw=typ==='MTEXT'?arr(g,3).join('')+get(g,1,''):get(g,1,'');
   put({at:[num(g,10),num(g,20)],text:raw.replace(/\\P/g,' ').replace(/\\[A-Za-z][^;]*;/g,' ').slice(0,800),height:num(g,40,2.5)});continue;
  }
  if(['HATCH','INSERT','SOLID','LEADER','POINT','OLE2FRAME','POLYLINE','VERTEX','SEQEND','3DFACE'].includes(typ)){
   unsupported[typ]=(unsupported[typ]||0)+1;continue;
  }
  unsupported[typ]=(unsupported[typ]||0)+1;
 }
 if(!ents.length&&!dimensions.length)throw Error('Nenhuma geometria de Model Space localizada neste DXF.');
 if(units!==4)unsupported.UNIDADE=(unsupported.UNIDADE||0)+1;
 const geometry=ents.filter(e=>['LINE','ARC','CIRCLE','LWPOLYLINE','SPLINE','ELLIPSE'].includes(e.type));
 return {units,unitName:units===4?'mm':units===1?'polegadas':'unidade não confirmada',entities:ents,geometry,dimensions,unsupported,count:geometry.length};
}
function arcEnds(e){
 const p=d=>[e.c[0]+e.r*Math.cos(d*Math.PI/180),e.c[1]+e.r*Math.sin(d*Math.PI/180)];
 return [p(e.start),p(e.end)];
}
function bulgeArc(a,b,bulge){
 const chord=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(chord<1e-8||Math.abs(bulge)<1e-9)return null;
 const rad=chord*(1+bulge*bulge)/(4*Math.abs(bulge)),mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
 const nx=-(b[1]-a[1])/chord,ny=(b[0]-a[0])/chord,h=chord*(1-bulge*bulge)/(4*bulge);
 const c=[mx+nx*h,my+ny*h],start=Math.atan2(a[1]-c[1],a[0]-c[0])*180/Math.PI,end=Math.atan2(b[1]-c[1],b[0]-c[0])*180/Math.PI;
 return {type:'ARC',c,r:rad,start:(start+360)%360,end:(end+360)%360,sweep:bulge>0?1:-1};
}
function explode(e){
 if(e.type==='LINE')return [Object.assign({},e,{kind:'line'})];
 if(e.type==='ARC')return [Object.assign({},e,{kind:'arc'})];
 if(e.type==='LWPOLYLINE'){
  let list=[];for(let i=0;i<e.v.length-(e.closed?0:1);i++){
   const a=e.v[i],b=e.v[(i+1)%e.v.length],u=[a.x,a.y],v=[b.x,b.y],arc=bulgeArc(u,v,a.bulge||0);
   list.push(arc?Object.assign({},e,arc,{kind:'arc',a:u,b:v}):Object.assign({},e,{kind:'line',a:u,b:v}));
  }
  return list;
 }
 return [];
}
function sample(seg,n=32){
 if(seg.kind==='line')return [seg.a,seg.b];
 if(seg.kind==='arc'){
  const [a,b]=seg.a&&seg.b?[seg.a,seg.b]:arcEnds(seg);
  let start=Math.atan2(a[1]-seg.c[1],a[0]-seg.c[0]),end=Math.atan2(b[1]-seg.c[1],b[0]-seg.c[0]);
  const ccw=seg.sweep===undefined?true:seg.sweep>0;
  if(ccw){while(end<start-1e-10)end+=2*Math.PI}else{while(end>start+1e-10)end-=2*Math.PI}
  return Array.from({length:n+1},(_,i)=>{const t=start+(end-start)*i/n;return [seg.c[0]+seg.r*Math.cos(t),seg.c[1]+seg.r*Math.sin(t)]});
 }
 return [];
}
function bounds(entities){let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
 for(const e of entities){let pts=[];
  if(e.type==='LINE')pts=[e.a,e.b];else if(e.type==='CIRCLE')pts=[[e.c[0]-e.r,e.c[1]-e.r],[e.c[0]+e.r,e.c[1]+e.r]];
  else if(e.type==='ARC')pts=sample(Object.assign({kind:'arc'},e),48);else if(e.type==='LWPOLYLINE')pts=e.v.map(q=>[q.x,q.y]);
  else if(e.type==='SPLINE')pts=e.fit.length?e.fit:e.control;else if(e.at)pts=[e.at];
  for(const p of pts)if(Number.isFinite(p[0])&&Number.isFinite(p[1])){x1=Math.min(x1,p[0]);x2=Math.max(x2,p[0]);y1=Math.min(y1,p[1]);y2=Math.max(y2,p[1])}
 }
 return Number.isFinite(x1)?{x1,y1,x2,y2,width:x2-x1,height:y2-y1}:null;
}
function inRect(b,r){return !!b&&b.x2>=r.x1&&b.x1<=r.x2&&b.y2>=r.y1&&b.y1<=r.y2}
function cut(entities,rect){return (entities||[]).filter(e=>inRect(bounds([e]),rect))}
function nativeCotas(dims,rect){return (dims||[]).filter(d=>inRect({x1:d.position[0],x2:d.position[0],y1:d.position[1],y2:d.position[1]},rect))}
function candidateAxis(entities,rect){
 let centers=(entities||[]).filter(e=>e.type==='CIRCLE'&&e.c[0]>rect.x2&&e.c[1]>=rect.y1&&e.c[1]<=rect.y2).map(e=>e.c[1]);
 if(!centers.length)return null;centers.sort((a,b)=>a-b);
 let clusters=[];for(const y of centers){let c=clusters.find(x=>Math.abs(x.y-y)<.3);if(c){c.sum+=y;c.count++;c.y=c.sum/c.count}else clusters.push({y,sum:y,count:1})}
 clusters.sort((a,b)=>b.count-a.count);return clusters[0].count>=2?clusters[0].y:null;
}
return {read,explode,sample,bounds,cut,nativeCotas,candidateAxis,bulgeArc};
});
