// Independent practice-library dialog; no audio blobs are read into memory.
(function(root){
  function bytes(size){return size<1024?`${size} B`:size<1024*1024?`${(size/1024).toFixed(1)} KB`:`${(size/1024/1024).toFixed(1)} MB`;}
  function attach({view,storage,doc=root.document,onChange=async()=>{}}){
    const $=id=>view.getElementById(id),dialog=$('libraryDialog');
    let page='recent',items=[],pending=null,revision=0,busy=false;
    function element(tag,text,className){const el=doc.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
    function isOpen(){return !!dialog.open;}
    function confirm(kind,videoId,label,count){
      if(busy)return;pending={kind,videoId};$('libraryConfirm').hidden=false;
      $('libraryConfirmText').textContent=kind==='backings'?`清理${label}的 ${count} 条浏览器伴奏／背景音？人声录音和本机服务文件会保留。`:`删除${label}的 ${count} 条人声录音？此操作不可撤销，请先在录音页下载备份。`;
      $('libraryConfirmYes').focus();
    }
    function render(){
      const query=$('librarySearch').value.trim().toLowerCase();
      const list=$('libraryList');list.replaceChildren();
      $('libraryBody').setAttribute('aria-labelledby',page==='recent'?'libraryRecentTab':'libraryCacheTab');
      $('libraryRecentTab').tabIndex=page==='recent'?0:-1;$('libraryCacheTab').tabIndex=page==='cache'?0:-1;
      $('libraryRecentTab').setAttribute('aria-selected',String(page==='recent'));
      $('libraryCacheTab').setAttribute('aria-selected',String(page==='cache'));
      $('clearAllBackings').hidden=page!=='cache';
      $('clearAllBackings').disabled=busy || !items.some(i=>i.backings);
      const totals=items.reduce((s,i)=>({recordings:s.recordings+i.recordings,backings:s.backings+i.backings,recordingBytes:s.recordingBytes+i.recordingBytes,backingBytes:s.backingBytes+i.backingBytes}),{recordings:0,backings:0,recordingBytes:0,backingBytes:0});
      $('librarySummary').textContent=page==='recent'?`${items.filter(i=>i.hasSession || i.recordings).length} 个练习视频 · 点“继续练习”返回上次片段`:`浏览器伴奏／背景音 ${totals.backings} 条 · ${bytes(totals.backingBytes)} ｜ 录音 ${totals.recordings} 条 · ${bytes(totals.recordingBytes)}`;
      const visible=items.filter(i=>(page==='cache'?(i.backings || i.recordings):(i.hasSession || i.recordings)) && `${i.title} ${i.videoId}`.toLowerCase().includes(query));
      $('libraryEmpty').hidden=!!visible.length;
      $('libraryEmpty').textContent=query?'没有匹配的视频。':page==='recent'?'还没有练习记录，打开视频开始练习即可。':'浏览器中没有缓存的伴奏、背景音或录音。';
      for(const item of visible){
        const card=element('article','','library-card'),title=item.title || `视频 ${item.videoId}`;
        card.append(element('strong',title),element('small',`${item.recordings} 条录音 · ${item.backings} 条伴奏／背景音${item.updatedAt?' · '+new Date(item.updatedAt).toLocaleDateString():''}`));
        const actions=element('div','','library-actions');
        const link=element('a',page==='recent'?'继续练习 →':'打开视频 →');
        if(/^[\w-]{11}$/.test(item.videoId)){link.href=`https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}&t=${Math.floor(Math.max(0,item.start))}s`;actions.append(link);}
        if(page==='cache'){
          card.append(element('small',`伴奏／背景音 ${bytes(item.backingBytes)} · 录音 ${bytes(item.recordingBytes)}`));
          if(item.backings){const clear=element('button','清理背景音');clear.disabled=busy;clear.onclick=()=>confirm('backings',item.videoId,`“${title}”`,item.backings);actions.append(clear);}
          if(item.recordings){const remove=element('button','删除录音','danger');remove.disabled=busy;remove.onclick=()=>confirm('recordings',item.videoId,`“${title}”`,item.recordings);actions.append(remove);}
        }
        card.append(actions);list.append(card);
      }
      $('libraryNote').hidden=page!=='cache';
    }
    async function refresh(){
      const token=++revision;$('libraryMessage').textContent='正在读取本机练习库…';
      try{const rows=await storage.library();if(token!==revision || !isOpen())return;items=rows;render();$('libraryMessage').textContent='';}
      catch(error){if(token===revision && isOpen())$('libraryMessage').textContent=error.message || '练习库读取失败。';}
    }
    async function open(){
      if(!isOpen()){if(dialog.showModal)dialog.showModal();else dialog.open=true;}
      page='recent';pending=null;$('libraryConfirm').hidden=true;$('librarySearch').value='';$('libraryBody').scrollTop=0;render();await refresh();
    }
    function close(force=false){
      if(busy && !force)return;
      revision++;pending=null;
      if(dialog.close)dialog.close();else dialog.open=false;
      $('openLibrary').focus();
    }
    function escape(){if(pending && !busy){pending=null;$('libraryConfirm').hidden=true;$('libraryCacheTab').focus();}else close();}
    $('openLibrary').onclick=open;$('closeLibrary').onclick=()=>close();
    dialog.oncancel=event=>{event.preventDefault();escape();};
    $('libraryRecentTab').onclick=()=>{if(busy)return;page='recent';pending=null;$('libraryConfirm').hidden=true;$('libraryBody').scrollTop=0;render();};
    $('libraryCacheTab').onclick=()=>{if(busy)return;page='cache';pending=null;$('libraryConfirm').hidden=true;$('libraryBody').scrollTop=0;render();};
    for(const id of ['libraryRecentTab','libraryCacheTab'])$(id).onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?'libraryRecentTab':event.key==='End'?'libraryCacheTab':id==='libraryRecentTab'?'libraryCacheTab':'libraryRecentTab';$(target).click();$(target).focus();}};
    $('librarySearch').oninput=render;
    $('clearAllBackings').onclick=()=>confirm('backings',null,'所有视频',items.reduce((n,i)=>n+i.backings,0));
    $('libraryConfirmNo').onclick=()=>{pending=null;$('libraryConfirm').hidden=true;$('libraryCacheTab').focus();};
    $('libraryConfirmYes').onclick=async()=>{
      if(!pending || busy)return;
      const operation=pending;busy=true;render();
      for(const id of ['libraryConfirmYes','libraryConfirmNo','closeLibrary','libraryRecentTab','libraryCacheTab'])$(id).disabled=true;
      try{await storage.clearMedia(operation.kind,operation.videoId);await onChange();pending=null;$('libraryConfirm').hidden=true;await refresh();$('libraryMessage').textContent='清理完成。';}
      catch(error){$('libraryMessage').textContent=error.message || '清理失败，请重试。';}
      finally{busy=false;for(const id of ['libraryConfirmYes','libraryConfirmNo','closeLibrary','libraryRecentTab','libraryCacheTab'])$(id).disabled=false;render();if(isOpen())$('libraryCacheTab').focus();}
    };
    return {open,close,escape,isOpen,refresh};
  }
  const api={attach,bytes};if(typeof module!=='undefined')module.exports=api;else root.EchoLibrary=api;
})(globalThis);
