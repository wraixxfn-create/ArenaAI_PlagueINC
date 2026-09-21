import { el, clear, tip, signed, pct, toast } from '../util.js';
import { t } from '../../i18n/index.js';
import { TRAITS, TRAIT_CATEGORIES, TRAIT_BY_ID } from '../../data/traits.js';

const PCT_STATS = new Set(['air', 'water', 'food', 'vector', 'contact', 'environ', 'infectivity',
  'stealth', 'cureResist', 'drugResist', 'recoveryResist', 'urbanAff', 'ruralAff',
  'cold', 'heat', 'humid', 'arid', 'airTravel', 'seaTravel', 'landTravel', 'mutationRate']);

export function effectLines(trait) {
  const out = [];
  for (const [k, v] of Object.entries(trait.effects || {})) {
    const label = t(`stat.${k}`);
    const val = PCT_STATS.has(k) ? signed(v * 100, 0) + '%' : signed(v, 2);
    const good = (k === 'severity' && v > 0) ? false : v > 0;
    out.push({ label, val, good });
  }
  return out;
}

export function traitTooltip(sim, id) {
  const trait = TRAIT_BY_ID[id];
  const box = el('div', 'tip-card');
  box.appendChild(el('strong', '', t(`trait.${id}.name`)));
  box.appendChild(el('p', 'tip-desc', t(`trait.${id}.desc`)));
  const owned = sim.traits.has(id);
  const mutated = sim.mutations.has(id);
  const effects = effectLines(trait);
  if (effects.length) {
    box.appendChild(el('div', 'tip-head', t('evo.effects')));
    for (const e of effects) {
      const r = el('div', 'tip-row');
      r.append(el('span', '', e.label), el('span', e.good ? 'good' : 'bad', e.val));
      box.appendChild(r);
    }
  }
  if (trait.active) {
    box.appendChild(el('div', 'tip-head', t('evo.activeAbility')));
  }
  if (trait.req.length) {
    const missing = trait.req.filter((r) => !sim.traits.has(r));
    const r = el('div', 'tip-row');
    r.append(el('span', '', t('evo.locked')),
      el('span', missing.length ? 'bad' : 'good', trait.req.map((x) => t(`trait.${x}.name`)).join(', ')));
    box.appendChild(r);
  }
  const cost = el('div', 'tip-row cost');
  cost.append(el('span', '', t('evo.cost')),
    el('span', sim.ep >= sim.traitCost(id) ? 'good' : 'bad',
      owned ? t('evo.owned') : mutated ? t('evo.mutated') : `${sim.traitCost(id)} ${t('hud.epShort')}`));
  box.appendChild(cost);
  return box;
}

export function evolutionOverlay(app, onClose) {
  const sim = app.sim;
  const back = el('div', 'overlay');
  const panel = el('div', 'overlay-panel evo-panel');
  const head = el('header', 'overlay-head');
  head.appendChild(el('h2', '', t('evo.title')));
  const epBadge = el('div', 'ep-badge');
  const closeBtn = el('button', 'btn ghost', `✕ ${t('evo.close')}`);
  closeBtn.onclick = () => { app.audio.play('click'); onClose(); };
  head.append(epBadge, closeBtn);
  panel.appendChild(head);

  let filter = 'all';
  const tabs = el('div', 'tabs');
  const mkTab = (id, label, color) => {
    const b = el('button', `tab${filter === id ? ' active' : ''}`, label);
    if (color) b.style.setProperty('--accent', color);
    b.onclick = () => { filter = id; app.audio.play('click'); render(); };
    tabs.appendChild(b);
  };
  const body = el('div', 'evo-body');
  panel.append(tabs, body);

  const detail = el('aside', 'evo-detail');
  panel.appendChild(detail);

  function render() {
    epBadge.textContent = `${Math.floor(sim.ep)} ${t('hud.epShort')}`;
    clear(tabs);
    mkTab('all', t('evo.filterAll'));
    for (const c of TRAIT_CATEGORIES) mkTab(c.id, t(c.key), c.color);
    clear(body);
    const cats = filter === 'all' ? TRAIT_CATEGORIES : TRAIT_CATEGORIES.filter((c) => c.id === filter);
    for (const cat of cats) {
      const sec = el('section', 'evo-cat');
      sec.style.setProperty('--accent', cat.color);
      sec.appendChild(el('h3', 'evo-cat-title', t(cat.key)));
      const nodes = TRAITS.filter((tr) => tr.cat === cat.id);
      const cols = Math.max(...nodes.map((n) => n.x)) + 1;
      const rows = Math.max(...nodes.map((n) => n.y)) + 1;
      const grid = el('div', 'evo-grid');
      grid.style.gridTemplateColumns = `repeat(${cols}, minmax(120px, 1fr))`;
      grid.style.gridTemplateRows = `repeat(${rows}, auto)`;
      // connector layer
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'evo-links');
      grid.appendChild(svg);
      for (const tr of nodes) {
        grid.appendChild(traitNode(app, tr, render, detail));
      }
      sec.appendChild(grid);
      requestAnimationFrame(() => drawLinks(svg, grid, nodes, sim));
      body.appendChild(sec);
    }
    renderDetail(app, detail, null, render);
  }

  function drawLinks(svg, grid, nodes, sim) {
    const gb = grid.getBoundingClientRect();
    svg.setAttribute('width', gb.width); svg.setAttribute('height', gb.height);
    svg.innerHTML = '';
    for (const tr of nodes) {
      const to = grid.querySelector(`[data-trait="${tr.id}"]`);
      if (!to) continue;
      for (const r of tr.req) {
        const from = grid.querySelector(`[data-trait="${r}"]`);
        if (!from) continue;
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const x1 = a.left - gb.left + a.width / 2, y1 = a.top - gb.top + a.height;
        const x2 = b.left - gb.left + b.width / 2, y2 = b.top - gb.top;
        line.setAttribute('d', `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`);
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', sim.traits.has(r) ? 'rgba(120,220,180,0.55)' : 'rgba(150,180,200,0.2)');
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
      }
    }
  }

  render();
  back.appendChild(panel);
  back.addEventListener('click', (e) => { if (e.target === back) onClose(); });
  return back;
}

function traitNode(app, tr, rerender, detail) {
  const sim = app.sim;
  const owned = sim.traits.has(tr.id);
  const mutated = sim.mutations.has(tr.id);
  const chk = sim.canBuy(tr.id);
  const affordable = chk.ok;
  const locked = !owned && chk.reason === 'req';
  const node = el('button', `evo-node${owned ? ' owned' : ''}${mutated ? ' mutated' : ''}${affordable ? ' affordable' : ''}${locked ? ' locked' : ''}`);
  node.dataset.trait = tr.id;
  node.style.gridColumn = tr.x + 1;
  node.style.gridRow = tr.y + 1;
  node.appendChild(el('span', 'node-icon', tr.active ? '⚡' : owned ? '✔' : mutated ? '✦' : '◆'));
  node.appendChild(el('span', 'node-name', t(`trait.${tr.id}.name`)));
  node.appendChild(el('span', 'node-cost', owned ? t('evo.owned') : mutated ? t('evo.mutated') : `${sim.traitCost(tr.id)} ${t('hud.epShort')}`));
  tip(node, () => traitTooltip(sim, tr.id));
  node.onpointerenter = () => { app.audio.play('hover'); renderDetail(app, detail, tr.id, rerender); };
  node.onclick = () => {
    if (owned || mutated) { renderDetail(app, detail, tr.id, rerender); return; }
    const res = sim.buyTrait(tr.id);
    if (res.ok) { app.audio.play('buy'); rerender(); }
    else { app.audio.play('deny'); toast(res.reason === 'ep' ? t('evo.cannotAfford') : t('evo.locked'), 'bad'); }
  };
  return node;
}

function renderDetail(app, detail, id, rerender) {
  const sim = app.sim;
  clear(detail);
  if (!id) {
    detail.appendChild(el('p', 'muted', t('country.selectHint')));
    // pathogen summary
    const s = sim.pathogen.stats;
    const box = el('div', 'panel');
    box.appendChild(el('h4', '', t(`pathogen.${sim.pathogenDef.id}.name`)));
    for (const k of ['air', 'water', 'food', 'vector', 'contact', 'environ', 'severity', 'lethality', 'stealth', 'cureResist']) {
      const r = el('div', 'stat-row small');
      r.append(el('span', 'stat-label', t(`stat.${k}`)),
        el('span', 'stat-value', PCT_STATS.has(k) ? pct(s[k], 0) : s[k].toFixed(2)));
      box.appendChild(r);
    }
    detail.appendChild(box);
    return;
  }
  const tr = TRAIT_BY_ID[id];
  detail.appendChild(traitTooltip(sim, id));
  const actions = el('div', 'row');
  if (!sim.traits.has(id)) {
    const buy = el('button', 'btn primary', `${t('evo.buy')} · ${sim.traitCost(id)} ${t('hud.epShort')}`);
    buy.disabled = !sim.canBuy(id).ok;
    buy.onclick = () => {
      const r = sim.buyTrait(id);
      if (r.ok) { app.audio.play('buy'); rerender(); } else { app.audio.play('deny'); toast(t('evo.cannotAfford'), 'bad'); }
    };
    actions.appendChild(buy);
  } else {
    const dev = el('button', 'btn ghost', t('evo.devolve'));
    dev.onclick = () => {
      const r = sim.refundTrait(id);
      if (r.ok) { app.audio.play('click'); rerender(); }
      else { app.audio.play('deny'); toast(t('evo.dependentTrait'), 'bad'); }
    };
    actions.appendChild(dev);
    if (tr.active) {
      const st = sim.abilityState[id] || { cooldown: 0 };
      const act = el('button', 'btn', st.cooldown > 0 ? t('hud.cooldown', { n: st.cooldown }) : t('hud.activate'));
      act.disabled = st.cooldown > 0;
      act.onclick = () => { const r = sim.activateAbility(id); if (r.ok) { app.audio.play('buy'); rerender(); } };
      actions.appendChild(act);
    }
  }
  detail.appendChild(actions);
}
