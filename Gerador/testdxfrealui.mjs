/* Teste opcional de interface com os DXFs originais locais.
 * node testdxfrealui.mjs /caminho/Disco.DXF /caminho/Copo.DXF
 * Não inclui nem envia os desenhos de fabricação ao GitHub.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const files=process.argv.slice(2).map(f=>path.resolve(f));
if(files.length!==2)throw Error('Informe os DXFs Disco e Copo, nesta ordem.');
const base=path.dirname(fileURLToPath(import.meta.url));
const server=http.createServer((req,res)=>{
 const file=path.resolve(base,decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\/+/,'')||'index.html');
 if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return}
 fs.stat(file,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':{'.js':'application/javascript','.html':'text/html','.css':'text/css'}[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1500,height:960}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.evaluate(()=>{
  const login=document.querySelector('#login');login.hidden=true;login.style.display='none';
  document.querySelector('#view-desenho').hidden=false;
 });
 // Clique real sobre o traço: usa a transformação SVG da página, inclusive zoom/scroll.
 const clickSegment=async (host,id,fraction=.5)=>{
  const el=page.locator(host+' [data-cad-segment="'+id+'"]');
  await el.scrollIntoViewIfNeeded();
  const point=await el.evaluate((e,f)=>{
   const p=e.getPointAtLength(e.getTotalLength()*f).matrixTransform(e.getScreenCTM());
   return {x:p.x,y:p.y};
  },fraction);
  await page.mouse.click(point.x,point.y);
 };
 const selected=()=>page.evaluate(()=>window.CNCDXFWizard.getState().chosen);
 await page.locator('#desenhoImportarDXF').click();
 const profiles=[
  {name:'Disco',axis:174.5355806289,length:105,ids:['EF:0','EB:0','E7:0','E5:0','F2:0','F3:0']},
  {name:'Copo',axis:268.3605253536,length:185,ids:[
   'C7:0','C8:0','C9:0','CA:0','CB:0','CC:0','E7:0','D0:0','D1:0',
   'D2:0','D3:0','D4:0','D5:0','D6:0','D7:0','D8:0','D9:0','DA:0',
   'DB:0','DC:0','DD:0','DE:0','DF:0','E0:0','E1:0','E2:0','E3:0','E4:0','E5:0','E6:0']}
 ];
 for(let i=0;i<2;i++){
  const spec=profiles[i];
  await page.locator('#wFile').setInputFiles(files[i]);
  await page.waitForFunction(()=>document.querySelector('#wStatus').textContent.includes('DXF carregado'));
  assert(Math.abs(Number(await page.locator('#wAxis').inputValue())-spec.axis)<.002);
  await page.locator('#wLength').fill(String(spec.length));
  await page.locator('#wLength').dispatchEvent('change');
  await page.locator('#wFace').selectOption('direita');
  await page.locator('#wNext1').click();
  if(i===1){
   await page.locator('#wZoom').fill('200');await page.locator('#wZoom').dispatchEvent('input');
   assert.equal(await page.locator('#wZoomValue').innerText(),'200%');
  }
  assert(await page.locator('#wExtendControls').isHidden());
  for(const id of spec.ids){
   const beforeClick=await selected();
   await clickSegment('#wCanvas',id,id==='F3:0'?.2:id==='E7:0'?.35:.5);
   const afterClick=await selected();
   if(!afterClick.includes(id))console.log('Clique '+id+' incluiu',afterClick.filter(x=>!beforeClick.includes(x)),
    'removeu',beforeClick.filter(x=>!afterClick.includes(x)));
   assert((await selected()).includes(id),'Clique real não marcou '+spec.name+' '+id);
  }
  if(i===0){
   await page.locator('#wBreak').click();
   assert(!await page.evaluate(()=>window.CNCDXFWizard.getState().doc.geometry.some(e=>e.id==='F3')),
    'Quebrar substitui a linha por trechos independentes');
   await page.locator('#wUndo').click();
   assert(await page.evaluate(()=>window.CNCDXFWizard.getState().doc.geometry.some(e=>e.id==='F3')));
   // Após desfazer, voltar ao foco sem modificar a marcação.
   await page.locator('#wTrimMode').click();
   await clickSegment('#wCanvas','F3:0',.2);
   // F3 atravessa o eixo, mas precisa ficar selecionável no semiperfil superior.
   await page.locator('#wExtEnd').selectOption('ini');
   await page.locator('#wApplyTrim').click();
   assert.match(await page.locator('#wStatus').innerText(),/cortada/);
   assert(await page.locator('#wExtendControls').isHidden(),'Aplicar corte fecha controles');
   await page.locator('#wExtendMode').click();
   await clickSegment('#wCanvas','F2:0');
   await page.locator('#wExtEnd').selectOption('fim');
   const before=await page.evaluate(()=>JSON.stringify(window.CNCDXFWizard.getState().doc.geometry));
   await page.locator('#wApplyExtend').click();
   assert.match(await page.locator('#wStatus').innerText(),/recorte visual/);
   assert.equal(await page.evaluate(()=>JSON.stringify(window.CNCDXFWizard.getState().doc.geometry)),before,
    'Estender ponta visual não pode modificar ponta inferior do CAD');
   await page.locator('#wStep3').click();
   assert(await page.locator('#wExtendControls').isHidden(),'Trocar etapa fecha extensão');
   assert(await page.locator('#wAudit [data-review-code="axial_coverage"]').count(),
    '105 mm não pode parecer o comprimento total de 109,50 mm');
   await page.locator('#wStep2').click();
   assert(await page.locator('#wExtendControls').isHidden(),'Retorno não reabre extensão');
   await page.locator('#wTrimMode').click();
   await clickSegment('#wCanvas','F2:0',.1);
   await page.locator('#wExtEnd').selectOption('ini');
   await page.locator('#wApplyTrim').click();
   assert.match(await page.locator('#wStatus').innerText(),/cortada/);
   for(const id of ['EA:0','ED:0','F1:0']){
    await clickSegment('#wCanvas',id);
    assert((await selected()).includes(id),'Face curva não selecionada: '+id);
    spec.ids.push(id);
   }
   spec.length=109.5;
   await page.locator('#wStep1').click();
   await page.locator('#wLength').fill('109.5');await page.locator('#wLength').dispatchEvent('change');
   await page.locator('#wStep2').click();
  }
  await page.locator('#wBuild').click();
  assert.match(await page.locator('#wStatus').innerText(),/Perímetro isolado/,spec.name+' precisa construir');
  const graph=await page.evaluate(()=>{
   const s=window.CNCDXFWizard.getState();
   const g=window.CNCDXFWizardGeom.analyze(window.CNCDXFWizardGeom.collect(s.doc,s.region,s.axis),new Set(s.chosen));
   return {ok:g.ok,span:g.span,arcs:g.chosen.filter(x=>x.kind==='arc').length};
  });
  assert(graph.ok&&Math.abs(graph.span-spec.length)<.02);
  assert(graph.arcs>=2,'Arcos reais precisam permanecer na cadeia');
  assert(await page.locator('#wCanvas [data-construction="true"]').count()>0);
  assert(!await page.locator('#wCanvas svg path').evaluateAll(els=>els.some(e=>/NaN|Infinity/.test(e.getAttribute('d')||''))));
  await page.locator('#wRefs').uncheck();
  assert.equal(await page.locator('#wCanvas [data-cad-segment]').count(),spec.ids.length);
  assert.equal(await page.locator('#wCanvas [data-cad-reference]').count(),0,'Isolar não pode deixar SPLINE de referência na vista');
  await page.locator('#wNext2').click();
  const auditText=await page.locator('#wAudit').innerText();
  if(i===0){assert.match(auditText,/M39 P2/);assert.match(auditText,/M8 X50/);
   assert.equal(await page.locator('#wAudit [data-review-code="axial_coverage"]').count(),0);
  }else{assert.match(auditText,/M64 P4/);assert.match(auditText,/M10/);
   assert.match(auditText,/79,104/);assert.match(auditText,/curva/);
   const modelBefore=await page.evaluate(()=>JSON.stringify(window.CNCDXFWizard.getState().doc));
   await page.locator('[data-review-locate="diameter_reference"]').click();
   assert.match(await page.locator('#wStatus').innerText(),/destacada/);
   assert.match(await page.locator('#wCanvas svg').textContent(),/Cota Ø79,104/);
   assert.equal(await page.evaluate(()=>JSON.stringify(window.CNCDXFWizard.getState().doc)),modelBefore);
   await page.locator('#wStep3').click();
   await page.locator('[data-review-locate="special_curve"]').click();
   assert.match(await page.locator('#wCanvas svg').textContent(),/Curva 110/);
   assert(await page.locator('#wCanvas [data-cad-reference="110"]').count(),'Localizar curva mostra a referência CAD real');
   await page.locator('#wStep3').click();
  }
  if(process.env.CNC_REVIEW_SCREENSHOT_DIR){
   fs.mkdirSync(process.env.CNC_REVIEW_SCREENSHOT_DIR,{recursive:true});
   await page.screenshot({path:path.join(process.env.CNC_REVIEW_SCREENSHOT_DIR,spec.name+'.png')});
  }
  await page.locator('#wReviewed').check();
  await page.locator('#wSave').click();
  assert.match(await page.locator('#wStatus').innerText(),/salvo neste navegador/);
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('cnc_dxf_assistente_221')));
  assert.equal(draft.review.cncReady,false,'Revisão geométrica não libera CNC');
  assert.equal(draft.review.geometryConsistent,i===0,'Copo mantém a discrepância de cota e SPLINE para revisão');
  assert(Math.abs(draft.review.faceReferenceX-(i===0?199.0407756872:291.2483983558))<.001,
   'Face Z0 precisa usar a extremidade real do contorno, sem margem do recorte');
  assert.equal(draft.sourceDoc.geometry.length,i===0?116:190,'CAD fonte completo preservado');
  if(i===0){
   const line=draft.sourceDoc.geometry.find(x=>x.id==='F3');
   assert(Math.abs(line.b[1]-131.073546314)<.00001,'Cortar não altera a fonte');
  }
  await page.locator('#wRestoreDraft').click();
  assert.equal(await page.evaluate(()=>window.CNCDXFWizard.getState().built),true);
  assert.equal((await selected()).length,spec.ids.length);
  await page.locator('#wStep1').click();
  console.log(spec.name+': clique real, '+(i===0?'quebra/corte e ponta recortada protegida, ':'zoom e seleção de trechos curtos, ')+spec.ids.length+' trechos, '+graph.arcs+
   ' arcos, extensão Z='+graph.span.toFixed(3)+' mm, rascunho e fonte preservada — PASSOU.');
 }
 // Caminho antigo: o mesmo ARC real não deve provocar geometria não reconhecida.
 await page.evaluate(()=>document.querySelector('#dxfModo').click());
 await page.locator('#dxfFile').setInputFiles(files[0]);
 await page.waitForFunction(()=>document.querySelector('#dxfStatus').textContent.includes('DXF CAD carregado:'));
 await page.locator('#dxfPerimeterStart').click();
 for(const id of ['EF:0','EB:0'])await clickSegment('#dxfProjected',id);
 await page.locator('#dxfPerimeterBuild').click();
 assert.match(await page.locator('#dxfPerimeterStatus').innerText(),/Perímetro isolado/);
 assert.deepEqual(errors,[],'Não pode haver erro JavaScript de interface');
 console.log('PASSOU: ARC real também aceito no construtor anterior; nenhum erro JS.');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
