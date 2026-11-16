const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {createRelay,jsonCues}=require('../extension/caption-tracks.js');
const id='-aMdBA00Ijc',sender={tab:{url:`https://www.youtube.com/watch?v=${id}`},frameId:0};
const track=(code,extra={})=>({baseUrl:`https://www.youtube.com/api/timedtext?v=${id}&lang=${code}&fmt=srv3`,languageCode:code,vssId:'.'+code,name:{simpleText:code},...extra});
const response=data=>({ok:true,headers:{get:()=>null},async text(){return JSON.stringify(data);}});
test('relay reads exact script variants, replaces format and exposes no signed URLs',async()=>{
  const calls=[];
  const relay=createRelay({fetcher:async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/player'))return response({videoDetails:{videoId:id},captions:{playerCaptionsTracklistRenderer:{captionTracks:[track('zh-Hans'),track('zh-Hant'),track('en',{kind:'asr'}),track('x',{baseUrl:'https://evil.example/api/timedtext?v='+id})]}}});
    assert.equal(new URL(url).searchParams.getAll('fmt').join(','),'json3');
    assert.equal(new URL(url).searchParams.get('lang'),'zh-Hant');
    return response({events:[{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'測試'},{utf8:'字幕'}]}]});
  }});
  const list=await relay.request({action:'list',videoId:id},sender);
  assert.equal(list.tracks.length,3);assert.equal(list.tracks[2].generated,true);assert(!JSON.stringify(list).includes('baseUrl'));assert(!JSON.stringify(list).includes('timedtext'));
  const result=await relay.request({action:'read',videoId:id,trackId:'.zh-Hant',duration:3},sender);
  assert.deepEqual(result.cues,[{start:1,end:3,text:'測試字幕'}]);assert.equal(calls.length,2);
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[1].options.redirect,'error');
});
test('relay rejects other origins, stale videos, subframes, arbitrary actions and missing tracks',async()=>{
  let calls=0;const relay=createRelay({fetcher:async()=>{calls++;return response({videoDetails:{videoId:id}});}});
  for(const s of [{tab:{url:'https://evil.example/watch?v='+id}},{tab:{url:'https://www.youtube.com/watch?v=xxxxxxxxxxx'}},{...sender,frameId:1}])await assert.rejects(relay.request({action:'list',videoId:id},s),/视频已切换/);
  await assert.rejects(relay.request({action:'fetch',videoId:id},sender),/无效/);assert.equal(calls,0);
  await assert.rejects(relay.request({action:'read',videoId:id,trackId:'.en',duration:10},sender),/所选字幕已不可用/);
});
test('failed metadata is not cached and an empty selected track never becomes another language',async()=>{
  let calls=0;
  const relay=createRelay({fetcher:async url=>{calls++;if(calls===1)return response({videoDetails:{videoId:'xxxxxxxxxxx'}});if(url.includes('/player'))return response({videoDetails:{videoId:id},captions:{playerCaptionsTracklistRenderer:{captionTracks:[track('en')]}}});return {ok:true,async text(){return '';}};}});
  await assert.rejects(relay.request({action:'list',videoId:id},sender),/所属视频/);
  await relay.request({action:'list',videoId:id},sender);
  await assert.rejects(relay.request({action:'read',videoId:id,trackId:'.en',duration:10},sender),/空字幕/);assert.equal(calls,3);
  assert.deepEqual(jsonCues({events:[{tStartMs:-1,dDurationMs:1000,segs:[{utf8:'bad'}]},{tStartMs:0,dDurationMs:1000},{tStartMs:1000,dDurationMs:2000,segs:[{utf8:'a\nb'}]}]},2),[{start:1,end:2,text:'a b'}]);
});
test('current-track bridge only reports public caption identity for the current video',()=>{
  const listeners={},results=[];
  const document={addEventListener:(name,fn)=>listeners[name]=fn,getElementById:()=>({getVideoData:()=>({video_id:id}),getOption:()=>({languageCode:'zh-Hant',vssId:'.zh-Hant'})}),dispatchEvent:event=>results.push(event.detail)};
  vm.runInNewContext(fs.readFileSync('extension/caption-current.js','utf8'),{document,location:{href:sender.tab.url},URL,CustomEvent:class{constructor(type,{detail}){this.detail=detail;}}});
  listeners['echo-caption-current']({detail:{videoId:'wrong',requestId:'a'}});assert.equal(results.length,0);
  listeners['echo-caption-current']({detail:{videoId:id,requestId:'b'}});assert.equal(results[0].track.language,'zh-Hant');assert.equal(results[0].requestId,'b');
});
