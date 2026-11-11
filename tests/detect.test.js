import test from 'node:test';
import assert from 'node:assert/strict';
import { hann, notePresent } from '../js/detect.js';
import { midiToFreq } from '../js/music.js';

const SR = 48000;
const N = 8192;

// A rough piano-like tone: decaying harmonics, plus a little noise.
function tone(midis, noise = 0.01) {
  const buf = new Float32Array(N);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const m of midis) {
    const f = midiToFreq(m);
    for (let h = 1; h <= 6; h++) {
      const a = 0.25 / (h * h * 0.6 + 0.4);
      for (let i = 0; i < N; i++) buf[i] += a * Math.sin((2 * Math.PI * f * h * i) / SR + h);
    }
  }
  for (let i = 0; i < N; i++) buf[i] += noise * rand();
  return hann(buf);
}
const has = (played, midi) => notePresent(tone(played), SR, midi);

test('hears a single note and rejects its neighbours', () => {
  for (const m of [40, 48, 55, 60, 67, 72, 79, 84]) {
    assert.ok(has([m], m), `note ${m}`);
    assert.ok(!has([m], m + 1), `note ${m} heard as ${m + 1}`);
    assert.ok(!has([m], m - 1), `note ${m} heard as ${m - 1}`);
    assert.ok(!has([m], m + 2), `note ${m} heard as ${m + 2}`);
  }
});

test('hears each note of a chord and of two hands together', () => {
  const chord = [60, 64, 67];
  for (const m of chord) assert.ok(has(chord, m), `chord note ${m}`);
  assert.ok(!has(chord, 62));
  assert.ok(!has(chord, 65));
  const hands = [48, 55, 64, 72];
  for (const m of hands) assert.ok(has(hands, m), `hands note ${m}`);
});

test('does not hear a note in silence or noise', () => {
  assert.ok(!notePresent(tone([], 0.05), SR, 60));
  assert.ok(!notePresent(hann(new Float32Array(N)), SR, 60));
});

test('a fifth or a third is not mistaken for the expected note', () => {
  assert.ok(!has([60], 67));
  assert.ok(!has([60], 64));
  assert.ok(!has([67], 60));
});
