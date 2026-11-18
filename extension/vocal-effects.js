(function(root) {
  const presets = {ktv: {seconds: 1.2, preDelay: 0.018}, theatre: {seconds: 2.6, preDelay: 0.035}};

  function normalize(value = {}) {
    const number = (input, fallback) => Number.isFinite(Number(input)) ? Number(input) : fallback;
    return {
      delayMs: Math.round(Math.max(-2000, Math.min(2000, number(value?.delayMs, 0)))),
      reverb: Object.hasOwn(presets, value?.reverb) ? value.reverb : 'off',
      amount: Math.max(0, Math.min(1, number(value?.amount, 0.25)))
    };
  }

  function enabled(value) {
    const effects = normalize(value);
    return effects.delayMs !== 0 || (effects.reverb !== 'off' && effects.amount > 0);
  }

  // A seeded stereo impulse keeps repeated previews and exports identical.
  function impulse(context, preset) {
    const {seconds, preDelay} = presets[preset];
    const length = Math.ceil(seconds * context.sampleRate);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let seed = 731 + channel * 151;
      for (let i = Math.round(preDelay * context.sampleRate); i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = (seed / 2147483648 - 1) * Math.exp(-7 * i / length);
      }
    }
    return buffer;
  }

  async function process(buffer, value, env = root) {
    const effects = normalize(value);
    if (!enabled(effects)) return buffer;
    const context = new env.OfflineAudioContext(2, buffer.length, buffer.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    if (effects.reverb !== 'off' && effects.amount > 0) {
      const reverb = context.createConvolver();
      reverb.buffer = impulse(context, effects.reverb);
      const wet = context.createGain();
      wet.gain.value = effects.amount;
      source.connect(reverb);
      reverb.connect(wet);
      wet.connect(context.destination);
    }
    const offset = Math.max(0, -effects.delayMs / 1000);
    if (offset < buffer.duration) source.start(Math.max(0, effects.delayMs / 1000), offset);
    const rendered = await context.startRendering();
    // Normalize before playback and mixing to keep the vocal/backing ratio consistent.
    let peak = 1;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      for (const sample of rendered.getChannelData(c)) peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 1) for (let c = 0; c < rendered.numberOfChannels; c++) {
      const data = rendered.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] /= peak;
    }
    return rendered;
  }

  function wav(buffer) {
    const channels = buffer.numberOfChannels;
    const bytes = new ArrayBuffer(44 + buffer.length * channels * 2);
    const view = new DataView(bytes);
    const text = (offset, value) => {for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));};
    text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true);
    text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
    const data = Array.from({length: channels}, (_, c) => buffer.getChannelData(c));
    let peak = 1;
    for (const channel of data) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
      const sample = data[c][i] / peak;
      view.setInt16(44 + (i * channels + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    return new Blob([bytes], {type: 'audio/wav'});
  }

  async function renderTake(take, env = root) {
    const context = new env.AudioContext();
    try {
      const decoded = await context.decodeAudioData(await take.blob.arrayBuffer());
      return await process(decoded, take.effects, env);
    } finally {await context.close();}
  }

  async function preview(take, env = root) {
    if (take.capture !== 'vocal' || take.withBacking || !enabled(take.effects)) return take.blob;
    return wav(await renderTake(take, env));
  }

  const api = {normalize, enabled, impulse, process, wav, renderTake, preview};
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoVocalEffects = api;
})(globalThis);
