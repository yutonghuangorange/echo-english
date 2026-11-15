const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const { createStorage,cueKey } = require('../extension/storage.js');
const take = (id,videoId='video',key='sentence',createdAt=Number(id))=>({id,videoId,cueKey:key,createdAt,start:1,end:3,speed:1,blob:new Blob(['audio'])});

test('persists progress and all adjusted cues across a database reopen', async()=>{
  const factory=new IDBFactory(); const first=createStorage(factory);
  const session={videoId:'video',index:1,start:2.2,end:4.8,speed:'0.75',cues:[{key:'stable',start:2.2,end:4.8,text:'Hello'}]};
  await first.saveSession(session);(await first.ready).close();
  const second=createStorage(factory);
  assert.deepEqual(await second.getSession('video'),session);
  assert.equal(await second.getSession('other'),undefined);(await second.ready).close();
});
test('retains only newest three per sentence, without pruning other sentences/videos',async()=>{
  const storage=createStorage(new IDBFactory());
  await Promise.all(['1','2','3','4'].map(id=>storage.saveTake(take(id))));
  await storage.saveTake(take('5','video','other'));
  await storage.saveTake(take('6','another','sentence'));
  assert.deepEqual((await storage.listTakes('video')).map(t=>t.id),['5','4','3','2']);
  assert.deepEqual((await storage.listTakes('another')).map(t=>t.id),['6']);
  (await storage.ready).close();
});
test('delete and undo restore the original audio and metadata',async()=>{
  const storage=createStorage(new IDBFactory());const value=take('1');
  await storage.saveTake(value);await storage.deleteTake('1');
  assert.deepEqual(await storage.listTakes('video'),[]);
  await storage.saveTake(value);const [restored]=await storage.listTakes('video');
  assert.equal(await restored.blob.text(),'audio');assert.equal(restored.start,1);assert.equal(restored.speed,1);
  (await storage.ready).close();
});
test('upgrades v1 latest take without losing its audio or leaving a duplicate',async()=>{
  const factory=new IDBFactory();
  const old=await new Promise((resolve,reject)=>{
    const request=factory.open('echo-dubbing-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('takes',{keyPath:'videoId'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  await new Promise((resolve,reject)=>{const tx=old.transaction('takes','readwrite');tx.objectStore('takes').put({videoId:'video',start:10,end:15,speed:.75,createdAt:123,blob:new Blob(['legacy'])});tx.oncomplete=resolve;tx.onerror=reject;});old.close();
  const storage=createStorage(factory);const values=await storage.listTakes('video');
  assert.equal(values.length,1);assert.equal(values[0].cueKey,cueKey(null,10,15));
  assert.equal(await values[0].blob.text(),'legacy');assert.equal(values[0].speed,.75);
  const db=await storage.ready;
  const count=await new Promise(resolve=>{db.transaction('takes').objectStore('takes').count().onsuccess=e=>resolve(e.target.result);});
  assert.equal(count,0);db.close();
});
test('stable sentence keys survive boundary changes and distinguish manual ranges',()=>{
  const cue={start:1,text:'Hello'};const key=cueKey(cue);
  assert.equal(cueKey({...cue,start:1.2,key}),key);
  assert.notEqual(cueKey(null,1,3),cueKey(null,2,3));
});

test('accompaniment audio survives database reopen and keeps a bounded cache independently of recordings',async()=>{
  const factory=new IDBFactory(),first=createStorage(factory);
  await first.saveTake(take('1'));
  for(let i=0;i<9;i++)await first.saveBacking({key:`video:${i}`,videoId:'video',start:i,end:i+1,createdAt:i,blob:new Blob([`backing-${i}`])});
  (await first.ready).close();
  const reopened=createStorage(factory),values=await reopened.listBackings('video');
  assert.equal(values.length,8);assert.equal(values[0].key,'video:8');
  assert.equal(await values[0].blob.text(),'backing-8');assert(!values.some(v=>v.key==='video:0'));
  assert.equal((await reopened.listTakes('video')).length,1);
  (await reopened.ready).close();
});
