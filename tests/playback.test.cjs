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

test('paused playback freezes its watchdog and preserves remaining time across seek and cancellation',()=>{
  const env=clock();let time=0,completed=0;env.performance={now:()=>time};
  const playback=create({env});
  playback.timeout(()=>completed++,1000);
  const stale=[...env.timers.values()][0].fn;
  time=300;playback.setPaused(true);assert.equal(env.timers.size,0);
  stale();assert.equal(completed,0);
  time=100000;playback.setPaused(false);
  assert.equal([...env.timers.values()][0].ms,700);
  playback.setPaused(true);playback.timeout(()=>completed++,2000);
  assert.equal(env.timers.size,0);
  playback.setPaused(false);assert.equal([...env.timers.values()][0].ms,2000);
  playback.setPaused(true);playback.cancel();playback.setPaused(false);
  assert.equal(env.timers.size,0);assert.equal(completed,0);
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

test('media time events stop a clip even without rendering frames and are removed after completion or cancellation',()=>{
  const env=clock(),playback=create({env}),listeners=new Map();let stopped=0;
  const media={currentTime:0,addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
  playback.watchEnd(media,3,()=>stopped++);const stale=listeners.get('timeupdate');
  media.currentTime=2;stale();assert.equal(stopped,0);
  media.currentTime=3;stale();assert.equal(stopped,1);assert.equal(listeners.size,0);assert.equal(env.frames.size,0);
  stale();assert.equal(stopped,1);
  playback.watchEnd(media,5,()=>stopped++);const cancelled=listeners.get('timeupdate');playback.cancel();
  assert.equal(listeners.size,0);media.currentTime=5;cancelled();assert.equal(stopped,1);
});
