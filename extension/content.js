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
    .hint:empty{display:none}.hint,small{color:#90a4b6;font-size:12px}.eyebrow{font-size:10px;color:#90a4b6;letter-spacing:1.5px}.cue-card{padding:17px;background:#192734;border:1px solid #2e414f;border-radius:14px;margin-bottom:16px}.caption{font-size:21px;line-height:1.65;min-height:64px;padding:10px 0 14px}.cue-nav{display:flex;align-items:center;justify-content:space-between;color:#90a4b6;font-size:12px}.cue-nav button{background:transparent;border:0;padding:2px 8px;color:#a3bbcc;font-size:18px}.caption-options{display:flex;flex-wrap:wrap;gap:12px;border-top:1px solid #30414e;padding-top:10px}.check{display:flex;gap:5px;align-items:center;color:#9ab0bf;font-size:12px;margin:0}#translation{color:#b2c1cd;font-size:14px;line-height:1.7;margin-bottom:14px}#rawCaption{font-size:12px;color:#9ab0bf;margin-top:8px}
    .primary{background:#b3eedb;border-color:#b3eedb;color:#163b32;font-weight:700}.primary:hover{background:#c9f5e8}.main-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.main-actions .primary{grid-column:1 / -1;padding:13px}.secondary-actions{display:flex;gap:8px;margin:10px 0 18px}.secondary-actions button{flex:1;font-size:12px;background:transparent;color:#a5c5d6;padding:8px}.fold{border-top:1px solid #2b3946;padding:13px 0 0;margin-top:14px}.fold > summary{color:#b6c8d6;font-size:12px;list-style:none;display:flex;justify-content:space-between}.fold > summary::after{content:'＋';color:#8199aa}.fold[open] > summary::after{content:'−'}.fold-content{padding-top:8px}.micro button{font-size:11px;padding:7px 4px}.setup{display:flex;gap:12px;align-items:center;justify-content:space-between;background:#192734;border:1px dashed #3b505f;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#90a4b6}.setup button{flex-shrink:0;padding:7px 10px;font-size:12px}.page-title{font-size:17px;font-weight:600;margin:0 0 6px}.page-subtitle{font-size:12px;color:#90a4b6;margin-bottom:18px}.empty{padding:24px 16px;text-align:center;border:1px dashed #3b505f;border-radius:12px;color:#90a4b6;font-size:13px}.empty strong{display:block;color:#d4e1e9;font-size:15px;margin-bottom:6px}.empty button{margin-top:12px}
    .list{max-height:340px;overflow:auto;scrollbar-width:thin;margin-top:16px}.cue{display:block;text-align:left;width:100%;margin:6px 0;font-size:13px;background:#192734;border-color:transparent;padding:12px}.cue.active{border-color:#8cc7b3;background:#263e3c}a{color:#b3eedb}#download{display:none;text-align:center;width:100%;padding:10px;border:1px solid #3a5b54;border-radius:10px;text-decoration:none}
    .word{display:inline;border:0;border-bottom:1px dotted #648a87;border-radius:0;padding:0 1px;background:transparent;font:inherit;color:inherit}.word:hover{background:#2d4647;color:#b3eedb}.word:disabled{opacity:1}.wordcard{background:#0e1821;border:1px solid #37505a;border-radius:12px;padding:12px;margin:12px 0}.wordcard p{font-size:13px;margin:8px 0}.wordcard .row{margin-top:0}canvas{width:100%;height:90px;background:#0e1821;border-radius:10px;margin:12px 0}.analysis-text{font-size:12px;color:#a3b7c6;white-space:pre-line;margin-bottom:12px}
    footer{border-top:1px solid #2b3946;background:#111b24;padding:12px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0}.status{font-size:11px;color:#9ab2c1;flex:1;line-height:1.6;max-height:70px;overflow:auto}#stop{background:#643640;border-color:#88505a;color:#ffe2e6;font-size:12px;padding:8px 12px;flex-shrink:0}
    .history-row{display:block;width:100%;text-align:left;padding:10px 12px;margin:6px 0;font-size:12px;background:#192734}.history-row[aria-pressed="true"]{border-color:#8cc7b3;background:#263e3c}.history-row small{display:block;margin-top:4px}.history-actions{display:flex;justify-content:space-between;margin:12px 0}.history-actions button{font-size:12px;padding:6px 10px;background:transparent}.history-list{max-height:220px;overflow:auto}#historyInfo{font-size:12px;color:#90a4b6;margin-bottom:10px}
    .recording-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.recording-heading .page-title{margin:0}.selected-recording{background:#192734;border:1px solid #355348;border-radius:12px;padding:14px;margin:16px 0}.selected-recording #historyInfo{margin:5px 0;font-size:12px}.selected-recording #recordingText{font-size:14px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.version-choices{display:flex;gap:6px;flex-wrap:wrap}.version-choice{font-size:11px;padding:5px 9px;border-radius:20px;background:transparent;color:#94adbc}.version-choice[aria-pressed="true"]{background:#b3eedb;color:#163b32;border-color:#b3eedb}.recording-search{font-size:12px;margin:10px 0 4px}.recording-timeline{max-height:260px;overflow:auto;scrollbar-width:thin}.history-item{display:flex;align-items:center;gap:6px}.history-item .history-row{flex:1;min-width:0}.history-delete{flex-shrink:0;font-size:12px;padding:8px;color:#ffb4ad;background:transparent}.recording-timeline .history-row{position:relative;padding-left:32px;border-color:transparent}.recording-timeline .history-row::before{content:'▷';position:absolute;left:11px;top:12px;color:#8fbdaf}.recording-timeline .history-row[aria-pressed="true"]{border-color:#8cc7b3}.recording-timeline .history-row small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.recording-timeline .history-row:disabled{opacity:.65}
    .caption-stage{position:relative}.caption-context{font-size:14px;line-height:1.5;color:#c3d4df;opacity:.42;min-height:22px;max-height:44px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;transition:opacity .2s}.caption[data-phase="upcoming"]{color:#c4d9df}.caption[data-phase="ended"]{opacity:.65}.caption-phase{font-size:11px;color:#8fbdae;min-height:17px;margin-top:5px}
    #linePractice:not(.fold){margin-top:16px}#linePractice.fold .main-actions{margin-top:12px}#transcriptSearch{margin-top:14px}
    input[type="range"]{padding:0;border:0;border-radius:0;background:transparent;accent-color:#b3eedb;cursor:pointer}input[type="range"]:disabled{cursor:default}input[type="range"]:focus-visible{outline:2px solid #b3eedb;outline-offset:3px}
    @media(prefers-reduced-motion:reduce){.caption-context{transition:none}}
    .panel{position:relative}.pages{flex:1 1 auto}.resize-handle{position:absolute;left:2px;bottom:2px;width:24px;height:24px;padding:0;border:0;border-radius:0 0 0 16px;background:transparent;color:#8199aa;cursor:nesw-resize;touch-action:none;user-select:none;font-size:16px}.resize-handle:hover{background:#2f4152;color:#b3eedb}footer{padding-left:30px}
  </style><div class="panel" id="panel">
    <header><div><h1>Echo<small>配音与唱歌练习</small></h1></div><button class="close" id="close" aria-label="关闭">×</button></header>
    <nav class="tabs" role="tablist" aria-label="练习面板"><button id="tab-practice" role="tab" aria-selected="true" aria-controls="page-practice" tabindex="0">练习</button><button id="tab-transcript" role="tab" aria-selected="false" aria-controls="page-transcript" tabindex="-1">台词</button><button id="tab-recordings" role="tab" aria-selected="false" aria-controls="page-recordings" tabindex="-1">录音</button></nav>
    <div class="pages">
      <section id="page-practice" role="tabpanel" aria-labelledby="tab-practice">
        <select id="activityMode" aria-label="练习模式"><option value="speech" selected>说对白 · 配音跟读</option><option value="sing">唱歌曲 · 保留伴奏</option></select>
        <div id="singActions" hidden>
          <div class="row"><label class="hint" for="karaokeScope">录唱范围</label><select id="karaokeScope" aria-label="唱歌范围"><option value="whole" selected>整首歌曲</option><option value="clip">当前练习片段</option></select></div>
          <div class="main-actions"><button id="songOriginal">▶ 听原曲</button><button id="songReplay" disabled>▷ 回听演唱</button><button class="primary" id="recordSong">● 开始整首录唱</button></div>
          <div class="row"><span class="hint" id="songReadiness" role="status">先准备伴奏，再开始录唱</span><button id="openBacking">准备伴奏 →</button></div>
          <div id="karaokeNotice" role="alert" style="padding:10px 12px;border:1px solid #d8aa69;border-radius:10px;color:#ffe0ac;font-size:13px;overflow-wrap:anywhere" hidden></div>
          <p class="hint" id="karaokeInfo" role="status"></p>
          <progress id="karaokeProgress" max="100" aria-label="去原唱阶段进度" style="width:100%;accent-color:#b3eedb" hidden></progress>
          <div id="songResult" hidden><small id="songInfo"></small><div class="row"><a id="songDownload">↓ 下载演唱</a></div></div>
        </div>
        <div class="cue-card"><div class="cue-nav"><span class="eyebrow" id="cueHeading">当前台词</span><span><button id="prev" aria-label="上一句">‹</button><span aria-label="当前练习句">练习 <span id="position">手动片段</span></span><button id="next" aria-label="下一句">›</button></span></div>
          <div id="captionPrevious" class="caption-context" aria-label="上一句" hidden></div><div id="captionPhase" class="caption-phase"></div>
          <div class="caption-stage"><div class="caption" id="caption">从一句台词开始，听见自己的进步。</div></div><div id="translation" hidden></div>
          <div id="captionNext" class="caption-context" aria-label="下一句预告" hidden></div>
          <div class="caption-options"><label class="check"><input type="checkbox" id="followCaptions" checked>字幕跟随视频</label><label class="check" id="referenceToggle" hidden><input type="checkbox" id="showChinese">显示参考</label><label class="check"><input type="checkbox" id="hideText">脱稿练习</label></div>
          <details id="rawDetails" class="fold" hidden><summary>完整原文</summary><div id="rawCaption"></div></details>
        </div>
        <details class="fold" id="captionSetup" open><summary id="captionSetupTitle">准备台词 · 读取或导入</summary><div class="fold-content">
        <div class="row"><button id="read">读取台词</button><button id="import">导入字幕</button><button id="openTranscript">选台词 →</button><input id="file" type="file" accept=".srt,.vtt" hidden></div>
        <div id="practiceSetup" class="hint">直接读取视频台词，或导入 SRT / VTT 字幕后开始练习。也可在下方标记片段。</div>
        </div></details>
        <div id="wordcard" class="wordcard" hidden><div class="row"><strong id="wordTitle"></strong><button id="speakWord">▶ 朗读</button><button id="closeWord" aria-label="关闭词卡">×</button></div><small id="phonetic"></small><div id="definitions" role="status"></div><small>释义：Free Dictionary API · 查询时仅发送所选单词</small></div>
        <details id="linePractice" open><summary id="linePracticeSummary" hidden>逐句练唱（可选）</summary>
          <label class="check" id="lineBackingOption" hidden><input id="useBacking" type="checkbox">逐句练唱使用已生成的伴奏</label>
        <div class="main-actions"><button id="original">▶ 听原声</button><button id="replay" disabled>▷ 我的配音</button><button class="primary" id="record">● 开始配音</button></div>
        <div class="secondary-actions"><button id="loop">↻ 单句循环</button><button id="autoPractice">▶ 自动跟读</button></div>
        </details>
        <details class="fold" id="karaokeSettings" hidden><summary>伴奏设置</summary><div class="fold-content">
          <p class="hint">按上方录唱范围生成，最长 10 分钟。准备好后回到主区录唱。</p>
          <div class="row"><span class="hint" id="karaokeService" role="status">伴奏服务 · 尚未检测</span><button id="checkKaraoke">重新检测</button></div>
          <div class="row"><button id="prepareBacking">生成整首伴奏</button><button id="previewBacking" disabled>▷ 试听伴奏</button></div>
          <label class="hint">伴奏音量 · <output id="backingVolumeValue" for="backingVolume">100%</output><input id="backingVolume" type="range" min="0" max="2" step="0.05" value="1" aria-label="伴奏音量"></label><div class="hint">100% 为原始音量，可提升至 200%。</div>
          <details class="fold" id="karaokeHelp"><summary>首次使用：如何启用伴奏？</summary><div class="fold-content hint">
            <p>只需安装一个 Echo 扩展。生成伴奏还需要这台电脑上的 Python、FFmpeg 和分离模型；普通配音、录音与回放无需这些组件。</p>
            <p>① 在项目目录运行 <code>bash start-karaoke.sh</code>，自动安装依赖并启动服务；以后也用此命令启动。<br>② 保持终端开启，回到这里点击“重新检测”，再生成伴奏。首次下载模型及分离歌曲可能需要几分钟。</p>
            <p>Linux 已验证；macOS 脚本尚待实机验证，缺少系统组件时需已有 Homebrew。暂不支持 Windows，也未提供扩展自动启动助手。</p>
            <a href="https://github.com/zexiangliu/echo-english/blob/master/karaoke/README.md" target="_blank" rel="noopener noreferrer">查看伴奏服务安装说明 ↗</a>
            <p>建议戴耳机录唱。分离结果可能残留原唱。</p>
          </div></details>
        </div></details>
        <details class="fold" id="practiceSettings"><summary>练习设置<span id="speedSummary">1× · 循环 3 次</span></summary><div class="fold-content">
          <div class="row"><label class="hint" for="contentLanguage">内容语言</label><select id="contentLanguage" aria-label="内容语言"><option value="auto" selected>自动建议</option><option value="en">英语</option><option value="zh">中文</option><option value="ja">日语</option><option value="ko">韩语</option><option value="und">其他 / 不确定</option></select></div>
          <div class="hint" id="languageInfo">保留完整原文；有台词后可自动建议语言。</div>
          <div class="row"><label class="hint" for="captionLayout">台词格式</label><select id="captionLayout" aria-label="台词格式"><option value="original" selected>完整原文（默认）</option><option value="en-zh">英中混排分开显示</option></select></div>
          <div class="hint">英中拆分仅用于英语内容。中文歌词、日语及韩语均保留原文。读音提示与自动翻译暂未提供。</div>
          <div class="row"><label class="hint" for="speed">播放速度</label><select id="speed" aria-label="练习速度"><option value="0.75">0.75× 慢速</option><option value="1" selected>1× 原速</option><option value="1.25">1.25×</option></select></div>
          <div class="row"><label class="hint" for="loopCount">循环次数</label><select id="loopCount" aria-label="循环次数"><option value="3">3 次</option><option value="5">5 次</option><option value="0">持续循环</option></select></div>
          <div class="row"><label class="hint" for="prepSeconds">跟读准备</label><select id="prepSeconds" aria-label="跟读准备时间"><option value="2">2 秒</option><option value="3" selected>3 秒</option><option value="5">5 秒</option></select></div>
          <label class="check"><input type="checkbox" id="autoNext">回放结束后自动练下一句</label><p class="hint">自动跟读：原声 → 准备 → 配音 → 回放。</p>
        </div></details>
        <details class="fold" id="clipSettings"><summary>片段与边界<span id="clipSummary">0.0–5.0 秒</span></summary><div class="fold-content">
          <div class="row"><label><small>起点</small><input id="start" aria-label="片段起点（秒）" type="number" min="0" step="0.1" value="0"></label><label><small>终点</small><input id="end" aria-label="片段终点（秒）" type="number" min="0" step="0.1" value="5"></label></div>
          <div class="row micro"><button id="startEarlier">起点 −0.2s</button><button id="startLater">起点 +0.2s</button><button id="endEarlier">终点 −0.2s</button><button id="endLater">终点 +0.2s</button></div>
          <div class="row"><button id="markStart">此刻设为起点</button><button id="markEnd">此刻设为终点</button></div><p class="hint">配音时原声静音；每段最长 10 分钟。</p>
        </div></details>
      </section>
      <section id="page-transcript" role="tabpanel" aria-labelledby="tab-transcript" hidden>
        <h2 class="page-title" id="transcriptTitle">找到想练的那一句</h2><div class="page-subtitle">选择一句回到练习；整首录唱无需逐句选择。</div>
        <div class="row"><button class="primary" id="transcriptRead">读取台词</button><button id="transcriptImport">导入字幕</button></div>
        <div class="hint">自动展开文字记录；也可导入 SRT / VTT。</div><div id="transcriptEmpty" class="empty" style="margin-top:18px">还没有台词。点击上方按钮读取。</div><input id="transcriptSearch" type="search" placeholder="搜索台词或歌词" aria-label="搜索台词或歌词" hidden><p class="hint" id="transcriptNoMatches" hidden>没有匹配的台词，试试其他关键词。</p><div class="list" id="list"></div>
        <details class="fold"><summary>寻找更多视频</summary><div class="fold-content"><div class="row"><input id="query" placeholder="对白 / 动漫 / 歌曲 / 歌词" aria-label="视频搜索"><button id="search">搜索</button></div><div class="hint">在 YouTube 打开搜索结果，优先选择有目标语言字幕或歌词的视频。</div></div></details>
      </section>
      <section id="page-recordings" role="tabpanel" aria-labelledby="tab-recordings" hidden>
        <div class="recording-heading"><h2 class="page-title">我的录音</h2><small id="historyCount">0 句</small></div>
        <div class="row"><button class="primary" id="playAll" disabled>▶ 按顺序连播</button></div>
        <div id="recordingEmpty" class="empty"><strong>从第一句开始</strong>录好以后，配音与演唱都会保存在这里。<br><button id="backToPractice">去练一句 →</button></div>
        <div id="recordingContent" class="selected-recording" hidden>
          <div class="eyebrow">当前录音</div><div id="historyInfo"></div><div id="recordingText"></div>
          <div class="row"><button id="reviewReplay">▷ 回放录音</button><button id="compare">⇄ 对比原声</button></div>
          <div id="versionChoices" class="version-choices" role="group" aria-label="当前句的录音版本"></div>
        </div>
        <div class="recording-heading"><small>按视频顺序 · 点一句直接播放</small><small id="recordingSummary"></small></div>
        <input id="recordingSearch" class="recording-search" placeholder="搜索台词、编号或时间" aria-label="查找录音">
        <div id="historyList" class="recording-timeline" aria-label="已录句子"></div>
        <div class="history-actions"><button id="deleteTake" disabled>删除所选版本</button><button id="undoDelete" hidden>撤销删除</button></div>
        <details class="fold" id="recordingDetails"><summary>所选录音详情</summary><div class="fold-content">
          <div id="analysis" hidden><canvas id="waveform" width="660" height="180" role="img" aria-label="录音音量波形，橙色表示低音量停顿"></canvas><div id="analysisText" class="analysis-text" role="status"></div><small>波形显示音量和停顿，不代表发音准确度。</small></div>
          <button id="reuseSongRange" hidden>使用此版范围练唱</button>
          <div class="row"><a id="download">↓ 下载所选录音</a></div>
          <small>每个练习片段保留最近 3 次，演唱与配音分别保存。连播使用各片段最新版本。</small>
        </div></details>
      </section>
    </div>
    <footer><div class="status" id="status" role="status">准备好了，从一句开始。</div><button id="stop" disabled hidden>■ 停止</button></footer>
    <button class="resize-handle" id="resizePanel" aria-label="调整面板大小" title="拖动左下角调整大小；双击或按 Home 恢复默认。方向键微调，Shift 加速。">⤢</button>
  </div>`;
  const $ = id => root.getElementById(id);
  EchoPanelSize.attach({panel:$('panel'),host,handle:$('resizePanel'),env:window});
  let cues = [], index = -1, take = null, mode = 'idle', generation = 0;
  let recorder = null, stream = null, audio = null, frame = 0, timer = 0, savedVideo = null;
  let pendingDone = null;
  let activity = 'speech';
  let captionVideo = null, captionSignature = '', captionGhost = null;
  const captionEvents = ['timeupdate','seeking','seeked','play','pause','ended'];
  let savedBackings = [], activeKaraokeJob = null, recordMix = null, songTake = null, songUrl = null;
  let backingRestoreRequest=0, restoringBacking=false, karaokeIssue='';
  let backingOutput=null;
  let serviceState='unknown',serviceCheck=null,serviceMaxSeconds=null;
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
    if(name==='recordings'){ if(!take && videoHistory.length)setTake(EchoPractice.recordingQueue(videoHistory)[0]);renderHistory(); }
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
    $('speedSummary').textContent = isSinging()?`${$('speed').value}×`:`${$('speed').value}× · ${$('loopCount').value === '0' ? '持续循环' : '循环 '+$('loopCount').value+' 次'}`;
    $('clipSummary').textContent = `${Number($('start').value).toFixed(1)}–${Number($('end').value).toFixed(1)} 秒`;
    updateBackingControls();
  }
  function isSinging() {return activity==='sing';}
  function usesBacking() {return isSinging() && $('useBacking').checked;}
  function renderActivity() {
    $('activityMode').value=activity;
    const singing=isSinging();
    $('singActions').hidden=!singing;$('karaokeSettings').hidden=!singing;
    $('karaokeSettings').open=false;
    $('linePracticeSummary').hidden=!singing;$('linePractice').open=!singing;
    $('linePractice').className=singing?'fold':'';
    $('lineBackingOption').hidden=!singing;
    $('cueHeading').textContent=singing?'当前歌词':'当前台词';
    $('record').textContent=singing?'● 录这一句':'● 开始配音';
    $('original').textContent=singing?'▶ 听这一句':'▶ 听原声';
    $('replay').textContent=singing?'▷ 回听这一句':'▷ 我的配音';
    $('tab-transcript').textContent=singing?'歌词':'台词';
    if(!isSinging())$('useBacking').checked=false;
    updateCaption();
  }
  $('activityMode').onchange=()=>{
    if(mode==='idle'){activity=$('activityMode').value==='sing'?'sing':'speech';karaokeIssue='';}
    renderActivity();controls();
    if(isSinging()){void checkKaraokeService();void restoreServerBacking();}
  };
  function backingFor(r) {return savedBackings.find(value=>EchoKaraoke.covers(value,videoId,r)) || null;}
  function songRange() {
    if($('karaokeScope').value==='clip')return range();
    const v=video();
    if(v.duration>600)throw Error('视频超过 10 分钟，请选择「当前练习片段」并设置歌曲起止时间。');
    if(v.duration<=0)throw Error('请等待视频加载。');
    return {start:0,end:v.duration,speed:Number($('speed').value)};
  }
  function updateBackingControls() {
    if(!isSinging()){
      for(const id of ['previewBacking','recordSong','prepareBacking','songReplay','songOriginal'])$(id).disabled=true;
      return;
    }
    const busy=mode!=='idle', whole=$('karaokeScope').value!=='clip';
    let target=null,error='';try{target=songRange();}catch(e){error=e.message;}
    const ready=target && backingFor(target);
    $('previewBacking').disabled=busy || !ready;
    // A missing prerequisite should lead to preparation instead of a dead button.
    $('recordSong').disabled=busy;
    $('songOriginal').disabled=busy;
    $('songReadiness').textContent=ready?'伴奏已就绪':mode==='separating'?'正在准备伴奏…':restoringBacking?'正在查找已有伴奏…':'尚未准备伴奏';
    $('openBacking').textContent=ready?'调整伴奏':'准备伴奏 →';
    $('prepareBacking').disabled=busy || !!ready;
    $('karaokeNotice').hidden=!karaokeIssue;
    $('karaokeNotice').textContent=karaokeIssue;
    $('prepareBacking').textContent=mode==='separating'?'正在生成伴奏…':ready?'伴奏已就绪':whole?'生成整首伴奏':'生成片段伴奏';
    const recorded=target && videoHistory.some(t=>t.kind==='song' && Math.abs(t.start-target.start)<0.01 && Math.abs(t.end-target.end)<0.01 && t.speed===target.speed);
    $('recordSong').textContent=recorded?'● 再录一次':whole?'● 开始整首录唱':'● 开始片段录唱';
    $('recordSong').title='使用当前范围和速度录唱，保留之前的版本。';
    $('songReplay').disabled=busy || !songTake;
    if(busy)return;
    if(restoringBacking)$('karaokeInfo').textContent='正在查找已生成的伴奏…';
    else if(error)$('karaokeInfo').textContent=error;
    else if(karaokeIssue)$('karaokeInfo').textContent='';
    else if(ready)$('karaokeInfo').textContent='戴上耳机，点击开始录唱。';
    else $('karaokeInfo').textContent=serviceState==='online'?'':serviceState==='offline'?'伴奏服务未连接。请查看下方启动说明，启动后点击“重新检测”。已有的伴奏和录音仍可使用。':'首次使用需准备本机伴奏服务，点击“准备伴奏”查看。';
  }
  function setSongTake(value) {
    if(songTake?.id===value?.id)return;
    if(songUrl)URL.revokeObjectURL(songUrl);
    songTake=value || null;songUrl=value ? URL.createObjectURL(value.blob) : null;
    $('songResult').hidden=!value;
    $('songInfo').textContent=value ? `最近演唱 · ${Math.round((value.end-value.start)/value.speed)} 秒 · 已保留，可回听或重录` : '';
    $('songDownload').href=songUrl || '';
    $('songDownload').download=value ? `echo-song-${videoId}-${value.createdAt}.webm` : '';
    updateBackingControls();
  }
  $('speed').onchange = () => {updateSummaries();saveProgress();}; $('loopCount').onchange = updateSummaries;
  function currentId() { return new URL(location.href).searchParams.get('v'); }
  function video() {
    if (location.pathname !== '/watch' || !currentId()) throw Error('请先打开一个 YouTube 视频播放页。');
    const v = document.querySelector('video.html5-main-video');
    if (!v || !Number.isFinite(v.duration)) throw Error('请等待视频加载，直播暂不支持。');
    if (document.querySelector('.html5-video-player.ad-showing')) throw Error('请等待广告结束后再练习。');
    attachCaptionVideo(v);
    return v;
  }
  function status(text) { $('status').textContent = text; }
  function controls() {
    const busy = mode !== 'idle';
    const recording=mode==='recording';
    $('activityMode').hidden=recording;
    $('singActions').hidden=!isSinging() || recording;
    $('karaokeSettings').hidden=!isSinging() || recording;
    for(const id of ['captionSetup','linePractice','practiceSettings','clipSettings'])$(id).hidden=recording;
    for (const id of ['contentLanguage','captionLayout','activityMode','read','import','transcriptRead','transcriptImport','prepareBacking','karaokeScope','useBacking','backingVolume','prev','next','markStart','markEnd','original','speed','start','end','record','startEarlier','startLater','endEarlier','endLater','loop','loopCount','autoPractice','prepSeconds','autoNext']) $(id).disabled = busy;
    for(const id of ['karaokeScope','useBacking'])$(id).disabled=busy || !isSinging();
    $('backingVolume').disabled=!isSinging() || !['idle','backing','recording'].includes(mode);
    $('backingVolumeValue').textContent=`${Math.round(Number($('backingVolume').value)*100)}%`;
    $('prev').disabled=busy || index<=0;
    $('next').disabled=busy || index<0 || index>=cues.length-1;
    updateBackingControls();
    $('stop').disabled = !busy || mode==='saving'; $('stop').hidden = !busy;
    $('stop').textContent=mode==='recording'?'■ 结束录音':mode==='saving'?'保存中…':'■ 停止';
    $('reviewReplay').disabled = busy || !take;
    $('playAll').disabled = busy || !videoHistory.length;
    $('replay').disabled = busy || !take;
    $('compare').disabled = busy || !take;
    $('speakWord').disabled = busy;
    $('reuseSongRange').disabled=busy;
    $('deleteTake').disabled = busy || !take; $('undoDelete').disabled = busy;
    root.querySelectorAll('.version-choice').forEach(b=>b.disabled=busy && mode!=='replay');
    root.querySelectorAll('.history-row').forEach(b=>b.disabled=busy && mode!=='replay');
    root.querySelectorAll('.history-delete').forEach(b=>b.disabled=busy && mode!=='replay');
    root.querySelectorAll('.word').forEach(b => b.disabled = busy);
    root.querySelectorAll('.cue').forEach(b => b.disabled = busy);
  }
  function range() {
    const start = Number($('start').value), end = Number($('end').value), v = video();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > v.duration + 0.1) throw Error('请设置有效起止时间，终点需在视频时长内。');
    if (end - start > 600) throw Error('每个练习片段最长 10 分钟，请缩短片段。');
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
    recordMix?.pause();
  }
  function finish() { cancelPlayback(); restoreVideo(); mode = 'idle'; controls(); }
  function stop() {
    window.speechSynthesis?.cancel();
    if (mode === 'loading') restoring = false;
    if (mode === 'reading') status('已停止读取台词。');
    if (mode === 'separating') {karaokeIssue='已停止生成伴奏，可重新生成。';status('已停止生成伴奏。');$('karaokeInfo').textContent='已停止，可重新生成本段伴奏。';$('karaokeProgress').hidden=true;}
    if(activeKaraokeJob){void karaokeRequest('cancel',{jobId:activeKaraokeJob}).catch(()=>{});activeKaraokeJob=null;}
    generation++;
    cancelPlayback(); restoreVideo();
    if (recorder && recorder.state !== 'inactive') { mode = 'saving'; recorder.stop(); }
    else { recordMix?.dispose();recordMix=null;recorder=null;stream?.getTracks().forEach(t => t.stop()); stream = null; mode = 'idle'; }
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
    if(value && take?.id===value.id){controls();return;}
    if (take?.url) URL.revokeObjectURL(take.url);
    take = value ? { ...value, url: URL.createObjectURL(value.blob) } : null;
    $('download').style.display = take ? 'block' : 'none';
    $('recordingEmpty').hidden = !!take || !!videoHistory.length; $('recordingContent').hidden = !take;
    $('historyInfo').textContent = take ? `${take.label || '手动片段'} · ${take.start.toFixed(1)}–${take.end.toFixed(1)} 秒 · ${take.speed}×${take.withBacking ? ' · 含伴奏' : ''}` : '';
    $('recordingText').textContent=take ? recordingText(take) : '';
    $('reuseSongRange').hidden=take?.kind!=='song';
    if (take) { $('download').href = take.url; $('download').download = `echo-${videoId}-${take.start.toFixed(1)}.webm`; }
    controls();
    analysisRequest++;
    $('analysis').hidden=!take;
    if($('recordingDetails').open)void analyzeTake(take);
  }
  function currentCueKey() {
    return EchoStorage.cueKey(cues[index], Number($('start').value), Number($('end').value));
  }
  function saveProgress() {
    if (restoring || !videoId) return;
    const start = Number($('start').value), end = Number($('end').value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return;
    const session = {backingVolume:Number($('backingVolume').value),contentLanguage:$('contentLanguage').value,captionLayout:$('captionLayout').value,videoId,cues:cues.map(c=>({...c})),index,start,end,speed:$('speed').value,showChinese:$('showChinese').checked,hideText:$('hideText').checked,followCaptions:$('followCaptions').checked,karaokeScope:$('karaokeScope').value,selectedTakeId:take?.id,updatedAt:Date.now()};
    void storage.saveSession(session).catch(()=>{
      if (!progressWarning && session.videoId === videoId) { progressWarning=true; status('练习位置未能保存，请检查本地存储空间。录音仍可下载。'); }
    });
  }
  function recordingText(value) {
    const cue=cues.find(c=>c.key===value.cueKey);
    return cue ? captionText(cue) : value.label || '手动片段';
  }
  function recordingTime(value) {return `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;}
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
      remove.setAttribute('aria-label',`删除${value.label || '手动片段'}的最新录音版本`);
      remove.title='删除此句的最新版本，可撤销';
      remove.onclick=guarded(()=>deleteRecording(value));row.append(button,remove);list.append(row);
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
    const matching=videoHistory.filter(t=>t.cueKey===currentCueKey());
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
      savedBackings=backings;videoHistory=values;setSongTake(values.find(t=>t.kind==='song')); mode='idle';
      if(session) {
        $('contentLanguage').value=EchoLanguages.validLanguage(session.contentLanguage)?session.contentLanguage:'auto';
        // Older sessions intentionally used English/Chinese splitting. Keep
        // that preference only when their text is confidently English.
        const sample=(session.cues || []).slice(0,32).map(c=>c.text).join(' ');
        $('captionLayout').value=['original','en-zh'].includes(session.captionLayout)?session.captionLayout:EchoLanguages.detect(sample)==='en'?'en-zh':'original';
        $('speed').value=['0.75','1','1.25'].includes(session.speed)?session.speed:'1';
        $('karaokeScope').value=session.karaokeScope==='clip'?'clip':'whole';
        $('backingVolume').value=Number.isFinite(session.backingVolume)?Math.max(0,Math.min(2,session.backingVolume)):1;
        $('showChinese').checked=!!session.showChinese; $('hideText').checked=!!session.hideText; $('followCaptions').checked=session.followCaptions!==false;
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
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('伴奏服务响应超时。请在项目根目录运行 bash start-karaoke.sh；若已启动，请重新加载扩展并刷新 YouTube 页面。')),action==='audio'?35000:12000);})
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
        serviceState='online';serviceMaxSeconds=Number.isFinite(result.maxSeconds)?result.maxSeconds:300;
        $('karaokeService').textContent=serviceMaxSeconds<600?'伴奏服务 · 已连接旧版，请重启服务以支持 10 分钟':'伴奏服务 · 已连接';
        $('karaokeHelp').open=serviceMaxSeconds<600;
      }catch{
        serviceState='offline';$('karaokeService').textContent='伴奏服务 · 未连接（未启动或不可用）';$('karaokeHelp').open=true;
      }finally{$('checkKaraoke').disabled=false;serviceCheck=null;updateBackingControls();}
    })();
    return serviceCheck;
  }
  $('checkKaraoke').onclick=async()=>{await checkKaraokeService();if(serviceState==='online'){karaokeIssue='';controls();await restoreServerBacking();}};
  async function keepBacking(value) {
    savedBackings=[value,...savedBackings.filter(old=>old.key!==value.key)].slice(0,8);
    try{await storage.saveBacking(value);return true;}
    catch{if(value.videoId===videoId)status('伴奏可以使用，但本地保存失败；刷新后可能需要从本机服务重新取回。');return false;}
  }
  async function restoreServerBacking() {
    if(!isSinging() || mode!=='idle' || restoringBacking)return;
    let r;try{r=songRange();}catch{return;}
    if(backingFor(r))return;
    const id=videoId, request=++backingRestoreRequest;
    restoringBacking=true;controls();
    try{
      const result=await karaokeRequest('cached',{videoId:id});
      if(id!==videoId || request!==backingRestoreRequest)return;
      const cached=result.backings?.find(value=>EchoKaraoke.covers(value,id,r));
      if(!cached)return;
      const audio=await karaokeRequest('audio',{jobId:cached.id});
      if(id!==videoId || request!==backingRestoreRequest)return;
      const stored=await keepBacking({key:EchoKaraoke.key(id,cached),videoId:id,start:cached.start,end:cached.end,createdAt:Date.now(),blob:EchoKaraoke.blobFromBase64(audio)});
      if(stored && id===videoId && isSinging() && mode==='idle')status('已恢复之前生成的伴奏，无需重新分离。');
    }catch{/* Cache lookup is optional; ordinary dubbing and explicit generation still work. */}
    finally{if(request===backingRestoreRequest){restoringBacking=false;controls();}}
  }
  $('backingVolume').oninput=()=>{
    const volume=Number($('backingVolume').value);
    $('backingVolumeValue').textContent=`${Math.round(volume*100)}%`;
    backingOutput?.setVolume(volume);recordMix?.setVolume?.(volume);
  };
  $('backingVolume').onchange=saveProgress;
  $('karaokeScope').onchange=()=>{karaokeIssue='';controls();saveProgress();if(!restoringBacking)void restoreServerBacking();};
  $('openBacking').onclick=()=>{
    $('karaokeSettings').open=true;
    $('karaokeSettings').scrollIntoView?.({block:'nearest'});
  };
  $('songOriginal').onclick=guarded(async()=>{
    if(mode!=='idle' || !isSinging())return;
    const r=songRange(),token=++generation;mode='original';controls();status('正在播放原曲…');
    await original(r,token);if(token===generation)finish();
  });
  $('recordSong').onclick=guarded(()=>{
    if(mode!=='idle' || !isSinging())return;
    let r;
    try{r=songRange();}catch(error){karaokeIssue=error.message;controls();$('clipSettings').open=true;status('请先调整录唱范围。');return;}
    if(!backingFor(r)){
      $('openBacking').click();status('先生成伴奏，再点击开始录唱。');return;
    }
    $('useBacking').checked=true;
    return record({range:r,song:true});
  });
  $('reuseSongRange').onclick=()=>{
    if(mode!=='idle' || take?.kind!=='song')return;
    const value=take;activity='sing';renderActivity();
    $('start').value=value.start;$('end').value=value.end;$('speed').value=String(value.speed);
    $('karaokeScope').value='clip';updateSummaries();controls();saveProgress();showPage('practice');
    status('已使用此版的范围和速度，点击主按钮录唱。');void checkKaraokeService();void restoreServerBacking();
  };
  $('songReplay').onclick=guarded(()=>isSinging() && songTake && playRecording(songTake));
  $('prepareBacking').onclick=guarded(async()=>{
    if(mode!=='idle' || !isSinging())return;
    // Explicit generation takes priority over the optional cache lookup.
    backingRestoreRequest++;restoringBacking=false;
    karaokeIssue='';
    let r;
    try{r=songRange();}catch(error){karaokeIssue=error.message;controls();status(error.message);return;}
    if(serviceState==='online' && serviceMaxSeconds<r.end-r.start){
      karaokeIssue='当前运行的是旧版伴奏服务。请在服务终端按 Ctrl+C，再运行 ./start-karaoke.sh，最后点击“重新检测”。';
      $('karaokeHelp').open=true;controls();status('请重启旧版伴奏服务。');return;
    }
    if(serviceState==='offline'){
      karaokeIssue='伴奏尚未开始生成：本机服务未连接。请在项目根目录运行 bash start-karaoke.sh（首次自动安装），保持终端开启，再点击“重新检测”。';
      $('karaokeHelp').open=true;controls();status(karaokeIssue);
      $('karaokeNotice').scrollIntoView?.({block:'nearest'});return;
    }
    const id=videoId, token=++generation;
    video().pause();mode='separating';controls();
    $('karaokeSettings').open=false;$('singActions').scrollIntoView?.({block:'nearest'});
    $('karaokeProgress').hidden=false;$('karaokeProgress').removeAttribute('value');
    status('正在准备伴奏，请稍候…');$('karaokeInfo').textContent='正在连接本机伴奏服务…';
    $('karaokeNotice').textContent='正在连接本机伴奏服务，请稍候…';$('karaokeNotice').hidden=false;
    let job;
    try {
      job=await karaokeRequest('start',{videoId:id,start:r.start,end:r.end});
      if(token!==generation){void karaokeRequest('cancel',{jobId:job.id}).catch(()=>{});return;}
      activeKaraokeJob=job.id;
      $('karaokeNotice').hidden=true;
      while(token===generation && id===videoId){
        if(job.state==='error')throw Error(job.error || '伴奏生成失败，请重试。');
        if(job.state==='cancelled')throw Error('伴奏任务已停止，请重新生成。');
        if(job.state==='ready')break;
        const text=EchoKaraoke.progressText(job);
        if(job.state==='separating' && Number.isFinite(job.progress))$('karaokeProgress').value=job.progress;
        else $('karaokeProgress').removeAttribute('value');
        status('正在生成伴奏，可随时停止。');$('karaokeInfo').textContent=text;
        await new Promise(resolve=>setTimeout(resolve,1500));
        if(token!==generation)return;
        job=await karaokeRequest('status',{jobId:job.id});
      }
      if(token!==generation || id!==videoId)return;
      $('karaokeProgress').value=100;status('正在加载伴奏…');$('karaokeInfo').textContent=EchoKaraoke.progressText(job);
      const result=await karaokeRequest('audio',{jobId:job.id});
      if(token!==generation || id!==videoId)return;
      const stored=await keepBacking({key:EchoKaraoke.key(id,r),videoId:id,start:r.start,end:r.end,createdAt:Date.now(),blob:EchoKaraoke.blobFromBase64(result)});
      if(token!==generation || id!==videoId)return;
      $('useBacking').checked=true;saveProgress();if(stored)status('伴奏已生成并保存，刷新后也可恢复。准备好后点击「开始录唱」。');
    } catch(error) {
      if(token!==generation)return;
      karaokeIssue=error.message || '伴奏生成失败，请重试。';
      $('karaokeHelp').open=true;
      $('karaokeInfo').textContent='';status('未能生成伴奏，请查看按钮下方提示。');
    } finally {
      if(token===generation){activeKaraokeJob=null;$('karaokeProgress').hidden=true;mode='idle';controls();if(karaokeIssue)$('karaokeNotice').scrollIntoView?.({block:'nearest'});}
    }
  });
  $('previewBacking').onclick=guarded(async()=>{
    if(mode!=='idle' || !isSinging())return;
    const r=songRange(), ready=backingFor(r);if(!ready)return;
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
        backingOutput=output;
        status('正在试听去原唱伴奏…');await v.play();if(token!==generation)return;sync();
        await new Promise(resolve=>{pendingDone=resolve;a.onended=resolve;watchEnd(v,r.end,resolve);timer=setTimeout(resolve,EchoPractice.playbackTimeout(r));});
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
  async function record(options = {}) {
    window.speechSynthesis?.cancel();
    const r = options.range || range(), v = video(), id = videoId, token = options.token ?? ++generation;
    const ready=usesBacking() ? backingFor(r) : null;
    if(usesBacking() && !ready)throw Error('请先为当前片段生成伴奏，或关闭「录制时保留伴奏」。');
    deletedTake=null;$('undoDelete').hidden=true;
    mode = 'permission'; controls(); status('正在请求麦克风权限…');
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
    if (token !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
    stream = mic;
    const mix=ready ? await EchoKaraoke.createMix({blob:ready.blob,mic,video:v,start:ready.start,speed:r.speed,volume:Number($('backingVolume').value)}) : null;
    if(token!==generation){mix?.dispose();mic.getTracks().forEach(t=>t.stop());return;}
    recordMix=mix;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const recordingStream=mix ? mix.stream : mic;
    recorder = mimeType ? new MediaRecorder(recordingStream, { mimeType }) : new MediaRecorder(recordingStream);
    const recordedKey=options.song ? `song:${EchoStorage.cueKey(null,r.start,r.end)}` : currentCueKey();
    const recordedLabel=options.song ? (r.start===0 && Math.abs(r.end-v.duration)<0.01?'整首演唱':'片段演唱') : index>=0 ? `第 ${index+1} 句` : '手动片段';
    const currentRecorder = recorder, chunks = [];
    const onWaiting=()=>{mix?.pause();if(currentRecorder.state==='recording')currentRecorder.pause();};
    const onPlaying=()=>{
      if(token!==generation || !['recording','paused'].includes(currentRecorder.state))return;
      void Promise.resolve(mix?.sync()).then(()=>{if(token===generation && currentRecorder.state==='paused')currentRecorder.resume();})
        .catch(()=>{if(token===generation){stop();status('伴奏播放失败，录音已停止，请重新生成伴奏。');}});
    };
    let resolveRecording;
    const completed = new Promise(resolve => { resolveRecording = resolve; });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { stop(); status('录音失败，请检查麦克风后重试。'); };
    recorder.onstop = async () => {
      v.removeEventListener('waiting',onWaiting);v.removeEventListener('playing',onPlaying);
      mix?.dispose();if(recordMix===mix)recordMix=null;
      mic.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: currentRecorder.mimeType });
      if (!blob.size) { if (recorder === currentRecorder) { recorder = null; stream=null; if(id===videoId) {mode = 'idle'; controls();} } resolveRecording(false); return; }
      const value = { id:crypto.randomUUID(),videoId:id,cueKey:recordedKey,label:recordedLabel,...r,blob,createdAt:Date.now(),...(mix?{withBacking:true}:{}),...(options.song?{kind:'song'}:{}) };
      if(recorder===currentRecorder){recorder=null;stream=null;}
      if(id===videoId){
        if(options.song)setSongTake(value);
        setTake(value);mode=options.keepBusy && token===generation?'practice':'idle';controls();saveProgress();
        status('录音完成，正在保存…');
      }
      try {
        await storage.saveTake(value);
        if(id===videoId){
          const values=await storage.listTakes(id);
          if(id===videoId){videoHistory=values;renderHistory();if(token===generation || take?.id===value.id && mode==='idle')status(mix?'演唱完成，歌声与伴奏已一起保存。':'配音完成，已加入本句录音版本。');}
        }
      }catch{if(videoId===id && take?.id===value.id)status('录音已完成，但保存失败，请下载备份。');}
      finally{resolveRecording(true);}
    };
    saveVideo(v); v.muted = true; v.playbackRate = r.speed;
    await seek(v, r.start, token);
    if (token !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
    // Start video first so buffering does not insert a long silent lead-in.
    await v.play();
    if (token !== generation) return;
    recorder.start(250); mode = 'recording'; controls();
    v.addEventListener('waiting',onWaiting);v.addEventListener('playing',onPlaying);
    if(mix)await mix.sync();
    if(token!==generation)return completed;
    status(mix?'● 正在演唱，保留伴奏并录下你的歌声…':'● 正在配音，视频原声已静音…');
    const endRecording = () => {
      if (token !== generation) return;
      cancelPlayback(); restoreVideo(); mode = 'saving'; controls();
      if (currentRecorder.state !== 'inactive') currentRecorder.stop();
    };
    watchEnd(v, r.end, endRecording);
    timer = setTimeout(endRecording, EchoPractice.playbackTimeout(r));
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
    // The recording is the playback clock: never seek past its opening to catch
    // up with a video that started earlier or resumed from buffering.
    let started=false,buffering=false;
    const onWaiting = () => {if(started){buffering=true;a.pause();}};
    const onPlaying = () => {
      if(audio!==a || !started || !buffering)return;
      buffering=false;
      const position=Math.min(t.end,t.start+(a.currentTime || 0)*t.speed);
      if(Math.abs(v.currentTime-position)>0.15)v.currentTime=position;
      void a.play().catch(()=>{if(audio===a){stop();status('录音无法播放，请重试或下载录音。');}});
    };
    v.addEventListener('waiting', onWaiting); v.addEventListener('playing', onPlaying);
    let ended=false,resolvePlayback;
    const playbackDone=new Promise(resolve=>{resolvePlayback=resolve;});
    a.onended=()=>{ended=true;resolvePlayback();};
    try {
      a.preload='auto';
      await a.play();
      if (token !== generation) return;
      pendingDone=resolvePlayback;
      if(!ended){
        await v.play();
        if (token !== generation) return;
        started=true;
        const position=Math.min(t.end,t.start+(a.currentTime || 0)*t.speed);
        if(!ended && Math.abs(v.currentTime-position)>0.15)v.currentTime=position;
        // A partially recorded take or delayed video must not cut off the file.
        watchEnd(v, t.end, () => v.pause());
        timer = setTimeout(resolvePlayback, EchoPractice.playbackTimeout(t));
      }
      await playbackDone;
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
    updateLanguageInfo();updateCaption();renderCueList();renderHistory();
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
    const cue=cues[shownIndex], hidden=$('hideText').checked;
    const motion=animate && !hidden && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(captionGhost){captionGhost.remove();captionGhost=null;}
    const outgoing=motion ? $('caption').cloneNode?.(true) : null;
    $('caption').replaceChildren();
    if(hidden)$('caption').textContent='••• 听节奏，试着说出来';
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
    $('captionPrevious').hidden=hidden || !cue;$('captionNext').hidden=hidden || !cue;
    $('captionPhase').textContent=hidden?'':phase==='upcoming'?'即将开始':phase==='active'?`当前台词 · ${shownIndex+1} / ${cues.length}`:phase==='ended'?'台词已结束':'';
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
    $('practiceSetup').hidden=cues.length>0;updateSummaries();
    $('position').textContent=index>=0 ? `${index+1} / ${cues.length}` : '手动片段';
    syncCaptions();
  }
  $('followCaptions').onchange=()=>{updateCaption();saveProgress();};
  document.addEventListener('play',event=>{
    if(event.target?.matches?.('video.html5-main-video')){attachCaptionVideo(event.target);syncCaptions(true);}
  },true);
  function select(i, fromList=false) {
    if (mode !== 'idle' || !cues[i]) return;
    index = i; $('start').value = cues[i].start.toFixed(2); $('end').value = cues[i].end.toFixed(2);
    updateCaption(); chooseCurrentTake(); saveProgress(); showPage('practice');renderCueList();
    if(fromList && isSinging()){$('linePractice').open=true;$('linePractice').scrollIntoView?.({block:'nearest'});}
  }
  function displayCues(next, preferredIndex = 0) {
    cues = next.map(c=>({...c,key:EchoStorage.cueKey(c)})); index = -1; $('list').replaceChildren();
    $('transcriptSearch').value='';
    $('captionSetup').open=!cues.length;
    $('captionSetupTitle').textContent=cues.length?`台词与字幕 · ${cues.length} 句`:'准备台词 · 读取或导入';
    $('transcriptEmpty').hidden = next.length > 0;
    renderCueList();
    if (cues.length && preferredIndex >= 0) select(Math.min(preferredIndex,cues.length-1)); else {updateCaption();chooseCurrentTake();saveProgress();}
  }
  function rememberBounds() {
    updateSummaries();
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
      advance:()=>{ if (!autoNext || index < 0 || index+1 >= cues.length || (usesBacking() && !backingFor(cues[index+1]))) return false; mode='idle'; select(index+1); mode='practice'; controls(); return true; }
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
  $('import').onclick = $('transcriptImport').onclick = () => { if(mode==='idle')$('file').click(); };
  $('file').onchange = guarded(async () => {
    const file=$('file').files[0];$('file').value='';
    if(!file || mode!=='idle')return;
    if(file.size>5e6)throw Error('字幕文件请小于 5 MB。');
    const token=++generation,id=videoId;mode='importing';controls();status('正在导入字幕…');
    try{
      const next=EchoSubtitles.parse(await file.text());
      if(token!==generation || id!==currentId())return;
      if(!next.length)throw Error('未找到有效字幕，请使用 SRT 或 VTT 文件。');
      mode='idle';displayCues(next);status(`已导入 ${next.length} 句台词。`);
    }finally{if(token===generation){mode='idle';controls();}}
  });
  $('read').onclick = $('transcriptRead').onclick = guarded(async () => {
    if(mode!=='idle')return;
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
  $('search').onclick = () => { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent($('query').value || ({'zh':'中文 歌词','ja':'日本語 字幕 歌詞','ko':'한국어 자막 가사','en':'english conversation subtitles'}[contentLanguage()] || 'subtitles lyrics'))}`, '_blank', 'noopener'); };
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'echo-toggle') { const open = host.style.display === 'none'; host.style.display = open ? 'block' : 'none'; if (!open) stop(); } });
  document.addEventListener('yt-navigate-finish', () => {
    const id = currentId(); if (id === videoId) return;
    stop();detachCaptionVideo();backingRestoreRequest++;restoringBacking=false;karaokeIssue='';activity='speech';$('contentLanguage').value='auto';$('captionLayout').value='original';renderActivity();savedBackings=[];$('karaokeScope').value='whole';$('backingVolume').value=1;setSongTake(null);$('useBacking').checked=false;$('karaokeInfo').textContent='已切换视频，请为新片段生成伴奏。'; restoring=true; videoId=id; historyRequest++;videoHistory=[];deletedTake=null;$('undoDelete').hidden=true;setTake(null);displayCues([]); $('start').value = 0; $('end').value = 5; updateSummaries();
    status('已切换视频，请重新选择台词或片段。'); if (id) void loadVideo(id); else restoring=false;
  });
  window.addEventListener('pagehide',()=>{saveProgress();stop();detachCaptionVideo();if(songUrl)URL.revokeObjectURL(songUrl);});
  attachCaptionVideo(document.querySelector('video.html5-main-video'));renderActivity();controls(); if(videoId) void loadVideo(videoId); else restoring=false;
})();
