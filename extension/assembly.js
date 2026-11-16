// Selection and preview for assembly. Original recordings are never modified.
(function(root){
  function buildRows(takes,duration,saved=[],api=root.EchoAudioExport){
    const voices=takes.filter(t=>t.kind==='song' && t.capture==='vocal' && !t.withBacking && t.speed===1);
    if(!voices.length)throw Error(takes.some(t=>t.kind==='song' && t.capture==='vocal' && !t.withBacking)?'请先录制 1× 独立人声，再选择片段合成。':'还没有可合成的独立人声。旧版混合录音无法单独提取人声，请重新录唱。');
    const automatic=api.plan(voices,duration);
    const ranges=voices.map(t=>({take:t,start:Math.max(0,t.start),end:Math.min(duration,t.end,Number.isFinite(t.capturedEnd)?t.capturedEnd:t.end)})).filter(r=>r.end>r.start);
    const points=[...new Set([0,duration,...ranges.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
    const rows=[];
    for(let i=0;i<points.length-1;i++){
      const start=points[i],end=points[i+1];
      const candidates=ranges.filter(r=>r.start<=start && r.end>=end).map(r=>r.take).sort((a,b)=>b.createdAt-a.createdAt || b.id.localeCompare(a.id));
      const autoId=automatic.segments.find(s=>s.start<=start && s.end>=end)?.take.id || null;
      const previous=Array.isArray(saved)?saved.find(s=>s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.start<=start && s.end>=end):null;
      const valid=previous && (previous.choice==='auto' && autoId || candidates.some(t=>t.id===previous.choice));
      rows.push({start,end,candidates,autoId,choice:valid?previous.choice:autoId?'auto':candidates[0]?.id || 'auto',enabled:previous?.enabled===false?false:valid?true:!!autoId});
    }
    return rows;
  }
  function selections(rows){return rows.map(r=>({start:r.start,end:r.end,takeId:r.enabled?(r.choice==='auto'?r.autoId:r.choice):null}));}
  function choices(rows){return rows.map(r=>({start:r.start,end:r.end,choice:r.choice,enabled:r.enabled}));}
  function preview(takes,duration,saved,api=root.EchoAudioExport){return api.selectionPlan(takes,duration,selections(buildRows(takes,duration,saved,api)));}
  function attach({view,doc=root.document,env=root,onRender,onDownload,onChange=()=>{},onClose=()=>{}}){
    const $=id=>view.getElementById(id),dialog=$('assemblyDialog'),urlApi=env.URL;
    let rows=[],takes=[],duration=0,busy=false,revision=0,url=null;
    const audio=$('assemblyAudio');
    function element(tag,text,cls){const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
    const time=seconds=>`${Math.floor(seconds/60)}:${(seconds%60).toFixed(1).padStart(4,'0')}`;
    const title=row=>`${time(row.start)}–${time(row.end)}`;
    function isOpen(){return !!dialog.open;}
    function clearAudio(){audio.pause?.();audio.removeAttribute('src');audio.load?.();audio.hidden=true;$('assemblyAudioLabel').textContent='';if(url)urlApi.revokeObjectURL(url);url=null;}
    function update(){
      const selected=selections(rows),covered=selected.filter(s=>s.takeId).reduce((sum,s)=>sum+s.end-s.start,0);
      $('assemblyEditorInfo').textContent=`人声覆盖 ${covered.toFixed(1)} / ${duration.toFixed(1)} 秒 · 未选位置保留空白`;
      $('assemblyEditorTimeline').replaceChildren();
      for(const row of rows){
        const id=row.enabled?(row.choice==='auto'?row.autoId:row.choice):null;
        row.check.checked=!!id;row.check.disabled=busy || !row.candidates.length;
        row.select.value=row.choice;row.select.disabled=busy || !row.enabled || !row.candidates.length;
        row.play.disabled=busy || !id;
        const source=row.candidates.find(t=>t.id===id);
        row.source.textContent=source?`${source.label || '人声录音'} · ${new Date(source.createdAt).toLocaleString('zh-CN')}`:row.candidates.length?'不导出此段人声':'尚未录制';
        const bar=element('span','');bar.style.flex=String(row.end-row.start);bar.className=id?'selected':'';bar.title=`${title(row)} · ${source?.label || '空白'}`;$('assemblyEditorTimeline').append(bar);
      }
      for(const id of ['assemblyType','assemblyReset'])$(id).disabled=busy;
      for(const id of ['assemblyPreview','assemblyDownload'])$(id).disabled=busy || covered<=0;
      $('assemblyCancelRender').hidden=!busy;
      dialog.setAttribute('aria-busy',String(busy));
    }
    function changed(){revision++;clearAudio();$('assemblyEditorMessage').textContent='选择已更新，请重新试听。';onChange(choices(rows));update();}
    function draw(){
      $('assemblyEditorList').replaceChildren();
      for(const row of rows){
        const card=element('article',undefined,'assembly-row'),head=element('div',undefined,'assembly-row-head');
        const label=element('label',undefined,'check');row.check=element('input');row.check.type='checkbox';row.check.setAttribute('aria-label',`导出 ${title(row)} 的人声`);
        label.append(row.check,element('span',title(row)));row.play=element('button','▷ 试听','compact');head.append(label,row.play);
        row.select=element('select');row.select.setAttribute('aria-label',`${title(row)} 的录音版本`);
        const auto=element('option','自动 · 最新版本');auto.value='auto';auto.disabled=!row.autoId;row.select.append(auto);
        for(const take of row.candidates){const option=element('option',`${take.label || '录音'} · ${new Date(take.createdAt).toLocaleTimeString('zh-CN')} · ${take.id===row.autoId?'最新':'其他版本'}`);option.value=take.id;row.select.append(option);}
        row.source=element('small');card.append(head,row.select,row.source);$('assemblyEditorList').append(card);
        row.check.onchange=()=>{if(busy)return;row.enabled=row.check.checked;if(row.enabled && row.choice==='auto' && !row.autoId)row.choice=row.candidates[0]?.id || 'auto';changed();};
        row.select.onchange=()=>{if(busy)return;row.choice=row.select.value;changed();};
        row.play.onclick=()=>render('preview',row);
      }
      update();
    }
    async function render(action,row=null){
      if(busy || !isOpen())return;
      const token=++revision;busy=true;clearAudio();update();
      const label=row?`片段 ${title(row)}`:'整首拼接';$('assemblyEditorMessage').textContent=`正在本机准备${label}…`;
      const selected=selections(row?[row]:rows),origin=row?.start || 0,length=row?row.end-row.start:duration;
      const active=()=>isOpen() && token===revision;
      try{
        const result=await onRender({selection:selected,origin,duration:length,withMusic:$('assemblyType').value==='mixed',active});
        if(!active())return;
        if(action==='download'){onDownload(result.blob);$('assemblyEditorMessage').textContent='已按当前选择开始下载。';}
        else{
          url=urlApi.createObjectURL(result.blob);audio.src=url;audio.hidden=false;audio.load?.();$('assemblyAudioLabel').textContent=`试听：${label}`;
          $('assemblyEditorMessage').textContent='已生成试听音频，可在播放器中拖动进度。';
          try{await audio.play?.();}catch{if(active())$('assemblyEditorMessage').textContent='试听已准备好，请点击播放器开始播放。';}
        }
      }catch(error){if(active())$('assemblyEditorMessage').textContent=error.message || '拼接失败，请重试。';}
      finally{if(active()){busy=false;update();}}
    }
    function open(options){
      takes=options.takes;duration=options.duration;rows=buildRows(takes,duration,options.choices,env.EchoAudioExport);
      revision++;busy=false;clearAudio();$('assemblyType').value=options.withMusic?'mixed':'vocal';
      $('assemblyEditorMessage').textContent='勾选要导出的人声，试听后选择版本。重叠录音已按时间边界拆开，每个时段只使用一个版本。';
      const skipped=takes.filter(t=>t.kind==='song' && t.capture==='vocal' && !t.withBacking && t.speed!==1).length;
      if(skipped)$('assemblyEditorMessage').textContent+=` ${skipped} 条非 1× 录音未列入选择。`;
      draw();if(dialog.showModal)dialog.showModal();else dialog.open=true;$('assemblyEditorList').scrollTop=0;
    }
    function close(){
      if(!isOpen())return;revision++;busy=false;clearAudio();
      if(dialog.close)dialog.close();else dialog.open=false;
      onClose();$('assembleSong').focus();
    }
    $('closeAssembly').onclick=close;
    dialog.oncancel=event=>{event.preventDefault();close();};
    $('assemblyPreview').onclick=()=>render('preview');$('assemblyDownload').onclick=()=>render('download');
    $('assemblyType').onchange=changed;
    $('assemblyReset').onclick=()=>{if(busy)return;rows=buildRows(takes,duration,[],env.EchoAudioExport);clearAudio();revision++;draw();onChange(choices(rows));$('assemblyEditorMessage').textContent='已恢复自动选择最新版本。';};
    $('assemblyCancelRender').onclick=()=>{revision++;busy=false;clearAudio();update();$('assemblyEditorMessage').textContent='已取消生成，选择仍保留。';};
    return {open,close,isOpen};
  }
  const api={buildRows,selections,choices,preview,attach};
  if(typeof module!=='undefined')module.exports=api;else root.EchoAssembly=api;
})(globalThis);
