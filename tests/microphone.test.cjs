const {test}=require('node:test');
const assert=require('node:assert/strict');
const {clampDb,createInput}=require('../extension/microphone.js');
test('zero gain preserves the microphone stream and requires no audio context',async()=>{
  const mic={};const input=await createInput(mic,0,{});
  assert.equal(input.stream,mic);input.dispose();assert.equal(input.db,0);
  for(const [value,expected] of [[NaN,0],[Infinity,0],['12',0],[-4,0],[40,24],[6,6]])assert.equal(clampDb(value),expected);
});
function fixture(fail=false){
  const edges=[];let closed=0,stopped=0,gain;
  const processed={getTracks:()=>[{stop(){stopped++;}}]};
  const source={connect:to=>edges.push(['mic',to]),disconnect(){}};
  const destination={stream:processed};
  class AudioContext{
    state='running';
    createMediaStreamSource(mic){assert.equal(mic,'microphone');return source;}
    createGain(){return gain={gain:{value:1},connect:to=>edges.push(['gain',to]),disconnect(){}};}
    createMediaStreamDestination(){return destination;}
    async resume(){if(fail)throw Error('unavailable');}
    async close(){closed++;}
  }
  return {env:{AudioContext},edges,processed,destination,get gain(){return gain;},get closed(){return closed;},get stopped(){return stopped;}};
}
test('fixed dB gain feeds only the recording destination and cleans up once',async()=>{
  const f=fixture(),input=await createInput('microphone',16,f.env);
  assert.equal(input.stream,f.processed);assert.equal(input.db,16);
  assert(Math.abs(f.gain.gain.value-6.309573)<1e-6);
  assert.deepEqual(f.edges,[['mic',f.gain],['gain',f.destination]]);
  input.dispose();input.dispose();assert.equal(f.closed,1);assert.equal(f.stopped,1);
});
test('failed gain startup releases its graph and never silently records at the wrong volume',async()=>{
  const f=fixture(true);await assert.rejects(createInput('microphone',12,f.env),/0 dB/);
  assert.equal(f.closed,1);assert.equal(f.stopped,1);
});

test('recorder options request high bitrate Opus and require native PCM for lossless',()=>{
  const api=require('../extension/microphone.js');
  const Recorder={isTypeSupported:type=>['audio/webm;codecs=opus','audio/webm;codecs=pcm'].includes(type)};
  assert.deepEqual(api.recordingOptions('high',Recorder),{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:256000});
  assert.deepEqual(api.recordingOptions('lossless',Recorder),{mimeType:'audio/webm;codecs=pcm'});
  assert.throws(()=>api.recordingOptions('lossless',{isTypeSupported:()=>false}),/不支持无损/);
});
test('recording diagnostics use actual track settings without leaking device identifiers or bogus PCM bitrate',()=>{
  const api=require('../extension/microphone.js');
  const microphone=api.captureSettings({getAudioTracks:()=>[{getSettings:()=>({deviceId:'private',sampleRate:48000,channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:true})}]});
  assert.equal(microphone.deviceId,undefined);
  const description=api.describeRecording({mimeType:'audio/webm;codecs=pcm',audioBitsPerSecond:128000,microphone});
  assert.match(description,/无损 PCM/);assert.match(description,/48 kHz.*1 声道/);assert.match(description,/回声消除关.*降噪关.*自动增益开/);assert.doesNotMatch(description,/128 kbps/);
  assert.match(api.describeRecording({mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:256000}),/256 kbps/);
  assert.match(api.describeRecording(),/旧录音/);assert.deepEqual(api.captureSettings({}),{});
});
