(function(root) {
  const base = 'http://127.0.0.1:8765';
  async function request(message, sender, fetcher = fetch) {
    const url = new URL(sender.tab?.url || 'https://invalid.local/');
    if(url.origin !== 'https://www.youtube.com')throw Error('请在 YouTube 视频页使用伴奏功能。');
    const action = message.action;
    if(!['health','start','cached','status','audio','cancel','models','model-install','model-cancel','model-remove'].includes(action))throw Error('无效的伴奏操作。');
    let path = '/jobs', body;
    if(action === 'start' || action === 'cached') {
      if(url.pathname !== '/watch')throw Error('请在 YouTube 视频页使用伴奏功能。');
      if(message.videoId !== url.searchParams.get('v') || !/^[\w-]{11}$/.test(message.videoId))throw Error('视频已切换，请重新生成伴奏。');
      if(action==='cached')path='/backings/'+message.videoId;
      else {
      const {start,end}=message;
      if(!Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<=start || end-start>600)throw Error('请选择不超过 10 分钟的片段。');
      if(message.model!==undefined && !['demucs-htdemucs','bandit-v2-multi'].includes(message.model))throw Error('不支持的分离模型。');
      body=JSON.stringify({videoId:message.videoId,start,end,...(message.model && message.model!=='demucs-htdemucs'?{model:message.model}:{})});
      }
    } else if(action==='health')path='/health';
    else if(action==='models')path='/models';
    else if(action.startsWith('model-')){
      if(!['demucs-htdemucs','bandit-v2-multi'].includes(message.model))throw Error('不支持的分离模型。');
      path='/models/'+message.model+'/'+action.slice(6);body='{}';
    }
    else {
      if(!/^[a-f0-9]{32}$/.test(message.jobId))throw Error('无效的伴奏任务。');
      path += '/'+message.jobId+(action==='audio'?'/audio':action==='cancel'?'/cancel':'');
      if(action==='cancel')body='{}';
    }
    let response;
    try {
      response=await fetcher(base+path,{method:body?'POST':'GET',body,
        headers:{'X-Echo-Client':'echo-english',...(body?{'Content-Type':'application/json'}:{})},
        credentials:'omit',redirect:'error',signal:AbortSignal.timeout(action==='audio'?30000:10000)});
    }catch{throw Error('无法连接本机伴奏服务，伴奏尚未开始生成。请在项目根目录运行 bash start-karaoke.sh（Windows 使用 start-karaoke.ps1，详见伴奏安装说明），保持终端开启，再点击“重新检测”。安装扩展不会自动安装本机服务。');}
    if(!response.ok){if(action==='models' && response.status===404)throw Error('当前服务不支持模型管理。请在终端停止旧服务，重新运行根目录启动脚本，再刷新状态。');const data=await response.json();throw Error(/0–300 秒/.test(data.error || '')?'当前运行的是旧版伴奏服务。请在服务终端按 Ctrl+C，再运行 ./start-karaoke.sh（Windows 使用 start-karaoke.ps1），然后重新检测。':data.error || '伴奏服务请求失败。');}
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
