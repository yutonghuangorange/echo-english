// Subtitle editing domain. No DOM, playback, storage or changes to recordings.
(function(root){
  const MIN=0.02,MAX_CUES=2000,MAX_TEXT=200000;
  const copy=cues=>cues.map(c=>({...c}));
  const newKey=()=>`edit:${globalThis.crypto.randomUUID()}`;
  function validate(cues,duration){
    if(!Number.isFinite(duration) || duration<=0)throw Error('请等待视频时长加载；直播暂不支持。');
    if(!Array.isArray(cues) || !cues.length)throw Error('请先粘贴歌词或导入字幕。');
    if(cues.length>MAX_CUES || cues.reduce((n,c)=>n+String(c.text || '').length,0)>MAX_TEXT)throw Error('歌词过长，请分批编辑（最多 2000 句、20 万字）。');
    cues.forEach((c,i)=>{
      if(typeof c.text!=='string' || !c.text.trim())throw Error(`第 ${i+1} 句缺少文字。`);
      if(!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start<0 || c.end-c.start<MIN-0.000001 || c.end>duration+0.001)throw Error(`第 ${i+1} 句时间无效，请设置视频时长内的有效区间。`);
      if(i && c.start<cues[i-1].start)throw Error('句子起点不能越过前一句；可先合并或调整相邻句。');
    });
    return cues;
  }
  function fromCues(cues,key=newKey){return cues.map(c=>({start:c.start,end:c.end,text:c.text,key:c.key || key(),group:c.group,estimated:!!c.estimated,startLocked:!!c.startLocked,endLocked:!!c.endLocked}));}
  function weight(text,method){return method==='equal'?1:Math.max(1,Array.from(text.replace(/\s/g,'')).length);}
  function allocate(cues,first,last,start,end,method){
    const weights=cues.slice(first,last+1).map(c=>weight(c.text,method)),total=weights.reduce((a,b)=>a+b,0);
    if(end-start<(last-first+1)*MIN)throw Error('所选时间太短，无法容纳这些句子。');
    let cursor=start;
    for(let i=first;i<=last;i++){
      // Reserve a minimum duration, then distribute the remaining time.
      const length=MIN+(end-start-(last-first+1)*MIN)*weights[i-first]/total;
      cues[i]={...cues[i],start:cursor,end:i===last?end:cursor+length,estimated:true};cursor=cues[i].end;
    }
  }
  function lyricLines(text){
    if(typeof text!=='string' || text.length>MAX_TEXT)throw Error('歌词请控制在 20 万字以内。');
    let group=0;const lines=[];
    for(const line of text.replace(/\r/g,'').split('\n')){
      if(!line.trim()){if(lines.length)group++;continue;}
      lines.push({text:line.trim(),group});
    }
    if(lines.length>MAX_CUES)throw Error('歌词最多 2000 句，每行一句，空行分段。');
    return lines;
  }
  function paste(text,duration,key=newKey){
    const cues=lyricLines(text).map(line=>({...line,key:key(),estimated:true,startLocked:false,endLocked:false}));
    if(!cues.length)throw Error('请粘贴歌词，每行一句。');
    allocate(cues,0,cues.length-1,0,duration,'length');return validate(cues,duration);
  }
  function captureSlot(slots,start,end,duration,key=newKey){
    const next=[...copy(slots),{start,end,key:key()}].sort((a,b)=>a.start-b.start);
    validate(next.map(c=>({...c,text:'时间区间'})),duration);return next;
  }
  function alignSlots(slots,text,duration){
    const lines=lyricLines(text);
    const rows=slots.map((slot,i)=>({...slot,text:lines[i]?.text || '（缺少歌词）',group:lines[i]?.group,unmatched:i>=lines.length,estimated:false}));
    if(rows.length)validate(rows,duration);
    return {rows,extraLyrics:lines.slice(slots.length).map((line,i)=>({...line,line:slots.length+i+1})),missingLyrics:Math.max(0,slots.length-lines.length),lineCount:lines.length,balanced:slots.length>0 && slots.length===lines.length};
  }
  function interpolate(source,first,last,start,end,duration,method='length'){
    if(!Number.isInteger(first) || !Number.isInteger(last) || first<0 || last<first || last>=source.length)throw Error('请选择有效的起句和止句。');
    if(!Number.isFinite(start) || !Number.isFinite(end) || start<0 || end>duration || end<=start)throw Error('请设置有效的段落开始和结束时间。');
    const cues=copy(source);
    // Explicit section marks redefine its outer boundaries. Interior anchors
    // remain fixed, including gaps between separately fixed cue boundaries.
    cues[first].start=start;cues[last].end=end;
    let runFirst=first,runStart=start;
    for(let i=first;i<=last;i++){
      if(cues[i].startLocked){
        if(i>runFirst)allocate(cues,runFirst,i-1,runStart,cues[i].start,method);
        runFirst=i;runStart=cues[i].start;
      }
      if(cues[i].endLocked){allocate(cues,runFirst,i,runStart,cues[i].end,method);runFirst=i+1;runStart=cues[i].end;}
    }
    if(runFirst<=last)allocate(cues,runFirst,last,runStart,end,method);
    // Explicit outer anchors protect this section during later estimates.
    cues[first].startLocked=true;cues[last].endLocked=true;
    return validate(cues,duration);
  }
  function edge(source,index,which,value,duration,link=true){
    const cues=copy(source),cue=cues[index];if(!cue || !['start','end'].includes(which) || !Number.isFinite(value))throw Error('请选择有效时间。');
    const adjacent=which==='start'?cues[index-1]:cues[index+1],other=which==='start'?'end':'start';
    if(link && adjacent && Math.abs(adjacent[other]-cue[which])<0.015){
      if(adjacent[other+'Locked'])throw Error('相邻句边界已固定，请先解除固定或关闭联动。');
      adjacent[other]=value;adjacent.estimated=false;
    }
    cue[which]=value;cue.estimated=false;return validate(cues,duration);
  }
  function move(source,index,delta,duration){
    const cues=copy(source),c=cues[index];if(!c || !Number.isFinite(delta))throw Error('请选择有效区间。');
    if(c.startLocked || c.endLocked)throw Error('此句有固定锚点，请先解除固定再整体移动。');
    c.start+=delta;c.end+=delta;c.estimated=false;return validate(cues,duration);
  }
  function merge(source,first,last,duration,key=newKey){
    if(first<0 || last<=first || last>=source.length)throw Error('请选择至少两句连续歌词合并。');
    const cues=copy(source),items=cues.slice(first,last+1);
    cues.splice(first,last-first+1,{...items[0],key:key(),text:items.map(c=>c.text).join(' '),end:Math.max(...items.map(c=>c.end)),endLocked:items.at(-1).endLocked,estimated:items.some(c=>c.estimated)});
    return validate(cues,duration);
  }
  function replaceText(source,index,text,duration,key=newKey){
    const cues=copy(source),cue=cues[index];if(!cue)throw Error('请先选一句歌词。');
    const lines=text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(!lines.length)throw Error('歌词不能为空。');
    // Shift+Enter is represented as U+2028 inside a single subtitle.
    const parts=lines.map(line=>({...cue,text:line.replace(/\u2028/g,'\n'),key:lines.length===1?cue.key:key(),startLocked:false,endLocked:false}));
    allocate(parts,0,parts.length-1,cue.start,cue.end,'length');
    parts[0].startLocked=cue.startLocked;parts.at(-1).endLocked=cue.endLocked;
    if(parts.length===1)parts[0].estimated=cue.estimated;
    cues.splice(index,1,...parts);return validate(cues,duration);
  }
  function parseTime(value){
    if(typeof value!=='string' || !value.trim())return NaN;
    if(/^\d+(?:\.\d+)?$/.test(value.trim()))return Number(value);
    if(!/^\d+(?::[0-5]\d){1,2}(?:[.,]\d{1,3})?$/.test(value.trim()))return NaN;
    return value.trim().replace(',','.').split(':').map(Number).reduce((n,v)=>n*60+v,0);
  }
  function time(seconds,comma=false){
    const ms=Math.max(0,Math.round(seconds*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${comma?',':'.'}${String(ms%1000).padStart(3,'0')}`;
  }
  function serialize(cues,duration,format='srt'){
    validate(cues,duration);if(!['srt','vtt'].includes(format))throw Error('请选择 SRT 或 VTT。');
    const blocks=cues.map((c,i)=>`${format==='srt'?`${i+1}\n`:''}${time(c.start,format==='srt')} --> ${time(c.end,format==='srt')}\n${c.text.replace(/-->/g,'→').replace(/[<>]/g,'')}`);
    return (format==='vtt'?'WEBVTT\n\n':'')+blocks.join('\n\n')+'\n';
  }
  function activeIndex(cues,time){let low=0,high=cues.length-1,result=-1;while(low<=high){const mid=(low+high)>>1;if(cues[mid].start<=time){result=mid;low=mid+1;}else high=mid-1;}return result>=0 && time<cues[result].end?result:-1;}
  function windowIndices(cues,start,end){let low=0,high=cues.length;while(low<high){const mid=(low+high)>>1;if(cues[mid].start<end)low=mid+1;else high=mid;}const result=[];for(let i=0;i<low;i++)if(cues[i].end>start)result.push(i);return result;}
  const api={MIN,MAX_CUES,MAX_TEXT,copy,validate,fromCues,lyricLines,captureSlot,alignSlots,paste,interpolate,edge,move,merge,replaceText,parseTime,time,serialize,activeIndex,windowIndices};
  if(typeof module!=='undefined')module.exports=api;else root.EchoSubtitleEditor=api;
})(globalThis);
