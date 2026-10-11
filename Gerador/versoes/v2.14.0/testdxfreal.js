/* Regressão opcional dos DXFs ORIGINAIS sem copiá-los ao repositório.
 * Uso:
 * node testdxfreal.js "/caminho/Disco 7...DXF" "/caminho/Copo 7...DXF"
 * Valida as entidades nativas, cotas, centro do eixo e separação das vistas.
 */
const fs=require('fs'),assert=require('assert');
const DX=require('./dxfcore.js'),P=require('./dxfprofile.js'),C=require('./dxfchains.js');
const specs=[
 {label:'Disco 7',entities:116,dims:15,axis:174.5355806289,radii:[20,3.5]},
 {label:'Copo 7',entities:190,dims:31,axis:268.3605253536,radii:[3,6.5]}
];
const args=process.argv.slice(2);
if(args.length!==2){console.error('Informe o caminho de cada DXF: Disco e Copo.');process.exit(2)}
args.forEach((file,i)=>{
 const text=new TextDecoder('windows-1252').decode(fs.readFileSync(file));
 const doc=DX.read(text),exp=specs[i],hint=P.sectionSuggestion(doc);
 assert.strictEqual(doc.units,4,exp.label+' precisa ter unidade mm');
 assert.strictEqual(doc.geometry.length,exp.entities,exp.label+' entidades geométricas');
 assert.strictEqual(doc.dimensions.length,exp.dims,exp.label+' DIMENSION');
 assert(hint&&Math.abs(hint.axis-exp.axis)<.02,'Eixo detectado: '+exp.label);
 assert(hint.rect.x2<hint.front.x,'Vista frontal não deve entrar no recorte: '+exp.label);
 const originalR=doc.dimensions.filter(d=>d.kind===4).map(d=>d.measure).filter(v=>v>0);
 exp.radii.forEach(r=>assert(originalR.some(v=>Math.abs(v-r)<.02),'Raio R'+r+' não encontrado no CAD '+exp.label));
 const sect=P.segments(doc.geometry,hint.rect),upper=sect.filter(s=>P.above(s,hint.axis));
 const graph=C.build(upper,{axis:hint.axis,tol:.16});
 assert(graph.chains.length>0,'Cadeias geométricas do '+exp.label);
 assert(graph.bifurcations.length>0,'Bifurcações reais devem ser detectadas no '+exp.label);
 console.log(exp.label+': '+doc.geometry.length+' entidades; '+doc.dimensions.length+' cotas; '+graph.chains.length+' cadeias; '+
  graph.bifurcations.length+' bifurcações; centro Y='+hint.axis.toFixed(4)+' — PASSOU.');
});
