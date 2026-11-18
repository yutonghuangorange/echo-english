// Own the timers and completion callback for one active media operation.
(function(root) {
  function create({env = root} = {}) {
    let frame = 0, timer = 0, completion = null;
    let watchRevision = 0, timerRevision = 0;
    let paused=false, pendingTimeout=null;
    const now=()=>env.performance?.now?.() ?? Date.now();
    let removeWatch = () => {};

    function watchEnd(media, end, done) {
      removeWatch();
      env.cancelAnimationFrame(frame);
      const revision = ++watchRevision;
      let finished=false;
      const cleanup=()=>{
        env.cancelAnimationFrame(frame);frame=0;
        media.removeEventListener?.('timeupdate',check);
        media.removeEventListener?.('ended',check);
      };
      function check() {
        if (revision !== watchRevision || finished) return;
        if (media.currentTime >= end || media.ended) {
          finished=true;cleanup();
          done();
        }
      }
      function tick() {
        if (revision !== watchRevision || finished) return;
        frame = 0;check();
        if(finished)return;
        frame = env.requestAnimationFrame(tick);
      }
      removeWatch=cleanup;
      // Media events continue when rendering is throttled or the tab is hidden.
      media.addEventListener?.('timeupdate',check);
      media.addEventListener?.('ended',check);
      frame = env.requestAnimationFrame(tick);
    }

    // Replaces the previous watchdog, including when seeking backwards.
    function timeout(done, milliseconds) {
      env.clearTimeout(timer);
      const revision = ++timerRevision;
      pendingTimeout={done,remaining:milliseconds,started:now()};
      if(paused)return;
      timer = env.setTimeout(() => {
        if (revision !== timerRevision) return;
        timer = 0;pendingTimeout=null;
        done();
      }, milliseconds);
    }

    function setPaused(value) {
      if(paused===value)return;
      paused=value;
      if(!pendingTimeout)return;
      if(paused){
        pendingTimeout.remaining=Math.max(0,pendingTimeout.remaining-(now()-pendingTimeout.started));
        env.clearTimeout(timer);timer=0;++timerRevision;
      }else timeout(pendingTimeout.done,pendingTimeout.remaining);
    }

    function onCancel(done) { completion = done; }

    function delay(milliseconds) {
      return new Promise(resolve => {
        onCancel(resolve);
        timeout(() => { completion = null; resolve(); }, milliseconds);
      });
    }

    // Seeking is owned by the same operation as playback. Cancel immediately
    // removes the listener/watchdog instead of waiting ten seconds to reject.
    function seek(media, at, {force = false} = {}) {
      cancel();
      media.pause();
      if (!force && Math.abs(media.currentTime - at) < 0.03 && !media.seeking) return Promise.resolve(true);
      return new Promise((resolve, reject) => {
        let finished = false;
        function done(success, error) {
          if (finished) return;
          finished = true;
          media.removeEventListener('seeked', onSeeked);
          env.clearTimeout(timer); timer = 0; ++timerRevision;
          if (completion === cancelled) completion = null;
          if (error) reject(error); else resolve(success);
        }
        const cancelled = () => done(false);
        const onSeeked = () => { if (!media.seeking && Math.abs(media.currentTime - at) < 0.1) done(true); };
        media.addEventListener('seeked', onSeeked);
        onCancel(cancelled);
        timeout(() => done(false, Error('视频定位超时，请重试。')), 10000);
        try { media.currentTime = at; } catch (error) { done(false, error); }
      });
    }

    function cancel() {
      ++watchRevision;
      ++timerRevision;
      removeWatch();removeWatch=()=>{};
      env.cancelAnimationFrame(frame);
      env.clearTimeout(timer);
      frame = timer = 0;
      paused=false;pendingTimeout=null;
      const done = completion;
      completion = null;
      done?.();
    }

    return {watchEnd, timeout, onCancel, delay, seek, cancel, setPaused};
  }
  const api = {create};
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoPlayback = api;
})(globalThis);
