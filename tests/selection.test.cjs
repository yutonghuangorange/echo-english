const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolve,restoreScopes,cueKey}=require('../extension/selection.js');
const cues=Object.freeze([Object.freeze({start:2,end:4,text:'First'}),Object.freeze({start:6,end:12,text:'Second'}),Object.freeze({start:9,end:10,text:'Third'})]);
const input=Object.freeze({activity:'speech',scope:'clip',start:2,end:4,speed:1,duration:20,cues,index:0,first:0,last:2});
test('scope resolution never changes clip fields and paragraphs retain gaps and overlapping cue tails',()=>{
  assert.deepEqual(resolve({...input,scope:'whole'}).range,{start:0,end:20,speed:1});
  assert.deepEqual(resolve({...input,scope:'paragraph'}).range,{start:2,end:12,speed:1});
  assert.equal(input.start,2);assert.equal(input.end,4);
  assert.deepEqual(resolve(input).range,{start:2,end:4,speed:1});
});
test('identity preserves existing sentence buckets, isolates songs, and snapshots the selected range',()=>{
  assert.equal(resolve(input).key,cueKey(cues[0]));
  assert.equal(resolve({...input,start:1.8}).key,cueKey(cues[0]));
  assert.equal(resolve({...input,activity:'sing'}).key,`song:${cueKey(cues[0])}`);
  assert.equal(resolve({...input,index:-1}).key,'manual:2.00:4.00');
  assert.equal(resolve({...input,scope:'whole'}).key,'manual:0.00:20.00');
  const mutable={...input},selected=resolve(mutable);mutable.start=3;mutable.scope='whole';
  assert.deepEqual(selected.range,{start:2,end:4,speed:1});
});
test('legacy scope migration is explicit and new shared scopes take precedence',()=>{
  assert.deepEqual(restoreScopes({karaokeScope:'paragraph'}),{speech:'clip',sing:'paragraph'});
  assert.deepEqual(restoreScopes({speechScope:'whole',karaokeScope:'clip'}),{speech:'whole',sing:'clip'});
  assert.deepEqual(restoreScopes({scopes:{speech:'paragraph',sing:'whole'},speechScope:'clip',karaokeScope:'clip'}),{speech:'paragraph',sing:'whole'});
  assert.deepEqual(restoreScopes({scopes:{speech:'unknown',sing:7}}),{speech:'clip',sing:'whole'});
});
test('all scopes validate duration, selected bounds, speed and paragraph prerequisites',()=>{
  for(const change of [{speed:0},{speed:NaN},{duration:NaN},{end:25},{start:-1},{end:2},{scope:'unknown'},{scope:'paragraph',first:1,last:1},{scope:'whole',duration:601},{scope:'clip',duration:900,end:603}])assert.throws(()=>resolve({...input,...change}));
  assert.equal(resolve({...input,scope:'whole',duration:600}).range.end,600);
});
