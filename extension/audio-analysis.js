(function(root) {
  // RMS indicates energy and pauses, not pronunciation correctness.
  function analyze(samples, sampleRate, frameMs = 20) {
    if (!samples.length || !(sampleRate > 0)) return { duration:0, rms:[], peaks:[], pauses:[], threshold:0, silent:true };
    const size = Math.max(1, Math.round(sampleRate * frameMs / 1000));
    const rms = [], peaks = [];
    for (let start = 0; start < samples.length; start += size) {
      let sum = 0, peak = 0;
      const end = Math.min(samples.length, start + size);
      for (let i = start; i < end; i++) { sum += samples[i] * samples[i]; peak = Math.max(peak, Math.abs(samples[i])); }
      rms.push(Math.sqrt(sum / (end - start))); peaks.push(peak);
    }
    const max = Math.max(...rms), threshold = Math.max(0.003, max * 0.08);
    const duration = samples.length / sampleRate, frameSec = size / sampleRate;
    const pauses = []; let begin = null;
    for (let i = 0; i <= rms.length; i++) {
      if (i < rms.length && rms[i] < threshold) { if (begin === null) begin = i * frameSec; }
      else if (begin !== null) {
        const end = Math.min(duration, i * frameSec);
        if (end - begin >= 0.4 - 1e-9) pauses.push({start:begin,end});
        begin = null;
      }
    }
    return { duration, rms, peaks, pauses, threshold, silent: max < 0.003 };
  }
  const api = { analyze };
  if (typeof module !== 'undefined') module.exports = api; else root.EchoAudioAnalysis = api;
})(globalThis);
