/* Cadeias topológicas DXF: uma cadeia termina em pontas ou bifurcações.
   Não seleciona a maior componente inteira (ela pode conter externo, interno e raios).
   Coordenadas nativas em mm, união por distância real e não arredondamento de grade. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./dxfcore.js'));
 else root.CNCDXFCadeias=factory(root.CNCDXF);
})(typeof self!=='undefined'?self:this,function(DX){
'use strict';
function build(segments,opts){
 opts=opts||{};
 var tol=Number.isFinite(opts.tol)?opts.tol:0.16,axis=Number(opts.axis),maxCount=opts.maxCount||16000;
 var nodes=[],edges=[],buckets=new Map();
 function id(p){
  let bx=Math.floor(p[0]/tol),by=Math.floor(p[1]/tol);
  for(let x=bx-1;x<=bx+1;x++)for(let y=by-1;y<=by+1;y++){
   let ids=buckets.get(x+','+y)||[];
   for(let n of ids)if(Math.hypot(nodes[n].p[0]-p[0],nodes[n].p[1]-p[1])<=tol)return n;
  }
  let n=nodes.length;nodes.push({p:[p[0],p[1]],edges:[]});
  let k=bx+','+by;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(n);return n;
 }
 let skipped=0;
 for(let s of (segments||[]).slice(0,maxCount)){
  if(s.kind!=='line'&&s.kind!=='arc'){skipped++;continue}
  let pts=DX.sample(s,8),a=pts[0],b=pts[pts.length-1];
  if(!a||!b||!Number.isFinite(a[0]+a[1]+b[0]+b[1])||Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5){skipped++;continue}
  let u=id(a),v=id(b);
  if(u===v){skipped++;continue}
  let e={s,id:s.uid,u,v,length:Math.hypot(b[0]-a[0],b[1]-a[1])};
  const idx=edges.length;edges.push(e);nodes[u].edges.push(idx);nodes[v].edges.push(idx);
 }
 let visited=new Set(),chains=[];
 function follow(start,first){
  let arr=[],node=start,edge=first,seen=new Set();
  while(edge!==undefined&&!visited.has(edge)){
   visited.add(edge);seen.add(edge);let e=edges[edge];arr.push(e);
   node=e.u===node?e.v:e.u;
   if(nodes[node].edges.length!==2)break;
   let next=nodes[node].edges.find(x=>x!==edge);
   if(next===undefined||visited.has(next))break;edge=next;
  }
  if(!arr.length)return;
  const minX=Math.min(...arr.flatMap(e=>[nodes[e.u].p[0],nodes[e.v].p[0]]));
  const maxX=Math.max(...arr.flatMap(e=>[nodes[e.u].p[0],nodes[e.v].p[0]]));
  const pts=arr.flatMap(e=>[nodes[e.u].p,nodes[e.v].p]);
  const cy=pts.reduce((v,p)=>v+p[1],0)/pts.length;
  const radii=pts.map(p=>Number.isFinite(axis)?p[1]-axis:0);
  const arcCount=arr.filter(e=>e.s.kind==='arc').length;
  const branchEnd=nodes[start].edges.length>2||nodes[node].edges.length>2;
  chains.push({id:'cadeia-'+chains.length,ids:arr.map(e=>e.id),count:arr.length,
   start:nodes[start].p,end:nodes[node].p,spanX:maxX-minX,minX,maxX,meanY:cy,
   meanRadius:radii.reduce((a,b)=>a+b,0)/radii.length,arcCount,branchEnd});
 }
 for(let n=0;n<nodes.length;n++)if(nodes[n].edges.length!==2)
  for(const ei of nodes[n].edges)if(!visited.has(ei))follow(n,ei);
 // Loops inteiros sem pontas ou bifurcações.
 for(let i=0;i<edges.length;i++)if(!visited.has(i))follow(edges[i].u,i);
 const largest=Math.max(1,...chains.map(c=>c.spanX));
 chains.forEach(c=>{
  const radius=Number.isFinite(axis)?Math.max(0,c.meanRadius):0;
  c.score=Math.round((c.spanX/largest*70+Math.min(30,radius*.3)+Math.min(14,c.count*2)- (c.branchEnd?7:0))*100)/100;
 });
 chains.sort((a,b)=>b.score-a.score);
 const bifurcations=nodes.filter(n=>n.edges.length>2).map(n=>({point:n.p,degree:n.edges.length}));
 const tips=nodes.filter(n=>n.edges.length===1).map(n=>n.p);
 return {chains,nodes:nodes.length,segments:edges.length,skipped,bifurcations,tips,
  message:bifurcations.length?'Existem '+bifurcations.length+' bifurcações. Cada cadeia deve ser conferida; a maior componente não é automaticamente o perfil.':
    'Cadeias separadas em pontas e linhas conectadas.'};
}
function segmentCoverage(chains,ids){
 const found=new Set();(chains||[]).filter(c=>c.ids.some(id=>ids.has(id))).forEach(c=>c.ids.forEach(id=>found.add(id)));
 return found;
}
return {build,segmentCoverage};
});
