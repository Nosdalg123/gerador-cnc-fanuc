/* Regressão da estrutura HTML e apresentação do banco de ferramentas. */
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
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.locator('#loginUser').fill('admin');await page.locator('#loginSenha').fill('admin');
 await page.locator('#loginForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#login').hidden);
 assert.ok(await page.evaluate(()=>['gerador','desenho','sim','cfg','ferr'].every(id=>{
  const el=document.querySelector('#view-'+id);return el.parentElement.tagName==='MAIN'&&el.closest('.content')===document.querySelector('.shell > .content');
 })),'Todos os módulos dentro de main/content; fechamento extra não pode deslocar Ferramentas');
 for(const [width,height] of [[1366,768],[1024,600],[360,800],[390,844],[844,390],[390,380]]){
  await page.setViewportSize({width,height});await page.locator('#nav-ferr').click();
  const layout=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
   const table=document.querySelector('#tbFerr');
   return {card:box('#view-ferr > .card'),side:box('.side'),table:box('#tbFerr'),pageWidth:document.documentElement.scrollWidth,
    cards:!!table.tBodies[0]&&getComputedStyle(table.tBodies[0].rows[0]).display==='grid',
    cellsFit:[...table.querySelectorAll('td')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})};
  });
  assert.ok(layout.pageWidth<=width+1,'Página sem transbordamento');
  if(width>960){assert.ok(layout.card.left>=layout.side.right,'Ferramentas fora da coluna do menu');assert.ok(layout.card.width>width-270,'Banco ocupa área central inteira');}
  else{assert.ok(layout.cards&&layout.cellsFit&&layout.table.width<=layout.card.width,'Cartões e todos os campos cabem no celular');}
  await page.locator('#ferrNova').click();
  for(let i=0;i<8;i++){
   await page.locator('#tipoGrid .tipo-card').nth(i).click();
   assert.equal(await page.locator('#tipoGrid [aria-checked="true"]').count(),1);
  }
  await page.locator('#frmFerr [name="obs"]').fill('Observação longa para conferir o último campo da ferramenta');
  const dialog=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
   return {dlg:box('#dlgFerr'),row:box('#frmFerr > .row'),title:box('#dlgTitulo'),actions:box('#frmFerr .dlg-actions'),obs:box('#frmFerr [name="obs"]')};
  });
  assert.ok(dialog.dlg.top>=0&&dialog.dlg.bottom<=height+1&&dialog.dlg.left>=0&&dialog.dlg.right<=width+1,'Janela dentro da tela');
  assert.ok(dialog.row.top>=dialog.title.bottom-1&&dialog.row.bottom<=dialog.actions.top+1&&dialog.obs.bottom<=dialog.row.bottom+1,'Campos e ações sem sobreposição, inclusive viewport reduzido pelo teclado');
  await page.locator('#dlgFerrCancel').click();
  console.log(`Ferramentas ${width}×${height}: área central, campos, ações e janela — PASSOU.`);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#ferrNova').click();
 const name='FERRAMENTA DE TESTE COM NOME COMPRIDO PARA CONFERIR A QUEBRA DE TEXTO NO CELULAR';
 await page.locator('#frmFerr [name="nome"]').fill(name);await page.locator('#frmFerr [name="t"]').fill('0909');
 await page.locator('#frmFerr button[type="submit"]').click();
 let row=page.locator('#tbFerr tbody tr').filter({hasText:name});
 await row.getByRole('button',{name:'Editar',exact:true}).click();assert.equal(await page.locator('#frmFerr [name="nome"]').inputValue(),name);await page.locator('#dlgFerrCancel').click();
 await row.getByRole('button',{name:'Duplicar',exact:true}).click();assert.equal(await row.count(),2);
 await row.filter({hasText:'(COPIA)'}).getByRole('button',{name:'Excluir',exact:true}).click();assert.equal(await row.count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390),'Nome longo não aumenta largura da página');
 assert.deepEqual(errors,[],'Nenhum erro JavaScript');
 console.log('OK: salvar, editar, duplicar e excluir preservados em cartões móveis.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
