(function (root) {
  const ROWS = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
  const STAMP = '.segment-timestamp, .segment-start-offset, .ytwTranscriptSegmentViewModelTimestamp, #timestamp';
  const TEXT = '.segment-text, .ytwTranscriptSegmentViewModelText, .ytAttributedStringHost, .yt-core-attributed-string, [role="text"]';
  const OPEN_LABEL = /^(?:show transcript|open transcript|显示文字记录|顯示文字記錄|显示转录文稿|顯示轉錄稿|查看文字记录|查看文字記錄|文字起こしを表示)$/i;
  const clean = text => (text || '').replace(/[\u200b-\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();
  function timestamp(text) {
    const match = clean(text).match(/^(\d+):([0-5]\d)(?::([0-5]\d))?(?:[.,](\d+))?$/);
    if (!match) return NaN;
    const seconds = match[3] === undefined ? Number(match[1]) * 60 + Number(match[2]) : Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return seconds + (match[4] ? Number(`0.${match[4]}`) : 0);
  }
  function readRows(doc, duration) {
    const data = [];
    for (const row of doc.querySelectorAll(ROWS)) {
      // Hidden panels can retain the transcript of a previous video/language.
      if (row.closest('[hidden], [visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"]')) continue;
      const start = timestamp(row.querySelector(STAMP)?.textContent);
      const text = clean(row.querySelector(TEXT)?.textContent);
      if (Number.isFinite(start) && start >= 0 && start < duration && text) data.push({ start, text });
    }
    const seen = new Set();
    const unique = data.sort((a,b) => a.start - b.start).filter(cue => {
      const key = `${cue.start}|${cue.text}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    let nextStart=null;
    const cues=new Array(unique.length);
    for(let i=unique.length-1;i>=0;i--){
      const cue=unique[i];
      if(i+1<unique.length && unique[i+1].start>cue.start)nextStart=unique[i+1].start;
      cues[i]={...cue,end:Math.min(duration,nextStart ?? cue.start+5)};
    }
    return cues.filter(c=>c.end>c.start);
  }
  function visible(element) {
    return !!element && !element.disabled && !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0;
  }
  function openButton(doc) {
    return [...doc.querySelectorAll('button, [role="button"]')].find(b => visible(b) && OPEN_LABEL.test(clean(b.getAttribute('aria-label') || b.textContent)));
  }
  function expandDescription(doc) {
    // Only expand the video description: never click unrelated "more" controls.
    const button = doc.querySelector('ytd-watch-metadata #description-inline-expander #expand, ytd-watch-metadata #description #expand, #description-inline-expander #expand');
    if (visible(button)) { button.click(); return true; }
    return false;
  }
  async function read({ doc, duration, cancelled = () => false, progress = () => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 48 }) {
    let opened = false, expanded = false, lastCount = 0, stable = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (cancelled()) return null;
      const cues = readRows(doc, duration);
      // Wait for multiple identical row counts; the first render may be partial.
      if (cues.length) {
        stable = cues.length === lastCount ? stable + 1 : 0;
        lastCount = cues.length;
        if (stable >= 2) return cues;
      } else if (!opened) {
        const button = openButton(doc);
        if (button) {
          button.click(); opened = true;
          progress('已打开文字记录，正在等待台词加载…');
        } else if (!expanded) {
          expanded = expandDescription(doc);
          progress(expanded ? '已展开视频简介，正在寻找文字记录…' : '正在等待 YouTube 文字记录入口…');
        }
      }
      await wait(250);
    }
    if (cancelled()) return null;
    const cues = readRows(doc, duration);
    if (cues.length) return cues;
    const error = opened
      ? '文字记录已打开，但台词尚未加载。请确认 YouTube 面板中已出现台词，再点一次“读取台词”。'
      : '未找到可读取的文字记录。请在视频简介中查看“显示文字记录”；若只有画面内字幕，可导入 SRT/VTT，或直接标记片段配音。';
    throw Error(error);
  }
  const api = { timestamp, readRows, read };
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoTranscript = api;
})(globalThis);
