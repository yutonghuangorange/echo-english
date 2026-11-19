// Own the media range and clocks for original/reference listening. Caption
// selection, persistence and page navigation stay in the session coordinator.
(function(root){
  function create({media,range,clock,actions,seek,show,active,changeSpeed=false,repeat=()=>false}){
    range={...range};let complete=null,fail=null;
    const ready=()=>!!complete && active();
    function watch(){
      if(!ready())return;
      const done=complete,reject=fail;
      clock.watchEnd(media,range.end,()=>{media.pause();done();});
      clock.timeout(()=>{media.pause();reject(Error('原声播放超时，请检查视频后重试。'));},Math.max(0,(range.end-media.currentTime)/range.speed)*1000+15000);
    }
    async function move(position,resume=false){
      if(!ready())return false;
      media.currentTime=Math.max(range.start,Math.min(range.end,position));watch();
      if(resume){
        const resumed=await actions.resume();
        if(active() && !resumed)await media.play();
      }
      return active();
    }
    function jump(position,nextRange=null){
      if(!ready())return Promise.resolve(false);
      if(nextRange){
        if(!Number.isFinite(nextRange.start) || !Number.isFinite(nextRange.end) || nextRange.start<0 || nextRange.end<=nextRange.start)throw Error('无效的试听范围。');
        range.start=nextRange.start;range.end=nextRange.end;
      }
      return move(position,true);
    }
    async function run(){
      try{
        do{
          await seek(range.start);if(!active())return;
          media.playbackRate=range.speed;await media.play();if(!active())return;
          await new Promise((resolve,reject)=>{
            complete=()=>{complete=null;resolve();};fail=reject;clock.onCancel(complete);
            actions.set(()=>media.pause(),()=>media.play(),changeSpeed?speed=>{
              range.speed=speed;media.playbackRate=speed;watch();
            }:null,media);
            show(range,elapsed=>move(range.start+elapsed*range.speed));watch();
          });
          complete=null;fail=null;
        }while(active() && repeat());
      }finally{complete=null;fail=null;}
    }
    return {run,jump,get ready(){return ready();},get range(){return {...range};}};
  }
  const api={create};if(typeof module!=='undefined')module.exports=api;else root.EchoReferencePlayback=api;
})(globalThis);
