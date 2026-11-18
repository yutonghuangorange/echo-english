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
