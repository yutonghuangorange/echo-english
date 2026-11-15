(() => {
  if (document.getElementById('echo-practice-host')) return;
  const host = document.createElement('div');
  host.id = 'echo-practice-host';
  host.style.cssText = 'position:fixed;right:20px;top:80px;z-index:2147483647;display:none;';
  document.documentElement.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box} :host{font:14px/1.5 system-ui,sans-serif;color:#e9edf6} .panel{width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 100px);overflow:auto;background:#141923;border:1px solid #30394a;border-radius:20px;box-shadow:0 20px 70px #0008;padding:22px} header{display:flex;justify-content:space-between;align-items:center} h1{font-size:23px;letter-spacing:1px;margin:0} small,.hint{color:#a0acc1;font-size:12px} .tag{color:#a5e6d5;font-size:11px;letter-spacing:2px} button,a{cursor:pointer} button,input,select,textarea{font:inherit} button{border:1px solid #394456;border-radius:10px;background:#232c3a;color:#e9edf6;padding:10px 12px} button:hover{background:#344156} button:disabled{opacity:.4;cursor:default} .primary{background:#a5e6d5;color:#102e27;border:0;font-weight:700} .primary:hover{background:#c3f4e7} .danger{background:#9e3f4b} .row{display:flex;gap:8px;margin:10px 0;align-items:center}.row>*{flex:1}.row label{display:flex;gap:5px;align-items:center} input,select,textarea{min-width:0;background:#0e131c;color:#e9edf6;border:1px solid #394456;border-radius:8px;padding:8px;width:100%} textarea{resize:vertical} .caption{font-size:20px;line-height:1.5;padding:18px 0;min-height:90px} .status{color:#a5e6d5;margin:14px 0;min-height:36px;font-size:12px} .list{max-height:210px;overflow:auto;margin:12px 0}.cue{display:block;text-align:left;width:100%;margin:5px 0;font-size:13px}.cue.active{border-color:#a5e6d5;background:#263e3c} .section{border-top:1px solid #30394a;margin-top:18px;padding-top:14px} a{color:#a5e6d5} .close{flex:0;padding:4px 10px} details summary{cursor:pointer;color:#a0acc1} #download{display:none} #hideText{width:auto}
  </style><div class="panel">
    <header><div><div class="tag">LISTEN · DUB · REPEAT</div><h1>Echo <small>英语配音练习</small></h1></div><button class="close" id="close" aria-label="关闭">×</button></header>
    <div class="status" id="status" role="status">选一个有英文字幕的视频，从一句开始。</div>
    <div class="row"><button id="read">读取台词</button><button id="import">导入 SRT / VTT</button><input id="file" type="file" accept=".srt,.vtt" hidden></div>
    <div class="hint">自动展开文字记录并等待加载。长视频建议导入完整字幕。</div>
    <div class="row"><button id="prev">← 上一句</button><span id="position" style="text-align:center">手动片段</span><button id="next">下一句 →</button></div>
    <div class="caption" id="caption">也可以直接标记视频中的起点和终点。</div>
    <label class="hint"><input type="checkbox" id="hideText"> 隐藏台词，试着脱稿</label>
    <div class="row"><label><small>起点 / 秒</small><input id="start" type="number" min="0" step="0.1" value="0"></label><label><small>终点 / 秒</small><input id="end" type="number" min="0" step="0.1" value="5"></label></div>
    <div class="row"><button id="markStart">此刻设为起点</button><button id="markEnd">此刻设为终点</button></div>
    <div class="row"><button id="original">▶ 听原声</button><select id="speed" aria-label="练习速度"><option value="0.75">0.75× 慢速</option><option value="1" selected>1× 原速</option><option value="1.25">1.25×</option></select></div>
    <div class="row"><button class="primary" id="record">● 开始配音</button><button id="stop" disabled>■ 停止</button></div>
    <div class="row"><button id="replay" disabled>▶ 我的配音 + 画面</button><button id="compare" disabled>⇄ 原声 / 配音</button></div>
    <div class="hint">配音时视频静音。建议戴耳机；最长录制 120 秒。</div>
    <div class="row"><a id="download">下载这次录音</a></div>
    <div class="section"><details><summary>台词列表 / 查找练习视频</summary><div class="list" id="list"></div><div class="row"><input id="query" placeholder="例如 TED / Friends / 日常对话" aria-label="视频搜索"><button id="search">搜索</button></div><div class="hint">在 YouTube 搜索；优先选有英文字幕、语速适中的短视频。</div></details></div>
  </div>`;
  const $ = id => root.getElementById(id);
  let cues = [], index = -1, take = null, mode = 'idle', generation = 0;
  let recorder = null, stream = null, audio = null, frame = 0, timer = 0, savedVideo = null;
  let pendingDone = null;
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
    for (const id of ['read','import','prev','next','markStart','markEnd','original','speed','start','end','record']) $(id).disabled = busy;
    $('stop').disabled = !busy;
    $('replay').disabled = busy || !take;
    $('compare').disabled = busy || !take;
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
    const v = video(); saveVideo(v); v.muted = false; v.playbackRate = r.speed;
    await seek(v, r.start, token);
    if (token !== generation) return;
    await v.play();
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
  async function record() {
    const r = range(), v = video(), id = videoId, token = ++generation;
    mode = 'permission'; controls(); status('正在请求麦克风权限…');
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
    if (token !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
    stream = mic;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = mimeType ? new MediaRecorder(mic, { mimeType }) : new MediaRecorder(mic);
    const currentRecorder = recorder, chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { stop(); status('录音失败，请检查麦克风后重试。'); };
    recorder.onstop = async () => {
      mic.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: currentRecorder.mimeType });
      if (id !== videoId || !blob.size) { if (recorder === currentRecorder) { recorder = null; mode = 'idle'; controls(); } return; }
      const value = { videoId: id, ...r, blob, createdAt: Date.now() };
      setTake(value); recorder = null; stream = null; mode = 'idle'; controls();
      status('配音完成，可以随画面回放或对比原声。');
      try { await persist(value); } catch { if (videoId === id && take?.createdAt === value.createdAt) status('录音已完成，但保存失败，请下载备份。'); }
    };
    saveVideo(v); v.muted = true; v.playbackRate = r.speed;
    await seek(v, r.start, token);
    if (token !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
    // Start video first so buffering does not insert a long silent lead-in.
    await v.play();
    if (token !== generation) return;
    recorder.start(250); mode = 'recording'; controls(); status('● 正在配音，视频原声已静音…');
    watchEnd(v, r.end, stop);
    timer = setTimeout(stop, 120000);
  }
  async function replay(token) {
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
    if (token === generation) finish();
  }
  function updateCaption() {
    $('caption').textContent = $('hideText').checked ? '••• 听节奏，试着说出来' : cues[index]?.text || '标记片段后，点击开始配音。';
    $('position').textContent = index >= 0 ? `${index + 1} / ${cues.length}` : '手动片段';
  }
  function select(i) {
    if (mode !== 'idle' || !cues[i]) return;
    index = i; $('start').value = cues[i].start.toFixed(2); $('end').value = cues[i].end.toFixed(2);
    updateCaption(); root.querySelectorAll('.cue').forEach((b, n) => b.classList.toggle('active', n === i));
  }
  function displayCues(next) {
    cues = next; index = -1; $('list').replaceChildren();
    cues.forEach((cue, i) => { const b = document.createElement('button'); b.className = 'cue'; b.textContent = `${Math.floor(cue.start / 60)}:${String(Math.floor(cue.start % 60)).padStart(2, '0')}  ${cue.text}`; b.onclick = () => select(i); $('list').append(b); });
    if (cues.length) select(0); else updateCaption();
  }
  $('close').onclick = () => { stop(); host.style.display = 'none'; };
  $('hideText').onchange = () => { updateCaption(); $('list').style.display = $('hideText').checked ? 'none' : ''; };
  $('prev').onclick = () => select(index - 1); $('next').onclick = () => select(index + 1);
  $('markStart').onclick = guarded(() => { $('start').value = video().currentTime.toFixed(2); index = -1; updateCaption(); });
  $('markEnd').onclick = guarded(() => { $('end').value = video().currentTime.toFixed(2); index = -1; updateCaption(); });
  $('original').onclick = guarded(async () => { const r = range(), token = ++generation; mode = 'original'; controls(); status('正在播放原声…'); await original(r, token); if (token === generation) { finish(); status('原声播放完成。'); } });
  $('record').onclick = guarded(record); $('stop').onclick = stop;
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
