// Local preview server. Browser regression fixtures remain isolated in tests/server.cjs.
// Serves index.html, the web app manifest and anything under assets/ (never outside this folder).
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
function createServer(){return http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(p==='/'||p==='/index.html')p='/index.html';
  else if(!(p.startsWith('/assets/')||p==='/manifest.webmanifest'||p==='/sw.js')){res.writeHead(404);return res.end();}
  const file=path.join(__dirname,p);
  if(!file.startsWith(__dirname+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',TYPES[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
});}
module.exports={createServer};
if(require.main===module)createServer().listen(4173,'127.0.0.1',()=>console.log('Afterglow: http://127.0.0.1:4173'));
