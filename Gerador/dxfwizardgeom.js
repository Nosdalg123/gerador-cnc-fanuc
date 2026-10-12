/* Assistente experimental v2.21: grafo por extremidades reais de LINE/ARC.
   Nenhuma sugestão geométrica pode liberar CNC automaticamente. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./dxfcore.js'),require('./dxfprofile.js'));
 else root.CNCDXFWizardGeom=factory(root.CNCDXF,root.CNCDXFPerfil);
})(typeof self!=='undefined'?self:this,function(DX,P){
'use strict';
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const good=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function collect(doc,rect,axis){
 if(!doc||!rect)return [];
 return P.segments(doc.geometry,rect).filter(s=>s.kind==='line'||s.kind==='arc').map(s=>{
  const pts=DX.sample(s,Math.max(64,Math.ceil((s.r||1)*4)));
  return {...s,points:pts,start:pts[0],end:pts[pts.length-1]};
 }).filter(s=>good(s.start)&&good(s.end)&&
  (!Number.isFinite(axis)||P.above(s,axis,.15)));
}
function analyze(segments,selection,tolerance=.16){
 const chosen=segments.filter(s=>selection.has(s.uid)),nodes=[],edges=[],invalid=[];
 function node(p){
  let i=nodes.findIndex(n=>dist(n.p,p)<=tolerance);
  if(i<0){i=nodes.length;nodes.push({p:p.slice(),edges:[]})}
  return i;
 }
 for(const s of chosen){
  if(!good(s.start)||!good(s.end)||dist(s.start,s.end)<.00001){
   invalid.push(s.uid);continue;
  }
  const a=node(s.start),b=node(s.end),index=edges.length;
  edges.push({a,b,uid:s.uid,segment:s});nodes[a].edges.push(index);nodes[b].edges.push(index);
 }
 const branches=nodes.filter(n=>n.edges.length>2).map(n=>n.p),
  tips=nodes.map((n,i)=>({...n,index:i})).filter(n=>n.edges.length===1),
  duplicates=[];
 const seenEdges=new Set();
 for(const e of edges){const key=Math.min(e.a,e.b)+':'+Math.max(e.a,e.b);
  if(seenEdges.has(key))duplicates.push(e.uid);else seenEdges.add(key);
 }
 let components=0;const seen=new Set(),groups=[];
 for(let i=0;i<nodes.length;i++){if(seen.has(i))continue;components++;const stack=[i],group=[];
  while(stack.length){const j=stack.pop();if(seen.has(j))continue;seen.add(j);group.push(j);
   for(const ei of nodes[j].edges){const e=edges[ei];stack.push(e.a===j?e.b:e.a)}
  }groups.push(group);
 }
 // Interseção interna entre retas: não ocultar uma bifurcação não dividida.
 const crossings=[],cross=(u,v)=>u[0]*v[1]-u[1]*v[0];
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const x=edges[i],y=edges[j];
  if(x.segment.kind!=='line'||y.segment.kind!=='line')continue;
  const p=x.segment.start,q=y.segment.start,
   a=[x.segment.end[0]-p[0],x.segment.end[1]-p[1]],
   b=[y.segment.end[0]-q[0],y.segment.end[1]-q[1]], den=cross(a,b);
  if(Math.abs(den)<1e-9)continue;
  const delta=[q[0]-p[0],q[1]-p[1]],t=cross(delta,b)/den,u=cross(delta,a)/den;
  if(t>.0001&&t<.9999&&u>.0001&&u<.9999)
   crossings.push({point:[p[0]+t*a[0],p[1]+t*a[1]],uids:[x.uid,y.uid]});
 }
 const gaps=[];
 for(let i=0;i<tips.length;i++)for(let j=i+1;j<tips.length;j++){
  const a=tips[i],b=tips[j],d=dist(a.p,b.p);
  if(d>tolerance&&d<=12)gaps.push({a:a.p,b:b.p,mm:d,
    aEdge:edges[a.edges[0]],bEdge:edges[b.edges[0]],an:a.index,bn:b.index});
 }
 gaps.sort((a,b)=>a.mm-b.mm);
 let minX=Infinity,maxX=-Infinity;
 for(const e of edges)for(const p of e.segment.points){
  minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);
 }
 const ok=edges.length>=2&&invalid.length===0&&components===1&&branches.length===0&&
   duplicates.length===0&&crossings.length===0&&(tips.length===0||tips.length===2);
 let ordered=[];
 if(ok){
  let cursor=tips.length?tips[0].index:edges[0].a;
  const visited=new Set();
  for(let k=0;k<edges.length;k++){
   const ei=nodes[cursor].edges.find(e=>!visited.has(e));
   if(ei===undefined)break;
   visited.add(ei);const edge=edges[ei],reverse=edge.b===cursor;
   ordered.push({uid:edge.uid,reverse});cursor=reverse?edge.a:edge.b;
  }
  if(ordered.length!==edges.length)ordered=[];
 }
 return {ok,chosen,invalid,branches,tips,gaps,duplicates,crossings,components,ordered,
  span:Number.isFinite(minX)?maxX-minX:0,hasArc:chosen.some(s=>s.kind==='arc')};
}
function proposal(graph,limit=.20){
 // Pequenos vãos: ligar apenas extremos de entidades LINE, com destino único.
 // De 0,20 até 12 mm: só oferecer extensão perfeitamente colinear, sujeita a confirmação.
 const choices=[];
 for(const gap of graph.gaps){
  if(gap.aEdge.uid===gap.bEdge.uid)continue;
  for(const side of [0,1]){
   const moving=side?gap.bEdge:gap.aEdge,target=side?gap.a:gap.b;
   if(!moving||moving.segment.kind!=='line')continue;
   const seg=moving.segment,a=seg.start,b=seg.end,len=dist(a,b);
   if(len<.001)continue;
   const moveA=dist(a,side?gap.b:gap.a)<dist(b,side?gap.b:gap.a);
   const end=moveA?a:b,from=moveA?b:a;
   const dir=[(end[0]-from[0])/len,(end[1]-from[1])/len];
   const delta=[target[0]-end[0],target[1]-end[1]],along=delta[0]*dir[0]+delta[1]*dir[1],
    normal=Math.abs(delta[0]*dir[1]-delta[1]*dir[0]);
   const snap=gap.mm<=limit;
   if((snap||along>.0001&&normal<=.04)&&gap.mm<=12){
    choices.push({uid:moving.uid,end:moveA?'ini':'fim',point:target.slice(),
     before:end.slice(),mm:gap.mm,kind:snap?'snap':'extend',safe:snap,
     label:(snap?'Coincidir pontas':'Estender até a ponta')+' · '+gap.mm.toFixed(3)+' mm'});
   }
  }
 }
 // Evita opções ambíguas com múltiplos destinos diferentes para a mesma ponta.
 const distinct=new Map();
 for(const c of choices){
  const key=c.uid+'|'+c.end, list=distinct.get(key)||[];
  if(!list.some(x=>Math.abs(x.mm-c.mm)<.00001))list.push(c);
  distinct.set(key,list);
 }
 return [...distinct.values()].map(list=>list.sort((a,b)=>a.mm-b.mm))
  .filter(list=>list.length===1||list[1].mm-list[0].mm>.1)
  .map(list=>list[0]);
}
function apply(geometry,repair){
 if(!repair||!good(repair.point))return {ok:false,reason:'Destino inválido'};
 const bits=repair.uid.split(':'),index=Number(bits.pop()),id=bits.join(':'),
  e=geometry.find(q=>q.id===id);
 if(!e||e.type!=='LINE'||index!==0)return {ok:false,reason:'Somente LINE nativa é alterada. Polilinhas e arcos devem ser revisados no CAD.'};
 const before=repair.end==='ini'?e.a:e.b;
 if(dist(before,repair.before)>.005)return {ok:false,reason:'A geometria mudou desde o diagnóstico; analise novamente.'};
 if(repair.end==='ini')e.a=repair.point.slice();else e.b=repair.point.slice();
 return {ok:true};
}
return {collect,analyze,proposal,apply};
});