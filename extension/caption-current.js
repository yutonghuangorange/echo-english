// MAIN-world bridge: expose only the current video's selected caption identity.
// No cookies, network requests, playback changes or arbitrary commands.
(() => {
  document.addEventListener('echo-caption-current',event=>{
    const {videoId,requestId}=event.detail || {};
    if(typeof requestId!=='string' || requestId.length>100 || new URL(location.href).searchParams.get('v')!==videoId)return;
    const player=document.getElementById('movie_player');let track=null;
    try{
      if(player?.getVideoData()?.video_id===videoId){
        const value=player.getOption('captions','track');
        if(value?.languageCode)track={language:value.languageCode,generated:value.kind==='asr',id:value.vssId || null};
      }
    }catch{}
    document.dispatchEvent(new CustomEvent('echo-caption-current-result',{detail:{videoId,requestId,track}}));
  });
})();
