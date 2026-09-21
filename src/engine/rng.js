// Deterministic PRNG (mulberry32) — same seed ⇒ same simulation.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.state = this.seed;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  // Poisson-ish integer draw for small lambdas, normal approximation for large.
  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda < 20) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= this.next(); } while (p > L);
      return k - 1;
    }
    const u1 = Math.max(1e-12, this.next()), u2 = this.next();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(lambda + g * Math.sqrt(lambda)));
  }
  serialize() { return { seed: this.seed, state: this.state }; }
  static deserialize(o) { const r = new RNG(o.seed); r.state = o.state >>> 0; return r; }
}
