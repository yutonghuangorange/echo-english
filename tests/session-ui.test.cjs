const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
const {createStorage,cueKey}=require('../extension/storage.js');

// Lightweight content-script DOM harness: run actual UI handlers against a real
// IndexedDB implementation, without requesting microphone or YouTube access.
async function waitUntil(predicate, message='condition did not become ready') {
  const deadline=Date.now()+1000;
  while(!predicate()) {if(Date.now()>deadline)throw Error(message);await new Promise(resolve=>setTimeout(resolve,1));}
}
async function mount(storage, overrides = {}) {
  const nodes=new Map(),created=[],downloads=[];
  class Element {
    constructor(){this.children=[];this.hidden=false;this.value='';this.style={};this.attrs={};this.dataset={};this.classList={toggle:()=>{}};created.push(this);}
    set innerHTML(html){this.html=html;for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Element());
      nodes.get('followCaptions').checked=true;
      for(const [id,value] of Object.entries({start:'0',end:'5',speed:'1',loopCount:'3',prepSeconds:'3',backingVolume:'1',practiceScope:'clip',assemblyType:'vocal',activityMode:'speech',contentLanguage:'auto',captionLayout:'original'}))nodes.get(id).value=value;}
    get innerHTML(){return this.html;}
    addEventListener(type,fn){(this.listeners ||= new Map()).set(type,fn);}
    removeEventListener(type,fn){if(this.listeners?.get(type)===fn)this.listeners.delete(type);}
    dispatchEvent(event){this['on'+event.type]?.(event);this.listeners?.get(event.type)?.(event);}
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
  doc.title=overrides.title || '';
  const context={document:doc,location:{href:'https://www.youtube.com/watch?v=video',pathname:'/watch'},indexedDB:{},URL,Blob,console,setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){},crypto:globalThis.crypto,
    window:{addEventListener(){},speechSynthesis:{cancel(){}}},chrome:{runtime:{onMessage:{addListener(){}}}},
    EchoPracticeTools:require('../extension/practice-tools.js'),EchoCaptionTracks:require('../extension/caption-tracks.js'),EchoPanelView:require('../extension/panel-view.js'),EchoTransport:require('../extension/transport.js'),EchoPlayback:require('../extension/playback.js'),
    EchoAudioExport:require('../extension/audio-export.js'),EchoAssembly:require('../extension/assembly.js'),EchoPanelSize:require('../extension/panel-size.js'),EchoLanguages:require('../extension/languages.js'),EchoKaraoke:require('../extension/karaoke.js'),EchoStorage:{...require('../extension/storage.js'),createStorage:()=>storage},EchoSelection:require('../extension/selection.js'),EchoPractice:require('../extension/practice.js'),EchoDictionary:require('../extension/dictionary.js'),EchoSubtitles:require('../extension/subtitles.js'),EchoLibrary:require('../extension/library.js'),EchoModels:require('../extension/models.js'),EchoLiveMeter:require('../extension/live-meter.js'),EchoRecording:require('../extension/recording.js'),EchoMicrophone:require('../extension/microphone.js'),EchoAudioAnalysis:require('../extension/audio-analysis.js')};
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
  return {nodes,root,events,downloads,document:doc};
}
test('raw recording downloads use the video title and refresh it when YouTube loads it late',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveTake({id:'voice',videoId:'video',cueKey:'manual:5:10',start:5,end:10,speed:1,createdAt:1,blob:new Blob(['voice'])});
  const {nodes,document}=await mount(storage,{title:'原视频标题 - YouTube'});
  nodes.get('tab-recordings').onclick();
  const link=nodes.get('download'),url=link.href;
  assert.equal(link.download,'原视频标题_00m05.0s-00m10.0s_配音.webm');
  document.title='正式标题: 中文字幕 - YouTube';link.onclick();
  assert.equal(link.download,'正式标题 中文字幕_00m05.0s-00m10.0s_配音.webm');
  assert.equal(link.href,url);
  (await storage.ready).close();
});

test('movie background is opt-in, keeps separate activity preferences and restores across refresh',async()=>{
  const storage=createStorage(new IDBFactory());let checks=0;
  const health=()=>{checks++;return {service:'echo-karaoke',maxSeconds:600};};
  const globals={chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){return {};}}}};
  const {nodes}=await mount(storage,{health,globals});
  assert.equal(nodes.get('useBacking').checked,false);assert.equal(checks,0);
  assert.equal(nodes.get('karaokeSettings').hidden,true);
  assert.match(nodes.get('useBackingLabel').textContent,/保留背景音/);
  nodes.get('useBacking').checked=true;nodes.get('useBacking').onchange();
  assert.equal(nodes.get('karaokeSettings').hidden,false);assert.equal(nodes.get('karaokeSettings').open,true);
  assert.equal(nodes.get('backingSettingsTitle').textContent,'背景音设置');
  assert.equal(nodes.get('prepareBacking').textContent,'提取片段背景音');
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('useBacking').checked,true);
  nodes.get('useBacking').checked=false;nodes.get('useBacking').onchange();
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('useBacking').checked,true);
  await waitUntil(()=>checks>0);
  await new Promise(resolve=>setTimeout(resolve,5));
  const session=await storage.getSession('video');
  assert.deepEqual(session.backingPreferences,{speech:true,sing:false});
  const restored=await mount(storage,{health,globals});
  assert.equal(restored.nodes.get('useBacking').checked,true);
  restored.nodes.get('useBacking').checked=false;restored.nodes.get('useBacking').onchange();
  assert.equal(restored.nodes.get('karaokeSettings').hidden,true);
  (await storage.ready).close();
});

test('turning movie background off discards an in-flight cache restore',async()=>{
  const storage=createStorage(new IDBFactory());let release;
  const {nodes}=await mount(storage,{cachedBackings:{backings:[{id:'a'.repeat(32),videoId:'video',start:0,end:60}]},
    globals:{chrome:{runtime:{onMessage:{addListener(){}},sendMessage(message){
      if(message.action==='audio')return new Promise(resolve=>{release=resolve;});
      throw Error('No generation expected');
    }}}}});
  nodes.get('useBacking').checked=true;nodes.get('useBacking').onchange();
  await waitUntil(()=>release);
  nodes.get('useBacking').checked=false;nodes.get('useBacking').onchange();
  release({audio:Buffer.from('background').toString('base64'),mime:'audio/mpeg'});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await storage.listBackings('video')).length,0);
  assert.equal(nodes.get('karaokeSettings').hidden,true);assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});

test('movie dubbing monitors cached background but records dry speech and uses shared mixed export',async()=>{
  const storage=createStorage(new IDBFactory()),listeners=new Map();let time=0,monitors=0,exported;
  await storage.saveBacking({key:'background',videoId:'video',start:0,end:60,createdAt:1,blob:new Blob(['music'])});
  const mic={getTracks:()=>[{stop(){}}]};
  const video={duration:60,muted:false,playbackRate:1,pause(){},get currentTime(){return time;},set currentTime(v){time=v;},
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},async play(){time=5;}};
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(source){assert.equal(source,mic);this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['dry movie voice'])});queueMicrotask(()=>this.onstop());}
  }
  const {nodes,downloads}=await mount(storage,{title:'电影片段 - YouTube',video,globals:{MediaRecorder,
    navigator:{mediaDevices:{getUserMedia:async({audio})=>{assert.equal(audio.echoCancellation,true);assert.equal(audio.autoGainControl,true);return mic;}}},
    EchoKaraoke:{...require('../extension/karaoke.js'),async createMonitor(){monitors++;return {sync:async()=>{},pause(){},dispose(){},setVolume(){}};}},
    EchoAudioExport:{...require('../extension/audio-export.js'),async render(options){exported=options;return {blob:new Blob(['mixed']),gaps:[]};}},
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms===30000?0:ms)}});
  nodes.get('useBacking').checked=true;nodes.get('useBacking').onchange();
  await nodes.get('record').onclick();
  await waitUntil(()=>nodes.get('record').disabled===false);
  const [take]=await storage.listTakes('video');
  assert.equal(await take.blob.text(),'dry movie voice');assert.equal(monitors,1);
  assert.equal(take.kind,undefined);assert.equal(take.backingKey,'background');
  assert.equal(take.backingModel,'demucs-htdemucs');assert.equal(take.withBacking,undefined);
  assert.equal(nodes.get('takeMixDownload').hidden,false);assert.match(nodes.get('takeMixDownload').textContent,/背景音/);
  nodes.get('replayVocalVolume').value='1.4';nodes.get('replayBackingVolume').value='0.3';
  await nodes.get('takeMixDownload').onclick();
  assert.equal(exported.takes[0].id,take.id);assert.equal(exported.backing.key,'background');
  assert.equal(exported.vocalVolume,1.4);assert.equal(exported.volume,0.3);
  assert.match(downloads[0].download,/电影片段.*人声\+背景音.wav$/);
  assert.equal(nodes.get('songAssembly').hidden,true);
  nodes.get('useBacking').checked=false;nodes.get('useBacking').onchange();
  nodes.get('reuseSongRange').onclick();
  assert.equal(nodes.get('useBacking').checked,false);assert.equal(nodes.get('karaokeSettings').hidden,true);
  (await storage.ready).close();
});

test('empty pages hide irrelevant recording controls and keep the practice dock on the practice tab',async()=>{
  const storage=createStorage(new IDBFactory());
  const {nodes}=await mount(storage);
  assert.equal(nodes.get('practiceDock').hidden,false);
  assert.equal(nodes.get('captionSetup').hidden,false);
  assert.equal(nodes.get('captionOptions').hidden,true);assert.equal(nodes.get('clipCue').disabled,true);
  assert.equal(nodes.get('practiceTools').open,false);
  nodes.get('tab-recordings').onclick();
  assert.equal(nodes.get('practiceDock').hidden,true);
  assert.equal(nodes.get('recordingEmpty').hidden,false);
  assert.equal(nodes.get('historyBrowser').hidden,true);
  assert.equal(nodes.get('recordingDetails').hidden,true);
  assert.equal(nodes.get('playAll').hidden,true);
  nodes.get('backToPractice').onclick();assert.equal(nodes.get('practiceDock').hidden,false);
  nodes.get('openLanguageSettings').onclick();assert.equal(nodes.get('practiceDock').hidden,true);assert.equal(nodes.get('captionSettings').open,true);
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
  const {nodes}=await mount(storage,{health:()=>{checks++;return online?{service:'echo-karaoke',maxSeconds:600,device:'cuda',deviceName:'Test GPU'}:{error:'offline'};},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){starts++;return {};}}}}});
  assert.equal(checks,0);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('checkKaraoke').onclick();
  assert.match(nodes.get('karaokeService').textContent,/未连接/);assert.equal(nodes.get('karaokeHelp').open,true);
  assert.equal(starts,0);assert.equal(nodes.get('record').disabled,false);
  online=true;await nodes.get('checkKaraoke').onclick();
  assert.match(nodes.get('karaokeService').textContent,/已连接/);assert.equal(nodes.get('karaokeHelp').open,false);assert.equal(starts,0);
  assert.match(nodes.get('karaokeService').textContent,/GPU 加速/);assert.equal(nodes.get('karaokeService').title,'Test GPU');
  online=false;await nodes.get('checkKaraoke').onclick();assert.equal(nodes.get('karaokeService').title,'');
  (await storage.ready).close();
});
test('Apple MPS uses the existing GPU service indicator',async()=>{
  const storage=createStorage(new IDBFactory());
  const {nodes}=await mount(storage,{health:()=>({service:'echo-karaoke',maxSeconds:600,device:'mps',deviceName:'Apple GPU（MPS）'}),globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){return {};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('checkKaraoke').onclick();
  assert.match(nodes.get('karaokeService').textContent,/GPU 加速/);
  assert.equal(nodes.get('karaokeService').title,'Apple GPU（MPS）');
  assert.equal(nodes.get('karaokeHelp').open,false);
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
  assert.equal(nodes.get('scopeControls').hidden,false);assert.equal(nodes.get('practiceDock').hidden,false);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('scopeControls').hidden,false);assert.equal(nodes.get('practiceDock').hidden,false);
  assert.equal(nodes.get('practiceTools').open,false);assert.equal(nodes.get('practiceToolsSummary').hidden,false);
  assert.equal(nodes.get('karaokeSettings').open,true);assert.equal(nodes.get('record').disabled,false);
  await nodes.get('record').onclick();assert.equal(micRequests,0);assert.equal(nodes.get('karaokeSettings').open,true);
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('scopeControls').hidden,false);assert.equal(nodes.get('karaokeSettings').hidden,true);
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
  for(let i=0;i<30 && !nodes.get('transportProgress').oninput;i++)await new Promise(r=>setTimeout(r,1));
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

for(const recordingKind of ['song','movie'])test(`${recordingKind} replay shares background seeking, volume, toggles and cleanup`,async()=>{
  const storage=createStorage(new IDBFactory()),frames=new Map(),listeners=new Map();
  let next=0,sound,position=0,disposed=0,pauses=0,vocalGain=1,musicGain=1;
  await storage.saveTake({id:'vocal',videoId:'video',cueKey:'song:manual',kind:recordingKind==='song'?'song':undefined,backingKey:'music',capture:'vocal',vocalOffset:0.2,start:0,end:10,speed:1,createdAt:1,blob:new Blob(['voice'])});
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
  if(recordingKind==='song'){nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();}
  else nodes.get('tab-recordings').onclick();
  const replaying=recordingKind==='song'?nodes.get('replay').onclick():nodes.get('reviewReplay').onclick();
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
  const {nodes,downloads}=await mount(storage,{title:'我的歌曲 / 现场版 - YouTube',video:{duration:20},globals:{setTimeout:(fn,ms)=>setTimeout(fn,ms===30000?0:ms),
    EchoAudioExport:{...require('../extension/audio-export.js'),async render(options){exports.push(options);return {blob:new Blob(['wave']),gaps:[]};}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  nodes.get('openSongRecording').onclick();assert.equal(nodes.get('recordingDetails').open,false);
  assert.equal(nodes.get('page-recordings').hidden,false);assert.equal(nodes.get('download').style.display,'block');
  nodes.get('replayVocalVolume').value='1.5';nodes.get('replayBackingVolume').value='0.4';
  assert.equal(nodes.get('takeMixDownload').hidden,false);await nodes.get('takeMixDownload').onclick();
  assert.equal(exports[0].vocalVolume,1.5);assert.equal(exports[0].volume,0.4);
  assert.equal(exports[0].origin,5);assert.equal(exports[0].duration,5);assert.equal(exports[0].backing.key,'backing');
  nodes.get('assemblyType').value='vocal';await nodes.get('assembleSong').onclick();assert.equal(exports.length,1);await nodes.get('assemblyDownload').onclick();
  assert.equal(exports[1].origin,0);assert.equal(exports[1].duration,20);assert.equal(exports[1].backing,null);
  nodes.get('assemblyType').value='mixed';nodes.get('assemblyType').onchange();await nodes.get('assemblyDownload').onclick();
  assert.equal(exports[2].backing.key,'backing');assert.equal(downloads.length,3);nodes.get('closeAssembly').onclick();
  assert.equal(downloads[0].download,'我的歌曲 现场版_00m05.0s-00m10.0s_人声+伴奏.wav');
  assert.equal(downloads[1].download,'我的歌曲 现场版_00m00.0s-00m20.0s_整首合成_人声.wav');
  assert.equal(downloads[2].download,'我的歌曲 现场版_00m00.0s-00m20.0s_整首合成_人声+伴奏.wav');
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
  assert.equal(nodes.get('practiceDock').hidden,false);assert.equal(nodes.get('practiceScope').value,'clip');
  assert.equal(nodes.get('scopeControls').hidden,false);assert.equal(nodes.get('practiceTools').open,false);
  assert.match(nodes.get('clipSummary').textContent,/2.0–4.0/);
  assert.match(nodes.get('record').textContent,/开始片段录唱/);
  assert.equal(nodes.get('clipCue').value,'1');
  nodes.get('clipCue').value='0';nodes.get('clipCue').onchange();assert.equal(nodes.get('start').value,'0.00');assert.equal(nodes.get('end').value,'2.00');
  await nodes.get('startLater').onclick();assert.equal(nodes.get('clipCue').value,'');
  nodes.get('clipCue').value='1';nodes.get('clipCue').onchange();assert.equal(nodes.get('start').value,'2.00');
  nodes.get('prev').onclick();assert.equal(nodes.get('start').value,'0.00');
  assert.equal(nodes.get('practiceScope').value,'clip');
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

for(const activity of ['sing','speech'])test(`${activity} background must be regenerated when boundaries exceed its range`,async()=>{
  const storage=createStorage(new IDBFactory()), calls=[];
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message);
    return message.action==='audio'?{audio:'UklGRg==',mime:'audio/wav'}:{id:'a'.repeat(32),state:'ready'};
  }}}}});
  assert.equal(nodes.get('previewBacking').disabled,true);
  nodes.get('activityMode').value=activity;nodes.get('activityMode').onchange();
  if(activity==='speech'){nodes.get('useBacking').checked=true;nodes.get('useBacking').onchange();}
  nodes.get('practiceScope').value='clip';nodes.get('practiceScope').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(nodes.get('useBacking').checked,true);assert.equal(nodes.get('previewBacking').disabled,false);
  assert.deepEqual(calls.map(c=>c.action),['start','audio']);
  assert.equal(calls[0].start,0);assert.equal(calls[0].end,5);
  nodes.get('end').value=6;nodes.get('end').onchange();
  assert.equal(nodes.get('previewBacking').disabled,true);
  await nodes.get('record').onclick();
  assert.match(nodes.get('status').textContent,activity==='sing'?/当前练习范围准备伴奏/:/当前练习范围准备背景音/);
  (await storage.ready).close();
});

for(const activity of ['sing','speech'])test(`${activity} cancellation rejects late separation jobs`,async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];let resolve;
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message.action);
    if(message.action==='start')return await new Promise(r=>{resolve=r;});
    return {};
  }}}}});
  nodes.get('activityMode').value=activity;nodes.get('activityMode').onchange();
  if(activity==='speech'){nodes.get('useBacking').checked=true;nodes.get('useBacking').onchange();}
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
  nodes.get('practiceScope').value='clip';nodes.get('practiceScope').onchange();
  assert.equal(nodes.get('record').textContent,'● 开始片段录唱');
  nodes.get('tab-recordings').onclick();
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
  assert.equal(nodes.get('practiceScope').value,'clip');assert.equal(nodes.get('record').disabled,false);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('practiceScope').value,'whole');
  await nodes.get('prepareBacking').onclick();
  assert.equal(calls[0].start,0);assert.equal(calls[0].end,180);
  assert.equal(nodes.get('start').value,10);assert.equal(nodes.get('end').value,12);
  assert.equal(nodes.get('record').disabled,false);
  nodes.get('start').value=30;nodes.get('end').value=40;nodes.get('end').onchange();
  nodes.get('practiceScope').value='clip';nodes.get('practiceScope').onchange();
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
  // Leaving singing does not opt ordinary dubbing into background monitoring.
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
  nodes.get('practiceScope').value='clip';nodes.get('practiceScope').onchange();
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
  const globals={MediaRecorder:class {static isTypeSupported(){return true;}},window:{localStorage,addEventListener(){},speechSynthesis:{cancel(){}}},
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
  const globals={MediaRecorder:class {static isTypeSupported(){return true;}},window:{localStorage,addEventListener(){},speechSynthesis:{cancel(){}}},
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
  nodes.get('practiceScope').value='clip';nodes.get('practiceScope').onchange();
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
  assert.equal(nodes.get('leadInSeconds').disabled,true);
  assert.equal(nodes.get('activityMode').hidden,true);assert.equal(nodes.get('clipBounds').hidden,true);
  assert.equal(nodes.get('practiceTools').hidden,true);assert.equal(nodes.get('practiceSettings').hidden,true);
  assert.equal(nodes.get('liveMeter').hidden,false);assert.equal(nodes.get('stop').textContent,'■ 取消准备');
  assert.equal(starts,0); // Preparation shows the recording UI without recording context audio.
  nodes.get('stop').onclick();await pending;
  assert.equal(nodes.get('liveMeter').hidden,true);assert.equal(nodes.get('activityMode').hidden,false);
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
  assert.equal(nodes.get('practiceScope').value,'paragraph');assert.equal(nodes.get('paragraphSelection').hidden,false);
  assert.equal(nodes.get('paragraphFirst').value,'1');assert.equal(nodes.get('paragraphLast').value,'3');
  assert.match(nodes.get('record').textContent,/开始段落录唱/);assert.match(nodes.get('clipSummary').textContent,/第 2–4 句/);
  assert.equal(nodes.get('start').disabled,true);assert.equal(nodes.get('autoNext').disabled,true);
  nodes.get('next').onclick();assert.equal(Number(nodes.get('start').value),3);assert.equal(Number(nodes.get('end').value),11.8);
  await nodes.get('record').onclick();
  const [take]=await storage.listTakes('video');assert.equal(take.start,3);assert.equal(take.end,11.8);assert.equal(take.kind,'song');
  assert.match(take.label,/第 2–4 句/);assert.equal(await take.blob.text(),'whole-paragraph');
  assert.match(nodes.get('assemblyInfo').textContent,/已选 8.8 \/ 30.0 秒/);
  await nodes.get('assembleSong').onclick();assert.equal(nodes.get('assemblyDialog').open,true);assert.match(nodes.get('assemblyEditorInfo').textContent,/8.8 \/ 30.0/);nodes.get('closeAssembly').onclick();
  nodes.get('paragraphFirst').value='0';nodes.get('paragraphFirst').onchange();
  nodes.get('paragraphLast').value='2';nodes.get('paragraphLast').onchange();
  await new Promise(r=>setTimeout(r,5));const session=await storage.getSession('video');assert.equal(session.paragraphFirst,0);assert.equal(session.paragraphLast,2);assert.equal(session.end,8.8);
  const restored=(await mount(storage)).nodes;assert.equal(restored.get('practiceScope').value,'paragraph');assert.equal(Number(restored.get('end').value),8.8);
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

test('assembly editor auditions an older version, excludes ranges, persists choices and downloads the same selection',async()=>{
  const storage=createStorage(new IDBFactory()),requests=[];
  for(const [id,time] of [['older',1],['newer',2]])await storage.saveTake({id,videoId:'video',kind:'song',capture:'vocal',cueKey:'same',label:id,start:0,end:10,speed:1,createdAt:time,blob:new Blob([id])});
  const overrides={video:{duration:20,pause(){}},globals:{setTimeout:(fn,ms)=>setTimeout(fn,ms===30000?0:ms),
    EchoAudioExport:{...require('../extension/audio-export.js'),async render(options){requests.push(options);return {blob:new Blob(['selected-preview']),gaps:[]};}}}};
  const {nodes,downloads}=await mount(storage,overrides);
  await nodes.get('assembleSong').onclick();assert.equal(nodes.get('assemblyDialog').open,true);assert.equal(requests.length,0);
  const row=nodes.get('assemblyEditorList').children[0],select=row.children[1],check=row.children[0].children[0].children[0];
  select.value='older';select.onchange();await row.children[0].children[1].onclick();
  assert.equal(requests[0].duration,10);assert.equal(requests[0].selection[0].takeId,'older');assert.equal(nodes.get('assemblyAudio').hidden,false);
  check.checked=false;check.onchange();assert.equal(nodes.get('assemblyDownload').disabled,true);assert.equal(nodes.get('assemblyAudio').hidden,true);
  check.checked=true;check.onchange();await nodes.get('assemblyPreview').onclick();await nodes.get('assemblyDownload').onclick();
  assert.deepEqual(requests[1].selection.map(s=>s.takeId),['older',null]);assert.equal(requests[1].duration,20);
  assert.deepEqual(requests[2].selection,requests[1].selection);assert.equal(downloads.length,1);
  nodes.get('closeAssembly').onclick();assert.equal(nodes.get('assemblyAudio').hidden,true);
  const restored=(await mount(storage,overrides)).nodes;await restored.get('assembleSong').onclick();
  assert.equal(restored.get('assemblyEditorList').children[0].children[1].value,'older');restored.get('closeAssembly').onclick();
  (await storage.ready).close();
});

for(const action of ['close','cancel'])test(`assembly ${action} fences a pending render so it cannot publish stale audio`,async()=>{
  const storage=createStorage(new IDBFactory());let resolve;
  await storage.saveTake({id:'voice',videoId:'video',kind:'song',capture:'vocal',cueKey:'voice',start:0,end:5,speed:1,createdAt:1,blob:new Blob(['voice'])});
  const {nodes,downloads}=await mount(storage,{video:{duration:10,pause(){}},globals:{
    EchoAudioExport:{...require('../extension/audio-export.js'),render:()=>new Promise(r=>{resolve=r;})}}});
  await nodes.get('assembleSong').onclick();const pending=nodes.get('assemblyPreview').onclick();
  assert.equal(nodes.get('assemblyDownload').disabled,true);
  nodes.get(action==='close'?'closeAssembly':'assemblyCancelRender').onclick();
  resolve({blob:new Blob(['late audio'])});await pending;
  assert.equal(nodes.get('assemblyAudio').hidden,true);assert.equal(downloads.length,0);
  if(action==='cancel'){assert.equal(nodes.get('assemblyDialog').open,true);assert.equal(nodes.get('assemblyDownload').disabled,false);nodes.get('closeAssembly').onclick();}
  else assert.equal(nodes.get('assemblyDialog').open,false);
  (await storage.ready).close();
});

test('fold preferences survive mode changes and remount without breaking settings summaries',async()=>{
  const storage=createStorage(new IDBFactory()),preferences=new Map();
  const localStorage={getItem:key=>preferences.get(key) || null,setItem:(key,value)=>preferences.set(key,value)};
  const globals={window:{localStorage,addEventListener(){},speechSynthesis:{cancel(){}}}};
  const {nodes}=await mount(storage,{globals});
  nodes.get('practiceTools').open=true;nodes.get('practiceTools').dispatchEvent({type:'toggle'});
  nodes.get('karaokeSettings').open=false;nodes.get('karaokeSettings').dispatchEvent({type:'toggle'});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('practiceTools').open,true);assert.equal(nodes.get('karaokeSettings').open,false);
  nodes.get('leadInMode').value='seconds';nodes.get('leadInMode').onchange();
  nodes.get('leadInSeconds').value=5;nodes.get('leadInSeconds').onchange();
  assert.match(nodes.get('practiceToolsState').textContent,/前置 5 秒.*循环 3 次/);
  nodes.get('manualGainDb').value=6;nodes.get('manualGainDb').oninput();
  assert.match(nodes.get('speedSummary').textContent,/增益 \+6 dB/);
  const restored=await mount(storage,{globals});
  assert.equal(restored.nodes.get('practiceTools').open,true);
  assert.equal(restored.nodes.get('karaokeSettings').open,false);
  (await storage.ready).close();
});

for(const quality of ['high','lossless'])test(`recording quality ${quality} persists, reaches the encoder and saves actual capture details`,async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo(),preferences=new Map();let options;
  const track={getSettings:()=>({sampleRate:48000,channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}),stop(){}};
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(stream,opts){options=opts;this.state='inactive';this.mimeType=opts.mimeType;this.audioBitsPerSecond=opts.audioBitsPerSecond || 128000;}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice'])});queueMicrotask(()=>this.onstop());}
  }
  const globals={MediaRecorder,window:{localStorage:{getItem:key=>preferences.get(key) || null,setItem:(key,value)=>preferences.set(key,value)},addEventListener(){},speechSynthesis:{cancel(){}}},navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[track]};}}},requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout};
  const {nodes}=await mount(storage,{video,globals});
  nodes.get('recordingQuality').value=quality;nodes.get('recordingQuality').onchange();
  assert.equal(JSON.parse(preferences.get('echo-microphone-v1')).recordingQuality,quality);
  await nodes.get('record').onclick();
  assert.equal(options.mimeType,`audio/webm;codecs=${quality==='lossless'?'pcm':'opus'}`);
  const [take]=await storage.listTakes('video');assert.equal(take.recordingInfo.microphone.sampleRate,48000);assert.equal(take.recordingInfo.quality,quality);
  assert.match(nodes.get('recordingTechnical').textContent,/48 kHz/);
  const restored=await mount(storage,{video,globals});assert.equal(restored.nodes.get('recordingQuality').value,quality);
  (await storage.ready).close();
});
test('unsupported lossless recording stops before requesting microphone permission',async()=>{
  const storage=createStorage(new IDBFactory());let requests=0;
  class MediaRecorder{static isTypeSupported(type){return !type.includes('pcm');}}
  const {nodes}=await mount(storage,{globals:{MediaRecorder,navigator:{mediaDevices:{async getUserMedia(){requests++;}}}}});
  nodes.get('recordingQuality').value='lossless';nodes.get('recordingQuality').onchange();
  assert.equal(nodes.get('losslessQuality').disabled,true);
  await nodes.get('record').onclick();assert.equal(requests,0);assert.match(nodes.get('status').textContent,/不支持无损/);
  (await storage.ready).close();
});

for(const [scope,start,end] of [['whole',0,12],['paragraph',4,10],['clip',4,6]])test(`speech ${scope} scope controls listening, recording, auto practice and restoration`,async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo();let advances=0;
  video.duration=12;video.play=async function(){this.plays.push({at:this.currentTime,muted:this.muted});this.currentTime=end;};
  const cues=[0,4,8].map((start,i)=>({start,end:start+2,text:'Line '+i}));
  await storage.saveSession({videoId:'video',activity:'speech',speechScope:scope,karaokeScope:'whole',start:4,end:6,index:1,cues,speed:'1',paragraphFirst:1,paragraphLast:2,prepSeconds:'0',autoNext:true});
  class MediaRecorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm;codecs=opus';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['speech-range'])});queueMicrotask(()=>this.onstop());}}
  const globals={MediaRecorder,navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}},requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout,
    EchoPractice:{...require('../extension/practice.js'),async runPractice({listen,record,advance}){await listen();await record();advances+=Number(advance());}}};
  const {nodes}=await mount(storage,{video,globals});
  assert.equal(nodes.get('scopeControls').hidden,false);assert.equal(nodes.get('practiceScope').disabled,false);
  assert.equal(nodes.get('practiceScope').value,scope);assert.equal(nodes.get('clipBounds').hidden,scope!=='clip');
  assert.equal(nodes.get('autoNext').disabled,scope!=='clip');
  await nodes.get('original').onclick();assert.equal(video.plays[0].at,start);
  await nodes.get('record').onclick();
  let [take]=await storage.listTakes('video');assert.equal(take.start,start);assert.equal(take.end,end);assert.equal(take.kind,undefined);
  assert.equal(take.cueKey,scope==='clip'?cueKey(cues[1]):cueKey(null,start,end));
  if(scope!=='clip'){
    await nodes.get('autoPractice').onclick();assert.equal(advances,0);
    [take]=await storage.listTakes('video');assert.equal(take.start,start);assert.equal(take.end,end);
  }
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();assert.equal(nodes.get('practiceScope').value,'whole');
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();assert.equal(nodes.get('practiceScope').value,scope);
  await new Promise(r=>setTimeout(r,5));
  const restored=await mount(storage,{video,globals});assert.equal(restored.nodes.get('practiceScope').value,scope);
  (await storage.ready).close();
});
test('legacy speech sessions keep clip mode and whole-video scope rejects videos over ten minutes',async()=>{
  const storage=createStorage(new IDBFactory());let requests=0;
  await storage.saveSession({videoId:'video',activity:'speech',karaokeScope:'whole',start:3,end:5,cues:[],index:-1});
  const {nodes}=await mount(storage,{video:{duration:601,pause(){}},globals:{navigator:{mediaDevices:{async getUserMedia(){requests++;}}}}});
  assert.equal(nodes.get('practiceScope').value,'clip');
  nodes.get('practiceScope').value='whole';nodes.get('practiceScope').onchange();await nodes.get('record').onclick();
  assert.equal(requests,0);assert.match(nodes.get('status').textContent,/10 分钟/);
  (await storage.ready).close();
});

test('reusing a saved recording switches paragraph practice to its exact clip bounds',async()=>{
  const storage=createStorage(new IDBFactory()),cues=[0,4,8].map((start,i)=>({start,end:start+2,text:'Line '+i}));
  await storage.saveSession({videoId:'video',activity:'speech',speechScope:'paragraph',start:0,end:10,cues,index:0,paragraphFirst:0,paragraphLast:2});
  await storage.saveTake({id:'saved-range',videoId:'video',cueKey:cueKey(null,4,6),start:4,end:6,speed:1,createdAt:1,blob:new Blob(['voice'])});
  const {nodes}=await mount(storage);nodes.get('tab-recordings').onclick();nodes.get('reuseSongRange').onclick();
  assert.equal(nodes.get('practiceScope').value,'clip');assert.equal(Number(nodes.get('start').value),4);assert.equal(Number(nodes.get('end').value),6);
  (await storage.ready).close();
});

test('ordinary and automatic singing use the same selected-sentence version bucket',async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo(),cue={start:0,end:1,text:'Same lyric'};
  video.play=async function(){this.currentTime=1;};
  await storage.saveSession({videoId:'video',activity:'sing',useBacking:false,karaokeScope:'clip',start:0,end:1,speed:'1',cues:[cue],index:0,prepSeconds:'0'});
  class MediaRecorder{static isTypeSupported(){return true;}constructor(stream,options){this.state='inactive';this.mimeType=options.mimeType;}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice'])});queueMicrotask(()=>this.onstop());}}
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}},requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout,
    EchoPractice:{...require('../extension/practice.js'),async runPractice({record}){await record();}}}});
  await nodes.get('record').onclick();await nodes.get('autoPractice').onclick();
  const takes=await storage.listTakes('video');assert.equal(takes.length,2);assert.deepEqual([...new Set(takes.map(t=>t.cueKey))],[`song:${cueKey(cue)}`]);
  assert.equal(nodes.get('versionChoices').children.length,2);
  (await storage.ready).close();
});
test('a late recording stop after navigating away and back cannot replace the next capture UI',async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo({hold:true}),instances=[],stops=[];
  const location={href:'https://www.youtube.com/watch?v=video',pathname:'/watch'};
  class MediaRecorder{static isTypeSupported(){return true;}constructor(stream,options){this.state='inactive';this.mimeType=options.mimeType;instances.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice-'+instances.indexOf(this)])});}}
  const {nodes,events}=await mount(storage,{video,globals:{location,MediaRecorder,navigator:{mediaDevices:{async getUserMedia(){const index=stops.length;stops.push(0);return {getTracks:()=>[{stop(){stops[index]++;}}]};}}},requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout}});
  const first=nodes.get('record').onclick();await waitUntil(()=>instances[0]?.state==='recording');
  location.href='https://www.youtube.com/watch?v=other';events.get('yt-navigate-finish')();await waitUntil(()=>!nodes.get('read').disabled);
  location.href='https://www.youtube.com/watch?v=video';events.get('yt-navigate-finish')();await waitUntil(()=>!nodes.get('read').disabled);
  const second=nodes.get('record').onclick();await waitUntil(()=>instances[1]?.state==='recording');
  instances[0].onstop();await first;
  assert.equal(instances[1].state,'recording');assert.equal(stops[1],0);
  assert.equal(nodes.get('record').disabled,true);assert.equal(nodes.get('stop').textContent,'■ 结束录音');assert.equal(nodes.get('liveMeter').hidden,false);
  nodes.get('stop').onclick();instances[1].onstop();await second;
  assert.equal((await storage.listTakes('video')).length,2);assert.deepEqual(stops,[1,1]);
  (await storage.ready).close();
});

test('plain dubbing starts capture before video playback and records startup offset',async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo({hold:true});let instance,now=0;
  class MediaRecorder{static isTypeSupported(){return true;}constructor(stream,options){instance=this;this.state='inactive';this.mimeType=options.mimeType;}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['complete-opening'])});queueMicrotask(()=>this.onstop());}}
  video.play=async function(){assert.equal(instance.state,'recording');now=300;};
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,performance:{now:()=>now},navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}},requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout}});
  nodes.get('end').value=1;nodes.get('end').onchange();
  const pending=nodes.get('record').onclick();await waitUntil(()=>!nodes.get('transport').hidden);video.currentTime=1;await pending;
  const [take]=await storage.listTakes('video');assert.equal(take.vocalOffset,.3);assert.equal(take.start,0);assert.equal(take.end,1);
  (await storage.ready).close();
});

test('background model choice is remembered for speech while singing keeps Demucs and its own cache',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveSession({videoId:'video',activity:'speech',start:0,end:5,useBacking:true,backingPreferences:{speech:true,sing:true},modelPreferences:{speech:'bandit-v2-multi'},cues:[],index:-1});
  await storage.saveBacking({videoId:'video',key:'video:0.000:5.000',start:0,end:5,createdAt:1,blob:new Blob(['demucs'])});
  const {nodes}=await mount(storage);
  assert.equal(nodes.get('backingModel').value,'bandit-v2-multi');
  assert.equal(nodes.get('previewBacking').disabled,true);
  nodes.get('backingModel').value='demucs-htdemucs';nodes.get('backingModel').onchange();
  assert.equal(nodes.get('previewBacking').disabled,false);
  nodes.get('backingModel').value='bandit-v2-multi';nodes.get('backingModel').onchange();
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('backingModel').value,'demucs-htdemucs');assert.equal(nodes.get('banditModelOption').disabled,true);
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('backingModel').value,'bandit-v2-multi');
  await new Promise(r=>setTimeout(r,10));
  assert.equal((await storage.getSession('video')).modelPreferences.speech,'bandit-v2-multi');
  (await storage.ready).close();
});

test('model dialog installs on demand and asks before deleting only weights',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];
  const catalog={models:[{id:'bandit-v2-multi',name:'BandIt',purpose:'电影',ready:false,state:'missing',downloadBytes:446680129,weightBytes:0}],busy:false,dependencyBytes:0};
  const {nodes}=await mount(storage,{globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){calls.push(message.action);return catalog;}}}}});
  await nodes.get('manageModels').onclick();assert.equal(nodes.get('modelDialog').open,true);
  const card=nodes.get('modelList').children[0];
  await card.children.at(-1).children[0].onclick();assert.ok(calls.includes('model-install'));
  catalog.models[0]={...catalog.models[0],ready:true,state:'ready',weightBytes:446680129};
  await nodes.get('refreshModels').onclick();
  nodes.get('modelList').children[0].children.at(-1).children[0].onclick();
  assert.equal(nodes.get('modelConfirm').hidden,false);assert.ok(!calls.includes('model-remove'));
  await nodes.get('modelConfirmYes').onclick();assert.ok(calls.includes('model-remove'));
  nodes.get('closeModels').onclick();assert.equal(nodes.get('modelDialog').open,false);
  (await storage.ready).close();
});

test('install-and-extract sends the selected model and saves a matching background cache',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];
  await storage.saveSession({videoId:'video',activity:'speech',start:0,end:5,useBacking:true,backingPreferences:{speech:true},modelPreferences:{speech:'bandit-v2-multi'},cues:[],index:-1});
  const catalog={models:[{id:'bandit-v2-multi',name:'BandIt',ready:false,state:'missing',downloadBytes:446680129,weightBytes:0}],busy:false,dependencyBytes:0};
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},health:()=>({service:'echo-karaoke',maxSeconds:600,modelManagement:true}),globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message);
    if(message.action==='models')return catalog;
    if(message.action==='start')return {id:'a'.repeat(32),state:'ready',model:message.model};
    if(message.action==='audio')return {audio:'YXVkaW8=',mime:'audio/mpeg'};
    return {};
  }}}}});
  await nodes.get('checkKaraoke').onclick();
  assert.equal(nodes.get('prepareBacking').textContent,'安装并提取背景音');
  await nodes.get('prepareBacking').onclick();
  assert.equal(calls.find(call=>call.action==='start').model,'bandit-v2-multi');
  const [backing]=await storage.listBackings('video');
  assert.equal(backing.model,'bandit-v2-multi');assert.match(backing.key,/bandit-v2-multi$/);
  assert.equal(nodes.get('previewBacking').disabled,false);
  (await storage.ready).close();
});

test('Mac service display reflects CPU for BandIt and MPS for Demucs',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveSession({videoId:'video',activity:'speech',start:0,end:5,useBacking:true,modelPreferences:{speech:'bandit-v2-multi'},cues:[],index:-1});
  const {nodes}=await mount(storage,{health:()=>({service:'echo-karaoke',maxSeconds:600,device:'mps',deviceName:'Apple GPU'}),globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){return {};}}}}});
  await nodes.get('checkKaraoke').onclick();assert.match(nodes.get('karaokeService').textContent,/CPU（BandIt）/);
  nodes.get('backingModel').value='demucs-htdemucs';nodes.get('backingModel').onchange();
  assert.match(nodes.get('karaokeService').textContent,/GPU 加速/);
  (await storage.ready).close();
});

test('lossless selection uses chunked FLAC and remembers per-activity preferences',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];
  await storage.saveSession({videoId:'video',activity:'speech',start:0,end:5,useBacking:true,backingPreferences:{speech:true},cues:[],index:-1});
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},health:()=>({service:'echo-karaoke',maxSeconds:600,losslessBackings:true}),globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message);
    if(message.action==='start')return {id:'a'.repeat(32),state:'ready',quality:message.quality};
    if(message.action==='audio-chunk')return {audio:'ZkxBQw==',offset:0,totalBytes:4,mime:'audio/flac'};
    return {};
  }}}}});
  nodes.get('backingQuality').value='lossless';nodes.get('backingQuality').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(calls.find(c=>c.action==='start').quality,'lossless');assert.ok(calls.some(c=>c.action==='audio-chunk'));assert.ok(!calls.some(c=>c.action==='audio'));
  const [backing]=await storage.listBackings('video');assert.equal(backing.quality,'lossless');assert.equal(backing.blob.type,'audio/flac');assert.match(backing.key,/:lossless$/);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();assert.equal(nodes.get('backingQuality').value,'standard');
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();assert.equal(nodes.get('backingQuality').value,'lossless');
  await new Promise(r=>setTimeout(r,10));assert.equal((await storage.getSession('video')).qualityPreferences.speech,'lossless');
  (await storage.ready).close();
});

test('old service cannot silently return MP3 when lossless was selected',async()=>{
  const storage=createStorage(new IDBFactory());let starts=0;
  const {nodes}=await mount(storage,{video:{duration:60,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){if(message.action==='start')starts++;return {};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  nodes.get('backingQuality').value='lossless';nodes.get('backingQuality').onchange();
  await nodes.get('prepareBacking').onclick();assert.equal(starts,0);assert.match(nodes.get('karaokeNotice').textContent,/无损音质需要新版服务/);
  (await storage.ready).close();
});

test('input selection persists, applies to recording and auto-practice, and survives device removal without fallback',async()=>{
  const storage=createStorage(new IDBFactory()),preferences=new Map(),requests=[];let changed,stops=0;
  let devices=[{kind:'audioinput',deviceId:'usb',label:'USB microphone'}];
  const mediaDevices={enumerateDevices:async()=>devices,addEventListener(type,fn){if(type==='devicechange')changed=fn;},async getUserMedia(options){requests.push(options);if(options.audio.deviceId)throw Object.assign(Error('gone'),{name:'OverconstrainedError'});return {getTracks:()=>[{stop(){stops++;}}]};}};
  const globals={navigator:{mediaDevices},MediaRecorder:class{static isTypeSupported(){return true;}},window:{localStorage:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)},addEventListener(){},speechSynthesis:{cancel(){}}}};
  const {nodes}=await mount(storage,{globals});
  await waitUntil(()=>nodes.get('inputDevice').children.some(n=>n.value==='usb'));
  nodes.get('inputDevice').value='usb';nodes.get('inputDevice').onchange();
  await nodes.get('record').onclick();assert.equal(requests.at(-1).audio.deviceId.exact,'usb');assert.match(nodes.get('status').textContent,/所选麦克风不可用/);
  await nodes.get('autoPractice').onclick();assert.equal(requests.at(-1).audio.deviceId.exact,'usb');
  devices=[];changed();await waitUntil(()=>nodes.get('inputDevice').children.at(-1).textContent.includes('未连接'));
  assert.equal(nodes.get('inputDevice').value,'usb');
  await nodes.get('detectInputs').onclick();assert.equal(stops,1);assert.equal(requests.at(-1).audio.deviceId,undefined);
  const refreshed=await mount(storage,{globals});assert.equal(refreshed.nodes.get('inputDevice').value,'usb');
  nodes.get('inputDevice').value='';nodes.get('inputDevice').onchange();
  assert.equal(JSON.parse(preferences.get('echo-microphone-v1')).inputDeviceId,'');
  (await storage.ready).close();
});

test('sidetone is opt-in, persists volume and requests low latency only when enabled',async()=>{
  const storage=createStorage(new IDBFactory()),preferences=new Map(),requests=[];
  const globals={MediaRecorder:class{static isTypeSupported(){return true;}},navigator:{mediaDevices:{async getUserMedia(options){requests.push(options);throw Error('Fixture mic');}}},window:{localStorage:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)},addEventListener(){},speechSynthesis:{cancel(){}}}};
  const {nodes}=await mount(storage,{globals});assert.equal(nodes.get('sidetoneEnabled').checked,false);
  await nodes.get('record').onclick();assert.equal(requests.at(-1).audio.latency,undefined);
  nodes.get('sidetoneEnabled').checked=true;nodes.get('sidetoneEnabled').onchange();
  nodes.get('sidetoneMode').value='minimum';nodes.get('sidetoneMode').onchange();
  nodes.get('sidetoneVolume').value='0.6';nodes.get('sidetoneVolume').oninput();nodes.get('sidetoneVolume').onchange();
  await nodes.get('record').onclick();assert.equal(requests.at(-1).audio.latency.ideal,0);
  const refreshed=await mount(storage,{globals});assert.equal(refreshed.nodes.get('sidetoneEnabled').checked,true);assert.equal(refreshed.nodes.get('sidetoneVolume').value,0.6);assert.equal(refreshed.nodes.get('sidetoneMode').value,'minimum');
  (await storage.ready).close();
});

test('live latency diagnostics follow the active capture and persist in recording details',async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo({hold:true});let nodes;
  const info={mode:'minimum',inputLatency:null,baseLatency:0.0027,outputLatency:0.032};
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice'])});queueMicrotask(()=>this.onstop());}
  }
  const mounted=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},EchoMicrophone:{...require('../extension/microphone.js'),createInput:async(stream,db,env,options)=>{assert.equal(options.sidetoneMode,'minimum');return {stream,db:0,dispose(){},monitoringInfo:()=>info};}}}});
  nodes=mounted.nodes;nodes.get('sidetoneEnabled').checked=true;nodes.get('sidetoneEnabled').onchange();nodes.get('sidetoneMode').value='minimum';nodes.get('sidetoneMode').onchange();
  const recording=nodes.get('record').onclick();await waitUntil(()=>!nodes.get('sidetoneLatency').hidden);
  assert.equal(nodes.get('sidetoneMode').disabled,true);assert.match(nodes.get('sidetoneLatency').textContent,/输入 未报告.*图缓冲 2.7 ms.*输出 32.0 ms/);
  nodes.get('stop').onclick();await recording;
  assert.equal(nodes.get('sidetoneLatency').hidden,true);assert.match(nodes.get('recordingTechnical').textContent,/更低延迟/);
  const [take]=await storage.listTakes('video');assert.equal(take.recordingInfo.monitoring.baseLatency,0.0027);
  (await storage.ready).close();
});

test('sidetone defaults to minimum latency without enabling monitoring or replacing an existing mode preference',async()=>{
  for(const [saved,expected] of [[{},'minimum'],[{sidetoneMode:'standard'},'standard'],[{sidetoneMode:'minimum'},'minimum'],[{sidetoneMode:'invalid'},'minimum']]){
    const storage=createStorage(new IDBFactory()),preferences=new Map([['echo-microphone-v1',JSON.stringify(saved)]]);
    const globals={window:{localStorage:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)},addEventListener(){},speechSynthesis:{cancel(){}}}};
    const {nodes}=await mount(storage,{globals});
    assert.equal(nodes.get('sidetoneMode').value,expected);assert.equal(nodes.get('sidetoneEnabled').checked,false);
    nodes.get('sidetoneEnabled').checked=true;nodes.get('sidetoneEnabled').onchange();
    assert.equal(JSON.parse(preferences.get('echo-microphone-v1')).sidetoneMode,expected);
    const restored=await mount(storage,{globals});assert.equal(restored.nodes.get('sidetoneMode').value,expected);assert.equal(restored.nodes.get('sidetoneEnabled').checked,true);
    (await storage.ready).close();
  }
});

test('sidetone processing warning names only enabled processing and follows activity preferences',async()=>{
  const storage=createStorage(new IDBFactory()),{nodes}=await mount(storage);
  const warning=nodes.get('sidetoneProcessingWarning');assert.equal(warning.hidden,true);assert.equal(warning.textContent,'');
  nodes.get('sidetoneEnabled').checked=true;nodes.get('sidetoneEnabled').onchange();
  assert.equal(warning.hidden,false);assert.match(warning.textContent,/回声消除、自动增益/);
  nodes.get('echoCancellation').checked=false;nodes.get('echoCancellation').onchange();
  assert.match(warning.textContent,/自动增益/);assert.doesNotMatch(warning.textContent,/回声消除/);
  nodes.get('autoGainControl').checked=false;nodes.get('autoGainControl').onchange();assert.equal(warning.hidden,true);assert.equal(warning.textContent,'');
  nodes.get('echoCancellation').checked=true;nodes.get('echoCancellation').onchange();assert.match(warning.textContent,/回声消除/);assert.doesNotMatch(warning.textContent,/自动增益/);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();assert.equal(warning.hidden,true);
  nodes.get('activityMode').value='speech';nodes.get('activityMode').onchange();assert.equal(warning.hidden,false);
  nodes.get('sidetoneEnabled').checked=false;nodes.get('sidetoneEnabled').onchange();assert.equal(warning.hidden,true);
  assert.equal(nodes.get('echoCancellation').checked,true); // Inform without changing the user's processing preference.
  (await storage.ready).close();
});

test('headphone recommendation saves only the current activity, retains manual gain and leaves sidetone enabled',async()=>{
  const storage=createStorage(new IDBFactory()),preferences=new Map([['echo-microphone-v1',JSON.stringify({speech:true,sing:true,autoGainControl:{speech:true,sing:true},manualGainDb:{speech:6,sing:12}})]]);
  const globals={window:{localStorage:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)},addEventListener(){},speechSynthesis:{cancel(){}}}};
  const {nodes}=await mount(storage,{globals});
  nodes.get('sidetoneEnabled').checked=true;nodes.get('sidetoneEnabled').onchange();assert.equal(nodes.get('sidetoneProcessingNotice').hidden,false);
  nodes.get('useHeadphoneSettings').onclick();
  assert.equal(nodes.get('echoCancellation').checked,false);assert.equal(nodes.get('autoGainControl').checked,false);
  assert.equal(nodes.get('sidetoneEnabled').checked,true);assert.equal(nodes.get('sidetoneProcessingNotice').hidden,true);assert.equal(nodes.get('manualGainDb').value,6);
  assert.match(nodes.get('status').textContent,/手动增益保持 \+6 dB/);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('echoCancellation').checked,true);assert.equal(nodes.get('autoGainControl').checked,true);assert.equal(nodes.get('sidetoneProcessingNotice').hidden,false);
  const restored=await mount(storage,{globals});
  restored.nodes.get('activityMode').value='speech';restored.nodes.get('activityMode').onchange();
  assert.equal(restored.nodes.get('echoCancellation').checked,false);assert.equal(restored.nodes.get('autoGainControl').checked,false);
  assert.equal(restored.nodes.get('manualGainDb').value,6);assert.equal(restored.nodes.get('sidetoneEnabled').checked,true);
  (await storage.ready).close();
});

for(const activity of ['sing','speech'])test(`${activity} capture exposes live backing volume and keeps both controls, persisted preference and dry vocals consistent`,async()=>{
  const storage=createStorage(new IDBFactory()),video=leadInVideo({hold:true}),mic={getTracks:()=>[{stop(){}}]};let gain=1;
  await storage.saveBacking({key:'background',videoId:'video',start:0,end:60,createdAt:1,blob:new Blob(['music'])});
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(stream){assert.equal(stream,mic);this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['dry vocal'])});queueMicrotask(()=>this.onstop());}
  }
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{getUserMedia:async()=>mic}},EchoKaraoke:{...require('../extension/karaoke.js'),createMonitor:async()=>({sync:async()=>{},pause(){},dispose(){},setVolume(value){gain=value;}})}}});
  nodes.get('activityMode').value=activity;nodes.get('activityMode').onchange();
  if(activity==='speech'){nodes.get('useBacking').checked=true;nodes.get('useBacking').onchange();}
  const recording=nodes.get('record').onclick();await waitUntil(()=>!nodes.get('backingLiveControls').hidden);
  assert.equal(nodes.get('backingLiveVolume').disabled,false);assert.equal(nodes.get('karaokeSettings').hidden,true);
  assert.equal(nodes.get('backingLiveLabel').textContent,activity==='sing'?'伴奏':'背景音');
  nodes.get('backingLiveVolume').value='2';nodes.get('backingLiveVolume').oninput();assert.equal(gain,2);assert.equal(nodes.get('backingVolume').value,2);assert.equal(nodes.get('backingVolumeValue').textContent,'200%');
  nodes.get('backingVolume').value='0.5';nodes.get('backingVolume').oninput();assert.equal(nodes.get('backingLiveVolume').value,0.5);assert.equal(nodes.get('backingLiveValue').textContent,'50%');
  nodes.get('backingLiveVolume').value='0';nodes.get('backingLiveVolume').oninput();assert.equal(gain,0);nodes.get('backingLiveVolume').onchange();
  assert.equal(nodes.get('replayBackingVolume').value,1);
  nodes.get('stop').onclick();await recording;assert.equal(nodes.get('backingLiveControls').hidden,true);
  const [take]=await storage.listTakes('video');assert.equal(await take.blob.text(),'dry vocal');assert.equal(take.withBacking,undefined);
  const saved=await storage.getSession('video');assert.equal(saved.backingVolume,0);
  const restored=await mount(storage,{video});assert.equal(restored.nodes.get('backingLiveVolume').value,0);assert.equal(restored.nodes.get('backingVolumeValue').textContent,'0%');
  (await storage.ready).close();
});

test('scene presets share existing settings, preserve microphone gain and quality, and favorites live in the library',async()=>{
  const storage=createStorage(new IDBFactory());
  const {nodes}=await mount(storage,{title:'收藏测试 - YouTube'});
  nodes.get('openPresets').onclick();assert.equal(nodes.get('toolsDialog').open,true);
  nodes.get('presetSong').onclick();assert.equal(nodes.get('toolsDialog').open,false);
  assert.equal(nodes.get('activityMode').value,'sing');assert.equal(nodes.get('practiceScope').value,'whole');
  assert.equal(nodes.get('useBacking').checked,true);assert.equal(nodes.get('echoCancellation').checked,false);assert.equal(nodes.get('autoGainControl').checked,false);
  nodes.get('openPresets').onclick();nodes.get('presetSpeaker').onclick();
  assert.equal(nodes.get('activityMode').value,'speech');assert.equal(nodes.get('practiceScope').value,'clip');assert.equal(nodes.get('useBacking').checked,false);
  assert.equal(nodes.get('echoCancellation').checked,true);assert.equal(nodes.get('autoGainControl').checked,true);assert.equal(nodes.get('sidetoneEnabled').checked,false);
  assert.equal(nodes.get('leadInMode').value,'seconds');assert.equal(Number(nodes.get('leadInSeconds').value),3);
  await nodes.get('favoriteVideo').onclick();assert.equal(nodes.get('favoriteVideo').getAttribute('aria-pressed'),'true');
  await nodes.get('openLibrary').onclick();nodes.get('libraryFavoritesTab').onclick();
  assert.equal(nodes.get('libraryList').children.length,1);assert.equal(nodes.get('libraryList').children[0].children[0].textContent,'收藏测试');
  const actions=nodes.get('libraryList').children[0].children.at(-1);await actions.children.at(-1).onclick();
  assert.equal(nodes.get('libraryList').children.length,0);assert.equal(nodes.get('favoriteVideo').getAttribute('aria-pressed'),'false');
  (await storage.ready).close();
});
test('practice library previews a pack, waits for explicit import, merges data and exports per-video original audio',async()=>{
  const storage=createStorage(new IDBFactory()),pack=require('../extension/practice-package.js');
  const data={sessions:[{videoId:'another',title:'迁移的歌曲',start:0,end:5,speed:'1',cues:[{start:0,end:5,text:'导入歌词'}]}],recordings:[{id:'imported',videoId:'another',cueKey:'one',start:0,end:5,speed:1,createdAt:1,blob:new Blob(['original audio'])}],backings:[],favorites:[{videoId:'another',title:'迁移的歌曲',createdAt:1}]};
  const {nodes,downloads}=await mount(storage);await nodes.get('openLibrary').onclick();nodes.get('libraryBackupTab').onclick();
  assert.equal(nodes.get('packageTools').hidden,false);assert.equal(nodes.get('librarySearch').hidden,true);
  nodes.get('packageFile').files=[pack.encode(data)];await nodes.get('packageFile').onchange();
  assert.equal(nodes.get('packagePreview').hidden,false);assert.equal((await storage.listTakes('another')).length,0);
  await nodes.get('packageImport').onclick();assert.equal((await storage.listTakes('another')).length,1);assert.match(nodes.get('libraryMessage').textContent,/导入完成/);
  nodes.get('packageScope').value='another';await nodes.get('packageExport').onclick();
  const link=downloads.at(-1);assert.match(link.download,/Echo-another-.*\.echo/);
  const exported=await pack.decode(await (await fetch(link.href)).blob());
  assert.equal(exported.sessions.length,1);assert.equal(exported.sessions[0].title,'迁移的歌曲');assert.equal(await exported.recordings[0].blob.text(),'original audio');
  (await storage.ready).close();
});

test('document shortcuts only act when the panel is visible and no input or dialog owns focus',async()=>{
  const storage=createStorage(new IDBFactory()),{nodes,document,events}=await mount(storage);
  const host=document.documentElement.children[0],handler=events.get('keydown');let prevented=0;
  const key=extra=>({altKey:true,shiftKey:true,code:'KeyF',preventDefault(){prevented++;},stopPropagation(){},...extra});
  host.style.display='none';handler(key());await new Promise(r=>setTimeout(r,5));assert.equal(await storage.getFavorite('video'),undefined);
  host.style.display='block';handler(key({target:{tagName:'INPUT'}}));assert.equal(prevented,0);
  nodes.get('openMicTest').onclick();handler(key());assert.equal(prevented,0);nodes.get('closeTools').onclick();
  handler(key());await waitUntil(()=>nodes.get('favoriteVideo').getAttribute('aria-pressed')==='true');assert.equal(prevented,1);
  assert.equal((await storage.getFavorite('video')).videoId,'video');(await storage.ready).close();
});

test('current-clip original playback stops before an overlapping next cue and restores explicit manual bounds',async()=>{
  const storage=createStorage(new IDBFactory()),listeners=new Map();let time=0,paused=true;
  const video={duration:30,muted:false,playbackRate:1,get currentTime(){return time;},set currentTime(value){time=value;queueMicrotask(()=>emit('seeked'));},get paused(){return paused;},pause(){paused=true;},async play(){paused=false;},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);}};
  function emit(name){for(const listener of [...listeners.get(name) || []])listener({type:name});}
  const cues=[{start:1,end:8,text:'First line'},{start:4,end:8,text:'Next line'}];
  await storage.saveSession({videoId:'video',activity:'speech',scopes:{speech:'clip',sing:'whole'},start:1,end:8,index:0,speed:'1',leadInMode:'none',cues});
  const {nodes}=await mount(storage,{video});
  assert.equal(Number(nodes.get('end').value),4);assert.equal(nodes.get('clipCue').value,'0');
  const playing=nodes.get('original').onclick();await waitUntil(()=>!paused && listeners.get('timeupdate')?.size>1);
  time=3.9;emit('timeupdate');assert.equal(paused,false);
  time=4;emit('timeupdate');await playing;assert.equal(paused,true);
  assert.equal(Number(nodes.get('end').value),4);assert.equal(Number(nodes.get('start').value),1);
  nodes.get('clipCue').value='1';nodes.get('clipCue').onchange();assert.equal(Number(nodes.get('start').value),4);
  nodes.get('clipCue').value='0';nodes.get('clipCue').onchange();assert.equal(Number(nodes.get('end').value),4);
  // A deliberate extension is not silently shortened, including after reload.
  nodes.get('end').value='8';nodes.get('end').onchange();await new Promise(r=>setTimeout(r,5));
  assert.equal((await storage.getSession('video')).clipRangeAdjusted,true);
  const restored=await mount(storage,{video});assert.equal(Number(restored.nodes.get('end').value),8);
  (await storage.ready).close();
});
