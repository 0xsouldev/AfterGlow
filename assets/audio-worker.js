'use strict';
importScripts('./audio-core.js');
let engine=null, session=0, options={};
onmessage=({data})=>{
  if(data.type==='reset'){session=data.session;engine=new AfterglowAudio.AudioAnalysis(data.rate);return;}
  if(data.type==='options'){options=data.options;return;}
  if(data.type==='samples' && engine && data.session===session){
    postMessage({session,...engine.process(data.samples,data.time,options)});
  }
};
