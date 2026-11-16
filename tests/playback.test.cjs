const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../extension/playback.js');

function clock() {
  let next = 0;
  const frames = new Map(), timers = new Map();
  return {frames, timers,
    requestAnimationFrame(fn) {frames.set(++next, fn); return next;},
    cancelAnimationFrame(id) {frames.delete(id);},
    setTimeout(fn, ms) {timers.set(++next, {fn, ms}); return next;},
    clearTimeout(id) {timers.delete(id);}
  };
}

test('seeking replaces the old end watcher and watchdog, including queued callbacks', () => {
  const env = clock(), playback = create({env});
  const media = {currentTime: 0};
  let oldDone = 0, done = 0;
  playback.watchEnd(media, 5, () => oldDone++);
  const staleFrame = [...env.frames.values()][0];
  playback.timeout(() => oldDone++, 1000);
  const staleTimeout = [...env.timers.values()][0].fn;
  playback.watchEnd(media, 10, () => done++);
  playback.timeout(() => done++, 9000);
  staleFrame(); staleTimeout();
  assert.equal(oldDone, 0);
  assert.equal(env.frames.size, 1);
  assert.equal(env.timers.size, 1);
  assert.equal([...env.timers.values()][0].ms, 9000);
  media.currentTime = 10;
  [...env.frames.values()][0]();
  assert.equal(done, 1);
  playback.cancel();
  assert.equal(env.timers.size, 0);
});

test('stop resolves a pending practice delay once and removes scheduled work', async () => {
  const env = clock(), playback = create({env});
  let resolved = 0;
  const waiting = playback.delay(3000).then(() => resolved++);
  const staleTimeout = [...env.timers.values()][0].fn;
  playback.cancel(); playback.cancel(); staleTimeout();
  await waiting;
  assert.equal(resolved, 1);
  assert.equal(env.frames.size, 0);
  assert.equal(env.timers.size, 0);
});

test('a completion callback can start the next operation without being cancelled', () => {
  const env = clock(), playback = create({env});
  let completed = 0;
  playback.onCancel(() => playback.onCancel(() => completed++));
  playback.cancel();
  assert.equal(completed, 0);
  playback.cancel(); playback.cancel();
  assert.equal(completed, 1);
});

test('cancelled seeks immediately remove their event listener and watchdog',async()=>{
  const env=clock(),playback=create({env}),listeners=new Map();
  const media={currentTime:0,pause(){},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
  const waiting=playback.seek(media,4);assert.equal(listeners.size,1);assert.equal(env.timers.size,1);
  const stale=listeners.get('seeked');playback.cancel();assert.equal(await waiting,false);
  assert.equal(listeners.size,0);assert.equal(env.timers.size,0);stale();
  const next=playback.seek(media,6);listeners.get('seeked')();assert.equal(await next,true);assert.equal(env.timers.size,0);
});
test('seek failures and timeouts clean up before reporting the error',async()=>{
  const env=clock(),playback=create({env}),listeners=new Map();
  const media={currentTime:0,pause(){},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  const waiting=playback.seek(media,8);const [id,timer]=[...env.timers.entries()][0];env.timers.delete(id);timer.fn();await assert.rejects(waiting,/定位超时/);assert.equal(listeners.size,0);assert.equal(env.timers.size,0);
});
