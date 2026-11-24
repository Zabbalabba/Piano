// Saving and loading. The whole world is turned into a compact snapshot and
// kept in two places:
//  - this browser's localStorage (instant, works offline and from a file), and
//  - when the game runs as a claude.ai artifact, the player's private
//    per-user document (data/users/<id>/save), so a lineage continues on
//    another device. The newer of the two wins when loading.

import { World, Cell } from './world.js';
import { phenotype } from './genome.js';

export const SAVE_VERSION = 1;
const LS_KEY = 'primordia.save.v1';
const CLOUD_LIMIT = 240000; // characters; documents are capped at 256 KiB

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

function packGenome(g) {
  return { s: r3(g.size), m: r3(g.membrane), h: Math.round(g.hue), p: g.parts.map((p) => [p.t, r3(p.a)]) };
}
function unpackGenome(o) {
  return { size: o.s, membrane: o.m, hue: o.h, parts: o.p.map(([t, a]) => ({ t, a })) };
}

/** Snapshot of the whole game as plain JSON-able data. */
export function serialize(world, meta = {}) {
  const env = world.env;
  const q = new Uint8Array(env.o2Local.length);
  for (let i = 0; i < q.length; i++) q[i] = Math.round(Math.min(1, env.o2Local[i] / 0.35) * 255);
  const pr = world.progress;
  return {
    v: SAVE_VERSION,
    seed: world.seed,
    time: world.time,
    rng: world.rng.state,
    gameOver: world.gameOver,
    timers: { oxygen: world.oxygenTimer, immigration: world.immigrationTimer, migrant: world.migrantTimer ?? 40 },
    lineageCauses: world.lineageCauses || {},
    deathStats: world.deathStats || {},
    progress: { ...pr, unlocked: [...pr.unlocked], biomesThrived: [...pr.biomesThrived] },
    env: {
      rng: env.rng.state,
      time: env.time,
      era: env.era,
      nextEraId: env.nextEraId,
      prevMods: env.prevMods,
      mods: env.mods,
      eraHistory: env.eraHistory,
      extraVents: env.extraVents.map((v) => ({ x: r1(v.x), y: r1(v.y), strength: r3(v.strength) })),
      o2: bytesToB64(q),
    },
    cells: world.cells
      .filter((c) => !c.dead)
      .map((c) => {
        const o = {
          g: packGenome(c.genome),
          sp: c.speciesId,
          k: [r1(c.x), r1(c.y), r1(c.vx), r1(c.vy), r3(c.heading), r1(c.hp), r1(c.energy), r1(c.growth), r1(c.age), r1(c.lifespan), c.generation, r1(c.phase)],
        };
        if (c.isPlayer) {
          o.player = 1;
          o.warnedAge = !!c.warnedAge;
          o.comfort = c.comfort || {};
        }
        if (c.sm) o.sm = [c.sm.cold, c.sm.heat, c.sm.uv, c.sm.o2, c.sm.tox].map((v) => Math.round(v * 1e5) / 1e5);
        return o;
      }),
    food: world.food
      .filter((f) => !f.eaten)
      .map((f) => {
        const o = [f.kind, r1(f.x), r1(f.y), r1(f.r), r1(f.energy), r1(f.age), r1(f.life), r1(f.rot)];
        if (f.genes) o.push(f.genes);
        return o;
      }),
    species: {
      nextId: world.species.nextId,
      log: world.species.log.slice(-80),
      historyTimes: world.species.historyTimes.slice(-150),
      list: world.species.all().map((sp) => ({ ...sp, ref: packGenome(sp.ref), history: sp.history.slice(-150) })),
    },
    pressures: {
      live: world.pressures.live,
      gen: world.pressures.gen,
      genTime: world.pressures.genTime,
      attackDir: world.pressures.attackDir,
      attackKind: world.pressures.attackKind,
      biomeTime: world.pressures.biomeTime,
      recentHit: world.pressures.recentHit || 0,
    },
    meta,
  };
}

/** Rebuild a World from a snapshot. Returns { world, meta }. */
export function deserialize(d) {
  if (!d || d.v !== SAVE_VERSION) throw new Error('Unsupported save version');
  const world = new World(d.seed);
  const env = world.env;
  env.time = d.env.time;
  env.era = d.env.era;
  env.nextEraId = d.env.nextEraId;
  env.prevMods = d.env.prevMods;
  env.mods = d.env.mods;
  env.eraHistory = d.env.eraHistory;
  env.extraVents = d.env.extraVents.map((v) => ({ ...v, extra: true }));
  const q = b64ToBytes(d.env.o2);
  for (let i = 0; i < q.length && i < env.o2Local.length; i++) env.o2Local[i] = (q[i] / 255) * 0.35;

  world.time = d.time;
  world.gameOver = d.gameOver;
  world.oxygenTimer = d.timers.oxygen;
  world.immigrationTimer = d.timers.immigration;
  world.migrantTimer = d.timers.migrant;
  world.lineageCauses = d.lineageCauses;
  world.deathStats = d.deathStats;
  world.progress = { ...d.progress, unlocked: new Set(d.progress.unlocked), biomesThrived: new Set(d.progress.biomesThrived) };

  // Species.
  const reg = world.species;
  reg.map = new Map();
  for (const sp of d.species.list) reg.map.set(sp.id, { ...sp, ref: unpackGenome(sp.ref), diet: sp.diet || phenotype(unpackGenome(sp.ref)).diet });
  reg.nextId = d.species.nextId;
  reg.log = d.species.log;
  reg.historyTimes = d.species.historyTimes;
  world.playerSpecies = [...reg.map.values()].find((s) => s.isPlayer) || null;

  // Cells.
  world.cells = [];
  for (const o of d.cells) {
    const [x, y, vx, vy, heading, hp, energy, growth, age, lifespan, generation, phase] = o.k;
    const c = new Cell(world, unpackGenome(o.g), o.sp, x, y, { heading, energy, growth, age, lifespan, generation });
    c.vx = vx;
    c.vy = vy;
    c.hp = hp;
    c.phase = phase;
    if (o.sm) c.sm = { cold: o.sm[0], heat: o.sm[1], uv: o.sm[2], o2: o.sm[3], tox: o.sm[4] };
    if (o.player) {
      c.isPlayer = true;
      c.warnedAge = o.warnedAge;
      c.comfort = o.comfort;
      world.player = c;
    }
    env.sample(c.x, c.y, c.env);
    world.cells.push(c);
  }

  // Food.
  world.food = d.food.map(([kind, x, y, r, energy, age, life, rot, genes]) => ({
    kind, x, y, r, energy, age, life, rot, genes: genes || null, meat: kind === 'meat', eaten: false,
  }));
  const fc = world.foodCount;
  fc.algae = fc.bacteria = fc.detritus = fc.meat = 0;
  for (const f of world.food) fc[f.kind]++;

  // Pressures.
  Object.assign(world.pressures, d.pressures);

  // Random streams last: building cells above drew numbers from them.
  world.rng.state = d.rng;
  env.rng.state = d.env.rng;
  reg.recount();
  world.events.length = 0;
  return { world, meta: d.meta || {} };
}

export function summarize(world) {
  return {
    name: world.playerSpecies ? world.playerSpecies.name : 'Unknown',
    generation: world.progress.generation,
    time: Math.round(world.time),
    era: world.env.era.id,
    lineage: world.playerSpecies ? world.playerSpecies.pop : 0,
  };
}

// ------------------------------------------------------------ storage

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pack(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === 'undefined') return { enc: 'json', data: json };
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return { enc: 'gzip64', data: bytesToB64(buf) };
}

async function unpack(enc, data) {
  if (enc === 'json') return JSON.parse(data);
  const stream = new Blob([b64ToBytes(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

export class SaveStore {
  constructor() {
    this.cloud = null;
    this.cloudBusy = false;
    this.cloudQueued = null;
    this.lastSaved = 0;
    this.lastCloudSaved = 0;
    this.cloudError = null;
    this.ready = this.connect();
  }

  /** Find the player's private document, if this page runs where that exists. */
  async connect() {
    try {
      if (typeof window === 'undefined' || !window.claude || typeof window.claude.use !== 'function') return;
      const [db, user] = await withTimeout(Promise.all([window.claude.use('db'), window.claude.use('user')]), 11000) || [];
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      this.cloud = db.doc(`data/users/${id}/save`);
    } catch {
      this.cloud = null;
    }
  }

  get cloudAvailable() {
    return !!this.cloud;
  }

  /** Newest save from either place, or null. Resolves { snapshot, savedAt, summary, source }. */
  async load() {
    if (this.clearing) await this.clearing;
    let local = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.v === SAVE_VERSION) local = { snapshot: o.data, savedAt: o.savedAt, summary: o.summary, source: 'device' };
      }
    } catch {
      local = null;
    }
    await this.ready;
    let cloud = null;
    if (this.cloud) {
      try {
        const snap = await withTimeout(this.cloud.get(), 9000);
        const body = snap && snap.exists ? snap.data() : null;
        if (body && body.v === SAVE_VERSION && body.data) cloud = { body, savedAt: body.savedAt, summary: body.summary, source: 'account' };
      } catch {
        cloud = null;
      }
    }
    if (cloud && (!local || cloud.savedAt > local.savedAt)) {
      try {
        return { snapshot: await unpack(cloud.body.enc, cloud.body.data), savedAt: cloud.savedAt, summary: cloud.summary, source: 'account' };
      } catch {
        // A damaged cloud copy falls back to the local one.
      }
    }
    return local;
  }

  /** Quick summary of what Continue would load, without unpacking it. */
  async peek() {
    const best = await this.load();
    return best ? { savedAt: best.savedAt, summary: best.summary, source: best.source, snapshot: best.snapshot } : null;
  }

  /** Synchronous local save (safe to call while the page is closing). */
  saveLocal(world, meta) {
    const savedAt = Date.now();
    const body = { v: SAVE_VERSION, savedAt, summary: summarize(world), data: serialize(world, meta) };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(body));
      this.lastSaved = savedAt;
      return body;
    } catch {
      return body;
    }
  }

  /** Local save plus, when available, the private account copy. */
  save(world, meta, { cloud = true } = {}) {
    const body = this.saveLocal(world, meta);
    if (cloud && this.cloud) this.queueCloud(body);
    return body;
  }

  queueCloud(body) {
    if (this.cloudBusy) {
      this.cloudQueued = body;
      return;
    }
    this.cloudBusy = true;
    (async () => {
      try {
        const packed = await pack(body.data);
        if (packed.data.length > CLOUD_LIMIT) {
          this.cloudError = 'too large';
        } else {
          await this.cloud.set({ v: SAVE_VERSION, savedAt: body.savedAt, summary: body.summary, enc: packed.enc, data: packed.data });
          this.lastCloudSaved = body.savedAt;
          this.cloudError = null;
        }
      } catch (e) {
        // View-only viewers can't write; keep local saves only.
        this.cloudError = e && e.code ? e.code : 'failed';
        if (e && (e.code === 'invalid_argument' || e.code === 'not_granted' || e.code === 'revoked')) this.cloud = null;
      } finally {
        this.cloudBusy = false;
        if (this.cloudQueued && this.cloud) {
          const next = this.cloudQueued;
          this.cloudQueued = null;
          this.queueCloud(next);
        }
      }
    })();
  }

  clear() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* storage unavailable */
    }
    this.cloudQueued = null;
    this.clearing = (async () => {
      await this.ready;
      if (this.cloud) {
        try {
          await this.cloud.delete();
        } catch {
          /* nothing to remove */
        }
      }
      this.clearing = null;
    })();
    return this.clearing;
  }
}
