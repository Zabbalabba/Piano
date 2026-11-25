// Benchmark: the fingering engine against published reference fingerings.
//
// Each case is plain notes (no fingers written in), run through the engine, and compared note by
// note with fingerings from teaching sources. Where sources disagree, every sourced variant is
// accepted. Run with: node tests/fingering-benchmark.js

import { parseExercise } from '../js/music.js';

const q = (notes) => {
  // quarter notes, padded with rests to whole 4/4 bars
  const n = notes.length;
  const pad = (4 - (n % 4)) % 4;
  const toks = [...notes, ...Array(pad).fill('r')];
  const bars = [];
  for (let i = 0; i < toks.length; i += 4) bars.push(toks.slice(i, i + 4).map((t, j) => (j === 0 && i === 0 ? `${t}/q` : t)).join(' '));
  return bars.join(' | ').replace(/^r /, 'r/q ').replace(/\| r(?= |$)/g, '| r/q');
};
const scale = (notes) => q(notes.split(' '));

export const CASES = [
  // ---- scales, one octave up (sources: Piano Keyboard Guide, Hoffman Academy, Wheaton College handout, Skoove, Musicnotes)
  { name: 'C major scale, RH', type: 'scale', hand: 'R', notes: 'C4 D4 E4 F4 G4 A4 B4 C5', ref: ['1 2 3 1 2 3 4 5'] },
  { name: 'C major scale, LH', type: 'scale', hand: 'L', notes: 'C3 D3 E3 F3 G3 A3 B3 C4', ref: ['5 4 3 2 1 3 2 1'] },
  { name: 'G major scale, RH', type: 'scale', hand: 'R', notes: 'G4 A4 B4 C5 D5 E5 F#5 G5', ref: ['1 2 3 1 2 3 4 5'] },
  { name: 'D major scale, RH', type: 'scale', hand: 'R', notes: 'D4 E4 F#4 G4 A4 B4 C#5 D5', ref: ['1 2 3 1 2 3 4 5'] },
  { name: 'B major scale, RH', type: 'scale', hand: 'R', notes: 'B3 C#4 D#4 E4 F#4 G#4 A#4 B4', ref: ['1 2 3 1 2 3 4 5'] },
  { name: 'B major scale, LH', type: 'scale', hand: 'L', notes: 'B2 C#3 D#3 E3 F#3 G#3 A#3 B3', ref: ['4 3 2 1 4 3 2 1'] },
  { name: 'F major scale, RH', type: 'scale', hand: 'R', notes: 'F4 G4 A4 Bb4 C5 D5 E5 F5', ref: ['1 2 3 4 1 2 3 4'] },
  { name: 'F major scale, LH', type: 'scale', hand: 'L', notes: 'F2 G2 A2 Bb2 C3 D3 E3 F3', ref: ['5 4 3 2 1 3 2 1'] },
  { name: 'B♭ major scale, RH', type: 'scale', hand: 'R', notes: 'Bb3 C4 D4 Eb4 F4 G4 A4 Bb4', ref: ['4 1 2 3 1 2 3 4', '2 1 2 3 1 2 3 4'] },
  { name: 'B♭ major scale, LH', type: 'scale', hand: 'L', notes: 'Bb2 C3 D3 Eb3 F3 G3 A3 Bb3', ref: ['3 2 1 4 3 2 1 3', '3 2 1 4 3 2 1 2'] },
  { name: 'E♭ major scale, RH', type: 'scale', hand: 'R', notes: 'Eb4 F4 G4 Ab4 Bb4 C5 D5 Eb5', ref: ['3 1 2 3 4 1 2 3'] },
  { name: 'E♭ major scale, LH', type: 'scale', hand: 'L', notes: 'Eb3 F3 G3 Ab3 Bb3 C4 D4 Eb4', ref: ['3 2 1 4 3 2 1 3'] },
  { name: 'A♭ major scale, RH', type: 'scale', hand: 'R', notes: 'Ab3 Bb3 C4 Db4 Eb4 F4 G4 Ab4', ref: ['3 4 1 2 3 1 2 3'] },
  { name: 'A♭ major scale, LH', type: 'scale', hand: 'L', notes: 'Ab2 Bb2 C3 Db3 Eb3 F3 G3 Ab3', ref: ['3 2 1 4 3 2 1 3'] },
  // ---- chromatic (sources: Instructables, Piano Keyboard Guide, Hoffman Academy)
  { name: 'Chromatic scale from C, RH', type: 'chromatic', hand: 'R', notes: 'C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5', ref: ['1 3 1 3 1 2 3 1 3 1 3 1 2'] },
  // ---- five-finger and Hanon (sources: Dummies/MuseScore C position, hanon-online.com)
  { name: 'Five-finger pattern in C, RH', type: 'five-finger', hand: 'R', notes: 'C4 D4 E4 F4 G4 F4 E4 D4 C4', ref: ['1 2 3 4 5 4 3 2 1'] },
  { name: 'Hanon no. 1, first group, RH', type: 'Hanon', hand: 'R', notes: 'C4 E4 F4 G4 A4 G4 F4 E4', ref: ['1 2 3 4 5 4 3 2'] },
  { name: 'Hanon no. 1, first group, LH', type: 'Hanon', hand: 'L', notes: 'C3 E3 F3 G3 A3 G3 F3 E3', ref: ['5 4 3 2 1 2 3 4'] },
  // ---- melodies (sources: C-position method books via Dummies/Piano Keyboard Guide; Hoffman Academy and Skoove for Für Elise)
  { name: 'Ode to Joy, RH (C position)', type: 'melody', hand: 'R', notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4', ref: ['3 3 4 5 5 4 3 2 1 1 2 3 3 2 2'] },
  { name: 'Für Elise, opening, RH', type: 'melody', hand: 'R', notes: 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4', ref: ['5 4 5 4 5 2 4 3 1', '4 3 4 3 4 1 3 2 1'] },
  // ---- chords and inversions (source: Pianote; Pianowithjonny differs on the left hand)
  { name: 'C triad, root position, RH', type: 'chord', hand: 'R', voice: 'C4+E4+G4/w', ref: ['1+3+5'] },
  { name: 'C triad, 1st inversion, RH', type: 'chord', hand: 'R', voice: 'E4+G4+C5/w', ref: ['1+2+5'] },
  { name: 'C triad, 2nd inversion, RH', type: 'chord', hand: 'R', voice: 'G4+C5+E5/w', ref: ['1+3+5'] },
  { name: 'C triad, root position, LH', type: 'chord', hand: 'L', voice: 'C3+E3+G3/w', ref: ['5+3+1'] },
  { name: 'C triad, 1st inversion, LH', type: 'chord', hand: 'L', voice: 'E3+G3+C4/w', ref: ['5+3+1', '5+2+1'] },
  { name: 'C triad, 2nd inversion, LH', type: 'chord', hand: 'L', voice: 'G2+C3+E3/w', ref: ['5+2+1', '5+3+1'] },
  { name: 'Root and fifth (power chord), LH', type: 'chord', hand: 'L', voice: 'C3+G3/w', ref: ['5+1'] },
  // ---- arpeggios (sources: Baylor Piano Basics for RH, Skoove for LH)
  { name: 'C major arpeggio, RH', type: 'arpeggio', hand: 'R', notes: 'C4 E4 G4 C5', ref: ['1 2 3 5'] },
  { name: 'C major arpeggio, LH', type: 'arpeggio', hand: 'L', notes: 'C3 E3 G3 C4', ref: ['5 3 2 1', '5 4 2 1'] },
  // ---- accompaniment patterns (sources: Hoffman Academy for Alberti; Super Simple Piano / Computer Music for root-fifth)
  { name: 'Alberti bass, LH', type: 'accompaniment', hand: 'L', notes: 'C3 G3 E3 G3 C3 G3 E3 G3', ref: ['5 1 3 1 5 1 3 1'] },
  { name: 'Root–fifth bass, LH', type: 'accompaniment', hand: 'L', notes: 'D3 A3 A3 D3', ref: ['5 1 1 5'] },
];

export function engineFingers(c) {
  const voice = c.voice || scale(c.notes);
  const item = { id: `bench-${c.name}`, bpm: 80, rh: c.hand === 'R' ? voice : '', lh: c.hand === 'L' ? voice : '' };
  const p = parseExercise(item);
  const v = c.hand === 'R' ? p.rh : p.lh;
  const out = [];
  for (const bar of v) for (const t of bar) if (!t.rest) out.push(t.fingers.join('+'));
  return out;
}

export function score(c) {
  const got = engineFingers(c);
  let best = null;
  for (const ref of c.ref) {
    const r = ref.split(' ');
    const right = r.filter((x, i) => x === got[i]).length;
    if (!best || right > best.right) best = { right, total: r.length, ref };
  }
  return { ...best, got: got.join(' '), exact: best.right === best.total };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let notes = 0;
  let right = 0;
  let exact = 0;
  const byType = {};
  for (const c of CASES) {
    const s = score(c);
    notes += s.total; right += s.right; exact += s.exact ? 1 : 0;
    byType[c.type] = byType[c.type] || [0, 0];
    byType[c.type][0] += s.exact ? 1 : 0; byType[c.type][1] += 1;
    console.log(`${s.exact ? 'OK  ' : 'DIFF'} ${c.name.padEnd(34)} engine ${s.got.padEnd(34)} reference ${s.ref}`);
  }
  console.log(`\n${exact} of ${CASES.length} cases exact; ${right} of ${notes} notes (${Math.round((100 * right) / notes)}%)`);
  console.log(Object.entries(byType).map(([t, [e, n]]) => `${t} ${e}/${n}`).join(' · '));
}
