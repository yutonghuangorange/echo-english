// Read-only microphone visualizer. The original stream still goes straight to MediaRecorder.
(function(root){
  function measure(samples){
    let sum=0,peak=0;
    for(const value of samples){sum+=value*value;peak=Math.max(peak,Math.abs(value));}
    const rms=samples.length?Math.sqrt(sum/samples.length):0;
    const db=value=>Math.max(-60,Math.min(0,20*Math.log10(Math.max(value,0.001))));
    return {rms,peak,rmsDb:db(rms),peakDb:db(peak)};
  }
  function start({stream,container,canvas,value,bar,env=root}){
    let context,source,analyser,frame=0,disposed=false,paused=false,lastPaint=-Infinity,lastLabel=-Infinity,clipUntil=-Infinity;
    const history=new Array(80).fill(0),ctx=canvas.getContext('2d');
    container.hidden=false;
    value.textContent='正在检测…';bar.style.width='0%';container.dataset.level='normal';
    function cleanup(){
      if(disposed)return;disposed=true;env.cancelAnimationFrame?.(frame);
      try{source?.disconnect();analyser?.disconnect();}catch{}
      if(context)void context.close().catch(()=>{});
      container.hidden=true;
    }
    function unavailable(){
      if(disposed)return;
      env.cancelAnimationFrame?.(frame);
      try{source?.disconnect();analyser?.disconnect();}catch{}
      if(context){void context.close().catch(()=>{});context=null;}
      canvas.hidden=true;value.textContent='音量显示不可用';bar.style.width='0%';
    }
    const api={dispose:cleanup,setPaused(state){paused=!!state;lastLabel=-Infinity;}};
    try{
      if(!ctx)throw Error('Canvas unavailable');
      context=new env.AudioContext();
      source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();
      analyser.fftSize=1024;source.connect(analyser); // Never connect the microphone to speakers.
      const samples=new Float32Array(analyser.fftSize);
      canvas.hidden=false;
      function tick(now){
        if(disposed)return;
        if(now-lastPaint>=50){
          lastPaint=now;
          try{
            if(context.state==='suspended'){
              value.textContent='等待音频设备…';bar.style.width='0%';
            }else{
              if(paused)samples.fill(0);else analyser.getFloatTimeDomainData(samples);
              const level=measure(samples);
              if(!paused && level.peak>=0.98)clipUntil=now+1200;
              const clipped=!paused && now<clipUntil;
              const state=clipped?'clip':level.peak>=0.85?'loud':'normal';
              container.dataset.level=state;
              const color=clipped?'#ff8e88':state==='loud'?'#e8bd78':'#b3eedb';
              if(!paused){history.shift();history.push(Math.min(1,Math.max(0,(level.rmsDb+60)/60)));}
              const width=canvas.width,height=canvas.height,mid=height/2;
              ctx.clearRect(0,0,width,height);ctx.fillStyle='#30414e';ctx.fillRect(0,mid,width,1);
              ctx.fillStyle=color;
              history.forEach((n,i)=>{const h=Math.max(1,n*(height-4));ctx.fillRect(i*width/history.length,mid-h/2,Math.max(1,width/history.length-2),h);});
              bar.style.width=`${paused?0:(level.rmsDb+60)/60*100}%`;
              if(now-lastLabel>=200){
                lastLabel=now;
                value.textContent=paused?'缓冲中 · 录音暂停':`${level.peakDb<=-60?'≤−60':Math.round(level.peakDb)} dBFS · ${clipped?'接近过载，请离麦克风远些':state==='loud'?'偏大':level.peak<0.02?'较轻':'正常'}`;
                bar.parentElement?.setAttribute('aria-valuenow',String(Math.round(level.rmsDb)));
              }
            }
          }catch{unavailable();return;}
        }
        frame=env.requestAnimationFrame(tick);
      }
      // Do not await the audio context: visualization must never delay recording.
      Promise.resolve(context.resume()).then(()=>{if(!disposed)frame=env.requestAnimationFrame(tick);},unavailable);
    }catch{unavailable();}
    return api;
  }
  const api={measure,start};
  if(typeof module!=='undefined')module.exports=api;else root.EchoLiveMeter=api;
})(globalThis);
