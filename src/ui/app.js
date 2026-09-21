// Application shell: global state, screen router, game clock, persistence glue.
import { Simulation } from '../engine/simulation.js';
import { hashSeed } from '../engine/rng.js';
import { t, setLang, getLang, onLangChange } from '../i18n/index.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { PATHOGEN_BY_ID } from '../data/pathogens.js';
import * as store from './storage.js';
import { AudioEngine } from './audio.js';
import { toast, clear } from './util.js';

export const SPEEDS = [0, 1, 2, 4, 8];
const TICK_BASE_MS = 900;      // ms per simulated day at 1x
const AUTOSAVE_DAYS = 20;

class App {
  constructor() {
    this.settings = store.loadSettings();
    this.profile = store.loadProfile();
    this.audio = new AudioEngine(this.settings);
    this.sim = null;
    this.speedIndex = 1;
    this.screen = null;
    this.screens = {};
    this.acc = 0;
    this.lastFrame = performance.now();
    this.renderAcc = 0;
    this.renderElapsed = 0;
    this.lastAutosaveDay = 0;
    this.listeners = new Set();
    setLang(this.settings.lang);
    this.applySettings();
    document.addEventListener('visibilitychange', () => {
      this.acc = this.renderAcc = this.renderElapsed = 0; this.lastFrame = performance.now();
      this.audio.setHidden(document.hidden);
    });
    onLangChange(() => this.rerender());
  }

  register(name, factory) { this.screens[name] = factory; }

  go(name, params) {
    this.view?.destroy?.();
    this.view = null;
    this.acc = 0;
    this.currentScreen = name;
    this.currentParams = params;
    const root = document.getElementById('root');
    clear(root);
    const factory = this.screens[name];
    if (!factory) { root.textContent = t('ui.error'); return; }
    this.view = factory(this, params);
    root.appendChild(this.view.node);
    this.audio.play('whoosh');
    if (this.view.mounted) this.view.mounted();
  }

  rerender() {
    if (this.currentScreen) {
      const scrollTarget = this.view?.preserve?.();
      this.go(this.currentScreen, this.currentParams);
      if (scrollTarget && this.view?.restore) this.view.restore(scrollTarget);
    }
  }

  // ------------------------------------------------------------- settings
  applySettings() {
    const s = this.settings;
    const r = document.documentElement;
    r.style.setProperty('--ui-scale', s.uiScale);
    r.style.setProperty('--text-scale', s.textSize);
    r.classList.toggle('reduce-motion', !!s.reduceMotion || !s.animations);
    r.classList.toggle('cb', !!s.colorblind);
    this.audio.settings = s;
    this.audio.applyVolumes();
  }
  saveSettings() { store.saveSettings(this.settings); this.applySettings(); }

  setLanguage(code) {
    this.settings.lang = code;
    this.saveSettings();
    setLang(code);           // triggers rerender through onLangChange
  }

  // ------------------------------------------------------------ game flow
  newGame(cfg) {
    const seed = cfg.seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9));
    this.sim = new Simulation({
      seed: typeof seed === 'string' ? hashSeed(seed) : seed,
      pathogenId: cfg.pathogenId,
      startCountry: cfg.startCountry,
      difficulty: cfg.difficulty || 'normal',
      scenarioId: cfg.scenarioId || 'global',
      worldOverrides: cfg.worldOverrides || null,
      name: cfg.name || null,
    });
    this.acc = 0;
    this.speedIndex = 0;      // start paused so the player can plan
    this.lastAutosaveDay = 0;
    this.seenLog = 0;
    this.profile.gamesPlayed++;
    store.saveProfile(this.profile);
    this.audio.startMusic();
    this.go('game');
    if (this.settings.showIntro) this.view?.showIntro?.();
  }

  loadGame(slot) {
    const raw = store.readSlot(slot);
    if (!raw || !raw.sim) { toast(t('save.error'), 'bad'); return false; }
    try {
      this.sim = Simulation.deserialize(raw.sim);
      this.speedIndex = 0;
      this.lastAutosaveDay = this.sim.day;
      this.seenLog = this.sim.log.length;
      this.audio.startMusic();
      this.go('game');
      toast(t('save.loaded'), 'good');
      return true;
    } catch (e) {
      console.error(e);
      toast(t('save.error'), 'bad');
      return false;
    }
  }

  saveGame(slot) {
    if (!this.sim) return false;
    const sim = this.sim;
    const payload = {
      meta: {
        time: Date.now(), day: sim.day,
        pathogen: `pathogen.${sim.pathogenDef.id}.name`,
        scenario: `scenario.${sim.scenario.id}.name`,
        difficulty: `diff.${sim.cfg.difficulty}`,
        infected: Math.round(sim.global.totalInfected || 0),
        lang: getLang(),
      },
      sim: sim.serialize(),
    };
    const ok = store.writeSlot(slot, payload);
    if (ok && slot !== 0) toast(t('save.saved'), 'good');
    return ok;
  }

  quitToMenu() {
    this.setSpeed(0);
    this.sim = null;
    this.audio.stopMusic();
    this.go('menu');
  }

  setSpeed(i) {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.acc = 0;
    this.emit('speed');
  }
  togglePause() { this.setSpeed(this.speedIndex === 0 ? 1 : 0); }
  get speed() { return SPEEDS[this.speedIndex]; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind) { this.listeners.forEach((f) => f(kind)); }

  // --------------------------------------------------------------- clock
  startLoop() {
    if (this.loopStarted) return;
    this.loopStarted = true;
    const frame = (now) => {
      const dt = Math.min(200, now - this.lastFrame);
      this.lastFrame = now;
      if (document.hidden) {
        this.acc = 0; this.renderAcc = this.renderElapsed = 0;
        this.audio.setHidden(true);
        requestAnimationFrame(frame);
        return;
      }
      this.audio.setHidden(false);
      if (this.currentScreen === 'game' && this.sim && !this.sim.finished && this.speed > 0) {
        this.acc += dt * this.speed;
        let steps = 0;
        while (this.acc >= TICK_BASE_MS && steps < 4) {
          this.acc -= TICK_BASE_MS;
          this.tickOnce();
          steps++;
          if (this.sim.finished || this.speed === 0) break;
        }
        if (steps >= 4) this.acc = 0;        // never freeze the UI
      }
      // Presentation is independent from simulation speed. At most 30 Hz (20
      // on low quality); the map itself skips work when nothing has changed.
      this.renderAcc += dt;
      this.renderElapsed += dt;
      const interval = this.settings.quality === 'low' ? 50 : 1000 / 30;
      if (this.renderAcc >= interval) {
        this.view?.frame?.(this.renderElapsed);
        this.renderElapsed = 0;
        this.renderAcc %= interval;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  tickOnce() {
    const sim = this.sim;
    const before = sim.log.length;
    sim.step();
    // react to new log entries: sound, map pulses, autopause
    for (let i = before; i < sim.log.length; i++) {
      const entry = sim.log[i];
      if (entry.key === 'log.newCountry') {
        this.audio.play('newCountry');
        // from/mode let the map draw the actual transmission beam (air/sea/land/spore)
        this.view?.pulse?.(entry.args.country, 'infect', entry.args.from, entry.args.mode);
      } else if (entry.key === 'log.detected') {
        this.audio.play('alert');
        this.view?.pulse?.(entry.args.country, 'detect');
      } else if (entry.key.startsWith('event.')) {
        this.audio.play('notify');
        if (this.settings.autopause && (entry.severity === 'alert' || entry.severity === 'bad')) this.setSpeed(0);
      }
    }
    // tension → music
    const tension = Math.min(1, sim.global.infectedShare * 0.5 + sim.research.progress * 0.6 + sim.global.awareness * 0.2);
    this.audio.setTension(tension);

    this.checkAchievements();

    if (sim.day - this.lastAutosaveDay >= AUTOSAVE_DAYS) {
      this.lastAutosaveDay = sim.day;
      this.saveGame(0);
      this.view?.autosaveBlip?.();
    }
    if (sim.finished) this.onFinish();
  }

  onFinish() {
    const sim = this.sim;
    this.setSpeed(0);
    const m = sim.metrics();
    if (m.won) {
      this.profile.gamesWon++;
      if (!this.profile.bestDay || sim.day < this.profile.bestDay) this.profile.bestDay = sim.day;
    }
    this.profile.mostInfected = Math.max(this.profile.mostInfected, Math.round(sim.global.totalInfected));
    const pk = sim.pathogenDef.id;
    this.profile.byPathogen[pk] = this.profile.byPathogen[pk] || { played: 0, won: 0 };
    this.profile.byPathogen[pk].played++;
    if (m.won) this.profile.byPathogen[pk].won++;
    store.saveProfile(this.profile);
    this.checkAchievements(true);
    this.audio.play(m.won ? 'victory' : 'defeat');
    this.saveGame(0);
    this.view?.showEnd?.();
  }

  checkAchievements(final = false) {
    if (!this.sim) return;
    const meta = { ...this.sim.metrics(), gamesPlayed: this.profile.gamesPlayed };
    for (const a of ACHIEVEMENTS) {
      if (this.profile.achievements[a.id]) continue;
      let ok = false;
      try { ok = !!a.check(this.sim, meta); } catch { ok = false; }
      if (!ok) continue;
      if (!final && meta.won === false && String(a.check).includes('m.won')) continue;
      this.profile.achievements[a.id] = Date.now();
      store.saveProfile(this.profile);
      this.audio.play('achievement');
      toast(t('ach.unlockedToast', { name: t(`ach.${a.id}.name`) }), 'good');
    }
  }

  pathogenName(id) { return t(`pathogen.${id}.name`); }
  get pathogenList() { return Object.values(PATHOGEN_BY_ID); }
}

export const app = new App();
export { store };
