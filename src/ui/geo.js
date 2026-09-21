/**
 * Map geometry for VECTOR ZERO.
 *
 * Countries are stored only as points. To render an actual political map we build
 * Voronoi territories: each landmass polygon is clipped by the perpendicular
 * bisectors between a country and every other country on the same landmass. The
 * result is a set of filled territories with shared borders — a real strategy map
 * instead of dots on a blob — computed once at load and cached.
 */

const EPS = 1e-9;

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + EPS) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return Math.abs(a / 2);
}

export function polyCentroid(pts) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f; x += (pts[j][0] + pts[i][0]) * f; y += (pts[j][1] + pts[i][1]) * f;
  }
  if (Math.abs(a) < EPS) {
    return pts.reduce((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length], [0, 0]);
  }
  return [x / (3 * a), y / (3 * a)];
}

/** Chaikin corner-cutting: turns blocky outlines into organic coastlines. */
export function chaikin(pts, iterations = 2) {
  let out = pts;
  for (let it = 0; it < iterations; it++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out = next;
  }
  return out;
}

/**
 * Clip `poly` to the half-plane of points at least as close to `a` as to `b`
 * (Sutherland–Hodgman against the perpendicular bisector). The signed function is
 * linear, so the crossing parameter is exact.
 */
export function clipBisector(poly, a, b) {
  if (!poly.length) return poly;
  const f = (p) => {
    const d1 = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    const d2 = (p[0] - b[0]) ** 2 + (p[1] - b[1]) ** 2;
    return d1 - d2;
  };
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], nxt = poly[(i + 1) % poly.length];
    const fc = f(cur), fn = f(nxt);
    const inC = fc <= 0, inN = fn <= 0;
    if (inC) out.push(cur);
    if (inC !== inN) {
      const t = fc / (fc - fn);
      out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t]);
    }
  }
  return out;
}

/** Shrink a polygon toward its centroid — used to inset borders for a bevel look. */
export function insetPoly(pts, k) {
  const [cx, cy] = polyCentroid(pts);
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/**
 * Assign every country to a landmass and compute its territory polygon.
 * @returns {{ territories: Record<string, number[][]>, coasts: {id:string, pts:number[][]}[] }}
 */
export function buildTerritories(countries, landmasses, { smooth = 2 } = {}) {
  const coasts = landmasses.map((m) => ({ id: m.id, pts: chaikin(m.pts, smooth), raw: m.pts, decor: !!m.decor }));
  const byId = Object.fromEntries(countries.map((c) => [c.id, c]));

  // Membership is declared in the data, so territories never land on the wrong continent.
  const assign = new Map();
  for (const m of landmasses) {
    if (m.decor) continue;
    const members = (m.members || []).map((id) => byId[id]).filter(Boolean);
    if (members.length) assign.set(m.id, members);
  }

  const territories = {};
  const warnings = [];
  for (const [massId, members] of assign) {
    const mass = coasts.find((m) => m.id === massId);
    for (const c of members) {
      if (!pointInPoly(c.x, c.y, mass.pts)) warnings.push(`${c.id} outside ${massId}`);
      let cell = mass.pts;
      for (const other of members) {
        if (other === c) continue;
        cell = clipBisector(cell, [c.x, c.y], [other.x, other.y]);
        if (cell.length < 3) break;
      }
      territories[c.id] = cell.length >= 3 ? cell : discPoly(c.x, c.y, 1.6);
    }
  }
  for (const c of countries) if (!territories[c.id]) { territories[c.id] = discPoly(c.x, c.y, 1.6); warnings.push(`${c.id} unassigned`); }
  return { territories, coasts, assign, warnings };
}

export function discPoly(x, y, r, segments = 12) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return pts;
}

/** Shared-edge detection so borders are stroked once, not twice. */
export function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
