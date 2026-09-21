// Natural Earth, Equal Earth projection. Cached political layer + lightweight overlays.
// No per-frame blur, polygon construction, or DOM work.
import { CORRIDORS } from '../data/landmasses.js';
import { polyBounds, pointInPoly } from './geo.js';
import { EARTH } from '../data/earth.js';
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
    // Prefer bounded software raster work to deferred GPU path/blur stalls,
    // especially on integrated GPUs and software-composited browser sessions.
    this.ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
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

    this.features = EARTH.countries;
    this.territories = Object.fromEntries(this.features.filter(f => f.id).map(f => [f.id, f.rings]));
    this.centroids = Object.fromEntries(this.features.filter(f => f.id).map(f => [f.id, f.anchor]));
    this.bounds = Object.fromEntries(this.features.filter(f => f.id).map(f => [f.id, polyBounds(f.rings.flat())]));
    this.featureBounds = new Map(this.features.map(f => [f, polyBounds(f.rings.flat())]));
    this.paths = new Map();
    if (typeof Path2D !== 'undefined') for (const f of this.features) {
      const path = new Path2D();
      for (const ring of f.rings) {
        ring.forEach(([x,y],i) => i ? path.lineTo(x,y) : path.moveTo(x,y));
        path.closePath();
      }
      this.paths.set(f, path);
    }
    this.layer = document.createElement('canvas');
    this.layerCtx = this.layer.getContext('2d', { alpha: false, willReadFrequently: true });
    this.cleanup = [];
    this.motionActive = false;
    this.renderCount = 0;
    this._bind();
    this.resize();
  }

  setSim(sim) { this.sim = sim; this.pulses = []; this.particles = []; this.cacheKey = null; this.lastDrawKey = null; }
  setMode(m) { this.mode = m; }

  // ------------------------------------------------------------- interaction
  _bind() {
    const c = this.canvas;
    const listen = (target, event, fn, options) => {
      target.addEventListener(event, fn, options);
      this.cleanup.push(() => target.removeEventListener(event, fn, options));
    };
    let dragging = false, last = null, moved = 0;
    listen(c, 'pointerdown', (e) => {
      dragging = true; moved = 0; last = [e.clientX, e.clientY];
      try { c.setPointerCapture(e.pointerId); } catch {}
    });
    listen(c, 'pointerup', (e) => {
      dragging = false;
      if (moved < 5) this.onSelect(this.pick(e)?.id ?? null);
    });
    listen(c, 'pointerleave', () => { this.hover = null; this.onHover(null); });
    listen(c, 'pointermove', (e) => {
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
    listen(c, 'wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(c);
      this.cleanup.push(() => observer.disconnect());
    } else listen(window, 'resize', () => this.resize());
    listen(c, 'pointercancel', () => { dragging = false; last = null; });
  }

  destroy() { this.cleanup.forEach(fn => fn()); this.cleanup = []; this.layer.width = this.layer.height = 0; }

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
      y: -(ctr[1] - 26) * s,
    };
  }

  resetView() { this.targetView = { x: 0, y: 0, k: 1 }; }
  clampView() {
    const lim = Math.max(this.w, this.h) * this.view.k * 0.6;
    this.view.x = Math.max(-lim, Math.min(lim, this.view.x));
    this.view.y = Math.max(-lim, Math.min(lim, this.view.y));
    this.targetView.x = this.view.x; this.targetView.y = this.view.y;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === 'low' ? 1 : this.settings.quality === 'medium' ? 1.25 : 1.5);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.dpr = dpr;
    this.layer.width = this.canvas.width; this.layer.height = this.canvas.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cacheKey = null; this.lastDrawKey = null;
  }

  scale() { return Math.min(this.w / 100, this.h / 52); }
  toScreen(x, y) {
    const s = this.scale() * this.view.k;
    return [x * s + this.w / 2 - 50 * s + this.view.x, y * s + this.h / 2 - 26 * s + this.view.y];
  }
  toWorld(px, py) {
    const s = this.scale() * this.view.k;
    return { x: (px - (this.w / 2 - 50 * s + this.view.x)) / s, y: (py - (this.h / 2 - 26 * s + this.view.y)) / s };
  }

  pick(e) {
    if (!this.sim) return null;
    const r = this.canvas.getBoundingClientRect();
    const p = this.toWorld(e.clientX - r.left, e.clientY - r.top);
    // Even/odd rings preserve holes and disconnected islands. Neutral countries
    // remain neutral: never assign their geography to a nearby simulated nation.
    for (const f of this.features) {
      const b = this.featureBounds.get(f);
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
      if (f.rings.reduce((inside, ring) => inside !== pointInPoly(p.x, p.y, ring), false)) {
        return f.id ? this.sim.byId[f.id] : null;
      }
    }
    // Screen-space target for tiny islands, independent of zoom / DPR.
    let best = null, bestD = 64;
    for (const c of this.sim.countries) {
      const ctr = this.centroids[c.id];
      if (!ctr) continue;
      const [x,y] = this.toScreen(...ctr);
      const d = (x - (e.clientX-r.left)) ** 2 + (y - (e.clientY-r.top)) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
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

  colorFor(c, v) {
    const pal = this.settings.colorblind ? RAMPS.colorblind : RAMPS.normal;
    const stops = pal[this.mode] || pal.infection;
    const dim = { infection: c.totalInfected < 1 && v < 0.005, severity: v < 0.005, detection: !c.detected, research: v < 0.02 }[this.mode];
    if (dim) return IDLE;
    return ramp(stops, v);
  }

  // ------------------------------------------------------------------ render
  draw(dt = 16) {
    const anim = this.settings.animations && !this.settings.reduceMotion;
    const moving = Math.abs(this.view.x-this.targetView.x) + Math.abs(this.view.y-this.targetView.y) + Math.abs(this.view.k-this.targetView.k)*100 > 0.02;
    if (moving && anim) {
      const k = Math.min(1,dt/100);
      for (const key of ['x','y','k']) this.view[key] += (this.targetView[key]-this.view[key])*k;
    } else this.view = { ...this.targetView };
    this.time += dt;
    // A day change need not repaint geography: most early-game changes are
    // below one display colour step. Compare rendered colours, not the clock.
    const colors = this.sim ? this.sim.countries.map(c => {
      const v = this.rawValue(c);
      return this.colorFor(c,v) + ((this.settings.patterns || this.settings.colorblind) ? `:${Math.round(v*100)}` : '');
    }).join(',') : '';
    const key = [colors, this.mode, this.view.x, this.view.y, this.view.k,
      this.settings.quality, this.settings.colorblind, this.settings.patterns].join('|');
    const dirty = key !== this.cacheKey;
    if (dirty) {
      const ctx = this.ctx;
      this.ctx = this.layerCtx;
      this.drawBase();
      this.ctx = ctx;
      this.cacheKey = key;
      this.renderCount++;
    }
    const drawKey = `${key}|${this.sim?.day}|${this.selected}|${this.hover}|${this.motionActive}|${anim}|${this.settings.mapEffects}`;
    const effects = anim && this.settings.mapEffects && (this.motionActive || this.pulses.length);
    if (!dirty && drawKey === this.lastDrawKey && !effects) return;
    this.lastDrawKey = drawKey;
    this.ctx.drawImage(this.layer, 0, 0, this.w, this.h);
    for (const id of new Set([this.hover, this.selected])) {
      const f = this.features.find(f => f.id && f.id === id);
      if (f) this.paintFeature(f, null, id === this.selected ? '#ffd166' : '#e5f6ff', 1.7);
    }
    if (this.sim) {
      if (this.mode === 'transport') this.drawCorridors(false);
      if (effects && this.motionActive) this.updateParticles(dt);
      this.drawMarkers(false);
      this.drawPulses(!!effects, dt);
      this.drawLabels();
    }
  }

  paintFeature(f, fill, stroke, width = 0.6) {
    const ctx = this.ctx, s = this.scale()*this.view.k;
    const [x,y] = this.toScreen(0,0);
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
    const path = this.paths.get(f);
    if (!path) {
      ctx.beginPath();
      for (const ring of f.rings) {
        ring.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
        ctx.closePath();
      }
    }
    if (fill) { ctx.fillStyle = fill; path ? ctx.fill(path,'evenodd') : ctx.fill('evenodd'); }
    if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=width/s; path ? ctx.stroke(path) : ctx.stroke(); }
    ctx.restore();
  }

  drawBase() {
    const ctx = this.ctx;
    ctx.fillStyle = '#091724'; ctx.fillRect(0,0,this.w,this.h);
    for (const f of this.features) {
      const c = f.id && this.sim?.byId[f.id];
      const v = c ? this.rawValue(c) : 0;
      this.paintFeature(f, c ? this.colorFor(c,v) : '#14232e', '#476171', 0.55);
      if (c && v > 0.06 && (this.settings.patterns || this.settings.colorblind)) {
        // Pattern tiles are made once, not hundreds of clipped lines every frame.
        if (!this.pattern) {
          const tile = document.createElement('canvas'); tile.width=tile.height=8;
          const tctx=tile.getContext('2d'); tctx.strokeStyle='rgba(255,255,255,.3)';
          tctx.beginPath(); tctx.moveTo(0,8); tctx.lineTo(8,0); tctx.stroke();
          this.pattern=ctx.createPattern(tile,'repeat');
        }
        const path=this.paths.get(f);
        if (path) {
          const s=this.scale()*this.view.k, [x,y]=this.toScreen(0,0);
          ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.clip(path,'evenodd');
          ctx.setTransform(this.dpr,0,0,this.dpr,0,0); ctx.fillStyle=this.pattern;
          ctx.globalAlpha=0.3+v*0.7; ctx.fillRect(0,0,this.w,this.h); ctx.restore();
        }
      }
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
        ctx.shadowBlur = 0;
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
      ctx.shadowBlur = 0;
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
    if (!this.pulses.length) this.lastDrawKey = null;
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
