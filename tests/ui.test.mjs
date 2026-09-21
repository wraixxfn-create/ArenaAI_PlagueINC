// UI integration tests under jsdom: screens, flows, localization, save/load.
// Run: node tests/ui.test.mjs   (requires devDependency jsdom)
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div><div id="toasts"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.Intl = Intl;
global.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
global.performance = performance;

// minimal localStorage
const memory = new Map();
const fakeStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};
Object.defineProperty(global, 'localStorage', { value: fakeStorage, configurable: true });
Object.defineProperty(window, 'localStorage', { value: fakeStorage, configurable: true });

// canvas stub (jsdom has no 2D context)
window.HTMLCanvasElement.prototype.getContext = () => {
  const noop = () => {};
  const ctx = {
    canvas: { width: 800, height: 600 },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    measureText: () => ({ width: 40 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    isPointInPath: () => false,
  };
  for (const m of ['setTransform', 'transform', 'translate', 'rotate', 'scale', 'clearRect',
    'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'roundRect', 'bezierCurveTo', 'quadraticCurveTo', 'fill', 'stroke',
    'clip', 'save', 'restore', 'fillText', 'strokeText', 'setLineDash', 'getLineDash',
    'drawImage', 'putImageData', 'resetTransform']) ctx[m] = noop;
  return ctx;
};
// no WebAudio in jsdom — the engine must degrade gracefully
window.AudioContext = undefined;

let pass = 0, fail = 0;
const ok = (c, n, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${e}`); } };
const section = (n) => console.log(`\n== ${n} ==`);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const byText = (sel, text) => $$(sel).find((n) => n.textContent.trim().includes(text));
const text = () => document.getElementById('root').textContent;

const { app } = await import('../src/ui/app.js');
const { menuScreen, scenariosScreen, creditsScreen, achievementsScreen, tutorialScreen, savesScreen } = await import('../src/ui/screens/menu.js');
const { setupScreen } = await import('../src/ui/screens/setup.js');
const { settingsScreen } = await import('../src/ui/screens/settings.js');
const { statsScreen } = await import('../src/ui/screens/stats.js');
const { gameScreen } = await import('../src/ui/screens/game.js');
const { t, getLang } = await import('../src/i18n/index.js');

app.register('menu', menuScreen);
app.register('scenarios', scenariosScreen);
app.register('setup', setupScreen);
app.register('settings', settingsScreen);
app.register('stats', statsScreen);
app.register('achievements', achievementsScreen);
app.register('tutorial', tutorialScreen);
app.register('credits', creditsScreen);
app.register('saves', savesScreen);
app.register('game', gameScreen);

section('Screen rendering');
app.go('menu');
ok(text().includes('VECTOR ZERO'), 'main menu renders');
ok(text().includes('New Game'), 'menu is in English by default');
for (const s of ['scenarios', 'achievements', 'tutorial', 'credits', 'settings', 'stats']) {
  app.go(s, { standalone: true });
  ok(document.getElementById('root').children.length > 0, `${s} screen renders`);
}
app.go('scenarios');
ok($$('.scenario-card').length >= 7, 'all scenarios listed');
app.go('achievements');
ok($$('.card.ach').length >= 16, 'all achievements listed');

section('Setup flow');
app.go('setup', { scenarioId: 'global' });
ok($$('.path-card').length === 6, 'six pathogens offered');
$$('.path-card')[1].click();
ok($$('.path-card')[1].classList.contains('selected'), 'pathogen selection registers');
byText('.btn', 'Next').click();
ok(text().includes('Brutal'), 'difficulty step reachable');
$$('.diff-card')[1].click();
byText('.btn', 'Next').click();
ok($$('.country-chip').length > 50, 'origin picker lists countries');
const searchInput = $('.origin-picker .input');
searchInput.value = 'Japan';
searchInput.dispatchEvent(new window.Event('input'));
ok($$('.country-chip').length === 1 && text().includes('Japan'), 'origin search filters');
$$('.country-chip')[0].click();
byText('.btn', 'Begin Outbreak').click();
ok(!!app.sim, 'new game created');
ok(app.sim.startCountry === 'jpn', 'chosen origin used');
ok(app.speedIndex === 0, 'game starts paused');

section('In-game HUD');
ok($('.hud-top') && $('.hud-bottom') && $('.side-panel'), 'HUD regions present');
ok($$('.speed-btn').length === 5, 'five speed settings');
ok($$('.mode-btn').length === 7, 'seven map views');
$$('.speed-btn')[3].click();
ok(app.speed === 4, 'speed control works');
byText('.btn.control', 'Pause').click();
ok(app.speed === 0, 'pause works');
$$('.speed-btn')[1].click();
ok(app.speed === 1, 'resume works');
// simulate a few hundred days
for (let i = 0; i < 400 && !app.sim.finished; i++) app.tickOnce();
app.view.frame(16);
ok(app.sim.day >= 100, `simulation advanced to day ${app.sim.day}`);
ok($('.metric.inf .metric-value').textContent !== '0' || app.sim.finished, 'infected counter updates');
$$('.mode-btn')[4].click();
ok($$('.mode-btn')[4].classList.contains('active'), 'map view switch works');

section('Country panel & explainability');
app.view.node.querySelector('.tabs .tab').click();
ok(text().includes('Why is it spreading here?'), 'explanation panel present');
ok(text().includes('Healthcare suppression') || text().includes('Government measures'), 'factor breakdown shown');
$$('.side-panel .tab')[1].click();
ok(text().includes('Severity'), 'pathogen tab renders');
$$('.side-panel .tab')[2].click();
ok(text().includes('Day') , 'world feed renders');
$$('.side-panel .tab')[0].click();

section('Evolution UI');
app.sim.ep = 500;
byText('.btn', 'Evolve').click();
ok(!!$('.evo-panel'), 'evolution overlay opens');
ok($$('.evo-node').length >= 65, `all trait nodes rendered (${$$('.evo-node').length})`);
const before = app.sim.traits.size;
const buyable = $$('.evo-node.affordable:not(.owned):not(.mutated)')[0];
buyable.click();
ok(app.sim.traits.size === before + 1, 'trait purchase via node click');
ok($$('.evo-node.owned').length >= 1, 'owned state renders');
byText('.btn.ghost', 'Close').click();
ok(!$('.evo-panel'), 'evolution overlay closes');

section('World data overlay');
byText('.btn', 'World Data').click();
ok(text().includes('Total infected'), 'stats overlay opens');
ok($$('.chart').length >= 2, 'charts rendered');
ok($$('.tr').length > 50, 'country table populated');
$$('.td.sortable')[2].click();
ok($$('.tr').length > 50, 'table sorting works');
byText('.btn.ghost', 'Close').click();

section('Save / load');
ok(app.saveGame(2), 'manual save to slot 2');
const dayAtSave = app.sim.day;
const infAtSave = Math.round(app.sim.global.totalInfected);
for (let i = 0; i < 30 && !app.sim.finished; i++) app.tickOnce();
ok(app.sim.day > dayAtSave, 'simulation advanced past save point');
ok(app.loadGame(2), 'load from slot 2');
ok(app.sim.day === dayAtSave, 'loaded state restores day');
ok(Math.round(app.sim.global.totalInfected) === infAtSave, 'loaded state restores population');
app.go('saves', { mode: 'save' });
ok($$('.save-row').length === 5, 'five save slots listed (autosave + 4)');
ok(text().includes('Day ' + dayAtSave), 'save metadata shown');
app.go('game');

section('Localization');
ok(getLang() === 'en', 'default language English');
app.setLanguage('it');
ok(getLang() === 'it', 'language switched to Italian');
ok(text().includes('Evolvi') || text().includes('Pausa'), 'game UI translated to Italian');
app.go('menu');
ok(text().includes('Nuova partita') && text().includes('Impostazioni'), 'menu translated to Italian');
ok(!text().includes('New Game'), 'no English left in Italian menu');
app.go('settings');
ok(text().includes('Accessibilità') && text().includes('Lingua'), 'settings translated');
app.setLanguage('en');
ok(text().includes('Accessibility') && text().includes('Language'), 'switched back to English live');
ok(JSON.parse(localStorage.getItem('vz.settings')).lang === 'en', 'language persisted to storage');
app.setLanguage('it');
{
  // simulate a restart: fresh settings read
  const stored = JSON.parse(localStorage.getItem('vz.settings'));
  ok(stored.lang === 'it', 'Italian persists across sessions');
}
app.setLanguage('en');

section('Settings');
app.go('settings');
const switches = $$('.switch');
ok(switches.length >= 6, 'toggle switches present');
const cbSwitch = switches.find((s) => s.parentElement.textContent.includes('Colourblind'));
cbSwitch.click();
ok(app.settings.colorblind === true, 'colourblind mode toggles');
cbSwitch.click();
const sliders = $$('.slider');
ok(sliders.length >= 5, `sliders present (${sliders.length})`);
sliders[0].value = '1.2';
sliders[0].dispatchEvent(new window.Event('input'));
ok(app.settings.uiScale === 1.2 || app.settings.master === 1.2 || app.settings.textSize === 1.2, 'slider updates settings');
ok(JSON.parse(localStorage.getItem('vz.settings')) !== null, 'settings persisted');

section('Tutorial');
app.go('tutorial');
ok(text().includes('1 · Starting a run'), 'tutorial starts at page 1');
ok($$('.dot').length === 10, 'ten tutorial pages');
byText('.btn', 'Next').click();
ok(text().includes('2 · Reading the map'), 'tutorial paging works');
byText('.btn.ghost', 'Skip').click();
ok(!text().includes('Field Briefing'), 'tutorial skippable');

section('Custom game');
app.go('setup', { scenarioId: 'custom', custom: true });
byText('.btn', 'Next').click();
byText('.btn', 'Next').click();
ok($$('.slider-row').length === 8, 'custom world sliders present');
const ws = $$('.slider-row .slider')[0];
ws.value = '2';
ws.dispatchEvent(new window.Event('input'));
byText('.btn', 'Next').click();
byText('.btn', 'Begin Outbreak').click();
ok(app.sim.cfg.worldOverrides.researchSpeed === 2, 'custom world modifiers applied');

section('Win / lose screens');
{
  app.sim.research.progress = 1;
  app.tickOnce();
  ok(app.sim.finished === 'lose', 'defeat triggered');
  ok(text().includes('DEFEAT'), 'defeat screen shown');
  ok(text().includes('countermeasure'), 'defeat reason explained');
  byText('.btn', 'New run').click();
  ok(document.querySelector('.setup-screen'), 'can start a new run from defeat screen');
}
{
  app.newGame({ pathogenId: 'strand', difficulty: 'easy', scenarioId: 'global', startCountry: 'usa', seed: 5 });
  for (const c of app.sim.countries) { c.healthy = 0; c.infected = c.pop; }
  app.sim.updateGlobals();
  app.tickOnce();
  ok(app.sim.finished === 'win', 'victory triggered');
  ok(text().includes('VICTORY'), 'victory screen shown');
  ok(Object.keys(app.profile.achievements).length > 0, 'achievements unlock on victory');
}

section('Speed stability');
{
  app.newGame({ pathogenId: 'bacilla', difficulty: 'normal', scenarioId: 'global', startCountry: 'ind', seed: 9 });
  app.setSpeed(4);          // 8x
  const t0 = performance.now();
  for (let i = 0; i < 600 && !app.sim.finished; i++) { app.tickOnce(); }
  app.view.frame(16);
  const ms = performance.now() - t0;
  ok(ms < 4000, `600 ticks with UI hooks in ${ms.toFixed(0)}ms`);
  ok(Number.isFinite(app.sim.global.infected), 'state stays finite at max speed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
