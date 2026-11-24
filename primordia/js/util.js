// Small math + random helpers shared by simulation and rendering.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Signed smallest difference a - b, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

export function wrapAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

/** Sum of a diminishing series: first copy worth k, each further copy worth `falloff` times the previous. */
export function diminish(n, k, falloff = 0.7) {
  let s = 0;
  let v = k;
  for (let i = 0; i < n; i++) {
    s += v;
    v *= falloff;
  }
  return s;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    // Mulberry32 with its state on the object, so saves can restore it.
    this.state = this.seed;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    const a = this.state;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    // inclusive
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  gauss() {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  /** Pick from [{w, ...}] by weight. */
  weighted(items, key = 'w') {
    let total = 0;
    for (const it of items) total += Math.max(0, it[key]);
    if (total <= 0) return items[Math.floor(this.next() * items.length)];
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, it[key]);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
}

/** Smooth 2D value noise with a permutation table. Returns values roughly in [-1, 1]. */
export function makeNoise2D(rng) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  const p = [];
  for (let i = 0; i < 256; i++) {
    p.push(i);
    vals[i] = rng.float(-1, 1);
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const v00 = vals[perm[X + perm[Y]]];
    const v10 = vals[perm[X + 1 + perm[Y]]];
    const v01 = vals[perm[X + perm[Y + 1]]];
    const v11 = vals[perm[X + 1 + perm[Y + 1]]];
    const u = fade(xf);
    const v = fade(yf);
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  };
}

export function fbm(noise, x, y, octaves = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += amp * noise(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

/** Uniform spatial hash for circles/points, rebuilt every step. */
export class SpatialHash {
  constructor(worldSize, cellSize) {
    this.cs = cellSize;
    this.n = Math.ceil(worldSize / cellSize) + 1;
    this.buckets = new Array(this.n * this.n);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  }
  clear() {
    for (const b of this.buckets) b.length = 0;
  }
  key(x, y) {
    const ix = clamp(Math.floor(x / this.cs), 0, this.n - 1);
    const iy = clamp(Math.floor(y / this.cs), 0, this.n - 1);
    return ix + iy * this.n;
  }
  insert(obj) {
    this.buckets[this.key(obj.x, obj.y)].push(obj);
  }
  /** Calls fn(obj) for every object in buckets overlapping the query circle. */
  query(x, y, r, fn) {
    const cs = this.cs;
    const x0 = clamp(Math.floor((x - r) / cs), 0, this.n - 1);
    const x1 = clamp(Math.floor((x + r) / cs), 0, this.n - 1);
    const y0 = clamp(Math.floor((y - r) / cs), 0, this.n - 1);
    const y1 = clamp(Math.floor((y + r) / cs), 0, this.n - 1);
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const b = this.buckets[ix + iy * this.n];
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}

export function formatTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
