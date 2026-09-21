/**
 * Procedural audio engine — everything is synthesised at runtime with WebAudio.
 * No sample files, nothing copyrighted.
 *
 * Music is a four-layer adaptive bed driven by a single `tension` value (0..1):
 *   drone   — always present sub + fifth, the foundation
 *   pad     — filtered saw chord that follows a slow harmonic progression
 *   pulse   — rhythmic heartbeat, fades in with tension, tempo tracks tension
 *   lead    — sparse bell arpeggio, denser and higher when tense
 * Above ~0.75 tension the progression shifts to a darker mode.
 */

// Harmonic progressions as semitone offsets from the root.
const CALM_CHORDS = [[0, 7, 15, 19], [-3, 4, 12, 16], [-5, 2, 11, 14], [-3, 7, 12, 19]];
const TENSE_CHORDS = [[0, 6, 13, 18], [-1, 6, 11, 18], [-4, 3, 10, 15], [-2, 5, 11, 17]];
const ROOT = 55; // A1

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.started = false;
    this.tension = 0;
    this.chordIndex = 0;
    this.nextChord = 0;
    this.nextLead = 0;
    this.nextPulse = 0;
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

    // Shared reverb send.
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeReverb(3.4);
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.3;
    this.reverb.connect(this.convolver);
    this.convolver.connect(this.master);

    this.applyVolumes();
    return ctx;
  }

  makeReverb(sec) {
    const ctx = this.ctx, len = Math.max(1, Math.floor(ctx.sampleRate * sec));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // Slight early-reflection shaping then exponential decay.
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * (1 + 0.3 * Math.sin(t * 40));
      }
    }
    return buf;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const m = this.muted ? 0 : 1;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master * m, now, 0.05);
    this.musicGain.gain.setTargetAtTime(s.music, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfx, now, 0.05);
  }

  setMuted(v) { this.muted = !!v; this.applyVolumes(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  // ------------------------------------------------------------------ music
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.started) return;
    this.resume();
    this.started = true;
    const now = ctx.currentTime;

    // --- drone layer ---
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 240;
    this.droneGain.connect(this.droneFilter);
    this.droneFilter.connect(this.musicGain);
    this.drones = [];
    for (const [mult, type, gain] of [[1, 'sine', 0.5], [1.5, 'sine', 0.2], [2, 'triangle', 0.12]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = ROOT * mult;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g); g.connect(this.droneGain);
      o.start();
      this.drones.push({ o, g, mult });
    }
    this.droneGain.gain.linearRampToValueAtTime(0.5, now + 5);

    // --- pad layer ---
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 420;
    this.padFilter.Q.value = 2.5;
    this.padGain.connect(this.padFilter);
    this.padFilter.connect(this.musicGain);
    this.padFilter.connect(this.reverb);
    // A slow LFO on the filter keeps the bed from feeling static.
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.045;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 130;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.padFilter.frequency);
    this.lfo.start();

    this.padVoices = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sawtooth' : 'triangle';
      o.frequency.value = ROOT * 2;
      o.detune.value = (i % 2 ? 1 : -1) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.075;
      o.connect(g); g.connect(this.padGain);
      o.start();
      this.padVoices.push({ o, g });
    }
    this.padGain.gain.linearRampToValueAtTime(0.42, now + 7);

    this.applyChord(0);
    this.timer = setInterval(() => this.musicTick(), 180);
  }

  stopMusic() {
    if (!this.started || !this.ctx) return;
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    for (const g of [this.droneGain, this.padGain]) {
      try { g.gain.cancelScheduledValues(now); g.gain.linearRampToValueAtTime(0, now + 1.4); } catch {}
    }
    const voices = [...(this.drones || []), ...(this.padVoices || [])];
    setTimeout(() => {
      voices.forEach(({ o }) => { try { o.stop(); } catch {} });
      try { this.lfo.stop(); } catch {}
      this.drones = []; this.padVoices = [];
    }, 1700);
    this.started = false;
  }

  applyChord(index) {
    if (!this.ctx || !this.padVoices) return;
    const table = this.tension > 0.72 ? TENSE_CHORDS : CALM_CHORDS;
    const chord = table[index % table.length];
    const now = this.ctx.currentTime;
    this.padVoices.forEach((v, i) => {
      const semi = chord[i % chord.length];
      const freq = ROOT * 2 * Math.pow(2, semi / 12);
      v.o.frequency.setTargetAtTime(freq, now, 1.4);   // glide between chords
    });
    this.currentChord = chord;
  }

  setTension(v) {
    this.tension = Math.max(0, Math.min(1, v || 0));
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    const T = this.tension;
    // Brighter and more detuned as the world destabilises.
    this.padFilter.frequency.setTargetAtTime(400 + T * 1700, now, 2.5);
    this.droneFilter.frequency.setTargetAtTime(220 + T * 420, now, 2.5);
    this.padVoices?.forEach((v, i) => {
      v.o.detune.setTargetAtTime((i % 2 ? 1 : -1) * (5 + T * 26), now, 3);
    });
    this.drones?.forEach(({ o, mult }) => {
      o.frequency.setTargetAtTime(ROOT * mult * (1 + T * 0.006), now, 4);
    });
    this.reverb?.gain.setTargetAtTime(0.28 + T * 0.2, now, 3);
  }

  musicTick() {
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    const T = this.tension;

    if (now >= this.nextChord) {
      this.chordIndex = (this.chordIndex + 1) % 4;
      this.applyChord(this.chordIndex);
      this.nextChord = now + (14 - T * 5);
    }

    // Heartbeat pulse — only audible once things get serious.
    if (T > 0.18 && now >= this.nextPulse) {
      const bpm = 46 + T * 40;
      const beat = 60 / bpm;
      this.thump(0.10 + T * 0.13);
      setTimeout(() => this.thump(0.05 + T * 0.07), beat * 300);
      this.nextPulse = now + beat * 2;
    }

    // Sparse bell lead.
    if (now >= this.nextLead) {
      const chord = this.currentChord || CALM_CHORDS[0];
      const semi = chord[Math.floor(Math.random() * chord.length)] + (Math.random() < 0.3 ? 12 : 0);
      const freq = ROOT * 4 * Math.pow(2, semi / 12);
      this.bell(freq, 0.028 + T * 0.03);
      this.nextLead = now + (3.4 - T * 2.2) * (0.6 + Math.random());
    }
  }

  thump(gain) {
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(82, now);
    o.frequency.exponentialRampToValueAtTime(34, now + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    o.connect(g); g.connect(this.musicGain);
    o.start(now); o.stop(now + 0.5);
  }

  bell(freq, gain) {
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    // FM bell: a fast modulator on a sine carrier gives an inharmonic strike.
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 2.7;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 1.6, now);
    modGain.gain.exponentialRampToValueAtTime(1, now + 0.6);
    mod.connect(modGain); modGain.connect(carrier.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
    carrier.connect(g);
    g.connect(this.musicGain);
    g.connect(this.reverb);
    carrier.start(now); mod.start(now);
    carrier.stop(now + 2.8); mod.stop(now + 2.8);
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
    if (verb) g.connect(this.reverb);
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
