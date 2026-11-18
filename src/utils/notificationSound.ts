let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {});
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Short two-tone chime, synthesized so no audio asset needs to be bundled/hosted.
export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [[880, now, 0.14], [660, now + 0.12, 0.16]].forEach(([freq, start, duration]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  } catch {
    // Autoplay can be blocked until the user interacts with the page at least once — safe to ignore.
  }
}
