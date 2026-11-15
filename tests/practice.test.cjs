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
