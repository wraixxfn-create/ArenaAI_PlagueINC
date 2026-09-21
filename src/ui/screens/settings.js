import { el, clear, toast } from '../util.js';
import { t, availableLanguages, getLang } from '../../i18n/index.js';
import { SPEEDS } from '../app.js';

export function settingsScreen(app, params = {}) {
  const node = el('div', 'screen list-screen');
  const head = el('header', 'screen-head');
  const back = el('button', 'btn ghost', `← ${t('menu.back')}`);
  back.onclick = () => app.go(params.from || (app.sim ? 'game' : 'menu'));
  head.append(back, el('h2', '', t('menu.settings')));
  node.appendChild(head);

  const s = app.settings;
  const commit = () => { app.saveSettings(); };

  const section = (titleKey) => {
    const box = el('section', 'panel settings-section');
    box.appendChild(el('h3', '', t(titleKey)));
    node.appendChild(box);
    return box;
  };

  const toggle = (box, key, field) => {
    const row = el('div', 'setting-row');
    row.appendChild(el('span', 'stat-label', t(key)));
    const b = el('button', `switch${s[field] ? ' on' : ''}`);
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(!!s[field]));
    b.appendChild(el('span', 'knob'));
    b.appendChild(el('span', 'switch-text', s[field] ? t('settings.on') : t('settings.off')));
    b.onclick = () => {
      s[field] = !s[field]; commit(); app.audio.play('click');
      b.classList.toggle('on', s[field]);
      b.setAttribute('aria-checked', String(!!s[field]));
      b.querySelector('.switch-text').textContent = s[field] ? t('settings.on') : t('settings.off');
    };
    row.appendChild(b);
    box.appendChild(row);
  };

  const slider = (box, key, field, min, max, step, fmt = (v) => v.toFixed(2)) => {
    const row = el('div', 'setting-row');
    row.appendChild(el('span', 'stat-label', t(key)));
    const input = el('input', 'slider');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = s[field];
    const val = el('span', 'stat-value', fmt(s[field]));
    input.oninput = () => { s[field] = parseFloat(input.value); val.textContent = fmt(s[field]); commit(); };
    row.append(input, val);
    box.appendChild(row);
  };

  const choice = (box, key, field, options) => {
    const row = el('div', 'setting-row');
    row.appendChild(el('span', 'stat-label', t(key)));
    const group = el('div', 'chip-group');
    for (const o of options) {
      const b = el('button', `chip${s[field] === o.value ? ' active' : ''}`, o.label);
      b.onclick = () => {
        s[field] = o.value; commit(); app.audio.play('click');
        [...group.children].forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
      };
      group.appendChild(b);
    }
    row.appendChild(group);
    box.appendChild(row);
  };

  // ---- Language (first, most important per spec) ----
  const langBox = section('settings.language');
  const langGroup = el('div', 'chip-group big');
  for (const l of availableLanguages()) {
    const b = el('button', `chip${getLang() === l.code ? ' active' : ''}`, l.label);
    b.onclick = () => {
      app.audio.play('click');
      app.setLanguage(l.code);   // rerenders this screen in the new language
      toast(t('settings.langApplied'), 'good');
    };
    langGroup.appendChild(b);
  }
  langBox.appendChild(langGroup);

  // ---- Gameplay ----
  const g = section('settings.gameplay');
  choice(g, 'settings.defaultSpeed', 'defaultSpeed',
    SPEEDS.filter((x) => x > 0).map((x) => ({ value: x, label: `${x}×` })));
  toggle(g, 'settings.notifications', 'notifications');
  toggle(g, 'settings.autopause', 'autopause');
  toggle(g, 'settings.showIntro', 'showIntro');

  // ---- Graphics ----
  const gr = section('settings.graphics');
  choice(gr, 'settings.quality', 'quality', [
    { value: 'low', label: t('settings.low') },
    { value: 'medium', label: t('settings.medium') },
    { value: 'high', label: t('settings.high') },
  ]);
  toggle(gr, 'settings.animations', 'animations');
  toggle(gr, 'settings.mapEffects', 'mapEffects');
  slider(gr, 'settings.uiScale', 'uiScale', 0.8, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`);

  // ---- Audio ----
  const a = section('settings.audio');
  toggle(a, 'settings.musicEnabled', 'musicEnabled');
  a.appendChild(el('p', 'muted small', t('settings.musicNote')));
  slider(a, 'settings.master', 'master', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
  slider(a, 'settings.music', 'music', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
  slider(a, 'settings.sfx', 'sfx', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);

  // ---- Accessibility ----
  const ac = section('settings.accessibility');
  slider(ac, 'settings.textSize', 'textSize', 0.85, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`);
  toggle(ac, 'settings.colorblind', 'colorblind');
  toggle(ac, 'settings.patterns', 'patterns');
  toggle(ac, 'settings.reduceMotion', 'reduceMotion');

  return { node };
}
