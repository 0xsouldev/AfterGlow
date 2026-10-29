// Local preview server. Browser regression fixtures remain isolated in tests/server.cjs.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
function createServer(){return http.createServer((req,res)=>{
  const files={'/':'index.html','/index.html':'index.html'};
  for(const name of ['app.js','styles.css','audio-core.js','audio-worker.js','audio-worklet.js'])files['/assets/'+name]='assets/'+name;
  const file=files[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(__dirname,file)));
});}
module.exports={createServer};
if(require.main===module)createServer().listen(4173,'127.0.0.1',()=>console.log('Afterglow: http://127.0.0.1:4173'));
