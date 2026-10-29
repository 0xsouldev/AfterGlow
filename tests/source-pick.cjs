// Auto beat source: follows the steadiest drum layer, stays on a steady kick, and comes back to it.
const assert = require('node:assert/strict');
const { AudioAnalysis } = require('../assets/audio-core.js'); const R = 44100, B = 512, N = 40;
let seed = 1; const rnd = () => (seed = (seed*16807) % 2147483647)/2147483647; const noise = Array.from({ length: R }, () => rnd()*2 - 1);
const kickAt = (t, times) => { let v = 0; for (const s of times){ const u = t - s; if (u >= 0 && u < 0.4) v += 0.9*Math.sin(2*Math.PI*(50 + 90*Math.exp(-u*35))*u)*Math.exp(-u*9); } return v; };
const snareAt = (t, times) => { let v = 0; for (const s of times){ const u = t - s; if (u >= 0 && u < 0.25) v += 0.5*(noise[Math.floor(u*R)] + 0.6*Math.sin(2*Math.PI*190*u))*Math.exp(-u*22); } return v; };
const beat = 60/90, snares = [], kicks = [];
for (let k = 0; k < N/beat; k++) (k % 2 ? snares : kicks).push(k*beat);
const sparse808 = [0.1, 3.7, 4.4, 9.9, 12.2, 17.5, 18.1, 25.3, 30.9, 33.2, 37.0];
function run(K, S){
  const a = new AudioAnalysis(R), at = {};
  for (let i = 0; i + B <= R*N; i += B){
    const blk = new Float32Array(B); for (let j = 0; j < B; j++){ const t = (i + j)/R; blk[j] = 0.5*(kickAt(t, K) + snareAt(t, S)) + 0.05*Math.sin(2*Math.PI*55*t); }
    const r = a.process(blk, (i + B)/R, { source: 'auto' }); at[Math.floor(r.time)] = r.source;
  }
  return at;
}
const boomBap = run(kicks, snares); assert.ok(Object.values(boomBap).every(x => x === 'kick'), 'steady kick + snare stays on the kick');
const trap = run(sparse808, snares); assert.equal(trap[20], 'snare', 'random 808s + steady snare follows the snare'); assert.equal(trap[39], 'snare');
const gap = run(kicks.filter(x => x < 15 || x > 30), snares); assert.equal(gap[10], 'kick'); assert.notEqual(gap[28], 'kick', 'leaves the kick when it drops out'); assert.equal(gap[39], 'kick', 'comes back to the kick');
console.log('PASS auto beat source: boom-bap stays on kick, trap follows snare, kick drop-out and return');
