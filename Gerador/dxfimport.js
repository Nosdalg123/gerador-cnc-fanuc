/* Fluxo CAD DXF: a fonte CAD permanece original; o perfil CNC só nasce da seleção
   confirmada de entidades geometricamente representáveis. Sem exportar curvas omitidas. */
(function(root){
'use strict';
const $=q=>document.querySelector(q),DX=root.CNCDXF,P=root.CNCDXFPerfil;
let doc=null,rect=null,axis=NaN,suggest=null,active=false,start=null,zoom=1,fileName='',selected={externo:new Set(),interno:new Set()};
const KEY='cnc_dxf_rascunhos_v1';
const val=id=>$(id).value;
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
const status=(s,bad)=>{$('#dxfStatus').textContent=s;$('#dxfStatus').style.color=bad?'#b23927':''};
const checked=()=>$('#dxfChecked').checked;
function resetConfirm(){$('#dxfChecked').checked=false;$('#dxfSaveCNC').disabled=true;$('#dxfSaved').textContent=''}
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
 const b=DX.bounds(doc.geometry),host=$('#dxfSource');host.innerHTML=P.svg(doc,null);
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
function dimsForRect(){return doc&&rect?DX.nativeCotas(doc.dimensions,rect):[]}
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
 return P.analyze(doc,rect,a,val('#dxfFace'),selected[mode]);
}
function renderProjection(){
 if(!doc)return;
 let host=$('#dxfProjected');
 let all=new Set([...selected.externo,...selected.interno]),a=Number(val('#dxfAxis')),none=val('#dxfAxis')==='';
 if(none)a=NaN;
 axis=a;
 let cand=P.analyze(doc,rect,a,val('#dxfFace'),new Set()).candidate;
 host.innerHTML=P.svg(doc,rect,{axis:a,face:val('#dxfFace'),selected:all,candidate:new Set(cand.map(s=>s.uid)),dimensions:dimsForRect()});
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
 let out=issues.length?issues.map((t,k)=>(k+1)+'. '+t).join('\n'):'Perfil selecionado sem advertências topológicas básicas. Conferir todos os detalhes, furos e fixação.';
 warn.textContent=out;warn.style.whiteSpace='pre-line';
 $('#dxfSaveCNC').disabled=!(checked()&&!issues.length&&e.canExport&&(!i.selected.length||i.canExport)&&doc.units===4);
}
function view(rectangle){
 rect=rectangle;selected.externo.clear();selected.interno.clear();resetConfirm();renderSource();renderMeasures();renderProjection();
}
function suggestView(){
 if(!doc)return;
 suggest=P.sectionSuggestion(doc);
 if(suggest){
  view(suggest.rect);if(!val('#dxfAxis'))$('#dxfAxis').value=suggest.axis.toFixed(5);
  renderProjection();
  status('Vista lateral sugerida pelas circunferências concêntricas. Confira o recorte e defina a face Z0.');
 }else status('Não encontrei vista lateral com confiança. Use Delimitar outra vista e indique o eixo manualmente.',true);
}
$('#dxfFile').onchange=async function(){
 let f=this.files[0];if(!f)return;
 if(!/\.dxf$/i.test(f.name)){status('Selecione DXF ASCII, não DWG/PDF.',true);return}
 if(f.size>25e6){status('DXF acima de 25 MB. Simplifique ou exporte só a vista de torneamento.',true);return}
 try{
  let bytes=await f.arrayBuffer(),text=new TextDecoder('windows-1252').decode(bytes);
  doc=DX.read(text);fileName=f.name;rect=null;suggest=null;axis=NaN;zoom=1;active=false;
  $('#dxfNome').value=f.name.replace(/\.dxf$/i,'');$('#dxfLength').value='';$('#dxfAxis').value='';$('#dxfFace').value='';
  selected.externo.clear();selected.interno.clear();$('#dxfSourceZoom').value=100;resetConfirm();
  ['#dxfSuggest','#dxfSelect','#dxfAll','#dxfAuto','#dxfClear'].forEach(q=>$(q).disabled=false);
  renderSource();renderMeasures();
  suggestView();
  status('DXF CAD carregado: '+doc.geometry.length+' entidades e '+doc.dimensions.length+' cotas nativas. Selecione/ajuste a vista, analise as curvas e confirme o perfil.');
 }catch(e){doc=null;status('Falha ao importar DXF: '+String(e.message||e),true)}
};
$('#dxfSuggest').onclick=suggestView;
$('#dxfSelect').onclick=function(){active=true;status('Arraste um retângulo sobre a vista lateral para delimitar o perfil e suas cotas.');};
$('#dxfAll').onclick=function(){if(doc){view(null);status('Folha inteira. Delimite a vista de torneamento para análise.')}};
$('#dxfSourceZoom').oninput=function(){zoom=Number(this.value)/100;renderSource()};
let source=$('#dxfSource');
source.addEventListener('pointerdown',function(e){
 if(!doc||!active)return;let svg=source.querySelector('svg');if(!svg)return;
 start=drawingPoint(viewPoint(e,svg),DX.bounds(doc.geometry));source.setPointerCapture(e.pointerId);e.preventDefault();
});
source.addEventListener('pointerup',function(e){
 if(!start)return;
 let svg=source.querySelector('svg'),p=drawingPoint(viewPoint(e,svg),DX.bounds(doc.geometry));
 let next={x1:Math.min(start[0],p[0]),y1:Math.min(start[1],p[1]),x2:Math.max(start[0],p[0]),y2:Math.max(start[1],p[1])};
 start=null;active=false;
 if(next.x2-next.x1<4||next.y2-next.y1<4){status('Retângulo pequeno; inclua a vista toda.',true);return}
 view(next);status('Vista selecionada: '+fmt(next.x2-next.x1)+' × '+fmt(next.y2-next.y1)+' mm no CAD.');
});
source.addEventListener('pointercancel',()=>{start=null});
$('#dxfProjected').addEventListener('click',function(e){
 const target=e.target.closest('[data-cad-segment]');if(!target)return;
 const id=target.getAttribute('data-cad-segment');
 let mode=document.querySelector('input[name=dxfAssign]:checked')?.value||'externo';
 if(mode==='remover'){selected.externo.delete(id);selected.interno.delete(id)}
 else{let other=mode==='externo'?'interno':'externo';selected[other].delete(id);if(selected[mode].has(id))selected[mode].delete(id);else selected[mode].add(id)}
 resetConfirm();renderProjection();
});
$('#dxfAxis').oninput=function(){resetConfirm();renderProjection()};
$('#dxfFace').onchange=function(){resetConfirm();renderProjection()};
$('#dxfLength').oninput=resetConfirm;
$('#dxfNome').oninput=resetConfirm;
$('#dxfChecked').onchange=renderProjection;
$('#dxfAuto').onclick=function(){
 if(!doc||!rect){status('Selecione a vista primeiro.',true);return}
 const a=Number(val('#dxfAxis'));if(!Number.isFinite(a)||val('#dxfAxis')===''){status('Indique o eixo X0 no CAD.',true);return}
 const all=P.segments(doc.geometry,rect).filter(s=>P.above(s,a));
 const c=P.connectivity(all);selected.externo.clear();selected.interno.clear();
 // Apenas a maior cadeia. O CAD real pode conter interseções; toda ramificação fica avisada.
 (c.chain||[]).forEach(id=>selected.externo.add(id));
 resetConfirm();renderProjection();
 status('Cadeia de '+selected.externo.size+' segmentos sugerida. Revise cada arco, degrau, furo e ligação marcada em laranja antes de exportar.');
};
$('#dxfClear').onclick=function(){selected.externo.clear();selected.interno.clear();resetConfirm();renderProjection()};
$('#dxfSaveDraft').onclick=function(){
 if(!doc){status('Selecione um DXF antes de salvar.',true);return}
 let nome=val('#dxfNome').trim();if(!nome){status('Informe o nome do rascunho.',true);return}
 let draft={nome,data:new Date().toLocaleString('pt-BR'),fileName,doc,rect,axis:val('#dxfAxis'),
  face:val('#dxfFace'),length:val('#dxfLength'),externo:[...selected.externo],interno:[...selected.interno]};
 try{
  let ls=draftList();ls.unshift(draft);localStorage.setItem(KEY,JSON.stringify(ls.slice(0,8)));refreshDrafts();
  $('#dxfSaved').textContent='Rascunho "'+nome+'" salvo localmente, sem liberar CNC.';
  status('Rascunho salvo. A face Z0 pode permanecer indefinida até a preparação da máquina.');
 }catch(e){status('Falha no armazenamento local; espaço esgotado ou indisponível.',true)}
};
$('#dxfOpenDraft').onclick=function(){
 let id=Number(val('#dxfDraftList')),entry=draftList()[id];if(!entry)return;
 doc=entry.doc;rect=entry.rect;fileName=entry.fileName;zoom=1;
 $('#dxfNome').value=entry.nome;$('#dxfAxis').value=entry.axis||'';
 $('#dxfFace').value=entry.face||'';$('#dxfLength').value=entry.length||'';
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
 if(!e||!checked()||!e.canExport||!Number.isFinite(length)||length<=0||doc.units!==4||!['esquerda','direita'].includes(face)){
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
  cadOrigem:{arquivo:fileName,unidade:doc.unitName,faceZ0:face,eixoCAD:axis,verificado:false,incompleto:true}});
 if(!ok){status('O editor não aceitou a transferência de rascunho.',true);return}
 $('#dxfPanel').hidden=true;$('#pdfManual').hidden=false;
 alert('Rascunho aberto no editor manual. Revise raios, roscas, cavidades e descontinuidades antes de salvar no Gerador.');
};
$('#dxfModo').onclick=function(){$('#dxfPanel').hidden=false;$('#pdfPanel').hidden=true;$('#pdfManual').hidden=true;refreshDrafts()};
$('#dxfVoltar').onclick=function(){$('#dxfPanel').hidden=true;$('#pdfManual').hidden=false};
refreshDrafts();
root.CNCDXFImport={getModel:()=>doc,getRegion:()=>rect,getSelected:()=>selected};
})(window);
