// How a body (phenotype) interacts with local conditions. Shared by the
// simulation, the AI and the editor's habitat forecast so they always agree.

import { clamp } from './util.js';

/** Damage per second as a fraction of max HP, split by cause. */
export function envStress(ph, e, out = {}) {
  const coldBy = Math.max(0, ph.tMin - e.temp);
  const hotBy = Math.max(0, e.temp - ph.tMax);
  out.cold = coldBy * 0.012;
  out.heat = hotBy * 0.014;
  out.uv = Math.max(0, e.uv - ph.uvTol) * 0.15;
  out.o2 = Math.max(0, e.o2 - ph.o2Tol) * 0.15;
  out.tox = Math.max(0, e.tox - ph.toxTol) * 0.15;
  out.total = out.cold + out.heat + out.uv + out.o2 + out.tox;
  return out;
}

/** Thicker, slower water when cold. */
export function viscosity(temp) {
  return clamp(1 + (15 - temp) / 25, 0.85, 1.7);
}

/** 0..1 multiplier on mitochondrial savings; they need oxygen. */
export function oxygenFactor(o2) {
  return clamp((o2 - 0.1) / 0.4, 0, 1);
}

/** Energy per second from light and sulfur, before crowding. */
export function autotrophIncome(ph, e) {
  let g = 0;
  if (ph.photo > 0) g += ph.photo * Math.min(e.light, 1.2);
  if (ph.chemo > 0) g += ph.chemo * Math.min(e.tox * 1.6, 1);
  return g;
}

/** Resting energy cost per second at these conditions. */
export function restingCost(ph, e) {
  return ph.upkeep * (1 - ph.mito * oxygenFactor(e.o2));
}

/**
 * Habitat forecast used by the editor: how well would this body do in a biome
 * with average conditions `e`? `food` is a 0..1 hint of edible food there.
 * Returns { score 0..1, damage, net, notes[] }.
 */
export function habitatFit(ph, e, food) {
  const s = envStress(ph, e);
  const notes = [];
  if (s.cold > 0.001) notes.push('too cold');
  if (s.heat > 0.001) notes.push('too hot');
  if (s.uv > 0.001) notes.push('UV burns');
  if (s.o2 > 0.001) notes.push('oxygen toxic');
  if (s.tox > 0.001) notes.push('sulfur toxic');

  const income = autotrophIncome(ph, e);
  const foraging = (ph.plantEff * (food.plant || 0) + ph.meatEff * (food.meat || 0)) * 1.2;
  const cruise = (ph.fwdThrust + ph.ciliaThrust) * 0.4 * ph.moveCost * (1 - ph.mito * oxygenFactor(e.o2));
  const net = income + foraging - restingCost(ph, e) - cruise;
  if (income > 0.25) notes.push(ph.photo > 0 && e.light > 0.4 ? 'good light' : 'sulfur energy');
  if (net < -0.05) notes.push('hard to find food');

  // Regeneration covers about 3% HP per second of damage while fed.
  const dmgScore = clamp(1 - s.total / 0.04, 0, 1);
  const eScore = clamp(0.5 + net * 0.8, 0, 1);
  const lethal = s.total > 0.035;
  const score = dmgScore * (0.35 + 0.65 * eScore);
  return { score: clamp(score, 0, 1), damage: s.total, net, notes, lethal };
}
