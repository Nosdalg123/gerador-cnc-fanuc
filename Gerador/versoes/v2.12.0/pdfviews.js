/* Sugere regiões de vistas quando há contornos vetoriais distintos.
   Heurística visual: não certifica que a vista detectada é a de usinagem. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFVistas=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function boxes(groups,W,H){
 var arr=(groups||[]).filter(g=>g&&g.count>=40&&g.width>70&&g.height>70&&g.width<W*.85&&g.height<H*.8);
 var round=arr.filter(g=>Math.abs(g.width/g.height-1)<.14&&g.width>W*.18);
 var side=arr.filter(g=>g.height>H*.24&&g.width>W*.15&&g.width/g.height<.84);
 if(!round.length||!side.length)return [];
 round.sort((a,b)=>b.count-a.count);
 var front=round[0],lateral=side.filter(g=>Math.abs(g.cx-front.cx)>W*.23).sort((a,b)=>b.count-a.count)[0];
 if(!lateral)return [];
 var gap=(front.cx+lateral.cx)/2,padW=Math.min(45,W*.07),leftSide=lateral.cx<front.cx;
 function n(v,max){return Math.min(1,Math.max(0,v/max))}
 function region(x1,y1,x2,y2){return{x1:n(x1,W),y1:n(y1,H),x2:n(x2,W),y2:n(y2,H)}}
 var minY=Math.max(5,Math.min(lateral.y1,front.y1)-H*.15),maxY=Math.min(H*.81,Math.max(lateral.y2,front.y2)+H*.04);
 var lat=leftSide?region(Math.max(0,lateral.x1-W*.16),minY,gap+padW,maxY):region(gap-padW,minY,Math.min(W,lateral.x2+W*.16),maxY);
 var fr=region(front.x1-padW,Math.max(5,front.y1-H*.04),front.x2+padW,front.y2+H*.04);
 return [{name:'Vista lateral (perfil do torno)',kind:'lateral',view:lat},
 {name:'Vista frontal (conferência)',kind:'frontal',view:fr}];
}
function extractGroups(list,ops,viewport){
 if(!list||!ops||!viewport)return [];
 var groups=[],W=viewport.width,H=viewport.height;
 for(var i=0;i<list.fnArray.length;i++){
  if(list.fnArray[i]!==ops.constructPath)continue;
  var args=list.argsArray[i],coords=args&&args[1];if(!coords||coords.length<60)continue;
  var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(var j=0;j+1<coords.length;j+=2){
   var p=viewport.convertToViewportPoint(coords[j],coords[j+1]);
   if(p[0]<minX)minX=p[0];if(p[0]>maxX)maxX=p[0];
   if(p[1]<minY)minY=p[1];if(p[1]>maxY)maxY=p[1];
  }
  if(maxX<=minX||maxY<=minY)continue;
  groups.push({x1:minX,y1:minY,x2:maxX,y2:maxY,
   cx:(maxX+minX)/2,cy:(maxY+minY)/2,width:maxX-minX,height:maxY-minY,count:coords.length/2});
 }
 return boxes(groups,W,H);
}
return {boxes,extractGroups};
});
