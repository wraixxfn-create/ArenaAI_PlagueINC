// Condition-driven world events. Each has a `when(ctx)` gate and an `apply(ctx)`
// that mutates the simulation — no purely-flavour events.
// ctx = { state, rng, world, D (difficulty mods), countries, helpers }
export const EVENTS = [
  {
    id: 'firstDetection', once: true, weight: 100, severity: 'alert',
    when: (s) => s.global.detected && !s.flags.firstDetection,
    apply: (s) => { s.flags.firstDetection = true; s.global.awareness = Math.max(s.global.awareness, 0.08); },
    args: (s) => ({ country: s.global.detectedIn }),
  },
  {
    id: 'emergencyDeclared', once: true, weight: 90, severity: 'alert',
    when: (s) => s.global.awareness > 0.3 && !s.flags.emergency,
    apply: (s) => { s.flags.emergency = true; s.global.responseBoost += 0.15; s.global.researchRate *= 1.1; },
  },
  {
    id: 'travelCut', weight: 40, cooldown: 30, severity: 'alert',
    when: (s) => s.global.awareness > 0.35 && s.global.airFactor > 0.35,
    apply: (s, rng) => { s.global.airFactor *= 0.82 - 0.05 * rng.next(); },
  },
  {
    id: 'hospitalOverload', weight: 45, cooldown: 25, severity: 'warn',
    when: (s, _r, ctx) => ctx.someCountry((c) => c.infected / Math.max(1, c.pop) > 0.18 && c.strain > 0.7),
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry((c) => c.infected / Math.max(1, c.pop) > 0.18);
      if (!c) return null;
      c.healthMod *= 0.7; c.strain = 1;
      return { country: c.id };
    },
  },
  {
    id: 'publicPanic', weight: 35, cooldown: 30, severity: 'warn',
    when: (s) => s.global.awareness > 0.5,
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry((c) => c.infected > 0);
      if (!c) return null;
      c.mobility = Math.min(1.6, c.mobility * 1.25); // panic movement spreads it internally
      c.response = Math.min(1, c.response + 0.1);
      return { country: c.id };
    },
  },
  {
    id: 'breakthrough', weight: 30, cooldown: 40, severity: 'bad',
    when: (s) => s.research.progress > 0.12,
    apply: (s, rng) => { s.research.progress = Math.min(1, s.research.progress + 0.03 + rng.next() * 0.03); },
  },
  {
    id: 'fundingRow', weight: 28, cooldown: 40, severity: 'good',
    when: (s) => s.research.progress > 0.1 && s.research.progress < 0.9,
    apply: (s, rng) => { s.research.progress = Math.max(0, s.research.progress - (0.02 + rng.next() * 0.04)); s.research.rateMod *= 0.92; },
  },
  {
    id: 'labAccident', weight: 18, cooldown: 60, severity: 'good',
    when: (s) => s.research.progress > 0.3,
    apply: (s, rng) => { s.research.progress = Math.max(0, s.research.progress - (0.05 + rng.next() * 0.05)); },
  },
  {
    id: 'freightDisruption', weight: 25, cooldown: 35, severity: 'warn',
    when: (s) => s.global.awareness > 0.25,
    apply: (s, rng) => { s.global.seaFactor *= 0.85; s.global.economy *= 0.97; },
  },
  {
    id: 'spontaneousMutation', weight: 34, cooldown: 12, severity: 'neutral',
    when: (s) => s.global.totalInfected > 5000 && s.pathogen.mutationRate > 0,
    apply: (s, rng, ctx) => ctx.randomMutation(),
  },
  {
    id: 'containmentWin', weight: 22, cooldown: 30, severity: 'bad',
    when: (s, _r, ctx) => ctx.someCountry((c) => c.infected > 0 && c.infected / Math.max(1, c.pop) < 0.02 && c.response > 0.5),
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry((c) => c.infected > 0 && c.infected / Math.max(1, c.pop) < 0.02 && c.response > 0.5);
      if (!c) return null;
      c.infected *= 0.35; c.contained = Math.min(1, c.contained + 0.25);
      return { country: c.id };
    },
  },
  {
    id: 'heatwave', weight: 20, cooldown: 45, severity: 'neutral',
    when: () => true,
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry(() => true);
      if (!c) return null;
      c.heatShift = 0.22; c.shiftDays = 30;
      return { country: c.id };
    },
  },
  {
    id: 'coldsnap', weight: 20, cooldown: 45, severity: 'neutral',
    when: () => true,
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry(() => true);
      if (!c) return null;
      c.heatShift = -0.22; c.shiftDays = 30;
      return { country: c.id };
    },
  },
  {
    id: 'aidConvoy', weight: 22, cooldown: 40, severity: 'bad',
    when: (s) => s.global.awareness > 0.4,
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry((c) => c.health < 0.4 && c.infected > 0);
      if (!c) return null;
      c.healthMod = Math.min(1.8, c.healthMod * 1.35);
      return { country: c.id };
    },
  },
  {
    id: 'borderReopen', weight: 16, cooldown: 55, severity: 'good',
    when: (s) => s.global.airFactor < 0.6,
    apply: (s) => { s.global.airFactor = Math.min(1, s.global.airFactor * 1.25); s.global.economyPressure = true; },
  },
  {
    id: 'vaccineTrial', weight: 20, cooldown: 50, severity: 'bad',
    when: (s) => s.research.progress > 0.5,
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry((c) => c.health > 0.6);
      if (!c) return null;
      c.treated = Math.min(0.6, c.treated + 0.15);
      return { country: c.id };
    },
  },
  {
    id: 'misinformation', weight: 24, cooldown: 35, severity: 'good',
    when: (s) => s.global.awareness > 0.2,
    apply: (s) => { s.global.awareness = Math.max(0, s.global.awareness - 0.06); s.global.responseBoost = Math.max(-0.3, s.global.responseBoost - 0.08); },
  },
  {
    id: 'zoonoticJump', weight: 14, cooldown: 60, severity: 'good',
    when: (s) => s.pathogen.stats.vector > 0.2,
    apply: (s, rng, ctx) => {
      const c = ctx.pickCountry((c) => c.infected === 0 && c.pop > 0);
      if (!c) return null;
      ctx.seed(c, Math.max(2, Math.floor(c.pop * 0.0000008)));
      return { country: c.id };
    },
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
