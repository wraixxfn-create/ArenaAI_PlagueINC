# VECTOR ZERO

**An original global contagion strategy simulation.**

You design a pathogen, release it into a simulated world of 64 nations, and race to
complete your objective before humanity engineers a countermeasure. Every nation runs
its own compartmental epidemic model driven by climate, density, healthcare, wealth and
transport links; governments detect, panic, close borders and fund research in response
to what you actually do.

This is an original work. All code, data, world model, artwork, icons, interface,
procedural audio, terminology, upgrade names and written content were created for this
project. Nothing is derived from, or copied out of, any commercial title.

---

## Running the game

No build step and no runtime dependencies — the game is plain ES modules.

```bash
npm start           # serves on http://localhost:3000
# or any static server:
python3 -m http.server 3000
```

Open `http://localhost:3000` and pick **New Game**.

### Tests

```bash
npm test                    # engine: determinism, balance, edge cases (65 assertions)
node tests/ui.test.mjs      # UI under jsdom: screens, flows, i18n, saves (76 assertions)
```

`tests/ui.test.mjs` needs `jsdom` (`npm i --no-save jsdom`). The engine tests have no
dependencies at all.

---

## Controls

| Input | Action |
|---|---|
| `Space` | Pause / resume |
| `1`–`4` | Speed 1× / 2× / 4× / 8× |
| `E` | Evolution lab |
| `W` | World data |
| `M` | Cycle map view |
| `Esc` | Close overlay / open in-game menu |
| Scroll / drag | Zoom and pan the map |
| Click a country | Open its detail panel |

---

## Game systems

**Pathogens (6).** Each archetype changes the maths, not just the colour: `STRAND-7`
drifts constantly but is easy to research; `BACILLA VEIN` is drug-resistant with cheap
adaptations; `HELMYX` grows faster while symptoms stay mild and pays double per new
country; `MYCORA BLOOM` fires free long-range spore bursts on a timer; `NANOFORM LATTICE`
never mutates and scales with national wealth but triggers ferocious research;
`KRYON FOLD` almost nobody recovers from, but it crawls and earns points slowly.

**Transmission.** Six channels — air, water, food, animal vector, contact, surfaces —
each weighted by the destination country's density, humidity, heat, urbanisation and
healthcare. Cross-border spread runs on three separate networks (air, sea, land) with
independent closure states.

**Evolution.** 67 nodes across Transmission, Adaptation, Effects and Abilities, with
prerequisites, tier-based cost inflation, a 60% devolve refund, and five activated
abilities on cooldowns (transmission surge, research sabotage, civil friction, logistics
gridlock, adaptive burst).

**Trade-offs are real.** Severity drives detection, which drives government response,
which suppresses your growth curve. Lethality kills your own hosts. Stealth traits reduce
severity. The classic line is quiet and infectious early, lethal once you own the planet.

**World response.** Detection accrues per-country from prevalence, healthcare quality and
your concealment. Awareness feeds response, which closes air, sea and land links at
different rates. Research power sums over detected wealthy nations, penalised by hospital
strain and multiplied by an institutional maturity ramp — so stalling forever is not free.

**Events.** 18 condition-gated events, all with mechanical consequences (hospital
collapse, funding disputes, aid convoys, heatwaves, zoonotic jumps, misinformation).

**Scenarios (8) and difficulties (4)**, plus a fully configurable custom world.

**Explainability.** Every country panel shows the exact factor breakdown behind its
spread index — "Airborne channel +0.18, Cold stress −22%, Healthcare suppression −31%,
Government measures −48%".

---

## Project structure

```
index.html                  entry point
src/
  main.js                   screen registration + boot
  engine/
    rng.js                  deterministic mulberry32 PRNG (seeded, serializable)
    simulation.js           the whole simulation: ticks, spread, response, research
  data/                     ALL game content lives here, as plain data
    countries.js            64 nations + land-border graph
    continents.js
    landmasses.js           stylised map silhouettes + corridor list
    pathogens.js            pathogen archetypes
    traits.js               the evolution tree
    scenarios.js            scenarios + difficulty modifiers
    events.js               event definitions (when / apply)
    achievements.js
  i18n/
    index.js                runtime: t(), setLang(), audit helpers
    strings.core.js         UI strings
    strings.content.js      pathogens, traits, scenarios, events, tutorial
    strings.countries.js    country names
  ui/
    app.js                  app shell, router, game clock, persistence glue
    map.js                  canvas map renderer + view modes
    audio.js                procedural WebAudio engine (no sample files)
    storage.js              settings, save slots, lifetime profile
    util.js                 DOM helpers, formatting, tooltips, toasts
    style.css               the entire visual identity
    screens/                menu, setup, settings, stats, evolution, game
tests/
  sim.test.mjs              engine tests
  ui.test.mjs               UI tests (jsdom)
tools/serve.mjs             zero-dependency static server
```

The architecture is strictly layered: `engine/` never imports from `ui/`, and `ui/` never
hardcodes a user-facing string — everything goes through `t()`.

---

## Extending the game

### Add a country

1. Append an entry to `src/data/countries.js`. Give it an `id`, continent `c`, map
   coordinates `x`/`y` (0–100 grid), `pop`, and 0–1 values for `density`, `heat`, `humid`,
   `health`, `wealth`, `urban`, `air`, `sea`. Add `land: [...]` neighbour ids, or
   `island: true`.
2. Add `'country.<id>': { en, it }` to `src/i18n/strings.countries.js`.

Borders are symmetrised automatically; you only need to declare each edge once.

### Add a pathogen

Append to `src/data/pathogens.js` with `base` stats, `env` resistances, `costMul`
per-category multipliers, and a `special` block for its unique mechanic. Then add
`pathogen.<id>.name` / `.type` / `.desc` / `.trait` to `strings.content.js`.

Special mechanics currently understood by the engine: `mutationDrift`, `cureSpeed`,
`dpRate`, `countryBonus`, `lowSeverityGrowth`, `sporeBurst`, `techAffinity`,
`detectionSpike`, `incubation`, `noRecovery`, `drugResistGrowth`. Adding a new one means
one `if` in `simulation.js` plus the data field.

### Add an evolution trait

Append to `src/data/traits.js`:

```js
{ id: 'myTrait', cat: 'transmission', tier: 2, cost: 18,
  x: 7, y: 1, req: ['dermal1'], effects: { contact: 0.2, severity: 0.3 } }
```

`x`/`y` place it in that category's grid; the tree UI and the prerequisite connector
lines lay themselves out. For an activated ability, add an `active: { kind, amount,
duration, cooldown }` block. Then add `trait.<id>.name` and `trait.<id>.desc`.

### Add an event

Append to `src/data/events.js` with a `when(state, rng, ctx)` gate and an
`apply(state, rng, ctx)` that mutates the simulation. Returning `null` from `apply`
means "no valid target", and the event is silently skipped without burning its cooldown.
Add `event.<id>.name` and `event.<id>.text`; `{country}` placeholders are resolved
and localised automatically.

### Add a scenario

Append to `src/data/scenarios.js` with an `objective` (`infectAll`, `killShare`, or
`infectShareByDay`) and a `world` block of modifiers. Optionally restrict `startPool`
to specific countries. Add `scenario.<id>.name` / `.desc`.

### Add an achievement

Append to `src/data/achievements.js` with an `icon` and a `check(sim, meta)` predicate,
plus `ach.<id>.name` / `.desc`.

### Add a language

1. Add `{ code, label, locale }` to `LANGUAGES` in `src/i18n/index.js`.
2. Add that code to every entry in the three `strings.*.js` files. Missing entries fall
   back to English rather than crashing, so you can translate incrementally.
3. `node tests/sim.test.mjs` reports any keys you missed via `auditMissing()`.

Language is selected in **Settings → Language**, applies instantly without a restart, and
persists in `localStorage`.

---

## Technical notes

**Deterministic.** The whole simulation is driven by one seeded PRNG. The same seed and
the same player inputs reproduce a run exactly — verified by the test suite, which also
checks that a save/load round-trip continues identically for 40 further ticks.

**Aggregate, not agent-based.** Each country holds four float compartments (S/I/R/D).
Billions of simulated people cost a few hundred FLOPs per tick. A full 1000-day run
takes roughly 25 ms.

**Never blocks the UI.** The clock accumulates real time and steps the simulation up to
40 days per frame; beyond that it drops the backlog rather than stuttering.

**Accessibility.** Colourblind palette, pattern overlays so colour is never the only
signal, shape-coded status icons on the map, adjustable text size and UI scale, reduced
motion, full keyboard control, focus outlines, and volume sliders.

**Audio** is synthesised at runtime with WebAudio — an ambient pad whose filter, detune
and arpeggio density track global tension, plus UI and event tones. There are no audio
files, and nothing copyrighted.

**Saving.** Five slots (slot 0 is the rolling autosave, written every 20 simulated days).
Saves contain the full world state, RNG state, evolution tree, history, event log,
scenario, difficulty and language.

---

## Licence

Original work. Do with it what you like.
