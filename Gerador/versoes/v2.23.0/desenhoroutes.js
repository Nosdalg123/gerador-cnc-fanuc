/* Desenho da peça v2.22: roteador visual, preserva importadores anteriores sem misturá-los. */
(function(root){
'use strict';
const $=s=>document.querySelector(s);
const modules={manual:'#pdfManual',pdf:'#pdfPanel',dxf:'#dxfWizard',unico:'#desenhoUnicoPanel',legacy:'#dxfPanel'};
const titles={manual:'Criar desenho · editor manual',pdf:'Importar PDF',dxf:'Importar DXF · assistente em 3 etapas',unico:'Importar DXF único · Em construção',legacy:'Importador DXF anterior'};
function show(which){
 if(which!=='home'&&!modules[which])return;
 for(const [id,selector] of Object.entries(modules)){
  const node=$(selector);if(node)node.hidden=id!==which;
 }
 $('#desenhoLanding').hidden=which!=='home';
 $('#desenhoModuleHeader').hidden=which==='home';
 if(which!=='home')$('#desenhoModuleTitle').textContent=titles[which];
 $('#view-desenho').dataset.rota=which;
}
function open(which,{newDrawing=false}={}){
 if(which==='manual'){
  if(newDrawing)$('#dsNovo').click(); // usa a confirmação existente para preservar alterações não salvas
  root.CNCDesenhos?.mostrar();
 }else if(which==='pdf')$('#pdfModo').click();
 else if(which==='dxf')$('#dxfWizardModo').click();
 else if(which==='legacy')$('#dxfModo').click();
 show(which);
}
$('#desenhoCriar').addEventListener('click',()=>open('manual',{newDrawing:true}));
$('#desenhoImportarPDF').addEventListener('click',()=>open('pdf'));
$('#desenhoImportarDXF').addEventListener('click',()=>open('dxf'));
$('#desenhoImportarUnico').addEventListener('click',()=>open('unico'));
$('#desenhoInicio').addEventListener('click',()=>show('home'));
$('#desenhoUnicoVoltar').addEventListener('click',()=>show('home'));
for(const id of ['#pdfVoltar','#dxfVoltar','#wClose']){
 const el=$(id);if(el)el.addEventListener('click',()=>show('home'));
}
// Os acionadores antigos permanecem funcionalmente separados e acessíveis ao código legado.
$('#pdfModo').addEventListener('click',()=>show('pdf'));
$('#dxfWizardModo').addEventListener('click',()=>show('dxf'));
$('#dxfModo').addEventListener('click',()=>show('legacy'));
// Entrada do menu sempre apresenta os quatro caminhos.
$('#nav-desenho').addEventListener('click',()=>show('home'));
show('home');
root.CNCDrawingNavigator={open,home:()=>show('home'),getRoute:()=>$('#view-desenho').dataset.rota};
})(window);