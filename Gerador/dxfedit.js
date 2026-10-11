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
 const list=candidates.map(c=>({c,score:c.spanX/Math.max(width,1)*65+
  (r?Math.min(1,c.meanRadius/r)*50:Math.min(32,c.meanRadius*.6))
  - (c.branchEnd?10:0)-Math.max(0,c.arcCount-3)*.5}));
 list.sort((a,b)=>b.score-a.score);
 const primary=list[0].c,ext=new Set(primary.ids),used=new Set([primary.id]);
 let spans=[primary],mean=primary.meanRadius;
 // Acrescenta trechos EXTERNOS no prolongamento axial da cadeia principal,
 // sem engolir outras cadeias que correm sobre o mesmo intervalo de Z.
 for(let cycle=0;cycle<4;cycle++){
  const lo=Math.min(...spans.map(c=>c.minX)),hi=Math.max(...spans.map(c=>c.maxX));
  const eligible=list.filter(({c})=>{
   if(used.has(c.id)||c.spanX<Math.max(8,width*.18)||c.meanRadius<Math.max(2,(r||0)*.09))return false;
   const gap=c.maxX<lo?lo-c.maxX:c.minX>hi?c.minX-hi:0;
   const overlap=Math.max(0,Math.min(hi,c.maxX)-Math.max(lo,c.minX));
   return gap>0&&gap<width*.18&&overlap<.001&&!c.branchEnd;
  });
  if(!eligible.length)break;
  eligible.sort((a,b)=>a.c.spanX-b.c.spanX);
  const c=eligible[eligible.length-1].c;
  c.ids.forEach(id=>ext.add(id));used.add(c.id);spans.push(c);
 }
 // Interno: exigir sobreposição axial com a proposta externa e menor raio.
 // Não escolher linhas de centro, nem a mesma cadeia duas vezes.
 const validInside=list.filter(({c})=>{
  if(used.has(c.id)||c.spanX<Math.max(9,width*.22)||c.meanRadius<Math.max(3,(r||0)*.13))return false;
  const overlap=spans.reduce((total,ext)=>total+Math.max(0,Math.min(ext.maxX,c.maxX)-Math.max(ext.minX,c.minX)),0);
  return overlap/c.spanX>.35 && spans.some(ext=>c.meanRadius<ext.meanRadius*.75);
 });
 validInside.sort((a,b)=>b.c.spanX-a.c.spanX);
 const inside=validInside.length?validInside[0].c:null;
 return {externo:[...ext],interno:inside?[...inside.ids]:[],ambiguous:true,chains:found,
  reason:'Proposta automática: '+ext.size+' entidades externas em '+spans.length+' cadeia(s)'+
    (inside?' e '+inside.ids.length+' internas':'')+
    '. Confirme visualmente, remova linhas auxiliares e complete conexões e raios antes de salvar.'};
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
