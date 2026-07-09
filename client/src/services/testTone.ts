/**
 * Play a short pre-flight test tone that sweeps left -> right, so a listener can
 * confirm — before starting — that sound comes out, the volume is up, and stereo
 * works (the whole point of a spatial-audio walk). Creates a throwaway
 * AudioContext from the click gesture and closes it when the tone ends.
 */
export function playTestTone(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();

      // iOS: route to the playback session so it's audible through the speaker even
      // when the ring/silent switch is set to silent (matches the real engine).
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      void ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      const dur = 1.9;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(460, now + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.15);
      gain.gain.setValueAtTime(0.25, now + dur - 0.35);
      gain.gain.linearRampToValueAtTime(0, now + dur);

      osc.connect(gain);
      let tail: AudioNode = gain;
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(-1, now);
        panner.pan.linearRampToValueAtTime(1, now + dur);
        gain.connect(panner);
        tail = panner;
      }
      tail.connect(ctx.destination);

      osc.onended = () => {
        void ctx.close().catch(() => {});
        resolve();
      };
      osc.start(now);
      osc.stop(now + dur + 0.05);
    } catch {
      resolve();
    }
  });
}
