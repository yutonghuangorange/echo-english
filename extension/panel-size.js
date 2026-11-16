(function(root){
  const key='echo-panel-size-v1';
  function bounds(width,height){
    const top=Math.min(80,Math.max(8,height-340));
    return {top,maxWidth:Math.max(1,width-32),maxHeight:Math.max(1,height-top-16)};
  }
  function clampSize(size,limit){
    return {width:Math.round(Math.max(Math.min(320,limit.maxWidth),Math.min(limit.maxWidth,size.width))),
      height:Math.round(Math.max(Math.min(300,limit.maxHeight),Math.min(limit.maxHeight,size.height)))};
  }
  function attach({panel,host,handle,env=root}){
    let preferred=null,drag=null;
    const limit=()=>bounds(Number.isFinite(env.innerWidth)?env.innerWidth:1024,Number.isFinite(env.innerHeight)?env.innerHeight:768);
    function refresh(){
      const value=limit();host.style.top=`${value.top}px`;
      panel.style.maxWidth=`${value.maxWidth}px`;panel.style.maxHeight=`${value.maxHeight}px`;
      if(preferred){const size=clampSize(preferred,value);panel.style.width=`${size.width}px`;panel.style.height=`${size.height}px`;}
    }
    function save(){try{if(preferred)env.localStorage.setItem(key,JSON.stringify(preferred));else env.localStorage.removeItem(key);}catch{}}
    function reset(){preferred=null;panel.style.width='';panel.style.height='';refresh();save();}
    function change(size){preferred=clampSize(size,limit());refresh();}
    try{
      const value=JSON.parse(env.localStorage.getItem(key));
      if(value && Number.isFinite(value.width) && value.width>0 && Number.isFinite(value.height) && value.height>0)preferred=value;
    }catch{}
    refresh();
    handle.onpointerdown=event=>{
      if(event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const rect=panel.getBoundingClientRect();
      drag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height};
      handle.setPointerCapture(event.pointerId);
    };
    handle.onpointermove=event=>{
      if(!drag || event.pointerId!==drag.pointerId)return;
      change({width:drag.width+drag.x-event.clientX,height:drag.height+event.clientY-drag.y});
    };
    function end(event){if(!drag || event.pointerId!==drag.pointerId)return;drag=null;save();}
    handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=end;
    handle.ondblclick=reset;
    handle.onkeydown=event=>{
      if(event.key==='Home'){event.preventDefault();reset();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const rect=panel.getBoundingClientRect(),step=event.shiftKey?40:20;
      change({width:rect.width+(event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0),
        height:rect.height+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)});save();
    };
    env.addEventListener('resize',refresh);
    return {reset,refresh};
  }
  const api={bounds,clampSize,attach};
  if(typeof module!=='undefined')module.exports=api;else root.EchoPanelSize=api;
})(globalThis);
