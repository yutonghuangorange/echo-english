const {test}=require('node:test');
const assert=require('node:assert/strict');
const {measure,start}=require('../extension/live-meter.js');
function fixture({resume=()=>Promise.resolve(),supported=true}={}){
  let level=0.1,closed=0,reads=0;const frames=new Map(),connections=[],stream={name:'original mic'};let id=0;
  const source={connect:n=>connections.push(n),disconnect(){}},analyser={fftSize:0,getFloatTimeDomainData(samples){reads++;samples.fill(level);},disconnect(){}};
  class AudioContext{state='running';destination={speakers:true};createMediaStreamSource(input){assert.equal(input,stream);return source;}createAnalyser(){return analyser;}resume=resume;async close(){closed++;}}
  const container={hidden:true,dataset:{}},canvas={width:640,height:64,getContext:()=>({clearRect(){},fillRect(){}})},value={},bar={style:{},parentElement:{setAttribute(){}}};
  const env={...(supported?{AudioContext}:{}),requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
  const meter=start({stream,container,canvas,value,bar,env});
  return {meter,container,value,canvas,bar,frames,connections,analyser,setLevel:n=>level=n,get closed(){return closed;},get reads(){return reads;},tick(now){const [id,fn]=frames.entries().next().value;frames.delete(id);fn(now);}};
}
test('level calculation uses actual RMS and peak dBFS, including silence and clipping',()=>{
  const samples=Float32Array.from({length:1000},(_,i)=>0.5*Math.sin(i*Math.PI/50));
  const level=measure(samples);assert(Math.abs(level.peakDb+6.02)<0.02);assert(Math.abs(level.rmsDb+9.03)<0.02);
  assert.equal(measure(new Float32Array(10)).rmsDb,-60);assert.equal(measure([]).peakDb,-60);assert.equal(measure([1,-1]).peakDb,0);
});
test('meter never connects microphone to speakers and pauses when the recorder buffers',async()=>{
  const f=fixture();await Promise.resolve();assert.equal(f.container.hidden,false);assert.deepEqual(f.connections,[f.analyser]);
  f.tick(0);assert.match(f.value.textContent,/-20 dBFS.*正常/);assert.equal(f.frames.size,1);
  f.setLevel(1);f.tick(250);assert.match(f.value.textContent,/过载/);assert.equal(f.container.dataset.level,'clip');
  f.setLevel(0.1);f.tick(500);assert.match(f.value.textContent,/过载/);
  f.meter.setPaused(true);const reads=f.reads;f.tick(750);assert.equal(f.reads,reads);assert.match(f.value.textContent,/录音暂停/);assert.equal(f.bar.style.width,'0%');
  f.meter.setPaused(false);f.setLevel(0.001);f.tick(2000);assert.match(f.value.textContent,/较轻/);
  f.meter.dispose();f.meter.dispose();assert.equal(f.closed,1);assert.equal(f.frames.size,0);assert.equal(f.container.hidden,true);
});
test('a late audio-context resume after stop cannot revive the display or animation',async()=>{
  let resolve;const f=fixture({resume:()=>new Promise(r=>resolve=r)});
  f.meter.dispose();resolve();await Promise.resolve();assert.equal(f.closed,1);assert.equal(f.frames.size,0);assert.equal(f.container.hidden,true);
});
test('unavailable audio visualization is nonfatal and can still be cleaned up',()=>{
  const f=fixture({supported:false});assert.match(f.value.textContent,/不可用/);assert.equal(f.canvas.hidden,true);
  f.meter.dispose();assert.equal(f.container.hidden,true);assert.equal(f.frames.size,0);
});
