(function(root) {
  const MAX_TAKES = 3;
  const {cueKey} = typeof module !== 'undefined' ? require('./selection.js') : root.EchoSelection;
  function createStorage(factory = root.indexedDB, name = 'echo-dubbing-v1') {
    const ready = new Promise((resolve,reject) => {
      const request = factory.open(name,4);
      request.onupgradeneeded = () => {
        const db = request.result, tx = request.transaction;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions',{keyPath:'videoId'});
        if (!db.objectStoreNames.contains('backings')) {
          const backings=db.createObjectStore('backings',{keyPath:'key'});
          backings.createIndex('videoId','videoId');
        }
        const recordings = db.objectStoreNames.contains('recordings') ? tx.objectStore('recordings') : db.createObjectStore('recordings',{keyPath:'id'});
        if (!recordings.indexNames.contains('videoId')) recordings.createIndex('videoId','videoId');
        if (!recordings.indexNames.contains('segment')) recordings.createIndex('segment',['videoId','cueKey']);
        // Older song takes shared the manual dubbing version bucket.
        recordings.openCursor().onsuccess=event=>{
          const cursor=event.target.result;if(!cursor)return;
          const value=cursor.value;
          if(value.kind==='song' && !value.cueKey?.startsWith('song:'))cursor.update({...value,cueKey:`song:${value.cueKey || cueKey(null,value.start,value.end)}`});
          cursor.continue();
        };
        if (db.objectStoreNames.contains('takes')) {
          // Move v1's most recent take rather than discarding it or retaining a
          // second copy of its audio in the legacy store.
          const old = tx.objectStore('takes');
          old.openCursor().onsuccess = event => {
            const cursor = event.target.result;
            if (!cursor) return;
            const value = cursor.value;
            recordings.put({...value,id:`legacy:${value.videoId}`,cueKey:cueKey(null,value.start,value.end),label:'旧版录音'});
            cursor.delete(); cursor.continue();
          };
        }
      };
      request.onsuccess = () => { const db=request.result; db.onversionchange=()=>db.close(); resolve(db); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('本地数据库正在升级，请关闭其他 YouTube 标签页后刷新。'));
    });
    ready.catch(()=>{});
    async function transaction(stores, mode, work) {
      const db = await ready;
      return new Promise((resolve,reject) => {
        const tx=db.transaction(stores,mode); let result;
        tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || Error('本地保存已取消。'));
        try { work(tx,value=>{result=value;}); } catch(e) { tx.abort(); reject(e); }
      });
    }
    return {
      ready,
      saveSession(value) { return transaction(['sessions'],'readwrite',tx=>tx.objectStore('sessions').put(value)); },
      getSession(videoId) { return transaction(['sessions'],'readonly',(tx,set)=>{tx.objectStore('sessions').get(videoId).onsuccess=e=>set(e.target.result);}); },
      listBackings(videoId) { return transaction(['backings'],'readonly',(tx,set)=>{tx.objectStore('backings').index('videoId').getAll(videoId).onsuccess=e=>set(e.target.result.sort((a,b)=>b.createdAt-a.createdAt));}); },
      saveBacking(value) { return transaction(['backings'],'readwrite',tx=>{
        const store=tx.objectStore('backings');store.put(value);
        store.getAll().onsuccess=e=>{for(const old of e.target.result.sort((a,b)=>b.createdAt-a.createdAt).slice(8))store.delete(old.key);};
      }); },
      listTakes(videoId) { return transaction(['recordings'],'readonly',(tx,set)=>{tx.objectStore('recordings').index('videoId').getAll(videoId).onsuccess=e=>set(e.target.result.sort((a,b)=>b.createdAt-a.createdAt || b.id.localeCompare(a.id)));}); },
      saveTake(value) {
        return transaction(['recordings'],'readwrite',(tx,set)=>{
          const store=tx.objectStore('recordings'); store.put(value);
          store.index('segment').getAll([value.videoId,value.cueKey]).onsuccess=e=>{
            const takes=e.target.result.sort((a,b)=>b.createdAt-a.createdAt || b.id.localeCompare(a.id));
            for (const old of takes.slice(MAX_TAKES)) store.delete(old.id);
            set(takes.slice(0,MAX_TAKES));
          };
        });
      },
      deleteTake(id) { return transaction(['recordings'],'readwrite',tx=>tx.objectStore('recordings').delete(id)); },
      library() { return transaction(['sessions','recordings','backings'],'readonly',(tx,set)=>{
        const videos=new Map();let remaining=3;set([]);
        const item=id=>{if(!videos.has(id))videos.set(id,{videoId:id,title:'',updatedAt:0,recordings:0,recordingBytes:0,backings:0,backingBytes:0,start:0,activity:'speech'});return videos.get(id);};
        for(const name of ['sessions','recordings','backings']){
          tx.objectStore(name).openCursor().onsuccess=event=>{
            const cursor=event.target.result;
            if(!cursor){if(--remaining===0)set([...videos.values()].sort((a,b)=>b.updatedAt-a.updatedAt));return;}
            const value=cursor.value,row=item(value.videoId);
            if(name==='sessions'){row.title=value.title || '';row.start=value.start || 0;row.activity=value.activity || 'speech';row.hasSession=true;}
            else if(name==='recordings'){row.recordings++;row.recordingBytes+=value.blob?.size || 0;}
            else {row.backings++;row.backingBytes+=value.blob?.size || 0;}
            row.updatedAt=Math.max(row.updatedAt,Number(value.updatedAt || value.createdAt)||0);
            cursor.continue();
          };
        }
      }); },
      clearMedia(kind,videoId=null) {
        if(!['recordings','backings'].includes(kind))return Promise.reject(Error('无效的清理类型。'));
        return transaction([kind],'readwrite',tx=>{
          const store=tx.objectStore(kind);
          if(videoId===null){store.clear();return;}
          store.index('videoId').getAllKeys(videoId).onsuccess=event=>{for(const key of event.target.result)store.delete(key);};
        });
      }
    };
  }
  const api={createStorage,cueKey,MAX_TAKES};
  if (typeof module !== 'undefined') module.exports=api; else root.EchoStorage=api;
})(globalThis);
