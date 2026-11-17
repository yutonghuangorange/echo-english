// Model management stays outside the practice flow; installation runs in Python.
(function(root){
  const DEFAULT_MODEL='demucs-htdemucs',BANDIT_MODEL='bandit-v2-multi';
  function bytes(size){return `${(size/1024/1024).toFixed(1)} MiB`;}
  function attach({view,request,doc=root.document,onCatalog=()=>{},env=root}){
    const $=id=>view.getElementById(id),dialog=$('modelDialog');
    let catalog=null,timer=0,revision=0,busy=false,pending=null;
    const element=(tag,text,className)=>{const el=doc.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
    function accept(value){catalog=value;onCatalog(value);if(dialog.open)render();return value;}
    function render(){
      $('modelList').replaceChildren();
      $('modelConfirm').hidden=!pending;
      if(pending)$('modelConfirmText').textContent=`删除 ${pending.name} 的模型权重及未完成下载（${bytes(pending.weightBytes+(pending.partialBytes || 0))}）？已有背景音和录音保留，下次提取需重新下载。额外依赖保留。`;
      $('modelConfirmYes').disabled=busy;$('modelConfirmNo').disabled=busy;
      for(const model of catalog?.models || []){
        const card=element('article','','library-card');
        card.append(element('strong',model.name),element('small',model.purpose));
        const stages={installing:'正在安装额外依赖', 'model-downloading':'正在下载模型',verifying:'正在校验'};
        const active=!!stages[model.state];
        card.append(element('small',`${active?`${stages[model.state]}${Number.isFinite(model.progress)?` · ${model.progress}%`:''}`:model.ready?'已就绪':'尚未就绪'} · 权重 ${bytes(model.downloadBytes)}`));
        if(model.partialBytes && !active)card.append(element('small',`未完成下载 ${bytes(model.partialBytes)} · 下次安装可续传`));
        if(model.id===BANDIT_MODEL)card.append(element('small','额外依赖约 380 MiB；合计约 0.8 GiB，建议预留 2 GiB。'));
        const details=element('details','');details.append(element('summary','设备与许可'),element('small',`${model.deviceNote} · ${model.license}`));card.append(details);
        if(model.error)card.append(element('small',model.error));
        const actions=element('div','','library-actions');
        if(active){const cancel=element('button','停止安装');cancel.disabled=busy;cancel.onclick=()=>act('model-cancel',model.id);actions.append(cancel);}
        else if(!model.ready){const install=element('button',model.error?'重试安装':'安装模型');install.disabled=busy || catalog.busy;install.onclick=()=>act('model-install',model.id);actions.append(install);}
        if(model.weightBytes || model.partialBytes){const remove=element('button',model.weightBytes?'删除权重':'清除未完成下载');remove.disabled=busy || catalog.busy;remove.onclick=()=>{pending=model;render();$('modelConfirmYes').focus();};actions.append(remove);}
        card.append(actions);$('modelList').append(card);
      }
      $('modelStartup').hidden=!!catalog;
      $('modelShared').textContent=catalog?`BandIt 额外依赖：${bytes(catalog.dependencyBytes)}${catalog.dependencyReady?' · 已就绪':''}。现有 Python、PyTorch 与 FFmpeg 共用。`:'';
    }
    function schedule(){
      env.clearTimeout(timer);timer=0;
      if(dialog.open && catalog?.busy)timer=env.setTimeout(()=>void refresh().catch(()=>{}),1500);
    }
    async function refresh(){
      const token=++revision;
      try{
        const value=await request('models');
        if(token!==revision)return catalog;
        accept(value);if(dialog.open)$('modelMessage').textContent='';schedule();return value;
      }catch(error){
        if(token===revision && dialog.open){$('modelMessage').textContent=error.message;$('modelStartup').hidden=false;}
        throw error;
      }
    }
    async function act(action,id){
      if(busy)return;
      busy=true;render();
      try{accept(await request(action,{model:id}));pending=null;$('modelMessage').textContent=action==='model-remove'?'权重已删除。':action==='model-cancel'?'正在停止；下载可在下次安装时继续。':'安装已开始，可关闭此窗口继续练习。';}
      catch(error){$('modelMessage').textContent=error.message;}
      finally{busy=false;render();schedule();}
    }
    async function open(){
      pending=null;if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.open=true;}
      render();$('modelMessage').textContent='正在连接本机服务…';await refresh().catch(()=>{});
    }
    function close(){revision++;env.clearTimeout(timer);timer=0;pending=null;if(dialog.close)dialog.close();else dialog.open=false;$('manageModels').focus();}
    $('manageModels').onclick=open;$('closeModels').onclick=close;
    dialog.oncancel=event=>{event.preventDefault();close();};
    $('refreshModels').onclick=()=>refresh().catch(()=>{});
    $('modelConfirmNo').onclick=()=>{pending=null;render();};
    $('modelConfirmYes').onclick=()=>pending && act('model-remove',pending.id);
    return {open,close,refresh,isOpen:()=>!!dialog.open,get:()=>catalog,model:id=>catalog?.models.find(model=>model.id===id)};
  }
  const api={attach,DEFAULT_MODEL,BANDIT_MODEL};
  if(typeof module!=='undefined')module.exports=api;else root.EchoModels=api;
})(globalThis);
