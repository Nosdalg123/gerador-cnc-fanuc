/* Importador experimental independente (v2.21). A janela antiga não é modificada. */
(function(root){
'use strict';
const $=id=>document.querySelector(id),DX=root.CNCDXF,P=root.CNCDXFPerfil,
 A=root.CNCDXFAssistente,E=root.CNCDXFEdicao,G=root.CNCDXFWizardGeom,F=root.CNCDXFGeomEdit,R=root.CNCDXFReview;
const KEY='cnc_dxf_assistente_221',clone=o=>JSON.parse(JSON.stringify(o));
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
let original=null,doc=null,region=null,axis=NaN,face='',name='',fileName='',step=1,selectingRegion=false,
 dragStart=null,viewName='',chosen=new Set(),focused=null,tool='pick',built=false,
 activeRepair=null,undo=[],log=[],repairMarks=[],editCount=0,zoom=1,preciseClick=null,hidden=new Set();
const status=(msg,bad)=>{$('#wStatus').textContent=msg;$('#wStatus').style.color=bad?'#b33d30':''};
const validRect=r=>r&&r.x2-r.x1>1&&r.y2-r.y1>1;
const allSegments=()=>G.collect(doc,region,axis,hidden);
const graph=()=>G.analyze(allSegments(),chosen);
const review=()=>({...R.check({doc,sourceDoc:original,region,axis,face,graph:graph(),length:$('#wLength').value,built}),deletedSegments:hidden.size});
function resetReview(){$('#wReviewed').checked=false}
function setStep(n){
 if(n>1&&!doc){status('Importe primeiro o DXF.',true);return}
 if(n>1&&(!validRect(region)||!Number.isFinite(axis))){
  status('Escolha uma seção longitudinal e informe o eixo central Y antes de editar.',true);return;
 }
 step=n;tool='pick';focused=null;activeRepair=null;render();
}
function capture(){
 undo.push({doc:clone(doc),chosen:[...chosen],hidden:[...hidden],built,editCount,log:log.slice(),repairMarks:clone(repairMarks)});
 if(undo.length>30)undo.shift();resetReview();
}
function clearWork(newFile=false){
 chosen.clear();built=false;focused=null;activeRepair=null;tool='pick';undo=[];
 if(newFile){hidden.clear();log=[];repairMarks=[];editCount=0;}
}
function svgPointer(evt,svg){
 const matrix=svg.getScreenCTM();
 if(matrix){const p=svg.createSVGPoint();p.x=evt.clientX;p.y=evt.clientY;
  const q=p.matrixTransform(matrix.inverse());return [q.x,q.y];}
 const r=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;
 return [v.x+(evt.clientX-r.left)*v.width/Math.max(1,r.width),
         v.y+(evt.clientY-r.top)*v.height/Math.max(1,r.height)];
}
function cadFromScreen(p,b){
 const scale=Math.min(840/Math.max(1,b.width),420/Math.max(1,b.height));
 return [b.x1+(p[0]-30)/scale,b.y1+(450-p[1])/scale];
}
function setRegion(r,newAxis,id){
 if(!validRect(r)){status('Vista inválida; selecione uma região maior.',true);return}
 region=clone(r);viewName=id||'manual';axis=Number.isFinite(newAxis)?newAxis:NaN;
 $('#wAxis').value=Number.isFinite(axis)?String(axis):'';
 clearWork();render();
}
function renderViews(){
 const combo=$('#wView');combo.replaceChildren();
 for(const v of A.views(original)){const opt=document.createElement('option');
  opt.value=v.id;opt.textContent=v.name+(v.profile?' (torneamento)':' (referência)');
  combo.appendChild(opt);
 }
 if(viewName==='manual'){const opt=document.createElement('option');opt.value='manual';opt.textContent='Região escolhida pelo operador';combo.appendChild(opt)}
 combo.value=viewName;
}
function renderDiagnostic(){
 const host=$('#wProblems');host.replaceChildren();
 if(!doc||!region){host.textContent='Importe o desenho e escolha uma vista.';return}
 const s=allSegments(),g=G.analyze(s,chosen),actions=G.proposal(g),para=(t)=>{const p=document.createElement('p');p.className='note';p.textContent=t;host.appendChild(p)};
 if(!chosen.size){para('Marque as entidades que formam a borda superior do perfil. Arcos podem ser selecionados.');return}
 para(chosen.size+' entidade(s) marcadas · '+g.components+' componente(s) · '+g.tips.length+' ponta(s) · '+g.span.toFixed(3)+' mm em Z.');
 if(g.invalid.length)para(g.invalid.length+' trecho(s) selecionados com geometria inválida.');
 if(g.branches.length)para(g.branches.length+' bifurcação(ões): retire os ramos ou separe a linha no CAD.');
 if(g.duplicates.length)para(g.duplicates.length+' entidade(s) sobrepostas: revise a marcação.');
 if(g.crossings.length)para(g.crossings.length+' cruzamento(s) internos: precisam de divisão/corte antes de construir.');
 if(g.hasArc)para('Arco nativo preservado e aceito no contorno. Associação ao raio CNC ainda exige revisão.');
 if(g.components>1||g.tips.length>2)para('O contorno tem desconexões. Veja as distâncias abaixo. Não serão fechadas automaticamente acima de 0,20 mm.');
 if(Number($('#wLength').value)>0&&Math.abs(g.span-Number($('#wLength').value))>.15)
  para('Projeção axial '+fmt(g.span)+' mm difere da cota informada ('+fmt($('#wLength').value)+' mm). Confira vista e extremidades; nenhum comprimento foi inventado.');
 for(const gap of g.gaps.slice(0,10)){
  const div=document.createElement('div');div.className='w-issue';
  const label=document.createElement('span');label.textContent='Folga entre pontas: '+fmt(gap.mm)+' mm · Z '+fmt(gap.a[0])+' → '+fmt(gap.b[0]);
  div.appendChild(label);
  const inspect=document.createElement('button');inspect.type='button';inspect.className='btn sm';inspect.textContent='Localizar';
  inspect.onclick=()=>{activeRepair={before:gap.a,point:gap.b,preview:true};renderCanvas();status('Folga real entre duas extremidades destacada.');};
  div.appendChild(inspect);
  const repair=actions.find(x=>Math.abs(x.mm-gap.mm)<.0001&&(GDist(x.before,gap.a)<.001||GDist(x.before,gap.b)<.001));
  if(repair){
   const test=document.createElement('button');test.type='button';test.className='btn sm';
   test.textContent='Prévia: '+(repair.kind==='snap'?'unir pontas':'estender linha');
   test.onclick=()=>{activeRepair={...repair,preview:true};renderCanvas();
    status('Prévia de '+fmt(repair.mm)+' mm; nenhuma geometria alterada.');};
   div.appendChild(test);
   const apply=document.createElement('button');apply.type='button';apply.className='btn sm';
   apply.textContent='Confirmar ajuste';apply.onclick=()=>applyRepair(repair);
   div.appendChild(apply);
  }else{
   const small=document.createElement('small');small.textContent='Sem correção inequívoca. Ajustar no CAD ou revisar seleção.';
   div.appendChild(small);
  }
  host.appendChild(div);
 }
 if(!g.gaps.length&&g.ok)para('Cadeia contínua sem bifurcações detectadas. Confira perfil completo, raios, roscas e cotas.');
}
function GDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
function applyRepair(repair){
 if(!repair.safe&&!root.confirm('Estender '+fmt(repair.mm)+' mm? Isso altera uma dimensão CAD. Confirme que o destino corresponde ao desenho cotado.'))return;
 capture();const change=G.apply(doc.geometry,repair);
 if(!change.ok){undo.pop();status(change.reason,true);return}
 editCount++;built=false;activeRepair=null;
 repairMarks.push({before:repair.before.slice(),point:repair.point.slice(),uid:repair.uid});
 log.push((repair.safe?'Pontas unidas':'Linha estendida')+' '+repair.uid+' em '+fmt(repair.mm)+' mm');
 render();status(log[log.length-1]+'. Confira a marcação destacada e a cota original.');
}
function renderCanvas(){
 const host=$('#wCanvas');host.replaceChildren();
 if(!doc){host.textContent='Selecione um arquivo DXF para visualizar o CAD.';return}
 const source=step===1,sel=source?new Set():chosen;
 const parts=!source?allSegments():[],allowed=new Set(parts.map(s=>s.uid));
 const contour=!source&&chosen.size?graph():null;
 const hide=new Set(source?[]:hidden);
 if(!source&&built&&!$('#wRefs').checked)
  for(const s of P.segments(doc.geometry,region))if(!chosen.has(s.uid))hide.add(s.uid);
 host.innerHTML=P.svg(source?original:doc,source?null:region,{
  axis:source?NaN:axis,face:source?'':face,selected:sel,external:sel,hidden:hide,
  candidate:allowed,upperOnly:!source&&Number.isFinite(axis),focus:focused,
  faceX:contour?(face==='esquerda'?contour.minX:contour.maxX):NaN,
  hideReferences:!source&&built&&!$('#wRefs').checked
 });
 const svg=host.querySelector('svg');if(!svg)return;
 svg.style.width=(100*zoom)+'%';svg.style.maxWidth='none';
 if(!source){
  const coord=E.viewTransform(region,face);
  const g=graph();
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','g');overlay.style.pointerEvents='none';
  const points=g.gaps.slice(0,12).flatMap(x=>[x.a,x.b]).concat(g.crossings.slice(0,12).map(x=>x.point));
  for(const pt of points){
   const xy=coord(pt),circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
   circle.setAttribute('cx',xy[0]);circle.setAttribute('cy',xy[1]);circle.setAttribute('r',5);
   circle.setAttribute('stroke','#b72d3c');circle.setAttribute('stroke-width',2);
   circle.setAttribute('fill','none');overlay.appendChild(circle);
  }
  for(const change of repairMarks){
   const a=coord(change.before),b=coord(change.point),line=document.createElementNS('http://www.w3.org/2000/svg','path');
   line.setAttribute('d','M'+a.join(',')+'L'+b.join(','));line.setAttribute('stroke','#14a875');
   line.setAttribute('stroke-width','4');line.setAttribute('stroke-dasharray','3 3');overlay.appendChild(line);
  }
  if(activeRepair&&activeRepair.before&&activeRepair.point){
   const a=coord(activeRepair.before),b=coord(activeRepair.point),line=document.createElementNS('http://www.w3.org/2000/svg','path');
   line.setAttribute('d','M'+a.join(',')+'L'+b.join(','));line.setAttribute('stroke','#ee7e1b');line.setAttribute('stroke-width','4');
   line.setAttribute('stroke-dasharray','6 4');overlay.appendChild(line);
   if(activeRepair.label){
    const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.textContent=activeRepair.label;
    label.setAttribute('x',Math.max(20,Math.min(700,a[0])));label.setAttribute('y',Math.max(20,Math.min(460,a[1]-12)));
    label.setAttribute('fill','#b65a14');label.setAttribute('font-size','14');overlay.appendChild(label);
   }
  }
  svg.appendChild(overlay);
 }
 if(source&&region){
  const b=DX.bounds(original.geometry),to=E.viewTransform({x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2},'direita');
  const a=to([region.x1,region.y1]),c=to([region.x2,region.y2]);
  const box=document.createElementNS('http://www.w3.org/2000/svg','rect');
  box.setAttribute('x',Math.min(a[0],c[0]));box.setAttribute('y',Math.min(a[1],c[1]));
  box.setAttribute('width',Math.abs(a[0]-c[0]));box.setAttribute('height',Math.abs(a[1]-c[1]));
  box.setAttribute('stroke','#d97706');box.setAttribute('stroke-width',2);box.setAttribute('stroke-dasharray','8 5');
  box.setAttribute('fill','#e6a223');box.setAttribute('fill-opacity','.08');box.style.pointerEvents='none';svg.appendChild(box);
 }
}
function syncExtend(){
 const el=$('#wExtendControls'),show=step===2&&['extend','trim'].includes(tool);
 el.hidden=!show;if(!show)return;
 const s=allSegments().find(x=>x.uid===focused);
 $('#wExtTarget').textContent=s&&s.kind==='line'?'Linha '+focused+' · selecione a ponta pela seta ou inverta.':
  'Clique na linha reta que deseja estender. Arcos permanecem nativos.';
 const line=!!(s&&F.entityFor(doc.geometry,focused)),trim=tool==='trim';
 $('#wEditTitle').textContent=trim?'Cortar linha selecionada':'Estender linha selecionada';
 for(const id of ['wExtAmount','wApplyExtend','wExtendUntil'])$('#'+id).hidden=trim;
 $('#wApplyTrim').hidden=!trim;
 $('#wCancelExtend').textContent=trim?'Cancelar corte':'Cancelar extensão';
 $('#wApplyExtend').disabled=!line;$('#wExtendUntil').disabled=!line;$('#wApplyTrim').disabled=!line;
}
function renderSummary(){
 const host=$('#wSummary');host.replaceChildren();
 if(!doc)return;
 const g=graph(),cotas=DX.nativeCotas(original.dimensions,region),list=[
  'Arquivo: '+fileName+' · unidade: '+doc.unitName,
  'Perfil: '+chosen.size+' trechos · '+g.chosen.filter(s=>s.kind==='arc').length+' arcos · '+(g.ok?'cadeia conectada':'conexões pendentes')+'.',
  'Extensão Z: '+fmt(g.span)+' mm; nominal: '+($('#wLength').value?fmt($('#wLength').value):'não informado')+' mm.',
  'Cotas nativas: '+cotas.length+' · edições: '+editCount+' · excluídos: '+hidden.size+' · fonte preservada.',
  'Eixo Y: '+(Number.isFinite(axis)?fmt(axis):'pendente')+'; Z0: '+(face||'pendente'),
 ];
 for(const item of list){const p=document.createElement('p');p.textContent=item;host.appendChild(p)}
 const audit=review(),box=document.createElement('div');box.id='wAudit';
 const title=document.createElement('strong');title.textContent='Conferência de cotas e operações';box.appendChild(title);
 const line=(text,code)=>{const p=document.createElement('p');p.textContent=text;if(code)p.dataset.reviewCode=code;box.appendChild(p)};
 line(audit.status,'status');
 if(audit.axialReference)line('Cota axial de referência: '+fmt(audit.axialReference.value)+' mm.');
 for(const issue of audit.issues){
  line(issue.message,issue.code);
  if(issue.points?.length===2&&issue.points.every(p=>Array.isArray(p)&&p.every(Number.isFinite))){
   const locate=document.createElement('button');locate.className='btn sm';locate.type='button';
   locate.textContent='Localizar '+(issue.dimensionId?'cota':'curva');locate.dataset.reviewLocate=issue.code;
   locate.onclick=()=>{if(issue.entityId)$('#wRefs').checked=true;setStep(2);activeRepair={before:issue.points[0],point:issue.points[1],label:issue.label,preview:true};
    renderCanvas();status(issue.label+' destacada. A geometria não foi alterada.');};
   box.appendChild(locate);
  }
 }
 if(audit.radii.length)line('Raios preservados: '+audit.radii.map(r=>'R'+fmt(r)).join(' · ')+'. Associar às operações CNC.');
 if(audit.operations.length)line('Roscas/furações anotadas: '+audit.operations.map(n=>n.text).join(' · ')+'. Não são convertidas pelo perímetro.','operations');
 if(audit.specialCurves)line(audit.specialCurves+' curva(s) SPLINE/ELLIPSE na vista exigem revisão.');
 line('CNC bloqueado: '+audit.cncReason,'cnc');host.appendChild(box);
}
function render(){
 $('#dxfWizard').hidden=false;
 for(const el of document.querySelectorAll('#dxfWizard [data-w-step]'))el.hidden=+el.dataset.wStep!==step;
 for(let i=1;i<=3;i++){$('#wStep'+i).setAttribute('aria-current',String(i===step));$('#wStep'+i).disabled=!doc&&i>1}
 $('#wCanvasTitle').textContent=step===1?'Geometria CAD original · delimitar vista':'Metade superior · contorno de torneamento';
 $('#wCanvasHint').textContent=step===1?'Arraste um retângulo após ativar a ferramenta.':'Verde: selecionado · laranja: foco · círculos vermelhos: folgas';
 $('#wSelected').textContent=chosen.size+' segmento(s) marcado(s)'+(built?' · contorno isolado':'');
 $('#wPick').setAttribute('aria-pressed',String(tool==='pick'));
 $('#wExtendMode').setAttribute('aria-pressed',String(tool==='extend'));
 $('#wTrimMode').setAttribute('aria-pressed',String(tool==='trim'));
 $('#wBreak').disabled=!(focused&&F.entityFor(doc.geometry,focused));
 const focus=allSegments().find(s=>s.uid===focused);
 $('#wDeleteSelected').disabled=!focus;
 $('#wUndo').disabled=!undo.length;
 $('#wFocused').textContent=focus?'Selecionada: '+(focus.kind==='arc'?'arco R'+fmt(focus.r):'linha')+' · '+focused:
  'Clique numa linha para selecionar (realce laranja).';
 $('#wBuild').disabled=chosen.size<2;
 $('#wAutoSafe').disabled=!G.proposal(graph()).some(x=>x.safe);
 syncExtend();renderCanvas();
 if(step===2)renderDiagnostic();
 if(step===3)renderSummary();
}
function showWizard(){
 $('#dxfPanel').hidden=true;$('#pdfPanel').hidden=true;$('#pdfManual').hidden=true;
 $('#dxfWizard').hidden=false;render();
}
$('#dxfWizardModo').onclick=showWizard;
$('#wClose').onclick=()=>{$('#dxfWizard').hidden=true;$('#pdfManual').hidden=false};
$('#dxfModo').addEventListener('click',()=>{$('#dxfWizard').hidden=true});
$('#pdfModo').addEventListener('click',()=>{$('#dxfWizard').hidden=true});
for(let i=1;i<=3;i++)$('#wStep'+i).onclick=()=>setStep(i);
$('#wNext1').onclick=()=>setStep(2);
$('#wNext2').onclick=()=>setStep(3);
$('#wFile').onchange=async function(){
 const file=this.files[0];if(!file)return;
 if(!/\.dxf$/i.test(file.name)||file.size>25e6){status('Aceito apenas DXF ASCII até 25 MB.',true);return}
 try{
  const text=new TextDecoder('windows-1252').decode(await file.arrayBuffer());
  original=DX.read(text);doc=clone(original);fileName=file.name;name=file.name.replace(/\.dxf$/i,'');
  $('#wName').value=name;region=null;axis=NaN;face='';zoom=1;clearWork(true);
  $('#wZoom').value='100';$('#wZoomValue').value='100%';
  const views=A.views(original),best=views.find(v=>v.profile);
  if(best){region=clone(best.rect);axis=best.axis;viewName=best.id}
  else{const b=DX.bounds(original.geometry);region={x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2};viewName='completo'}
  $('#wAxis').value=Number.isFinite(axis)?axis:'';
  $('#wFace').value='';$('#wLength').value='';
  $('#wFileInfo').textContent=original.geometry.length+' entidades, '+original.dimensions.length+' cotas. Unidades: '+original.unitName;
  step=1;renderViews();render();
  status('DXF carregado. Confira a vista sugerida e o eixo; depois continue para marcar o perímetro.');
 }catch(error){status('Falha ao ler DXF: '+String(error.message||error),true)}
};
$('#wView').onchange=function(){
 if(!original)return;
 const view=A.views(original).find(v=>v.id===this.value);
 if(!view)return;
 if(view.profile){setRegion(view.rect,view.axis,view.id);status('Vista longitudinal selecionada. Confira o eixo.')}
 else{setRegion(view.rect,NaN,view.id);status('Vista de referência: defina eixo e vista longitudinal antes de construir.',true)}
};
$('#wFull').onclick=()=>{if(!original)return;const b=DX.bounds(original.geometry);setRegion(b,NaN,'completo');renderViews();status('Folha inteira. Use Delimitar vista antes de construir.')};
$('#wRegion').onclick=()=>{if(!original){status('Carregue um DXF primeiro.',true);return}
 selectingRegion=true;status('Arraste um retângulo sobre a seção longitudinal do CAD original.')};
$('#wAxis').onchange=function(){axis=this.value===''?NaN:Number(this.value);clearWork();render()};
$('#wFace').onchange=function(){face=this.value;resetReview();render()};
$('#wLength').onchange=function(){resetReview();render()};
$('#wPick').onclick=()=>{tool='pick';focused=null;activeRepair=null;render()};
$('#wExtendMode').onclick=()=>{tool='extend';focused=null;activeRepair=null;render()};
 $('#wTrimMode').onclick=()=>{tool='trim';activeRepair=null;render()};
$('#wCancelExtend').onclick=()=>{tool='pick';focused=null;render()};
$('#wFlip').onclick=()=>{$('#wExtEnd').value=$('#wExtEnd').value==='ini'?'fim':'ini'};
$('#wApplyExtend').onclick=()=>{
 const s=allSegments().find(x=>x.uid===focused),mm=Number($('#wExtMm').value);
 if(!s||s.kind!=='line'||!Number.isFinite(mm)||mm<=0||mm>10000){status('Selecione LINE e um comprimento positivo em mm.',true);return}
 if(s.clippedEnd===$('#wExtEnd').value){status('Esta ponta é um recorte visual no eixo. Escolha a outra ponta ou quebre a linha antes de editar.',true);return}
 if(!root.confirm('Estender '+fmt(mm)+' mm? Confira direção e distância na geometria cotada.'))return;
 capture();const result=E.extendLine(doc.geometry,focused,$('#wExtEnd').value,mm);
 if(!result.ok){undo.pop();status(result.reason,true);return}
 editCount++;built=false;log.push('Linha '+focused+' estendida em '+fmt(mm)+' mm');
 tool='pick';render();status(log[log.length-1]+'. A geometria CAD fonte não foi modificada.');
};
 $('#wExtendUntil').onclick=()=>{
  const s=allSegments().find(x=>x.uid===focused),end=$('#wExtEnd').value;
  if(!s)return;
  if(s.clippedEnd===end){status('Ponta recortada no eixo: escolha a outra ponta ou quebre a linha.',true);return}
  const ext=F.nearestForward(doc.geometry,focused,end,axis,region,hidden);
  if(!ext.ok){status(ext.reason,true);return}
  if(!root.confirm('Estender '+fmt(ext.mm)+' mm até '+ext.target+'?'))return;
  capture();const result=E.extendLine(doc.geometry,focused,end,ext.mm);
  if(!result.ok){undo.pop();status(result.reason,true);return}
  editCount++;built=false;log.push('Linha '+focused+' estendida até '+ext.target+' em '+fmt(ext.mm)+' mm');
  tool='pick';render();status(log[log.length-1]);
 };
 $('#wApplyTrim').onclick=()=>{
  const end=$('#wExtEnd').value,s=allSegments().find(x=>x.uid===focused);
  if(!s)return;
  if(s.clippedEnd===end){status('Escolha a ponta CAD que permanece acima do eixo para preservar.',true);return}
  const cut=F.trimAtIntersection(doc.geometry,focused,end,axis,region,hidden);
  if(!cut.ok){status(cut.reason,true);return}
  capture();const e=F.entityFor(doc.geometry,focused);e.a=cut.newA;e.b=cut.newB;
  editCount++;built=false;log.push('Linha '+focused+' cortada na conexão com '+cut.target);
  tool='pick';render();status(log[log.length-1]+'. Desfazer recupera a linha.');
 };
 $('#wBreak').onclick=()=>{
  if(!focused)return;
  const cut=F.splitAtIntersections(doc.geometry,focused,axis,region,hidden);
  if(!cut.ok){status(cut.reason,true);return}
  capture();const id=focused,wasSelected=chosen.has(id);
  const result=F.applySplit(doc.geometry,id,cut.sections,'W_EDIT_'+(editCount+1));
  if(!result.ok){undo.pop();status('Não foi possível dividir a linha.',true);return}
  chosen.delete(id);
  const valid=new Set(allSegments().map(s=>s.uid));
  if(wasSelected)for(const uid of result.added)if(valid.has(uid))chosen.add(uid);
  editCount++;built=false;focused=null;tool='pick';
  log.push('Linha '+id+' dividida em '+result.added.length+' trechos');render();
  status(log[log.length-1]+'. Clique nos trechos que deseja desmarcar.');
 };
$('#wDeleteSelected').onclick=()=>{
 const selected=allSegments().find(s=>s.uid===focused);if(!selected)return;
 capture();const id=focused;hidden.add(id);chosen.delete(id);
 editCount++;built=false;focused=null;activeRepair=null;tool='pick';
 log.push('Trecho '+id+' excluído da cópia de trabalho');render();
 status(log[log.length-1]+'. Use Desfazer para recuperar.');
};
$('#wClear').onclick=()=>{if(!chosen.size)return;capture();chosen.clear();built=false;focused=null;render()};
$('#wUndo').onclick=()=>{const u=undo.pop();if(!u)return;doc=u.doc;chosen=new Set(u.chosen);hidden=new Set(u.hidden||[]);built=u.built;editCount=u.editCount;log=u.log;repairMarks=u.repairMarks||[];tool='pick';focused=null;activeRepair=null;render();status('Operação desfeita.')};
$('#wSuggest').onclick=()=>{
 if(!doc||!Number.isFinite(axis))return;
 const hint=E.autoSelect(doc,region,axis,hidden),valid=new Set(allSegments().map(s=>s.uid));
 capture();chosen=new Set(hint.externo.filter(id=>valid.has(id)));built=false;render();
 status('Proposta de '+chosen.size+' trechos. Clique para conferir/arcos, antes de construir. A cadeia não foi validada automaticamente.');
};
$('#wBuild').onclick=()=>{
 const g=graph();
 if(!g.ok){
  renderDiagnostic();status('Ainda não existe uma cadeia única: '+g.components+' grupos, '+g.branches.length+
   ' bifurcações, '+g.crossings.length+' cruzamentos e '+g.tips.length+' pontas. Use Localizar e Prévia nas correções.',true);return;
 }
 capture();built=true;activeRepair=null;render();
 status('Perímetro isolado em '+g.ordered.length+' trechos (incluindo arcos). É um rascunho geométrico, NÃO um perfil CNC liberado.');
};
$('#wRefs').onchange=renderCanvas;
$('#wZoom').oninput=function(){zoom=Number(this.value)/100;$('#wZoomValue').value=this.value+'%';renderCanvas()};
$('#wAutoSafe').onclick=()=>{
 const ops=G.proposal(graph()).filter(x=>x.safe);
 if(!ops.length){status('Não há folgas curtas inequívocas para corrigir automaticamente.');return}
 if(!root.confirm('Coincidir '+ops.length+' par(es) de extremidades em até 0,20 mm? O ajuste será registrado e poderá ser desfeito.'))return;
 capture();let done=0;
 for(const op of ops){if(G.apply(doc.geometry,op).ok){done++;repairMarks.push({before:op.before.slice(),point:op.point.slice(),uid:op.uid});log.push(op.label+' em '+op.uid)}}
 if(!done){undo.pop();status('Nenhum ajuste aplicável; selecione linhas LINE nativas.',true);return}
 editCount+=done;built=false;render();
 status(done+' união(ões) aplicada(s), destacadas no diagnóstico. Desfazer recupera as cotas originais.');
};
$('#wCanvas').addEventListener('pointerdown',e=>{
 if(!selectingRegion||step!==1||e.button!==0)return;
 const svg=$('#wCanvas svg');if(!svg)return;
 dragStart=svgPointer(e,svg);$('#wCanvas').setPointerCapture(e.pointerId);e.preventDefault();
});
$('#wCanvas').addEventListener('pointerup',e=>{
 if(step===2){const svg=$('#wCanvas svg');if(svg)preciseClick={point:svgPointer(e,svg),x:e.clientX,y:e.clientY,time:e.timeStamp};}
 if(!dragStart||step!==1)return;
 const svg=$('#wCanvas svg'),stop=svgPointer(e,svg),start=dragStart;dragStart=null;selectingRegion=false;
 const bounds=DX.bounds(original.geometry),a=cadFromScreen(start,bounds),b=cadFromScreen(stop,bounds),
 r={x1:Math.min(a[0],b[0]),y1:Math.min(a[1],b[1]),x2:Math.max(a[0],b[0]),y2:Math.max(a[1],b[1])};
 if(!validRect(r)){status('Retângulo menor que 1 mm. Selecione uma vista maior.',true);return}
 setRegion(r,axis,'manual');renderViews();status('Região escolhida. Confira/ajuste o eixo Y antes de continuar.');
});
$('#wCanvas').addEventListener('pointercancel',()=>{dragStart=null;selectingRegion=false});
$('#wCanvas').addEventListener('click',e=>{
 if(step!==2||!doc)return;
 const path=e.target.closest('[data-cad-segment],[data-cad-hit]');
 if(!path)return;
 const targetId=path.getAttribute('data-cad-segment')||path.getAttribute('data-cad-hit'),
  parts=allSegments(),svg=$('#wCanvas svg'),point=e.isTrusted&&preciseClick&&e.timeStamp-preciseClick.time<1000&&
   Math.hypot(e.clientX-preciseClick.x,e.clientY-preciseClick.y)<2?preciseClick.point:svgPointer(e,svg),
  segment=E.nearestSegment(parts,point,region,face,targetId)||parts.find(s=>s.uid===targetId),
  uid=segment&&segment.uid;
 preciseClick=null;
 if(!segment){status('Elemento fora do semiperfil superior ou sem extremidades válidas. Mude a vista/eixo.',true);return}
 activeRepair=null;
 if(['extend','trim'].includes(tool)){
  if(segment.kind!=='line'){status('Extender modifica somente LINE. Arcos devem permanecer nativos.',true);return}
  focused=uid;
  const p=point,to=E.viewTransform(region,face),
   a=to(segment.start),b=to(segment.end);
  $('#wExtEnd').value=GDist(a,p)<=GDist(b,p)?'ini':'fim';
 }else{
  capture();if(chosen.has(uid))chosen.delete(uid);else chosen.add(uid);
  built=false;focused=uid;
 }
 render();
});
$('#wSave').onclick=()=>{
 if(!doc)return;
 const nm=$('#wName').value.trim();
 if(!nm){status('Informe o nome do desenho.',true);return}
 if(!$('#wReviewed').checked){status('Marque a confirmação de revisão e de bloqueio CNC.',true);return}
 const draft={schema:'cnc-dxf-wizard-2.21',nome:nm,data:new Date().toISOString(),fileName,
  sourceDoc:original,doc,region,axis,face,length:$('#wLength').value,
  selected:[...chosen],deleted:[...hidden],built,editCount,log,repairMarks,review:review()};
 try{localStorage.setItem(KEY,JSON.stringify(draft));status('Rascunho '+nm+' salvo neste navegador. CNC continua bloqueado.')}
 catch(e){status('O navegador não possui espaço para este DXF. Use Exportar cópia JSON.',true)}
};
$('#wExport').onclick=()=>{
 if(!doc)return;
 const draft={schema:'cnc-dxf-wizard-2.21',nome:$('#wName').value||name,sourceDoc:original,doc,region,axis,face,length:$('#wLength').value,selected:[...chosen],deleted:[...hidden],built,editCount,log,repairMarks,review:review()};
 const blob=new Blob([JSON.stringify(draft)],{type:'application/json'}),url=URL.createObjectURL(blob),
 a=document.createElement('a');a.href=url;a.download='cnc-dxf-'+(draft.nome.replace(/[^a-z0-9-]+/gi,'_'))+'.json';
 a.click();URL.revokeObjectURL(url);status('Cópia JSON exportada; não é programa CNC.');
};
$('#wRestoreDraft').onclick=()=>{
 try{
  const d=JSON.parse(localStorage.getItem(KEY)||'null');
  if(!d||d.schema!=='cnc-dxf-wizard-2.21'){status('Nenhum rascunho experimental salvo.',true);return}
  original=d.sourceDoc;doc=d.doc;region=d.region;axis=d.axis;face=d.face;fileName=d.fileName||'rascunho.dxf';
  hidden=new Set(d.deleted||[]);chosen=new Set((d.selected||[]).filter(id=>!hidden.has(id)));built=!!d.built;editCount=d.editCount||0;log=d.log||[];repairMarks=d.repairMarks||[];
  $('#wName').value=d.nome;$('#wAxis').value=axis;$('#wFace').value=face;
  $('#wLength').value=d.length||'';viewName='manual';undo=[];renderViews();step=2;render();
  status('Rascunho reaberto para revisão na etapa 2.');
 }catch(e){status('Falha ao reabrir rascunho.',true)}
};
root.CNCDXFWizard={getState:()=>({doc,region,axis,face,chosen:[...chosen],deleted:[...hidden],step,built,log:log.slice()})};
// O painel sticky deve caber na área de main abaixo do cabeçalho, inclusive
// ao redimensionar ou usar zoom do navegador. Em telas pequenas a página rola.
function resizePanels(){
 const main=$('main'),style=getComputedStyle(main);
 const desktop=window.matchMedia('(min-width:961px)').matches;
 const height=desktop?main.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom):window.innerHeight-120;
 $('#view-desenho').style.setProperty('--w-panel-height',Math.max(240,height)+'px');
}
const panelObserver=new ResizeObserver(resizePanels);panelObserver.observe($('main'));
window.addEventListener('resize',resizePanels);resizePanels();
})(window);
