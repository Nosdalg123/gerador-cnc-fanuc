/* Geometria assistida de perfis DXF: proposta automática, extensão e limpeza.
 * A fonte original permanece imutável: os comandos atuam somente numa cópia de trabalho.
 * Medidas nativas não autorizam conversão direta de roscas ou raios em G-code. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./dxfcore.js'),require('./dxfprofile.js'),require('./dxfchains.js'));
 else root.CNCDXFEdicao=factory(root.CNCDXF,root.CNCDXFPerfil,root.CNCDXFCadeias);
})(typeof self!=='undefined'?self:this,function(DX,P,Chains){
'use strict';
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function autoSelect(doc,rect,axis){
 const none={externo:[],interno:[],ambiguous:true,reason:'Selecione a vista e confirme o eixo central.'};
 if(!doc||!rect||!Number.isFinite(axis))return none;
 const width=rect.x2-rect.x1,all=P.segments(doc.geometry,rect);
 const hints=P.sectionSuggestion(doc),r=hints&&hints.front?hints.front.max:null;
 const pieces=all.filter(s=>{
  if(!P.above(s,axis,.16))return false;
  const pts=DX.sample(s,12);
  if(!pts.length)return false;
  if(r&&pts.some(p=>p[1]>axis+r+1.5))return false;
  return pts.every(p=>p[1]>=axis-.16);
 });
 const found=Chains.build(pieces,{axis,tol:.16});
 const candidates=found.chains.filter(c=>c.spanX>=Math.max(3,width*.08)&&c.meanRadius>=Math.max(1,(r||0)*.07));
 if(!candidates.length)return {...none,reason:'Nenhuma cadeia contínua com confiança suficiente. Clique nos elementos para construir o perfil.',chains:found};
 const list=candidates.map(c=>({c,score:c.spanX/Math.max(width,1)*95+
  (r?Math.min(1,c.meanRadius/r)*25:Math.min(20,c.meanRadius*.15))
  - (c.branchEnd?12:0)-Math.max(0,c.arcCount-3)*.5}));
 list.sort((a,b)=>b.score-a.score);
 const external=list[0].c, ext=new Set(external.ids);
 // Completa por continuidade apenas se a ligação a uma ponta for inequívoca e não for bifurcação.
 let grown=true,steps=0;
 while(grown&&steps++<8){
  grown=false;let touches=[];
  for(const {c} of list.slice(1)){
   if(c.ids.some(id=>ext.has(id)))continue;
   const near=[external.start,external.end]; // também inclui pontas de cadeias adicionadas
   for(const id of ext){const item=pieces.find(p=>p.uid===id);if(item){const ps=DX.sample(item,2);if(ps.length)near.push(ps[0],ps[ps.length-1])}}
   const contact=[c.start,c.end].some(p=>near.some(q=>dist(p,q)<=.16));
   if(contact&&!c.branchEnd&&c.spanX>=Math.max(2,width*.04))touches.push(c);
  }
  if(touches.length===1){touches[0].ids.forEach(id=>ext.add(id));grown=true}
 }
 // Segmentos internos não são presumidos quando há várias vistas e linhas auxiliares.
 // Entregar sugestões para revisão; seleção automática do contorno externo não equivale a aprovação CNC.
 return {externo:[...ext],interno:[],ambiguous:true,chains:found,
  reason:'Proposta automática de contorno EXTERNO ('+ext.size+' entidades). Confira raios, descontinuidades e identifique manualmente o perfil interno.'};
}
function extendLine(geometry,uid,which,length){
 const parts=String(uid||'').split(':'),parent=parts.slice(0,-1).join(':'),index=Number(parts[parts.length-1]);
 const entity=(geometry||[]).find(e=>e.id===parent);
 if(!entity||entity.type!=='LINE'||index!==0)return {ok:false,reason:'Extensão disponível apenas em entidades LINE. Para polilinha ou arco, corrija o DXF de origem.'};
 const mm=Number(length);
 if(!Number.isFinite(mm)||mm<=0||mm>10000)return {ok:false,reason:'Informe extensão positiva em milímetros (até 10000).'};
 if(which!=='ini'&&which!=='fim')return {ok:false,reason:'Escolha a extremidade inicial ou final.'};
 const a=entity.a,b=entity.b,d=dist(a,b);
 if(d<.000001)return {ok:false,reason:'Linha sem comprimento não pode ser estendida.'};
 const x=(b[0]-a[0])/d,y=(b[1]-a[1])/d;
 if(which==='ini')entity.a=[a[0]-mm*x,a[1]-mm*y];
 else entity.b=[b[0]+mm*x,b[1]+mm*y];
 return {ok:true,entity,newEndpoint:which==='ini'?entity.a:entity.b};
}
function rectBounds(a,b){
 return {x1:Math.min(a[0],b[0]),y1:Math.min(a[1],b[1]),x2:Math.max(a[0],b[0]),y2:Math.max(a[1],b[1])};
}
function viewTransform(rect,face){
 if(!rect)return null;
 const W=900,H=480,margin=30,width=rect.x2-rect.x1,height=rect.y2-rect.y1;
 if(!(width>0&&height>0))return null;
 const scale=Math.min((W-2*margin)/width,(H-2*margin)/height);
 return p=>[face==='esquerda'?W-(margin+(p[0]-rect.x1)*scale):margin+(p[0]-rect.x1)*scale,
  H-margin-(p[1]-rect.y1)*scale];
}
function segmentTouchesRect(s,selection,transform){
 const pts=DX.sample(s,64).map(transform);
 const point=p=>p[0]>=selection.x1&&p[0]<=selection.x2&&p[1]>=selection.y1&&p[1]<=selection.y2;
 if(pts.some(point))return true;
 // Liang–Barsky clip test along sampled chords, catches thin rectangle crossings.
 for(let i=1;i<pts.length;i++){
  let a=pts[i-1],b=pts[i],dx=b[0]-a[0],dy=b[1]-a[1],lo=0,hi=1,ps=[-dx,dx,-dy,dy],qs=[a[0]-selection.x1,selection.x2-a[0],a[1]-selection.y1,selection.y2-a[1]];
  let valid=true;
  for(let k=0;k<4;k++){
   if(Math.abs(ps[k])<1e-9){if(qs[k]<0){valid=false;break}}
   else{let t=qs[k]/ps[k];if(ps[k]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t)}
  }
  if(valid&&lo<=hi)return true;
 }
 return false;
}
function selectRectSegments(segments,rect,view,face){
 const xy=viewTransform(view,face);
 if(!xy)return [];
 return (segments||[]).filter(s=>segmentTouchesRect(s,rect,xy)).map(s=>s.uid);
}
return {autoSelect,extendLine,rectBounds,viewTransform,selectRectSegments};
});
