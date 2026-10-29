/* Pure audio-clock analysis, shared by the worker and offline regression tests. */
(function(root) {
'use strict';
const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const percentile = (xs,p) => { const a=xs.slice().sort((a,b)=>a-b); return a[Math.floor((a.length-1)*p)] || 0; };
class BeatGrid {
  constructor(){ this.reset(); }
  reset(){ this.period=0; this.confidence=0; this.next=0; this.last=-10; this.hits=[]; this.candidate=0; this.votes=0; this.lastFit=0; }
  update(t, hit, audible){
    if (hit) { this.hits.push(t); this.hits=this.hits.filter(x=>t-x<8); }
    if (hit && t-this.lastFit>0.25 && this.hits.length>=6) {
      this.lastFit=t;
      // Compare tempo and octave alternatives using phase agreement AND beat occupancy.
      const candidates=[];
      for(let bpm=55;bpm<=210;bpm++) {
        const p=60/bpm; let best=0;
        for(const anchor of this.hits.slice(-4)) {
          let aligned=0; const occupied=new Set();
          for(const x of this.hits) { const q=(x-anchor)/p, n=Math.round(q); if(Math.abs(q-n)<0.13){ aligned++; occupied.add(n); } }
          const coverage=occupied.size/Math.max(1,Math.round((t-this.hits[0])/p)+1);
          const score=aligned/this.hits.length*0.6+Math.min(1,coverage)*0.4;
          best=Math.max(best,score);
        }
        // A small continuity preference, never enough to conceal a clear tempo change.
        candidates.push({p,score:best+(this.period && Math.abs(p/this.period-1)<0.04?0.035:0)});
      }
      candidates.sort((a,b)=>b.score-a.score); const best=candidates[0];
      if(best.score>0.72) {
        if(this.period && Math.abs(best.p/this.period-1)<0.04){ this.period += (best.p-this.period)*0.18; this.confidence=Math.min(1,this.confidence+0.1); }
        else {
          if(Math.abs(best.p/this.candidate-1)<0.04) this.votes++; else {this.candidate=best.p;this.votes=1;}
          const octave=this.period && (Math.abs(best.p/this.period-2)<0.1 || Math.abs(best.p/this.period-0.5)<0.05);
          if(this.votes >= (octave?6:3)){this.period=best.p;this.confidence=0.65;this.next=t+this.period;this.votes=0;}
        }
      } else this.confidence*=0.85;
    }
    const latest=this.hits.at(-1) ?? -10;
    if(!audible || t-latest>Math.max(1.5,3*(this.period||0.5))) this.confidence=Math.max(0,this.confidence-0.015);
    let beat=false, predicted=false;
    if(this.period && this.confidence>=0.55 && audible) {
      if(hit) {
        const nearest=this.next+Math.round((t-this.next)/this.period)*this.period;
        if(Math.abs(t-nearest)<this.period*0.18) {
          if(t-this.last>this.period*0.65) beat=true;
          this.next=nearest+this.period+(t-nearest)*0.2;
        }
      }
      if(t>=this.next) { if(t-this.last>this.period*0.65){beat=true;predicted=true;} this.next+=this.period; }
      if(this.next<t-this.period) this.next=t+this.period;
    } else if(hit && t-this.last>0.18) beat=true;
    if(beat) this.last=t;
    return {beat,predicted,bpm:this.period?60/this.period:0,confidence:this.confidence};
  }
}
class DropDetector {
  constructor(){ this.reset(); }
  reset(){ this.history=[];this.phase='normal';this.since=0;this.last=-30;this.quiet=0;this.lastBlock=-1;this.kicks=[];this.armed=null; }
  update(t, f, period, confidence, sensitivity=1){
    const {db,bassDb,kick,novelty}=f;
    if(kick) this.kicks.push(t); this.kicks=this.kicks.filter(x=>t-x<4);
    if(db < -65) { if(!this.quiet)this.quiet=t; if(t-this.quiet>1){this.reset();this.quiet=t;} return {strength:0,phase:this.phase}; }
    this.quiet=0;
    const history=this.history.filter(x=>t-x.t<24);
    const full=percentile(history.map(x=>x.db),0.75), bass=percentile(history.map(x=>x.bassDb),0.75);
    const beatSeconds=confidence>0.6?period:0.5, cooldown=Math.max(3,beatSeconds*8);
    let strength=0;
    if(history.length>=16 && t-this.last>cooldown) {
      const recent=history.filter(x=>t-x.t<Math.max(0.6,beatSeconds*2));
      const recentDb=mean(recent.map(x=>x.db)), recentBass=mean(recent.map(x=>x.bassDb));
      const dip=(full-db>5 && bass-bassDb>6);
      if(this.phase==='normal' && dip){this.phase='breakdown';this.since=t;}
      if(this.phase==='breakdown' && t-this.since>=Math.max(0.5,beatSeconds)) {
        this.phase='armed'; this.armed={db:recentDb,bass:recentBass,t};
      }
      if(this.phase==='armed') {
        const rise=clamp((db-this.armed.db)/10,0,1), low=clamp((bassDb-this.armed.bass)/12,0,1);
        const drums=kick?1:Math.min(1,this.kicks.filter(x=>t-x<beatSeconds).length/2);
        const texture=clamp(novelty/0.12,0,1);
        const score=0.3*rise+0.3*low+0.25*drums+0.15*texture;
        // Require both broadband recovery and drums; one bass note cannot trigger a drop.
        if(rise>0.35 && drums>0 && db>=full-6 && score>clamp(0.76/sensitivity,0.55,0.95)) {
          strength=clamp(score,0.35,1);this.last=t;this.phase='cooldown';this.armed=null;
        } else if(t-this.armed.t>Math.max(10,beatSeconds*32)){this.phase='normal';this.armed=null;}
      }
      if(this.phase==='breakdown' && !dip && t-this.since<beatSeconds) this.phase='normal';
    }
    if(this.phase==='cooldown' && t-this.last>cooldown)this.phase='normal';
    if(t-this.lastBlock>=0.1){history.push({t,db,bassDb});this.lastBlock=t;}
    this.history=history;
    return {strength,phase:this.phase};
  }
}
class AudioAnalysis {
  constructor(rate){ this.rate=rate;this.size=2048;this.reset(); }
  reset(){
    this.samples=new Float32Array(this.size);this.re=new Float64Array(this.size);this.im=new Float64Array(this.size);this.previous=new Float64Array(this.size/2);
    this.hist=[[],[],[]];this.lastHits=[-10,-10,-10];this.grid=new BeatGrid();this.drop=new DropDetector();this.count=0;this.lastTime=0;this.lastSource='';this.on=[[],[]];this.ref=[0,0];this.pick='kick';this.cand='';this.candSince=0;
  }
  process(block,t,options={}) {
    if(this.lastTime && (t-this.lastTime>0.5 || t<this.lastTime)) this.reset(); this.lastTime=t;
    const N=this.size;this.samples.copyWithin(0,block.length);this.samples.set(block,N-block.length);
    let power=0;for(let i=0;i<N;i++){const x=this.samples[i];power+=x*x;this.re[i]=x*(0.5-0.5*Math.cos(2*Math.PI*i/(N-1)));this.im[i]=0;}
    // In-place radix-2 FFT, on the worker rather than the audio or rendering thread.
    for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const x=this.re[i];this.re[i]=this.re[j];this.re[j]=x;}}
    for(let len=2;len<=N;len<<=1){const a=-2*Math.PI/len;for(let i=0;i<N;i+=len)for(let j=0;j<len/2;j++){
      const c=Math.cos(a*j),s=Math.sin(a*j),u=i+j,v=u+len/2,tr=this.re[v]*c-this.im[v]*s,ti=this.re[v]*s+this.im[v]*c;
      this.re[v]=this.re[u]-tr;this.im[v]=this.im[u]-ti;this.re[u]+=tr;this.im[u]+=ti;
    }}
    const energy=[0,0,0],flux=[0,0,0];let total=0,novel=0;
    for(let i=1;i<N/2;i++){
      const hz=i*this.rate/N, mag=Math.hypot(this.re[i],this.im[i])/N, d=Math.max(0,mag-this.previous[i]);
      this.previous[i]=mag;total+=mag;novel+=d;
      const b=hz>=35&&hz<180?0:hz>=180&&hz<4500?1:hz>=6000&&hz<16000?2:-1;
      if(b>=0){energy[b]+=mag*mag;flux[b]+=d;}
    }
    const db=10*Math.log10(power/N+1e-12), hits=[];
    for(let b=0;b<3;b++){
      const h=this.hist[b].filter(x=>t-x.t<0.7), values=h.map(x=>x.v), med=percentile(values,0.5), mad=percentile(values.map(x=>Math.abs(x-med)),0.5);
      const gap=b===0?0.19:b===1?0.13:0.075;
      hits[b]=h.length>=12 && db>-65 && flux[b]>Math.max(0.001,med+3*mad)*1.35 && t-this.lastHits[b]>gap;
      if(hits[b])this.lastHits[b]=t;
      h.push({t,v:flux[b]});this.hist[b]=h;
    }
    const source=options.source||'auto';
    // Auto source: follow whichever layer (kick, snare, or both together) has been the steadiest over the last 8 s,
    // not just "any kick lately". A new winner has to hold for 3 s before we switch, so it doesn't flip-flop.
    for(let b=0;b<2;b++){if(hits[b])this.on[b].push({t,v:flux[b]});this.on[b]=this.on[b].filter(x=>t-x.t<8);}
    // only the strong hits count: the onset detector also fires on kick tails and snare spill
    const strong=(a,cut,b)=>{const top=percentile(a.map(x=>x.v),0.85),blk=block.length/this.rate;this.ref[b]=Math.max(top,this.ref[b]*Math.pow(0.5,blk/30));   // remembers how hard real hits land for ~30 s, so leftovers can't pass as hits when a layer drops out
      return a.filter(x=>x.v>=Math.max(top,this.ref[b]*0.5)*cut).map(x=>x.t).filter((x,i,z)=>!i||x-z[i-1]>0.15);};
    const S0=strong(this.on[0],0.45,0),S1=strong(this.on[1],0.15,1);   // kick echoes are loud, so kicks need a stricter cut
    const regular=a=>{
      if(a.length<5)return 0;const iv=a.slice(1).map((x,i)=>x-a[i]),m=percentile(iv,0.5);if(m<0.18||m>2)return 0;
      let ok=0;for(const x of iv){const r=x/m,n=Math.max(1,Math.round(r));if(n<=4&&Math.abs(r-n)<0.15*n)ok++;}
      return ok/iv.length*Math.min(1,(a.length-1)/5);
    };
    const both=[...S0,...S1].sort((a,b)=>a-b).filter((x,i,a)=>!i||x-a[i-1]>0.09);
    const score={kick:regular(S0),snare:regular(S1),all:regular(both)*0.9};
    const top=Math.max(score.kick,score.snare,score.all);
    // Sticky on purpose: every switch restarts the beat grid. Stay on the kick until it really falls apart; only move
    // between snare and both-together when one is clearly steadier
    const other=this.pick==='all'?(score.snare>score.all+0.15?'snare':'all'):this.pick==='snare'?(score.all>score.snare+0.15?'all':'snare'):(score.snare>=score.all?'snare':'all');
    const winner=this.pick==='kick'?(score.kick>=0.4||top<0.5?'kick':other):(score.kick>=0.7?'kick':top<0.25?this.pick:other);
    if(winner===this.pick)this.cand='';else{if(!this.cand)this.candSince=t;this.cand=winner;if(t-this.candSince>=3){this.pick=winner;this.cand='';}}   // 3 s of the current pick losing (to anything) before switching
    this.sourceScore=score;
    const selected=source==='auto'?this.pick:source;
    if(this.lastSource && this.lastSource!==selected)this.grid.reset();this.lastSource=selected;
    const onset=selected==='kick'?hits[0]:selected==='snare'?hits[1]:(hits[0]||hits[1]);
    const grid=this.grid.update(t,onset,db>-60);
    const drop=this.drop.update(t,{db,bassDb:10*Math.log10(energy[0]+1e-12),kick:hits[0],novelty:novel/Math.max(total,1e-9)},this.grid.period,grid.confidence,options.dropSensitivity||1);
    return {time:t,db,source:selected,sourceScore:this.sourceScore,kick:hits[0],snare:hits[1],hat:hits[2],...grid,drop:drop.strength,phase:drop.phase};
  }
}
const api={BeatGrid,DropDetector,AudioAnalysis};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AfterglowAudio=api;
})(globalThis);
