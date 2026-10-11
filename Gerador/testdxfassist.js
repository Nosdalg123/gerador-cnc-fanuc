/* Testes da assistência DXF: vistas, problemas e reparo colinear (sem G-code). */
const assert=require('assert'),DX=require('./dxfcore.js'),P=require('./dxfprofile.js'),A=require('./dxfassist.js');
const line=(uid,a,b)=>({uid,kind:'line',a,b});
const doc={units:4,geometry:[
 {id:'a',type:'LINE',a:[0,20],b:[20,20]},
 {id:'b',type:'LINE',a:[20.8,20],b:[40,20]},
 {id:'c',type:'LINE',a:[50,10],b:[80,10]},
 {id:'f1',type:'CIRCLE',c:[200,20],r:40},
 {id:'f2',type:'CIRCLE',c:[200,20],r:30},
 {id:'f3',type:'CIRCLE',c:[200,20],r:20}
],entities:[],dimensions:[]};
const options=A.views(doc);
assert(options.find(x=>x.id==='lateral')&&options.find(x=>x.id==='frontal')&&options.find(x=>x.id==='completo'),'Section/front/full views');
assert(options.find(x=>x.id==='frontal').profile===false,'Frontal cannot generate turning profile');
assert(options.find(x=>x.id==='lateral').profile,'Longitudinal is default for profile');
const segments=[line('a:0',[0,20],[20,20]),line('b:0',[20.8,20],[40,20]),line('other:0',[45,18],[55,20])];
let fixes=A.repairOptions(segments,new Set(['a:0','b:0']),4);
assert(fixes.some(x=>x.uid==='a:0'&&x.which==='fim'&&Math.abs(x.mm-.8)<.001),'Propose unique .8mm gap extension');
assert(!fixes.some(x=>x.to==='other:0'),'Do not use unselected CAD auxiliaries');
assert(!A.repairOptions(segments,new Set(['a:0']),3).length,'No single-line repairs');
let ambiguous=segments.concat([line('rival:0',[20.85,20],[22,20])]);
let uncertain=A.repairOptions(ambiguous,new Set(['a:0','b:0','rival:0']),4);
assert(!uncertain.some(x=>x.uid==='a:0'&&x.which==='fim'),'Ambiguous nearby endpoints not auto repaired');
let broken={selected:[segments[0]],connection:{components:2,gaps:[[20,20],[20.8,20],[0,20],[40,20]],branches:[]}};
let diag=A.diagnostics({external:broken,internal:{selected:[]},doc,selected:{externo:new Set(['a:0'])},hidden:new Set(),axis:20,rect:{x1:0,y1:0,x2:80,y2:60}});
assert(diag.some(x=>x.type==='gap'),'Disconnected contours explained');
assert(A.diagnostics({external:null,internal:null,doc,hidden:new Set(),axis:20,rect:null}).some(x=>x.type==='view'));
console.log('DXF assistant: view choices, topological issue cards and safe unique gap proposals passed.');
