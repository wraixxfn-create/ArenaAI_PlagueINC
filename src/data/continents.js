export const CONTINENTS = [
  { id: 'na', key: 'continent.na', color: '#3d8fb0' },
  { id: 'sa', key: 'continent.sa', color: '#57a86b' },
  { id: 'eu', key: 'continent.eu', color: '#8a7fc4' },
  { id: 'af', key: 'continent.af', color: '#c49a4a' },
  { id: 'as', key: 'continent.as', color: '#c2645e' },
  { id: 'oc', key: 'continent.oc', color: '#4aa6a0' },
];
export const CONTINENT_BY_ID = Object.fromEntries(CONTINENTS.map(c => [c.id, c]));
