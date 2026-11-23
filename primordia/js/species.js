// Species bookkeeping: populations over time, speciation and extinction.

import { cloneGenome, genomeDistance, speciesName, genusName, epithetFor, phenotype } from './genome.js';

const SPECIATION_DISTANCE = 3.5;
const HISTORY_EVERY = 4; // seconds
const HISTORY_MAX = 300;

export class SpeciesRegistry {
  constructor(world) {
    this.world = world;
    this.map = new Map();
    this.nextId = 1;
    this.log = [];
    this.countTimer = 0;
    this.historyTimer = 0;
    this.historyTimes = [];
  }

  create({ name = null, genome, parentId = null, isPlayer = false, genus = null }) {
    const rng = this.world.rng;
    const g = cloneGenome(genome);
    const finalName = name || speciesName(g, rng, genus);
    const sp = {
      id: this.nextId++,
      name: finalName,
      genus: finalName.split(' ')[0],
      ref: g,
      hue: g.hue,
      born: this.world.time,
      parentId,
      pop: 0,
      peak: 0,
      extinctAt: null,
      isPlayer,
      history: [],
      diet: phenotype(g).diet,
    };
    this.map.set(sp.id, sp);
    return sp;
  }

  get(id) {
    return this.map.get(id);
  }

  /** Decide which species a newborn belongs to. Returns the species id. */
  assignChild(childGenome, parentSpeciesId) {
    const parent = this.map.get(parentSpeciesId);
    if (!parent || parent.isPlayer) return parentSpeciesId;
    if (genomeDistance(childGenome, parent.ref) < SPECIATION_DISTANCE) return parentSpeciesId;
    const rng = this.world.rng;
    const genus = rng.chance(0.65) ? parent.genus : genusName(rng);
    let name = `${genus} ${epithetFor(childGenome, rng)}`;
    if ([...this.map.values()].some((s) => s.name === name)) name = `${genusName(rng)} ${epithetFor(childGenome, rng)}`;
    const sp = this.create({ name, genome: childGenome, parentId: parent.id });
    this.record('speciation', `${sp.name} branched off from ${parent.name}`, sp.id);
    return sp.id;
  }

  record(type, text, speciesId = null) {
    const entry = { type, text, speciesId, time: this.world.time };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.world.emit(type, entry);
  }

  tick(dt) {
    this.countTimer -= dt;
    if (this.countTimer <= 0) {
      this.countTimer = 1;
      this.recount();
    }
    this.historyTimer -= dt;
    if (this.historyTimer <= 0) {
      this.historyTimer = HISTORY_EVERY;
      this.historyTimes.push(this.world.time);
      if (this.historyTimes.length > HISTORY_MAX) this.historyTimes.shift();
      for (const sp of this.map.values()) {
        if (sp.extinctAt !== null && sp.history.length && sp.history[sp.history.length - 1] === 0) {
          sp.history.push(0);
        } else sp.history.push(sp.pop);
        if (sp.history.length > HISTORY_MAX) sp.history.shift();
      }
    }
  }

  recount() {
    for (const sp of this.map.values()) sp.pop = 0;
    for (const c of this.world.cells) {
      if (c.dead) continue;
      const sp = this.map.get(c.speciesId);
      if (sp) sp.pop++;
    }
    for (const sp of this.map.values()) {
      if (sp.pop > sp.peak) sp.peak = sp.pop;
      if (sp.pop === 0 && sp.extinctAt === null && sp.peak > 0) {
        sp.extinctAt = this.world.time;
        if (!sp.isPlayer) this.record('extinction', `${sp.name} went extinct`, sp.id);
      }
      if (sp.pop > 0 && sp.extinctAt !== null) sp.extinctAt = null; // (re-seeded)
    }
  }

  living() {
    return [...this.map.values()].filter((s) => s.pop > 0).sort((a, b) => b.pop - a.pop);
  }

  all() {
    return [...this.map.values()];
  }
}
