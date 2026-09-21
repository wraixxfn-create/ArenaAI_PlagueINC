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
    this.beams = [];
    this.sprites = null;
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

  setSim(sim) { this.sim = sim; this.pulses = []; this.particles = []; this.beams = []; this.cacheKey = null; this.lastDrawKey = null; }
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

  destroy() { this.cleanup.forEach(fn => fn()); this.cleanup = []; this.layer.width = this.layer.height = 0; this.sprites = null; this.beams = []; this.particles = []; this.pulses = []; }

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
    const fx = anim && this.settings.mapEffects;
    const effects = fx && (this.motionActive || this.pulses.length || this.beams.length);
    // `flow` drives continuous motion: dash crawl, particle travel, bloom breathing.
    const flow = fx && this.motionActive;
    if (!dirty && drawKey === this.lastDrawKey && !effects) return;
    this.lastDrawKey = drawKey;
    this.ctx.drawImage(this.layer, 0, 0, this.w, this.h);
    for (const id of new Set([this.hover, this.selected])) {
      const f = this.features.find(f => f.id && f.id === id);
      if (!f) continue;
      const sel = id === this.selected;
      // Soft wide halo under the crisp ring — reads as a glow without any blur.
      this.paintFeature(f, null, sel ? 'rgba(255,209,102,0.16)' : 'rgba(229,246,255,0.13)', sel ? 4.2 : 3.2);
      this.paintFeature(f, null, sel ? '#ffd166' : '#e5f6ff', sel ? 1.6 : 1.3);
    }
    if (this.sim) {
      if (this.mode === 'transport') this.drawCorridors(false);
      if (this.mode === 'infection' && this.settings.mapEffects) this.drawTransmission(flow);
      if (this.settings.mapEffects) this.drawBloom(flow);
      if (flow) this.updateParticles(dt);
      this.drawBeams(!!effects, dt);
      this.drawMarkers(flow);
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

  /** Stroke a feature's rings with the current style; assumes a world transform. */
  _strokePath(f) {
    const ctx = this.ctx, path = this.paths.get(f);
    if (path) { ctx.stroke(path); return; }
    ctx.beginPath();
    for (const ring of f.rings) {
      ring.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
    }
    ctx.stroke();
  }

  drawBase() {
    const ctx = this.ctx;
    // Ocean: a single cheap linear gradient baked into the cached layer — no
    // blur, no radial work, repainted only when colours or the camera change.
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0c2133'); g.addColorStop(0.5, '#091724'); g.addColorStop(1, '#050d18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);

    const s = this.scale() * this.view.k;
    const [ox, oy] = this.toScreen(0, 0);
    const rich = this.settings.quality !== 'low';
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // Faint 10° graticule — the whole grid is one batched path, one stroke.
    if (rich && EARTH.graticule) {
      ctx.beginPath();
      for (const line of EARTH.graticule) line.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = 'rgba(126,182,220,0.06)'; ctx.lineWidth = 0.55 / s; ctx.stroke();
    }
    // Globe rim gives the projection a defined edge over the ocean.
    if (EARTH.sphere?.length) {
      ctx.beginPath();
      for (const ring of EARTH.sphere) { ring.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
      ctx.strokeStyle = 'rgba(140,196,232,0.2)'; ctx.lineWidth = 1 / s; ctx.stroke();
    }
    // Continental shelf: wide faint strokes under all fills — they only remain
    // visible along coastlines, where nothing covers them.
    if (rich) {
      ctx.strokeStyle = 'rgba(80,160,204,0.07)'; ctx.lineWidth = 7 / s;
      for (const f of this.features) this._strokePath(f);
      ctx.strokeStyle = 'rgba(64,146,190,0.12)'; ctx.lineWidth = 3 / s;
      for (const f of this.features) this._strokePath(f);
    }
    ctx.restore();

    for (const f of this.features) {
      const c = f.id && this.sim?.byId[f.id];
      const v = c ? this.rawValue(c) : 0;
      this.paintFeature(f, c ? this.colorFor(c, v) : '#132532', null);
      if (c && v > 0.06 && (this.settings.patterns || this.settings.colorblind)) {
        // Pattern tiles are made once, not hundreds of clipped lines every frame.
        if (!this.pattern) {
          const tile = document.createElement('canvas'); tile.width = tile.height = 8;
          const tctx = tile.getContext('2d'); tctx.strokeStyle = 'rgba(255,255,255,.3)';
          tctx.beginPath(); tctx.moveTo(0, 8); tctx.lineTo(8, 0); tctx.stroke();
          this.pattern = ctx.createPattern(tile, 'repeat');
        }
        const path = this.paths.get(f);
        if (path) {
          ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); ctx.clip(path, 'evenodd');
          ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = this.pattern;
          ctx.globalAlpha = 0.3 + v * 0.7; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
        }
      }
    }

    // Borders: dark casing first, then a hairline on top — crisp cartographic
    // separation without per-frame shadow work.
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(7,14,23,0.85)'; ctx.lineWidth = 1.6 / s;
    for (const f of this.features) this._strokePath(f);
    ctx.strokeStyle = 'rgba(125,163,187,0.38)'; ctx.lineWidth = 0.55 / s;
    for (const f of this.features) this._strokePath(f);
    ctx.restore();
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

  // ------------------------------------------------------------ fx sprites
  // Glows are pre-rendered radial sprites blitted additively. This keeps the
  // per-frame cost to a handful of drawImage calls — no live gradients, no
  // canvas blur, consistent with the cached-layer rendering model.
  _sprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  _fx() {
    if (this.sprites) return this.sprites;
    this.sprites = {
      bloom: this._sprite(96, [
        [0, 'rgba(255,112,60,0.85)'], [0.32, 'rgba(255,74,44,0.4)'],
        [0.68, 'rgba(224,52,40,0.11)'], [1, 'rgba(200,40,40,0)']]),
      core: this._sprite(28, [
        [0, 'rgba(255,246,224,1)'], [0.28, 'rgba(255,176,96,0.92)'],
        [0.62, 'rgba(255,112,60,0.34)'], [1, 'rgba(255,92,50,0)']]),
      spark: this._sprite(24, [
        [0, 'rgba(255,250,236,1)'], [0.24, 'rgba(255,192,112,0.95)'],
        [0.56, 'rgba(255,130,70,0.38)'], [1, 'rgba(255,110,60,0)']]),
      sparkSea: this._sprite(24, [
        [0, 'rgba(238,252,255,1)'], [0.24, 'rgba(154,226,255,0.95)'],
        [0.56, 'rgba(92,192,240,0.38)'], [1, 'rgba(70,170,230,0)']]),
      flash: this._sprite(72, [
        [0, 'rgba(255,252,244,0.95)'], [0.18, 'rgba(255,204,142,0.6)'],
        [0.5, 'rgba(255,124,72,0.2)'], [1, 'rgba(255,100,60,0)']]),
    };
    return this.sprites;
  }

  /** Quadratic point at u along the corridor arc used everywhere in overlays. */
  _arcPoint(x1, y1, mx, my, x2, y2, u) {
    const iv = 1 - u;
    return [iv * iv * x1 + 2 * iv * u * mx + u * u * x2,
            iv * iv * y1 + 2 * iv * u * my + u * u * y2];
  }

  /**
   * Live transmission routes: animated flow arcs along corridors out of every
   * infected nation — the signature "the virus is travelling" read. Dash crawl
   * runs toward the healthier endpoint while the sim is unpaused.
   */
  drawTransmission(flow) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [a, b] of CORRIDORS) {
      const ca = this.sim.byId[a], cb = this.sim.byId[b];
      if (!ca || !cb) continue;
      const pa = ca.pop > 0 ? ca.infected / ca.pop : 0;
      const pb = cb.pop > 0 ? cb.infected / cb.pop : 0;
      const pSrc = Math.max(pa, pb), pDst = Math.min(pa, pb);
      if (pSrc < 0.006) continue;
      const src = pa >= pb ? ca : cb, dst = pa >= pb ? cb : ca;
      const open = 1 - (src.airClosed + dst.airClosed) / 2;
      const closed = open < 0.45;
      const strength = Math.sqrt(pSrc) * (1 - pDst * 0.65) * (closed ? 0.32 : 1);
      if (strength < 0.035) continue;
      const c1 = this.centroids[src.id], c2 = this.centroids[dst.id];
      if (!c1 || !c2) continue;
      const [x1, y1] = this.toScreen(c1[0], c1[1]);
      const [x2, y2] = this.toScreen(c2[0], c2[1]);
      const pad = 40;
      if ((x1 < -pad && x2 < -pad) || (x1 > this.w + pad && x2 > this.w + pad) ||
          (y1 < -pad && y2 < -pad) || (y1 > this.h + pad && y2 > this.h + pad)) continue;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - dist * 0.17;
      // Faint continuous underlay keeps the route legible between dashes.
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.setLineDash([]);
      ctx.strokeStyle = closed ? `rgba(235,96,72,${0.05 + 0.08 * strength})` : `rgba(255,150,86,${0.05 + 0.1 * strength})`;
      ctx.lineWidth = 0.7 + strength;
      ctx.stroke();
      // Animated dash flow on top.
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.setLineDash(closed ? [3, 7] : [5.5, 9.5]);
      ctx.lineDashOffset = flow && !closed ? -this.time * (0.014 + 0.03 * strength) : 0;
      ctx.strokeStyle = closed ? `rgba(235,96,72,${0.12 + 0.3 * strength})` : `rgba(255,158,92,${0.14 + 0.44 * strength})`;
      ctx.lineWidth = 0.9 + 1.7 * strength;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.restore();
  }

  /**
   * Infection heat: an additive radial bloom + hot core over every infected
   * nation, scaled by prevalence and territory size. Breathing while running.
   */
  drawBloom(breathe) {
    const ctx = this.ctx;
    const S = this._fx();
    const s = this.scale() * this.view.k;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let i = 0;
    for (const c of this.sim.countries) {
      i++;
      if (c.infected < 1) continue;
      const prev = c.pop > 0 ? c.infected / c.pop : 0;
      if (prev < 0.0025) continue;
      const ctr = this.centroids[c.id];
      if (!ctr) continue;
      const [x, y] = this.toScreen(ctr[0], ctr[1]);
      if (x < -260 || y < -260 || x > this.w + 260 || y > this.h + 260) continue;
      const b = this.bounds[c.id];
      // Territory-relative radius so Russia glows wider than Fiji.
      const worldR = b ? Math.max(1.05, Math.min(6.5, Math.sqrt(b.w * b.h) * 0.62)) : 1.5;
      let r = worldR * s * (0.55 + 1.55 * Math.sqrt(prev));
      r = Math.max(7, Math.min(240, r));
      const ph = i * 2.39996;                       // golden-angle phase: desynced breathing
      const amp = breathe ? 0.9 + 0.1 * Math.sin(this.time / 620 + ph) : 1;
      ctx.globalAlpha = Math.min(0.7, 0.13 + 0.6 * Math.sqrt(prev)) * amp;
      ctx.drawImage(S.bloom, x - r, y - r, r * 2, r * 2);
      if (prev > 0.02) {
        const cr = (2.1 + 5.2 * Math.sqrt(prev)) * Math.min(1.7, 0.75 + 0.32 * this.view.k) *
          (breathe ? 0.92 + 0.14 * Math.sin(this.time / 430 + ph * 1.7) : 1);
        ctx.globalAlpha = Math.min(0.92, 0.32 + 0.6 * prev);
        ctx.drawImage(S.core, x - cr, y - cr, cr * 2, cr * 2);
      }
    }
    ctx.restore();
  }

  /**
   * Travel particles: glowing comets with fading tails riding open corridors
   * out of infected nations — amber for air traffic, cyan for shipping.
   */
  updateParticles(dt) {
    const ctx = this.ctx;
    const cap = this.settings.quality === 'low' ? 14 : this.settings.quality === 'medium' ? 32 : 60;
    // spawn
    if (this.particles.length < cap && this.sim) {
      for (const [a, b] of CORRIDORS) {
        if (this.particles.length >= cap) break;
        const ca = this.sim.byId[a], cb = this.sim.byId[b];
        if (!ca || !cb) continue;
        const open = 1 - (ca.airClosed + cb.airClosed) / 2;
        if (open < 0.45) continue;
        const prevA = ca.pop > 0 ? ca.infected / ca.pop : 0;
        const prevB = cb.pop > 0 ? cb.infected / cb.pop : 0;
        const src = prevA >= prevB ? ca : cb, dst = prevA >= prevB ? cb : ca;
        const prev = Math.max(prevA, prevB);
        if (prev < 0.004) continue;
        if (Math.random() < Math.min(0.05, prev * 0.35) * (dt / 16)) {
          const byAir = src.air * (1 - src.airClosed) >= src.sea * (1 - src.seaClosed);
          this.particles.push({
            a: src.id, b: dst.id, t: 0, kind: byAir ? 'air' : 'sea',
            speed: (byAir ? 0.00042 : 0.00024) + Math.random() * 0.00034,
          });
        }
      }
    }
    // draw + advance
    const S = this._fx();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      p.t += p.speed * dt;
      const ca = this.centroids[p.a], cb = this.centroids[p.b];
      if (!ca || !cb) { p.t = 2; continue; }
      const [x1, y1] = this.toScreen(ca[0], ca[1]);
      const [x2, y2] = this.toScreen(cb[0], cb[1]);
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - dist * 0.17;
      const fade = Math.sin(Math.min(1, p.t) * Math.PI);
      const spr = p.kind === 'sea' ? S.sparkSea : S.spark;
      const zoom = Math.min(1.6, 0.8 + 0.3 * this.view.k);
      // two tail ghosts behind the head, then the head itself
      for (let g = 2; g >= 0; g--) {
        const u = Math.max(0, p.t - g * 0.024);
        const [x, y] = this._arcPoint(x1, y1, mx, my, x2, y2, u);
        if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue;
        const r = (g === 0 ? 4.6 : g === 1 ? 3.3 : 2.2) * zoom;
        ctx.globalAlpha = (g === 0 ? 0.9 : g === 1 ? 0.34 : 0.15) * fade;
        ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
    this.particles = this.particles.filter((p) => p.t < 1);
  }

  /**
   * Transmission beams: when a nation is freshly infected, a bright comet
   * rides the arc from the source country and flashes on impact — one-shot
   * storytelling for every `log.newCountry` event, coloured by travel mode.
   */
  drawBeams(anim, dt) {
    if (!anim || !this.beams.length) { this.beams = []; return; }
    const ctx = this.ctx;
    const S = this._fx();
    const BEAM_MS = 1600;
    const LINE = {
      'mode.air': '255,196,124', 'mode.land': '255,142,92',
      'mode.sea': '146,216,255', 'mode.spore': '203,152,255',
    };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const bm of this.beams) {
      bm.t += dt;
      const k = bm.t / BEAM_MS;
      if (k > 1) continue;
      const [x1, y1] = this.toScreen(bm.x1, bm.y1);
      const [x2, y2] = this.toScreen(bm.x2, bm.y2);
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(90, dist * 0.22);
      const rgb = LINE[bm.mode] || LINE['mode.air'];
      const fade = 1 - k * k * 0.85;
      const travel = Math.min(1, k / 0.55);
      // lit portion of the arc, brightening toward the comet
      const N = 22, seg = Math.max(1, Math.round(N * travel));
      ctx.beginPath();
      for (let i = 0; i <= seg; i++) {
        const [x, y] = this._arcPoint(x1, y1, mx, my, x2, y2, (i / seg) * travel);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${rgb},${(0.5 * fade).toFixed(3)})`;
      ctx.lineWidth = 0.6 + 1.7 * fade;
      ctx.stroke();
      const spr = bm.mode === 'mode.sea' ? S.sparkSea : S.spark;
      if (travel < 1) {
        // comet + two ghosts
        for (let g = 2; g >= 0; g--) {
          const u = Math.max(0, travel - g * 0.045);
          const [x, y] = this._arcPoint(x1, y1, mx, my, x2, y2, u);
          const r = (g === 0 ? 9 : g === 1 ? 6.4 : 4.4) * (0.7 + 0.5 * fade);
          ctx.globalAlpha = (g === 0 ? 0.9 : g === 1 ? 0.4 : 0.18) * fade;
          ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
        }
      } else {
        // impact flash while the pulse rings expand at the destination
        const fr = 10 + 30 * (1 - fade);
        ctx.globalAlpha = Math.max(0, fade - 0.15) * 0.85;
        ctx.drawImage(S.flash, x2 - fr, y2 - fr, fr * 2, fr * 2);
      }
    }
    ctx.restore();
    this.beams = this.beams.filter((bm) => bm.t < BEAM_MS);
    if (!this.beams.length && !this.pulses.length) this.lastDrawKey = null;
  }

  /** Status markers drawn at territory centroids, on a soft dark plate. */
  drawMarkers(anim) {
    const ctx = this.ctx;
    for (const c of this.sim.countries) {
      const ctr = this.centroids[c.id];
      if (!ctr) continue;
      const [x, y] = this.toScreen(...ctr);
      if (x < -60 || y < -40 || x > this.w + 60 || y > this.h + 40) continue;
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
      // backing plate keeps glyphs legible over hot bloom and bright fills
      const cw = (total - 1) * size * 0.86 + size * 1.25, ch = size * 1.35;
      const cx = x - cw / 2, cy = y - size * 0.55 - ch / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(7,14,22,0.62)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx, cy, cw, ch, ch * 0.34);
      else ctx.rect(cx, cy, cw, ch);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,163,187,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
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
      const [x, y] = this.toScreen(ctr[0], ctr[1]);
      if (x < -80 || y < -30 || x > this.w + 80 || y > this.h + 30) continue;
      const name = tc(c.id);
      const size = focused ? Math.max(11, Math.min(15, 7.5 * this.view.k)) : Math.max(9, Math.min(13, 6.5 * this.view.k));
      ctx.font = `${focused ? '600 ' : ''}${size}px system-ui, sans-serif`;
      if (!focused && ctx.measureText(name).width > wpx * 0.95) continue;
      const ty = y + Math.max(9, size * 0.9);
      ctx.save();
      // dark outline instead of shadow: sharper over bloom and hot fills
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = 'rgba(5,11,18,0.88)';
      ctx.strokeText(name, x, ty);
      ctx.fillStyle = focused ? '#ffffff' : 'rgba(228,241,251,0.86)';
      ctx.fillText(name, x, ty);
      ctx.restore();
    }
  }

  /**
   * Event marker. `from` (source country id) and `mode` (`mode.air|sea|land|
   * spore`) turn a new-infection event into a visible transmission beam.
   */
  addPulse(id, kind = 'infect', from = null, mode = null) {
    const ctr = this.centroids[id];
    if (!ctr) return;
    this.pulses.push({ x: ctr[0], y: ctr[1], t: 0, kind });
    if (this.pulses.length > 40) this.pulses.shift();
    if (kind === 'infect' && from && from !== id) {
      const src = this.centroids[from];
      if (src) {
        this.beams.push({ x1: src[0], y1: src[1], x2: ctr[0], y2: ctr[1], t: 0, mode: mode || 'mode.air' });
        if (this.beams.length > 24) this.beams.shift();
      }
    }
  }

  drawPulses(anim, dt) {
    if (!anim) { this.pulses = []; return; }
    const ctx = this.ctx;
    const S = this._fx();
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
      // opening flash: a blit of the pre-rendered glow sprite, no blur pass
      if (k < 0.4) {
        const fr = 8 + 30 * (k / 0.4);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 * (1 - k / 0.4);
        ctx.drawImage(S.flash, x - fr, y - fr, fr * 2, fr * 2);
        ctx.restore();
      }
      for (let ring = 0; ring < 2; ring++) {
        const rk = Math.max(0, ease - ring * 0.18);
        if (rk <= 0) continue;
        ctx.beginPath();
        ctx.arc(x, y, 5 + rk * 42, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${((1 - k) * (ring ? 0.35 : 0.8)).toFixed(3)})`;
        ctx.lineWidth = (ring ? 1.2 : 2.4) * (1 - k);
        ctx.stroke();
      }
    }
    this.pulses = this.pulses.filter((p) => p.t < 1500);
    if (!this.pulses.length && !this.beams.length) this.lastDrawKey = null;
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
