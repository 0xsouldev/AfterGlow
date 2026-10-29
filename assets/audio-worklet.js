'use strict';
class AfterglowCapture extends AudioWorkletProcessor {
  constructor(){super();this.block=new Float32Array(512);this.used=0;this.session=0;
    this.port.onmessage=({data})=>{this.session=data.session;this.used=0;};}
  process(inputs){
    const channels=inputs[0];if(!channels || !channels.length)return true;
    for(let i=0;i<channels[0].length;i++){
      let sample=0;for(const ch of channels)sample+=ch[i];this.block[this.used++]=sample/channels.length;
      if(this.used===this.block.length){
        this.port.postMessage({type:'samples',session:this.session,samples:this.block,time:(currentFrame+i+1)/sampleRate},[this.block.buffer]);
        this.block=new Float32Array(512);this.used=0;
      }
    }
    // Output remains silent. Sources keep their original playback routes.
    return true;
  }
}
registerProcessor('afterglow-capture',AfterglowCapture);
