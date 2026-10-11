/* Fluxo CAD DXF: a fonte CAD permanece original; o perfil CNC só nasce da seleção
   confirmada de entidades geometricamente representáveis. Sem exportar curvas omitidas. */
(function(root){
'use strict';
const $=q=>document.querySelector(q),DX=root.CNCDXF,P=root.CNCDXFPerfil,E=root.CNCDXFEdicao;
let doc=null,sourceDoc=null,rect=null,axis=NaN,suggest=null,active=false,start=null,zoom=1,fileName='',
 selected={externo:new Set(),interno:new Set()},chainInfo=null,hidden=new Set(),undo=[],pendingExtension=null,
 editCount=0,dragRect=null,projDrag=null,skipProjectedClick=false;
const KEY='cnc_dxf_rascunhos_v1';
const val=id=>$(id).value;
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
const status=(s,bad)=>{$('#dxfStatus').textContent=s;$('#dxfStatus').style.color=bad?'#b23927':''};
const checked=()=>$('#dxfChecked').checked;
const clone=obj=>JSON.parse(JSON.stringify(obj));
const mode=()=>document.querySelector('input[name=dxfAssign]:checked')?.value||'externo';
function resetConfirm(){$('#dxfChecked').checked=false;$('#dxfSaveCNC').disabled=true;$('#dxfSaved').textContent=''}
function remember(){
 if(!doc)return;
 undo.push({doc:clone(doc),hidden:[...hidden],externo:[...selected.externo],interno:[...selected.interno],editCount});
 if(undo.length>25)undo.shift();$('#dxfUndo').disabled=false;
}
function markEdited(){editCount++;resetConfirm();renderProjection()}
function removeLine(id){
 if(hidden.has(id))return;
 remember();hidden.add(id);selected.externo.delete(id);selected.interno.delete(id);
 if(pendingExtension===id)pendingExtension=null;
 markEdited();
}
function updateZ0(face){
 $('#dxfFace').value=face;
 for(const [name,f] of [['dxfZ0Left','esquerda'],['dxfZ0Right','direita'],['dxfZ0Pending','']])
  $('#'+name).setAttribute('aria-pressed',String(f===face));
 $('#dxfZ0Hint').textContent=face?'Z0 na face '+face+' (confirmar na preparação e simulação).':
  'Z0 pendente — permitido salvar rascunho, CNC bloqueado.';
 resetConfirm();renderProjection();
}
function draftList(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){return []}}
function refreshDrafts(){
 let ls=draftList(),s=$('#dxfDraftList');s.replaceChildren();
 ls.forEach((d,i)=>{let o=document.createElement('option');o.value=String(i);o.textContent=d.nome+' · '+(d.data||'');s.appendChild(o)});
 if(!ls.length){let o=document.createElement('option');o.value='';o.textContent='(nenhum rascunho)';s.appendChild(o)}
}
function viewPoint(evt,svg){
 const bounds=svg.getBoundingClientRect();
 const vb=svg.viewBox.baseVal;
 return {x:vb.x+(evt.clientX-bounds.left)*vb.width/Math.max(1,bounds.width),y:vb.y+(evt.clientY-bounds.top)*vb.height/Math.max(1,bounds.height)};
}
function drawingPoint(pt,b){
 const scale=Math.min(840/Math.max(1,b.width),420/Math.max(1,b.height));
 return [(pt.x-30)/scale+b.x1,(480-30-pt.y)/scale+b.y1];
}
function screenPt(pt,b){
 const scale=Math.min(840/Math.max(1,b.width),420/Math.max(1,b.height));
 return [30+(pt[0]-b.x1)*scale,480-30-(pt[1]-b.y1)*scale];
}
function renderSource(){
 if(!doc)return;
 const base=sourceDoc||doc,b=DX.bounds(base.geometry),host=$('#dxfSource');host.innerHTML=P.svg(base,null);
 let svg=host.querySelector('svg');svg.style.width=zoom*100+'%';svg.style.maxWidth='none';
 if(rect&&b){
  let a=screenPt([rect.x1,rect.y1],b),c=screenPt([rect.x2,rect.y2],b);
  let box=document.createElementNS('http://www.w3.org/2000/svg','rect');
  box.setAttribute('x',Math.min(a[0],c[0]));box.setAttribute('y',Math.min(a[1],c[1]));
  box.setAttribute('width',Math.abs(a[0]-c[0]));box.setAttribute('height',Math.abs(a[1]-c[1]));
  box.setAttribute('fill','#2782db');box.setAttribute('fill-opacity','.10');
  box.setAttribute('stroke','#e07818');box.setAttribute('stroke-width','2.2');box.setAttribute('stroke-dasharray','7 4');box.style.pointerEvents='none';
  svg.appendChild(box);
 }
}
function dimsForRect(){return sourceDoc&&rect?DX.nativeCotas(sourceDoc.dimensions,rect):[]}
function renderMeasures(){
 if(!doc)return;
 let dims=dimsForRect(),host=$('#dxfDimensions');host.replaceChildren();
 dims.sort((a,b)=>(a.position[0]-b.position[0]));
 dims.forEach(d=>{
   let el=document.createElement('span');
   let p=(d.text||'').replace(/%%c/gi,'Ø').replace('<>',d.measure===null?'?':fmt(d.measure));
   if(d.kind===4&&p[0]!=='R')p='R'+p;
   if(d.kind===5&&p[0]!=='Ø')p='Ø'+p;
   if(d.kind===2)p='Ângulo CAD (conferir lado e suplemento): '+p;
   el.textContent=p==='<'+'>'?'Medida não resolvida':p;
   el.title='DIMENSION nativa; tipo '+d.kind+'; '+(d.measure===null?'medição indisponível':fmt(d.measure)+' mm');
   host.appendChild(el);
 });
 if(!dims.length)host.textContent='Nenhuma DIMENSION nesta seleção. Confira linhas de cota ou amplie a vista.';
 let annotations=DX.annotations(doc.entities,rect,26),notes=$('#dxfAnnotations');
 notes.replaceChildren();
 annotations.filter(q=>q.text&&/\b(?:M\s*\d+|ROSCA|FURO|PASSO|PROFUND|CANTO|RAIO|THREAD)\b/i.test(q.text))
  .slice(0,25).forEach(q=>{let el=document.createElement('span');el.textContent='Nota CAD: '+q.text.slice(0,90);notes.appendChild(el)});
 if(!notes.childNodes.length)notes.textContent='Nenhuma chamada textual de operação encontrada nesta vista.';
 const s=$('#dxfMetrics');
 const geo=rect?DX.cut(doc.geometry,rect):doc.geometry;
 let types={};geo.forEach(e=>types[e.type]=(types[e.type]||0)+1);
 s.textContent='Unidades: '+doc.unitName+' · '+geo.length+' entidades geométricas nesta vista · '+dims.length+
  ' cotas nativas · '+Object.entries(types).map(([k,n])=>k+': '+n).join(' · ')+
  ' · Tipos ignorados/auxiliares no DXF: '+Object.entries(doc.unsupported).map(([k,n])=>k+': '+n).join(', ');
 let best=dims.filter(d=>d.measure>0&&d.kind===0&&!d.diameter&&Math.abs(Math.sin(d.angle*Math.PI/180))<.2).sort((a,b)=>b.measure-a.measure)[0];
 if(best&&!val('#dxfLength'))$('#dxfLength').value=Number(best.measure.toFixed(3));
}
function analyse(mode){
 if(!doc||!rect)return null;
 let a=Number(val('#dxfAxis'));
 if(val('#dxfAxis')==='')a=NaN;
 return P.analyze(doc,rect,a,val('#dxfFace'),selected[mode],hidden);
}
function drawChains(){
 const host=$('#dxfChains');host.replaceChildren();chainInfo=null;
 if(!doc||!rect||val('#dxfAxis')===''){host.textContent='Selecione a vista e indique o eixo X0 para encontrar as cadeias.';return}
 const y=Number(val('#dxfAxis'));if(!Number.isFinite(y))return;
 const seg=P.segments(doc.geometry,rect,hidden).filter(s=>P.above(s,y));
 chainInfo=root.CNCDXFCadeias.build(seg,{axis:y,tol:0.16});
 const info=document.createElement('p');info.className='note';
 info.textContent=chainInfo.chains.length+' cadeias · '+chainInfo.bifurcations.length+' bifurcações · '+chainInfo.tips.length+' pontas abertas.';
 host.appendChild(info);
 chainInfo.chains.slice(0,32).forEach((c,i)=>{
  const b=document.createElement('button');b.type='button';b.className='btn sm';
  b.textContent=(i+1)+'. '+c.count+' elementos · '+fmt(c.spanX)+' mm Z · '+c.arcCount+' arcos'+(c.branchEnd?' · bifurcação':'');
  if(c.ids.every(id=>selected.externo.has(id)||selected.interno.has(id)))b.classList.add('chosen');
  b.onclick=function(){
   const mode=document.querySelector('input[name=dxfAssign]:checked')?.value||'externo';
   c.ids.forEach(id=>{
    selected.externo.delete(id);selected.interno.delete(id);
    if(mode!=='remover')selected[mode].add(id);
   });
   resetConfirm();renderProjection();
   status('Cadeia '+(i+1)+' marcada como '+mode+'. Confira o perfil completo antes de salvar.');
  };
  host.appendChild(b);
 });
 if(chainInfo.chains.length>32){const p=document.createElement('p');p.className='note';p.textContent='Outras cadeias estão disponíveis por clique nas linhas.';host.appendChild(p)}
}
function renderProjection(){
 if(!doc)return;
 let host=$('#dxfProjected');
 let all=new Set([...selected.externo,...selected.interno]),a=Number(val('#dxfAxis')),none=val('#dxfAxis')==='';
 if(none)a=NaN;
 axis=a;
 let cand=P.analyze(doc,rect,a,val('#dxfFace'),new Set(),hidden).candidate;
 host.innerHTML=P.svg(doc,rect,{axis:a,face:val('#dxfFace'),selected:all,hidden,candidate:new Set(cand.map(s=>s.uid)),dimensions:dimsForRect()});
 drawChains();
 const e=analyse('externo'),i=analyse('interno'),warn=$('#dxfWarnings');
 if(!e){warn.textContent='Selecione a seção longitudinal do DXF. A geometria original é exibida sem conversão inventada.';$('#dxfSaveCNC').disabled=true;return}
 const issues=e.alerts.concat(i.selected.length?i.alerts.filter(t=>!t.includes('Nenhuma entidade')):[]);
 const src=DX.cut(doc.geometry,rect),special=src.filter(q=>q.type==='SPLINE'||q.type==='ELLIPSE');
 const notes=DX.annotations(doc.entities,rect,26).filter(q=>/\b(?:M\s*\d+|ROSCA|FURO|THREAD)\b/i.test(q.text||''));
 const dimNotes=dimsForRect().filter(d=>/^[Mm]\s*\d+/.test(String(d.text||'')));
 if(notes.length||dimNotes.length)issues.push('Roscas/furos CAD identificados em '+(notes.length+dimNotes.length)+' anotações; confirme operações e perfis na revisão manual.');
 if(special.length)issues.push(special.length+' entidades curvas não circulares: revise o perfil e o raio real.');
 if(src.some(q=>q.type==='ARC')&&!e.selected.some(s=>s.kind==='arc')&&!i.selected.some(s=>s.kind==='arc'))
   issues.push('A vista contém arcos que não foram associados ao perfil CNC.');
 const more=root.CNCDXFAuditoria.check({
  doc,axis:a,face:val('#dxfFace'),length:val('#dxfLength'),external:e,internal:i,
  nativeDimensions:dimsForRect(),candidateSegments:cand,
  unsupportedCurves:special.length,threadNotes:notes.length+dimNotes.length
 });
 more.problems.forEach(problem=>{if(!issues.includes(problem))issues.push(problem)});
  let out=issues.length?issues.map((t,k)=>(k+1)+'. '+t).join('\n'):'Perfil selecionado sem advertências topológicas básicas. Conferir todos os detalhes, furos e fixação.';
 warn.textContent=out;warn.style.whiteSpace='pre-line';
 if(hidden.size||editCount)issues.push('CAD editado na cópia de trabalho ('+hidden.size+' linhas ocultadas, '+editCount+' edições). Revise e confirme no editor manual antes de gerar CNC.');
 warn.textContent=issues.length?issues.map((t,k)=>(k+1)+'. '+t).join('\n'):'Perfil sem pendências topológicas detectadas; ainda requer validação da preparação.';
 $('#dxfSaveCNC').disabled=!(checked()&&!issues.length&&e.canExport&&(!i.selected.length||i.canExport)&&doc.units===4);
}
function autoRecognize(){
 if(!doc||!rect||val('#dxfAxis')==='')return;
 const result=E.autoSelect(doc,rect,Number(val('#dxfAxis')));
 selected.externo=new Set(result.externo);selected.interno=new Set(result.interno);
 resetConfirm();renderProjection();
 status(result.reason+(result.chains?' · '+result.chains.bifurcations.length+' bifurcações identificadas.':''));
}
function view(rectangle){
 rect=rectangle;selected.externo.clear();selected.interno.clear();chainInfo=null;
 active=false;start=null;pendingExtension=null;resetConfirm();renderSource();renderMeasures();renderProjection();
 if(rect&&val('#dxfAxis')!=='')autoRecognize();
}
function suggestView(){
 if(!doc)return;
 suggest=P.sectionSuggestion(doc);
 if(suggest){
  if(!val('#dxfAxis'))$('#dxfAxis').value=suggest.axis.toFixed(5);
  view(suggest.rect);
  status('Vista lateral sugerida pelas circunferências concêntricas. Confira o recorte e defina a face Z0.');
 }else status('Não encontrei vista lateral com confiança. Use Delimitar outra vista e indique o eixo manualmente.',true);
}
$('#dxfFile').onchange=async function(){
 let f=this.files[0];if(!f)return;
 if(!/\.dxf$/i.test(f.name)){status('Selecione DXF ASCII, não DWG/PDF.',true);return}
 if(f.size>25e6){status('DXF acima de 25 MB. Simplifique ou exporte só a vista de torneamento.',true);return}
 try{
  status('Lendo arquivo CAD '+f.name+'... aguarde a reconstrução das entidades vetoriais.');
  await new Promise(resolve=>root.requestAnimationFrame?root.requestAnimationFrame(()=>resolve()):resolve());
  let bytes=await f.arrayBuffer(),text=new TextDecoder('windows-1252').decode(bytes);
  status('Analisando entidades CAD, cotas e vistas do arquivo...');
  await new Promise(resolve=>root.requestAnimationFrame?root.requestAnimationFrame(()=>resolve()):resolve());
  doc=DX.read(text);sourceDoc=clone(doc);fileName=f.name;rect=null;suggest=null;axis=NaN;zoom=1;active=false;
  hidden.clear();undo=[];editCount=0;pendingExtension=null;$('#dxfUndo').disabled=true;$('#dxfRestore').disabled=false;
  $('#dxfNome').value=f.name.replace(/\.dxf$/i,'');$('#dxfLength').value='';$('#dxfAxis').value='';$('#dxfFace').value='';
  selected.externo.clear();selected.interno.clear();chainInfo=null;$('#dxfSourceZoom').value=100;resetConfirm();
  updateZ0('');
  ['#dxfSuggest','#dxfSelect','#dxfAll','#dxfAuto','#dxfClear'].forEach(q=>$(q).disabled=false);
  renderSource();renderMeasures();
  suggestView();
  status('DXF CAD carregado: '+doc.geometry.length+' entidades e '+doc.dimensions.length+' cotas nativas. Selecione/ajuste a vista, analise as curvas e confirme o perfil.');
 }catch(e){doc=null;status('Falha ao importar DXF: '+String(e.message||e),true)}
};
function dragOverlay(svg,from,to){
 if(!svg||!from||!to)return;
 let r=svg.querySelector('#dxfDragOverlay');
 if(!r){r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.id='dxfDragOverlay';r.setAttribute('class','dxf-drag-rect');svg.appendChild(r)}
 const box=E.rectBounds([from.x,from.y],[to.x,to.y]);
 r.setAttribute('x',box.x1);r.setAttribute('y',box.y1);
 r.setAttribute('width',box.x2-box.x1);r.setAttribute('height',box.y2-box.y1);
}
function cancelDrag(host){
 const r=host.querySelector('#dxfDragOverlay');if(r)r.remove();
 host.classList.remove('selecting','box-deleting');
}
$('#dxfSuggest').onclick=suggestView;
$('#dxfSelect').onclick=function(){
 if(!doc)return;
 active=true;source.classList.add('selecting');
 $('#dxfSelectionHint').textContent='Arraste sobre o desenho. O RETÂNGULO AZUL acompanhará o mouse; solte para selecionar a vista.';
 status('Arraste para delimitar a vista: o contorno azul fica visível durante a seleção.');
};
$('#dxfAll').onclick=function(){if(doc){view(null);status('Folha inteira. Delimite a vista de torneamento para análise.')}};
$('#dxfSourceZoom').oninput=function(){zoom=Number(this.value)/100;renderSource()};
const source=$('#dxfSource'),projected=$('#dxfProjected');
source.addEventListener('pointerdown',function(e){
 if(!sourceDoc||!active||e.button!==0)return;
 const svg=source.querySelector('svg');if(!svg)return;
 start=viewPoint(e,svg);
 dragOverlay(svg,start,start);source.setPointerCapture(e.pointerId);e.preventDefault();
});
source.addEventListener('pointermove',function(e){
 if(!start)return;
 const svg=source.querySelector('svg');if(svg)dragOverlay(svg,start,viewPoint(e,svg));
});
source.addEventListener('pointerup',function(e){
 if(!start)return;
 const svg=source.querySelector('svg');if(!svg)return;
 const pt=viewPoint(e,svg),a=start;start=null;
 cancelDrag(source);
 const b=DX.bounds(sourceDoc.geometry),first=drawingPoint(a,b),last=drawingPoint(pt,b);
 const next=E.rectBounds(first,last);
 if(next.x2-next.x1<4||next.y2-next.y1<4){
  status('Retângulo muito pequeno. Arraste uma área maior para delimitar a vista.',true);return
 }
 active=false;source.classList.remove('selecting');
 $('#dxfSelectionHint').textContent='Vista delimitada com retângulo visível. Para ajustar, use Delimitar outra vista.';
 view(next);
 status('Vista delimitada: '+fmt(next.x2-next.x1)+' × '+fmt(next.y2-next.y1)+' mm no CAD. Proposta de perfil gerada.');
});
source.addEventListener('pointercancel',()=>{start=null;cancelDrag(source)});
projected.addEventListener('pointerdown',function(e){
 if(mode()!=='quadro'||!doc||!rect||e.button!==0)return;
 const svg=projected.querySelector('svg');if(!svg)return;
 projDrag=viewPoint(e,svg);skipProjectedClick=false;
 projected.setPointerCapture(e.pointerId);projected.classList.add('box-deleting');
 dragOverlay(svg,projDrag,projDrag);e.preventDefault();
});
projected.addEventListener('pointermove',function(e){
 if(!projDrag)return;const svg=projected.querySelector('svg');
 if(svg)dragOverlay(svg,projDrag,viewPoint(e,svg));
});
projected.addEventListener('pointerup',function(e){
 if(!projDrag)return;
 const svg=projected.querySelector('svg');if(!svg)return;
 const box=E.rectBounds([projDrag.x,projDrag.y],[viewPoint(e,svg).x,viewPoint(e,svg).y]);
 projDrag=null;skipProjectedClick=true;cancelDrag(projected);
 if(box.x2-box.x1<3||box.y2-box.y1<3){status('Desenhe um retângulo maior para excluir linhas.',true);return}
 const candidates=P.segments(doc.geometry,rect,hidden);
 const ids=E.selectRectSegments(candidates,box,rect,val('#dxfFace'));
 if(!ids.length){status('Nenhuma linha atravessa o retângulo de exclusão.');return}
 remember();
 ids.forEach(id=>{hidden.add(id);selected.externo.delete(id);selected.interno.delete(id)});
 pendingExtension=null;markEdited();
 status(ids.length+' linha(s) removidas da cópia de trabalho pela seleção de retângulo. O CAD original continua preservado.');
});
projected.addEventListener('pointercancel',()=>{projDrag=null;cancelDrag(projected)});
projected.addEventListener('click',function(e){
 if(skipProjectedClick){skipProjectedClick=false;return}
 const target=e.target.closest('[data-cad-segment]');if(!target||!doc)return;
 const id=target.getAttribute('data-cad-segment'),currentMode=mode();
 const entity=rect?P.segments(doc.geometry,rect,hidden).find(t=>t.uid===id):null;
 if(entity){
  const info=P.classify(entity,axis,val('#dxfFace')||'esquerda');
  const caption=info.kind==='cil'?'Cilindro · Ø'+fmt(info.a)+' · comprimento '+fmt(info.b)+' mm':
   info.kind==='cone'?'Cone · Ø'+fmt(info.a)+' → Ø'+fmt(info.b)+' · comprimento '+fmt(info.c)+' mm':
   info.kind==='raio'?'Arco CAD R'+fmt(info.r)+' mm · exige associação ao canto no CNC':
   info.kind==='face'?'Face radial/degrau · Ø'+fmt(info.di)+' → Ø'+fmt(info.df):
   'Entidade não traduzível diretamente';
  $('#dxfEntityInfo').textContent='Entidade '+id+': '+caption+'. '+(info.reason||'');
 }
 if(currentMode==='quadro')return;
 if(currentMode==='estender'){
  pendingExtension=id;$('#dxfExtendSelected').textContent='Linha selecionada: '+id+
   (entity&&entity.type==='LINE'?' — pronta para extensão.':' — escolha entidade LINE (não curva).');
  status('Linha '+id+' selecionada para extensão. Escolha início/fim e digite o comprimento em milímetros.');return;
 }
 if(currentMode==='apagar'){removeLine(id);status('Entidade '+id+' apagada apenas do desenho de trabalho. Use Desfazer se necessário.');return}
 remember();
 if(currentMode==='remover'){selected.externo.delete(id);selected.interno.delete(id)}
 else{const other=currentMode==='externo'?'interno':'externo';
  selected[other].delete(id);
  if(selected[currentMode].has(id))selected[currentMode].delete(id);else selected[currentMode].add(id);
 }
 resetConfirm();renderProjection();
});
$('#dxfAxis').oninput=function(){resetConfirm();autoRecognize()};
$('#dxfFace').onchange=function(){updateZ0(val('#dxfFace'))};
$('#dxfZ0Left').onclick=()=>updateZ0('esquerda');
$('#dxfZ0Right').onclick=()=>updateZ0('direita');
$('#dxfZ0Pending').onclick=()=>updateZ0('');
$('#dxfLength').oninput=resetConfirm;
$('#dxfNome').oninput=resetConfirm;
$('#dxfChecked').onchange=renderProjection;
$('#dxfAuto').onclick=function(){autoRecognize()};
$('#dxfClear').onclick=function(){remember();selected.externo.clear();selected.interno.clear();resetConfirm();renderProjection()};
document.querySelectorAll('input[name=dxfAssign]').forEach(r=>r.onchange=function(){
 $('#dxfExtendControls').hidden=mode()!=='estender';
 projected.classList.toggle('box-deleting',mode()==='quadro');
});
$('#dxfExtendApply').onclick=function(){
 if(!pendingExtension){status('Clique primeiro em uma linha do contorno para estender.',true);return}
 remember();
 const result=E.extendLine(doc.geometry,pendingExtension,val('#dxfExtendEnd'),val('#dxfExtendAmount'));
 if(!result.ok){undo.pop();$('#dxfUndo').disabled=!undo.length;status(result.reason,true);return}
 markEdited();status('Linha '+pendingExtension+' estendida em '+fmt(val('#dxfExtendAmount'))+' mm. Confira a continuidade e as cotas antes de salvar.');
};
$('#dxfUndo').onclick=function(){
 const prior=undo.pop();if(!prior)return;
 doc=prior.doc;hidden=new Set(prior.hidden);selected.externo=new Set(prior.externo);selected.interno=new Set(prior.interno);
 editCount=prior.editCount;$('#dxfUndo').disabled=undo.length===0;resetConfirm();renderProjection();status('Última edição desfeita.');
};
$('#dxfRestore').onclick=function(){
 if(!sourceDoc)return;
 if(!confirm('Restaurar a geometria CAD original e apagar as extensões/exclusões feitas na cópia de trabalho?'))return;
 remember();doc=clone(sourceDoc);hidden.clear();editCount=0;pendingExtension=null;
 selected.externo.clear();selected.interno.clear();autoRecognize();
 status('Geometria original restaurada. Proposta automática refeita.');
};
$('#dxfSaveDraft').onclick=function(){
 if(!doc){status('Selecione um DXF antes de salvar.',true);return}
 let nome=val('#dxfNome').trim();if(!nome){status('Informe o nome do rascunho.',true);return}
 let draft={nome,data:new Date().toLocaleString('pt-BR'),fileName,doc,sourceDoc,rect,axis:val('#dxfAxis'),
  face:val('#dxfFace'),length:val('#dxfLength'),externo:[...selected.externo],interno:[...selected.interno],
  hidden:[...hidden],editCount};
 try{
  let ls=draftList();ls.unshift(draft);localStorage.setItem(KEY,JSON.stringify(ls.slice(0,8)));refreshDrafts();
  $('#dxfSaved').textContent='Rascunho "'+nome+'" salvo localmente, sem liberar CNC.';
  status('Rascunho salvo. A face Z0 pode permanecer indefinida até a preparação da máquina.');
 }catch(e){status('Falha no armazenamento local; espaço esgotado ou indisponível.',true)}
};
$('#dxfOpenDraft').onclick=function(){
 let id=Number(val('#dxfDraftList')),entry=draftList()[id];if(!entry)return;
 doc=entry.doc;sourceDoc=entry.sourceDoc||clone(entry.doc);rect=entry.rect;fileName=entry.fileName;zoom=1;
 hidden=new Set(entry.hidden||[]);editCount=entry.editCount||0;undo=[];pendingExtension=null;
 $('#dxfUndo').disabled=true;$('#dxfRestore').disabled=false;
 $('#dxfNome').value=entry.nome;$('#dxfAxis').value=entry.axis||'';
 $('#dxfFace').value=entry.face||'';$('#dxfLength').value=entry.length||'';
 updateZ0(entry.face||'');
 selected.externo=new Set(entry.externo||[]);selected.interno=new Set(entry.interno||[]);
 ['#dxfSuggest','#dxfSelect','#dxfAll','#dxfAuto','#dxfClear'].forEach(q=>$(q).disabled=false);
 resetConfirm();renderSource();renderMeasures();renderProjection();status('Rascunho CAD carregado. Confira todas as cotas e a fixação.');
};
function toItems(mode,ana,face){
 return ana.selected.map(q=>{
  let info=P.classify(q,axis,face);
  let pts=DX.sample(q,1),mid=(pts[0][0]+pts[pts.length-1][0])/2;
  return {mid,info};
 }).sort((a,b)=>face==='direita'?b.mid-a.mid:a.mid-b.mid).map(q=>{
   let c=q.info;if(c.kind==='cil')return {tipo:mode==='externo'?'cil':'icil',side:'1',a:c.a,b:c.b};
   if(c.kind==='cone')return {tipo:mode==='externo'?'cone':'icone',side:'1',a:c.a,b:c.b,c:c.c};
   return null;
 }).filter(Boolean);
}
$('#dxfSaveCNC').onclick=function(){
 let e=analyse('externo'),i=analyse('interno'),length=Number(val('#dxfLength')),face=val('#dxfFace');
 const cn=P.analyze(doc,rect,axis,face,new Set(),hidden).candidate;
 const aud=root.CNCDXFAuditoria.check({doc,axis,face,length,external:e,internal:i,nativeDimensions:dimsForRect(),
  candidateSegments:cn,unsupportedCurves:DX.cut(doc.geometry,rect).filter(q=>q.type==='SPLINE'||q.type==='ELLIPSE').length,
  threadNotes:DX.annotations(doc.entities,rect,26).filter(q=>/\b(?:M\s*\d+|ROSCA|FURO|THREAD)\b/i.test(q.text||'')).length});
 if(!aud.ok){status('Perfil CAD ainda incompleto: '+aud.problems.join(' · '),true);return}
 if(!e||!checked()||!e.canExport||editCount>0||hidden.size>0||(i&&i.selected.length&&!i.canExport)||!Number.isFinite(length)||length<=0||doc.units!==4||!['esquerda','direita'].includes(face)){
  status('Não é possível salvar: confirme a escala, vista, Z0, cotas e continuidade de todas as entidades.',true);return;
 }
 let items=toItems('externo',e,face).concat(i&&i.selected.length?toItems('interno',i,face):[]);
 let ext=items.filter(x=>x.tipo[0]!=='i'),sum=ext.reduce((s,q)=>s+(q.tipo==='cone'?q.c:q.b),0);
 if(Math.abs(sum-length)>.12){status('O perfil selecionado cobre '+fmt(sum)+' mm, mas a cota final indica '+fmt(length)+' mm. Corrija a seleção antes de salvar.',true);return}
 let max=Math.max(...ext.map(q=>Math.max(q.a,q.tipo==='cone'?q.b:q.a)));
 let api=root.CNCDesenhos;
 if(!api||!api.salvarPDF){status('Editor CNC não disponível.',true);return}
 let id=api.salvarPDF({nome:val('#dxfNome').trim(),lPeca:length,dRef:Math.ceil(max+4),items,
   cadOrigem:{arquivo:fileName,unidade:doc.unitName,faceZ0:face,eixoCAD:axis,verificado:true,entidadesSelecionadas:e.selected.length+(i?.selected.length||0)}});
 if(id){resetConfirm();$('#dxfSaved').textContent='Perfil enviado ao Gerador: '+val('#dxfNome');status('Perfil CNC salvo. Revise fixação, ferramentas e simulação antes de usinar.')}
};
$('#dxfEditManual').onclick=function(){
 if(!doc||!rect){status('Abra um DXF e delimite uma vista antes de editar.',true);return}
 let len=Number(val('#dxfLength')),face=val('#dxfFace');
 if(!(len>0)||!['esquerda','direita'].includes(face)){status('Informe o comprimento e escolha o Z0 provisório para transferir trechos. O rascunho CAD pode ser salvo sem Z0.',true);return}
 axis=Number(val('#dxfAxis'));if(!Number.isFinite(axis)||val('#dxfAxis')===''){status('Informe a coordenada do eixo X0.',true);return}
 let e=analyse('externo'),i=analyse('interno');
 let items=(e?toItems('externo',e,face):[]).concat(i&&i.selected.length?toItems('interno',i,face):[]);
 if(!items.length){status('Marque pelo menos uma linha de cilindro/cone. Não é possível traduzir arcos sem o canto correspondente.',true);return}
 if(!confirm('Transferir SOMENTE '+items.length+' trechos retos para o editor manual, SEM raios/roscas/entidades faltantes? Este rascunho NÃO é um perfil completo e exige revisão antes de salvar/gerar CNC.'))return;
 let max=Math.max(...items.filter(q=>q.tipo[0]!=='i').map(q=>Math.max(q.a,q.tipo==='cone'?q.b:q.a)));
 if(!Number.isFinite(max)){status('Selecione algum contorno externo.',true);return}
 let ok=root.CNCDesenhos&&root.CNCDesenhos.importarPDF({nome:val('#dxfNome')||'Rascunho DXF',lPeca:len,dRef:Math.ceil(max+4),items,
  cadOrigem:{arquivo:fileName,unidade:doc.unitName,faceZ0:face,eixoCAD:axis,verificado:false,incompleto:true,alteradoCAD:editCount>0,segmentosExcluidos:hidden.size}});
 if(!ok){status('O editor não aceitou a transferência de rascunho.',true);return}
 $('#dxfPanel').hidden=true;$('#pdfManual').hidden=false;
 alert('Rascunho aberto no editor manual. Revise raios, roscas, cavidades e descontinuidades antes de salvar no Gerador.');
};
$('#dxfModo').onclick=function(){$('#dxfPanel').hidden=false;$('#pdfPanel').hidden=true;$('#pdfManual').hidden=true;refreshDrafts()};
$('#dxfVoltar').onclick=function(){$('#dxfPanel').hidden=true;$('#pdfManual').hidden=false};
refreshDrafts();
root.CNCDXFImport={getModel:()=>doc,getOriginal:()=>sourceDoc,getRegion:()=>rect,getSelected:()=>selected,getHidden:()=>hidden};
})(window);
