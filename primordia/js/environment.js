// The pond: static terrain fields (depth, vents, cold currents) plus dynamic
// global conditions that change with geological eras.

import { RNG, makeNoise2D, fbm, clamp, lerp, smoothstep } from './util.js';

export const WORLD_SIZE = 3600;
const GRID_CS = 40;

export const BIOMES = {
  shallows: { name: 'Sunlit Shallows', color: '#7fd1b9' },
  twilight: { name: 'Twilight Waters', color: '#4b8aa6' },
  abyss: { name: 'Abyssal Dark', color: '#3a4d8f' },
  frigid: { name: 'Frigid Waters', color: '#b9dcf2' },
  vents: { name: 'Hydrothermal Vents', color: '#ff8a4c' },
  seeps: { name: 'Sulfur Seeps', color: '#d8d44a' },
};
export const BIOME_IDS = Object.keys(BIOMES);

// Global conditions per era. Values are blended during transitions.
//  temp: offset in °C, light: multiplier, uv: UV intensity in bright water,
//  o2: dissolved oxygen baseline, tox: extra sulfur, food: algae growth multiplier.
export const ERAS = {
  primordial: {
    name: 'Primordial Warmth',
    desc: 'Warm seas and almost no free oxygen. With no ozone layer, ultraviolet light burns anything in the bright shallows.',
    temp: 3, light: 1.0, uv: 1.0, o2: 0.12, tox: 0.05, food: 1.0, extraVents: 0,
    hint: 'UV is strong in shallow water. Pigment helps.',
  },
  oxidation: {
    name: 'Great Oxidation',
    desc: 'Photosynthesis floods the water with oxygen. An ozone layer forms and UV fades, but oxygen poisons cells that can’t neutralize it.',
    temp: 0, light: 1.0, uv: 0.3, o2: 0.72, tox: 0, food: 1.05, extraVents: 0,
    hint: 'Oxygen rises in lit water. Peroxisomes protect; mitochondria profit.',
  },
  glaciation: {
    name: 'Global Glaciation',
    desc: 'Ice spreads across the sea. Water turns cold and thick, and less light reaches below the ice.',
    temp: -11, light: 0.65, uv: 0.25, o2: 0.6, tox: 0, food: 0.75, extraVents: 0,
    hint: 'Cold everywhere except near vents. Antifreeze or warmth needed.',
  },
  volcanic: {
    name: 'Volcanic Upheaval',
    desc: 'New vents tear open across the sea floor. Sulfur spreads through the water and ash dims the sun.',
    temp: 4, light: 0.7, uv: 0.35, o2: 0.45, tox: 0.22, food: 0.9, extraVents: 3,
    hint: 'Sulfur rises everywhere. Sulfide enzymes protect; symbionts profit.',
  },
  bloom: {
    name: 'Age of Blooms',
    desc: 'Nutrient-rich, sunlit water. Algae grow everywhere, and so do the things that eat them.',
    temp: 1, light: 1.15, uv: 0.4, o2: 0.68, tox: 0, food: 1.7, extraVents: 0,
    hint: 'Food is plentiful. Expect predators to multiply.',
  },
};

const LATE_ERAS = ['glaciation', 'volcanic', 'bloom', 'oxidation'];
const TRANSITION = 40;

function modsOf(id) {
  const e = ERAS[id];
  return { temp: e.temp, light: e.light, uv: e.uv, o2: e.o2, tox: e.tox, food: e.food };
}

export class Environment {
  constructor(seed) {
    this.rng = new RNG(seed);
    this.size = WORLD_SIZE;
    this.n = Math.ceil(WORLD_SIZE / GRID_CS) + 1;
    const N = this.n * this.n;
    this.depth = new Float32Array(N);
    this.cold = new Float32Array(N);
    this.tempBase = new Float32Array(N);
    this.toxBase = new Float32Array(N);
    this.lightBase = new Float32Array(N);
    this.curX = new Float32Array(N);
    this.curY = new Float32Array(N);
    this.o2Local = new Float32Array(N);
    this.o2Scratch = new Float32Array(N);
    this.vents = [];
    this.seeps = [];
    this.extraVents = [];
    this.time = 0;
    this.eraHistory = [];
    this.generate();

    this.era = { id: 'primordial', start: 0, duration: 260 };
    this.nextEraId = 'oxidation';
    this.prevMods = modsOf('primordial');
    this.mods = modsOf('primordial');
    this.eraChanged = null; // set to the new era id for one step when it changes
    this.eraHistory.push({ id: 'primordial', start: 0 });
  }

  generate() {
    const rng = this.rng;
    const nDepth = makeNoise2D(rng);
    const nCold = makeNoise2D(rng);
    const nTemp = makeNoise2D(rng);
    const nFlow = makeNoise2D(rng);
    const S = this.size;

    // A gentle slope so the map has a recognizable shallow side and deep side.
    const slopeA = rng.float(0, Math.PI * 2);
    const sx = Math.cos(slopeA);
    const sy = Math.sin(slopeA);
    this.slope = { x: sx, y: sy };

    const n = this.n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * GRID_CS;
        const y = j * GRID_CS;
        const k = i + j * n;
        const along = ((x - S / 2) * sx + (y - S / 2) * sy) / S; // -0.7..0.7
        const d = 0.5 + 0.9 * fbm(nDepth, x / 1300, y / 1300, 4) + 0.75 * along;
        this.depth[k] = clamp(d, 0, 1);
      }
    }

    // Vents in deep water, spread apart.
    this.vents = this.placeSpots(3, (d) => d > 0.6, 1000);
    this.seeps = this.placeSpots(2, (d) => d > 0.35 && d < 0.75, 900, this.vents);

    // Cold water: patches pushed toward one perpendicular side of the slope.
    const px = -sy;
    const py = sx;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * GRID_CS;
        const y = j * GRID_CS;
        const k = i + j * n;
        const side = ((x - S / 2) * px + (y - S / 2) * py) / S;
        const c = fbm(nCold, x / 1100, y / 1100, 3) + side * 1.1;
        this.cold[k] = smoothstep(0.18, 0.45, c);
      }
    }

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * GRID_CS;
        const y = j * GRID_CS;
        const k = i + j * n;
        const depth = this.depth[k];
        const cold = this.cold[k];
        let t = 25 - 13 * depth - 15 * cold + 2.5 * fbm(nTemp, x / 600, y / 600, 2);
        let tox = 0;
        for (const v of this.vents) {
          const d2 = (x - v.x) ** 2 + (y - v.y) ** 2;
          t += 27 * Math.exp(-d2 / (2 * 170 * 170));
          tox += 0.68 * Math.exp(-d2 / (2 * 240 * 240));
        }
        for (const s of this.seeps) {
          const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
          tox += 0.65 * Math.exp(-d2 / (2 * 210 * 210));
        }
        this.tempBase[k] = t;
        this.toxBase[k] = Math.min(1, tox);
        this.lightBase[k] = Math.pow(1 - depth, 1.4) * (1 - 0.35 * cold);

        // Currents: curl of a noise potential gives swirling, divergence-free flow.
        const e = 8;
        const psi = (xx, yy) => fbm(nFlow, xx / 900, yy / 900, 2);
        const dpdy = (psi(x, y + e) - psi(x, y - e)) / (2 * e);
        const dpdx = (psi(x + e, y) - psi(x - e, y)) / (2 * e);
        this.curX[k] = dpdy * 9000;
        this.curY[k] = -dpdx * 9000;
      }
    }
  }

  placeSpots(count, accept, minDist, avoid = []) {
    const out = [];
    const S = this.size;
    for (let tries = 0; tries < 4000 && out.length < count; tries++) {
      const x = this.rng.float(300, S - 300);
      const y = this.rng.float(300, S - 300);
      const d = this.gridValue(this.depth, x, y);
      if (!accept(d)) continue;
      const all = out.concat(avoid);
      if (all.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
      out.push({ x, y });
    }
    return out;
  }

  gridValue(arr, x, y) {
    const n = this.n;
    const fx = clamp(x / GRID_CS, 0, n - 1.001);
    const fy = clamp(y / GRID_CS, 0, n - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = i + j * n;
    const a = arr[k];
    const b = arr[k + 1];
    const c = arr[k + n];
    const d = arr[k + n + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Full local conditions at (x, y) under the given global modifiers. */
  sampleWith(x, y, mods, out = {}) {
    const depth = this.gridValue(this.depth, x, y);
    const lightBase = this.gridValue(this.lightBase, x, y);
    let temp = this.gridValue(this.tempBase, x, y) + mods.temp;
    let tox = this.gridValue(this.toxBase, x, y);
    for (const v of this.extraVents) {
      if (v.strength <= 0.01) continue;
      const d2 = (x - v.x) ** 2 + (y - v.y) ** 2;
      if (d2 > 700 * 700) continue;
      temp += 30 * v.strength * Math.exp(-d2 / (2 * 150 * 150));
      tox += 0.7 * v.strength * Math.exp(-d2 / (2 * 230 * 230));
    }
    // Vents keep their surroundings warm even during glaciation.
    if (mods.temp < 0) {
      const ventWarmth = smoothstep(0.15, 0.6, this.gridValue(this.toxBase, x, y));
      temp -= mods.temp * 0.7 * ventWarmth;
    }
    tox = clamp(tox + mods.tox * (0.35 + 0.65 * depth), 0, 1);
    const light = clamp(lightBase * mods.light, 0, 1.3);
    const uv = lightBase * lightBase * mods.uv;
    const o2 = clamp(mods.o2 * (0.5 + 0.5 * lightBase) + this.gridValue(this.o2Local, x, y) - tox * 0.35, 0, 1.2);
    out.depth = depth;
    out.temp = temp;
    out.tox = tox;
    out.light = light;
    out.uv = uv;
    out.o2 = o2;
    out.cold = this.gridValue(this.cold, x, y);
    return out;
  }

  sample(x, y, out = {}) {
    return this.sampleWith(x, y, this.mods, out);
  }

  current(x, y, out) {
    out.x = this.gridValue(this.curX, x, y);
    out.y = this.gridValue(this.curY, x, y);
    for (const v of this.vents.concat(this.extraVents)) {
      const s = v.strength ?? 1;
      const dx = x - v.x;
      const dy = y - v.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 400 * 400 || d2 < 1) continue;
      const d = Math.sqrt(d2);
      const push = 14 * s * Math.exp(-d2 / (2 * 180 * 180));
      out.x += (dx / d) * push;
      out.y += (dy / d) * push;
    }
    return out;
  }

  classify(e) {
    if (e.temp > 34 && e.tox > 0.35) return 'vents';
    if (e.tox > 0.4) return 'seeps';
    if (e.temp < 9) return 'frigid';
    if (e.light > 0.55) return 'shallows';
    if (e.light > 0.22) return 'twilight';
    return 'abyss';
  }

  biomeAt(x, y) {
    return this.classify(this.sample(x, y, this._tmp || (this._tmp = {})));
  }

  // ------------------------------------------------------------ eras

  get eraElapsed() {
    return this.time - this.era.start;
  }
  get eraRemaining() {
    return this.era.duration - this.eraElapsed;
  }
  get eraInfo() {
    return ERAS[this.era.id];
  }
  get nextEraInfo() {
    return ERAS[this.nextEraId];
  }
  get transitioning() {
    return this.eraElapsed < TRANSITION && this.era.start > 0;
  }

  modsFor(id) {
    return modsOf(id);
  }

  update(dt) {
    this.time += dt;
    this.eraChanged = null;
    if (this.eraRemaining <= 0) {
      const id = this.nextEraId;
      this.prevMods = { ...this.mods };
      this.era = { id, start: this.time, duration: this.rng.float(220, 300) };
      const options = LATE_ERAS.filter((e) => e !== id);
      this.nextEraId = this.rng.pick(options);
      this.eraChanged = id;
      this.eraHistory.push({ id, start: this.time });
      if (ERAS[id].extraVents > 0) this.openVents(ERAS[id].extraVents);
    }
    const t = this.era.start === 0 ? 1 : smoothstep(0, TRANSITION, this.eraElapsed);
    const target = modsOf(this.era.id);
    for (const k of Object.keys(target)) this.mods[k] = lerp(this.prevMods[k], target[k], t);

    // Extra vents grow during volcanic eras and fade afterwards.
    const volcanic = this.era.id === 'volcanic';
    for (const v of this.extraVents) {
      v.strength = clamp(v.strength + (volcanic ? 0.025 : -0.012) * dt, 0, 1);
    }
    this.extraVents = this.extraVents.filter((v) => volcanic || v.strength > 0);
  }

  openVents(count) {
    const spots = this.placeSpots(count, (d) => d > 0.3, 700, this.vents.concat(this.seeps));
    for (const s of spots) this.extraVents.push({ x: s.x, y: s.y, strength: 0, extra: true });
    this.newVents = spots;
  }

  /** Photosynthesis adds oxygen locally; it relaxes back and diffuses over time. */
  addOxygen(x, y, amount) {
    const i = clamp(Math.round(x / GRID_CS), 0, this.n - 1);
    const j = clamp(Math.round(y / GRID_CS), 0, this.n - 1);
    const k = i + j * this.n;
    this.o2Local[k] = Math.min(0.35, this.o2Local[k] + amount);
  }

  relaxOxygen(dt) {
    const n = this.n;
    const a = this.o2Local;
    const b = this.o2Scratch;
    const decay = Math.exp(-0.05 * dt);
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const k = i + j * n;
        const avg = (a[k - 1] + a[k + 1] + a[k - n] + a[k + n]) * 0.25;
        b[k] = (a[k] * 0.6 + avg * 0.4) * decay;
      }
    }
    a.set(b);
  }

  /** Random location whose current biome matches `id`. */
  randomPointIn(id, rng, tries = 600) {
    const tmp = {};
    for (let i = 0; i < tries; i++) {
      const x = rng.float(150, this.size - 150);
      const y = rng.float(150, this.size - 150);
      if (this.classify(this.sample(x, y, tmp)) === id) return { x, y };
    }
    return { x: rng.float(200, this.size - 200), y: rng.float(200, this.size - 200) };
  }

  /** Average conditions per biome now and under the forecast era, for the editor. */
  biomeSummary(modsOverride = null) {
    const mods = modsOverride || this.mods;
    const acc = {};
    for (const id of BIOME_IDS) acc[id] = { n: 0, temp: 0, light: 0, uv: 0, o2: 0, tox: 0, cold: 0 };
    const tmp = {};
    const step = 3;
    for (let j = 2; j < this.n - 2; j += step) {
      for (let i = 2; i < this.n - 2; i += step) {
        const e = this.sampleWith(i * GRID_CS, j * GRID_CS, mods, tmp);
        const b = acc[this.classify(e)];
        b.n++;
        b.temp += e.temp;
        b.light += e.light;
        b.uv += e.uv;
        b.o2 += e.o2;
        b.tox += e.tox;
        b.cold += e.cold;
      }
    }
    const total = Object.values(acc).reduce((s, b) => s + b.n, 0);
    for (const id of BIOME_IDS) {
      const b = acc[id];
      if (b.n) for (const k of ['temp', 'light', 'uv', 'o2', 'tox', 'cold']) b[k] /= b.n;
      b.share = b.n / total;
    }
    return acc;
  }
}
