// Fully procedural WebAudio engine — no sample files, nothing copyrighted.
// Ambient pad + evolving bass that reacts to global tension, plus UI/event SFX.
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.started = false;
    this.tension = 0;
    this.nextNote = 0;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    const conv = this.ctx.createConvolver();
    conv.buffer = this.makeReverb(2.6);
    this.reverb = this.ctx.createGain();
    this.reverb.gain.value = 0.25;
    this.reverb.connect(conv); conv.connect(this.master);
    this.applyVolumes();
    return this.ctx;
  }

  makeReverb(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.master;
    this.musicGain.gain.value = s.music;
    this.sfxGain.gain.value = s.sfx;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.started) return;
    this.resume();
    this.started = true;
    // Two detuned saw pads through a slow filter sweep = ambient bed.
    this.pad = ctx.createGain(); this.pad.gain.value = 0.0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 420; this.filter.Q.value = 3;
    this.pad.connect(this.filter);
    this.filter.connect(this.musicGain);
    this.filter.connect(this.reverb);
    this.oscs = [];
    for (const [f, d] of [[55, -6], [82.4, 5], [110, 0], [164.8, 8]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      const g = ctx.createGain(); g.gain.value = 0.08;
      o.connect(g); g.connect(this.pad);
      o.start(); this.oscs.push({ o, g, base: f });
    }
    this.pad.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4);
    this.tick = setInterval(() => this.musicTick(), 500);
  }

  stopMusic() {
    if (!this.started) return;
    clearInterval(this.tick);
    try { this.pad.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.2); } catch {}
    setTimeout(() => { this.oscs?.forEach(({ o }) => { try { o.stop(); } catch {} }); this.oscs = []; }, 1400);
    this.started = false;
  }

  /** tension 0..1 driven by infection share, alarm and cure progress. */
  setTension(v) {
    this.tension = Math.max(0, Math.min(1, v));
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(380 + this.tension * 1500, now, 2);
    this.oscs.forEach(({ o, base }, i) => {
      o.detune.setTargetAtTime((i % 2 ? 1 : -1) * (4 + this.tension * 22), now, 3);
      o.frequency.setTargetAtTime(base * (1 + this.tension * 0.01), now, 4);
    });
  }

  musicTick() {
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    if (now < this.nextNote) return;
    // sparse arpeggio, denser and higher when tense
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const root = 220 * (this.tension > 0.66 ? 1.5 : 1);
    const step = scale[Math.floor(Math.random() * scale.length)];
    const freq = root * Math.pow(2, step / 12);
    this.blip(freq, 0.9 + Math.random() * 1.4, 0.035 + this.tension * 0.03, 'sine', this.musicGain, true);
    this.nextNote = now + (3.2 - this.tension * 2.1) * (0.7 + Math.random() * 0.8);
  }

  blip(freq, dur, gain, type = 'sine', dest, verb = false) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(dest || this.sfxGain);
    if (verb) g.connect(this.reverb);
    const now = ctx.currentTime;
    g.gain.linearRampToValueAtTime(gain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now); o.stop(now + dur + 0.05);
  }

  noise(dur, gain, freq = 900) {
    const ctx = this.ensure(); if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start();
  }

  play(name) {
    if (!this.ctx && name !== 'click') this.ensure();
    if (!this.ctx) return;
    this.resume();
    switch (name) {
      case 'click': this.blip(520, 0.06, 0.12, 'square'); break;
      case 'hover': this.blip(880, 0.03, 0.03, 'sine'); break;
      case 'buy': this.blip(440, 0.12, 0.14, 'triangle'); setTimeout(() => this.blip(660, 0.18, 0.12, 'triangle'), 70); break;
      case 'deny': this.blip(150, 0.18, 0.14, 'sawtooth'); break;
      case 'notify': this.blip(700, 0.12, 0.09, 'sine', null, true); setTimeout(() => this.blip(1050, 0.2, 0.07, 'sine', null, true), 110); break;
      case 'alert': this.blip(330, 0.3, 0.13, 'square', null, true); setTimeout(() => this.blip(247, 0.4, 0.11, 'square', null, true), 180); break;
      case 'achievement':
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.35, 0.1, 'triangle', null, true), i * 90));
        break;
      case 'newCountry': this.blip(620, 0.14, 0.07, 'sine', null, true); break;
      case 'victory':
        [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.8, 0.12, 'sawtooth', null, true), i * 150));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 1.0, 0.12, 'sine', null, true), i * 220));
        break;
      case 'whoosh': this.noise(0.35, 0.05, 500); break;
      default: break;
    }
  }
}
