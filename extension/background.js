chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'echo-toggle' }); }
  catch { await chrome.tabs.create({ url: 'https://www.youtube.com/results?search_query=english+conversation+with+subtitles' }); }
});
