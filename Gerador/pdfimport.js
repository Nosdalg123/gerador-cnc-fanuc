/* Importacao PDF assistida, selecao de vista e projecao cotada sem lista de partes.
   As cotas so viram programa CNC depois da confirmacao humana. */
(function(root){
'use strict';
var $=q=>document.querySelector(q),url=null,doc=null,fileBytes=null,page=1,totalPages=1,zoom=1,rotation=0;
var model=[],length='',picked=null,selectMode=false,down=null,viewport=null,pg=null,library=null,savedId=null,renderSeq=0,edit=null,possibleViews=[],previewZoom=1,viewKind='',faceChoice='',profileAxis='horizontal',unresolved=[];
var pdfjsUrl='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var workerUrl='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function status(t,error){$('#pdfStatus').textContent=t;$('#pdfStatus').style.color=error?'#be4936':'';}
function fmt(v){return Number(v).toLocaleString('pt-BR',{maximumFractionDigits:4})}
function valid(v){return Number.isFinite(Number(v))&&Number(v)>0}
function setText(id,v){$(id).textContent=v}
function invalidate(){savedId=null;$('#pdfConfirmado').checked=false;$('#pdfAbrirGerador').hidden=true;$('#pdfSaved').textContent='';renderPreview();}
function fresh(){
 model=[];length='';picked=null;selectMode=false;possibleViews=[];viewKind='';faceChoice='';profileAxis='horizontal';unresolved=[];
 $('#pdfViewType').value='';$('#pdfFaceChoice').value='';
 invalidate();drawSelection();
}
function resetOrientation(){
 faceChoice='';$('#pdfFaceChoice').value='';invalidate();
}
function orientationStatus(){
 var target=$('#pdfOrientationStatus'),dir=viewKind==='lateral'?'vista longitudinal':'vista sem classificação';
 if(!faceChoice){
  target.textContent='Escolha a face Z0 antes de salvar. O PDF sozinho não define como a peça será fixada na placa.';
  return;
 }
 var side=faceChoice==='start'?'esquerda / superior':'direita / inferior';
 var g=root.CNCPDFOrient.inspect(model,$('#pdfProfileSide').value);
 target.textContent='Z0: '+side+' da '+dir+' · X em diâmetro, Z negativo para o fundo. '+g.note;
}
function loadPdfjs(){
 if(root.pdfjsLib){library=root.pdfjsLib;return Promise.resolve(library)}
 return new Promise(function(resolve,reject){
  var s=document.createElement('script');s.src=pdfjsUrl;
  s.onload=function(){library=root.pdfjsLib;if(!library)return reject(new Error('PDF.js não carregado.'));library.GlobalWorkerOptions.workerSrc=workerUrl;resolve(library)};
  s.onerror=function(){reject(new Error('Sem acesso à biblioteca PDF.js; é possível visualizar o arquivo, mas não extrair cotas.'))};
  document.head.appendChild(s);
 });
}
function renderPreview(){
 var host=$('#pdfProfileSvg'),r=root.CNCPDFPerfil.svg(model,length,{side:$('#pdfProfileSide').value});
 if(r.ok){
  host.innerHTML=r.svg;
  var graph=host.querySelector('svg');if(graph){graph.style.width=(previewZoom*100)+'%';graph.style.maxWidth='none';}
  $('#pdfProfileMsg').textContent=(r.warnings.length?r.warnings.join(' · ')+' · ':'')+'Clique em uma cota azul ou sobre a peça para editar.';
  $('#pdfScaleInfo').textContent='X e Ø em proporção 1:1 · escala automática de visualização';
 }else{
  host.innerHTML='<p class="note" style="padding:18px">A projeção geométrica aparece quando a vista tem cotas suficientes. Use “Selecionar vista” ou acrescente o perfil diretamente no desenho.</p>';
  $('#pdfProfileMsg').textContent=r.errors.join(' · ');
  $('#pdfScaleInfo').textContent='Escala proporcional X = Ø';
 }
 $('#pdfComprimento').value=length;
 orientationStatus();
 $('#pdfUnresolved').textContent=unresolved.length?'Detalhes ainda não incorporados à geometria CNC: '+unresolved.join(' · ')+'. Complete esses recursos no editor de desenhos antes de salvar.':'';
 $('#pdfCompleteEditor').hidden=!r.ok;
 var canSave=!!(r.ok&&unresolved.length===0&&url&&viewKind==='lateral'&&faceChoice&&$('#pdfConfirmado').checked&&$('#pdfNome').value.trim()&&!savedId);
 $('#pdfAplicar').disabled=!canSave;
 return r;
}
function showFallback(){
 var frame=$('#pdfFrame');frame.hidden=false;frame.src=url+'#page='+page+'&view=Fit';
 $('#pdfCanvasWrap').hidden=true;
}
function showCanvas(){
 $('#pdfFrame').hidden=true;$('#pdfCanvasWrap').hidden=false;
}
function showPage(rescan){
 if(!doc)return;
 var local=++renderSeq;
 doc.getPage(page).then(async function(p){
  if(local!==renderSeq)return;
  pg=p;var stage=$('#pdfStage'),basic=p.getViewport({scale:1,rotation:rotation});
  var fit=Math.min(1.4,Math.max(.2,(stage.clientWidth-14)/basic.width))*zoom;
  viewport=p.getViewport({scale:fit,rotation:rotation});
  var canvas=$('#pdfCanvas'),context=canvas.getContext('2d',{alpha:false}),dpr=Math.min(2,root.devicePixelRatio||1);
  canvas.width=Math.round(viewport.width*dpr);canvas.height=Math.round(viewport.height*dpr);
  canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
  var wrap=$('#pdfCanvasWrap');wrap.style.width=viewport.width+'px';wrap.style.height=viewport.height+'px';
  $('#pdfSelectionOverlay').setAttribute('viewBox','0 0 '+viewport.width+' '+viewport.height);
  showCanvas();
  await p.render({canvasContext:context,viewport:viewport,transform:[dpr,0,0,dpr,0,0]}).promise;
  if(local!==renderSeq)return;
  setText('#pdfPage','Página '+page+' / '+totalPages);
  setText('#pdfTransform','Zoom '+Math.round(zoom*100)+'% · rotação '+rotation+'° · arraste para selecionar a vista');
  drawSelection();
  if(rescan)await recognizePage();
 }).catch(function(e){status('Falha ao renderizar PDF: '+(e.message||e),true);showFallback()});
}
function cropItems(items){
 if(!picked||!library||!viewport)return items;
 return items.filter(function(it){
  var p=library.Util.transform(viewport.transform,it.transform||[1,0,0,1,0,0]);
  var x=p[4]/viewport.width,y=p[5]/viewport.height;
  return x>=picked.x1&&x<=picked.x2&&y>=picked.y1&&y<=picked.y2;
 });
}
async function recognizePage(){
 if(!pg)return;
 try{
  var content=await pg.getTextContent(),items=cropItems(content.items);
  $('#pdfTexto').value=items.map(t=>t.str).join(' ');
  var typed=root.CNCPDFCotas.summary(items,profileAxis),box=$('#pdfCotas');
  unresolved=typed.all.filter(c=>['rosca','rosca_furo','raio','angulo'].indexOf(c.tipo)>=0).map(c=>c.rotulo+' ('+c.tipo+')');
  box.replaceChildren();
  typed.all.forEach(function(c){
   var chip=document.createElement('span'),small=document.createElement('small');
   chip.className='pdf-dimension';small.textContent=c.tipo+': ';
   chip.appendChild(small);chip.appendChild(document.createTextNode(c.rotulo));box.appendChild(chip);
  });
  if(viewKind==='frontal'){
   model=[];length='';invalidate();
   status('Vista frontal selecionada: adequada para conferir furos e diâmetros, mas não define o contorno longitudinal em Z. Selecione a vista lateral para reconstruir a peça.',true);
  }
  var recognized=viewKind==='lateral'&&root.CNCPDFRecon.recognize(items);
  if(typed.complex&&(!recognized||!recognized.ok))recognized={ok:false,reason:'Desenho possui múltiplos diâmetros, comprimentos, raios ou roscas: é necessária análise do contorno e conferência das cotas.'};
  var dims=recognized&&recognized.ok?recognized:null,drawn=null,vectorWarning='';
  // O total axial e o Ø máximo devem ser encontrados em UMA vista longitudinal.
  // Nunca usar qualquer número não identificado como comprimento/diâmetro.
  if(!dims&&viewKind==='lateral'&&typed.candidateLength&&typed.candidateDiameter){
   dims={externo:typed.candidateDiameter,interno:null,comprimento:typed.candidateLength,approximate:true};
  }
  if(dims&&viewKind==='lateral'&&root.CNCPDFVetorial&&library.OPS){
   try{
    var ops=await pg.getOperatorList();
    var lines=root.CNCPDFVetorial.extract(ops,library.OPS,viewport);
    var rect=picked?{x1:picked.x1*viewport.width,y1:picked.y1*viewport.height,x2:picked.x2*viewport.width,y2:picked.y2*viewport.height}:null;
    drawn=root.CNCPDFVetorial.trace(lines,dims.externo,dims.comprimento,rect);
   }catch(vectorError){vectorWarning='Não foi possível analisar as linhas vetoriais: '+vectorError.message;}
  }
  if(drawn&&drawn.ok&&drawn.items.length>=1){
   model=drawn.items;
   length=drawn.length;
   profileAxis=drawn.axis;
   if(faceChoice==='end')model=root.CNCPDFOrient.reverse(model,$('#pdfProfileSide').value);
   if(recognized.ok&&model.length===2){
    // As cotas escritas no PDF prevalecem sobre estimativas graficas.
    var ex=model.find(q=>q.tipo==='cil'),inn=model.find(q=>q.tipo==='icil');
    if(ex&&inn){ex.a=recognized.externo;inn.a=recognized.interno;ex.b=length;inn.b=length;}
   }
   invalidate();
   status('Contorno vetorial identificado ('+drawn.axis+') e projetado. '+drawn.warning+' '+vectorWarning);
  }else if(recognized.ok){
   model=[{tipo:'cil',side:'1',a:recognized.externo,b:recognized.comprimento,c:''},{tipo:'icil',side:'1',a:recognized.interno,b:recognized.comprimento,c:''}];
   length=recognized.comprimento;
   if(faceChoice==='end')model=root.CNCPDFOrient.reverse(model,'1');
   invalidate();
   status('Geometria detectada pelas cotas da vista: Ø externo '+fmt(recognized.externo)+', Ø interno '+fmt(recognized.interno)+', comprimento '+fmt(recognized.comprimento)+' mm. Confira a projeção.');
  }else{
   model=[];length='';invalidate();
   if(viewKind!=='frontal')status('Contorno incompleto ou incerto. Cotas identificadas: '+typed.all.length+'. Ajuste a vista e confirme manualmente a geometria no painel CNC. '+(recognized&&recognized.reason||''),true);
  }
  var views=content.items.map(function(it){return {s:String(it.str||'').toUpperCase(),transform:it.transform}})
    .filter(function(it){return /SE[CÇ][AÃ]O|CORTE |SECTION|VISTA /.test(it.s)});
  var texts=views.map(function(t){var pp=library.Util.transform(viewport.transform,t.transform),nx=pp[4]/viewport.width,ny=pp[5]/viewport.height;
    return {name:t.s.slice(0,40),kind:'',view:{x1:Math.max(0,nx-.25),y1:Math.max(0,ny-.45),x2:Math.min(1,nx+.25),y2:Math.min(1,ny+.03)}};
  });
  var shapes=[];
  if(library.OPS&&root.CNCPDFVistas){
   try{shapes=root.CNCPDFVistas.extractGroups(await pg.getOperatorList(),library.OPS,viewport);}catch(e){shapes=[];}
  }
  possibleViews=shapes.concat(texts);
  paintSuggestions();
 }catch(e){status('Não foi possível ler as cotas desta página: '+(e.message||e),true)}
}
function paintSuggestions(){
 var rootEl=$('#pdfViews');if(!rootEl)return;
 rootEl.replaceChildren();
 possibleViews.forEach(function(v,i){
  var b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent='Selecionar '+v.name;
  b.onclick=function(){picked=v.view;selectMode=false;viewKind=v.kind||'';$('#pdfViewType').value=viewKind;resetOrientation();drawSelection();recognizePage();};rootEl.appendChild(b);
 });
}
function drawSelection(temp){
 var overlay=$('#pdfSelectionOverlay');overlay.replaceChildren();if(!viewport)return;
 var v=temp||picked;if(!v){setText('#pdfViewState','Vista: página inteira');return}
 var ns='http://www.w3.org/2000/svg',rect=document.createElementNS(ns,'rect');
 rect.setAttribute('x',v.x1*viewport.width);rect.setAttribute('y',v.y1*viewport.height);
 rect.setAttribute('width',Math.max(0,(v.x2-v.x1)*viewport.width));rect.setAttribute('height',Math.max(0,(v.y2-v.y1)*viewport.height));
 overlay.appendChild(rect);setText('#pdfViewState',temp?'Arraste para delimitar a vista':'Vista selecionada: análise isolada');
}
function pointer(e){
 if(!viewport)return null;
 var bounds=$('#pdfCanvas').getBoundingClientRect();
 return {x:Math.max(0,Math.min(1,(e.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(e.clientY-bounds.top)/bounds.height))};
}
var stage=$('#pdfStage');
stage.addEventListener('pointerdown',function(e){if(!selectMode||!viewport)return;down=pointer(e);stage.setPointerCapture(e.pointerId);e.preventDefault()});
stage.addEventListener('pointermove',function(e){if(!down)return;var p=pointer(e);drawSelection({x1:Math.min(down.x,p.x),y1:Math.min(down.y,p.y),x2:Math.max(down.x,p.x),y2:Math.max(down.y,p.y)})});
stage.addEventListener('pointerup',function(e){
 if(!down)return;var p=pointer(e),v={x1:Math.min(down.x,p.x),y1:Math.min(down.y,p.y),x2:Math.max(down.x,p.x),y2:Math.max(down.y,p.y)};down=null;
 if((v.x2-v.x1)<.035||(v.y2-v.y1)<.035){status('Selecione um retângulo maior, incluindo o contorno e as cotas.',true);return}
 picked=v;selectMode=false;viewKind='';$('#pdfViewType').value='';resetOrientation();drawSelection();recognizePage();
});
stage.addEventListener('pointercancel',function(){down=null;drawSelection()});
$('#pdfSelectView').onclick=function(){selectMode=true;status('Arraste no PDF um retângulo ao redor da vista e das cotas correspondentes.');};
$('#pdfClearView').onclick=function(){picked=null;selectMode=false;viewKind='';$('#pdfViewType').value='';resetOrientation();drawSelection();recognizePage()};
$('#pdfViewType').onchange=function(){
 viewKind=this.value;resetOrientation();recognizePage();
};
$('#pdfFaceChoice').onchange=function(){
 var next=this.value,old=faceChoice;
 if(next&&next!==old&&model.length){
  if((old==='start'&&next==='end')||(old==='end'&&next==='start')||(!old&&next==='end'))
   model=root.CNCPDFOrient.reverse(model,$('#pdfProfileSide').value);
 }
 faceChoice=next;invalidate();
 status(next?'Face Z0 selecionada. Revise a geometria antes de confirmar.':'Escolha a face do desenho que estará voltada para a ferramenta.');
};
$('#pdfFile').onchange=async function(){
 var f=this.files[0];if(!f)return;
 if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf'){status('Selecione um PDF.',true);return}
 if(f.size>40*1024*1024){status('PDF acima de 40 MB. Reduza o arquivo.',true);return}
 if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);
 $('#pdfNome').value=f.name.replace(/\.pdf$/i,'');page=1;zoom=1;rotation=0;doc=null;pg=null;viewport=null;fresh();
 status('Carregando PDF e procurando geometria e cotas…');
 try{
  fileBytes=await f.arrayBuffer();var lib=await loadPdfjs();
  doc=await lib.getDocument({data:new Uint8Array(fileBytes.slice(0))}).promise;totalPages=doc.numPages;showPage(true);
 }catch(e){status(e.message||String(e),true);showFallback()}
};
$('#pdfAnterior').onclick=function(){if(doc&&page>1){page--;picked=null;fresh();showPage(true)}};
$('#pdfProxima').onclick=function(){if(doc&&page<totalPages){page++;picked=null;fresh();showPage(true)}};
$('#pdfMais').onclick=function(){zoom=Math.min(4,zoom*1.25);showPage(false)};
$('#pdfMenos').onclick=function(){zoom=Math.max(.5,zoom/1.25);showPage(false)};
$('#pdfGirar').onclick=function(){rotation=(rotation+90)%360;picked=null;fresh();showPage(true)};
$('#pdfReset').onclick=function(){zoom=1;rotation=0;picked=null;fresh();showPage(true)};
function openEditor(index,key,add){
 edit={index:index,key:key,add:add||null};
 var item=(index==null||index===-1)?{tipo:add==='int'?'icil':'cil',a:40,b:valid(length)?Number(length):30,c:'',side:$('#pdfProfileSide').value}:model[index];
 var total=index===-1;
 $('#pdfEditTitle').textContent=total?'Comprimento total da peça':add?'Acrescentar trecho ao contorno':'Editar cota / trecho';
 $('#pdfEditTipo').value=item.tipo;$('#pdfEditDiam').value=item.a;
 $('#pdfEditComp').value=total?length:item.b;$('#pdfEditFinal').value=item.c||'';
 $('#pdfEditLado').value=item.side||'1';
 $('#pdfEditFields').querySelectorAll('.field').forEach(function(el){el.hidden=total&&el.querySelector('label').htmlFor!=='pdfEditComp'});
 $('#pdfEditRemover').hidden=total||!!add;$('#pdfEditError').hidden=true;$('#pdfEditTipo').onchange();
 var dlg=$('#pdfEditDialog');if(!dlg.open)dlg.showModal();
 if(total)$('#pdfEditComp').focus();else $('#pdfEditDiam').focus();
}
function closeEditor(){$('#pdfEditDialog').close()}
$('#pdfEditCancelar').onclick=closeEditor;
$('#pdfEditTipo').onchange=function(){$('#pdfEditFinal').closest('.field').hidden=this.value.indexOf('cone')<0};
$('#pdfEditForm').onsubmit=function(e){
 e.preventDefault();
 var val=Number($('#pdfEditComp').value);
 if(!valid(val)){setText('#pdfEditError','Informe comprimento válido.');$('#pdfEditError').hidden=false;return}
 if(edit.index===-1){length=val;closeEditor();invalidate();return}
 var type=$('#pdfEditTipo').value,a=Number($('#pdfEditDiam').value),c=Number($('#pdfEditFinal').value),isCone=type.indexOf('cone')>=0;
 if(!valid(a)||(isCone&&!valid(c))){setText('#pdfEditError','Informe diâmetros válidos.');$('#pdfEditError').hidden=false;return}
 var q={tipo:type,a:a,b:val,c:isCone?c:'',side:$('#pdfEditLado').value};
 if(edit.add)model.push(q);else model[edit.index]=q;
 if(!valid(length))length=val;
 closeEditor();invalidate();
};
$('#pdfEditRemover').onclick=function(){if(edit&&edit.index>=0){model.splice(edit.index,1);closeEditor();invalidate()}};
$('#pdfAddExt').onclick=function(){openEditor(null,null,'ext')};
$('#pdfAddInt').onclick=function(){openEditor(null,null,'int')};
$('#pdfProfileSide').onchange=renderPreview;
$('#pdfPreviewZoomIn').onclick=function(){previewZoom=Math.min(4,previewZoom*1.25);renderPreview()};
$('#pdfPreviewZoomOut').onclick=function(){previewZoom=Math.max(.8,previewZoom/1.25);renderPreview()};
$('#pdfPreviewZoomReset').onclick=function(){previewZoom=1;renderPreview()};
$('#pdfReverseProfile').onclick=function(){
 var side=$('#pdfProfileSide').value;
 model=root.CNCPDFOrient.reverse(model,side);
 faceChoice=faceChoice==='start'?'end':faceChoice==='end'?'start':'';
 $('#pdfFaceChoice').value=faceChoice;
 invalidate();
 status('Perfil CNC invertido com a sequência e os cones atualizados. Confira a face Z0 e as cotas antes de salvar.');
};
$('#pdfProfileSvg').addEventListener('click',function(e){
 var node=e.target.closest('[data-edit-total],[data-edit-index]');if(!node)return;
 if(node.hasAttribute('data-edit-total'))openEditor(-1,'total');
 else openEditor(Number(node.getAttribute('data-edit-index')),node.getAttribute('data-edit-key'));
});
$('#pdfProfileSvg').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){var node=e.target.closest('[data-edit-total],[data-edit-index]');if(node){e.preventDefault();node.dispatchEvent(new MouseEvent('click',{bubbles:true}))}}});
$('#pdfConfirmado').onchange=renderPreview;
$('#pdfNome').oninput=function(){savedId=null;$('#pdfAbrirGerador').hidden=true;$('#pdfSaved').textContent='';renderPreview()};
$('#pdfAplicar').onclick=function(){
 var r=root.CNCPDFPerfil.analyze(model,length),name=$('#pdfNome').value.trim();
 if(!r.ok||unresolved.length||viewKind!=='lateral'||!faceChoice||!$('#pdfConfirmado').checked||!name||!url){status('Confirme geometria válida, nome e cotas antes de salvar.',true);return}
 var max=Math.max(...r.items.filter(q=>q.tipo[0]!=='i').map(q=>Math.max(q.a,q.tipo==='cone'?q.b:q.a)));
 var api=root.CNCDesenhos,id=api&&api.salvarPDF&&api.salvarPDF({nome:name,lPeca:Number(length),dRef:Math.ceil(max+4),items:r.items});
 if(!id){status('Não foi possível salvar o desenho. Confira se há alterações não salvas no editor manual.',true);return}
 savedId=id;$('#pdfAbrirGerador').hidden=false;setText('#pdfSaved','✓ '+name+' salvo na lista de desenhos do Gerador.');
 status('Desenho confirmado e salvo com o nome '+name+'.');renderPreview();
};
$('#pdfCompleteEditor').onclick=function(){
 var result=root.CNCPDFPerfil.analyze(model,length),nome=$('#pdfNome').value.trim();
 if(!result.ok||viewKind!=='lateral'||!faceChoice){
  status('Para enviar ao editor completo, defina a face Z0 e complete primeiro o contorno principal com dimensões válidas.',true);return;
 }
 var ex=result.items.filter(q=>q.tipo[0]!=='i'),dia=Math.max(...ex.map(q=>Math.max(q.a,q.tipo==='cone'?q.b:q.a)));
 if(!root.CNCDesenhos||!root.CNCDesenhos.importarPDF){status('Editor completo indisponível.',true);return}
 if(!root.CNCDesenhos.importarPDF({nome:nome||'Desenho PDF em revisão',lPeca:Number(length),dRef:Math.ceil(dia+4),items:result.items})){status('A transferência foi cancelada para preservar o desenho atual.',true);return}
 $('#pdfPanel').hidden=true;$('#pdfManual').hidden=false;
 status('Rascunho transferido. Insira raios, roscas e detalhes no editor completo e salve somente após conferir toda a geometria.');
};
$('#pdfAbrirGerador').onclick=function(){var nav=$('#nav-gerador');if(nav&&!nav.hidden)nav.click()};
$('#pdfModo').onclick=function(){$('#pdfPanel').hidden=false;$('#pdfManual').hidden=true;renderPreview()};
$('#pdfVoltar').onclick=function(){$('#pdfPanel').hidden=true;$('#pdfManual').hidden=false};
renderPreview();
root.CNCPDFImport={getModel:function(){return model.map(q=>({...q}))},getSelectedView:function(){return picked},
 getOrientation:function(){return {view:viewKind,face:faceChoice,axis:profileAxis}}};
})(window);
