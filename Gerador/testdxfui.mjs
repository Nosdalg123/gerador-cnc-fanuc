/* Smoke test da interface CAD no Chromium via Playwright.
   Executar: npm install --no-save playwright && npx playwright install chromium
   node testdxfui.mjs
   Usa somente um DXF sintético, sem enviar desenhos de fabricação.
*/
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let target;try{const pathPart=decodeURIComponent((req.url||'/').split('?')[0]);target=path.join(base,pathPart==='/'?'index.html':pathPart.slice(1));
  if(!target.startsWith(base+path.sep)&&target!==path.join(base,'index.html'))throw Error('invalid path');
 }catch(_){res.writeHead(400);res.end();return}
 fs.stat(target,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});fs.createReadStream(target).pipe(res);
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const group=(k,v)=>[String(k),String(v)];
const ent=(type,pairs)=>[...group(0,type),...pairs.flatMap(p=>group(...p))];
const h=[...group(0,'SECTION'),...group(2,'HEADER'),...group(9,'$INSUNITS'),...group(70,4),
 ...group(0,'ENDSEC'),...group(0,'SECTION'),...group(2,'ENTITIES')];
const L=(id,x,y,x2,y2)=>ent('LINE',[[5,id],[10,x],[20,y],[11,x2],[21,y2],[8,'0']]);
const C=(id,r)=>ent('CIRCLE',[[5,id],[10,400],[20,100],[40,r],[8,'0']]);
const dim=ent('DIMENSION',[[5,'dim1'],[70,160],[1,'<>'],[50,0],[13,50],[23,130],[14,200],[24,130],[10,125],[20,153]]);
const cad=[...h,...L('ln1',50,130,100,130),...L('ln2',100,130,150,125),...L('ln3',150,125,200,125),
 ...L('axis',50,100,200,100),...C('cc1',30),...C('cc2',25),...C('cc3',20),
 ...dim,...group(0,'ENDSEC'),...group(0,'EOF')].join('\r\n')+'\r\n';
let browser,passed=false;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 await page.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'load',timeout:30000});
 await page.evaluate(()=>{
  // O smoke exercita o importador isoladamente; autenticação possui testes próprios.
  const login=document.querySelector('#login');if(login){login.hidden=true;login.style.display='none'}
  document.querySelector('#view-desenho').hidden=false;document.querySelector('#dxfModo').click();
 });
 await page.locator('#dxfFile').setInputFiles({name:'synthetic-turning.dxf',mimeType:'application/dxf',buffer:Buffer.from(cad,'utf8')});
 await page.waitForTimeout(1000);
 console.log('Importação DXF no navegador — status:',await page.locator('#dxfStatus').innerText(),
  'erros:',errors,'console:',consoleErrors.slice(0,5));
 await page.waitForFunction(()=>document.querySelector('#dxfStatus').textContent.includes('DXF CAD carregado:'),null,{timeout:10000});
 assert.equal(await page.locator('#dxfSource svg').count(),1,'Prévia do CAD precisa aparecer');
 assert.equal(await page.locator('#dxfProjected svg').count(),1,'Projeção CNC precisa aparecer');
 const hasNaN=await page.locator('#dxfProjected svg path').evaluateAll(els=>els.some(e=>String(e.getAttribute('d')).includes('NaN')));
 assert(!hasNaN,'Geometria vetorial projetada não pode conter coordenadas NaN');
 assert(Number(await page.locator('#dxfAxis').inputValue())===100,'Eixo X0 sugerido pelos círculos');
 assert(await page.evaluate(()=>window.CNCDXFImport.getSelected().externo.size>0),'Proposta automática de perfil logo após importar');
 await page.locator('#dxfAuto').click();
 assert((await page.locator('#dxfChains button').count())>=1,'Cadeias independentes devem aparecer');
 await page.locator('#dxfZ0Left').click();
 assert.equal(await page.locator('#dxfFace').inputValue(),'esquerda');
 assert((await page.locator('#dxfProjected svg').innerText()).includes('Z0'),'Marcador Z0 no desenho');
 await page.locator('#dxfZ0Pending').click();
 assert.equal(await page.locator('#dxfFace').inputValue(),'');
 // Retângulo da seleção de vista precisa existir DURANTE o movimento do mouse.
 await page.locator('#dxfSelect').click();
 let box=await page.locator('#dxfSource svg').boundingBox();
 const pos=(x,y)=>({x:box.x+x/900*box.width,y:box.y+y/480*box.height});
 let p=pos(25,307),q=pos(375,419);
 await page.mouse.move(p.x,p.y);await page.mouse.down();
 await page.mouse.move(q.x,q.y,{steps:9});
 assert(Number(await page.locator('#dxfDragOverlay').getAttribute('width'))>50,'Retângulo visível durante o arraste');
 await page.mouse.up();
 assert((await page.locator('#dxfSource svg rect[stroke]').count())>=1,'Retângulo permanece visível ao selecionar a vista');
 assert((await page.locator('#dxfProjected [data-cad-segment]').count())>=3,'Entidades CAD interativas');
 const clickSegment=async id=>page.locator('#dxfProjected [data-cad-segment="'+id+'"]').evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 // Excluir uma linha sem alterar a fonte original e desfazer.
 await page.locator('input[name=dxfAssign][value=apagar]').check();
 await clickSegment('ln3:0');
 assert(await page.evaluate(()=>window.CNCDXFImport.getHidden().has('ln3:0')),'Exclusão por clique');
 assert.equal(await page.locator('#dxfProjected [data-cad-segment="ln3:0"]').count(),0);
 await page.locator('#dxfUndo').click();
 assert.equal(await page.locator('#dxfProjected [data-cad-segment="ln3:0"]').count(),1,'Desfazer exclusão');
 // Estender uma LINE e desfazer sem afetar original.
 await page.locator('input[name=dxfAssign][value=estender]').check();
 await clickSegment('ln3:0');
 await page.locator('#dxfExtendAmount').fill('7');
 await page.locator('#dxfExtendApply').click();
 assert.equal(await page.evaluate(()=>window.CNCDXFImport.getModel().geometry.find(x=>x.id==='ln3').b[0]),207);
 assert.equal(await page.evaluate(()=>window.CNCDXFImport.getOriginal().geometry.find(x=>x.id==='ln3').b[0]),200);
 await page.locator('#dxfUndo').click();
 assert.equal(await page.evaluate(()=>window.CNCDXFImport.getModel().geometry.find(x=>x.id==='ln3').b[0]),200);
 // Apagar por retângulo visível na projeção.
 await page.locator('input[name=dxfAssign][value=quadro]').check();
 const pathBox=await page.locator('#dxfProjected [data-cad-segment="ln2:0"]').boundingBox();
 assert(pathBox,'Linha para exclusão por retângulo deve aparecer');
 let x=pathBox.x+pathBox.width/2,y=pathBox.y+Math.max(pathBox.height/2,1);
 await page.mouse.move(x-11,y-15);await page.mouse.down();await page.mouse.move(x+11,y+15,{steps:8});
 assert(Number(await page.locator('#dxfProjected #dxfDragOverlay').getAttribute('width'))>5,'Quadro de exclusão visível durante o arraste');
 await page.mouse.up();
 assert(await page.evaluate(()=>window.CNCDXFImport.getHidden().size>=1),'Exclusão por quadro efetiva');
 await page.locator('#dxfNome').fill('Smoke de geometria CAD');
 await page.locator('#dxfSaveDraft').click();
 assert((await page.locator('#dxfSaved').innerText()).includes('Rascunho'),'Rascunho precisa persistir');
 const hiddenBefore=await page.evaluate(()=>window.CNCDXFImport.getHidden().size);
 await page.locator('#dxfOpenDraft').click();
 assert.equal(await page.evaluate(()=>window.CNCDXFImport.getHidden().size),hiddenBefore,'Exclusões persistem no rascunho CAD');
 assert(await page.locator('#dxfSaveCNC').isDisabled(),'Sem Z0 não libera CNC');
 assert.equal(errors.length,0,'Sem erro de JavaScript no navegador: '+errors.join('; '));
 console.log('Chromium DXF UI: prévia original, projeção, eixo, cadeias, rascunho e trava CNC aprovados.');
 passed=true;
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
if(!passed)process.exitCode=1;
