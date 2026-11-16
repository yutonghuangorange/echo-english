(function(root) {
  const base = 'http://127.0.0.1:8765';
  async function request(message, sender, fetcher = fetch) {
    const url = new URL(sender.tab?.url || 'https://invalid.local/');
    if(url.origin !== 'https://www.youtube.com')throw Error('请在 YouTube 视频页使用伴奏功能。');
    const action = message.action;
    if(!['start','cached','status','audio','cancel'].includes(action))throw Error('无效的伴奏操作。');
    let path = '/jobs', body;
    if(action === 'start' || action === 'cached') {
      if(url.pathname !== '/watch')throw Error('请在 YouTube 视频页使用伴奏功能。');
      if(message.videoId !== url.searchParams.get('v') || !/^[\w-]{11}$/.test(message.videoId))throw Error('视频已切换，请重新生成伴奏。');
      if(action==='cached')path='/backings/'+message.videoId;
      else {
      const {start,end}=message;
      if(!Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<=start || end-start>300)throw Error('请选择不超过 5 分钟的片段。');
      body=JSON.stringify({videoId:message.videoId,start,end});
      }
    } else {
      if(!/^[a-f0-9]{32}$/.test(message.jobId))throw Error('无效的伴奏任务。');
      path += '/'+message.jobId+(action==='audio'?'/audio':action==='cancel'?'/cancel':'');
      if(action==='cancel')body='{}';
    }
    let response;
    try {
      response=await fetcher(base+path,{method:body?'POST':'GET',body,
        headers:{'X-Echo-Client':'echo-english',...(body?{'Content-Type':'application/json'}:{})},
        credentials:'omit',redirect:'error',signal:AbortSignal.timeout(action==='audio'?30000:10000)});
    }catch{throw Error('无法连接本机伴奏服务。请在当前电脑的项目目录运行 bash karaoke/start.sh；首次使用需先按 karaoke/README.md 安装依赖。');}
    if(!response.ok){const data=await response.json();throw Error(data.error || '伴奏服务请求失败。');}
    if(action!=='audio')return await response.json();
    if(Number(response.headers.get('Content-Length'))>24*1024*1024)throw Error('伴奏文件过大，请缩短片段。');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>24*1024*1024)throw Error('伴奏文件过大，请缩短片段。');
    let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {audio:btoa(binary),mime:response.headers.get('Content-Type') || 'audio/mpeg'};
  }
  const api={request};
  if(typeof module!=='undefined')module.exports=api;else root.EchoKaraokeRelay=api;
})(globalThis);
