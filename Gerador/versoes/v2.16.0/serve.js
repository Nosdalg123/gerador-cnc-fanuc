// servidor estatico minimo so para teste local (nao e necessario para uso normal: basta abrir index.html)
// POST /save?name=x.png grava o corpo (dataURL) em %TEMP%\cnc-shots (usado so para capturar o canvas em testes)
const http=require('http'),fs=require('fs'),path=require('path');
const DIR=path.join(require('os').tmpdir(),'cnc-shots');fs.mkdirSync(DIR,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.md':'text/plain; charset=utf-8'};
http.createServer((q,r)=>{
  if(q.method==='POST'&&q.url.startsWith('/save')&&true){
    const name=path.basename(new URL(q.url,'http://x').searchParams.get('name')||'shot.png');let b='';
    q.on('data',c=>b+=c);q.on('end',()=>{fs.writeFileSync(path.join(DIR,name),Buffer.from(b.replace(/^data:[^,]+,/,''),'base64'));r.end('ok')});return;}
  let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  const f=path.join(__dirname,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('404')}
  r.writeHead(200,{'Content-Type':types[path.extname(f)]||'text/plain'});r.end(d)})}).listen(5173);

