const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium}=require('playwright'),{createServer}=require('../dev-server.cjs');
const app=fs.readFileSync(require.resolve('../assets/app.js'),'utf8');
const c={clamp:(x,a,b)=>Math.min(b,Math.max(a,x)),heardWord:(_l,_w,x)=>x};vm.createContext(c);
vm.runInContext(app.split('// LYRIC_MATCH_HELPERS_START')[1].split('// LYRIC_MATCH_HELPERS_END')[0],c);
const hit={trackName:'Sunflower',artistName:'Post Malone, Swae Lee',duration:158};
for(const title of ['Sunflower','Sunflower (feat. Swae Lee)','Sunflower (ft. Swae Lee)','Sunflower (with Swae Lee)','Sunflower (prod. Someone)','Sunflower (Spider-Man: Into the Spider-Verse)','Sunflower [Soundtrack]','Sunflower - Single','Sunflower - EP','Sunflower - Remastered (2024)'])assert.ok(c.lyricMatchScore({title,artist:'Post Malone'},hit,158)>=.75,title);
for(const version of ['Live','Remix','Acoustic','Instrumental','Sped Up','Slowed','Karaoke'])assert.equal(c.lyricMatchScore({title:`Sunflower (${version})`,artist:'Post Malone'},hit,158),-1,version);
vm.runInContext(app.slice(app.indexOf('function syl('),app.indexOf('const WLOCK')),c);
vm.runInContext(app.slice(app.indexOf('function wordAtRaw('),app.indexOf('function typedSoFar(')),c);
assert.equal(c.wordAtRaw({cur:{},start:0,end:10,pos:3},['hold','this','note','now']).wi,3);
assert.equal(c.wordAtRaw({cur:{wt:[0,2,7,9]},start:0,end:10,pos:8},['hold','this','note','now']).wi,2);
Object.assign(c,{settings:{lyrics:true},attOn:()=>true,aplOn:()=>false,ATT:{lines:[{t:1,s:'first'},{t:3,s:'second'}]},songPos:()=>.75,lyricOffset:()=>.3,lyricsNow:()=>{},LYR:{sync:[{t:1,s:'first'},{t:3,s:'second'}]}});
vm.runInContext(app.slice(app.indexOf('function lyricLine('),app.indexOf('function songNow(')),c);
assert.equal(c.lyricLine().i,0);assert.ok(Math.abs(c.lyricLine().pos-.9)<1e-9);
c.attOn=()=>false;c.songPos=()=>.71;assert.equal(c.lyricLine().i,0);assert.ok(Math.abs(c.lyricLine().pos-.86)<1e-9);
console.log('PASS featured/subtitled titles, version rejection, compressed karaoke span, Apple/LRCLIB early bias');
function wav(kind){
 const rate=48000,n=rate*40,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
 let random=1234;
 for(let i=0;i<n;i++){
  const t=i/rate,quiet=kind==='A'?t>=24&&t<32:kind==='B'?t<16:false;
  const origin=kind==='A'&&t>=32?32:kind==='B'&&t>=16?16:0,p=(t-origin)%(60/124);
  random=(1664525*random+1013904223)>>>0;
  // Audible quiet pad, above the app's near-silence reset threshold.
  const pad=.02*Math.sin(2*Math.PI*330*t)+.01*Math.sin(2*Math.PI*440*t);
  const full=.32*Math.sin(2*Math.PI*75*t)*Math.exp(-p*32)+.1*Math.sin(2*Math.PI*55*t)+.055*(random/4294967296*2-1)*Math.exp(-(p%(.5*60/124))*65);
  b.writeInt16LE(Math.round(32767*(pad+(quiet?0:full))),44+i*2);
 }
 return {name:'Synthetic '+kind+'.wav',mimeType:'audio/wav',buffer:b};
}
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch();
 try{await Promise.all([['A',false],['B',false],['D',false],['B',true]].map(async([kind,inline])=>{
  const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  const instrumented=app.replace(/\}\)\(\);\s*$/,`window.pr2={AUDIO,ASSETS,settings,fireDrop,getAudio:()=>audioEl};})();`);
  await page.route('**/*',route=>{
   const u=route.request().url();requests.push(u);
   if(inline && new URL(u).origin===url && new URL(u).pathname==='/'){
    let html=fs.readFileSync(require.resolve('../index.html'),'utf8').replace('<link rel="stylesheet" href="./assets/styles.css">',()=>'<style>'+fs.readFileSync(require.resolve('../assets/styles.css'),'utf8')+'</style>').replace('<script src="./assets/app.js"></script>',()=>'<script>'+instrumented+'</script>');
    return route.fulfill({contentType:'text/html',body:html});
   }
   if(!inline && u===url+'/assets/app.js')return route.fulfill({contentType:'text/javascript',body:instrumented});
   if(u.startsWith(url) && (!inline || !u.includes('/assets/')))return route.continue();return route.abort();
  });
  await page.goto(url+'/#debug');assert.equal(await page.locator('[data-mode]').count(),65);
  await page.evaluate(()=>{pr2.settings.quality='low';pr2.settings.lyrics=false;});
  await page.locator('#fileInput').setInputFiles(wav(kind));
  await page.waitForFunction(()=>window.pr2.getAudio()?.currentTime>39.5,null,{timeout:55000});
  const result=await page.evaluate(()=>({ready:pr2.AUDIO.ready,assets:pr2.ASSETS,events:window.__ag.drops||[],why:window.__ag.why||[],end:performance.now(),pos:pr2.getAudio().currentTime}));
  // Convert performance-clock event times to playback times (file starts after page load).
  const times=result.events.map(t=>result.pos-(result.end-t)/1000);
  assert.deepEqual(errors,[]);assert.equal(result.ready,!inline);
  if(inline){assert.equal(result.assets,null);assert.equal(requests.some(u=>/audio-(worker|worklet|core)\.js/.test(u)),false);}
  if(kind==='D')assert.equal(times.length,0,JSON.stringify({times,why:result.why}));
  else{const target=kind==='A'?32:16;assert.equal(times.length,1,JSON.stringify({times,why:result.why}));assert.ok(Math.abs(times[0]-target)<.75,JSON.stringify(times));}
  // Same-frame and delayed duplicate proposals must both be suppressed by the shared cooldown.
  const cooldown=await page.evaluate(()=>{const n=performance.now()+10000;return [pr2.fireDrop(n,.8,'test'),pr2.fireDrop(n,1,'duplicate'),pr2.fireDrop(n+100,1,'duplicate')];});assert.deepEqual(cooldown,[true,false,false]);
  console.log('PASS synthetic '+kind+(inline?' inline fallback':' worklet + analyser')+': '+JSON.stringify(times));await page.close();
 }));}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
