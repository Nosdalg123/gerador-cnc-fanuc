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
function entityFor(geometry,uid){
 const id=String(uid||'').split(':').slice(0,-1).join(':');
 const index=Number(String(uid||'').split(':').slice(-1)[0]);
 const e=(geometry||[]).find(q=>q.id===id);
 return e&&e.type==='LINE'&&index===0?e:null;
}
function hitsOnLine(s,others,axis,rect,excluded){
 if(!s||s.type!=='LINE')return [];
 const dir=subtract(s.b,s.a),len=dist(s.a,s.b);
 if(len<EPS)return [];
 const unit=dir.map(v=>v/len),results=[];
 function eligible(p){return Number.isFinite(p[0]+p[1])&&(!Number.isFinite(axis)||p[1]>=axis-.15)&&
  (!rect||p[0]>=rect.x1-.15&&p[0]<=rect.x2+.15&&p[1]>=rect.y1-.15&&p[1]<=rect.y2+.15)}
 for(const other of others||[]){
  if(other.id===s.id||other.id===excluded)continue;
  for(const t of DX.explode(other)){
   if(t.kind==='line'){
    const v=subtract(t.b,t.a),den=cross(unit,v);
    if(Math.abs(den)<1e-9)continue;
    const to=subtract(t.a,s.a),distanceAlong=cross(to,v)/den,u=cross(to,unit)/den;
    if(u < -1e-5 || u > 1+1e-5)continue;
    const p=add(s.a,unit,distanceAlong);
    if(eligible(p))results.push({point:p,distance:distanceAlong,target:other.id,kind:'LINE'});
   } else if(t.kind==='arc'){
    const f=subtract(s.a,t.c),dot=unit[0]*f[0]+unit[1]*f[1],disc=dot*dot-(f[0]*f[0]+f[1]*f[1]-t.r*t.r);
    if(disc<-1e-9)continue;
    for(const distanceAlong of [-dot-Math.sqrt(Math.max(0,disc)),-dot+Math.sqrt(Math.max(0,disc))]){
     const p=add(s.a,unit,distanceAlong);
     // Confirma que a posição pertence ao trecho ARC e não apenas à circunferência.
     const sweep=DX.sample(t,96);
     if(!sweep.some(q=>dist(q,p)<=Math.max(.02,t.r*.016)))continue;
     if(eligible(p))results.push({point:p,distance:distanceAlong,target:other.id,kind:'ARC'});
    }
   }
  }
 }
 return results.filter((r,i)=>!results.slice(0,i).some(x=>Math.abs(x.distance-r.distance)<1e-4));
}
function nearestForward(geometry,uid,end,axis,rect,hidden,limit=10000){
 const e=entityFor(geometry,uid);
 if(!e)return {ok:false,reason:'Escolha uma linha reta (LINE) para estender.'};
 if(end!=='ini'&&end!=='fim')return {ok:false,reason:'Escolha a extremidade inicial ou final.'};
 const len=dist(e.a,e.b);if(len<EPS)return {ok:false,reason:'A linha selecionada é muito pequena.'};
 const valid=(geometry||[]).filter(q=>{
  if(!rect)return true;
  return DX.cut([q],rect).length>0;
 }).filter(q=>{
  if(!hidden)return true;
  const pieces=DX.explode(q);
  return pieces.some((p,i)=>!hidden.has(q.id+':'+i));
 });
 const results=hitsOnLine(e,valid,axis,rect);
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
 const others=(geometry||[]).filter(x=>x.id!==e.id&&(!rect||DX.cut([x],rect).length));
 const hits=hitsOnLine(e,others,axis,rect).filter(h=>h.distance>.001&&h.distance<length-.001).sort((a,b)=>a.distance-b.distance);
 const knots=[0,...hits.map(h=>h.distance).filter((x,i,arr)=>!i||x-arr[i-1]>.001),length];
 if(knots.length<=2)return {ok:false,reason:'Não encontrei cruzamento dentro da linha. Nenhuma alteração feita.'};
 const unit=subtract(e.b,e.a).map(q=>q/length);
 return {ok:true,breakpoints:hits,sections:knots.slice(1).map((v,i)=>({
  a:add(e.a,unit,knots[i]),b:add(e.a,unit,v)
 })).filter(x=>dist(x.a,x.b)>.0001)};
}
function trimAtIntersection(geometry,uid,keep,axis,rect){
 const e=entityFor(geometry,uid);
 if(!e)return {ok:false,reason:'Cortar funciona em linhas LINE; arcos são mantidos nativos.'};
 const length=dist(e.a,e.b);
 const others=(geometry||[]).filter(q=>q.id!==e.id&&(!rect||DX.cut([q],rect).length));
 const hits=hitsOnLine(e,others,axis,rect).filter(x=>x.distance>.0001&&x.distance<length-.0001);
 if(!hits.length)return {ok:false,reason:'Não há interseção dentro da linha para cortar. Use Quebrar ou estender.'};
 if(keep!=='ini'&&keep!=='fim')return {ok:false,reason:'Escolha qual extremidade preservar.'};
 hits.sort((a,b)=>keep==='ini'?a.distance-b.distance:b.distance-a.distance);
 const hit=hits[0],newA=keep==='fim'?hit.point:e.a,newB=keep==='ini'?hit.point:e.b;
 return {ok:true,point:hit.point,newA,newB,target:hit.target,removed:mm=>mm,cutMm:keep==='ini'?length-hit.distance:hit.distance};
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
return {entityFor,hitsOnLine,nearestForward,splitAtIntersections,trimAtIntersection,applySplit};
});
