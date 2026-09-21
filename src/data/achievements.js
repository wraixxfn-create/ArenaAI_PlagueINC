// Data-driven achievements. `check(state, meta)` runs on victory/defeat and periodically.
export const ACHIEVEMENTS = [
  { id: 'firstBlood', icon: '◉', check: (s) => s.global.totalInfected >= 1000 },
  { id: 'sixContinents', icon: '◈', check: (s, m) => m.continentsInfected >= 6 },
  { id: 'globalGrip', icon: '◍', check: (s) => s.global.infectedShare >= 0.5 },
  { id: 'perfectSweep', icon: '★', check: (s, m) => m.won && m.healthyRemaining === 0 },
  { id: 'ghostRun', icon: '☾', check: (s, m) => m.won && s.global.detectedDay > 120 },
  { id: 'speedrun', icon: '⚡', check: (s, m) => m.won && s.day <= 240 },
  { id: 'brutalist', icon: '☠', check: (s, m) => m.won && m.difficulty === 'brutal' },
  { id: 'purist', icon: '❍', check: (s, m) => m.won && m.categoriesUsed && !m.categoriesUsed.has('ability') },
  { id: 'asceticSymptoms', icon: '◇', check: (s, m) => m.won && m.symptomsBought <= 3 },
  { id: 'kryonMaster', icon: '✦', check: (s, m) => m.won && m.pathogen === 'kryon' },
  { id: 'nanoLord', icon: '⬡', check: (s, m) => m.won && m.pathogen === 'nanoform' },
  { id: 'islandHopper', icon: '⛰', check: (s, m) => m.won && m.scenario === 'isolated' },
  { id: 'lateRally', icon: '◐', check: (s, m) => m.won && s.research.progress >= 0.95 },
  { id: 'coldBlooded', icon: '❄', check: (s, m) => m.won && m.infectedPolar },
  { id: 'efficient', icon: '∞', check: (s, m) => m.won && m.epSpent <= 220 },
  { id: 'centurion', icon: '⊞', check: (s, m) => m.gamesPlayed >= 10 },
];
export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
