(function(root) {
  function createPlayer(Context = root.AudioContext || root.webkitAudioContext) {
    let context;
    function unlock() {
      if (!Context) return Promise.reject(Error('当前浏览器不支持录音回放。'));
      context ||= new Context();
      // Must be called directly from the click handler, before permission,
      // countdown or decoding awaits consume transient user activation.
      return context.resume();
    }
    async function prepare(blob, ended) {
      if (!context || context.state !== 'running') throw Error('请点击“我的配音”启用录音声音后重试。');
      const buffer=await context.decodeAudioData(await blob.arrayBuffer());
      let source=null,disposed=false;
      function pause() {
        if(source) { source.onended=null; source.stop(); source.disconnect(); source=null; }
      }
      return {
        play(offset=0) {
          if(disposed) return;
          pause();
          if(context.state!=='running') throw Error('录音声音已暂停，请点击“我的配音”重试。');
          offset=Math.max(0,offset);
          if(offset>=buffer.duration) { ended(); return; }
          const node=context.createBufferSource(); node.buffer=buffer; node.connect(context.destination); source=node;
          node.onended=()=>{if(source!==node || disposed)return;node.disconnect();source=null;ended();};
          node.start(0,offset);
        },
        pause,
        stop() { disposed=true;pause(); }
      };
    }
    return {unlock,prepare};
  }
  const api={createPlayer};
  if(typeof module!=='undefined')module.exports=api;else root.EchoRecordingPlayer=api;
})(globalThis);
