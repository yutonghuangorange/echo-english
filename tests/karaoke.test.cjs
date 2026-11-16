const {test}=require('node:test');
const assert=require('node:assert/strict');
const {request}=require('../extension/karaoke-relay.js');
const {key,blobFromBase64,createMix}=require('../extension/karaoke.js');
const sender={tab:{url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'}};
const id='a'.repeat(32);

test('service detection uses the fixed health endpoint without creating a job',async()=>{
  await request({action:'health'},sender,async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:8765/health');assert.equal(options.method,'GET');assert.equal(options.body,undefined);
    return {ok:true,json:async()=>({service:'echo-karaoke',version:1})};
  });
  assert.match(require('../extension/karaoke.js').progressText({state:'separating',modelDownloading:true}),/正在下载分离模型/);
});

test('relay accepts a complete ten-minute song',async()=>{
  await request({action:'start',videoId:'jNQXAC9IVRw',start:0,end:600},sender,async(_,options)=>{
    assert.equal(JSON.parse(options.body).end,600);
    return {ok:true,json:async()=>({id,state:'queued'})};
  });
});

test('old service duration errors explain how to restart instead of repeating an obsolete limit',async()=>{
  await assert.rejects(request({action:'start',videoId:'jNQXAC9IVRw',start:0,end:600},sender,
    async()=>({ok:false,json:async()=>({error:'请选择有效的视频和 0–300 秒片段。'})})),/旧版.*Ctrl\+C.*start-karaoke/);
});

test('karaoke relay accepts only fixed loopback routes and current-video clips',async()=>{
  const calls=[];
  const fetcher=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({id,state:'queued'})};};
  await request({action:'start',videoId:'jNQXAC9IVRw',start:0,end:180},sender,fetcher);
  assert.equal(calls[0].url,'http://127.0.0.1:8765/jobs');
  assert.equal(calls[0].opts.headers['X-Echo-Client'],'echo-english');
  assert.deepEqual(JSON.parse(calls[0].opts.body),{videoId:'jNQXAC9IVRw',start:0,end:180});
  for(const message of [{action:'start',videoId:'aaaaaaaaaaa',start:0,end:1},{action:'start',videoId:'jNQXAC9IVRw',start:0,end:601},
    {action:'start',videoId:'jNQXAC9IVRw',start:NaN,end:1},{action:'status',jobId:'../../etc/passwd'},{action:'fetch',url:'https://evil.test'}])
    await assert.rejects(request(message,sender,fetcher));
  await assert.rejects(request({action:'status',jobId:id},{tab:{url:'https://www.youtube.com.evil.test/watch?v=jNQXAC9IVRw'}},fetcher));
  assert.equal(calls.length,1);
});

test('relay reports offline and worker failures and transfers audio bytes without corruption',async()=>{
  await assert.rejects(request({action:'status',jobId:id},sender,async()=>{throw Error('offline');}),/本机伴奏服务/);
  await assert.rejects(request({action:'status',jobId:id},sender,async()=>({ok:false,json:async()=>({error:'已有任务'})})),/已有任务/);
  const data=new Uint8Array([0,127,255,42]);
  const result=await request({action:'audio',jobId:id},sender,async()=>({ok:true,headers:new Map(),arrayBuffer:async()=>data.buffer}));
  assert.deepEqual(new Uint8Array(await blobFromBase64(result).arrayBuffer()),data);
  assert.notEqual(key('video',{start:0,end:1}),key('video',{start:0,end:1.2}));
});

test('mix sends accompaniment to headphones and recording, while microphone is never monitored',async()=>{
  const edges=[],events=[];
  const node=name=>({connect(other){edges.push([name,other.name]);},name});
  let gain=0, music;
  class Context {
    destination=node('speakers');
    createMediaStreamDestination(){return {...node('recording'),stream:'mixed-stream'};}
    createMediaElementSource(){return node('music');}
    createMediaStreamSource(mic){assert.equal(mic,'mic-stream');return node('mic');}
    createGain(){return {...node('gain'+(++gain)),gain:{value:1}};}
    async resume(){events.push('resume');}async close(){events.push('close');}
  }
  class Audio {
    constructor(){music=this;}load(){queueMicrotask(()=>this.onloadedmetadata?.());}
    async play(){events.push('play');}pause(){events.push('pause');}removeAttribute(){}
  }
  const env={AudioContext:Context,Audio,URL:{createObjectURL:()=> 'blob:music',revokeObjectURL:()=>events.push('revoke')},setTimeout,clearTimeout};
  const video={currentTime:12};
  const mix=await createMix({blob:new Blob(),mic:'mic-stream',video,start:10,speed:0.75},env);
  assert.equal(mix.stream,'mixed-stream');
  assert.deepEqual(edges,[['music','gain1'],['gain1','speakers'],['gain1','recording'],['mic','gain2'],['gain2','recording']]);
  await mix.sync();assert.equal(music.currentTime,2);assert.equal(music.playbackRate,0.75);assert.equal(music.preservesPitch,true);
  mix.pause();mix.dispose();mix.dispose();
  assert.equal(events.filter(e=>e==='close').length,1);assert.equal(events.filter(e=>e==='revoke').length,1);
});

test('whole-song backing covers shorter phrases but never another video or an uncovered range',()=>{
  const {covers}=require('../extension/karaoke.js');
  const backing={videoId:'song',start:0,end:180};
  assert.equal(covers(backing,'song',{start:30,end:40}),true);
  assert.equal(covers(backing,'song',{start:0,end:180}),true);
  assert.equal(covers(backing,'other',{start:30,end:40}),false);
  assert.equal(covers(backing,'song',{start:170,end:190}),false);
  assert.equal(covers({...backing,start:20},'song',{start:10,end:30}),false);
});

test('accompaniment preview supports live gain above HTML audio volume without changing the element volume',async()=>{
  let gain,closed=0;const music={volume:1};
  const source={connect(){}};
  class AudioContext{
    destination={};createMediaElementSource(value){assert.equal(value,music);return source;}
    createGain(){return gain={gain:{value:1},connect(){}};}
    async resume(){}async close(){closed++;}
  }
  const output=await require('../extension/karaoke.js').createBackingOutput(music,1.5,{AudioContext});
  assert.equal(gain.gain.value,1.5);output.setVolume(2);assert.equal(gain.gain.value,2);
  output.setVolume(0);assert.equal(gain.gain.value,0);output.setVolume(99);assert.equal(gain.gain.value,2);
  assert.equal(music.volume,1);output.dispose();assert.equal(closed,1);
});

test('progress labels separate stage progress from total time and avoid invented percentages',()=>{
  const {progressText}=require('../extension/karaoke.js');
  assert.equal(progressText({state:'separating',progress:40,elapsedSeconds:16,remainingSeconds:23}),
    '去掉原唱 40% · 已用 0分16秒 · 本阶段预计剩余 0分23秒');
  assert.doesNotMatch(progressText({state:'downloading',progress:null,elapsedSeconds:62}),/%/);
  assert.match(progressText({state:'separating',progress:null}),/加载模型/);
  assert.match(progressText({state:'encoding',elapsedSeconds:80}),/压缩并保存/);
});
