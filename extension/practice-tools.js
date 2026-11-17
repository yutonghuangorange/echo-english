(function(root){
  function recommend({activity='speech',backing=false,listening='headphones',quality='high',sidetone=false}={}){
    const singing=activity==='sing',speakers=listening==='speakers';
    return {activity:singing?'sing':'speech',scope:singing?'whole':'clip',backing:!!backing,
      echo:speakers,gain:speakers && !singing,sidetone:!speakers && !!sidetone,
      quality:quality==='lossless'?'lossless':'high',lead:singing?'none':'seconds'};
  }
  function shortcut(event){
    if(!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing)return null;
    const target=event.composedPath?.()[0] || event.target;
    if(target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target?.tagName) || target?.closest?.('[contenteditable="true"],[role="textbox"]'))return null;
    return {KeyR:'record',KeyO:'original',KeyP:'replay',ArrowLeft:'prev',ArrowRight:'next',KeyC:'compare',Slash:'help'}[event.code] || null;
  }
  function attach({view,doc=root.document,env=root,getSettings,onApply,onUndo=()=>false,onContinue=()=>{},onConfigure,onBeforeTest=()=>{},onClose=()=>{},recording=root.EchoRecording,meter=root.EchoLiveMeter}){
    const $=id=>view.getElementById(id),dialog=$('toolsDialog'),audio=$('micTestAudio');
    let session=null,revision=0,timer=null,url=null,initialized=false,applied=false;
    const wizardInputs=['wizardActivity','wizardSongBacking','wizardSpeechBacking','wizardListening','wizardQuality','wizardSidetone'];
    function isOpen(){return !!dialog.open;}
    function clearAudio(){audio.pause?.();audio.removeAttribute('src');audio.load?.();audio.hidden=true;if(url)env.URL.revokeObjectURL(url);url=null;}
    function render(running=false){$('micTestStart').disabled=running;$('micTestStop').hidden=!running;$('micTestConfigure').disabled=running;for(const id of [...wizardInputs,'wizardApply','wizardUndo','wizardContinue'])$(id).disabled=running;
      $('wizardApply').disabled=running || applied;
      if(!running)$('wizardSidetone').disabled=$('wizardListening').value==='speakers';}
    function cancel(){revision++;env.clearTimeout(timer);timer=null;const previous=session;session=null;previous?.pauseFeedback();void previous?.stop();clearAudio();$('testMeter').hidden=true;render();}
    function clearApplied(){applied=false;$('wizardApply').disabled=false;$('wizardUndo').hidden=true;$('wizardContinue').hidden=true;$('wizardMessage').textContent='';}
    function resetSetup(){initialized=false;clearApplied();}
    function close(){cancel();clearApplied();if(dialog.close)dialog.close();else dialog.open=false;$('openPreparation').focus();onClose();}
    function open(section='setup'){
      if(!isOpen()){if(dialog.showModal)dialog.showModal();else dialog.open=true;}
      const current=getSettings();
      $('wizardLossless').disabled=current.losslessSupported===false;
      if(!initialized){
        $('wizardActivity').value=current.activity==='sing'?'sing':'speech';
        $('wizardQuality').value=current.quality==='lossless' && current.losslessSupported!==false?'lossless':'high';
        initialized=true;renderRecommendation();
      }
      $('micTestSettings').textContent='当前设置：'+current.description;
      $('openPreparation').textContent='练习准备';
      try{(env.localStorage || env.window?.localStorage)?.setItem('echo-setup-discovered-v1','true');}catch{}

      $('micTestMessage').textContent='';render(!!session);
      if(section==='help'){$('shortcutHelp').open=true;$('shortcutHelp').scrollIntoView?.({block:'start'});}
      else $(section==='mic'?'micTestSection':'setupSection').scrollIntoView?.({block:'start'});
      $(section==='mic'?'micTestStart':section==='help'?'shortcutHelp':'wizardActivity').focus();
    }
    $('closeTools').onclick=close;dialog.oncancel=event=>{event.preventDefault();close();};
    function recommendation(){return recommend({activity:$('wizardActivity').value,
      backing:($('wizardActivity').value==='sing'?$('wizardSongBacking'):$('wizardSpeechBacking')).value==='yes',
      listening:$('wizardListening').value,quality:$('wizardQuality').value,sidetone:$('wizardSidetone').checked});}
    function renderRecommendation(){
      const p=recommendation(),singing=p.activity==='sing',speakers=$('wizardListening').value==='speakers';
      $('wizardSongRow').hidden=!singing;$('wizardSpeechRow').hidden=singing;
      $('wizardSidetone').disabled=speakers;$('wizardSidetoneRow').hidden=speakers;
      $('wizardSummary').textContent=[`${singing?'唱歌 · 整首':'配音 · 当前片段'} · ${p.backing?(singing?'使用伴奏':'保留背景音'):(singing?'清唱':'仅录人声')}`,
        `回声消除：${p.echo?'开启':'关闭'}　自动增益：${p.gain?'开启':'关闭'}`,
        `耳返：${p.sidetone?'开启':'关闭'}　保存：${p.quality==='lossless'?'无损 PCM':'高品质压缩'}`,
        `${p.lead==='seconds'?'前置播放：3 秒':'前置播放：关闭'}`].join('\n');
      $('wizardHint').textContent=(p.backing?'伴奏／背景音需本机分离服务；应用后可前往准备，不会自动安装或下载。':'录音时只录自己的人声，无需分离服务。')+(speakers?(singing?'外放已关闭耳返；唱歌时回声消除可能影响音质，建议优先戴耳机。':'外放已关闭耳返；回声消除与自动增益可在录音设置中调整。'):'耳返可选，开启后会听到少量延迟。');
    }
    for(const id of wizardInputs)$(id).onchange=()=>{renderRecommendation();applied=false;$('wizardApply').disabled=false;if(!$('wizardUndo').hidden){$('wizardMessage').textContent='推荐已更新，点击应用后生效。';$('wizardContinue').hidden=true;}};
    $('wizardApply').onclick=()=>{
      if(session || applied)return;
      const result=onApply(recommendation());if(!result)return;
      applied=true;$('wizardApply').disabled=true;clearAudio();$('wizardMessage').textContent=result.message;
      $('wizardContinue').textContent=result.nextLabel;$('wizardContinue').hidden=false;$('wizardUndo').hidden=false;
      $('micTestSettings').textContent='当前设置：'+getSettings().description;
    };
    $('wizardUndo').onclick=()=>{
      if(session || !onUndo())return;
      applied=false;$('wizardApply').disabled=false;clearAudio();$('wizardApply').focus();$('wizardMessage').textContent='已撤销本次设置。';$('wizardUndo').hidden=true;$('wizardContinue').hidden=true;
      $('micTestSettings').textContent='当前设置：'+getSettings().description;
    };
    $('wizardContinue').onclick=()=>{if(session)return;close();onContinue();};
    for(const [id,value] of Object.entries({wizardActivity:'speech',wizardSongBacking:'yes',wizardSpeechBacking:'no',wizardListening:'headphones',wizardQuality:'high'}))$(id).value=value;
    $('wizardSidetone').checked=false;$('wizardUndo').hidden=true;$('wizardContinue').hidden=true;
    renderRecommendation();
    try{if((env.localStorage || env.window?.localStorage)?.getItem('echo-setup-discovered-v1')!=='true')$('openPreparation').textContent='帮我设置';}catch{}
    $('micTestConfigure').onclick=()=>{close();onConfigure();};
    $('micTestStart').onclick=async()=>{
      if(session || !isOpen())return;
      clearAudio();const token=++revision;let captureError='';render(true);$('micTestMessage').textContent='正在打开麦克风…';
      try{
        onBeforeTest();
        const settings=getSettings();
        const current=recording.create({...settings,env,active:()=>token===revision && isOpen(),
          createMeter:stream=>meter.start({stream,container:$('testMeter'),canvas:$('testMeterCanvas'),value:$('testMeterValue'),bar:$('testMeterBar'),env}),
          onError:error=>{captureError=error.message;if(token===revision)$('micTestMessage').textContent=captureError;},
          onComplete:result=>{
            if(token!==revision || !isOpen())return;
            env.clearTimeout(timer);timer=null;session=null;render();
            if(result?.blob?.size){url=env.URL.createObjectURL(result.blob);audio.src=url;audio.hidden=false;}
            $('micTestMessage').textContent=captureError || (result?.blob?.size?'试音完成，点击播放器回听。关闭弹窗即丢弃。':'没有收到录音数据，请检查麦克风后重新试音。');
          }
        });
        session=current;
        if(!await current.prepare() || token!==revision)return;
        if(current.start()){
          current.startMeter();$('micTestMessage').textContent='正在试音 · 10 秒后自动结束，请用平时的音量说话或唱歌。';
          timer=env.setTimeout(()=>{if(token===revision)void current.stop();},10000);
        }
      }catch(error){if(token===revision){cancel();$('micTestMessage').textContent=error.message || '无法试音，请检查麦克风权限。';}}
    };
    $('micTestStop').onclick=()=>{if(!session)return;$('micTestStop').disabled=true;const result=session.stop();Promise.resolve(result).finally(()=>{$('micTestStop').disabled=false;});return result;};
    render();$('testMeter').hidden=true;audio.hidden=true;
    return {open,close,isOpen,resetSetup};
  }
  const api={recommend,shortcut,attach};if(typeof module!=='undefined')module.exports=api;else root.EchoPracticeTools=api;
})(globalThis);
