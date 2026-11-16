const {test}=require('node:test');const assert=require('node:assert/strict');
const {detect,resolve,view}=require('../extension/languages.js');
test('suggests common subtitle scripts and permits manual override for ambiguous Han text',()=>{
  assert.equal(detect('明月幾時有，把酒問青天'),'zh');
  assert.equal(detect('君の名前を呼ぶよ'),'ja');assert.equal(detect('오늘 밤 너와 나'),'ko');
  assert.equal(detect('Hello world'),'en');assert.equal(detect('123 ♪'),'und');
  assert.equal(resolve('ja','明日'),'ja');assert.equal(resolve('auto','明日'),'zh');
});
test('original text is lossless for Chinese, Japanese and Korean including Latin loanwords',()=>{
  for(const [language,text] of [['zh','我的 DNA 和你，一起唱！'],['ja','東京で君と Love song を歌う。'],['ko','서울에서 너와 Love song을 불러요.']]){
    for(const layout of ['original','en-zh']){
      const result=view({text},language,layout);assert.equal(result.primary,text);assert.equal(result.reference,'');assert.equal(result.separated,false);
    }
  }
});
test('English-Chinese splitting is explicit and never removes Japanese or Korean',()=>{
  const text='I will stay. 我会留下。';
  assert.equal(view({text},'en').primary,text);
  const split=view({text},'en','en-zh');assert.equal(split.primary,'I will stay.');assert.equal(split.reference,'我会留下。');assert.equal(split.original,text);
  assert.equal(view({text:'君の Love song'},'en','en-zh').primary,'君の Love song');
  assert.equal(view({text:'너와 Love song'},'en','en-zh').primary,'너와 Love song');
});
test('source and reference fields are independent, not inferred from character type',()=>{
  const result=view({text:'旧台词',sourceText:'君が好き',referenceText:'我喜欢你'},'ja');
  assert.equal(result.primary,'君が好き');assert.equal(result.reference,'我喜欢你');assert.equal(result.separated,false);
});
