const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, time } = require('../extension/subtitles.js');
test('parses SRT hours, decimals, multiline and CRLF', () => {
  assert.deepEqual(parse('\uFEFF1\r\n01:02:03,450 --> 01:02:05,000\r\nHello\r\nworld\r\n'), [{start:3723.45,end:3725,text:'Hello world'}]);
});
test('parses WebVTT identifiers and cue settings without retaining markup', () => {
  assert.deepEqual(parse('WEBVTT\n\nintro\n00:01.500 --> 00:03.000 align:start\n<v Speaker>Hello <b>there</b>\n'), [{start:1.5,end:3,text:'Hello there'}]);
});
test('rejects invalid ranges and sorts subtitles', () => {
  assert.deepEqual(parse('00:05 --> 00:07\nlater\n\n00:03 --> 00:02\nbad\n\nxx --> 00:04\nbad\n\n00:01 --> 00:02\nfirst').map(c=>c.text), ['first','later']);
  assert.ok(Number.isNaN(time('unknown')));
});
