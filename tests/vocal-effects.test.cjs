const {test}=require('node:test');
const assert=require('node:assert/strict');
const effects=require('../extension/vocal-effects.js');

function buffer(length=1000,sampleRate=1000,channels=1){
  const data=Array.from({length:channels},()=>new Float32Array(length));
  return {length,sampleRate,duration:length/sampleRate,numberOfChannels:channels,getChannelData:c=>data[c]};
}
function environment(){
  const starts=[],nodes=[];
  class OfflineAudioContext {
    constructor(channels,length,sampleRate){this.sampleRate=sampleRate;this.output=buffer(length,sampleRate,channels);this.destination={};}
    createBuffer(channels,length,sampleRate){return buffer(length,sampleRate,channels);}
    createBufferSource(){const node={connect(){},start(...args){starts.push(args);}};nodes.push(node);return node;}
    createConvolver(){const node={connect(){}};nodes.push(node);return node;}
    createGain(){return {gain:{value:0},connect(){}};}
    async startRendering(){return this.output;}
  }
  return {OfflineAudioContext,starts,nodes};
}
test('old takes remain dry and malformed imported values are bounded',async()=>{
  const original=buffer();assert.equal(await effects.process(original),original);
  assert.deepEqual(effects.normalize(null),{delayMs:0,reverb:'off',amount:0.25});
  assert.deepEqual(effects.normalize({delayMs:9000,reverb:'unknown',amount:-1}),{delayMs:2000,reverb:'off',amount:0});
  assert.equal(effects.enabled({reverb:'ktv',amount:0}),false);
  assert.equal(effects.normalize({amount:1.5}).amount,1.5);
  assert.equal(effects.normalize({amount:3}).amount,2);
});
test('positive delays insert silence, negative delays trim the beginning, range length stays fixed',async()=>{
  for(const [delayMs,expected] of [[200,[0.2,0]],[-200,[0,0.2]]]){
    const env=environment(),output=await effects.process(buffer(),{delayMs},env);
    assert.deepEqual(env.starts,[expected]);assert.equal(output.length,1000);
  }
  const env=environment();await effects.process(buffer(50),{delayMs:-200},env);
  assert.deepEqual(env.starts,[]);
});
test('reverb has deterministic stereo impulses and distinct spaces',async()=>{
  const env=environment(),context=new env.OfflineAudioContext(2,1000,1000);
  const ktv=effects.impulse(context,'ktv'),again=effects.impulse(context,'ktv'),theatre=effects.impulse(context,'theatre');
  assert.deepEqual(ktv.getChannelData(0),again.getChannelData(0));
  assert.notDeepEqual(ktv.getChannelData(0),ktv.getChannelData(1));
  assert.equal(ktv.length,1200);assert.equal(theatre.length,2600);
  assert.ok(ktv.getChannelData(0).slice(0,18).every(n=>n===0));
  await effects.process(buffer(),{reverb:'ktv',amount:0.4},env);
  assert.ok(env.nodes.some(node=>node.buffer?.numberOfChannels===2));
});
test('WAV encoding preserves channels and normalizes clipping',async()=>{
  const audio=buffer(2,44100,2);audio.getChannelData(0).set([2,-2]);audio.getChannelData(1).set([1,-1]);
  const view=new DataView(await effects.wav(audio).arrayBuffer());
  assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint32(24,true),44100);
  assert.equal(view.getInt16(44,true),32767);assert.equal(view.getInt16(48,true),-32768);
});

test('live edits preserve the playback clock and reverb changes do not restart vocals',async()=>{
  const contexts=[],starts=[],timers=new Map();let nextTimer=0;
  const parameter=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
  class AudioContext {
    constructor(){this.currentTime=0;this.sampleRate=1000;this.destination={};contexts.push(this);}
    async decodeAudioData(){return buffer(10000);}
    createGain(){return {gain:parameter(),connect(){},disconnect(){}};}
    createConvolver(){return {connect(){},disconnect(){}};}
    createBuffer(channels,length,sampleRate){return buffer(length,sampleRate,channels);}
    createBufferSource(){return {connect(){},disconnect(){},start(...args){starts.push(args);},stop(){this.onended?.();}};}
    async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
  }
  const env={AudioContext,setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
  const player=await effects.createPlayer({blob:new Blob(['audio'])},1,env),ctx=contexts[0];
  assert.equal(player.paused,true);await player.play();ctx.currentTime=2;
  player.setEffects({delayMs:-100,reverb:'ktv',amount:0.4});
  assert.equal(player.currentTime,2);assert.deepEqual(starts.at(-1),[2,2.1]);
  const sourceCount=starts.length;
  player.setEffects({delayMs:-100,reverb:'theatre',amount:0.7});
  assert.equal(starts.length,sourceCount);assert.equal(player.currentTime,2);
  player.setEffects({delayMs:100});assert.deepEqual(starts.at(-1),[2,1.9]);
  ctx.currentTime=3;player.pause();ctx.currentTime=4;assert.equal(player.currentTime,3);
  await player.play();assert.equal(player.currentTime,3);
  player.currentTime=1;assert.equal(player.currentTime,1);assert.deepEqual(starts.at(-1),[4,0.9]);
  let ended=0;player.onended=()=>ended++;ctx.currentTime=13;
  timers.values().next().value();assert.equal(player.ended,true);assert.equal(ended,1);
  player.dispose();assert.equal(ctx.state,'closed');assert.equal(timers.size,0);
});

test('offline processing preserves stem gain until the final mix is encoded',async()=>{
  const env=environment();
  env.OfflineAudioContext.prototype.startRendering=async function(){this.output.getChannelData(0).set([2,.25]);return this.output;};
  const rendered=await effects.process(buffer(),{reverb:'ktv',amount:1},env);
  assert.equal(rendered.getChannelData(0)[0],2);
  assert.equal(rendered.getChannelData(0)[1],.25);
});

test('seeking disconnects the old voice and rebuilds its convolution without restarting the clock',async()=>{
  const gains=[],convolvers=[];let context;
  class AudioContext{
    constructor(){context=this;this.currentTime=0;this.sampleRate=1000;this.destination={};}
    async decodeAudioData(){return buffer(10000);}
    createBuffer(...args){return buffer(args[1],args[2],args[0]);}
    createGain(){const node={gain:{value:1,cancelScheduledValues(){},setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){this.disconnected=true;}};gains.push(node);return node;}
    createConvolver(){const node={connect(){},disconnect(){this.disconnected=true;}};convolvers.push(node);return node;}
    createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}};}
    async resume(){}async suspend(){}async close(){}
  }
  const player=await effects.createPlayer({blob:new Blob(),effects:{reverb:'theatre'}},1,{AudioContext,setTimeout(){},clearTimeout(){}});
  await player.play();const oldSourceGain=gains.at(-1),oldConvolver=convolvers[0];context.currentTime=.5;
  player.currentTime=5;
  assert.equal(player.currentTime,5);assert.equal(oldSourceGain.disconnected,true);assert.equal(oldConvolver.disconnected,true);
  assert.equal(convolvers.length,2);assert.equal(convolvers[0].buffer,convolvers[1].buffer); // IR cached; tail state is fresh.
  player.dispose();
});
