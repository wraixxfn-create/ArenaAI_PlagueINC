// Headless engine tests: determinism, serialization, balance, edge cases.
// Run: node tests/sim.test.mjs
import { Simulation } from '../src/engine/simulation.js';
import { PATHOGENS } from '../src/data/pathogens.js';
import { SCENARIOS, DIFFICULTIES } from '../src/data/scenarios.js';
import { TRAITS, TRAIT_BY_ID } from '../src/data/traits.js';
import { COUNTRIES } from '../src/data/countries.js';
import { auditMissing, KEY_COUNT } from '../src/i18n/index.js';
import core from '../src/i18n/strings.core.js';
import content from '../src/i18n/strings.content.js';
import countries from '../src/i18n/strings.countries.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const section = (n) => console.log(`\n== ${n} ==`);

/** Play a full game with a simple greedy AI buying affordable traits. */
function autoplay(cfg, maxDays = 2500, strategy = 'greedy') {
  const sim = new Simulation(cfg);
  while (!sim.finished && sim.day < maxDays) {
    sim.step();
    if (strategy === 'greedy') {
      // cheap transmission early, symptoms after global spread
      const spread = sim.global.infectedShare;
      const order = TRAITS.filter((t) => !sim.traits.has(t.id) && sim.canBuy(t.id).ok)
        .sort((a, b) => {
          const pri = (t) => (t.cat === 'symptom' ? (spread > 0.55 ? 0 : 3) : t.cat === 'transmission' ? 1 : 2);
          return pri(a) - pri(b) || sim.traitCost(a.id) - sim.traitCost(b.id);
        });
      if (order.length && sim.ep > sim.traitCost(order[0].id)) sim.buyTrait(order[0].id);
    }
  }
  return sim;
}

section('Data integrity');
ok(COUNTRIES.length >= 60, `country count = ${COUNTRIES.length}`);
ok(new Set(COUNTRIES.map((c) => c.id)).size === COUNTRIES.length, 'country ids unique');
ok(TRAITS.length >= 65, `trait count = ${TRAITS.length}`);
ok(TRAITS.every((t) => t.req.every((r) => TRAIT_BY_ID[r])), 'all trait prerequisites exist');
ok(TRAITS.every((t) => !t.req.includes(t.id)), 'no self-referencing traits');
ok(PATHOGENS.length >= 6, `pathogens = ${PATHOGENS.length}`);
ok(SCENARIOS.length >= 7, `scenarios = ${SCENARIOS.length}`);
ok(DIFFICULTIES.length === 4, 'difficulty levels');
{
  const neigh = COUNTRIES.flatMap((c) => c.land || []);
  const ids = new Set(COUNTRIES.map((c) => c.id));
  ok(neigh.every((n) => ids.has(n)), 'all land neighbours resolve');
}

section('Localization');
{
  const missing = auditMissing();
  ok(missing.length === 0, `no missing translations (${KEY_COUNT} keys)`, missing.slice(0, 8).join(','));
  const all = { ...core, ...content, ...countries };
  const need = [];
  for (const c of COUNTRIES) if (!all[`country.${c.id}`]) need.push(c.id);
  ok(need.length === 0, 'every country localized', need.join(','));
  const tmiss = [];
  for (const t of TRAITS) { if (!all[`trait.${t.id}.name`]) tmiss.push(t.id); if (!all[`trait.${t.id}.desc`]) tmiss.push(t.id + '.desc'); }
  ok(tmiss.length === 0, 'every trait localized', tmiss.join(','));
  const pmiss = PATHOGENS.filter((p) => !all[`pathogen.${p.id}.name`]).map((p) => p.id);
  ok(pmiss.length === 0, 'every pathogen localized', pmiss.join(','));
  const differing = Object.values(all).filter((v) => v.en !== v.it).length;
  ok(differing / Object.keys(all).length > 0.8, 'Italian is genuinely translated (not copied)');
}

section('Determinism');
{
  const cfg = { seed: 12345, pathogenId: 'strand', startCountry: 'ind', difficulty: 'normal', scenarioId: 'global' };
  const a = autoplay(cfg, 300, 'none');
  const b = autoplay(cfg, 300, 'none');
  ok(a.global.totalInfected === b.global.totalInfected, 'same seed ⇒ same infections',
    `${a.global.totalInfected} vs ${b.global.totalInfected}`);
  ok(a.log.length === b.log.length, 'same seed ⇒ same event log');
  const c = autoplay({ ...cfg, seed: 999 }, 300, 'none');
  ok(c.global.totalInfected !== a.global.totalInfected, 'different seed ⇒ different world');
}

section('Serialization round-trip');
{
  const sim = autoplay({ seed: 7, pathogenId: 'bacilla', startCountry: 'bra', difficulty: 'normal', scenarioId: 'global' }, 200);
  const blob = JSON.stringify(sim.serialize());
  const back = Simulation.deserialize(JSON.parse(blob));
  ok(back.day === sim.day, 'day preserved');
  ok(Math.abs(back.global.infected - sim.global.infected) < 1, 'infected preserved');
  ok([...back.traits].join() === [...sim.traits].join(), 'traits preserved');
  for (let i = 0; i < 40; i++) { sim.step(); back.step(); }
  ok(Math.abs(back.global.totalInfected - sim.global.totalInfected) < 1,
    'resumed simulation stays identical', `${back.global.totalInfected} vs ${sim.global.totalInfected}`);
}

section('Spread mechanics');
{
  const sim = autoplay({ seed: 3, pathogenId: 'strand', startCountry: 'chn', difficulty: 'easy', scenarioId: 'global' }, 400);
  const m = sim.metrics();
  ok(m.infectedCountries > 20, `spreads widely (${m.infectedCountries} countries)`);
  ok(m.continentsInfected >= 4, `crosses continents (${m.continentsInfected})`);
  ok(sim.global.detected, 'eventually detected');
  ok(sim.research.progress > 0, 'research starts after detection');
}
{
  // island start is genuinely harder
  const isl = autoplay({ seed: 5, pathogenId: 'strand', startCountry: 'grl', difficulty: 'normal', scenarioId: 'global' }, 200);
  const hub = autoplay({ seed: 5, pathogenId: 'strand', startCountry: 'usa', difficulty: 'normal', scenarioId: 'global' }, 200);
  ok(hub.metrics().infectedCountries >= isl.metrics().infectedCountries,
    'connected origin outspreads remote origin', `${hub.metrics().infectedCountries} vs ${isl.metrics().infectedCountries}`);
}

section('Win / loss conditions');
{
  let wins = 0, losses = 0, results = [];
  for (let s = 0; s < 8; s++) {
    const sim = autoplay({ seed: 100 + s, pathogenId: 'strand', startCountry: null, difficulty: 'easy', scenarioId: 'global' }, 3000);
    results.push(`${sim.finished}:${sim.finishReason}:${sim.day}`);
    if (sim.finished === 'win') wins++; else if (sim.finished === 'lose') losses++;
  }
  ok(wins + losses === 8, 'every run terminates', results.join(' '));
  ok(wins >= 3, `greedy AI can win on easy (${wins}/8)`, results.join(' '));
}
{
  // brutal should be much harder than easy for the same strategy
  let easyWins = 0, brutalWins = 0;
  for (let s = 0; s < 6; s++) {
    if (autoplay({ seed: 300 + s, pathogenId: 'strand', startCountry: null, difficulty: 'easy', scenarioId: 'global' }, 3000).finished === 'win') easyWins++;
    if (autoplay({ seed: 300 + s, pathogenId: 'strand', startCountry: null, difficulty: 'brutal', scenarioId: 'global' }, 3000).finished === 'win') brutalWins++;
  }
  ok(easyWins >= brutalWins, `difficulty scales (easy ${easyWins} ≥ brutal ${brutalWins})`);
}
{
  // no evolution at all should essentially never win
  const sim = autoplay({ seed: 42, pathogenId: 'kryon', startCountry: 'grl', difficulty: 'brutal', scenarioId: 'global' }, 2000, 'none');
  ok(sim.finished !== 'win', 'doing nothing does not win');
}

section('All pathogens & scenarios run');
for (const p of PATHOGENS) {
  const sim = autoplay({ seed: 11, pathogenId: p.id, startCountry: null, difficulty: 'normal', scenarioId: 'global' }, 800);
  const finite = Number.isFinite(sim.global.totalInfected) && Number.isFinite(sim.global.dead);
  ok(finite && sim.global.totalInfected >= 0, `${p.id}: stable numbers (${Math.round(sim.global.totalInfected)} infected)`);
}
for (const sc of SCENARIOS) {
  const sim = autoplay({ seed: 21, pathogenId: 'strand', startCountry: null, difficulty: 'normal', scenarioId: sc.id }, 1200);
  ok(Number.isFinite(sim.global.infected), `${sc.id}: runs without NaN`);
}

section('Edge cases');
{
  const sim = new Simulation({ seed: 1, pathogenId: 'strand', startCountry: 'grl', difficulty: 'normal', scenarioId: 'global' });
  // force research to 100%
  sim.research.progress = 1;
  sim.step();
  ok(sim.finished === 'lose' && sim.finishReason === 'lose.cure', 'research at 100% ⇒ defeat');
}
{
  const sim = new Simulation({ seed: 1, pathogenId: 'strand', startCountry: 'grl', difficulty: 'normal', scenarioId: 'global' });
  for (const c of sim.countries) { c.infected = 0; c.healthy = c.pop; }
  sim.countries[0].totalInfected = 10;
  sim.global.totalInfected = 10;
  for (let i = 0; i < 20; i++) sim.step();
  ok(sim.finished === 'lose' && sim.finishReason === 'lose.extinct', 'zero infections ⇒ extinction defeat');
}
{
  const sim = new Simulation({ seed: 1, pathogenId: 'strand', startCountry: 'usa', difficulty: 'normal', scenarioId: 'global' });
  for (const c of sim.countries) { c.healthy = 0; c.infected = c.pop; }
  sim.updateGlobals(); sim.checkEnd();
  ok(sim.finished === 'win', 'zero healthy ⇒ victory');
  ok(sim.global.healthy === 0, 'maximum infection handled');
}
{
  const sim = new Simulation({ seed: 1, pathogenId: 'strand', startCountry: 'usa', difficulty: 'normal', scenarioId: 'global' });
  for (const c of sim.countries) { c.pop = 0; c.healthy = 0; c.infected = 0; }
  for (let i = 0; i < 5; i++) sim.step();
  ok(Number.isFinite(sim.global.infectedShare), 'zero population does not produce NaN');
}
{
  // research 0% with no detection
  const sim = new Simulation({ seed: 2, pathogenId: 'kryon', startCountry: 'grl', difficulty: 'easy', scenarioId: 'global' });
  for (let i = 0; i < 30; i++) sim.step();
  ok(sim.research.progress >= 0, 'research never negative');
}

section('Economy & trait system');
{
  const sim = new Simulation({ seed: 8, pathogenId: 'strand', startCountry: 'ind', difficulty: 'normal', scenarioId: 'global' });
  sim.ep = 1000;
  const before = sim.pathogen.stats.air;
  ok(sim.buyTrait('aerosol1').ok, 'can buy a root trait');
  ok(sim.pathogen.stats.air > before, 'trait modifies stats');
  ok(!sim.canBuy('aerosol3').ok, 'prerequisites enforced');
  ok(sim.buyTrait('aerosol2').ok && sim.canBuy('aerosol3').ok, 'prerequisite chain unlocks');
  ok(!sim.refundTrait('aerosol1').ok, 'cannot refund a trait with dependents');
  ok(sim.refundTrait('aerosol2').ok, 'can refund a leaf trait');
  const c1 = sim.traitCost('hydro1');
  for (const id of ['hydro1', 'trophic1', 'dermal1', 'swarm1', 'cryo1']) sim.buyTrait(id);
  ok(sim.traitCost('pyro1') > c1 * 0.9, 'costs inflate with owned traits');
  sim.ep = 0;
  ok(!sim.canBuy('xero1').ok, 'cannot buy without points');
}
{
  const sim = new Simulation({ seed: 9, pathogenId: 'strand', startCountry: 'ind', difficulty: 'normal', scenarioId: 'global' });
  sim.ep = 500; sim.buyTrait('surge');
  ok(sim.activateAbility('surge').ok, 'ability activates');
  ok(!sim.activateAbility('surge').ok, 'ability respects cooldown');
  ok(!!sim.effects.surge, 'ability applies an effect');
  for (let i = 0; i < 20; i++) sim.step();
  ok(!sim.effects.surge, 'timed effect expires');
}

section('Explainability');
{
  const sim = autoplay({ seed: 4, pathogenId: 'strand', startCountry: 'nga', difficulty: 'normal', scenarioId: 'global' }, 150);
  const ex = sim.explain('nga');
  ok(ex && ex.factors.length > 3, 'explain() returns factor breakdown');
  ok(ex.factors.every((f) => typeof f.k === 'string' && Number.isFinite(f.v)), 'factors are well-formed');
}

section('Performance');
{
  const sim = new Simulation({ seed: 6, pathogenId: 'strand', startCountry: 'chn', difficulty: 'normal', scenarioId: 'global' });
  const t0 = performance.now();
  for (let i = 0; i < 1000 && !sim.finished; i++) sim.step();
  const ms = performance.now() - t0;
  ok(ms < 1500, `1000 ticks in ${ms.toFixed(0)}ms (${(ms / 1000).toFixed(3)}ms/tick)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
