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

    return {watchEnd, timeout, onCancel, delay, cancel};
  }
  const api = {create};
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoPlayback = api;
})(globalThis);
