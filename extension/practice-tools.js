(function(root){
  const presets={
    headphones:{activity:'speech',scope:'clip',backing:false,echo:false,gain:false,lead:'seconds'},
    movie:{activity:'speech',scope:'clip',backing:true,echo:false,gain:false,lead:'seconds'},
    song:{activity:'sing',scope:'whole',backing:true,echo:false,gain:false,lead:'none'},
    speaker:{activity:'speech',scope:'clip',backing:false,echo:true,gain:true,lead:'seconds',sidetone:false}
  };
  function shortcut(event){
    if(!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing)return null;
    const target=event.composedPath?.()[0] || event.target;
    if(target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target?.tagName) || target?.closest?.('[contenteditable="true"],[role="textbox"]'))return null;
    return {KeyR:'record',KeyO:'original',KeyP:'replay',ArrowLeft:'prev',ArrowRight:'next',KeyC:'compare',Slash:'help'}[event.code] || null;
  }
  function attach({view,doc=root.document,env=root,getSettings,onPreset,onConfigure,onBeforeTest=()=>{},onClose=()=>{},recording=root.EchoRecording,meter=root.EchoLiveMeter}){
    const $=id=>view.getElementById(id),dialog=$('toolsDialog'),audio=$('micTestAudio');
    let session=null,revision=0,timer=null,url=null;
    function isOpen(){return !!dialog.open;}
    function clearAudio(){audio.pause?.();audio.removeAttribute('src');audio.load?.();audio.hidden=true;if(url)env.URL.revokeObjectURL(url);url=null;}
    function render(running=false){$('micTestStart').disabled=running;$('micTestStop').hidden=!running;$('micTestConfigure').disabled=running;for(const id of ['presetHeadphones','presetMovie','presetSong','presetSpeaker'])$(id).disabled=running;}
    function cancel(){revision++;env.clearTimeout(timer);timer=null;const previous=session;session=null;previous?.pauseFeedback();void previous?.stop();clearAudio();$('testMeter').hidden=true;render();}
    function close(){cancel();if(dialog.close)dialog.close();else dialog.open=false;$('openPreparation').focus();onClose();}
    function open(section='preset'){
      if(!isOpen()){if(dialog.showModal)dialog.showModal();else dialog.open=true;}
      $('micTestSettings').textContent=getSettings().description;
      $('micTestMessage').textContent='';render(!!session);
      if(section==='help'){$('shortcutHelp').open=true;$('shortcutHelp').scrollIntoView?.({block:'start'});}
      else $(section==='mic'?'micTestSection':'presetSection').scrollIntoView?.({block:'start'});
      $(section==='mic'?'micTestStart':section==='help'?'shortcutHelp':'presetHeadphones').focus();
    }
    $('closeTools').onclick=close;dialog.oncancel=event=>{event.preventDefault();close();};
    for(const [id,name] of Object.entries({presetHeadphones:'headphones',presetMovie:'movie',presetSong:'song',presetSpeaker:'speaker'}))$(id).onclick=()=>{if(session)return;onPreset(presets[name]);close();};
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
    return {open,close,isOpen};
  }
  const api={presets,shortcut,attach};if(typeof module!=='undefined')module.exports=api;else root.EchoPracticeTools=api;
})(globalThis);
