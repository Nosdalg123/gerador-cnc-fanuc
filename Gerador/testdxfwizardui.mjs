/* Smoke Chromium do importador experimental, sem desenho de produção. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const base=path.dirname(fileURLToPath(import.meta.url)),mime={'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\/+/,'')||'index.html';
 const file=path.resolve(base,rel);
 if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return}
 fs.stat(file,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const group=(code,value)=>[String(code),String(value)];
const ent=(kind,fields)=>[...group(0,kind),...fields.flatMap(x=>group(...x))];
const L=(id,x1,y1,x2,y2)=>ent('LINE',[[5,id],[8,'0'],[10,x1],[20,y1],[11,x2],[21,y2]]);
const C=(id,r)=>ent('CIRCLE',[[5,id],[8,'0'],[10,400],[20,100],[40,r]]);
const arc=ent('ARC',[[5,'arc1'],[8,'0'],[10,70],[20,135],[40,5],[50,270],[51,0]]);
const head=[...group(0,'SECTION'),...group(2,'HEADER'),...group(9,'$INSUNITS'),...group(70,4),
 ...group(0,'ENDSEC'),...group(0,'SECTION'),...group(2,'ENTITIES')];
const data=[...head,...L('l1',40,130,70,130),...arc,
 ...L('l2',75,135,120,135),...L('l3',120.18,135,170,135),
 ...L('lower',40,75,170,75),...L('axis',40,100,170,100),
 ...C('cc1',30),...C('cc2',25),...C('cc3',20),
 ...group(0,'ENDSEC'),...group(0,'EOF')].join('\r\n')+'\r\n';
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1500,height:920}});
 let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dlg=>dlg.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.evaluate(()=>{
  const login=document.querySelector('#login');if(login){login.hidden=true;login.style.display='none'}
  document.querySelector('#view-desenho').hidden=false;
 });
 await page.locator('#dxfWizardModo').click();
 assert.equal(await page.locator('#dxfPanel').isVisible(),false,'Importador antigo deveria permanecer oculto');
 await page.locator('#wFile').setInputFiles({name:'teste-disco-sintetico.dxf',mimeType:'application/dxf',buffer:Buffer.from(data)});
 await page.waitForTimeout(500);
 assert.match(await page.locator('#wFileInfo').innerText(),/entidades/);
 await page.locator('#wNext1').click();
 assert.equal(await page.locator('#wExtendControls').isVisible(),false,'Extender não deve ficar na tela por padrão');
 for(const id of ['l1','arc1','l2','l3']){
  await page.locator('#wCanvas [data-cad-hit="'+id+':0"]').click({force:true});
 }
 assert.match(await page.locator('#wSelected').innerText(),/4 segmento/,'Arco e linhas devem ser clicáveis');
 await page.locator('#wAutoSafe').click();
 await page.waitForTimeout(150);
 assert.match(await page.locator('#wStatus').innerText(),/união|unida/i);
 await page.locator('#wExtendMode').click();
 await page.locator('#wCanvas [data-cad-hit="l1:0"]').click({force:true});
 assert.equal(await page.locator('#wExtendControls').isVisible(),true,'Extender deve aparecer apenas ao solicitar');
 await page.locator('#wCancelExtend').click();
 assert.equal(await page.locator('#wExtendControls').isVisible(),false,'Cancelar deve fechar controles');
 await page.locator('#wBuild').click();
 assert.match(await page.locator('#wStatus').innerText(),/Perímetro isolado/);
 await page.locator('#wNext2').click();
 await page.locator('#wReviewed').check();
 await page.locator('#wSave').click();
 assert.match(await page.locator('#wStatus').innerText(),/salvo neste navegador/);
 await page.locator('#wStep1').click();
 await page.locator('#wStep2').click();
 assert.match(await page.locator('#wSelected').innerText(),/4 segmento/);
 assert.deepEqual(errors,[],'Erros JS de execução na UI');
 console.log('OK Chromium: 3 etapas, linha/arco clicáveis, reparo conservador, estender cancelável, perímetro e rascunho.');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}