import test from 'node:test';
import assert from 'node:assert/strict';
import {
  levelDecision, levelStatus, readingQuestion, earQuestion, readingPool, earPool, recordAnswer, isSlow,
  keyName, progressNotes, balancedShare, struggle, MAX_LEVEL, READ_LEVELS, EAR_LEVELS, READ_TIME_LIMIT,
} from '../js/quiz.js';

// Answers spread over a few question types, so the balanced score matches the raw share.
const log = (right, wrong) => {
  const out = [];
  for (let i = 0; i < right; i++) out.push({ k: `q${i % 4}`, s: 1 });
  for (let i = 0; i < wrong; i++) out.push({ k: `q${i % 4}`, s: 0 });
  // interleave so every type gets the same mix
  return out.map((x, i) => ({ ...x, k: `q${i % 4}` }));
};
const up = (lvl, l) => levelDecision('read', lvl, l) === 'up';

test('moving up: 90% after 20, 85% over 40, never before 20', () => {
  assert.equal(up(1, log(19, 0)), false);
  assert.equal(up(1, log(18, 2)), true);
  assert.equal(up(1, log(17, 3)), false);
  assert.equal(up(1, log(34, 6)), true);
  assert.equal(up(1, log(33, 7)), false);
  assert.equal(up(5, log(40, 0)), false);
  assert.equal(levelDecision('ear', 4, log(40, 0)), null);
});

test('moving back: the first 20 answers after a change are free', () => {
  assert.equal(levelDecision('read', 3, log(0, 20)), null);
  assert.equal(levelDecision('read', 3, log(5, 35), 40), 'offerDown');
});

test('moving back is automatic only when clearly lost, otherwise offered', () => {
  const lost = log(15, 45); // 25% over the last 40 judged, after a free 20
  assert.equal(levelDecision('read', 3, lost, 60), 'down');
  assert.equal(levelDecision('read', 3, [...log(10, 10), ...log(22, 18)], 60), 'offerDown'); // 55%
  assert.equal(levelDecision('read', 3, [...log(10, 10), ...log(26, 14)], 60), null); // 65%
  assert.equal(levelDecision('read', 1, lost, 60), null);
});

test('60% or more right is never moved back automatically, even if the balanced score is low', () => {
  // q0 asked 25 times, all right; 15 other types once each, all wrong: 62.5% right, but the
  // balanced score is at 50%
  const l = [...Array(25).fill({ k: 'q0', s: 1 }), ...Array.from({ length: 15 }, (_, i) => ({ k: `x${i}`, s: 0 }))];
  assert.ok(balancedShare(l) <= 0.5);
  const judged = [...Array(20).fill({ k: 'z', s: 1 }), ...l];
  assert.equal(levelDecision('read', 3, judged, 60), 'offerDown');
});

test('a declined offer stays quiet for 20 more answers', () => {
  const l = [...log(10, 10), ...log(22, 18)];
  assert.equal(levelDecision('read', 3, l, 60, 80), null);
  assert.equal(levelDecision('read', 3, l, 80, 80), 'offerDown');
});

test('a type seen only once does not swing the score', () => {
  // Your case: 70% right, where a few new types were each missed once.
  const l = [...Array(14).fill({ k: 'old', s: 1 }), ...Array(3).fill({ k: 'old', s: 0 }), { k: 'int:5', s: 0 }, { k: 'int:1', s: 0 }, { k: 'int:3', s: 1 }];
  assert.ok(balancedShare(l) > 0.6, String(balancedShare(l)));
  // Older answers without a type count towards the overall result, not as one type.
  const legacy = [...Array(14).fill(1), ...Array(6).fill(0)];
  assert.equal(balancedShare(legacy), 0.7);
});

test('smaller levels', () => {
  assert.equal(Object.keys(READ_LEVELS).length, MAX_LEVEL.read);
  assert.equal(Object.keys(EAR_LEVELS).length, MAX_LEVEL.ear);
  assert.ok(readingPool(2).every((q) => q.clef === 'treble'));
  assert.ok(readingPool(3).every((q) => q.clef === 'bass'));
  assert.ok(readingPool(4).some((q) => q.clef === 'bass') && readingPool(4).some((q) => q.clef === 'treble'));
  assert.equal(earPool(3).some((q) => q.type === 'chord'), false);
  assert.equal(earPool(4).some((q) => q.type === 'chord'), true);
});

test('questions you get wrong come up more often, but at most about half the round targets them', () => {
  let stats = {};
  for (let i = 0; i < 5; i++) stats = recordAnswer(stats, 'treble:F4', 0);
  const pool = readingPool(1);
  let f = 0;
  const N = 20000;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) if (readingQuestion(1, null, rnd, stats).key === 'treble:F4') f++;
  assert.ok(f / N > 1.5 / pool.length && f / N < 0.4, `share ${f / N}`);
});

test('a slow right answer counts as half a struggle', () => {
  assert.equal(isSlow(5000, [1000, 1100, 900, 1200, 1000]), true);
  assert.equal(isSlow(1500, [1000, 1100, 900, 1200, 1000]), false);
  assert.equal(isSlow(9000, [1000]), false);
  assert.equal(struggle([1, 0.5, 0]), 0.5);
});

test('history keeps the last five answers per question', () => {
  let s = {};
  for (let i = 0; i < 8; i++) s = recordAnswer(s, 'int:7', i % 2);
  assert.equal(s['int:7'].length, 5);
});

test('readable names and progress notes', () => {
  assert.equal(keyName('treble:F5'), 'F, treble clef, top line');
  assert.equal(keyName('treble:C4'), 'C, treble clef, below the staff');
  assert.equal(keyName('bass:F3'), 'F, bass clef, 4th line');
  assert.equal(keyName('int:7'), 'Fifth');
  const stats = { 'treble:F4': [0, 0, 1, 1], 'treble:B4': [0, 1, 0], 'treble:C4': [1, 1] };
  assert.deepEqual(progressNotes(stats, ['treble:F4', 'treble:B4', 'treble:C4']), { stronger: ['treble:F4'], tricky: ['treble:B4'] });
});

test('every level has questions with their answer among the choices', () => {
  for (let level = 1; level <= MAX_LEVEL.read; level++) for (let i = 0; i < 100; i++) {
    const r = readingQuestion(level);
    assert.ok(r.choices.includes(r.answer));
  }
  for (let level = 1; level <= MAX_LEVEL.ear; level++) for (let i = 0; i < 100; i++) {
    const e = earQuestion(level);
    assert.ok(e.choices.includes(e.answer));
  }
});

test('level status', () => {
  assert.equal(levelStatus(log(30, 10)).right, 30);
});

const steps = (n) => 'CDEFGAB'.indexOf(n[0]) + 7 * Number(n.slice(-1));

test('consecutive notes are at least a third apart, and every note still comes up', () => {
  for (let level = 1; level <= MAX_LEVEL.read; level++) {
    let last = null;
    const seen = new Set();
    for (let i = 0; i < 3000; i++) {
      const q = readingQuestion(level, last);
      if (last && q.clef === last.clef) assert.ok(Math.abs(steps(q.note) - steps(last.note)) >= 2, `${last.note} then ${q.note}`);
      seen.add(q.key);
      last = q;
    }
    assert.equal(seen.size, readingPool(level).length, `level ${level}`);
  }
});

test('slow right answers count half towards the level', () => {
  const quick = Array.from({ length: 20 }, (_, i) => ({ k: `n${i % 5}`, s: 1 }));
  const slow = Array.from({ length: 20 }, (_, i) => ({ k: `n${i % 5}`, s: 0.5 }));
  assert.equal(balancedShare(quick), 1);
  assert.equal(balancedShare(slow), 0.5);
  assert.equal(levelStatus(slow).slow, 20);
  assert.ok(READ_TIME_LIMIT[1] > READ_TIME_LIMIT[5]);
});

test('ear questions start over a wide range and never on a note just heard', () => {
  let last = null;
  const starts = new Set();
  for (let i = 0; i < 3000; i++) {
    const q = earQuestion(3, Math.random, null, last);
    const first = q.notes[0][0];
    if (last) assert.ok(!last.notes.flat().includes(first));
    starts.add(first);
    last = q;
  }
  assert.ok(Math.min(...starts) <= 49 && Math.max(...starts) >= 71);
});

test('two notes never take turns, even when both are weak spots', () => {
  let stats = {};
  for (let i = 0; i < 5; i++) { stats = recordAnswer(stats, 'treble:F4', 0); stats = recordAnswer(stats, 'treble:D4', 0); }
  let a = null;
  let b = null;
  for (let i = 0; i < 2000; i++) {
    const q = readingQuestion(1, b, Math.random, stats);
    if (a) assert.ok(q.key !== a.key || i < 2, `${a.key} ${b.key} ${q.key}`);
    a = b;
    b = q;
  }
});
