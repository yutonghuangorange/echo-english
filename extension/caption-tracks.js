// Existing YouTube caption tracks only; no translation or third-party service.
(function(root){
  const playerURL='https://www.youtube.com/youtubei/v1/player';
  const client={clientName:'ANDROID',clientVersion:'20.10.38'};
  function normalizeTracks(values,videoId){
    return (Array.isArray(values)?values:[]).flatMap(t=>{
      try{
        const url=new URL(t.baseUrl);
        if(url.origin!=='https://www.youtube.com' || url.pathname!=='/api/timedtext' || url.searchParams.get('v')!==videoId || !t.languageCode || url.searchParams.has('tlang'))return [];
        const name=t.name?.simpleText || t.name?.runs?.map(r=>r.text).join('') || t.languageCode;
        return [{id:t.vssId || `${t.kind || ''}:${t.languageCode}`,language:t.languageCode,name,generated:t.kind==='asr',url:url.href}];
      }catch{return [];}
    });
  }
  function jsonCues(data,duration){
    if(!Array.isArray(data?.events))throw Error('字幕格式无法识别。');
    return data.events.flatMap(e=>{
      const start=e.tStartMs/1000,end=Math.min(duration,start+e.dDurationMs/1000);
      const text=(e.segs || []).map(s=>s.utf8 || '').join('').replace(/\s+/g,' ').trim();
      return Number.isFinite(start)&&start>=0&&Number.isFinite(end)&&end>start&&start<duration&&text?[{start,end,text}]:[];
    }).sort((a,b)=>a.start-b.start);
  }
  function createRelay({fetcher=root.fetch,now=Date.now}={}){
    const cache=new Map(),pending=new Map();
    async function json(url,options={}){
      let response;
      try{response=await fetcher(url,{...options,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('无法连接 YouTube 字幕服务，请稍后重试。');}
      if(!response.ok)throw Error('YouTube 字幕请求失败，请稍后重试。');
      if(Number(response.headers?.get('Content-Length'))>4*1024*1024)throw Error('字幕内容过大，请导入字幕文件。');
      const text=await response.text();
      if(text.length>4*1024*1024)throw Error('字幕内容过大，请导入字幕文件。');
      try{return JSON.parse(text);}catch{throw Error('YouTube 返回了空字幕或无法识别的内容，请刷新视频后重试。');}
    }
    async function tracks(videoId,refresh=false){
      const old=cache.get(videoId);
      if(!refresh && old && now()-old.at<5*60*1000)return old.tracks;
      if(pending.has(videoId))return pending.get(videoId);
      const task=(async()=>{
        const data=await json(playerURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context:{client},videoId})});
        if(data.videoDetails?.videoId!==videoId)throw Error('未能确认字幕所属视频，请刷新后重试。');
        if(data.playabilityStatus?.status && data.playabilityStatus.status!=='OK')throw Error('YouTube 暂不允许读取此视频字幕。');
        const list=normalizeTracks(data.captions?.playerCaptionsTracklistRenderer?.captionTracks,videoId);
        if(cache.size>=24)cache.delete(cache.keys().next().value);
        cache.set(videoId,{at:now(),tracks:list});return list;
      })();
      pending.set(videoId,task);
      try{return await task;}finally{pending.delete(videoId);}
    }
    return {async request(message,sender){
      const url=new URL(sender.tab?.url || 'https://invalid.local');
      if(url.origin!=='https://www.youtube.com' || url.pathname!=='/watch' || url.searchParams.get('v')!==message.videoId || !/^[\w-]{11}$/.test(message.videoId) || (sender.frameId!==undefined && sender.frameId!==0))throw Error('视频已切换，请在当前 YouTube 视频页读取字幕。');
      if(!['list','read'].includes(message.action))throw Error('无效的字幕操作。');
      const list=await tracks(message.videoId,message.refresh===true);
      const publicTracks=list.map(({url,...track})=>track);
      if(message.action==='list')return {tracks:publicTracks};
      if(!Number.isFinite(message.duration) || message.duration<=0)throw Error('请等待视频时长加载。');
      const track=list.find(t=>t.id===message.trackId);
      if(!track)throw Error('所选字幕已不可用，请刷新字幕语言列表。');
      const endpoint=new URL(track.url);endpoint.searchParams.set('fmt','json3');
      const cues=jsonCues(await json(endpoint.href),message.duration);
      if(!cues.length)throw Error('所选轨道没有可用字幕，已保留原有歌词。');
      return {tracks:publicTracks,trackId:track.id,cues};
    }};
  }
  function currentTrack(doc,videoId,env=root){
    return new Promise(resolve=>{
      if(!doc.dispatchEvent || !env.CustomEvent){resolve(null);return;}
      const requestId=env.crypto.randomUUID();
      const done=event=>{
        const value=event.detail;
        if(value?.requestId!==requestId || value.videoId!==videoId)return;
        cleanup();resolve(value.track || null);
      };
      const cleanup=()=>{env.clearTimeout(timeout);doc.removeEventListener('echo-caption-current-result',done);};
      const timeout=env.setTimeout(()=>{cleanup();resolve(null);},400);
      doc.addEventListener('echo-caption-current-result',done);
      doc.dispatchEvent(new env.CustomEvent('echo-caption-current',{detail:{videoId,requestId}}));
    });
  }
  const api={normalizeTracks,jsonCues,createRelay,currentTrack};
  if(typeof module!=='undefined')module.exports=api;else root.EchoCaptionTracks=api;
})(globalThis);
