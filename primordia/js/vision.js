// Sight. Every cell senses its surroundings a little in all directions
// (touch and chemical cues). Eyes add range in the direction they face, and
// better eyes add clarity: how much you can tell about what you see.
//
// A cell's sight is a profile of ranges around its body (BINS directions,
// relative to its heading), so where eyes are placed matters.

import { PARTS } from './parts.js';
import { angleDiff, clamp, TAU } from './util.js';

export const BINS = 32;

const EYE_RANGE = { eyespot: 115, eyecup: 195, ocelloid: 290 };

export const CLARITY = [
  {
    name: 'Light and dark',
    short: 'Blurry',
    desc: 'No eyes. You feel nearby movement, but beyond a short distance other cells are only blurry glows.',
  },
  {
    name: 'Shapes',
    short: 'Shapes',
    desc: 'You can make out the outline and parts of other cells.',
  },
  {
    name: 'Detail',
    short: 'Detail',
    desc: 'You can tell threats from prey. Dangerous cells are marked red, edible ones green.',
  },
  {
    name: 'Sharp',
    short: 'Sharp',
    desc: 'You identify species at a glance and notice predators coming from off-screen.',
  },
];

/** Sight profile of a genome, before light conditions. */
export function sightProfile(g) {
  const s = g.size;
  const base = 105 + 12 * s;
  const eyes = g.parts.filter((p) => PARTS[p.t].eye);
  const eye = new Float32Array(BINS);
  let clarity = 0;
  for (const p of eyes) clarity = Math.max(clarity, PARTS[p.t].tier);
  const sizeK = 0.9 + 0.1 * s;
  for (let b = 0; b < BINS; b++) {
    const th = (b / BINS) * TAU;
    let best = 0;
    let second = 0;
    for (const p of eyes) {
      const half = PARTS[p.t].arc / 2;
      const off = Math.abs(angleDiff(th, p.a));
      if (off > half) continue;
      // Full strength in the middle of the eye's field, fading toward its edge.
      const edge = clamp((half - off) / (half * 0.35), 0, 1);
      const v = EYE_RANGE[p.t] * sizeK * (0.35 + 0.65 * edge);
      if (v > best) {
        second = best;
        best = v;
      } else if (v > second) second = v;
    }
    // Overlapping eyes (binocular vision) add a little extra.
    eye[b] = best + second * 0.3;
  }
  let maxEye = 0;
  for (let b = 0; b < BINS; b++) maxEye = Math.max(maxEye, eye[b]);
  return {
    base,
    eye,
    maxEye,
    clarity,
    max: base + maxEye,
    ahead: base + eye[0],
    behind: base + eye[BINS / 2],
    eyes: eyes.length,
  };
}

/** Eyes need light; bioluminescence keeps them partly useful in the dark. */
export function lightFactor(light) {
  return 0.55 + 0.45 * Math.min(1, (light ?? 0.5) * 1.8);
}

/** Eye range at a heading-relative angle, interpolated between bins. */
export function eyeAt(sp, rel) {
  let f = (rel / TAU) * BINS;
  f = ((f % BINS) + BINS) % BINS;
  const i = Math.floor(f);
  const t = f - i;
  return sp.eye[i] * (1 - t) + sp.eye[(i + 1) % BINS] * t;
}

/** Sight range of cell `c` toward world angle `a`. */
export function rangeToward(c, a) {
  const sp = c.ph.sight;
  return sp.base + eyeAt(sp, a - c.heading) * lightFactor(c.env.light);
}

/** Farthest this cell can currently see in any direction. */
export function maxRange(c) {
  const sp = c.ph.sight;
  return sp.base + sp.maxEye * lightFactor(c.env.light);
}

/** Can `c` see the point (x, y)? */
export function canSee(c, x, y) {
  const dx = x - c.x;
  const dy = y - c.y;
  const d2 = dx * dx + dy * dy;
  const sp = c.ph.sight;
  if (d2 <= sp.base * sp.base) return true;
  const r = rangeToward(c, Math.atan2(dy, dx));
  return d2 <= r * r;
}

/** World-space outline of what `c` can see, for drawing. */
export function sightOutline(c, steps = 64) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = c.heading + (i / steps) * TAU;
    const r = rangeToward(c, a);
    pts.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]);
  }
  return pts;
}

/** How far away bioluminescent glows can be glimpsed in the dark. */
export function glimpseRange(c) {
  return Math.max(360, maxRange(c) * 1.7);
}
