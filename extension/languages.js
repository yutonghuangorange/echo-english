(function(root) {
  const languages={en:'英语',zh:'中文',ja:'日语',ko:'韩语',und:'其他 / 未确定'};
  function detect(text) {
    const value=String(text || '');
    if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value))return 'ja';
    if(/\p{Script=Hangul}/u.test(value))return 'ko';
    const han=(value.match(/\p{Script=Han}/gu)||[]).length;
    const latin=(value.match(/[A-Za-z]/g)||[]).length;
    if(han)return latin>han*2?'en':'zh';
    return latin?'en':'und';
  }
  function validLanguage(value){return value==='auto' || Object.hasOwn(languages,value);}
  function resolve(value,text){return value!=='auto' && validLanguage(value)?value:detect(text);}
  function view(cue,language,layout='original') {
    const original=String(cue?.sourceText ?? cue?.text ?? '');
    const reference=typeof cue?.referenceText==='string'?cue.referenceText:'';
    if(layout==='en-zh' && language==='en' && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(original) && /[A-Za-z]/.test(original) && /\p{Script=Han}/u.test(original) && !reference) {
      const chinese=[];
      const english=original.replace(/\p{Script=Han}[^A-Za-z]*/gu,part=>{chinese.push(part.trim());return ' ';}).replace(/\s+/g,' ').trim();
      return {primary:english || original,reference:chinese.join(' '),original,separated:true};
    }
    return {primary:original,reference,original,separated:false};
  }
  const api={languages,detect,resolve,view,validLanguage};
  if(typeof module!=='undefined')module.exports=api;else root.EchoLanguages=api;
})(globalThis);
