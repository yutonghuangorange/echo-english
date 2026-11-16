// Fixed input gain only. No automatic compression and no microphone monitoring.
(function(root){
  function clampDb(value){return Number.isFinite(value)?Math.max(0,Math.min(24,value)):0;}
  async function createInput(microphone,db=0,env=root){
    db=clampDb(db);
    if(db===0)return {stream:microphone,db,dispose(){}};
    let context,source,gain,destination,disposed=false;
    function dispose(){
      if(disposed)return;disposed=true;
      try{source?.disconnect();gain?.disconnect();}catch{}
      destination?.stream.getTracks().forEach(track=>track.stop());
      if(context)void context.close().catch(()=>{});
    }
    try{
      context=new env.AudioContext();
      source=context.createMediaStreamSource(microphone);
      gain=context.createGain();gain.gain.value=10**(db/20);
      destination=context.createMediaStreamDestination();
      source.connect(gain);gain.connect(destination);
      await context.resume();
      if(context.state==='suspended')throw Error('Audio context suspended');
      return {stream:destination.stream,db,dispose};
    }catch(error){
      dispose();throw Error('无法启用手动录音增益，请将增益设为 0 dB 后重试。',{cause:error});
    }
  }
  function supportsLossless(Recorder=root.MediaRecorder){
    return !!Recorder?.isTypeSupported?.('audio/webm;codecs=pcm');
  }
  function recordingOptions(quality,Recorder=root.MediaRecorder){
    if(!Recorder)throw Error('浏览器不支持录音，请使用新版 Chrome。');
    if(quality==='lossless'){
      if(!supportsLossless(Recorder))throw Error('当前浏览器不支持无损 PCM 录音，请选择高品质压缩。');
      return {mimeType:'audio/webm;codecs=pcm'};
    }
    const mimeType=['audio/webm;codecs=opus','audio/webm'].find(type=>Recorder.isTypeSupported?.(type));
    return {...(mimeType?{mimeType}:{}),audioBitsPerSecond:256000};
  }
  function captureSettings(stream){
    try{
      const track=stream?.getAudioTracks?.()[0] || stream?.getTracks?.()[0];
      const settings=track?.getSettings?.() || {},result={};
      for(const key of ['sampleRate','channelCount','echoCancellation','noiseSuppression','autoGainControl']){
        if(typeof settings[key]==='boolean' || typeof settings[key]==='number' && Number.isFinite(settings[key]))result[key]=settings[key];
      }
      return result;
    }catch{return {};}
  }
  function describeRecording(info){
    if(!info)return '旧录音未保存采集参数，无法确认当时的码率和麦克风处理设置。';
    const pcm=/codecs\s*=\s*["']?pcm\b/i.test(info.mimeType || '');
    const parts=[pcm?'无损 PCM · WebM':`压缩录音 · ${info.mimeType || '格式未知'}`];
    // MediaRecorder reports an Opus encoding target, not the measured file bitrate.
    // Its PCM audioBitsPerSecond can be a meaningless default: never show it as PCM's rate.
    if(!pcm && info.audioBitsPerSecond>0)parts.push(`编码目标 ${Math.round(info.audioBitsPerSecond/1000)} kbps`);
    const mic=info.microphone || {},encoded=info.encodingInput || {};
    const format=settings=>[settings.sampleRate?`${settings.sampleRate/1000} kHz`:'',settings.channelCount?`${settings.channelCount} 声道`:''].filter(Boolean).join(' · ');
    if(format(mic))parts.push(`麦克风：${format(mic)}`);
    if(format(encoded))parts.push(`编码输入：${format(encoded)}`);
    const processing=[['echoCancellation','回声消除'],['noiseSuppression','降噪'],['autoGainControl','自动增益']].map(([key,label])=>`${label}${typeof mic[key]==='boolean'?(mic[key]?'开':'关'):'未知'}`);
    parts.push(processing.join(' · '));
    return parts.join('\n');
  }
  const api={clampDb,createInput,supportsLossless,recordingOptions,captureSettings,describeRecording};
  if(typeof module!=='undefined')module.exports=api;else root.EchoMicrophone=api;
})(globalThis);
