/** Quiet, non-rhythmic containment ambience; optional, with independent SFX.
 * Four sine voices, slow gain changes. No scheduler, reverb, heartbeat or lead.
 */
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.started = false;
    this.tension = 0;
    this.musicRequested = false;
    this.hidden = false;
    this.muted = false;
  }

  // ------------------------------------------------------------------ setup
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { this.ctx = new AC(); } catch { return null; }
    const ctx = this.ctx;

    this.master = ctx.createGain();
    // A limiter keeps stacked layers from clipping when everything peaks at once.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.22;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);

    // Effects share the SFX volume bus; no wet signal can bypass its slider.
    this.reverb = this.sfxGain;
    this.applyVolumes();
    return ctx;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const m = this.muted ? 0 : 1;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master * m, now, 0.05);
    this.musicGain.gain.setTargetAtTime(s.music, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfx, now, 0.05);
    if (this.musicRequested) this.syncMusic();
  }

  setMuted(v) { this.muted = !!v; this.applyVolumes(); }
  resume() { if (!this.hidden && this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {}); }
  setHidden(hidden) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) this.ctx?.suspend?.().catch(() => {});
    else this.resume();
  }

  // Music is explicitly requested by the game; sliders may stop/start it.
  startMusic() {
    this.musicRequested = true;
    if (!this.settings.musicEnabled || this.settings.music <= 0 || this.settings.master <= 0) return;
    if (!this.ensure()) return;
    this.resume();
    this.syncMusic();
  }

  syncMusic() {
    const enabled = this.musicRequested && this.settings.musicEnabled && this.settings.music > 0 && this.settings.master > 0;
    if (!enabled) { this.releaseVoices(); return; }
    if (this.started || !this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.started = true;
    this.voices = [55, 82.4069, 110, 164.8138].map((frequency, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = frequency;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.16 : 0.055, now + 4);
      o.connect(g); g.connect(this.musicGain); o.start();
      return { o, g };
    });
  }

  releaseVoices() {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    // Capture each old node; restarting cannot stop the new generation.
    for (const {o,g} of this.voices) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.08);
      o.onended = () => { o.disconnect(); g.disconnect(); };
      o.stop(now + 0.4);
    }
    this.voices = [];
    this.started = false;
  }

  stopMusic() { this.musicRequested = false; this.releaseVoices(); }

  setTension(v) {
    const next = Math.max(0, Math.min(1, v || 0));
    if (Math.abs(next-this.tension) < 0.025) return;
    this.tension = next;
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.voices.forEach(({g},i) => {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime((i === 0 ? 0.16 : 0.055) * (1 + next*0.18), now, 3);
    });
  }

  // -------------------------------------------------------------------- sfx
  tone(freq, dur, gain, type = 'sine', { verb = false, sweep = 0, delay = 0 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    this.resume();
    const now = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(this.sfxGain);

    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(now); o.stop(now + dur + 0.05);
  }

  noise(dur, gain, freq = 900, q = 1, sweepTo = null) {
    const ctx = this.ensure(); if (!ctx) return;
    this.resume();
    const now = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, now + dur);
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    src.start(now);
  }

  arp(freqs, step, dur, gain, type = 'triangle', verb = true) {
    freqs.forEach((f, i) => this.tone(f, dur, gain, type, { verb, delay: i * step }));
  }

  play(name) {
    if (!this.settings || this.settings.sfx <= 0) return;
    if (!this.ensure()) return;
    switch (name) {
      case 'click': this.tone(660, 0.05, 0.10, 'square', { sweep: 0.8 }); break;
      case 'hover': this.tone(1180, 0.025, 0.022, 'sine'); break;
      case 'back': this.tone(420, 0.07, 0.09, 'square', { sweep: 0.7 }); break;
      case 'buy': this.arp([523, 784, 1047], 0.055, 0.22, 0.10); break;
      case 'deny': this.tone(180, 0.1, 0.11, 'sawtooth'); this.tone(140, 0.18, 0.1, 'sawtooth', { delay: 0.08 }); break;
      case 'notify': this.arp([784, 1175], 0.09, 0.26, 0.07, 'sine'); break;
      case 'alert':
        this.tone(415, 0.28, 0.11, 'square', { verb: true });
        this.tone(311, 0.38, 0.1, 'square', { verb: true, delay: 0.18 });
        break;
      case 'achievement': this.arp([523, 659, 784, 1047, 1319], 0.085, 0.5, 0.085); break;
      case 'newCountry': this.tone(880, 0.13, 0.055, 'sine', { verb: true }); this.tone(1320, 0.2, 0.035, 'sine', { verb: true, delay: 0.06 }); break;
      case 'detected': this.tone(600, 0.14, 0.08, 'triangle', { verb: true }); this.tone(450, 0.3, 0.07, 'triangle', { verb: true, delay: 0.1 }); break;
      case 'mutation': this.tone(300, 0.5, 0.07, 'sawtooth', { sweep: 2.2, verb: true }); break;
      case 'ability': this.noise(0.4, 0.07, 400, 1.2, 2600); this.tone(180, 0.5, 0.09, 'sawtooth', { sweep: 3, verb: true }); break;
      case 'victory': this.arp([392, 523, 659, 784, 1047, 1319], 0.16, 1.1, 0.1, 'sawtooth'); break;
      case 'defeat': this.arp([392, 330, 262, 196, 131], 0.24, 1.3, 0.1, 'sine'); break;
      case 'whoosh': this.noise(0.4, 0.05, 300, 0.7, 1800); break;
      case 'pause': this.tone(520, 0.09, 0.07, 'sine', { sweep: 0.65 }); break;
      case 'resume': this.tone(390, 0.09, 0.07, 'sine', { sweep: 1.45 }); break;
      case 'tick': this.tone(1500, 0.015, 0.02, 'square'); break;
      default: break;
    }
  }
}
