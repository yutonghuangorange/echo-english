const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildRows,selections,preview}=require('../extension/assembly.js');
const api=require('../extension/audio-export.js');
const voice=(id,start,end,createdAt,extra={})=>({id,start,end,createdAt,cueKey:id,kind:'song',capture:'vocal',speed:1,...extra});
test('editor splits overlaps, offers every available version, and preserves explicit choices',()=>{
  const takes=[voice('old',0,10,1,{cueKey:'same'}),voice('new',0,10,2,{cueKey:'same'}),voice('middle',3,6,3)];
  const rows=buildRows(takes,12,[],api);
  assert.deepEqual(rows.map(r=>[r.start,r.end,r.autoId]),[[0,3,'new'],[3,6,'middle'],[6,10,'new'],[10,12,null]]);
  assert.deepEqual(rows[1].candidates.map(t=>t.id),['middle','new','old']);
  const saved=[{start:0,end:10,choice:'old',enabled:true},{start:10,end:12,choice:'auto',enabled:false}];
  assert.deepEqual(selections(buildRows(takes,12,saved,api)).map(s=>s.takeId),['old','old','old',null]);
  assert.deepEqual(preview(takes,12,saved,api).segments.map(s=>[s.start,s.end,s.take.id]),[[0,10,'old']]);
  assert.deepEqual(selections(buildRows(takes.filter(t=>t.id!=='old'),12,saved,api)).map(s=>s.takeId),['new','middle','new',null]);
});
test('disabled choices stay excluded across newly added boundaries, and slow takes cannot enter export',()=>{
  const takes=[voice('all',0,10,1),voice('part',3,6,2),voice('slow',0,10,3,{speed:.75})];
  const rows=buildRows(takes,10,[{start:0,end:10,choice:'auto',enabled:false}],api);
  assert(selections(rows).every(s=>s.takeId===null));
  assert(rows.every(r=>r.candidates.every(t=>t.id!=='slow')));
  assert.throws(()=>buildRows([takes[2]],10,[],api),/1×/);
});
