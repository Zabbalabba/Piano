// Question generators for note reading and ear training.

import { noteToMidi } from './music.js';

const pick = (list, rnd = Math.random) => list[Math.floor(rnd() * list.length)];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function naturals(from, to) {
  const out = [];
  for (let o = 1; o <= 6; o++) for (const l of LETTERS) {
    const n = l + o;
    const m = noteToMidi(n);
    if (m >= noteToMidi(from) && m <= noteToMidi(to)) out.push(n);
  }
  return out;
}

// Small steps, so moving a level in either direction is never a big jump.
const READ_POOLS = {
  1: [['treble', naturals('C4', 'G4')]],
  2: [['treble', naturals('C4', 'G5')]],
  3: [['bass', naturals('F2', 'C4')]],
  4: [['treble', naturals('C4', 'G5')], ['bass', naturals('F2', 'C4')]],
  5: [['treble', naturals('A3', 'C6')], ['bass', naturals('C2', 'E4')]],
};

export const READ_LEVELS = {
  1: 'Treble clef, middle C to G',
  2: 'The whole treble staff',
  3: 'The bass clef',
  4: 'Both clefs mixed',
  5: 'Both clefs with ledger lines',
};

export const MAX_LEVEL = { read: 5, ear: 4 };
// Levels before they were split into smaller steps, mapped to the matching new level.
export const OLD_LEVELS = { read: { 1: 1, 2: 4, 3: 5 }, ear: { 1: 1, 2: 2, 3: 4 } };

// ---- what you find hard
//
// Every question has a key: a note in a clef ("treble:E4") or an interval or chord type
// ("int:7"). For each key the app keeps your last five scores: 1 right, 0 wrong, and 0.5 for a
// right answer that took much longer than usual (note reading only). Keys you struggle with come
// up more often, up to four times as often; about half of each round is still picked evenly, so
// a round never turns into only your hardest questions.
export const HISTORY = 5;
const TARGETED_SHARE = 0.5;

export function struggle(scores) {
  if (!scores || !scores.length) return 0;
  return scores.reduce((a, x) => a + (1 - x), 0) / scores.length;
}
const weight = (stats, key) => 1 + 3 * struggle(stats && stats[key]);

// allowed(q): an extra rule for which questions may follow the last one. If none qualify, the ones
// furthest from it (by distance(q)) are used, so no question is ever left out for long.
function choose(pool, stats, last, rnd, allowed = null, distance = null) {
  let options = pool.length > 1 && last ? pool.filter((q) => q.key !== last.key) : pool;
  // Not the question from two back either, so two questions never take turns (A, B, A, B).
  if (last && last.prevKey) {
    const fresh = options.filter((q) => q.key !== last.prevKey && (!allowed || allowed(q)));
    if (fresh.length) options = options.filter((q) => q.key !== last.prevKey);
  }
  if (last && allowed) {
    const ok = options.filter(allowed);
    if (ok.length) options = ok;
    else if (distance) {
      const far = Math.max(...options.map(distance));
      options = options.filter((q) => distance(q) === far);
    }
  }
  if (!stats || rnd() < TARGETED_SHARE) return pick(options, rnd);
  const total = options.reduce((a, q) => a + weight(stats, q.key), 0);
  let r = rnd() * total;
  for (const q of options) {
    r -= weight(stats, q.key);
    if (r <= 0) return q;
  }
  return options[options.length - 1];
}

export function readingPool(level) {
  return READ_POOLS[level].flatMap(([clef, notes]) => notes.map((note) => ({ key: `${clef}:${note}`, clef, note })));
}

// Consecutive notes are at least a third apart on the staff (not on the neighbouring line or
// space), so a note cannot be found by counting one step from the answer just shown. A note in the
// other clef always counts as far apart.
export const MIN_STAFF_STEPS = 2;
const staffSteps = (note) => 'CDEFGAB'.indexOf(note[0]) + 7 * Number(note.slice(-1));
const staffDistance = (a, b) => (a.clef !== b.clef ? 99 : Math.abs(staffSteps(a.note) - staffSteps(b.note)));

// A right answer slower than this counts as half right towards your level: fluent reading means
// recognising a note, not working it out. The limit tightens as you move up.
export const READ_TIME_LIMIT = { 1: 3000, 2: 2500, 3: 2000, 4: 1750, 5: 1500 };

export function readingQuestion(level, last, rnd = Math.random, stats = null) {
  const q = choose(readingPool(level), stats, last, rnd,
    (c) => staffDistance(c, last) >= MIN_STAFF_STEPS, (c) => staffDistance(c, last));
  return { ...q, answer: q.note[0], choices: LETTERS, prevKey: last ? last.key : null };
}

const INTERVALS = {
  1: 'Half step', 2: 'Whole step', 3: 'Minor third', 4: 'Major third', 5: 'Fourth', 7: 'Fifth', 12: 'Octave',
};

export const EAR_LEVELS = {
  1: 'Higher or lower',
  2: 'Step, third, fifth or octave',
  3: 'Adds half step, fourth and minor third',
  4: 'Adds major and minor chords',
};

export function earPool(level) {
  if (level === 1) return [2, 3, 4, 5, 7].map((gap) => ({ key: `hl:${gap}`, type: 'hl', gap }));
  const set = level === 2 ? [2, 4, 7, 12] : [1, 2, 3, 4, 5, 7, 12];
  const pool = set.map((semis) => ({ key: `int:${semis}`, type: 'int', semis, set }));
  if (level >= 4) pool.push({ key: 'chord:major', type: 'chord', major: true }, { key: 'chord:minor', type: 'chord', major: false });
  return pool;
}

// Ear questions start anywhere from C3 to C5, and never on a note of the previous question, so
// you cannot simply compare with what you just heard.
export function earQuestion(level, rnd = Math.random, stats = null, last = null) {
  const heard = new Set(last && last.notes ? last.notes.flat() : []);
  let base = 48 + Math.floor(rnd() * 25);
  for (let i = 0; i < 20 && heard.has(base); i++) base = 48 + Math.floor(rnd() * 25);
  const q = choose(earPool(level), stats, last, rnd);
  if (q.type === 'hl') {
    const gap = q.gap * (rnd() < 0.5 ? 1 : -1);
    return {
      key: q.key,
      prompt: 'Is the second note higher or lower?',
      notes: [[base], [base + gap]],
      choices: ['Lower', 'Higher'],
      answer: gap > 0 ? 'Higher' : 'Lower',
    };
  }
  if (q.type === 'chord') {
    return {
      key: q.key,
      prompt: 'Major or minor chord?',
      notes: [[base, base + (q.major ? 4 : 3), base + 7]],
      choices: ['Minor', 'Major'],
      answer: q.major ? 'Major' : 'Minor',
    };
  }
  return {
    key: q.key,
    prompt: 'Which interval do you hear?',
    notes: [[base], [base + q.semis]],
    choices: q.set.map((x) => INTERVALS[x]),
    answer: INTERVALS[q.semis],
  };
}

// Record one answer for a key. Returns the updated stats object.
export function recordAnswer(stats, key, score) {
  const list = [...((stats && stats[key]) || []), score].slice(-HISTORY);
  return { ...(stats || {}), [key]: list };
}

// Slow means much longer than your usual time for a right answer: over 1.8 times your median, and
// at least 2.5 seconds. Needs a few answers first to know what "usual" is.
export function isSlow(ms, recentTimes) {
  if (!recentTimes || recentTimes.length < 5) return false;
  const sorted = [...recentTimes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return ms > Math.max(2500, median * 1.8);
}

// A readable name for a key, e.g. "F, treble clef, top line" or "Fifth".
const LINE_NAMES = ['bottom line', '2nd line', 'middle line', '4th line', 'top line'];
const SPACE_NAMES = ['1st space', '2nd space', '3rd space', '4th space'];
const steps = (note) => 'CDEFGAB'.indexOf(note[0]) + 7 * Number(note.slice(-1));
export function keyName(key) {
  const [kind, v] = key.split(':');
  if (kind === 'treble' || kind === 'bass') {
    const d = steps(v) - steps(kind === 'treble' ? 'E4' : 'G2');
    const where = d < 0 ? 'below the staff' : d > 8 ? 'above the staff' : d % 2 === 0 ? LINE_NAMES[d / 2] : SPACE_NAMES[(d - 1) / 2];
    return `${v[0]}, ${kind} clef, ${where}`;
  }
  if (kind === 'hl') return { 2: 'Higher or lower by a step', 3: 'Higher or lower by a third', 4: 'Higher or lower by a third', 5: 'Higher or lower by a fourth', 7: 'Higher or lower by a fifth' }[v];
  if (kind === 'int') return INTERVALS[v];
  if (kind === 'chord') return v === 'major' ? 'Major chords' : 'Minor chords';
  return key;
}

// For the results screen: keys you are getting better at, and keys that are still tricky.
export function progressNotes(stats, keysThisRound) {
  const stronger = [];
  const tricky = [];
  for (const key of new Set(keysThisRound)) {
    const h = (stats && stats[key]) || [];
    if (h.length < 2) continue;
    const lastTwo = h.slice(-2);
    if (lastTwo.every((x) => x === 1) && h.slice(0, -2).some((x) => x < 1)) stronger.push(key);
    else if (struggle(h) >= 0.4) tricky.push(key);
  }
  tricky.sort((a, b) => struggle(stats[b]) - struggle(stats[a]));
  return { stronger: stronger.slice(0, 3), tricky: tricky.slice(0, 3) };
}

// ---- level decisions
//
// Moving up looks at your last 40 answers at this level: 85% or more is ready, or 90% or more
// once you have 20. It is offered, and you can decline.
//
// Moving back: your first 20 answers after a level change never count against you. After that,
// a step back is offered at the end of a round when you are under 60%. It only happens
// automatically when you are clearly lost: 50% or less over 40 answers, and under 60% of answers
// right. Declining an offer keeps it quiet for 20 more answers.
//
// The score gives every question type the same weight, so seeing your weak spots more often does
// not drag it down. A type you have seen only a few times counts close to your overall result
// until it has a few answers of its own.
export const LEVEL_WINDOW = 40;
export const EARLY_AFTER = 20;
export const GRACE = 20;
const PRIOR = 3;

// Log entries are { k: key, s: 1 or 0 }. Older saved logs hold plain 1 and 0: those count towards
// your overall result but not as a question type of their own.
const entry = (x) => (typeof x === 'number' ? { k: null, s: x } : x);
// Share of answers right at all (slow ones included), used as the guard against moving back.
export const rawShare = (log) => (log.length ? log.map(entry).filter((x) => x.s > 0).length / log.length : 0);
// Points: 1 for right, 0.5 for right but slow, 0 for wrong.
const points = (log) => (log.length ? log.map(entry).reduce((a, x) => a + x.s, 0) / log.length : 0);

export function balancedShare(log) {
  const list = log.map(entry);
  if (!list.length) return 0;
  const overall = points(list);
  const byKey = new Map();
  for (const x of list) {
    if (x.k === null) continue;
    const v = byKey.get(x.k) || [0, 0];
    byKey.set(x.k, [v[0] + x.s, v[1] + 1]);
  }
  if (!byKey.size) return overall;
  let sum = 0;
  for (const [r, n] of byKey.values()) sum += (r + PRIOR * overall) / (n + PRIOR);
  return sum / byKey.size;
}

// count: answers at this level since the last level change (the log only keeps the recent ones).
// quietUntil: after a declined step-back offer, no new offer before this count.
export function levelDecision(kind, level, log, count = log.length, quietUntil = 0) {
  const recent = log.slice(-LEVEL_WINDOW);
  const n = recent.length;
  if (level < MAX_LEVEL[kind] && n >= EARLY_AFTER && balancedShare(recent) >= (n >= LEVEL_WINDOW ? 0.85 : 0.9)) return 'up';
  if (level > 1 && count > GRACE) {
    const judged = log.slice(-Math.min(LEVEL_WINDOW, count - GRACE));
    if (judged.length >= EARLY_AFTER) {
      const share = balancedShare(judged);
      if (judged.length >= LEVEL_WINDOW && share <= 0.5 && rawShare(judged) < 0.6) return 'down';
      if (share < 0.6 && count >= quietUntil) return 'offerDown';
    }
  }
  return null;
}

// Where you stand, for the results screen.
export function levelStatus(log) {
  const recent = log.slice(-LEVEL_WINDOW);
  const list = recent.map(entry);
  const right = list.filter((x) => x.s > 0).length;
  const slow = list.filter((x) => x.s > 0 && x.s < 1).length;
  return { answers: recent.length, right, slow, share: balancedShare(recent), window: LEVEL_WINDOW };
}
