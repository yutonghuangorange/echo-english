chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'echo-toggle' }); }
  catch { await chrome.tabs.create({ url: 'https://www.youtube.com/results?search_query=english+conversation+with+subtitles' }); }
});

importScripts('dictionary.js');
importScripts('karaoke-relay.js');
importScripts('caption-tracks.js');
const captionRelay=EchoCaptionTracks.createRelay();
const dictionaryCache = new Map();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if(message.type==='echo-captions'){
    captionRelay.request(message,sender).then(reply,error=>reply({error:error.message}));
    return true;
  }
  if (message.type === 'echo-karaoke') {
    EchoKaraokeRelay.request(message,sender).then(reply,error=>reply({error:error.message}));
    return true;
  }
  if (message.type !== 'echo-dictionary') return;
  if (!sender.tab?.url?.startsWith('https://www.youtube.com/')) { reply({error:'不支持的页面。'}); return; }
  const word = EchoDictionary.normalize(message.word);
  if (!word) { reply({error:'请选择一个英文单词。'}); return; }
  if (dictionaryCache.has(word)) { reply({entry:dictionaryCache.get(word)}); return; }
  (async () => {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal:AbortSignal.timeout(8000), credentials:'omit' });
      if (response.status === 404) throw Error('未找到该词，可尝试单词原形。');
      if (!response.ok) throw Error('词典服务暂不可用，请稍后重试。');
      const entry = EchoDictionary.entry(await response.json());
      if (dictionaryCache.size >= 200) dictionaryCache.delete(dictionaryCache.keys().next().value);
      dictionaryCache.set(word, entry); reply({entry});
    } catch (error) { reply({error:error.name === 'TimeoutError' ? '词典查询超时，请稍后重试。' : error.message}); }
  })();
  return true;
});
