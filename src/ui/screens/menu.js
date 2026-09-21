import { h, el, clear, toast, confirmDialog, num } from '../util.js';
import { t, availableLanguages, getLang } from '../../i18n/index.js';
import * as store from '../storage.js';
import { ACHIEVEMENTS } from '../../data/achievements.js';
import { SCENARIOS } from '../../data/scenarios.js';

const VERSION = '1.0.0';

function bg() {
  const n = el('div', 'menu-bg');
  n.innerHTML = `<svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="mg" cx="50%" cy="40%">
        <stop offset="0%" stop-color="#16394d"/><stop offset="100%" stop-color="#070d14"/>
      </radialGradient>
    </defs>
    <rect width="200" height="120" fill="url(#mg)"/>
    ${Array.from({ length: 60 }, (_, i) => {
      const x = (i * 37) % 200, y = (i * 53) % 120, r = 0.4 + (i % 5) * 0.28;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#5fd4f0" opacity="${0.08 + (i % 7) * 0.02}"/>`;
    }).join('')}
    ${Array.from({ length: 26 }, (_, i) => {
      const x1 = (i * 37) % 200, y1 = (i * 53) % 120, x2 = (x1 + 30 + i * 3) % 200, y2 = (y1 + 20 + i * 5) % 120;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4aa8c8" stroke-width="0.15" opacity="0.18"/>`;
    }).join('')}
  </svg>`;
  return n;
}

export function menuScreen(app) {
  const node = el('div', 'screen menu-screen');
  node.appendChild(bg());
  const panel = el('div', 'menu-panel');
  const title = el('div', 'brand');
  title.appendChild(el('h1', 'brand-title', t('app.title')));
  title.appendChild(el('p', 'brand-sub', t('app.tagline')));
  panel.appendChild(title);

  const list = el('nav', 'menu-list');
  const mk = (key, fn, opts = {}) => {
    const b = el('button', `menu-btn${opts.primary ? ' primary' : ''}${opts.disabled ? ' disabled' : ''}`);
    b.appendChild(el('span', 'menu-btn-label', t(key)));
    if (opts.note) b.appendChild(el('span', 'menu-btn-note', opts.note));
    b.disabled = !!opts.disabled;
    b.onclick = () => { app.audio.play('click'); fn(); };
    b.onpointerenter = () => app.audio.play('hover');
    list.appendChild(b);
    return b;
  };

  const last = store.latestSave();
  mk('menu.newGame', () => app.go('setup', { scenarioId: 'global' }), { primary: true });
  mk('menu.continue', () => { if (last) app.loadGame(last.index); },
    { disabled: !last, note: last ? t('save.meta', { pathogen: last.meta.pathogen, scenario: last.meta.scenario, day: last.meta.day }) : t('menu.noSave') });
  mk('menu.scenarios', () => app.go('scenarios'));
  mk('menu.custom', () => app.go('setup', { scenarioId: 'custom', custom: true }));
  mk('menu.load', () => app.go('saves', { mode: 'load' }));
  mk('menu.tutorial', () => app.go('tutorial'));
  mk('menu.statistics', () => app.go('stats', { standalone: true }));
  mk('menu.achievements', () => app.go('achievements'));
  mk('menu.settings', () => app.go('settings'));
  mk('menu.credits', () => app.go('credits'));
  panel.appendChild(list);

  // quick language switch
  const langRow = el('div', 'lang-row');
  langRow.appendChild(el('span', 'lang-label', `${t('menu.language')}:`));
  for (const l of availableLanguages()) {
    const b = el('button', `chip${getLang() === l.code ? ' active' : ''}`, l.label);
    b.onclick = () => { app.audio.play('click'); app.setLanguage(l.code); };
    langRow.appendChild(b);
  }
  panel.appendChild(langRow);
  panel.appendChild(el('div', 'menu-version', t('menu.version', { v: VERSION })));
  node.appendChild(panel);

  const stats = el('aside', 'menu-side');
  const p = app.profile;
  const unlocked = Object.keys(p.achievements).length;
  stats.appendChild(el('h3', '', t('stats.lifetime')));
  const rows = [
    [t('stats.gamesPlayed'), p.gamesPlayed],
    [t('stats.gamesWon'), p.gamesWon],
    [t('stats.bestDay'), p.bestDay ?? '—'],
    [t('stats.mostInfected'), p.mostInfected ? num(p.mostInfected) : '—'],
    [t('menu.achievements'), `${unlocked}/${ACHIEVEMENTS.length}`],
  ];
  for (const [k, v] of rows) {
    const r = el('div', 'stat-row');
    r.append(el('span', 'stat-label', k), el('span', 'stat-value', String(v)));
    stats.appendChild(r);
  }
  node.appendChild(stats);
  return { node };
}

export function scenariosScreen(app) {
  const node = el('div', 'screen list-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go('menu');
  head.append(back, el('h2', '', t('menu.scenarios')));
  node.appendChild(head);
  const grid = el('div', 'card-grid');
  for (const s of SCENARIOS) {
    const card = el('button', 'card scenario-card');
    card.appendChild(el('div', 'card-icon', iconFor(s.icon)));
    card.appendChild(el('h3', '', t(`scenario.${s.id}.name`)));
    card.appendChild(el('p', 'card-desc', t(`scenario.${s.id}.desc`)));
    const obj = el('div', 'card-tag', t('hud.objective') + ': ' + objectiveText(s));
    card.appendChild(obj);
    card.onclick = () => { app.audio.play('click'); app.go('setup', { scenarioId: s.id, custom: !!s.custom }); };
    grid.appendChild(card);
  }
  node.appendChild(grid);
  return { node };
}

export function objectiveText(scenario) {
  const o = scenario.objective;
  if (o.type === 'infectAll') return t('obj.infectAll');
  if (o.type === 'killShare') return t('obj.killShare', { p: `${Math.round(o.value * 100)}%` });
  if (o.type === 'infectShareByDay') return t('obj.infectShareByDay', { p: `${Math.round(o.value * 100)}%`, d: o.day });
  return '';
}

export function iconFor(kind) {
  const map = { globe: '◉', island: '⛰', siren: '⚑', cross: '✚', thermo: '🌡', dna: '⌁', clock: '◷', sliders: '⚙' };
  return map[kind] || '◆';
}

export function creditsScreen(app) {
  const node = el('div', 'screen list-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go('menu');
  head.append(back, el('h2', '', t('menu.credits')));
  node.appendChild(head);
  const box = el('div', 'panel prose');
  box.appendChild(el('h3', '', t('app.title')));
  box.appendChild(el('p', '', t('credits.body')));
  for (const role of ['design', 'code', 'art', 'audio', 'loc']) {
    const r = el('div', 'stat-row');
    r.append(el('span', 'stat-label', t(`credits.role.${role}`)), el('span', 'stat-value', t('credits.studio')));
    box.appendChild(r);
  }
  node.appendChild(box);
  return { node };
}

export function achievementsScreen(app) {
  const node = el('div', 'screen list-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go(app.sim ? 'game' : 'menu');
  const unlocked = Object.keys(app.profile.achievements).length;
  head.append(back, el('h2', '', `${t('menu.achievements')} — ${unlocked}/${ACHIEVEMENTS.length}`));
  node.appendChild(head);
  const grid = el('div', 'card-grid tight');
  for (const a of ACHIEVEMENTS) {
    const got = !!app.profile.achievements[a.id];
    const card = el('div', `card ach${got ? ' got' : ' locked'}`);
    card.appendChild(el('div', 'card-icon', got ? a.icon : '🔒'));
    card.appendChild(el('h3', '', t(`ach.${a.id}.name`)));
    card.appendChild(el('p', 'card-desc', t(`ach.${a.id}.desc`)));
    card.appendChild(el('div', 'card-tag', got ? t('ui.unlocked') : t('ui.locked')));
    grid.appendChild(card);
  }
  node.appendChild(grid);
  return { node };
}

export function tutorialScreen(app) {
  const node = el('div', 'screen list-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go(app.sim ? 'game' : 'menu');
  head.append(back, el('h2', '', t('tut.title')));
  node.appendChild(head);
  let page = 1;
  const TOTAL = 10;
  const box = el('div', 'panel tutorial-box');
  const body = el('div', 'tutorial-body');
  const nav = el('div', 'row between tutorial-nav');
  const prev = el('button', 'btn ghost', t('setup.prev'));
  const next = el('button', 'btn', t('ui.next'));
  const skip = el('button', 'btn ghost', t('ui.skip'));
  const dots = el('div', 'dots');
  const render = () => {
    clear(body);
    body.appendChild(el('h3', '', t(`tut.${page}.title`)));
    body.appendChild(el('p', '', t(`tut.${page}.body`)));
    clear(dots);
    for (let i = 1; i <= TOTAL; i++) {
      const d = el('span', `dot${i === page ? ' on' : ''}`);
      d.onclick = () => { page = i; render(); };
      dots.appendChild(d);
    }
    prev.disabled = page === 1;
    next.textContent = page === TOTAL ? t('ui.ok') : t('ui.next');
  };
  prev.onclick = () => { page = Math.max(1, page - 1); app.audio.play('click'); render(); };
  next.onclick = () => {
    app.audio.play('click');
    if (page === TOTAL) app.go(app.sim ? 'game' : 'menu'); else { page++; render(); }
  };
  skip.onclick = () => app.go(app.sim ? 'game' : 'menu');
  nav.append(prev, dots, next);
  box.append(body, nav, skip);
  node.appendChild(box);
  render();
  return { node };
}

export function savesScreen(app, params = {}) {
  const mode = params.mode || 'save';
  const node = el('div', 'screen list-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go(params.from || (app.sim ? 'game' : 'menu'));
  head.append(back, el('h2', '', t('save.title')));
  node.appendChild(head);
  const list = el('div', 'save-list');
  const render = () => {
    clear(list);
    for (const slot of store.listSlots()) {
      const row = el('div', 'save-row');
      const label = slot.index === 0 ? t('save.auto') : t('save.slot', { n: slot.index });
      const info = el('div', 'save-info');
      info.appendChild(el('strong', '', label));
      info.appendChild(el('span', 'muted', slot.meta
        ? t('save.meta', { pathogen: t(slot.meta.pathogen), scenario: t(slot.meta.scenario), day: slot.meta.day })
        : t('save.empty')));
      row.appendChild(info);
      const actions = el('div', 'row');
      if (mode === 'save' && app.sim && slot.index !== 0) {
        const b = el('button', 'btn small', t('save.save'));
        b.onclick = () => {
          const doSave = () => { app.saveGame(slot.index); render(); };
          if (slot.meta) confirmDialog('save.confirmOverwrite', doSave); else doSave();
        };
        actions.appendChild(b);
      }
      if (slot.meta) {
        const l = el('button', 'btn small', t('save.load'));
        l.onclick = () => app.loadGame(slot.index);
        const d = el('button', 'btn small danger', t('save.delete'));
        d.onclick = () => confirmDialog('save.confirmDelete', () => { store.deleteSlot(slot.index); render(); });
        actions.append(l, d);
      }
      row.appendChild(actions);
      list.appendChild(row);
    }
  };
  render();
  node.appendChild(list);
  return { node };
}
