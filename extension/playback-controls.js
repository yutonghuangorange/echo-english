// One owner for the shared pause, speed and original-volume controls. Late promises from a previous
// playback cannot change the buttons or report errors against a newer one.
(function(root){
  const practice=typeof module!=='undefined'?require('./practice.js'):root.EchoPractice;
  function attach({pauseButton,speedControl,speedInput,volumeControl,volumeInput,volumeValue,clock,getSpeed,onSpeed,onError}){
    let owner=null,paused=false,changing=false;
    function renderVolume(){
      if(!volumeControl)return;
      const media=owner?.volumeMedia;
      volumeControl.hidden=!media;volumeInput.disabled=!media;
      const level=media?.muted?0:Number.isFinite(media?.volume)?media.volume:1;
      volumeInput.value=String(level);volumeValue.textContent=`${Math.round(level*100)}%`;
    }
    function render(){
      pauseButton.hidden=!owner;pauseButton.disabled=!owner || changing;
      pauseButton.textContent=paused?'▶ 继续':'Ⅱ 暂停';
      pauseButton.setAttribute('aria-label',paused?'继续播放':'暂停播放');
      speedControl.hidden=!owner?.setSpeed;speedInput.disabled=!owner?.setSpeed || changing;
      speedInput.value=String(getSpeed());renderVolume();
    }
    function detachVolume(){owner?.volumeMedia?.removeEventListener?.('volumechange',renderVolume);}
    function set(pause,resume,setSpeed=null,volumeMedia=null){
      detachVolume();owner={pause,resume,setSpeed,volumeMedia};paused=false;changing=false;
      volumeMedia?.addEventListener?.('volumechange',renderVolume);render();
    }
    function clear(){detachVolume();owner=null;paused=false;changing=false;render();}
    if(volumeInput)volumeInput.oninput=()=>{
      const media=owner?.volumeMedia,value=Number(volumeInput.value);
      if(!media || !Number.isFinite(value))return;
      media.volume=Math.max(0,Math.min(1,value));media.muted=false;renderVolume();
    };
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
      if(!practice.SPEEDS.includes(speed)){render();return;}
      try{owner.setSpeed(speed);onSpeed(speed);render();}catch(error){onError(error);}
    };
    render();
    return {set,clear,render,get paused(){return paused;}};
  }
  const api={attach};if(typeof module!=='undefined')module.exports=api;else root.EchoPlaybackControls=api;
})(globalThis);
