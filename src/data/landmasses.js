// Stylised landmass outlines in the same 0..100 x 0..100 space as country nodes.
// Deliberately abstract, hand-authored silhouettes — not traced from any map asset.
// `members` lists which countries occupy the mass; territories are carved out of the
// outline by Voronoi partition (see ui/geo.js). `decor: true` = scenery only.
export const LANDMASSES = [
  {
    id: 'na', members: ['usa', 'can', 'mex'],
    pts: [[9, 26], [12, 18], [17, 13], [24, 10], [31, 11], [33, 16], [29, 19], [28, 24],
      [27, 29], [25, 34], [24, 39], [21, 45], [18, 47], [16, 43], [14, 37], [10, 33]],
  },
  {
    id: 'ca', members: ['gtm', 'pan'],
    pts: [[18, 45], [22, 46], [25, 49], [27, 53], [25, 55], [22, 51], [19, 48]],
  },
  { id: 'cub', members: ['cub'], pts: [[23, 43], [28, 43], [28, 46], [23, 46]] },
  {
    id: 'sa', members: ['col', 'ven', 'per', 'bol', 'bra', 'arg', 'chl'],
    pts: [[26, 52], [31, 51], [36, 54], [38, 59], [38, 66], [36, 71], [33, 76],
      [30, 82], [28, 81], [27, 74], [25, 67], [24, 60], [25, 55]],
  },
  {
    id: 'eu', members: ['fra', 'esp', 'ita', 'deu', 'pol', 'ukr', 'swe', 'nor', 'fin', 'grc'],
    pts: [[43, 33], [43, 28], [46, 24], [47, 20], [48, 15], [52, 12], [56, 14], [56, 19],
      [58, 24], [59, 29], [56, 32], [54, 37], [50, 36], [46, 36]],
  },
  { id: 'gbr', members: ['gbr'], pts: [[43, 22], [47, 22], [47, 28], [43, 28]] },
  { id: 'irl', members: ['irl'], pts: [[41, 23], [43, 23], [43, 27], [41, 27]] },
  {
    id: 'ru', members: ['rus', 'kaz', 'mng'],
    pts: [[59, 26], [60, 17], [68, 13], [78, 12], [84, 15], [83, 22], [78, 27],
      [72, 30], [66, 31], [62, 30]],
  },
  {
    id: 'af', members: ['mar', 'dza', 'lby', 'egy', 'sdn', 'eth', 'ken', 'tza', 'cod', 'nga', 'mli', 'ago', 'zaf'],
    pts: [[41, 40], [43, 36], [48, 34], [54, 35], [58, 39], [61, 45], [62, 52],
      [60, 59], [58, 66], [55, 74], [51, 73], [49, 64], [46, 56], [43, 48]],
  },
  { id: 'mdg', members: ['mdg'], pts: [[60, 62], [64, 62], [64, 69], [60, 68]] },
  {
    id: 'me', members: ['tur', 'sau', 'irn'],
    pts: [[55, 31], [61, 30], [66, 34], [66, 40], [62, 45], [58, 44], [55, 39], [54, 34]],
  },
  {
    id: 'sas', members: ['pak', 'ind', 'bgd', 'mmr'],
    pts: [[65, 37], [70, 36], [75, 39], [78, 43], [76, 48], [72, 51], [69, 48], [66, 43]],
  },
  {
    id: 'ea', members: ['chn', 'kor', 'vnm', 'tha'],
    pts: [[72, 28], [80, 27], [85, 30], [85, 35], [82, 40], [80, 46], [77, 50],
      [74, 48], [73, 42], [71, 35]],
  },
  { id: 'jp', members: ['jpn'], pts: [[85, 28], [89, 29], [91, 34], [88, 36], [85, 33]] },
  {
    id: 'sea', members: ['mys', 'idn'],
    pts: [[76, 52], [82, 53], [88, 57], [87, 62], [81, 61], [77, 57]],
  },
  { id: 'phl', members: ['phl'], pts: [[84, 47], [88, 47], [88, 53], [84, 53]] },
  {
    id: 'au', members: ['aus'],
    pts: [[81, 64], [87, 62], [93, 65], [94, 70], [90, 75], [84, 74], [80, 69]],
  },
  { id: 'nz', members: ['nzl'], pts: [[92, 73], [96, 74], [97, 79], [93, 79]] },
  { id: 'png', members: ['png'], pts: [[87, 58], [92, 58], [92, 62], [87, 61]] },
  { id: 'fji', members: ['fji'], pts: [[95, 61], [98, 61], [98, 65], [95, 65]] },
  { id: 'isl', members: ['isl'], pts: [[38, 14], [42, 13], [43, 17], [39, 18]] },
  { id: 'grl', members: ['grl'], pts: [[31, 7], [38, 6], [40, 12], [37, 17], [32, 15], [30, 11]] },
  { id: 'aq', decor: true, members: [], pts: [[10, 91], [96, 91], [97, 99], [9, 99]] },
];

export const LANDMASS_BY_ID = Object.fromEntries(LANDMASSES.map((m) => [m.id, m]));

/** country id -> landmass id (built from the members lists). */
export const MASS_OF = (() => {
  const map = {};
  for (const m of LANDMASSES) for (const c of m.members) map[c] = m.id;
  return map;
})();

// Major shipping / flight corridors drawn under the country nodes (visual + thematic).
export const CORRIDORS = [
  ['usa', 'gbr'], ['usa', 'jpn'], ['usa', 'bra'], ['usa', 'mex'], ['usa', 'chn'],
  ['gbr', 'deu'], ['fra', 'usa'], ['deu', 'rus'], ['esp', 'bra'], ['ita', 'egy'],
  ['chn', 'aus'], ['chn', 'idn'], ['chn', 'rus'], ['jpn', 'kor'], ['ind', 'sau'],
  ['sau', 'egy'], ['zaf', 'bra'], ['zaf', 'aus'], ['aus', 'nzl'], ['idn', 'mys'],
  ['tur', 'deu'], ['nga', 'gbr'], ['ken', 'ind'], ['mex', 'col'], ['arg', 'esp'],
  ['can', 'gbr'], ['phl', 'usa'], ['tha', 'jpn'], ['pak', 'sau'], ['mar', 'fra'],
  ['aus', 'png'], ['nzl', 'fji'], ['isl', 'gbr'], ['grl', 'can'], ['cub', 'usa'],
  ['mdg', 'zaf'], ['irl', 'usa'], ['vnm', 'kor'], ['bgd', 'mys'], ['eth', 'sau'],
];
