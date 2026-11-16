const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
const {createStorage,cueKey}=require('../extension/storage.js');

// Lightweight content-script DOM harness: run actual UI handlers against a real
// IndexedDB implementation, without requesting microphone or YouTube access.
async function mount(storage, overrides = {}) {
  const nodes=new Map(),created=[];
  class Element {
    constructor(){this.children=[];this.hidden=false;this.value='';this.style={};this.attrs={};this.classList={toggle:()=>{}};created.push(this);}
    set innerHTML(html){this.html=html;for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Element());
      nodes.get('followCaptions').checked=true;
      for(const [id,value] of Object.entries({start:'0',end:'5',speed:'1',loopCount:'3',prepSeconds:'3',backingVolume:'0.65',karaokeScope:'whole',activityMode:'speech',contentLanguage:'auto',captionLayout:'original'}))nodes.get(id).value=value;}
    get innerHTML(){return this.html;}
    setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];} removeAttribute(k){delete this.attrs[k];if(k==='value')this.value=0;}
    append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;}
    attachShadow(){return root;} focus(){} getContext(){return {clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};}
    click(){return this.onclick?.();}
  }
  const root=new Element();root.getElementById=id=>nodes.get(id);
  root.querySelector=()=>({scrollTop:0});root.querySelectorAll=selector=>created.filter(n=>n.className===selector.slice(1));
  const doc={getElementById:()=>null,documentElement:new Element(),createElement:()=>new Element(),createTextNode:text=>({textContent:text}),addEventListener(){},querySelector:selector=>selector==='video.html5-main-video'?(overrides.video || {duration:60}):null};
  const context={document:doc,location:{href:'https://www.youtube.com/watch?v=video',pathname:'/watch'},indexedDB:{},URL,Blob,console,setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){},crypto:globalThis.crypto,
    window:{addEventListener(){},speechSynthesis:{cancel(){}}},chrome:{runtime:{onMessage:{addListener(){}}}},
    EchoLanguages:require('../extension/languages.js'),EchoKaraoke:require('../extension/karaoke.js'),EchoStorage:{...require('../extension/storage.js'),createStorage:()=>storage},EchoPractice:require('../extension/practice.js'),EchoDictionary:require('../extension/dictionary.js'),EchoSubtitles:require('../extension/subtitles.js'),EchoAudioAnalysis:require('../extension/audio-analysis.js')};
  Object.assign(context,overrides.globals || {});
  if(context.chrome.runtime.sendMessage){
    const send=context.chrome.runtime.sendMessage;
    context.chrome.runtime.sendMessage=message=>message.action==='cached'?Promise.resolve(overrides.cachedBackings || {backings:[]}):send(message);
  }
  vm.runInNewContext(fs.readFileSync('extension/content.js','utf8'),context);
  for(let i=0;i<20 && nodes.get('read').disabled;i++)await new Promise(r=>setTimeout(r,2));
  return {nodes,root};
}
test('content script restores selected sentence, boundaries, settings and matching take',async()=>{
  const storage=createStorage(new IDBFactory());
  const first={start:0,end:2,text:'First sentence'},second={start:2.2,end:5.4,text:'Second sentence',key:cueKey({start:2,text:'Second sentence'})};
  await storage.saveSession({videoId:'video',index:1,start:2.2,end:5.4,speed:'0.75',showChinese:true,hideText:false,cues:[first,second]});
  await storage.saveTake({id:'one',videoId:'video',cueKey:second.key,start:2,end:5,speed:1,createdAt:1,blob:new Blob(['audio']),label:'第 2 句'});
  const {nodes}=await mount(storage);
  assert.equal(nodes.get('position').textContent,'2 / 2');assert.equal(nodes.get('start').value,2.2);
  assert.equal(nodes.get('speed').value,'0.75');assert.equal(nodes.get('showChinese').checked,true);
  assert.equal(nodes.get('recordingContent').hidden,false);assert.match(nodes.get('historyInfo').textContent,/2.0–5.0/);
  await nodes.get('startLater').onclick();
  const saved=await storage.getSession('video');assert.equal(saved.start,2.4);assert.equal(saved.cues[1].key,second.key);
  // Changing boundaries keeps the same sentence's recording available.
  assert.equal(nodes.get('replay').disabled,false);
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

 test('practice page imports subtitles and reads video captions without switching tabs',async()=>{
  const storage=createStorage(new IDBFactory());
  const {nodes}=await mount(storage,{globals:{EchoTranscript:{read:async()=>[{start:2,end:4,text:'Read from video'}]}}});
  assert.equal(nodes.get('page-practice').hidden,false);
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
  assert.match(nodes.get('status').textContent,/当前片段生成伴奏/);
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
  assert.match(nodes.get('status').textContent,/本机服务未启动/);
  assert.equal(nodes.get('record').disabled,false);assert.equal(nodes.get('previewBacking').disabled,true);
  (await storage.ready).close();
});

test('whole-song recording uses the full duration and offers replay, retry and download without changing the selected sentence',async()=>{
  const storage=createStorage(new IDBFactory());
  await storage.saveSession({videoId:'video',index:0,start:0,end:1,speed:'1',cues:[{start:0,end:1,text:'Sing'}]});
  const listeners=new Map(),mixedStream={},events=[];let time=0;
  const video={duration:180,muted:false,playbackRate:1,pause(){},get currentTime(){return time;},set currentTime(v){time=v;},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},async play(){time=180;}};
  const mic={getTracks:()=>[{stop(){events.push('mic-stop');}}]};
  class MediaRecorder {
    static isTypeSupported(){return true;}
    constructor(stream){assert.equal(stream,mixedStream);this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';events.push('recorder-start');}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['mixed-audio'])});queueMicrotask(()=>this.onstop());}
  }
  const mix={stream:mixedStream,async sync(){events.push('sync');},pause(){events.push('pause');},dispose(){events.push('dispose');}};
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{getUserMedia:async()=>mic}},
    EchoKaraoke:{...require('../extension/karaoke.js'),createMix:async options=>{assert.equal(options.mic,mic);return mix;}},
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
    chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){return message.action==='audio'?{audio:'UklGRg==',mime:'audio/wav'}:{id:'c'.repeat(32),state:'ready'};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  await nodes.get('recordSong').onclick();
  for(let i=0;i<20 && !(await storage.listTakes('video')).length;i++)await new Promise(r=>setTimeout(r,2));
  const takes=await storage.listTakes('video');assert.equal(takes.length,1);
  assert.equal(takes[0].kind,'song');assert.equal(takes[0].start,0);assert.equal(takes[0].end,180);
  assert.equal(nodes.get('end').value,1);assert.equal(nodes.get('songResult').hidden,false);
  assert.equal(nodes.get('songAgain').disabled,false);assert.match(nodes.get('songDownload').href,/^blob:/);
  assert.equal(takes[0].withBacking,true);assert.equal(await takes[0].blob.text(),'mixed-audio');
  assert(events.includes('dispose'));assert(events.includes('mic-stop'));assert.equal(video.muted,false);
  assert.match(nodes.get('historyInfo').textContent,/含伴奏/);
  assert.equal(nodes.get('record').disabled,false);
  (await storage.ready).close();
});

test('default generation covers the whole song and reuses it for different sentences without moving practice boundaries',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];const cue={start:10,end:12,text:'Keep this sentence'};
  await storage.saveSession({videoId:'video',index:0,start:10,end:12,speed:'1',cues:[cue]});
  const {nodes}=await mount(storage,{video:{duration:180,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){
    calls.push(message);return message.action==='audio'?{audio:'UklGRg==',mime:'audio/wav'}:{id:'d'.repeat(32),state:'ready'};
  }}}}});
  assert.equal(nodes.get('karaokeScope').value,'whole');assert.equal(nodes.get('recordSong').disabled,true);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(calls[0].start,0);assert.equal(calls[0].end,180);
  assert.equal(nodes.get('start').value,10);assert.equal(nodes.get('end').value,12);
  assert.equal(nodes.get('recordSong').disabled,false);
  nodes.get('start').value=30;nodes.get('end').value=40;nodes.get('end').onchange();
  nodes.get('karaokeScope').value='clip';nodes.get('karaokeScope').onchange();
  assert.equal(nodes.get('recordSong').disabled,false);assert.equal(nodes.get('previewBacking').disabled,false);
  assert.equal(nodes.get('prepareBacking').disabled,true);assert.equal(calls.length,2);
  (await storage.ready).close();
});

test('long videos require choosing a clip rather than silently truncating a song',async()=>{
  const storage=createStorage(new IDBFactory());let requests=0;
  const {nodes}=await mount(storage,{video:{duration:600,pause(){}},globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){requests++;}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  await nodes.get('prepareBacking').onclick();
  assert.equal(requests,0);assert.match(nodes.get('status').textContent,/超过 5 分钟/);
  assert.equal(nodes.get('recordSong').disabled,true);
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
  const {nodes}=await mount(storage,{video,globals:{MediaRecorder,navigator:{mediaDevices:{getUserMedia:async()=>mic}},
    EchoKaraoke:{...require('../extension/karaoke.js'),createMix:async()=>{mixes++;throw Error('Must not mix ordinary dubbing');}},
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
  assert.equal(nodes.get('recordSong').disabled,false);
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
  video.paused=false;time=4.5;listeners.get('timeupdate')({type:'timeupdate'});
  assert.equal(text(),'Second line');assert.equal(nodes.get('captionPrevious').textContent,'First line');
  assert.equal(nodes.get('captionNext').textContent,'Third line');assert.equal(nodes.get('translation').textContent,'第二句');
  assert.equal(nodes.get('start').value,2);assert.equal(nodes.get('end').value,4);
  time=7;listeners.get('timeupdate')({type:'timeupdate'});
  assert.equal(text(),'Third line');assert.match(nodes.get('captionPhase').textContent,/即将开始 · 2 秒/);
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
  assert.equal(nodes.get('activityMode').value,'speech');assert.equal(nodes.get('karaokeSettings').hidden,true);
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  assert.equal(nodes.get('previewBacking').disabled,false);assert.equal(nodes.get('recordSong').disabled,false);
  assert.equal(nodes.get('prepareBacking').disabled,true);assert.equal(requests,0);
  (await reopened.ready).close();
});

test('older server-cached accompaniment is recovered without starting separation and then saved locally',async()=>{
  const storage=createStorage(new IDBFactory()),calls=[];
  const {nodes}=await mount(storage,{video:{duration:60},cachedBackings:{backings:[{id:'a'.repeat(32),videoId:'video',start:0,end:60,state:'ready'}]},
    globals:{chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){calls.push(message.action);return {audio:'UklGRg==',mime:'audio/wav'};}}}}});
  nodes.get('activityMode').value='sing';nodes.get('activityMode').onchange();
  for(let i=0;i<20 && nodes.get('recordSong').disabled;i++)await new Promise(r=>setTimeout(r,2));
  assert.deepEqual(calls,['audio']);assert.equal(nodes.get('recordSong').disabled,false);
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
