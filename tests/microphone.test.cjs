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
