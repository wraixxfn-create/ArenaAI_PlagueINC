/**
 * Strategic advisor. Reads simulation state and returns the single most useful
 * hint right now, plus derived readouts (cure ETA, trends, hotspots).
 * Pure logic, no DOM, no strings — it returns localization keys.
 */
import { TRAITS, TRAIT_BY_ID } from '../data/traits.js';

/** Estimated days until the countermeasure completes, or null if stalled. */
export function cureETA(sim) {
  const rate = sim.research.speedPerDay;
  if (!rate || rate <= 1e-6) return null;
  const remaining = 1 - sim.research.progress;
  if (remaining <= 0) return 0;
  return Math.round(remaining / rate);
}

/** Recent slope of a history field, per day. */
export function trend(sim, field = 'inf', window = 12) {
  const h = sim.history;
  if (h.length < 3) return 0;
  const b = h[h.length - 1];
  const a = h[Math.max(0, h.length - 1 - window)];
  const days = Math.max(1, b.d - a.d);
  return (b[field] - a[field]) / days;
}

export function hotspots(sim, n = 6) {
  return sim.countries
    .filter((c) => c.infected > 0)
    .sort((a, b) => b.infected - a.infected)
    .slice(0, n);
}

export function untouched(sim, n = 6) {
  return sim.countries
    .filter((c) => c.totalInfected < 1)
    .sort((a, b) => b.pop - a.pop)
    .slice(0, n);
}

/** Cheapest buyable trait matching a predicate — used to back hints with an action. */
function suggest(sim, pred) {
  const pool = TRAITS.filter((t) => !sim.traits.has(t.id) && sim.canBuy(t.id).ok && pred(t));
  pool.sort((a, b) => sim.traitCost(a.id) - sim.traitCost(b.id));
  return pool[0] || null;
}

/**
 * @returns {{ key: string, trait: string|null, urgency: 'info'|'warn'|'bad' }}
 */
export function advise(sim) {
  const g = sim.global;
  const share = g.infectedShare;
  const cure = sim.research.progress;
  const eta = cureETA(sim);
  const infTrend = trend(sim, 'inf');
  const remaining = sim.countries.filter((c) => c.totalInfected < 1);

  // 1. Cure is the clock — warn whenever it is genuinely threatening.
  if (cure > 0.55 || (eta !== null && eta < 130 && cure > 0.25)) {
    return {
      key: 'tip.cureRunning', urgency: 'bad',
      trait: suggest(sim, (t) => (t.effects?.cureResist || 0) > 0 || t.active?.kind === 'researchSetback')?.id || null,
    };
  }

  // 2. Saturated world with no lethality: the player is stalling out a win.
  if (share > 0.6 && sim.pathogen.stats.lethality < 0.4 && sim.scenario.objective.type !== 'infectAll') {
    return { key: 'tip.goLethal', urgency: 'warn', trait: suggest(sim, (t) => (t.effects?.lethality || 0) > 0)?.id || null };
  }
  if (share > 0.85 && sim.pathogen.stats.lethality < 0.2) {
    return { key: 'tip.goLethal', urgency: 'info', trait: suggest(sim, (t) => (t.effects?.lethality || 0) > 0)?.id || null };
  }

  // 3. Stalled spread — diagnose why.
  if (g.infected > 0 && infTrend <= 0 && share < 0.5 && sim.day > 40) {
    const blocked = remaining.length ? remaining : sim.countries.filter((c) => c.infected / Math.max(1, c.pop) < 0.01);
    const cold = blocked.filter((c) => c.heat < 0.35).length;
    const hot = blocked.filter((c) => c.heat > 0.7).length;
    const s = sim.pathogen.stats;
    if (cold >= hot && cold > 2 && s.cold < 0.8) {
      return { key: 'tip.coldCountries', urgency: 'warn', trait: suggest(sim, (t) => (t.effects?.cold || 0) > 0)?.id || null };
    }
    if (hot > 2 && s.heat < 0.8) {
      return { key: 'tip.hotCountries', urgency: 'warn', trait: suggest(sim, (t) => (t.effects?.heat || 0) > 0)?.id || null };
    }
    return { key: 'tip.notSpreading', urgency: 'warn', trait: null };
  }

  // 4. Only islands left.
  if (remaining.length > 0 && remaining.length <= 6 && remaining.every((c) => c.island || (c.land || []).length === 0)) {
    return {
      key: 'tip.islandsLeft', urgency: 'info',
      trait: suggest(sim, (t) => (t.effects?.seaTravel || 0) > 0 || (t.effects?.airTravel || 0) > 0)?.id || null,
    };
  }

  // 5. Borders slamming shut.
  const avgClosed = sim.countries.reduce((a, c) => a + c.airClosed, 0) / sim.countries.length;
  if (avgClosed > 0.45 && remaining.length > 3) {
    return {
      key: 'tip.bordersClosing', urgency: 'warn',
      trait: suggest(sim, (t) => t.active?.kind === 'borderFatigue' || (t.effects?.airTravel || 0) > 0)?.id || null,
    };
  }

  // 6. Loud too early.
  if (sim.pathogen.severity > 3.5 && share < 0.35 && cure > 0.05) {
    return { key: 'tip.tooVisible', urgency: 'warn', trait: suggest(sim, (t) => (t.effects?.stealth || 0) > 0)?.id || null };
  }

  // 7. Free real estate while undetected.
  if (!g.detected && sim.day > 10) {
    return { key: 'tip.undetected', urgency: 'info', trait: suggest(sim, (t) => t.cat === 'transmission')?.id || null };
  }

  // 8. Unspent points.
  const cheapest = TRAITS.filter((t) => !sim.traits.has(t.id) && sim.canBuy(t.id).ok)
    .sort((a, b) => sim.traitCost(a.id) - sim.traitCost(b.id))[0];
  if (cheapest && sim.ep >= sim.traitCost(cheapest.id) * 1.6) {
    return { key: 'tip.buyTransmission', urgency: 'info', trait: suggest(sim, (t) => t.cat === 'transmission')?.id || cheapest.id };
  }

  return { key: 'tip.allGood', urgency: 'info', trait: null };
}

/** How many traits the player could buy right now — drives the Evolve button badge. */
export function affordableCount(sim) {
  let n = 0;
  for (const t of TRAITS) if (!sim.traits.has(t.id) && sim.canBuy(t.id).ok) n++;
  return n;
}
