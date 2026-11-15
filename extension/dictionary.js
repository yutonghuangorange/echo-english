(function(root) {
  function normalize(word) {
    const value = String(word || '').trim().replace(/[’‘]/g, "'").toLowerCase();
    return /^[a-z]+(?:['-][a-z]+)*$/.test(value) && value.length <= 60 ? value : null;
  }
  function entry(data) {
    if (!Array.isArray(data) || !data.length) throw Error('未找到该词，可尝试单词原形。');
    const first = data[0];
    const meanings = data.flatMap(e => e.meanings || []).flatMap(m => (m.definitions || []).slice(0,2).map(d => ({partOfSpeech:String(m.partOfSpeech || ''), definition:String(d.definition || ''), example:String(d.example || '')}))).filter(m => m.definition).slice(0,6);
    if (!meanings.length) throw Error('词典暂未提供该词的释义。');
    return { word:String(first.word || ''), phonetic:String(first.phonetic || first.phonetics?.find(p=>p.text)?.text || ''), meanings };
  }
  const api = { normalize, entry };
  if (typeof module !== 'undefined') module.exports = api; else root.EchoDictionary = api;
})(globalThis);
