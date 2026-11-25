import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, score } from './fingering-benchmark.js';
import { ITEM_BY_ID } from '../js/content.js';
import { parseExercise } from '../js/music.js';

// The engine matches published fingerings for every pattern type except scales with black keys
// and the chromatic scale: those follow conventions, so the app writes them in from tables.
test('engine matches published fingerings for five-finger patterns, Hanon, melodies, chords, arpeggios and accompaniment', () => {
  for (const c of CASES.filter((x) => !['scale', 'chromatic'].includes(x.type))) {
    const s = score(c);
    assert.ok(s.exact, `${c.name}: engine ${s.got}, reference ${s.ref}`);
  }
});

test('engine keeps scales playable: the thumb never lands on a black key', () => {
  for (const c of CASES.filter((x) => x.type === 'scale')) {
    const notes = c.notes.split(' ');
    const got = score(c).got.split(' ');
    notes.forEach((n, i) => assert.ok(!(n.includes('#') || n.includes('b')) || got[i] !== '1', `${c.name}: thumb on ${n}`));
  }
});

test('scale exercises in the app use the standard fingerings', () => {
  const f = (id, v) => parseExercise(ITEM_BY_ID[id])[v].flat().filter((t) => !t.rest).slice(0, 8).map((t) => t.fingers[0]).join(' ');
  assert.equal(f('tq-g-ht', 'rh'), '1 2 3 1 2 3 4 5');
  assert.equal(f('tq-d-ht', 'rh'), '1 2 3 1 2 3 4 5');
  assert.equal(f('tq-f-r', 'rh'), '1 2 3 4 1 2 3 4');
  assert.equal(f('tq-g-ht', 'lh'), '5 4 3 2 1 3 2 1');
  assert.equal(f('tq-chromatic', 'rh').split(' ').slice(0, 7).join(' '), '1 3 1 3 1 2 3');
});
