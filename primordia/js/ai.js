// Behaviour for AI-controlled cells: flee, hunt, graze, seek comfortable water.

import { envStress, autotrophIncome } from './biology.js';
import { clamp } from './util.js';
import { maxRange, rangeToward } from './vision.js';

const DIRS = 8;
const tmpEnv = {};
const tmpStress = {};

function envUtility(ph, e) {
  const s = envStress(ph, e, tmpStress);
  return -s.total * 60 + autotrophIncome(ph, e) * 1.5;
}

export function think(c, world, dt) {
  const ai = c.ai;
  ai.timer -= dt;
  if (ai.timer > 0) return;
  ai.timer = 0.2 + world.rng.float(0, 0.12);

  const ph = c.ph;
  const vis = maxRange(c);
  const vis2 = vis * vis;
  const base2 = ph.sight.base * ph.sight.base;
  const clarity = ph.sight.clarity;
  let fx = 0;
  let fy = 0;
  let threat = 0;
  let nearestThreat = Infinity;
  let prey = null;
  let preyScore = 0;
  let crowd = 0;

  world.cellHash.query(c.x, c.y, vis, (o) => {
    if (o === c || o.dead) return;
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > vis2) return;
    const d = Math.sqrt(d2) + 0.001;
    if (d < 45 + c.r) crowd++;
    if (o.speciesId === c.speciesId) return;
    // Sight is directional: eyes see far where they face, little elsewhere.
    let range = vis;
    if (d2 > base2) {
      range = rangeToward(c, Math.atan2(dy, dx));
      if (d > range) return;
    }
    // Without eyes a cell can't tell a hunter from a harmless grazer, so any
    // large shape is a possible threat. With eyes it can see the jaw.
    const looksDangerous = clarity === 0 ? o.r > c.r * 0.9 && (o.ph.bite > 0 || d < 70 + c.r) : o.ph.bite > 0 && o.r > c.r * 0.55;
    if (looksDangerous) {
      const bite = o.ph.bite > 0 ? o.ph.bite : 6;
      const danger = ((bite * 3) / (c.hp + 6)) * (o.r / c.r) * (1 - d / range);
      fx -= (dx / d) * danger;
      fy -= (dy / d) * danger;
      threat += danger;
      if (d < nearestThreat) nearestThreat = d;
    }
    if (ph.bite > 0 && o.r < c.r * 1.25) {
      let score = (o.r / c.r + 0.3) / (d + 30);
      if (o.ph.spike > 0) score *= 0.55;
      if (o.ph.toxin > 0) score *= 0.6;
      if (o.ph.counts.armor > 1) score *= 0.7;
      if (score > preyScore) {
        preyScore = score;
        prey = o;
      }
    }
  });
  c.crowd = crowd;

  const hunger = 1 - c.energy / ph.maxEnergy;
  let food = null;
  let foodScore = Infinity;
  if (ph.plantEff > 0.15 || ph.meatEff > 0.15) {
    const r = vis * 0.85;
    world.foodHash.query(c.x, c.y, r, (f) => {
      if (f.eaten) return;
      const eff = f.meat ? ph.meatEff : ph.plantEff;
      if (eff < 0.25) return;
      const d = Math.hypot(f.x - c.x, f.y - c.y);
      if (d > r) return;
      if (d > ph.sight.base && d > rangeToward(c, Math.atan2(f.y - c.y, f.x - c.x)) * 0.85) return;
      const score = d / (eff * f.energy);
      if (score < foodScore) {
        foodScore = score;
        food = f;
      }
    });
  }

  // Environmental comfort: probe a ring of points and drift toward better water.
  let ex = 0;
  let ey = 0;
  let envUrgency = 0;
  const here = envUtility(ph, c.env);
  const stressed = c.stressTotal > 0.0005;
  if (stressed || ph.photo > 0 || ph.chemo > 0 || (ai.envProbe = (ai.envProbe || 0) + 1) % 4 === 0) {
    const dist = 150;
    let best = here;
    let bx = 0;
    let by = 0;
    const off = world.rng.float(0, Math.PI * 2);
    for (let i = 0; i < DIRS; i++) {
      const a = off + (i / DIRS) * Math.PI * 2;
      const px = c.x + Math.cos(a) * dist;
      const py = c.y + Math.sin(a) * dist;
      if (px < 60 || py < 60 || px > world.size - 60 || py > world.size - 60) continue;
      const u = envUtility(ph, world.env.sample(px, py, tmpEnv));
      if (u > best) {
        best = u;
        bx = Math.cos(a);
        by = Math.sin(a);
      }
    }
    envUrgency = clamp((best - here) * 0.8, 0, 3);
    ex = bx * envUrgency;
    ey = by * envUrgency;
    ai.envDir = { x: bx, y: by, u: envUrgency };
  }

  let dx = 0;
  let dy = 0;
  let thrust = 0.35;
  let boost = false;
  if (threat > 0.25) {
    ai.mode = 'flee';
    dx = fx;
    dy = fy;
    thrust = 1;
    boost = nearestThreat < 70 + c.r;
    if (ph.toxin > 0 && nearestThreat < 110 + c.r) world.releaseToxin(c);
  } else if (prey && hunger > 0.15 && (!food || preyScore * 25 > 1 / foodScore)) {
    ai.mode = 'hunt';
    // Lead the target a little.
    dx = prey.x + prey.vx * 0.35 - c.x;
    dy = prey.y + prey.vy * 0.35 - c.y;
    thrust = 1;
    boost = dx * dx + dy * dy < (90 + c.r) ** 2 && c.energy > ph.maxEnergy * 0.2;
  } else if (food && hunger > 0.08) {
    ai.mode = 'forage';
    dx = food.x - c.x;
    dy = food.y - c.y;
    thrust = hunger > 0.5 ? 0.9 : 0.6;
  } else {
    ai.mode = 'wander';
    ai.wander += world.rng.gauss() * 0.45;
    dx = Math.cos(ai.wander);
    dy = Math.sin(ai.wander);
    thrust = ph.photo > 0 || ph.chemo > 0 ? 0.15 : 0.35;
  }

  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  if (ai.mode !== 'flee') {
    // Stress overrides appetite: a burning cell leaves even if food is near.
    const w = stressed ? 1.6 : ai.mode === 'wander' ? 1.2 : 0.4;
    dx += ex * w;
    dy += ey * w;
    if (stressed && envUrgency > 0.2) thrust = Math.max(thrust, 0.8);
  }

  // Stay away from the world's edge.
  const m = 180;
  if (c.x < m) dx += (m - c.x) / m;
  if (c.y < m) dy += (m - c.y) / m;
  if (c.x > world.size - m) dx -= (c.x - (world.size - m)) / m;
  if (c.y > world.size - m) dy -= (c.y - (world.size - m)) / m;

  c.ctrl.dx = dx;
  c.ctrl.dy = dy;
  c.ctrl.thrust = thrust;
  c.ctrl.boost = boost;
  ai.prey = ai.mode === 'hunt' ? prey : null;
}
