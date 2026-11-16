// Own the timers and completion callback for one active media operation.
(function(root) {
  function create({env = root} = {}) {
    let frame = 0, timer = 0, completion = null;
    let watchRevision = 0, timerRevision = 0;

    function watchEnd(media, end, done) {
      env.cancelAnimationFrame(frame);
      const revision = ++watchRevision;
      function tick() {
        if (revision !== watchRevision) return;
        frame = 0;
        if (media.currentTime >= end || media.ended) {
          done();
          return;
        }
        frame = env.requestAnimationFrame(tick);
      }
      frame = env.requestAnimationFrame(tick);
    }

    // Replaces the previous watchdog, including when seeking backwards.
    function timeout(done, milliseconds) {
      env.clearTimeout(timer);
      const revision = ++timerRevision;
      timer = env.setTimeout(() => {
        if (revision !== timerRevision) return;
        timer = 0;
        done();
      }, milliseconds);
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
      env.cancelAnimationFrame(frame);
      env.clearTimeout(timer);
      frame = timer = 0;
      const done = completion;
      completion = null;
      done?.();
    }

    return {watchEnd, timeout, onCancel, delay, seek, cancel};
  }
  const api = {create};
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoPlayback = api;
})(globalThis);
