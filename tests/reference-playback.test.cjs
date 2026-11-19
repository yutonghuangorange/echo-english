const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../extension/reference-playback.js');
const {create:createClock}=require('../extension/playback.js');
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}
function fixture({repeat=()=>false}={}){
  let active=true,next=0,plays=0,paused=false,installed;
  const frames=new Map(),timers=new Map(),events=new Map();
  const env={requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);},setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout(id){timers.delete(id);}};
  const clock=createClock({env});
  const media={currentTime:0,playbackRate:1,async play(){plays++;},pause(){},addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener(name,fn){events.get(name)?.delete(fn);}};
  const actions={set(pause,resume,setSpeed){installed={pause,resume,setSpeed};paused=false;},async resume(){if(!paused)return false;paused=false;clock.setPaused(false);await installed.resume();return true;}};
  let view;
  const listening=create({media,range:{start:0,end:10,speed:.5},clock,actions,seek:async at=>{clock.cancel();media.currentTime=at;},show:(range,seekTo)=>{view={range,seekTo};},active:()=>active,changeSpeed:true,repeat});
  return {listening,media,timers,clock,get plays(){return plays;},get view(){return view;},get installed(){return installed;},pause(){paused=true;clock.setPaused(true);media.pause();},stop(){active=false;clock.cancel();},advance(at){media.currentTime=at;for(const fn of [...events.get('timeupdate') || []])fn();}};
}
test('range jumps replace end watchers and watchdogs and preserve playback speed',async()=>{
  const f=fixture(),done=f.listening.run();await settle();assert.equal(f.listening.ready,true);assert.equal(f.media.playbackRate,.5);
  const oldTimer=[...f.timers.values()][0].fn;
  f.pause();await f.listening.jump(5,{start:5,end:8});assert.equal(f.media.currentTime,5);assert.equal(f.plays,2);
  oldTimer();assert.equal(f.listening.ready,true);
  f.installed.setSpeed(1.2);assert.equal(f.media.playbackRate,1.2);
  await f.view.seekTo(1);assert.equal(f.media.currentTime,6.2);
  f.advance(7);await settle();assert.equal(f.listening.ready,true);
  f.advance(8);await done;assert.equal(f.listening.ready,false);
  f.stop();assert.equal(f.timers.size,0);
});
test('looping restarts the same range and stops when the option is cleared',async()=>{
  let loop=true;const f=fixture({repeat:()=>loop}),done=f.listening.run();await settle();
  f.advance(10);await settle();assert.equal(f.plays,2);assert.equal(f.media.currentTime,0);assert.equal(f.media.playbackRate,.5);
  loop=false;f.advance(10);await done;assert.equal(f.plays,2);f.stop();
});
test('a watchdog failure rejects instead of indefinitely restarting a stalled loop',async()=>{
  const f=fixture({repeat:()=>true}),done=f.listening.run();await settle();
  [...f.timers.values()][0].fn();await assert.rejects(done,/播放超时/);assert.equal(f.plays,1);f.stop();
});
test('stopping invalidates queued navigation and cannot resume the previous media',async()=>{
  const f=fixture(),done=f.listening.run();await settle();f.stop();await done;
  assert.equal(await f.listening.jump(5),false);assert.equal(f.plays,1);
});
