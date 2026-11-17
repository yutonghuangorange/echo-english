const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../extension/subtitle-editor.js');
const subs=require('../extension/subtitles.js');
let id=0;const key=()=>`test-${++id}`;
const input=()=>D.fromCues([{start:0,end:3,text:'First',key:'old-1'},{start:3,end:6,text:'Second',key:'old-2'},{start:6,end:9,text:'Third',key:'old-3'}]);
test('pasting establishes estimated cues and keeps blank-line paragraphs without altering input',()=>{
  const cues=D.paste('One\nLonger words\n\n下一段\n終わり',60,key);
  assert.equal(cues.length,4);assert.deepEqual(cues.map(c=>c.group),[0,0,1,1]);assert.equal(cues[0].start,0);assert.equal(cues.at(-1).end,60);
  assert.ok(cues[1].end-cues[1].start>cues[0].end-cues[0].start);assert.ok(cues.every(c=>c.estimated));
  assert.throws(()=>D.paste(' ',60,key));assert.throws(()=>D.paste('a\nb',0.01,key));
});
test('interpolation respects internal anchors and leaves an interlude between separately fixed boundaries',()=>{
  const source=D.paste('a\nb\nc\nd\ne',100,key);source[1]={...source[1],start:20,end:30,startLocked:true,endLocked:true};source[2]={...source[2],start:40,startLocked:true};
  const result=D.interpolate(source,0,4,0,100,100,'equal');
  assert.equal(result[0].end,20);assert.equal(result[1].start,20);assert.equal(result[1].end,30);assert.equal(result[2].start,40);assert.equal(result.at(-1).end,100);
  assert.equal(source[0].end,20);assert.equal(source[2].end,60);assert.equal(result[0].startLocked,true);assert.equal(result[4].endLocked,true);
  assert.throws(()=>D.interpolate(result,0,4,1,100,100),/固定锚点/);
});
test('range estimates leave outside cues intact and cannot create out of order or impossibly short cues',()=>{
  const source=input();const next=D.interpolate(source,1,2,3,8,10,'equal');assert.deepEqual(next[0],source[0]);assert.equal(next[1].start,3);assert.equal(next[1].end,5.5);assert.equal(next[2].end,8);
  assert.throws(()=>D.interpolate(source,1,2,0,0.01,10));assert.throws(()=>D.interpolate(source,1,2,-1,10,10));assert.throws(()=>D.interpolate(source,1,3,0,9,10));
});
test('shared edge editing updates only touching neighbours and rejects crossing fixed or invalid boundaries',()=>{
  const source=input(),next=D.edge(source,0,'end',4,10,true);assert.equal(next[1].start,4);assert.equal(next[0].key,'old-1');assert.equal(source[1].start,3);
  assert.equal(D.edge(source,0,'end',4,10,false)[1].start,3);
  source[1].start=4;assert.equal(D.edge(source,0,'end',3.5,10,true)[1].start,4);
  source[1].start=3;source[1].startLocked=true;assert.throws(()=>D.edge(source,0,'end',4,10,true),/固定/);
  assert.throws(()=>D.edge(input(),0,'end',7,10,true));assert.throws(()=>D.edge(input(),1,'start',-1,10));
});
test('whole interval moves preserve duration and gaps, while anchored cues must be unlocked',()=>{
  const source=input(),next=D.move(source,1,.5,10);assert.equal(next[1].start,3.5);assert.equal(next[1].end,6.5);assert.equal(next[0].end,3);
  source[1].endLocked=true;assert.throws(()=>D.move(source,1,1,10),/固定/);assert.throws(()=>D.move(input(),0,-1,10));
});
test('merging and splitting assign fresh identities while ordinary text edits preserve the recording bucket',()=>{
  const source=input(),merged=D.merge(source,0,1,10,key);assert.equal(merged.length,2);assert.equal(merged[0].start,0);assert.equal(merged[0].end,6);assert.equal(merged[0].text,'First Second');assert.notEqual(merged[0].key,'old-1');
  const edited=D.replaceText(source,1,'Second edited',10,key);assert.equal(edited[1].key,'old-2');
  const split=D.replaceText(source,1,'Long text\nShort',10,key);assert.equal(split.length,4);assert.equal(split[1].start,3);assert.equal(split[2].end,6);assert.equal(split[1].end,split[2].start);assert.notEqual(split[1].key,split[2].key);
  assert.equal(D.replaceText(source,1,'two\u2028lines',10,key)[1].text,'two\nlines');assert.throws(()=>D.replaceText(source,1,' ',10,key));
});
test('exports SRT/VTT with rounded absolute hours and both formats round trip',()=>{
  const source=[{start:3600.125,end:3603.25,text:'字幕 & lyrics'}];
  for(const format of ['srt','vtt']){const text=D.serialize(source,4000,format),parsed=subs.parse(text);assert.equal(parsed[0].start,3600.125);assert.equal(parsed[0].end,3603.25);assert.equal(parsed[0].text,source[0].text);}
  assert.match(D.serialize(source,4000,'vtt'),/^WEBVTT/);assert.equal(D.parseTime('1:00:00.125'),3600.125);assert.equal(D.parseTime('30.5'),30.5);assert.ok(Number.isNaN(D.parseTime('1:99')));
});
test('active lookup handles gaps and timeline window does not render offscreen rows',()=>{
  const source=input();assert.equal(D.activeIndex(source,3),1);assert.equal(D.activeIndex(source,10),-1);assert.deepEqual(D.windowIndices(source,3,6),[1]);
  source[1].start=4;assert.equal(D.activeIndex(source,3.5),-1);
});
