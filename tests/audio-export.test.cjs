const {test}=require('node:test');
const assert=require('node:assert/strict');
const {plan,render}=require('../extension/audio-export.js');
const voice=(id,start,end,createdAt=1,extra={})=>({id,start,end,createdAt,cueKey:id,kind:'song',capture:'vocal',speed:1,blob:new Blob([id]),...extra});

test('assembly keeps gaps and lets the newest recording replace overlapping ranges',()=>{
  const result=plan([voice('a',0,3),voice('b',2,4,2),voice('c',6,8)],10);
  assert.deepEqual(result.segments.map(s=>[s.start,s.end,s.take.id]),[[0,2,'a'],[2,4,'b'],[6,8,'c']]);
  assert.deepEqual(result.gaps, [{start:4,end:6},{start:8,end:10}]);
});
test('latest version wins, partial recordings leave silence, legacy mixed audio is never treated as vocals',()=>{
  const latest=voice('new',1,4,2,{cueKey:'line',capturedEnd:2});
  const result=plan([voice('old',1,4,1,{cueKey:'line',speed:0.75}),latest],5);
  assert.deepEqual(result.segments.map(s=>[s.start,s.end,s.take.id]),[[1,2,'new']]);
  assert.throws(()=>plan([voice('legacy',0,5,1,{withBacking:true})],5),/旧版/);
  assert.throws(()=>plan([voice('slow',0,5,1,{speed:0.75})],5),/1×/);
});

test('WAV rendering positions vocals, mixes backing once and preserves the original source buffers',async()=>{
  const decoded=new Map();let closed=0;
  for(const [id,n,length] of [['a',0.25,8],['b',0.5,8],['c',0.75,4],['backing',0.1,16]]){
    const samples=new Float32Array(length).fill(n);decoded.set(id,{sampleRate:4,numberOfChannels:1,getChannelData:()=>samples});
  }
  class AudioContext{async decodeAudioData(bytes){return decoded.get(new TextDecoder().decode(bytes));}async close(){closed++;}}
  const env={AudioContext,setTimeout:fn=>queueMicrotask(fn)};
  const result=await render({takes:[voice('a',0,2),voice('b',1,3,2),voice('c',3,4)],duration:4,sampleRate:4,
    backing:{start:0,end:4,blob:new Blob(['backing'])}},env);
  const bytes=await result.blob.arrayBuffer(),view=new DataView(bytes);
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(view.getUint32(24,true),4);
  assert.equal(view.getUint32(40,true),64);assert.equal(bytes.byteLength,108);
  for(const [frame,n] of [[0,0.35],[4,0.6],[12,0.85]])assert(Math.abs(view.getInt16(44+frame*4,true)/32767-n)<0.001);
  assert.equal(decoded.get('a').getChannelData()[0],0.25);assert.equal(closed,1);
  await assert.rejects(render({takes:[voice('a',0,2)],duration:2,sampleRate:4,active:()=>false},env),/取消/);
  assert.equal(closed,2);
});

test('mixed clip export uses the correct offset in a full-song accompaniment',async()=>{
  const backingData=Float32Array.from([0.1,0.2,0.3,0.4]);
  class AudioContext{
    async decodeAudioData(bytes){const backing=new TextDecoder().decode(bytes)==='backing';return {sampleRate:1,numberOfChannels:1,getChannelData:()=>backing?backingData:Float32Array.from([0,0,0.1,0.1])};}
    async close(){}
  }
  const result=await render({takes:[voice('voice',2,4,1,{vocalOffset:2})],duration:2,origin:2,sampleRate:1,backing:{start:0,end:4,blob:new Blob(['backing'])}}, {AudioContext,setTimeout:fn=>queueMicrotask(fn)});
  const view=new DataView(await result.blob.arrayBuffer());assert(Math.abs(view.getInt16(44,true)/32767-0.4)<0.001);
});
