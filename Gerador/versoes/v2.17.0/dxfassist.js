/* Assistente CAD: vistas candidatas e reparos geométricos conservadores.
   Não muda a peça sem escolha explícita; não deduz Z0 nem elimina curvas. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./dxfcore.js'),require('./dxfprofile.js'));
 else root.CNCDXFAssistente=factory(root.CNCDXF,root.CNCDXFPerfil);
})(typeof self!=='undefined'?self:this,function(DX,P){
'use strict';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function views(doc){
 if(!doc)return [];
 const result=[],main=P.sectionSuggestion(doc);
 if(main)result.push({id:'lateral',name:'Seção principal',hint:'Perfil longitudinal sugerido',rect:main.rect,axis:main.axis,profile:true});
 if(main&&main.front){
  const {x,y,max}=main.front,k=1.13,rect={x1:x-max*k,y1:y-max*k,x2:x+max*k,y2:y+max*k};
  result.push({id:'frontal',name:'Vista frontal',hint:'Referência circular, sem perfil CNC',rect,axis:null,profile:false});
 }
 const b=DX.bounds(doc.geometry);
 if(b)result.push({id:'completo',name:'Desenho completo',hint:'Conferir outras vistas e notas',rect:{x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2},axis:null,profile:false});
 return result;
}
function repairOptions(segments,selectedIds,limit=3){
 // Sugere apenas continuidade entre PONTAS de segmentos já escolhidos.
 // Tolerâncias em milímetros: desvio colinear <=0,05, lacuna (0,05;3].
 const chosen=(segments||[]).filter(s=>selectedIds.has(s.uid)),lines=chosen.filter(s=>s.kind==='line'&&s.a&&s.b),candidates=[];
 for(const s of lines){
  const d=distance(s.a,s.b);if(d<.0001)continue;
  const ux=(s.b[0]-s.a[0])/d,uy=(s.b[1]-s.a[1])/d;
  for(const which of ['ini','fim']){
   const end=which==='fim'?s.b:s.a,sign=which==='fim'?1:-1;
   const choices=[];
   for(const other of chosen){
    if(other.uid===s.uid)continue;
    const pts=DX.sample(other,1);
    for(const p of [pts[0],pts[pts.length-1]]){
     if(!p)continue;
     const vx=p[0]-end[0],vy=p[1]-end[1];
     const advance=sign*(vx*ux+vy*uy),normal=Math.abs(vx*uy-vy*ux);
     if(advance>.05&&advance<=3&&normal<=.05)
       choices.push({target:p,mm:advance,to:other.uid,normal});
    }
   }
   choices.sort((a,b)=>a.mm-b.mm);
   // Não inferir um ponto quando múltiplos destinos são igualmente possíveis.
   if(choices.length&&(!choices[1]||choices[1].mm-choices[0].mm>.1))
    candidates.push({id:s.uid+'-'+which,uid:s.uid,which,...choices[0]});
  }
 }
 candidates.sort((a,b)=>a.mm-b.mm);
 return candidates.slice(0,limit);
}
function diagnostics({external,internal,doc,selected,hidden,axis,rect}){
 const problems=[];
 if(!rect)return [{type:'view',title:'Escolha a vista longitudinal',detail:'O sistema não conseguiu isolar um perfil com segurança.'}];
 if(!Number.isFinite(axis))problems.push({type:'axis',title:'Eixo da peça não confirmado',detail:'Selecione a seção longitudinal ou ajuste o eixo em Edição avançada.'});
 if(!external?.selected?.length)problems.push({type:'profile',title:'Contorno externo ainda não encontrado',detail:'Clique nas linhas que pertencem à superfície externa.'});
 for(const [type,a] of [['externo',external],['interno',internal]]){
  if(!a?.selected?.length)continue;
  const c=a.connection||{};
  if(c.components>1)problems.push({type:'gap',title:type==='externo'?'Contorno externo interrompido':'Contorno interno interrompido',
   detail:c.components+' grupos de linhas separados. Confira as extremidades destacadas.',point:c.gaps?.[0]});
  if(c.branches?.length)problems.push({type:'branch',title:'Linhas se cruzam ou se ramificam',
   detail:c.branches.length+' ramificação(ões). Retire as linhas auxiliares ou confira a sequência.',point:c.branches[0]});
  if(c.gaps?.length>2&&c.components===1)problems.push({type:'gap',title:'Há pontas abertas no perfil',
   detail:c.gaps.length+' extremidades abertas. Clique numa ponta para inspecionar.',point:c.gaps[0]});
  if(a.selected.some(s=>s.kind==='arc'))problems.push({type:'arc',title:'Raios identificados no CAD',
   detail:'Os arcos foram preservados, mas ainda exigem associação correta aos cantos CNC.'});
 }
 const geometry=doc&&rect?DX.cut(doc.geometry,rect):[];
 const splines=geometry.filter(e=>e.type==='SPLINE'||e.type==='ELLIPSE');
 if(splines.length)problems.push({type:'curve',title:'Curvas especiais precisam de revisão',
  detail:splines.length+' SPLINE/ELLIPSE na vista selecionada.'});
 const threads=doc&&rect?DX.annotations(doc.entities,rect,26).filter(e=>/\b(?:M\s*\d+|ROSCA|FURO|THREAD)\b/i.test(e.text||'')):[];
 if(threads.length)problems.push({type:'thread',title:'Roscas ou furos anotados',
  detail:'Conferir '+threads.length+' indicação(ões) do CAD antes de gerar código.'});
 if(hidden?.size)problems.push({type:'removed',title:'Linhas removidas da cópia',
   detail:hidden.size+' entidade(s) ocultada(s). O arquivo original permanece preservado.'});
 return problems;
}
return {views,repairOptions,diagnostics};
});
