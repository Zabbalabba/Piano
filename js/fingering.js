// Works out which finger plays each note (1 = thumb .. 5 = little finger).
//
// Block chords get the standard fingering for their shape. Single-note lines are fingered with a
// shortest-path search over all finger choices, where each move between two notes has a cost:
// natural moves within a relaxed hand are cheap, stretches cost more, the thumb may pass under
// (or a finger cross over the thumb) for a step or two, and anything else is a change of hand
// position. Fingers written in the music (C4@1) are always kept. The left hand is handled as a
// mirror image of the right.

import { noteToMidi } from './music.js';

const WHITE = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const pos = (midi) => Math.floor(midi / 12) * 7 + WHITE[((midi % 12) + 12) % 12];
const isBlack = (midi) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

// Widest comfortable distance between two fingers, in white keys (a fifth is 4, an octave 7).
const MAX_SPAN = { 12: 3.5, 13: 4.5, 14: 5.5, 15: 7.5, 23: 2.5, 24: 3.5, 25: 7, 34: 2, 35: 3.5, 45: 2.5 };
const JUMP = 6;

// Fingers for a block chord, thumb side first.
function chordShape(semis) {
  const k = semis.length;
  const gaps = semis.slice(1).map((s, i) => Math.abs(s - semis[i]));
  const span = gaps.reduce((a, b) => a + b, 0);
  if (k === 2) return [1, span >= 7 ? 5 : span >= 5 ? 4 : span >= 3 ? 3 : 2];
  if (k === 3) {
    const pinky = span >= 6 ? 5 : 4;
    let mid = 3;
    if (gaps[0] <= 2 || gaps[1] >= 5) mid = 2;
    else if (gaps[1] <= 2) mid = pinky === 5 ? 4 : 3;
    return [1, mid, pinky];
  }
  if (k === 4) return span >= 9 ? [1, 2, 3, 5] : [1, 2, 3, 4];
  return [1, 2, 3, 4, 5].slice(0, k);
}

function chordFingers(midis, hand) {
  // Order from the thumb side: lowest note first in the right hand, highest first in the left.
  const order = midis.map((m, i) => ({ m, i })).sort((a, b) => (hand === 'R' ? a.m - b.m : b.m - a.m));
  const shape = chordShape(order.map((o) => o.m));
  const out = [];
  order.forEach((o, k) => { out[o.i] = shape[k]; });
  return out;
}

function stepCost(xa, fa, xb, fb) {
  const d = xb - xa;
  if (d === 0) return fa === fb ? 0 : 1;
  const ad = Math.abs(d);
  // Moving the hand to a new place is natural for a leap, a last resort for a small step.
  const jump = (ad >= 4 ? 3 : JUMP) + 0.15 * ad;
  if (fa === fb) return Math.min(jump, 4 + ad * 0.3);
  const lo = Math.min(fa, fb);
  const hi = Math.max(fa, fb);
  if ((fb > fa) === (d > 0)) {
    // Natural direction: higher finger, higher note.
    if (ad <= MAX_SPAN[lo * 10 + hi]) return Math.abs(ad - (hi - lo)) * 0.6;
    return jump;
  }
  // Thumb under, or a finger crossing over the thumb, by a step or two.
  if (lo === 1 && hi <= 4 && ad <= (hi === 2 ? 1 : 2)) return { 2: 2.6, 3: 2, 4: 2.4 }[hi] + ad * 0.2;
  return jump;
}

function noteCost(midi, f, short) {
  let c = f === 4 ? 0.1 : 0;
  if (isBlack(midi) && f === 1) c += short ? 1.5 : 0.8;
  if (isBlack(midi) && f === 5) c += 0.4;
  return c;
}

// Hand position for a token: where the thumb would be.
const frame = (xs, fs) => xs.reduce((a, x, i) => a + x - (fs[i] - 1), 0) / xs.length;

function moveCost(a, b) {
  if (a.xs.length === 1 && b.xs.length === 1) return stepCost(a.xs[0], a.fs[0], b.xs[0], b.fs[0]);
  const shift = Math.abs(frame(b.xs, b.fs) - frame(a.xs, a.fs));
  let c = shift <= 1 ? shift * 0.5 : shift <= 3 ? 0.5 + (shift - 1) * 1.2 : 3 + 0.15 * shift;
  // Keeping a shared note on the same finger is good; switching fingers on it is not.
  a.xs.forEach((x, i) => {
    const j = b.xs.indexOf(x);
    if (j >= 0) c += a.fs[i] === b.fs[j] ? -0.3 : 0.5;
  });
  return Math.max(0, c);
}

// Fill tok.fingers for every token of one hand (bars of tokens from parseVoice).
export function assignFingers(bars, hand) {
  const toks = [];
  let t = 0;
  let lastEnd = 0;
  for (const bar of bars) {
    for (const tok of bar) {
      if (!tok.rest) {
        toks.push({ tok, gap: t - lastEnd });
        lastEnd = t + tok.beats;
      }
      t += tok.beats;
    }
  }
  const sign = hand === 'R' ? 1 : -1;
  const options = toks.map(({ tok }) => {
    const midis = tok.notes.map(noteToMidi);
    const xs = midis.map((m) => sign * pos(m));
    if (midis.length === 1) {
      const fixed = tok.fixed[0];
      return (fixed ? [fixed] : [1, 2, 3, 4, 5]).map((f) => ({ xs, fs: [f], own: noteCost(midis[0], f, tok.beats < 1) }));
    }
    const fs = tok.fixed.every(Boolean) ? tok.fixed : chordFingers(midis, hand).map((f, i) => tok.fixed[i] || f);
    return [{ xs, fs, own: midis.reduce((a, m, i) => a + noteCost(m, fs[i], false), 0) }];
  });
  if (!toks.length) return;
  // Shortest path through the options.
  let cost = options[0].map((o) => o.own);
  const back = [];
  for (let i = 1; i < toks.length; i++) {
    const gap = toks[i].gap;
    const ease = gap >= 1 ? 0.4 : gap >= 0.5 ? 0.7 : 1;
    const next = [];
    const from = [];
    options[i].forEach((o) => {
      let best = Infinity;
      let arg = 0;
      options[i - 1].forEach((p, j) => {
        const c = cost[j] + moveCost(p, o) * ease;
        if (c < best - 1e-9) { best = c; arg = j; }
      });
      next.push(best + o.own);
      from.push(arg);
    });
    cost = next;
    back.push(from);
  }
  let k = cost.indexOf(Math.min(...cost));
  for (let i = toks.length - 1; i >= 0; i--) {
    toks[i].tok.fingers = options[i][k].fs;
    if (i > 0) k = back[i - 1][k];
  }
  for (const bar of bars) for (const tok of bar) if (tok.rest) tok.fingers = [];
}
