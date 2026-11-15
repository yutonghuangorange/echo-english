(function(root) {
  function splitCaption(text) {
    // Keep the original available: script-based separation is a display aid,
    // not translation or linguistic sentence alignment.
    const chinese = [];
    const english = String(text || '').replace(/\p{Script=Han}[^A-Za-z]*/gu, chunk => { chinese.push(chunk.trim()); return ' '; }).replace(/\s+/g,' ').trim();
    return { english, chinese:chinese.join(' '), original:String(text || '') };
  }
  function nudge(start, end, edge, delta, duration) {
    if (![start,end,delta,duration].every(Number.isFinite) || start < 0 || end <= start || end > duration) throw Error('请先设置有效片段，再微调边界。');
    if (edge === 'start') start = Math.max(0, Math.min(end - .1, start + delta));
    else if (edge === 'end') end = Math.min(duration, Math.max(start + .1, end + delta));
    else throw Error('未知边界。');
    return { start:Math.round(start*100)/100, end:Math.round(end*100)/100 };
  }
  async function runLoop({ count, active, listen, gap }) {
    for (let round = 0; active() && (count === 0 || round < count); round++) {
      await listen(round + 1);
      if (!active()) return;
      if (count === 0 || round + 1 < count) await gap();
    }
  }
  async function runPractice({ active, listen, prepare, record, replay, advance }) {
    while (active()) {
      await listen(); if (!active()) return;
      await prepare(); if (!active()) return;
      const recorded = await record(); if (!active() || !recorded) return;
      await replay(); if (!active()) return;
      if (!advance()) return;
    }
  }
  function recordingQueue(takes) {
    const latest=new Map();
    for(const take of takes) {
      if(!Number.isFinite(take.start) || !Number.isFinite(take.end) || take.end<=take.start)continue;
      const key=take.cueKey || `manual:${take.start}:${take.end}`;
      const previous=latest.get(key);
      if(!previous || take.createdAt>previous.createdAt || (take.createdAt===previous.createdAt && take.id.localeCompare(previous.id)>0))latest.set(key,take);
    }
    return [...latest.values()].sort((a,b)=>a.start-b.start || a.end-b.end || a.id.localeCompare(b.id));
  }
  async function playQueue({queue,active,play}) {
    for(let i=0;i<queue.length && active();i++)await play(queue[i],i,queue.length);
  }
  const api = {splitCaption,nudge,runLoop,runPractice,recordingQueue,playQueue};
  if (typeof module !== 'undefined') module.exports = api; else root.EchoPractice = api;
})(globalThis);
