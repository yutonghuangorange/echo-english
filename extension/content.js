(() => {
  if (document.getElementById('echo-practice-host')) return;
  const host = document.createElement('div');
  host.id = 'echo-practice-host';
  host.style.cssText = 'position:fixed;right:20px;top:80px;z-index:2147483647;display:none;';
  document.documentElement.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box} :host{font:14px/1.5 system-ui,-apple-system,sans-serif;color:#edf2f7} [hidden]{display:none!important}
    button,input,select{font:inherit}button,a,summary{cursor:pointer}button{color:inherit;border:1px solid #334252;background:#202c39;border-radius:10px;padding:10px 12px;transition:background .15s}button:hover{background:#2f4152}button:disabled{opacity:.38;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #b3eedb;outline-offset:3px}
    .panel{width:384px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 100px);display:flex;flex-direction:column;background:#131d27;border:1px solid #34414d;border-radius:20px;box-shadow:0 24px 70px #0009;overflow:hidden}
    header{padding:19px 22px 14px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}h1{font-size:22px;letter-spacing:.5px;margin:0;font-weight:650}h1 small{font-size:12px;letter-spacing:0;font-weight:400;color:#91a5b6;margin-left:8px}.tag{font-size:9px;letter-spacing:2px;color:#90c9b9;margin-bottom:3px}.close{padding:4px 10px;border:0;background:transparent;color:#91a5b6;font-size:22px}
    .tabs{display:flex;padding:0 20px;gap:20px;border-bottom:1px solid #2b3946;flex-shrink:0}.tabs button{background:transparent;border:0;border-radius:0;padding:10px 1px 12px;color:#8fa1b2;font-size:13px;border-bottom:2px solid transparent}.tabs button[aria-selected="true"]{color:#b3eedb;border-bottom-color:#b3eedb}
    .pages{overflow:auto;min-height:0;padding:20px 22px;scrollbar-width:thin;scrollbar-color:#405467 transparent}.row{display:flex;gap:8px;align-items:center;margin:10px 0}.row>*{flex:1;min-width:0}.row label{display:flex;gap:6px;align-items:center}input,select{min-width:0;background:#101922;color:#edf2f7;border:1px solid #364957;border-radius:8px;padding:8px;width:100%}input[type="checkbox"]{width:auto;accent-color:#b3eedb}
    .hint,small{color:#90a4b6;font-size:12px}.eyebrow{font-size:10px;color:#90a4b6;letter-spacing:1.5px}.cue-card{padding:17px;background:#192734;border:1px solid #2e414f;border-radius:14px;margin-bottom:16px}.caption{font-size:21px;line-height:1.65;min-height:64px;padding:10px 0 14px}.cue-nav{display:flex;align-items:center;justify-content:space-between;color:#90a4b6;font-size:12px}.cue-nav button{background:transparent;border:0;padding:2px 8px;color:#a3bbcc;font-size:18px}.caption-options{display:flex;flex-wrap:wrap;gap:12px;border-top:1px solid #30414e;padding-top:10px}.check{display:flex;gap:5px;align-items:center;color:#9ab0bf;font-size:12px;margin:0}#translation{color:#b2c1cd;font-size:14px;line-height:1.7;margin-bottom:14px}#rawCaption{font-size:12px;color:#9ab0bf;margin-top:8px}
    .primary{background:#b3eedb;border-color:#b3eedb;color:#163b32;font-weight:700}.primary:hover{background:#c9f5e8}.main-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.main-actions .primary{grid-column:1 / -1;padding:13px}.secondary-actions{display:flex;gap:8px;margin:10px 0 18px}.secondary-actions button{flex:1;font-size:12px;background:transparent;color:#a5c5d6;padding:8px}.fold{border-top:1px solid #2b3946;padding:13px 0 0;margin-top:14px}.fold summary{color:#b6c8d6;font-size:12px;list-style:none;display:flex;justify-content:space-between}.fold summary::after{content:'＋';color:#8199aa}.fold[open] summary::after{content:'−'}.fold-content{padding-top:8px}.micro button{font-size:11px;padding:7px 4px}.setup{display:flex;gap:12px;align-items:center;justify-content:space-between;background:#192734;border:1px dashed #3b505f;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#90a4b6}.setup button{flex-shrink:0;padding:7px 10px;font-size:12px}.page-title{font-size:17px;font-weight:600;margin:0 0 6px}.page-subtitle{font-size:12px;color:#90a4b6;margin-bottom:18px}.empty{padding:24px 16px;text-align:center;border:1px dashed #3b505f;border-radius:12px;color:#90a4b6;font-size:13px}.empty strong{display:block;color:#d4e1e9;font-size:15px;margin-bottom:6px}.empty button{margin-top:12px}
    .list{max-height:340px;overflow:auto;scrollbar-width:thin;margin-top:16px}.cue{display:block;text-align:left;width:100%;margin:6px 0;font-size:13px;background:#192734;border-color:transparent;padding:12px}.cue.active{border-color:#8cc7b3;background:#263e3c}a{color:#b3eedb}#download{display:none;text-align:center;width:100%;padding:10px;border:1px solid #3a5b54;border-radius:10px;text-decoration:none}
    .word{display:inline;border:0;border-bottom:1px dotted #648a87;border-radius:0;padding:0 1px;background:transparent;font:inherit;color:inherit}.word:hover{background:#2d4647;color:#b3eedb}.word:disabled{opacity:1}.wordcard{background:#0e1821;border:1px solid #37505a;border-radius:12px;padding:12px;margin:12px 0}.wordcard p{font-size:13px;margin:8px 0}.wordcard .row{margin-top:0}canvas{width:100%;height:90px;background:#0e1821;border-radius:10px;margin:12px 0}.analysis-text{font-size:12px;color:#a3b7c6;white-space:pre-line;margin-bottom:12px}
    footer{border-top:1px solid #2b3946;background:#111b24;padding:12px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0}.status{font-size:11px;color:#9ab2c1;flex:1;line-height:1.6;max-height:70px;overflow:auto}#stop{background:#643640;border-color:#88505a;color:#ffe2e6;font-size:12px;padding:8px 12px;flex-shrink:0}
    .history-row{display:block;width:100%;text-align:left;padding:10px 12px;margin:6px 0;font-size:12px;background:#192734}.history-row[aria-pressed="true"]{border-color:#8cc7b3;background:#263e3c}.history-row small{display:block;margin-top:4px}.history-actions{display:flex;justify-content:space-between;margin:12px 0}.history-actions button{font-size:12px;padding:6px 10px;background:transparent}.history-list{max-height:220px;overflow:auto}#historyInfo{font-size:12px;color:#90a4b6;margin-bottom:10px}
  </style><div class="panel">
    <header><div><div class="tag">A LITTLE BETTER, EVERY DAY</div><h1>Echo<small>英语配音练习</small></h1></div><button class="close" id="close" aria-label="关闭">×</button></header>
    <nav class="tabs" role="tablist" aria-label="练习面板"><button id="tab-practice" role="tab" aria-selected="true" aria-controls="page-practice" tabindex="0">练习</button><button id="tab-transcript" role="tab" aria-selected="false" aria-controls="page-transcript" tabindex="-1">台词</button><button id="tab-recordings" role="tab" aria-selected="false" aria-controls="page-recordings" tabindex="-1">录音</button></nav>
    <div class="pages">
      <section id="page-practice" role="tabpanel" aria-labelledby="tab-practice">
        <div class="cue-card"><div class="cue-nav"><span class="eyebrow">YOUR NEXT LINE</span><span><button id="prev" aria-label="上一句">‹</button><span id="position">手动片段</span><button id="next" aria-label="下一句">›</button></span></div>
          <div class="caption" id="caption">从一句台词开始，听见自己的进步。</div><div id="translation" hidden></div>
          <div class="caption-options"><label class="check"><input type="checkbox" id="showChinese">中文参考</label><label class="check"><input type="checkbox" id="hideText">脱稿练习</label></div>
          <details id="rawDetails" class="fold" hidden><summary>完整原文</summary><div id="rawCaption"></div></details>
        </div>
        <div id="practiceSetup" class="setup"><span>先选台词，也可在下方标记片段。</span><button id="openTranscript">选台词 →</button></div>
        <div id="wordcard" class="wordcard" hidden><div class="row"><strong id="wordTitle"></strong><button id="speakWord">▶ 朗读</button><button id="closeWord" aria-label="关闭词卡">×</button></div><small id="phonetic"></small><div id="definitions" role="status"></div><small>释义：Free Dictionary API · 查询时仅发送所选单词</small></div>
        <div class="main-actions"><button id="original">▶ 听原声</button><button id="replay" disabled>▷ 我的配音</button><button class="primary" id="record">● 开始配音</button></div>
        <div class="secondary-actions"><button id="loop">↻ 单句循环</button><button id="autoPractice">▶ 自动跟读</button></div>
        <details class="fold" id="practiceSettings"><summary>练习设置<span id="speedSummary">1× · 循环 3 次</span></summary><div class="fold-content">
          <div class="row"><label class="hint" for="speed">播放速度</label><select id="speed" aria-label="练习速度"><option value="0.75">0.75× 慢速</option><option value="1" selected>1× 原速</option><option value="1.25">1.25×</option></select></div>
          <div class="row"><label class="hint" for="loopCount">循环次数</label><select id="loopCount" aria-label="循环次数"><option value="3">3 次</option><option value="5">5 次</option><option value="0">持续循环</option></select></div>
          <div class="row"><label class="hint" for="prepSeconds">跟读准备</label><select id="prepSeconds" aria-label="跟读准备时间"><option value="2">2 秒</option><option value="3" selected>3 秒</option><option value="5">5 秒</option></select></div>
          <label class="check"><input type="checkbox" id="autoNext">回放结束后自动练下一句</label><p class="hint">自动跟读：原声 → 准备 → 配音 → 回放。</p>
        </div></details>
        <details class="fold" id="clipSettings"><summary>片段与边界<span id="clipSummary">0.0–5.0 秒</span></summary><div class="fold-content">
          <div class="row"><label><small>起点</small><input id="start" aria-label="片段起点（秒）" type="number" min="0" step="0.1" value="0"></label><label><small>终点</small><input id="end" aria-label="片段终点（秒）" type="number" min="0" step="0.1" value="5"></label></div>
          <div class="row micro"><button id="startEarlier">起点 −0.2s</button><button id="startLater">起点 +0.2s</button><button id="endEarlier">终点 −0.2s</button><button id="endLater">终点 +0.2s</button></div>
          <div class="row"><button id="markStart">此刻设为起点</button><button id="markEnd">此刻设为终点</button></div><p class="hint">配音时原声静音；每段最长 120 秒。</p>
        </div></details>
      </section>
      <section id="page-transcript" role="tabpanel" aria-labelledby="tab-transcript" hidden>
        <h2 class="page-title">找到想说的那一句</h2><div class="page-subtitle">读取视频文字记录，选择台词后回到练习。</div>
        <div class="row"><button class="primary" id="read">读取台词</button><button id="import">导入字幕</button><input id="file" type="file" accept=".srt,.vtt" hidden></div>
        <div class="hint">自动展开文字记录；也可导入 SRT / VTT。</div><div id="transcriptEmpty" class="empty" style="margin-top:18px">还没有台词。点击上方按钮读取。</div><div class="list" id="list"></div>
        <details class="fold"><summary>寻找更多视频</summary><div class="fold-content"><div class="row"><input id="query" placeholder="TED / Friends / 日常对话" aria-label="视频搜索"><button id="search">搜索</button></div><div class="hint">在 YouTube 打开搜索结果，优先选择有英文字幕的短视频。</div></div></details>
      </section>
      <section id="page-recordings" role="tabpanel" aria-labelledby="tab-recordings" hidden>
        <h2 class="page-title">听听自己的声音</h2><div class="page-subtitle">回到原来的画面，比较节奏与停顿。</div><div id="recordingEmpty" class="empty"><strong>还没有录音</strong>在练习页录一句，这里就会显示波形。<br><button id="backToPractice">去练一句 →</button></div>
        <details class="fold" id="historyDetails"><summary>录音版本<span id="historyCount">0 条</span></summary><div class="fold-content"><select id="historyScope" aria-label="录音范围"><option value="sentence">当前句子</option><option value="video">这个视频的全部录音</option></select><div id="historyList" class="history-list"></div><div class="history-actions"><button id="deleteTake" disabled>删除所选</button><button id="undoDelete" hidden>撤销删除</button></div><small>每句保留最近 3 次；第 4 次会替换最早的一次。</small></div></details>
        <div id="recordingContent" hidden><div id="historyInfo"></div><div class="row"><button id="reviewReplay">▷ 回放配音</button><button id="compare">⇄ 原声 / 配音</button></div>
          <details class="fold" open><summary>波形与停顿</summary><div id="analysis" hidden><canvas id="waveform" width="660" height="180" role="img" aria-label="录音音量波形，橙色表示低音量停顿"></canvas><div id="analysisText" class="analysis-text" role="status"></div><small>波形显示音量和停顿，不代表发音准确度。</small></div></details>
          <div class="row"><a id="download">↓ 下载这次录音</a></div><p class="hint">每句保留最近 3 次。选择其他版本请展开「录音版本」。</p>
        </div>
      </section>
    </div>
    <footer><div class="status" id="status" role="status">准备好了，从一句开始。</div><button id="stop" disabled hidden>■ 停止</button></footer>
  </div>`;
  const $ = id => root.getElementById(id);
  let cues = [], index = -1, take = null, mode = 'idle', generation = 0;
  let recorder = null, stream = null, audio = null, frame = 0, timer = 0, savedVideo = null;
  let pendingDone = null;
  let wordRequest = 0, selectedWord = null, analysisRequest = 0;
  let videoId = currentId();
  const storage = EchoStorage.createStorage();
  let videoHistory = [], historyRequest = 0, restoring = true, progressWarning = false, deletedTake = null;
  const pageNames = ['practice','transcript','recordings'];
  function showPage(name, focus = false) {
    if (!pageNames.includes(name)) return;
    for (const page of pageNames) {
      const selected = page === name;
      $('page-'+page).hidden = !selected;
      $('tab-'+page).setAttribute('aria-selected', String(selected));
      $('tab-'+page).tabIndex = selected ? 0 : -1;
    }
    if (focus) $('tab-'+name).focus();
    root.querySelector('.pages').scrollTop = 0;
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
  $('openTranscript').onclick = () => showPage('transcript',true);
  $('backToPractice').onclick = () => showPage('practice',true);
  $('reviewReplay').onclick = () => $('replay').click();
  function updateSummaries() {
    $('speedSummary').textContent = `${$('speed').value}× · ${$('loopCount').value === '0' ? '持续循环' : '循环 '+$('loopCount').value+' 次'}`;
    $('clipSummary').textContent = `${Number($('start').value).toFixed(1)}–${Number($('end').value).toFixed(1)} 秒`;
  }
  $('speed').onchange = () => {updateSummaries();saveProgress();}; $('loopCount').onchange = updateSummaries;
  function currentId() { return new URL(location.href).searchParams.get('v'); }
  function video() {
    if (location.pathname !== '/watch' || !currentId()) throw Error('请先打开一个 YouTube 视频播放页。');
    const v = document.querySelector('video.html5-main-video');
    if (!v || !Number.isFinite(v.duration)) throw Error('请等待视频加载，直播暂不支持。');
    if (document.querySelector('.html5-video-player.ad-showing')) throw Error('请等待广告结束后再练习。');
    return v;
  }
  function status(text) { $('status').textContent = text; }
  function controls() {
    const busy = mode !== 'idle';
    for (const id of ['read','import','prev','next','markStart','markEnd','original','speed','start','end','record','startEarlier','startLater','endEarlier','endLater','loop','loopCount','autoPractice','prepSeconds','autoNext']) $(id).disabled = busy;
    $('stop').disabled = !busy; $('stop').hidden = !busy;
    $('reviewReplay').disabled = busy || !take;
    $('replay').disabled = busy || !take;
    $('compare').disabled = busy || !take;
    $('speakWord').disabled = busy;
    $('deleteTake').disabled = busy || !take; $('undoDelete').disabled = busy; $('historyScope').disabled = busy;
    root.querySelectorAll('.history-row').forEach(b=>b.disabled=busy);
    root.querySelectorAll('.word').forEach(b => b.disabled = busy);
    root.querySelectorAll('.cue').forEach(b => b.disabled = busy);
  }
  function range() {
    const start = Number($('start').value), end = Number($('end').value), v = video();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > v.duration + 0.1) throw Error('请设置有效起止时间，终点需在视频时长内。');
    if (end - start > 120) throw Error('每个练习片段最长 120 秒，请缩短片段。');
    return { start, end, speed: Number($('speed').value) };
  }
  function saveVideo(v) { savedVideo = { v, muted: v.muted, rate: v.playbackRate }; }
  function restoreVideo() {
    if (savedVideo) { const { v, muted, rate } = savedVideo; v.pause(); v.muted = muted; v.playbackRate = rate; savedVideo = null; }
  }
  function cancelPlayback() {
    cancelAnimationFrame(frame); clearTimeout(timer);
    if (pendingDone) { const done = pendingDone; pendingDone = null; done(); }
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
  }
  function finish() { cancelPlayback(); restoreVideo(); mode = 'idle'; controls(); }
  function stop() {
    window.speechSynthesis?.cancel();
    if (mode === 'loading') restoring = false;
    if (mode === 'reading') status('已停止读取台词。');
    generation++;
    cancelPlayback(); restoreVideo();
    if (recorder && recorder.state !== 'inactive') { mode = 'saving'; recorder.stop(); }
    else { stream?.getTracks().forEach(t => t.stop()); stream = null; mode = 'idle'; }
    controls();
  }
  function guarded(fn) { return async () => { const before = generation; try { await fn(); } catch (e) { if (generation > before + 1) return; stop(); status(e.message || String(e)); } }; }
  function watchEnd(v, end, done) {
    const tick = () => {
      if (v.currentTime >= end || v.ended) { done(); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  async function seek(v, at, token) {
    v.pause();
    if (token !== generation) throw Error('操作已停止。');
    if (Math.abs(v.currentTime - at) < 0.03 && !v.seeking) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(Error('视频定位超时，请重试。')); }, 10000);
      function cleanup() { clearTimeout(timeout); v.removeEventListener('seeked', done); }
      function done() { cleanup(); resolve(); }
      v.addEventListener('seeked', done); v.currentTime = at;
    });
    if (token !== generation) throw Error('操作已停止。');
  }
  async function original(r, token) {
    window.speechSynthesis?.cancel();
    const v = video(); saveVideo(v); v.muted = false; v.playbackRate = r.speed;
    await seek(v, r.start, token);
    if (token !== generation) return;
    await v.play();
    if (token !== generation) return;
    await new Promise(resolve => {
      pendingDone = resolve;
      watchEnd(v, r.end, () => { v.pause(); resolve(); });
      timer = setTimeout(() => { v.pause(); resolve(); }, (r.end - r.start) / r.speed * 1000 + 15000);
    });
    if (token === generation) { cancelPlayback(); restoreVideo(); }
  }
  function setTake(value) {
    if (take?.url) URL.revokeObjectURL(take.url);
    take = value ? { ...value, url: URL.createObjectURL(value.blob) } : null;
    $('download').style.display = take ? 'block' : 'none';
    $('recordingEmpty').hidden = !!take; $('recordingContent').hidden = !take;
    $('historyInfo').textContent = take ? `${take.label || '手动片段'} · ${take.start.toFixed(1)}–${take.end.toFixed(1)} 秒 · ${take.speed}×` : '';
    if (take) { $('download').href = take.url; $('download').download = `echo-${videoId}-${take.start.toFixed(1)}.webm`; }
    controls();
    void analyzeTake(take);
  }
  function currentCueKey() {
    return EchoStorage.cueKey(cues[index], Number($('start').value), Number($('end').value));
  }
  function saveProgress() {
    if (restoring || !videoId) return;
    const start = Number($('start').value), end = Number($('end').value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return;
    const session = {videoId,cues:cues.map(c=>({...c})),index,start,end,speed:$('speed').value,showChinese:$('showChinese').checked,hideText:$('hideText').checked,selectedTakeId:take?.id,updatedAt:Date.now()};
    void storage.saveSession(session).catch(()=>{
      if (!progressWarning && session.videoId === videoId) { progressWarning=true; status('练习位置未能保存，请检查本地存储空间。录音仍可下载。'); }
    });
  }
  function renderHistory() {
    const key = currentCueKey();
    const shown = $('historyScope').value === 'video' ? videoHistory : videoHistory.filter(t=>t.cueKey===key);
    $('historyCount').textContent = `${shown.length} 条`;
    $('historyList').replaceChildren();
    if (!shown.length) { const p=document.createElement('p'); p.className='hint'; p.textContent='这里还没有录音。'; $('historyList').append(p); }
    shown.forEach((value,i)=>{
      const button=document.createElement('button'); button.className='history-row'; button.disabled=mode!=='idle';
      button.setAttribute('aria-pressed',String(value.id===take?.id));
      button.append(document.createTextNode(`${i===0 ? '最近一次 · ' : ''}${new Date(value.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}`));
      const small=document.createElement('small'); small.textContent=`${value.label || '手动片段'} · ${value.start.toFixed(1)}–${value.end.toFixed(1)} 秒 · ${value.speed}×`;
      button.append(small); button.onclick=()=>{if(mode==='idle') {setTake(value);renderHistory();saveProgress();}}; $('historyList').append(button);
    });
    controls();
  }
  function chooseCurrentTake(preferredId) {
    const matching=videoHistory.filter(t=>t.cueKey===currentCueKey());
    const value=videoHistory.find(t=>t.id===preferredId) || matching[0];
    setTake(value || null); renderHistory();
  }
  async function refreshHistory(preferredId) {
    const id=videoId, request=++historyRequest;
    const values=await storage.listTakes(id);
    if(id!==videoId || request!==historyRequest) return;
    videoHistory=values; chooseCurrentTake(preferredId);
  }
  async function loadVideo(id) {
    const token=++generation; restoring=true; mode='loading'; controls();
    try {
      const [session,values]=await Promise.all([storage.getSession(id),storage.listTakes(id)]);
      if(id!==videoId || token!==generation) return;
      videoHistory=values; mode='idle';
      if(session) {
        $('speed').value=['0.75','1','1.25'].includes(session.speed)?session.speed:'1';
        $('showChinese').checked=!!session.showChinese; $('hideText').checked=!!session.hideText;
        displayCues(session.cues || [],session.index);
        $('start').value=session.start; $('end').value=session.end; index=session.index>=0 && session.index<cues.length?session.index:-1;
        updateCaption(); $('list').style.display=$('hideText').checked?'none':'';
        status(index>=0 ? `已回到上次练习的第 ${index+1} 句。` : '已恢复上次的手动片段。');
      } else if(values.length) {
        $('start').value=values[0].start; $('end').value=values[0].end; $('speed').value=String(values[0].speed); updateCaption();
        status('旧版录音已保留，可在「录音」页回放。');
      }
      chooseCurrentTake(session?.selectedTakeId); restoring=false; controls();
    } catch(error) {
      if(id===videoId && token===generation) { restoring=false; mode='idle'; controls(); status(error.message || '本地存储不可用，仍可录音并下载。'); }
    }
  }
  $('historyScope').onchange=renderHistory;
  $('deleteTake').onclick=guarded(async()=>{
    if(!take || mode!=='idle') return;
    const value=take, id=videoId; mode='saving';controls();
    await storage.deleteTake(value.id);
    if(id!==videoId) return;
    deletedTake=value; $('undoDelete').hidden=false; mode='idle';
    await refreshHistory(); status('录音已删除，可在「录音版本」中撤销。');
  });
  $('undoDelete').onclick=guarded(async()=>{
    if(!deletedTake || mode!=='idle') return;
    const value=deletedTake,id=videoId;mode='saving';controls();
    await storage.saveTake(value);
    if(id!==videoId) return;
    deletedTake=null;$('undoDelete').hidden=true;mode='idle';await refreshHistory(value.id);status('已恢复录音。');
  });
  async function record(options = {}) {
    window.speechSynthesis?.cancel();
    const r = range(), v = video(), id = videoId, token = options.token ?? ++generation;
    deletedTake=null;$('undoDelete').hidden=true;
    mode = 'permission'; controls(); status('正在请求麦克风权限…');
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
    if (token !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
    stream = mic;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = mimeType ? new MediaRecorder(mic, { mimeType }) : new MediaRecorder(mic);
    const recordedKey=currentCueKey(), recordedLabel=index>=0 ? `第 ${index+1} 句` : '手动片段';
    const currentRecorder = recorder, chunks = [];
    let resolveRecording;
    const completed = new Promise(resolve => { resolveRecording = resolve; });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { stop(); status('录音失败，请检查麦克风后重试。'); };
    recorder.onstop = async () => {
      mic.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: currentRecorder.mimeType });
      if (id !== videoId || !blob.size) { if (recorder === currentRecorder) { recorder = null; stream=null; if(id===videoId) {mode = 'idle'; controls();} } resolveRecording(false); return; }
      const value = { id:crypto.randomUUID(),videoId:id,cueKey:recordedKey,label:recordedLabel,...r,blob,createdAt:Date.now() };
      setTake(value); recorder = null; stream = null; mode = options.keepBusy && token === generation ? 'practice' : 'idle'; controls();
      saveProgress();
      status('配音完成，已加入本句录音版本。');
      resolveRecording(true);
      try { await storage.saveTake(value); if(id===videoId) { const values=await storage.listTakes(id); if(id===videoId) { videoHistory=values; renderHistory(); } } } catch { if (videoId === id && take?.createdAt === value.createdAt) status('录音已完成，但保存失败，请下载备份。'); }
    };
    saveVideo(v); v.muted = true; v.playbackRate = r.speed;
    await seek(v, r.start, token);
    if (token !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
    // Start video first so buffering does not insert a long silent lead-in.
    await v.play();
    if (token !== generation) return;
    recorder.start(250); mode = 'recording'; controls(); status('● 正在配音，视频原声已静音…');
    const endRecording = () => {
      if (token !== generation) return;
      cancelPlayback(); restoreVideo(); mode = 'saving'; controls();
      if (currentRecorder.state !== 'inactive') currentRecorder.stop();
    };
    watchEnd(v, r.end, endRecording);
    timer = setTimeout(endRecording, 120000);
    return completed;
  }
  async function replay(token, keepBusy = false) {
    window.speechSynthesis?.cancel();
    if (!take) return;
    const t = take, v = video(); saveVideo(v); v.muted = true; v.playbackRate = t.speed;
    await seek(v, t.start, token);
    if (token !== generation) return;
    audio = new Audio(t.url);
    const a = audio;
    // Pause both tracks on buffering; resynchronize video to recorded elapsed time.
    const onWaiting = () => a.pause();
    const onPlaying = () => { if (audio === a) { a.currentTime = Math.max(0, (v.currentTime - t.start) / t.speed); void a.play().catch(() => { stop(); status('录音无法播放，请重新录制。'); }); } };
    v.addEventListener('waiting', onWaiting); v.addEventListener('playing', onPlaying);
    try {
      await v.play();
      if (token !== generation) return;
      await a.play();
      await new Promise(resolve => {
        pendingDone = resolve;
        a.onended = resolve;
        watchEnd(v, t.end, resolve);
        timer = setTimeout(resolve, 135000);
      });
    } finally { v.removeEventListener('waiting', onWaiting); v.removeEventListener('playing', onPlaying); }
    if (token === generation) { if (keepBusy) { cancelPlayback(); restoreVideo(); mode = 'practice'; controls(); } else finish(); }
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
  function closeWord() { wordRequest++; selectedWord = null; $('wordcard').hidden = true; window.speechSynthesis?.cancel(); }
  async function lookupWord(word) {
    if (mode !== 'idle') return;
    selectedWord = EchoDictionary.normalize(word);
    if (!selectedWord) return;
    const request = ++wordRequest;
    try { video().pause(); } catch {}
    $('wordcard').hidden = false; $('wordTitle').textContent = word; $('phonetic').textContent = '';
    $('definitions').textContent = '正在查词…';
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
  function updateCaption() {
    closeWord(); $('caption').replaceChildren();
    if ($('hideText').checked) $('caption').textContent = '••• 听节奏，试着说出来';
    else {
      const raw = cues[index]?.text || '标记片段后，点击开始配音。';
      const text = cues[index] ? EchoPractice.splitCaption(raw).english || '这句没有可分离的英文，请展开原文确认。' : raw;
      for (const part of text.split(/([A-Za-z]+(?:['’‘-][A-Za-z]+)*)/)) {
        if (EchoDictionary.normalize(part)) {
          const b = document.createElement('button'); b.className = 'word'; b.textContent = part;
          b.title = '查看发音和释义'; b.onclick = () => void lookupWord(part); b.disabled = mode !== 'idle'; $('caption').append(b);
        } else $('caption').append(document.createTextNode(part));
      }
    }
    const parts = EchoPractice.splitCaption(cues[index]?.text || '');
    $('translation').textContent = parts.chinese;
    $('translation').hidden = $('hideText').checked || !$('showChinese').checked || !parts.chinese;
    $('rawDetails').hidden = $('hideText').checked || !parts.chinese;
    $('rawCaption').textContent = parts.original;
    $('practiceSetup').hidden = cues.length > 0;
    updateSummaries();
    $('position').textContent = index >= 0 ? `${index + 1} / ${cues.length}` : '手动片段';
  }
  function select(i) {
    if (mode !== 'idle' || !cues[i]) return;
    index = i; $('start').value = cues[i].start.toFixed(2); $('end').value = cues[i].end.toFixed(2);
    updateCaption(); chooseCurrentTake(); saveProgress(); showPage('practice'); root.querySelectorAll('.cue').forEach((b, n) => b.classList.toggle('active', n === i));
  }
  function displayCues(next, preferredIndex = 0) {
    cues = next.map(c=>({...c,key:EchoStorage.cueKey(c)})); index = -1; $('list').replaceChildren();
    $('transcriptEmpty').hidden = next.length > 0;
    cues.forEach((cue, i) => { const b = document.createElement('button'); b.className = 'cue'; b.textContent = `${Math.floor(cue.start / 60)}:${String(Math.floor(cue.start % 60)).padStart(2, '0')}  ${EchoPractice.splitCaption(cue.text).english || '查看原文'}`; b.onclick = () => select(i); $('list').append(b); });
    if (cues.length && preferredIndex >= 0) select(Math.min(preferredIndex,cues.length-1)); else {updateCaption();chooseCurrentTake();saveProgress();}
  }
  function rememberBounds() {
    updateSummaries();
    const start = Number($('start').value), end = Number($('end').value);
    if (cues[index] && Number.isFinite(start) && end > start) { cues[index].start = start; cues[index].end = end; }
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
    return new Promise(resolve => { pendingDone = resolve; timer = setTimeout(() => { pendingDone = null; resolve(); }, ms); });
  }
  $('loop').onclick = guarded(async () => {
    const r = range(), token = ++generation, count = Number($('loopCount').value);
    closeWord(); mode = 'loop'; controls();
    await EchoPractice.runLoop({count, active:()=>token === generation,
      listen: async round => { status(`单句循环 · 第 ${round} 次${count ? ' / '+count : ''}`); await original(r,token); },
      gap:()=>pauseBetween(600,token)});
    if (token === generation) { finish(); status('单句循环完成。'); }
  });
  $('autoPractice').onclick = guarded(async () => {
    range(); const token = ++generation, autoNext = $('autoNext').checked, seconds = Number($('prepSeconds').value);
    closeWord(); mode = 'practice'; controls(); status('首次练习：正在检查麦克风权限…');
    // Obtain permission before the listening/preparation stages so its dialog
    // cannot consume the learner's preparation time. Release immediately.
    const mic = await navigator.mediaDevices.getUserMedia({audio:true});
    mic.getTracks().forEach(track=>track.stop());
    if (token !== generation) return;
    await EchoPractice.runPractice({active:()=>token === generation,
      listen:async()=>{ status(`自动跟读 · 听原声${index >= 0 ? ' · 第 '+(index+1)+' 句' : ''}`); await original(range(),token); },
      prepare:async()=>{ for(let n=seconds;n>0 && token===generation;n--) { status(`准备配音 · ${n} 秒`); await pauseBetween(1000,token); } },
      record:()=>record({token,keepBusy:true}),
      replay:async()=>{ status('自动跟读 · 回放你的配音'); await replay(token,true); },
      advance:()=>{ if (!autoNext || index < 0 || index+1 >= cues.length) return false; mode='idle'; select(index+1); mode='practice'; controls(); return true; }
    });
    if (token === generation) { finish(); status('自动跟读完成。可以重练或下载这次录音。'); }
  });
  $('close').onclick = () => { closeWord(); stop(); host.style.display = 'none'; };
  $('hideText').onchange = () => { updateCaption(); $('list').style.display = $('hideText').checked ? 'none' : ''; saveProgress(); };
  $('prev').onclick = () => select(index - 1); $('next').onclick = () => select(index + 1);
  $('markStart').onclick = guarded(() => { $('start').value = video().currentTime.toFixed(2); index = -1; updateCaption();chooseCurrentTake();saveProgress(); });
  $('markEnd').onclick = guarded(() => { $('end').value = video().currentTime.toFixed(2); index = -1; updateCaption();chooseCurrentTake();saveProgress(); });
  $('original').onclick = guarded(async () => { const r = range(), token = ++generation; mode = 'original'; controls(); status('正在播放原声…'); await original(r, token); if (token === generation) { finish(); status('原声播放完成。'); } });
  $('record').onclick = guarded(() => record()); $('stop').onclick = stop;
  $('replay').onclick = guarded(async () => { const token = ++generation; mode = 'replay'; controls(); status('正在随画面播放你的配音…'); await replay(token); });
  $('compare').onclick = guarded(async () => { if (!take) return; const token = ++generation; mode = 'compare'; controls(); status('对比 1/2：原声'); await original(take, token); if (token !== generation) return; status('对比 2/2：你的配音'); await replay(token); });
  $('import').onclick = () => $('file').click();
  $('file').onchange = guarded(async () => { const file = $('file').files[0]; if (!file) return; if (file.size > 5e6) throw Error('字幕文件请小于 5 MB。'); const next = EchoSubtitles.parse(await file.text()); $('file').value = ''; if (!next.length) throw Error('未找到有效字幕，请使用 SRT 或 VTT 文件。'); displayCues(next); status(`已导入 ${next.length} 句台词。`); });
  $('read').onclick = guarded(async () => {
    const v = video(), token = ++generation, id = videoId;
    mode = 'reading'; controls(); status('正在读取视频台词…');
    try {
      const next = await EchoTranscript.read({
        doc: document,
        duration: v.duration,
        cancelled: () => token !== generation || id !== currentId(),
        progress: status
      });
      if (!next || token !== generation || id !== currentId()) return;
      mode = 'idle';
      displayCues(next);
      status(`已读取 ${next.length} 句台词。当前加载内容可能不完整，末句终点为估算值，可手动调整。`);
    } finally {
      if (token === generation) { mode = 'idle'; controls(); }
    }
  });
  $('search').onclick = () => { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent($('query').value || 'english conversation subtitles')}`, '_blank', 'noopener'); };
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'echo-toggle') { const open = host.style.display === 'none'; host.style.display = open ? 'block' : 'none'; if (!open) stop(); } });
  document.addEventListener('yt-navigate-finish', () => {
    const id = currentId(); if (id === videoId) return;
    stop(); restoring=true; videoId=id; historyRequest++;videoHistory=[];deletedTake=null;$('undoDelete').hidden=true;setTake(null);displayCues([]); $('start').value = 0; $('end').value = 5; updateSummaries();
    status('已切换视频，请重新选择台词或片段。'); if (id) void loadVideo(id); else restoring=false;
  });
  window.addEventListener('pagehide',()=>{saveProgress();stop();});
  controls(); if(videoId) void loadVideo(videoId); else restoring=false;
})();
