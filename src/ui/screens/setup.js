import { el, clear, num, climateLabel, tip } from '../util.js';
import { t, tc } from '../../i18n/index.js';
import { PATHOGENS } from '../../data/pathogens.js';
import { SCENARIO_BY_ID, DIFFICULTIES } from '../../data/scenarios.js';
import { COUNTRIES } from '../../data/countries.js';
import { CONTINENTS } from '../../data/continents.js';
import { objectiveText } from './menu.js';

const CUSTOM_FIELDS = [
  { key: 'researchSpeed', min: 0.3, max: 2.5, step: 0.1, def: 1 },
  { key: 'airTraffic', min: 0.2, max: 2, step: 0.1, def: 1 },
  { key: 'seaTraffic', min: 0.2, max: 2, step: 0.1, def: 1 },
  { key: 'healthcare', min: 0.3, max: 2, step: 0.1, def: 1 },
  { key: 'mutationRate', min: 0, max: 4, step: 0.25, def: 1 },
  { key: 'dpRate', min: 0.4, max: 2.5, step: 0.1, def: 1 },
  { key: 'detection', min: 0.3, max: 3, step: 0.1, def: 1 },
  { key: 'economy', min: 0.4, max: 1.6, step: 0.1, def: 1 },
];

export function setupScreen(app, params = {}) {
  const state = {
    scenarioId: params.scenarioId || 'global',
    pathogenId: 'strand',
    difficulty: 'normal',
    startCountry: null,
    seed: '',
    custom: params.custom ? Object.fromEntries(CUSTOM_FIELDS.map((f) => [f.key, f.def])) : null,
    step: 0,
  };
  const scenario = SCENARIO_BY_ID[state.scenarioId];
  const steps = params.custom ? ['pathogen', 'difficulty', 'world', 'origin'] : ['pathogen', 'difficulty', 'origin'];

  const node = el('div', 'screen setup-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go('menu');
  const title = el('h2', '', t(`scenario.${state.scenarioId}.name`));
  head.append(back, title);
  node.appendChild(head);

  const sub = el('p', 'setup-sub');
  sub.textContent = `${t(`scenario.${state.scenarioId}.desc`)}  ${t('hud.objective')}: ${objectiveText(scenario)}`;
  node.appendChild(sub);

  const stepLabel = el('div', 'step-label');
  node.appendChild(stepLabel);
  const body = el('div', 'setup-body');
  node.appendChild(body);

  const footer = el('div', 'setup-footer');
  const prev = el('button', 'btn ghost', t('setup.prev'));
  const next = el('button', 'btn primary', t('setup.next'));
  const seedWrap = el('label', 'seed-field');
  seedWrap.appendChild(el('span', '', t('setup.seed')));
  const seedInput = el('input', 'input');
  seedInput.placeholder = t('setup.random');
  seedInput.oninput = () => { state.seed = seedInput.value; };
  tip(seedWrap, () => t('setup.seedHint'));
  seedWrap.appendChild(seedInput);
  footer.append(prev, seedWrap, next);
  node.appendChild(footer);

  prev.onclick = () => { app.audio.play('click'); if (state.step > 0) { state.step--; render(); } else app.go('menu'); };
  next.onclick = () => {
    app.audio.play('click');
    if (state.step < steps.length - 1) { state.step++; render(); return; }
    app.newGame({
      pathogenId: state.pathogenId,
      difficulty: state.difficulty,
      scenarioId: state.scenarioId,
      startCountry: state.startCountry,
      seed: state.seed ? state.seed : undefined,
      worldOverrides: state.custom,
    });
  };

  function render() {
    stepLabel.textContent = t('setup.step', { n: state.step + 1, total: steps.length });
    clear(body);
    const kind = steps[state.step];
    if (kind === 'pathogen') body.appendChild(pathogenPicker(app, state));
    else if (kind === 'difficulty') body.appendChild(difficultyPicker(app, state));
    else if (kind === 'world') body.appendChild(worldPicker(app, state));
    else body.appendChild(originPicker(app, state, scenario));
    next.textContent = state.step === steps.length - 1 ? t('setup.begin') : t('setup.next');
  }
  render();
  return { node };
}

function pathogenPicker(app, state) {
  const grid = el('div', 'card-grid');
  for (const p of PATHOGENS) {
    const card = el('button', `card path-card${state.pathogenId === p.id ? ' selected' : ''}`);
    card.style.setProperty('--accent', p.color);
    card.appendChild(el('div', 'path-orb'));
    card.appendChild(el('h3', '', t(`pathogen.${p.id}.name`)));
    card.appendChild(el('div', 'card-tag', t(`pathogen.${p.id}.type`)));
    card.appendChild(el('p', 'card-desc', t(`pathogen.${p.id}.desc`)));
    card.appendChild(el('div', 'trait-line', t(`pathogen.${p.id}.trait`)));
    const stars = el('div', 'stars');
    for (let i = 0; i < 5; i++) stars.appendChild(el('span', `star${i < p.difficulty ? ' on' : ''}`, '◆'));
    card.appendChild(stars);
    card.onclick = () => { app.audio.play('click'); state.pathogenId = p.id; grid.parentElement.replaceChild(pathogenPicker(app, state), grid); };
    grid.appendChild(card);
  }
  return grid;
}

function difficultyPicker(app, state) {
  const grid = el('div', 'card-grid');
  for (const d of DIFFICULTIES) {
    const card = el('button', `card diff-card${state.difficulty === d.id ? ' selected' : ''}`);
    card.appendChild(el('h3', '', t(`diff.${d.id}`)));
    card.appendChild(el('p', 'card-desc', t(`diff.${d.id}.desc`)));
    const detail = el('div', 'diff-detail');
    const rows = [
      ['settings.language' /*placeholder replaced below*/, null],
    ];
    detail.append(
      mod('custom.researchSpeed', d.mods.researchSpeed),
      mod('custom.detection', d.mods.detection),
      mod('custom.dpRate', d.mods.dpRate),
      mod('stats.responseLevel', d.mods.response),
    );
    card.appendChild(detail);
    card.onclick = () => { app.audio.play('click'); state.difficulty = d.id; grid.parentElement.replaceChild(difficultyPicker(app, state), grid); };
    grid.appendChild(card);
  }
  return grid;
  function mod(key, v) {
    const r = el('div', 'stat-row small');
    r.append(el('span', 'stat-label', t(key)), el('span', `stat-value ${v > 1 ? 'bad' : v < 1 ? 'good' : ''}`, `×${v.toFixed(2)}`));
    return r;
  }
}

function worldPicker(app, state) {
  const wrap = el('div', 'panel world-picker');
  wrap.appendChild(el('h3', '', t('custom.title')));
  for (const f of CUSTOM_FIELDS) {
    const row = el('div', 'slider-row');
    const label = el('span', 'stat-label', t(`custom.${f.key}`));
    const val = el('span', 'stat-value', `×${state.custom[f.key].toFixed(2)}`);
    const input = el('input', 'slider');
    input.type = 'range'; input.min = f.min; input.max = f.max; input.step = f.step;
    input.value = state.custom[f.key];
    input.oninput = () => { state.custom[f.key] = parseFloat(input.value); val.textContent = `×${state.custom[f.key].toFixed(2)}`; };
    row.append(label, input, val);
    wrap.appendChild(row);
  }
  const reset = el('button', 'btn ghost', t('custom.reset'));
  reset.onclick = () => {
    for (const f of CUSTOM_FIELDS) state.custom[f.key] = f.def;
    wrap.parentElement.replaceChild(worldPicker(app, state), wrap);
  };
  wrap.appendChild(reset);
  return wrap;
}

function originPicker(app, state, scenario) {
  const wrap = el('div', 'origin-picker');
  const hint = el('p', 'muted', t('setup.originHint'));
  wrap.appendChild(hint);
  const controls = el('div', 'row');
  const search = el('input', 'input');
  search.placeholder = t('ui.search');
  const rnd = el('button', 'btn ghost', t('setup.random'));
  controls.append(search, rnd);
  wrap.appendChild(controls);
  const list = el('div', 'country-picker');
  wrap.appendChild(list);

  const pool = scenario.startPool ? COUNTRIES.filter((c) => scenario.startPool.includes(c.id)) : COUNTRIES;
  const draw = () => {
    clear(list);
    const q = search.value.trim().toLowerCase();
    for (const cont of CONTINENTS) {
      const items = pool.filter((c) => c.c === cont.id && (!q || tc(c.id).toLowerCase().includes(q)));
      if (!items.length) continue;
      const group = el('div', 'picker-group');
      group.appendChild(el('h4', '', t(cont.key)));
      const row = el('div', 'picker-row');
      for (const c of items) {
        const b = el('button', `country-chip${state.startCountry === c.id ? ' selected' : ''}`);
        b.appendChild(el('span', 'cc-name', tc(c.id)));
        b.appendChild(el('span', 'cc-meta', `${num(c.pop)} · ${climateLabel(c)}`));
        const marks = el('span', 'cc-marks');
        if (c.island) marks.appendChild(el('span', 'mark', '⛵'));
        if (c.air > 0.6) marks.appendChild(el('span', 'mark', '✈'));
        if (c.health < 0.35) marks.appendChild(el('span', 'mark', '✚'));
        if (c.density > 0.55) marks.appendChild(el('span', 'mark', '▦'));
        b.appendChild(marks);
        b.onclick = () => { app.audio.play('click'); state.startCountry = c.id; draw(); };
        row.appendChild(b);
      }
      group.appendChild(row);
      list.appendChild(group);
    }
  };
  search.oninput = draw;
  rnd.onclick = () => { state.startCountry = null; draw(); };
  draw();
  return wrap;
}
