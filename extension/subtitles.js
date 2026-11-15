(function (root) {
  function time(value) {
    const parts = value.trim().replace(',', '.').split(':').map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some(n => !Number.isFinite(n) || n < 0)) return NaN;
    return parts.reduce((a, b) => a * 60 + b, 0);
  }
  function parse(text) {
    const cues = [];
    for (const block of text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = block.split('\n');
      const i = lines.findIndex(l => l.includes('-->'));
      if (i < 0) continue;
      const [left, right] = lines[i].split('-->');
      const start = time(left), end = time(right.trim().split(/\s/)[0]);
      const content = lines.slice(i + 1).join(' ').replace(/<[^>]*>/g, '').trim();
      if (Number.isFinite(start) && end > start && content) cues.push({ start, end, text: content });
    }
    return cues.sort((a, b) => a.start - b.start);
  }
  const api = { time, parse };
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoSubtitles = api;
})(globalThis);
