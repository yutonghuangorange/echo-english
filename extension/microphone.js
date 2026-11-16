// Fixed input gain only. No automatic compression and no microphone monitoring.
(function(root){
  function clampDb(value){return Number.isFinite(value)?Math.max(0,Math.min(24,value)):0;}
  async function createInput(microphone,db=0,env=root){
    db=clampDb(db);
    if(db===0)return {stream:microphone,db,dispose(){}};
    let context,source,gain,destination,disposed=false;
    function dispose(){
      if(disposed)return;disposed=true;
      try{source?.disconnect();gain?.disconnect();}catch{}
      destination?.stream.getTracks().forEach(track=>track.stop());
      if(context)void context.close().catch(()=>{});
    }
    try{
      context=new env.AudioContext();
      source=context.createMediaStreamSource(microphone);
      gain=context.createGain();gain.gain.value=10**(db/20);
      destination=context.createMediaStreamDestination();
      source.connect(gain);gain.connect(destination);
      await context.resume();
      if(context.state==='suspended')throw Error('Audio context suspended');
      return {stream:destination.stream,db,dispose};
    }catch(error){
      dispose();throw Error('无法启用手动录音增益，请将增益设为 0 dB 后重试。',{cause:error});
    }
  }
  const api={clampDb,createInput};
  if(typeof module!=='undefined')module.exports=api;else root.EchoMicrophone=api;
})(globalThis);
