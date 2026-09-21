// Canvas world-map renderer: filled political territories, animated outbreak
// spread, live travel particles, ocean depth, and layered atmospherics.
import { LANDMASSES, CORRIDORS } from '../data/landmasses.js';
import { COUNTRIES } from '../data/countries.js';
import { buildTerritories, polyCentroid, polyBounds, insetPoly } from './geo.js';
import { t, tc } from '../i18n/index.js';

export const MAP_MODES = ['infection', 'severity', 'detection', 'healthcare', 'research', 'transport', 'climate'];

const RAMPS = {
  normal: {
    infection: ['#25313d', '#6d3340', '#b8433a', '#f2683f', '#ffc95e'],
    severity: ['#25313d', '#5c3350', '#96386b', '#d94f6a', '#ffb199'],
    detection: ['#25313d', '#6b5a24', '#b99333', '#f7d162'],
    healthcare: ['#4a2225', '#8a5a34', '#4c9670', '#68dba6'],
    research: ['#22303c', '#2f6f8f', '#54c8f5', '#a7e9ff'],
    transport: ['#22303c', '#356b86', '#57bcd8', '#9fe8f7'],
    climate: ['#3f74c9', '#58b4c4', '#9ec96a', '#e0a23c', '#d64f38'],
  },
  colorblind: {
    infection: ['#25313d', '#3b4b8f', '#6a5acd', '#e08214', '#fdd835'],
    severity: ['#25313d', '#444090', '#7a5ecc', '#e08214', '#ffe082'],
    detection: ['#25313d', '#6a6030', '#c7a53c', '#ffe08a'],
    healthcare: ['#2b2b3a', '#5a5a8a', '#4a90b8', '#8fd6f2'],
    research: ['#22303c', '#4a6fa5', '#8ecae6', '#cdeeff'],
    transport: ['#22303c', '#4a6fa5', '#8ecae6', '#cdeeff'],
    climate: ['#3b4b8f', '#4a8fb0', '#a8c66c', '#e08214', '#b5651d'],
  },
};
const IDLE = '#223140';

function lerpColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `rgb(${r},${g},${bl})`;
}
function ramp(stops, v) {
  v = Math.max(0, Math.min(1, v));
  const seg = stops.length - 1;
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
    this.targetView = { x: 0, y: 0, k: 1 };
    this.settings = opts.settings || {};
    this.onSelect = opts.onSelect || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.pulses = [];
    this.particles = [];
    this.time = 0;
    // Smoothed display values so territory colour eases instead of snapping.
    this.display = new Map();

    const geo = buildTerritories(COUNTRIES, LANDMASSES, { smooth: 2 });
    this.territories = geo.territories;
    this.coasts = geo.coasts;
    this.centroids = {};
    this.bounds = {};
    for (const [id, poly] of Object.entries(this.territories)) {
      this.centroids[id] = polyCentroid(poly);
      this.bounds[id] = polyBounds(poly);
    }
    this._bind();
    this.resize();
  }

  setSim(sim) { this.sim = sim; this.pulses = []; this.particles = []; this.display.clear(); }
  setMode(m) { this.mode = m; }

  // ------------------------------------------------------------- interaction
  _bind() {
    const c = this.canvas;
    let dragging = false, last = null, moved = 0;
    c.addEventListener('pointerdown', (e) => {
      dragging = true; moved = 0; last = [e.clientX, e.clientY];
      try { c.setPointerCapture(e.pointerId); } catch {}
    });
    c.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved < 5) this.onSelect(this.pick(e)?.id ?? null);
    });
    c.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); });
    c.addEventListener('pointermove', (e) => {
      if (dragging && last) {
        const dx = e.clientX - last[0], dy = e.clientY - last[1];
        moved += Math.abs(dx) + Math.abs(dy);
        this.targetView.x += dx; this.targetView.y += dy;
        this.view.x += dx; this.view.y += dy;
        last = [e.clientX, e.clientY];
        this.clampView();
      } else {
        const hit = this.pick(e);
        const id = hit ? hit.id : null;
        if (id !== this.hover) { this.hover = id; this.onHover(id, e); }
        c.style.cursor = hit ? 'pointer' : 'grab';
      }
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }

  zoomAt(mx, my, factor) {
    const before = this.toWorld(mx, my);
    this.view.k = Math.max(0.75, Math.min(7, this.view.k * factor));
    const after = this.toWorld(mx, my);
    const s = this.scale() * this.view.k;
    this.view.x += (after.x - before.x) * s;
    this.view.y += (after.y - before.y) * s;
    this.targetView = { ...this.view };
    this.clampView();
  }

  /** Smoothly frame a country (used when selecting from lists). */
  focus(id, k = 2.6) {
    const ctr = this.centroids[id];
    if (!ctr) return;
    const s = this.scale() * k;
    this.targetView = {
      k,
      x: -(ctr[0] - 50) * s,
      y: -(ctr[1] - 43) * s,
    };
  }

  resetView() { this.targetView = { x: 0, y: 0, k: 1 }; }
  clampView() {
    const lim = 460 * this.view.k;
    this.view.x = Math.max(-lim, Math.min(lim, this.view.x));
    this.view.y = Math.max(-lim, Math.min(lim, this.view.y));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === 'low' ? 1 : 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, r.width); this.h = Math.max(240, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  scale() { return Math.min(this.w / 100, this.h / 78); }
  toScreen(x, y) {
    const s = this.scale() * this.view.k;
    return [x * s + this.w / 2 - 50 * s + this.view.x, y * s + this.h / 2 - 43 * s + this.view.y];
  }
  toWorld(px, py) {
    const s = this.scale() * this.view.k;
    return { x: (px - (this.w / 2 - 50 * s + this.view.x)) / s, y: (py - (this.h / 2 - 43 * s + this.view.y)) / s };
  }

  pick(e) {
    if (!this.sim) return null;
    const r = this.canvas.getBoundingClientRect();
    const p = this.toWorld(e.clientX - r.left, e.clientY - r.top);
    // Point-in-territory first (exact), then a radius fallback for tiny islands.
    for (const c of this.sim.countries) {
      const poly = this.territories[c.id];
      if (poly && this._inPoly(p.x, p.y, poly)) return c;
    }
    let best = null, bestD = 9;
    for (const c of this.sim.countries) {
      const ctr = this.centroids[c.id] || [c.x, c.y];
      const d = (ctr[0] - p.x) ** 2 + (ctr[1] - p.y) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  _inPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
    }
    return inside;
  }

  // ------------------------------------------------------------------ values
  rawValue(c) {
    switch (this.mode) {
      case 'infection': return c.pop > 0 ? Math.min(1, (c.infected / c.pop) * 2.2) : 0;
      case 'severity': return c.pop0 > 0 ? Math.min(1, (c.dead / c.pop0) * 6 + c.strain * 0.35) : 0;
      case 'detection': return c.detected ? Math.max(0.35, c.awareness) : 0;
      case 'healthcare': return Math.min(1, c.health * c.healthMod);
      case 'research': return Math.min(1, c.research * 1.6);
      case 'transport': return Math.min(1, (c.air * (1 - c.airClosed) + c.sea * (1 - c.seaClosed)) / 2);
      case 'climate': return Math.min(1, c.heat + (c.shiftDays > 0 ? c.heatShift : 0));
      default: return 0;
    }
  }

  /** Eased value so colour transitions glide rather than pop. */
  value(c, dt) {
    const key = `${this.mode}:${c.id}`;
    const target = this.rawValue(c);
    if (!this.settings.animations || this.settings.reduceMotion) return target;
    const cur = this.display.get(key);
    if (cur === undefined) { this.display.set(key, target); return target; }
    const next = cur + (target - cur) * Math.min(1, dt / 260);
    this.display.set(key, next);
    return next;
  }

  colorFor(c, v) {
    const pal = this.settings.colorblind ? RAMPS.colorblind : RAMPS.normal;
    const stops = pal[this.mode] || pal.infection;
    const dim = { infection: c.totalInfected < 1 && v < 0.005, severity: v < 0.005, detection: !c.detected, research: v < 0.02 }[this.mode];
    if (dim) return IDLE;
    return ramp(stops, v);
  }

  // ------------------------------------------------------------------ render
  draw(dt = 16) {
    const ctx = this.ctx;
    this.time += dt;
    const anim = this.settings.animations && !this.settings.reduceMotion;
    // ease the camera toward its target
    if (anim) {
      const k = Math.min(1, dt / 180);
      this.view.k += (this.targetView.k - this.view.k) * k;
      this.view.x += (this.targetView.x - this.view.x) * k;
      this.view.y += (this.targetView.y - this.view.y) * k;
    } else {
      this.view = { ...this.targetView };
    }

    this.drawOcean();
    this.drawGraticule();
    if (!this.sim) { this.drawCoasts(); return; }
    this.drawLandShadow();
    this.drawTerritories(dt, anim);
    this.drawCoasts();
    this.drawCorridors(anim);
    if (anim && this.settings.mapEffects) this.updateParticles(dt);
    this.drawMarkers(anim);
    this.drawPulses(anim, dt);
    this.drawLabels();
  }

  drawOcean() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#081420');
    g.addColorStop(0.5, '#0a1a28');
    g.addColorStop(1, '#070f18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.settings.mapEffects) return;
    // subtle vignette
    const [cx, cy] = [this.w / 2, this.h / 2];
    const vg = ctx.createRadialGradient(cx, cy, Math.min(this.w, this.h) * 0.25, cx, cy, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawGraticule() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(90,150,190,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= 100; x += 10) {
      const [sx, sy0] = this.toScreen(x, -4), [, sy1] = this.toScreen(x, 100);
      ctx.moveTo(sx, sy0); ctx.lineTo(sx, sy1);
    }
    for (let y = 0; y <= 100; y += 10) {
      const [sx0, sy] = this.toScreen(-4, y), [sx1] = this.toScreen(104, y);
      ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  tracePoly(pts, close = true) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = this.toScreen(pts[i][0], pts[i][1]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    if (close) ctx.closePath();
  }

  /** Soft drop shadow under every landmass, sells depth against the ocean. */
  drawLandShadow() {
    if (!this.settings.mapEffects) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(0, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.filter = 'blur(3px)';
    for (const m of this.coasts) { this.tracePoly(m.pts); ctx.fill(); }
    ctx.restore();
  }

  drawTerritories(dt, anim) {
    const ctx = this.ctx;
    const pat = this.settings.patterns || this.settings.colorblind;
    for (const c of this.sim.countries) {
      const poly = this.territories[c.id];
      if (!poly) continue;
      const v = this.value(c, dt);
      const col = this.colorFor(c, v);
      this.tracePoly(poly);
      ctx.fillStyle = col;
      ctx.fill();

      // Infection heat bloom radiating from the country's centre of mass.
      if (this.mode === 'infection' && c.infected > 0 && this.settings.mapEffects) {
        const [cx, cy] = this.toScreen(...this.centroids[c.id]);
        const b = this.bounds[c.id];
        const rad = Math.max(b.w, b.h) * this.scale() * this.view.k * 0.85;
        const breathe = anim ? 1 + Math.sin(this.time / 620 + c.x * 0.4) * 0.09 : 1;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * breathe);
        const intensity = Math.min(0.5, 0.16 + v * 0.42);
        g.addColorStop(0, `rgba(255,140,90,${intensity})`);
        g.addColorStop(1, 'rgba(255,120,80,0)');
        ctx.save(); this.tracePoly(poly); ctx.clip();
        ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
        ctx.restore();
      }

      // Accessibility hatching — density encodes magnitude without relying on hue.
      if (pat && v > 0.06) {
        ctx.save(); this.tracePoly(poly); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        const b = this.bounds[c.id];
        const [x0, y0] = this.toScreen(b.x0, b.y0);
        const [x1, y1] = this.toScreen(b.x1, b.y1);
        const step = v > 0.66 ? 5 : v > 0.33 ? 9 : 14;
        ctx.beginPath();
        for (let i = -(y1 - y0); i < (x1 - x0) + (y1 - y0); i += step) {
          ctx.moveTo(x0 + i, y0); ctx.lineTo(x0 + i + (y1 - y0), y1);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Inner bevel: a lighter inset edge reads as raised terrain.
      if (this.settings.quality !== 'low') {
        ctx.save(); this.tracePoly(poly); ctx.clip();
        this.tracePoly(insetPoly(poly, 0.94));
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Political borders.
      const isSel = c.id === this.selected, isHov = c.id === this.hover;
      this.tracePoly(poly);
      ctx.strokeStyle = isSel ? '#ffd166' : isHov ? 'rgba(255,255,255,0.85)' : 'rgba(150,200,225,0.28)';
      ctx.lineWidth = isSel ? 2.6 : isHov ? 1.8 : 0.8;
      ctx.stroke();
      if (isSel) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,209,102,0.9)';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawCoasts() {
    const ctx = this.ctx;
    for (const m of this.coasts) {
      this.tracePoly(m.pts);
      if (m.decor) { ctx.fillStyle = '#15222d'; ctx.fill(); }
      ctx.strokeStyle = 'rgba(160,215,240,0.4)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  drawCorridors(anim) {
    const ctx = this.ctx;
    const active = this.mode === 'transport';
    ctx.save();
    for (const [a, b] of CORRIDORS) {
      const ca = this.sim.byId[a], cb = this.sim.byId[b];
      if (!ca || !cb) continue;
      const open = 1 - (ca.airClosed + cb.airClosed) / 2;
      const [x1, y1] = this.toScreen(...(this.centroids[a] || [ca.x, ca.y]));
      const [x2, y2] = this.toScreen(...(this.centroids[b] || [cb.x, cb.y]));
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - dist * 0.17;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
      if (open < 0.4) {
        ctx.strokeStyle = `rgba(235,95,70,${active ? 0.55 : 0.2})`;
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = active ? 1.5 : 0.9;
      } else {
        ctx.strokeStyle = `rgba(95,200,240,${(active ? 0.4 : 0.11) * (0.35 + open)})`;
        ctx.setLineDash([]);
        ctx.lineWidth = active ? 1.5 : 0.85;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /** Travel particles: little sparks riding open corridors out of infected nations. */
  updateParticles(dt) {
    const ctx = this.ctx;
    // spawn
    if (this.particles.length < 60 && this.sim) {
      for (const [a, b] of CORRIDORS) {
        if (this.particles.length >= 60) break;
        const ca = this.sim.byId[a], cb = this.sim.byId[b];
        if (!ca || !cb) continue;
        const open = 1 - (ca.airClosed + cb.airClosed) / 2;
        if (open < 0.45) continue;
        const prevA = ca.pop > 0 ? ca.infected / ca.pop : 0;
        const prevB = cb.pop > 0 ? cb.infected / cb.pop : 0;
        const src = prevA >= prevB ? a : b, dst = prevA >= prevB ? b : a;
        const prev = Math.max(prevA, prevB);
        if (prev < 0.004) continue;
        if (Math.random() < Math.min(0.05, prev * 0.35) * (dt / 16)) {
          this.particles.push({ a: src, b: dst, t: 0, speed: 0.00035 + Math.random() * 0.0004 });
        }
      }
    }
    // draw + advance
    for (const p of this.particles) {
      p.t += p.speed * dt;
      const ca = this.centroids[p.a], cb = this.centroids[p.b];
      if (!ca || !cb) { p.t = 2; continue; }
      const [x1, y1] = this.toScreen(...ca);
      const [x2, y2] = this.toScreen(...cb);
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - dist * 0.17;
      const u = 1 - p.t;
      const x = u * u * x1 + 2 * u * p.t * mx + p.t * p.t * x2;
      const y = u * u * y1 + 2 * u * p.t * my + p.t * p.t * y2;
      const fade = Math.sin(Math.min(1, p.t) * Math.PI);
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,180,120,${0.85 * fade})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,140,90,${0.16 * fade})`;
      ctx.fill();
    }
    this.particles = this.particles.filter((p) => p.t < 1);
  }

  /** Status markers drawn at territory centroids. */
  drawMarkers(anim) {
    const ctx = this.ctx;
    const s = this.scale() * this.view.k;
    for (const c of this.sim.countries) {
      const ctr = this.centroids[c.id];
      if (!ctr) continue;
      const [x, y] = this.toScreen(...ctr);
      const icons = [];
      if (c.detected) icons.push(['◎', '#f2c14e']);
      if (c.airClosed > 0.5) icons.push(['✈', '#ff8a6a']);
      if (c.seaClosed > 0.5) icons.push(['⚓', '#ff8a6a']);
      if (c.strain > 0.7) icons.push(['✚', '#ff5d7a']);
      if (c.research > 0.35) icons.push(['⚗', '#7fd4f0']);
      if (!icons.length) continue;
      const size = Math.max(9, Math.min(15, 8 * this.view.k));
      ctx.font = `${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const total = icons.length;
      icons.forEach(([ic, col], i) => {
        const ox = (i - (total - 1) / 2) * (size * 0.86);
        const oy = -size * 0.55;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = col;
        // gentle pulse on the hospital-strain warning
        if (anim && ic === '✚') ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(this.time / 380));
        ctx.fillText(ic, x + ox, y + oy);
        ctx.restore();
      });
    }
  }

  drawLabels() {
    const ctx = this.ctx;
    const s = this.scale() * this.view.k;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of this.sim.countries) {
      const b = this.bounds[c.id];
      const ctr = this.centroids[c.id];
      if (!b || !ctr) continue;
      const wpx = b.w * s;
      const focused = c.id === this.hover || c.id === this.selected;
      // Only label territories wide enough to hold the text, unless focused.
      if (!focused && wpx < 52) continue;
      const [x, y] = this.toScreen(...ctr);
      const name = tc(c.id);
      const size = focused ? Math.max(11, Math.min(15, 7.5 * this.view.k)) : Math.max(9, Math.min(13, 6.5 * this.view.k));
      ctx.font = `${focused ? '600 ' : ''}${size}px system-ui, sans-serif`;
      if (!focused && ctx.measureText(name).width > wpx * 0.95) continue;
      const ty = y + Math.max(9, size * 0.9);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 5;
      ctx.fillStyle = focused ? '#ffffff' : 'rgba(226,240,250,0.82)';
      ctx.fillText(name, x, ty);
      ctx.restore();
    }
  }

  addPulse(id, kind = 'infect') {
    const ctr = this.centroids[id];
    if (!ctr) return;
    this.pulses.push({ x: ctr[0], y: ctr[1], t: 0, kind });
    if (this.pulses.length > 40) this.pulses.shift();
  }

  drawPulses(anim, dt) {
    if (!anim) { this.pulses = []; return; }
    const ctx = this.ctx;
    const COL = {
      infect: [255, 120, 90], detect: [242, 193, 78],
      cure: [120, 220, 255], death: [200, 90, 140],
    };
    for (const p of this.pulses) {
      p.t += dt;
      const k = p.t / 1500;
      if (k > 1) continue;
      const [x, y] = this.toScreen(p.x, p.y);
      const [r, g, b] = COL[p.kind] || COL.infect;
      const ease = 1 - Math.pow(1 - k, 3);
      for (let ring = 0; ring < 2; ring++) {
        const rk = Math.max(0, ease - ring * 0.18);
        if (rk <= 0) continue;
        ctx.beginPath();
        ctx.arc(x, y, 5 + rk * 42, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - k) * (ring ? 0.35 : 0.8)})`;
        ctx.lineWidth = (ring ? 1.2 : 2.4) * (1 - k);
        ctx.stroke();
      }
    }
    this.pulses = this.pulses.filter((p) => p.t < 1500);
  }

  legend() {
    const items = {
      infection: ['map.none', 'map.low', 'map.high'],
      severity: ['map.none', 'map.low', 'map.high'],
      detection: ['map.none', 'map.low', 'map.high'],
      healthcare: ['map.low', 'map.high'],
      research: ['map.none', 'map.high'],
      transport: ['map.low', 'map.high'],
      climate: ['climate.frigid', 'climate.temperate', 'climate.hot'],
    }[this.mode] || [];
    return items.map((k) => t(k));
  }

  /** Colour for a legend swatch at normalised position k. */
  legendColor(k) {
    const pal = this.settings.colorblind ? RAMPS.colorblind : RAMPS.normal;
    return ramp(pal[this.mode] || pal.infection, k);
  }
}
