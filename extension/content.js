(() => {
  if (document.getElementById('echo-practice-host')) return;
  const host = document.createElement('div');
  host.id = 'echo-practice-host';
  host.style.cssText = 'position:fixed;right:20px;top:80px;z-index:2147483647;display:none;';
  document.documentElement.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = EchoPanelView.html;
  const $ = id => root.getElementById(id);
  EchoPanelSize.attach({panel:$('panel'),host,handle:$('resizePanel'),moveHandle:$('movePanel'),env:window});
  let cues = [], index = -1, take = null, mode = 'idle', generation = 0,clipRangeAdjusted=false;
  let recordingSession = null, audio = null, savedVideo = null;
  const playback = EchoPlayback.create();
  const transport = EchoTransport.create({
    container: $('transport'), slider: $('transportProgress'),
    label: $('transportLabel'), time: $('transportTime'),
    onError: error => { stop(); status(error.message || String(error)); }
  });
  let activity = 'speech';
  let backingPreferences={speech:false,sing:true};
  let scopePreferences={speech:'clip',sing:'whole'};
  let qualityPreferences={speech:'standard',sing:'standard'};
  let modelPreferences={speech:EchoKaraoke.DEFAULT_MODEL,sing:EchoKaraoke.DEFAULT_MODEL};
  let paragraphFirst=0,paragraphLast=1,assemblyChoices=[],assemblyContext=null;
  let recordingQuality='high',inputDeviceId='',sidetoneEnabled=false,sidetoneVolume=0.35,sidetoneMode='minimum';
  let inputDeviceRequest=0,inputDeviceList=[];
  const microphonePreferenceKey='echo-microphone-v1';
  const echoPreferences={speech:true,sing:false};
  const gainPreferences={speech:true,sing:false};
  const manualGainPreferences={speech:0,sing:0};
  try {
    const saved=JSON.parse(window.localStorage.getItem(microphonePreferenceKey));
    sidetoneEnabled=saved?.sidetoneEnabled===true;
    if(['standard','minimum'].includes(saved?.sidetoneMode))sidetoneMode=saved.sidetoneMode;
    sidetoneVolume=EchoMicrophone.clampMonitorVolume(saved?.sidetoneVolume);
    if(typeof saved?.inputDeviceId==='string')inputDeviceId=saved.inputDeviceId;
    if(saved?.recordingQuality==='lossless')recordingQuality='lossless';
    for(const key of ['speech','sing']){
      if(typeof saved?.[key]==='boolean')echoPreferences[key]=saved[key];
      if(typeof saved?.autoGainControl?.[key]==='boolean')gainPreferences[key]=saved.autoGainControl[key];
      manualGainPreferences[key]=EchoMicrophone.clampDb(saved?.manualGainDb?.[key]);
    }
  } catch {} // Recording remains available when local preferences are blocked.
  function microphoneConstraints(song=isSinging()) {
    const key=song?'sing':'speech';
    const echoCancellation=echoPreferences[key],autoGainControl=gainPreferences[key];
    // Singing keeps noise suppression off; echo cancellation and automatic
    // gain are independent user preferences shared by all recording paths.
    return {...(song?{echoCancellation,noiseSuppression:false,autoGainControl}:{echoCancellation,autoGainControl}),...(inputDeviceId?{deviceId:{exact:inputDeviceId}}:{}),...(sidetoneEnabled?{latency:{ideal:0}}:{})};
  }
  function saveMicrophonePreferences(){
    try {window.localStorage.setItem(microphonePreferenceKey,JSON.stringify({...echoPreferences,autoGainControl:gainPreferences,manualGainDb:manualGainPreferences,recordingQuality,inputDeviceId,sidetoneEnabled,sidetoneVolume,sidetoneMode}));}
    catch {status('录音设置已调整，但无法保存；刷新后将恢复原来的设置。');}
  }
  function renderMicrophoneSettings(){
    const losslessSupported=EchoMicrophone.supportsLossless(globalThis.MediaRecorder);
    $('sidetoneEnabled').checked=sidetoneEnabled;
    const processing=[echoPreferences[activity]?'回声消除':'',gainPreferences[activity]?'自动增益':''].filter(Boolean);
    const warn=sidetoneEnabled && processing.length>0;
    $('sidetoneProcessingNotice').hidden=!warn;
    $('sidetoneProcessingWarning').hidden=!warn;
    $('sidetoneProcessingWarning').textContent=warn?`耳返与${processing.join('、')}同时开启，可能使人声断续或音量起伏。戴耳机时建议关闭下方对应处理，下次录音生效。`:'';
    $('sidetoneMode').value=sidetoneMode;
    $('sidetoneModeRow').hidden=!sidetoneEnabled;
    $('sidetoneVolume').value=sidetoneVolume;
    $('sidetoneLiveVolume').value=sidetoneVolume;
    $('sidetoneVolumeValue').textContent=$('sidetoneLiveValue').textContent=`${Math.round(sidetoneVolume*100)}%`;
    $('sidetoneVolumeRow').hidden=!sidetoneEnabled;
    $('recordingQuality').value=recordingQuality;
    // Keep a saved selection visible even on a browser without support; never
    // silently save a compressed take that the user believes is lossless.
    $('losslessQuality').disabled=!losslessSupported;
    $('recordingQualityHint').textContent=recordingQuality==='lossless'?(losslessSupported?'无损 PCM 保留编码输入，文件明显更大；仍受麦克风和录音处理影响。原始下载为 WebM。':'当前浏览器不支持无损 PCM，请改选高品质压缩后录音。'):'Opus 编码目标 256 kbps，文件较小。仅对新录音生效；无损也无法修复麦克风或回声消除造成的失真。';
    $('echoCancellation').checked=echoPreferences[activity];
    $('autoGainControl').checked=gainPreferences[activity];
    $('manualGainRow').hidden=gainPreferences[activity];
    $('manualGainDb').value=manualGainPreferences[activity];
    $('manualGainValue').textContent=`+${manualGainPreferences[activity]} dB`;
    updateSettingsSummaries();
  }
  function renderInputDevices(){
    const options=[['','系统默认麦克风'],...inputDeviceList.map(device=>[device.id,device.label])];
    const missing=inputDeviceId && !inputDeviceList.some(device=>device.id===inputDeviceId);
    if(missing)options.push([inputDeviceId,'已选麦克风（未连接或尚未授权）']);
    $('inputDevice').replaceChildren(...options.map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));
    $('inputDevice').value=inputDeviceId;
    $('inputDeviceHint').textContent=missing?'所选设备尚未检测到。请连接设备并授权检测，或改用系统默认；不会自动换用其他麦克风。':inputDeviceList.some(device=>device.named)?'选择后下次录音生效；配音与唱歌共用此输入设备。':'首次点击「授权并检测」可显示设备名称。检测后立即释放麦克风。';
  }
  async function refreshInputDevices(){
    const devices=globalThis.navigator?.mediaDevices;
    if(!devices?.enumerateDevices)return;
    const request=++inputDeviceRequest;
    try{const list=await EchoMicrophone.listInputs(devices);if(request===inputDeviceRequest){inputDeviceList=list;renderInputDevices();}}
    catch{if(request===inputDeviceRequest)$('inputDeviceHint').textContent='无法读取设备列表，请检查浏览器麦克风权限后重新检测。';}
  }
  $('inputDevice').onchange=()=>{
    if(mode==='idle'){inputDeviceId=$('inputDevice').value;saveMicrophonePreferences();}
    renderInputDevices();
  };
  $('detectInputs').onclick=guarded(async()=>{
    if(mode!=='idle')return;
    const token=++generation;mode='permission';controls();status('正在请求麦克风权限以检测输入设备…');
    const mic=await EchoMicrophone.requestStream(navigator.mediaDevices,{echoCancellation:true});
    mic.getTracks().forEach(track=>track.stop());
    if(token!==generation)return;
    await refreshInputDevices();
    if(token===generation){mode='idle';controls();status('设备列表已更新，检测用麦克风已释放。');}
  });
  const onInputDevicesChanged=()=>{void refreshInputDevices();};
  globalThis.navigator?.mediaDevices?.addEventListener?.('devicechange',onInputDevicesChanged);
  renderInputDevices();
  $('useHeadphoneSettings').onclick=()=>{
    if(mode!=='idle')return;
    echoPreferences[activity]=false;gainPreferences[activity]=false;
    status(`已关闭${isSinging()?'唱歌':'配音'}的回声消除和自动增益，手动增益保持 +${manualGainPreferences[activity]} dB；下次录音生效。`);
    saveMicrophonePreferences();renderMicrophoneSettings();$('sidetoneEnabled').focus();
  };
  $('sidetoneMode').onchange=()=>{
    if(mode==='idle'){sidetoneMode=$('sidetoneMode').value==='minimum'?'minimum':'standard';saveMicrophonePreferences();}
    renderMicrophoneSettings();
  };
  $('sidetoneEnabled').onchange=()=>{
    if(mode==='idle'){sidetoneEnabled=$('sidetoneEnabled').checked;saveMicrophonePreferences();}
    renderMicrophoneSettings();
  };
  for(const id of ['sidetoneVolume','sidetoneLiveVolume'])$(id).oninput=()=>{
    sidetoneVolume=EchoMicrophone.clampMonitorVolume(Number($(id).value));
    recordingSession?.setSidetoneVolume(sidetoneVolume);renderMicrophoneSettings();
  };
  for(const id of ['sidetoneVolume','sidetoneLiveVolume'])$(id).onchange=saveMicrophonePreferences;
  $('recordingQuality').onchange=()=>{if(mode==='idle'){recordingQuality=$('recordingQuality').value==='lossless'?'lossless':'high';saveMicrophonePreferences();}renderMicrophoneSettings();};
  for(const [id,preferences] of [['echoCancellation',echoPreferences],['autoGainControl',gainPreferences]]){
    $(id).onchange=()=>{
      if(mode==='idle'){preferences[activity]=$(id).checked;saveMicrophonePreferences();}
      renderMicrophoneSettings();
    };
  }
  $('manualGainDb').oninput=()=>{
    if(mode==='idle' && !gainPreferences[activity])manualGainPreferences[activity]=EchoMicrophone.clampDb(Number($('manualGainDb').value));
    renderMicrophoneSettings();
  };
  $('manualGainDb').onchange=()=>{if(mode==='idle')saveMicrophonePreferences();};
  let captionTracks=[],captionListRequest=0,captionSource='auto',captionSourceName='',loadedCaptionSource='';
  const captionClient=EchoCaptionTracks.createClient();
  let captionVideo = null, captionSignature = '', captionGhost = null;
  const captionEvents = ['timeupdate','seeking','seeked','play','pause','ended'];
  let savedBackings = [], activeKaraokeJob = null, songTake = null;
  let backingRestoreRequest=0, restoringBacking=false, karaokeIssue='';
  let backingOutput=null;
  let replayMonitor=null, replayVoiceOutput=null, replayTake=null, replayBackingReady=false, replayVoiceMax=2;
  for(const id of ['replayVocalVolume','replayBackingVolume'])$(id).value=1;
  $('mixControls').open=false;
  $('replayWithBacking').checked=true;
  $('replayWithBacking').onchange=()=>{replayMonitor?.setEnabled($('replayWithBacking').checked);renderMixControls();saveProgress();};
  let serviceState='unknown',serviceCheck=null,serviceMaxSeconds=null,modelManagement=false,serviceAccelerator={},serviceLossless=false;
  let wordRequest = 0, selectedWord = null, analysisRequest = 0;
  let videoId = currentId();
  let savedTitle = '';
  const storage = EchoStorage.createStorage();
  const library=EchoLibrary.attach({view:root,storage,doc:document,env:globalThis,onChange:async imported=>{
    void refreshFavorite();if(imported && videoId){await loadVideo(videoId);return;}
    const id=videoId;if(!id)return;
    const values=await storage.listBackings(id);if(id!==videoId)return;
    savedBackings=values;deletedTake=null;$('undoDelete').hidden=true;
    await refreshHistory(take?.id);controls();
  }});
  const models=EchoModels.attach({view:root,doc:document,request:karaokeRequest,onCatalog:()=>updateBackingControls()});
  const assembly=EchoAssembly.attach({view:root,doc:document,env:globalThis,
    onChange:choices=>{assemblyChoices=choices;saveProgress();controls();},
    onClose:()=>{assemblyContext=null;if(mode==='assembly'){mode='idle';controls();}},
    onRender:async options=>{
      const context=assemblyContext;if(!context)throw Error('拼接界面已关闭。');
      const active=()=>options.active() && context.token===generation && context.id===videoId;
      if(!active())throw Error('已取消拼接。');
      const backing=options.withMusic?backingFor({start:options.origin,end:options.origin+options.duration}):null;
      if(options.withMusic && !backing)throw Error('请先生成覆盖试听或下载范围的伴奏；混合整首需整首伴奏。');
      return EchoAudioExport.render({takes:context.takes,selection:options.selection,duration:options.duration,origin:options.origin,backing,...context.mix,active});
    },
    onDownload:blob=>{if(assemblyContext?.id===videoId)downloadAudio(blob,EchoAudioExport.filename({title:assemblyContext.title,videoId,start:0,end:assemblyContext.duration,assembled:true,kind:$('assemblyType').value==='mixed'?'mixed':'vocals',extension:'wav'}));}
  });
  $('openLibrary').onclick=()=>{if(mode!=='idle')return;saveProgress();return library.open();};
  let videoHistory = [], historyRequest = 0, restoring = true, progressWarning = false, deletedTake = null;
  let currentPage='practice', returnFocus=null;
  const pageNames = ['practice','transcript','recordings'];
  function showPage(name, focus = false) {
    if (!pageNames.includes(name)) return;
    currentPage=name;
    for (const page of pageNames) {
      const selected = page === name;
      $('page-'+page).hidden = !selected;
      $('tab-'+page).setAttribute('aria-selected', String(selected));
      $('tab-'+page).tabIndex = selected ? 0 : -1;
    }
    if (focus) $('tab-'+name).focus();
    root.querySelector('.pages').scrollTop = 0;
    if(name==='recordings'){ if(!take && videoHistory.length)setTake(EchoPractice.recordingQueue(videoHistory)[0]);renderHistory(); }
    controls();
  }
  pageNames.forEach((name,i) => {
    $('tab-'+name).onclick = () => showPage(name);
    $('tab-'+name).onkeydown = event => {
      let next;
      if (event.key === 'ArrowRight') next = (i+1)%3;
      if (event.key === 'ArrowLeft') next = (i+2)%3;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 2;
      if (next !== undefined) { event.preventDefault(); showPage(pageNames[next],true); }
    };
  });
  const settings=EchoSettingsDialog.attach({view:root,onOpen:section=>{
    if(section==='microphone')void refreshInputDevices();
    if(section==='backing')$('settingsStatus').textContent=karaokeIssue || '';
    if(section==='captions' && !captionTracks.length && mode==='idle')void $('refreshCaptionTracks').onclick();
  }});
  $('practiceTools').onclick=()=>{if(mode==='idle')settings.open('practice','practiceTools');};
  $('settingsStop').onclick=()=>stop();
  $('practiceSettings').onclick=()=>{if(mode==='idle')settings.open('microphone','practiceSettings');};
  $('captionSettings').onclick=()=>{if(mode==='idle')settings.open('captions','captionSettings');};
  $('adjustClipBounds').onclick=()=>{if(mode!=='idle')return;settings.open('practice','adjustClipBounds');$('clipSettings').open=true;$('clipSettings').scrollIntoView?.({block:'start'});};
  let favorite=false,favoriteRequest=0,favoriteSaving=false;
  function renderFavorite(){
    $('favoriteVideo').textContent=favorite?'★':'☆';$('favoriteVideo').setAttribute('aria-label',favorite?'取消收藏当前视频':'收藏当前视频');$('favoriteVideo').title=favorite?'取消收藏当前视频':'收藏当前视频';$('favoriteVideo').setAttribute('aria-pressed',String(favorite));
    $('favoriteVideo').disabled=mode!=='idle' || !videoId || favoriteSaving;
  }
  async function refreshFavorite(){
    const id=videoId,request=++favoriteRequest;
    try{const value=id?await storage.getFavorite(id):null;if(id===videoId && request===favoriteRequest){favorite=!!value;renderFavorite();}}
    catch{if(id===videoId && request===favoriteRequest)status('收藏读取失败，请检查本地存储。');}
  }
  $('favoriteVideo').onclick=async()=>{
    if(mode!=='idle' || !videoId || favoriteSaving)return;
    const id=videoId;favoriteSaving=true;renderFavorite();
    try{
      if(favorite)await storage.deleteFavorite(id);
      else await storage.setFavorite({videoId:id,title:currentVideoTitle() || savedTitle || id,createdAt:Date.now()});
      if(id===videoId){await refreshFavorite();status(favorite?'已收藏视频，可在练习库「收藏」中找到。':'已取消收藏。');}
    }catch(error){status(error.message || '收藏保存失败。');}
    finally{favoriteSaving=false;renderFavorite();}
  };
  const tools=EchoPracticeTools.attach({view:root,doc:document,env:globalThis,recording:EchoRecording,meter:EchoLiveMeter,
    getSettings:()=>({constraints:microphoneConstraints(),gainDb:gainPreferences[activity]?0:manualGainPreferences[activity],quality:recordingQuality,sidetone:sidetoneEnabled,sidetoneVolume,sidetoneMode,
      description:`${$('inputDevice').selectedOptions?.[0]?.textContent || (inputDeviceId?'所选麦克风':'系统默认麦克风')} · ${isSinging()?'唱歌':'配音'} · ${gainPreferences[activity]?'自动增益':`增益 +${manualGainPreferences[activity]} dB`} · 回声消除${echoPreferences[activity]?'开':'关'} · 耳返${sidetoneEnabled?'开':'关'}`}),
    onBeforeTest:()=>document.querySelector('video.html5-main-video')?.pause(),
    onConfigure:()=>{settings.open('microphone','practiceSettings');$('inputDevice').focus();},
    onPreset:p=>{
      if(mode!=='idle')return;
      scopePreferences[activity]=$('practiceScope').value;backingPreferences[activity]=$('useBacking').checked;
      activity=p.activity;scopePreferences[activity]=p.scope;backingPreferences[activity]=p.backing;
      echoPreferences[activity]=p.echo;gainPreferences[activity]=p.gain;if(p.sidetone!==undefined)sidetoneEnabled=p.sidetone;
      backingRestoreRequest++;restoringBacking=false;karaokeIssue='';
      $('leadInMode').value=p.lead;$('leadInSeconds').value=3;
      renderActivity();syncParagraphBounds();chooseCurrentTake();updateSummaries();controls();saveMicrophonePreferences();saveProgress();showPage('practice');
      status('场景预设已应用，可继续调整设置或先试音。'+(p.backing?'录音前请先准备伴奏／背景音。':''));
      if(p.backing)void restoreServerBacking();
    }
  });
  $('openPresets').onclick=()=>{if(mode==='idle')tools.open('preset');};
  $('openMicTest').onclick=()=>{if(mode==='idle')tools.open('mic');};
  void refreshFavorite();
  $('openLanguageSettings').onclick=()=>{if(mode==='idle')settings.open('captions','openLanguageSettings');};
  $('backToPractice').onclick = () => showPage('practice',true);
  $('reviewReplay').onclick = () => playRecording(take);
  $('openCaptionSetup').onclick=()=>showPage('transcript',true);
  function updateSettingsSummaries(){
    $('speedSummary').textContent=`${gainPreferences[activity]?'自动增益':`增益 +${manualGainPreferences[activity]} dB`} · ${recordingQuality==='lossless'?'无损':'高品质'}${sidetoneEnabled?' · 耳返':''}`;
    $('practiceSettings').title=$('speedSummary').textContent;
    const lead=$('leadInMode').value;
    $('practiceToolsState').textContent=`${lead==='seconds'?`前置 ${$('leadInSeconds').value} 秒`:lead==='previous'?'前置上一句':'前置关闭'} · ${$('loopCount').value==='0'?'持续循环':`循环 ${$('loopCount').value} 次`}`;
    $('practiceTools').title=$('practiceToolsState').textContent;
  }
  function updateSummaries() {
    updateSettingsSummaries();
    const selection=selectionState();
    const r=selection.value?.range;
    const label=$('practiceScope').value==='whole'?(isSinging()?'整首 · ':'整段 · '):isParagraph()?`第 ${paragraphFirst+1}–${paragraphLast+1} 句 · `:'';
    $('clipSummary').textContent = r?`${label}${r.start.toFixed(1)}–${r.end.toFixed(1)} 秒`:selection.error.message;
    updateBackingControls();
  }
  function isSinging() {return activity==='sing';}
  function usesBacking() {return $('useBacking').checked;}
  function hasBackingTools(){return isSinging() || usesBacking();}
  function backingName(){return isSinging()?'伴奏':'背景音';}
  function assemblyTakes(){return videoHistory.filter(t=>t.kind==='song' && t.capture==='vocal' && !t.withBacking);}
  function renderActivity() {
    $('activityMode').value=activity;
    $('practiceScope').value=scopePreferences[activity];
    $('backingQuality').value=qualityPreferences[activity];
    $('backingModel').value=modelPreferences[activity];$('banditModelOption').disabled=isSinging();
    $('practiceScopeLabel').textContent=isSinging()?'录唱范围':'配音范围';
    $('wholeScopeOption').textContent=isSinging()?'整首歌曲':'整段视频';
    renderMicrophoneSettings();
    const singing=isSinging();
    $('useBacking').checked=backingPreferences[activity];
    $('scopeControls').hidden=false;$('karaokeSettings').hidden=!hasBackingTools();
    $('useBackingLabel').textContent=singing?'录唱时播放伴奏（仅录人声）':'保留背景音（电影配音，可选）';
    $('backingSettingsTitle').textContent=singing?'伴奏设置':'背景音设置';
    $('backingHelpTitle').textContent=`首次使用：如何启用${backingName()}？`;
    $('backingSettingsHint').textContent=singing?'按上方录唱范围生成，最长 10 分钟。准备好后回到主区录唱。':'去掉原对白，尽量保留音乐和环境音。按上方配音范围提取，最长 10 分钟，建议先试短片段；可能残留对白或损失音效。录音只保存自己的人声。';
    $('backingVolumeLabel').textContent=singing?'录唱监听音量':'背景监听音量';
    $('backingLiveLabel').textContent=singing?'伴奏':'背景音';
    $('backingLiveVolume').setAttribute('aria-label',singing?'录音中伴奏监听音量':'录音中背景音监听音量');
    $('backingVolume').setAttribute('aria-label',singing?'录唱监听音量':'背景监听音量');
    $('practiceToolsSummary').hidden=false;
    $('transcriptTitle').textContent=singing?'选择想练的一句歌词':'找到想练的那一句';
    $('transcriptSubtitle').textContent=singing?'点选歌词，主录唱区会切到对应片段。':'点选一句，回到练习。可搜索台词或导入字幕。';
    $('cueHeading').textContent=singing?'当前歌词':'当前台词';
    $('practiceFlowHint').textContent=singing?'自动练唱：原曲 → 准备 → 录唱 → 回听。':'自动跟读：原声 → 准备 → 配音 → 回放。';
    $('tab-transcript').textContent=singing?'歌词':'台词';
    updateCaption();
  }
  $('activityMode').onchange=()=>{
    if(mode==='idle'){scopePreferences[activity]=$('practiceScope').value;backingPreferences[activity]=$('useBacking').checked;activity=$('activityMode').value==='sing'?'sing':'speech';backingRestoreRequest++;restoringBacking=false;karaokeIssue='';}
    renderActivity();syncParagraphBounds();chooseCurrentTake();updateSummaries();controls();saveProgress();
    if(hasBackingTools()){void checkKaraokeService();void restoreServerBacking();}
  };
  function backingFor(r) {return savedBackings.find(value=>EchoKaraoke.covers(value,videoId,{...r,model:r.model || modelPreferences[activity],quality:r.quality || qualityPreferences[activity]})) || null;}
  $('backingModel').onchange=()=>{
    if(mode!=='idle'){$('backingModel').value=modelPreferences[activity];return;}
    modelPreferences[activity]=!isSinging() && $('backingModel').value===EchoModels.BANDIT_MODEL?EchoModels.BANDIT_MODEL:EchoKaraoke.DEFAULT_MODEL;
    backingRestoreRequest++;restoringBacking=false;karaokeIssue='';
    controls();saveProgress();void restoreServerBacking();
  };
  $('backingQuality').onchange=()=>{
    if(mode!=='idle'){$('backingQuality').value=qualityPreferences[activity];return;}
    qualityPreferences[activity]=$('backingQuality').value==='lossless'?'lossless':'standard';
    backingRestoreRequest++;restoringBacking=false;karaokeIssue='';
    controls();saveProgress();void restoreServerBacking();
  };
  function isParagraph(){return $('practiceScope').value==='paragraph';}
  function cueOptionLabel(cue,i){return `第 ${i+1} 句 · ${recordingTime(cue.start)} · ${captionText(cue).slice(0,50)}`;}
  function syncClipSelection(){
    const cue=cues[index],start=Number($('start').value),end=Number($('end').value);
    const standard=cue && EchoSelection.clipRange(cues,index,cue.start,cue.end);
    $('clipCue').value=cue && Math.abs(standard.start-start)<0.011 && Math.abs(standard.end-end)<0.011?String(index):'';
    $('clipCue').disabled=mode!=='idle' || !cues.length;
  }
  function renderClipOptions(){
    const manual=document.createElement('option');manual.value='';manual.textContent=cues.length?'自定义时间范围':'暂无台词，请先读取或导入字幕';
    $('clipCue').replaceChildren(manual);
    cues.forEach((cue,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=cueOptionLabel(cue,i);$('clipCue').append(option);});
    syncClipSelection();
  }
  $('clipCue').onchange=()=>{
    if(mode!=='idle')return;
    if($('clipCue').value===''){index=-1;updateCaption();chooseCurrentTake();saveProgress();return;}
    select(Number($('clipCue').value));if(hasBackingTools())void restoreServerBacking();
  };
  function renderParagraphOptions(){
    paragraphFirst=Math.max(0,Math.min(Number.isInteger(paragraphFirst)?paragraphFirst:0,Math.max(0,cues.length-2)));
    paragraphLast=Math.max(paragraphFirst+1,Math.min(Number.isInteger(paragraphLast)?paragraphLast:paragraphFirst+1,Math.max(1,cues.length-1)));
    for(const id of ['paragraphFirst','paragraphLast']){
      $(id).replaceChildren();
      cues.forEach((cue,i)=>{
        const option=document.createElement('option');option.value=String(i);
        option.textContent=cueOptionLabel(cue,i);
        option.disabled=id==='paragraphFirst'?i>=cues.length-1:i<=paragraphFirst;
        $(id).append(option);
      });
    }
    $('paragraphFirst').value=String(paragraphFirst);$('paragraphLast').value=String(paragraphLast);renderClipOptions();
  }
  function syncParagraphBounds(){
    if(!isParagraph() || cues.length<2)return;
    const r=EchoPractice.paragraphRange(cues,paragraphFirst,paragraphLast);
    $('start').value=r.start.toFixed(2);$('end').value=r.end.toFixed(2);
  }
  for(const id of ['paragraphFirst','paragraphLast'])$(id).onchange=()=>{
    if(mode!=='idle')return;
    if(id==='paragraphFirst')paragraphFirst=Number($(id).value);else paragraphLast=Number($(id).value);
    renderParagraphOptions();syncParagraphBounds();index=paragraphFirst;karaokeIssue='';
    updateCaption();chooseCurrentTake();controls();saveProgress();if(hasBackingTools())void restoreServerBacking();
  };
  function selectionInput(duration=document.querySelector('video.html5-main-video')?.duration) {
    return {activity,scope:$('practiceScope').value,start:Number($('start').value),end:Number($('end').value),speed:Number($('speed').value),duration,cues,index,first:paragraphFirst,last:paragraphLast};
  }
  function selectionState() {
    try { return {value:EchoSelection.resolve(selectionInput()),error:null}; }
    catch(error) { return {value:null,error}; }
  }
  function selectedRange() { return {...EchoSelection.resolve(selectionInput(video().duration)).range,model:modelPreferences[activity],quality:qualityPreferences[activity]}; }
  function updateBackingControls() {
    $('backingModel').disabled=mode!=='idle';$('backingQuality').disabled=mode!=='idle';
    $('backingQualityHint').textContent=qualityPreferences[activity]==='lossless'?'24 位 FLAC，避免额外有损编码，文件较大。仅对新提取生效；不能恢复原视频或分离模型损失的细节。':'192 kbps MP3，约 1.4 MB／分钟，节省空间。';
    if(serviceState==='online' && serviceMaxSeconds>=600 && serviceAccelerator.device){
      const banditCPU=modelPreferences[activity]===EchoModels.BANDIT_MODEL && serviceAccelerator.device==='mps';
      $('karaokeService').textContent='伴奏服务 · 已连接'+(banditCPU?' · CPU（BandIt）':['cuda','mps'].includes(serviceAccelerator.device)?' · GPU 加速':' · CPU');
      $('karaokeService').title=banditCPU?'BandIt 在 Mac 上暂用 CPU。':[serviceAccelerator.deviceName,serviceAccelerator.deviceNote].filter(Boolean).join(' · ');
    }
    const selectedModel=models.model(modelPreferences[activity]);
    $('backingModelHint').textContent=modelPreferences[activity]===EchoModels.BANDIT_MODEL
      ?selectedModel?.ready?'BandIt 已就绪 · 适合电影背景音；Mac 暂用 CPU，耗时较长。':'首次安装约 0.8 GiB，建议预留 2 GiB。Mac 暂用 CPU；模型权重 CC BY-SA 4.0。'
      :selectedModel?.ready?'Demucs 已就绪 · 歌曲推荐，也可用于电影背景音。': 'Demucs · 首次使用需下载约 80 MiB 权重。';
    if(!hasBackingTools()){
      for(const id of ['previewBacking','prepareBacking'])$(id).disabled=true;
      return;
    }
    const busy=mode!=='idle', whole=$('practiceScope').value==='whole',paragraph=isParagraph(),name=backingName();
    const selection=selectionState(),target=selection.value?.range,error=selection.error?.message || '';
    const ready=target && backingFor(target);

    $('previewBacking').disabled=busy || !ready;
    $('songReadiness').textContent=!usesBacking()?'清唱 · 不播放伴奏':ready?`${name}已就绪`:mode==='separating'?`正在准备${name}…`:restoringBacking?`正在查找已有${name}…`:`尚未准备${name}`;
    $('openBacking').title=ready?`调整${name}`:`准备${name} →`;
    $('backingSummary').textContent=!usesBacking()?'清唱':ready?'就绪':mode==='separating'?'生成中':'未就绪';
    $('prepareBacking').disabled=busy || !!ready;
    $('karaokeNotice').hidden=!karaokeIssue;
    $('karaokeNotice').textContent=karaokeIssue;
    $('prepareBacking').textContent=mode==='separating'?`正在生成${name}…`:ready?`${name}已就绪`:isSinging()?(whole?'生成整首伴奏':paragraph?'生成段落伴奏':'生成片段伴奏'):`提取${whole?'整段':paragraph?'段落':'片段'}背景音`;
    if(!busy && !ready && selectedModel && !selectedModel.ready)$('prepareBacking').textContent=`安装并${isSinging()?'生成伴奏':'提取背景音'}`;
    $('previewBacking').textContent=`▷ 试听${name}`;
    if(busy)return;
    if(restoringBacking)$('karaokeInfo').textContent=`正在查找已生成的${name}…`;
    else if(error)$('karaokeInfo').textContent=error;
    else if(karaokeIssue)$('karaokeInfo').textContent='';
    else if(ready)$('karaokeInfo').textContent='';
    else $('karaokeInfo').textContent=serviceState==='online'?'':serviceState==='offline'?'本机分离服务未连接。请查看下方启动说明，启动后点击“重新检测”。已有音频和录音仍可使用。':`首次使用需准备本机分离服务，点击“准备${name}”查看。`;
  }
  function clampGain(value) {return Number.isFinite(Number(value))?Math.max(0,Math.min(2,Number(value))):1;}
  function replayMix() {
    return {vocal:clampGain($('replayVocalVolume').value),backing:clampGain($('replayBackingVolume').value)};
  }
  function renderMixControls() {
    const target=replayTake || (currentPage==='recordings'?take:currentPage==='practice'?(isSinging()?songTake:take):null);
    const visible=!!target && (mode==='idle' || !!replayTake);
    $('mixControls').hidden=!visible;
    if(!target)return;
    const hasBackground=EchoKaraoke.canReplayBacking(target),name=target.kind==='song'?'伴奏':'背景音';
    const ready=hasBackground && (replayTake?replayBackingReady:!!EchoKaraoke.backingForTake(savedBackings,target,videoId));
    const {vocal,backing}=replayMix(), label=target.withBacking?'录音总音量':'人声';
    $('replayVocalLabel').textContent=label;
    $('replayVocalVolume').setAttribute('aria-label',target.withBacking?'回听录音总音量':'回听人声音量');
    $('replayVocalVolume').max=String(replayTake?replayVoiceMax:2);
    $('replayVocalValue').textContent=`${Math.round(vocal*100)}%`;
    $('replayBackingValue').textContent=`${Math.round(backing*100)}%`;
    $('replayMusicOption').hidden=!hasBackground;
    $('replayBackingOptionLabel').textContent=`回听带${name}`;
    $('replayBackingLabel').textContent=name;
    $('replayBackingVolume').setAttribute('aria-label',`回听${name}音量`);
    $('replayWithBacking').disabled=!ready;
    $('replayBackingRow').hidden=!hasBackground;
    $('replayBackingVolume').disabled=!ready;
    $('mixSummary').textContent=`${target.withBacking?'总音量':'人声'} ${Math.round(vocal*100)}%${hasBackground?` · ${name}${$('replayWithBacking').checked?' '+Math.round(backing*100)+'%':'关'}`:''}`;
    $('mixHint').textContent=target.withBacking?'旧版混合录音只能调整总音量，无法分别调节人声和伴奏。':hasBackground?
      ready?'混合下载沿用此比例，原始人声不变。':`暂无可用${name}，当前仅回听人声。`:'只影响回听，原始录音不变。';
    if(replayTake && replayVoiceMax===1)$('mixHint').textContent+=' 当前人声音量最高为 100%。';
  }
  function updateReplayMix() {
    const {vocal,backing}=replayMix();
    if(replayVoiceOutput)replayVoiceOutput.setVolume(vocal);
    else if(replayTake && audio)audio.volume=Math.min(1,vocal);
    replayMonitor?.setVolume(backing);
    renderMixControls();
  }
  for(const id of ['replayVocalVolume','replayBackingVolume']){
    $(id).oninput=updateReplayMix;$(id).onchange=saveProgress;
  }
  $('resetReplayMix').onclick=()=>{
    $('replayVocalVolume').value=1;$('replayBackingVolume').value=1;
    updateReplayMix();saveProgress();
  };
  function setSongTake(value) {
    if(songTake?.id===value?.id)return;
    songTake=value || null;
    $('songResult').hidden=!value;
    $('songInfo').textContent=value ? `最近演唱 · ${recordingTime(value.start)}–${recordingTime(value.end)} · ${value.speed}×` : '';
    updateBackingControls();
  }
  $('leadInMode').value='none';$('leadInSeconds').value=3;
  $('leadInMode').onchange=()=>{updateLeadInSettings();saveProgress();};
  function updateLeadInSettings(){
    updateSettingsSummaries();
    $('leadInSecondsRow').hidden=$('leadInMode').value!=='seconds';
    $('previousLeadIn').disabled=cues.length<2;
    $('leadInHint').textContent=$('leadInMode').value==='previous'?'从上一句开头听到片段起点，再开始录音。需要时间轴字幕；没有上一句时不前置。':'先播放片段前的原声作准备，不录入准备段。前 N 秒按视频时间计算，开头不足时从头播放。';
  }
  $('leadInSeconds').onchange=()=>{$('leadInSeconds').value=EchoPractice.leadInSeconds($('leadInSeconds').value);updateSettingsSummaries();saveProgress();};
  $('speed').onchange = () => {updateSummaries();saveProgress();}; $('loopCount').onchange = ()=>{updateSummaries();saveProgress();};
  for(const id of ['prepSeconds','autoNext'])$(id).onchange=saveProgress;
  function currentId() { return new URL(location.href).searchParams.get('v'); }
  function video() {
    if (location.pathname !== '/watch' || !currentId()) throw Error('请先打开一个 YouTube 视频播放页。');
    const v = document.querySelector('video.html5-main-video');
    if (!v || !Number.isFinite(v.duration)) throw Error('请等待视频加载，直播暂不支持。');
    if (document.querySelector('.html5-video-player.ad-showing')) throw Error('请等待广告结束后再练习。');
    attachCaptionVideo(v);
    return v;
  }
  function status(text) { $('status').textContent = text;$('settingsStatus').textContent=text; }
  function renderPracticeActions() {
    const singing=isSinging(),scope=$('practiceScope').value,whole=scope==='whole',paragraph=scope==='paragraph';
    const range=selectionState().value?.range;
    const recorded=range && videoHistory.some(t=>(t.kind==='song')===singing && Math.abs(t.start-range.start)<0.01 && Math.abs(t.end-range.end)<0.01 && t.speed===range.speed);
    $('record').textContent=singing?(recorded?'● 再录一次':whole?'● 开始整首录唱':paragraph?'● 开始段落录唱':'● 开始片段录唱')
      :whole?'● 开始整段配音':paragraph?'● 开始段落配音':'● 开始配音';
    $('record').title='使用当前范围和速度录音，保留之前的版本。';
    $('original').textContent=singing?'▶ 听原曲':'▶ 听原声';
    $('replay').textContent=singing?'▷ 回听最近演唱':'▷ 回听录音';
    $('loop').textContent=whole?(singing?'↻ 循环听整首':'↻ 循环听整段'):'↻ 循环听选段';
    $('autoPractice').textContent=paragraph?'▶ 自动练当前段落':whole?(singing?'▶ 自动练整首':'▶ 自动练整段'):singing?'▶ 自动练当前片段':'▶ 自动跟读';
  }
  function controls() {
    $('panel').dataset.mode=mode;renderPracticeActions();
    const busy = mode !== 'idle';
    $('openLibrary').disabled=busy;
    updateLeadInSettings();
    const focused=root.activeElement;
    for(const id of ['openSongRecording','takeMixDownload','assembleSong'])$(id).disabled=busy;
    const recording=mode==='recording' || mode==='lead-in';
    $('panel').setAttribute('aria-busy',String(['loading','reading','importing','exporting','saving','permission'].includes(mode)));
    $('backingLiveControls').hidden=!recording || !recordingSession?.monitor;
    $('backingLiveVolume').disabled=$('backingLiveControls').hidden;
    $('sidetoneLiveControls').hidden=!recording || !sidetoneEnabled;
    $('sidetoneLatency').hidden=!recording || !sidetoneEnabled;
    $('sidetoneLatency').textContent=EchoMicrophone.describeMonitoring(recordingSession?.sidetoneInfo);
    $('practiceDock').hidden=currentPage!=='practice' || mode!=='idle';$('practiceUtilities').hidden=currentPage!=='practice' || mode!=='idle';
    $('historyBrowser').hidden=!videoHistory.length;
    $('playAll').hidden=!videoHistory.length;
    $('recordingDetails').hidden=!take;
    const voices=assemblyTakes();
    let assemblyError='',assemblyPlan=null;
    if(voices.length){try{assemblyPlan=EchoAssembly.preview(assemblyTakes(),document.querySelector('video.html5-main-video')?.duration,assemblyChoices,EchoAudioExport);}catch(error){assemblyError=error.message;}}
    $('assembleSong').disabled=busy || !voices.length || !!assemblyError;
    $('assembleSong').title=assemblyError;
    $('assemblyWarning').textContent=assemblyError;$('assemblyWarning').hidden=!assemblyError;
    if(assemblyPlan){
      const covered=assemblyPlan.segments.reduce((sum,s)=>sum+s.end-s.start,0);
      $('assemblyInfo').textContent=`${EchoPractice.recordingQueue(voices).length} 段独立人声 · 已选 ${covered.toFixed(1)} / ${assemblyPlan.duration.toFixed(1)} 秒。`;
    }
    $('activityMode').hidden=recording;$('prepActions').hidden=recording;
    for(const id of ['openPresets','openMicTest'])$(id).disabled=mode!=='idle';renderFavorite();
    $('scopeControls').hidden=recording;
    $('wholeScopeHint').hidden=$('practiceScope').value!=='whole';
    $('paragraphSelection').hidden=!isParagraph();$('paragraphScopeOption').disabled=cues.length<2;
    $('singDetails').hidden=!hasBackingTools() || recording;
    $('karaokeSettings').hidden=!hasBackingTools() || recording;
    $('backingOption').hidden=recording;
    for(const id of ['practiceTools','practiceSettings','quickSpeed'])$(id).hidden=recording;
    for(const id of ['practiceTools','practiceSettings','captionSettings','openBacking','adjustClipBounds'])$(id).disabled=busy;
    $('captionSetup').hidden=recording || cues.length>0;
    $('clipSettings').hidden=recording;
    $('clipBounds').hidden=recording || $('practiceScope').value!=='clip';
    syncClipSelection();
    $('songReadinessRow').hidden=!hasBackingTools() || recording;
    $('songResult').hidden=!isSinging() || !songTake;
    for (const id of ['useHeadphoneSettings','sidetoneMode','sidetoneEnabled','sidetoneVolume','inputDevice','detectInputs','paragraphFirst','paragraphLast','recordingQuality','echoCancellation','autoGainControl','manualGainDb','captionSource','refreshCaptionTracks','contentLanguage','captionLayout','activityMode','read','import','openCaptionSetup','openLanguageSettings','prepareBacking','practiceScope','useBacking','backingVolume','prev','next','markStart','markEnd','original','speed','start','end','leadInMode','leadInSeconds','record','startEarlier','startLater','endEarlier','endLater','loop','loopCount','autoPractice','prepSeconds','autoNext']) $(id).disabled = busy;
    if(isParagraph())for(const id of ['start','end','markStart','markEnd','startEarlier','startLater','endEarlier','endLater'])$(id).disabled=true;
    $('autoNext').disabled=busy || $('practiceScope').value!=='clip';
    $('useBacking').disabled=busy;
    $('backingVolume').disabled=!hasBackingTools() || !['idle','backing','lead-in','recording'].includes(mode);
    renderBackingVolume();
    $('prev').disabled=busy || index<=0;
    $('next').disabled=busy || index<0 || index>=cues.length-1;
    updateBackingControls();
    $('stop').disabled = !busy || mode==='saving'; $('stop').hidden = !busy;
    $('settingsStop').hidden=!busy;$('settingsStop').disabled=mode==='saving';
    $('stop').textContent=mode==='lead-in'?'■ 取消准备':mode==='recording'?'■ 结束录音':mode==='saving'?'保存中…':'■ 停止';
    $('reviewReplay').disabled = busy || !take;
    $('playAll').disabled = busy || !videoHistory.length;
    $('replay').disabled = busy || !(isSinging()?songTake:take);
    $('compare').disabled = busy || !take;
    $('speakWord').disabled = busy;
    $('reuseSongRange').disabled=busy;
    $('deleteTake').disabled = busy || !take; $('undoDelete').disabled = busy;
    root.querySelectorAll('.version-choice').forEach(b=>b.disabled=busy && mode!=='replay');
    root.querySelectorAll('.history-delete').forEach(b=>b.disabled=busy && mode!=='replay');
    root.querySelectorAll('.history-row').forEach(b=>b.disabled=busy && mode!=='replay');
    root.querySelectorAll('.word').forEach(b => b.disabled = busy);
    root.querySelectorAll('.cue').forEach(b => b.disabled = busy);
    renderMixControls();
    if(busy && focused?.disabled && !$('stop').disabled){
      returnFocus ||= focused;(settings.isOpen()?$('settingsStop'):$('stop')).focus();
    } else if(!busy && returnFocus){
      const target=returnFocus;returnFocus=null;
      if(currentPage==='practice' && (!focused || ['stop','settingsStop'].includes(focused.id)) && !target.disabled)target.focus();
    }
  }
  function saveVideo(v) { savedVideo = { v, muted: v.muted, rate: v.playbackRate }; }
  function restoreVideo() {
    if (savedVideo) { const { v, muted, rate } = savedVideo; v.pause(); v.muted = muted; v.playbackRate = rate; savedVideo = null; }
  }
  function cancelPlayback() {
    recordingSession?.pauseFeedback();
    transport.hide();
    replayMonitor?.dispose();replayMonitor=null;
    replayVoiceOutput?.dispose();replayVoiceOutput=null;replayTake=null;replayBackingReady=false;
    playback.cancel();
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
  }
  function finish() { cancelPlayback(); restoreVideo(); mode = 'idle'; controls(); }
  function stop() {
    const previous=mode;assembly.close();
    window.speechSynthesis?.cancel();
    if (mode === 'loading') restoring = false;
    if (mode === 'reading') status('已停止读取台词。');
    if (mode === 'separating') {karaokeIssue='已停止生成伴奏，可重新生成。';status('已停止生成伴奏。');$('karaokeInfo').textContent='已停止，可重新生成本段伴奏。';$('karaokeProgress').hidden=true;}
    if(activeKaraokeJob){void karaokeRequest('cancel',{jobId:activeKaraokeJob}).catch(()=>{});activeKaraokeJob=null;}
    if(!['idle','reading','separating'].includes(previous))status(recordingSession && recordingSession.state!=='inactive'?'录音已结束，正在保存…':'已停止。');
    generation++;
    cancelPlayback(); restoreVideo();
    const capturing=recordingSession && recordingSession.state!=='inactive';
    mode=capturing?'saving':'idle';
    recordingSession?.stop();
    controls();
  }
  function guarded(fn) {
    return async () => {
      const report=error=>{stop();status(error.message || String(error));};
      let task;
      try { task=fn(); } catch(error) { report(error);return; }
      // Actions establish their generation before their first await. Capture
      // that owner directly; never infer ownership from how many increments ran.
      const token=generation;
      try { await task; } catch(error) { if(token===generation)report(error); }
    };
  }
  function showVideoTransport(label,v,r,seekTo=null) {
    transport.show({label, position: () => (v.currentTime-r.start)/r.speed,
      duration: () => (r.end-r.start)/r.speed, seekTo});
  }
  async function seek(v, at, token, force=false) {
    if(token!==generation)throw Error('操作已停止。');
    const completed=await playback.seek(v,at,{force});
    if(!completed || token!==generation)throw Error('操作已停止。');
  }
  function leadInStart(r){return EchoPractice.leadInStart(r.start,$('leadInSeconds').value,{mode:$('leadInMode').value,cues});}
  async function playRecordingLeadIn(v,r,token){
    const start=leadInStart(r);
    if(start>=r.start)return false;
    mode='lead-in';controls();v.muted=false;v.playbackRate=r.speed;
    await seek(v,start,token);
    if(token!==generation)return false;
    const update=()=>status(`准备录音 · ${Math.max(0,Math.ceil((r.start-v.currentTime)/r.speed))} 秒后开始`);
    update();v.addEventListener('timeupdate',update);
    try{
      await v.play();
      if(token!==generation)return false;
      await new Promise((resolve,reject)=>{
        playback.onCancel(resolve);
        showVideoTransport('准备录音 · 前置原声',v,{start,end:r.start,speed:r.speed});
        playback.watchEnd(v,r.start,()=>{v.pause();resolve();});
        playback.timeout(()=>{v.pause();reject(Error('前置播放超时，请检查视频后重试。'));},EchoPractice.playbackTimeout({start,end:r.start,speed:r.speed}));
      });
    }finally{
      v.removeEventListener('timeupdate',update);
      if(token===generation){playback.cancel();transport.hide();}
    }
    return token===generation;
  }
  async function original(r, token, withLeadIn=true) {
    if(withLeadIn)r={...r,start:leadInStart(r)};
    closeWord();
    const v = video(); saveVideo(v); v.muted = false; v.playbackRate = r.speed;
    await seek(v, r.start, token);
    if (token !== generation) return;
    await v.play();
    if (token !== generation) return;
    await new Promise(resolve => {
      playback.onCancel(resolve);
      showVideoTransport('原声',v,r,elapsed=>{
        v.currentTime=r.start+elapsed*r.speed;
        playback.timeout(()=>{v.pause();resolve();},Math.max(0,(r.end-v.currentTime)/r.speed)*1000+15000);
      });
      playback.watchEnd(v, r.end, () => { v.pause(); resolve(); });
      playback.timeout(() => { v.pause(); resolve(); }, (r.end - r.start) / r.speed * 1000 + 15000);
    });
    if (token === generation) { cancelPlayback(); restoreVideo(); }
  }
  function setTake(value) {
    if(value && take?.id===value.id){controls();return;}
    if (take?.url) URL.revokeObjectURL(take.url);
    take = value ? { ...value, url: URL.createObjectURL(value.blob) } : null;
    $('download').style.display = take ? 'block' : 'none';
    $('recordingEmpty').hidden = !!take || !!videoHistory.length; $('recordingContent').hidden = !take;
    $('historyInfo').textContent = take ? `${take.label || '手动片段'} · ${take.start.toFixed(1)}–${take.end.toFixed(1)} 秒 · ${take.speed}×${take.withBacking ? ' · 旧版混合录音' : take.capture==='vocal'?' · 独立人声':''}` : '';
    $('recordingText').textContent=take ? recordingText(take) : '';
    $('recordingTechnical').textContent=take?EchoMicrophone.describeRecording(take.recordingInfo):'';
    $('reuseSongRange').hidden=!take;
    $('takeMixDownload').hidden=!EchoKaraoke.canReplayBacking(take);
    $('takeMixDownload').textContent=take?.kind==='song'?'人声＋伴奏':'人声＋背景音';
    $('mixDownloadHint').hidden=$('takeMixDownload').hidden;
    $('mixDownloadHint').textContent='混合下载采用底部的回听音量比例，暂支持 1× 录音；原始人声保持不变。';
    $('download').textContent=take?.withBacking?'↓ 旧版混合录音':take?.capture==='vocal'?'↓ 下载人声':'↓ 下载所选录音';
    if (take) { $('download').href = take.url; $('download').download = takeFilename(take); }
    controls();
    analysisRequest++;
    $('analysis').hidden=!take;
    if($('recordingDetails').open)void analyzeTake(take);
  }
  function currentCueKey() { return selectionState().value?.key || null; }
  function currentVideoTitle(){
    const page=document.querySelector('ytd-watch-flexy[video-id]');
    const matches=!page || page.getAttribute('video-id')===videoId;
    const title=(matches?(document.querySelector('ytd-watch-metadata h1')?.textContent || document.title || ''):'').replace(/\s*[-–]\s*YouTube\s*$/,'').trim();
    if(title && title!=='YouTube')return title;
    return savedTitle===videoId?'':savedTitle;
  }
  function takeFilename(value){
    return EchoAudioExport.filename({title:currentVideoTitle(),videoId,start:value.start,end:value.end,kind:value.withBacking?'mixed':value.capture==='vocal'?'vocals':value.kind==='song'?'recording':'dubbing'});
  }
  // Refresh at click time too: YouTube can finish loading its title after restore.
  $('download').onclick=()=>{if(take)$('download').download=takeFilename(take);};
  function saveProgress() {
    if (restoring || !videoId) return;
    const start = Number($('start').value), end = Number($('end').value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return;
    const title=currentVideoTitle();
    scopePreferences[activity]=$('practiceScope').value;
    const session = {clipRangeAdjusted,qualityPreferences:{...qualityPreferences},modelPreferences:{...modelPreferences},title:title || videoId,scopes:{...scopePreferences},assemblyChoices,loopCount:$('loopCount').value,prepSeconds:$('prepSeconds').value,autoNext:$('autoNext').checked,leadInMode:$('leadInMode').value,leadInSeconds:EchoPractice.leadInSeconds($('leadInSeconds').value),activity,paragraphFirst,paragraphLast,useBacking:$('useBacking').checked,backingPreferences:{...backingPreferences,[activity]:$('useBacking').checked},captionSource,captionSourceName,loadedCaptionSource,replayVocalVolume:replayMix().vocal,replayBackingVolume:replayMix().backing,replayWithBacking:$('replayWithBacking').checked,backingVolume:Number($('backingVolume').value),contentLanguage:$('contentLanguage').value,captionLayout:$('captionLayout').value,videoId,cues:cues.map(c=>({...c})),index,start,end,speed:$('speed').value,showChinese:$('showChinese').checked,hideText:$('hideText').checked,followCaptions:$('followCaptions').checked,selectedTakeId:take?.id,updatedAt:Date.now()};
    void storage.saveSession(session).catch(()=>{
      if (!progressWarning && session.videoId === videoId) { progressWarning=true; status('练习位置未能保存，请检查本地存储空间。录音仍可下载。'); }
    });
  }
  function recordingText(value) {
    const cue=cues.find(c=>c.key===value.cueKey || `song:${c.key}`===value.cueKey);
    if(cue)return captionText(cue);
    const covered=cues.filter(c=>c.start<value.end && c.end>value.start);
    return covered.length?covered.slice(0,3).map(c=>captionText(c)).join(' / ')+(covered.length>3?'…':''):value.label || '手动片段';
  }
  function recordingTime(value) {return EchoTransport.formatTime(value);}
  async function playRecording(value) {
    let token;
    try {
      if(mode==='replay'){
        const same=take?.id===value.id;stop();
        if(same){status('已停止回放。');return;}
      } else if(mode!=='idle')return;
      video();token=++generation;mode='replay';setTake(value);renderHistory();saveProgress();
      status(`正在播放 · ${value.label || '手动片段'}`);await replay(token);
    }catch(error){if(token===undefined || token===generation){stop();status(error.message || String(error));}}
  }
  function renderHistory() {
    const list=$('historyList'), scroll=list.scrollTop;
    const queue=EchoPractice.recordingQueue(videoHistory);
    const query=$('recordingSearch').value.trim().toLowerCase();
    const shown=queue.filter(t=>`${recordingText(t)} ${t.label || ''} ${recordingTime(t.start)}`.toLowerCase().includes(query));
    $('historyCount').textContent=`${queue.length} 段`;
    $('recordingSummary').textContent=`${videoHistory.length} 个版本`;
    const songVoices=assemblyTakes();
    $('songAssembly').hidden=!songVoices.length;
    $('assemblyInfo').textContent=`${EchoPractice.recordingQueue(songVoices).length} 段独立人声可用于合成；每段自动选最新版本。`;
    $('recordingEmpty').hidden=!!queue.length || !!take;
    list.replaceChildren();
    if(!shown.length && queue.length){const p=document.createElement('p');p.className='hint';p.textContent='没有匹配的录音，试试其他关键词。';list.append(p);}
    shown.forEach(value=>{
      const button=document.createElement('button');button.className='history-row';button.disabled=mode!=='idle';
      button.setAttribute('aria-pressed',String(value.cueKey===take?.cueKey));
      const versions=videoHistory.filter(t=>t.cueKey===value.cueKey).length;
      button.append(document.createTextNode(`${value.label || '手动片段'} · ${recordingTime(value.start)} · ${versions} 个版本`));
      const small=document.createElement('small');small.textContent=recordingText(value);button.append(small);
      button.onclick=guarded(()=>playRecording(value));
      const row=document.createElement('div');row.className='history-item';
      const remove=document.createElement('button');remove.className='history-delete';remove.textContent='删除';
      remove.title='删除此片段的最新版本，可撤销';remove.onclick=guarded(()=>deleteRecording(value));
      row.append(button,remove);list.append(row);
    });
    list.scrollTop=scroll;
    $('versionChoices').replaceChildren();$('versionChoices').hidden=true;
    if(take){
      const versions=videoHistory.filter(t=>t.cueKey===take.cueKey).sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id));
      $('versionChoices').hidden=versions.length<2;
      versions.forEach((value,i)=>{
        const button=document.createElement('button');button.className='version-choice';button.textContent=`版本 ${i+1}${i===versions.length-1?' · 最新':''}`;
        button.title=new Date(value.createdAt).toLocaleString('zh-CN');button.setAttribute('aria-pressed',String(value.id===take.id));
        button.onclick=guarded(()=>playRecording(value));$('versionChoices').append(button);
      });
    }
    controls();
  }
  function chooseCurrentTake(preferredId) {
    const key=currentCueKey();
    const matching=videoHistory.filter(t=>t.cueKey===key);
    const value=videoHistory.find(t=>t.id===preferredId) || matching[0];
    setTake(value || null); renderHistory();
  }
  async function refreshHistory(preferredId) {
    const id=videoId, request=++historyRequest;
    const values=await storage.listTakes(id);
    if(id!==videoId || request!==historyRequest) return;
    videoHistory=values;setSongTake(values.find(t=>t.kind==='song')); chooseCurrentTake(preferredId);
  }
  async function loadVideo(id) {
    const token=++generation; restoring=true; mode='loading'; controls();
    try {
      const [session,values,backings]=await Promise.all([storage.getSession(id),storage.listTakes(id),storage.listBackings(id)]);
      if(id!==videoId || token!==generation) return;
      savedTitle=session?.title || '';
      savedBackings=backings;videoHistory=values;setSongTake(values.find(t=>t.kind==='song')); mode='idle';
      if(session) {
        backingPreferences={speech:session.backingPreferences?.speech===true,
          sing:typeof session.backingPreferences?.sing==='boolean'?session.backingPreferences.sing:session.activity==='sing'?session.useBacking!==false:true};
        assemblyChoices=Array.isArray(session.assemblyChoices)?session.assemblyChoices:[];
        scopePreferences=EchoSelection.restoreScopes(session);
        qualityPreferences={speech:session.qualityPreferences?.speech==='lossless'?'lossless':'standard',sing:session.qualityPreferences?.sing==='lossless'?'lossless':'standard'};
        modelPreferences={speech:session.modelPreferences?.speech===EchoModels.BANDIT_MODEL?EchoModels.BANDIT_MODEL:EchoKaraoke.DEFAULT_MODEL,sing:EchoKaraoke.DEFAULT_MODEL};
        if(['speech','sing'].includes(session.activity))activity=session.activity;
        renderActivity();
        captionSource=typeof session.captionSource==='string'?session.captionSource:'auto';captionSourceName=session.captionSourceName || '';loadedCaptionSource=session.loadedCaptionSource || '';renderCaptionSources();
        $('contentLanguage').value=EchoLanguages.validLanguage(session.contentLanguage)?session.contentLanguage:'auto';
        // Older sessions intentionally used English/Chinese splitting. Keep
        // that preference only when their text is confidently English.
        const sample=(session.cues || []).slice(0,32).map(c=>c.text).join(' ');
        $('captionLayout').value=['original','en-zh'].includes(session.captionLayout)?session.captionLayout:EchoLanguages.detect(sample)==='en'?'en-zh':'original';
        $('loopCount').value=['3','5','0'].includes(session.loopCount)?session.loopCount:'3';
        $('prepSeconds').value=['0','2','3','5'].includes(session.prepSeconds)?session.prepSeconds:'3';$('autoNext').checked=!!session.autoNext;
        $('speed').value=['0.75','1','1.25'].includes(session.speed)?session.speed:'1';
        $('leadInSeconds').value=session.leadInSeconds===undefined?3:EchoPractice.leadInSeconds(session.leadInSeconds);
        $('leadInMode').value=['none','seconds','previous'].includes(session.leadInMode)?session.leadInMode:EchoPractice.leadInSeconds(session.leadInSeconds)>0?'seconds':'none';
        paragraphFirst=Number.isInteger(session.paragraphFirst)?session.paragraphFirst:0;paragraphLast=Number.isInteger(session.paragraphLast)?session.paragraphLast:1;
        $('practiceScope').value=scopePreferences[activity];
        $('backingVolume').value=Number.isFinite(session.backingVolume)?Math.max(0,Math.min(2,session.backingVolume)):1;
        $('replayVocalVolume').value=clampGain(session.replayVocalVolume);
        $('replayBackingVolume').value=clampGain(session.replayBackingVolume);
        $('replayWithBacking').checked=session.replayWithBacking!==false;
        $('showChinese').checked=!!session.showChinese; $('hideText').checked=!!session.hideText; $('followCaptions').checked=session.followCaptions!==false;
        displayCues(session.cues || [],session.index);
        $('start').value=session.start; $('end').value=session.end; index=session.index>=0 && session.index<cues.length?session.index:-1;syncParagraphBounds();
        clipRangeAdjusted=session.clipRangeAdjusted===true;
        if($('practiceScope').value==='clip' && !clipRangeAdjusted){
          const range=EchoSelection.clipRange(cues,index,Number($('start').value),Number($('end').value));
          $('start').value=range.start;$('end').value=range.end;
        }
        updateCaption(); $('list').style.display=$('hideText').checked?'none':'';
        status(index>=0 ? `已回到上次练习的第 ${index+1} 句。` : '已恢复上次的手动片段。');
      } else if(values.length) {
        $('start').value=values[0].start; $('end').value=values[0].end; $('speed').value=String(values[0].speed); updateCaption();
        status('旧版录音已保留，可在「录音」页回放。');
      }
      chooseCurrentTake(session?.selectedTakeId); restoring=false; controls();
      if(hasBackingTools()){void checkKaraokeService();void restoreServerBacking();}
    } catch(error) {
      if(id===videoId && token===generation) { restoring=false; mode='idle'; controls(); status(error.message || '本地存储不可用，仍可录音并下载。'); }
    }
  }
  $('playAll').onclick=guarded(async()=>{
    video();const token=++generation,id=videoId;
    mode='playlist';controls();status('正在准备配音连播…');
    const stored=await storage.listTakes(id);
    if(token!==generation || id!==videoId)return;
    const queue=EchoPractice.recordingQueue(stored);
    if(!queue.length){finish();status('还没有可连播的录音，请先录制一两句。');return;}
    videoHistory=stored;closeWord();
    await EchoPractice.playQueue({queue,active:()=>token===generation && id===videoId,
      play:async(value,i,total)=>{
        mode='playlist';setTake(value);renderHistory();
        status(`配音连播 · ${i+1} / ${total} · ${value.label || '手动片段'}`);
        await replay(token,true);
      }
    });
    if(token===generation){finish();status(`已播完 ${queue.length} 段配音。`);}
  });
  $('recordingSearch').oninput=renderHistory;
  async function karaokeRequest(action, data = {}) {
    let timeout;
    let result;
    try{
      result=await Promise.race([
        chrome.runtime.sendMessage({type:'echo-karaoke',action,...data}),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('伴奏服务响应超时。请在项目根目录运行 bash start-karaoke.sh（Windows 使用 start-karaoke.ps1）；若已启动，请重新加载扩展并刷新 YouTube 页面。')),['audio','audio-chunk'].includes(action)?35000:12000);})
      ]);
    }finally{clearTimeout(timeout);}
    if(!result || result.error)throw Error(result?.error || '伴奏服务未响应，请重新加载扩展后重试。');
    return result;
  }
  function checkKaraokeService() {
    if(serviceCheck)return serviceCheck;
    $('checkKaraoke').disabled=true;$('karaokeService').textContent='伴奏服务 · 正在检测…';
    serviceCheck=(async()=>{
      try{
        const result=await karaokeRequest('health');
        if(result.service!=='echo-karaoke')throw Error('服务不匹配');
        serviceState='online';serviceLossless=result.losslessBackings===true;serviceAccelerator=result;serviceMaxSeconds=Number.isFinite(result.maxSeconds)?result.maxSeconds:300;
        $('karaokeService').textContent=serviceMaxSeconds<600?'伴奏服务 · 已连接旧版，请重启服务以支持 10 分钟':'伴奏服务 · 已连接';
        if(serviceMaxSeconds>=600 && result.device)$('karaokeService').textContent+=['cuda','mps'].includes(result.device)?' · GPU 加速':' · CPU';
        $('karaokeService').title=[result.deviceName,result.deviceNote].filter(Boolean).join(' · ');
        $('karaokeHelp').open=serviceMaxSeconds<600;
        modelManagement=result.modelManagement===true;
        if(modelManagement)await models.refresh().catch(()=>{});
      }catch{
        modelManagement=false;serviceState='offline';$('karaokeService').textContent='伴奏服务 · 未连接（未启动或不可用）';$('karaokeService').title='';$('karaokeHelp').open=true;
      }finally{$('checkKaraoke').disabled=false;serviceCheck=null;updateBackingControls();}
    })();
    return serviceCheck;
  }
  $('checkKaraoke').onclick=async()=>{await checkKaraokeService();if(serviceState==='online'){karaokeIssue='';controls();await restoreServerBacking();}};
  async function loadBackingAudio(job,active){
    if(EchoKaraoke.qualityOf(job)!=='lossless')return karaokeRequest('audio',{jobId:job.id});
    const result=await EchoKaraoke.fetchAudio(karaokeRequest,{jobId:job.id,active});
    if(result.mime!=='audio/flac')throw Error('本机服务没有返回 FLAC 音频，请更新并重启服务。');
    return result;
  }
  async function keepBacking(value) {
    value={...value,model:EchoKaraoke.modelOf(value)};
    let recent=0;
    savedBackings=[value,...savedBackings.filter(old=>old.key!==value.key)].filter(old=>old.imported || recent++<8);
    try{await storage.saveBacking(value);return true;}
    catch{if(value.videoId===videoId)status('伴奏可以使用，但本地保存失败；刷新后可能需要从本机服务重新取回。');return false;}
  }
  async function restoreServerBacking() {
    if(!hasBackingTools() || mode!=='idle' || restoringBacking)return;
    let r;try{r=selectedRange();}catch{return;}
    if(backingFor(r))return;
    const id=videoId, request=++backingRestoreRequest;
    restoringBacking=true;controls();
    try{
      const result=await karaokeRequest('cached',{videoId:id,quality:r.quality});
      if(id!==videoId || request!==backingRestoreRequest)return;
      const cached=result.backings?.find(value=>EchoKaraoke.covers(value,id,r));
      if(!cached)return;
      const audio=await loadBackingAudio(cached,()=>id===videoId && request===backingRestoreRequest);
      if(id!==videoId || request!==backingRestoreRequest)return;
      const stored=await keepBacking({key:EchoKaraoke.key(id,cached),videoId:id,model:cached.model,quality:cached.quality,start:cached.start,end:cached.end,createdAt:Date.now(),blob:EchoKaraoke.blobFromBase64(audio)});
      if(stored && id===videoId && hasBackingTools() && mode==='idle')status('已恢复之前生成的伴奏，无需重新分离。');
    }catch{/* Cache lookup is optional; ordinary dubbing and explicit generation still work. */}
    finally{if(request===backingRestoreRequest){restoringBacking=false;controls();}}
  }
  function renderBackingVolume(){
    const volume=Number($('backingVolume').value);
    $('backingLiveVolume').value=volume;
    for(const id of ['backingVolumeValue','backingLiveValue'])$(id).textContent=`${Math.round(volume*100)}%`;
  }
  for(const id of ['backingVolume','backingLiveVolume']){
    $(id).oninput=()=>{
      const value=Number($(id).value),volume=Number.isFinite(value)?Math.max(0,Math.min(2,value)):1;
      $('backingVolume').value=volume;renderBackingVolume();updateBackingControls();
      backingOutput?.setVolume(volume);recordingSession?.setVolume(volume);
    };
    $(id).onchange=saveProgress;
  }
  $('useBacking').onchange=()=>{
    if(mode!=='idle'){$('useBacking').checked=backingPreferences[activity];return;}
    backingPreferences[activity]=$('useBacking').checked;
    backingRestoreRequest++;restoringBacking=false;karaokeIssue='';
    renderActivity();controls();saveProgress();
    if(usesBacking()){void checkKaraokeService();void restoreServerBacking();}
  };
  $('practiceScope').onchange=()=>{scopePreferences[activity]=$('practiceScope').value;karaokeIssue='';if(isParagraph()){renderParagraphOptions();syncParagraphBounds();index=paragraphFirst;updateCaption();}chooseCurrentTake();updateSummaries();controls();saveProgress();if(hasBackingTools() && !restoringBacking)void restoreServerBacking();};
  $('openBacking').onclick=()=>{
    if(mode==='idle')settings.open('backing','openBacking');
  };
  $('reuseSongRange').onclick=()=>{
    if(mode!=='idle' || !take)return;
    const value=take;backingPreferences[activity]=$('useBacking').checked;activity=value.kind==='song'?'sing':'speech';scopePreferences[activity]='clip';renderActivity();
    $('start').value=value.start;$('end').value=value.end;$('speed').value=String(value.speed);index=-1;updateCaption();
    updateSummaries();controls();saveProgress();showPage('practice');
    status('已使用此版的范围和速度，可以重新练习。');if(hasBackingTools()){void checkKaraokeService();void restoreServerBacking();}
  };
  function downloadAudio(blob,name){
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;link.hidden=true;root.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function exportAudio(takes,duration,origin,withMusic){
    if(mode!=='idle')return;
    const backing=withMusic?EchoKaraoke.backingForTake(savedBackings,{...takes[0],start:origin,capturedEnd:origin+duration},videoId):null;
    if(withMusic && !backing)throw Error('缺少覆盖下载范围的背景音，请先准备对应范围的伴奏或背景音，再导出。独立人声仍可直接下载。');
    EchoAudioExport.plan(takes.map(t=>({...t,start:t.start-origin,end:t.end-origin,...(Number.isFinite(t.capturedEnd)?{capturedEnd:t.capturedEnd-origin}:{})})),duration);
    const token=++generation,id=videoId,title=currentVideoTitle();
    const {vocal:vocalVolume,backing:volume}=replayMix();
    mode='exporting';controls();status('正在本机合成 WAV，可点击停止取消…');
    try{
      const result=await EchoAudioExport.render({takes,duration,origin,backing,volume,vocalVolume,active:()=>token===generation && id===videoId});
      if(token!==generation || id!==videoId)return;
      downloadAudio(result.blob,EchoAudioExport.filename({title,videoId:id,start:origin,end:origin+duration,kind:withMusic?(takes.every(t=>t.kind==='song')?'mixed':'background'):'vocals',extension:'wav'}));
      status(result.gaps.length?'已下载合成音频，未录制的人声位置保留空白。':'合成完成，已开始下载。');
    }finally{if(token===generation){mode='idle';controls();}}
  }
  function exportTake(value){
    if(!value || value.capture!=='vocal' || value.withBacking)throw Error('这条旧版录音已经混入伴奏，请下载原文件。');
    const end=Number.isFinite(value.capturedEnd)?Math.min(value.end,value.capturedEnd):value.end;
    return exportAudio([value],end-value.start,value.start,true);
  }
  $('openSongRecording').onclick=()=>{if(mode!=='idle' || !songTake)return;setTake(songTake);showPage('recordings',true);};
  $('takeMixDownload').onclick=guarded(()=>exportTake(take));
  $('assembleSong').onclick=guarded(()=>{
    if(mode!=='idle')return;
    const sourceVideo=video(),duration=sourceVideo.duration;sourceVideo.pause?.();EchoAssembly.preview(assemblyTakes(),duration,assemblyChoices,EchoAudioExport);
    const {vocal:vocalVolume,backing:volume}=replayMix();
    assemblyContext={id:videoId,title:currentVideoTitle(),duration,token:++generation,takes:assemblyTakes(),mix:{vocalVolume,volume}};
    try{assembly.open({takes:assemblyContext.takes,duration,choices:assemblyChoices,withMusic:$('assemblyType').value==='mixed'});mode='assembly';controls();}
    catch(error){assemblyContext=null;throw error;}
  });
  $('prepareBacking').onclick=guarded(async()=>{
    if(mode!=='idle' || !hasBackingTools())return;
    const name=backingName();
    // Explicit generation takes priority over the optional cache lookup.
    backingRestoreRequest++;restoringBacking=false;
    karaokeIssue='';
    let r;
    try{r=selectedRange();}catch(error){karaokeIssue=error.message;controls();status(error.message);return;}
    if(serviceState==='online' && serviceMaxSeconds<r.end-r.start){
      karaokeIssue='当前运行的是旧版伴奏服务。请在服务终端按 Ctrl+C，再运行 ./start-karaoke.sh（Windows 使用 start-karaoke.ps1），最后点击“重新检测”。';
      $('karaokeHelp').open=true;controls();status('请重启旧版伴奏服务。');return;
    }
    if(serviceState==='offline'){
      karaokeIssue=`${name}尚未开始生成：本机服务未连接。请在项目根目录运行 bash start-karaoke.sh（Windows 使用 start-karaoke.ps1，详见本机服务安装说明），保持终端开启，再点击“重新检测”。`;
      $('karaokeHelp').open=true;controls();status(karaokeIssue);
      $('karaokeNotice').scrollIntoView?.({block:'nearest'});return;
    }
    if((r.model!==EchoKaraoke.DEFAULT_MODEL && !modelManagement) || (r.quality==='lossless' && !serviceLossless)){
      const context={id:videoId,token:generation};
      await checkKaraokeService();
      if(context.id!==videoId || context.token!==generation || mode!=='idle')return;
      const current=selectedRange();
      if(current.start!==r.start || current.end!==r.end || current.model!==r.model || current.quality!==r.quality)return;
      if(r.quality==='lossless' && !serviceLossless){karaokeIssue='无损音质需要新版服务。请重启本机伴奏服务，再点击重新检测。';controls();status(karaokeIssue);return;}
      if(r.model!==EchoKaraoke.DEFAULT_MODEL && !modelManagement){karaokeIssue='BandIt 需要新版本机服务，请在终端停止旧服务，再运行根目录启动脚本并重新检测。';controls();status(karaokeIssue);return;}
    }
    const id=videoId, token=++generation;
    settings.close();video().pause();mode='separating';controls();
    $('singDetails').scrollIntoView?.({block:'nearest'});
    $('karaokeProgress').hidden=false;$('karaokeProgress').removeAttribute('value');
    status(`正在准备${name}，请稍候…`);$('karaokeInfo').textContent='正在连接本机伴奏服务…';
    $('karaokeNotice').textContent='正在连接本机伴奏服务，请稍候…';$('karaokeNotice').hidden=false;
    let job;
    try {
      job=await karaokeRequest('start',{videoId:id,start:r.start,end:r.end,model:r.model,quality:r.quality});
      if(token!==generation){void karaokeRequest('cancel',{jobId:job.id}).catch(()=>{});return;}
      if(EchoKaraoke.qualityOf(job)!==r.quality){void karaokeRequest('cancel',{jobId:job.id}).catch(()=>{});throw Error('服务返回的音质与选择不一致，请更新并重启本机服务。');}
      activeKaraokeJob=job.id;
      $('karaokeNotice').hidden=true;
      while(token===generation && id===videoId){
        if(job.state==='error')throw Error(job.error || `${name}生成失败，请重试。`);
        if(job.state==='cancelled')throw Error(`${name}任务已停止，请重新生成。`);
        if(job.state==='ready')break;
        const text=EchoKaraoke.progressText(job,activity);
        if(Number.isFinite(job.progress))$('karaokeProgress').value=job.progress;
        else $('karaokeProgress').removeAttribute('value');
        status(`正在生成${name}，可随时停止。`);$('karaokeInfo').textContent=text;
        await new Promise(resolve=>setTimeout(resolve,1500));
        if(token!==generation)return;
        job=await karaokeRequest('status',{jobId:job.id});
      }
      if(token!==generation || id!==videoId)return;
      $('karaokeProgress').value=100;status(`正在加载${name}…`);$('karaokeInfo').textContent=EchoKaraoke.progressText(job,activity);
      const result=await loadBackingAudio(job,()=>token===generation && id===videoId);
      if(token!==generation || id!==videoId)return;
      const stored=await keepBacking({key:EchoKaraoke.key(id,r),videoId:id,model:job.model || r.model,quality:job.quality || r.quality,start:r.start,end:r.end,createdAt:Date.now(),blob:EchoKaraoke.blobFromBase64(result)});
      if(token!==generation || id!==videoId)return;
      $('useBacking').checked=true;backingPreferences[activity]=true;saveProgress();if(stored)status(`${name}已生成并保存，刷新后也可恢复。准备好后回到主区${isSinging()?'录唱':'配音'}。`);
    } catch(error) {
      if(token!==generation)return;
      karaokeIssue=error.message || `${name}生成失败，请重试。`;
      $('karaokeHelp').open=true;
      $('karaokeInfo').textContent='';status(`未能生成${name}，请查看按钮下方提示。`);
    } finally {
      if(modelManagement)void models.refresh().catch(()=>{});
      if(token===generation){activeKaraokeJob=null;$('karaokeProgress').hidden=true;mode='idle';controls();if(karaokeIssue)$('karaokeNotice').scrollIntoView?.({block:'nearest'});}
    }
  });
  $('previewBacking').onclick=guarded(async()=>{
    if(mode!=='idle' || !hasBackingTools())return;
    const r=selectedRange(), ready=backingFor(r);if(!ready)return;
    const v=video(), token=++generation, url=URL.createObjectURL(ready.blob);
    mode='backing';controls();saveVideo(v);v.muted=true;v.playbackRate=r.speed;
    try {
      await seek(v,r.start,token);if(token!==generation)return;
      const a=new Audio(url);audio=a;a.playbackRate=r.speed;a.volume=1;a.preservesPitch=true;
      const wait=()=>a.pause(), sync=()=>{
        if(token!==generation)return;
        a.currentTime=Math.max(0,v.currentTime-ready.start);
        void a.play().catch(()=>{if(token===generation){stop();status('伴奏无法播放，请重新生成。');}});
      };
      v.addEventListener('waiting',wait);v.addEventListener('playing',sync);
      let output;
      try {
        output=await EchoKaraoke.createBackingOutput(a,Number($('backingVolume').value));
        if(token!==generation)return;
        backingOutput=output;output.setVolume(Number($('backingVolume').value));
        status(`正在试听${backingName()}…`);await v.play();if(token!==generation)return;sync();
        await new Promise(resolve=>{
          playback.onCancel(resolve);a.onended=resolve;
          showVideoTransport(`${backingName()}试听`,v,r,elapsed=>{
            v.currentTime=r.start+elapsed*r.speed;
            a.currentTime=Math.max(0,v.currentTime-ready.start);
            playback.timeout(resolve,Math.max(0,(r.end-v.currentTime)/r.speed)*1000+15000);
          });
          playback.watchEnd(v,r.end,resolve);playback.timeout(resolve,EchoPractice.playbackTimeout(r));
        });
      } finally {v.removeEventListener('waiting',wait);v.removeEventListener('playing',sync);output?.dispose();if(backingOutput===output)backingOutput=null;}
      if(token===generation){finish();status('伴奏试听完成。');}
    } finally {URL.revokeObjectURL(url);}
  });
  async function deleteRecording(value) {
    if(!value || (mode!=='idle' && mode!=='replay')) return;
    if(mode==='replay')stop();
    const selectedId=take?.id===value.id ? undefined : take?.id;
    const id=videoId; mode='saving';controls();
    await storage.deleteTake(value.id);
    if(id!==videoId) return;
    deletedTake=value; $('undoDelete').hidden=false; mode='idle';
    await refreshHistory(selectedId); saveProgress(); status('已删除一个录音版本，可点击「撤销删除」恢复。');
  }
  $('deleteTake').onclick=guarded(()=>deleteRecording(take));
  $('undoDelete').onclick=guarded(async()=>{
    if(!deletedTake || mode!=='idle') return;
    const value=deletedTake,id=videoId;mode='saving';controls();
    await storage.saveTake(value);
    if(id!==videoId) return;
    deletedTake=null;$('undoDelete').hidden=true;mode='idle';await refreshHistory(value.id);status('已恢复录音。');
  });
  // Persist to the captured video even if YouTube navigated while recording.
  // UI updates are restricted to the video that is still open.
  async function saveRecording(value, {token, keepBusy, monitored, ownsUI}) {
    const id = value.videoId;
    if (ownsUI()) {
      if (value.kind === 'song') setSongTake(value);
      setTake(value);
      mode = keepBusy && token === generation ? 'practice' : 'idle';
      controls();
      saveProgress();
      status('录音完成，正在保存…');
    }
    try {
      await storage.saveTake(value);
      if (!ownsUI()) return;
      const request=++historyRequest;
      const values = await storage.listTakes(id);
      if (!ownsUI() || request!==historyRequest) return;
      videoHistory = values;
      renderHistory();
      if (token === generation || (take?.id === value.id && mode === 'idle')) {
        status(value.kind==='song'?(monitored?'演唱人声已保存，可单独下载或加伴奏导出。':'清唱人声已保存，可回听或下载。'):'配音完成，已加入本句录音版本。');
      }
    } catch {
      if (videoId === id && take?.id === value.id) status('录音已完成，但保存失败，请下载备份。');
    }
  }
  async function record({token = ++generation, keepBusy = false} = {}) {
    closeWord();
    const v=video(),selection=EchoSelection.resolve(selectionInput(v.duration));
    const r=selection.range,id=videoId,singingTake=isSinging();
    const ready=usesBacking()?backingFor(r):null;
    if(usesBacking() && !ready)throw Error(`请先为当前片段准备${backingName()}，或关闭「${isSinging()?'录唱时播放伴奏':'保留背景音'}」。`);
    deletedTake=null;$('undoDelete').hidden=true;
    const gainKey=singingTake?'sing':'speech',constraints=microphoneConstraints(singingTake);
    const active=()=>token===generation && id===videoId;
    let starting=true,vocalOffset=0,capturedEnd=r.start;
    const observePosition=()=>{if(Number.isFinite(v.currentTime))capturedEnd=Math.max(capturedEnd,Math.min(r.end,v.currentTime));};
    const onWaiting=()=>session.pause();
    const onPlaying=()=>{
      if(starting || !active() || !['recording','paused'].includes(session.state))return;
      void Promise.resolve(session.monitor?.sync()).then(()=>{if(active())session.resume();})
        .catch(()=>{if(active()){stop();status('伴奏播放失败，录音已停止，请重新生成伴奏。');}});
    };
    const session=EchoRecording.create({constraints,quality:recordingQuality,sidetone:sidetoneEnabled,sidetoneVolume,sidetoneMode,gainDb:gainPreferences[gainKey]?0:manualGainPreferences[gainKey],active,
      microphone:EchoMicrophone,env:globalThis,
      createMonitor:ready?()=>EchoKaraoke.createMonitor({blob:ready.blob,video:v,start:ready.start,speed:r.speed,volume:Number($('backingVolume').value)}):null,
      createMeter:input=>EchoLiveMeter.start({stream:input,container:$('liveMeter'),canvas:$('liveMeterCanvas'),value:$('liveMeterValue'),bar:$('liveMeterBar')}),
      onError:error=>{if(recordingSession===session && id===videoId){stop();status(error.message);}},
      onComplete:async result=>{
        v.removeEventListener('timeupdate',observePosition);
        v.removeEventListener('waiting',onWaiting);v.removeEventListener('playing',onPlaying);
        const ownsUI=()=>recordingSession===session && id===videoId;
        try {
          if(!result){if(ownsUI() && mode==='saving'){mode='idle';controls();}return;}
          if(id===videoId)observePosition();
          const value={id:crypto.randomUUID(),videoId:id,cueKey:selection.key,label:selection.label,...r,...result,createdAt:Date.now(),capture:'vocal',
            autoGainControl:constraints.autoGainControl,vocalOffset,...(capturedEnd>r.start?{capturedEnd}:{}),...(ready?{backingKey:ready.key,backingModel:EchoKaraoke.modelOf(ready),backingQuality:EchoKaraoke.qualityOf(ready)}:{}),...(singingTake?{kind:'song'}:{})};
          await saveRecording(value,{token,keepBusy,monitored:!!ready,ownsUI});
        } finally {if(recordingSession===session)recordingSession=null;}
      }
    });
    recordingSession=session;
    mode='permission';controls();status('正在请求麦克风权限…');
    if(!await session.prepare())return false;
    if(!active())return false;
    saveVideo(v);v.playbackRate=r.speed;
    if(leadInStart(r)<r.start)session.startMeter();
    const hadLeadIn=await playRecordingLeadIn(v,r,token);
    if(!active())return false;
    v.muted=true;
    await seek(v,r.start,token,hadLeadIn);
    if(!active())return false;
    // Every mode starts capture before playback; startup latency must not
    // consume the selected range. The offset records any microphone pre-roll.
    if(!session.start())return false;
    const clock=()=>globalThis.performance?.now?.() ?? Date.now(),captureStartedAt=clock();
    mode='recording';controls();session.startMeter();
    status('录音已启动，正在准备同步播放…');
    v.addEventListener('waiting',onWaiting);v.addEventListener('playing',onPlaying);v.addEventListener('timeupdate',observePosition);
    if(ready){
      await session.monitor.sync(r.start);
      vocalOffset=Math.max(0,(clock()-captureStartedAt)/1000-((session.monitor.position?.() ?? r.start)-r.start)/r.speed);
    }
    if(!active())return session.completed;
    await v.play();
    if(!active())return session.completed;
    if(!ready)vocalOffset=Math.max(0,(clock()-captureStartedAt)/1000-(v.currentTime-r.start)/r.speed);
    starting=false;
    if(session.state==='paused'){await session.monitor?.resume?.();if(!active())return session.completed;session.resume();}
    const position=session.monitor?.position?.();
    if(Number.isFinite(position) && Math.abs(v.currentTime-position)>0.15)v.currentTime=position;
    $('sidetoneLatency').textContent=EchoMicrophone.describeMonitoring(session.sidetoneInfo);
    status(ready?'● 正在录制人声，伴奏仅在耳机播放…':singingTake?'● 正在录制清唱人声…':'● 正在配音，视频原声已静音…');
    showVideoTransport('录音',v,r);
    const endRecording=()=>{if(!active())return;cancelPlayback();restoreVideo();mode='saving';controls();session.stop();};
    playback.watchEnd(v,r.end,endRecording);playback.timeout(endRecording,EchoPractice.playbackTimeout(r));
    return session.completed;
  }
  async function replay(token, keepBusy = false) {
    closeWord();
    if (!take) return;
    const t = take, v = video(); saveVideo(v); v.muted = true; v.playbackRate = t.speed;
    await seek(v, t.start, token);
    if (token !== generation) return;
    audio = new Audio(t.url);
    const a = audio;
    let accompaniment=null, voiceOutput=null;
    replayTake=t;replayBackingReady=false;replayVoiceMax=2;
    $('replayVocalVolume').max='2';
    const hasBackground=EchoKaraoke.canReplayBacking(t);
    const vocalOffset=t.capture==='vocal'?(t.vocalOffset || 0):0;
    const videoPosition=()=>Math.min(t.end,t.start+Math.max(0,(a.currentTime || 0)-vocalOffset)*t.speed);
    // The recording is the playback clock: never seek past its opening to catch
    // up with a video that started earlier or resumed from buffering.
    let started=false,buffering=false;
    const onWaiting = () => {if(started){buffering=true;a.pause();accompaniment?.pause();}};
    const onPlaying = () => {
      if(audio!==a || !started || !buffering)return;
      buffering=false;
      const position=videoPosition();
      if(Math.abs(v.currentTime-position)>0.15)v.currentTime=position;
      void a.play().then(()=>accompaniment?.sync()).catch(()=>{if(audio===a){stop();status('录音无法播放，请重试或下载录音。');}});
    };
    v.addEventListener('waiting', onWaiting); v.addEventListener('playing', onPlaying);
    let ended=false,resolvePlayback;
    const playbackDone=new Promise(resolve=>{resolvePlayback=resolve;});
    a.onended=()=>{ended=true;accompaniment?.pause();resolvePlayback();};
    try {
      try {
        voiceOutput=await EchoKaraoke.createAudioOutput(a,replayMix().vocal,globalThis);
        if(token!==generation){voiceOutput.dispose();return;}
        replayVoiceOutput=voiceOutput;
      } catch {
        if(token!==generation)return;
        replayVoiceMax=1;$('replayVocalVolume').max='1';
        $('replayVocalVolume').value=Math.min(1,replayMix().vocal);a.volume=replayMix().vocal;
      }
      if(hasBackground) {
        const ready=EchoKaraoke.backingForTake(savedBackings,t,videoId);
        $('replayWithBacking').disabled=!ready;
        $('replayMusicOption').title=ready?'取消勾选可只听人声':'未找到对应伴奏或背景音，请重新提取后再回听。';
        if(ready) {
          try {
            const monitor=await EchoKaraoke.createMonitor({blob:ready.blob,video:v,start:ready.start,speed:t.speed,volume:replayMix().backing});
            if(token!==generation){monitor.dispose();return;}
            accompaniment=EchoKaraoke.followRecording({monitor,voice:a,take:t,enabled:$('replayWithBacking').checked,
              onError:()=>{if(token===generation){replayBackingReady=false;renderMixControls();status('背景音无法播放，当前仅回听人声；可重新提取后再试。');}}});
            replayMonitor=accompaniment;replayBackingReady=true;
          } catch(error) {
            if(token!==generation)return;
            $('replayWithBacking').disabled=true;
            status('背景音无法加载，当前仅回听人声；可重新提取后再试。');
          }
        } else if($('replayWithBacking').checked)status('未找到对应伴奏或背景音，当前仅回听人声；可重新提取后再试。');
      }
      a.preload='auto';
      await a.play();
      if (token !== generation) return;
      await accompaniment?.sync();
      if (token !== generation) return;
      const duration=()=>Number.isFinite(a.duration) && a.duration>0?a.duration:((t.capturedEnd ?? t.end)-t.start)/t.speed+(t.vocalOffset || 0);
      transport.show({label: '录音回放', position: () => a.currentTime, duration, seekTo: async elapsed => {
        a.currentTime=elapsed;
        v.currentTime=videoPosition();
        await accompaniment?.sync();
        if(token!==generation)return;
        playback.watchEnd(v,t.end,()=>v.pause());
        playback.timeout(resolvePlayback,Math.max(0,duration()-elapsed)*1000+15000);
        if(v.currentTime<t.end)await v.play();
      }});
      renderMixControls();
      playback.onCancel(resolvePlayback);
      if(!ended){
        await v.play();
        if (token !== generation) return;
        started=true;
        const position=videoPosition();
        if(!ended && Math.abs(v.currentTime-position)>0.15)v.currentTime=position;
        // A partially recorded take or delayed video must not cut off the file.
        playback.watchEnd(v, t.end, () => v.pause());
        playback.timeout(resolvePlayback, EchoPractice.playbackTimeout(t));
      }
      await playbackDone;
    } finally {
      v.removeEventListener('waiting', onWaiting);v.removeEventListener('playing', onPlaying);
      accompaniment?.dispose();if(replayMonitor===accompaniment)replayMonitor=null;
      voiceOutput?.dispose();if(replayVoiceOutput===voiceOutput)replayVoiceOutput=null;
    }
    if (token === generation) { if (keepBusy) { cancelPlayback(); restoreVideo(); mode = 'practice'; controls(); } else {finish();status('回听结束。');} }
  }
  async function analyzeTake(value) {
    const request = ++analysisRequest;
    $('analysis').hidden = !value;
    if (!value) return;
    $('analysisText').textContent = '正在本机分析录音…';
    const canvas = $('waveform'), ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let context;
    try {
      context = new AudioContext();
      const decoded = await context.decodeAudioData(await value.blob.arrayBuffer());
      if (request !== analysisRequest) return;
      const mono = new Float32Array(decoded.length);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const channel = decoded.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
      }
      const result = EchoAudioAnalysis.analyze(mono, decoded.sampleRate);
      ctx.fillStyle = '#895d2c';
      for (const pause of result.pauses) ctx.fillRect(pause.start/result.duration*canvas.width,0,(pause.end-pause.start)/result.duration*canvas.width,canvas.height);
      ctx.strokeStyle = '#a5e6d5'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const from = Math.floor(x/canvas.width*result.peaks.length), to = Math.max(from+1,Math.floor((x+1)/canvas.width*result.peaks.length));
        let peak = 0; for (let i = from; i < to; i++) peak = Math.max(peak,result.peaks[i] || 0);
        const height = Math.min(1,peak)*canvas.height/2;
        ctx.moveTo(x,canvas.height/2-height); ctx.lineTo(x,canvas.height/2+height);
      }
      ctx.stroke();
      const ranges = result.pauses.slice(0,8).map(p=>`${p.start.toFixed(1)}–${p.end.toFixed(1)} 秒`).join('、');
      $('analysisText').textContent = result.silent ? '录音整体音量很低，请检查麦克风或靠近一些。' : `录音 ${result.duration.toFixed(1)} 秒；检测到 ${result.pauses.length} 处 ≥0.4 秒的低音量停顿。${ranges ? '\n停顿位置：'+ranges : ''}\n停顿可能是自然换气或句间停顿，请结合原声回听。`;
    } catch { if (request === analysisRequest) $('analysisText').textContent = '浏览器暂时无法解码这次录音，仍可回放或下载。'; }
    finally { if (context) await context.close().catch(()=>{}); }
  }
  $('recordingDetails').ontoggle=()=>{
    if($('recordingDetails').open)void analyzeTake(take);
    else analysisRequest++;
  };
  function closeWord() { wordRequest++; selectedWord = null; $('wordcard').hidden = true; window.speechSynthesis?.cancel(); }
  async function lookupWord(word) {
    if (mode !== 'idle' || contentLanguage()!=='en') return;
    selectedWord = EchoDictionary.normalize(word);
    if (!selectedWord) return;
    const request = ++wordRequest;
    try { video().pause(); } catch {}
    $('wordcard').hidden = false; $('wordTitle').textContent = word; $('phonetic').textContent = '';
    $('definitions').textContent = '正在查词…';
    $('wordcard').scrollIntoView?.({block:'nearest'});
    try {
      const result = await chrome.runtime.sendMessage({type:'echo-dictionary',word:selectedWord});
      if (request !== wordRequest) return;
      if (!result?.entry) throw Error(result?.error || '无法连接词典，请重新加载插件及视频页。');
      const entry = result.entry;
      $('phonetic').textContent = entry.phonetic;
      $('definitions').replaceChildren();
      for (const meaning of entry.meanings) {
        const p = document.createElement('p');
        p.textContent = `${meaning.partOfSpeech} · ${meaning.definition}${meaning.example ? ' 例：'+meaning.example : ''}`;
        $('definitions').append(p);
      }
    } catch (error) { if (request === wordRequest) $('definitions').textContent = error.message; }
  }
  $('closeWord').onclick = closeWord;
  $('speakWord').onclick = () => {
    if (!selectedWord || mode !== 'idle') return;
    if (!window.speechSynthesis) { $('definitions').textContent = '当前浏览器不支持朗读。'; return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(selectedWord); utterance.lang = 'en-US'; utterance.rate = 0.85;
    const voices = window.speechSynthesis.getVoices().filter(v=>v.lang.startsWith('en'));
    utterance.voice = voices.find(v=>v.localService && v.lang === 'en-US') || voices.find(v=>v.localService) || voices[0] || null;
    utterance.onerror = () => { if (selectedWord === utterance.text) $('phonetic').textContent = '朗读失败，请检查浏览器语音设置。'; };
    window.speechSynthesis.speak(utterance);
  };
  function contentLanguage() {
    const sample=cues.slice(0,32).map(c=>c.sourceText ?? c.text).join(' ');
    return EchoLanguages.resolve($('contentLanguage').value,sample);
  }
  function captionView(cue){return EchoLanguages.view(cue,contentLanguage(),$('captionLayout').value);}
  function captionText(cue){return cue ? captionView(cue).primary : '';}
  function updateLanguageInfo(){
    const language=contentLanguage();
    $('languageInfo').textContent=`${$('contentLanguage').value==='auto'?'文本建议（可手动更正）':'已选择'}：${EchoLanguages.languages[language]} · ${language==='en'?'支持英文点词查释义':'保留原文；该语言查词暂未接入'}`;
  }
  function renderCueList(){
    $('list').replaceChildren();
    const query=$('transcriptSearch').value.trim().toLowerCase();let matches=0;
    cues.forEach((cue,i)=>{
      const text=captionText(cue);if(query && !text.toLowerCase().includes(query))return;
      matches++;const button=document.createElement('button');button.className='cue';button.textContent=`${Math.floor(cue.start/60)}:${String(Math.floor(cue.start%60)).padStart(2,'0')}  ${text}`;
      button.onclick=()=>select(i,true);button.disabled=mode!=='idle';button.classList.toggle('active',i===index);$('list').append(button);
    });
    $('transcriptSearch').hidden=!cues.length;$('transcriptNoMatches').hidden=!cues.length || matches>0;
  }
  $('transcriptSearch').oninput=renderCueList;
  function languageChanged(){
    renderParagraphOptions();updateLanguageInfo();updateCaption();renderCueList();renderHistory();
    if(take)$('recordingText').textContent=recordingText(take);
    saveProgress();
  }
  $('contentLanguage').onchange=languageChanged;$('captionLayout').onchange=languageChanged;
  function attachCaptionVideo(v) {
    if(v===captionVideo || typeof v?.addEventListener!=='function')return;
    detachCaptionVideo();captionVideo=v;
    captionEvents.forEach(name=>v.addEventListener(name,onCaptionTime));
  }
  function detachCaptionVideo() {
    if(captionVideo)captionEvents.forEach(name=>captionVideo.removeEventListener(name,onCaptionTime));
    captionVideo=null;captionSignature='';
  }
  function onCaptionTime(event) {syncCaptions(event?.type==='seeking' || event?.type==='seeked');}
  function syncCaptions(force=false) {
    if(!$('followCaptions').checked || !captionVideo || !cues.length)return;
    if(!force && captionVideo.paused!==false && !['recording','replay','original','backing','practice','loop','compare'].includes(mode))return;
    const state=EchoPractice.captionFrame(cues,captionVideo.currentTime);
    const signature=`${state.index}:${state.phase}`;
    if(signature!==captionSignature){captionSignature=signature;renderCaption(state.index,state.phase,true);}
    if(state.phase==='upcoming' && !$('hideText').checked){
      const seconds=Math.max(0,Math.ceil(cues[state.index].start-captionVideo.currentTime));
      $('captionPhase').textContent=`即将开始 · ${seconds} 秒`;
    }
  }
  function renderCaption(shownIndex, phase='selected', animate=false) {
    closeWord();
    const cue=cues[shownIndex], hidden=cues.length>0 && $('hideText').checked;
    const motion=animate && !hidden && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(captionGhost){captionGhost.remove();captionGhost=null;}
    const outgoing=motion ? $('caption').cloneNode?.(true) : null;
    $('caption').replaceChildren();
    if(hidden)$('caption').textContent=isSinging()?'••• 跟着节奏唱出来':'••• 听节奏，试着说出来';
    else {
      const raw=cue?.text || (isSinging()?'读取台词或导入字幕后，录唱时会自动翻句。':'标记片段后，点击开始配音。');
      const text=cue ? captionView(cue).primary : raw;
      for(const part of text.split(/([A-Za-z]+(?:['’‘-][A-Za-z]+)*)/)){
        if(contentLanguage()==='en' && EchoDictionary.normalize(part)){
          const button=document.createElement('button');button.className='word';button.textContent=part;
          button.title='查看发音和释义';button.onclick=()=>void lookupWord(part);button.disabled=mode!=='idle';$('caption').append(button);
        }else $('caption').append(document.createTextNode(part));
      }
    }
    $('caption').setAttribute('data-phase',phase);
    $('captionPrevious').textContent=hidden?'':captionText(cues[shownIndex-1]);
    $('captionNext').textContent=hidden?'':captionText(cues[shownIndex+1]);
    $('captionPrevious').hidden=hidden || !cues[shownIndex-1];$('captionNext').hidden=hidden || !cues[shownIndex+1];
    $('captionPhase').textContent=hidden?'':phase==='upcoming'?'即将开始':phase==='active'?`当前${isSinging()?'歌词':'台词'} · ${shownIndex+1} / ${cues.length}`:phase==='ended'?(isSinging()?'歌词已结束':'台词已结束'):'';
    const parts=captionView(cue);
    $('translation').textContent=parts.reference;
    $('referenceToggle').hidden=!parts.reference;
    $('translation').hidden=hidden || !$('showChinese').checked || !parts.reference;
    $('rawDetails').hidden=hidden || !parts.separated;$('rawCaption').textContent=hidden?'':parts.original;
    if(motion){
      if(outgoing){
        outgoing.removeAttribute('id');outgoing.setAttribute('aria-hidden','true');outgoing.inert=true;
        outgoing.style.cssText='position:absolute;inset:0;pointer-events:none';
        $('caption').parentElement.append(outgoing);captionGhost=outgoing;
        const fade=outgoing.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-7px)'}],{duration:180,easing:'ease-out',fill:'forwards'});
        fade.finished.catch(()=>{}).then(()=>{outgoing.remove();if(captionGhost===outgoing)captionGhost=null;});
      }
      for(const id of ['captionPrevious','caption','captionNext']){
        const element=$(id);element.getAnimations?.().forEach(a=>a.cancel());
        element.animate?.([{opacity:0,transform:'translateY(5px)'},{transform:'translateY(0)'}],{duration:200,easing:'ease-out'});
      }
    }
  }
  function updateCaption() {
    updateLanguageInfo();captionSignature='';renderCaption(index);
    $('practiceSetup').hidden=cues.length>0;$('captionOptions').hidden=!cues.length;updateSummaries();
    $('position').textContent=index>=0 ? `${index+1} / ${cues.length}` : '手动片段';
    syncCaptions();
  }
  $('followCaptions').onchange=()=>{updateCaption();saveProgress();};
  document.addEventListener('play',event=>{
    if(event.target?.matches?.('video.html5-main-video')){attachCaptionVideo(event.target);syncCaptions(true);}
  },true);
  function select(i, fromList=false) {
    if (mode !== 'idle' || !cues[i]) return;
    index = i;clipRangeAdjusted=false; if(isParagraph())syncParagraphBounds();else{const range=EchoSelection.clipRange(cues,i,cues[i].start,cues[i].end);$('start').value = range.start.toFixed(2); $('end').value = range.end.toFixed(2);}
    if(fromList && !isParagraph()){$('practiceScope').value='clip';karaokeIssue='';}
    updateCaption(); chooseCurrentTake();updateSummaries();saveProgress();showPage('practice');renderCueList();
    if(fromList){$('record').focus();}
  }
  function displayCues(next, preferredIndex = 0) {
    cues = next.map(c=>({...c,key:EchoStorage.cueKey(c)})); index = -1; $('list').replaceChildren();
    renderParagraphOptions();
    $('transcriptSearch').value='';
    $('transcriptEmpty').hidden = next.length > 0;
    renderCueList();
    if (cues.length && preferredIndex >= 0) select(Math.min(preferredIndex,cues.length-1)); else {updateCaption();chooseCurrentTake();saveProgress();}
  }
  function rememberBounds() {
    clipRangeAdjusted=true;updateSummaries();
    // Recording boundaries must not rewrite or reorder the original subtitle timeline.
    chooseCurrentTake(); saveProgress();
  }
  for (const [id, edge, delta] of [['startEarlier','start',-.2],['startLater','start',.2],['endEarlier','end',-.2],['endLater','end',.2]]) {
    $(id).onclick = guarded(() => {
      const next = EchoPractice.nudge(Number($('start').value), Number($('end').value), edge, delta, video().duration);
      $('start').value = next.start.toFixed(2); $('end').value = next.end.toFixed(2); rememberBounds();
    });
  }
  $('start').onchange = rememberBounds; $('end').onchange = rememberBounds;
  $('showChinese').onchange = () => {updateCaption();saveProgress();};
  function pauseBetween(ms, token) {
    if (token !== generation) return Promise.resolve();
    return playback.delay(ms);
  }
  $('loop').onclick = guarded(async () => {
    const r = selectedRange(), token = ++generation, count = Number($('loopCount').value);
    settings.close();closeWord(); mode = 'loop'; controls();
    await EchoPractice.runLoop({count, active:()=>token === generation,
      listen: async round => { status(`单句循环 · 第 ${round} 次${count ? ' / '+count : ''}`); await original(r,token); },
      gap:()=>pauseBetween(600,token)});
    if (token === generation) { finish(); status('循环播放完成。'); }
  });
  $('autoPractice').onclick = guarded(async () => {
    selectedRange();settings.close(); const token = ++generation, autoNext = $('practiceScope').value==='clip' && $('autoNext').checked, seconds = Number($('prepSeconds').value);
    closeWord(); mode = 'practice'; controls(); status('首次练习：正在检查麦克风权限…');
    // Obtain permission before the listening/preparation stages so its dialog
    // cannot consume the learner's preparation time. Release immediately.
    const mic = await EchoMicrophone.requestStream(navigator.mediaDevices,microphoneConstraints());
    mic.getTracks().forEach(track=>track.stop());
    if (token !== generation) return;
    await EchoPractice.runPractice({active:()=>token === generation,
      listen:async()=>{ status(`自动跟读 · 听原声${index >= 0 ? ' · 第 '+(index+1)+' 句' : ''}`); await original(selectedRange(),token); },
      prepare:async()=>{ for(let n=seconds;n>0 && token===generation;n--) { status(`准备配音 · ${n} 秒`); await pauseBetween(1000,token); } },
      record:()=>record({token,keepBusy:true}),
      replay:async()=>{ status('自动跟读 · 回放你的配音'); await replay(token,true); },
      advance:()=>{ if (!autoNext || index < 0 || index+1 >= cues.length || (usesBacking() && !backingFor(cues[index+1]))) return false; mode='idle'; select(index+1); mode='practice'; controls(); return true; }
    });
    if (token === generation) { finish(); status('自动跟读完成。可以重练或下载这次录音。'); }
  });
  $('close').onclick = () => { settings.close();tools.close();library.close(true);closeWord(); stop(); host.style.display = 'none'; };
  root.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    event.preventDefault();event.stopPropagation();
    if(tools.isOpen()){tools.close();return;}
    if(assembly.isOpen()){assembly.close();return;}
    if(models.isOpen()){models.close();return;}
    if(settings.isOpen()){settings.close();return;}
    if(library.isOpen()){library.escape();return;}
    if(!$('wordcard').hidden)closeWord();
    else if(mode!=='idle')stop();
    else $('close').click();
  });
  // Modified shortcuts leave YouTube's unmodified playback keys untouched.
  document.addEventListener('keydown',event=>{
    if(host.style.display==='none' || assembly.isOpen() || models.isOpen() || library.isOpen() || tools.isOpen() || settings.isOpen())return;
    if(event.key==='Escape' && mode!=='idle'){event.preventDefault();event.stopPropagation();stop();return;}
    const action=EchoPracticeTools.shortcut(event);if(!action)return;
    if(action==='help'){if(mode!=='idle')return;event.preventDefault();event.stopPropagation();tools.open('help');return;}
    const target=action==='record' && ['recording','lead-in'].includes(mode)?$('stop'):action==='replay' && currentPage==='recordings'?$('reviewReplay'):$(action);
    if(!target || target.disabled || target.hidden)return;
    event.preventDefault();event.stopPropagation();target.click();
  });
  $('hideText').onchange = () => { updateCaption(); $('list').style.display = $('hideText').checked ? 'none' : ''; saveProgress(); };
  $('prev').onclick = () => select(index - 1,true); $('next').onclick = () => select(index + 1,true);
  $('markStart').onclick = guarded(() => { $('start').value = video().currentTime.toFixed(2); index = -1; updateCaption();chooseCurrentTake();saveProgress(); });
  $('markEnd').onclick = guarded(() => { $('end').value = video().currentTime.toFixed(2); index = -1; updateCaption();chooseCurrentTake();saveProgress(); });
  $('original').onclick = guarded(async () => { const r = selectedRange(), token = ++generation; mode = 'original'; controls(); status('正在播放原声…'); await original(r, token); if (token === generation) { finish();if($('practiceScope').value==='clip')updateCaption();status('原声播放完成。'); } });
  $('record').onclick = guarded(() => {
    if(mode!=='idle')return;
    if(!hasBackingTools())return record();
    let r;try{r=selectedRange();}catch(error){karaokeIssue=error.message;controls();$('adjustClipBounds').click();status('请先调整练习范围。');return;}
    if(usesBacking() && !backingFor(r)){$('openBacking').click();status(`请先为当前练习范围准备${backingName()}，再开始${isSinging()?'录唱':'配音'}。`);return;}
    return record();
  }); $('stop').onclick = stop;
  $('replay').onclick = guarded(async () => { if(isSinging())return songTake && playRecording(songTake);const token = ++generation; mode = 'replay'; controls(); status('正在随画面播放你的配音…'); await replay(token); });
  $('compare').onclick = guarded(async () => { if (!take) return; const token = ++generation; mode = 'compare'; controls(); status('对比 1/2：原声'); await original(take, token, false); if (token !== generation) return; status('对比 2/2：你的配音'); await replay(token); });
  $('import').onclick = () => { if(mode==='idle')$('file').click(); };
  $('file').onchange = guarded(async () => {
    const file=$('file').files[0];$('file').value='';
    if(!file || mode!=='idle')return;
    if(file.size>5e6)throw Error('字幕文件请小于 5 MB。');
    const token=++generation,id=videoId;mode='importing';controls();status('正在导入字幕…');
    try{
      const next=EchoSubtitles.parse(await file.text());
      if(token!==generation || id!==currentId())return;
      if(!next.length)throw Error('未找到有效字幕，请使用 SRT 或 VTT 文件。');
      mode='idle';loadedCaptionSource='导入的字幕文件';renderCaptionSources();displayCues(next);status(`已导入 ${next.length} 句台词。`);
    }finally{if(token===generation){mode='idle';controls();}}
  });
  function captionTrackLabel(track){return ({'zh-Hans':'中文（简体）','zh-Hant':'中文（繁体）',en:'英语',ja:'日语',ko:'韩语'})[track.language] || track.name;}
  function renderCaptionSources(){
    const options=[['auto','跟随 YouTube 当前字幕'],...captionTracks.map(t=>[t.id,`${captionTrackLabel(t)}${t.generated?' · 自动生成':''}`])];
    if(captionSource!=='auto' && !captionTracks.some(t=>t.id===captionSource))options.push([captionSource,captionSourceName || '上次选择的字幕（待刷新）']);
    $('captionSource').replaceChildren(...options.map(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;return option;}));
    $('captionSource').value=captionSource;
    $('captionSourceInfo').textContent=loadedCaptionSource?`已加载：${loadedCaptionSource}。切换来源后会加载新字幕，录音仍保留。`:'可刷新语言后选择字幕。内容语言只影响文本处理。';
  }
  async function captionsRequest(action,extra={}){
    const result=await captionClient.request({action,videoId,...extra});
    if(result?.error)throw Error(result.error);
    if(!result)throw Error('字幕服务未响应，请重新加载扩展并刷新视频。');
    return result;
  }
  async function refreshCaptionTracks(refresh=false){
    const id=videoId,request=++captionListRequest;
    const result=await captionsRequest('list',{refresh});
    if(id!==videoId || request!==captionListRequest)return null;
    captionTracks=result.tracks || [];renderCaptionSources();return captionTracks;
  }
  $('refreshCaptionTracks').onclick=guarded(async()=>{
    if(mode!=='idle')return;
    const token=++generation;mode='reading';controls();status('正在查找此视频的字幕语言…');
    try{const tracks=await refreshCaptionTracks(true);if(token===generation && tracks)status(tracks.length?`找到 ${tracks.length} 个字幕轨道，请在“字幕来源”中选择。`:'此视频未返回可用字幕轨道，可尝试读取当前文字记录或导入字幕。');}
    finally{if(token===generation){mode='idle';controls();}}
  });
  $('captionSource').onchange=()=>{
    if(mode!=='idle')return;
    captionSource=$('captionSource').value;
    const selected=captionTracks.find(t=>t.id===captionSource);captionSourceName=selected?captionTrackLabel(selected):'';
    saveProgress();settings.close();void $('read').onclick();
  };
  $('read').onclick = guarded(async () => {
    if(mode!=='idle')return;
    const v=video(),token=++generation,id=videoId,source=captionSource,page=currentPage;
    const cancelled=()=>token!==generation || id!==currentId();
    mode='reading';controls();status('正在读取视频字幕…');
    try{
      let track=null,next,sourceLabel='YouTube 当前文字记录';
      if(source==='auto'){
        const current=await EchoCaptionTracks.currentTrack(document,id);
        if(cancelled())return;
        if(current){
          const tracks=await refreshCaptionTracks();if(cancelled())return;
          track=tracks?.find(t=>t.id===current.id) || tracks?.find(t=>t.language===current.language && t.generated===current.generated);
          if(!track)throw Error('未找到播放器当前选择的字幕轨道，请刷新语言后手动选择。');
        }
      }else{
        const tracks=await refreshCaptionTracks();if(cancelled())return;
        track=tracks?.find(t=>t.id===source);
        if(!track)throw Error('所选字幕已不可用，请刷新语言后重新选择；原有歌词仍保留。');
      }
      if(track){
        status(`正在读取 ${captionTrackLabel(track)} 字幕…`);
        const result=await captionsRequest('read',{trackId:track.id,duration:v.duration});
        if(cancelled())return;
        next=result.cues;sourceLabel=captionTrackLabel(track)+(track.generated?' · 自动生成':'');
        if(!next?.length)throw Error('所选轨道没有可用字幕，原有歌词仍保留。');
      }else{
        next=await EchoTranscript.read({doc:document,duration:v.duration,cancelled,progress:status});
      }
      if(!next || cancelled())return;
      mode='idle';loadedCaptionSource=sourceLabel;renderCaptionSources();displayCues(next);showPage(page);
      status(`已读取 ${next.length} 句 · ${sourceLabel}。${track?'':'末句终点为估算值，可手动调整。'}`);
    }finally{if(token===generation){mode='idle';controls();}}
  });
  $('search').onclick = () => { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent($('query').value || ({'zh':'中文 歌词','ja':'日本語 字幕 歌詞','ko':'한국어 자막 가사','en':'english conversation subtitles'}[contentLanguage()] || 'subtitles lyrics'))}`, '_blank', 'noopener'); };
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'echo-toggle') { const open = host.style.display === 'none'; host.style.display = open ? 'block' : 'none'; if (!open) {settings.close();tools.close();library.close(true);stop();} } });
  function resetVideo(id) {
    settings.close();tools.close();favorite=false;favoriteRequest++;clipRangeAdjusted=false;
    library.close(true);
    stop();
    recordingSession=null;
    detachCaptionVideo();
    backingRestoreRequest++;
    restoringBacking = false;
    karaokeIssue = '';
    activity = 'speech';qualityPreferences={speech:'standard',sing:'standard'};modelPreferences={speech:EchoKaraoke.DEFAULT_MODEL,sing:EchoKaraoke.DEFAULT_MODEL};backingPreferences={speech:false,sing:true};scopePreferences={speech:'clip',sing:'whole'};paragraphFirst=0;paragraphLast=1;assemblyChoices=[];
    captionTracks=[];captionListRequest++;captionSource='auto';captionSourceName='';loadedCaptionSource='';renderCaptionSources();
    $('contentLanguage').value = 'auto';
    $('captionLayout').value = 'original';
    $('hideText').checked=false;$('showChinese').checked=false;$('followCaptions').checked=true;
    $('list').style.display='';
    renderActivity();
    savedBackings = [];
    $('loopCount').value='3';$('prepSeconds').value='3';$('autoNext').checked=false;
    $('leadInMode').value='none';$('leadInSeconds').value=3;
    $('practiceScope').value = 'clip';
    $('backingVolume').value = 1;
    $('replayVocalVolume').value=1;$('replayBackingVolume').value=1;$('replayWithBacking').checked=true;replayVoiceMax=2;
    setSongTake(null);
    $('useBacking').checked = false;
    $('karaokeInfo').textContent = '已切换视频，请为新片段生成伴奏。';
    restoring = true;
    videoId = id;void refreshFavorite();
    savedTitle = '';
    historyRequest++;
    videoHistory = [];
    deletedTake = null;
    $('undoDelete').hidden = true;
    setTake(null);
    displayCues([]);
    $('start').value = 0;
    $('end').value = 5;
    updateSummaries();
  }
  document.addEventListener('yt-navigate-finish', () => {
    const id = currentId();
    if (id === videoId) return;
    resetVideo(id);
    status('已切换视频，请重新选择台词或片段。');
    if (id) void loadVideo(id);
    else restoring = false;
  });
  window.addEventListener('pagehide',()=>{inputDeviceRequest++;globalThis.navigator?.mediaDevices?.removeEventListener?.('devicechange',onInputDevicesChanged);saveProgress();settings.close();tools.close();library.close(true);stop();detachCaptionVideo();});
  // Restore once; changing activities must not reset the user's expanded sections.
  const foldPreferenceKey='echo-folds-v1';
  let foldPreferences={};
  try{const saved=JSON.parse(window.localStorage.getItem(foldPreferenceKey));if(saved && typeof saved==='object')foldPreferences=saved;}catch{}
  for(const id of ['clipSettings','recordingDetails','mixControls']){
    const fold=$(id);
    fold.open=typeof foldPreferences[id]==='boolean'?foldPreferences[id]:false;
    fold.addEventListener('toggle',()=>{
      foldPreferences[id]=fold.open;
      try{window.localStorage.setItem(foldPreferenceKey,JSON.stringify(foldPreferences));}catch{}
    });
  }
  void refreshInputDevices();
  renderClipOptions();attachCaptionVideo(document.querySelector('video.html5-main-video'));renderActivity();controls(); if(videoId) void loadVideo(videoId); else restoring=false;
})();
