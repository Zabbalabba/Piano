// Note parsing, the compact exercise notation, and a few theory helpers.
//
// Voice notation: tokens separated by spaces, bars by "|".
//   C4/q        single note, quarter        (w h q e s, add "." for dotted)
//   C4+E4+G4/h  chord
//   r/q         rest
// A token without "/dur" reuses the previous duration in that voice.

const LETTER_SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = 'CDEFGAB';
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const DUR_BEATS = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };

export function noteToMidi(name) {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const acc = m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0;
  return 12 * (Number(m[3]) + 1) + LETTER_SEMIS[m[1]] + acc;
}

export function midiToName(midi) {
  return SHARP_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

// Move a note by a number of letter steps and semitones, keeping correct spelling.
export function transposeNote(name, letterSteps, semitones) {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const idx = LETTERS.indexOf(m[1]) + letterSteps;
  const letter = LETTERS[((idx % 7) + 7) % 7];
  const octave = Number(m[3]) + Math.floor(idx / 7);
  const natural = 12 * (octave + 1) + LETTER_SEMIS[letter];
  const acc = noteToMidi(name) + semitones - natural;
  if (Math.abs(acc) > 2) throw new Error(`Cannot spell ${name} +${letterSteps}/${semitones}`);
  return letter + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc)) + octave;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

// One octave of a scale including the top note: 8 note names.
export function scaleNotes(root, mode = 'major') {
  const iv = MODES[mode];
  const out = [];
  for (let i = 0; i <= 7; i++) out.push(transposeNote(root, i, i === 7 ? 12 : iv[i]));
  return out;
}

// Pattern helper: write a figure once in scale degrees and apply it to any root.
//   pat('C3', '1+5/q 1+6 1+5 1+6')  ->  'C3+G3/q C3+A3 C3+G3 C3+A3'
// Degrees are major-scale degrees of the root (8 = octave, b7, #4 ...); "r" is a rest.
export function pat(root, tpl) {
  return tpl
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      if (tok === '|') return tok;
      const [p, d] = tok.split('/');
      const pitches = p
        .split('+')
        .map((x) => {
          if (x === 'r') return 'r';
          const m = /^(b|#)?(\d+)$/.exec(x);
          if (!m) throw new Error(`Bad degree "${x}"`);
          const n = Number(m[2]) - 1;
          const semis = MAJOR[n % 7] + 12 * Math.floor(n / 7) + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
          return transposeNote(root, n, semis);
        })
        .join('+');
      return d ? `${pitches}/${d}` : pitches;
    })
    .join(' ');
}

export const seq = (roots, tpl) => roots.map((r) => pat(r, tpl)).join(' | ');
export const rep = (s, n) => Array(n).fill(s).join(' ');
export const bars = (...b) => b.join(' | ');

export function barBeatsOf(ts) {
  return (ts[0] * 4) / ts[1];
}

// Beats between metronome clicks: dotted-quarter pulse in compound time.
export function pulseOf(ts) {
  if (ts[1] === 8 && ts[0] % 3 === 0 && ts[0] > 3) return 1.5;
  return 4 / ts[1];
}

export function parseVoice(str, barBeats) {
  if (!str || !str.trim()) return null;
  let dur = null;
  return str.split('|').map((barStr, bi) => {
    const toks = barStr.trim().split(/\s+/).filter(Boolean).map((tok) => {
      const [p, d] = tok.split('/');
      if (d) dur = d;
      if (!dur) throw new Error(`No duration for "${tok}"`);
      const base = dur.replace('.', '');
      if (!(base in DUR_BEATS)) throw new Error(`Bad duration "${dur}"`);
      const dots = dur.endsWith('.') ? 1 : 0;
      const beats = DUR_BEATS[base] * (dots ? 1.5 : 1);
      const rest = p === 'r';
      const notes = rest ? [] : p.split('+');
      notes.forEach(noteToMidi);
      return { notes, rest, dur: base, dots, beats };
    });
    const sum = toks.reduce((a, t) => a + t.beats, 0);
    if (Math.abs(sum - barBeats) > 1e-6) {
      throw new Error(`Bar ${bi + 1} has ${sum} beats, expected ${barBeats}: "${barStr.trim()}"`);
    }
    return toks;
  });
}

// Swing: the off-beat eighth lands two thirds of the way through the beat.
export function swingBeat(b) {
  const whole = Math.floor(b + 1e-9);
  const f = b - whole;
  return whole + (f < 0.5 ? f * (4 / 3) : 2 / 3 + (f - 0.5) * (2 / 3));
}

const cache = new Map();

export function parseExercise(ex) {
  if (cache.has(ex.id)) return cache.get(ex.id);
  const ts = ex.ts || [4, 4];
  const barBeats = barBeatsOf(ts);
  const rh = parseVoice(ex.rh, barBeats);
  const lh = parseVoice(ex.lh, barBeats);
  if (!rh && !lh) throw new Error(`${ex.id}: no notes`);
  if (rh && lh && rh.length !== lh.length) {
    throw new Error(`${ex.id}: right hand has ${rh.length} bars, left hand ${lh.length}`);
  }
  const nBars = (rh || lh).length;
  const events = [];
  const add = (voice, hand) => {
    if (!voice) return;
    voice.forEach((bar, bi) => {
      let t = bi * barBeats;
      for (const tok of bar) {
        if (!tok.rest) {
          let start = t;
          let end = t + tok.beats;
          if (ex.swing) {
            start = swingBeat(start);
            end = swingBeat(end);
          }
          for (const n of tok.notes) {
            events.push({ t: start, d: end - start, midi: noteToMidi(n), hand, nt: t });
          }
        }
        t += tok.beats;
      }
    });
  };
  add(rh, 'R');
  add(lh, 'L');
  events.sort((a, b) => a.t - b.t || a.midi - b.midi);
  const parsed = { ts, barBeats, pulse: pulseOf(ts), rh, lh, nBars, totalBeats: nBars * barBeats, events };
  cache.set(ex.id, parsed);
  return parsed;
}
