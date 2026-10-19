/* Tiny synthesized sound effects (no audio files). KY.sfx.play('tap'). */
(function (root) {
  const KY = root.KY;
  let ac = null;

  function ctx() {
    if (ac) return ac;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC(); } catch (e) { ac = null; }
    return ac;
  }

  function tone(c, { f = 440, f2 = null, type = 'sine', t0 = 0, dur = 0.12, vol = 0.18 }) {
    const o = c.createOscillator();
    const g = c.createGain();
    const now = c.currentTime + t0;
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(c.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function noise(c, { t0 = 0, dur = 0.08, vol = 0.25, lp = 900 }) {
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    f.type = 'lowpass';
    f.frequency.value = lp;
    g.gain.value = vol;
    s.buffer = buf;
    s.connect(f).connect(g).connect(c.destination);
    s.start(c.currentTime + t0);
  }

  const SOUNDS = {
    tap: c => tone(c, { f: 880, f2: 660, type: 'triangle', dur: 0.06, vol: 0.12 }),
    pick: c => tone(c, { f: 520, f2: 780, type: 'triangle', dur: 0.08, vol: 0.12 }),
    drop: c => tone(c, { f: 420, f2: 260, type: 'triangle', dur: 0.1, vol: 0.14 }),
    tick: c => tone(c, { f: 1500, type: 'square', dur: 0.025, vol: 0.04 }),
    pop: c => tone(c, { f: 660, f2: 990, type: 'sine', dur: 0.09, vol: 0.12 }),
    stamp: c => { noise(c, { dur: 0.12, vol: 0.5, lp: 500 }); tone(c, { f: 90, f2: 50, type: 'sine', dur: 0.18, vol: 0.5 }); },
    great: c => { tone(c, { f: 784, dur: 0.12 }); tone(c, { f: 988, t0: 0.09, dur: 0.12 }); tone(c, { f: 1319, t0: 0.18, dur: 0.24 }); },
    ok: c => { tone(c, { f: 660, dur: 0.12 }); tone(c, { f: 622, t0: 0.12, dur: 0.2 }); },
    ky: c => { tone(c, { f: 220, f2: 140, type: 'sawtooth', dur: 0.32, vol: 0.12 }); },
    ring: c => { for (let i = 0; i < 6; i++) tone(c, { f: i % 2 ? 1180 : 980, type: 'square', t0: i * 0.05, dur: 0.045, vol: 0.05 }); },
  };

  KY.sfx = {
    enabled: true,
    play(name) {
      if (!this.enabled || !SOUNDS[name]) return;
      const c = ctx();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      try { SOUNDS[name](c); } catch (e) { /* audio is optional */ }
    },
    /* Read a Japanese phrase aloud with the device's ja-JP voice, if any. */
    speak(text) {
      const synth = root.speechSynthesis;
      if (!synth || !root.SpeechSynthesisUtterance) return false;
      synth.cancel();
      const u = new root.SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.9;
      const ja = synth.getVoices().find(v => /^ja/i.test(v.lang));
      if (ja) u.voice = ja;
      synth.speak(u);
      return true;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
