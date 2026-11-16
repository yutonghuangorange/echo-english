(function(root){
  function plan(takes,duration){
    if(!Number.isFinite(duration) || duration<=0 || duration>600)throw Error('合成范围需在 10 分钟内。');
    const latest=new Map();
    for(const take of takes.filter(t=>t.capture==='vocal' && !t.withBacking && t.kind==='song')){
      const key=take.cueKey || `${take.start}:${take.end}`,previous=latest.get(key);
      if(!previous || take.createdAt>previous.createdAt || take.createdAt===previous.createdAt && take.id.localeCompare(previous.id)>0)latest.set(key,take);
    }
    const voices=[...latest.values()];
    if(!voices.length)throw Error('还没有可合成的独立人声。旧版混合录音无法单独提取人声，请重新录唱。');
    const ranges=voices.map(t=>({take:t,start:Math.max(0,t.start),end:Math.min(duration,Number.isFinite(t.capturedEnd)?t.capturedEnd:t.end)})).filter(t=>t.end>t.start);
    const points=[...new Set([0,duration,...ranges.flatMap(t=>[t.start,t.end]).filter(t=>t>=0 && t<=duration)])].sort((a,b)=>a-b);
    const segments=[],gaps=[];
    for(let i=0;i<points.length-1;i++){
      const start=points[i],end=points[i+1];
      const chosen=ranges.filter(t=>t.start<=start && t.end>=end).sort((a,b)=>b.take.createdAt-a.take.createdAt || b.take.id.localeCompare(a.take.id))[0];
      const target=chosen?segments:gaps,last=target.at(-1);
      if(last && last.end===start && (!chosen || last.take.id===chosen.take.id))last.end=end;
      else target.push({start,end,...(chosen?{take:chosen.take}:{})});
    }
    if(segments.some(s=>s.take.speed!==1))throw Error('合成下载暂支持 1× 录唱；其他速度仍可下载原始人声。');
    return {segments,gaps,duration};
  }
  async function render({takes,duration,origin=0,backing=null,volume=1,vocalVolume=1,sampleRate=44100,active=()=>true},env=root){
    const timeline=plan(takes.map(t=>({...t,start:t.start-origin,end:t.end-origin,...(Number.isFinite(t.capturedEnd)?{capturedEnd:t.capturedEnd-origin}:{})})),duration);
    if(backing && (backing.start>origin+0.001 || backing.end<origin+duration-0.001))throw Error('需要覆盖整个下载范围的伴奏，请先生成整首伴奏。');
    if(!timeline.segments.length)throw Error('此范围内没有已录人声。');
    const length=Math.ceil(duration*sampleRate),channels=[new Float32Array(length),new Float32Array(length)];
    const context=new env.AudioContext({sampleRate});
    const check=()=>{if(!active())throw Error('已取消合成。');};
    const pause=()=>new Promise(resolve=>env.setTimeout(resolve,0));
    async function add(buffer,start,end,offset,gain){
      const from=Math.round(start*sampleRate),to=Math.min(length,Math.round(end*sampleRate));
      for(let block=from;block<to;block+=262144){
        check();const stop=Math.min(to,block+262144);
        for(let c=0;c<2;c++){
          const data=buffer.getChannelData(Math.min(c,buffer.numberOfChannels-1));
          for(let i=block;i<stop;i++){
            const position=(offset+(i-from)/sampleRate)*buffer.sampleRate,index=Math.floor(position),fraction=position-index;
            if(index>=0 && index<data.length)channels[c][i]+=((data[index] || 0)*(1-fraction)+(data[Math.min(index+1,data.length-1)] || 0)*fraction)*gain;
          }
        }
        await pause();
      }
    }
    try{
      for(const take of new Map(timeline.segments.map(s=>[s.take.id,s.take])).values()){
        check();const decoded=await context.decodeAudioData(await take.blob.arrayBuffer());check();
        for(const segment of timeline.segments.filter(s=>s.take.id===take.id))await add(decoded,segment.start,segment.end,segment.start-take.start+(take.vocalOffset || 0),Math.max(0,Math.min(2,vocalVolume)));
      }
      if(backing){
        check();const decoded=await context.decodeAudioData(await backing.blob.arrayBuffer());check();
        await add(decoded,0,duration,origin-backing.start,Math.max(0,Math.min(2,volume)));
      }
      check();
      let peak=1;for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(channels[0][i]),Math.abs(channels[1][i]));
      const bytes=new ArrayBuffer(44+length*4),view=new DataView(bytes);
      const text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
      text(0,'RIFF');view.setUint32(4,36+length*4,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*4,true);
      for(let block=0;block<length;block+=262144){
        check();for(let i=block;i<Math.min(length,block+262144);i++)for(let c=0;c<2;c++){const n=channels[c][i]/peak;view.setInt16(44+(i*2+c)*2,Math.round(n*(n<0?32768:32767)),true);}
        await pause();
      }
      return {blob:new Blob([bytes],{type:'audio/wav'}),gaps:timeline.gaps};
    }finally{await context.close().catch(()=>{});}
  }
  const api={plan,render};if(typeof module!=='undefined')module.exports=api;else root.EchoAudioExport=api;
})(globalThis);
