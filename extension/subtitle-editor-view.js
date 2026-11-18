// Mounted only when the editor is first opened. Playback uses the existing video.
(function(root){
  function attach({view,doc=root.document,env=root,domain=root.EchoSubtitleEditor,onApply,onDraft=async()=>{},onExport,onClose=()=>{}}){
    const $=id=>view.getElementById('se'+id),dialog=$('Dialog'),D=domain;
    let cues=[],original=[],source=[],selected=0,last=0,duration=0,video=null,videoId='',history=[],future=[],revision=0,raf=0,active=-1,looping=false,previewEnd=null,mediaState=null,drag=null,windowStart=0,span=60,saveTimer=null,pendingSave=Promise.resolve(),listFirst=-1;
    const rowHeight=54,rows=new Map(),blocks=new Map();
    let savedRevision=-1,optionTexts=[],optionSelected=-1,sectionTimes={start:null,end:null};
    let workflow='cues',timingSlots=[],mapping=null,pendingSlotStart=null;
    const isOpen=()=>!!dialog.open;
    function message(text){$('Message').textContent=text;}
    function safely(work){return ()=>{try{const result=work();return result?.catch?result.catch(e=>message(e.message)):result;}catch(e){message(e.message);}};}
    function state(){return {cues:D.copy(cues),original:D.copy(original),paste:$('Paste').value || '',selected,last,windowStart,span,sectionTimes:{...sectionTimes},workflow,timingSlots:D.copy(timingSlots),pendingSlotStart};}
    function saveDraft(){
      if(saveTimer!==null){env.clearTimeout(saveTimer);saveTimer=null;}
      const value=state(),id=videoId,version=revision;
      pendingSave=pendingSave.catch(()=>{}).then(()=>onDraft(id,value)).then(()=>{if(id===videoId && version===revision){savedRevision=version;if(isOpen())$('DraftState').textContent='草稿已保存到本机';}},e=>{if(isOpen() && version===revision)$('DraftState').textContent=`草稿保存失败：${e.message}。请导出字幕保留。`;});return pendingSave;
    }
    function changed(){revision++;$('DraftState').textContent='正在保存草稿…';if(saveTimer!==null)env.clearTimeout(saveTimer);saveTimer=env.setTimeout(saveDraft,300);}
    function snapshot(){return {...state()};}
    function remember(){history.push(snapshot());if(history.length>60)history.shift();future=[];}
    function syncMapping(){mapping=D.alignSlots(timingSlots,$('Paste').value || '',duration);cues=mapping.rows;selected=Math.max(0,Math.min(selected,Math.max(0,cues.length-1)));last=Math.max(selected,Math.min(last,Math.max(0,cues.length-1)));}
    function slotsFrom(values){return values.map(({text,group,unmatched,...slot})=>slot);}
    function commitSlots(next,note){remember();timingSlots=next;syncMapping();selected=last=Math.max(0,cues.length-1);changed();draw();message(note);}
    function ready(){if(workflow==='cues' && (sectionTimes.start!==null || sectionTimes.end!==null))throw Error('段落时间尚未应用，请先点击顶部“应用时间到所选歌词”，避免载入旧时间。');if(workflow==='slots' && (!mapping?.balanced || pendingSlotStart!==null || sectionTimes.start!==null))throw Error('时间区间与歌词行数尚未对齐，请补齐或删除高亮的多余部分后再导出／载入。');}
    function restore(value){cues=value.cues;selected=value.selected;last=value.last;sectionTimes={...value.sectionTimes};workflow=value.workflow;timingSlots=D.copy(value.timingSlots);pendingSlotStart=value.pendingSlotStart;$('Paste').value=value.paste || '';if(workflow==='slots')syncMapping();else mapping=null;stopPreview();changed();draw();}
    function commit(next,note='已更新，可播放选段检查。',{clearSection=false,targetWorkflow=workflow}={}){
      D.validate(next,duration);remember();workflow=targetWorkflow;if(workflow==='cues')mapping=null;cues=next;if(workflow==='slots'){timingSlots=slotsFrom(next);syncMapping();}if(clearSection)sectionTimes={start:null,end:null};
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
        button.append(title,meta);button.onclick=()=>select(i);button.classList.toggle('playing',i===active);button.classList.toggle('unmatched',!!cues[i].unmatched);list.append(button);rows.set(i,button);
      }
      const after=doc.createElement('div');after.style.height=`${Math.max(0,cues.length-end)*rowHeight}px`;list.append(after);
    }
    function drawTimeline(){
      const lane=$('Lane');lane.replaceChildren();blocks.clear();windowStart=Math.max(0,Math.min(windowStart,Math.max(0,duration-span)));
      $('Window').value=String(windowStart);$('Window').max=String(Math.max(0,duration-span));
      $('WindowLabel').textContent=`${D.time(windowStart)} – ${D.time(Math.min(duration,windowStart+span))}`;
      for(const i of D.windowIndices(cues,windowStart,windowStart+span)){
        const c=cues[i],left=Math.max(windowStart,c.start),right=Math.min(windowStart+span,c.end);
        const block=doc.createElement('div');block.className='se-block';block.style.left=`${(left-windowStart)/span*100}%`;block.style.width=`${(right-left)/span*100}%`;block.dataset.index=String(i);block.classList.toggle('selected',i>=selected && i<=last);block.classList.toggle('playing',i===active);block.classList.toggle('unmatched',!!c.unmatched);
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
    function renderMarkSummary(){
      if(workflow==='slots'){
        $('Estimate').textContent='记录这组时间';$('Estimate').hidden=pendingSlotStart===null;
        for(const id of ['Apply','Srt','Vtt'])$(id).disabled=!mapping?.balanced || pendingSlotStart!==null || sectionTimes.start!==null;
        $('MarkSelection').textContent=pendingSlotStart!==null?'已标记开始，听到结束按 O':`已记录 ${timingSlots.length} 个时间区间`;
        return;
      }
      const pending=sectionTimes.start!==null || sectionTimes.end!==null;
      $('MarkSelection').textContent=cues[selected]?`为第 ${selected+1}–${last+1} 句打点${pending?' · 待应用':''}`:'请先粘贴歌词或载入字幕';
    }
    function draw(){
      const cue=cues[selected],has=!!cue;
      renderMarkSummary();
      $('Workspace').hidden=!cues.length;$('Empty').hidden=!!cues.length;$('Count').textContent=`${cues.length} 句${cue?` · 已选第 ${selected+1}–${last+1} 句`:''}`;
      $('Undo').disabled=!history.length;$('Redo').disabled=!future.length;
      for(const id of ['Apply','Srt','Vtt','PlayRange','Estimate','Merge','TextApply','MarkStart','MarkEnd','Start','End','First','Last','FixedStart','FixedEnd','SectionStart','SectionEnd','SectionMarkStart','SectionMarkEnd','Group'])$(id).disabled=!has;
      $('Merge').disabled=!has || last<=selected;$('Current').disabled=!source.length;$('Original').disabled=!original.length;
      if(cue){
        $('Start').value=D.time(cue.start);$('End').value=D.time(cue.end);$('Text').value=cue.text.replace(/\n/g,'\u2028');$('FixedStart').checked=!!cue.startLocked;$('FixedEnd').checked=!!cue.endLocked;
        if(workflow==='cues'){
          const rebuild=optionTexts.length!==cues.length || cues.some((c,i)=>c.text!==optionTexts[i]);
          if(rebuild){
            optionTexts=cues.map(c=>c.text);
            for(const id of ['First','Last']){
              const options=cues.map((c,i)=>{const option=doc.createElement('option');option.value=String(i);option.textContent=`第 ${i+1} 句 · ${c.text.slice(0,45)}`;return option;});$(id).replaceChildren(...options);
            }
          }
          if(rebuild || optionSelected!==selected){Array.from($('Last').children).forEach((option,i)=>{option.disabled=i<selected;});optionSelected=selected;}
          $('First').value=String(selected);$('Last').value=String(last);
        }
        $('SectionStart').value=sectionTimes.start ?? D.time(cues[selected].start);$('SectionEnd').value=sectionTimes.end ?? D.time(cues[last].end);
      }
      const marking=workflow==='slots';$('Workflow').value=workflow;
      $('TextTools').hidden=marking;$('InspectorTitle').textContent=marking?'调整选中的时间区间':'当前句微调';$('Estimate').hidden=marking && pendingSlotStart===null;
      $('ListTitle').textContent=marking?'时间区间与歌词':'歌词 · 选择起止句';$('SelectionRow').hidden=marking;
      $('WorkflowHint').textContent=marking?'边听边按 I 开始、O 结束（自动记录）→ 粘贴歌词 → 数量对齐后保存。一组区间对应一行歌词。':'先选起止句 → 边听边按 I／O 打点 → 应用时间。空格播放／暂停。';
      if(marking)$('Count').textContent=`${timingSlots.length} 个区间 · ${mapping?.lineCount || 0} 行歌词`;
      $('Build').textContent=marking?'按标记区间填入歌词':'用歌词建立估算时间轴';
      $('Estimate').textContent=marking?(pendingSlotStart!==null?'记录这组时间':'按标记填入歌词'):'应用时间到所选歌词';
      $('PasteHint').textContent=marking?'先播放，用 I 标记开始、O 标记结束；每一对标记对应一行歌词，再粘贴歌词，按时间顺序自动填入。':'每行一句，空行分段；先选起止句，再标记段落时间并估算。';
      $('Empty').textContent=marking?'先听歌打点：按 I 标记一行开始，按 O 记录结束。可以连续记录，不需要先有歌词。':'还没有歌词。粘贴文本并建立时间轴，即可开始标时。';
      $('DeleteSlot').hidden=!marking;$('DeleteSlot').disabled=!has;$('Group').hidden=marking;
      if(marking){
        for(const id of ['SectionStart','SectionEnd','SectionMarkStart','SectionMarkEnd','Estimate'])$(id).disabled=false;
        $('SectionStart').value=pendingSlotStart!==null?D.time(pendingSlotStart):'';
        $('SectionEnd').value=sectionTimes.end ?? '';
        for(const id of ['Text','TextApply','Merge'])$(id).disabled=true;
        for(const id of ['Apply','Srt','Vtt'])$(id).disabled=!mapping?.balanced || pendingSlotStart!==null;
      }else $('Text').disabled=!has;
      drawMappingIssues();drawList(true);drawTimeline();
    }
    function drawMappingIssues(){
      const box=$('MappingIssues');box.replaceChildren();
      box.hidden=workflow!=='slots' || !mapping || (!timingSlots.length && !mapping.lineCount) || mapping.balanced;
      if(box.hidden)return;
      const summary=doc.createElement('div');summary.textContent=`时间区间 ${timingSlots.length} 个 · 歌词 ${mapping.lineCount} 行。${mapping.missingLyrics?`黄色区间缺少 ${mapping.missingLyrics} 行歌词。`:`红色部分有 ${mapping.extraLyrics.length} 行歌词没有时间区间。`}补齐或删除多余部分后才能载入。`;box.append(summary);
      for(const line of mapping.extraLyrics.slice(0,20)){const row=doc.createElement('div');row.className='se-unmatched-lyric';row.textContent=`第 ${line.line} 行（缺少时间）：${line.text}`;box.append(row);}
      if(mapping.extraLyrics.length>20){const more=doc.createElement('div');more.textContent=`另有 ${mapping.extraLyrics.length-20} 行未匹配，可在歌词输入框查看全部。`;box.append(more);}
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
      video=null;mediaState=null;cues=[];original=[];source=[];history=[];future=[];timingSlots=[];mapping=null;pendingSlotStart=null;optionTexts=[];optionSelected=-1;rows.clear();blocks.clear();
      for(const id of ['List','Lane','First','Last'])$(id).replaceChildren();$('Paste').value='';$('Text').value='';
      onClose();
    }
    function open(options){
      if(isOpen())return;revision++;savedRevision=-1;sectionTimes={start:null,end:null};video=options.video;duration=video.duration;videoId=options.videoId;
      if(!Number.isFinite(duration) || duration<=0)throw Error('请等待视频时长加载后再编辑字幕。');
      source=D.fromCues(options.cues);const draft=options.draft;
      for(const edge of ['start','end']){const value=draft?.sectionTimes?.[edge];sectionTimes[edge]=typeof value==='string' && value.length<=32?value:null;}
      try{if(draft?.cues?.length)D.validate(draft.cues,duration);cues=draft?.cues?.length?D.fromCues(draft.cues):D.copy(source);}catch{cues=D.copy(source);}
      original=draft?.original?.length?D.fromCues(draft.original):D.copy(source);
      selected=Math.max(0,Math.min(Number(draft?.selected)||0,Math.max(0,cues.length-1)));last=Math.max(selected,Math.min(Number(draft?.last)||selected,Math.max(0,cues.length-1)));
      span=[10,30,60,120,300].includes(Number(draft?.span))?Number(draft.span):60;windowStart=Number(draft?.windowStart)||0;history=[];future=[];active=-1;
      $('Paste').value=draft?.paste || '';
      workflow=['slots','cues'].includes(draft?.workflow)?draft.workflow:(cues.length?'cues':'slots');
      timingSlots=Array.isArray(draft?.timingSlots)?D.copy(draft.timingSlots):[];pendingSlotStart=Number.isFinite(draft?.pendingSlotStart)?draft.pendingSlotStart:null;
      if(workflow==='slots')syncMapping();else mapping=null;
      $('Zoom').value=String(span);$('Seek').max=String(duration);$('Link').checked=true;$('Loop').checked=false;$('Method').value='length';$('Speed').value='1';
      mediaState={muted:video.muted,speed:video.playbackRate};video.pause?.();video.muted=false;
      for(const name of ['play','pause','timeupdate','seeked','ended'])video.addEventListener?.(name,name==='play'?onPlay:onTime);
      if(dialog.showModal)dialog.showModal();else dialog.open=true;
      $('PasteDetails').open=!cues.length;$('List').scrollTop=selected*rowHeight;draw();message(draft?'已恢复本机草稿。可继续编辑，或载入主界面当前字幕。':workflow==='slots'?'先播放，用 I／O 记录时间区间，再粘贴歌词；一对标记对应一行。':'粘贴歌词，每行一句；或直接调整已有字幕。估算后请试听校准。');$('DraftState').textContent='编辑只改变草稿；点击“保存并载入”后主界面生效。';$(workflow==='slots' || cues.length?'Play':'Paste').focus();
    }
    $('Close').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
    $('List').onscroll=()=>drawList();
    $('Paste').oninput=safely(()=>{if(workflow==='slots'){syncMapping();draw();}changed();});
    $('Workflow').onchange=safely(()=>{
      const next=$('Workflow').value;if(next===workflow)return;
      if(next==='cues' && workflow==='slots' && (timingSlots.length || mapping?.lineCount) && !mapping?.balanced){$('Workflow').value=workflow;throw Error('请先补齐高亮的歌词或时间区间，再进入字幕微调。');}
      remember();workflow=next;sectionTimes={start:null,end:null};pendingSlotStart=null;
      if(workflow==='slots'){timingSlots=slotsFrom(cues);$('Paste').value=cues.map(c=>c.text).join('\n');syncMapping();}else mapping=null;
      changed();draw();
    });
    $('DeleteSlot').onclick=safely(()=>{if(workflow!=='slots' || !timingSlots[selected])return;const next=D.copy(timingSlots);next.splice(selected,1);commitSlots(next,'已删除所选时间区间，可撤销。');});
    $('Build').onclick=safely(()=>{if(workflow==='slots'){syncMapping();changed();draw();message(mapping.balanced?'歌词已按顺序填入时间区间，可以试听并保存。':'已填入能匹配的歌词，请处理高亮的多余部分。');return;}selected=last=0;commit(D.paste($('Paste').value,duration),'歌词已建立为估算时间。空行分段，可先选择本段，再标记开始和结束进行估算。',{clearSection:true});$('PasteDetails').open=false;});
    $('Current').onclick=safely(()=>{selected=last=0;commit(D.copy(source),'已载入主界面当前字幕。',{clearSection:true,targetWorkflow:'cues'});});
    $('Original').onclick=safely(()=>{selected=last=0;commit(D.copy(original),'已恢复修改前字幕，保存并载入后生效。',{clearSection:true,targetWorkflow:'cues'});});
    $('Undo').onclick=()=>{if(!history.length)return;future.push(snapshot());restore(history.pop());};
    $('Redo').onclick=()=>{if(!future.length)return;history.push(snapshot());restore(future.pop());};
    $('First').onchange=()=>{selected=Number($('First').value);last=Math.max(selected,last);draw();changed();};$('Last').onchange=()=>{last=Number($('Last').value);draw();changed();};
    $('Group').onclick=()=>{const group=cues[selected]?.group;if(group===undefined){message('已有字幕未分段，请用起句与止句选择范围。');return;}const first=cues.findIndex(c=>c.group===group);let end=first;while(end+1<cues.length && cues[end+1].group===group)end++;selected=first;last=end;draw();changed();};
    $('Estimate').onclick=safely(()=>{
      if(workflow==='slots'){if(sectionTimes.start!==null && pendingSlotStart===null)throw Error('开始时间无效，请输入有效时间或按 I 标记。');if(pendingSlotStart!==null)finishSlot(D.parseTime($('SectionEnd').value));else{syncMapping();changed();draw();message(mapping.balanced?'歌词已按时间区间顺序填入，可试听后保存。':'数量尚未对齐，请处理高亮部分。');}return;}
      // Read the latest input values once; UI redraws must never replace pending marks.
      const start=D.parseTime($('SectionStart').value),end=D.parseTime($('SectionEnd').value);
      const next=D.interpolate(cues,selected,last,start,end,duration,$('Method').value);
      commit(next,`已应用第 ${selected+1}–${last+1} 句：${D.time(start)}–${D.time(end)}。可播放选段检查。`,{clearSection:true});
    });
    for(const edge of ['Start','End']){
      const update=()=>{if(workflow==='slots' && edge==='Start'){const value=D.parseTime($('SectionStart').value);pendingSlotStart=Number.isFinite(value)?value:null;}sectionTimes[edge.toLowerCase()]=workflow==='slots' && edge==='Start' && !$('SectionStart').value.trim()?null:$('Section'+edge).value;renderMarkSummary();changed();};
      $('Section'+edge).oninput=update;$('Section'+edge).onchange=update;
    }
    function finishSlot(end){
      if(pendingSlotStart===null)throw Error('请先按 I 标记开始，再按 O 标记结束。');
      const next=D.captureSlot(timingSlots,pendingSlotStart,end,duration),oldKeys=new Set(timingSlots.map(slot=>slot.key)),capturedIndex=next.findIndex(slot=>!oldKeys.has(slot.key));
      commitSlots(next,`已记录第 ${next.length} 个区间。继续按 I／O 记录下一行，或粘贴歌词自动填入。`);
      pendingSlotStart=null;selected=last=capturedIndex;const captured=cues[selected];if(captured && (captured.start<windowStart || captured.start>=windowStart+span))windowStart=Math.max(0,captured.start-span*.15);sectionTimes={start:null,end:D.time(end)};draw();changed();
    }
    function markSection(edge){
      if(!video)return;
      if(workflow==='slots'){
        if(edge==='End'){safely(()=>finishSlot(video.currentTime))();return;}
        pendingSlotStart=video.currentTime;sectionTimes={start:D.time(video.currentTime),end:''};draw();changed();message(`开始已标记：${D.time(video.currentTime)}。听到这一行结束按 O，自动记录区间；播放会继续。`);return;
      }
      if(!cues.length)return;
      const value=D.time(video.currentTime);sectionTimes[edge.toLowerCase()]=value;$('Section'+edge).value=value;renderMarkSummary();changed();
      message(`已标记${edge==='Start'?'开始':'结束'}：${value}。${edge==='Start'?'继续播放，到结尾按 O 标记结束。':'点击“应用时间到所选歌词”，再播放选段检查。'}`);
    }
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
    for(const format of ['Srt','Vtt'])$(format).onclick=safely(()=>{ready();onExport(D.serialize(cues,duration,format.toLowerCase()),format.toLowerCase());});
    $('Apply').onclick=safely(async()=>{
      ready();D.validate(cues,duration);const id=videoId,version=revision;await onApply(D.copy(cues));
      if(!isOpen() || id!==videoId || version!==revision)return;
      await saveDraft();if(isOpen() && id===videoId && version===revision)close();
    });
    return {open,close,isOpen,flush:()=>isOpen()?saveDraft():pendingSave};
  }
  const api={attach};if(typeof module!=='undefined')module.exports=api;else root.EchoSubtitleEditorView=api;
})(globalThis);
