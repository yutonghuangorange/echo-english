const {test}=require('node:test');
const assert=require('node:assert/strict');
const {attach}=require('../extension/subtitle-editor-view.js');
const D=require('../extension/subtitle-editor.js');
function fixture({applyWait=null,draftError=false}={}){
  const nodes=new Map(),listeners=new Map(),videoListeners=new Map(),frames=new Map(),drafts=[],exports=[];let applied=null,closed=0,rafId=0;
  class Element{
    constructor(){this.children=[];this.style={};this.attrs={};this.value='';this.checked=false;this.scrollTop=0;this.classList={toggle(){}};this.dataset={};}
    append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
    setAttribute(k,v){this.attrs[k]=v;}focus(){}addEventListener(type,fn){this['on'+type]=fn;}getBoundingClientRect(){return {width:600};}
  }
  for(const match of require('../extension/panel-view.js').html.matchAll(/\bid="(se[^"]+)"/g))nodes.set(match[1],new Element());
  const doc={createElement:()=>new Element(),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const env={setTimeout,clearTimeout,requestAnimationFrame:fn=>{const id=++rafId;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  const video={duration:120,currentTime:0,paused:true,muted:true,playbackRate:.75,pause(){const was=this.paused;this.paused=true;if(!was)videoListeners.get('pause')?.();},async play(){this.paused=false;videoListeners.get('play')?.();},addEventListener:(name,fn)=>videoListeners.set(name,fn),removeEventListener:name=>videoListeners.delete(name)};
  const editor=attach({view:{getElementById:id=>nodes.get(id)},doc,env,domain:D,onApply:async cues=>{applied=cues;if(applyWait)await applyWait;},onDraft:async(id,draft)=>{if(draftError)throw Error("Storage full");drafts.push({id,draft});},onExport:(text,format)=>exports.push({text,format}),onClose:()=>closed++});
  const cues=Array.from({length:1000},(_,i)=>({start:i*.1,end:i*.1+.1,text:`Line ${i}`,key:`stable-${i}`}));
  const $=id=>nodes.get('se'+id);
  return {editor,video,cues,$,listeners,videoListeners,frames,drafts,exports,get applied(){return applied;},get closed(){return closed;}};
}
test('editor lazily mounts bounded lists and releases playback resources on close',async()=>{
  const f=fixture();assert.equal(f.frames.size,0);assert.equal(f.videoListeners.size,0);
  f.editor.open({videoId:'first',video:f.video,cues:f.cues});assert.ok(f.$('List').children.length<=26);assert.ok(f.$('Lane').children.length<1000);assert.equal(f.videoListeners.size,5);
  await f.$('Play').onclick();assert.equal(f.frames.size,1);f.editor.close();await f.editor.flush();
  assert.equal(f.frames.size,0);assert.equal(f.videoListeners.size,0);assert.equal(f.$('List').children.length,0);assert.equal(f.video.muted,true);assert.equal(f.video.playbackRate,.75);assert.equal(f.drafts.at(-1).draft.cues.length,1000);
});
const paste=(f,text)=>{f.$('Paste').value=text;f.$('Paste').oninput();};
const mark=(f,start,end)=>{f.video.currentTime=start;f.$('SectionMarkStart').onclick();f.video.currentTime=end;f.$('SectionMarkEnd').onclick();};
test('paste first, mouse marks auto-fill lyrics without interrupting playback; no keyboard bindings',async()=>{
  const f=fixture();f.editor.open({videoId:'new',video:f.video,cues:[]});
  assert.equal(f.$('SectionMarkStart').disabled,true);assert.equal(f.$('Dialog').onkeydown,undefined);
  paste(f,'One\nTwo');assert.equal(f.$('SectionMarkStart').disabled,false);assert.equal(f.$('List').children.length,4);
  await f.$('Play').onclick();mark(f,10,20);assert.equal(f.video.paused,false);assert.match(f.$('MarkSelection').textContent,/Two/);
  mark(f,30,40);assert.equal(f.video.paused,false);assert.equal(f.$('Apply').disabled,false);
  await f.$('Apply').onclick();assert.deepEqual(f.applied.map(c=>[c.start,c.end,c.text]),[[10,20,'One'],[30,40,'Two']]);await f.editor.flush();
});
test('clicking lyrics and timeline intervals plays exactly that interval and stops at its end',async()=>{
  const f=fixture();f.editor.open({videoId:'preview',video:f.video,cues:[{start:10,end:20,text:'A'},{start:30,end:40,text:'B'}]});
  await f.$('List').children[1].onclick();assert.equal(f.video.currentTime,10);assert.equal(f.video.paused,false);
  f.video.currentTime=20;{const [id,tick]=f.frames.entries().next().value;f.frames.delete(id);tick();}assert.equal(f.video.paused,true);
  await f.$('Lane').children[1].children[0].onclick();assert.equal(f.video.currentTime,30);assert.equal(f.video.paused,false);
  f.video.currentTime=40.3;f.videoListeners.get('timeupdate')();assert.equal(f.video.paused,true);assert.equal(f.video.currentTime,40);f.editor.close();await f.editor.flush();
});
test('unmarked lyrics remain visible and clicking one does not play an invented interval',async()=>{
  const f=fixture();f.editor.open({videoId:'unmarked',video:f.video,cues:[]});paste(f,'One\nTwo');
  await f.$('List').children[2].onclick();assert.equal(f.video.paused,true);assert.match(f.$('Message').textContent,/还没有时间/);assert.equal(f.$('PlayRange').disabled,true);f.editor.close();await f.editor.flush();
});
test('boundary dragging updates touching neighbour once, supports undo, and never starts preview',async()=>{
  const f=fixture();f.editor.open({videoId:'drag',video:f.video,cues:[{start:0,end:3,text:'A'},{start:3,end:6,text:'B'}]});
  const handle=f.$('Lane').children[0].children.find(c=>c.className==='se-edge end'),event={button:0,clientX:30,pointerId:1,currentTarget:handle,preventDefault(){},stopPropagation(){}};
  handle.onpointerdown(event);f.listeners.get('pointermove')({...event,clientX:40});assert.equal(f.$('End').value,'00:00:04.000');f.listeners.get('pointerup')(event);
  assert.equal(f.listeners.size,0);assert.equal(f.video.paused,true);await f.editor.flush();assert.equal(f.drafts.at(-1).draft.cues[1].start,4);
  f.$('Undo').onclick();assert.equal(f.$('End').value,'00:00:03.000');f.$('Redo').onclick();assert.equal(f.$('End').value,'00:00:04.000');f.editor.close();await f.editor.flush();
});
test('mismatch in either direction blocks export and retains real timestamps, deletion can be undone',async()=>{
  const f=fixture();f.editor.open({videoId:'mismatch',video:f.video,cues:[]});paste(f,'One\nTwo\nExtra');mark(f,10,20);mark(f,30,40);
  assert.equal(f.$('Apply').disabled,true);assert.match(f.$('List').children.at(-2).children[1].textContent,/等待/);f.$('Srt').onclick();await f.$('Apply').onclick();assert.equal(f.exports.length,0);assert.equal(f.applied,null);
  paste(f,'Only one');assert.match(f.$('MappingIssues').children[0].textContent,/缺少 1 行/);f.$('DeleteSlot').onclick();assert.equal(f.$('Apply').disabled,false);f.$('Undo').onclick();assert.equal(f.$('Apply').disabled,true);
  paste(f,'One\nTwo');await f.$('Apply').onclick();assert.equal(f.applied[0].start,10);assert.equal(f.applied[1].end,40);await f.editor.flush();
});
test('pending start survives draft restore and can be cancelled back to inherited start',async()=>{
  const f=fixture();f.editor.open({videoId:'pending',video:f.video,cues:[]});paste(f,'One\nTwo');mark(f,5,10);f.video.currentTime=20;f.$('SectionMarkStart').onclick();
  await f.$('Apply').onclick();assert.equal(f.applied,null);await f.editor.flush();const draft=f.drafts.at(-1).draft;f.editor.close();await f.editor.flush();
  f.editor.open({videoId:'pending',video:f.video,cues:[],draft});assert.match(f.$('PendingMark').textContent,/00:00:20/);assert.equal(f.$('Apply').disabled,true);
  f.$('CancelMark').onclick();assert.match(f.$('PendingMark').textContent,/默认开始 00:00:10/);f.$('Undo').onclick();assert.match(f.$('PendingMark').textContent,/开始 00:00:20/);f.editor.close();await f.editor.flush();
});
test('invalid end is rejected without losing pending start, retry and undo preserve data',async()=>{
  const f=fixture();f.editor.open({videoId:'retry',video:f.video,cues:[]});paste(f,'One');mark(f,10,5);assert.equal(f.$('SectionMarkEnd').disabled,false);assert.match(f.$('Message').textContent,/时间无效/);
  f.video.currentTime=20;f.$('SectionMarkEnd').onclick();assert.equal(f.$('Apply').disabled,false);f.$('Undo').onclick();assert.equal(f.$('Apply').disabled,true);assert.match(f.$('PendingMark').textContent,/00:00:10/);f.editor.close();await f.editor.flush();
});
test('existing subtitles use shared preview and mouse text merge/split with undo',async()=>{
  const f=fixture();f.editor.open({videoId:'existing',video:f.video,cues:[{start:10,end:20,text:'One'},{start:20,end:30,text:'Two'}]});assert.equal(f.$('MarkBar').hidden,true);
  f.$('Merge').onclick();assert.match(f.$('Count').textContent,/1 句/);f.$('Undo').onclick();assert.match(f.$('Count').textContent,/2 句/);
  f.$('Text').value='First\nSecond';f.$('TextApply').onclick();assert.match(f.$('Count').textContent,/3 句/);f.$('Srt').onclick();assert.match(f.exports[0].text,/First/);await f.$('Apply').onclick();assert.equal(f.applied.length,3);await f.editor.flush();
});
test('closing during apply cannot close a later video or mix draft identities',async()=>{
  let release;const wait=new Promise(resolve=>{release=resolve;}),f=fixture({applyWait:wait});
  f.editor.open({videoId:'old',video:f.video,cues:f.cues.slice(0,2)});const applying=f.$('Apply').onclick();f.editor.close();
  f.editor.open({videoId:'new',video:f.video,cues:f.cues.slice(0,3)});release();await applying;assert.equal(f.editor.isOpen(),true);assert.match(f.$('Count').textContent,/3 句/);
  f.editor.close();await f.editor.flush();assert.equal(f.drafts.at(-1).id,'new');assert.equal(f.drafts.at(-1).draft.cues.length,3);
});
test('autosave failure is visible and export remains usable',async()=>{
  const f=fixture({draftError:true});f.editor.open({videoId:'full',video:f.video,cues:f.cues.slice(0,2)});await f.editor.flush();assert.match(f.$('DraftState').textContent,/保存失败.*Storage full/);f.$('Srt').onclick();assert.equal(f.exports.length,1);f.editor.close();await f.editor.flush();
});
test('old marker drafts remain readable with excess lyrics and existing real times',async()=>{
  const f=fixture();const draft={workflow:'slots',paste:'One\nTwo',timingSlots:[{key:'old',start:10,end:20}],cues:[{key:'old',start:10,end:20,text:'One'}],sectionTimes:{start:'0'},selected:0};
  f.editor.open({videoId:'old',video:f.video,cues:[],draft});assert.match(f.$('Count').textContent,/1 个区间 \/ 2 行/);assert.equal(f.$('Start').value,'00:00:10.000');assert.equal(f.$('Apply').disabled,true);mark(f,30,40);await f.$('Apply').onclick();assert.equal(f.applied[0].start,10);await f.editor.flush();
});
test('invalid lyric input cannot export stale matches and remains recoverable in drafts',async()=>{
  const f=fixture();f.editor.open({videoId:'limits',video:f.video,cues:[]});paste(f,'One');mark(f,10,20);
  paste(f,'a\n'.repeat(2001));assert.equal(f.$('Apply').disabled,true);assert.equal(f.$('SectionMarkStart').disabled,true);f.$('Srt').onclick();assert.equal(f.exports.length,0);
  await f.editor.flush();const draft=f.drafts.at(-1).draft;f.editor.close();await f.editor.flush();f.editor.open({videoId:'limits',video:f.video,cues:[],draft});assert.equal(f.$('Apply').disabled,true);assert.equal(f.$('Paste').value,draft.paste);
  paste(f,'Corrected');assert.equal(f.$('Apply').disabled,false);await f.$('Apply').onclick();assert.equal(f.applied[0].text,'Corrected');assert.equal(f.applied[0].start,10);await f.editor.flush();
});
test('deleting the last existing cue leaves an empty editable draft rather than throwing',async()=>{
  const f=fixture();f.editor.open({videoId:'delete',video:f.video,cues:[{start:10,end:20,text:'One'}]});f.$('DeleteSlot').onclick();assert.equal(f.$('Apply').disabled,true);f.$('Undo').onclick();assert.equal(f.$('Apply').disabled,false);f.editor.close();await f.editor.flush();
});
test('previous end is the next default start, manual start overrides it and the final line saves immediately',async()=>{
  const f=fixture();f.editor.open({videoId:'continuous',video:f.video,cues:[]});paste(f,'One\nTwo\nThree');mark(f,10,20);
  assert.match(f.$('PendingMark').textContent,/默认开始 00:00:20.000/);assert.equal(f.$('SectionMarkEnd').disabled,false);
  f.video.currentTime=30;f.$('SectionMarkEnd').onclick();assert.match(f.$('PendingMark').textContent,/默认开始 00:00:30.000/);
  f.video.currentTime=35;f.$('SectionMarkStart').onclick();f.video.currentTime=45;f.$('SectionMarkEnd').onclick();assert.equal(f.$('Apply').disabled,false);
  await f.$('Apply').onclick();assert.deepEqual(f.applied.map(c=>[c.start,c.end]),[[10,20],[20,30],[35,45]]);await f.editor.flush();
});
test('default start is restored from draft, follows boundary adjustment and manual cancellation returns to it',async()=>{
  const f=fixture();f.editor.open({videoId:'default-draft',video:f.video,cues:[]});paste(f,'One\nTwo');mark(f,10,20);
  f.$('Lane').children[0].children.find(c=>c.className==='se-edge end').onclick();f.$('End').value='22';f.$('End').onchange();assert.match(f.$('PendingMark').textContent,/默认开始 00:00:22.000/);
  await f.editor.flush();const draft=f.drafts.at(-1).draft;f.editor.close();await f.editor.flush();f.editor.open({videoId:'default-draft',video:f.video,cues:[],draft});assert.match(f.$('PendingMark').textContent,/默认开始 00:00:22.000/);
  f.video.currentTime=25;f.$('SectionMarkStart').onclick();f.$('CancelMark').onclick();assert.match(f.$('PendingMark').textContent,/默认开始 00:00:22.000/);
  f.video.currentTime=30;f.$('SectionMarkEnd').onclick();f.$('Undo').onclick();assert.match(f.$('PendingMark').textContent,/默认开始 00:00:22.000/);f.$('Redo').onclick();assert.equal(f.$('Apply').disabled,false);
  await f.$('Apply').onclick();assert.equal(f.applied[1].start,22);await f.editor.flush();
});
test('clear a middle lyric keeps later timestamps and keys, remark advances past marked rows to the next hole',async()=>{
  const f=fixture(),cues=Array.from({length:5},(_,i)=>({start:10+i*10,end:20+i*10,text:`Line ${i+1}`,key:`row-${i}`}));
  f.editor.open({videoId:'holes',video:f.video,cues});
  await f.$('List').children[2].onclick();f.$('ClearTiming').onclick();assert.equal(f.$('Workflow').value,'slots');assert.match(f.$('MarkSelection').textContent,/第 2 行/);
  await f.editor.flush();let draft=f.drafts.at(-1).draft;assert.equal(draft.cues[1].start,null);assert.equal(draft.cues[2].start,30);assert.equal(draft.cues[2].text,'Line 3');assert.equal(draft.cues[2].key,'row-2');
  await f.$('List').children[4].onclick();f.$('ClearTiming').onclick();
  await f.$('List').children[2].onclick();mark(f,21,29);assert.match(f.$('MarkSelection').textContent,/第 4 行/);assert.equal(f.video.currentTime,40);assert.match(f.$('PendingMark').textContent,/默认开始 00:00:40/);
  await f.editor.flush();draft=f.drafts.at(-1).draft;assert.equal(draft.cues[1].key,'row-1');assert.equal(draft.cues[2].start,30);assert.equal(draft.cues[3].start,null);assert.equal(draft.cues[4].start,50);
  f.video.currentTime=49;f.$('SectionMarkEnd').onclick();assert.equal(f.$('Apply').disabled,false);await f.$('Apply').onclick();assert.deepEqual(f.applied.map(c=>[c.start,c.end]),[[10,20],[21,29],[30,40],[40,49],[50,60]]);await f.editor.flush();
});
test('cleared rows and marking cursor survive restore, undo restores the cleared interval and playback skips holes',async()=>{
  const f=fixture(),cues=[{start:10,end:20,text:'One'},{start:20,end:30,text:'Two'},{start:30,end:40,text:'Three'}];
  f.editor.open({videoId:'restore-holes',video:f.video,cues});await f.$('List').children[2].onclick();f.$('ClearTiming').onclick();f.$('Undo').onclick();assert.equal(f.$('Workflow').value,'cues');assert.equal(f.$('Apply').disabled,false);f.$('Redo').onclick();assert.equal(f.$('Apply').disabled,true);
  await f.editor.flush();const draft=f.drafts.at(-1).draft;f.editor.close();await f.editor.flush();f.editor.open({videoId:'restore-holes',video:f.video,cues,draft});assert.match(f.$('MarkSelection').textContent,/第 2 行/);assert.equal(f.$('Lane').children.length,2);
  await f.$('List').children[3].onclick();assert.equal(f.video.currentTime,30);assert.equal(f.video.paused,false);assert.match(f.$('MarkSelection').textContent,/第 2 行/);
  f.$('Srt').onclick();assert.equal(f.exports.length,0);mark(f,20,30);await f.$('Apply').onclick();assert.equal(f.applied[2].start,30);await f.editor.flush();
});
