const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const directory=path.join(__dirname,'../extension');

test('the browser manifest loads the coordinator dependencies in a usable order',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  const scripts=manifest.content_scripts.find(entry=>entry.js.includes('content.js')).js;
  const context=vm.createContext({URL,Blob,TextEncoder,TextDecoder,setTimeout,clearTimeout});
  const loaded=[];
  for(const file of scripts){
    const source=fs.readFileSync(path.join(directory,file),'utf8');
    if(file==='content.js'){
      for(const name of new Set([...source.matchAll(/\b(Echo[A-Z]\w*)\./g)].map(match=>match[1])))assert.ok(context[name],`${name} must load before content.js`);
      break;
    }
    vm.runInContext(source,context,{filename:file});loaded.push(file);
  }
  assert.equal(new Set(loaded).size,loaded.length);
  assert.equal(context.EchoStorage.cueKey(null,0,1),'manual:0.00:1.00');
  assert.equal(typeof context.EchoPlaybackControls.attach,'function');
});

test('coordinator controls exist exactly once in the panel template',()=>{
  const html=require('../extension/panel-view.js').html;
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'duplicate IDs change which control owns an event');
  const source=fs.readFileSync(path.join(directory,'content.js'),'utf8');
  for(const match of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(match[1]),`missing panel control: ${match[1]}`);
});
