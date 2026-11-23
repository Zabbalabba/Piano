// Genomes describe a cell's body. phenotype() turns a genome into the numbers
// the simulation uses, so every editor choice has a concrete effect.

import { PARTS, PART_IDS, EXTERNAL_IDS, INTERNAL_IDS, MAX_EXTERNAL, MAX_INTERNAL } from './parts.js';
import { clamp, diminish, TAU, angleDiff } from './util.js';

export const SIZE_MIN = 0.6;
export const SIZE_MAX = 2.2;
export const BASE_RADIUS = 13;

export function makeGenome({ size = 1, membrane = 0.2, hue = 180, parts = [] } = {}) {
  return {
    size,
    membrane,
    hue,
    parts: parts.map((p) => ({ t: p.t, a: p.a ?? PARTS[p.t].defaultAngle ?? 0 })),
  };
}

export function cloneGenome(g) {
  return { size: g.size, membrane: g.membrane, hue: g.hue, parts: g.parts.map((p) => ({ t: p.t, a: p.a })) };
}

export function countParts(g) {
  const c = {};
  for (const id of PART_IDS) c[id] = 0;
  for (const p of g.parts) c[p.t]++;
  return c;
}

export function externalCount(g) {
  return g.parts.filter((p) => PARTS[p.t].ext).length;
}
export function internalCount(g) {
  return g.parts.length - externalCount(g);
}

export function canAddPart(g, t) {
  const c = countParts(g);
  if (c[t] >= PARTS[t].max) return false;
  if (PARTS[t].ext ? externalCount(g) >= MAX_EXTERNAL : internalCount(g) >= MAX_INTERNAL) return false;
  return true;
}

/** Derived stats. Everything the simulation needs about a body. */
export function phenotype(g) {
  const c = countParts(g);
  const s = g.size;
  const area = s * s;
  const nParts = g.parts.length;

  let fwdThrust = 0;
  const flagScale = 0.7 + 0.3 * s;
  for (const p of g.parts) {
    if (p.t === 'flagellum') fwdThrust += 80 * flagScale * (0.25 + 0.75 * Math.max(0, -Math.cos(p.a)));
  }
  const ciliaThrust = diminish(c.cilia, 28, 0.75) * flagScale;
  const mass = area * (1 + 0.12 * c.armor + 0.025 * nParts + 0.15 * g.membrane);
  const turn =
    (1.5 + diminish(c.cilia, 1.0, 0.75) + 0.2 * c.flagellum) / (0.55 + 0.45 * s) / (1 + 0.05 * c.armor);

  const maxHP = 30 * area + 10 * c.armor * s + 35 * g.membrane * area;
  const maxEnergy = 45 * area + 30 * c.vacuole;
  let partUpkeep = 0;
  for (const p of g.parts) partUpkeep += PARTS[p.t].upkeep;
  const upkeep = 0.12 * area + partUpkeep * (0.8 + 0.2 * s) + 0.1 * g.membrane;

  const tMin = 10 - diminish(c.antifreeze, 8, 0.7) - Math.max(0, s - 1) * 2.5;
  const tMax = 30 + diminish(c.heatshock, 8, 0.7) + Math.max(0, s - 1) * 2.5;

  let plantEff = 0;
  if (c.filter > 0) plantEff = 0.7 + 0.15 * (Math.min(c.filter, 3) - 1);
  else if (c.jaw > 0) plantEff = 0.2;
  let meatEff = 0;
  if (c.jaw > 0) meatEff = 0.9 + 0.1 * (Math.min(c.jaw, 3) - 1);
  else if (c.filter > 0) meatEff = 0.3;

  const ph = {
    counts: c,
    nParts,
    radius: BASE_RADIUS * s,
    mass,
    fwdThrust,
    ciliaThrust,
    turn,
    maxHP,
    maxEnergy,
    upkeep,
    moveCost: 0.0032,
    vision: 130 + diminish(c.eyespot, 130, 0.7) + 15 * s,
    tMin,
    tMax,
    uvTol: 0.4 + diminish(c.pigment, 0.3, 0.75),
    o2Tol: 0.5 + diminish(c.peroxisome, 0.25, 0.75),
    toxTol: 0.22 + diminish(c.detox, 0.35, 0.75),
    photo: diminish(c.chloroplast, 0.55, 0.85),
    chemo: diminish(c.chemosynth, 0.5, 0.8),
    mito: diminish(c.mitochondrion, 0.18, 0.75),
    plantEff,
    meatEff,
    bite: c.jaw > 0 ? (4 + 5 * s) * diminish(c.jaw, 1, 0.65) : 0,
    spike: c.spike > 0 ? 6 + 5 * s : 0,
    toxin: c.toxin,
    growthNeeded: 24 * area + 3 * nParts,
    membraneDR: 0.3 * g.membrane,
  };
  ph.diet = dietLabel(ph);
  ph.topSpeed = (ph.fwdThrust + ph.ciliaThrust) / ph.mass / 1.6;
  return ph;
}

export function dietLabel(ph) {
  const plant = ph.counts.filter > 0;
  const meat = ph.counts.jaw > 0;
  const auto = ph.photo > 0 || ph.chemo > 0;
  if (plant && meat) return 'Omnivore';
  if (meat) return auto ? 'Mixotroph predator' : 'Predator';
  if (plant) return auto ? 'Mixotroph grazer' : 'Grazer';
  if (ph.photo > 0 && ph.chemo > 0) return 'Autotroph';
  if (ph.photo > 0) return 'Phototroph';
  if (ph.chemo > 0) return 'Chemotroph';
  return 'Starving';
}

/** Rough genetic distance used for speciation. */
export function genomeDistance(a, b) {
  const ca = countParts(a);
  const cb = countParts(b);
  let d = 0;
  for (const id of PART_IDS) d += Math.abs(ca[id] - cb[id]);
  d += Math.abs(a.size - b.size) * 5;
  d += Math.abs(a.membrane - b.membrane) * 2;
  return d;
}

// ---------------------------------------------------------------- mutation

const MUTATION_PART_WEIGHTS = {
  flagellum: 1.2,
  cilia: 1.2,
  filter: 1,
  jaw: 0.8,
  spike: 0.9,
  armor: 0.9,
  toxin: 0.4,
  eyespot: 0.8,
  chloroplast: 1,
  chemosynth: 0.6,
  mitochondrion: 0.8,
  vacuole: 0.7,
  antifreeze: 0.7,
  heatshock: 0.7,
  pigment: 0.7,
  peroxisome: 0.7,
  detox: 0.6,
};

/**
 * Random mutation for AI-controlled lineages. `bias` maps part ids to extra
 * weight (stress-induced mutation: cells under a pressure mutate toward it).
 */
export function mutateGenome(g, rng, bias = null) {
  const m = cloneGenome(g);
  const roll = rng.next();
  if (roll < 0.34) {
    const opts = PART_IDS.filter((id) => canAddPart(m, id)).map((id) => ({
      id,
      w: (MUTATION_PART_WEIGHTS[id] || 0.5) * (1 + (bias?.[id] || 0)),
    }));
    if (opts.length) {
      const pick = rng.weighted(opts).id;
      m.parts.push({ t: pick, a: placeAngleFor(pick, m, rng) });
    }
  } else if (roll < 0.52) {
    if (m.parts.length > 1) {
      // Prefer removing costly parts; never strip the last way of moving.
      const idx = rng.int(0, m.parts.length - 1);
      const removed = m.parts[idx];
      const c = countParts(m);
      const isLastMover = (removed.t === 'flagellum' || removed.t === 'cilia') && c.flagellum + c.cilia <= 1;
      if (!isLastMover) m.parts.splice(idx, 1);
    }
  } else if (roll < 0.66) {
    const ext = m.parts.filter((p) => PARTS[p.t].ext);
    if (ext.length) {
      const p = rng.pick(ext);
      p.a = normAngle(p.a + rng.float(-0.8, 0.8));
    }
  } else if (roll < 0.84) {
    m.size = clamp(m.size * (1 + rng.float(-0.14, 0.14)), SIZE_MIN, SIZE_MAX);
  } else if (roll < 0.93) {
    m.membrane = clamp(m.membrane + rng.float(-0.15, 0.15), 0, 1);
  } else {
    m.hue = (m.hue + rng.float(-25, 25) + 360) % 360;
  }
  // Colour drifts a little every generation so lineages slowly diverge visually.
  m.hue = (m.hue + rng.float(-3, 3) + 360) % 360;
  return m;
}

export function normAngle(a) {
  // Keep angles in (-PI, PI] so the editor and the comparison code agree.
  return angleDiff(a, 0);
}

/** Sensible default angle for a newly added part, avoiding overlap. */
export function placeAngleFor(t, g, rng = null) {
  const def = PARTS[t].defaultAngle ?? 0;
  if (!PARTS[t].ext) return rng ? rng.float(-Math.PI, Math.PI) : 0;
  const same = g.parts.filter((p) => p.t === t);
  // Mirror pairs (left/right) look and steer better than stacking.
  const candidates =
    t === 'eyespot'
      ? [0.5, -0.5, 1.1, -1.1, 0, 1.7, -1.7]
      : [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8].map((o) => def + o);
  for (const c of candidates) {
    const a = normAngle(c);
    if (!same.some((p) => Math.abs(angleDiff(p.a, a)) < 0.3)) return a;
  }
  return rng ? rng.float(-Math.PI, Math.PI) : def;
}

// ---------------------------------------------------------------- naming

const GENUS_A = ['Proto', 'Vora', 'Cilo', 'Thal', 'Ama', 'Nyx', 'Lumi', 'Pela', 'Sulfo', 'Kryo', 'Halo', 'Mira', 'Zoo', 'Gloe', 'Rhizo', 'Xeno', 'Ocu', 'Bathy', 'Pyro', 'Aero', 'Mega', 'Micro', 'Lepto', 'Strepto', 'Dino'];
const GENUS_B = ['ella', 'ium', 'ax', 'ora', 'ix', 'onia', 'ula', 'ops', 'cyst', 'bion', 'monas', 'coccus', 'phyta', 'zoon', 'stoma'];

export function genusName(rng) {
  return rng.pick(GENUS_A) + rng.pick(GENUS_B);
}

export function epithetFor(g, rng) {
  const c = countParts(g);
  const opts = [];
  if (c.spike >= 2) opts.push('spinosus', 'aculeatus');
  if (c.spike === 1) opts.push('cornutus');
  if (c.armor >= 2) opts.push('armatus', 'loricatus');
  if (c.jaw >= 1) opts.push('rapax', 'vorax', 'mordax');
  if (c.chloroplast >= 2) opts.push('viridis', 'lucifer', 'solaris');
  if (c.chemosynth >= 1) opts.push('sulfuricus', 'abyssalis');
  if (c.antifreeze >= 1) opts.push('glacialis', 'frigidus', 'borealis');
  if (c.heatshock >= 1) opts.push('thermophilus', 'calidus');
  if (c.eyespot >= 2) opts.push('oculatus', 'argus');
  if (c.toxin >= 1) opts.push('toxicus', 'venenosus');
  if (c.flagellum >= 2) opts.push('velox', 'celer');
  if (c.cilia >= 3) opts.push('ciliatus', 'hirsutus');
  if (c.pigment >= 1) opts.push('fuscus', 'rubens');
  if (c.peroxisome >= 1) opts.push('aerobius', 'oxyphilus');
  if (g.size > 1.6) opts.push('magnus', 'gigas');
  if (g.size < 0.8) opts.push('minimus', 'pusillus');
  if (!opts.length) opts.push('vulgaris', 'simplex', 'communis', 'primus');
  return rng.pick(opts);
}

export function speciesName(g, rng, genus = null) {
  return `${genus || genusName(rng)} ${epithetFor(g, rng)}`;
}

// ---------------------------------------------------------------- presets

const P = Math.PI;

/** Starting body choices for the player. */
export const PLAYER_STARTS = {
  shallows: {
    label: 'Sunlit Shallows',
    blurb: 'Plenty of algae and light, but harsh UV and many grazers competing.',
    biome: 'shallows',
    genome: makeGenome({
      size: 1,
      membrane: 0.2,
      hue: 170,
      parts: [
        { t: 'filter', a: 0 },
        { t: 'flagellum', a: P },
      ],
    }),
  },
  vents: {
    label: 'Hydrothermal Vents',
    blurb: 'Hot, sulfurous and dark. Few competitors and rich bacteria mats, if you can take the heat.',
    biome: 'vents',
    genome: makeGenome({
      size: 1,
      membrane: 0.3,
      hue: 18,
      parts: [
        { t: 'filter', a: 0 },
        { t: 'cilia', a: P * 0.6 },
        { t: 'cilia', a: -P * 0.6 },
        { t: 'heatshock' },
        { t: 'detox' },
      ],
    }),
    unlocks: ['heatshock', 'detox'],
  },
  frigid: {
    label: 'Frigid Waters',
    blurb: 'Cold, thick water slows everything. Food is sparse but predators are rare.',
    biome: 'frigid',
    genome: makeGenome({
      size: 1.15,
      membrane: 0.25,
      hue: 205,
      parts: [
        { t: 'filter', a: 0 },
        { t: 'flagellum', a: P },
        { t: 'antifreeze' },
      ],
    }),
    unlocks: ['antifreeze'],
  },
};

/** Founding AI species of the ecosystem. */
export const FOUNDERS = [
  {
    name: 'Thalella viridis',
    biome: 'shallows',
    count: 34,
    genome: makeGenome({
      size: 0.85,
      membrane: 0.15,
      hue: 105,
      parts: [
        { t: 'chloroplast' },
        { t: 'chloroplast' },
        { t: 'pigment' },
        { t: 'cilia', a: P * 0.75 },
      ],
    }),
  },
  {
    name: 'Pelamonas vulgaris',
    biome: 'shallows',
    count: 24,
    genome: makeGenome({
      size: 0.9,
      membrane: 0.15,
      hue: 48,
      parts: [
        { t: 'filter', a: 0 },
        { t: 'flagellum', a: P },
        { t: 'pigment' },
      ],
    }),
  },
  {
    name: 'Vorax mordax',
    biome: 'twilight',
    count: 9,
    genome: makeGenome({
      size: 1.35,
      membrane: 0.25,
      hue: 345,
      parts: [
        { t: 'jaw', a: 0 },
        { t: 'flagellum', a: P },
        { t: 'flagellum', a: P * 0.8 },
        { t: 'eyespot', a: 0.5 },
      ],
    }),
  },
  {
    name: 'Pyrobion sulfuricus',
    biome: 'vents',
    count: 16,
    genome: makeGenome({
      size: 0.9,
      membrane: 0.35,
      hue: 30,
      parts: [
        { t: 'chemosynth' },
        { t: 'chemosynth' },
        { t: 'heatshock' },
        { t: 'heatshock' },
        { t: 'detox' },
        { t: 'cilia', a: P },
      ],
    }),
  },
  {
    name: 'Kryocyst glacialis',
    biome: 'frigid',
    count: 14,
    genome: makeGenome({
      size: 1.2,
      membrane: 0.3,
      hue: 200,
      parts: [
        { t: 'filter', a: 0 },
        { t: 'antifreeze' },
        { t: 'cilia', a: P * 0.7 },
        { t: 'cilia', a: -P * 0.7 },
        { t: 'vacuole' },
      ],
    }),
  },
  {
    name: 'Loricula armata',
    biome: 'twilight',
    count: 14,
    genome: makeGenome({
      size: 1.05,
      membrane: 0.3,
      hue: 270,
      parts: [
        { t: 'filter', a: 0 },
        { t: 'armor', a: P },
        { t: 'armor', a: P * 0.55 },
        { t: 'flagellum', a: -P * 0.8 },
      ],
    }),
  },
  {
    name: 'Bathyops oculatus',
    biome: 'abyss',
    count: 10,
    genome: makeGenome({
      size: 1.1,
      membrane: 0.2,
      hue: 225,
      parts: [
        { t: 'filter', a: 0 },
        { t: 'jaw', a: 0.4 },
        { t: 'eyespot', a: 0.6 },
        { t: 'eyespot', a: -0.6 },
        { t: 'flagellum', a: P },
        { t: 'antifreeze' },
      ],
    }),
  },
];

export { TAU, EXTERNAL_IDS, INTERNAL_IDS };
