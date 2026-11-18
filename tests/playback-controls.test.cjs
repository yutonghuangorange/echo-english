const {test}=require('node:test');
const assert=require('node:assert/strict');
const {attach}=require('../extension/playback-controls.js');
function fixture(){
  const button=()=>({setAttribute(){}}),pauseButton=button(),speedControl=button(),speedInput=button(),errors=[],pauses=[];
  let speed='1';
  const controls=attach({pauseButton,speedControl,speedInput,clock:{setPaused:value=>pauses.push(value)},getSpeed:()=>speed,onSpeed:value=>{speed=String(value);},onError:error=>errors.push(error)});
  return {controls,pauseButton,speedControl,speedInput,errors,pauses};
}
test('a pending pause/resume cannot be toggled twice and speed changes preserve the pause state',async()=>{
  const f=fixture();let release,resumes=0,rate;
  f.controls.set(()=>new Promise(resolve=>{release=resolve;}),()=>resumes++,value=>{rate=value;});
  const pending=f.pauseButton.onclick();await f.pauseButton.onclick();
  assert.equal(f.pauseButton.disabled,true);assert.deepEqual(f.pauses,[true]);
  release();await pending;assert.equal(f.controls.paused,true);
  f.speedInput.value='0.75';f.speedInput.onchange();assert.equal(rate,.75);assert.equal(f.controls.paused,true);
  await f.pauseButton.onclick();assert.equal(resumes,1);assert.deepEqual(f.pauses,[true,false]);
});
test('late failures from replaced playback cannot stop a new playback or change its controls',async()=>{
  const f=fixture();let reject;
  f.controls.set(()=>{},()=>new Promise((resolve,fail)=>{reject=fail;}));
  await f.pauseButton.onclick();const pending=f.pauseButton.onclick();
  f.controls.clear();f.controls.set(()=>{},()=>{});
  reject(Error('old audio failed'));await pending;
  assert.equal(f.errors.length,0);assert.equal(f.controls.paused,false);assert.equal(f.pauseButton.disabled,false);
  assert.equal(f.pauseButton.textContent,'Ⅱ 暂停');assert.equal(f.speedControl.hidden,true);
});
test('active playback failures are reported while clearing hides both controls',async()=>{
  const f=fixture(),error=Error('device disconnected');
  f.controls.set(()=>{throw error;},()=>{});
  await f.pauseButton.onclick();assert.deepEqual(f.errors,[error]);
  f.controls.clear();assert.equal(f.pauseButton.hidden,true);assert.equal(f.speedControl.hidden,true);
});
