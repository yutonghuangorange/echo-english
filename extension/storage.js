(function(root) {
  const MAX_TAKES = 3;
  function cueKey(cue, start, end) {
    return cue ? (cue.key || `cue:${Number(cue.start).toFixed(3)}:${cue.text}`) : `manual:${Number(start).toFixed(2)}:${Number(end).toFixed(2)}`;
  }
  function createStorage(factory = root.indexedDB, name = 'echo-dubbing-v1') {
    const ready = new Promise((resolve,reject) => {
      const request = factory.open(name,2);
      request.onupgradeneeded = () => {
        const db = request.result, tx = request.transaction;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions',{keyPath:'videoId'});
        const recordings = db.objectStoreNames.contains('recordings') ? tx.objectStore('recordings') : db.createObjectStore('recordings',{keyPath:'id'});
        if (!recordings.indexNames.contains('videoId')) recordings.createIndex('videoId','videoId');
        if (!recordings.indexNames.contains('segment')) recordings.createIndex('segment',['videoId','cueKey']);
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
      deleteTake(id) { return transaction(['recordings'],'readwrite',tx=>tx.objectStore('recordings').delete(id)); }
    };
  }
  const api={createStorage,cueKey,MAX_TAKES};
  if (typeof module !== 'undefined') module.exports=api; else root.EchoStorage=api;
})(globalThis);
