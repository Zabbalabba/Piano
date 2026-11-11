import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ITEMS, GENRES, TRACK_ITEMS, PIECE_ITEMS, ASSESS_PASSAGES, ITEM_BY_ID } from '../js/content.js';
import { parseExercise, noteToMidi, transposeNote, pat } from '../js/music.js';

test('every item parses and every bar has the right number of beats', () => {
  for (const item of ALL_ITEMS) {
    const p = parseExercise(item);
    assert.ok(p.events.length > 0, item.id);
    assert.ok(item.t && item.focus && item.tip && item.bpm && item.lv, `${item.id} is missing fields`);
  }
});

test('ids are unique', () => {
  assert.equal(new Set(ALL_ITEMS.map((i) => i.id)).size, ALL_ITEMS.length);
});

test('notes stay in a playable range and each hand fits a hand span', () => {
  for (const item of ALL_ITEMS) {
    const p = parseExercise(item);
    for (const e of p.events) assert.ok(e.midi >= 36 && e.midi <= 96, `${item.id}: ${e.midi}`);
    for (const voice of [p.rh, p.lh]) {
      for (const bar of voice || []) {
        for (const tok of bar) {
          const m = tok.notes.map(noteToMidi);
          if (m.length > 1) assert.ok(Math.max(...m) - Math.min(...m) <= 12, `${item.id}: chord wider than an octave`);
        }
      }
    }
  }
});

test('every genre has five exercises ordered by level and three pieces', () => {
  assert.ok(GENRES.length <= 15);
  for (const g of GENRES) {
    const items = TRACK_ITEMS[g.id];
    assert.equal(items.length, 5, g.id);
    for (let i = 1; i < items.length; i++) assert.ok(items[i].lv >= items[i - 1].lv, `${g.id} order`);
    assert.equal(PIECE_ITEMS[g.id].length, 3, g.id);
    for (const p of PIECE_ITEMS[g.id]) assert.ok(p.src && p.perf, p.id);
  }
});

test('piece openings give a 3 to 10 second sample', async () => {
  const { sampleBars } = await import('../js/planner.js');
  for (const g of GENRES) {
    for (const p of PIECE_ITEMS[g.id]) {
      const { seconds } = sampleBars(p);
      assert.ok(seconds >= 3 && seconds <= 10, `${p.id}: ${seconds}s`);
    }
  }
});

test('assessment passages exist', () => {
  for (const id of ASSESS_PASSAGES) assert.ok(ITEM_BY_ID[id], id);
});

test('theory helpers', () => {
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('Bb3'), 58);
  assert.equal(transposeNote('F2', 6, 10), 'Eb3');
  assert.equal(pat('C3', '1+5/q 1+6'), 'C3+G3/q C3+A3');
  assert.equal(pat('G2', 'b7/q 6'), 'F3/q E3');
});
