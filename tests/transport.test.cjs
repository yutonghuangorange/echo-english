const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, formatTime} = require('../extension/transport.js');

function fixture() {
  const frames = new Map(), errors = [];
  let next = 0;
  const slider = {value: 0, attrs: {}, setAttribute(key, value) {this.attrs[key] = value;}};
  const container = {}, label = {}, time = {};
  const view = create({container, slider, label, time, onError: error => errors.push(error),
    env: {
      requestAnimationFrame(fn) {frames.set(++next, fn); return next;},
      cancelAnimationFrame(id) {frames.delete(id);}
    }});
  return {view, frames, slider, container, label, time, errors};
}

test('display clamps invalid clocks and recording progress cannot seek', () => {
  const {view, slider, time, container} = fixture();
  view.show({label: '录音', position: () => 2.5, duration: () => 5});
  assert.equal(slider.value, 0.5);
  assert.equal(time.textContent, '0:02 / 0:05');
  assert.equal(slider.attrs['aria-valuetext'], time.textContent);
  assert.equal(slider.disabled, true);
  assert.equal(slider.oninput, null);
  view.show({label: '加载', position: () => NaN, duration: () => Infinity});
  assert.equal(slider.value, 0);
  assert.equal(time.textContent, '0:00 / 0:00');
  assert.equal(formatTime(-10), '0:00');
  view.hide(); assert.equal(container.hidden, true);
});

test('seeking uses the current media duration and reports an active failure', async () => {
  const {view, slider, errors} = fixture();
  let total = 10, sought;
  view.show({label: '回放', position: () => 0, duration: () => total,
    seekTo: at => {sought = at;}});
  total = 20; slider.value = '0.75'; await slider.oninput();
  assert.equal(sought, 15);
  const failure = Error('seek failed');
  view.show({label: '回放', position: () => 0, duration: () => 20, seekTo: () => {throw failure;}});
  await slider.oninput();
  assert.deepEqual(errors, [failure]);
});

test('old frames and rejected seeks cannot alter a later recording', async () => {
  const {view, slider, frames, errors, time} = fixture();
  let rejectSeek;
  view.show({label: '回放', position: () => 8, duration: () => 10,
    seekTo: () => new Promise((_, reject) => {rejectSeek = reject;})});
  const staleFrame = [...frames.values()][0], staleInput = slider.oninput;
  const seeking = staleInput();
  view.show({label: '录音', position: () => 1, duration: () => 30});
  staleFrame(); await staleInput(); rejectSeek(Error('old playback failed')); await seeking;
  assert.deepEqual(errors, []);
  assert.equal(slider.disabled, true);
  assert.equal(time.textContent, '0:01 / 0:30');
  assert.equal(frames.size, 1);
  view.hide(); assert.equal(frames.size, 0);
});

test('browser globals are available in manifest order with the unchanged panel controls', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const context = vm.createContext({});
  const scripts = require('../extension/manifest.json').content_scripts[0].js;
  for (const script of scripts) {
    if (script === 'content.js') break;
    vm.runInContext(fs.readFileSync(`extension/${script}`, 'utf8'), context);
  }
  assert.equal(typeof context.EchoTransport.create, 'function');
  assert.equal(typeof context.EchoPlayback.create, 'function');
  assert.match(context.EchoPanelView.html, /id="record"/);
  assert.match(context.EchoPanelView.html, /id="transportProgress"/);
});
