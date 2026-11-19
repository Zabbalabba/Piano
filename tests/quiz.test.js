import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustLevel, levelStatus, readingQuestion, earQuestion } from '../js/quiz.js';

const log = (right, wrong) => [...Array(right).fill(1), ...Array(wrong).fill(0)];

test('no change before 20 answers, however they went', () => {
  assert.equal(adjustLevel(1, log(19, 0)), 1);
  assert.equal(adjustLevel(2, log(0, 19)), 2);
});

test('after 20, only an unmistakable result moves the level early', () => {
  assert.equal(adjustLevel(1, log(19, 1)), 2); // 95%
  assert.equal(adjustLevel(1, log(18, 2)), 1); // 90%: wait for 40
  assert.equal(adjustLevel(2, log(10, 10)), 1); // 50%
  assert.equal(adjustLevel(2, log(11, 9)), 2);
});

test('over 40 answers: 90% moves up, under 60% moves down', () => {
  assert.equal(adjustLevel(1, log(36, 4)), 2);
  assert.equal(adjustLevel(1, log(35, 5)), 1);
  assert.equal(adjustLevel(2, log(23, 17)), 1);
  assert.equal(adjustLevel(2, log(24, 16)), 2);
  assert.equal(adjustLevel(3, log(40, 0)), 3);
  assert.equal(adjustLevel(1, log(0, 40)), 1);
});

test('only the most recent 40 answers count', () => {
  assert.equal(adjustLevel(1, [...log(0, 30), ...log(37, 3)]), 2);
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
