import { el, clear, num, fullNum, pct } from '../util.js';
import { t, tc } from '../../i18n/index.js';
import { ACHIEVEMENTS } from '../../data/achievements.js';

function lineChart(series, opts = {}) {
  const w = 720, hgt = 240, pad = 34;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', 'chart');
  const maxX = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p[0])));
  const maxY = opts.maxY ?? Math.max(1, ...series.flatMap((s) => s.points.map((p) => p[1])));
  const sx = (x) => pad + (x / maxX) * (w - pad * 1.4);
  const sy = (y) => hgt - pad - (y / maxY) * (hgt - pad * 1.6);
  // grid
  for (let i = 0; i <= 4; i++) {
    const y = sy((maxY / 4) * i);
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', pad); l.setAttribute('x2', w - pad * 0.4);
    l.setAttribute('y1', y); l.setAttribute('y2', y);
    l.setAttribute('stroke', 'rgba(150,190,220,0.14)');
    svg.appendChild(l);
    const tx = document.createElementNS(svgNS, 'text');
    tx.setAttribute('x', 4); tx.setAttribute('y', y + 4);
    tx.setAttribute('class', 'chart-label');
    tx.textContent = opts.fmt ? opts.fmt((maxY / 4) * i) : num((maxY / 4) * i);
    svg.appendChild(tx);
  }
  for (const s of series) {
    if (!s.points.length) continue;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', s.color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', s.dash || '');
    svg.appendChild(path);
  }
  const wrap = el('div', 'chart-wrap');
  wrap.appendChild(svg);
  const legend = el('div', 'chart-legend');
  for (const s of series) {
    const item = el('span', 'legend-item');
    const dot = el('span', 'legend-dot'); dot.style.background = s.color;
    item.append(dot, document.createTextNode(s.label));
    legend.appendChild(item);
  }
  wrap.appendChild(legend);
  return wrap;
}

export function statsView(app, opts = {}) {
  const sim = app.sim;
  const node = el('div', 'stats-view');
  if (!sim) {
    const p = app.profile;
    const box = el('div', 'panel');
    box.appendChild(el('h3', '', t('stats.lifetime')));
    const rows = [
      ['stats.gamesPlayed', p.gamesPlayed], ['stats.gamesWon', p.gamesWon],
      ['stats.bestDay', p.bestDay ?? '—'], ['stats.mostInfected', p.mostInfected ? fullNum(p.mostInfected) : '—'],
      ['menu.achievements', `${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}`],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'stat-row');
      r.append(el('span', 'stat-label', t(k)), el('span', 'stat-value', String(v)));
      box.appendChild(r);
    }
    node.appendChild(box);
    return node;
  }
  const g = sim.global, m = sim.metrics();

  const overview = el('div', 'panel');
  overview.appendChild(el('h3', '', t('stats.overview')));
  const grid = el('div', 'stat-grid');
  const add = (k, v, cls = '') => {
    const c = el('div', `stat-cell ${cls}`);
    c.append(el('span', 'stat-label', t(k)), el('span', 'stat-big', v));
    grid.appendChild(c);
  };
  add('stats.totalInfected', fullNum(g.totalInfected));
  add('stats.currentInfected', fullNum(g.infected));
  add('hud.healthy', fullNum(g.healthy));
  add('hud.recovered', fullNum(g.recovered));
  add('hud.dead', fullNum(g.dead));
  add('stats.countriesAffected', `${m.infectedCountries}`);
  add('stats.countriesClean', `${m.cleanCountries}`);
  add('stats.transmissionIndex', m.transmissionIndex.toFixed(3));
  add('stats.detectionLevel', `${m.detectedCountries} / ${sim.countries.length}`);
  add('stats.responseLevel', pct(sim.countries.reduce((a, c) => a + c.response, 0) / sim.countries.length));
  add('stats.researchProgress', pct(sim.research.progress));
  add('hud.severity', sim.pathogen.severity.toFixed(2));
  overview.appendChild(grid);
  node.appendChild(overview);

  const charts = el('div', 'panel');
  charts.appendChild(el('h3', '', t('stats.chartPopulation')));
  const hp = sim.history;
  charts.appendChild(lineChart([
    { label: t('hud.infected'), color: '#ff6b4a', points: hp.map((p) => [p.d, p.inf]) },
    { label: t('hud.healthy'), color: '#5fd39a', points: hp.map((p) => [p.d, p.hea]) },
    { label: t('hud.recovered'), color: '#4fc3f7', points: hp.map((p) => [p.d, p.rec]) },
    { label: t('hud.dead'), color: '#c78ae8', points: hp.map((p) => [p.d, p.ded]) },
  ]));
  charts.appendChild(el('h3', '', t('stats.chartResearch')));
  charts.appendChild(lineChart([
    { label: t('hud.research'), color: '#f2c14e', points: hp.map((p) => [p.d, p.res]) },
    { label: t('hud.awareness'), color: '#e8705a', points: hp.map((p) => [p.d, p.awa]) },
  ], { maxY: 1, fmt: (v) => `${Math.round(v * 100)}%` }));
  node.appendChild(charts);

  // country table
  const tableBox = el('div', 'panel');
  tableBox.appendChild(el('h3', '', t('stats.countries')));
  let sortKey = 'infected', desc = true;
  const table = el('div', 'table');
  const cols = [
    ['stats.countries', (c) => tc(c.id), 'id'],
    ['country.population', (c) => num(c.pop), 'pop'],
    ['hud.infected', (c) => num(c.infected), 'infected'],
    ['hud.recovered', (c) => num(c.recovered), 'recovered'],
    ['hud.dead', (c) => num(c.dead), 'dead'],
    ['country.healthcare', (c) => pct(c.health * c.healthMod, 0), 'health'],
    ['country.response', (c) => pct(c.response, 0), 'response'],
    ['map.detection', (c) => (c.detected ? '◎' : '—'), 'detected'],
  ];
  const draw = () => {
    clear(table);
    const head = el('div', 'tr th');
    for (const [k, , key] of cols) {
      const cell = el('button', `td sortable${sortKey === key ? ' sorted' : ''}`, t(k));
      cell.onclick = () => { if (sortKey === key) desc = !desc; else { sortKey = key; desc = true; } draw(); };
      head.appendChild(cell);
    }
    table.appendChild(head);
    const rows = [...sim.countries].sort((a, b) => {
      const av = sortKey === 'id' ? tc(a.id) : a[sortKey];
      const bv = sortKey === 'id' ? tc(b.id) : b[sortKey];
      if (typeof av === 'string') return desc ? bv.localeCompare(av) : av.localeCompare(bv);
      return desc ? (bv - av) : (av - bv);
    });
    for (const c of rows) {
      const tr = el('div', 'tr');
      for (const [, fn] of cols) tr.appendChild(el('span', 'td', fn(c)));
      table.appendChild(tr);
    }
  };
  draw();
  tableBox.appendChild(table);
  node.appendChild(tableBox);
  return node;
}

export function statsScreen(app, params = {}) {
  const node = el('div', 'screen list-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go(params.standalone ? 'menu' : 'game');
  head.append(back, el('h2', '', t('stats.title')));
  node.appendChild(head);
  node.appendChild(statsView(app));
  return { node };
}
