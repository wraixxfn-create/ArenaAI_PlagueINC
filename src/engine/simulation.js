/**
 * VECTOR ZERO — simulation engine.
 *
 * Aggregate (compartmental) model: every country holds S / I / R / D population
 * counters as plain numbers. No per-individual entities, so hundreds of regions
 * and billions of simulated people cost only a few hundred float operations per tick.
 *
 * One tick = one simulated day. Deterministic for a given seed.
 *
 * Tick order (see design doc §28):
 *   1 local infection   2 recovery   3 mortality   4 cross-border transfer
 *   5 environment       6 transport  7 detection   8 awareness
 *   9 government response  10 research  11 events  12 evolution points
 */
import { RNG } from './rng.js';
import { COUNTRIES, buildLandGraph } from '../data/countries.js';
import { TRAIT_BY_ID, TRAITS, MUTABLE_TRAITS } from '../data/traits.js';
import { PATHOGEN_BY_ID } from '../data/pathogens.js';
import { DIFFICULTY_BY_ID, SCENARIO_BY_ID } from '../data/scenarios.js';
import { EVENTS } from '../data/events.js';

const LAND = buildLandGraph();
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

const STAT_KEYS = ['air', 'water', 'food', 'vector', 'contact', 'environ', 'infectivity',
  'severity', 'lethality', 'stealth', 'cureResist', 'drugResist', 'recoveryResist',
  'mutationRate', 'urbanAff', 'ruralAff', 'cold', 'heat', 'humid', 'arid',
  'dpBonus', 'airTravel', 'seaTravel', 'landTravel'];

export class Simulation {
  /**
   * @param {object} cfg { seed, pathogenId, startCountry, difficulty, scenarioId, worldOverrides }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.rng = new RNG(cfg.seed ?? Date.now());
    this.scenario = SCENARIO_BY_ID[cfg.scenarioId] || SCENARIO_BY_ID.global;
    this.diff = { ...(DIFFICULTY_BY_ID[cfg.difficulty] || DIFFICULTY_BY_ID.normal).mods };
    this.world = { ...(this.scenario.world || {}), ...(cfg.worldOverrides || {}) };
    this.pathogenDef = PATHOGEN_BY_ID[cfg.pathogenId] || PATHOGEN_BY_ID.strand;
    this.log = [];              // event feed
    this.history = [];          // time series for charts
    this.init();
  }

  // ---------------------------------------------------------------- setup
  init() {
    const rng = this.rng;
    const p = this.pathogenDef;
    this.countries = COUNTRIES.map((d) => {
      // Controlled procedural variation: ±12% on soft stats, never strategy-invalidating.
      const jit = (v, amt = 0.12) => clamp(v * (1 + (rng.next() * 2 - 1) * amt), 0, 1);
      const healthMul = (this.world.healthcare ?? 1) * (1 / this.diff.healthcare);
      return {
        id: d.id, c: d.c, x: d.x, y: d.y, island: !!d.island,
        pop: d.pop, pop0: d.pop,
        healthy: d.pop, infected: 0, recovered: 0, dead: 0,
        density: jit(d.density), heat: jit(d.heat, 0.08), humid: jit(d.humid, 0.1),
        health: clamp(jit(d.health) * healthMul, 0.02, 1),
        wealth: jit(d.wealth) * (this.world.economy ?? 1),
        urban: jit(d.urban, 0.06),
        air: jit(d.air) * (this.world.airTraffic ?? 1),
        sea: jit(d.sea) * (this.world.seaTraffic ?? 1),
        healthMod: 1, mobility: 1, response: 0, awareness: 0, detected: false,
        borders: 0, airClosed: 0, seaClosed: 0, strain: 0, contained: 0, treated: 0,
        research: 0, heatShift: 0, shiftDays: 0, totalInfected: 0, peakInfected: 0,
        firstSeen: null,
      };
    });
    this.byId = Object.fromEntries(this.countries.map((c) => [c.id, c]));

    this.day = 0;
    this.date = new Date(Date.UTC(2031, 2, 1));
    this.ep = 0;                      // evolution points available
    this.epEarned = 0;
    this.epSpent = 0;
    this.traits = new Set();          // purchased trait ids
    this.mutations = new Set();       // free (random) trait ids
    this.abilityState = {};           // id -> { cooldown, active }
    this.effects = {};                // temporary global effects
    this.flags = {};
    this.eventCooldowns = {};
    this.finished = null;             // 'win' | 'lose'
    this.finishReason = null;

    this.global = {
      awareness: this.world.initialAwareness ?? 0,
      responseBoost: 0, airFactor: 1, seaFactor: 1, landFactor: 1,
      economy: 1, totalInfected: 0, infectedShare: 0, detected: false,
      detectedIn: null, detectedDay: null, researchRate: 1, detectionPool: 0,
    };
    this.research = { progress: 0, rateMod: 1, contributors: 0, speedPerDay: 0 };

    this.recomputeStats();
    this.seedStart();
    this.updateGlobals();
    this.snapshotHistory();
  }

  seedStart() {
    let id = this.cfg.startCountry;
    const pool = this.scenario.startPool;
    if (!id || (pool && !pool.includes(id))) id = pool ? this.rng.pick(pool) : this.rng.pick(this.countries).id;
    const c = this.byId[id] || this.countries[0];
    this.startCountry = c.id;
    // Seed a small but viable cluster so a single unlucky tick cannot erase the run.
    this.seedCountry(c, Math.max(6, Math.floor(c.pop * 2e-8)));
    this.pushLog('log.outbreakStart', 'alert', { country: c.id });
  }

  seedCountry(c, n) {
    const take = Math.min(c.healthy, Math.max(1, n));
    c.healthy -= take; c.infected += take; c.totalInfected += take;
    if (c.firstSeen === null) c.firstSeen = this.day;
  }

  // ------------------------------------------------------- derived stats
  /** Sum pathogen base + all purchased/mutated trait effects into `this.pathogen`. */
  recomputeStats() {
    const base = this.pathogenDef.base;
    const s = {};
    for (const k of STAT_KEYS) s[k] = base[k] ?? 0;
    for (const k of ['cold', 'heat', 'humid', 'arid']) s[k] = this.pathogenDef.env[k] ?? 0;
    const all = [...this.traits, ...this.mutations];
    this.symptomsBought = 0;
    this.categoriesUsed = new Set();
    for (const id of all) {
      const t = TRAIT_BY_ID[id];
      if (!t) continue;
      this.categoriesUsed.add(t.cat);
      if (t.cat === 'symptom') this.symptomsBought++;
      for (const [k, v] of Object.entries(t.effects || {})) s[k] = (s[k] ?? 0) + v;
    }
    if (this.world.mutationRate) s.mutationRate *= this.world.mutationRate;
    s.severity = Math.max(0, s.severity);
    s.stealth = clamp(s.stealth, 0, 0.9);
    this.pathogen = {
      stats: s,
      mutationRate: Math.max(0, s.mutationRate),
      severity: s.severity,
      lethality: Math.max(0, s.lethality),
    };
  }

  traitCost(id) {
    const t = TRAIT_BY_ID[id];
    if (!t) return Infinity;
    const mul = this.pathogenDef.costMul[t.cat] ?? 1;
    // Costs inflate with how many traits are already owned so the late game stays tight.
    const owned = this.traits.size;
    const infl = 1 + owned * 0.035 + (t.tier - 1) * 0.05;
    return Math.ceil(t.cost * mul * infl);
  }

  canBuy(id) {
    if (this.traits.has(id)) return { ok: false, reason: 'owned' };
    const t = TRAIT_BY_ID[id];
    if (!t) return { ok: false, reason: 'missing' };
    for (const r of t.req) if (!this.traits.has(r)) return { ok: false, reason: 'req' };
    if (this.ep < this.traitCost(id)) return { ok: false, reason: 'ep' };
    return { ok: true };
  }

  buyTrait(id) {
    const chk = this.canBuy(id);
    if (!chk.ok) return chk;
    const cost = this.traitCost(id);
    this.ep -= cost; this.epSpent += cost;
    this.traits.add(id);
    this.mutations.delete(id);
    const t = TRAIT_BY_ID[id];
    if (t.active) this.abilityState[id] = { cooldown: 0, active: 0 };
    this.recomputeStats();
    // Buying loud traits nudges detection — visibility trade-off.
    this.global.detectionPool += (t.effects?.severity || 0) * 0.004;
    return { ok: true, cost };
  }

  refundTrait(id) {
    if (!this.traits.has(id)) return { ok: false };
    const t = TRAIT_BY_ID[id];
    // cannot refund if another owned trait depends on it
    for (const o of this.traits) if (TRAIT_BY_ID[o]?.req.includes(id)) return { ok: false, reason: 'dependent' };
    const refund = Math.floor(this.traitCost(id) * 0.6);
    this.traits.delete(id);
    delete this.abilityState[id];
    this.ep += refund; this.epSpent -= refund;
    this.recomputeStats();
    return { ok: true, refund };
  }

  activateAbility(id) {
    const t = TRAIT_BY_ID[id];
    if (!t?.active || !this.traits.has(id)) return { ok: false };
    const st = this.abilityState[id] || (this.abilityState[id] = { cooldown: 0, active: 0 });
    if (st.cooldown > 0) return { ok: false, reason: 'cooldown' };
    st.cooldown = t.active.cooldown;
    st.active = t.active.duration || 0;
    switch (t.active.kind) {
      case 'researchSetback':
        this.research.progress = Math.max(0, this.research.progress - t.active.amount);
        this.pushLog('log.ability.datablight', 'good', {});
        break;
      case 'transmissionSurge':
        this.effects.surge = { days: t.active.duration, amount: t.active.amount };
        this.pushLog('log.ability.surge', 'good', {});
        break;
      case 'responseDisruption':
        this.effects.disrupt = { days: t.active.duration, amount: t.active.amount };
        this.pushLog('log.ability.unrest', 'good', {});
        break;
      case 'borderFatigue':
        this.effects.borderFatigue = { days: t.active.duration, amount: t.active.amount };
        this.pushLog('log.ability.gridlock', 'good', {});
        break;
      case 'climateShift':
        this.effects.climate = { days: t.active.duration };
        this.pushLog('log.ability.burstadapt', 'good', {});
        break;
    }
    return { ok: true };
  }

  // ------------------------------------------------------------- helpers
  /** Environmental fitness of the pathogen in country c, 0.25..1.4 — explainable. */
  envFactor(c, breakdown) {
    const s = this.pathogen.stats;
    const heat = clamp(c.heat + (c.shiftDays > 0 ? c.heatShift : 0));
    const penalty = (this.world.envPenalty ?? 1);
    const climateFree = this.effects.climate ? 1 : 0;
    // heat stress if country hot and pathogen lacks heat resistance, etc.
    const heatStress = Math.max(0, heat - 0.55) * 1.8 * Math.max(0, 1 - s.heat - climateFree);
    const coldStress = Math.max(0, 0.45 - heat) * 1.8 * Math.max(0, 1 - s.cold - climateFree);
    const humidStress = Math.max(0, c.humid - 0.6) * 1.2 * Math.max(0, 1 - s.humid - climateFree);
    const aridStress = Math.max(0, 0.4 - c.humid) * 1.2 * Math.max(0, 1 - s.arid - climateFree);
    const total = (heatStress + coldStress + humidStress + aridStress) * penalty;
    if (breakdown) {
      if (heatStress > 0.001) breakdown.push({ k: 'exp.heatStress', v: -heatStress });
      if (coldStress > 0.001) breakdown.push({ k: 'exp.coldStress', v: -coldStress });
      if (humidStress > 0.001) breakdown.push({ k: 'exp.humidStress', v: -humidStress });
      if (aridStress > 0.001) breakdown.push({ k: 'exp.aridStress', v: -aridStress });
    }
    return clamp(1 - total, 0.12, 1.4);
  }

  /** Per-day internal growth coefficient for a country, with optional explanation. */
  localBeta(c, breakdown) {
    const s = this.pathogen.stats;
    const sp = this.pathogenDef.special;
    // channel strengths weighted by what the country offers
    const air = s.air * (0.55 + c.density * 0.9);
    const water = s.water * (1.2 - c.health * 0.6) * (0.6 + c.humid * 0.6);
    const food = s.food * (1.15 - c.health * 0.5) * (0.7 + (1 - c.urban) * 0.5);
    const vector = s.vector * (0.4 + c.humid * 0.9) * (0.5 + (1 - c.urban) * 1.0) * (0.5 + c.heat);
    const contact = s.contact * (0.5 + c.density * 1.1);
    const environ = s.environ * (0.7 + c.density * 0.5);
    let channels = air + water + food + vector + contact + environ;
    if (breakdown) {
      breakdown.push({ k: 'exp.chAir', v: air }, { k: 'exp.chWater', v: water },
        { k: 'exp.chFood', v: food }, { k: 'exp.chVector', v: vector },
        { k: 'exp.chContact', v: contact }, { k: 'exp.chEnviron', v: environ });
    }
    const urbanFit = 1 + s.urbanAff * (c.urban - 0.5) * 2 + s.ruralAff * (0.5 - c.urban) * 2;
    let beta = channels * s.infectivity * clamp(urbanFit, 0.5, 2.2);
    if (sp.techAffinity) beta *= 1 + sp.techAffinity * (c.wealth - 0.5);
    if (sp.lowSeverityGrowth) beta *= 1 + sp.lowSeverityGrowth * clamp(1 - this.pathogen.severity / 6, 0, 1);

    const env = this.envFactor(c, breakdown);
    beta *= env;

    // Healthcare suppression, softened by drug resistance
    const care = c.health * c.healthMod * clamp(1 - s.drugResist, 0.2, 1) * (1 + c.treated);
    const careMul = clamp(1 - care * 0.45, 0.3, 1);
    beta *= careMul;
    if (breakdown) breakdown.push({ k: 'exp.healthcare', v: careMul - 1 });

    // Government response / containment
    const disrupt = this.effects.disrupt ? (1 - this.effects.disrupt.amount) : 1;
    const resp = clamp(c.response * disrupt + c.contained * 0.5, 0, 1.3);
    const respMul = clamp(1 - resp * 0.55, 0.25, 1);
    beta *= respMul;
    if (breakdown) breakdown.push({ k: 'exp.response', v: respMul - 1 });

    beta *= c.mobility;
    beta *= this.diff.transmission;
    if (this.effects.surge) beta *= 1 + this.effects.surge.amount;
    if (breakdown && this.effects.surge) breakdown.push({ k: 'exp.surge', v: this.effects.surge.amount });
    return Math.max(0, beta * 0.45);
  }

  // ------------------------------------------------------------- tickers
  step() {
    if (this.finished) return;
    this.day++;
    this.date = new Date(this.date.getTime() + 86400000);
    const s = this.pathogen.stats;
    const sp = this.pathogenDef.special;

    let newInfections = 0, newDeaths = 0, newRecoveries = 0;

    // 1–3: local dynamics --------------------------------------------------
    for (const c of this.countries) {
      if (c.shiftDays > 0) c.shiftDays--; else c.heatShift = 0;
      if (c.infected <= 0) { c.strain = Math.max(0, c.strain - 0.02); continue; }
      const alive = c.healthy + c.infected + c.recovered;
      if (alive <= 0) continue;

      const beta = this.localBeta(c);
      const susceptibleFrac = c.healthy / Math.max(1, alive);
      let inf = beta * c.infected * susceptibleFrac;
      // stochastic in the tiny-outbreak regime, smooth when large
      inf = inf < 30 ? this.rng.poisson(inf) : inf * (0.9 + this.rng.next() * 0.2);
      inf = Math.min(c.healthy, inf);
      c.healthy -= inf; c.infected += inf; c.totalInfected += inf; newInfections += inf;

      // Recoveries. "noRecovery" pathogens still lose cases to isolation and
      // supportive care — a trickle, but enough that a stagnant strain plateaus.
      {
        const recBase = 0.035 * (0.5 + c.health * c.healthMod * 1.2) * (1 + c.treated * 1.5)
          * (sp.noRecovery ? 0.35 : 1);
        const rec = Math.min(c.infected, c.infected * recBase * clamp(1 - s.recoveryResist, 0.25, 1));
        c.infected -= rec; c.recovered += rec; newRecoveries += rec;
      }
      // mortality
      if (s.lethality > 0) {
        const incub = sp.incubation ? clamp(this.day / 200, sp.incubation, 1) : 1;
        const careShield = clamp(1 - c.health * c.healthMod * 0.35 * clamp(1 - s.drugResist, 0, 1), 0.4, 1);
        const d = Math.min(c.infected, c.infected * s.lethality * 0.011 * (this.world.lethality ?? 1) * careShield * incub);
        c.infected -= d; c.dead += d; c.pop -= d; newDeaths += d;
      }
      c.peakInfected = Math.max(c.peakInfected, c.infected);
      c.strain = clamp(c.infected / Math.max(1, c.pop) / Math.max(0.05, c.health * c.healthMod) * 1.6);
    }

    // 4 & 6: cross-border transfer ----------------------------------------
    this.spread();

    // 5: environment is folded into localBeta / event heat shifts.

    // 7–9: detection, awareness, response ---------------------------------
    this.updateDetection();
    this.updateResponse();

    // 10: research ---------------------------------------------------------
    this.updateResearch();

    // 11: events -----------------------------------------------------------
    this.updateEffects();
    this.updateEvents();
    this.passiveMutation();

    // 12: evolution points --------------------------------------------------
    this.updateEP(newInfections);

    this.updateGlobals();
    this.checkEnd();
    if (this.day % 2 === 0 || this.finished) this.snapshotHistory();
  }

  spread() {
    const s = this.pathogen.stats;
    const g = this.global;
    const fatigue = this.effects.borderFatigue ? (1 - this.effects.borderFatigue.amount) : 1;
    const sporeBurst = this.pathogenDef.special.sporeBurst;
    for (const src of this.countries) {
      if (src.infected < 1) continue;
      const prevalence = clamp(src.infected / Math.max(1, src.pop), 0, 1);
      const openAir = clamp(1 - src.airClosed * fatigue) * g.airFactor * (1 + s.airTravel);
      const openSea = clamp(1 - src.seaClosed * fatigue) * g.seaFactor * (1 + s.seaTravel);
      const openLand = clamp(1 - src.borders * fatigue) * g.landFactor * (1 + s.landTravel);

      // Air routes: proportional to both endpoints' air traffic.
      const airPower = src.air * openAir * prevalence * (0.35 + s.air + s.contact * 0.5) * 4.2;
      const seaPower = src.sea * openSea * prevalence * (0.3 + s.water + s.environ * 0.6) * 3.0;
      if (airPower > 0.0001 || seaPower > 0.0001) {
        const tries = 2;
        for (let i = 0; i < tries; i++) {
          const dst = this.rng.pick(this.countries);
          if (dst === src || dst.healthy <= 0) continue;
          const airP = airPower * dst.air * clamp(1 - dst.airClosed * fatigue);
          const seaP = seaPower * dst.sea * clamp(1 - dst.seaClosed * fatigue);
          let p = (airP + seaP) * 0.5 * this.envFactor(dst);
          if (this.effects.surge) p *= 1 + this.effects.surge.amount;
          if (p > 0 && this.rng.chance(clamp(p, 0, 0.9))) {
            const n = 1 + this.rng.poisson(Math.min(40, p * 8));
            this.arrive(dst, n, airP >= seaP ? 'air' : 'sea', src);
          }
        }
      }
      // Land borders
      const nb = LAND[src.id] || [];
      for (const nid of nb) {
        const dst = this.byId[nid];
        if (!dst || dst.healthy <= 0) continue;
        let p = prevalence * openLand * clamp(1 - dst.borders * fatigue) *
          (0.25 + s.contact + s.vector * 0.7 + s.food * 0.4) * 0.5 * this.envFactor(dst);
        if (this.effects.surge) p *= 1 + this.effects.surge.amount;
        if (p > 0 && this.rng.chance(clamp(p, 0, 0.85))) {
          this.arrive(dst, 1 + this.rng.poisson(Math.min(60, p * 20)), 'land', src);
        }
      }
      // Fungal spore burst: free long range seeding on an interval
      if (sporeBurst && this.day % sporeBurst.interval === 0 && prevalence > 0.02) {
        const dst = this.rng.pick(this.countries);
        if (dst !== src && dst.healthy > 0 && this.rng.chance(0.5 * this.envFactor(dst))) {
          this.arrive(dst, 1 + this.rng.poisson(3), 'spore', src);
        }
      }
    }
  }

  arrive(dst, n, mode, src) {
    const fresh = dst.infected < 1 && dst.totalInfected < 1;
    this.seedCountry(dst, n);
    if (fresh) {
      this.ep += 1.5 * (this.pathogenDef.special.countryBonus || 1) * this.diff.dpRate;
      this.epEarned += 1.5;
      this.pushLog('log.newCountry', 'good', { country: dst.id, from: src.id, mode: `mode.${mode}` });
    }
  }

  updateDetection() {
    const s = this.pathogen.stats;
    const spike = this.pathogenDef.special.detectionSpike || 1;
    let anyDetected = false;
    for (const c of this.countries) {
      if (c.infected < 1) { if (c.detected) anyDetected = true; continue; }
      const prevalence = c.infected / Math.max(1, c.pop);
      const visibility = (0.4 + this.pathogen.severity * 0.55) * (0.3 + c.health * c.healthMod) *
        this.diff.detection * (this.world.detection ?? 1) * spike * clamp(1 - s.stealth, 0.1, 1);
      // Even a perfectly stealthy agent cannot hide once a big share of a nation is ill.
      const saturationFloor = clamp((prevalence - 0.03) * 1.6, 0, 0.3) * clamp(1 - s.stealth * 0.4, 0.3, 1);
      const chance = clamp(prevalence * 60 * visibility + saturationFloor + (c.dead > 50 ? 0.03 : 0), 0, 0.6);
      if (!c.detected && this.rng.chance(chance)) {
        c.detected = true;
        this.pushLog('log.detected', 'warn', { country: c.id });
        if (!this.global.detected) {
          this.global.detected = true; this.global.detectedIn = c.id; this.global.detectedDay = this.day;
        }
      }
      if (c.detected) {
        anyDetected = true;
        c.awareness = clamp(c.awareness + (0.004 + prevalence * 0.12) * visibility * 0.9);
      }
    }
    if (anyDetected) {
      const detectedPop = this.countries.filter((c) => c.detected).reduce((a, c) => a + c.pop, 0);
      const share = detectedPop / Math.max(1, this.totalPop());
      const gain = (0.0015 + share * 0.012 + this.global.infectedShare * 0.02) *
        this.diff.response * clamp(1 - s.stealth * 0.5, 0.2, 1);
      this.global.awareness = clamp(this.global.awareness + gain);
    }
  }

  updateResponse() {
    const dis = this.effects.disrupt ? (1 - this.effects.disrupt.amount) : 1;
    const speed = this.diff.borderSpeed * (this.world.borderSpeed ?? 1) * dis;
    for (const c of this.countries) {
      const local = clamp(c.awareness * 0.7 + this.global.awareness * 0.6 + this.global.responseBoost, 0, 1.2);
      const target = clamp(local * (0.55 + c.wealth * 0.6), 0, 1);
      c.response += (target - c.response) * 0.045 * speed;
      c.response = clamp(c.response, 0, 1);
      // borders close as response rises, weighted by wealth/infrastructure
      const closeT = clamp((c.response - 0.25) * 1.5, 0, 1) * (0.6 + c.wealth * 0.5);
      c.airClosed += (closeT - c.airClosed) * 0.05 * speed;
      c.seaClosed += (closeT * 0.8 - c.seaClosed) * 0.04 * speed;
      c.borders += (closeT * 0.9 - c.borders) * 0.035 * speed;
      c.contained = Math.max(0, c.contained - 0.004);
      c.healthMod += (1 - c.healthMod) * 0.01;      // recovers toward baseline
      c.mobility += (1 - c.mobility) * 0.02;
      c.treated = Math.max(0, c.treated - 0.002);
      // research contribution
      c.research = c.detected ? c.health * c.wealth * (0.4 + c.response * 0.8) : 0;
    }
  }

  updateResearch() {
    const s = this.pathogen.stats;
    if (!this.global.detected) { this.research.speedPerDay = 0; return; }
    const contributors = this.countries.filter((c) => c.research > 0.05 && c.pop > 0);
    this.research.contributors = contributors.length;
    let power = 0;
    for (const c of contributors) {
      const strainPenalty = clamp(1 - c.strain * 0.5, 0.35, 1);
      power += c.research * strainPenalty * (0.3 + c.wealth) * (c.pop / 1e9 + 0.05);
    }
    // Institutional ramp: the longer the world has known about the pathogen, the more
    // labs, funding and shared data accumulate. Stalling forever is not a free win.
    const knownDays = this.day - (this.global.detectedDay ?? this.day);
    const maturity = 1 + Math.min(1.5, knownDays / 420);
    const coop = clamp(0.4 + this.global.awareness * 0.9, 0, 1.4) * this.global.economy * maturity;
    const resist = 1 + s.cureResist + (this.pathogen.mutationRate * 0.12);
    const speed = (power * 0.0022 * coop * this.research.rateMod * this.global.researchRate *
      this.diff.researchSpeed * (this.world.researchSpeed ?? 1) * (this.pathogenDef.special.cureSpeed ?? 1)) / resist;
    this.research.speedPerDay = speed;
    this.research.progress = clamp(this.research.progress + speed, 0, 1);
    // Once a cure exists it deploys and wipes the pathogen out (loss handled in checkEnd).
    if (this.research.progress >= 1) return;
    if (this.research.progress > 0.75) {
      // late-stage trials already start treating people
      for (const c of this.countries) if (c.detected) c.treated = Math.min(0.5, c.treated + 0.0015);
    }
  }

  updateEffects() {
    for (const k of Object.keys(this.effects)) {
      const e = this.effects[k];
      if (e.days !== undefined) { e.days--; if (e.days <= 0) delete this.effects[k]; }
    }
    for (const id of Object.keys(this.abilityState)) {
      const st = this.abilityState[id];
      if (st.cooldown > 0) st.cooldown--;
      if (st.active > 0) st.active--;
    }
    this.global.airFactor = clamp(this.global.airFactor + 0.004, 0, 1);
    this.global.seaFactor = clamp(this.global.seaFactor + 0.004, 0, 1);
    this.research.rateMod += (1 - this.research.rateMod) * 0.01;
  }

  updateEvents() {
    if (this.day % 2 !== 0) return;
    const ctx = {
      someCountry: (f) => this.countries.some(f),
      pickCountry: (f) => {
        const pool = this.countries.filter(f);
        return pool.length ? this.rng.pick(pool) : null;
      },
      randomMutation: () => this.randomMutation(),
      seed: (c, n) => this.seedCountry(c, n),
    };
    const pool = EVENTS.filter((e) => {
      if (e.once && this.flags[`ev_${e.id}`]) return false;
      if ((this.eventCooldowns[e.id] || 0) > this.day) return false;
      try { return e.when(this, this.rng, ctx); } catch { return false; }
    });
    if (!pool.length) return;
    const chance = clamp(0.06 + this.global.infectedShare * 0.12, 0, 0.3) * (this.diff.eventSeverity || 1);
    if (!this.rng.chance(chance)) return;
    const total = pool.reduce((a, e) => a + e.weight, 0);
    let r = this.rng.next() * total, chosen = pool[0];
    for (const e of pool) { r -= e.weight; if (r <= 0) { chosen = e; break; } }
    const args = (typeof chosen.args === 'function' ? chosen.args(this) : null) || {};
    let res = null;
    try { res = chosen.apply(this, this.rng, ctx); } catch { res = null; }
    if (res === null && chosen.apply.length >= 3 && !Object.keys(args).length && chosen.id !== 'spontaneousMutation') {
      // event failed to find a target; do not log or set cooldown
      return;
    }
    this.flags[`ev_${chosen.id}`] = true;
    this.eventCooldowns[chosen.id] = this.day + (chosen.cooldown || 10);
    this.pushLog(`event.${chosen.id}`, chosen.severity || 'neutral', { ...args, ...(res || {}) });
  }

  passiveMutation() {
    const rate = this.pathogen.mutationRate * (this.pathogenDef.special.mutationDrift ?? 0) *
      (this.world.mutationChaos ? 2.2 : 1);
    if (rate <= 0) return;
    const p = 0.0035 * rate * (1 + this.global.infectedShare);
    if (this.rng.chance(p)) this.randomMutation();
  }

  randomMutation() {
    const pool = MUTABLE_TRAITS.filter((id) => !this.traits.has(id) && !this.mutations.has(id) &&
      (TRAIT_BY_ID[id].req || []).every((r) => this.traits.has(r) || this.mutations.has(r)));
    if (!pool.length) return null;
    const id = this.rng.pick(pool);
    this.mutations.add(id);
    this.recomputeStats();
    this.pushLog('log.mutation', 'neutral', { trait: `trait.${id}.name` });
    return { trait: id };
  }

  updateEP(newInfections) {
    const sp = this.pathogenDef.special;
    // Three income streams: new infections (burst), standing infected mass (sustain),
    // and trait-granted passive income. The sustain term keeps the late game playable
    // once the world is saturated and there are few "new" infections left to claim.
    const bubble = Math.log10(1 + newInfections) * 0.42;
    const sustain = Math.log10(1 + (this.global.infected || 0) / 1e5) * 0.12;
    const passive = this.pathogen.stats.dpBonus * 0.5;
    let gain = (bubble + sustain + passive) * (sp.dpRate ?? 1) * this.diff.dpRate * (this.world.dpRate ?? 1);
    // still diminishing, so saturating the world is not a blank cheque
    gain *= clamp(1.15 - this.global.infectedShare * 0.35, 0.5, 1.15);
    this.ep += gain; this.epEarned += gain;
  }

  updateGlobals() {
    let inf = 0, healthy = 0, rec = 0, dead = 0, total = 0, pop = 0;
    for (const c of this.countries) {
      inf += c.infected; healthy += c.healthy; rec += c.recovered; dead += c.dead;
      total += c.totalInfected; pop += c.pop;
    }
    this.global.infected = inf; this.global.healthy = healthy; this.global.recovered = rec;
    this.global.dead = dead; this.global.totalInfected = total; this.global.pop = pop;
    this.global.infectedShare = clamp((inf + rec + dead) / Math.max(1, this.totalPop0()));
    this.global.currentShare = inf / Math.max(1, pop);
  }

  totalPop() { return this.countries.reduce((a, c) => a + c.pop, 0); }
  totalPop0() { return this._pop0 ?? (this._pop0 = this.countries.reduce((a, c) => a + c.pop0, 0)); }

  checkEnd() {
    const obj = this.scenario.objective;
    const g = this.global;
    // Loss: cure completed
    if (this.research.progress >= 1) { this.finish('lose', 'lose.cure'); return; }
    // Loss: eradicated
    if (g.infected < 0.5 && g.totalInfected > 0 && this.day > 15) { this.finish('lose', 'lose.extinct'); return; }
    if (obj.type === 'infectAll') {
      // "Everyone" means no measurable healthy population left: below one in a million
      // the remainder is statistical noise in scattered micro-populations.
      const epsilon = Math.max(1, this.totalPop0() * 1e-6);
      if (g.healthy < epsilon) { this.finish('win', 'win.total'); return; }
    } else if (obj.type === 'killShare') {
      if (g.dead / this.totalPop0() >= obj.value) { this.finish('win', 'win.collapse'); return; }
      if (g.healthy < 1 && g.infected < 1) { this.finish('lose', 'lose.objective'); return; }
    } else if (obj.type === 'infectShareByDay') {
      if (g.infectedShare >= obj.value) { this.finish('win', 'win.objective'); return; }
      if (this.day >= obj.day) { this.finish('lose', 'lose.timeout'); return; }
    }
  }

  finish(result, reason) {
    this.finished = result;
    this.finishReason = reason;
    this.snapshotHistory();
    this.pushLog(result === 'win' ? 'log.victory' : 'log.defeat', result === 'win' ? 'good' : 'bad', {});
  }

  pushLog(key, severity, args) {
    this.log.push({ day: this.day, key, severity, args: args || {}, id: `${this.day}-${this.log.length}` });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }

  snapshotHistory() {
    const g = this.global;
    this.history.push({
      d: this.day,
      inf: Math.round(g.infected || 0),
      hea: Math.round(g.healthy || 0),
      rec: Math.round(g.recovered || 0),
      ded: Math.round(g.dead || 0),
      res: +(this.research.progress || 0).toFixed(4),
      awa: +(g.awareness || 0).toFixed(4),
      sev: +this.pathogen.severity.toFixed(3),
    });
    if (this.history.length > 4000) this.history = this.history.filter((_, i) => i % 2 === 0);
  }

  // ---------------------------------------------------------- stats views
  metrics() {
    const continents = new Set(this.countries.filter((c) => c.totalInfected > 0).map((c) => c.c));
    const infectedCountries = this.countries.filter((c) => c.totalInfected > 0).length;
    return {
      continentsInfected: continents.size,
      infectedCountries,
      cleanCountries: this.countries.length - infectedCountries,
      detectedCountries: this.countries.filter((c) => c.detected).length,
      healthyRemaining: Math.round(this.global.healthy || 0),
      transmissionIndex: this.countries.reduce((a, c) => a + this.localBeta(c), 0) / this.countries.length,
      infectedPolar: ['grl', 'isl'].every((id) => this.byId[id].totalInfected > 0),
      epSpent: Math.round(this.epSpent),
      symptomsBought: this.symptomsBought,
      categoriesUsed: this.categoriesUsed,
      pathogen: this.pathogenDef.id,
      scenario: this.scenario.id,
      difficulty: this.cfg.difficulty,
      won: this.finished === 'win',
    };
  }

  /** Human-readable explanation of a country's infection rate (design §36). */
  explain(id) {
    const c = this.byId[id];
    if (!c) return null;
    const br = [];
    const beta = this.localBeta(c, br);
    return { beta, factors: br, env: this.envFactor(c) };
  }

  // ------------------------------------------------------------ save/load
  serialize() {
    return {
      v: 3, cfg: this.cfg, rng: this.rng.serialize(), day: this.day, date: this.date.getTime(),
      ep: this.ep, epEarned: this.epEarned, epSpent: this.epSpent,
      traits: [...this.traits], mutations: [...this.mutations],
      abilityState: this.abilityState, effects: this.effects, flags: this.flags,
      eventCooldowns: this.eventCooldowns, global: this.global, research: this.research,
      finished: this.finished, finishReason: this.finishReason,
      startCountry: this.startCountry,
      log: this.log.slice(-120), history: this.history,
      countries: this.countries.map((c) => ({ ...c })),
    };
  }

  static deserialize(data) {
    const sim = Object.create(Simulation.prototype);
    sim.cfg = data.cfg;
    sim.rng = RNG.deserialize(data.rng);
    sim.scenario = SCENARIO_BY_ID[data.cfg.scenarioId] || SCENARIO_BY_ID.global;
    sim.diff = { ...(DIFFICULTY_BY_ID[data.cfg.difficulty] || DIFFICULTY_BY_ID.normal).mods };
    sim.world = { ...(sim.scenario.world || {}), ...(data.cfg.worldOverrides || {}) };
    sim.pathogenDef = PATHOGEN_BY_ID[data.cfg.pathogenId] || PATHOGEN_BY_ID.strand;
    sim.day = data.day; sim.date = new Date(data.date);
    sim.ep = data.ep; sim.epEarned = data.epEarned; sim.epSpent = data.epSpent;
    sim.traits = new Set(data.traits); sim.mutations = new Set(data.mutations);
    sim.abilityState = data.abilityState || {}; sim.effects = data.effects || {};
    sim.flags = data.flags || {}; sim.eventCooldowns = data.eventCooldowns || {};
    sim.global = data.global; sim.research = data.research;
    sim.finished = data.finished; sim.finishReason = data.finishReason;
    sim.startCountry = data.startCountry;
    sim.log = data.log || []; sim.history = data.history || [];
    sim.countries = data.countries.map((c) => ({ ...c }));
    sim.byId = Object.fromEntries(sim.countries.map((c) => [c.id, c]));
    sim.recomputeStats();
    sim.updateGlobals();
    return sim;
  }
}

export { TRAITS, clamp };
