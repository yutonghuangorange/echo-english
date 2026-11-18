const {test}=require('node:test');
const assert=require('node:assert/strict');
const pitch=require('../extension/backing-pitch.js');
function tone(frequency=440,sampleRate=44100,seconds=3,channels=1){
  const length=Math.round(sampleRate*seconds);
  const data=Array.from({length:channels},(_,c)=>Float32Array.from({length},(_,i)=>0.3*Math.sin(2*Math.PI*(frequency+c*220)*i/sampleRate)));
  return {length,duration:seconds,sampleRate,numberOfChannels:channels,getChannelData:c=>data[c]};
}
function frequency(data,rate){
  let crossings=0;for(let i=rate;i<2*rate;i++)if(data[i-1]<=0 && data[i]>0)crossings++;
  return crossings;
}
const env={setTimeout:fn=>queueMicrotask(fn)};
test('pitch bounds and zero retain the original audio without decoding',async()=>{
  assert.equal(pitch.normalize(-20),-6);assert.equal(pitch.normalize(20),6);assert.equal(pitch.normalize('bad'),0);
  const original=tone();assert.equal(await pitch.shiftBuffer(original,0),original);
  const blob=new Blob(['original']);assert.equal(await pitch.shiftBlob(blob,0),blob);
});
for(const rate of [44100,48000])for(const semitones of [-6,3,6])test(`actual DSP shifts ${semitones} semitones at ${rate} Hz while keeping duration`,async()=>{
  const original=tone(440,rate),before=original.getChannelData(0).slice();
  const output=await pitch.shiftBuffer(original,semitones,{},env);
  assert.equal(output.length,original.length);assert.equal(output.sampleRate,rate);
  assert.equal(output.duration,original.duration);
  assert.ok(Math.abs(frequency(output.getChannelData(0),rate)-440*2**(semitones/12))<2);
  assert.ok(output.getChannelData(0).slice(-rate/10).some(value=>Math.abs(value)>0.1),'tail should remain audible');
  assert.deepEqual(original.getChannelData(0),before);
});
test('stereo channels remain independent and short clips stay finite',async()=>{
  const output=await pitch.shiftBuffer(tone(440,44100,3,2),3,{},env);
  assert.ok(Math.abs(frequency(output.getChannelData(0),44100)-440*2**.25)<2);
  assert.ok(Math.abs(frequency(output.getChannelData(1),44100)-660*2**.25)<2);
  const short=await pitch.shiftBuffer(tone(440,44100,0.02),-6,{},env);
  assert.equal(short.length,882);assert.ok(short.getChannelData(0).every(Number.isFinite));
});
test('cancellation during block processing prevents a stale result',async()=>{
  let active=true,yields=0;
  await assert.rejects(pitch.shiftBuffer(tone(),4,{active:()=>active},{setTimeout:fn=>{if(++yields===2)active=false;queueMicrotask(fn);}}),/取消/);
});
test('blob cache reuses only the most recent completed key and closes decoders',async()=>{
  let decoded=0,closed=0;
  class AudioContext{async decodeAudioData(){decoded++;return tone(440,44100,0.1);}async close(){closed++;}}
  const local={AudioContext,...env},blob=new Blob(['source']);
  const first=await pitch.shiftBlob(blob,2,{},local);
  assert.equal(await pitch.shiftBlob(blob,2,{},local),first);assert.equal(decoded,1);
  await pitch.shiftBlob(blob,-2,{},local);assert.equal(decoded,2);assert.equal(closed,2);
});

test('mixed export shifts only the accompaniment and keeps the captured vocal frequency',async()=>{
  const {render}=require('../extension/audio-export.js');
  class AudioContext{
    async decodeAudioData(bytes){return tone(new TextDecoder().decode(bytes)==='voice'?220:440,44100,6);}
    async close(){}
  }
  const take={id:'voice',cueKey:'voice',start:0,end:3,speed:1,createdAt:1,capture:'vocal',backingPitch:3,blob:new Blob(['voice'])};
  const result=await render({takes:[take],duration:3,backing:{start:0,end:3,blob:new Blob(['backing'])}},{AudioContext,...env});
  const view=new DataView(await result.blob.arrayBuffer());
  function amplitude(hz){let real=0,imaginary=0;for(let i=44100;i<88200;i++){
    const sample=view.getInt16(44+i*4,true)/32768,angle=2*Math.PI*hz*i/44100;
    real+=sample*Math.cos(angle);imaginary+=sample*Math.sin(angle);
  }return Math.hypot(real,imaginary)*2/44100;}
  assert.ok(amplitude(220)>0.25,'vocal should remain at 220 Hz');
  assert.ok(amplitude(440*2**.25)>0.2,'backing should shift up three semitones');
  assert.ok(amplitude(440)<0.05,'original backing key should be absent');
  assert.equal(view.getUint32(40,true),3*44100*4);
  const other={...take,id:'other',cueKey:'other',start:3,end:6,backingPitch:-2};
  const assembled=await render({takes:[take,other],duration:6,backing:{start:0,end:6,blob:new Blob(['backing'])}},{AudioContext,...env});
  const assembledView=new DataView(await assembled.blob.arrayBuffer());
  let real=0,imaginary=0;
  for(let i=4*44100;i<5*44100;i++){
    const sample=assembledView.getInt16(44+i*4,true)/32768,angle=2*Math.PI*(440*2**(-2/12))*i/44100;
    real+=sample*Math.cos(angle);imaginary+=sample*Math.sin(angle);
  }
  assert.ok(Math.hypot(real,imaginary)*2/44100>0.2,'later assembly segments should use their recorded key');
  assert.equal(assembledView.byteLength,44+6*44100*4);
});

test('MessageChannel scheduling completes and releases its ports',async()=>{
  const output=await pitch.shiftBuffer(tone(),-2,{}, {MessageChannel,setTimeout});
  assert.ok(Math.abs(frequency(output.getChannelData(0),44100)-440*2**(-2/12))<2);
});

test('recording monitor loads shifted audio while keeping its original playback rate and seek clock',async()=>{
  let loaded,element;
  class AudioContext{
    async decodeAudioData(){return tone();}async close(){}async resume(){}
    createGain(){return {gain:{value:1},connect(){}};}
    createMediaElementSource(){return {connect(){}};}
  }
  class Audio{
    constructor(){element=this;this.currentTime=0;}
    load(){if(this.oncanplay)queueMicrotask(()=>this.oncanplay?.());}
    async play(){}pause(){}removeAttribute(){}
  }
  const original=new Blob(['original']);
  const local={AudioContext,Audio,URL:{createObjectURL(blob){loaded=blob;return 'blob:test';},revokeObjectURL(){}},setTimeout,clearTimeout};
  const monitor=await require('../extension/karaoke.js').createMonitor({blob:original,video:{currentTime:11},start:10,speed:0.75,volume:0.5,pitchSemitones:3},local);
  assert.notEqual(loaded,original);assert.equal(loaded.type,'audio/wav');assert.equal(element.playbackRate,0.75);assert.equal(element.preservesPitch,true);
  await monitor.sync(12);assert.equal(monitor.position(),12);monitor.pause();monitor.dispose();
});
