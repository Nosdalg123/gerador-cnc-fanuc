/* Chromium emulado Android: toque, escala uniforme, zoom, rascunho e layout. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const base=path.dirname(fileURLToPath(import.meta.url));
const server=http.createServer((req,res)=>{
 const file=path.resolve(base,decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\/+/, '')||'index.html');
 if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const data=[0,'SECTION',2,'ENTITIES',0,'LINE',5,'l1',10,0,20,10,11,20,21,10,
 0,'ARC',5,'arc',10,20,20,15,40,5,50,270,51,0,
 0,'LINE',5,'l2',10,25,20,15,11,50,21,15,
 0,'LINE',5,'aux',10,35,20,6,11,35,21,24,
 0,'LINE',5,'axis',10,0,20,0,11,50,21,0,0,'ENDSEC',0,'EOF'].join('\r\n');
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 // Autenticação real do aplicativo, sem esconder a janela de entrada.
 await page.locator('#loginUser').fill('admin');await page.locator('#loginSenha').fill('admin');
 await page.locator('#loginForm button[type="submit"]').tap();
 await page.waitForFunction(()=>document.querySelector('#login').hidden);
 const noOverflow=async()=>assert.ok(await page.evaluate(width=>document.documentElement.scrollWidth<=width+1,page.viewportSize().width),'Página cabe na largura Android sem reduzir a escala inicial');
 for(const [width,height] of [[360,800],[390,844],[412,915],[844,390]]){
  await page.setViewportSize({width,height});
  for(const nav of ['gerador','ferr','sim','desenho']){await page.locator('#nav-'+nav).tap();await noOverflow();}
  await page.locator('#desenhoImportarDXF').tap();
  await page.locator('#wFile').setInputFiles({name:'android-sintetico.dxf',mimeType:'application/dxf',buffer:Buffer.from(data)});
  await page.waitForFunction(()=>document.querySelector('#wStatus').textContent.includes('DXF carregado'));
  await page.locator('#wAxis').fill('0');await page.locator('#wAxis').dispatchEvent('change');
  await page.locator('#wFace').selectOption('direita');await page.locator('#wNext1').tap();
  const original=await page.evaluate(()=>JSON.stringify(CNCDXFWizard.getState().doc.geometry));
  const scale=await page.locator('#wCanvas svg').evaluate(e=>{const r=e.getBoundingClientRect(),v=e.viewBox.baseVal;return {width:r.width,scaleX:r.width/v.width,scaleY:r.height/v.height,host:e.parentElement.clientWidth};});
  assert.ok(scale.width<=scale.host+1,'100% ajusta o desenho à largura disponível');
  assert.ok(Math.abs(scale.scaleX-scale.scaleY)<.002,'Mesma escala visual X e Y');
  const canvasBox=await page.locator('.w-main').boundingBox(),controlsBox=await page.locator('.w-controls').boundingBox();
  assert.ok(canvasBox.y<controlsBox.y,'Desenho e comandos de toque antes do formulário');
  await page.locator('#wZoomIn').tap();assert.equal(await page.locator('#wZoomValue').innerText(),'125%');
  await page.locator('#wFit').tap();assert.equal(await page.locator('#wZoomValue').innerText(),'100%');
  const tapSegment=async id=>{
   const el=page.locator('#wCanvas [data-cad-segment="'+id+'"]');await el.scrollIntoViewIfNeeded();
   const p=await el.evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()/2).matrixTransform(e.getScreenCTM());return {x:p.x,y:p.y};});
   await page.touchscreen.tap(p.x,p.y);
  };
  for(const id of ['l1:0','arc:0']){
   await tapSegment(id);assert.equal(await page.locator('#wTouchDelete').isEnabled(),true);
   await page.locator('#wTouchDelete').tap();assert.equal(await page.locator('#wCanvas [data-cad-segment="'+id+'"]').count(),0);
   await page.locator('#wTouchUndo').tap();assert.equal(await page.locator('#wCanvas [data-cad-segment="'+id+'"]').count(),1);
  }
  await tapSegment('aux:0');await page.locator('#wTouchDelete').tap();
  await page.locator('#wStep3').tap();await page.locator('#wReviewed').check();await page.locator('#wSave').tap();
  await page.locator('#wRestoreDraft').tap();
  assert.ok(await page.evaluate(()=>CNCDXFWizard.getState().deleted.includes('aux:0')),'Exclusão persiste');
  assert.equal(await page.evaluate(()=>JSON.stringify(CNCDXFWizard.getState().doc.geometry)),original,'Escala/toque preservam coordenadas CAD');
  await noOverflow();
  await page.locator('#nav-ferr').tap();await page.locator('#ferrNova').tap();
  await page.locator('#frmFerr [name="obs"]').fill('Android');
  const dlg=await page.locator('#dlgFerr').boundingBox();assert.ok(dlg.width<=width&&dlg.y>=0&&dlg.y+dlg.height<=height+1);
  await page.locator('#dlgFerrCancel').tap();
  console.log(`Android emulado ${width}×${height}: navegação, toque LINE/ARC, excluir/desfazer, zoom proporcional, rascunho e ferramentas — PASSOU.`);
 }
 assert.deepEqual(errors,[],'Nenhum erro JavaScript');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
