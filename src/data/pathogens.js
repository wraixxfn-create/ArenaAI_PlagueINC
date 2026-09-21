// Pathogen archetypes. Purely data-driven — add new entries plus locale keys
// ("pathogen.<id>.name" / "pathogen.<id>.desc" / "pathogen.<id>.trait") to extend.
export const PATHOGENS = [
  {
    id: 'strand',            // Viral analogue
    color: '#4fc3f7',
    difficulty: 1,
    base: { air: 0.16, water: 0.08, food: 0.06, vector: 0.04, contact: 0.18, environ: 0.05,
            infectivity: 1.22, severity: 0.4, lethality: 0.0, stealth: 0.1, cureResist: 0.0,
            drugResist: 0.0, recoveryResist: 0.0, mutationRate: 1.0 },
    env: { cold: 0.35, heat: 0.35, humid: 0.45, arid: 0.35 },
    costMul: { transmission: 1.0, adaptation: 1.0, symptom: 0.9, ability: 1.0 },
    // special: passive drift gives free mutations, but cure research is fast
    special: { mutationDrift: 1.0, cureSpeed: 1.1, dpRate: 1.08 },
    unlocked: true,
  },
  {
    id: 'bacilla',           // Bacterial analogue
    color: '#9ccc65',
    difficulty: 2,
    base: { air: 0.08, water: 0.16, food: 0.16, vector: 0.06, contact: 0.14, environ: 0.12,
            infectivity: 0.95, severity: 0.5, lethality: 0.0, stealth: 0.12, cureResist: 0.05,
            drugResist: 0.15, recoveryResist: 0.05, mutationRate: 0.7 },
    env: { cold: 0.4, heat: 0.4, humid: 0.4, arid: 0.5 },
    costMul: { transmission: 1.0, adaptation: 0.85, symptom: 1.0, ability: 1.05 },
    special: { mutationDrift: 0.6, cureSpeed: 1.0, dpRate: 1.0, drugResistGrowth: 0.0012 },
    unlocked: true,
  },
  {
    id: 'helmyx',            // Parasitic analogue
    color: '#ffb74d',
    difficulty: 3,
    base: { air: 0.02, water: 0.14, food: 0.14, vector: 0.24, contact: 0.08, environ: 0.1,
            infectivity: 0.8, severity: 0.25, lethality: 0.0, stealth: 0.35, cureResist: 0.1,
            drugResist: 0.05, recoveryResist: 0.25, mutationRate: 0.5 },
    env: { cold: 0.2, heat: 0.6, humid: 0.6, arid: 0.3 },
    costMul: { transmission: 1.1, adaptation: 1.0, symptom: 1.15, ability: 0.9 },
    // low visibility, but slow burn: less DP from raw infections, more from countries reached
    special: { mutationDrift: 0.4, cureSpeed: 0.85, dpRate: 0.85, countryBonus: 2.0, lowSeverityGrowth: 0.25 },
    unlocked: true,
  },
  {
    id: 'mycora',            // Fungal analogue
    color: '#ba9cd6',
    difficulty: 3,
    base: { air: 0.1, water: 0.08, food: 0.08, vector: 0.04, contact: 0.1, environ: 0.26,
            infectivity: 0.75, severity: 0.35, lethality: 0.0, stealth: 0.28, cureResist: 0.08,
            drugResist: 0.2, recoveryResist: 0.1, mutationRate: 0.6 },
    env: { cold: 0.5, heat: 0.3, humid: 0.7, arid: 0.2 },
    costMul: { transmission: 1.05, adaptation: 0.8, symptom: 1.0, ability: 1.0 },
    // sporecast: periodic free long-range seeding
    special: { mutationDrift: 0.5, cureSpeed: 0.92, dpRate: 1.0, sporeBurst: { interval: 14, strength: 1.0 } },
    unlocked: true,
  },
  {
    id: 'nanoform',          // Synthetic analogue
    color: '#4dd0e1',
    difficulty: 4,
    base: { air: 0.08, water: 0.08, food: 0.05, vector: 0.02, contact: 0.12, environ: 0.14,
            infectivity: 0.78, severity: 0.3, lethality: 0.0, stealth: 0.2, cureResist: 0.25,
            drugResist: 0.35, recoveryResist: 0.3, mutationRate: 0.0 },
    env: { cold: 0.6, heat: 0.6, humid: 0.4, arid: 0.55 },
    costMul: { transmission: 1.15, adaptation: 0.9, symptom: 1.1, ability: 0.85 },
    // never mutates randomly; scales with wealth/urbanisation; detected fast once noticed
    special: { mutationDrift: 0, cureSpeed: 2.0, dpRate: 1.0, techAffinity: 0.45, detectionSpike: 1.4 },
    unlocked: true,
  },
  {
    id: 'kryon',             // Prion-like fictional pathogen
    color: '#ef9a9a',
    difficulty: 5,
    base: { air: 0.0, water: 0.02, food: 0.06, vector: 0.01, contact: 0.035, environ: 0.07,
            infectivity: 0.34, severity: 0.1, lethality: 0.0, stealth: 0.55, cureResist: 0.45,
            drugResist: 0.5, recoveryResist: 0.9, mutationRate: 0.2 },
    env: { cold: 0.8, heat: 0.5, humid: 0.4, arid: 0.6 },
    costMul: { transmission: 1.25, adaptation: 0.95, symptom: 1.25, ability: 1.0 },
    // almost no recovery, extremely hard to cure, but crawls; incubation makes deaths delayed
    special: { mutationDrift: 0.15, cureSpeed: 1.15, dpRate: 0.55, incubation: 0.35, noRecovery: true },
    unlocked: true,
  },
];

export const PATHOGEN_BY_ID = Object.fromEntries(PATHOGENS.map((p) => [p.id, p]));
