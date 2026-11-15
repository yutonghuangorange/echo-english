const { test } = require('node:test');
const assert = require('node:assert/strict');
const { timestamp, readRows, read } = require('../extension/transcript.js');

// Fixture represents the two transcript DOM layouts, including the exact
// timestamp / text classes observed on suXUsAVOSnY. Unsupported selectors fail.
function row(start, text, modern = true, hidden = false) {
  const stampClass = modern ? '.ytwTranscriptSegmentViewModelTimestamp' : '.segment-timestamp';
  const textClass = modern ? '.ytAttributedStringHost' : '.segment-text';
  return {
    closest: () => hidden ? {} : null,
    querySelector(selector) {
      const names = selector.split(',').map(s => s.trim());
      if (names.includes(stampClass)) return { textContent: start };
      if (names.includes(textClass)) return { textContent: text };
      return null;
    }
  };
}
function button(label, click) {
  return { textContent: label, getAttribute: () => label, disabled: false,
    closest: () => null, getClientRects: () => [{}], click };
}

test('reads current YouTube bilingual row and legacy rows without spoken timestamp labels', () => {
  const rows = [row('0:07', 'There is talk that your daughter 有傳言說你的女兒'), row('0:00', 'And just as I can be fired, the next CEO has to be hired.', false)];
  assert.deepEqual(readRows({ querySelectorAll: () => rows }, 1068), [
    {start:0,end:7,text:'And just as I can be fired, the next CEO has to be hired.'},
    {start:7,end:12,text:'There is talk that your daughter 有傳言說你的女兒'}
  ]);
});
test('excludes stale hidden panels, deduplicates rows and caps at video duration', () => {
  const rows = [row('0:00', 'stale', true, true), row('0:05', 'valid'), row('0:05', 'valid'), row('0:10', 'out of range')];
  assert.deepEqual(readRows({querySelectorAll: () => rows}, 8), [{start:5,end:8,text:'valid'}]);
  assert.ok(Number.isNaN(timestamp('7 seconds')));
  assert.ok(Number.isNaN(timestamp('0:99')));
  assert.equal(timestamp(' \u200e1:02:03.5\n'), 3723.5);
});
test('expands description, opens transcript once, waits for asynchronous row rendering', async () => {
  let expanded = false, opened = false, clicks = 0, tick = 0;
  const open = button('Show transcript', () => { opened = true; clicks++; });
  const expand = button('more', () => { expanded = true; });
  const doc = {
    querySelector: () => expand,
    querySelectorAll(selector) {
      if (selector.includes('transcript-segment')) return opened && tick >= 3 ? [row('0:00', 'Hello')] : [];
      return expanded ? [open] : [];
    }
  };
  const cues = await read({doc, duration:10, wait:async () => {tick++;}});
  assert.equal(expanded, true); assert.equal(clicks, 1);
  assert.equal(cues[0].text, 'Hello'); assert.ok(tick >= 5);
});
test('cancel during loading prevents importing stale video rows', async () => {
  let cancelled = false;
  const doc = {querySelectorAll: () => [], querySelector: () => null};
  const result = await read({doc, duration:10, cancelled:()=>cancelled, wait:async()=>{cancelled=true;}});
  assert.equal(result, null);
});
test('distinguishes missing entry from opened but unloaded transcript', async () => {
  const doc = {querySelectorAll: () => [], querySelector: () => null};
  await assert.rejects(read({doc, duration:10, attempts:2, wait:async()=>{}}), /未找到可读取的文字记录/);
  const open = button('顯示文字記錄', () => {});
  doc.querySelectorAll = selector => selector.includes('transcript-segment') ? [] : [open];
  await assert.rejects(read({doc, duration:10, attempts:2, wait:async()=>{}}), /文字记录已打开/);
});
