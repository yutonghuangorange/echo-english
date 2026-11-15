const {test}=require('node:test');const assert=require('node:assert/strict');
const {createPlayer}=require('../extension/recording-player.js');
function contextFixture() {
  const nodes=[];let context;
  class Context {
    constructor(){context=this;this.state='suspended';this.destination={};this.resumed=false;}
    resume(){this.resumed=true;this.state='running';return Promise.resolve();}
    async decodeAudioData(){return {duration:2};}
    createBufferSource(){const node={connect(){},disconnect(){},stop(){this.stopped=true;},start(when,offset){this.offset=offset;}};nodes.push(node);return node;}
  }
  return {Context,nodes,get context(){return context;}};
}
test('unlocks audio synchronously on click and reuses it after asynchronous recording',async()=>{
  const fixture=contextFixture(),player=createPlayer(fixture.Context);
  const unlocked=player.unlock();assert.equal(fixture.context.resumed,true);await unlocked;
  await new Promise(resolve=>setTimeout(resolve,1));
  let ended=0;const playback=await player.prepare(new Blob(['audio']),()=>ended++);
  playback.play();assert.equal(fixture.nodes[0].offset,0);
  fixture.nodes[0].onended();assert.equal(ended,1);
});
test('buffering pauses without finishing, then restarts at the video-derived offset',async()=>{
  const fixture=contextFixture(),player=createPlayer(fixture.Context);await player.unlock();let ended=0;
  const playback=await player.prepare(new Blob(['audio']),()=>ended++);
  playback.play();const first=fixture.nodes[0];playback.pause();
  assert.equal(first.stopped,true);assert.equal(first.onended,null);assert.equal(ended,0);
  playback.play(.75);assert.equal(fixture.nodes[1].offset,.75);
  playback.stop();playback.play(1);assert.equal(fixture.nodes.length,2);assert.equal(ended,0);
});
test('reports suspended audio rather than silently replaying a muted video',async()=>{
  const fixture=contextFixture(),player=createPlayer(fixture.Context);
  await assert.rejects(player.prepare(new Blob(['audio']),()=>{}),/点击/);
  await player.unlock();const playback=await player.prepare(new Blob(['audio']),()=>{});
  fixture.context.state='suspended';assert.throws(()=>playback.play(),/暂停/);
});
