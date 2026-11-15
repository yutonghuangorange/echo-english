const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, entry } = require('../extension/dictionary.js');
test('accepts words and contractions, rejects sentences and URLs', () => {
  assert.equal(normalize('Don’t'), "don't");
  assert.equal(normalize('well-known'), 'well-known');
  for (const word of ['hello there','https://example.com','中文','<script>','a'.repeat(61)]) assert.equal(normalize(word),null);
});
test('extracts dictionary phonetics, definitions and examples', () => {
  assert.deepEqual(entry([{word:'hello',phonetics:[{text:'/həˈləʊ/'}],meanings:[{partOfSpeech:'noun',definitions:[{definition:'A greeting.',example:'Hello!'}]}]}]),{word:'hello',phonetic:'/həˈləʊ/',meanings:[{partOfSpeech:'noun',definition:'A greeting.',example:'Hello!'}]});
  assert.throws(()=>entry({title:'No Definitions Found'}),/未找到/);
  assert.throws(()=>entry([{}]),/暂未提供/);
});
