// The station chime: two soft notes, made on the spot with the Web Audio API (no sound files, nothing fetched).
// It plays only when someone has switched it on in Settings → Appearance.
let ctx = null;

export function chime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + 0.02;
    // a falling major third, like a station announcement's opening tone
    for (const [freq, delay] of [[659.25, 0], [523.25, 0.17]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.11, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.65);
    }
  } catch {
    // no audio device, or the browser declined: saving never depends on sound
  }
}
