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

const READ_POOLS = {
  1: [['treble', naturals('C4', 'G4')]],
  2: [['treble', naturals('C4', 'G5')], ['bass', naturals('C3', 'C4')]],
  3: [['treble', naturals('A3', 'C6')], ['bass', naturals('C2', 'E4')]],
};

export const READ_LEVELS = {
  1: 'Treble clef, middle C to G',
  2: 'Treble clef and bass clef',
  3: 'Both clefs with ledger lines',
};

export function readingQuestion(level, last, rnd = Math.random) {
  for (let i = 0; i < 20; i++) {
    const [clef, pool] = pick(READ_POOLS[level], rnd);
    const note = pick(pool, rnd);
    if (!last || last.note !== note || last.clef !== clef) {
      return { clef, note, answer: note[0], choices: LETTERS };
    }
  }
  return { clef: 'treble', note: 'C4', answer: 'C', choices: LETTERS };
}

const INTERVALS = {
  1: 'Half step', 2: 'Whole step', 3: 'Minor third', 4: 'Major third', 5: 'Fourth', 7: 'Fifth', 12: 'Octave',
};

export const EAR_LEVELS = {
  1: 'Higher or lower',
  2: 'Step, third, fifth or octave',
  3: 'All basic intervals, and major or minor chords',
};

export function earQuestion(level, rnd = Math.random) {
  const base = 55 + Math.floor(rnd() * 12);
  if (level === 1) {
    const gap = pick([2, 3, 4, 5, 7], rnd) * (rnd() < 0.5 ? 1 : -1);
    return {
      prompt: 'Is the second note higher or lower?',
      notes: [[base], [base + gap]],
      choices: ['Lower', 'Higher'],
      answer: gap > 0 ? 'Higher' : 'Lower',
    };
  }
  if (level === 3 && rnd() < 0.35) {
    const major = rnd() < 0.5;
    return {
      prompt: 'Major or minor chord?',
      notes: [[base, base + (major ? 4 : 3), base + 7]],
      choices: ['Minor', 'Major'],
      answer: major ? 'Major' : 'Minor',
    };
  }
  const set = level === 2 ? [2, 4, 7, 12] : [1, 2, 3, 4, 5, 7, 12];
  const semis = pick(set, rnd);
  return {
    prompt: 'Which interval do you hear?',
    notes: [[base], [base + semis]],
    choices: set.map((s) => INTERVALS[s]),
    answer: INTERVALS[semis],
  };
}

// Level changes are based on your recent answers at the current level (answers from an earlier
// level do not count). Normally the last 40 decide: 90% or more right moves you up, under 60%
// moves you down. After 20, an unmistakable result moves you early: 95% or more up, 50% or less down.
export const LEVEL_WINDOW = 40;
export const EARLY_AFTER = 20;

export function adjustLevel(level, log) {
  const recent = log.slice(-LEVEL_WINDOW);
  const n = recent.length;
  const share = n ? recent.filter(Boolean).length / n : 0;
  const full = n >= LEVEL_WINDOW;
  if (n >= EARLY_AFTER) {
    if (level < 3 && share >= (full ? 0.9 : 0.95)) return level + 1;
    if (level > 1 && share < (full ? 0.6 : 0.5000001)) return level - 1;
  }
  return level;
}

// Where you stand towards the next level review, for the results screen.
export function levelStatus(log) {
  const recent = log.slice(-LEVEL_WINDOW);
  const right = recent.filter(Boolean).length;
  return { answers: recent.length, right, share: recent.length ? right / recent.length : 0, window: LEVEL_WINDOW };
}
