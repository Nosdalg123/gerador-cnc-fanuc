/* Edição geométrica determinística do semiperfil DXF.
   Operações somente na CÓPIA. Não reescreve DXF nem gera código Fanuc. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./dxfcore.js'));
 else root.CNCDXFGeomEdit=factory(root.CNCDXF);
})(typeof self!=='undefined'?self:this,function(DX){
'use strict';
const EPS=1e-7;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const add=(a,b,t)=>[a[0]+b[0]*t,a[1]+b[1]*t];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function onArc(arc,point){
 const ends=DX.sample(arc,1);if(ends.length!==2||!(arc.r>0))return false;
 const sign=arc.sweep===undefined||arc.sweep>0?1:-1;
 const start=Math.atan2(ends[0][1]-arc.c[1],ends[0][0]-arc.c[0]);
 const offset=p=>{let v=sign*(Math.atan2(p[1]-arc.c[1],p[0]-arc.c[0])-start);
  while(v<0)v+=2*Math.PI;return v};
 const span=offset(ends[1]),along=offset(point);
 return along<=span+1e-7||Math.abs(along-2*Math.PI)<1e-7;
}
function entityFor(geometry,uid){
 const id=String(uid||'').split(':').slice(0,-1).join(':');
 const index=Number(String(uid||'').split(':').slice(-1)[0]);
 const e=(geometry||[]).find(q=>q.id===id);
 return e&&e.type==='LINE'&&index===0?e:null;
}
function hitsOnLine(s,others,axis,rect,excluded,hidden){
 if(!s||s.type!=='LINE')return [];
 const dir=subtract(s.b,s.a),len=dist(s.a,s.b);
 if(len<EPS)return [];
 const unit=dir.map(v=>v/len),results=[];
 function eligible(p){return Number.isFinite(p[0]+p[1])&&(!Number.isFinite(axis)||p[1]>=axis-.15)&&
  (!rect||p[0]>=rect.x1-.15&&p[0]<=rect.x2+.15&&p[1]>=rect.y1-.15&&p[1]<=rect.y2+.15)}
 for(const other of others||[]){
  if(other.id===s.id||other.id===excluded)continue;
  for(const [index,t] of DX.explode(other).entries()){
   if(hidden&&hidden.has(other.id+':'+index))continue;
   if(t.kind==='line'){
    const v=subtract(t.b,t.a),den=cross(unit,v);
    if(Math.abs(den)<1e-9)continue;
    const to=subtract(t.a,s.a),distanceAlong=cross(to,v)/den,u=cross(to,unit)/den;
    if(u < -1e-5 || u > 1+1e-5)continue;
    const p=add(s.a,unit,distanceAlong);
    if(eligible(p))results.push({point:p,distance:distanceAlong,target:other.id,kind:'LINE'});
   } else if(t.kind==='arc'){
    // Pontas quase tangentes do DXF podem diferir em micrômetros. Preservar
    // a coordenada nativa da ponta, em vez de criar duas raízes a 0,003 mm.
    const endpoints=DX.sample(t,1),nativeHits=[];
    for(const endpoint of endpoints){
     const delta=subtract(endpoint,s.a),distanceAlong=delta[0]*unit[0]+delta[1]*unit[1];
     if(Math.abs(cross(unit,delta))<=.00001){
      const p=add(s.a,unit,distanceAlong);
      if(eligible(p)){results.push({point:p,distance:distanceAlong,target:other.id,kind:'ARC'});nativeHits.push(p)}
     }
    }
    const f=subtract(s.a,t.c),dot=unit[0]*f[0]+unit[1]*f[1],disc=dot*dot-(f[0]*f[0]+f[1]*f[1]-t.r*t.r);
    if(disc<-1e-9)continue;
    for(const distanceAlong of [-dot-Math.sqrt(Math.max(0,disc)),-dot+Math.sqrt(Math.max(0,disc))]){
     const p=add(s.a,unit,distanceAlong);
     if(nativeHits.some(q=>dist(q,p)<.01)||!onArc(t,p))continue;
     if(eligible(p))results.push({point:p,distance:distanceAlong,target:other.id,kind:'ARC'});
    }
   }
  }
 }
 return results.filter((r,i)=>!results.slice(0,i).some(x=>Math.abs(x.distance-r.distance)<1e-4));
}
function intersections(a,b){
 if(a.kind==='line'){
  if(b.kind==='line'){
   const direction=subtract(a.b,a.a),other=subtract(b.b,b.a),length=dist(a.a,a.b);
   if(length>EPS&&Math.abs(cross(direction,other))<EPS&&Math.abs(cross(direction,subtract(b.a,a.a)))/length<.00001){
    const unit=direction.map(x=>x/length),projection=p=>{const delta=subtract(p,a.a);return delta[0]*unit[0]+delta[1]*unit[1]},
     lo=Math.max(0,Math.min(projection(b.a),projection(b.b))),hi=Math.min(length,Math.max(projection(b.a),projection(b.b)));
    return hi-lo>.00001?[add(a.a,unit,(lo+hi)/2)]:[];
   }
  }
  const s={...a,type:'LINE',id:'selected-a'},other={...b,id:'selected-b',type:b.kind==='arc'?'ARC':'LINE'};
  const len=dist(a.a,a.b);
  return hitsOnLine(s,[other],NaN,null).filter(h=>h.distance>=-EPS&&h.distance<=len+EPS).map(h=>h.point);
 }
 if(b.kind==='line')return intersections(b,a);
 if(a.kind!=='arc'||b.kind!=='arc')return [];
 const d=dist(a.c,b.c);if(d<EPS||d>a.r+b.r+EPS||d<Math.abs(a.r-b.r)-EPS)return [];
 const along=(a.r*a.r-b.r*b.r+d*d)/(2*d),height=Math.sqrt(Math.max(0,a.r*a.r-along*along));
 const unit=subtract(b.c,a.c).map(x=>x/d),center=add(a.c,unit,along),normal=[-unit[1],unit[0]];
 return [add(center,normal,height),add(center,normal,-height)]
  .filter((p,i,ps)=>onArc(a,p)&&onArc(b,p)&&(!i||dist(p,ps[0])>EPS));
}
function nearestForward(geometry,uid,end,axis,rect,hidden,limit=10000){
 const e=entityFor(geometry,uid);
 if(!e)return {ok:false,reason:'Escolha uma linha reta (LINE) para estender.'};
 if(end!=='ini'&&end!=='fim')return {ok:false,reason:'Escolha a extremidade inicial ou final.'};
 const len=dist(e.a,e.b);if(len<EPS)return {ok:false,reason:'A linha selecionada é muito pequena.'};
 const valid=(geometry||[]).filter(q=>{
  if(!rect)return true;
  return DX.cut([q],rect).length>0;
 });
 const results=hitsOnLine(e,valid,axis,rect,undefined,hidden);
 const outward=end==='fim'?1:-1,positive=results.map(q=>{
  const delta=end==='fim'?q.distance-len:-q.distance;
  return {...q,mm:delta,end};
 }).filter(q=>q.mm>.0001&&q.mm<=limit).sort((a,b)=>a.mm-b.mm);
 if(!positive.length)return {ok:false,reason:'Nenhuma interseção válida à frente desta ponta. Tente a outra extremidade ou digite a extensão.'};
 if(positive[1]&&Math.abs(positive[1].mm-positive[0].mm)<.01&&dist(positive[0].point,positive[1].point)>.01)
  return {ok:false,reason:'Existem dois destinos de extensão possíveis à mesma distância. Confirme no CAD.'};
 return {ok:true,...positive[0],uid};
}
function splitAtIntersections(geometry,uid,axis,rect,hidden){
 const e=entityFor(geometry,uid);
 if(!e)return {ok:false,reason:'Quebrar só funciona em linhas LINE.'};
 const length=dist(e.a,e.b);
 const others=(geometry||[]).filter(x=>x.id!==e.id&&(!rect||DX.cut([x],rect).length)&&(!hidden||DX.explode(x).some((t,i)=>!hidden.has(x.id+':'+i))));
 const hits=hitsOnLine(e,others,axis,rect,undefined,hidden).filter(h=>h.distance>.001&&h.distance<length-.001).sort((a,b)=>a.distance-b.distance);
 const knots=[0,...hits.map(h=>h.distance).filter((x,i,arr)=>!i||x-arr[i-1]>.001),length];
 if(knots.length<=2)return {ok:false,reason:'Não encontrei cruzamento dentro da linha. Nenhuma alteração feita.'};
 const unit=subtract(e.b,e.a).map(q=>q/length);
 return {ok:true,breakpoints:hits,sections:knots.slice(1).map((v,i)=>({
  a:add(e.a,unit,knots[i]),b:add(e.a,unit,v)
 })).filter(x=>dist(x.a,x.b)>.0001)};
}
function trimAtIntersection(geometry,uid,keep,axis,rect,hidden){
 const e=entityFor(geometry,uid);
 if(!e)return {ok:false,reason:'Cortar funciona em linhas LINE; arcos são mantidos nativos.'};
 const length=dist(e.a,e.b);
 const others=(geometry||[]).filter(q=>q.id!==e.id&&(!rect||DX.cut([q],rect).length)&&(!hidden||DX.explode(q).some((t,i)=>!hidden.has(q.id+':'+i))));
 const hits=hitsOnLine(e,others,axis,rect,undefined,hidden).filter(x=>x.distance>.0001&&x.distance<length-.0001);
 if(!hits.length)return {ok:false,reason:'Não há interseção dentro da linha para cortar. Use Quebrar ou estender.'};
 if(keep!=='ini'&&keep!=='fim')return {ok:false,reason:'Escolha qual extremidade preservar.'};
 hits.sort((a,b)=>keep==='ini'?a.distance-b.distance:b.distance-a.distance);
 const hit=hits[0],newA=keep==='fim'?hit.point:e.a,newB=keep==='ini'?hit.point:e.b;
 return {ok:true,point:hit.point,newA,newB,target:hit.target,cutMm:keep==='ini'?length-hit.distance:hit.distance};
}
function applySplit(geometry,uid,sections,idPrefix){
 const original=entityFor(geometry,uid);
 if(!original||!sections||sections.length<2)return {ok:false};
 const exists=new Set(geometry.map(q=>q.id)),kids=[];
 for(let i=0;i<sections.length;i++){
  let id=idPrefix+'_'+i,k=0;while(exists.has(id))id=idPrefix+'_'+i+'_'+(++k);
  kids.push({...original,id,a:sections[i].a,b:sections[i].b});
  exists.add(id);
 }
 const n=geometry.findIndex(q=>q.id===original.id);
 geometry.splice(n,1,...kids);
 return {ok:true,removed:uid,added:kids.map(q=>q.id+':0')};
}
return {entityFor,hitsOnLine,nearestForward,splitAtIntersections,trimAtIntersection,applySplit,onArc,intersections};
});
