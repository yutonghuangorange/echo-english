(() => {
  if (document.getElementById('echo-practice-host')) return;
  const host = document.createElement('div');
  host.id = 'echo-practice-host';
  host.style.cssText = 'position:fixed;right:20px;top:80px;z-index:2147483647;display:none;';
  document.documentElement.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box} :host{font:14px/1.5 system-ui,sans-serif;color:#e9edf6} .panel{width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 100px);overflow:auto;background:#141923;border:1px solid #30394a;border-radius:20px;box-shadow:0 20px 70px #0008;padding:22px} header{display:flex;justify-content:space-between;align-items:center} h1{font-size:23px;letter-spacing:1px;margin:0} small,.hint{color:#a0acc1;font-size:12px} .tag{color:#a5e6d5;font-size:11px;letter-spacing:2px} button,a{cursor:pointer} button,input,select,textarea{font:inherit} button{border:1px solid #394456;border-radius:10px;background:#232c3a;color:#e9edf6;padding:10px 12px} button:hover{background:#344156} button:disabled{opacity:.4;cursor:default} .primary{background:#a5e6d5;color:#102e27;border:0;font-weight:700} .primary:hover{background:#c3f4e7} .danger{background:#9e3f4b} .row{display:flex;gap:8px;margin:10px 0;align-items:center}.row>*{flex:1}.row label{display:flex;gap:5px;align-items:center} input,select,textarea{min-width:0;background:#0e131c;color:#e9edf6;border:1px solid #394456;border-radius:8px;padding:8px;width:100%} textarea{resize:vertical} .caption{font-size:20px;line-height:1.5;padding:18px 0;min-height:90px} .status{color:#a5e6d5;margin:14px 0;min-height:36px;font-size:12px} .list{max-height:210px;overflow:auto;margin:12px 0}.cue{display:block;text-align:left;width:100%;margin:5px 0;font-size:13px}.cue.active{border-color:#a5e6d5;background:#263e3c} .section{border-top:1px solid #30394a;margin-top:18px;padding-top:14px} a{color:#a5e6d5} .close{flex:0;padding:4px 10px} details summary{cursor:pointer;color:#a0acc1} #download{display:none} #hideText{width:auto}
    .word{display:inline;border:0;border-bottom:1px dotted #789b94;border-radius:0;padding:0 1px;background:transparent;font:inherit;color:inherit}.word:hover{color:#a5e6d5;background:#263e3c}.word:disabled{opacity:1}.wordcard{background:#0e131c;border:1px solid #394456;border-radius:12px;padding:12px;margin:8px 0}.wordcard p{margin:8px 0;font-size:13px} [hidden]{display:none!important} canvas{width:100%;height:90px;background:#0e131c;border-radius:8px}.analysis-text{font-size:12px;color:#a0acc1;white-space:pre-line}
    #translation{font-size:14px;color:#a0acc1;padding:4px 0 12px}.caption{min-height:65px;padding-bottom:8px}.micro button{font-size:12px;padding:6px}.check{display:block;color:#a0acc1;font-size:12px;margin:8px 0}.check input{width:auto} #rawCaption{font-size:12px;color:#a0acc1} .settings-label{font-size:12px;color:#a0acc1}
  </style><div class="panel">
    <header><div><div class="tag">LISTEN · DUB · REPEAT</div><h1>Echo <small>英语配音练习</small></h1></div><button class="close" id="close" aria-label="关闭">×</button></header>
    <div class="status" id="status" role="status">选一个有英文字幕的视频，从一句开始。</div>
    <div class="row"><button id="read">读取台词</button><button id="import">导入 SRT / VTT</button><input id="file" type="file" accept=".srt,.vtt" hidden></div>
    <div class="hint">自动展开文字记录并等待加载。长视频建议导入完整字幕。</div>
    <div class="row"><button id="prev">← 上一句</button><span id="position" style="text-align:center">手动片段</span><button id="next">下一句 →</button></div>
    <div class="caption" id="caption">也可以直接标记视频中的起点和终点。</div>
    <div id="translation" hidden></div>
    <label class="check"><input type="checkbox" id="showChinese"> 显示中文参考</label>
    <details id="rawDetails" hidden><summary>查看未拆分台词</summary><div id="rawCaption"></div></details>
    <div class="hint">点击上方台词中的英文单词，查看发音和英文释义。</div>
    <div id="wordcard" class="wordcard" hidden><div class="row"><strong id="wordTitle"></strong><button id="speakWord">▶ 朗读</button><button id="closeWord" aria-label="关闭词卡">×</button></div><small id="phonetic"></small><div id="definitions" role="status"></div><small>释义来自 Free Dictionary API；查询时仅发送所选单词。</small></div>
    <label class="hint"><input type="checkbox" id="hideText"> 隐藏台词，试着脱稿</label>
    <div class="row"><label><small>起点 / 秒</small><input id="start" type="number" min="0" step="0.1" value="0"></label><label><small>终点 / 秒</small><input id="end" type="number" min="0" step="0.1" value="5"></label></div>
    <div class="row micro"><button id="startEarlier">起点 −0.2s</button><button id="startLater">起点 +0.2s</button><button id="endEarlier">终点 −0.2s</button><button id="endLater">终点 +0.2s</button></div>
    <div class="row"><button id="markStart">此刻设为起点</button><button id="markEnd">此刻设为终点</button></div>
    <div class="row"><button id="original">▶ 听原声</button><select id="speed" aria-label="练习速度"><option value="0.75">0.75× 慢速</option><option value="1" selected>1× 原速</option><option value="1.25">1.25×</option></select></div>
    <div class="row"><button class="primary" id="record">● 开始配音</button><button id="stop" disabled>■ 停止</button></div>
    <div class="row"><button id="replay" disabled>▶ 我的配音 + 画面</button><button id="compare" disabled>⇄ 原声 / 配音</button></div>
    <div class="section"><div class="row"><button id="loop">↻ 单句循环</button><select id="loopCount" aria-label="循环次数"><option value="3">循环 3 次</option><option value="5">循环 5 次</option><option value="0">持续循环</option></select></div>
    <div class="row"><button id="autoPractice">▶ 自动跟读</button><select id="prepSeconds" aria-label="跟读准备时间"><option value="2">准备 2 秒</option><option value="3" selected>准备 3 秒</option><option value="5">准备 5 秒</option></select></div>
    <label class="check"><input type="checkbox" id="autoNext"> 完成回放后，自动练下一句</label>
    <div class="hint">自动跟读：听原声 → 准备 → 静音配音 → 回放。首次先授权麦克风；每个视频仅保留最近一次录音。</div></div>
    <div class="hint">配音时视频静音。建议戴耳机；最长录制 120 秒。</div>
    <div id="analysis" class="section" hidden><small>我的录音 · 波形与停顿</small><canvas id="waveform" width="660" height="180" role="img" aria-label="录音音量波形，橙色区域表示低音量停顿"></canvas><div id="analysisText" class="analysis-text" role="status"></div><small>波形显示音量和停顿，不代表发音准确度。</small></div>
    <div class="row"><a id="download">下载这次录音</a></div>
    <div class="section"><details><summary>台词列表 / 查找练习视频</summary><div class="list" id="list"></div><div class="row"><input id="query" placeholder="例如 TED / Friends / 日常对话" aria-label="视频搜索"><button id="search">搜索</button></div><div class="hint">在 YouTube 搜索；优先选有英文字幕、语速适中的短视频。</div></details></div>
  </div>`;
  const $ = id => root.getElementById(id);
  let cues = [], index = -1, take = null, mode = 'idle', generation = 0;
  let recorder = null, stream = null, audio = null, frame = 0, timer = 0, savedVideo = null;
  let pendingDone = null;
  let wordRequest = 0, selectedWord = null, analysisRequest = 0;
  let videoId = currentId();
  let database;
  const dbReady = new Promise((resolve, reject) => {
    const request = indexedDB.open('echo-dubbing-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('takes', { keyPath: 'videoId' });
    request.onsuccess = () => { database = request.result; resolve(database); };
    request.onerror = () => reject(request.error);
  });
  // A rejected database must not prevent recording or produce an unhandled rejection.
  dbReady.catch(() => {});
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
    $('stop').disabled = !busy;
    $('replay').disabled = busy || !take;
    $('compare').disabled = busy || !take;
    $('speakWord').disabled = busy;
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
    $('download').style.display = take ? 'inline' : 'none';
    if (take) { $('download').href = take.url; $('download').download = `echo-${videoId}-${take.start.toFixed(1)}.webm`; }
    controls();
    void analyzeTake(take);
  }
  async function persist(value) {
    await dbReady;
    await new Promise((resolve, reject) => {
      const tx = database.transaction('takes', 'readwrite'); tx.objectStore('takes').put(value);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  async function loadTake(id) {
    try {
      await dbReady;
      const value = await new Promise((resolve, reject) => {
        const req = database.transaction('takes').objectStore('takes').get(id);
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      if (id === videoId && mode === 'idle' && !take && value) { setTake(value); status('已恢复这个视频最近一次录音。回放使用录制时的片段和速度。'); }
    } catch { status('本地存储不可用，仍可录音并下载。'); }
  }
  async function record(options = {}) {
    window.speechSynthesis?.cancel();
    const r = range(), v = video(), id = videoId, token = options.token ?? ++generation;
    mode = 'permission'; controls(); status('正在请求麦克风权限…');
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
    if (token !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
    stream = mic;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = mimeType ? new MediaRecorder(mic, { mimeType }) : new MediaRecorder(mic);
    const currentRecorder = recorder, chunks = [];
    let resolveRecording;
    const completed = new Promise(resolve => { resolveRecording = resolve; });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { stop(); status('录音失败，请检查麦克风后重试。'); };
    recorder.onstop = async () => {
      mic.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: currentRecorder.mimeType });
      if (id !== videoId || !blob.size) { if (recorder === currentRecorder) { recorder = null; mode = 'idle'; controls(); } resolveRecording(false); return; }
      const value = { videoId: id, ...r, blob, createdAt: Date.now() };
      setTake(value); recorder = null; stream = null; mode = options.keepBusy && token === generation ? 'practice' : 'idle'; controls();
      status('配音完成，可以随画面回放或对比原声。');
      resolveRecording(true);
      try { await persist(value); } catch { if (videoId === id && take?.createdAt === value.createdAt) status('录音已完成，但保存失败，请下载备份。'); }
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
    $('position').textContent = index >= 0 ? `${index + 1} / ${cues.length}` : '手动片段';
  }
  function select(i) {
    if (mode !== 'idle' || !cues[i]) return;
    index = i; $('start').value = cues[i].start.toFixed(2); $('end').value = cues[i].end.toFixed(2);
    updateCaption(); root.querySelectorAll('.cue').forEach((b, n) => b.classList.toggle('active', n === i));
  }
  function displayCues(next) {
    cues = next; index = -1; $('list').replaceChildren();
    cues.forEach((cue, i) => { const b = document.createElement('button'); b.className = 'cue'; b.textContent = `${Math.floor(cue.start / 60)}:${String(Math.floor(cue.start % 60)).padStart(2, '0')}  ${EchoPractice.splitCaption(cue.text).english || '查看原文'}`; b.onclick = () => select(i); $('list').append(b); });
    if (cues.length) select(0); else updateCaption();
  }
  function rememberBounds() {
    const start = Number($('start').value), end = Number($('end').value);
    if (cues[index] && Number.isFinite(start) && end > start) { cues[index].start = start; cues[index].end = end; }
  }
  for (const [id, edge, delta] of [['startEarlier','start',-.2],['startLater','start',.2],['endEarlier','end',-.2],['endLater','end',.2]]) {
    $(id).onclick = guarded(() => {
      const next = EchoPractice.nudge(Number($('start').value), Number($('end').value), edge, delta, video().duration);
      $('start').value = next.start.toFixed(2); $('end').value = next.end.toFixed(2); rememberBounds();
    });
  }
  $('start').onchange = rememberBounds; $('end').onchange = rememberBounds;
  $('showChinese').onchange = updateCaption;
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
  $('hideText').onchange = () => { updateCaption(); $('list').style.display = $('hideText').checked ? 'none' : ''; };
  $('prev').onclick = () => select(index - 1); $('next').onclick = () => select(index + 1);
  $('markStart').onclick = guarded(() => { $('start').value = video().currentTime.toFixed(2); index = -1; updateCaption(); });
  $('markEnd').onclick = guarded(() => { $('end').value = video().currentTime.toFixed(2); index = -1; updateCaption(); });
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
    stop(); videoId = id; setTake(null); displayCues([]); $('start').value = 0; $('end').value = 5;
    status('已切换视频，请重新选择台词或片段。'); if (id) void loadTake(id);
  });
  window.addEventListener('pagehide', stop);
  controls(); if (videoId) void loadTake(videoId);
})();
