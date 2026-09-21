import { el, clear, num, fullNum, pct, dateStr, bar, tip, climateLabel, toast, confirmDialog } from '../util.js';
import { t, tc } from '../../i18n/index.js';
import { introOverlay } from '../tutorial.js';
import { WorldMap, MAP_MODES } from '../map.js';
import { SPEEDS } from '../app.js';
import { evolutionOverlay } from './evolution.js';
import { statsView } from './stats.js';
import { objectiveText } from './menu.js';
import { TRAIT_BY_ID } from '../../data/traits.js';
import { buildLandGraph } from '../../data/countries.js';
import { advise, cureETA, trend, hotspots, untouched, affordableCount } from '../../engine/advisor.js';

const LAND = buildLandGraph();

export function gameScreen(app) {
  const sim = app.sim;
  const node = el('div', 'screen game-screen');

  // ================= TOP BAR =================
  const top = el('header', 'hud-top');
  const brand = el('div', 'hud-brand');
  brand.appendChild(el('span', 'hud-path', t(`pathogen.${sim.pathogenDef.id}.name`)));
  brand.appendChild(el('span', 'hud-scen', `${t(`scenario.${sim.scenario.id}.name`)} · ${t(`diff.${sim.cfg.difficulty}`)}`));
  top.appendChild(brand);

  const metrics = el('div', 'hud-metrics');
  const mkMetric = (key, cls) => {
    const box = el('div', `metric ${cls}`);
    box.appendChild(el('span', 'metric-label', t(key)));
    const v = el('span', 'metric-value', '0');
    const d = el('span', 'metric-delta', '');
    box.append(v, d);
    metrics.appendChild(box);
    return { v, d, box };
  };
  const mInfected = mkMetric('hud.infected', 'inf');
  const mHealthy = mkMetric('hud.healthy', 'hea');
  const mRecovered = mkMetric('hud.recovered', 'rec');
  const mDead = mkMetric('hud.dead', 'ded');
  top.appendChild(metrics);

  const epBox = el('button', 'ep-box');
  epBox.appendChild(el('span', 'ep-label', t('hud.ep')));
  const epValue = el('span', 'ep-value', '0');
  epBox.appendChild(epValue);
  const epBadge = el('span', 'ep-badge-count', '');
  epBox.appendChild(epBadge);
  epBox.onclick = () => openEvolution();
  tip(epBox, () => t('hud.evolve'));
  top.appendChild(epBox);

  const research = el('div', 'research-box');
  const resHead = el('div', 'res-head');
  resHead.append(el('span', 'metric-label', t('hud.research')));
  const resVal = el('span', 'metric-value', '0%');
  resHead.appendChild(resVal);
  const resBar = bar(0, 'research');
  const resEta = el('div', 'res-eta', '');
  research.append(resHead, resBar, resEta);
  tip(research, () => {
    const box = el('div', 'tip-card');
    box.appendChild(el('strong', '', t('hud.research')));
    const add = (k, v) => { const r = el('div', 'tip-row'); r.append(el('span', '', k), el('span', '', v)); box.appendChild(r); };
    add(t('stats.countries'), String(sim.research.contributors));
    add(t('stat.cureResist'), pct(sim.pathogen.stats.cureResist, 0));
    add(t('hud.perDay', { v: '' }).replace('{v}', ''), `${(sim.research.speedPerDay * 100).toFixed(3)}%`);
    const eta = cureETA(sim);
    add('ETA', eta === null ? t('hud.etaNever') : t('hud.etaCure', { n: eta }));
    return box;
  });
  top.appendChild(research);

  const clock = el('div', 'clock-box');
  const dayLabel = el('div', 'clock-day', '');
  const dateLabel = el('div', 'clock-date', '');
  clock.append(dayLabel, dateLabel);
  top.appendChild(clock);
  node.appendChild(top);

  // ================= MAIN =================
  const main = el('div', 'game-main');
  const mapWrap = el('div', 'map-wrap');
  const canvas = el('canvas', 'map-canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('hud.mapMode'));
  canvas.tabIndex = 0;
  mapWrap.appendChild(canvas);

  // --- map top controls: view modes + country search ---
  const mapTop = el('div', 'map-top');
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
  mapTop.appendChild(modeBar);

  const jump = el('div', 'jump-box');
  const jumpInput = el('input', 'input tiny-input');
  jumpInput.placeholder = t('hud.jump');
  jumpInput.setAttribute('aria-label', t('hud.jump'));
  const jumpList = el('div', 'jump-results');
  jump.append(jumpInput, jumpList);
  const renderJump = () => {
    const q = jumpInput.value.trim().toLowerCase();
    clear(jumpList);
    if (!q) { jumpList.classList.remove('open'); return; }
    const hits = sim.countries
      .filter((c) => tc(c.id).toLowerCase().includes(q))
      .sort((a, b) => tc(a.id).localeCompare(tc(b.id)))
      .slice(0, 8);
    if (!hits.length) { jumpList.classList.remove('open'); return; }
    jumpList.classList.add('open');
    hits.forEach((c, i) => {
      const r = el('button', `jump-item${i === 0 ? ' first' : ''}`);
      r.append(el('span', '', tc(c.id)),
        el('span', 'muted small', c.infected > 0 ? num(c.infected) : t('country.clean')));
      r.onclick = () => selectCountry(c.id, true);
      jumpList.appendChild(r);
    });
  };
  jumpInput.oninput = renderJump;
  jumpInput.onkeydown = (e) => {
    if (e.key === 'Enter') { const f = jumpList.querySelector('.jump-item'); if (f) f.click(); }
    else if (e.key === 'Escape') { jumpInput.value = ''; renderJump(); jumpInput.blur(); }
    e.stopPropagation();
  };
  mapTop.appendChild(jump);
  mapWrap.appendChild(mapTop);

  const objBanner = el('div', 'objective-banner');
  objBanner.appendChild(el('span', 'obj-label', t('hud.objective')));
  objBanner.appendChild(el('span', 'obj-text', objectiveText(sim.scenario)));
  const objProgWrap = el('div', 'obj-progress');
  const objBar = bar(0, 'obj');
  const objPct = el('span', 'obj-pct', '0%');
  objProgWrap.append(objBar, objPct);
  objBanner.appendChild(objProgWrap);
  mapWrap.appendChild(objBanner);

  const legend = el('div', 'legend-box');
  mapWrap.appendChild(legend);

  const mapHint = el('div', 'map-hint');
  mapHint.title = t('map.source');
  mapHint.appendChild(el('span', 'muted small', t('map.zoomHint')));
  const resetBtn = el('button', 'btn tiny ghost', t('map.reset'));
  resetBtn.onclick = () => { map.resetView(); app.audio.play('click'); };
  mapHint.appendChild(resetBtn);
  mapWrap.appendChild(mapHint);

  // Floating hover card follows the cursor over the map.
  const hoverCard = el('div', 'map-hover');
  mapWrap.appendChild(hoverCard);

  main.appendChild(mapWrap);

  // ================= SIDE PANEL =================
  const side = el('aside', 'side-panel');
  const sideTabs = el('div', 'tabs');
  let sideTab = 'country';
  const tabDefs = [['country', 'stats.countries'], ['pathogen', 'stats.pathogen'],
    ['advisor', 'hud.advisor'], ['feed', 'hud.events']];
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

  // ================= BOTTOM BAR =================
  const bottom = el('footer', 'hud-bottom');
  const left = el('div', 'row');
  const pauseBtn = el('button', 'btn control pause-btn', t('hud.pause'));
  pauseBtn.onclick = () => { app.togglePause(); app.audio.play(app.speed === 0 ? 'pause' : 'resume'); syncSpeed(); };
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

  const ticker = el('button', 'ticker');
  ticker.onclick = () => { sideTab = 'feed'; syncTabs(); renderSide(); };
  tip(ticker, () => t('hud.events'));
  bottom.appendChild(ticker);

  const right = el('div', 'row');
  const soundBtn = el('button', 'btn ghost control icon-btn', '♪');
  soundBtn.onclick = () => {
    app.audio.setMuted(!app.audio.muted);
    soundBtn.classList.toggle('off', app.audio.muted);
    soundBtn.textContent = app.audio.muted ? '♪̸' : '♪';
    app.audio.play('click');
  };
  tip(soundBtn, () => (app.audio.muted ? t('hud.muted') : t('hud.sound')));
  const evoBtn = el('button', 'btn primary control evo-btn');
  evoBtn.appendChild(el('span', '', `⌁ ${t('hud.evolve')}`));
  const evoCount = el('span', 'evo-count', '');
  evoBtn.appendChild(evoCount);
  evoBtn.onclick = () => openEvolution();
  const dataBtn = el('button', 'btn control', `▤ ${t('hud.world')}`);
  dataBtn.onclick = () => openData();
  const menuBtn = el('button', 'btn ghost control', `☰ ${t('hud.menu')}`);
  menuBtn.onclick = () => openMenu();
  right.append(soundBtn, evoBtn, dataBtn, menuBtn);
  bottom.appendChild(right);
  node.appendChild(bottom);

  const autosaveTag = el('div', 'autosave-tag', t('hud.autosaved'));
  node.appendChild(autosaveTag);

  // ================= MAP WIRING =================
  let selected = sim.startCountry;
  const map = new WorldMap(canvas, {
    settings: app.settings,
    onSelect: (id) => { if (id) selectCountry(id); },
    onHover: (id, e) => {
      if (!id) { hoverCard.classList.remove('show'); return; }
      const c = sim.byId[id];
      if (!c) return;
      clear(hoverCard);
      hoverCard.appendChild(el('strong', '', tc(id)));
      const rows = [
        [t('hud.infected'), num(c.infected)],
        [t('hud.healthy'), num(c.healthy)],
        [t('country.healthcare'), pct(c.health * c.healthMod, 0)],
        [t('country.climate'), climateLabel(c)],
      ];
      if (c.dead > 0) rows.splice(2, 0, [t('hud.dead'), num(c.dead)]);
      for (const [k, v] of rows) {
        const r = el('div', 'tip-row');
        r.append(el('span', '', k), el('span', '', v));
        hoverCard.appendChild(r);
      }
      if (c.detected) hoverCard.appendChild(el('div', 'hover-flag warn', t('country.detected')));
      hoverCard.classList.add('show');
      const r = mapWrap.getBoundingClientRect();
      const x = Math.min(r.width - 210, Math.max(8, e.clientX - r.left + 16));
      const y = Math.min(r.height - 150, Math.max(8, e.clientY - r.top + 16));
      hoverCard.style.left = `${x}px`;
      hoverCard.style.top = `${y}px`;
    },
  });
  map.setSim(sim);
  map.selected = selected;

  function selectCountry(id, focus = false) {
    selected = id;
    map.selected = id;
    if (focus) { map.focus(id); jumpInput.value = ''; renderJump(); }
    sideTab = 'country';
    syncTabs();
    renderSide();
    app.audio.play('click');
  }

  function syncTabs() {
    [...sideTabs.children].forEach((c, i) => c.classList.toggle('active', tabDefs[i][0] === sideTab));
  }

  function updateLegend() {
    clear(legend);
    legend.appendChild(el('span', 'legend-title', `${t('map.legend')} — ${t(`map.${map.mode}`)}`));
    const items = map.legend();
    const strip = el('div', 'legend-strip');
    items.forEach((label, i) => {
      const cell = el('span', 'legend-cell');
      const sw = el('span', 'legend-swatch');
      sw.style.background = map.legendColor(items.length === 1 ? 1 : i / (items.length - 1));
      cell.append(sw, el('span', '', label));
      strip.appendChild(cell);
    });
    legend.appendChild(strip);
    const icons = el('div', 'legend-icons');
    [['◎', 'country.detected', '#f2c14e'], ['✈', 'map.closed', '#ff8a6a'],
      ['✚', 'country.strain', '#ff5d7a'], ['⚗', 'country.researchLocal', '#7fd4f0']].forEach(([ic, k, col]) => {
      const c = el('span', 'legend-cell');
      const i = el('span', 'legend-icon', ic);
      i.style.color = col;
      c.append(i, el('span', '', t(k)));
      icons.appendChild(c);
    });
    legend.appendChild(icons);
  }

  // ================= SIDE RENDERING =================
  function renderSide() {
    const scroll = sideBody.scrollTop;
    clear(sideBody);
    if (sideTab === 'country') sideBody.appendChild(countryPanel());
    else if (sideTab === 'pathogen') sideBody.appendChild(pathogenPanel());
    else if (sideTab === 'advisor') sideBody.appendChild(advisorPanel());
    else sideBody.appendChild(feedPanel());
    sideBody.scrollTop = scroll;
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

    const focusBtn = el('button', 'btn tiny ghost full', `◎ ${t('hud.focusCountry')}`);
    focusBtn.onclick = () => { map.focus(c.id); app.audio.play('click'); };
    box.appendChild(focusBtn);

    // population composition bar — instantly readable breakdown
    const total = Math.max(1, c.pop0);
    const comp = el('div', 'comp-bar');
    const seg = (cls, v, label) => {
      if (v <= 0) return;
      const s = el('span', `comp-seg ${cls}`);
      s.style.width = `${(v / total) * 100}%`;
      tip(s, () => `${label}: ${fullNum(v)}`);
      comp.appendChild(s);
    };
    seg('hea', c.healthy, t('hud.healthy'));
    seg('inf', c.infected, t('hud.infected'));
    seg('rec', c.recovered, t('hud.recovered'));
    seg('ded', c.dead, t('hud.dead'));
    box.appendChild(comp);

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
    const nbRow = el('div', 'neighbour-row');
    nbRow.appendChild(el('span', 'stat-label', t('country.neighbours')));
    if (!nb.length) nbRow.appendChild(el('span', 'stat-value', t('country.island')));
    else {
      const wrap = el('div', 'chip-wrap');
      for (const n of nb) {
        const chip = el('button', 'chip small', tc(n));
        chip.onclick = () => selectCountry(n, true);
        wrap.appendChild(chip);
      }
      nbRow.appendChild(wrap);
    }
    box.appendChild(nbRow);

    // WHY panel — design principle: always explain the number
    const why = el('div', 'why-box');
    why.appendChild(el('h4', '', t('country.whyTitle')));
    const ex = sim.explain(c.id);
    const total2 = el('div', 'stat-row');
    total2.append(el('span', 'stat-label', t('country.spreadRate')), el('span', 'stat-value strong', ex.beta.toFixed(3)));
    why.appendChild(total2);
    const sorted = ex.factors.filter((f) => Math.abs(f.v) > 0.001).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    for (const f of sorted) {
      const r = el('div', 'factor-row');
      r.appendChild(el('span', 'stat-label', t(f.k)));
      const track = el('span', 'factor-track');
      const fill = el('span', `factor-fill ${f.v >= 0 ? 'pos' : 'neg'}`);
      fill.style.width = `${Math.min(100, Math.abs(f.v) * 140)}%`;
      track.appendChild(fill);
      r.appendChild(track);
      r.appendChild(el('span', `stat-value ${f.v >= 0 ? 'good' : 'bad'}`, `${f.v >= 0 ? '+' : ''}${(f.v * 100).toFixed(0)}%`));
      why.appendChild(r);
    }
    box.appendChild(why);
    return box;
  }

  function pathogenPanel() {
    const box = el('div', 'panel-scroll');
    const p = sim.pathogenDef, s = sim.pathogen.stats;
    box.appendChild(el('h3', '', t(`pathogen.${p.id}.name`)));
    box.appendChild(el('p', 'muted small', t(`pathogen.${p.id}.trait`)));

    const abilities = [...sim.traits].map((id) => TRAIT_BY_ID[id]).filter((x) => x?.active);
    if (abilities.length) {
      box.appendChild(el('h4', '', t('hud.abilities')));
      for (const a of abilities) {
        const st = sim.abilityState[a.id] || { cooldown: 0 };
        const row = el('div', 'ability-row');
        row.appendChild(el('span', 'stat-label', t(`trait.${a.id}.name`)));
        const b = el('button', 'btn small', st.cooldown > 0 ? t('hud.cooldown', { n: st.cooldown }) : t('hud.activate'));
        b.disabled = st.cooldown > 0;
        if (st.cooldown === 0) b.classList.add('ready');
        b.onclick = () => { const r = sim.activateAbility(a.id); if (r.ok) { app.audio.play('ability'); renderSide(); } };
        tip(b, () => t(`trait.${a.id}.desc`));
        row.appendChild(b);
        box.appendChild(row);
      }
    }

    const groups = [
      ['cat.transmission', ['air', 'water', 'food', 'vector', 'contact', 'environ']],
      ['cat.adaptation', ['cold', 'heat', 'humid', 'arid', 'drugResist', 'recoveryResist']],
      ['cat.symptom', ['severity', 'lethality', 'infectivity', 'stealth']],
      ['hud.research', ['cureResist', 'mutationRate', 'urbanAff', 'ruralAff']],
    ];
    for (const [gk, keys] of groups) {
      box.appendChild(el('h4', '', t(gk)));
      for (const k of keys) {
        const row = el('div', 'meter-row');
        const v = s[k] || 0;
        row.append(el('span', 'stat-label', t(`stat.${k}`)), bar(Math.min(1, Math.abs(v) / 1.5)),
          el('span', 'stat-value', v.toFixed(2)));
        box.appendChild(row);
      }
    }

    const owned = [...sim.traits, ...sim.mutations];
    if (owned.length) {
      box.appendChild(el('h4', '', t('evo.totalOwned', { n: owned.length })));
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

  function advisorPanel() {
    const box = el('div', 'panel-scroll');
    const a = advise(sim);
    const card = el('div', `advisor-card ${a.urgency}`);
    card.appendChild(el('div', 'advisor-icon', a.urgency === 'bad' ? '⚠' : a.urgency === 'warn' ? '◆' : '◈'));
    card.appendChild(el('p', '', t(a.key)));
    if (a.trait) {
      const b = el('button', 'btn small primary', `${t('evo.buy')}: ${t(`trait.${a.trait}.name`)} · ${sim.traitCost(a.trait)} ${t('hud.epShort')}`);
      b.disabled = !sim.canBuy(a.trait).ok;
      b.onclick = () => {
        const r = sim.buyTrait(a.trait);
        if (r.ok) { app.audio.play('buy'); renderSide(); } else { app.audio.play('deny'); toast(t('evo.cannotAfford'), 'bad'); }
      };
      card.appendChild(b);
    }
    box.appendChild(card);

    // key readouts
    const eta = cureETA(sim);
    const readouts = el('div', 'panel');
    const add = (k, v, cls = '') => {
      const r = el('div', 'stat-row');
      r.append(el('span', 'stat-label', k), el('span', `stat-value ${cls}`, v));
      readouts.appendChild(r);
    };
    const infT = trend(sim, 'inf');
    const tKey = infT > 1000 ? 'hud.trend.rising' : infT < -1000 ? 'hud.trend.falling' : 'hud.trend.steady';
    add(t('hud.infected'), `${num(sim.global.infected)} (${t(tKey)})`, infT > 0 ? 'good' : infT < 0 ? 'bad' : '');
    add(t('hud.research'), eta === null ? t('hud.etaNever') : t('hud.etaCure', { n: eta }), eta !== null && eta < 120 ? 'bad' : '');
    add(t('stats.countriesAffected'), `${sim.metrics().infectedCountries} / ${sim.countries.length}`);
    add(t('hud.awareness'), pct(sim.global.awareness, 0));
    box.appendChild(readouts);

    // hotspots
    box.appendChild(el('h4', '', t('hud.topCountries')));
    const hs = hotspots(sim, 6);
    if (!hs.length) box.appendChild(el('p', 'muted small', t('hud.noHotspots')));
    for (const c of hs) {
      const r = el('button', 'list-row');
      r.append(el('span', '', tc(c.id)), el('span', 'stat-value', num(c.infected)));
      r.onclick = () => selectCountry(c.id, true);
      box.appendChild(r);
    }

    // biggest untouched populations — where to aim next
    const un = untouched(sim, 5);
    if (un.length) {
      box.appendChild(el('h4', '', t('hud.unaffected')));
      for (const c of un) {
        const r = el('button', 'list-row');
        r.append(el('span', '', tc(c.id)), el('span', 'stat-value muted', num(c.pop)));
        r.onclick = () => selectCountry(c.id, true);
        box.appendChild(r);
      }
    }
    return box;
  }

  function feedPanel() {
    const box = el('div', 'panel-scroll feed');
    if (!sim.log.length) { box.appendChild(el('p', 'muted', t('hud.noEvents'))); return box; }
    for (const entry of [...sim.log].reverse().slice(0, 120)) {
      const item = el('div', `feed-item ${entry.severity}`);
      item.appendChild(el('span', 'feed-day', String(entry.day)));
      const key = entry.key.startsWith('event.') ? `${entry.key}.text` : entry.key;
      const args = { ...entry.args };
      if (args.country) args.country = `country.${args.country}`;
      if (args.from) args.from = `country.${args.from}`;
      item.appendChild(el('span', 'feed-text', t(key, args)));
      if (entry.args.country) {
        item.classList.add('clickable');
        item.onclick = () => selectCountry(entry.args.country, true);
      }
      box.appendChild(item);
    }
    return box;
  }

  // ================= OVERLAYS =================
  let overlay = null;
  let overlayCleanup = null;
  let resumeAfterOverlay = false;
  function closeOverlay() {
    if (!overlay) return;
    overlayCleanup?.(); overlayCleanup = null;
    overlay.remove();
    overlay = null;
    if (resumeAfterOverlay) { app.setSpeed(prevSpeed); resumeAfterOverlay = false; syncSpeed(); }
  }
  let prevSpeed = 1;
  function pauseForOverlay() {
    if (app.speedIndex > 0) { prevSpeed = app.speedIndex; resumeAfterOverlay = true; app.setSpeed(0); syncSpeed(); }
  }

  function showIntro() {
    closeOverlay();
    app.setSpeed(0); syncSpeed();
    const intro = introOverlay(app, closeOverlay);
    overlay = intro.node; overlayCleanup = intro.destroy;
    node.appendChild(overlay); intro.mounted();
  }

  function openEvolution() {
    app.audio.play('click');
    closeOverlay();
    pauseForOverlay();
    overlay = evolutionOverlay(app, () => { closeOverlay(); renderSide(); });
    node.appendChild(overlay);
  }
  function openData() {
    app.audio.play('click');
    closeOverlay();
    pauseForOverlay();
    overlay = el('div', 'overlay');
    const panel = el('div', 'overlay-panel');
    const head = el('header', 'overlay-head');
    head.appendChild(el('h2', '', t('stats.title')));
    const close = el('button', 'btn ghost', `✕ ${t('ui.close')}`);
    close.onclick = closeOverlay;
    head.appendChild(close);
    panel.append(head, statsView(app, { onPick: (id) => { closeOverlay(); selectCountry(id, true); } }));
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    node.appendChild(overlay);
  }
  function openMenu() {
    app.audio.play('click');
    closeOverlay();
    pauseForOverlay();
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
    const keys = el('div', 'shortcut-list');
    keys.appendChild(el('h4', '', t('hud.shortcuts')));
    [['Space', t('hud.pause')], ['1–4', t('hud.speed')], ['E', t('hud.evolve')],
      ['W', t('hud.world')], ['A', t('hud.advisor')], ['F', t('hud.jump')],
      ['M', t('hud.mapMode')], ['Esc', t('ui.close')]].forEach(([k, v]) => {
      const r = el('div', 'stat-row small');
      r.append(el('kbd', '', k), el('span', 'stat-label', v));
      keys.appendChild(r);
    });
    panel.appendChild(keys);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    node.appendChild(overlay);
  }

  function showEnd() {
    overlayCleanup?.(); overlayCleanup = null;
    if (overlay) { overlay.remove(); overlay = null; }
    resumeAfterOverlay = false;
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

  // ================= KEYBOARD =================
  const onKey = (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (overlay && k !== 'escape') return;
    if (e.code === 'Space') { e.preventDefault(); app.togglePause(); app.audio.play(app.speed === 0 ? 'pause' : 'resume'); syncSpeed(); }
    else if (e.key >= '1' && e.key <= '4') { app.setSpeed(Number(e.key)); syncSpeed(); }
    else if (k === 'e') openEvolution();
    else if (k === 'w') openData();
    else if (k === 'a') { sideTab = 'advisor'; syncTabs(); renderSide(); }
    else if (k === 'f') { e.preventDefault(); jumpInput.focus(); }
    else if (k === 'escape') { if (overlay) closeOverlay(); else openMenu(); }
    else if (k === 'm') {
      const i = (MAP_MODES.indexOf(map.mode) + 1) % MAP_MODES.length;
      modeBtns[MAP_MODES[i]].click();
    } else if (k === '+' || k === '=') map.zoomAt(map.w / 2, map.h / 2, 1.25);
    else if (k === '-') map.zoomAt(map.w / 2, map.h / 2, 0.8);
  };
  window.addEventListener('keydown', onKey);

  // ================= LIVE UPDATES =================
  function syncSpeed() {
    speedBtns.forEach((b, i) => b.classList.toggle('active', i === app.speedIndex));
    pauseBtn.textContent = app.speedIndex === 0 ? t('hud.resume') : t('hud.pause');
    pauseBtn.classList.toggle('paused', app.speedIndex === 0);
    node.classList.toggle('paused', app.speedIndex === 0);
  }

  let lastLogLen = sim.log.length;
  let hudKey = null;
  let sideElapsed = 0;
  let sideDirty = false;
  let sideState = null;
  let prev = { inf: 0, hea: 0, rec: 0, ded: 0 };

  function objectiveProgress() {
    const o = sim.scenario.objective, g = sim.global;
    if (o.type === 'killShare') return g.dead / Math.max(1, sim.totalPop0()) / o.value;
    if (o.type === 'infectShareByDay') return g.infectedShare / o.value;
    return 1 - g.healthy / Math.max(1, sim.totalPop0());
  }

  function frame(dt) {
    sideElapsed += dt;
    if (sideDirty && sideElapsed >= 500 && !overlay) {
      renderSide(); sideDirty = false; sideElapsed = 0;
    }
    map.motionActive = app.speed > 0 && !overlay;
    if (!overlay) map.draw(dt);
    const key = [sim.day, sim.ep, app.speedIndex, sim.traits.size, sim.mutations.size, sim.log.length].join('|');
    if (key === hudKey) return;
    const firstFrame = hudKey === null;
    hudKey = key;
    syncSpeed();
    const g = sim.global;
    const setMetric = (m, val, key) => {
      m.v.textContent = num(val);
      const d = val - prev[key];
      prev[key] = val;
      if (Math.abs(d) > 1 && app.speed > 0) {
        m.d.textContent = d > 0 ? `▲` : `▼`;
        m.d.className = `metric-delta ${d > 0 ? 'up' : 'down'}`;
      } else if (app.speed === 0) m.d.textContent = '';
    };
    setMetric(mInfected, g.infected || 0, 'inf');
    setMetric(mHealthy, g.healthy || 0, 'hea');
    setMetric(mRecovered, g.recovered || 0, 'rec');
    setMetric(mDead, g.dead || 0, 'ded');

    epValue.textContent = String(Math.floor(sim.ep));
    const aff = affordableCount(sim);
    epBox.classList.toggle('flash', aff > 0);
    evoBtn.classList.toggle('has-new', aff > 0);
    evoCount.textContent = aff > 0 ? String(aff) : '';
    epBadge.textContent = aff > 0 ? `+${aff}` : '';

    resBar.querySelector('.bar-fill').style.width = `${sim.research.progress * 100}%`;
    resVal.textContent = pct(sim.research.progress, 1);
    research.classList.toggle('critical', sim.research.progress > 0.75);
    const eta = cureETA(sim);
    resEta.textContent = sim.global.detected
      ? (eta === null ? t('hud.etaNever') : t('hud.etaCure', { n: eta }))
      : '';

    const op = Math.max(0, Math.min(1, objectiveProgress()));
    objBar.querySelector('.bar-fill').style.width = `${op * 100}%`;
    objPct.textContent = pct(op, 0);

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
      if (sideTab === 'feed') sideDirty = true;
    }
    const nextSideState = [sim.day, sim.ep, sim.traits.size, sim.mutations.size].join('|');
    if (!firstFrame && nextSideState !== sideState && sideTab !== 'feed') sideDirty = true;
    sideState = nextSideState;
  }

  updateLegend();
  renderSide();
  syncSpeed();
  const endTimer = sim.finished ? setTimeout(showEnd, 120) : null;
  let autosaveTimer = null;

  return {
    node,
    frame,
    showEnd,
    showIntro,
    pulse: (id, kind) => map.addPulse(id, kind),
    autosaveBlip: () => {
      autosaveTag.classList.add('show');
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => autosaveTag.classList.remove('show'), 1800);
    },
    mounted: () => { map.resize(); },
    destroy: () => { window.removeEventListener('keydown', onKey); map.destroy(); overlayCleanup?.(); clearTimeout(endTimer); clearTimeout(autosaveTimer); },
  };
}
