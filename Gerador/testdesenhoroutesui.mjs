/* Smoke teste dos quatro caminhos no módulo Desenho da peça. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const base=path.dirname(fileURLToPath(import.meta.url));
const mime={'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let rel=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\/+/,'')||'index.html';
 let target=path.resolve(base,rel);
 if(!target.startsWith(base+path.sep)){res.writeHead(403);res.end();return}
 fs.stat(target,(e,stat)=>{if(e||!stat.isFile()){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});
 fs.createReadStream(target).pipe(res);
 });
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1500,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.evaluate(()=>{const login=document.querySelector('#login');login.hidden=true;login.style.display='none'});
 await page.locator('#nav-desenho').click();
 assert.equal(await page.locator('#desenhoLanding').isVisible(),true);
 for(const id of ['desenhoCriar','desenhoImportarPDF','desenhoImportarDXF','desenhoImportarUnico'])
  assert.equal(await page.locator('#'+id).isVisible(),true,id+' deve estar visível');
 assert.equal(await page.locator('#dxfModo').isVisible(),false,'Importador legado não deve ocupar um quinto caminho');
 await page.locator('#desenhoCriar').click();
 assert.equal(await page.locator('#pdfManual').isVisible(),true,'Criar deve abrir editor manual');
 await page.locator('#desenhoInicio').click();
 await page.locator('#desenhoImportarPDF').click();
 assert.equal(await page.locator('#pdfPanel').isVisible(),true,'PDF deve abrir módulo próprio');
 await page.locator('#pdfVoltar').click();
 assert.equal(await page.locator('#desenhoLanding').isVisible(),true);
 await page.locator('#desenhoImportarDXF').click();
 assert.equal(await page.locator('#dxfWizard').isVisible(),true,'DXF deve abrir 3 etapas');
 for(const id of ['wStep1','wStep2','wStep3'])assert.equal(await page.locator('#'+id).isVisible(),true);
 await page.locator('#wClose').click();
 assert.equal(await page.locator('#desenhoLanding').isVisible(),true);
 await page.locator('#desenhoImportarUnico').click();
 assert.equal(await page.locator('#desenhoUnicoPanel').isVisible(),true);
 assert.match(await page.locator('#desenhoUnicoPanel').innerText(),/Em construção/);
 assert.equal(await page.locator('#desenhoUnicoPanel input[type=file]').count(),0,'Não implementar importação única antes das instruções');
 await page.locator('#desenhoUnicoVoltar').click();
 assert.equal(await page.locator('#desenhoLanding').isVisible(),true);
 assert.deepEqual(errors,[],'Nenhum erro JS deve ocorrer ao navegar nos 4 caminhos');
 console.log('PASSOU: criar desenho, importar PDF, DXF 3 etapas, DXF único em construção e retornos.');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}