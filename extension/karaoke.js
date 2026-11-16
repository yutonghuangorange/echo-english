(function(root) {
  function key(videoId, range) {return `${videoId}:${Number(range.start).toFixed(3)}:${Number(range.end).toFixed(3)}`;}
  function covers(backing, videoId, range) {return !!backing && backing.videoId===videoId && range.start>=backing.start-0.001 && range.end<=backing.end+0.001;}
  function progressText(job) {
    const clock=seconds=>{const n=Math.max(0,Math.round(seconds));return `${Math.floor(n/60)}分${String(n%60).padStart(2,'0')}秒`;};
    const stages={queued:'等待处理',downloading:'提取视频音频',converting:'整理音频片段',separating:'去掉原唱',encoding:'压缩并保存伴奏',ready:'伴奏已生成，正在加载'};
    let text=stages[job.state] || '准备伴奏';
    if(job.state==='separating')text=job.modelDownloading?'首次准备 · 正在下载分离模型，请保持本机服务运行':text+(Number.isFinite(job.progress)?` ${job.progress}%`:' · 正在加载模型或准备分离');
    if(Number.isFinite(job.elapsedSeconds))text+=` · 已用 ${clock(job.elapsedSeconds)}`;
    if(job.state==='separating' && Number.isFinite(job.remainingSeconds))text+=` · 本阶段预计剩余 ${clock(job.remainingSeconds)}`;
    return text;
  }
  function blobFromBase64(value) {
    const bytes=Uint8Array.from(atob(value.audio),c=>c.charCodeAt(0));
    return new Blob([bytes],{type:value.mime});
  }
  // Mix only the accompaniment into speakers, but both microphone and music into
  // the recording. A saved take is self-contained and replays without the service.
  async function createMix({blob,mic,video,start,speed,volume=0.65}, env=root) {
    const context=new env.AudioContext();
    const url=env.URL.createObjectURL(blob), music=new env.Audio(url);
    let disposed=false;
    const cleanup=()=>{
      if(disposed)return;disposed=true;music.pause();music.removeAttribute('src');music.load();
      env.URL.revokeObjectURL(url);void context.close().catch(()=>{});
    };
    try {
      music.preload='auto';music.playbackRate=speed;music.preservesPitch=true;
      const destination=context.createMediaStreamDestination();
      const backing=context.createMediaElementSource(music), gain=context.createGain();gain.gain.value=volume;
      backing.connect(gain);gain.connect(context.destination);gain.connect(destination);
      const voice=context.createMediaStreamSource(mic), voiceGain=context.createGain();voiceGain.gain.value=0.85;
      voice.connect(voiceGain);voiceGain.connect(destination);
      const ready=new Promise((resolve,reject)=>{
        const timeout=env.setTimeout(()=>reject(Error('伴奏加载超时，请重新生成。')),10000);
        music.onloadedmetadata=()=>{env.clearTimeout(timeout);resolve();};
        music.onerror=()=>{env.clearTimeout(timeout);reject(Error('伴奏无法解码，请重新生成。'));};
      });
      music.load();await Promise.all([ready,context.resume()]);
      return {stream:destination.stream,
        async sync(){if(disposed)return;music.currentTime=Math.max(0,video.currentTime-start);await music.play();},
        pause(){music.pause();},dispose:cleanup};
    }catch(error){cleanup();throw error;}
  }
  const api={key,covers,progressText,blobFromBase64,createMix};
  if(typeof module!=='undefined')module.exports=api;else root.EchoKaraoke=api;
})(globalThis);
