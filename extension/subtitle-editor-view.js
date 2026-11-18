// Mounted only when the editor is first opened. Playback uses the existing video.
(function(root){
  function attach({view,doc=root.document,env=root,domain=root.EchoSubtitleEditor,onApply,onDraft=async()=>{},onExport,onClose=()=>{}}){
    const $=id=>view.getElementById('se'+id),dialog=$('Dialog'),D=domain;
    let cues=[],original=[],source=[],selected=0,last=0,duration=0,video=null,videoId='',history=[],future=[],revision=0,raf=0,active=-1,looping=false,previewEnd=null,mediaState=null,drag=null,windowStart=0,span=60,saveTimer=null,pendingSave=Promise.resolve(),listFirst=-1;
    const rowHeight=54,rows=new Map(),blocks=new Map();
    let savedRevision=-1,optionTexts=[],optionSelected=-1;
    const isOpen=()=>!!dialog.open;
    function message(text){$('Message').textContent=text;}
    function safely(work){return ()=>{try{const result=work();return result?.catch?result.catch(e=>message(e.message)):result;}catch(e){message(e.message);}};}
    function state(){return {cues:D.copy(cues),original:D.copy(original),paste:$('Paste').value || '',selected,last,windowStart,span};}
    function saveDraft(){
      if(saveTimer!==null){env.clearTimeout(saveTimer);saveTimer=null;}
      const value=state(),id=videoId,version=revision;
      pendingSave=pendingSave.catch(()=>{}).then(()=>onDraft(id,value)).then(()=>{if(id===videoId && version===revision){savedRevision=version;if(isOpen())$('DraftState').textContent='草稿已保存到本机';}},e=>{if(isOpen() && version===revision)$('DraftState').textContent=`草稿保存失败：${e.message}。请导出字幕保留。`;});return pendingSave;
    }
    function changed(){revision++;$('DraftState').textContent='正在保存草稿…';if(saveTimer!==null)env.clearTimeout(saveTimer);saveTimer=env.setTimeout(saveDraft,300);}
    function snapshot(){return {cues:D.copy(cues),selected,last};}
    function commit(next,note='已更新，可播放选段检查。'){
      D.validate(next,duration);history.push(snapshot());if(history.length>60)history.shift();future=[];cues=next;
      selected=Math.min(selected,cues.length-1);last=Math.max(selected,Math.min(last,cues.length-1));stopPreview();changed();draw();message(note);
    }
    function select(index,extend=false){
      if(!cues[index])return;selected=index;last=extend?Math.max(index,last):index;
      if(cues[index].start<windowStart || cues[index].start>=windowStart+span)windowStart=Math.max(0,cues[index].start-span*.15);
      $('List').scrollTop=Math.max(0,index*rowHeight-rowHeight*2);draw();changed();
    }
    function drawList(force=false){
      const list=$('List'),first=Math.max(0,Math.floor(list.scrollTop/rowHeight)-4),end=Math.min(cues.length,first+24);
      if(!force && first===listFirst)return;listFirst=first;list.replaceChildren();rows.clear();
      const before=doc.createElement('div');before.style.height=`${first*rowHeight}px`;list.append(before);
      for(let i=first;i<end;i++){
        const button=doc.createElement('button');button.type='button';button.className='se-cue';button.style.height=`${rowHeight}px`;
        button.setAttribute('aria-label',`第 ${i+1} 句 ${cues[i].text}`);button.setAttribute('aria-pressed',String(i>=selected && i<=last));
        const title=doc.createElement('span');title.textContent=`${i+1}. ${cues[i].text}`;
        const meta=doc.createElement('small');meta.textContent=`${D.time(cues[i].start)}–${D.time(cues[i].end)}${cues[i].estimated?' · 估算':''}${cues[i].startLocked || cues[i].endLocked?' · 已固定':''}`;
        button.append(title,meta);button.onclick=()=>select(i);button.classList.toggle('playing',i===active);list.append(button);rows.set(i,button);
      }
      const after=doc.createElement('div');after.style.height=`${Math.max(0,cues.length-end)*rowHeight}px`;list.append(after);
    }
    function drawTimeline(){
      const lane=$('Lane');lane.replaceChildren();blocks.clear();windowStart=Math.max(0,Math.min(windowStart,Math.max(0,duration-span)));
      $('Window').value=String(windowStart);$('Window').max=String(Math.max(0,duration-span));
      $('WindowLabel').textContent=`${D.time(windowStart)} – ${D.time(Math.min(duration,windowStart+span))}`;
      for(const i of D.windowIndices(cues,windowStart,windowStart+span)){
        const c=cues[i],left=Math.max(windowStart,c.start),right=Math.min(windowStart+span,c.end);
        const block=doc.createElement('div');block.className='se-block';block.style.left=`${(left-windowStart)/span*100}%`;block.style.width=`${(right-left)/span*100}%`;block.dataset.index=String(i);block.classList.toggle('selected',i>=selected && i<=last);block.classList.toggle('playing',i===active);
        const title=doc.createElement('button');title.type='button';title.className='se-block-title';title.textContent=`${i+1} ${c.text}`;title.title=c.text;title.onclick=()=>select(i);title.onpointerdown=e=>beginDrag(e,i,'move');
        block.append(title);
        for(const edge of ['start','end']){
          if(edge==='start' && c.start<windowStart || edge==='end' && c.end>windowStart+span)continue;
          const handle=doc.createElement('button');handle.type='button';handle.className=`se-edge ${edge}`;handle.textContent='';handle.title=`拖动第 ${i+1} 句${edge==='start'?'起点':'终点'}；点击后可在右侧输入精确时间`;handle.setAttribute('aria-label',handle.title);handle.onclick=()=>select(i);handle.onpointerdown=e=>beginDrag(e,i,edge);block.append(handle);
        }
        lane.append(block);blocks.set(i,block);
      }
      positionPlayhead();
    }
    function draw(){
      const cue=cues[selected],has=!!cue;
      $('MarkSelection').textContent=has?`为第 ${selected+1}–${last+1} 句打点`:'请先粘贴歌词或载入字幕';
      $('Workspace').hidden=!cues.length;$('Empty').hidden=!!cues.length;$('Count').textContent=`${cues.length} 句${cue?` · 已选第 ${selected+1}–${last+1} 句`:''}`;
      $('Undo').disabled=!history.length;$('Redo').disabled=!future.length;
      for(const id of ['Apply','Srt','Vtt','PlayRange','Estimate','Merge','TextApply','MarkStart','MarkEnd','Start','End','First','Last','FixedStart','FixedEnd','SectionStart','SectionEnd','SectionMarkStart','SectionMarkEnd','Group'])$(id).disabled=!has;
      $('Merge').disabled=!has || last<=selected;$('Current').disabled=!source.length;$('Original').disabled=!original.length;
      if(cue){
        $('Start').value=D.time(cue.start);$('End').value=D.time(cue.end);$('Text').value=cue.text.replace(/\n/g,'\u2028');$('FixedStart').checked=!!cue.startLocked;$('FixedEnd').checked=!!cue.endLocked;
        const rebuild=optionTexts.length!==cues.length || cues.some((c,i)=>c.text!==optionTexts[i]);
        if(rebuild){
          optionTexts=cues.map(c=>c.text);
          for(const id of ['First','Last']){
            const options=cues.map((c,i)=>{const option=doc.createElement('option');option.value=String(i);option.textContent=`第 ${i+1} 句 · ${c.text.slice(0,45)}`;return option;});$(id).replaceChildren(...options);
          }
        }
        if(rebuild || optionSelected!==selected){Array.from($('Last').children).forEach((option,i)=>{option.disabled=i<selected;});optionSelected=selected;}
        $('First').value=String(selected);$('Last').value=String(last);
        $('SectionStart').value=D.time(cues[selected].start);$('SectionEnd').value=D.time(cues[last].end);
      }
      drawList(true);drawTimeline();
    }
    function stopPreview(){previewEnd=null;looping=false;if(video)video.pause?.();$('Play').textContent='▶ 播放';}
    function positionPlayhead(){if(!video)return;const time=video.currentTime || 0;$('Clock').textContent=D.time(time);$('Seek').value=String(time);const x=(time-windowStart)/span*100;$('Playhead').hidden=x<0 || x>100;$('Playhead').style.left=`${x}%`;}
    function tick(){
      raf=0;if(!isOpen() || !video)return;
      positionPlayhead();
      const next=D.activeIndex(cues,video.currentTime);
      if(next!==active){rows.get(active)?.classList.toggle('playing',false);blocks.get(active)?.classList.toggle('playing',false);active=next;rows.get(active)?.classList.toggle('playing',true);blocks.get(active)?.classList.toggle('playing',true);}
      if(previewEnd!==null && video.currentTime>=previewEnd){if(looping){video.currentTime=cues[selected].start;}else stopPreview();}
      if(!video.paused && !video.ended)raf=env.requestAnimationFrame(tick);
      $('Play').textContent=video.paused?'▶ 播放':'Ⅱ 暂停';
    }
    function onPlay(){if(!raf && isOpen())raf=env.requestAnimationFrame(tick);}
    function onTime(){if(!raf)tick();}
    async function play(range=false){
      if(!video)return;
      if(!range && !video.paused){stopPreview();return;}
      previewEnd=range?cues[last].end:null;looping=range && $('Loop').checked;
      if(range)video.currentTime=cues[selected].start;video.playbackRate=Number($('Speed').value) || 1;
      await video.play();onPlay();
    }
    function updateEdge(edge,value){commit(D.edge(cues,selected,edge,value,duration,$('Link').checked));}
    function beginDrag(event,index,edge){
      if(event.button!==0 || !cues[index])return;
      event.preventDefault();event.stopPropagation();
      const rect=$('Lane').getBoundingClientRect();if(!rect.width)return;
      selected=last=index;drag={index,edge,x:event.clientX,width:rect.width,base:D.copy(cues),next:null,target:event.currentTarget,pointerId:event.pointerId};
      event.currentTarget.setPointerCapture?.(event.pointerId);stopPreview();
      doc.addEventListener('pointermove',dragMove);doc.addEventListener('pointerup',dragEnd);doc.addEventListener('pointercancel',dragCancel);
    }
    function dragMove(event){
      if(!drag || event.pointerId!==drag.pointerId)return;
      const delta=(event.clientX-drag.x)/drag.width*span;
      try{
        const c=drag.base[drag.index];drag.next=drag.edge==='move'?D.move(drag.base,drag.index,delta,duration):D.edge(drag.base,drag.index,drag.edge,c[drag.edge]+delta,duration,$('Link').checked);
        const next=drag.next[drag.index];$('Start').value=D.time(next.start);$('End').value=D.time(next.end);
        for(const i of [drag.index-1,drag.index,drag.index+1]){const block=blocks.get(i),value=drag.next[i];if(block && value){block.style.left=`${(Math.max(windowStart,value.start)-windowStart)/span*100}%`;block.style.width=`${(Math.min(windowStart+span,value.end)-Math.max(windowStart,value.start))/span*100}%`;}}
        message('松开保存这次调整；固定边界不会被联动修改。');
      }catch(error){drag.next=null;message(error.message);}
    }
    function removeDrag(){if(!drag)return;try{drag.target.releasePointerCapture?.(drag.pointerId);}catch{}doc.removeEventListener('pointermove',dragMove);doc.removeEventListener('pointerup',dragEnd);doc.removeEventListener('pointercancel',dragCancel);drag=null;}
    function dragEnd(event){if(!drag || event.pointerId!==drag.pointerId)return;const next=drag.next;removeDrag();if(next)commit(next);else draw();}
    function dragCancel(){removeDrag();if(isOpen())draw();}
    function close(){
      if(!isOpen())return;stopPreview();removeDrag();if(raf)env.cancelAnimationFrame(raf);raf=0;
      for(const name of ['play','pause','timeupdate','seeked','ended'])video?.removeEventListener?.(name,name==='play'?onPlay:onTime);
      if(saveTimer!==null || savedRevision!==revision)void saveDraft();if(mediaState && video){video.muted=mediaState.muted;video.playbackRate=mediaState.speed;}
      if(dialog.close)dialog.close();else dialog.open=false;
      video=null;mediaState=null;cues=[];original=[];source=[];history=[];future=[];optionTexts=[];optionSelected=-1;rows.clear();blocks.clear();
      for(const id of ['List','Lane','First','Last'])$(id).replaceChildren();$('Paste').value='';$('Text').value='';
      onClose();
    }
    function open(options){
      if(isOpen())return;revision++;savedRevision=-1;video=options.video;duration=video.duration;videoId=options.videoId;
      if(!Number.isFinite(duration) || duration<=0)throw Error('请等待视频时长加载后再编辑字幕。');
      source=D.fromCues(options.cues);const draft=options.draft;
      try{if(draft?.cues?.length)D.validate(draft.cues,duration);cues=draft?.cues?.length?D.fromCues(draft.cues):D.copy(source);}catch{cues=D.copy(source);}
      original=draft?.original?.length?D.fromCues(draft.original):D.copy(source);
      selected=Math.max(0,Math.min(Number(draft?.selected)||0,Math.max(0,cues.length-1)));last=Math.max(selected,Math.min(Number(draft?.last)||selected,Math.max(0,cues.length-1)));
      span=[10,30,60,120,300].includes(Number(draft?.span))?Number(draft.span):60;windowStart=Number(draft?.windowStart)||0;history=[];future=[];active=-1;
      $('Paste').value=draft?.paste || '';$('Zoom').value=String(span);$('Seek').max=String(duration);$('Link').checked=true;$('Loop').checked=false;$('Method').value='length';$('Speed').value='1';
      mediaState={muted:video.muted,speed:video.playbackRate};video.pause?.();video.muted=false;
      for(const name of ['play','pause','timeupdate','seeked','ended'])video.addEventListener?.(name,name==='play'?onPlay:onTime);
      if(dialog.showModal)dialog.showModal();else dialog.open=true;
      $('PasteDetails').open=!cues.length;$('List').scrollTop=selected*rowHeight;draw();message(draft?'已恢复本机草稿。可继续编辑，或载入主界面当前字幕。':'粘贴歌词，每行一句；或直接调整已有字幕。估算后请试听校准。');$('DraftState').textContent='编辑只改变草稿；点击“保存并载入”后主界面生效。';$(cues.length?'Play':'Paste').focus();
    }
    $('Close').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
    $('List').onscroll=()=>drawList();
    $('Paste').oninput=changed;
    $('Build').onclick=safely(()=>{selected=last=0;commit(D.paste($('Paste').value,duration),'歌词已建立为估算时间。空行分段，可先选择本段，再标记开始和结束进行估算。');$('PasteDetails').open=false;});
    $('Current').onclick=safely(()=>{selected=last=0;commit(D.copy(source),'已载入主界面当前字幕。');});
    $('Original').onclick=safely(()=>{selected=last=0;commit(D.copy(original),'已恢复修改前字幕，保存并载入后生效。');});
    $('Undo').onclick=()=>{if(!history.length)return;future.push(snapshot());const value=history.pop();cues=value.cues;selected=value.selected;last=value.last;stopPreview();changed();draw();};
    $('Redo').onclick=()=>{if(!future.length)return;history.push(snapshot());const value=future.pop();cues=value.cues;selected=value.selected;last=value.last;stopPreview();changed();draw();};
    $('First').onchange=()=>{selected=Number($('First').value);last=Math.max(selected,last);draw();changed();};$('Last').onchange=()=>{last=Number($('Last').value);draw();changed();};
    $('Group').onclick=()=>{const group=cues[selected]?.group;if(group===undefined){message('已有字幕未分段，请用起句与止句选择范围。');return;}const first=cues.findIndex(c=>c.group===group);let end=first;while(end+1<cues.length && cues[end+1].group===group)end++;selected=first;last=end;draw();changed();};
    $('Estimate').onclick=safely(()=>commit(D.interpolate(cues,selected,last,D.parseTime($('SectionStart').value),D.parseTime($('SectionEnd').value),duration,$('Method').value),'已应用段落起止时间，中间各句已估算。可播放选段检查，随时重新打点。'));
    function markSection(edge){if(!cues.length || !video)return;$('Section'+edge).value=D.time(video.currentTime);message(`已标记${edge==='Start'?'开始':'结束'}：${D.time(video.currentTime)}。${edge==='Start'?'继续播放，到结尾按 O 标记结束。':'点击“应用时间到所选歌词”，再播放选段检查。'}`);}
    $('SectionMarkStart').onclick=()=>markSection('Start');$('SectionMarkEnd').onclick=()=>markSection('End');
    dialog.addEventListener('keydown',event=>{
      if(!isOpen() || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)return;
      const typing=event.composedPath?.().some(el=>['INPUT','TEXTAREA','SELECT'].includes(el.tagName) || el.isContentEditable) || ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable;
      if(typing)return;const key=event.code || event.key;
      if(!['KeyI','KeyO','Space','i','I','o','O',' '].includes(key))return;
      event.preventDefault();event.stopPropagation();if(['KeyI','i','I'].includes(key))markSection('Start');else if(['KeyO','o','O'].includes(key))markSection('End');else safely(()=>play())();
    });
    $('Start').onchange=safely(()=>updateEdge('start',D.parseTime($('Start').value)));$('End').onchange=safely(()=>updateEdge('end',D.parseTime($('End').value)));
    $('MarkStart').onclick=safely(()=>updateEdge('start',video.currentTime));$('MarkEnd').onclick=safely(()=>updateEdge('end',video.currentTime));
    for(const edge of ['Start','End'])$('Fixed'+edge).onchange=safely(()=>{const next=D.copy(cues);next[selected][edge.toLowerCase()+'Locked']=$('Fixed'+edge).checked;commit(next);});
    $('TextApply').onclick=safely(()=>commit(D.replaceText(cues,selected,$('Text').value,duration),'文字已应用；新增回车拆成多句，句内换行保持同一字幕。'));
    $('Text').onkeydown=e=>{if(e.key==='Enter' && e.shiftKey){e.preventDefault();const text=$('Text'),at=text.selectionStart;const end=text.selectionEnd;text.value=text.value.slice(0,at)+'\u2028'+text.value.slice(end);text.selectionStart=text.selectionEnd=at+1;}};
    $('Merge').onclick=safely(()=>{const next=D.merge(cues,selected,last,duration);last=selected;commit(next,'已合并为一句，保留最早起点与最晚终点。可撤销。');});
    $('Text').addEventListener('keydown',e=>{if(e.key==='Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey && $('Text').selectionStart===0 && $('Text').selectionEnd===0 && selected>0){e.preventDefault();try{const next=D.merge(cues,selected-1,selected,duration);selected--;last=selected;commit(next,'已删除与上一句之间的换行并合并，可撤销。');}catch(error){message(error.message);}}});
    $('Play').onclick=safely(()=>play());$('PlayRange').onclick=safely(()=>play(true));$('Pause').onclick=stopPreview;
    $('Seek').oninput=()=>{previewEnd=null;video.currentTime=Number($('Seek').value);positionPlayhead();};
    $('Speed').onchange=()=>{video.playbackRate=Number($('Speed').value);};
    $('Zoom').oninput=()=>{span=Number($('Zoom').value);drawTimeline();};$('Window').oninput=()=>{windowStart=Number($('Window').value);drawTimeline();};
    $('Follow').onclick=()=>{windowStart=Math.max(0,video.currentTime-span*.2);drawTimeline();};
    for(const format of ['Srt','Vtt'])$(format).onclick=safely(()=>onExport(D.serialize(cues,duration,format.toLowerCase()),format.toLowerCase()));
    $('Apply').onclick=safely(async()=>{
      D.validate(cues,duration);const id=videoId,version=revision;await onApply(D.copy(cues));
      if(!isOpen() || id!==videoId || version!==revision)return;
      await saveDraft();if(isOpen() && id===videoId && version===revision)close();
    });
    return {open,close,isOpen,flush:()=>isOpen()?saveDraft():pendingSave};
  }
  const api={attach};if(typeof module!=='undefined')module.exports=api;else root.EchoSubtitleEditorView=api;
})(globalThis);
