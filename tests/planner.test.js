import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, buildSession, structureFor, allocate, applyRating, completeSession, applyLevel,
  lengthBounds, stats, weekStart, DAY, nextPiece,
} from '../js/planner.js';
import { TRACK_ITEMS, ITEM_BY_ID } from '../js/content.js';

const mk = (minutes, perWeek, genres = ['blues', 'pop']) => {
  const s = newState(0);
  s.settings.minutes = minutes;
  s.settings.perWeek = perWeek;
  s.profile.genres = genres;
  return s;
};
const total = (plan) => plan.slots.reduce((a, s) => a + s.minutes, 0);
const ids = (plan) => plan.slots.map((s) => s.item.id);
const finish = (s, plan, now = 0) => completeSession(s, { done: plan.slots, minutes: plan.minutes }, now);

test('structure depends on the target length', () => {
  assert.deepEqual(structureFor(5), ['single']);
  assert.deepEqual(structureFor(10), ['warmup', 'focus']);
  assert.deepEqual(structureFor(15), ['warmup', 'focus', 'focus']);
  assert.deepEqual(structureFor(20), ['warmup', 'focus', 'focus', 'review']);
  assert.equal(structureFor(60).length, 7);
});

test('a five minute session is a single exercise', () => {
  const plan = buildSession(mk(5, 7), 5);
  assert.equal(plan.slots.length, 1);
  assert.equal(plan.slots[0].minutes, 5);
});

test('minutes always add up to the chosen length', () => {
  for (const target of [5, 10, 15, 20, 30, 45, 60]) {
    const s = mk(target, 5);
    const { min, max } = lengthBounds(target);
    for (let m = min; m <= max; m++) {
      const plan = buildSession(s, m);
      assert.equal(total(plan), m, `target ${target}, session ${m}`);
      for (const slot of plan.slots) assert.ok(slot.minutes >= 1, `target ${target}, session ${m}`);
    }
  }
});

test('a longer session stretches exercises instead of adding more', () => {
  const s = mk(10, 5);
  const a = buildSession(s, 10);
  const b = buildSession(s, 20);
  assert.deepEqual(ids(a), ids(b));
  assert.ok(b.slots[1].minutes > a.slots[1].minutes);
});

test('a shorter session keeps the exercises when they still fit', () => {
  const s = mk(15, 5);
  assert.deepEqual(ids(buildSession(s, 15)), ids(buildSession(s, 12)));
});

test('a much shorter session drops exercises from the end', () => {
  const s = mk(20, 5);
  assert.ok(buildSession(s, 10).slots.length <= buildSession(s, 20).slots.length);
  assert.equal(allocate([{ role: 'warmup' }, { role: 'focus' }, { role: 'focus' }], 3).length, 2);
});

test('rotation: with 3+ sessions a week the genre changes between sessions', () => {
  const s = mk(10, 5);
  applyLevel(s, 2);
  for (const it of TRACK_ITEMS.foundations) s.items[it.id] = { st: 'skipped', solid: 0, reps: 0 };
  const first = buildSession(s, 10);
  finish(s, first);
  const second = buildSession(s, 10);
  assert.notEqual(first.slots[1].item.track, second.slots[1].item.track);
});

test('no rotation: with 1-2 sessions a week the same exercises repeat until mastered', () => {
  const s = mk(10, 1);
  for (const it of TRACK_ITEMS.foundations) s.items[it.id] = { st: 'skipped', solid: 0, reps: 0 };
  const first = buildSession(s, 10);
  finish(s, first);
  const second = buildSession(s, 10);
  assert.deepEqual(ids(first), ids(second));
});

test('skipping or adding sessions never loses anything: the queue only moves when you play', () => {
  const s = mk(10, 5);
  const a = buildSession(s, 10, 0);
  const b = buildSession(s, 10, 30 * DAY);
  assert.deepEqual(ids(a), ids(b));
});

test('two solid ratings at tempo master an exercise and schedule a review', () => {
  const s = mk(10, 5);
  const id = 'tq-five-r';
  const bpm = ITEM_BY_ID[id].bpm;
  assert.equal(applyRating(s, id, 'solid', bpm, 0).becameMastered, false);
  assert.equal(applyRating(s, id, 'solid', bpm, 0).becameMastered, true);
  assert.equal(s.items[id].due, 3 * DAY);
  assert.notEqual(buildSession(s, 10).slots[0].item.id, id);
});

test('solid below tempo raises the tempo instead of counting towards mastery', () => {
  const s = mk(10, 5);
  const r = applyRating(s, 'tq-five-r', 'solid', 50, 0);
  assert.equal(s.items['tq-five-r'].solid, 0);
  assert.ok(r.nextTempo > 50);
});

test('hard lowers the tempo and a failed review goes back to learning', () => {
  const s = mk(10, 5);
  const id = 'tq-five-r';
  assert.ok(applyRating(s, id, 'hard', 80, 0).nextTempo < 80);
  s.items[id] = { st: 'mastered', solid: 2, reps: 2, ivl: 3, due: 0 };
  applyRating(s, id, 'hard', 80, 0);
  assert.equal(s.items[id].st, 'learning');
});

test('a due review appears in a full session', () => {
  const s = mk(20, 5);
  s.items['tq-five-r'] = { st: 'mastered', solid: 2, reps: 2, ivl: 3, due: 0, last: 0 };
  const plan = buildSession(s, 20, DAY);
  const review = plan.slots.find((x) => x.role === 'review');
  assert.equal(review.item.id, 'tq-five-r');
});

test('level 2 skips beginner material', () => {
  const s = mk(10, 5);
  applyLevel(s, 2);
  const plan = buildSession(s, 10);
  for (const slot of plan.slots) assert.ok(slot.item.lv >= 2, slot.item.id);
});

test('plans never repeat an exercise and always have something to play', () => {
  const s = mk(60, 7, ['jazz']);
  for (let i = 0; i < 80; i++) {
    const plan = buildSession(s, 60, i * DAY);
    assert.ok(plan.slots.length >= 1);
    assert.equal(new Set(ids(plan)).size, plan.slots.length);
    for (const slot of plan.slots) {
      applyRating(s, slot.item.id, 'solid', slot.item.bpm, i * DAY);
    }
    finish(s, plan, i * DAY);
  }
  assert.ok(nextPiece(s));
});

test('weekly stats', () => {
  const s = mk(10, 2);
  const now = new Date(2026, 10, 11, 12).getTime(); // a Wednesday
  s.history.push({ d: now - DAY, min: 10, n: 2 }, { d: now, min: 12, n: 2 }, { d: now - 8 * DAY, min: 5, n: 1 });
  const st = stats(s, now);
  assert.equal(st.weekSessions, 2);
  assert.equal(st.weekMinutes, 22);
  assert.equal(st.weeksOnTarget, 1);
  assert.equal(st.totalMinutes, 27);
  assert.equal(new Date(weekStart(now)).getDay(), 1);
});
