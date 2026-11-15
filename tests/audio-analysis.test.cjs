const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../extension/audio-analysis.js');
test('locates a half-second interior pause and ignores short gaps', () => {
  const samples = new Float32Array(2000).fill(.1);
  samples.fill(0,500,1000); samples.fill(0,1500,1600);
  const result = analyze(samples,1000);
  assert.equal(result.duration,2); assert.equal(result.silent,false);
  assert.deepEqual(result.pauses,[{start:.5,end:1}]);
});
test('handles silent, empty, short and quiet recordings', () => {
  assert.equal(analyze(new Float32Array(),1000).silent,true);
  assert.equal(analyze(new Float32Array(1000).fill(.001),1000).silent,true);
  assert.deepEqual(analyze(new Float32Array(1000),1000).pauses,[{start:0,end:1}]);
  assert.equal(analyze(new Float32Array([.1]),1000).rms.length,1);
});
