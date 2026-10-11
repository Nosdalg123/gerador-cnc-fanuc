/* Importacao PDF assistida, selecao de vista e projecao cotada sem lista de partes.
   As cotas so viram programa CNC depois da confirmacao humana. */
(function(root){
'use strict';
var $=q=>document.querySelector(q),url=null,doc=null,fileBytes=null,page=1,totalPages=1,zoom=1,rotation=0;
var model=[],length='',picked=null,selectMode=false,down=null,viewport=null,pg=null,library=null,savedId=null,renderSeq=0,edit=null,possibleViews=[];
var pdfjsUrl='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var workerUrl='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function status(t,error){$('#pdfStatus').textContent=t;$('#pdfStatus').style.color=error?'#be4936':'';}
function fmt(v){return Number(v).toLocaleString('pt-BR',{maximumFractionDigits:4})}
function valid(v){return Number.isFinite(Number(v))&&Number(v)>0}
function setText(id,v){$(id).textContent=v}
function invalidate(){savedId=null;$('#pdfConfirmado').checked=false;$('#pdfAbrirGerador').hidden=true;$('#pdfSaved').textContent='';renderPreview();}
function fresh(){model=[];length='';picked=null;selectMode=false;possibleViews=[];invalidate();drawSelection();}
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
  $('#pdfProfileMsg').textContent=(r.warnings.length?r.warnings.join(' · ')+' · ':'')+'Clique em uma cota azul ou sobre a peça para editar.';
  $('#pdfScaleInfo').textContent='X e Ø em proporção 1:1 · escala automática de visualização';
 }else{
  host.innerHTML='<p class="note" style="padding:18px">A projeção geométrica aparece quando a vista tem cotas suficientes. Use “Selecionar vista” ou acrescente o perfil diretamente no desenho.</p>';
  $('#pdfProfileMsg').textContent=r.errors.join(' · ');
  $('#pdfScaleInfo').textContent='Escala proporcional X = Ø';
 }
 $('#pdfComprimento').value=length;
 var canSave=!!(r.ok&&url&&$('#pdfConfirmado').checked&&$('#pdfNome').value.trim()&&!savedId);
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
  var candidates=root.CNCPDFRecon.candidates(items);
  var box=$('#pdfCotas');box.replaceChildren();
  Array.from(new Set(candidates.map(x=>x.n))).forEach(function(n){var span=document.createElement('span');span.className='chip';span.textContent=fmt(n)+' mm';box.appendChild(span)});
  var recognized=root.CNCPDFRecon.recognize(items);
  var dims=recognized.ok?recognized:null,drawn=null,vectorWarning='';
  if(!dims){
   // Em desenhos com mais de dois diametros, o texto sozinho e insuficiente:
   // o maior candidato serve para escalar a vista, nao para liberar CNC.
   var axial=candidates.filter(c=>c.vertical&&!c.diam);
   var diam=candidates.filter(c=>c.diam&&!c.vertical);
   if(!diam.length){
    var horizontal=candidates.filter(c=>!c.vertical&&!c.diam);
    if(horizontal.length>1)diam=horizontal;
   }
   if(axial.length===1&&diam.length>=1){
    dims={externo:Math.max.apply(null,diam.map(c=>c.n)),interno:null,comprimento:axial[0].n,approximate:true};
   }
  }
  if(dims&&root.CNCPDFVetorial&&library.OPS){
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
   if(recognized.ok&&model.length===2){
    // As cotas escritas no PDF prevalecem sobre estimativas graficas.
    var ex=model.find(q=>q.tipo==='cil'),inn=model.find(q=>q.tipo==='icil');
    if(ex&&inn){ex.a=recognized.externo;inn.a=recognized.interno;ex.b=length;inn.b=length;}
   }
   invalidate();
   status('Contorno vetorial identificado e projetado. '+drawn.warning+' '+vectorWarning);
  }else if(recognized.ok){
   model=[{tipo:'cil',side:'1',a:recognized.externo,b:recognized.comprimento,c:''},{tipo:'icil',side:'1',a:recognized.interno,b:recognized.comprimento,c:''}];
   length=recognized.comprimento;
   invalidate();
   status('Geometria detectada pelas cotas da vista: Ø externo '+fmt(recognized.externo)+', Ø interno '+fmt(recognized.interno)+', comprimento '+fmt(recognized.comprimento)+' mm. Confira a projeção.');
  }else{
   model=[];length='';
   invalidate();
   status('O contorno não pôde ser reconstruído com segurança nesta vista. Ajuste a seleção ou acrescente a geometria diretamente na projeção. '+recognized.reason,true);
  }
  var views=content.items.map(function(it){return {s:String(it.str||'').toUpperCase(),transform:it.transform}})
    .filter(function(it){return /SE[CÇ][AÃ]O|CORTE |SECTION|VISTA /.test(it.s)});
  possibleViews=views.map(function(t,i){var p=library.Util.transform(viewport.transform,t.transform),nx=p[4]/viewport.width,ny=p[5]/viewport.height;
    return {name:t.s.slice(0,40),view:{x1:Math.max(0,nx-.25),y1:Math.max(0,ny-.45),x2:Math.min(1,nx+.25),y2:Math.min(1,ny+.03)}}
  });
  paintSuggestions();
 }catch(e){status('Não foi possível ler as cotas desta página: '+(e.message||e),true)}
}
function paintSuggestions(){
 var rootEl=$('#pdfViews');if(!rootEl)return;
 rootEl.replaceChildren();
 possibleViews.forEach(function(v,i){
  var b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent='Selecionar '+v.name;
  b.onclick=function(){picked=v.view;selectMode=false;invalidate();drawSelection();recognizePage();};rootEl.appendChild(b);
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
 picked=v;selectMode=false;drawSelection();recognizePage();
});
stage.addEventListener('pointercancel',function(){down=null;drawSelection()});
$('#pdfSelectView').onclick=function(){selectMode=true;status('Arraste no PDF um retângulo ao redor da vista e das cotas correspondentes.');};
$('#pdfClearView').onclick=function(){picked=null;selectMode=false;drawSelection();recognizePage()};
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
$('#pdfProxima').onclick=function(){if(doc&&page<totalPages){page++;picked=null;fresh();showPage()}};
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
$('#pdfProfileSvg').addEventListener('click',function(e){
 var node=e.target.closest('[data-edit-total],[data-edit-index]');if(!node)return;
 if(node.hasAttribute('data-edit-total'))openEditor(-1,'total');
 else openEditor(Number(node.getAttribute('data-edit-index')),node.getAttribute('data-edit-key'));
});
$('#pdfProfileSvg').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){var node=e.target.closest('[data-edit-total],[data-edit-index]');if(node){e.preventDefault();node.dispatchEvent(new MouseEvent('click',{bubbles:true}))}}});
$('#pdfConfirmado').onchange=renderPreview;
$('#pdfNome').oninput=function(){savedId=null;renderPreview()};
$('#pdfAplicar').onclick=function(){
 var r=root.CNCPDFPerfil.analyze(model,length),name=$('#pdfNome').value.trim();
 if(!r.ok||!$('#pdfConfirmado').checked||!name||!url){status('Confirme geometria válida, nome e cotas antes de salvar.',true);return}
 var max=Math.max(...r.items.filter(q=>q.tipo[0]!=='i').map(q=>Math.max(q.a,q.tipo==='cone'?q.b:q.a)));
 var api=root.CNCDesenhos,id=api&&api.salvarPDF&&api.salvarPDF({nome:name,lPeca:Number(length),dRef:Math.ceil(max+4),items:r.items});
 if(!id){status('Não foi possível salvar o desenho. Confira se há alterações não salvas no editor manual.',true);return}
 savedId=id;$('#pdfAbrirGerador').hidden=false;setText('#pdfSaved','✓ '+name+' salvo na lista de desenhos do Gerador.');
 status('Desenho confirmado e salvo com o nome '+name+'.');renderPreview();
};
$('#pdfAbrirGerador').onclick=function(){var nav=$('#nav-gerador');if(nav&&!nav.hidden)nav.click()};
$('#pdfModo').onclick=function(){$('#pdfPanel').hidden=false;$('#pdfManual').hidden=true;renderPreview()};
$('#pdfVoltar').onclick=function(){$('#pdfPanel').hidden=true;$('#pdfManual').hidden=false};
renderPreview();
root.CNCPDFImport={getModel:function(){return model.map(q=>({...q}))},getSelectedView:function(){return picked}};
})(window);
