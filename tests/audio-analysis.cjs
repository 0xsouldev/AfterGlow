const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {BeatGrid,DropDetector,AudioAnalysis}=require('../assets/audio-core.js');
for(const bpm of [70,90,120,140,174]){
 const grid=new BeatGrid(),period=60/bpm;let result,predicted=0;
 for(let i=0;i<3000;i++){const t=i/100,hit=Math.floor((t+0.0001)/period)!==Math.floor((t-0.01+0.0001)/period);result=grid.update(t,hit && Math.round(t/period)!==24,true);predicted+=Number(result.predicted);}
 assert.ok(Math.abs(result.bpm-bpm)<3,`${bpm}: ${result.bpm}`);assert.ok(result.confidence>.55);assert.ok(predicted>0);
 for(let i=0;i<500;i++)result=grid.update(30+i/100,false,false);
 assert.equal(result.confidence,0);assert.equal(result.beat,false);
 grid.reset();assert.equal(grid.period,0);
}
const drops=new DropDetector();let triggers=[];
for(let i=0;i<2400;i++){
 const t=i/100,breakdown=t>=8 && t<11;
 const f={db:breakdown?-32:-14,bassDb:breakdown?-45:-20,kick:!breakdown && i%50===0,novelty:i%50===0?.3:0};
 const r=drops.update(t,f,.5,1);if(r.strength)triggers.push(t);
}
assert.equal(triggers.length,1);assert.ok(triggers[0]>=11 && triggers[0]<11.1);
for(const rate of [44100,48000]){
 const model=new AudioAnalysis(rate);let hits=0,last;
 for(let off=0;off<rate*12;off+=512){const block=new Float32Array(512);for(let i=0;i<512;i++){const t=(off+i)/rate,phase=t%.5;block[i]=.4*Math.sin(2*Math.PI*80*t)*Math.exp(-phase*45)+.002*Math.sin(2*Math.PI*440*t);}last=model.process(block,(off+512)/rate);hits+=Number(last.kick);}
 assert.ok(hits>=20 && hits<=26,`${rate}: ${hits} kicks`);assert.ok(Math.abs(last.bpm-120)<3,`${rate}: ${last.bpm}`);
 model.reset();const quiet=model.process(new Float32Array(512),1);assert.equal(quiet.beat,false);assert.equal(quiet.drop,0);
}
const app=fs.readFileSync(require.resolve('../assets/app.js'),'utf8'),context={};vm.createContext(context);
vm.runInContext(app.split('// LYRIC_MATCH_HELPERS_START')[1].split('// LYRIC_MATCH_HELPERS_END')[0],context);
const song={title:'One Song',artist:'Artist'};
assert.ok(context.lyricMatchScore(song,{trackName:'One Song',artistName:'Artist',duration:201},200)>.9);
for(const hit of [{trackName:'Other Song',artistName:'Artist',duration:200},{trackName:'One Song (Live)',artistName:'Artist',duration:200},{trackName:'One Song',artistName:'Someone Else',duration:200},{trackName:'One Song',artistName:'Artist',duration:280}])assert.equal(context.lyricMatchScore(song,hit,200),-1);
context.clamp=(x,a,b)=>Math.min(b,Math.max(a,x));context.heardWord=(_ly,_words,x)=>x;
vm.runInContext(app.slice(app.indexOf('function syl('),app.indexOf('const WLOCK')),context);
vm.runInContext(app.slice(app.indexOf('function wordAtRaw('),app.indexOf('function typedSoFar(')),context);
const words=['hold','this','note','now'];
assert.ok(context.wordAtRaw({cur:{},start:0,end:10,pos:3},words).wi<3,'line estimate must not finish early');
assert.equal(context.wordAtRaw({cur:{wt:[0,2,7,9]},start:0,end:10,pos:8},words).wi,2);
console.log('PASS audio tempo, missing beats, silence, reset, contextual drops, PCM at 44.1/48kHz, lyric matching and timing');
