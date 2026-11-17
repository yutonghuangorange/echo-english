const {test}=require('node:test');
const assert=require('node:assert/strict');
const tools=require('../extension/practice-tools.js');
const microphone=require('../extension/microphone.js');
const recording=require('../extension/recording.js');
test('shortcuts ignore typing, composition, repeated keys and conflicting modifiers, and use physical keys on Mac',()=>{
  const event={altKey:true,shiftKey:true,code:'KeyR'};
  assert.equal(tools.shortcut({...event,code:'KeyC'}),'compare');assert.equal(tools.shortcut(event),'record');assert.equal(tools.shortcut({...event,key:'‰'}),'record');
  for(const change of [{altKey:false},{ctrlKey:true},{metaKey:true},{repeat:true},{isComposing:true},{target:{tagName:'INPUT'}},{target:{tagName:'SELECT'}},{target:{isContentEditable:true}},{code:'Space'},{code:'KeyF'}])assert.equal(tools.shortcut({...event,...change}),null);
  assert.equal(tools.shortcut({...event,composedPath:()=>[{tagName:'TEXTAREA'}]}),null);
});
function fixture({pending=false}={}){
  const nodes=new Map();
  for(const id of require('../extension/panel-view.js').html.matchAll(/\bid="([^"]+)"/g))nodes.set(id[1],{hidden:false,disabled:false,style:{},focus(){},scrollIntoView(){},removeAttribute(){},pause(){},load(){}});
  let timer,resolve,stopped=0,released=0,meterStopped=0,created=0,revoked=0,settings;
  const delayed=new Promise(done=>{resolve=done;}),mic={getTracks:()=>[{stop(){stopped++;},getSettings:()=>({})}]};
  const env={Blob,navigator:{mediaDevices:{}},URL:{createObjectURL(){created++;return 'blob:test';},revokeObjectURL(){revoked++;}},setTimeout(fn){timer=fn;return 1;},clearTimeout(){timer=null;}};
  env.MediaRecorder=class {
    static isTypeSupported(){return true;}
    constructor(){this.mimeType='audio/webm';this.state='inactive';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice'])});queueMicrotask(()=>this.onstop());}
  };
  const controller=tools.attach({view:{getElementById:id=>nodes.get(id)},env,
    getSettings:()=>({constraints:{echoCancellation:false},gainDb:6,quality:'high',description:'Test input'}),onApply(){},onConfigure(){},
    recording:{create(options){settings=options;return recording.create({...options,microphone:{...microphone,requestStream:()=>pending?delayed:Promise.resolve(mic),createInput:async()=>({stream:mic,db:6,dispose(){released++;}})}});}},
    meter:{start(){return {dispose(){meterStopped++;}};}}});
  return {nodes,controller,env,release:()=>resolve(mic),expire:()=>timer?.(),get settings(){return settings;},counts:()=>({stopped,released,meterStopped,created,revoked})};
}
test('mic audition uses the recording chain, produces a temporary replay after timeout, and releases devices and URLs',async()=>{
  const f=fixture();f.controller.open('mic');await f.nodes.get('micTestStart').onclick();
  assert.equal(f.settings.gainDb,6);assert.equal(f.nodes.get('micTestStart').disabled,true);assert.equal(f.nodes.get('wizardApply').disabled,true);assert.equal(f.nodes.get('wizardActivity').disabled,true);assert.equal(f.counts().stopped,0);
  f.expire();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.nodes.get('micTestAudio').hidden,false);assert.equal(f.nodes.get('micTestStart').disabled,false);
  assert.deepEqual(f.counts(),{stopped:1,released:1,meterStopped:1,created:1,revoked:0});
  f.controller.close();assert.equal(f.counts().revoked,1);assert.equal(f.nodes.get('micTestAudio').hidden,true);
});
test('closing pending microphone permission releases a late stream and never makes a replay',async()=>{
  const f=fixture({pending:true});f.controller.open('mic');const starting=f.nodes.get('micTestStart').onclick();
  f.controller.close();f.release();await starting;await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.counts(),{stopped:1,released:0,meterStopped:0,created:0,revoked:0});assert.equal(f.nodes.get('testMeter').hidden,true);
});


test('recommendations distinguish headphone singing from speaker dubbing and never enable speaker sidetone',()=>{
  assert.deepEqual(tools.recommend({activity:'sing',backing:true,listening:'headphones',quality:'lossless'}),
    {activity:'sing',scope:'whole',backing:true,echo:false,gain:false,sidetone:false,quality:'lossless',lead:'none'});
  const speech=tools.recommend({listening:'speakers',sidetone:true});
  assert.equal(speech.echo,true);assert.equal(speech.gain,true);assert.equal(speech.sidetone,false);
  assert.equal(tools.recommend({activity:'sing',listening:'speakers'}).gain,false);
  assert.equal(tools.recommend({sidetone:true}).sidetone,true);
});
