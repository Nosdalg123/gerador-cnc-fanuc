/* Regressão de exclusão DXF e janela de ferramentas com CAD sintético. */
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
const pairs=(...values)=>values.join('\r\n')+'\r\n';
const data=pairs(0,'SECTION',2,'ENTITIES',0,'LINE',5,'line',10,0,20,10,11,20,21,10,
 0,'ARC',5,'arc',10,20,20,15,40,5,50,270,51,0,
 0,'LWPOLYLINE',5,'poly',90,3,70,0,10,25,20,15,10,40,20,15,10,50,20,20,
 0,'LINE',5,'axis',10,0,20,0,11,50,21,0,0,'ENDSEC',0,'EOF');
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.evaluate(()=>{const el=document.querySelector('#login');el.hidden=true;el.style.display='none';});
 for(const [width,height] of [[1366,768],[1024,600],[768,800],[390,844]]){
  await page.setViewportSize({width,height});
  await page.locator('#nav-ferr').click();await page.locator('#ferrNova').click();
  assert.equal(await page.locator('#dlgFerr').isVisible(),true,'Janela deve abrir');
  for(let i=0;i<8;i++){
   await page.locator('#tipoGrid .tipo-card').nth(i).click();
   assert.equal(await page.locator('#tipoGrid [aria-checked="true"]').count(),1);
  }
  await page.locator('#frmFerr [name="obs"]').fill('Verificação do último campo');
  const layout=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
   return {dlg:box('#dlgFerr'),title:box('#dlgTitulo'),row:box('#frmFerr > .row'),actions:box('#frmFerr .dlg-actions'),obs:box('#frmFerr [name="obs"]')};
  });
  assert.ok(layout.dlg.top>=-1&&layout.dlg.bottom<=height+1,JSON.stringify(layout));
  assert.ok(layout.dlg.left>=-1&&layout.dlg.right<=width+1,JSON.stringify(layout));
  assert.ok(layout.row.top>=layout.title.bottom-1&&layout.row.bottom<=layout.actions.top+1,'Cabeçalho e ações fora da área rolável');
  assert.ok(layout.obs.bottom<=layout.row.bottom+1,'Último campo acessível sem sobreposição');
  if(process.env.CNC_QA_DIR){await page.screenshot({path:path.join(process.env.CNC_QA_DIR,'ferramentas-'+width+'.png')});}
  await page.locator('#dlgFerrCancel').click();
  await page.locator('#nav-desenho').click();await page.locator('#desenhoImportarDXF').click();
  await page.locator('#wFile').setInputFiles({name:'excluir-sintetico.dxf',mimeType:'application/dxf',buffer:Buffer.from(data)});
  await page.waitForFunction(()=>document.querySelector('#wFileInfo').textContent.includes('entidades'));
  await page.locator('#wAxis').fill('0');await page.locator('#wAxis').dispatchEvent('change');
  await page.locator('#wFace').selectOption('direita');
  await page.locator('#wNext1').click();
  assert.equal(await page.locator('#wDeleteSelected').isDisabled(),true);
  const panel=await page.evaluate(()=>{
   const el=document.querySelector('#dxfWizard .w-controls'),main=document.querySelector('main');
   main.scrollTop=main.scrollHeight;
   const r=el.getBoundingClientRect(),m=main.getBoundingClientRect();
   return {bottom:r.bottom,top:r.top,mainBottom:m.bottom,mainTop:m.top,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(panel.overflow,false,'Sem transbordamento horizontal da página');
  if(width>960)assert.ok(panel.bottom<=panel.mainBottom+1&&panel.top>=panel.mainTop-1,JSON.stringify(panel));
  for(const uid of ['line:0','arc:0','poly:0']){
   const segment=page.locator('#wCanvas [data-cad-segment="'+uid+'"]');
   await segment.scrollIntoViewIfNeeded();
   const point=await segment.evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()/2).matrixTransform(e.getScreenCTM());return {x:p.x,y:p.y};});
   await page.mouse.click(point.x,point.y);
   await page.locator('#wDeleteSelected').click();
   assert.equal(await page.locator('#wCanvas [data-cad-hit="'+uid+'"]').count(),0);
   assert.ok(await page.evaluate(id=>CNCDXFWizard.getState().deleted.includes(id),uid));
   assert.equal(await page.locator('#wCanvas [data-cad-hit="poly:1"]').count(),1,'Excluir trecho preserva restante da polilinha');
   await page.locator('#wUndo').click();
   assert.equal(await page.locator('#wCanvas [data-cad-hit="'+uid+'"]').count(),1);
  }
  if(process.env.CNC_QA_DIR){await page.screenshot({path:path.join(process.env.CNC_QA_DIR,'dxf-'+width+'.png')});}
 }
 await page.locator('#nav-ferr').click();await page.locator('#ferrNova').click();
 await page.locator('#frmFerr [name="nome"]').fill('Teste controles');
 await page.locator('#frmFerr [name="t"]').fill('0909');
 await page.locator('#frmFerr button[type="submit"]').click();
 assert.equal(await page.locator('#dlgFerr').isVisible(),false,'Salvar fecha a janela');
 assert.match(await page.locator('#view-ferr').innerText(),/TESTE CONTROLES/);
 const savedRow=page.locator('#view-ferr tr').filter({hasText:'TESTE CONTROLES'});
 await savedRow.getByRole('button',{name:'Editar',exact:true}).click();
 assert.equal(await page.locator('#frmFerr [name="nome"]').inputValue(),'TESTE CONTROLES');
 await page.locator('#dlgFerrCancel').click();
 assert.deepEqual(errors,[],'Nenhum erro JS ao abrir, mudar tipo, excluir e desfazer');
 console.log('OK Chromium: excluir/desfazer LINE, ARC e trecho de polilinha; ferramentas, 8 tipos e layout em 4 tamanhos.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
