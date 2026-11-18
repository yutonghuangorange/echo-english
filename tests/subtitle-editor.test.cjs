const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../extension/subtitle-editor.js');
const subs=require('../extension/subtitles.js');
let id=0;const key=()=>`test-${++id}`;
const input=()=>D.fromCues([{start:0,end:3,text:'First',key:'old-1'},{start:3,end:6,text:'Second',key:'old-2'},{start:6,end:9,text:'Third',key:'old-3'}]);
test('lyric parsing preserves line order and ignores empty lines without creating estimated timestamps',()=>{
  const lines=D.lyricLines('One\nLonger words\n\n下一段\n終わり');assert.deepEqual(lines.map(c=>c.text),['One','Longer words','下一段','終わり']);assert.deepEqual(lines.map(c=>c.group),[0,0,1,1]);assert.deepEqual(D.lyricLines(' '),[]);assert.throws(()=>D.lyricLines('a\n'.repeat(2001)));
});
test('shared edge editing updates only touching neighbours and rejects crossing fixed or invalid boundaries',()=>{
  const source=input(),next=D.edge(source,0,'end',4,10,true);assert.equal(next[1].start,4);assert.equal(next[0].key,'old-1');assert.equal(source[1].start,3);
  assert.equal(D.edge(source,0,'end',4,10,false)[1].start,3);
  source[1].start=4;assert.equal(D.edge(source,0,'end',3.5,10,true)[1].start,4);
  source[1].start=3;source[1].startLocked=true;assert.throws(()=>D.edge(source,0,'end',4,10,true),/固定/);
  assert.throws(()=>D.edge(input(),0,'end',7,10,true));assert.throws(()=>D.edge(input(),1,'start',-1,10));
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

test('recorded slots map lyrics in order without inventing timestamps for excess lyrics',()=>{
  let slots=D.captureSlot([],10,20,120,key);slots=D.captureSlot(slots,30,40,120,key);
  const exact=D.alignSlots(slots,'Line one\nLine two',120);assert.equal(exact.balanced,true);assert.equal(exact.rows[0].start,10);assert.equal(exact.rows[0].end,20);assert.equal(exact.rows[1].start,30);
  const extra=D.alignSlots(slots,'One\nTwo\nThree',120);assert.equal(extra.balanced,false);assert.deepEqual(extra.extraLyrics,[{text:'Three',group:0,line:3}]);assert.equal(extra.rows.length,2);
  const missing=D.alignSlots(slots,'Only one',120);assert.equal(missing.missingLyrics,1);assert.equal(missing.rows[1].unmatched,true);assert.equal(missing.rows[1].start,30);
  assert.equal(D.alignSlots([],'No timing yet',120).rows.length,0);assert.throws(()=>D.captureSlot(slots,45,44,120,key));assert.throws(()=>D.captureSlot([],NaN,20,120,key));
});
