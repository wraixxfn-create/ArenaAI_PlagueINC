import { t, localeOf, getLang } from '../i18n/index.js';

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function h(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return n;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

const COMPACT = {};
export function num(v) {
  v = Math.max(0, Math.round(v || 0));
  const lang = getLang();
  if (!COMPACT[lang]) COMPACT[lang] = new Intl.NumberFormat(localeOf(lang), { notation: 'compact', maximumFractionDigits: 2 });
  if (v < 10000) return new Intl.NumberFormat(localeOf(lang)).format(v);
  return COMPACT[lang].format(v);
}
export function fullNum(v) {
  return new Intl.NumberFormat(localeOf()).format(Math.max(0, Math.round(v || 0)));
}
export function pct(v, digits = 1) {
  return `${(v * 100).toFixed(digits)}%`;
}
export function signed(v, digits = 2) {
  const s = v >= 0 ? '+' : '−';
  return `${s}${Math.abs(v).toFixed(digits)}`;
}
export function dateStr(d) {
  return new Intl.DateTimeFormat(localeOf(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
}
export function climateLabel(c) {
  const heat = c.heat + (c.shiftDays > 0 ? c.heatShift : 0);
  const tkey = heat < 0.18 ? 'climate.frigid' : heat < 0.38 ? 'climate.cold' : heat < 0.6 ? 'climate.temperate' : heat < 0.8 ? 'climate.warm' : 'climate.hot';
  const hkey = c.humid < 0.28 ? 'climate.arid' : c.humid < 0.45 ? 'climate.dry' : c.humid < 0.72 ? 'climate.humid' : 'climate.tropical';
  return `${t(tkey)} · ${t(hkey)}`;
}
/** Tooltip helper: attaches a floating tip to an element. */
let tipNode = null;
export function tip(node, builder) {
  node.addEventListener('pointerenter', () => showTip(node, builder));
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', () => showTip(node, builder));
  node.addEventListener('blur', hideTip);
  return node;
}
export function showTip(node, builder) {
  hideTip();
  const content = typeof builder === 'function' ? builder() : builder;
  if (!content) return;
  tipNode = el('div', 'tooltip');
  if (typeof content === 'string') tipNode.textContent = content;
  else tipNode.appendChild(content);
  document.body.appendChild(tipNode);
  const r = node.getBoundingClientRect();
  const tr = tipNode.getBoundingClientRect();
  let x = r.left + r.width / 2 - tr.width / 2;
  let y = r.top - tr.height - 10;
  if (y < 8) y = r.bottom + 10;
  x = Math.max(8, Math.min(window.innerWidth - tr.width - 8, x));
  tipNode.style.left = `${x}px`;
  tipNode.style.top = `${y}px`;
  requestAnimationFrame(() => tipNode && tipNode.classList.add('show'));
}
export function hideTip() { if (tipNode) { tipNode.remove(); tipNode = null; } }

export function bar(value, cls = '') {
  const wrap = el('div', `bar ${cls}`);
  const fill = el('div', 'bar-fill');
  fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
  wrap.appendChild(fill);
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-valuenow', Math.round(value * 100));
  return wrap;
}

export function statRow(labelKey, value, extra) {
  const row = el('div', 'stat-row');
  row.appendChild(el('span', 'stat-label', t(labelKey)));
  row.appendChild(el('span', 'stat-value', value));
  if (extra) row.appendChild(extra);
  return row;
}

export function confirmDialog(messageKey, onYes) {
  const back = el('div', 'modal-backdrop');
  const box = el('div', 'modal small');
  box.appendChild(el('p', 'confirm-text', t(messageKey)));
  const row = el('div', 'row end');
  const no = el('button', 'btn ghost', t('ui.cancel'));
  const yes = el('button', 'btn danger', t('ui.confirm'));
  no.onclick = () => back.remove();
  yes.onclick = () => { back.remove(); onYes(); };
  row.append(no, yes);
  box.appendChild(row);
  back.appendChild(box);
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  yes.focus();
}

export function toast(text, kind = 'info') {
  let host = document.getElementById('toasts');
  if (!host) { host = el('div', ''); host.id = 'toasts'; document.body.appendChild(host); }
  const n = el('div', `toast ${kind}`, text);
  host.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); }, 3200);
}
