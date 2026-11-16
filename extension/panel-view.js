// Static shadow-DOM view. Behavior and state are owned by content.js.
(function(root) {
  const html = `<style>
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
        <select id="activityMode" aria-label="练习模式"><option value="speech" selected>说对白 · 配音跟读</option><option value="sing">唱歌曲 · 伴奏监听</option></select>
        <div id="singActions" hidden>
          <div class="row"><label class="hint" for="karaokeScope">录唱范围</label><select id="karaokeScope" aria-label="唱歌范围"><option value="whole" selected>整首歌曲</option><option value="clip">当前练习片段</option></select></div>
          <div class="main-actions"><button id="songOriginal">▶ 听原曲</button><button id="songReplay" disabled>▷ 回听人声</button><button class="primary" id="recordSong">● 开始整首录唱</button></div>
          <div class="row"><span class="hint" id="songReadiness" role="status">先准备伴奏，再开始录唱</span><button id="openBacking">准备伴奏 →</button></div>
          <div id="karaokeNotice" role="alert" style="padding:10px 12px;border:1px solid #d8aa69;border-radius:10px;color:#ffe0ac;font-size:13px;overflow-wrap:anywhere" hidden></div>
          <p class="hint" id="karaokeInfo" role="status"></p>
          <progress id="karaokeProgress" max="100" aria-label="去原唱阶段进度" style="width:100%;accent-color:#b3eedb" hidden></progress>
          <div id="songResult" hidden><small id="songInfo"></small><details class="fold"><summary>下载演唱</summary><div class="row"><a id="songDownload">↓ 仅人声</a><button id="songMixDownload">人声＋伴奏</button></div><small>原始人声为 WebM；合成 WAV 暂支持 1× 录唱。</small></details></div>
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
          <label class="check" id="lineBackingOption" hidden><input id="useBacking" type="checkbox">逐句练唱时监听伴奏（仅录人声）</label>
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
        <details class="fold" id="songAssembly" hidden><summary>分段合成整首</summary><div class="fold-content">
          <p class="hint" id="assemblyInfo"></p>
          <select id="assemblyType" aria-label="整首下载内容"><option value="vocal">仅人声</option><option value="mixed">人声＋整首伴奏</option></select>
          <p class="hint">按视频时间轴合成，重叠处用最新录音，未录处保留空白。暂支持 1× 录唱；WAV 文件约 10 MB / 分钟。</p>
          <button id="assembleSong">合成并下载整首</button>
        </div></details>
        <details class="fold" id="recordingDetails"><summary>所选录音详情</summary><div class="fold-content">
          <div id="analysis" hidden><canvas id="waveform" width="660" height="180" role="img" aria-label="录音音量波形，橙色表示低音量停顿"></canvas><div id="analysisText" class="analysis-text" role="status"></div><small>波形显示音量和停顿，不代表发音准确度。</small></div>
          <button id="reuseSongRange" hidden>使用此版范围练唱</button>
          <div class="row"><a id="download">↓ 下载所选录音</a><button id="takeMixDownload" hidden>人声＋伴奏</button></div>
          <small>每个练习片段保留最近 3 次，演唱与配音分别保存。连播使用各片段最新版本。</small>
        </div></details>
      </section>
    </div>
    <div id="transport" hidden style="padding:8px 20px 0;flex-shrink:0;background:#111b24">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ab2c1"><span id="transportLabel"></span><span id="transportTime"></span></div>
      <input id="transportProgress" type="range" min="0" max="1" step="0.001" value="0" aria-label="播放进度，可点击或拖动跳转" style="display:block;width:100%;margin:6px 0;accent-color:#b3eedb" disabled>
    </div>
    <footer><div class="status" id="status" role="status">准备好了，从一句开始。</div><button id="stop" disabled hidden>■ 停止</button></footer>
    <button class="resize-handle" id="resizePanel" aria-label="调整面板大小" title="拖动左下角调整大小；双击或按 Home 恢复默认。方向键微调，Shift 加速。">⤢</button>
  </div>`;
  const api = { html };
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoPanelView = api;
})(globalThis);
