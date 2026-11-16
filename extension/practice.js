(function(root) {
  function splitCaption(text) {
    // Keep the original available: script-based separation is a display aid,
    // not translation or linguistic sentence alignment.
    const chinese = [];
    const english = String(text || '').replace(/\p{Script=Han}[^A-Za-z]*/gu, chunk => { chinese.push(chunk.trim()); return ' '; }).replace(/\s+/g,' ').trim();
    return { english, chinese:chinese.join(' '), original:String(text || '') };
  }
  // Captions follow media time independently of the selected recording range.
  function captionFrame(cues, time) {
    if(!cues.length || !Number.isFinite(time))return {index:-1,phase:'empty'};
    let low=0,high=cues.length;
    while(low<high){const mid=(low+high)>>>1;if(cues[mid].start<=time)low=mid+1;else high=mid;}
    const previous=low-1;
    if(previous>=0 && time<cues[previous].end)return {index:previous,phase:'active'};
    if(low<cues.length)return {index:low,phase:'upcoming'};
    return {index:cues.length-1,phase:'ended'};
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
  function leadInSeconds(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(30,Math.round(n))):0;}
  function leadInStart(start,seconds,{mode='seconds',cues=[]}={}){
    if(mode==='none')return start;
    if(mode==='previous'){
      const ordered=cues.filter(c=>Number.isFinite(c.start) && Number.isFinite(c.end) && c.end>c.start).sort((a,b)=>a.start-b.start);
      const current=ordered.findIndex(c=>c.end>start+0.001);
      const previous=current<0?ordered.at(-1):ordered[current-1];
      return previous && previous.start<start?Math.max(0,previous.start):start;
    }
    return Math.max(0,start-leadInSeconds(seconds));
  }
  function paragraphRange(cues,first,last){
    if(!Number.isInteger(first) || !Number.isInteger(last) || first<0 || last>=cues.length || last<=first)throw Error('请选择至少两句连续歌词作为段落。');
    const start=cues[first].start,end=Math.max(...cues.slice(first,last+1).map(c=>c.end));
    if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start)throw Error('所选段落缺少有效时间轴，请重新读取或导入字幕。');
    return {start,end};
  }
  function playbackTimeout(range) {return Math.ceil((range.end-range.start)/range.speed*1000)+15000;}
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
  const api = {paragraphRange,leadInSeconds,leadInStart,splitCaption,captionFrame,nudge,runLoop,runPractice,recordingQueue,playQueue,playbackTimeout};
  if (typeof module !== 'undefined') module.exports = api; else root.EchoPractice = api;
})(globalThis);
