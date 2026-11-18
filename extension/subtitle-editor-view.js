// Lazy, mouse-driven subtitle editor. No recorder or microphone dependencies.
(function(root){
  function attach({view,doc=root.document,env=root,domain=root.EchoSubtitleEditor,onApply,onDraft=async()=>{},onExport,onClose=()=>{}}){
    const $=id=>view.getElementById('se'+id),dialog=$('Dialog'),D=domain;
    const rowHeight=58,rows=new Map(),blocks=new Map();
    let cues=[],timingSlots=[],mapping=null,mappingError='',workflow='cues',pendingSlotStart=null;
    let selected=0,duration=0,video=null,videoId='',windowStart=0,span=60,history=[],future=[];
    let revision=0,savedRevision=-1,saveTimer=null,pendingSave=Promise.resolve(),raf=0,active=-1,preview=null,mediaState=null,drag=null,listFirst=-1;
    const isOpen=()=>!!dialog.open;
    const slotsFrom=values=>values.map(({text,group,unmatched,...slot})=>slot);
    function message(text){$('Message').textContent=text;}
    function safely(work){return (...args)=>{try{const result=work(...args);return result?.catch?result.catch(e=>message(e.message)):result;}catch(e){message(e.message);}};}
    function state(){return {cues:D.copy(cues),paste:$('Paste').value || '',selected,windowStart,span,workflow,timingSlots:D.copy(timingSlots),pendingSlotStart};}
    function saveDraft(){
      if(saveTimer!==null){env.clearTimeout(saveTimer);saveTimer=null;}
      const value=state(),id=videoId,version=revision;
      pendingSave=pendingSave.catch(()=>{}).then(()=>onDraft(id,value)).then(()=>{if(id===videoId && version===revision){savedRevision=version;if(isOpen())$('DraftState').textContent='草稿已保存到本机';}},e=>{if(isOpen() && id===videoId && version===revision)$('DraftState').textContent=`草稿保存失败：${e.message}。请导出字幕保留。`;});return pendingSave;
    }
    function changed(){revision++;$('DraftState').textContent='正在保存草稿…';if(saveTimer!==null)env.clearTimeout(saveTimer);saveTimer=env.setTimeout(saveDraft,300);}
    function remember(){history.push(state());if(history.length>60)history.shift();future=[];}
    function syncMapping(){
      let next;try{next=D.alignSlots(timingSlots,$('Paste').value || '',duration);mappingError='';}catch(error){mappingError=error.message;throw error;}
      mapping=next;cues=next.rows;
      selected=Math.max(0,Math.min(selected,Math.max(cues.length,next.lineCount)-1));
    }
    function ready(){
      if(workflow==='slots'){
        syncMapping();
        if(!mapping.balanced || pendingSlotStart!==null)throw Error('请完成开始／结束标记，并补齐高亮的歌词或时间区间后再保存。');
      }
      D.validate(cues,duration);
    }
    function restore(value){
      cues=D.copy(value.cues);selected=value.selected;workflow=value.workflow;timingSlots=D.copy(value.timingSlots);pendingSlotStart=value.pendingSlotStart;
      $('Paste').value=value.paste || '';if(workflow==='slots'){try{syncMapping();}catch{}}else{mapping=null;mappingError='';}
      stopPreview();changed();draw();
    }
    function commit(next,note='已调整时间。点击歌词或区间试听。'){
      if(next.length)D.validate(next,duration);remember();cues=next;
      if(workflow==='slots'){timingSlots=slotsFrom(next);syncMapping();}
      selected=Math.max(0,Math.min(selected,cues.length-1));stopPreview();changed();draw();message(note);
    }
    function select(index){
      selected=index;
      const cue=cues[index];if(cue && (cue.start<windowStart || cue.start>=windowStart+span))windowStart=Math.max(0,cue.start-span*.15);
      draw();changed();
    }
    async function audition(index){
      select(index);
      if(!cues[index]){message('这句还没有时间。继续播放，在听到下一行时点击“标记开始”。');return;}
      await play(true);
    }
    function drawList(force=false){
      const list=$('List'),first=Math.max(0,Math.floor(list.scrollTop/rowHeight)-4),count=workflow==='slots'?Math.max(cues.length,mapping.lineCount):cues.length,end=Math.min(count,first+24);
      if(!force && first===listFirst)return;listFirst=first;list.replaceChildren();rows.clear();
      const before=doc.createElement('div');before.style.height=`${first*rowHeight}px`;list.append(before);
      for(let i=first;i<end;i++){
        const cue=cues[i],line=cue || mapping.extraLyrics[i-cues.length];
        const button=doc.createElement('button');button.type='button';button.className='se-cue';button.style.height=`${rowHeight}px`;
        button.setAttribute('aria-label',`第 ${i+1} 句 ${line.text}${cue?'，点击播放':'，等待标时'}`);button.setAttribute('aria-pressed',String(i===selected));
        const title=doc.createElement('span');title.textContent=`${i+1}. ${line.text}`;
        const meta=doc.createElement('small');meta.textContent=cue?`${D.time(cue.start)}–${D.time(cue.end)} · 点击试听`:'等待标记开始／结束';
        button.append(title,meta);button.onclick=safely(()=>audition(i));button.classList.toggle('playing',i===active);button.classList.toggle('unmatched',!!cue?.unmatched);button.classList.toggle('untimed',!cue);list.append(button);rows.set(i,button);
      }
      const after=doc.createElement('div');after.style.height=`${Math.max(0,count-end)*rowHeight}px`;list.append(after);
    }
    function drawTimeline(){
      const lane=$('Lane');lane.replaceChildren();blocks.clear();windowStart=Math.max(0,Math.min(windowStart,Math.max(0,duration-span)));
      $('Window').value=String(windowStart);$('Window').max=String(Math.max(0,duration-span));
      $('WindowLabel').textContent=`${D.time(windowStart)} – ${D.time(Math.min(duration,windowStart+span))}`;
      for(const i of D.windowIndices(cues,windowStart,windowStart+span)){
        const c=cues[i],left=Math.max(windowStart,c.start),right=Math.min(windowStart+span,c.end);
        const block=doc.createElement('div');block.className='se-block';block.style.left=`${(left-windowStart)/span*100}%`;block.style.width=`${(right-left)/span*100}%`;block.dataset.index=String(i);block.classList.toggle('selected',i===selected);block.classList.toggle('playing',i===active);block.classList.toggle('unmatched',!!c.unmatched);
        const title=doc.createElement('button');title.type='button';title.className='se-block-title';title.textContent=`${i+1} ${c.text}`;title.title=c.text;title.onclick=safely(()=>audition(i));
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
      const marking=workflow==='slots',cue=cues[selected],has=!!cue,lineCount=marking?mapping.lineCount:cues.length;
      $('Workflow').value=workflow;$('Count').textContent=marking?`${timingSlots.length} 个区间 / ${lineCount} 行歌词`:`${cues.length} 句字幕`;
      $('Undo').disabled=!history.length;$('Redo').disabled=!future.length;
      $('MarkBar').hidden=!marking;$('PasteDetails').hidden=!marking;$('WorkflowHint').hidden=marking;
      $('WorkflowHint').textContent=marking?'粘贴歌词 → 播放歌曲 → 点击开始、结束，依次自动填入每一行。点击已标时歌词或区间试听。':'点击歌词或时间区间试听；拖动区间两端微调，或在右侧输入精确时间。';
      const next=mapping?.extraLyrics[0];
      $('MarkSelection').textContent=marking?(!lineCount?'先粘贴歌词，每行一句。':next?`第 ${timingSlots.length+1} 行：${next.text}`:'歌词已全部填入，可继续增加区间或试听检查。'):'';
      $('SectionMarkStart').textContent=pendingSlotStart===null?'标记开始':'重新标记开始';
      $('SectionMarkStart').disabled=!lineCount || !!mappingError;
      $('SectionMarkEnd').disabled=pendingSlotStart===null || !!mappingError;
      $('CancelMark').hidden=pendingSlotStart===null;
      $('PendingMark').textContent=pendingSlotStart===null?'听到这一行开始时点击“标记开始”。':`开始 ${D.time(pendingSlotStart)} · 听到结束时点击“标记结束”，自动填入。`;
      const complete=!mappingError && cues.length && (!marking || (mapping.balanced && pendingSlotStart===null));
      for(const id of ['Apply','Srt','Vtt'])$(id).disabled=!complete;
      $('PlayRange').disabled=!has;
      $('Workspace').hidden=!lineCount && !cues.length;$('Empty').hidden=!!lineCount || !!cues.length;
      $('Empty').textContent='先在上方粘贴歌词，每行一句，再播放歌曲并用鼠标标记开始和结束。';
      $('InspectorFields').hidden=!has || !!mappingError;$('InspectorEmpty').hidden=has;
      $('InspectorTitle').textContent=has?`第 ${selected+1} 句 · 时间与文字`:'等待标时';
      if(cue){$('Start').value=D.time(cue.start);$('End').value=D.time(cue.end);$('Text').value=cue.text;$('FixedStart').checked=!!cue.startLocked;$('FixedEnd').checked=!!cue.endLocked;}
      $('TextTools').hidden=marking;
      $('Merge').disabled=!has || selected>=cues.length-1;
      $('DeleteSlot').disabled=!has || !!mappingError;
      drawMappingIssues();drawList(true);drawTimeline();
    }
    function drawMappingIssues(){
      const box=$('MappingIssues');box.replaceChildren();if(mappingError){box.hidden=false;box.textContent=mappingError;return;}box.textContent='';
      box.hidden=workflow!=='slots' || !mapping || !mapping.missingLyrics;
      if(box.hidden)return;
      const summary=doc.createElement('div');summary.textContent=`黄色区间缺少 ${mapping.missingLyrics} 行歌词，请补充歌词或删除多余区间。`;box.append(summary);
    }
    function stopPreview(){preview=null;if(raf)env.cancelAnimationFrame(raf);raf=0;if(video)video.pause?.();$('Play').textContent='▶ 播放';}
    function finishPreview(){const end=preview.end;stopPreview();video.currentTime=end;positionPlayhead();}
    function positionPlayhead(){if(!video)return;const time=video.currentTime || 0;$('Clock').textContent=D.time(time);$('Seek').value=String(time);const x=(time-windowStart)/span*100;$('Playhead').hidden=x<0 || x>100;$('Playhead').style.left=`${x}%`;}
    function tick(){
      raf=0;if(!isOpen() || !video)return;
      positionPlayhead();
      const next=D.activeIndex(cues,video.currentTime);
      if(next!==active){rows.get(active)?.classList.toggle('playing',false);blocks.get(active)?.classList.toggle('playing',false);active=next;rows.get(active)?.classList.toggle('playing',true);blocks.get(active)?.classList.toggle('playing',true);}
      if(preview && video.currentTime>=preview.end){if(preview.loop){video.currentTime=preview.start;}else finishPreview();}
      if(!video.paused && !video.ended)raf=env.requestAnimationFrame(tick);
      $('Play').textContent=video.paused?'▶ 播放':'Ⅱ 暂停';
    }
    function onPlay(){if(!raf && isOpen())raf=env.requestAnimationFrame(tick);}
    function onTime(){if(preview && !preview.loop && video.currentTime>=preview.end){finishPreview();return;}if(!raf)tick();}
    async function play(range=false){
      if(!video)return;
      if(!range && !video.paused){stopPreview();return;}
      if(range && !cues[selected])throw Error('这一句还没有时间，请先标记开始和结束。');
      preview=range?{start:cues[selected].start,end:cues[selected].end,loop:$('Loop').checked}:null;
      if(range)video.currentTime=preview.start;video.playbackRate=Number($('Speed').value) || 1;
      await video.play();onPlay();
    }
    function updateEdge(edge,value){commit(D.edge(cues,selected,edge,value,duration,$('Link').checked));}
    function beginDrag(event,index,edge){
      if(event.button!==0 || !cues[index])return;
      event.preventDefault();event.stopPropagation();
      const rect=$('Lane').getBoundingClientRect();if(!rect.width)return;
      selected=index;drag={index,edge,x:event.clientX,width:rect.width,base:D.copy(cues),next:null,target:event.currentTarget,pointerId:event.pointerId};
      event.currentTarget.setPointerCapture?.(event.pointerId);stopPreview();
      doc.addEventListener('pointermove',dragMove);doc.addEventListener('pointerup',dragEnd);doc.addEventListener('pointercancel',dragCancel);
    }
    function dragMove(event){
      if(!drag || event.pointerId!==drag.pointerId)return;
      if(Math.abs(event.clientX-drag.x)<3 && !drag.next)return;
      const delta=(event.clientX-drag.x)/drag.width*span;
      try{
        const c=drag.base[drag.index];drag.next=D.edge(drag.base,drag.index,drag.edge,c[drag.edge]+delta,duration,$('Link').checked);
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
      video=null;mediaState=null;cues=[];history=[];future=[];timingSlots=[];mapping=null;pendingSlotStart=null;rows.clear();blocks.clear();
      for(const id of ['List','Lane'])$(id).replaceChildren();$('Paste').value='';$('Text').value='';onClose();
    }
    function open(options){
      if(isOpen())return;
      if(!Number.isFinite(options.video.duration) || options.video.duration<=0)throw Error('请等待视频时长加载后再编辑字幕。');
      revision++;savedRevision=-1;video=options.video;duration=video.duration;videoId=options.videoId;
      const source=D.fromCues(options.cues),draft=options.draft;mappingError='';
      try{if(draft?.cues?.length)D.validate(draft.cues,duration);cues=draft?.cues?.length?D.fromCues(draft.cues):D.copy(source);}catch{cues=D.copy(source);}
      selected=Math.max(0,Number(draft?.selected)||0);span=[10,30,60,120,300].includes(Number(draft?.span))?Number(draft.span):60;windowStart=Number(draft?.windowStart)||0;
      history=[];future=[];active=-1;preview=null;pendingSlotStart=null;
      $('Paste').value=draft?.paste || '';
      workflow=['slots','cues'].includes(draft?.workflow)?draft.workflow:(cues.length?'cues':'slots');
      timingSlots=Array.isArray(draft?.timingSlots)?D.copy(draft.timingSlots):[];
      if(workflow==='slots'){
        try{syncMapping();pendingSlotStart=Number.isFinite(draft?.pendingSlotStart) && draft.pendingSlotStart>=0 && draft.pendingSlotStart<duration?draft.pendingSlotStart:null;}
        catch{try{mapping=D.alignSlots(timingSlots,'',duration);}catch{timingSlots=[];mapping=D.alignSlots([],'',duration);}cues=mapping.rows;}
      }else mapping=null;
      selected=Math.min(selected,Math.max(0,(workflow==='slots'?Math.max(cues.length,mapping.lineCount):cues.length)-1));
      $('Zoom').value=String(span);$('Seek').max=String(duration);$('Link').checked=true;$('Loop').checked=false;$('Speed').value='1';
      mediaState={muted:video.muted,speed:video.playbackRate};video.pause?.();video.muted=false;
      for(const name of ['play','pause','timeupdate','seeked','ended'])video.addEventListener?.(name,name==='play'?onPlay:onTime);
      if(dialog.showModal)dialog.showModal();else dialog.open=true;
      $('PasteDetails').open=!mapping?.lineCount || !!mappingError;draw();$('List').scrollTop=Math.max(0,selected*rowHeight-rowHeight);drawList(true);
      message(draft?'已恢复本机草稿。':'点击歌词或时间区间试听，拖动两端调整时间。');$('DraftState').textContent='草稿自动保存；点击“保存并载入”后主界面生效。';
    }
    function finishSlot(){
      if(pendingSlotStart===null)throw Error('请先点击“标记开始”。');
      const next=D.captureSlot(timingSlots,pendingSlotStart,video.currentTime,duration);D.alignSlots(next,$('Paste').value || '',duration);const keys=new Set(timingSlots.map(c=>c.key)),index=next.findIndex(c=>!keys.has(c.key));
      remember();timingSlots=next;pendingSlotStart=null;syncMapping();selected=index;
      if(cues[index].start<windowStart || cues[index].start>=windowStart+span)windowStart=Math.max(0,cues[index].start-span*.15);
      $('List').scrollTop=Math.max(0,index*rowHeight-rowHeight*2);changed();draw();message('已记录开始／结束，歌词自动填入。继续播放并标记下一行。');
    }
    $('Close').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
    $('List').onscroll=()=>drawList();
    $('Paste').oninput=()=>{if(workflow!=='slots')return;try{syncMapping();}catch(error){message(error.message);}changed();draw();};
    $('Build').onclick=safely(()=>{syncMapping();$('PasteDetails').open=false;draw();message('歌词已载入。播放歌曲，点击“标记开始”和“标记结束”。');});
    $('Workflow').onchange=safely(()=>{
      const next=$('Workflow').value;if(next===workflow)return;
      if(next==='cues' && (mappingError || !mapping?.balanced || pendingSlotStart!==null)){$('Workflow').value=workflow;throw Error('请先完成待标记的歌词，再进入字幕微调。');}
      remember();workflow=next;pendingSlotStart=null;
      if(workflow==='slots'){timingSlots=slotsFrom(cues);$('Paste').value=cues.map(c=>c.text.replace(/\n/g,' ')).join('\n');syncMapping();$('PasteDetails').open=true;}else{mapping=null;mappingError='';}
      stopPreview();changed();draw();message(workflow==='slots'?'粘贴或修改歌词，再播放标时。':'点击歌词或区间试听；拖动两端调整时间。');
    });
    $('SectionMarkStart').onclick=safely(()=>{
      if(mappingError)throw Error(mappingError);if(!mapping?.lineCount)throw Error('请先粘贴歌词，每行一句。');
      remember();pendingSlotStart=video.currentTime;preview=null;if(mapping.extraLyrics.length){selected=timingSlots.length;$('List').scrollTop=Math.max(0,selected*rowHeight-rowHeight*2);}changed();draw();message('开始已标记。听到本句结束时点击“标记结束”。');
    });
    $('SectionMarkEnd').onclick=safely(finishSlot);
    $('CancelMark').onclick=()=>{remember();pendingSlotStart=null;changed();draw();message('已取消未完成的开始标记。');};
    $('DeleteSlot').onclick=safely(()=>{
      if(!cues[selected])return;
      if(workflow==='slots'){remember();timingSlots.splice(selected,1);syncMapping();stopPreview();changed();draw();message('已删除时间区间，后续歌词按顺序重新填入。可撤销。');}
      else{const next=D.copy(cues);next.splice(selected,1);commit(next,'已删除这句字幕，可撤销。');}
    });
    $('Undo').onclick=()=>{if(!history.length)return;future.push(state());restore(history.pop());};
    $('Redo').onclick=()=>{if(!future.length)return;history.push(state());restore(future.pop());};
    $('Start').onchange=safely(()=>updateEdge('start',D.parseTime($('Start').value)));$('End').onchange=safely(()=>updateEdge('end',D.parseTime($('End').value)));
    $('MarkStart').onclick=safely(()=>updateEdge('start',video.currentTime));$('MarkEnd').onclick=safely(()=>updateEdge('end',video.currentTime));
    for(const edge of ['Start','End'])$('Fixed'+edge).onchange=safely(()=>{const next=D.copy(cues);next[selected][edge.toLowerCase()+'Locked']=$('Fixed'+edge).checked;commit(next);});
    $('TextApply').onclick=safely(()=>commit(D.replaceText(cues,selected,$('Text').value,duration),'文字已更新；换行拆成多句。'));
    $('Merge').onclick=safely(()=>commit(D.merge(cues,selected,selected+1,duration),'已与下一句合并，可撤销。'));
    $('Play').onclick=safely(()=>play());$('PlayRange').onclick=safely(()=>play(true));$('Pause').onclick=stopPreview;
    $('Seek').oninput=()=>{preview=null;video.currentTime=Number($('Seek').value);positionPlayhead();};
    $('Speed').onchange=()=>{video.playbackRate=Number($('Speed').value);};
    $('Zoom').oninput=()=>{span=Number($('Zoom').value);drawTimeline();};$('Window').oninput=()=>{windowStart=Number($('Window').value);drawTimeline();};
    $('Follow').onclick=()=>{windowStart=Math.max(0,video.currentTime-span*.2);drawTimeline();};
    for(const format of ['Srt','Vtt'])$(format).onclick=safely(()=>{ready();onExport(D.serialize(cues,duration,format.toLowerCase()),format.toLowerCase());});
    $('Apply').onclick=safely(async()=>{ready();const id=videoId,version=revision;await onApply(D.copy(cues));if(!isOpen() || id!==videoId || version!==revision)return;await saveDraft();if(isOpen() && id===videoId && version===revision)close();});
    return {open,close,isOpen,flush:()=>isOpen()?saveDraft():pendingSave};
  }
  const api={attach};if(typeof module!=='undefined')module.exports=api;else root.EchoSubtitleEditorView=api;
})(globalThis);
