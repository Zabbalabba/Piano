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

test('key versions: every exercise in every key keeps its rhythm and stays playable', async () => {
  const { KEY_VERSIONS } = await import('../js/content.js');
  let n = 0;
  for (const [id, versions] of Object.entries(KEY_VERSIONS)) {
    const base = parseExercise(ITEM_BY_ID[id]);
    for (const v of versions) {
      n++;
      const p = parseExercise(v);
      assert.equal(p.nBars, base.nBars, v.id);
      assert.equal(p.events.length, base.events.length, v.id);
      assert.ok(v.t.includes(' · in '), v.id);
    }
  }
  assert.equal(n, 72 * 3);
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

test('every note has a finger, and chords use different fingers in hand order', () => {
  for (const item of ALL_ITEMS) {
    const p = parseExercise(item);
    for (const [voice, hand] of [[p.rh, 'R'], [p.lh, 'L']]) {
      for (const bar of voice || []) {
        for (const tok of bar) {
          if (tok.rest) continue;
          assert.equal(tok.fingers.length, tok.notes.length, item.id);
          for (const f of tok.fingers) assert.ok(f >= 1 && f <= 5, `${item.id}: finger ${f}`);
          const byPitch = tok.notes.map((n, i) => [noteToMidi(n), tok.fingers[i]]).sort((a, b) => a[0] - b[0]);
          for (let i = 1; i < byPitch.length; i++) {
            const ok = hand === 'R' ? byPitch[i][1] > byPitch[i - 1][1] : byPitch[i][1] < byPitch[i - 1][1];
            assert.ok(ok, `${item.id}: chord ${tok.notes.join('+')} fingered ${tok.fingers.join('-')}`);
          }
        }
      }
    }
  }
});

test('standard fingerings: C major scale and a C chord', () => {
  const f = (id, v) => parseExercise(ITEM_BY_ID[id])[v].flat().filter((t) => !t.rest).map((t) => t.fingers.join('+')).join(' ');
  assert.equal(f('tq-c-r', 'rh'), '1 2 3 1 2 3 4 5 5 4 3 2 1 3 2 1');
  assert.equal(f('tq-c-l', 'lh'), '5 4 3 2 1 3 2 1 1 2 3 1 2 3 4 5');
  assert.equal(f('fd-chords', 'lh').split(' ')[0], '5+3+1');
  assert.equal(f('tq-inv-c', 'rh').split(' ').slice(0, 3).join(' '), '1+3+5 1+2+5 1+3+5');
});

test('no crossed fingers: a higher finger never plays a lower note within a beat, except thumb under/over or leaps past an octave', () => {
  const WHITE = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
  const pos = (m) => Math.floor(m / 12) * 7 + WHITE[m % 12];
  const bad = [];
  for (const item of ALL_ITEMS) {
    const p = parseExercise(item);
    for (const [voice, sign] of [[p.rh, 1], [p.lh, -1]]) {
      let prev = null;
      for (const bar of voice || []) {
        for (const t of bar) {
          if (t.rest || t.notes.length > 1) { prev = null; continue; }
          const cur = { x: sign * pos(noteToMidi(t.notes[0])), f: t.fingers[0], beats: t.beats };
          if (prev && prev.beats <= 1 && cur.f !== prev.f) {
            const d = cur.x - prev.x;
            const natural = d === 0 || (cur.f > prev.f) === (d > 0);
            const thumbMove = Math.min(cur.f, prev.f) === 1 && Math.abs(d) <= 3; // thumb under/over, up to a fourth in arpeggios
            if (!natural && !thumbMove && Math.abs(d) < 8) bad.push(`${item.id}: ${prev.f} then ${cur.f} on ${t.notes[0]}`);
          }
          prev = cur;
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});
