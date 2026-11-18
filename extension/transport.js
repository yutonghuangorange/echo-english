// A progress view only: media clocks and seek behavior are supplied by callers.
(function(root) {
  function seconds(value) { return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0; }
  function formatTime(value) {
    const whole = Math.floor(seconds(value));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function create({container, slider, label, time, onError, env = root}) {
    let frame = 0, revision = 0;

    function hide() {
      ++revision;
      env.cancelAnimationFrame(frame);
      frame = 0;
      container.hidden = true;
      slider.disabled = true;
      slider.oninput = null;
    }

    function show({label: text, position, duration, seekTo = null}) {
      hide();
      const current = revision;
      container.hidden = false;
      label.textContent = text;
      slider.disabled = !seekTo;
      slider.setAttribute('aria-label', seekTo ? '播放进度，可点击或拖动跳转' : text==='录音'?'录音进度':'播放进度');
      slider.title = seekTo ? '点击或拖动跳转' : text==='录音'?'录音中，仅显示进度':'仅显示播放进度';
      slider.oninput = seekTo ? async () => {
        if (current !== revision) return;
        const ratio = Math.min(1, seconds(slider.value));
        try {
          await seekTo(ratio * seconds(duration()));
        } catch (error) {
          // A rejected seek from an old playback must not stop a new recording.
          if (current === revision) onError(error);
        }
      } : null;

      function tick() {
        if (current !== revision) return;
        const total = seconds(duration());
        const elapsed = Math.min(total, seconds(position()));
        slider.value = total > 0 ? elapsed / total : 0;
        time.textContent = `${formatTime(elapsed)} / ${formatTime(total)}`;
        slider.setAttribute('aria-valuetext', time.textContent);
        frame = env.requestAnimationFrame(tick);
      }
      tick();
    }

    hide();
    return {show, hide};
  }
  const api = {create, formatTime};
  if (typeof module !== 'undefined') module.exports = api;
  else root.EchoTransport = api;
})(globalThis);
