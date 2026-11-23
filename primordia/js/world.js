// The simulation: cells, food, toxin clouds, physics, metabolism, combat,
// reproduction and the player's lineage. No DOM or canvas code in here, so it
// also runs headless in Node (see tools/simtest.mjs).

import { Environment, WORLD_SIZE, ERAS, BIOMES } from './environment.js';
import { RNG, SpatialHash, clamp, angleDiff, lerp } from './util.js';
import { phenotype, cloneGenome, mutateGenome, FOUNDERS, PLAYER_STARTS } from './genome.js';
import { PARTS, STARTING_UNLOCKS } from './parts.js';
import { SpeciesRegistry } from './species.js';
import { Pressures } from './pressures.js';
import { envStress, viscosity, oxygenFactor } from './biology.js';
import { think } from './ai.js';

let nextCellId = 1;

export class Cell {
  constructor(world, genome, speciesId, x, y, opts = {}) {
    const rng = world.rng;
    this.id = nextCellId++;
    this.setGenome(genome);
    this.speciesId = speciesId;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heading = opts.heading ?? rng.float(-Math.PI, Math.PI);
    this.hp = this.ph.maxHP;
    this.energy = opts.energy ?? this.ph.maxEnergy * 0.6;
    this.growth = opts.growth ?? rng.float(0, this.ph.growthNeeded * 0.4);
    this.age = opts.age ?? rng.float(0, 60);
    this.lifespan = opts.lifespan ?? rng.float(220, 340);
    this.generation = opts.generation ?? 1;
    this.isPlayer = false;
    this.ctrl = { dx: 0, dy: 0, thrust: 0 };
    this.ai = { timer: rng.float(0, 0.3), wander: rng.float(-Math.PI, Math.PI), mode: 'wander' };
    this.biteCd = 0;
    this.spikeCd = 0;
    this.toxinCd = 0;
    this.flash = 0;
    this.biteAnim = 0;
    this.phase = rng.float(0, 100);
    this.env = {};
    this.stress = {};
    this.stressTotal = 0;
    this.thrustUsed = 0;
    this.thrustLevel = 0;
    this.crowd = 0;
    this.dead = false;
    this.cause = null;
    this.killer = null;
    this.chasedBy = null;
  }
  setGenome(g) {
    this.genome = g;
    this.ph = phenotype(g);
    this.r = this.ph.radius;
    this.mouths = g.parts.filter((p) => p.t === 'filter' || p.t === 'jaw');
    this.ext = g.parts.filter((p) => PARTS[p.t].ext);
  }
}

// Separate caps per food type so abundant algae can't block food in the dark.
const FOOD_CAPS = { algae: 650, bacteria: 280, detritus: 520, meat: 9999 };

const FOOD_TYPES = {
  algae: { energy: 6, r: 3.2, life: 140, meat: false },
  bacteria: { energy: 7, r: 3, life: 100, meat: false },
  detritus: { energy: 4.5, r: 2.4, life: 160, meat: false },
  meat: { energy: 9, r: 4, life: 50, meat: true },
};

export class World {
  constructor(seed = (Math.random() * 1e9) | 0, opts = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.env = new Environment(seed ^ 0x5bd1e995);
    this.size = WORLD_SIZE;
    this.cells = [];
    this.food = [];
    this.clouds = [];
    this.fx = [];
    this.events = [];
    this.cellHash = new SpatialHash(this.size, 90);
    this.foodHash = new SpatialHash(this.size, 60);
    this.species = new SpeciesRegistry(this);
    this.time = 0;
    this.maxCells = opts.maxCells ?? 240;
    this.foodCount = { algae: 0, bacteria: 0, detritus: 0, meat: 0 };
    this.immigrationTimer = 5;
    this.player = null;
    this.playerSpecies = null;
    this.autopilot = !!opts.autopilot;
    this.oxygenTimer = 0;
    this.pressures = new Pressures();
    this.progress = {
      dna: 0,
      dnaFrac: 0,
      unlocked: new Set(STARTING_UNLOCKS),
      generation: 1,
      kills: 0,
      eaten: 0,
      genesAcquired: 0,
      erasSurvived: 0,
      divisions: 0,
      bornAt: 0,
      lineageDeaths: 0,
      peakLineage: 1,
      biomesThrived: new Set(),
      readyToDivide: false,
    };
    this.gameOver = false;
    this._cur = { x: 0, y: 0 };
    this._stress = {};
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data, time: this.time });
  }

  // ------------------------------------------------------------ setup

  populate() {
    for (const f of FOUNDERS) {
      const sp = this.species.create({ name: f.name, genome: f.genome });
      for (let i = 0; i < f.count; i++) {
        const p = this.env.randomPointIn(f.biome, this.rng);
        this.addCell(cloneGenome(f.genome), sp.id, p.x, p.y);
      }
    }
    // Initial food so the world doesn't start barren.
    for (let i = 0; i < 500; i++) this.spawnFood(1 / 60, true);
  }

  spawnPlayer(startKey, speciesName = null) {
    const start = PLAYER_STARTS[startKey] || PLAYER_STARTS.shallows;
    for (const u of start.unlocks || []) this.progress.unlocked.add(u);
    const sp = this.species.create({ name: speciesName, genome: start.genome, isPlayer: true });
    this.playerSpecies = sp;
    // Start somewhere the starting body can survive without taking damage.
    const startPh = phenotype(start.genome);
    let p = this.env.randomPointIn(start.biome, this.rng);
    for (let i = 0; i < 60 && envStress(startPh, this.env.sample(p.x, p.y, {})).total > 0; i++) {
      p = this.env.randomPointIn(start.biome, this.rng);
    }
    // A fair start: move nearby predators somewhere else.
    for (const o of this.cells) {
      if (o.ph.bite > 0 && Math.hypot(o.x - p.x, o.y - p.y) < 500) {
        const q = this.env.randomPointIn('twilight', this.rng);
        if (Math.hypot(q.x - p.x, q.y - p.y) > 900) {
          o.x = q.x;
          o.y = q.y;
        } else o.hp = 0;
      }
    }
    const c = this.addCell(cloneGenome(start.genome), sp.id, p.x, p.y, { energy: 40, growth: 12, age: 0 });
    c.isPlayer = true;
    this.player = c;
    // A few kin nearby so the lineage has a buffer.
    for (let i = 0; i < 3; i++) {
      this.addCell(cloneGenome(start.genome), sp.id, p.x + this.rng.float(-90, 90), p.y + this.rng.float(-90, 90), { age: 0, growth: 0 });
    }
    this.species.recount();
    return c;
  }

  addCell(genome, speciesId, x, y, opts = {}) {
    const c = new Cell(this, genome, speciesId, clamp(x, 40, this.size - 40), clamp(y, 40, this.size - 40), opts);
    this.env.sample(c.x, c.y, c.env);
    this.cells.push(c);
    return c;
  }

  addFood(kind, x, y, extra = {}) {
    const fc = this.foodCount;
    if (kind !== 'meat' && fc[kind] >= FOOD_CAPS[kind]) return null;
    fc[kind]++;
    const t = FOOD_TYPES[kind];
    const f = {
      kind,
      x,
      y,
      r: t.r * (extra.scale || 1),
      energy: extra.energy ?? t.energy,
      meat: t.meat,
      age: 0,
      life: t.life * this.rng.float(0.8, 1.2),
      rot: this.rng.float(0, 6.28),
      genes: extra.genes || null,
      eaten: false,
    };
    this.food.push(f);
    return f;
  }

  spawnFood(dt, initial = false) {
    const env = this.env;
    const mods = env.mods;
    const tmp = this._envTmp || (this._envTmp = {});
    const rng = this.rng;
    const algaeAttempts = 70 * dt * mods.food;
    for (let n = algaeAttempts; n > 0; n--) {
      if (n < 1 && !rng.chance(n)) break;
      const x = rng.float(30, this.size - 30);
      const y = rng.float(30, this.size - 30);
      const e = env.sample(x, y, tmp);
      if (rng.chance(Math.min(1, e.light) * (e.temp > 3 ? 1 : 0.6))) this.addFood('algae', x, y);
    }
    for (const v of env.vents.concat(env.extraVents)) {
      const s = v.strength ?? 1;
      const rate = 4 * s * dt * (initial ? 3 : 1);
      if (rng.chance(rate)) {
        const a = rng.float(0, 6.28);
        const d = Math.abs(rng.gauss()) * 170 + 30;
        this.addFood('bacteria', v.x + Math.cos(a) * d, v.y + Math.sin(a) * d);
      }
    }
    for (const s of env.seeps) {
      if (rng.chance(1.6 * dt)) {
        const a = rng.float(0, 6.28);
        const d = Math.abs(rng.gauss()) * 160;
        this.addFood('bacteria', s.x + Math.cos(a) * d, s.y + Math.sin(a) * d);
      }
    }
    // Detritus ("marine snow") drifts everywhere, a little thicker in deep water.
    const detritus = 16 * dt;
    for (let n = detritus; n > 0; n--) {
      if (n < 1 && !rng.chance(n)) break;
      const x = rng.float(30, this.size - 30);
      const y = rng.float(30, this.size - 30);
      const e = env.sample(x, y, tmp);
      // Cold water is nutrient-rich (upwelling), so it gets extra detritus.
      if (rng.chance(Math.min(1, 0.3 + 0.55 * e.depth + 1.1 * e.cold))) this.addFood('detritus', x, y);
    }
  }

  // ------------------------------------------------------------ main step

  step(dt) {
    this.time += dt;
    const env = this.env;
    env.update(dt);
    if (env.eraChanged) {
      const era = ERAS[env.eraChanged];
      this.emit('era', { id: env.eraChanged, name: era.name, desc: era.desc });
      if (this.player && !this.gameOver) this.progress.erasSurvived++;
    }
    if (env.newVents) {
      this.emit('vents', { count: env.newVents.length });
      env.newVents = null;
    }

    this.spawnFood(dt);

    this.cellHash.clear();
    for (const c of this.cells) this.cellHash.insert(c);
    this.foodHash.clear();
    for (const f of this.food) this.foodHash.insert(f);

    for (const c of this.cells) {
      if (c.dead) continue;
      c.age += dt;
      env.sample(c.x, c.y, c.env);
      if (!c.isPlayer || this.autopilot) think(c, this, dt);
      this.move(c, dt);
      this.metabolize(c, dt);
      c.biteCd -= dt;
      c.spikeCd -= dt;
      c.toxinCd -= dt;
      c.flash = Math.max(0, c.flash - dt * 3);
      c.biteAnim = Math.max(0, c.biteAnim - dt * 4);
    }

    this.collide();
    this.feed();
    this.updateClouds(dt);
    this.updateFood(dt);
    this.reproduce();
    this.reap();
    this.immigrate(dt);
    this.trackPlayer(dt);

    this.oxygenTimer -= dt;
    if (this.oxygenTimer <= 0) {
      this.oxygenTimer = 1;
      env.relaxOxygen(1);
    }
    this.species.tick(dt);

    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < (f.life || 0.8));
  }

  move(c, dt) {
    const ph = c.ph;
    const ctl = c.ctrl;
    const visc = viscosity(c.env.temp);
    const len = Math.hypot(ctl.dx, ctl.dy);
    const boost = ctl.boost && c.energy > 2 ? 1.5 : 1;
    const t = clamp(ctl.thrust, 0, 1) * boost;
    if (len > 0.05 && t > 0) {
      const target = Math.atan2(ctl.dy, ctl.dx);
      const d = angleDiff(target, c.heading);
      const maxTurn = (ph.turn * dt) / (0.7 + 0.3 * visc);
      c.heading += clamp(d, -maxTurn, maxTurn);
      const align = Math.max(0, Math.cos(d));
      const fwd = ph.fwdThrust * t * (0.2 + 0.8 * align);
      const cil = (ph.ciliaThrust * t) / visc;
      c.vx += ((Math.cos(c.heading) * fwd + (ctl.dx / len) * cil) / ph.mass) * dt;
      c.vy += ((Math.sin(c.heading) * fwd + (ctl.dy / len) * cil) / ph.mass) * dt;
      c.thrustUsed = (fwd + cil) * (boost > 1 ? 2.2 : 1);
      c.thrustLevel = lerp(c.thrustLevel, Math.min(1.5, t), 0.15);
    } else {
      c.thrustUsed = 0;
      c.thrustLevel = lerp(c.thrustLevel, 0, 0.1);
    }
    const k = Math.exp(-1.6 * visc * dt);
    c.vx *= k;
    c.vy *= k;
    const cur = this.env.current(c.x, c.y, this._cur);
    const cf = 1 / (0.7 + 0.3 * ph.mass);
    c.x += (c.vx + cur.x * cf) * dt;
    c.y += (c.vy + cur.y * cf) * dt;
    const m = c.r + 4;
    if (c.x < m) (c.x = m), (c.vx = Math.abs(c.vx) * 0.3);
    if (c.y < m) (c.y = m), (c.vy = Math.abs(c.vy) * 0.3);
    if (c.x > this.size - m) (c.x = this.size - m), (c.vx = -Math.abs(c.vx) * 0.3);
    if (c.y > this.size - m) (c.y = this.size - m), (c.vy = -Math.abs(c.vy) * 0.3);
  }

  metabolize(c, dt) {
    const ph = c.ph;
    const e = c.env;
    const eff = 1 - ph.mito * oxygenFactor(e.o2);
    let gain = 0;
    const shade = 1 / (1 + 0.22 * Math.max(0, c.crowd - 1));
    if (ph.photo > 0) {
      const g = ph.photo * Math.min(e.light, 1.2) * shade;
      gain += g;
      this.env.addOxygen(c.x, c.y, g * dt * 0.0012);
    }
    if (ph.chemo > 0) gain += ph.chemo * Math.min(e.tox * 1.6, 1) * shade;
    c.gain = gain;
    const cost = (ph.upkeep + c.thrustUsed * ph.moveCost) * eff;
    c.energy += (gain - cost) * dt;

    const s = envStress(ph, e, c.stress);
    let rate = s.total;
    c.starving = false;
    if (c.energy <= 0) {
      c.energy = 0;
      rate += 0.025;
      c.starving = true;
    }
    c.stressTotal = s.total;
    // Remember recent stress so AI mutations can lean toward relief.
    const sm = c.sm || (c.sm = { cold: 0, heat: 0, uv: 0, o2: 0, tox: 0 });
    const km = Math.min(1, dt / 20);
    sm.cold += (s.cold - sm.cold) * km;
    sm.heat += (s.heat - sm.heat) * km;
    sm.uv += (s.uv - sm.uv) * km;
    sm.o2 += (s.o2 - sm.o2) * km;
    sm.tox += (s.tox - sm.tox) * km;
    if (rate > 0) {
      c.hp -= rate * ph.maxHP * dt;
      if (c.hp <= 0 && !c.cause) c.cause = c.starving && s.total < 0.01 ? 'starvation' : mainStress(s);
    }
    // Healing costs energy.
    if (c.energy > ph.maxEnergy * 0.25 && c.hp < ph.maxHP) {
      const heal = Math.min(ph.maxHP - c.hp, 0.03 * ph.maxHP * dt);
      c.hp += heal;
      c.energy -= heal * 0.25;
    }
    // Surplus energy becomes growth toward division.
    const reserve = ph.maxEnergy * 0.4;
    if (c.energy > reserve && c.growth < ph.growthNeeded) {
      const tr = Math.min(c.energy - reserve, (0.6 + 0.9 * ph.radius / 13) * dt);
      c.growth += tr;
      c.energy -= tr;
    }
    if (c.energy > ph.maxEnergy) {
      c.growth = Math.min(ph.growthNeeded, c.growth + (c.energy - ph.maxEnergy) * 0.8);
      c.energy = ph.maxEnergy;
    }
    if (!c.isPlayer && c.age > c.lifespan) {
      c.hp = 0;
      c.cause = c.cause || 'old age';
    }
    if (c.isPlayer && c.age > c.lifespan * 1.6) {
      c.hp = 0;
      c.cause = c.cause || 'old age';
    }
  }

  // ------------------------------------------------------------ interactions

  collide() {
    const cells = this.cells;
    for (const a of cells) {
      if (a.dead) continue;
      this.cellHash.query(a.x, a.y, a.r + 32, (b) => {
        if (b.id <= a.id || b.dead || a.dead) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 0.0001) return;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = min - d;
        const ma = a.ph.mass;
        const mb = b.ph.mass;
        const tm = ma + mb;
        a.x -= nx * overlap * (mb / tm);
        a.y -= ny * overlap * (mb / tm);
        b.x += nx * overlap * (ma / tm);
        b.y += ny * overlap * (ma / tm);
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        const closing = Math.max(0, -vrel);
        if (vrel < 0) {
          const j = (-(1 + 0.25) * vrel) / (1 / ma + 1 / mb);
          a.vx -= (j * nx) / ma;
          a.vy -= (j * ny) / ma;
          b.vx += (j * nx) / mb;
          b.vy += (j * ny) / mb;
        }
        this.contact(a, b, nx, ny, d, closing);
        this.contact(b, a, -nx, -ny, d, closing);
      });
    }
  }

  /** Effects of A's parts touching B. (nx, ny) points from A to B. */
  contact(A, B, nx, ny, d, closing) {
    if (A.dead || B.dead) return;
    if (A.speciesId === B.speciesId) return;
    const angTo = angleDiff(Math.atan2(ny, nx), A.heading);
    const halfW = Math.asin(Math.min(1, B.r / Math.max(d, B.r)));
    for (const p of A.ext) {
      const part = PARTS[p.t];
      if (p.t === 'jaw') {
        if (A.biteCd > 0) continue;
        if (Math.abs(angleDiff(angTo, p.a)) > part.arc / 2 + halfW) continue;
        if (!A.isPlayer && A.ai.mode === 'flee') continue;
        const dealt = this.damage(B, A.ph.bite, A, 'jaw');
        A.energy += dealt * A.ph.meatEff;
        A.biteCd = 0.6;
        A.biteAnim = 1;
        this.fx.push({ type: 'bite', x: B.x - nx * B.r, y: B.y - ny * B.r, t: 0, life: 0.4 });
      } else if (p.t === 'spike') {
        if (A.spikeCd > 0 || closing < 10) continue;
        if (Math.abs(angleDiff(angTo, p.a)) > part.arc / 2 + halfW) continue;
        this.damage(B, A.ph.spike * clamp(closing / 45, 0.4, 2.2), A, 'spike');
        A.spikeCd = 0.5;
        this.fx.push({ type: 'spark', x: A.x + nx * A.r, y: A.y + ny * A.r, t: 0, life: 0.35 });
      }
    }
  }

  damage(B, amount, attacker, kind) {
    if (B.dead || amount <= 0) return 0;
    const angFrom = angleDiff(Math.atan2(attacker.y - B.y, attacker.x - B.x), B.heading);
    for (const p of B.ext) {
      if (p.t === 'armor' && Math.abs(angleDiff(angFrom, p.a)) < PARTS.armor.arc / 2) {
        amount *= 0.4;
        break;
      }
    }
    amount *= 1 - B.ph.membraneDR;
    const dealt = Math.min(amount, B.hp);
    B.hp -= amount;
    B.flash = 1;
    B.lastHit = { speciesId: attacker.speciesId, kind, time: this.time };
    if (B.isPlayer) {
      this.pressures.onHit(amount, kind, angFrom, B);
      this.emit('playerHit', { amount, kind });
    }
    if (B.hp <= 0 && !B.cause) {
      B.cause = kind === 'toxin' ? 'poison' : 'predation';
      B.killer = attacker;
    }
    return dealt;
  }

  feed() {
    for (const c of this.cells) {
      if (c.dead || !c.mouths.length) continue;
      const reach = c.r + 6;
      this.foodHash.query(c.x, c.y, reach + 5, (f) => {
        if (f.eaten) return;
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d > reach + f.r) return;
        const ang = angleDiff(Math.atan2(dy, dx), c.heading);
        let ok = false;
        for (const m of c.mouths) {
          if (Math.abs(angleDiff(ang, m.a)) < PARTS[m.t].arc / 2 + 0.25) {
            ok = true;
            break;
          }
        }
        if (!ok) return;
        const eff = f.meat ? c.ph.meatEff : c.ph.plantEff;
        if (eff <= 0.05) return;
        f.eaten = true;
        c.energy += f.energy * eff;
        c.biteAnim = Math.max(c.biteAnim, 0.5);
        if (c.isPlayer) this.playerAte(f, eff);
      });
    }
  }

  releaseToxin(c) {
    if (c.ph.toxin <= 0 || c.toxinCd > 0 || c.energy < 5) return false;
    c.toxinCd = 7;
    c.energy -= 5;
    const gland = c.ext.find((p) => p.t === 'toxin');
    const a = c.heading + (gland ? gland.a : Math.PI);
    this.clouds.push({
      x: c.x + Math.cos(a) * c.r * 1.3,
      y: c.y + Math.sin(a) * c.r * 1.3,
      r: 8,
      maxR: 60 + 25 * c.ph.toxin,
      t: 0,
      life: 4.5,
      power: c.ph.toxin,
      speciesId: c.speciesId,
      owner: c,
    });
    if (c.isPlayer) this.emit('toxin');
    return true;
  }

  updateClouds(dt) {
    for (const cl of this.clouds) {
      cl.t += dt;
      cl.r = lerp(cl.r, cl.maxR, 1 - Math.exp(-dt * 2.5));
      this.cellHash.query(cl.x, cl.y, cl.r + 30, (b) => {
        if (b.dead || b.speciesId === cl.speciesId) return;
        if (Math.hypot(b.x - cl.x, b.y - cl.y) > cl.r + b.r * 0.5) return;
        const resist = clamp((b.ph.toxTol - 0.22) * 1.6, 0, 0.85);
        const fade = 1 - cl.t / cl.life;
        this.damage(b, 7 * cl.power * (1 - resist) * fade * dt, cl.owner, 'toxin');
        b.flash = Math.max(b.flash, 0.4);
      });
    }
    this.clouds = this.clouds.filter((c) => c.t < c.life);
  }

  updateFood(dt) {
    const cur = this._cur;
    for (const f of this.food) {
      f.age += dt;
      this.env.current(f.x, f.y, cur);
      f.x = clamp(f.x + cur.x * 0.8 * dt, 5, this.size - 5);
      f.y = clamp(f.y + cur.y * 0.8 * dt, 5, this.size - 5);
      f.rot += dt * 0.3;
    }
    this.food = this.food.filter((f) => !f.eaten && f.age < f.life);
    const fc = this.foodCount;
    fc.algae = fc.bacteria = fc.detritus = fc.meat = 0;
    for (const f of this.food) fc[f.kind]++;
  }

  /** Empty habitats get colonised by migrants from the open ocean. */
  migrants() {
    if (this.cells.length > this.maxCells - 20) return;
    const counts = {};
    for (const c of this.cells) {
      const b = this.env.classify(c.env);
      counts[b] = (counts[b] || 0) + 1;
    }
    const empty = FOUNDERS.filter((f) => (counts[f.biome] || 0) < 4);
    if (!empty.length || !this.rng.chance(0.5)) return;
    const f = this.rng.pick(empty);
    const g = mutateGenome(f.genome, this.rng);
    const sp = this.species.create({ genome: g });
    const p = this.env.randomPointIn(f.biome, this.rng);
    for (let i = 0; i < 4; i++) this.addCell(cloneGenome(g), sp.id, p.x + this.rng.float(-60, 60), p.y + this.rng.float(-60, 60), { age: 0 });
    this.species.record('migration', `${sp.name} migrated into the ${BIOMES[f.biome].name.toLowerCase()}`, sp.id);
  }

  /**
   * Cells drift in from the wider ocean when the pond is nearly empty, so a
   * mass extinction thins the ecosystem without wiping it out completely.
   */
  immigrate(dt) {
    this.immigrationTimer -= dt;
    if (this.immigrationTimer > 0) return;
    this.immigrationTimer = 4;
    this.migrantTimer = (this.migrantTimer ?? 40) - 4;
    if (this.migrantTimer <= 0) {
      this.migrantTimer = 35;
      this.migrants();
    }
    if (this.cells.length >= 110) return;
    const donors = this.cells.filter((c) => !c.dead && !this.species.get(c.speciesId)?.isPlayer);
    for (let i = 0; i < 3 && donors.length; i++) {
      const d = this.rng.pick(donors);
      const a = this.rng.float(0, Math.PI * 2);
      this.addCell(cloneGenome(d.genome), d.speciesId, d.x + Math.cos(a) * 60, d.y + Math.sin(a) * 60, { age: 0, growth: 0 });
    }
  }

  reproduce() {
    const count = this.cells.length;
    const born = [];
    for (const c of this.cells) {
      if (c.dead || c.isPlayer) continue;
      if (c.growth < c.ph.growthNeeded) continue;
      const sp = this.species.get(c.speciesId);
      const lineage = sp && sp.isPlayer;
      const cap = lineage ? this.maxCells + 30 : this.maxCells;
      if (count + born.length >= cap) {
        c.growth = c.ph.growthNeeded * 0.7;
        continue;
      }
      // Soft cap per species keeps one design from filling the whole pond.
      const share = (sp ? sp.pop : 0) / (this.maxCells * 0.3);
      if (!this.rng.chance(1 - Math.min(0.9, share * share))) {
        c.growth = c.ph.growthNeeded * 0.75;
        continue;
      }
      born.push(this.divide(c, lineage));
    }
    for (const b of born) if (b) this.cells.push(b);
  }

  /** NPC division. Returns the child (not yet added). */
  divide(c, lineage) {
    let g = c.genome;
    let speciesId = c.speciesId;
    if (!lineage && this.rng.chance(0.45)) {
      g = mutateGenome(c.genome, this.rng, stressBias(c));
      speciesId = this.species.assignChild(g, c.speciesId);
    } else g = cloneGenome(g);
    const a = this.rng.float(0, Math.PI * 2);
    const child = new Cell(this, g, speciesId, c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, {
      energy: c.energy * 0.5,
      growth: 0,
      age: 0,
      generation: c.generation + 1,
      heading: a,
    });
    child.vx = Math.cos(a) * 20;
    child.vy = Math.sin(a) * 20;
    this.env.sample(child.x, child.y, child.env);
    c.energy *= 0.5;
    c.growth = 0;
    this.fx.push({ type: 'divide', x: c.x, y: c.y, t: 0, life: 0.6, hue: c.genome.hue });
    return child;
  }

  reap() {
    let any = false;
    for (const c of this.cells) {
      if (c.hp > 0 || c.dead) continue;
      c.dead = true;
      any = true;
      const ds = this.deathStats || (this.deathStats = {});
      const key = c.cause || 'unknown';
      ds[key] = (ds[key] || 0) + 1;
      const area = c.ph.radius / 13;
      const n = Math.round(2 + 3 * area * area);
      const total = c.ph.maxHP * 0.35 + c.growth * 0.4 + c.energy * 0.3 + 6;
      const genes = [...new Set(c.genome.parts.map((p) => p.t))];
      for (let i = 0; i < n; i++) {
        const a = this.rng.float(0, Math.PI * 2);
        const d = this.rng.float(0, c.r);
        this.addFood('meat', c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, { energy: total / n, genes, scale: 0.8 + area * 0.3 });
      }
      this.fx.push({ type: 'burst', x: c.x, y: c.y, t: 0, life: 0.9, hue: c.genome.hue, r: c.r });
      if (c.killer && c.killer.isPlayer) this.playerKilled(c);
      const sp = this.species.get(c.speciesId);
      if (sp && sp.isPlayer) {
        this.progress.lineageDeaths++;
        if (!c.isPlayer && c.cause) this.lineageCauses = this.lineageCauses || {};
        if (!c.isPlayer && c.cause) this.lineageCauses[c.cause] = (this.lineageCauses[c.cause] || 0) + 1;
      }
      if (c.isPlayer) this.onPlayerDeath(c);
    }
    if (any) this.cells = this.cells.filter((c) => !c.dead);
  }

  // ------------------------------------------------------------ player

  playerAte(f, eff) {
    const pr = this.progress;
    pr.eaten++;
    const gain = { algae: 1, bacteria: 1.2, detritus: 0.5, meat: 2 }[f.kind] * Math.min(1, eff + 0.3);
    this.addDNA(gain);
    if (f.genes && this.rng.chance(0.15)) this.tryGeneTransfer(f.genes, 'meat');
    this.fx.push({ type: 'eat', x: f.x, y: f.y, t: 0, life: 0.4 });
  }

  playerKilled(victim) {
    const pr = this.progress;
    pr.kills++;
    this.addDNA(4 + victim.ph.nParts);
    const sp = this.species.get(victim.speciesId);
    this.emit('kill', { name: sp ? sp.name : 'a cell' });
    if (this.rng.chance(0.5)) this.tryGeneTransfer(victim.genome.parts.map((p) => p.t), 'kill', sp?.name);
  }

  addDNA(v) {
    const pr = this.progress;
    pr.dnaFrac += v;
    const whole = Math.floor(pr.dnaFrac);
    if (whole > 0) {
      pr.dna += whole;
      pr.dnaFrac -= whole;
    }
  }

  tryGeneTransfer(genes, source, fromName = null) {
    const pr = this.progress;
    const locked = [...new Set(genes)].filter((g) => !pr.unlocked.has(g));
    if (!locked.length) return null;
    const g = this.rng.pick(locked);
    pr.unlocked.add(g);
    pr.genesAcquired++;
    this.emit('gene', { part: g, name: PARTS[g].name, from: fromName, source });
    return g;
  }

  trackPlayer(dt) {
    const p = this.player;
    if (!p || p.dead || this.gameOver) return;
    this.pressures.update(dt, p, this);
    // Who is chasing me / what could I eat (for pressure tracking)?
    p.chasedBy = null;
    p.preyNear = false;
    this.cellHash.query(p.x, p.y, 220, (o) => {
      if (o === p || o.dead || o.speciesId === p.speciesId) return;
      if (o.ai.prey === p) p.chasedBy = o;
      if (o.r < p.r * 0.9 && Math.hypot(o.x - p.x, o.y - p.y) < 160) p.preyNear = true;
    });
    if (p.stressTotal <= 0 && !p.starving) {
      const b = this.env.classify(p.env);
      p.comfort = p.comfort || {};
      p.comfort[b] = (p.comfort[b] || 0) + dt;
      if (p.comfort[b] > 25) this.progress.biomesThrived.add(b);
    }
    const sp = this.playerSpecies;
    if (sp && sp.pop > this.progress.peakLineage) this.progress.peakLineage = sp.pop;
    const ready = p.growth >= p.ph.growthNeeded;
    if (ready && !this.progress.readyToDivide) this.emit('ready');
    this.progress.readyToDivide = ready;
    if (p.age > p.lifespan * 1.25 && !p.warnedAge) {
      p.warnedAge = true;
      this.emit('aging');
    }
  }

  onPlayerDeath(c) {
    this.emit('playerDied', { cause: c.cause || 'unknown' });
    // Continue as the nearest surviving member of the lineage.
    let best = null;
    let bd = Infinity;
    for (const o of this.cells) {
      if (o.dead || o.speciesId !== c.speciesId) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      best.isPlayer = true;
      best.ctrl = { dx: 0, dy: 0, thrust: 0 };
      this.player = best;
      this.pressures.live = { ...this.pressures.live };
      this.emit('respawn', { cause: c.cause || 'unknown', distance: bd });
    } else {
      this.player = null;
      this.gameOver = true;
      this.emit('extinct', { cause: c.cause || 'unknown' });
    }
  }

  /** Called when the player finishes the editor. */
  playerDivide(newGenome) {
    const p = this.player;
    if (!p) return;
    const pr = this.progress;
    p.setGenome(cloneGenome(newGenome));
    p.hp = p.ph.maxHP;
    p.energy = Math.min(p.ph.maxEnergy, p.ph.maxEnergy * 0.55);
    p.growth = 0;
    p.age = 0;
    p.warnedAge = false;
    p.generation++;
    pr.generation = p.generation;
    pr.divisions++;
    pr.readyToDivide = false;
    const a = this.rng.float(0, Math.PI * 2);
    const sib = this.addCell(cloneGenome(newGenome), p.speciesId, p.x + Math.cos(a) * p.r * 2, p.y + Math.sin(a) * p.r * 2, {
      energy: p.ph.maxEnergy * 0.5,
      growth: 0,
      age: 0,
      generation: p.generation,
    });
    sib.vx = Math.cos(a) * 25;
    sib.vy = Math.sin(a) * 25;
    this.playerSpecies.ref = cloneGenome(newGenome);
    this.playerSpecies.diet = p.ph.diet;
    this.pressures.reset();
    this.fx.push({ type: 'divide', x: p.x, y: p.y, t: 0, life: 0.8, hue: newGenome.hue });
    this.species.recount();
  }

  lineageCount() {
    return this.playerSpecies ? this.playerSpecies.pop : 0;
  }
}

function mainStress(s) {
  let best = 'exposure';
  let v = 0;
  const names = { cold: 'cold', heat: 'heat', uv: 'UV radiation', o2: 'oxygen poisoning', tox: 'sulfur poisoning' };
  for (const k of Object.keys(names)) {
    if (s[k] > v) {
      v = s[k];
      best = names[k];
    }
  }
  return best;
}

/** Stress-induced mutation bias for AI cells: stressed cells mutate toward relief. */
function stressBias(c) {
  const s = c.sm;
  if (!s) return null;
  return {
    antifreeze: s.cold * 400,
    heatshock: s.heat * 400,
    pigment: s.uv * 400,
    peroxisome: s.o2 * 400,
    detox: s.tox * 400,
  };
}
