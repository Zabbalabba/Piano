import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustLevel, levelStatus, readingQuestion, earQuestion, readingPool, recordAnswer, isSlow, keyName,
  progressNotes, balancedShare, struggle,
} from '../js/quiz.js';

const log = (right, wrong) => [...Array(right).fill(1), ...Array(wrong).fill(0)];

test('no change before 20 answers, however they went', () => {
  assert.equal(adjustLevel(1, log(19, 0)), 1);
  assert.equal(adjustLevel(2, log(0, 19)), 2);
});

test('after 20, only an unmistakable result moves the level early', () => {
  assert.equal(adjustLevel(1, log(18, 2)), 2); // 90%
  assert.equal(adjustLevel(1, log(17, 3)), 1); // 85%: wait for 40
  assert.equal(adjustLevel(2, log(10, 10)), 1); // 50%
  assert.equal(adjustLevel(2, log(11, 9)), 2);
});

test('over 40 answers: 85% moves up, under 60% moves down', () => {
  assert.equal(adjustLevel(1, log(34, 6)), 2);
  assert.equal(adjustLevel(1, log(33, 7)), 1);
  assert.equal(adjustLevel(2, log(23, 17)), 1);
  assert.equal(adjustLevel(2, log(24, 16)), 2);
  assert.equal(adjustLevel(3, log(40, 0)), 3);
  assert.equal(adjustLevel(1, log(0, 40)), 1);
});

test('only the most recent 40 answers count', () => {
  assert.equal(adjustLevel(1, [...log(0, 30), ...log(34, 6)]), 2);
  const st = levelStatus([...log(0, 30), ...log(30, 10)]);
  assert.deepEqual([st.answers, st.right], [40, 30]);
});

test('questions always have their answer among the choices', () => {
  for (const level of [1, 2, 3]) {
    for (let i = 0; i < 200; i++) {
      const r = readingQuestion(level);
      assert.ok(r.choices.includes(r.answer));
      const e = earQuestion(level);
      assert.ok(e.choices.includes(e.answer));
    }
  }
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
  const even = 1 / pool.length;
  // Even share is 1/5 of the pool; with the weak spot weighted 4x on half the picks: 0.5/5 + 0.5*4/8 = 0.35
  assert.ok(f / N > even * 1.5 && f / N < 0.4, `share ${f / N}`);
});

test('a slow right answer counts as half a struggle', () => {
  assert.equal(isSlow(5000, [1000, 1100, 900, 1200, 1000]), true);
  assert.equal(isSlow(1500, [1000, 1100, 900, 1200, 1000]), false);
  assert.equal(isSlow(9000, [1000]), false); // not enough answers yet to know what is usual
  assert.equal(struggle([1, 0.5, 0]), 0.5);
});

test('history keeps the last five answers per question', () => {
  let s = {};
  for (let i = 0; i < 8; i++) s = recordAnswer(s, 'int:7', i % 2);
  assert.equal(s['int:7'].length, 5);
});

test('level score weighs every question type equally', () => {
  // F asked 10 times (5 right), E asked twice (both right): raw 7/12, balanced (0.5 + 1) / 2
  const log = [...Array(5).fill({ k: 'F', s: 1 }), ...Array(5).fill({ k: 'F', s: 0 }), { k: 'E', s: 1 }, { k: 'E', s: 1 }];
  assert.equal(balancedShare(log), 0.75);
  assert.equal(balancedShare([1, 1, 0, 1]), 0.75); // old saved logs still work
});

test('readable names and progress notes', () => {
  assert.equal(keyName('treble:F5'), 'F, treble clef, top line');
  assert.equal(keyName('treble:E4'), 'E, treble clef, bottom line');
  assert.equal(keyName('treble:C4'), 'C, treble clef, below the staff');
  assert.equal(keyName('bass:F3'), 'F, bass clef, 4th line');
  assert.equal(keyName('int:7'), 'Fifth');
  const stats = { 'treble:F4': [0, 0, 1, 1], 'treble:B4': [0, 1, 0], 'treble:C4': [1, 1] };
  assert.deepEqual(progressNotes(stats, ['treble:F4', 'treble:B4', 'treble:C4']), { stronger: ['treble:F4'], tricky: ['treble:B4'] });
});
