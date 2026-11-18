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
test('editor mounts bounded lists and timelines only when open and releases playback resources on close',async()=>{
  const f=fixture();assert.equal(f.frames.size,0);assert.equal(f.videoListeners.size,0);assert.equal(f.$('List').children.length,0);
  f.editor.open({videoId:'first',video:f.video,cues:f.cues});assert.ok(f.$('List').children.length<=26);assert.ok(f.$('Lane').children.length<1000);assert.equal(f.frames.size,0);assert.equal(f.videoListeners.size,5);
  await f.$('Play').onclick();assert.equal(f.frames.size,1);f.editor.close();await f.editor.flush();
  assert.equal(f.frames.size,0);assert.equal(f.videoListeners.size,0);assert.equal(f.$('List').children.length,0);assert.equal(f.$('First').children.length,0);assert.equal(f.video.paused,true);assert.equal(f.video.muted,true);assert.equal(f.video.playbackRate,.75);assert.equal(f.closed,1);assert.equal(f.drafts.at(-1).id,'first');assert.equal(f.drafts.at(-1).draft.cues.length,1000);
});
test('paste, merge, undo, export and apply all use the draft until explicit apply',async()=>{
  const f=fixture();f.editor.open({videoId:'empty',video:f.video,cues:[]});f.$('Workflow').value='cues';f.$('Workflow').onchange();f.$('Paste').value='One\nTwo\n\nThree';f.$('Build').onclick();
  assert.equal(f.applied,null);assert.match(f.$('Count').textContent,/3 句/);f.$('Last').value='1';f.$('Last').onchange();f.$('Merge').onclick();assert.match(f.$('Count').textContent,/2 句/);
  f.$('Undo').onclick();assert.match(f.$('Count').textContent,/3 句/);f.$('Srt').onclick();assert.match(f.exports[0].text,/-->/);
  await f.$('Apply').onclick();assert.equal(f.applied.length,3);assert.equal(f.editor.isOpen(),false);assert.ok(f.drafts.length);
});
test('boundary drag commits once, shares a touching edge and is cancelled safely on close',async()=>{
  const f=fixture(),cues=[{start:0,end:3,text:'A'},{start:3,end:6,text:'B'}];f.editor.open({videoId:'drag',video:f.video,cues});
  const block=f.$('Lane').children[0],handle=block.children.find(child=>child.className==='se-edge end');
  const event={button:0,clientX:30,pointerId:1,currentTarget:handle,preventDefault(){},stopPropagation(){}};
  handle.onpointerdown(event);f.listeners.get('pointermove')({...event,clientX:40});assert.equal(f.$('End').value,'00:00:04.000');
  f.listeners.get('pointerup')(event);assert.equal(f.listeners.size,0);await f.editor.flush();assert.equal(f.drafts.at(-1).draft.cues[1].start,4);
  f.$('Undo').onclick();assert.equal(f.$('End').value,'00:00:03.000');f.editor.close();await f.editor.flush();
});
test('drafts do not cross video identities after reopening',async()=>{
  const f=fixture();f.editor.open({videoId:'one',video:f.video,cues:f.cues.slice(0,2)});f.editor.close();
  f.editor.open({videoId:'two',video:f.video,cues:f.cues.slice(0,3)});await f.editor.flush();assert.equal(f.drafts.at(-1).id,'two');assert.equal(f.drafts.at(-1).draft.cues.length,3);f.editor.close();await f.editor.flush();
});


test('closing during apply cannot overwrite or close a later video draft',async()=>{
  let release;const wait=new Promise(resolve=>{release=resolve;}),f=fixture({applyWait:wait});
  f.editor.open({videoId:'old',video:f.video,cues:f.cues.slice(0,2)});const applying=f.$('Apply').onclick();f.editor.close();
  f.editor.open({videoId:'new',video:f.video,cues:f.cues.slice(0,3)});release();await applying;
  assert.equal(f.editor.isOpen(),true);assert.match(f.$('Count').textContent,/3 句/);f.editor.close();await f.editor.flush();assert.equal(f.drafts.at(-1).id,'new');assert.equal(f.drafts.at(-1).draft.cues.length,3);
});
test('autosave failure is visible and export remains usable',async()=>{
  const f=fixture({draftError:true});f.editor.open({videoId:'full',video:f.video,cues:f.cues.slice(0,2)});await f.editor.flush();
  assert.match(f.$('DraftState').textContent,/保存失败.*Storage full/);f.$('Srt').onclick();assert.equal(f.exports.length,1);f.editor.close();await f.editor.flush();
});

test('I/O marks section boundaries without interrupting playback, applies them and supports remarking estimated boundaries',async()=>{
  const f=fixture();f.editor.open({videoId:'marks',video:f.video,cues:f.cues.slice(0,3)});
  f.$('Last').value='2';f.$('Last').onchange();await f.$('Play').onclick();
  const key=code=>f.$('Dialog').onkeydown({code,target:{tagName:'BUTTON'},preventDefault(){},stopPropagation(){}});
  f.video.currentTime=2;key('KeyI');f.video.currentTime=8;key('KeyO');
  assert.equal(f.video.paused,false);assert.equal(f.$('SectionStart').value,'00:00:02.000');assert.equal(f.$('SectionEnd').value,'00:00:08.000');
  f.$('Estimate').onclick();await f.editor.flush();let draft=f.drafts.at(-1).draft;assert.equal(draft.cues[0].start,2);assert.equal(draft.cues.at(-1).end,8);
  f.video.currentTime=1;key('KeyI');f.video.currentTime=9;key('KeyO');f.$('Estimate').onclick();await f.editor.flush();draft=f.drafts.at(-1).draft;assert.equal(draft.cues[0].start,1);assert.equal(draft.cues.at(-1).end,9);
  f.video.currentTime=5;f.$('Dialog').onkeydown({code:'KeyI',target:{tagName:'INPUT'},preventDefault(){throw Error('typing must be ignored');},stopPropagation(){}});assert.equal(f.$('SectionStart').value,'00:00:01.000');
  f.editor.close();await f.editor.flush();
});

test('pending section start survives choosing the last lyric before marking the end',async()=>{
  const f=fixture();f.editor.open({videoId:'pending',video:f.video,cues:f.cues.slice(0,4)});
  f.video.currentTime=10;f.$('SectionMarkStart').onclick();
  f.$('Last').value='3';f.$('Last').onchange();
  assert.equal(f.$('SectionStart').value,'00:00:10.000');
  f.video.currentTime=30;f.$('SectionMarkEnd').onclick();f.$('Estimate').onclick();await f.editor.flush();
  assert.equal(f.drafts.at(-1).draft.cues[0].start,10);assert.equal(f.drafts.at(-1).draft.cues[3].end,30);f.editor.close();await f.editor.flush();
});

test('marker-first workflow records without lyrics, highlights both mismatch directions and never exports placeholders',async()=>{
  const f=fixture();f.editor.open({videoId:'listen-first',video:f.video,cues:[]});assert.equal(f.$('Workflow').value,'slots');assert.equal(f.$('SectionMarkStart').disabled,false);
  await f.$('Play').onclick();f.video.currentTime=10;f.$('SectionMarkStart').onclick();f.video.currentTime=20;f.$('SectionMarkEnd').onclick();
  f.video.currentTime=30;f.$('SectionMarkStart').onclick();f.video.currentTime=40;f.$('SectionMarkEnd').onclick();assert.equal(f.video.paused,false);
  assert.equal(f.$('Apply').disabled,true);assert.equal(f.$('MappingIssues').hidden,false);assert.match(f.$('MappingIssues').children[0].textContent,/缺少 2 行/);
  f.$('Paste').value='One\nTwo\nExtra line';f.$('Paste').oninput();assert.equal(f.$('MappingIssues').children[1].className,'se-unmatched-lyric');assert.match(f.$('MappingIssues').children[1].textContent,/Extra line/);
  f.$('Srt').onclick();await f.$('Apply').onclick();assert.equal(f.exports.length,0);assert.equal(f.applied,null);
  f.$('Paste').value='One\nTwo';f.$('Paste').oninput();assert.equal(f.$('MappingIssues').hidden,true);assert.equal(f.$('Apply').disabled,false);
  await f.$('Apply').onclick();assert.equal(f.applied[0].start,10);assert.equal(f.applied[0].end,20);assert.equal(f.applied[1].start,30);assert.equal(f.applied[1].text,'Two');await f.editor.flush();
});
test('unmatched markers, pending start and excess lyrics survive draft reopen and excess marker deletion can be undone',async()=>{
  const f=fixture();f.editor.open({videoId:'draft-markers',video:f.video,cues:[]});
  f.video.currentTime=5;f.$('SectionMarkStart').onclick();f.video.currentTime=10;f.$('SectionMarkEnd').onclick();f.video.currentTime=15;f.$('SectionMarkStart').onclick();f.video.currentTime=20;f.$('SectionMarkEnd').onclick();
  f.$('Paste').value='Only one';f.$('Paste').oninput();await f.editor.flush();const draft=f.drafts.at(-1).draft;f.editor.close();await f.editor.flush();
  f.editor.open({videoId:'draft-markers',video:f.video,cues:[],draft});assert.equal(f.$('Apply').disabled,true);f.$('DeleteSlot').onclick();assert.equal(f.$('Apply').disabled,false);f.$('Undo').onclick();assert.equal(f.$('Apply').disabled,true);
  f.video.currentTime=25;f.$('SectionMarkStart').onclick();await f.editor.flush();assert.equal(f.drafts.at(-1).draft.pendingSlotStart,25);f.editor.close();await f.editor.flush();
});
test('manual pending section times survive selection, single-cue edits and draft restore',async()=>{
  const f=fixture();f.editor.open({videoId:'manual',video:f.video,cues:f.cues.slice(0,3)});
  f.$('SectionStart').value='10';f.$('SectionStart').oninput();f.$('SectionEnd').value='30';f.$('SectionEnd').oninput();
  f.$('Last').value='2';f.$('Last').onchange();f.$('End').value='0.15';f.$('End').onchange();assert.equal(f.$('SectionStart').value,'10');assert.equal(f.$('SectionEnd').value,'30');
  await f.editor.flush();const draft=f.drafts.at(-1).draft;f.editor.close();await f.editor.flush();f.editor.open({videoId:'manual',video:f.video,cues:f.cues.slice(0,3),draft});assert.equal(f.$('SectionStart').value,'10');
  f.$('Estimate').onclick();await f.editor.flush();assert.equal(f.drafts.at(-1).draft.cues[0].start,10);assert.equal(f.drafts.at(-1).draft.cues[2].end,30);f.editor.close();await f.editor.flush();
});

test('pending section times cannot export or load old cue timings until explicitly applied',async()=>{
  const f=fixture();f.editor.open({videoId:'no-stale-load',video:f.video,cues:f.cues.slice(0,3)});
  f.$('SectionStart').value='10';f.$('SectionStart').oninput();f.$('SectionEnd').value='30';f.$('SectionEnd').oninput();f.$('Last').value='2';f.$('Last').onchange();
  f.$('Srt').onclick();await f.$('Apply').onclick();assert.equal(f.exports.length,0);assert.equal(f.applied,null);assert.match(f.$('Message').textContent,/尚未应用/);
  f.$('Estimate').onclick();await f.$('Apply').onclick();assert.equal(f.applied[0].start,10);assert.equal(f.applied[2].end,30);await f.editor.flush();
});
test('a balanced marker draft cannot load while a new start is unfinished, including after restore',async()=>{
  const f=fixture();f.editor.open({videoId:'unfinished',video:f.video,cues:[]});f.video.currentTime=5;f.$('SectionMarkStart').onclick();f.video.currentTime=10;f.$('SectionMarkEnd').onclick();f.$('Paste').value='One';f.$('Paste').oninput();
  f.video.currentTime=20;f.$('SectionMarkStart').onclick();await f.$('Apply').onclick();assert.equal(f.applied,null);await f.editor.flush();const draft=f.drafts.at(-1).draft;f.editor.close();await f.editor.flush();
  f.editor.open({videoId:'unfinished',video:f.video,cues:[],draft});assert.equal(f.$('SectionStart').value,'00:00:20.000');assert.equal(f.$('Apply').disabled,true);f.editor.close();await f.editor.flush();
});
