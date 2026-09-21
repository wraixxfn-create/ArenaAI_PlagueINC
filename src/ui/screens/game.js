import { el, clear, num, fullNum, pct, dateStr, bar, tip, climateLabel, toast, confirmDialog } from '../util.js';
import { t, tc } from '../../i18n/index.js';
import { WorldMap, MAP_MODES } from '../map.js';
import { SPEEDS } from '../app.js';
import { evolutionOverlay } from './evolution.js';
import { statsView } from './stats.js';
import { objectiveText } from './menu.js';
import { TRAIT_BY_ID } from '../../data/traits.js';
import { buildLandGraph } from '../../data/countries.js';

const LAND = buildLandGraph();

export function gameScreen(app) {
  const sim = app.sim;
  const node = el('div', 'screen game-screen');

  // ---------------- TOP BAR ----------------
  const top = el('header', 'hud-top');
  const brand = el('div', 'hud-brand');
  brand.appendChild(el('span', 'hud-path', t(`pathogen.${sim.pathogenDef.id}.name`)));
  brand.appendChild(el('span', 'hud-scen', t(`scenario.${sim.scenario.id}.name`)));
  top.appendChild(brand);

  const metrics = el('div', 'hud-metrics');
  const mkMetric = (key, cls) => {
    const box = el('div', `metric ${cls}`);
    box.appendChild(el('span', 'metric-label', t(key)));
    const v = el('span', 'metric-value', '0');
    box.appendChild(v);
    metrics.appendChild(box);
    return v;
  };
  const vInfected = mkMetric('hud.infected', 'inf');
  const vHealthy = mkMetric('hud.healthy', 'hea');
  const vRecovered = mkMetric('hud.recovered', 'rec');
  const vDead = mkMetric('hud.dead', 'ded');
  top.appendChild(metrics);

  const epBox = el('button', 'ep-box');
  epBox.appendChild(el('span', 'ep-label', t('hud.ep')));
  const epValue = el('span', 'ep-value', '0');
  epBox.appendChild(epValue);
  epBox.onclick = () => openEvolution();
  tip(epBox, () => t('hud.evolve'));
  top.appendChild(epBox);

  const research = el('div', 'research-box');
  research.appendChild(el('span', 'metric-label', t('hud.research')));
  const resBar = bar(0, 'research');
  const resVal = el('span', 'metric-value', '0%');
  research.append(resBar, resVal);
  tip(research, () => {
    const box = el('div', 'tip-card');
    box.appendChild(el('strong', '', t('hud.research')));
    const r1 = el('div', 'tip-row');
    r1.append(el('span', '', t('stats.countries')), el('span', '', String(sim.research.contributors)));
    const r2 = el('div', 'tip-row');
    r2.append(el('span', '', t('stat.cureResist')), el('span', '', pct(sim.pathogen.stats.cureResist, 0)));
    const r3 = el('div', 'tip-row');
    r3.append(el('span', '', t('hud.day', { n: '' })), el('span', '', `${(sim.research.speedPerDay * 100).toFixed(3)}%/d`));
    box.append(r1, r2, r3);
    return box;
  });
  top.appendChild(research);

  const clock = el('div', 'clock-box');
  const dayLabel = el('div', 'clock-day', '');
  const dateLabel = el('div', 'clock-date', '');
  clock.append(dayLabel, dateLabel);
  top.appendChild(clock);
  node.appendChild(top);

  // ---------------- MAIN ----------------
  const main = el('div', 'game-main');
  const mapWrap = el('div', 'map-wrap');
  const canvas = el('canvas', 'map-canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('hud.mapMode'));
  canvas.tabIndex = 0;
  mapWrap.appendChild(canvas);

  const modeBar = el('div', 'mode-bar');
  const modeBtns = {};
  for (const m of MAP_MODES) {
    const b = el('button', `mode-btn${m === 'infection' ? ' active' : ''}`, t(`map.${m}`));
    b.onclick = () => {
      app.audio.play('click');
      map.setMode(m);
      Object.values(modeBtns).forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      updateLegend();
    };
    modeBtns[m] = b;
    modeBar.appendChild(b);
  }
  mapWrap.appendChild(modeBar);

  const legend = el('div', 'legend-box');
  mapWrap.appendChild(legend);
  const mapHint = el('div', 'map-hint', t('map.zoomHint'));
  const resetBtn = el('button', 'btn tiny ghost', t('map.reset'));
  resetBtn.onclick = () => map.resetView();
  mapHint.appendChild(resetBtn);
  mapWrap.appendChild(mapHint);

  const objBanner = el('div', 'objective-banner');
  objBanner.textContent = `${t('hud.objective')}: ${objectiveText(sim.scenario)}`;
  mapWrap.appendChild(objBanner);

  main.appendChild(mapWrap);

  // ---------------- SIDE PANEL ----------------
  const side = el('aside', 'side-panel');
  const sideTabs = el('div', 'tabs');
  let sideTab = 'country';
  const tabDefs = [['country', 'stats.countries'], ['pathogen', 'stats.pathogen'], ['feed', 'hud.events']];
  const sideBody = el('div', 'side-body');
  for (const [id, key] of tabDefs) {
    const b = el('button', `tab${sideTab === id ? ' active' : ''}`, t(key));
    b.onclick = () => {
      sideTab = id; app.audio.play('click');
      [...sideTabs.children].forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
      renderSide();
    };
    sideTabs.appendChild(b);
  }
  side.append(sideTabs, sideBody);
  main.appendChild(side);
  node.appendChild(main);

  // ---------------- BOTTOM BAR ----------------
  const bottom = el('footer', 'hud-bottom');
  const left = el('div', 'row');
  const pauseBtn = el('button', 'btn control', t('hud.pause'));
  pauseBtn.onclick = () => { app.audio.play('click'); app.togglePause(); syncSpeed(); };
  left.appendChild(pauseBtn);
  const speedGroup = el('div', 'speed-group');
  const speedBtns = [];
  SPEEDS.forEach((s, i) => {
    const b = el('button', 'speed-btn', s === 0 ? '❙❙' : `${s}×`);
    b.onclick = () => { app.audio.play('click'); app.setSpeed(i); syncSpeed(); };
    tip(b, () => `${t('hud.speed')}: ${s === 0 ? t('hud.paused') : `${s}×`}`);
    speedBtns.push(b);
    speedGroup.appendChild(b);
  });
  left.appendChild(speedGroup);
  bottom.appendChild(left);

  const ticker = el('div', 'ticker');
  bottom.appendChild(ticker);

  const right = el('div', 'row');
  const evoBtn = el('button', 'btn primary control', `⌁ ${t('hud.evolve')}`);
  evoBtn.onclick = () => openEvolution();
  const dataBtn = el('button', 'btn control', `▤ ${t('hud.world')}`);
  dataBtn.onclick = () => openData();
  const menuBtn = el('button', 'btn ghost control', `☰ ${t('hud.menu')}`);
  menuBtn.onclick = () => openMenu();
  right.append(evoBtn, dataBtn, menuBtn);
  bottom.appendChild(right);
  node.appendChild(bottom);

  const autosaveTag = el('div', 'autosave-tag', t('hud.autosaved'));
  node.appendChild(autosaveTag);

  // ---------------- map wiring ----------------
  let selected = sim.startCountry;
  const map = new WorldMap(canvas, {
    settings: app.settings,
    onSelect: (id) => { selected = id; map.selected = id; sideTab = 'country'; syncTabs(); renderSide(); app.audio.play('click'); },
  });
  map.setSim(sim);
  map.selected = selected;

  function syncTabs() {
    [...sideTabs.children].forEach((c, i) => c.classList.toggle('active', tabDefs[i][0] === sideTab));
  }
  function updateLegend() {
    clear(legend);
    legend.appendChild(el('span', 'legend-title', t('map.legend')));
    const items = map.legend();
    const strip = el('div', 'legend-strip');
    items.forEach((label, i) => {
      const cell = el('span', 'legend-cell');
      const sw = el('span', 'legend-swatch');
      sw.style.background = swatchColor(map.mode, i / Math.max(1, items.length - 1), app.settings.colorblind);
      cell.append(sw, el('span', '', label));
      strip.appendChild(cell);
    });
    legend.appendChild(strip);
    const icons = el('div', 'legend-icons');
    [['◎', 'country.detected'], ['✈', 'map.airport'], ['⚓', 'map.port'], ['✚', 'country.strain']].forEach(([ic, k]) => {
      const c = el('span', 'legend-cell');
      c.append(el('span', 'legend-icon', ic), el('span', '', t(k)));
      icons.appendChild(c);
    });
    legend.appendChild(icons);
  }

  function swatchColor(mode, k, cb) {
    const ramps = {
      infection: cb ? ['#3b4b8f', '#6a5acd', '#fdd835'] : ['#22303d', '#c0392b', '#ffd166'],
      severity: cb ? ['#3b4b8f', '#6a5acd', '#fdd835'] : ['#22303d', '#c0392b', '#ffd166'],
      detection: ['#22303d', '#8a6d1f', '#f2c14e'],
      healthcare: ['#3a2020', '#4a8f6a', '#5fd39a'],
      research: ['#20303a', '#2f6f8f', '#4fc3f7'],
      transport: ['#20303a', '#2f6f8f', '#4fc3f7'],
      climate: ['#4a7fd1', '#9ec96a', '#d9553f'],
    }[mode] || ['#22303d', '#888'];
    const i = Math.min(ramps.length - 1, Math.round(k * (ramps.length - 1)));
    return ramps[i];
  }

  // ---------------- side rendering ----------------
  function renderSide() {
    clear(sideBody);
    if (sideTab === 'country') sideBody.appendChild(countryPanel());
    else if (sideTab === 'pathogen') sideBody.appendChild(pathogenPanel());
    else sideBody.appendChild(feedPanel());
  }

  function countryPanel() {
    const box = el('div', 'panel-scroll');
    const c = selected ? sim.byId[selected] : null;
    if (!c) { box.appendChild(el('p', 'muted', t('country.selectHint'))); return box; }
    const head = el('div', 'country-head');
    head.appendChild(el('h3', '', tc(c.id)));
    const status = c.detected ? t('country.detected') : (c.totalInfected > 0 ? t('country.notDetected') : t('country.clean'));
    head.appendChild(el('span', `pill ${c.detected ? 'warn' : c.totalInfected > 0 ? 'good' : ''}`, status));
    box.appendChild(head);

    const g = el('div', 'stat-grid two');
    const cell = (k, v) => { const n = el('div', 'stat-cell'); n.append(el('span', 'stat-label', t(k)), el('span', 'stat-big', v)); g.appendChild(n); };
    cell('country.population', num(c.pop));
    cell('country.infectedLocal', num(c.infected));
    cell('country.healthyLocal', num(c.healthy));
    cell('country.recoveredLocal', num(c.recovered));
    cell('country.deadLocal', num(c.dead));
    cell('country.climate', climateLabel(c));
    box.appendChild(g);

    const meters = [
      ['country.healthcare', c.health * c.healthMod],
      ['country.economy', c.wealth],
      ['country.density', c.density],
      ['country.urban', c.urban],
      ['country.response', c.response],
      ['country.awarenessLocal', c.awareness],
      ['country.borders', (c.borders + c.airClosed + c.seaClosed) / 3],
      ['country.airports', c.air * (1 - c.airClosed)],
      ['country.ports', c.sea * (1 - c.seaClosed)],
      ['country.researchLocal', Math.min(1, c.research)],
      ['country.strain', c.strain],
    ];
    for (const [k, v] of meters) {
      const row = el('div', 'meter-row');
      row.append(el('span', 'stat-label', t(k)), bar(v), el('span', 'stat-value', pct(v, 0)));
      box.appendChild(row);
    }

    const nb = LAND[c.id] || [];
    const nbRow = el('div', 'stat-row');
    nbRow.append(el('span', 'stat-label', t('country.neighbours')),
      el('span', 'stat-value', nb.length ? nb.map(tc).join(', ') : t('country.island')));
    box.appendChild(nbRow);

    // WHY panel — design principle §36
    const why = el('div', 'why-box');
    why.appendChild(el('h4', '', t('country.whyTitle')));
    const ex = sim.explain(c.id);
    const total = el('div', 'stat-row');
    total.append(el('span', 'stat-label', t('country.spreadRate')), el('span', 'stat-value', ex.beta.toFixed(3)));
    why.appendChild(total);
    for (const f of ex.factors) {
      if (Math.abs(f.v) < 0.001) continue;
      const r = el('div', 'stat-row small');
      r.append(el('span', 'stat-label', t(f.k)),
        el('span', `stat-value ${f.v >= 0 ? 'good' : 'bad'}`, `${f.v >= 0 ? '+' : ''}${(f.v * 100).toFixed(0)}%`));
      why.appendChild(r);
    }
    box.appendChild(why);
    return box;
  }

  function pathogenPanel() {
    const box = el('div', 'panel-scroll');
    const p = sim.pathogenDef, s = sim.pathogen.stats;
    box.appendChild(el('h3', '', t(`pathogen.${p.id}.name`)));
    box.appendChild(el('p', 'muted', t(`pathogen.${p.id}.trait`)));
    const keys = ['air', 'water', 'food', 'vector', 'contact', 'environ', 'infectivity', 'severity',
      'lethality', 'stealth', 'cureResist', 'drugResist', 'recoveryResist', 'mutationRate',
      'cold', 'heat', 'humid', 'arid', 'urbanAff', 'ruralAff'];
    for (const k of keys) {
      const row = el('div', 'meter-row');
      const v = s[k] || 0;
      row.append(el('span', 'stat-label', t(`stat.${k}`)), bar(Math.min(1, Math.abs(v) / 1.5)),
        el('span', 'stat-value', v.toFixed(2)));
      box.appendChild(row);
    }
    // active abilities
    const abilities = [...sim.traits].map((id) => TRAIT_BY_ID[id]).filter((x) => x?.active);
    if (abilities.length) {
      box.appendChild(el('h4', '', t('hud.abilities')));
      for (const a of abilities) {
        const st = sim.abilityState[a.id] || { cooldown: 0 };
        const row = el('div', 'ability-row');
        row.appendChild(el('span', 'stat-label', t(`trait.${a.id}.name`)));
        const b = el('button', 'btn small', st.cooldown > 0 ? t('hud.cooldown', { n: st.cooldown }) : t('hud.activate'));
        b.disabled = st.cooldown > 0;
        b.onclick = () => { const r = sim.activateAbility(a.id); if (r.ok) { app.audio.play('buy'); renderSide(); } };
        row.appendChild(b);
        box.appendChild(row);
      }
    }
    // owned traits
    const owned = [...sim.traits, ...sim.mutations];
    if (owned.length) {
      box.appendChild(el('h4', '', t('evo.owned')));
      const chips = el('div', 'chip-wrap');
      for (const id of owned) {
        const chip = el('span', `chip small${sim.mutations.has(id) ? ' mut' : ''}`, t(`trait.${id}.name`));
        tip(chip, () => t(`trait.${id}.desc`));
        chips.appendChild(chip);
      }
      box.appendChild(chips);
    }
    return box;
  }

  function feedPanel() {
    const box = el('div', 'panel-scroll feed');
    if (!sim.log.length) { box.appendChild(el('p', 'muted', t('hud.noEvents'))); return box; }
    for (const entry of [...sim.log].reverse().slice(0, 120)) {
      const item = el('div', `feed-item ${entry.severity}`);
      item.appendChild(el('span', 'feed-day', t('hud.day', { n: entry.day })));
      const key = entry.key.startsWith('event.') ? `${entry.key}.text` : entry.key;
      const args = { ...entry.args };
      if (args.country) args.country = `country.${args.country}`;
      if (args.from) args.from = `country.${args.from}`;
      item.appendChild(el('span', 'feed-text', t(key, args)));
      box.appendChild(item);
    }
    return box;
  }

  // ---------------- overlays ----------------
  let overlay = null;
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
  function openEvolution() {
    app.audio.play('click');
    closeOverlay();
    const wasSpeed = app.speedIndex;
    overlay = evolutionOverlay(app, () => { closeOverlay(); renderSide(); });
    node.appendChild(overlay);
  }
  function openData() {
    app.audio.play('click');
    closeOverlay();
    overlay = el('div', 'overlay');
    const panel = el('div', 'overlay-panel');
    const head = el('header', 'overlay-head');
    head.appendChild(el('h2', '', t('stats.title')));
    const close = el('button', 'btn ghost', `✕ ${t('ui.close')}`);
    close.onclick = closeOverlay;
    head.appendChild(close);
    panel.append(head, statsView(app));
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    node.appendChild(overlay);
  }
  function openMenu() {
    app.audio.play('click');
    closeOverlay();
    overlay = el('div', 'overlay');
    const panel = el('div', 'overlay-panel small');
    panel.appendChild(el('h2', '', t('hud.menu')));
    const list = el('div', 'menu-list');
    const mk = (key, fn) => { const b = el('button', 'menu-btn', t(key)); b.onclick = () => { app.audio.play('click'); fn(); }; list.appendChild(b); };
    mk('hud.resume', closeOverlay);
    mk('save.title', () => app.go('saves', { mode: 'save', from: 'game' }));
    mk('menu.settings', () => app.go('settings', { from: 'game' }));
    mk('menu.tutorial', () => app.go('tutorial'));
    mk('menu.achievements', () => app.go('achievements'));
    mk('menu.quit', () => confirmDialog('save.confirmOverwrite', () => { app.saveGame(0); app.quitToMenu(); }));
    panel.appendChild(list);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    node.appendChild(overlay);
    app.setSpeed(0); syncSpeed();
  }

  function showEnd() {
    closeOverlay();
    const won = sim.finished === 'win';
    overlay = el('div', 'overlay end');
    const panel = el('div', `overlay-panel end-panel ${won ? 'win' : 'lose'}`);
    panel.appendChild(el('h1', 'end-title', t(won ? 'end.victory' : 'end.defeat')));
    panel.appendChild(el('p', 'end-reason', t(sim.finishReason)));
    const m = sim.metrics();
    const grid = el('div', 'stat-grid');
    const add = (k, v) => { const c = el('div', 'stat-cell'); c.append(el('span', 'stat-label', t(k)), el('span', 'stat-big', v)); grid.appendChild(c); };
    add('hud.day', String(sim.day));
    add('stats.totalInfected', fullNum(sim.global.totalInfected));
    add('hud.dead', fullNum(sim.global.dead));
    add('stats.countriesAffected', String(m.infectedCountries));
    add('stats.researchProgress', pct(sim.research.progress));
    add('end.score', String(Math.round(
      (sim.global.totalInfected / 1e6) * (won ? 2 : 1) + m.infectedCountries * 25 - sim.day * 0.4)));
    panel.appendChild(grid);
    const row = el('div', 'row end');
    const watch = el('button', 'btn ghost', t('end.continueWatching'));
    watch.onclick = closeOverlay;
    const again = el('button', 'btn primary', t('end.newRun'));
    again.onclick = () => app.go('setup', { scenarioId: sim.scenario.id });
    const menu = el('button', 'btn', t('menu.quit'));
    menu.onclick = () => app.quitToMenu();
    row.append(watch, again, menu);
    panel.appendChild(row);
    overlay.appendChild(panel);
    node.appendChild(overlay);
  }

  // ---------------- keyboard ----------------
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); app.togglePause(); syncSpeed(); }
    else if (e.key >= '1' && e.key <= '4') { app.setSpeed(Number(e.key)); syncSpeed(); }
    else if (e.key.toLowerCase() === 'e') openEvolution();
    else if (e.key.toLowerCase() === 'w') openData();
    else if (e.key === 'Escape') { if (overlay) closeOverlay(); else openMenu(); }
    else if (e.key.toLowerCase() === 'm') {
      const i = (MAP_MODES.indexOf(map.mode) + 1) % MAP_MODES.length;
      modeBtns[MAP_MODES[i]].click();
    }
  };
  window.addEventListener('keydown', onKey);

  // ---------------- live updates ----------------
  function syncSpeed() {
    speedBtns.forEach((b, i) => b.classList.toggle('active', i === app.speedIndex));
    pauseBtn.textContent = app.speedIndex === 0 ? t('hud.resume') : t('hud.pause');
    node.classList.toggle('paused', app.speedIndex === 0);
  }

  let lastLogLen = sim.log.length;
  let sideTimer = 0;

  function frame(dt) {
    map.draw(dt);
    const g = sim.global;
    vInfected.textContent = num(g.infected);
    vHealthy.textContent = num(g.healthy);
    vRecovered.textContent = num(g.recovered);
    vDead.textContent = num(g.dead);
    epValue.textContent = String(Math.floor(sim.ep));
    epBox.classList.toggle('flash', sim.ep >= 10);
    resBar.querySelector('.bar-fill').style.width = `${sim.research.progress * 100}%`;
    resVal.textContent = pct(sim.research.progress, 1);
    dayLabel.textContent = t('hud.day', { n: sim.day });
    dateLabel.textContent = dateStr(sim.date);
    if (sim.log.length !== lastLogLen) {
      lastLogLen = sim.log.length;
      const last = sim.log[sim.log.length - 1];
      if (last && app.settings.notifications) {
        const key = last.key.startsWith('event.') ? `${last.key}.text` : last.key;
        const args = { ...last.args };
        if (args.country) args.country = `country.${args.country}`;
        if (args.from) args.from = `country.${args.from}`;
        clear(ticker);
        ticker.appendChild(el('span', `ticker-item ${last.severity}`, t(key, args)));
      }
      if (sideTab === 'feed') renderSide();
    }
    sideTimer += dt;
    if (sideTimer > 700) { sideTimer = 0; if (sideTab !== 'feed') renderSide(); }
  }

  updateLegend();
  renderSide();
  syncSpeed();
  if (sim.finished) setTimeout(showEnd, 100);

  return {
    node,
    frame,
    showEnd,
    pulse: (id, kind) => map.addPulse(id, kind),
    autosaveBlip: () => {
      autosaveTag.classList.add('show');
      setTimeout(() => autosaveTag.classList.remove('show'), 1800);
    },
    mounted: () => { map.resize(); },
    destroy: () => window.removeEventListener('keydown', onKey),
  };
}
