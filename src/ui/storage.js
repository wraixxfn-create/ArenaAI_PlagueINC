// Persistence: settings, save slots, lifetime profile (achievements + records).
const PREFIX = 'vz.';
const SETTINGS_KEY = `${PREFIX}settings`;
const PROFILE_KEY = `${PREFIX}profile`;
const SLOT_KEY = (n) => `${PREFIX}slot.${n}`;
export const SLOT_COUNT = 5;      // slot 0 is the autosave

export const DEFAULT_SETTINGS = {
  lang: null,                  // null → detect from browser on first run
  defaultSpeed: 1,
  notifications: true,
  autopause: false,
  quality: 'high',
  animations: true,
  mapEffects: true,
  uiScale: 1,
  master: 0.8,
  music: 0.22,
  musicEnabled: true,
  showIntro: true,
  sfx: 0.7,
  textSize: 1,
  colorblind: false,
  patterns: false,
  reduceMotion: false,
};

const read = (k, fb) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
  if (!s.lang) {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    s.lang = nav === 'it' ? 'it' : 'en';
  }
  return s;
}
export function saveSettings(s) { return write(SETTINGS_KEY, s); }

export const DEFAULT_PROFILE = {
  achievements: {},       // id -> timestamp
  gamesPlayed: 0,
  gamesWon: 0,
  bestDay: null,
  mostInfected: 0,
  byPathogen: {},
};
export function loadProfile() { return { ...DEFAULT_PROFILE, ...read(PROFILE_KEY, {}) }; }
export function saveProfile(p) { return write(PROFILE_KEY, p); }

export function listSlots() {
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const raw = read(SLOT_KEY(i), null);
    out.push(raw ? { index: i, meta: raw.meta } : { index: i, meta: null });
  }
  return out;
}
export function writeSlot(i, payload) { return write(SLOT_KEY(i), payload); }
export function readSlot(i) { return read(SLOT_KEY(i), null); }
export function deleteSlot(i) { try { localStorage.removeItem(SLOT_KEY(i)); return true; } catch { return false; } }
export function hasAnySave() { return listSlots().some((s) => s.meta); }
export function latestSave() {
  const s = listSlots().filter((x) => x.meta).sort((a, b) => b.meta.time - a.meta.time);
  return s[0] || null;
}
