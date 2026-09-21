// Data-driven scenarios. Modifiers multiply (or add to) simulation constants.
export const DIFFICULTIES = [
  { id: 'easy', mods: { researchSpeed: 0.7, detection: 0.75, healthcare: 0.85, dpRate: 1.25, response: 0.75, borderSpeed: 0.7, eventSeverity: 0.8, transmission: 1.1 } },
  { id: 'normal', mods: { researchSpeed: 1.0, detection: 1.0, healthcare: 1.0, dpRate: 1.0, response: 1.0, borderSpeed: 1.0, eventSeverity: 1.0, transmission: 1.0 } },
  { id: 'hard', mods: { researchSpeed: 1.5, detection: 1.35, healthcare: 1.25, dpRate: 0.78, response: 1.35, borderSpeed: 1.35, eventSeverity: 1.2, transmission: 0.88 } },
  { id: 'brutal', mods: { researchSpeed: 2.2, detection: 1.8, healthcare: 1.5, dpRate: 0.6, response: 1.8, borderSpeed: 1.75, eventSeverity: 1.5, transmission: 0.75 } },
];
export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

export const SCENARIOS = [
  {
    id: 'global',
    icon: 'globe',
    objective: { type: 'infectAll' },       // infect everyone before a cure lands
    world: {},
    startPool: null,                         // any country
  },
  {
    id: 'isolated',
    icon: 'island',
    objective: { type: 'infectAll' },
    world: { airTraffic: 0.75, seaTraffic: 0.85 },
    startPool: ['isl', 'nzl', 'mdg', 'grl', 'fji', 'png', 'aus', 'jpn', 'cub', 'phl'],
  },
  {
    id: 'fastresponse',
    icon: 'siren',
    objective: { type: 'infectAll' },
    world: { detection: 2.2, researchSpeed: 1.3, borderSpeed: 1.5, initialAwareness: 0.15 },
  },
  {
    id: 'fragile',
    icon: 'cross',
    objective: { type: 'killShare', value: 0.15 },   // collapse: 15% mortality
    world: { healthcare: 0.45, researchSpeed: 0.8, economy: 0.75, eventSeverity: 1.2, lethality: 2.2 },
  },
  {
    id: 'extreme',
    icon: 'thermo',
    objective: { type: 'infectAll' },
    world: { climateSwing: 1.0, envPenalty: 1.6 },   // env mismatch hurts far more
  },
  {
    id: 'mutation',
    icon: 'dna',
    objective: { type: 'infectAll' },
    world: { mutationRate: 3.5, mutationChaos: 1.0, dpRate: 1.1 },
  },
  {
    id: 'blitz',
    icon: 'clock',
    objective: { type: 'infectShareByDay', value: 0.85, day: 365 },  // time-limited
    world: { researchSpeed: 1.1, airTraffic: 1.2 },
  },
  {
    id: 'custom',
    icon: 'sliders',
    objective: { type: 'infectAll' },
    world: {},
    custom: true,
  },
];
export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
