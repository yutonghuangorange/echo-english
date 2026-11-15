const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitCaption, nudge, runLoop, runPractice } = require('../extension/practice.js');
test('separates interleaved bilingual transcript while preserving original', () => {
  const original = 'There is talk that your daughter 有傳言說你的女兒 is in line to be your successor. 是接班人的下一個人選。 Is that true? 這是真的嗎？';
  const result = splitCaption(original);
  assert.equal(result.english,'There is talk that your daughter is in line to be your successor. Is that true?');
  assert.equal(result.chinese,'有傳言說你的女兒 是接班人的下一個人選。 這是真的嗎？');
  assert.equal(result.original,original);
  assert.equal(splitCaption("I'm here.\nYou're welcome!").english,"I'm here. You're welcome!");
  assert.equal(splitCaption('只有中文。').english,'');
});
test('boundary nudges clamp at video edges and preserve minimum range', () => {
  assert.deepEqual(nudge(.1,1,'start',-.2,10),{start:0,end:1});
  assert.deepEqual(nudge(0,1,'start',2,10),{start:.9,end:1});
  assert.deepEqual(nudge(9,9.9,'end',.2,10),{start:9,end:10});
  assert.deepEqual(nudge(0,1,'end',-2,10),{start:0,end:.1});
  assert.throws(()=>nudge(3,2,'end',.2,10));
});
test('loop plays requested count with gaps only between repetitions', async () => {
  const calls=[];
  await runLoop({count:3,active:()=>true,listen:async n=>calls.push(n),gap:async()=>calls.push('gap')});
  assert.deepEqual(calls,[1,'gap',2,'gap',3]);
});
test('continuous loop stops after cancellation during gap', async () => {
  let active=true; const calls=[];
  await runLoop({count:0,active:()=>active,listen:async n=>calls.push(n),gap:async()=>{active=false;}});
  assert.deepEqual(calls,[1]);
});
test('practice orders listening, preparation, recording and replay across sentences', async () => {
  const calls=[]; let sentence=0;
  await runPractice({active:()=>true,listen:async()=>calls.push('listen'),prepare:async()=>calls.push('prepare'),record:async()=>{calls.push('record');return true;},replay:async()=>calls.push('replay'),advance:()=>++sentence<2});
  assert.deepEqual(calls,['listen','prepare','record','replay','listen','prepare','record','replay']);
});
test('cancelling preparation never starts a microphone recording', async () => {
  let active=true;
  await runPractice({active:()=>active,listen:async()=>{},prepare:async()=>{active=false;},record:async()=>assert.fail('record after cancel'),replay:async()=>assert.fail('replay after cancel'),advance:()=>assert.fail('advance after cancel')});
});
test('recording failure never replays a previous take', async () => {
  await runPractice({active:()=>true,listen:async()=>{},prepare:async()=>{},record:async()=>false,replay:async()=>assert.fail('stale recording'),advance:()=>assert.fail('advance after failure')});
});

test('continuous dub playback chooses latest take per sentence and sorts by video time',()=>{
  const {recordingQueue}=require('../extension/practice.js');
  const takes=[{id:'b',cueKey:'second',start:10,end:12,createdAt:2},{id:'old',cueKey:'first',start:0,end:2,createdAt:1},{id:'new',cueKey:'first',start:.2,end:2.2,createdAt:3},{id:'bad',cueKey:'bad',start:20,end:10,createdAt:4}];
  assert.deepEqual(recordingQueue(takes).map(t=>t.id),['new','b']);
});
test('continuous dub playback stops without starting the next segment',async()=>{
  const {playQueue}=require('../extension/practice.js');let active=true;const played=[];
  await playQueue({queue:['first','second'],active:()=>active,play:async value=>{played.push(value);active=false;}});
  assert.deepEqual(played,['first']);
});

test('playback watchdog allows whole songs and slower playback without a fixed two-minute cutoff',()=>{
  const {playbackTimeout}=require('../extension/practice.js');
  assert.equal(playbackTimeout({start:0,end:180,speed:1}),195000);
  assert.equal(playbackTimeout({start:30,end:330,speed:0.75}),415000);
});

test('caption frames handle upcoming lines, exact boundaries, gaps, seeks and the end of subtitles',()=>{
  const {captionFrame}=require('../extension/practice.js');
  const cues=[{start:2,end:4},{start:4,end:6},{start:9,end:10}];
  assert.deepEqual(captionFrame(cues,0),{index:0,phase:'upcoming'});
  assert.deepEqual(captionFrame(cues,2),{index:0,phase:'active'});
  assert.deepEqual(captionFrame(cues,4),{index:1,phase:'active'});
  assert.deepEqual(captionFrame(cues,7),{index:2,phase:'upcoming'});
  assert.deepEqual(captionFrame(cues,9.5),{index:2,phase:'active'});
  assert.deepEqual(captionFrame(cues,10),{index:2,phase:'ended'});
  assert.deepEqual(captionFrame(cues,3),{index:0,phase:'active'});
  assert.deepEqual(captionFrame([],3),{index:-1,phase:'empty'});
  assert.deepEqual(captionFrame(cues,NaN),{index:-1,phase:'empty'});
});
