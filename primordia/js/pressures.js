// Selection pressure on the player's lineage. What hurt you, what you lacked
// and what you lived next to during a generation shapes which mutations appear
// when you divide (stress-induced mutation). DNA spending stays fully free.

import { PARTS } from './parts.js';
import { canAddPart, countParts, placeAngleFor, SIZE_MAX, SIZE_MIN } from './genome.js';
import { envStress, oxygenFactor } from './biology.js';
import { BIOMES } from './environment.js';

export const PRESSURE_KEYS = {
  cold: { label: 'Cold', color: '#9fd8ff' },
  heat: { label: 'Heat', color: '#ff9b6a' },
  uv: { label: 'UV burn', color: '#e6a0ff' },
  o2: { label: 'Oxygen toxicity', color: '#7fe3ff' },
  tox: { label: 'Sulfur', color: '#e0dc5a' },
  starve: { label: 'Hunger', color: '#ffc45c' },
  predation: { label: 'Predation', color: '#ff5d73' },
};

function blank() {
  return {
    cold: 0, heat: 0, uv: 0, o2: 0, tox: 0, starve: 0, predation: 0,
    // opportunities
    light: 0, sulfur: 0, oxygen: 0, dark: 0, preyNear: 0, crowded: 0, chased: 0,
  };
}

const tmpS = {};

export class Pressures {
  constructor() {
    this.live = blank();
    this.reset();
  }

  reset() {
    this.gen = blank();
    this.genTime = 0;
    this.attackDir = { front: 0, side: 0, rear: 0 };
    this.attackKind = { jaw: 0, spike: 0, toxin: 0 };
    this.biomeTime = {};
  }

  update(dt, cell, world) {
    const ph = cell.ph;
    const e = cell.env;
    const s = envStress(ph, e, tmpS);
    this.genTime += dt;
    const inst = blank();
    // Near-misses count a little too, so pressure shows before it hurts.
    inst.cold = s.cold > 0 ? 1 + s.cold * 40 : e.temp < ph.tMin + 3 ? 0.3 : 0;
    inst.heat = s.heat > 0 ? 1 + s.heat * 40 : e.temp > ph.tMax - 3 ? 0.3 : 0;
    inst.uv = s.uv > 0 ? 1 + s.uv * 40 : e.uv > ph.uvTol - 0.1 ? 0.3 : 0;
    inst.o2 = s.o2 > 0 ? 1 + s.o2 * 40 : e.o2 > ph.o2Tol - 0.1 ? 0.3 : 0;
    inst.tox = s.tox > 0 ? 1 + s.tox * 40 : e.tox > ph.toxTol - 0.08 ? 0.3 : 0;
    inst.starve = cell.energy <= 0.01 ? 1.5 : cell.energy < ph.maxEnergy * 0.2 ? 0.6 : 0;
    inst.light = e.light > 0.55 ? 1 : 0;
    inst.sulfur = e.tox > 0.3 ? 1 : 0;
    inst.oxygen = oxygenFactor(e.o2) > 0.8 ? 1 : 0;
    inst.dark = e.light < 0.2 ? 1 : 0;
    inst.chased = cell.chasedBy ? 1 : 0;
    inst.preyNear = cell.preyNear ? 1 : 0;
    inst.predation = this.recentHit > 0 ? 1 + this.recentHit * 0.05 : inst.chased * 0.4;
    this.recentHit = Math.max(0, (this.recentHit || 0) - dt * 20);

    const k = 1 - Math.exp(-dt / 12);
    for (const key of Object.keys(inst)) {
      this.gen[key] += inst[key] * dt;
      this.live[key] += (inst[key] - this.live[key]) * k;
    }
    const b = world.env.classify(e);
    this.biomeTime[b] = (this.biomeTime[b] || 0) + dt;
  }

  onHit(amount, kind, relAngle, cell) {
    const frac = amount / cell.ph.maxHP;
    this.recentHit = (this.recentHit || 0) + frac * 100;
    const a = Math.abs(relAngle);
    if (a < 0.8) this.attackDir.front += frac;
    else if (a > 2.3) this.attackDir.rear += frac;
    else this.attackDir.side += frac;
    if (this.attackKind[kind] !== undefined) this.attackKind[kind] += frac;
  }

  /** Top live pressures for the HUD, 0..1. */
  topLive(n = 4) {
    return Object.keys(PRESSURE_KEYS)
      .map((k) => ({ key: k, ...PRESSURE_KEYS[k], value: Math.min(1, this.live[k] / 1.5) }))
      .filter((p) => p.value > 0.04)
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
  }

  frac(key) {
    return this.genTime > 0 ? this.gen[key] / this.genTime : 0;
  }

  mainAttackDir() {
    const d = this.attackDir;
    if (d.front + d.side + d.rear < 0.05) return null;
    if (d.rear >= d.front && d.rear >= d.side) return 'rear';
    if (d.side >= d.front) return 'side';
    return 'front';
  }

  /** Three mutation offers, weighted by what this generation went through. */
  generateOffers(genome, rng, count = 3) {
    const c = countParts(genome);
    const f = (k) => this.frac(k);
    const pct = (k) => `${Math.round(Math.min(1, f(k)) * 100)}%`;
    const dir = this.mainAttackDir();
    const dirAngle = dir === 'rear' ? Math.PI : dir === 'side' ? Math.PI / 2 : 0;
    const dirText = dir ? { front: 'from the front', side: 'from the side', rear: 'from behind' }[dir] : '';
    const pool = [];
    const part = (t, w, reason, angle) => {
      if (!canAddPart(genome, t) || w <= 0) return;
      pool.push({ kind: 'part', part: t, w, reason, angle });
    };

    part('antifreeze', f('cold') * 6, `You spent ${pct('cold')} of this generation in water near or below your cold limit.`);
    part('heatshock', f('heat') * 6, `You spent ${pct('heat')} of this generation in water near or above your heat limit.`);
    part('pigment', f('uv') * 6, `Ultraviolet light burned you for ${pct('uv')} of this generation.`);
    part('peroxisome', f('o2') * 6, `Oxygen levels were near or above your tolerance ${pct('o2')} of the time.`);
    part('detox', f('tox') * 6, `Sulfur levels were near or above your tolerance ${pct('tox')} of the time.`);

    const pred = f('predation');
    if (pred > 0.02) {
      part('armor', pred * 5 + (dir === 'rear' ? 0.5 : 0), `Predators hit you ${dirText || 'repeatedly'}. A plate there would block most damage.`, dirAngle);
      part('spike', pred * 4, `You were attacked ${dirText || 'often'}. A spike there punishes attackers.`, dirAngle);
      part('toxin', pred * 2.5, 'Predators kept attacking. A toxin gland can drive them off.', Math.PI);
      part('flagellum', pred * 2 + f('chased') * 2, 'You were chased often. More thrust means faster escapes.', Math.PI);
      part('eyespot', pred * 1.5, 'Attacks came without warning. Eyespots let you see danger sooner.');
    }
    const starve = f('starve');
    part('vacuole', starve * 4, `You were close to starving ${pct('starve')} of the time. Storage would buffer lean stretches.`);
    if (c.chloroplast < 3) part('chloroplast', f('light') * (1.2 + starve * 3), `You spent ${pct('light')} of this generation in well-lit water.`);
    if (c.chemosynth < 2) part('chemosynth', f('sulfur') * (1.5 + starve * 3), `You spent ${pct('sulfur')} of this generation in sulfur-rich water.`);
    part('mitochondrion', f('oxygen') * 1.6, `Oxygen was plentiful ${pct('oxygen')} of the time. Mitochondria would use it to save energy.`);
    part('eyespot', f('dark') * 1.4, `You spent ${pct('dark')} of this generation in dark water, where you can barely see.`);
    if (c.jaw === 0) part('jaw', f('preyNear') * 1.8 + starve, 'Smaller cells were often within reach. A jaw would let you eat them.', 0);
    if (c.filter === 0) part('filter', starve * 2, 'You struggled to find food you could digest.', 0);
    part('cilia', 0.35, 'A spontaneous mutation.');
    part('flagellum', 0.3, 'A spontaneous mutation.', Math.PI);
    part('spike', 0.2, 'A spontaneous mutation.');
    part('eyespot', 0.25, 'A spontaneous mutation.');
    part('vacuole', 0.2, 'A spontaneous mutation.');

    if (genome.size < SIZE_MAX - 0.1)
      pool.push({ kind: 'size', delta: 0.15, w: 0.4 + f('cold') * 1.5 + pred * 1.5, reason: f('cold') > 0.2 ? 'Larger cells hold warmth and broaden temperature tolerance.' : 'Larger cells are harder to swallow.' });
    if (genome.size > SIZE_MIN + 0.1)
      pool.push({ kind: 'size', delta: -0.15, w: 0.3 + starve * 2, reason: 'Smaller cells need less food to survive and divide.' });
    if (genome.membrane < 0.9)
      pool.push({ kind: 'membrane', delta: 0.2, w: 0.3 + pred * 2 + f('tox') * 1, reason: 'A thicker membrane absorbs damage.' });

    // Duplication of an existing part.
    const dupable = genome.parts.map((p) => p.t).filter((t) => canAddPart(genome, t));
    if (dupable.length) {
      const t = rng.pick(dupable);
      pool.push({ kind: 'part', part: t, w: 0.5, reason: `Gene duplication: an extra copy of your ${PARTS[t].name.toLowerCase()}.`, dup: true });
    }

    const offers = [];
    const used = new Set();
    while (offers.length < count && pool.length) {
      const pick = rng.weighted(pool);
      pool.splice(pool.indexOf(pick), 1);
      const key = pick.kind === 'part' ? pick.part : pick.kind + pick.delta;
      if (used.has(key)) continue;
      used.add(key);
      offers.push(decorate(pick, genome));
    }
    return offers;
  }

  favouriteBiome() {
    let best = null;
    let t = 0;
    for (const [b, v] of Object.entries(this.biomeTime)) if (v > t) [best, t] = [b, v];
    return best ? BIOMES[best].name : null;
  }
}

function decorate(o, genome) {
  if (o.kind === 'part') {
    const p = PARTS[o.part];
    const angle = p.ext ? o.angle ?? placeAngleFor(o.part, genome) : 0;
    return { ...o, angle, title: p.name, effect: p.effect, cat: p.cat };
  }
  if (o.kind === 'size') {
    return { ...o, title: o.delta > 0 ? 'Gigantism' : 'Dwarfism', effect: `${o.delta > 0 ? '+' : '−'}15% body size`, cat: 'Body' };
  }
  return { ...o, title: 'Thick Membrane', effect: '+ HP, − damage taken', cat: 'Body' };
}
