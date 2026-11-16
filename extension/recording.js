// Own one capture's microphone, gain graph, monitor, meter and encoder.
// UI state, video timing and persistence belong to the calling coordinator.
(function(root) {
  function create({constraints, gainDb, quality, active, createMonitor, createMeter, onComplete, onError, microphone = root.EchoMicrophone, env = root}) {
    const options = microphone.recordingOptions(quality, env.MediaRecorder);
    let mic, input, monitor, meter, recorder, info;
    let stopping = false, settled = false, released = false;
    const chunks = [];
    let resolve, reject;
    const completed = new Promise((done, fail) => { resolve = done; reject = fail; });
    // Cancellation or a setup error may finish before the caller awaits it.
    completed.catch(() => {});
    const available = () => !stopping && !settled && active();
    const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());

    function pauseFeedback() {
      meter?.dispose(); meter = null;
      monitor?.pause();
    }
    function release() {
      if (released) return;
      released = true;
      meter?.dispose(); meter = null;
      monitor?.dispose();
      input?.dispose();
      stopTracks(mic);
    }
    function finish() {
      if (settled) return;
      settled = true;
      const blob = new env.Blob(chunks, {type: recorder?.mimeType || options.mimeType || ''});
      const result = blob.size ? {blob, recordingInfo: info, inputGainDb: input.db} : null;
      release();
      Promise.resolve().then(() => onComplete(result)).then(() => resolve(!!result), reject);
    }
    async function prepare() {
      try {
        const acquired = await env.navigator.mediaDevices.getUserMedia({audio: constraints, video: false});
        if (!available()) { stopTracks(acquired); stop(); return false; }
        mic = acquired;
        const processed = await microphone.createInput(mic, gainDb);
        if (!available()) { processed.dispose(); stop(); return false; }
        input = processed;
        const accompaniment = createMonitor ? await createMonitor() : null;
        if (!available()) { accompaniment?.dispose(); stop(); return false; }
        monitor = accompaniment;
        recorder = new env.MediaRecorder(input.stream, options);
        if (quality === 'lossless' && !microphone.isLossless(recorder.mimeType)) throw Error('浏览器未启用无损 PCM，已取消录音。请改选高品质压缩。');
        info = {quality, mimeType: recorder.mimeType || options.mimeType || '', audioBitsPerSecond: recorder.audioBitsPerSecond || null,
          microphone: microphone.captureSettings(mic), encodingInput: microphone.captureSettings(input.stream)};
        recorder.ondataavailable = event => { if (!settled && event.data.size) chunks.push(event.data); };
        recorder.onstop = finish;
        recorder.onerror = () => { if (settled || stopping) return; onError(Error('录音失败，请检查麦克风后重试。')); stop(); };
        return true;
      } catch (error) { finish(); throw error; }
    }
    function stop() {
      if (stopping || settled) return completed;
      stopping = true;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch (error) { finish(); onError(error); }
      } else finish();
      return completed;
    }
    return {
      prepare, stop, completed, pauseFeedback,
      get state() { return recorder?.state || 'inactive'; },
      get monitor() { return monitor; },
      start() { if (!available()) return false; recorder.start(250); return true; },
      startMeter() { if (available() && !meter) meter = createMeter(input.stream); },
      setVolume(value) { monitor?.setVolume?.(value); },
      pause() { monitor?.pause(); if (recorder?.state === 'recording') { recorder.pause(); meter?.setPaused(true); } },
      resume() { if (available() && recorder?.state === 'paused') { recorder.resume(); meter?.setPaused(false); } }
    };
  }
  const api = {create};
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoRecording = api;
})(globalThis);
