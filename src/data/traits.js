// Evolution tree definition for VECTOR ZERO.
// Every trait is pure data; the simulation only reads `effects`.
//
// Effect keys (all additive unless noted; applied on top of pathogen base stats):
//   air, water, food, vector, contact, environ   → transmission channel strengths
//   urbanAff, ruralAff                           → affinity for dense / sparse populations
//   cold, heat, humid, arid                      → environmental resistance (0..~1.6)
//   severity                                     → symptom pressure (drives awareness + response)
//   lethality                                    → deaths per infected per day scale
//   infectivity                                  → flat multiplier on internal growth
//   stealth                                      → reduces detection accrual (0..0.9)
//   cureResist                                   → multiplies required research work
//   drugResist                                   → blunts healthcare suppression
//   recoveryResist                               → slows recoveries
//   dpBonus                                      → extra DNA-point income per day
//   seaTravel, airTravel, landTravel             → cross-border channel multipliers
//
// `req` = prerequisite trait ids (ALL required). `cost` is in evolution points (EP),
// scaled at runtime by pathogen + difficulty. `tier` drives cost inflation over time.
// `x`,`y` position the node in the tree canvas (per-category local grid).

export const TRAIT_CATEGORIES = [
  { id: 'transmission', key: 'cat.transmission', color: '#49b6e8', icon: 'wave' },
  { id: 'adaptation', key: 'cat.adaptation', color: '#63c98b', icon: 'leaf' },
  { id: 'symptom', key: 'cat.symptom', color: '#e8705a', icon: 'pulse' },
  { id: 'ability', key: 'cat.ability', color: '#c78ae8', icon: 'spark' },
];

export const TRAITS = [
  // ============ TRANSMISSION ============
  { id: 'aerosol1', cat: 'transmission', tier: 1, cost: 7, x: 0, y: 0, req: [], effects: { air: 0.22, severity: 0.2 } },
  { id: 'aerosol2', cat: 'transmission', tier: 2, cost: 16, x: 0, y: 1, req: ['aerosol1'], effects: { air: 0.34, severity: 0.4 } },
  { id: 'aerosol3', cat: 'transmission', tier: 3, cost: 30, x: 0, y: 2, req: ['aerosol2'], effects: { air: 0.5, severity: 0.7, airTravel: 0.25 } },
  { id: 'droplet', cat: 'transmission', tier: 2, cost: 14, x: 1, y: 1, req: ['aerosol1'], effects: { air: 0.16, contact: 0.18, urbanAff: 0.12 } },
  { id: 'hydro1', cat: 'transmission', tier: 1, cost: 7, x: 2, y: 0, req: [], effects: { water: 0.22, severity: 0.15 } },
  { id: 'hydro2', cat: 'transmission', tier: 2, cost: 16, x: 2, y: 1, req: ['hydro1'], effects: { water: 0.34, seaTravel: 0.2 } },
  { id: 'hydro3', cat: 'transmission', tier: 3, cost: 29, x: 2, y: 2, req: ['hydro2'], effects: { water: 0.5, seaTravel: 0.35, ruralAff: 0.1 } },
  { id: 'trophic1', cat: 'transmission', tier: 1, cost: 8, x: 3, y: 0, req: [], effects: { food: 0.24, severity: 0.1 } },
  { id: 'trophic2', cat: 'transmission', tier: 2, cost: 18, x: 3, y: 1, req: ['trophic1'], effects: { food: 0.38, ruralAff: 0.14 } },
  { id: 'coldchain', cat: 'transmission', tier: 3, cost: 32, x: 3, y: 2, req: ['trophic2'], effects: { food: 0.3, seaTravel: 0.25, cold: 0.2 } },
  { id: 'dermal1', cat: 'transmission', tier: 1, cost: 6, x: 4, y: 0, req: [], effects: { contact: 0.26 } },
  { id: 'dermal2', cat: 'transmission', tier: 2, cost: 15, x: 4, y: 1, req: ['dermal1'], effects: { contact: 0.4, urbanAff: 0.1 } },
  { id: 'fomite', cat: 'transmission', tier: 2, cost: 17, x: 5, y: 1, req: ['dermal1'], effects: { environ: 0.28, contact: 0.1, stealth: 0.05 } },
  { id: 'swarm1', cat: 'transmission', tier: 1, cost: 9, x: 6, y: 0, req: [], effects: { vector: 0.26, ruralAff: 0.12 } },
  { id: 'swarm2', cat: 'transmission', tier: 2, cost: 20, x: 6, y: 1, req: ['swarm1'], effects: { vector: 0.4, humid: 0.15 } },
  { id: 'reservoir', cat: 'transmission', tier: 3, cost: 34, x: 6, y: 2, req: ['swarm2'], effects: { vector: 0.34, environ: 0.2, stealth: 0.08 } },
  { id: 'tarmac', cat: 'transmission', tier: 3, cost: 26, x: 1, y: 2, req: ['droplet'], effects: { airTravel: 0.55, urbanAff: 0.08 } },
  { id: 'bilge', cat: 'transmission', tier: 3, cost: 24, x: 5, y: 2, req: ['fomite'], effects: { seaTravel: 0.5, environ: 0.1 } },
  { id: 'overland', cat: 'transmission', tier: 2, cost: 18, x: 4, y: 2, req: ['dermal2'], effects: { landTravel: 0.6 } },
  { id: 'megacity', cat: 'transmission', tier: 4, cost: 40, x: 1, y: 3, req: ['tarmac', 'droplet'], effects: { urbanAff: 0.4, air: 0.12 } },
  { id: 'hinterland', cat: 'transmission', tier: 4, cost: 38, x: 6, y: 3, req: ['reservoir'], effects: { ruralAff: 0.42, vector: 0.1 } },

  // ============ ENVIRONMENTAL ADAPTATION ============
  { id: 'cryo1', cat: 'adaptation', tier: 1, cost: 9, x: 0, y: 0, req: [], effects: { cold: 0.3 } },
  { id: 'cryo2', cat: 'adaptation', tier: 2, cost: 20, x: 0, y: 1, req: ['cryo1'], effects: { cold: 0.4 } },
  { id: 'cryo3', cat: 'adaptation', tier: 3, cost: 36, x: 0, y: 2, req: ['cryo2'], effects: { cold: 0.55, environ: 0.08 } },
  { id: 'pyro1', cat: 'adaptation', tier: 1, cost: 9, x: 1, y: 0, req: [], effects: { heat: 0.3 } },
  { id: 'pyro2', cat: 'adaptation', tier: 2, cost: 20, x: 1, y: 1, req: ['pyro1'], effects: { heat: 0.4 } },
  { id: 'pyro3', cat: 'adaptation', tier: 3, cost: 36, x: 1, y: 2, req: ['pyro2'], effects: { heat: 0.55, vector: 0.08 } },
  { id: 'hygro1', cat: 'adaptation', tier: 1, cost: 8, x: 2, y: 0, req: [], effects: { humid: 0.32 } },
  { id: 'hygro2', cat: 'adaptation', tier: 2, cost: 19, x: 2, y: 1, req: ['hygro1'], effects: { humid: 0.45, water: 0.08 } },
  { id: 'xero1', cat: 'adaptation', tier: 1, cost: 8, x: 3, y: 0, req: [], effects: { arid: 0.32 } },
  { id: 'xero2', cat: 'adaptation', tier: 2, cost: 19, x: 3, y: 1, req: ['xero1'], effects: { arid: 0.45, environ: 0.08 } },
  { id: 'sporecoat', cat: 'adaptation', tier: 3, cost: 34, x: 2, y: 2, req: ['hygro2', 'xero2'], effects: { environ: 0.3, cold: 0.15, heat: 0.15, stealth: 0.05 } },
  { id: 'clinicshield', cat: 'adaptation', tier: 3, cost: 33, x: 4, y: 1, req: [], effects: { drugResist: 0.3 } },
  { id: 'clinicshield2', cat: 'adaptation', tier: 4, cost: 52, x: 4, y: 2, req: ['clinicshield'], effects: { drugResist: 0.35, cureResist: 0.12 } },
  { id: 'immunefade', cat: 'adaptation', tier: 3, cost: 30, x: 5, y: 1, req: [], effects: { recoveryResist: 0.35 } },
  { id: 'reinfect', cat: 'adaptation', tier: 4, cost: 48, x: 5, y: 2, req: ['immunefade'], effects: { recoveryResist: 0.4, infectivity: 0.1 } },

  // ============ SYMPTOMS / EFFECTS ============
  { id: 'lethargy', cat: 'symptom', tier: 1, cost: 4, x: 0, y: 0, req: [], effects: { severity: 0.3, infectivity: 0.05, dpBonus: 0.2 } },
  { id: 'pyrexia', cat: 'symptom', tier: 1, cost: 6, x: 1, y: 0, req: ['lethargy'], effects: { severity: 0.8, infectivity: 0.12, air: 0.05 } },
  { id: 'coughfit', cat: 'symptom', tier: 2, cost: 10, x: 1, y: 1, req: ['pyrexia'], effects: { severity: 1.2, air: 0.18, contact: 0.05 } },
  { id: 'pulmofail', cat: 'symptom', tier: 3, cost: 22, x: 1, y: 2, req: ['coughfit'], effects: { severity: 3.2, lethality: 0.9, air: 0.1 } },
  { id: 'gastro', cat: 'symptom', tier: 2, cost: 9, x: 2, y: 1, req: ['lethargy'], effects: { severity: 1.1, water: 0.16, food: 0.12 } },
  { id: 'dehydration', cat: 'symptom', tier: 3, cost: 19, x: 2, y: 2, req: ['gastro'], effects: { severity: 2.0, lethality: 0.7, water: 0.08 } },
  { id: 'rash', cat: 'symptom', tier: 1, cost: 5, x: 3, y: 0, req: [], effects: { severity: 0.6, contact: 0.14 } },
  { id: 'necrosis', cat: 'symptom', tier: 3, cost: 24, x: 3, y: 1, req: ['rash'], effects: { severity: 3.0, lethality: 1.1, contact: 0.1 } },
  { id: 'hemorrhage', cat: 'symptom', tier: 4, cost: 40, x: 3, y: 2, req: ['necrosis'], effects: { severity: 5.0, lethality: 2.6, contact: 0.12 } },
  { id: 'neurofog', cat: 'symptom', tier: 2, cost: 12, x: 4, y: 0, req: [], effects: { severity: 1.0, cureResist: 0.08 } },
  { id: 'ataxia', cat: 'symptom', tier: 3, cost: 21, x: 4, y: 1, req: ['neurofog'], effects: { severity: 2.2, lethality: 0.5, cureResist: 0.1 } },
  { id: 'cascade', cat: 'symptom', tier: 4, cost: 46, x: 4, y: 2, req: ['ataxia', 'pulmofail'], effects: { severity: 6.5, lethality: 4.0, dpBonus: 0.6 } },
  { id: 'immunosupp', cat: 'symptom', tier: 3, cost: 26, x: 5, y: 0, req: [], effects: { severity: 1.4, infectivity: 0.18, recoveryResist: 0.2 } },
  { id: 'cytostorm', cat: 'symptom', tier: 4, cost: 44, x: 5, y: 1, req: ['immunosupp'], effects: { severity: 4.4, lethality: 2.2, drugResist: 0.12 } },
  { id: 'organfail', cat: 'symptom', tier: 4, cost: 50, x: 5, y: 2, req: ['cytostorm'], effects: { severity: 6.0, lethality: 3.6 } },
  { id: 'anosmia', cat: 'symptom', tier: 1, cost: 5, x: 0, y: 1, req: [], effects: { severity: 0.15, stealth: 0.06 } },
  { id: 'latency', cat: 'symptom', tier: 2, cost: 14, x: 0, y: 2, req: ['anosmia'], effects: { severity: -0.6, stealth: 0.22, infectivity: 0.06 } },

  // ============ ABILITIES ============
  { id: 'genedrift', cat: 'ability', tier: 1, cost: 12, x: 0, y: 0, req: [], effects: { mutationRate: 0.5 } },
  { id: 'genedrift2', cat: 'ability', tier: 2, cost: 26, x: 0, y: 1, req: ['genedrift'], effects: { mutationRate: 0.8, dpBonus: 0.3 } },
  { id: 'genelock', cat: 'ability', tier: 2, cost: 24, x: 1, y: 0, req: [], effects: { mutationRate: -0.9, cureResist: 0.1 } },
  { id: 'labnoise', cat: 'ability', tier: 2, cost: 22, x: 2, y: 0, req: [], effects: { cureResist: 0.22 } },
  { id: 'labnoise2', cat: 'ability', tier: 3, cost: 44, x: 2, y: 1, req: ['labnoise'], effects: { cureResist: 0.3 } },
  { id: 'datablight', cat: 'ability', tier: 4, cost: 70, x: 2, y: 2, req: ['labnoise2'], active: { kind: 'researchSetback', amount: 0.09, cooldown: 45 }, effects: {} },
  { id: 'veil', cat: 'ability', tier: 2, cost: 20, x: 3, y: 0, req: [], effects: { stealth: 0.22 } },
  { id: 'veil2', cat: 'ability', tier: 3, cost: 40, x: 3, y: 1, req: ['veil'], effects: { stealth: 0.25 } },
  { id: 'surge', cat: 'ability', tier: 3, cost: 34, x: 4, y: 0, req: [], active: { kind: 'transmissionSurge', amount: 0.6, duration: 12, cooldown: 40 }, effects: {} },
  { id: 'unrest', cat: 'ability', tier: 3, cost: 36, x: 5, y: 0, req: [], active: { kind: 'responseDisruption', amount: 0.45, duration: 15, cooldown: 55 }, effects: {} },
  { id: 'burstadapt', cat: 'ability', tier: 3, cost: 32, x: 4, y: 1, req: ['surge'], active: { kind: 'climateShift', duration: 25, cooldown: 60 }, effects: {} },
  { id: 'harvest', cat: 'ability', tier: 3, cost: 30, x: 5, y: 1, req: [], effects: { dpBonus: 1.2 } },
  { id: 'harvest2', cat: 'ability', tier: 4, cost: 58, x: 5, y: 2, req: ['harvest'], effects: { dpBonus: 1.8 } },
  { id: 'gridlock', cat: 'ability', tier: 4, cost: 62, x: 1, y: 1, req: ['genelock'], active: { kind: 'borderFatigue', amount: 0.5, duration: 20, cooldown: 70 }, effects: {} },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

/** Traits that can appear as random mutations (cheap/mid-tier passives). */
export const MUTABLE_TRAITS = TRAITS.filter((t) => !t.active && t.tier <= 3).map((t) => t.id);
