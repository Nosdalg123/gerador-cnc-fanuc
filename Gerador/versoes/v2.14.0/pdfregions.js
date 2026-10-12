/* Geometria de seleção de VISTA do PDF em coordenadas da página.
   Usa extensão orientada do texto, não apenas a origem da primeira letra. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.CNCPDFRegioes=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function projectedBounds(item,viewport,util){
 var t=util.transform(viewport.transform,item.transform||[1,0,0,1,0,0]);
 var scale=Math.max(.00001,Math.abs(viewport.scale||1));
 var vx=t[0],vy=t[1],mag=Math.hypot(vx,vy)||1;
 var dx=vx/mag,dy=vy/mag;
 var nx=-dy,ny=dx;
 var w=Math.max(1,Math.abs(Number(item.width)||0)*scale);
 var h=Math.max(1,Math.abs(Number(item.height)||0)*scale);
 var x=t[4],y=t[5],pts=[
 [x,y],[x+dx*w,y+dy*w],[x-nx*h,y-ny*h],
 [x+dx*w-nx*h,y+dy*w-ny*h]
 ];
 var xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 return {x1:Math.min(...xs),y1:Math.min(...ys),x2:Math.max(...xs),y2:Math.max(...ys)};
}
function intersects(a,b){return Math.max(a.x1,b.x1)<Math.min(a.x2,b.x2)&&Math.max(a.y1,b.y1)<Math.min(a.y2,b.y2)}
function inRegion(box,region){
 if(!region)return true;
 var cx=(box.x1+box.x2)/2,cy=(box.y1+box.y2)/2;
 return cx>=region.x1&&cx<=region.x2&&cy>=region.y1&&cy<=region.y2&&intersects(box,region);
}
function filter(items,viewport,util,picked){
 if(!picked||!viewport||!util)return items||[];
 var area={x1:picked.x1*viewport.width,y1:picked.y1*viewport.height,x2:picked.x2*viewport.width,y2:picked.y2*viewport.height};
 return (items||[]).filter(it=>inRegion(projectedBounds(it,viewport,util),area));
}
return {projectedBounds,inRegion,filter};
});
