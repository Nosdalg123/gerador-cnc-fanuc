/* Projeção geométrica DXF — mesmo fator de escala em Z e X.
   Não inventa trajetória/raio e não libera programação com contorno aberto. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCDXFPerfil=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const DX=typeof module==='object'&&module.exports?require('./dxfcore.js'):root.CNCDXF;
function fmt(n){return Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3})}
function intersect(e,r){return DX.cut([e],r).length>0}
function sectionSuggestion(doc){
 let circles=doc.geometry.filter(e=>e.type==='CIRCLE'&&e.r>6),groups=[];
 circles.forEach(e=>{let g=groups.find(v=>Math.hypot(v.x-e.c[0],v.y-e.c[1])<1);if(!g)groups.push(g={x:e.c[0],y:e.c[1],n:0,max:0});g.n++;g.max=Math.max(g.max,e.r)});
 groups.sort((a,b)=>b.n-a.n);
 let front=groups.find(g=>g.n>=3&&g.x>0);if(!front)return null;
 let right=front.x-front.max*.66-8;
 let cand=doc.geometry.filter(e=>{
  if(!['LINE','ARC','LWPOLYLINE','SPLINE'].includes(e.type))return false;
  let b=DX.bounds([e]);if(!b)return false;
  return b.x1>0&&b.x2<right&&b.y1>front.y-front.max*1.27&&b.y2<front.y+front.max*1.27;
 });
 if(!cand.length)return null;
 let b=DX.bounds(cand);
 if(!b||b.width<15||b.height<15)return null;
 return {rect:{x1:b.x1-3,y1:b.y1-3,x2:b.x2+3,y2:b.y2+3},axis:front.y,front,origin:'circunferências concêntricas da vista frontal; conferir antes de aceitar'};
}
function segments(geometry,rect){
 const src=rect?DX.cut(geometry,rect):geometry,all=[];
 src.forEach(e=>{
  const segs=DX.explode(e);
  segs.forEach((v,j)=>all.push(Object.assign({},v,{uid:e.id+':'+j,parent:e.id})));
 });
 return all;
}
function above(seg,axis,tol=.15){
 const pts=DX.sample(seg,20);return pts.length&&pts.every(p=>p[1]>=axis-tol);
}
function classify(seg,axis,face,tol=.12){
 const pts=DX.sample(seg,36),a=pts[0],b=pts[pts.length-1];
 if(!a||!b)return {kind:'unsupported',reason:'Entidade sem pontos'};
 let p0=a,p1=b;
 if(face==='direita'){if(p0[0]<p1[0]){p0=b;p1=a}}
 else if(p0[0]>p1[0]){p0=b;p1=a}
 const length=Math.abs(p1[0]-p0[0]),d0=2*Math.abs(p0[1]-axis),d1=2*Math.abs(p1[1]-axis);
 if(seg.kind==='arc')return {kind:'raio',r:seg.r,length,di:d0,df:d1,reason:'Arco nativo: deve ser associado ao canto exato antes de gerar Macro B'};
 if(length<=tol)return {kind:'face',length,di:d0,df:d1,reason:'Face/degrau radial (deslocamento X)'};
 if(seg.kind==='line'&&Math.abs(d1-d0)<=tol)return {kind:'cil',a:d0,b:length};
 if(seg.kind==='line')return {kind:'cone',a:d0,b:d1,c:length};
 return {kind:'unsupported',reason:'Curva não traduzida'};
}
function endpoints(s){if(s.kind==='line')return[s.a,s.b];if(s.kind==='arc')return s.a&&s.b?[s.a,s.b]:DX.arcEnds?DX.arcEnds(s):[DX.sample(s,1)[0],DX.sample(s,1)[1]];return []}
function connectivity(segs,tol=.16){
 if(!segs.length)return {components:0,gaps:[],branches:[],closed:false,chain:[]};
 const byPoint=new Map(),point=p=>[Math.round(p[0]/tol),Math.round(p[1]/tol)].join(':');
 const adj=new Map();
 segs.forEach(s=>{let ps=endpoints(s);if(ps.length!==2)return;for(let p of ps){let key=point(p);if(!byPoint.has(key))byPoint.set(key,{p,ids:[]});byPoint.get(key).ids.push(s.uid)}});
 let br=[...byPoint.values()].filter(q=>q.ids.length>2),tips=[...byPoint.values()].filter(q=>q.ids.length===1);
 const names=segs.map(q=>q.uid);
 for(const n of names)adj.set(n,new Set());
 for(const q of byPoint.values())for(const a of q.ids)for(const b of q.ids)if(a!==b){adj.get(a)?.add(b)}
 let seen=new Set(),components=[];
 for(const id of names){if(seen.has(id))continue;let stack=[id],group=[];seen.add(id);while(stack.length){let x=stack.pop();group.push(x);for(let y of adj.get(x)||[])if(!seen.has(y)){seen.add(y);stack.push(y)}}components.push(group)}
 components.sort((a,b)=>b.length-a.length);
 return {components:components.length,gaps:tips.map(x=>x.p),branches:br.map(x=>x.p),closed:tips.length===0&&br.length===0&&components.length===1,groups:components,chain:components[0]};
}
function analyze(doc,rect,axis,face,chosen){
 const all=segments(doc.geometry,rect);
 const upper=Number.isFinite(axis)?all.filter(s=>above(s,axis)):[],candidate=upper.filter(s=>['line','arc'].includes(s.kind));
 const selected=candidate.filter(s=>chosen&&chosen.has(s.uid));
 const cn=connectivity(selected);
 const classified=selected.map(s=>Object.assign({uid:s.uid},classify(s,axis,face)));
 let alerts=[];
 if(!Number.isFinite(axis))alerts.push('Identifique o eixo central (X0) antes de converter a seção.');
 if(!['esquerda','direita'].includes(face))alerts.push('Defina a face Z0 voltada à ferramenta antes de exportar CNC.');
 if(!rect)alerts.push('Selecione a vista lateral da peça.');
 if(!selected.length)alerts.push('Nenhuma entidade selecionada para o perfil CNC. Use a prévia CAD e selecione o contorno.');
 if(cn.components>1)alerts.push('Perfil descontínuo: '+cn.components+' grupos separados. Conecte os trechos que pertencem ao perfil.');
 if(cn.branches.length)alerts.push('Interseções com ramificações ('+cn.branches.length+'). Remova linhas auxiliares do perfil selecionado.');
 if(cn.gaps.length>2)alerts.push('Contorno aberto em '+cn.gaps.length+' extremidades. Revise a continuidade.');
 if(classified.some(q=>q.kind==='raio'))alerts.push('Raios CAD preservados visualmente; associação CNC de canto requer conferência.');
 if(classified.some(q=>q.kind==='face'))alerts.push('Degraus radiais presentes: ordenar transições antes de liberar G71.');
 if(doc.geometry.some(e=>e.type==='SPLINE'&&(!rect||intersect(e,rect))))alerts.push('SPLINE encontrada: projeção aproximada; exigida conversão/aprovação de geometria.');
 if(doc.units!==4)alerts.push('Unidade do DXF não é milímetro; confirme/converta o arquivo.');
 return {all,upper,candidate,selected,classified,connection:cn,alerts,
   // Exportação CNC só para um percurso longitudinal contínuo sem arcos ou saltos.
   canExport:alerts.length===0&&selected.length>0&&classified.every(q=>q.kind==='cil'||q.kind==='cone')};
}
function polyPath(pts,coord){if(!pts.length)return'';return pts.map((p,i)=>(i?'L':'M')+coord(p).map(v=>v.toFixed(2)).join(',')).join(' ')}
function svg(doc,rect,options){
 options=options||{};let b=rect||DX.bounds(doc.geometry);
 if(!b)return '<svg viewBox="0 0 400 200"><text x="15" y="35">Sem geometria</text></svg>';
 let W=900,H=480,margin=30,scale=Math.min((W-2*margin)/Math.max(1,b.width),(H-2*margin)/Math.max(1,b.height));
 const pos=p=>[margin+(p[0]-b.x1)*scale,H-margin-(p[1]-b.y1)*scale];
 let out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Desenho CAD vetorial original; escala geométrica uniforme" data-unit-scale="'+scale.toFixed(6)+'">';
 out+='<rect width="'+W+'" height="'+H+'" fill="#ffffff"/>';
 const color={LINE:'#375777',ARC:'#2a78b4',CIRCLE:'#8ea9b5',LWPOLYLINE:'#375777',SPLINE:'#9a679c',ELLIPSE:'#9a679c'};
 let eList=rect?DX.cut(doc.geometry,rect):doc.geometry;
 eList.forEach(e=>{
  if(e.type==='CIRCLE'){let p=pos(e.c);out+='<circle cx="'+p[0].toFixed(2)+'" cy="'+p[1].toFixed(2)+'" r="'+(e.r*scale).toFixed(2)+'" fill="none" stroke="'+color.CIRCLE+'" stroke-width="1.15"/>';return}
  let source=DX.explode(e);if(!source.length&&e.type==='SPLINE'){let pts=e.fit.length?e.fit:e.control;if(pts.length>1){out+='<path d="'+polyPath(pts,pos)+'" fill="none" stroke="#9a679c" stroke-dasharray="6 3" stroke-width="1.8"/>'}return}
  source.forEach((s,i)=>{
   let pts=DX.sample(s,28),id=e.id+':'+i,selected=options.selected&&options.selected.has(id);
   let emphasis=selected?'#ea6700':(options.candidate&&options.candidate.has(id)?'#087e96':(color[e.type]||'#53728c'));
   out+='<path data-cad-segment="'+id+'" d="'+polyPath(pts,pos)+'" fill="none" stroke="'+emphasis+'" stroke-width="'+(selected?4:options.candidate&&options.candidate.has(id)?2.4:1.25)+'" stroke-linejoin="round" stroke-linecap="round" style="cursor:pointer"><title>'+(s.kind==='arc'?'Raio real R'+fmt(s.r):'Linha CAD')+'</title></path>';
  });
 });
 if(Number.isFinite(options.axis)){
  let ya=pos([b.x1,options.axis])[1];out+='<path d="M10,'+ya.toFixed(2)+'H890" stroke="#d36a2b" stroke-width="1" stroke-dasharray="7 4"/>';
  out+='<text x="14" y="'+(ya-5).toFixed(2)+'" font-size="13" fill="#b75a2f">X0 · eixo</text>';
 }
 if(options.dimensions)options.dimensions.slice(0,75).forEach(d=>{
  let p=pos(d.position);if(p[0]>=10&&p[0]<=W-15&&p[1]>=15&&p[1]<=H-15){
    out+='<text x="'+p[0].toFixed(2)+'" y="'+p[1].toFixed(2)+'" font-size="11" fill="#6d4983">'+
    (d.diameter?'Ø':'')+(d.measure===null?d.text:fmt(d.measure))+'</text>';
  }
 });
 out+='</svg>';return out;
}
return {sectionSuggestion,segments,above,classify,connectivity,analyze,svg};
});
