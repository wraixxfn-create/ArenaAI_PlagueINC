// Canvas world-map renderer. Stylised, original silhouettes + node overlay.
import { LANDMASSES, CORRIDORS } from '../data/landmasses.js';
import { t, tc } from '../i18n/index.js';

export const MAP_MODES = ['infection', 'severity', 'detection', 'healthcare', 'research', 'transport', 'climate'];

const PALETTE = {
  normal: {
    infection: ['#1d2c3a', '#7a2f3d', '#c0392b', '#ff6b4a', '#ffd166'],
    healthcare: ['#3a2020', '#7a5030', '#4a8f6a', '#5fd39a'],
    research: ['#20303a', '#2f6f8f', '#4fc3f7'],
    detection: ['#25313c', '#8a6d1f', '#f2c14e'],
    climate: ['#4a7fd1', '#5fb7c9', '#9ec96a', '#e2a33c', '#d9553f'],
  },
  colorblind: {
    infection: ['#1d2c3a', '#3b4b8f', '#6a5acd', '#e08214', '#fdd835'],
    healthcare: ['#2b2b3a', '#5a5a8a', '#3d8fb0', '#7fd4f0'],
    research: ['#20303a', '#4a6fa5', '#8ecae6'],
    detection: ['#25313c', '#7a6a3a', '#ffd166'],
    climate: ['#3b4b8f', '#4a8fb0', '#a8c66c', '#e08214', '#b5651d'],
  },
};

function lerpColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `rgb(${r},${g},${bl})`;
}
function ramp(stops, v) {
  v = Math.max(0, Math.min(1, v));
  const seg = (stops.length - 1);
  const i = Math.min(seg - 1, Math.floor(v * seg));
  return lerpColor(stops[i], stops[i + 1], v * seg - i);
}

export class WorldMap {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'infection';
    this.sim = null;
    this.selected = null;
    this.hover = null;
    this.view = { x: 0, y: 0, k: 1 };
    this.settings = opts.settings || {};
    this.onSelect = opts.onSelect || (() => {});
    this.pulses = [];
    this.time = 0;
    this._bind();
    this.resize();
  }

  setSim(sim) { this.sim = sim; this.pulses = []; }
  setMode(m) { this.mode = m; }

  _bind() {
    const c = this.canvas;
    let dragging = false, last = null, moved = 0;
    c.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; last = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved < 5) {
        const hit = this.pick(e);
        this.onSelect(hit ? hit.id : null);
      }
    });
    c.addEventListener('pointerleave', () => { this.hover = null; });
    c.addEventListener('pointermove', (e) => {
      if (dragging && last) {
        const dx = e.clientX - last[0], dy = e.clientY - last[1];
        moved += Math.abs(dx) + Math.abs(dy);
        this.view.x += dx; this.view.y += dy;
        last = [e.clientX, e.clientY];
        this.clampView();
      } else {
        const hit = this.pick(e);
        this.hover = hit ? hit.id : null;
        c.style.cursor = hit ? 'pointer' : 'grab';
      }
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const before = this.toWorld(mx, my);
      const k = Math.exp(-e.deltaY * 0.0015);
      this.view.k = Math.max(0.8, Math.min(6, this.view.k * k));
      const after = this.toWorld(mx, my);
      this.view.x += (after.x - before.x) * this.scale() * this.view.k;
      this.view.y += (after.y - before.y) * this.scale() * this.view.k;
      this.clampView();
    }, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }

  resetView() { this.view = { x: 0, y: 0, k: 1 }; }
  clampView() {
    const lim = 400 * this.view.k;
    this.view.x = Math.max(-lim, Math.min(lim, this.view.x));
    this.view.y = Math.max(-lim, Math.min(lim, this.view.y));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === 'low' ? 1 : 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, r.width); this.h = Math.max(240, r.height);
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  scale() { return Math.min(this.w / 100, this.h / 78); }
  toScreen(x, y) {
    const s = this.scale() * this.view.k;
    const ox = this.w / 2 - 50 * s + this.view.x;
    const oy = this.h / 2 - 43 * s + this.view.y;
    return [x * s + ox, y * s + oy];
  }
  toWorld(px, py) {
    const s = this.scale() * this.view.k;
    const ox = this.w / 2 - 50 * s + this.view.x;
    const oy = this.h / 2 - 43 * s + this.view.y;
    return { x: (px - ox) / s, y: (py - oy) / s };
  }

  nodeRadius(c) {
    const base = 3 + Math.log10(1 + c.pop0 / 1e6) * 1.9;
    return base;
  }

  pick(e) {
    if (!this.sim) return null;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bestD = 1e9;
    const s = this.scale() * this.view.k;
    for (const c of this.sim.countries) {
      const [x, y] = this.toScreen(c.x, c.y);
      const rad = Math.max(10, this.nodeRadius(c) * s * 0.34);
      const d = Math.hypot(x - px, y - py);
      if (d < rad && d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  countryValue(c) {
    const sim = this.sim;
    switch (this.mode) {
      case 'infection': return c.pop > 0 ? Math.min(1, (c.infected / c.pop) * 2.2) : 0;
      case 'severity': return c.pop > 0 ? Math.min(1, (c.dead / Math.max(1, c.pop0)) * 6 + c.strain * 0.35) : 0;
      case 'detection': return c.detected ? Math.max(0.35, c.awareness) : 0;
      case 'healthcare': return Math.min(1, c.health * c.healthMod);
      case 'research': return Math.min(1, c.research * 1.6);
      case 'transport': return Math.min(1, (c.air * (1 - c.airClosed) + c.sea * (1 - c.seaClosed)) / 2);
      case 'climate': return Math.min(1, c.heat + (c.shiftDays > 0 ? c.heatShift : 0));
      default: return 0;
    }
  }

  colorFor(c) {
    const pal = this.settings.colorblind ? PALETTE.colorblind : PALETTE.normal;
    const v = this.countryValue(c);
    switch (this.mode) {
      case 'infection': return c.totalInfected > 0 || v > 0 ? ramp(pal.infection, v) : '#22303d';
      case 'severity': return v > 0 ? ramp(pal.infection, v) : '#22303d';
      case 'detection': return c.detected ? ramp(pal.detection, v) : '#22303d';
      case 'healthcare': return ramp(pal.healthcare, v);
      case 'research': return v > 0.02 ? ramp(pal.research, v) : '#22303d';
      case 'transport': return ramp(pal.research, v);
      case 'climate': return ramp(pal.climate, v);
      default: return '#22303d';
    }
  }

  addPulse(id, kind = 'infect') {
    const c = this.sim?.byId[id];
    if (!c) return;
    this.pulses.push({ x: c.x, y: c.y, t: 0, kind });
    if (this.pulses.length > 40) this.pulses.shift();
  }

  draw(dt = 16) {
    const ctx = this.ctx;
    this.time += dt;
    const anim = this.settings.animations && !this.settings.reduceMotion;
    ctx.clearRect(0, 0, this.w, this.h);
    // ocean
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0b1620'); g.addColorStop(1, '#091019');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
    this.drawGraticule();
    this.drawLand();
    if (this.mode === 'transport' || this.settings.mapEffects) this.drawCorridors();
    if (!this.sim) return;
    this.drawNodes(anim);
    this.drawPulses(anim, dt);
  }

  drawGraticule() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(90,150,190,0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 100; x += 10) {
      const [sx, sy0] = this.toScreen(x, 0), [, sy1] = this.toScreen(x, 100);
      ctx.beginPath(); ctx.moveTo(sx, sy0); ctx.lineTo(sx, sy1); ctx.stroke();
    }
    for (let y = 0; y <= 100; y += 10) {
      const [sx0, sy] = this.toScreen(0, y), [sx1] = this.toScreen(100, y);
      ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); ctx.stroke();
    }
    ctx.restore();
  }

  drawLand() {
    const ctx = this.ctx;
    for (const m of LANDMASSES) {
      ctx.beginPath();
      m.pts.forEach((p, i) => {
        const [x, y] = this.toScreen(p[0], p[1]);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = '#16232e';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,180,220,0.22)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  drawCorridors() {
    if (!this.sim) return;
    const ctx = this.ctx;
    ctx.save();
    for (const [a, b] of CORRIDORS) {
      const ca = this.sim.byId[a], cb = this.sim.byId[b];
      if (!ca || !cb) continue;
      const open = (1 - (ca.airClosed + cb.airClosed) / 2);
      const [x1, y1] = this.toScreen(ca.x, ca.y);
      const [x2, y2] = this.toScreen(cb.x, cb.y);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.16;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
      const active = this.mode === 'transport';
      ctx.strokeStyle = open < 0.4
        ? `rgba(230,90,70,${active ? 0.5 : 0.18})`
        : `rgba(90,190,230,${(active ? 0.35 : 0.1) * (0.35 + open)})`;
      ctx.lineWidth = active ? 1.4 : 0.8;
      if (open < 0.4) ctx.setLineDash([4, 5]); else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  drawNodes(anim) {
    const ctx = this.ctx;
    const s = this.scale() * this.view.k;
    const pat = this.settings.patterns || this.settings.colorblind;
    for (const c of this.sim.countries) {
      const [x, y] = this.toScreen(c.x, c.y);
      const r = Math.max(3, this.nodeRadius(c) * s * 0.3);
      const v = this.countryValue(c);
      const col = this.colorFor(c);
      // glow for active outbreaks
      if (this.mode === 'infection' && c.infected > 0 && this.settings.mapEffects) {
        const pulse = anim ? 1 + Math.sin(this.time / 420 + c.x) * 0.12 : 1;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6 * pulse);
        gr.addColorStop(0, 'rgba(255,110,80,0.35)');
        gr.addColorStop(1, 'rgba(255,110,80,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, r * 3.6 * pulse, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      // pattern overlay (accessibility: never colour alone)
      if (pat && v > 0.05) {
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        const step = v > 0.66 ? 3 : v > 0.33 ? 5 : 8;
        for (let i = -r * 2; i < r * 2; i += step) {
          ctx.beginPath(); ctx.moveTo(x + i, y - r); ctx.lineTo(x + i + r * 2, y + r); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.lineWidth = c.id === this.selected ? 2.4 : 1;
      ctx.strokeStyle = c.id === this.selected ? '#ffd166'
        : c.id === this.hover ? 'rgba(255,255,255,0.8)' : 'rgba(180,220,240,0.35)';
      ctx.stroke();

      // status icons — shape-coded, readable without colour
      const icons = [];
      if (c.detected) icons.push('◎');
      if (c.airClosed > 0.5) icons.push('✈');
      if (c.seaClosed > 0.5) icons.push('⚓');
      if (c.strain > 0.7) icons.push('✚');
      if (icons.length && s > 4) {
        ctx.font = `${Math.max(8, Math.min(13, 9 * this.view.k))}px system-ui`;
        ctx.fillStyle = 'rgba(230,240,250,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText(icons.join(''), x, y - r - 3);
      }
      if (this.view.k > 1.8 || c.id === this.hover || c.id === this.selected) {
        ctx.font = `${Math.max(9, Math.min(14, 7 * this.view.k))}px system-ui`;
        ctx.fillStyle = 'rgba(220,235,245,0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(tc(c.id), x, y + r + 12);
      }
    }
  }

  drawPulses(anim, dt) {
    if (!anim) { this.pulses = []; return; }
    const ctx = this.ctx;
    for (const p of this.pulses) {
      p.t += dt;
      const k = p.t / 1400;
      if (k > 1) continue;
      const [x, y] = this.toScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(x, y, 6 + k * 34, 0, Math.PI * 2);
      ctx.strokeStyle = p.kind === 'detect' ? `rgba(242,193,78,${1 - k})` : `rgba(255,120,90,${1 - k})`;
      ctx.lineWidth = 2 * (1 - k);
      ctx.stroke();
    }
    this.pulses = this.pulses.filter((p) => p.t < 1400);
  }

  legend() {
    const key = this.mode;
    const items = {
      infection: ['map.none', 'map.low', 'map.high'],
      severity: ['map.none', 'map.low', 'map.high'],
      detection: ['map.none', 'map.low', 'map.high'],
      healthcare: ['map.low', 'map.high'],
      research: ['map.none', 'map.high'],
      transport: ['map.low', 'map.high'],
      climate: ['climate.frigid', 'climate.temperate', 'climate.hot'],
    }[key] || [];
    return items.map((k) => t(k));
  }
}
