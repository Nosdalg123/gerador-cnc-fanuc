/* Importador assistido de desenhos PDF — v2.8.0.
   A geometria NUNCA e inferida automaticamente so pela escala do PDF.
   Texto vetorial: extracao opcional via PDF.js (requer internet na primeira carga).
   Imagem digitalizada: visualizacao e digitacao/conferencia manual das cotas. */
(function(root){
'use strict';
var $=function(q){return document.querySelector(q);}, url=null, doc=null, page=1, total=1, zoom=1, rot=0, dx=0, dy=0, array=null, tokens=[];
var libUrl='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var workerUrl='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function status(t,err){var el=$('#pdfStatus');el.textContent=t;el.style.color=err?'#b44934':'';}
function esc(t){return String(t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function valid(n){return Number.isFinite(n)&&n>0&&n<100000}
function fmt(n){return Number(n).toLocaleString('pt-BR',{maximumFractionDigits:4})}
function element(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function rowsData(){
 return Array.from(document.querySelectorAll('#pdfRows .pdf-row')).map(function(r){return {
 tipo:r.querySelector('.pdf-tipo').value, a:r.querySelector('.pdf-a').value,
 b:r.querySelector('.pdf-b').value, c:r.querySelector('.pdf-c').value,
 side:r.querySelector('.pdf-side').value
 }});
}
function renderPreview(){
 var res=root.CNCPDFPerfil&&root.CNCPDFPerfil.svg(rowsData(),$('#pdfComprimento').value);
 if(!res){status('Módulo de projeção CNC indisponível.',true);return}
 var host=$('#pdfProfileSvg'),msg=$('#pdfProfileMsg');
 if(res.ok){host.innerHTML=res.svg;msg.textContent=(res.warnings.length?res.warnings.join(' · ')+' · ':'')+'Compare a peça reconstruída às cotas e à seção do PDF original.';}
 else{host.innerHTML='<p class="note" style="padding:16px">Preencha Ø e comprimento para visualizar a geometria CNC.</p>';msg.textContent=res.errors.join(' · ')}
 var ready=!!(res.ok&&url&&$('#pdfConfirmado').checked&&$('#pdfNome').value.trim());
 $('#pdfSaveActions').hidden=!ready;
 $('#pdfAplicar').disabled=!ready;
}
function invalidate(){ $('#pdfConfirmado').checked=false; $('#pdfAbrirGerador').hidden=true; $('#pdfSaved').textContent=''; renderPreview(); }
function addRow(type,a,b,c,side){
 var tr=element('div','pdf-row');tr.innerHTML='<select class="pdf-tipo" aria-label="Elemento"><option value="cil">Cilindro externo</option><option value="cone">Cone externo</option><option value="icil">Cilindro interno</option><option value="icone">Cone interno</option></select><input class="pdf-a" type="number" min="0.001" step="any" placeholder="Ø inicial" aria-label="Diametro inicial"><input class="pdf-b" type="number" min="0.001" step="any" placeholder="Comprimento" aria-label="Comprimento"><input class="pdf-c" type="number" min="0.001" step="any" placeholder="Ø final (cone)" aria-label="Diametro final"><select class="pdf-side" aria-label="Lado"><option value="1">Lado 1</option><option value="2">Lado 2</option></select><button type="button" class="btn sm pdf-remove" aria-label="Remover linha">×</button>';
 tr.querySelector('.pdf-tipo').value=type||'cil';tr.querySelector('.pdf-a').value=a||'';tr.querySelector('.pdf-b').value=b||'';tr.querySelector('.pdf-c').value=c||'';tr.querySelector('.pdf-side').value=String(side||1);
 tr.querySelector('.pdf-remove').onclick=function(){tr.remove();invalidate()};
 $('#pdfRows').appendChild(tr);renderPreview();return tr;
}
function move(){var f=$('#pdfFrame');f.style.transform='translate('+dx+'px,'+dy+'px) rotate('+rot+'deg) scale('+zoom+')';$('#pdfTransform').textContent='Zoom '+Math.round(zoom*100)+'% · rotação '+rot+'° · posição '+dx+', '+dy+' px';}
function showPage(){if(!url)return; var f=$('#pdfFrame'); f.src=url+'#page='+page+'&view=Fit'; $('#pdfPage').textContent='Página '+page+' / '+total;move();}
function loadScript(){if(root.pdfjsLib)return Promise.resolve(root.pdfjsLib);return new Promise(function(resolve,reject){var s=document.createElement('script');s.src=libUrl;s.onload=function(){root.pdfjsLib.GlobalWorkerOptions.workerSrc=workerUrl;resolve(root.pdfjsLib)};s.onerror=function(){reject(new Error('Biblioteca PDF.js indisponível (sem internet). O PDF continua visível para conferência manual.'))};document.head.appendChild(s)})}
function scan(){
 if(!array)return;status('Lendo texto e cotas do PDF…');
 loadScript().then(function(lib){return lib.getDocument({data:new Uint8Array(array.slice(0))}).promise}).then(function(pdf){
 doc=pdf;total=pdf.numPages;showPage();return pdf.getPage(page);
 }).then(function(pg){return pg.getTextContent()}).then(function(content){
 var rec=root.CNCPDFRecon&&root.CNCPDFRecon.recognize(content.items);
 if(rec&&rec.ok){
   $('#pdfRows').replaceChildren();
   addRow('cil',rec.externo,rec.comprimento,'',1);
   addRow('icil',rec.interno,rec.comprimento,'',1);
   $('#pdfComprimento').value=rec.comprimento;
   $('#pdfConfirmado').checked=false;
   renderPreview();
   status('Pré-preenchido automaticamente: Ø externo '+fmt(rec.externo)+' · Ø interno '+fmt(rec.interno)+' · comprimento '+fmt(rec.comprimento)+' mm. CONFIRA a seção e as cotas antes de confirmar.');
 }else{
   status(rec&&rec.reason||'Não foi possível interpretar automaticamente; confira as cotas manualmente.',true);
 }
 var ss=content.items.map(function(x){return String(x.str||'').trim()}).filter(Boolean);tokens=ss;
 var txt=ss.join(' ');$('#pdfTexto').value=txt;
 var matches=[], re=/(?:[Ø⌀]|(?:DIA|DIAM(?:ETRO)?)[.:\s]*)\s*(\d+(?:[.,]\d+)?)/gi,m;
 while((m=re.exec(txt))!==null){var d=Number(m[1].replace(',','.'));if(valid(d))matches.push(d)}
 var unique=Array.from(new Set(matches));
 $('#pdfCotas').replaceChildren();
 unique.forEach(function(v){var b=element('button','btn sm','Ø '+fmt(v));b.type='button';b.onclick=function(){var tr=$('#pdfRows .pdf-row:last-child')||addRow();tr.querySelector('.pdf-a').value=v};$('#pdfCotas').appendChild(b)});
 if(!rec||!rec.ok)status('Texto extraído: '+ss.length+' trechos; '+unique.length+' diâmetros candidatos. Reconhecimento completo indisponível; confira as cotas manualmente.');
 }).catch(function(e){status(String(e.message||e),true)});
}
$('#pdfFile').addEventListener('change',function(){
 var f=this.files[0];if(!f)return;
 if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf'){status('Selecione um arquivo .pdf válido.',true);return}
 if(f.size>40*1024*1024){status('PDF acima de 40 MB: reduza o arquivo antes de importar.',true);return}
 if(url)URL.revokeObjectURL(url);$('#pdfRows').replaceChildren();$('#pdfComprimento').value='';$('#pdfConfirmado').checked=false;$('#pdfAbrirGerador').hidden=true;$('#pdfSaved').textContent='';url=URL.createObjectURL(f);addRow('cil');page=1;total=1;dx=dy=rot=0;zoom=1;array=null;doc=null;tokens=[];
 $('#pdfNome').value=f.name.replace(/\.pdf$/i,'');$('#pdfTexto').value='';$('#pdfCotas').replaceChildren();showPage();
 f.arrayBuffer().then(function(b){array=b;scan()}).catch(function(){status('Falha ao ler arquivo PDF.',true)});
});
$('#pdfAnterior').onclick=function(){if(page>1){page--;showPage();if(doc)readPageText()}};
$('#pdfProxima').onclick=function(){if(page<total){page++;showPage();if(doc)readPageText()}};
function readPageText(){doc.getPage(page).then(function(p){return p.getTextContent()}).then(function(c){var s=c.items.map(function(x){return String(x.str||'')});$('#pdfTexto').value=s.join(' ')})}
$('#pdfMais').onclick=function(){zoom=Math.min(4,+(zoom*1.25).toFixed(3));move()};
$('#pdfMenos').onclick=function(){zoom=Math.max(.4,+(zoom/1.25).toFixed(3));move()};
$('#pdfGirar').onclick=function(){rot=(rot+90)%360;move()};
$('#pdfReset').onclick=function(){zoom=1;rot=dx=dy=0;move()};
var dragging=false,x0=0,y0=0;
var stage=$('#pdfStage');
stage.addEventListener('pointerdown',function(e){if(e.target.closest('button'))return;dragging=true;x0=e.clientX-dx;y0=e.clientY-dy;stage.setPointerCapture(e.pointerId)});
stage.addEventListener('pointermove',function(e){if(dragging){dx=e.clientX-x0;dy=e.clientY-y0;move()}});
stage.addEventListener('pointerup',function(){dragging=false});
stage.addEventListener('pointercancel',function(){dragging=false});
$('#pdfAdd').onclick=function(){addRow('cil');invalidate()};
$('#pdfRows').addEventListener('input',invalidate);
$('#pdfRows').addEventListener('change',invalidate);
$('#pdfComprimento').addEventListener('input',invalidate);
$('#pdfNome').addEventListener('input',renderPreview);
$('#pdfConfirmado').addEventListener('change',renderPreview);
$('#pdfAbrirGerador').onclick=function(){
 var nav=$('#nav-gerador');
 if(nav&&!nav.hidden)nav.click();
 else status('O desenho está salvo. Entre com o perfil admin para abrir o Gerador.');
};
$('#pdfAplicar').onclick=function(){
 if(!url){status('Carregue um PDF antes de salvar.',true);return}
 var r=root.CNCPDFPerfil&&root.CNCPDFPerfil.analyze(rowsData(),$('#pdfComprimento').value);
 if(!r||!r.ok){status(r?r.errors.join(' · '):'Geometria inválida.',true);renderPreview();return}
 if(!$('#pdfConfirmado').checked){status('Confirme a geometria projetada e as cotas do PDF.',true);return}
 var nome=$('#pdfNome').value.trim();
 if(!nome){status('Informe o nome do desenho antes de salvar.',true);return}
 var api=root.CNCDesenhos;
 if(!api||!api.salvarPDF){status('Módulo de desenhos salvos indisponível.',true);return}
 var max=0;r.items.forEach(function(t){if(t.tipo[0]!=='i')max=Math.max(max,t.a,t.tipo==='cone'?t.b:t.a)});
 var id=api.salvarPDF({nome:nome,lPeca:r.length,dRef:Math.ceil(max+4),items:r.items});
 if(!id){status('Salvamento cancelado: preserve o desenho aberto antes de substituí-lo.',true);return}
 status('Desenho "'+nome+'" salvo na lista e disponível no Gerador.');
 $('#pdfSaved').textContent='✓ '+nome+' salvo. No Gerador, selecione Peça simples e escolha o desenho na lista.';
 $('#pdfAbrirGerador').hidden=false;
 $('#pdfConfirmado').checked=false;renderPreview();
};
$('#pdfModo').onclick=function(){$('#pdfPanel').hidden=false;$('#pdfManual').hidden=true};
$('#pdfVoltar').onclick=function(){$('#pdfPanel').hidden=true;$('#pdfManual').hidden=false};
addRow('cil');
root.CNCPDFImport={addRow:addRow};
})(window);
