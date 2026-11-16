const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
const {createStorage,cueKey}=require('../extension/storage.js');

// Lightweight content-script DOM harness: run actual UI handlers against a real
// IndexedDB implementation, without requesting microphone or YouTube access.
async function mount(storage, overrides = {}) {
  const nodes=new Map(),created=[],downloads=[];
  class Element {
    constructor(){this.children=[];this.hidden=false;this.value='';this.style={};this.attrs={};this.dataset={};this.classList={toggle:()=>{}};created.push(this);}
    set innerHTML(html){this.html=html;for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Element());
      nodes.get('followCaptions').checked=true;
      for(const [id,value] of Object.entries({start:'0',end:'5',speed:'1',loopCount:'3',prepSeconds:'3',backingVolume:'1',karaokeScope:'whole',assemblyType:'vocal',activityMode:'speech',contentLanguage:'auto',captionLayout:'original'}))nodes.get(id).value=value;}
    get innerHTML(){return this.html;}
    setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];} removeAttribute(k){delete this.attrs[k];if(k==='value')this.value=0;}
    append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;}
    attachShadow(){return root;} focus(){} getContext(){return {clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};}
    click(){if(this.download)downloads.push(this);return this.onclick?.();}
    remove(){}
  }
  const root=new Element();root.getElementById=id=>nodes.get(id);
  root.addEventListener=(name,fn)=>{root['on'+name]=fn;};
  root.querySelector=()=>({scrollTop:0});root.querySelectorAll=selector=>created.filter(n=>n.className===selector.slice(1));
  const events=new Map();
  const doc={getElementById:()=>null,documentElement:new Element(),createElement:()=>new Element(),createTextNode:text=>({textContent:text}),addEventListener(name,fn){events.set(name,fn);},querySelector:selector=>selector==='video.html5-main-video'?(overrides.video || {duration:60}):null};
  const context={document:doc,location:{href:'https://www.youtube.com/watch?v=video',pathname:'/watch'},indexedDB:{},URL,Blob,console,setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){},crypto:globalThis.crypto,
    window:{addEventListener(){},speechSynthesis:{cancel(){}}},chrome:{runtime:{onMessage:{addListener(){}}}},
    EchoCaptionTracks:require('../extension/caption-tracks.js'),EchoPanelView:require('../extension/panel-view.js'),EchoTransport:require('../extension/transport.js'),EchoPlayback:require('../extension/playback.js'),
    EchoAudioExport:require('../extension/audio-export.js'),EchoPanelSize:require('../extension/panel-size.js'),EchoLanguages:require('../extension/languages.js'),EchoKaraoke:require('../extension/karaoke.js'),EchoStorage:{...require('../extension/storage.js'),createStorage:()=>storage},EchoPractice:require('../extension/practice.js'),EchoDictionary:require('../extension/dictionary.js'),EchoSubtitles:require('../extension/subtitles.js'),EchoLibrary:require('../extension/library.js'),EchoLiveMeter:require('../extension/live-meter.js'),EchoMicrophone:require('../extension/microphone.js'),EchoAudioAnalysis:require('../extension/audio-analysis.js')};
  Object.assign(context,overrides.globals || {});
  // Existing UI fixtures provide a caption transport; integration fixtures can
  // pass the real page-context client to verify fetch rather than messaging.
  if(!overrides.globals?.EchoCaptionTracks?.createClient)context.EchoCaptionTracks={...context.EchoCaptionTracks,createClient:()=>({request:message=>context.chrome.runtime.sendMessage?.({...message,type:'echo-captions'})})};
  for (const name of ['EchoTransport','EchoPlayback']) {
    const api=context[name];
    context[name]={...api,create:options=>api.create({...options,env:context})};
  }
  const karaoke=context.EchoKaraoke;
  context.EchoKaraoke={...karaoke,followRecording:options=>karaoke.followRecording(options,context)};
  if(context.chrome.runtime.sendMessage){
    const send=context.chrome.runtime.sendMessage;
    context.chrome.runtime.sendMessage=message=>message.action==='health'?Promise.resolve(overrides.health ? overrides.health() : {service:'echo-karaoke',version:1,maxSeconds:600}):message.action==='cached'?Promise.resolve(overrides.cachedBackings || {backings:[]}):send(message);
  }
  vm.runInNewContext(fs.readFileSync('extension/content.js','utf8'),context);
  for(let i=0;i<20 && nodes.get('read').disabled;i++)await new Promise(r=>setTimeout(r,2));
  return {nodes,root,events,downloads};
}
test('empty pages hide irrelevant recording controls and keep the practice dock on the practice tab',async()=>{
  const storage=createStorage(new IDBFactory());
  const {nodes}=await mount(storage);
  assert.equal(nodes.get('practiceDock').hidden,false);
  assert.equal(nodes.get('captionSetup').hidden,false);
  assert.equal(nodes.get('captionOptions').hidden,true);
  assert.equal(nodes.get('practiceTools').open,false);
  nodes.get('tab-recordings').onclick();
  assert.equal(nodes.get('practiceDock').hidden,true);
  assert.equal(nodes.get('recordingEmpty').hidden,false);
  assert.equal(nodes.get('historyBrowser').hidden,true);
  assert.equal(nodes.get('recordingDetails').hidden,true);
  assert.equal(nodes.get('playAll').hidden,true);
  nodes.get('backToPractice').onclick();assert.equal(nodes.get('practiceDock').hidden,false);
  nodes.get('openTranscript').onclick();assert.equal(nodes.get('practiceDock').hidden,true);
  (await storage.ready).close();
});

test('recording details can return a spoken take to practice with its recorded range and speed',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveTake({id:'spoken',videoId:'video',cueKey:'manual:10:15',start:10,end:15,speed:0.75,createdAt:1,blob:new Blob(['voice'])});
  const {nodes}=await mount(storage);
  nodes.get('tab-recordings').onclick();assert.equal(nodes.get('reuseSongRange').hidden,false);
  nodes.get('reuseSongRange').onclick();
  assert.equal(nodes.get('page-practice').hidden,false);assert.equal(nodes.get('practiceDock').hidden,false);
  assert.equal(nodes.get('start').value,10);assert.equal(nodes.get('end').value,15);
  assert.equal(nodes.get('speed').value,'0.75');assert.equal(nodes.get('activityMode').value,'speech');
  (await storage.ready).close();
});

test('unsupported song assembly explains the reason before the user clicks',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveTake({id:'slow',videoId:'video',kind:'song',capture:'vocal',cueKey:'song:manual',start:0,end:5,speed:0.75,createdAt:1,blob:new Blob(['voice'])});
  const {nodes}=await mount(storage);
  assert.equal(nodes.get('songAssembly').hidden,false);
  assert.equal(nodes.get('assembleSong').disabled,true);
  assert.equal(nodes.get('assemblyWarning').hidden,false);assert.match(nodes.get('assemblyWarning').textContent,/1×/);
  (await storage.ready).close();
});

test('Escape stops playback, restores idle actions and clears the playing status',async()=>{
  const storage=createStorage(new IDBFactory());
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){},addEventListener(){},removeEventListener(){}};
  const {nodes,root}=await mount(storage,{video});
  let stopFocused=false;
  root.activeElement=nodes.get('original');nodes.get('stop').id='stop';
  nodes.get('stop').focus=()=>{stopFocused=true;root.activeElement=nodes.get('stop');};
  const playing=nodes.get('original').onclick();
  for(let i=0;i<10 && !nodes.get('transportProgress').oninput;i++)await Promise.resolve();
  assert.equal(nodes.get('practiceDock').hidden,true);
  assert.equal(stopFocused,true);
  root.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});
  await playing;
  assert.equal(nodes.get('practiceDock').hidden,false);
  assert.equal(nodes.get('transport').hidden,true);assert.equal(nodes.get('status').textContent,'已停止。');
  (await storage.ready).close();
});

test('singing detects offline service and retry collapses setup help after connection',async()=>{
  const storage=createStorage(new IDBFactory());let online=false,checks=0,starts=0;
  const {nodes}=await mount(storage,{health:()=>{checks++;return online?{service:'echo-karaoke',maxSeconds:600}:{error:'offline'};},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){starts++;return {};}}}}});
  assert.equal(checks,0);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('checkKaraoke').onclick();
  assert.match(nodes.get('karaokeService').textContent,/未连接/);assert.equal(nodes.get('karaokeHelp').open,true);
  assert.equal(starts,0);assert.equal(nodes.get('record').disabled,false);
  online=true;await nodes.get('checkKaraoke').onclick();
  assert.match(nodes.get('karaokeService').textContent,/已连接/);assert.equal(nodes.get('karaokeHelp').open,false);assert.equal(starts,0);
  (await storage.ready).close();
});
test('offline generation shows setup next to the button even while cache lookup is pending',async()=>{
  const storage=createStorage(new IDBFactory());let starts=0;
  const {nodes}=await mount(storage,{health:()=>({error:'offline'}),cachedBackings:new Promise(()=>{}),globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){starts++;return {};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('checkKaraoke').onclick();
  assert.equal(nodes.get('prepareBacking').disabled,false);
  await nodes.get('prepareBacking').onclick();
  assert.equal(starts,0);assert.equal(nodes.get('karaokeNotice').hidden,false);
  assert.match(nodes.get('karaokeNotice').textContent,/bash start-karaoke.sh/);
  assert.equal(nodes.get('karaokeHelp').open,true);
  nodes.get('speed').onchange();assert.equal(nodes.get('karaokeNotice').hidden,false);
  (await storage.ready).close();
});
test('content script restores selected sentence, boundaries, settings and matching take',async()=>{
  const storage=createStorage(new IDBFactory());
  const first={start:0,end:2,text:'First sentence'},second={start:2.2,end:5.4,text:'Second sentence',key:cueKey({start:2,text:'Second sentence'})};
  await storage.saveSession({videoId:'video',index:1,start:2.2,end:5.4,speed:'0.75',showChinese:true,hideText:false,replayVocalVolume:1.4,replayBackingVolume:0.35,replayWithBacking:false,cues:[first,second]});
  await storage.saveTake({id:'one',videoId:'video',cueKey:second.key,start:2,end:5,speed:1,createdAt:1,blob:new Blob(['audio']),label:'第 2 句'});
  const {nodes}=await mount(storage);
  assert.equal(nodes.get('replayVocalVolume').value,1.4);assert.equal(nodes.get('replayBackingVolume').value,0.35);assert.equal(nodes.get('replayWithBacking').checked,false);
  nodes.get('replayVocalVolume').value='1.6';await nodes.get('replayVocalVolume').onchange();
  assert.equal(nodes.get('position').textContent,'2 / 2');assert.equal(nodes.get('start').value,2.2);
  assert.equal(nodes.get('speed').value,'0.75');assert.equal(nodes.get('showChinese').checked,true);
  assert.equal(nodes.get('recordingContent').hidden,false);assert.match(nodes.get('historyInfo').textContent,/2.0–5.0/);
  await nodes.get('startLater').onclick();
  const saved=await storage.getSession('video');assert.equal(saved.start,2.4);assert.equal(saved.cues[1].key,second.key);
  assert.equal(saved.cues[1].start,2.2);assert.equal(saved.replayVocalVolume,1.6);assert.equal(saved.replayBackingVolume,0.35);assert.equal(saved.replayWithBacking,false);
  // Changing boundaries keeps the same sentence's recording available.
  assert.equal(nodes.get('replay').disabled,false);
  (await storage.ready).close();
});

test('plain recording pauses for buffering and saves to its original video after navigation',async()=>{
  const storage=createStorage(new IDBFactory()),listeners=new Map(),frames=new Map();let instance,stopped=0,frameId=0;
  const location={href:'https://www.youtube.com/watch?v=video',pathname:'/watch'};
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){},
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  class Recorder{
    static isTypeSupported(){return true;}
    constructor(){instance=this;this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    pause(){this.state='paused';}
    resume(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['recorded'])});setTimeout(()=>this.onstop(),0);}
  }
  const {nodes,events}=await mount(storage,{video,globals:{location,requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);},MediaRecorder:Recorder,navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){stopped++;}}]};}}}}});
  const recording=nodes.get('record').onclick();
  for(let i=0;i<10 && instance?.state!=='recording';i++)await new Promise(r=>setTimeout(r,1));
  assert.equal(instance.state,'recording');
  assert.equal(nodes.get('activityMode').hidden,true);assert.equal(nodes.get('practiceDock').hidden,true);
  assert.equal(nodes.get('practiceDock').hidden,true);
  assert.equal(nodes.get('stop').textContent,'■ 结束录音');
  assert.equal(nodes.get('transport').hidden,false);
  assert.equal(nodes.get('transportTime').textContent,'0:00 / 0:05');assert.equal(nodes.get('liveMeter').hidden,false);
  assert.equal(nodes.get('transportProgress').disabled,true);
  assert.equal(nodes.get('transportProgress').oninput,null);
  video.currentTime=2;frames.values().next().value();
  assert.equal(nodes.get('transportProgress').value,0.4);
  assert.equal(nodes.get('transportTime').textContent,'0:02 / 0:05');
  listeners.get('waiting')();assert.equal(instance.state,'paused');
  listeners.get('playing')();await Promise.resolve();assert.equal(instance.state,'recording');
  nodes.get('hideText').checked=true;nodes.get('hideText').onchange();
  nodes.get('showChinese').checked=true;nodes.get('followCaptions').checked=false;
  location.href='https://www.youtube.com/watch?v=other';events.get('yt-navigate-finish')();
  await recording;
  assert.equal((await storage.listTakes('video')).length,1);assert.equal((await storage.listTakes('other')).length,0);
  assert.equal(stopped,1);assert.equal(nodes.get('recordingContent').hidden,true);assert.equal(nodes.get('liveMeter').hidden,true);
  assert.equal(nodes.get('transport').hidden,true);
  assert.equal(nodes.get('hideText').checked,false);assert.equal(nodes.get('showChinese').checked,false);
  assert.equal(nodes.get('followCaptions').checked,true);
  assert.equal(nodes.get('list').style.display,'');
  (await storage.ready).close();
});

test('an imported file cannot overwrite a new video after navigation',async()=>{
  const storage=createStorage(new IDBFactory());let complete;
  const location={href:'https://www.youtube.com/watch?v=video',pathname:'/watch'};
  const {nodes,events}=await mount(storage,{globals:{location}});
  nodes.get('file').files=[{size:20,text:()=>new Promise(resolve=>{complete=resolve;})}];
  const importing=nodes.get('file').onchange();assert.equal(nodes.get('record').disabled,true);
  location.href='https://www.youtube.com/watch?v=other';events.get('yt-navigate-finish')();
  complete('00:00 --> 00:01\nOld video');await importing;
  assert.equal(nodes.get('position').textContent,'手动片段');
  (await storage.ready).close();
});

test('waveform decoding starts only after opening recording details',async()=>{
  const storage=createStorage(new IDBFactory());let decodes=0;
  await storage.saveTake({id:'one',videoId:'video',cueKey:'manual:0.00:5.00',start:0,end:5,speed:1,createdAt:1,blob:new Blob(['audio'])});
  class AudioContext{constructor(){decodes++;throw Error('no decoder in fixture');}}
  const {nodes}=await mount(storage,{globals:{AudioContext}});
  assert.equal(decodes,0);nodes.get('recordingDetails').open=true;nodes.get('recordingDetails').ontoggle();
  assert.equal(decodes,1);assert.match(nodes.get('analysisText').textContent,/仍可回放或下载/);
  (await storage.ready).close();
});

test('legacy service warns about restart before submitting a long song',async()=>{
  const storage=createStorage(new IDBFactory());let starts=0;
  const {nodes}=await mount(storage,{video:{duration:500},health:()=>({service:'echo-karaoke',version:1}),globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){starts++;return {};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();await nodes.get('checkKaraoke').onclick();
  assert.match(nodes.get('karaokeService').textContent,/旧版/);await nodes.get('prepareBacking').onclick();
  assert.equal(starts,0);assert.match(nodes.get('karaokeNotice').textContent,/Ctrl\+C/);
  (await storage.ready).close();
});

test('song mode exposes main recording and guides missing accompaniment without requesting a microphone',async()=>{
  const storage=createStorage(new IDBFactory());let micRequests=0;
  const {nodes}=await mount(storage,{globals:{navigator:{mediaDevices:{async getUserMedia(){micRequests++;throw Error('unexpected');}}}}});
  assert.equal(nodes.get('singActions').hidden,true);assert.equal(nodes.get('practiceDock').hidden,false);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('singActions').hidden,false);assert.equal(nodes.get('practiceDock').hidden,false);
  assert.equal(nodes.get('practiceTools').open,false);assert.equal(nodes.get('practiceToolsSummary').hidden,false);
  assert.equal(nodes.get('karaokeSettings').open,false);assert.equal(nodes.get('record').disabled,false);
  await nodes.get('record').onclick();assert.equal(micRequests,0);assert.equal(nodes.get('karaokeSettings').open,true);
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('singActions').hidden,true);assert.equal(nodes.get('karaokeSettings').hidden,true);
  assert.equal(nodes.get('practiceDock').hidden,false);assert.equal(nodes.get('practiceToolsSummary').hidden,false);
  (await storage.ready).close();
});

test('volume remains adjustable during accompaniment preview and saves the chosen gain',async()=>{
  const storage=createStorage(new IDBFactory());let gain=1,sound;
  await storage.saveBacking({key:'music',videoId:'video',start:0,end:60,createdAt:1,blob:new Blob(['audio'])});
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){},addEventListener(){},removeEventListener(){}};
  class Audio{constructor(){sound=this;}pause(){}async play(){}}
  const {nodes}=await mount(storage,{video,globals:{Audio,EchoKaraoke:{...require('../extension/karaoke.js'),async createBackingOutput(){return {setVolume(value){gain=value;},dispose(){}};}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  const playing=nodes.get('previewBacking').onclick();
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(nodes.get('backingVolume').disabled,false);
  nodes.get('backingVolume').value='1.5';nodes.get('backingVolume').oninput();
  assert.equal(gain,1.5);assert.equal(nodes.get('backingVolumeValue').textContent,'150%');
  for(let i=0;i<20 && !nodes.get('transportProgress').oninput;i++)await Promise.resolve();
  nodes.get('transportProgress').value='0.5';await nodes.get('transportProgress').oninput();
  assert.equal(video.currentTime,30);assert.equal(sound.currentTime,30);
  nodes.get('backingVolume').onchange();nodes.get('stop').onclick();await playing;
  const session=await storage.getSession('video');assert.equal(session.backingVolume,1.5);
  (await storage.ready).close();
});

test('original playback slider seeks within the selected range at reduced speed',async()=>{
  const storage=createStorage(new IDBFactory());
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){},addEventListener(){},removeEventListener(){}};
  const {nodes}=await mount(storage,{video});
  nodes.get('speed').value='0.5';
  const playing=nodes.get('original').onclick();
  for(let i=0;i<10 && !nodes.get('transportProgress').oninput;i++)await Promise.resolve();
  const slider=nodes.get('transportProgress');
  assert.equal(slider.disabled,false);assert.equal(nodes.get('transportTime').textContent,'0:00 / 0:10');
  slider.value='0.75';await slider.oninput();assert.equal(video.currentTime,3.75);
  slider.value='0.25';await slider.oninput();assert.equal(video.currentTime,1.25);
  nodes.get('stop').onclick();await playing;assert.equal(slider.oninput,null);
  (await storage.ready).close();
});

test('song replay starts at audio opening and shows progress from the audio clock',async()=>{
  const storage=createStorage(new IDBFactory()),listeners=new Map(),calls=[],audioSeeks=[],frames=new Map();let sound,frameId=0;
  await storage.saveTake({id:'song',kind:'song',videoId:'video',cueKey:'song:manual',start:0,end:10,speed:1,createdAt:1,blob:new Blob(['song'])});
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},
    async play(){if(!calls.includes('video'))this.currentTime=3;calls.push('video');listeners.get('playing')?.();}};
  class Audio{
    constructor(){sound=this;this.elapsed=0;}
    get currentTime(){return this.elapsed;}set currentTime(value){audioSeeks.push(value);this.elapsed=value;}
    pause(){}async play(){calls.push('audio');}
  }
  const {nodes}=await mount(storage,{video,globals:{Audio,requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  const replaying=nodes.get('replay').onclick();
  for(let i=0;i<10 && !calls.includes('video');i++)await Promise.resolve();
  await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(calls.slice(0,2),['audio','video']);assert.deepEqual(audioSeeks,[]);
  assert.equal(video.currentTime,0);
  assert.equal(nodes.get('transport').hidden,false);
  assert.equal(nodes.get('transportTime').textContent,'0:00 / 0:10');
  sound.duration=2;sound.elapsed=0.5;frames.values().next().value();
  assert.equal(nodes.get('transportProgress').value,0.25);
  assert.equal(nodes.get('transportTime').textContent,'0:00 / 0:02');
  sound.elapsed=0.6;listeners.get('waiting')();video.currentTime=4;listeners.get('playing')();
  assert.equal(video.currentTime,0.6);assert.deepEqual(audioSeeks,[]);
  const slider=nodes.get('transportProgress');assert.equal(slider.disabled,false);
  sound.duration=8;slider.value='0.75';await slider.oninput();
  assert.equal(sound.currentTime,6);assert.equal(video.currentTime,6);
  slider.value='0.125';await slider.oninput();
  assert.equal(sound.currentTime,1);assert.equal(video.currentTime,1);
  sound.onended();await replaying;assert.equal(nodes.get('transport').hidden,true);
  assert.equal(slider.disabled,true);assert.equal(slider.oninput,null);(await storage.ready).close();
});

test('dry singing replay adds backing, seeks both tracks, toggles vocals only and cleans up on stop',async()=>{
  const storage=createStorage(new IDBFactory()),frames=new Map(),listeners=new Map();
  let next=0,sound,position=0,disposed=0,pauses=0,vocalGain=1,musicGain=1;
  await storage.saveTake({id:'vocal',videoId:'video',cueKey:'song:manual',kind:'song',capture:'vocal',vocalOffset:0.2,start:0,end:10,speed:1,createdAt:1,blob:new Blob(['voice'])});
  await storage.saveBacking({key:'music',videoId:'video',start:0,end:60,createdAt:1,blob:new Blob(['backing'])});
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){listeners.get('playing')?.();},
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  class Audio{
    constructor(){sound=this;this.currentTime=0;this.duration=10.2;this.paused=true;}
    async play(){this.paused=false;}pause(){this.paused=true;}
  }
  const monitor={position:()=>position,async sync(value){position=value;},pause(){pauses++;},dispose(){disposed++;},setVolume(value){musicGain=value;}};
  const {nodes}=await mount(storage,{video,globals:{Audio,
    EchoKaraoke:{...require('../extension/karaoke.js'),async createMonitor(){return monitor;},async createAudioOutput(){return {setVolume(value){vocalGain=value;},dispose(){}};}},
    requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  const replaying=nodes.get('replay').onclick();
  for(let i=0;i<30 && !nodes.get('transportProgress').oninput;i++)await Promise.resolve();
  assert.equal(nodes.get('replayMusicOption').hidden,false);assert.equal(nodes.get('replayWithBacking').disabled,false);
  nodes.get('replayVocalVolume').value='1.5';nodes.get('replayVocalVolume').oninput();
  nodes.get('replayBackingVolume').value='0.4';nodes.get('replayBackingVolume').oninput();
  assert.equal(vocalGain,1.5);assert.equal(musicGain,0.4);assert.equal(sound.currentTime,0);
  nodes.get('backingVolume').value='2';nodes.get('backingVolume').oninput();assert.equal(musicGain,0.4);
  nodes.get('resetReplayMix').onclick();assert.equal(vocalGain,1);assert.equal(musicGain,1);
  sound.currentTime=1.2;const [frame,tick]=frames.entries().next().value;frames.delete(frame);tick();await Promise.resolve();
  assert.equal(position,1);
  nodes.get('transportProgress').value='0.5';await nodes.get('transportProgress').oninput();
  assert(Math.abs(position-4.9)<0.001);assert(Math.abs(video.currentTime-4.9)<0.001);
  listeners.get('waiting')();assert.equal(sound.paused,true);assert(pauses>0);
  listeners.get('playing')();await Promise.resolve();await Promise.resolve();assert.equal(sound.paused,false);
  nodes.get('replayWithBacking').checked=false;nodes.get('replayWithBacking').onchange();
  const paused=pauses;assert(paused>0);
  nodes.get('replayWithBacking').checked=true;nodes.get('replayWithBacking').onchange();await Promise.resolve();
  nodes.get('stop').onclick();await replaying;
  assert.equal(disposed,1);assert.equal(nodes.get('mixControls').open,false);assert.equal(frames.size,0);
  (await storage.ready).close();
});

test('missing backing does not block dry singing replay and explains the fallback',async()=>{
  const storage=createStorage(new IDBFactory());let sound;
  await storage.saveTake({id:'vocal',videoId:'video',cueKey:'song:manual',kind:'song',capture:'vocal',start:0,end:5,speed:1,createdAt:1,blob:new Blob(['voice'])});
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){},addEventListener(){},removeEventListener(){}};
  class Audio{constructor(){sound=this;this.currentTime=0;}async play(){}pause(){}}
  const {nodes}=await mount(storage,{video,globals:{Audio}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  const replaying=nodes.get('replay').onclick();
  for(let i=0;i<20 && !nodes.get('transportProgress').oninput;i++)await Promise.resolve();
  assert.equal(nodes.get('replayWithBacking').disabled,true);assert.match(nodes.get('status').textContent,/未找到对应伴奏/);
  sound.onended();await replaying;(await storage.ready).close();
});

test('dry vocal downloads can be mixed per take or assembled as a full song without starting recording',async()=>{
  const storage=createStorage(new IDBFactory()),exports=[];
  await storage.saveTake({id:'vocal',kind:'song',capture:'vocal',videoId:'video',cueKey:'song:manual',start:5,end:10,speed:1,createdAt:1,blob:new Blob(['voice'])});
  await storage.saveBacking({key:'backing',videoId:'video',start:0,end:20,createdAt:1,blob:new Blob(['music'])});
  const {nodes,downloads}=await mount(storage,{video:{duration:20},globals:{setTimeout:(fn,ms)=>setTimeout(fn,ms===30000?0:ms),
    EchoAudioExport:{...require('../extension/audio-export.js'),async render(options){exports.push(options);return {blob:new Blob(['wave']),gaps:[]};}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  nodes.get('openSongRecording').onclick();assert.equal(nodes.get('recordingDetails').open,true);
  nodes.get('replayVocalVolume').value='1.5';nodes.get('replayBackingVolume').value='0.4';
  assert.equal(nodes.get('takeMixDownload').hidden,false);await nodes.get('takeMixDownload').onclick();
  assert.equal(exports[0].vocalVolume,1.5);assert.equal(exports[0].volume,0.4);
  assert.equal(exports[0].origin,5);assert.equal(exports[0].duration,5);assert.equal(exports[0].backing.key,'backing');
  nodes.get('assemblyType').value='vocal';await nodes.get('assembleSong').onclick();
  assert.equal(exports[1].origin,0);assert.equal(exports[1].duration,20);assert.equal(exports[1].backing,null);
  nodes.get('assemblyType').value='mixed';await nodes.get('assembleSong').onclick();
  assert.equal(exports[2].backing.key,'backing');assert.equal(downloads.length,3);
  assert.match(downloads[0].download,/vocal-and-backing.wav$/);assert.match(downloads[1].download,/vocals.wav$/);
  (await storage.ready).close();
});

test('legacy mixed songs remain downloadable but never offer extraction of a nonexistent vocal track',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveTake({id:'legacy',kind:'song',withBacking:true,videoId:'video',cueKey:'song:manual',start:0,end:10,speed:1,createdAt:1,blob:new Blob(['mixed'])});
  const {nodes}=await mount(storage);
  nodes.get('openSongRecording').onclick();
  assert.match(nodes.get('download').textContent,/旧版混合/);assert.equal(nodes.get('replayBackingRow').hidden,true);
  assert.match(nodes.get('replayVocalLabel').textContent,/总音量/);
  assert.equal(nodes.get('takeMixDownload').hidden,true);
  await nodes.get('assembleSong').onclick();assert.match(nodes.get('status').textContent,/旧版混合/);
  (await storage.ready).close();
});

test('selecting a lyric uses the main clip recording controls without a duplicate recording section',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveSession({videoId:'video',index:0,start:0,end:2,speed:'1',cues:[{start:0,end:2,text:'First line'},{start:2,end:4,text:'Second line'}]});
  const {nodes}=await mount(storage);assert.equal(nodes.get('captionSetup').hidden,true);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  nodes.get('transcriptSearch').value='second';nodes.get('transcriptSearch').oninput();
  assert.equal(nodes.get('list').children.length,1);nodes.get('list').children[0].onclick();
  assert.equal(nodes.get('start').value,'2.00');
  assert.equal(nodes.get('position').textContent,'2 / 2');
  assert.equal(nodes.get('practiceDock').hidden,false);assert.equal(nodes.get('karaokeScope').value,'clip');
  assert.equal(nodes.get('singActions').hidden,false);assert.equal(nodes.get('practiceTools').open,false);
  assert.match(nodes.get('clipSummary').textContent,/2.0–4.0/);
  assert.match(nodes.get('record').textContent,/开始片段录唱/);
  nodes.get('prev').onclick();assert.equal(nodes.get('start').value,'0.00');
  assert.equal(nodes.get('karaokeScope').value,'clip');
  nodes.get('transcriptSearch').value='no match';nodes.get('transcriptSearch').oninput();
  assert.equal(nodes.get('transcriptNoMatches').hidden,false);assert.equal(nodes.get('list').children.length,0);
  (await storage.ready).close();
});
test('recording history deletion and undo operate without adding practice-page controls',async()=>{
  const storage=createStorage(new IDBFactory());const cue={start:0,end:2,text:'Hello'};
  await storage.saveSession({videoId:'video',index:0,start:0,end:2,speed:'1',cues:[cue]});
  await storage.saveTake({id:'one',videoId:'video',cueKey:cueKey(cue),start:0,end:2,speed:1,createdAt:1,blob:new Blob(['audio']),label:'第 1 句'});
  const {nodes}=await mount(storage);
  await nodes.get('deleteTake').onclick();assert.equal((await storage.listTakes('video')).length,0);
  assert.equal(nodes.get('recordingContent').hidden,true);assert.equal(nodes.get('undoDelete').hidden,false);
  await nodes.get('undoDelete').onclick();assert.equal((await storage.listTakes('video')).length,1);
  assert.equal(nodes.get('recordingContent').hidden,false);assert.equal(nodes.get('undoDelete').hidden,true);
  (await storage.ready).close();
});

test('play all replays latest recordings in timeline order even without a current-sentence take',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveSession({videoId:'video',index:0,start:20,end:21,speed:'1',cues:[{start:20,end:21,text:'Unrecorded'}]});
  for(const take of [{id:'old',cueKey:'a',start:0,end:1,createdAt:1},{id:'second',cueKey:'b',start:10,end:11,createdAt:2},{id:'new',cueKey:'a',start:1,end:2,createdAt:3}])await storage.saveTake({...take,videoId:'video',speed:1,label:take.id,blob:new Blob([take.id])});
  let time=0;const listeners=new Map(),positions=[];
  const video={duration:60,muted:false,playbackRate:1,ended:false,pause(){},get currentTime(){return time;},set currentTime(value){time=value;queueMicrotask(()=>{for(const fn of listeners.get('seeked')||[])fn();});},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},async play(){positions.push(time);time+=1;}};
  class Audio {constructor(url){this.src=url;}pause(){}async play(){setTimeout(()=>this.onended?.(),1);}}
  const {nodes}=await mount(storage,{video,globals:{Audio,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout}});
  assert.equal(nodes.get('replay').disabled,true);assert.equal(nodes.get('playAll').disabled,false);
  await nodes.get('playAll').onclick();
  assert.deepEqual(positions,[1,10]);assert.equal(video.muted,false);assert.equal(nodes.get('playAll').disabled,false);
  assert.match(nodes.get('status').textContent,/已播完 2/);
  (await storage.ready).close();
});

test('recording timeline plays in one click, exposes versions directly and filters by words',async()=>{
  const storage=createStorage(new IDBFactory());const cue={start:0,end:1,text:'Hello world'};
  await storage.saveSession({videoId:'video',index:0,start:0,end:1,speed:'1',cues:[cue]});
  for(const [id,createdAt] of [['old',1],['new',2]])await storage.saveTake({id,createdAt,videoId:'video',cueKey:cueKey(cue),start:0,end:1,speed:1,label:'第 1 句',blob:new Blob([id])});
  const listeners=new Map();let time=0,played=0;
  const video={duration:60,muted:false,playbackRate:1,ended:false,pause(){},get currentTime(){return time;},set currentTime(value){time=value;queueMicrotask(()=>{for(const fn of listeners.get('seeked')||[])fn();});},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},async play(){played++;time+=1;}};
  class Audio {constructor(url){this.src=url;}pause(){}async play(){setTimeout(()=>this.onended?.(),1);}}
  const {nodes,root}=await mount(storage,{video,globals:{Audio,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout}});
  assert.equal(nodes.get('historyList').children.length,1);
  assert.equal(nodes.get('versionChoices').children.length,2);
  assert.equal(nodes.get('versionChoices').children[1].getAttribute('aria-pressed'),'true');
  await nodes.get('historyList').children[0].children[0].onclick();assert.equal(played,1);
  await nodes.get('versionChoices').children[0].onclick();assert.equal(played,2);
  assert.equal(nodes.get('versionChoices').children[0].getAttribute('aria-pressed'),'true');
  nodes.get('recordingSearch').value='missing';nodes.get('recordingSearch').oninput();
  assert.equal(nodes.get('historyList').children[0].textContent,'没有匹配的录音，试试其他关键词。');
  nodes.get('recordingSearch').value='hello';nodes.get('recordingSearch').oninput();
  assert.equal(nodes.get('historyList').children.length,1);
  (await storage.ready).close();
});

 test('timeline delete removes an unselected take without playing and undo restores it',async()=>{
  const storage=createStorage(new IDBFactory());const cue={start:0,end:1,text:'First'};
  await storage.saveSession({videoId:'video',index:0,start:0,end:1,speed:'1',cues:[cue]});
  for(const [id,key,start] of [['selected',cueKey(cue),0],['other','other',5]])
    await storage.saveTake({id,videoId:'video',cueKey:key,start,end:start+1,speed:1,createdAt:1,blob:new Blob([id]),label:id});
  let played=0;
  const {nodes}=await mount(storage,{video:{duration:60,play(){played++;}}});
  const row=nodes.get('historyList').children[1];
  assert.equal(row.children[1].textContent,'删除');
  await row.children[1].onclick();
  assert.deepEqual((await storage.listTakes('video')).map(t=>t.id),['selected']);
  assert.match(nodes.get('historyInfo').textContent,/selected/);
  assert.equal(played,0);assert.equal(nodes.get('undoDelete').hidden,false);
  await nodes.get('undoDelete').onclick();
  assert.equal((await storage.listTakes('video')).length,2);assert.equal(played,0);
  (await storage.ready).close();
});

 test('subtitle preparation has one transcript entry and returns to practice after import',async()=>{
  const storage=createStorage(new IDBFactory());
  const {nodes}=await mount(storage,{globals:{EchoTranscript:{read:async()=>[{start:2,end:4,text:'Read from video'}]}}});
  assert.equal(nodes.get('page-practice').hidden,false);
  nodes.get('openCaptionSetup').onclick();assert.equal(nodes.get('page-transcript').hidden,false);
  nodes.get('file').files=[{size:60,text:async()=> '1\n00:00:00,000 --> 00:00:01,000\nImported line\n'}];
  let opened=0;nodes.get('file').onclick=()=>{opened++;};
  nodes.get('import').onclick();assert.equal(opened,1);
  await nodes.get('file').onchange();
  assert.equal(nodes.get('page-practice').hidden,false);
  assert.equal(nodes.get('page-transcript').hidden,true);
  assert.equal(nodes.get('position').textContent,'1 / 1');
  assert.match(nodes.get('status').textContent,/已导入 1/);
  await nodes.get('read').onclick();
  assert.equal(nodes.get('page-practice').hidden,false);
  assert.equal(nodes.get('start').value,'2.00');
  assert.match(nodes.get('status').textContent,/已读取 1/);
  (await storage.ready).close();
});

test('clip-only accompaniment must be regenerated when boundaries exceed its range',async()=>{
  const storage=createStorage(new IDBFactory()), calls=[];
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message);
    return message.action==='audio'?{audio:'UklGRg==',mime:'audio/wav'}:{id:'a'.repeat(32),state:'ready'};
  }}}}});
  nodes.get('karaokeScope').value='clip';
  assert.equal(nodes.get('previewBacking').disabled,true);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(nodes.get('useBacking').checked,true);assert.equal(nodes.get('previewBacking').disabled,false);
  assert.deepEqual(calls.map(c=>c.action),['start','audio']);
  assert.equal(calls[0].start,0);assert.equal(calls[0].end,5);
  nodes.get('end').value=6;nodes.get('end').onchange();
  assert.equal(nodes.get('previewBacking').disabled,true);
  await nodes.get('record').onclick();
  assert.match(nodes.get('status').textContent,/当前练习范围生成伴奏/);
  (await storage.ready).close();
});

test('stopping during job submission cancels the late job without enabling stale accompaniment',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];let resolve;
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message.action);
    if(message.action==='start')return await new Promise(r=>{resolve=r;});
    return {};
  }}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  const preparing=nodes.get('prepareBacking').onclick();
  assert.equal(nodes.get('record').disabled,true);
  nodes.get('stop').onclick();resolve({id:'b'.repeat(32),state:'ready'});await preparing;
  assert.deepEqual(calls,['start','cancel']);
  assert.equal(nodes.get('previewBacking').disabled,true);assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});

test('karaoke service failure leaves ordinary recording controls available',async()=>{
  const storage=createStorage(new IDBFactory());
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){return {error:'本机服务未启动'};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.match(nodes.get('status').textContent,/未能生成伴奏/);
  assert.match(nodes.get('karaokeNotice').textContent,/本机服务未启动/);
  nodes.get('speed').onchange();
  assert.match(nodes.get('karaokeNotice').textContent,/本机服务未启动/);
  assert.equal(nodes.get('karaokeProgress').hidden,true);
  assert.equal(nodes.get('record').disabled,false);assert.equal(nodes.get('previewBacking').disabled,true);
  (await storage.ready).close();
});

test('whole-song recording uses the full duration and offers replay, retry and download without changing the selected sentence',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveSession({videoId:'video',index:0,start:0,end:1,speed:'1',cues:[{start:0,end:1,text:'Sing'}]});
  const listeners=new Map(),mixedStream={},events=[];let time=0;
  const video={duration:180,muted:false,playbackRate:1,pause(){},get currentTime(){return time;},set currentTime(v){time=v;},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},async play(){events.push('video-play');time=180;}};
  const mic={getTracks:()=>[{stop(){events.push('mic-stop');}}]};
  class MediaRecorder {
    static isTypeSupported(){return true;}
    constructor(stream){assert.equal(stream,mic);this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';events.push('recorder-start');}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['mixed-audio'])});queueMicrotask(()=>this.onstop());}
  }
  const mix={stream:mixedStream,async sync(position){assert.equal(position,0);events.push('sync');},pause(){events.push('pause');},dispose(){events.push('dispose');}};
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{getUserMedia:async constraints=>{
      assert.equal(constraints.video,false);
      assert.deepEqual({...constraints.audio},{echoCancellation:false,noiseSuppression:false,autoGainControl:false});
      return mic;
    }}},
    EchoKaraoke:{...require('../extension/karaoke.js'),createMonitor:async options=>{assert.equal(options.video,video);return mix;}},
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
    chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){return message.action==='audio'?{audio:'UklGRg==',mime:'audio/wav'}:{id:'c'.repeat(32),state:'ready'};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  await nodes.get('record').onclick();
  for(let i=0;i<20 && !(await storage.listTakes('video')).length;i++)await new Promise(r=>setTimeout(r,2));
  const takes=await storage.listTakes('video');assert.equal(takes.length,1);
  assert.match(takes[0].cueKey,/^song:/);
  assert.equal(takes[0].kind,'song');assert.equal(takes[0].start,0);assert.equal(takes[0].end,180);
  assert.equal(nodes.get('end').value,1);assert.equal(nodes.get('songResult').hidden,false);
  assert.equal(nodes.get('record').textContent,'● 再录一次');assert.match(nodes.get('download').href,/^blob:/);
  nodes.get('karaokeScope').value='clip';nodes.get('karaokeScope').onchange();
  assert.equal(nodes.get('record').textContent,'● 开始片段录唱');
  assert.equal(nodes.get('reuseSongRange').hidden,false);nodes.get('reuseSongRange').onclick();
  assert.equal(nodes.get('start').value,0);assert.equal(nodes.get('end').value,180);
  assert.equal(nodes.get('record').textContent,'● 再录一次');
  assert.equal(takes[0].withBacking,undefined);assert.equal(takes[0].capture,'vocal');assert.equal(await takes[0].blob.text(),'mixed-audio');
  assert.deepEqual(events.filter(value=>['recorder-start','sync','video-play'].includes(value)),['recorder-start','sync','video-play']);
  assert(events.includes('dispose'));assert(events.includes('mic-stop'));assert.equal(video.muted,false);
  assert.match(nodes.get('historyInfo').textContent,/独立人声/);
  assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});

test('default generation covers the whole song and reuses it for different sentences without moving practice boundaries',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];const cue={start:10,end:12,text:'Keep this sentence'};
  await storage.saveSession({videoId:'video',index:0,start:10,end:12,speed:'1',cues:[cue]});
  const {nodes}=await mount(storage,{video:{duration:180,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message);return message.action==='audio'?{audio:'UklGRg==',mime:'audio/wav'}:{id:'d'.repeat(32),state:'ready'};
  }}}}});
  assert.equal(nodes.get('karaokeScope').value,'whole');assert.equal(nodes.get('record').disabled,false);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(calls[0].start,0);assert.equal(calls[0].end,180);
  assert.equal(nodes.get('start').value,10);assert.equal(nodes.get('end').value,12);
  assert.equal(nodes.get('record').disabled,false);
  nodes.get('start').value=30;nodes.get('end').value=40;nodes.get('end').onchange();
  nodes.get('karaokeScope').value='clip';nodes.get('karaokeScope').onchange();
  assert.equal(nodes.get('record').disabled,false);assert.equal(nodes.get('previewBacking').disabled,false);
  assert.equal(nodes.get('prepareBacking').disabled,true);assert.equal(calls.length,2);
  (await storage.ready).close();
});

test('long videos require choosing a clip rather than silently truncating a song',async()=>{
  const storage=createStorage(new IDBFactory());let requests=0;
  const {nodes}=await mount(storage,{video:{duration:601,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){requests++;}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(requests,0);assert.match(nodes.get('status').textContent,/超过 10 分钟/);
  assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});

test('ordinary dubbing records the microphone directly with the accompaniment service offline, including after leaving singing mode',async()=>{
  const storage=createStorage(new IDBFactory());const cue={start:0,end:1,text:'Spoken sentence'};
  await storage.saveSession({videoId:'video',index:0,start:0,end:1,speed:'1',cues:[cue]});
  const mic={getTracks:()=>[{stop(){}}]},listeners=new Map();let time=0,requests=0,mixes=0;
  const video={duration:600,muted:false,playbackRate:1,pause(){},get currentTime(){return time;},set currentTime(v){time=v;},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},async play(){time=1;}};
  class MediaRecorder {
    static isTypeSupported(){return true;}
    constructor(source){assert.equal(source,mic);this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice-only'])});queueMicrotask(()=>this.onstop());}
  }
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{getUserMedia:async constraints=>{
      assert.equal(constraints.video,false);
      assert.deepEqual({...constraints.audio},{echoCancellation:true,autoGainControl:true});
      return mic;
    }}},
    EchoKaraoke:{...require('../extension/karaoke.js'),createMonitor:async()=>{mixes++;throw Error('Must not monitor ordinary dubbing');}},
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
    chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){requests++;throw Error('offline');}}}}});
  assert.equal(nodes.get('activityMode').value,'speech');assert.equal(nodes.get('karaokeSettings').hidden,true);
  await nodes.get('prepareBacking').onclick();assert.equal(requests,0);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('karaokeSettings').hidden,false);nodes.get('useBacking').checked=true;
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('useBacking').checked,false);assert.equal(nodes.get('karaokeSettings').hidden,true);
  // Even stale/programmatic checkbox state cannot enable accompaniment in speech mode.
  nodes.get('useBacking').checked=true;
  await nodes.get('record').onclick();
  for(let i=0;i<20 && !(await storage.listTakes('video')).length;i++)await new Promise(r=>setTimeout(r,2));
  const [take]=await storage.listTakes('video');
  assert.equal(await take.blob.text(),'voice-only');assert.equal(take.withBacking,undefined);assert.equal(take.kind,undefined);
  assert.equal(take.cueKey,cueKey(cue));assert.equal(take.start,0);assert.equal(take.end,1);
  assert.equal(requests,0);assert.equal(mixes,0);assert.equal(video.muted,false);
  assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});

test('the main singing button records a selected clip without backing and disables speech processing',async()=>{
  const storage=createStorage(new IDBFactory());
  const cue={start:0,end:1,text:'Sustained note'};
  await storage.saveSession({videoId:'video',index:0,start:0,end:1,speed:'1',cues:[cue]});
  const mic={getTracks:()=>[{stop(){}}]};
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){this.currentTime=1;},addEventListener(){},removeEventListener(){}};
  let requested;
  class MediaRecorder {
    static isTypeSupported(){return true;}
    constructor(source){assert.equal(source,mic);this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['vocal'])});queueMicrotask(()=>this.onstop());}
  }
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,
    navigator:{mediaDevices:{async getUserMedia(constraints){requested=constraints;return mic;}}},
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  nodes.get('useBacking').checked=false;
  nodes.get('useBacking').onchange();
  nodes.get('karaokeScope').value='clip';nodes.get('karaokeScope').onchange();
  assert.match(nodes.get('songReadiness').textContent,/清唱/);
  await nodes.get('record').onclick();
  assert.deepEqual({...requested.audio},{echoCancellation:false,noiseSuppression:false,autoGainControl:false});
  assert.equal(requested.video,false);
  const takes=await storage.listTakes('video');assert.equal(takes.length,1);
  assert.equal(takes[0].kind,'song');assert.equal(takes[0].start,0);assert.equal(takes[0].end,1);
  assert.equal(nodes.get('useBacking').checked,false);
  (await storage.ready).close();
});

test('generation displays live separation progress, encoding state and completion without inventing overall percentages',async()=>{
  const storage=createStorage(new IDBFactory());let nodes,polls=0;
  const mounted=await mount(storage,{video:{duration:60,pause(){}},globals:{
    setTimeout:(fn,ms)=>setTimeout(fn,ms===1500?0:ms),
    chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
      if(message.action==='start')return {id:'e'.repeat(32),state:'separating',progress:40,elapsedSeconds:16,remainingSeconds:23};
      if(message.action==='status'){
        if(polls++===0){
          assert.equal(nodes.get('karaokeProgress').hidden,false);assert.equal(nodes.get('karaokeProgress').value,40);
          assert.match(nodes.get('karaokeInfo').textContent,/40%.*已用.*预计剩余/);
          assert.doesNotMatch(nodes.get('status').textContent,/%|已用|预计剩余/);
          return {id:'e'.repeat(32),state:'encoding',progress:null,elapsedSeconds:30};
        }
        assert.match(nodes.get('karaokeInfo').textContent,/压缩并保存/);
        assert.doesNotMatch(nodes.get('karaokeInfo').textContent,/%/);
        return {id:'e'.repeat(32),state:'ready',progress:100,elapsedSeconds:31};
      }
      assert.equal(nodes.get('karaokeProgress').value,100);
      return {audio:'UklGRg==',mime:'audio/wav'};
    }}}}});
  nodes=mounted.nodes;nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(polls,2);assert.equal(nodes.get('karaokeProgress').hidden,true);
  assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});

test('captions follow playback with faded context while preserving recording boundaries and selected sentence',async()=>{
  const storage=createStorage(new IDBFactory()),listeners=new Map();let time=0;
  const cues=[{start:2,end:4,text:'First line 第一句'},{start:4,end:6,text:'Second line 第二句'},{start:9,end:10,text:'Third line 第三句'}];
  await storage.saveSession({videoId:'video',index:0,start:2,end:4,speed:'1',showChinese:true,cues});
  const video={duration:180,paused:true,get currentTime(){return time;},
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  const {nodes}=await mount(storage,{video});
  const text=()=>nodes.get('caption').children.map(n=>n.textContent).join('');
  assert.equal(text(),'First line');assert.equal(nodes.get('captionNext').textContent,'Second line');
  assert.equal(nodes.get('captionPrevious').hidden,true);
  video.paused=false;time=4.5;listeners.get('timeupdate')({type:'timeupdate'});
  assert.equal(text(),'Second line');assert.equal(nodes.get('captionPrevious').textContent,'First line');
  assert.equal(nodes.get('captionNext').textContent,'Third line');assert.equal(nodes.get('translation').textContent,'第二句');
  assert.equal(nodes.get('start').value,2);assert.equal(nodes.get('end').value,4);
  time=7;listeners.get('timeupdate')({type:'timeupdate'});
  assert.equal(text(),'Third line');assert.match(nodes.get('captionPhase').textContent,/即将开始 · 2 秒/);
  assert.equal(nodes.get('captionNext').hidden,true);
  video.paused=true;time=3;listeners.get('seeked')({type:'seeked'});assert.equal(text(),'First line');
  nodes.get('hideText').checked=true;nodes.get('hideText').onchange();
  assert.equal(nodes.get('captionPrevious').hidden,true);assert.equal(nodes.get('captionNext').hidden,true);
  assert.equal(nodes.get('translation').hidden,true);assert.equal(nodes.get('rawCaption').textContent,'');
  nodes.get('hideText').checked=false;nodes.get('hideText').onchange();
  nodes.get('followCaptions').checked=false;nodes.get('followCaptions').onchange();
  time=9.5;video.paused=false;listeners.get('timeupdate')({type:'timeupdate'});assert.equal(text(),'First line');
  const saved=await storage.getSession('video');assert.equal(saved.index,0);assert.equal(saved.start,2);assert.equal(saved.end,4);
  assert.equal(saved.followCaptions,false);
  (await storage.ready).close();
});

test('generated accompaniment is restored after a page reload without contacting the service',async()=>{
  const factory=new IDBFactory(),first=createStorage(factory);
  const mounted=await mount(first,{video:{duration:60,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    return message.action==='audio'?{audio:'UklGRg==',mime:'audio/wav'}:{id:'f'.repeat(32),state:'ready'};
  }}}}});
  mounted.nodes.get('activityMode').value='sing';mounted.nodes.get('activityMode').onchange();
  await mounted.nodes.get('prepareBacking').onclick();
  assert.equal((await first.listBackings('video')).length,1);(await first.ready).close();
  const reopened=createStorage(factory);let requests=0;
  const {nodes}=await mount(reopened,{video:{duration:60},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){requests++;throw Error('offline');}}}}});
  assert.equal(nodes.get('activityMode').value,'sing');assert.equal(nodes.get('karaokeSettings').hidden,false);
  assert.equal(nodes.get('useBacking').checked,true);
  assert.equal(nodes.get('previewBacking').disabled,false);assert.equal(nodes.get('record').disabled,false);
  assert.equal(nodes.get('prepareBacking').disabled,true);assert.equal(requests,0);
  (await reopened.ready).close();
});

test('older server-cached accompaniment is recovered without starting separation and then saved locally',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];
  const {nodes}=await mount(storage,{video:{duration:60},cachedBackings:{backings:[{id:'a'.repeat(32),videoId:'video',start:0,end:60,state:'ready'}]},
    globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){calls.push(message.action);return {audio:'UklGRg==',mime:'audio/wav'};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  for(let i=0;i<20 && nodes.get('previewBacking').disabled;i++)await new Promise(r=>setTimeout(r,2));
  assert.deepEqual(calls,['audio']);assert.equal(nodes.get('record').disabled,false);
  assert.equal((await storage.listBackings('video')).length,1);
  (await storage.ready).close();
});

for(const [language,text,nextText] of [['zh','明月几时有，我想与你一起唱','不知天上宫阙'],['ja','東京で君の名前を呼ぶよ','明日も会いたい'],['ko','오늘 밤 너와 함께 노래해','우리 다시 만나요']]){
  test(`multilingual ${language} lyrics survive restoration, singing mode and caption following`,async()=>{
    const storage=createStorage(new IDBFactory());const listeners=new Map();let time=0;
    const cues=[{start:0,end:2,text},{start:2,end:4,text:nextText}];
    await storage.saveSession({videoId:'video',index:0,start:0,end:2,speed:'1',contentLanguage:language,captionLayout:'original',cues});
    const video={duration:4,paused:true,get currentTime(){return time;},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
    const {nodes}=await mount(storage,{video});
    const shown=()=>nodes.get('caption').children.map(n=>n.textContent).join('');
    assert.equal(shown(),text);assert.equal(nodes.get('captionNext').textContent,nextText);
    assert.match(nodes.get('list').children[0].textContent,new RegExp(text));
    assert.equal(nodes.get('referenceToggle').hidden,true);assert.equal(nodes.get('translation').hidden,true);
    nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();assert.equal(shown(),text);
    time=2.5;video.paused=false;listeners.get('timeupdate')({type:'timeupdate'});assert.equal(shown(),nextText);
    nodes.get('contentLanguage').value='auto';nodes.get('contentLanguage').onchange();
    const saved=await storage.getSession('video');assert.equal(saved.contentLanguage,'auto');assert.equal(saved.captionLayout,'original');
    (await storage.ready).close();
  });
}
test('old Chinese sessions keep complete lyrics rather than enabling legacy English splitting',async()=>{
  const storage=createStorage(new IDBFactory());const text='月亮代表我的心';
  await storage.saveSession({videoId:'video',index:0,start:0,end:2,speed:'1',showChinese:true,cues:[{start:0,end:2,text}]});
  const {nodes}=await mount(storage);assert.equal(nodes.get('captionLayout').value,'original');
  assert.equal(nodes.get('caption').children.map(n=>n.textContent).join(''),text);
  (await storage.ready).close();
});

test('whole-song validation remains beside the generation button without sending a request',async()=>{
  const storage=createStorage(new IDBFactory());let requests=0;
  const {nodes}=await mount(storage,{video:{duration:601,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){requests++;return {};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(requests,0);assert.match(nodes.get('karaokeInfo').textContent,/超过 10 分钟/);assert.match(nodes.get('status').textContent,/超过 10 分钟/);
  assert.equal(nodes.get('prepareBacking').disabled,false);
  (await storage.ready).close();
});


test('caption source selection loads the exact track, persists it and keeps recordings',async()=>{
  const storage=createStorage(new IDBFactory()),requests=[];
  await storage.saveTake({id:'saved',videoId:'video',cueKey:'old',start:0,end:2,speed:1,createdAt:1,blob:new Blob(['voice'])});
  const tracks=[{id:'.zh-Hans',name:'中文（简体）',language:'zh-Hans'},{id:'.en',name:'English',language:'en'}];
  const {nodes}=await mount(storage,{globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){requests.push(message);return message.action==='list'?{tracks}:{cues:[{start:43,end:49,text:'测试中文字幕'}]};}}}}});
  nodes.get('tab-transcript').onclick();
  await nodes.get('refreshCaptionTracks').onclick();assert.equal(nodes.get('captionSource').children.length,3);
  nodes.get('captionSource').value='.zh-Hans';nodes.get('captionSource').onchange();
  for(let i=0;i<20 && !requests.some(r=>r.action==='read');i++)await new Promise(r=>setTimeout(r,2));
  await new Promise(r=>setTimeout(r,5));
  assert.equal(requests.find(r=>r.action==='read').trackId,'.zh-Hans');
  assert.match(nodes.get('captionSourceInfo').textContent,/中文/);assert.equal(nodes.get('position').textContent,'1 / 1');
  assert.equal((await storage.listTakes('video')).length,1);
  const saved=await storage.getSession('video');assert.equal(nodes.get('page-transcript').hidden,false);assert.equal(saved.captionSource,'.zh-Hans');assert.equal(saved.cues[0].text,'测试中文字幕');
  const restored=await mount(storage);assert.equal(restored.nodes.get('captionSource').value,'.zh-Hans');
  (await storage.ready).close();
});
test('caption failures preserve existing cues and never silently fall back to English',async()=>{
  const storage=createStorage(new IDBFactory());let fallback=0;
  await storage.saveSession({videoId:'video',index:0,start:0,end:2,speed:'1',captionSource:'.zh-Hant',captionSourceName:'中文繁体',cues:[{start:0,end:2,text:'保留原歌词'}]});
  const {nodes}=await mount(storage,{globals:{EchoTranscript:{async read(){fallback++;}},chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){return {error:'字幕请求失败'};}}}}});
  await nodes.get('read').onclick();assert.equal(fallback,0);assert.match(nodes.get('status').textContent,/字幕请求失败/);
  assert.equal(nodes.get('position').textContent,'1 / 1');
  assert.equal((await storage.getSession('video')).cues[0].text,'保留原歌词');
  (await storage.ready).close();
});
test('automatic caption reading follows the player selected track instead of the English transcript',async()=>{
  const storage=createStorage(new IDBFactory());let readId;
  const {nodes}=await mount(storage,{globals:{EchoCaptionTracks:{async currentTrack(){return {language:'zh-Hant',generated:false};}},chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(m){if(m.action==='list')return {tracks:[{id:'.en',language:'en',name:'English'},{id:'.zh-Hant',language:'zh-Hant',name:'中文繁体',generated:false}]};readId=m.trackId;return {cues:[{start:0,end:2,text:'測試字幕'}]};}}}}});
  await nodes.get('read').onclick();assert.equal(readId,'.zh-Hant');assert.match(nodes.get('status').textContent,/中文.*繁体/);
  (await storage.ready).close();
});

test('stopping a pending caption request prevents late subtitle replacement',async()=>{
  const storage=createStorage(new IDBFactory());let release;
  await storage.saveSession({videoId:'video',index:0,start:0,end:2,speed:'1',captionSource:'.en',cues:[{start:0,end:2,text:'Original saved caption'}]});
  const {nodes}=await mount(storage,{globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(m){if(m.action==='list')return {tracks:[{id:'.en',name:'English',language:'en'}]};return new Promise(resolve=>release=resolve);}}}}});
  const reading=nodes.get('read').onclick();for(let i=0;i<20 && !release;i++)await Promise.resolve();
  assert.equal(typeof release,'function');nodes.get('stop').onclick();release({cues:[{start:5,end:6,text:'Late result'}]});await reading;
  assert.equal((await storage.getSession('video')).cues[0].text,'Original saved caption');assert.equal(nodes.get('read').disabled,false);
  (await storage.ready).close();
});

test('caption UI uses the page-context client without sending a background request',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];let background=0;
  const videoId='abcdefghijk',location={href:'https://www.youtube.com/watch?v='+videoId,pathname:'/watch'};
  const pageContext={location,URL,AbortSignal,setTimeout,clearTimeout,fetch:async(url,options)=>{
    calls.push({url,options});
    const data=url.includes('/player')?{videoDetails:{videoId},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{vssId:'.zh-Hans',languageCode:'zh-Hans',baseUrl:'https://www.youtube.com/api/timedtext?v='+videoId+'&lang=zh-Hans'}]}}}:{events:[{tStartMs:0,dDurationMs:2000,segs:[{utf8:'页面内字幕'}]}]};
    return {ok:true,async text(){return JSON.stringify(data);}};
  }};
  vm.runInNewContext(fs.readFileSync('extension/caption-tracks.js','utf8'),pageContext);
  const {nodes}=await mount(storage,{globals:{location,EchoCaptionTracks:pageContext.EchoCaptionTracks,chrome:{runtime:{onMessage:{addListener(){}},sendMessage(){background++;throw Error('Unexpected background request');}}}}});
  await nodes.get('refreshCaptionTracks').onclick();assert.equal(background,0);assert.equal(calls.length,1);
  nodes.get('captionSource').value='.zh-Hans';nodes.get('captionSource').onchange();
  for(let i=0;i<20 && calls.length<2;i++)await new Promise(r=>setTimeout(r,2));
  await new Promise(r=>setTimeout(r,5));
  assert.equal(calls.length,2);assert.equal(background,0);assert.equal(calls[0].options.credentials,'omit');
  assert.equal((await storage.getSession(videoId)).cues[0].text,'页面内字幕');
  (await storage.ready).close();
});


test('practice library is separate, can resume a video, and requires confirmation before cache cleanup',async()=>{
  const storage=createStorage(new IDBFactory()),id='abcdefghijk';
  await storage.saveSession({videoId:id,title:'我的练习歌曲',start:12,updatedAt:100});
  await storage.saveTake({id:'keep',videoId:id,cueKey:'one',createdAt:100,start:0,end:2,speed:1,blob:new Blob(['voice'])});
  await storage.saveBacking({key:'clear',videoId:id,start:0,end:20,createdAt:100,blob:new Blob(['music'])});
  const {nodes,root}=await mount(storage);await nodes.get('openLibrary').onclick();
  assert.equal(nodes.get('libraryDialog').open,true);assert.equal(nodes.get('page-practice').hidden,false);
  const first=nodes.get('libraryList').children.find(card=>card.children[0].textContent==='我的练习歌曲');
  assert(first);assert.match(first.children.at(-1).children[0].href,/watch\?v=abcdefghijk&t=12s/);
  nodes.get('libraryCacheTab').onclick();nodes.get('clearAllBackings').onclick();
  assert.equal((await storage.listBackings(id)).length,1);assert.equal(nodes.get('libraryConfirm').hidden,false);
  root.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(nodes.get('libraryConfirm').hidden,true);assert.equal(nodes.get('libraryDialog').open,true);
  nodes.get('clearAllBackings').onclick();await nodes.get('libraryConfirmYes').onclick();
  assert.equal((await storage.listBackings(id)).length,0);assert.equal((await storage.listTakes(id)).length,1);assert.equal((await storage.getSession(id)).title,'我的练习歌曲');
  root.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(nodes.get('libraryDialog').open,false);
  (await storage.ready).close();
});

test('echo cancellation is remembered per activity and applied to microphone requests',async()=>{
  const storage=createStorage(new IDBFactory()),preferences=new Map(),requests=[];
  const localStorage={getItem:key=>preferences.get(key) || null,setItem:(key,value)=>preferences.set(key,value)};
  const globals={window:{localStorage,addEventListener(){},speechSynthesis:{cancel(){}}},
    navigator:{mediaDevices:{async getUserMedia(options){requests.push(options);throw Error('Microphone unavailable in fixture');}}}};
  const {nodes}=await mount(storage,{globals});
  const checkbox=nodes.get('echoCancellation');
  assert.equal(checkbox.checked,true);
  checkbox.checked=false;checkbox.onchange();
  await nodes.get('record').onclick();
  assert.deepEqual({...requests.at(-1).audio},{echoCancellation:false,autoGainControl:true});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(checkbox.checked,false);
  checkbox.checked=true;checkbox.onchange();
  nodes.get('useBacking').checked=false;nodes.get('useBacking').onchange();
  await nodes.get('record').onclick();
  assert.deepEqual({...requests.at(-1).audio},{echoCancellation:true,noiseSuppression:false,autoGainControl:false});
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();
  assert.equal(checkbox.checked,false);
  const refreshed=await mount(storage,{globals});
  refreshed.nodes.get('activityMode').value='speech';refreshed.nodes.get('activityMode').onchange();
  assert.equal(refreshed.nodes.get('echoCancellation').checked,false);
  refreshed.nodes.get('activityMode').value='sing';refreshed.nodes.get('activityMode').onchange();
  assert.equal(refreshed.nodes.get('echoCancellation').checked,true);
  (await storage.ready).close();
});

test('automatic and manual gain are independent per activity, preserve legacy echo preferences and reach recording',async()=>{
  const storage=createStorage(new IDBFactory()),preferences=new Map([['echo-microphone-v1',JSON.stringify({speech:false,sing:true})]]),requests=[];
  const localStorage={getItem:key=>preferences.get(key) || null,setItem:(key,value)=>preferences.set(key,value)};
  const globals={window:{localStorage,addEventListener(){},speechSynthesis:{cancel(){}}},
    navigator:{mediaDevices:{async getUserMedia(options){requests.push(options);throw Error('Fixture microphone');}}}};
  const {nodes}=await mount(storage,{globals});
  assert.equal(nodes.get('echoCancellation').checked,false);
  assert.equal(nodes.get('autoGainControl').checked,true);assert.equal(nodes.get('manualGainRow').hidden,true);
  nodes.get('autoGainControl').checked=false;nodes.get('autoGainControl').onchange();
  assert.equal(nodes.get('manualGainRow').hidden,false);
  nodes.get('manualGainDb').value='6';nodes.get('manualGainDb').oninput();nodes.get('manualGainDb').onchange();
  await nodes.get('record').onclick();
  assert.deepEqual({...requests.at(-1).audio},{echoCancellation:false,autoGainControl:false});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('echoCancellation').checked,true);
  assert.equal(nodes.get('autoGainControl').checked,false);assert.equal(nodes.get('manualGainDb').value,0);
  nodes.get('manualGainDb').value='16';nodes.get('manualGainDb').oninput();nodes.get('manualGainDb').onchange();
  nodes.get('autoGainControl').checked=true;nodes.get('autoGainControl').onchange();
  assert.equal(nodes.get('manualGainRow').hidden,true);
  nodes.get('useBacking').checked=false;nodes.get('useBacking').onchange();
  await nodes.get('record').onclick();
  assert.deepEqual({...requests.at(-1).audio},{echoCancellation:true,noiseSuppression:false,autoGainControl:true});
  const refreshed=(await mount(storage,{globals})).nodes;
  refreshed.get('activityMode').value='speech';refreshed.get('activityMode').onchange();
  assert.equal(refreshed.get('autoGainControl').checked,false);assert.equal(refreshed.get('manualGainDb').value,6);
  refreshed.get('activityMode').value='sing';refreshed.get('activityMode').onchange();
  assert.equal(refreshed.get('autoGainControl').checked,true);assert.equal(refreshed.get('manualGainDb').value,16);
  (await storage.ready).close();
});

test('manual input gain reaches the saved vocal recording and meter, then releases its graph',async()=>{
  const storage=createStorage(new IDBFactory());
  const video={duration:60,currentTime:0,muted:false,playbackRate:1,pause(){},async play(){this.currentTime=1;},addEventListener(){},removeEventListener(){}};
  const mic={getTracks:()=>[{stop(){}}]},processed={},meterStreams=[];let disposed=0;
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(source){assert.equal(source,processed);this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['amplified-vocal'])});queueMicrotask(()=>this.onstop());}
  }
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,
    navigator:{mediaDevices:{async getUserMedia(){return mic;}}},
    EchoMicrophone:{...require('../extension/microphone.js'),async createInput(source,db){assert.equal(source,mic);assert.equal(db,16);return {stream:processed,db,dispose(){disposed++;}};}},
    EchoLiveMeter:{start({stream}){meterStreams.push(stream);return {dispose(){}};}},
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  nodes.get('useBacking').checked=false;nodes.get('useBacking').onchange();
  nodes.get('karaokeScope').value='clip';nodes.get('karaokeScope').onchange();
  nodes.get('start').value='0';nodes.get('end').value='1';
  nodes.get('manualGainDb').value='16';nodes.get('manualGainDb').oninput();
  await nodes.get('record').onclick();
  const [take]=await storage.listTakes('video');
  assert.equal(take.inputGainDb,16);assert.equal(take.autoGainControl,false);
  assert.equal(await take.blob.text(),'amplified-vocal');assert.deepEqual(meterStreams,[processed]);assert.equal(disposed,1);
  (await storage.ready).close();
});

function leadInVideo({hold=false}={}){
  const events=new Map(),plays=[];let time=0;
  return {duration:60,muted:true,playbackRate:1.25,plays,pause(){},
    get currentTime(){return time;},set currentTime(value){time=value;queueMicrotask(()=>{for(const fn of events.get('seeked') || [])fn();});},
    addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},
    removeEventListener(name,fn){events.get(name)?.delete(fn);},
    async play(){plays.push({at:time,muted:this.muted});if(!hold)time=plays.length===1?10:11;}
  };
}
for(const leadMode of ['seconds','previous'])test(`recording ${leadMode} lead-in plays context without recording it and preserves the saved range`,async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo(),starts=[];
  await storage.saveSession({videoId:'video',start:10,end:11,speed:'1',cues:[{start:5,end:8,text:'Previous'},{start:10,end:11,text:'Selected'}],leadInMode:leadMode,leadInSeconds:3});
  const mic={getTracks:()=>[{stop(){}}]};
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){starts.push(video.currentTime);this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['only-target-vocal'])});queueMicrotask(()=>this.onstop());}
  }
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{async getUserMedia(){return mic;}}},
    requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout}});
  assert.equal(nodes.get('leadInSeconds').value,3);
  await nodes.get('record').onclick();
  assert.deepEqual(video.plays,[{at:leadMode==='previous'?5:7,muted:false},{at:10,muted:true}]);assert.deepEqual(starts,[10]);
  const [take]=await storage.listTakes('video');assert.equal(take.start,10);assert.equal(take.end,11);
  assert.equal(await take.blob.text(),'only-target-vocal');assert.equal(video.muted,true);assert.equal(video.playbackRate,1.25);
  nodes.get('leadInSeconds').value='5';nodes.get('leadInSeconds').onchange();
  await new Promise(r=>setTimeout(r,5));assert.equal((await storage.getSession('video')).leadInSeconds,5);
  (await storage.ready).close();
});
test('stopping during the lead-in cancels preparation, releases the mic and saves no empty take',async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo({hold:true});let stops=0,starts=0;
  await storage.saveSession({videoId:'video',start:10,end:11,speed:'1',cues:[],leadInSeconds:3});
  class MediaRecorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){starts++;}}
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,
    navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){stops++;}}]};}}},
    requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout}});
  const pending=nodes.get('record').onclick();
  for(let i=0;i<30 && !video.plays.length;i++)await new Promise(r=>setTimeout(r,2));
  assert.equal(video.plays.length,1);assert.match(nodes.get('status').textContent,/准备录音/);
  assert.equal(nodes.get('leadInSeconds').disabled,true);nodes.get('stop').onclick();await pending;
  assert.equal(starts,0);assert(stops>=1);assert.equal((await storage.listTakes('video')).length,0);
  assert.equal(video.muted,true);assert.equal(video.playbackRate,1.25);assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});
test('listening includes the configured context while recorded comparison keeps the exact range',async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo();
  await storage.saveSession({videoId:'video',start:10,end:11,speed:'1',cues:[],leadInSeconds:3,selectedTakeId:'compare-lead'});
  await storage.saveTake({id:'compare-lead',videoId:'video',cueKey:'manual:10:11',start:10,end:11,speed:1,createdAt:1,blob:new Blob(['voice'])});
  class Audio{constructor(){this.currentTime=0;this.duration=1;}pause(){}async play(){this.currentTime=1;queueMicrotask(()=>this.onended?.());}}
  // End the source preview immediately; playback still uses its real end watcher.
  video.play=async function(){this.plays.push({at:this.currentTime,muted:this.muted});this.currentTime=11;};
  const {nodes}=await mount(storage,{video,globals:{Audio,requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout}});
  await nodes.get('original').onclick();assert.equal(video.plays[0].at,7);
  assert.equal(nodes.get('start').value,10);assert.equal(nodes.get('end').value,11);
  await nodes.get('compare').onclick();assert.equal(video.plays[1].at,10);
  (await storage.ready).close();
});

test('paragraph mode restores, keeps multi-sentence bounds during browsing, records as one take and previews assembly',async()=>{
  const storage=createStorage(new IDBFactory());
  const cues=[0,1,2,3].map(i=>({start:i*3,end:i*3+2.8,text:`Line ${i+1}`}));
  await storage.saveSession({videoId:'video',activity:'sing',useBacking:false,cues,index:1,start:3,end:11.8,speed:'1',karaokeScope:'paragraph',paragraphFirst:1,paragraphLast:3});
  const video=leadInVideo();video.duration=30;video.play=async function(){this.currentTime=11.8;};
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['whole-paragraph'])});queueMicrotask(()=>this.onstop());}
  }
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,
    navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}},
    requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout}});
  assert.equal(nodes.get('karaokeScope').value,'paragraph');assert.equal(nodes.get('paragraphSelection').hidden,false);
  assert.equal(nodes.get('paragraphFirst').value,'1');assert.equal(nodes.get('paragraphLast').value,'3');
  assert.match(nodes.get('record').textContent,/开始段落录唱/);assert.match(nodes.get('clipSummary').textContent,/第 2–4 句/);
  assert.equal(nodes.get('start').disabled,true);assert.equal(nodes.get('autoNext').disabled,true);
  nodes.get('next').onclick();assert.equal(Number(nodes.get('start').value),3);assert.equal(Number(nodes.get('end').value),11.8);
  await nodes.get('record').onclick();
  const [take]=await storage.listTakes('video');assert.equal(take.start,3);assert.equal(take.end,11.8);assert.equal(take.kind,'song');
  assert.match(take.label,/第 2–4 句/);assert.equal(await take.blob.text(),'whole-paragraph');
  assert.match(nodes.get('assemblyInfo').textContent,/已覆盖 8.8 \/ 30.0 秒/);
  assert.match(nodes.get('assemblyPlan').textContent,/3.0–11.8 秒 · 第 2–4 句/);assert.match(nodes.get('assemblyPlan').textContent,/未录人声/);
  nodes.get('paragraphFirst').value='0';nodes.get('paragraphFirst').onchange();
  nodes.get('paragraphLast').value='2';nodes.get('paragraphLast').onchange();
  await new Promise(r=>setTimeout(r,5));const session=await storage.getSession('video');assert.equal(session.paragraphFirst,0);assert.equal(session.paragraphLast,2);assert.equal(session.end,8.8);
  const restored=(await mount(storage)).nodes;assert.equal(restored.get('karaokeScope').value,'paragraph');assert.equal(Number(restored.get('end').value),8.8);
  (await storage.ready).close();
});

test('shared main controls and automatic practice use the same whole-song range and remember preparation',async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo(),plays=[];
  video.duration=30;video.play=async function(){plays.push(this.currentTime);this.currentTime=30;};
  await storage.saveSession({videoId:'video',activity:'sing',useBacking:false,karaokeScope:'whole',cues:[{start:10,end:12,text:'A single line'}],index:0,start:10,end:12,speed:'1',prepSeconds:'0',loopCount:'5',autoNext:true});
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['full-song'])});queueMicrotask(()=>this.onstop());}
  }
  class Audio{constructor(){this.currentTime=0;this.duration=30;}pause(){}async play(){this.currentTime=30;queueMicrotask(()=>this.onended?.());}}
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,Audio,
    navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}},
    requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout}});
  assert.equal(nodes.get('prepSeconds').value,'0');assert.equal(nodes.get('loopCount').value,'5');
  assert.equal(nodes.get('autoNext').disabled,true);assert.equal(nodes.get('clipBounds').hidden,true);
  assert.match(nodes.get('clipSummary').textContent,/整首.*0.0–30.0/);
  await nodes.get('autoPractice').onclick();
  const [take]=await storage.listTakes('video');assert.equal(take.start,0);assert.equal(take.end,30);assert.equal(take.kind,'song');
  assert.equal(plays[0],0);assert.equal(plays[1],0);assert.match(nodes.get('status').textContent,/自动跟读完成/);
  nodes.get('prepSeconds').value='2';nodes.get('prepSeconds').onchange();await new Promise(r=>setTimeout(r,5));
  assert.equal((await storage.getSession('video')).prepSeconds,'2');
  (await storage.ready).close();
});
