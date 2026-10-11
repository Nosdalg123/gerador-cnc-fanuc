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
function addRow(type,a,b,c,side){
 var tr=element('div','pdf-row');tr.innerHTML='<select class="pdf-tipo" aria-label="Elemento"><option value="cil">Cilindro externo</option><option value="cone">Cone externo</option><option value="icil">Cilindro interno</option><option value="icone">Cone interno</option></select><input class="pdf-a" type="number" min="0.001" step="any" placeholder="Ø inicial" aria-label="Diametro inicial"><input class="pdf-b" type="number" min="0.001" step="any" placeholder="Comprimento" aria-label="Comprimento"><input class="pdf-c" type="number" min="0.001" step="any" placeholder="Ø final (cone)" aria-label="Diametro final"><select class="pdf-side" aria-label="Lado"><option value="1">Lado 1</option><option value="2">Lado 2</option></select><button type="button" class="btn sm pdf-remove" aria-label="Remover linha">×</button>';
 tr.querySelector('.pdf-tipo').value=type||'cil';tr.querySelector('.pdf-a').value=a||'';tr.querySelector('.pdf-b').value=b||'';tr.querySelector('.pdf-c').value=c||'';tr.querySelector('.pdf-side').value=String(side||1);
 tr.querySelector('.pdf-remove').onclick=function(){tr.remove()};
 $('#pdfRows').appendChild(tr);return tr;
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
 if(url)URL.revokeObjectURL(url);$('#pdfRows').replaceChildren();addRow('cil');$('#pdfComprimento').value='';$('#pdfConfirmado').checked=false;url=URL.createObjectURL(f);page=1;total=1;dx=dy=rot=0;zoom=1;array=null;doc=null;tokens=[];
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
$('#pdfAdd').onclick=function(){addRow('cil')};
$('#pdfAplicar').onclick=function(){
 if(!url){status('Carregue um PDF antes de continuar.',true);return}
 var rows=Array.from(document.querySelectorAll('#pdfRows .pdf-row')),items=[],sum={1:0,2:0},mx=0;
 if(!rows.length){status('Adicione ao menos um trecho com cotas conferidas.',true);return}
 for(var i=0;i<rows.length;i++){
  var r=rows[i],tp=r.querySelector('.pdf-tipo').value,a=Number(r.querySelector('.pdf-a').value),b=Number(r.querySelector('.pdf-b').value),c=Number(r.querySelector('.pdf-c').value),side=r.querySelector('.pdf-side').value;
  if(!valid(a)||!valid(b)||(tp.indexOf('cone')>=0&&!valid(c))){status('Linha '+(i+1)+': confira Ø, comprimento e Ø final do cone.',true);return}
  if(tp==='cil'||tp==='icil')items.push({side:side,tipo:tp,a:a,b:b});
  else items.push({side:side,tipo:tp,a:a,b:c,c:b});
  sum[side]+=b;mx=Math.max(mx,a,c);
 }
 var total=Number($('#pdfComprimento').value);
 if(!valid(total)){status('Informe o comprimento final total da peça em mm.',true);return}
 if(sum[1]>total+1e-5||sum[2]>total+1e-5){status('Os trechos de um lado excedem o comprimento final.',true);return}
 if(!$('#pdfConfirmado').checked){status('Confirme que verificou todas as cotas no PDF original.',true);return}
 var apply=root.CNCDesenhos&&root.CNCDesenhos.importarPDF;
 if(!apply){status('Editor de desenhos indisponível.',true);return}
 if(!apply({nome:$('#pdfNome').value||'Desenho PDF',lPeca:total,dRef:Math.ceil(mx+4),items:items})){status('Importação cancelada. Preserve o desenho atual antes de substituir.',true);return}
 $('#pdfPanel').hidden=true;$('#pdfManual').hidden=false;
 status('Rascunho transferido ao editor. Confira o perfil e clique Salvar para disponibilizar ao Gerador.');
};
$('#pdfModo').onclick=function(){$('#pdfPanel').hidden=false;$('#pdfManual').hidden=true};
$('#pdfVoltar').onclick=function(){$('#pdfPanel').hidden=true;$('#pdfManual').hidden=false};
addRow('cil');
root.CNCPDFImport={addRow:addRow};
})(window);
