// One owner for the shared pause/speed controls. Late promises from a previous
// playback cannot change the buttons or report errors against a newer one.
(function(root){
  function attach({pauseButton,speedControl,speedInput,clock,getSpeed,onSpeed,onError}){
    let owner=null,paused=false,changing=false;
    function render(){
      pauseButton.hidden=!owner;pauseButton.disabled=!owner || changing;
      pauseButton.textContent=paused?'▶ 继续':'Ⅱ 暂停';
      pauseButton.setAttribute('aria-label',paused?'继续播放':'暂停播放');
      speedControl.hidden=!owner?.setSpeed;speedInput.disabled=!owner?.setSpeed || changing;
      speedInput.value=String(getSpeed());
    }
    function set(pause,resume,setSpeed=null){owner={pause,resume,setSpeed};paused=false;changing=false;render();}
    function clear(){owner=null;paused=false;changing=false;render();}
    pauseButton.onclick=async()=>{
      if(!owner || changing)return;
      const current=owner;
      changing=true;paused=!paused;clock.setPaused(paused);render();
      try{await (paused?current.pause():current.resume());}
      catch(error){if(owner===current)onError(error);}
      finally{if(owner===current){changing=false;render();}}
    };
    speedInput.onchange=()=>{
      if(!owner?.setSpeed || changing)return;
      const speed=Number(speedInput.value);
      if(![0.75,1,1.25].includes(speed)){render();return;}
      try{owner.setSpeed(speed);onSpeed(speed);render();}catch(error){onError(error);}
    };
    render();
    return {set,clear,render,get paused(){return paused;}};
  }
  const api={attach};if(typeof module!=='undefined')module.exports=api;else root.EchoPlaybackControls=api;
})(globalThis);
