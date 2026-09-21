// Data-driven country table for VECTOR ZERO.
// All values are game-design abstractions on 0..1 scales (except population / lat / lon).
// To add a country: append an entry here and add "country.<id>" to both locale files.
//   id          unique key
//   c           continent id (see continents.js)
//   x, y        stylized map coordinates (0..100 grid, x = west→east, y = north→south)
//   pop         population
//   density     0..1 crowding (local transmission multiplier)
//   heat        0..1 average temperature (0 = arctic, 1 = equatorial)
//   humid       0..1 average humidity (0 = arid, 1 = tropical wet)
//   health      0..1 healthcare capacity (slows infection, boosts detection & research)
//   wealth      0..1 economic strength (research + resilience, response speed)
//   urban       0..1 urbanisation share
//   air         0..1 air-traffic volume
//   sea         0..1 maritime-traffic volume
//   land        list of land-neighbour country ids (bidirectional, deduped at load)
//   island      true ⇒ no land borders at all
export const COUNTRIES = [
  // ---- North America ----
  { id: 'usa', c: 'na', x: 21, y: 34, pop: 335000000, density: 0.32, heat: 0.52, humid: 0.5, health: 0.86, wealth: 0.95, urban: 0.83, air: 1.0, sea: 0.82, land: ['can', 'mex'] },
  { id: 'can', c: 'na', x: 20, y: 22, pop: 39000000, density: 0.06, heat: 0.18, humid: 0.5, health: 0.88, wealth: 0.88, urban: 0.82, air: 0.68, sea: 0.5, land: ['usa'] },
  { id: 'mex', c: 'na', x: 19, y: 44, pop: 129000000, density: 0.38, heat: 0.76, humid: 0.5, health: 0.52, wealth: 0.45, urban: 0.81, air: 0.6, sea: 0.5, land: ['usa', 'gtm'] },
  { id: 'gtm', c: 'na', x: 21, y: 49, pop: 18000000, density: 0.6, heat: 0.85, humid: 0.75, health: 0.36, wealth: 0.25, urban: 0.52, air: 0.22, sea: 0.28, land: ['mex', 'pan'] },
  { id: 'pan', c: 'na', x: 24, y: 52, pop: 4500000, density: 0.4, heat: 0.88, humid: 0.85, health: 0.5, wealth: 0.42, urban: 0.69, air: 0.48, sea: 0.72, land: ['gtm', 'col'] },
  { id: 'cub', c: 'na', x: 25, y: 45, pop: 11000000, density: 0.5, heat: 0.85, humid: 0.8, health: 0.62, wealth: 0.22, urban: 0.77, air: 0.3, sea: 0.4, island: true },
  // ---- South America ----
  { id: 'col', c: 'sa', x: 27, y: 56, pop: 52000000, density: 0.35, heat: 0.84, humid: 0.8, health: 0.5, wealth: 0.35, urban: 0.81, air: 0.45, sea: 0.4, land: ['pan', 'bra', 'per', 'ven'] },
  { id: 'ven', c: 'sa', x: 30, y: 54, pop: 28000000, density: 0.25, heat: 0.86, humid: 0.75, health: 0.3, wealth: 0.2, urban: 0.88, air: 0.22, sea: 0.34, land: ['col', 'bra'] },
  { id: 'per', c: 'sa', x: 28, y: 63, pop: 34000000, density: 0.18, heat: 0.66, humid: 0.6, health: 0.4, wealth: 0.3, urban: 0.78, air: 0.32, sea: 0.4, land: ['col', 'bra', 'chl', 'bol'] },
  { id: 'bol', c: 'sa', x: 31, y: 66, pop: 12000000, density: 0.12, heat: 0.55, humid: 0.55, health: 0.32, wealth: 0.2, urban: 0.7, air: 0.16, sea: 0.0, land: ['per', 'bra', 'arg', 'chl'] },
  { id: 'bra', c: 'sa', x: 34, y: 63, pop: 216000000, density: 0.26, heat: 0.85, humid: 0.8, health: 0.55, wealth: 0.45, urban: 0.87, air: 0.62, sea: 0.6, land: ['col', 'ven', 'per', 'bol', 'arg'] },
  { id: 'arg', c: 'sa', x: 31, y: 76, pop: 46000000, density: 0.14, heat: 0.48, humid: 0.5, health: 0.6, wealth: 0.4, urban: 0.92, air: 0.42, sea: 0.4, land: ['bra', 'bol', 'chl'] },
  { id: 'chl', c: 'sa', x: 28, y: 77, pop: 20000000, density: 0.15, heat: 0.4, humid: 0.4, health: 0.65, wealth: 0.5, urban: 0.88, air: 0.36, sea: 0.45, land: ['arg', 'per', 'bol'] },
  // ---- Europe ----
  { id: 'gbr', c: 'eu', x: 45, y: 25, pop: 68000000, density: 0.6, heat: 0.4, humid: 0.7, health: 0.85, wealth: 0.85, urban: 0.84, air: 0.88, sea: 0.62, island: true },
  { id: 'irl', c: 'eu', x: 43, y: 25, pop: 5100000, density: 0.35, heat: 0.4, humid: 0.78, health: 0.8, wealth: 0.85, urban: 0.64, air: 0.44, sea: 0.34, island: true },
  { id: 'fra', c: 'eu', x: 47, y: 29, pop: 65000000, density: 0.42, heat: 0.5, humid: 0.6, health: 0.88, wealth: 0.84, urban: 0.81, air: 0.78, sea: 0.5, land: ['esp', 'deu', 'ita'] },
  { id: 'esp', c: 'eu', x: 45, y: 33, pop: 48000000, density: 0.33, heat: 0.62, humid: 0.45, health: 0.84, wealth: 0.72, urban: 0.81, air: 0.7, sea: 0.55, land: ['fra'] },
  { id: 'ita', c: 'eu', x: 50, y: 33, pop: 59000000, density: 0.55, heat: 0.6, humid: 0.55, health: 0.84, wealth: 0.75, urban: 0.71, air: 0.66, sea: 0.56, land: ['fra', 'deu'] },
  { id: 'deu', c: 'eu', x: 50, y: 27, pop: 84000000, density: 0.6, heat: 0.42, humid: 0.6, health: 0.9, wealth: 0.88, urban: 0.78, air: 0.84, sea: 0.5, land: ['fra', 'pol', 'ita'] },
  { id: 'pol', c: 'eu', x: 53, y: 26, pop: 37000000, density: 0.4, heat: 0.35, humid: 0.6, health: 0.7, wealth: 0.6, urban: 0.6, air: 0.42, sea: 0.3, land: ['deu', 'ukr', 'rus'] },
  { id: 'ukr', c: 'eu', x: 57, y: 27, pop: 36000000, density: 0.28, heat: 0.36, humid: 0.55, health: 0.5, wealth: 0.28, urban: 0.7, air: 0.2, sea: 0.28, land: ['pol', 'rus', 'tur'] },
  { id: 'swe', c: 'eu', x: 51, y: 19, pop: 10500000, density: 0.08, heat: 0.18, humid: 0.6, health: 0.9, wealth: 0.88, urban: 0.88, air: 0.4, sea: 0.34, land: ['nor', 'fin'] },
  { id: 'nor', c: 'eu', x: 49, y: 17, pop: 5500000, density: 0.05, heat: 0.15, humid: 0.65, health: 0.92, wealth: 0.92, urban: 0.83, air: 0.34, sea: 0.4, land: ['swe', 'fin', 'rus'] },
  { id: 'fin', c: 'eu', x: 54, y: 17, pop: 5600000, density: 0.05, heat: 0.14, humid: 0.6, health: 0.9, wealth: 0.85, urban: 0.85, air: 0.32, sea: 0.28, land: ['swe', 'nor', 'rus'] },
  { id: 'grc', c: 'eu', x: 53, y: 35, pop: 10400000, density: 0.3, heat: 0.66, humid: 0.45, health: 0.74, wealth: 0.55, urban: 0.8, air: 0.46, sea: 0.5, land: ['tur'] },
  { id: 'rus', c: 'eu', x: 66, y: 19, pop: 144000000, density: 0.05, heat: 0.2, humid: 0.5, health: 0.6, wealth: 0.45, urban: 0.75, air: 0.55, sea: 0.4, land: ['pol', 'ukr', 'fin', 'nor', 'kaz', 'chn', 'mng'] },
  // ---- Africa ----
  { id: 'mar', c: 'af', x: 44, y: 38, pop: 38000000, density: 0.25, heat: 0.74, humid: 0.35, health: 0.42, wealth: 0.3, urban: 0.65, air: 0.36, sea: 0.4, land: ['dza'] },
  { id: 'dza', c: 'af', x: 48, y: 39, pop: 45000000, density: 0.1, heat: 0.82, humid: 0.2, health: 0.45, wealth: 0.32, urban: 0.74, air: 0.24, sea: 0.3, land: ['mar', 'lby', 'nga', 'mli'] },
  { id: 'lby', c: 'af', x: 52, y: 40, pop: 7000000, density: 0.05, heat: 0.88, humid: 0.15, health: 0.3, wealth: 0.25, urban: 0.81, air: 0.14, sea: 0.22, land: ['dza', 'egy', 'sdn'] },
  { id: 'egy', c: 'af', x: 56, y: 41, pop: 111000000, density: 0.55, heat: 0.88, humid: 0.25, health: 0.42, wealth: 0.3, urban: 0.43, air: 0.5, sea: 0.55, land: ['lby', 'sdn', 'sau'] },
  { id: 'sdn', c: 'af', x: 56, y: 47, pop: 48000000, density: 0.12, heat: 0.92, humid: 0.3, health: 0.22, wealth: 0.12, urban: 0.36, air: 0.14, sea: 0.2, land: ['egy', 'lby', 'eth', 'cod'] },
  { id: 'eth', c: 'af', x: 59, y: 51, pop: 126000000, density: 0.3, heat: 0.78, humid: 0.5, health: 0.24, wealth: 0.12, urban: 0.22, air: 0.4, sea: 0.0, land: ['sdn', 'ken'] },
  { id: 'ken', c: 'af', x: 59, y: 56, pop: 55000000, density: 0.28, heat: 0.84, humid: 0.6, health: 0.32, wealth: 0.18, urban: 0.29, air: 0.38, sea: 0.3, land: ['eth', 'cod', 'tza'] },
  { id: 'tza', c: 'af', x: 58, y: 60, pop: 67000000, density: 0.22, heat: 0.86, humid: 0.7, health: 0.26, wealth: 0.14, urban: 0.36, air: 0.22, sea: 0.28, land: ['ken', 'cod', 'zaf'] },
  { id: 'cod', c: 'af', x: 54, y: 57, pop: 102000000, density: 0.18, heat: 0.9, humid: 0.9, health: 0.16, wealth: 0.08, urban: 0.46, air: 0.14, sea: 0.12, land: ['sdn', 'ken', 'tza', 'nga', 'ago'] },
  { id: 'nga', c: 'af', x: 49, y: 51, pop: 223000000, density: 0.45, heat: 0.9, humid: 0.8, health: 0.2, wealth: 0.16, urban: 0.53, air: 0.34, sea: 0.3, land: ['dza', 'cod', 'mli'] },
  { id: 'mli', c: 'af', x: 45, y: 47, pop: 23000000, density: 0.06, heat: 0.95, humid: 0.2, health: 0.14, wealth: 0.08, urban: 0.44, air: 0.1, sea: 0.0, land: ['dza', 'nga'] },
  { id: 'ago', c: 'af', x: 52, y: 63, pop: 36000000, density: 0.12, heat: 0.84, humid: 0.6, health: 0.22, wealth: 0.2, urban: 0.67, air: 0.16, sea: 0.28, land: ['cod', 'zaf'] },
  { id: 'zaf', c: 'af', x: 55, y: 71, pop: 60000000, density: 0.15, heat: 0.6, humid: 0.45, health: 0.5, wealth: 0.4, urban: 0.68, air: 0.44, sea: 0.5, land: ['ago', 'tza'] },
  { id: 'mdg', c: 'af', x: 62, y: 65, pop: 30000000, density: 0.18, heat: 0.84, humid: 0.75, health: 0.16, wealth: 0.07, urban: 0.4, air: 0.1, sea: 0.2, island: true },
  // ---- Middle East / Central Asia ----
  { id: 'tur', c: 'as', x: 57, y: 33, pop: 85000000, density: 0.35, heat: 0.58, humid: 0.45, health: 0.66, wealth: 0.5, urban: 0.77, air: 0.7, sea: 0.45, land: ['grc', 'ukr', 'irn', 'sau'] },
  { id: 'sau', c: 'as', x: 60, y: 42, pop: 37000000, density: 0.08, heat: 0.95, humid: 0.2, health: 0.66, wealth: 0.66, urban: 0.84, air: 0.52, sea: 0.4, land: ['egy', 'tur', 'irn'] },
  { id: 'irn', c: 'as', x: 63, y: 37, pop: 89000000, density: 0.2, heat: 0.7, humid: 0.25, health: 0.52, wealth: 0.3, urban: 0.76, air: 0.28, sea: 0.28, land: ['tur', 'sau', 'pak', 'kaz'] },
  { id: 'kaz', c: 'as', x: 68, y: 28, pop: 20000000, density: 0.03, heat: 0.34, humid: 0.3, health: 0.5, wealth: 0.4, urban: 0.58, air: 0.24, sea: 0.05, land: ['rus', 'irn', 'chn'] },
  { id: 'pak', c: 'as', x: 67, y: 41, pop: 240000000, density: 0.6, heat: 0.82, humid: 0.4, health: 0.24, wealth: 0.14, urban: 0.38, air: 0.3, sea: 0.34, land: ['irn', 'ind', 'chn'] },
  { id: 'ind', c: 'as', x: 70, y: 45, pop: 1430000000, density: 0.85, heat: 0.86, humid: 0.7, health: 0.36, wealth: 0.25, urban: 0.36, air: 0.66, sea: 0.55, land: ['pak', 'chn', 'bgd', 'mmr'] },
  { id: 'bgd', c: 'as', x: 74, y: 44, pop: 173000000, density: 1.0, heat: 0.85, humid: 0.9, health: 0.28, wealth: 0.16, urban: 0.4, air: 0.24, sea: 0.3, land: ['ind', 'mmr'] },
  // ---- East & Southeast Asia ----
  { id: 'chn', c: 'as', x: 77, y: 33, pop: 1420000000, density: 0.5, heat: 0.5, humid: 0.55, health: 0.7, wealth: 0.66, urban: 0.65, air: 0.92, sea: 0.95, land: ['rus', 'kaz', 'ind', 'pak', 'mng', 'vnm', 'mmr', 'kor'] },
  { id: 'mng', c: 'as', x: 76, y: 26, pop: 3400000, density: 0.01, heat: 0.24, humid: 0.25, health: 0.42, wealth: 0.28, urban: 0.69, air: 0.1, sea: 0.0, land: ['rus', 'chn'] },
  { id: 'kor', c: 'as', x: 83, y: 32, pop: 52000000, density: 0.8, heat: 0.48, humid: 0.65, health: 0.9, wealth: 0.85, urban: 0.81, air: 0.72, sea: 0.7, land: ['chn'] },
  { id: 'jpn', c: 'as', x: 87, y: 32, pop: 123000000, density: 0.7, heat: 0.5, humid: 0.7, health: 0.94, wealth: 0.86, urban: 0.92, air: 0.78, sea: 0.72, island: true },
  { id: 'mmr', c: 'as', x: 76, y: 44, pop: 54000000, density: 0.25, heat: 0.88, humid: 0.85, health: 0.2, wealth: 0.12, urban: 0.32, air: 0.16, sea: 0.25, land: ['ind', 'chn', 'bgd', 'tha'] },
  { id: 'tha', c: 'as', x: 78, y: 48, pop: 72000000, density: 0.35, heat: 0.9, humid: 0.85, health: 0.6, wealth: 0.4, urban: 0.53, air: 0.66, sea: 0.5, land: ['mmr', 'vnm', 'mys'] },
  { id: 'vnm', c: 'as', x: 80, y: 47, pop: 99000000, density: 0.62, heat: 0.88, humid: 0.85, health: 0.5, wealth: 0.3, urban: 0.39, air: 0.4, sea: 0.45, land: ['chn', 'tha'] },
  { id: 'mys', c: 'as', x: 79, y: 54, pop: 34000000, density: 0.3, heat: 0.92, humid: 0.9, health: 0.62, wealth: 0.5, urban: 0.78, air: 0.56, sea: 0.68, land: ['tha', 'idn'] },
  { id: 'idn', c: 'as', x: 83, y: 58, pop: 278000000, density: 0.45, heat: 0.93, humid: 0.92, health: 0.36, wealth: 0.28, urban: 0.58, air: 0.5, sea: 0.6, land: ['mys'] },
  { id: 'phl', c: 'as', x: 85, y: 50, pop: 117000000, density: 0.62, heat: 0.9, humid: 0.88, health: 0.34, wealth: 0.24, urban: 0.48, air: 0.42, sea: 0.5, island: true },
  // ---- Oceania ----
  { id: 'aus', c: 'oc', x: 87, y: 69, pop: 27000000, density: 0.02, heat: 0.72, humid: 0.3, health: 0.9, wealth: 0.88, urban: 0.86, air: 0.5, sea: 0.5, island: true },
  { id: 'nzl', c: 'oc', x: 94, y: 76, pop: 5200000, density: 0.05, heat: 0.42, humid: 0.7, health: 0.86, wealth: 0.8, urban: 0.87, air: 0.3, sea: 0.34, island: true },
  { id: 'png', c: 'oc', x: 89, y: 60, pop: 10300000, density: 0.06, heat: 0.92, humid: 0.95, health: 0.14, wealth: 0.1, urban: 0.13, air: 0.1, sea: 0.2, island: true },
  { id: 'fji', c: 'oc', x: 96, y: 63, pop: 930000, density: 0.1, heat: 0.88, humid: 0.85, health: 0.4, wealth: 0.3, urban: 0.58, air: 0.14, sea: 0.2, island: true },
  // ---- Polar ----
  { id: 'isl', c: 'eu', x: 40, y: 16, pop: 380000, density: 0.01, heat: 0.08, humid: 0.7, health: 0.9, wealth: 0.88, urban: 0.94, air: 0.22, sea: 0.2, island: true },
  { id: 'grl', c: 'na', x: 34, y: 12, pop: 56000, density: 0.001, heat: 0.02, humid: 0.6, health: 0.7, wealth: 0.6, urban: 0.87, air: 0.06, sea: 0.1, island: true },
];

export const COUNTRY_BY_ID = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));

/** Symmetric land-border adjacency map. */
export function buildLandGraph() {
  const g = {};
  for (const c of COUNTRIES) g[c.id] = new Set();
  for (const c of COUNTRIES) {
    for (const n of c.land || []) {
      if (!g[n]) continue;
      g[c.id].add(n);
      g[n].add(c.id);
    }
  }
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v]]));
}
