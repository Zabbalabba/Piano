import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, buildSession, structureFor, allocate, applyRating, completeSession, applyLevel,
  lengthBounds, stats, weekStart, DAY, nextPiece, startTempo, FAST_FACTOR,
  knowsExercise, suggestLevelUp, speedCheckStep, setAside, easierThan, targetOf, maxTarget,
  stageTempos, stageOf, stageGoal, migrateProgress, trackProgress,
  remaining, versionsShown,
} from '../js/planner.js';
import { TRACK_ITEMS, ITEM_BY_ID, KEY_VERSIONS } from '../js/content.js';

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
  s.history.push({ d: now + 60000, min: 3, n: 1 }); // a second session the same day
  s.history.push({ d: now - 2 * DAY, min: 4, n: 0, extras: ['ear'], core: false }); // quiz only
  const st = stats(s, now);
  assert.equal(st.weekSessions, 3);
  assert.equal(st.weekDays, 2);
  assert.equal(st.weekMinutes, 29);
  assert.equal(st.weeksOnTarget, 1);
  assert.equal(st.totalMinutes, 34);
  assert.equal(new Date(weekStart(now)).getDay(), 1);
});


test('fast but not solid does not master', () => {
  const s = mk(10, 5);
  const item = ITEM_BY_ID['tq-five-r'];
  assert.equal(applyRating(s, item.id, 'ok', item.bpm * 1.3, 0).becameMastered, false);
});

test('a run of solid ratings at full tempo starts new exercises at full tempo', () => {
  const s = mk(10, 5);
  const fresh = ITEM_BY_ID['fd-lh'];
  assert.equal(startTempo(s, fresh), Math.round(fresh.bpm * 0.7));
  for (const id of ['tq-five-r', 'tq-five-l', 'fd-rh']) applyRating(s, id, 'solid', ITEM_BY_ID[id].bpm, 0);
  assert.equal(startTempo(s, fresh), fresh.bpm);
  applyRating(s, 'tq-five-ht', 'hard', 60, 0);
  assert.equal(startTempo(s, fresh), Math.round(fresh.bpm * 0.7));
});


test('a demo is shown until the exercise has been played near its target tempo', () => {
  const s = mk(10, 5);
  const item = ITEM_BY_ID['tq-five-r'];
  assert.equal(knowsExercise(s, item), false);
  applyRating(s, item.id, 'ok', Math.round(item.bpm * 0.7), 0);
  assert.equal(knowsExercise(s, item), false);
  applyRating(s, item.id, 'hard', item.bpm, 0);
  assert.equal(knowsExercise(s, item), false);
  applyRating(s, item.id, 'ok', item.bpm, 0);
  assert.equal(knowsExercise(s, item), true);
});


test('speed check: steps down after a miss and places you at the highest level cleared', () => {
  // The case from a real backup: passages said level 3, the level 3 exercise reached only 54%.
  assert.deepEqual(speedCheckStep({ 2: 0.54 }, 2, 3), { next: 1 });
  assert.deepEqual(speedCheckStep({ 2: 0.54, 1: 1.1 }, 1, 3), { level: 2, speed: 1.1 });
  assert.deepEqual(speedCheckStep({ 2: 0.54, 1: 0.6 }, 1, 3), { next: 0 });
  assert.deepEqual(speedCheckStep({ 2: 0.54, 1: 0.6, 0: 0.95 }, 0, 3), { level: 1, speed: 0.95 });
  assert.deepEqual(speedCheckStep({ 2: 0.54, 1: 0.6, 0: 0.5 }, 0, 3), { level: 1, speed: 0.5 });
});

test('speed check: steps up after a clear, never retesting', () => {
  assert.deepEqual(speedCheckStep({ 0: 1.3 }, 0, 3), { next: 1 });
  assert.deepEqual(speedCheckStep({ 0: 1.3, 1: 0.92 }, 1, 3), { next: 2 });
  assert.deepEqual(speedCheckStep({ 0: 1.3, 1: 0.92, 2: 1.2 }, 2, 3), { level: 3, speed: 1.2 });
  assert.deepEqual(speedCheckStep({ 0: 1.3, 1: 0.7 }, 1, 3), { level: 1, speed: 1.3 });
  assert.deepEqual(speedCheckStep({ 1: 0.95, 2: 0.5 }, 2, 3), { level: 2, speed: 0.95 });
});

test('redoing the check at a lower level brings skipped exercises back', () => {
  const s = mk(10, 4);
  applyLevel(s, 3);
  assert.equal(s.items['tq-g-ht'].st, 'skipped');
  applyLevel(s, 2);
  assert.equal(s.items['tq-g-ht'], undefined);
  assert.equal(s.items['tq-five-r'].st, 'skipped');
});

test('too hard for now: D major makes way for G major, which comes back even if it was below your level', () => {
  const s = mk(10, 4);
  applyLevel(s, 3);
  assert.equal(buildSession(s, 10).slots[0].item.id, 'tq-d-ht');
  const easier = setAside(s, 'tq-d-ht');
  assert.equal(easier.id, 'tq-g-ht');
  assert.equal(buildSession(s, 10).slots[0].item.id, 'tq-g-ht');
  assert.equal(s.items['tq-d-ht'].bpm, Math.round(ITEM_BY_ID['tq-d-ht'].bpm * 0.6));
  // After a couple of sessions it is back in line, once G major is secure (Solid on two days).
  applyRating(s, 'tq-g-ht', 'solid', 200, 0);
  applyRating(s, 'tq-g-ht', 'solid', 200, DAY);
  completeSession(s, { done: [{ role: 'warmup', item: ITEM_BY_ID['tq-g-ht'] }], minutes: 10 });
  completeSession(s, { done: [{ role: 'warmup', item: ITEM_BY_ID['tq-g-ht'] }], minutes: 10 });
  assert.equal(buildSession(s, 10).slots[0].item.id, 'tq-d-ht');
});

test('two Hard ratings in a row are flagged; the first step of a track has nothing easier', () => {
  const s = mk(10, 4);
  assert.equal(applyRating(s, 'fd-bass', 'hard', 60, 0).hardTwice, false);
  assert.equal(applyRating(s, 'fd-bass', 'hard', 54, 0).hardTwice, true);
  assert.equal(applyRating(s, 'fd-bass', 'ok', 54, 0).hardTwice, false);
  assert.equal(easierThan(ITEM_BY_ID['fd-rh']), null);
  assert.equal(easierThan(ITEM_BY_ID['fd-bass']).id, 'fd-turns');
  assert.equal(easierThan(ITEM_BY_ID['pc-elise']).id, 'pc-minuet');
  assert.equal(easierThan(ITEM_BY_ID['pc-ode']).id, 'cl-melody-alberti');
});



test('a mastered exercise comes back in new keys, after new exercises and a couple of sessions', () => {
  const s = mk(10, 4, ['blues']);
  const form = ITEM_BY_ID['bl-form'];
  applyRating(s, form.id, 'solid', form.bpm * 1.3, 0);
  applyRating(s, form.id, 'solid', form.bpm * 1.3, DAY); // secure: two days
  const ids = (l) => l.map((x) => x.id);
  assert.ok(!ids(remaining(s, 'blues')).includes('bl-form~1')); // waits two sessions
  s.sessions += 2;
  const left = ids(remaining(s, 'blues'));
  assert.equal(left[left.length - 1], 'bl-form~1'); // new exercises come first
  assert.equal(ITEM_BY_ID['bl-form~1'].keyName, 'F');
  assert.equal(versionsShown(s, 'bl-form').length, 1);
  // starts at 85% of your tempo on the original, and its easier step is the original
  assert.equal(startTempo(s, ITEM_BY_ID['bl-form~1']), Math.round(form.bpm * 1.3 * 0.85));
  assert.equal(easierThan(ITEM_BY_ID['bl-form~1']).id, 'bl-form');
  // the next key opens only once this one is mastered
  assert.ok(!ids(remaining(s, 'blues')).includes('bl-form~2'));
  applyRating(s, 'bl-form~1', 'solid', 500, 0);
  applyRating(s, 'bl-form~1', 'solid', 500, DAY);
  s.sessions += 2;
  assert.ok(ids(remaining(s, 'blues')).includes('bl-form~2'));
});

test('exercises below your level do not open new keys; scales and pieces have none', () => {
  const s = mk(10, 4, ['blues']);
  applyLevel(s, 3);
  assert.equal(versionsShown(s, 'bl-form').length, 0);
  assert.equal(KEY_VERSIONS['tq-g-ht'], undefined);
  assert.equal(KEY_VERSIONS['pc-ode'], undefined);
});

test('secure takes Solid at the target on two different days', () => {
  const s = mk(10, 5);
  const item = ITEM_BY_ID['tq-five-r'];
  assert.equal(applyRating(s, item.id, 'solid', item.bpm, 0).becameMastered, false);
  assert.equal(applyRating(s, item.id, 'solid', item.bpm, 3600000).becameMastered, false); // same day
  const r = applyRating(s, item.id, 'solid', item.bpm, DAY);
  assert.equal(r.becameMastered, true);
  assert.equal(r.stageUp, 1);
  assert.equal(s.items[item.id].due, DAY + 3 * DAY);
});

test('playing well above the target counts towards later stages, but each still needs two days', () => {
  const s = mk(10, 5);
  const g = ITEM_BY_ID['tq-g-ht'];
  const [t1, t2, t3] = stageTempos(g);
  assert.deepEqual([t1, t2, t3], [76, 95, 170]);
  applyRating(s, g.id, 'solid', 128, 0);
  assert.equal(stageOf(s, g), 0);
  const r = applyRating(s, g.id, 'solid', 128, DAY);
  assert.equal(r.stageUp, 2); // secure and fluent at once: 128 is above 95
  assert.equal(targetOf(s, g), 170);
  applyRating(s, g.id, 'solid', 175, 2 * DAY);
  applyRating(s, g.id, 'solid', 175, 3 * DAY);
  assert.equal(stageOf(s, g), 3);
});

test('a Hard rating restarts the days for the stage you are working on', () => {
  const s = mk(10, 5);
  const item = ITEM_BY_ID['tq-five-r'];
  applyRating(s, item.id, 'solid', item.bpm, 0);
  applyRating(s, item.id, 'hard', item.bpm, DAY);
  assert.equal(applyRating(s, item.id, 'solid', item.bpm, 2 * DAY).becameMastered, false);
});

test('feel exercises: each stage is its own goal, and they keep coming back to refine', () => {
  const s = mk(10, 5);
  const b = ITEM_BY_ID['lt-bossa'];
  assert.deepEqual(stageTempos(b), [b.bpm, b.bpm, b.bpm]);
  for (let d = 0; d < 6; d++) applyRating(s, b.id, 'solid', b.bpm, d * DAY); // one stage per two days
  assert.equal(stageOf(s, b), 3);
  assert.ok(stageGoal(s, b).startsWith('Keep refining'));
  for (let d = 6; d < 16; d++) applyRating(s, b.id, 'solid', b.bpm, d * DAY);
  assert.ok(s.items[b.id].ivl <= 14);
});

test('speed exercises in genres reach their playing tempo; scales reach about 170 notes a minute', () => {
  assert.deepEqual(stageTempos(ITEM_BY_ID['jz-walk']), [100, 125, 160]);
  assert.equal(stageTempos(ITEM_BY_ID['tq-c-ht'])[2], 170);
  assert.equal(maxTarget(ITEM_BY_ID['tq-c-eighths']), 85);
});

test('the skill check speed raises starting tempos', () => {
  const s = mk(10, 5);
  const fresh = ITEM_BY_ID['fd-lh'];
  s.speed = 1.6;
  assert.equal(startTempo(s, fresh), Math.round(fresh.bpm * 1.36));
});

test('three exercises secured well above tempo suggest moving up a level', () => {
  const s = mk(10, 5);
  for (const id of ['tq-five-r', 'tq-five-l', 'fd-rh']) {
    applyRating(s, id, 'solid', ITEM_BY_ID[id].bpm * 1.3, 0);
    applyRating(s, id, 'solid', ITEM_BY_ID[id].bpm * 1.3, DAY);
  }
  assert.equal(suggestLevelUp(s), true);
  applyRating(s, 'fd-lh', 'hard', 50, 0);
  assert.equal(suggestLevelUp(s), false);
});

test('levels skip technique and foundations only, never genre exercises', () => {
  const s = mk(10, 5, ['jazz']);
  applyLevel(s, 3);
  assert.equal(s.items['tq-five-r'].st, 'skipped');
  assert.equal(s.items['jz-swing'], undefined);
  assert.deepEqual(trackProgress(s, 'jazz'), { done: 0, mastered: 0, known: 0, total: 5 });
});

test('older progress: fast one-go masteries go back to learning with one day counted', () => {
  const s = mk(10, 5, ['jazz']);
  s.items['tq-g-ht'] = { st: 'mastered', solid: 1, reps: 3, last: 1000, bpm: 128, top: 128, target: 134, ivl: 7, due: 0 };
  s.items['jz-walk'] = { st: 'mastered', solid: 2, reps: 2, last: 0, bpm: 145, top: 145, ivl: 7, due: 0 };
  s.items['jz-swing'] = { st: 'skipped', solid: 0, reps: 0 };
  s.items['tq-c-r'] = { st: 'skipped', solid: 0, reps: 0 };
  migrateProgress(s);
  assert.equal(s.items['tq-g-ht'].st, 'learning');
  assert.equal(s.items['tq-g-ht'].target, undefined);
  assert.equal(s.items['jz-walk'].stage, 1);
  assert.equal(s.items['jz-swing'], undefined);
  assert.equal(s.items['tq-c-r'].st, 'skipped');
  // one more Solid on another day: secure, and fluent too at 128
  assert.equal(applyRating(s, 'tq-g-ht', 'solid', 128, DAY).stageUp, 2);
});

test('a warm-up played Solid at 150% of its target makes way for the next, and comes back to be confirmed', () => {
  const s = mk(10, 4);
  applyLevel(s, 2);
  const first = buildSession(s, 10, 0).slots[0].item;
  assert.equal(first.id, 'tq-c-ht');
  applyRating(s, first.id, 'solid', first.bpm * 2.6, 0);
  completeSession(s, { done: [{ role: 'warmup', item: first }], minutes: 10 }, 0);
  const next = buildSession(s, 10, DAY).slots[0].item;
  assert.notEqual(next.id, first.id); // moved on the next day
  const later = buildSession(s, 10, 2 * DAY + 1).slots[0].item;
  assert.equal(later.id, first.id); // back after two days
  assert.equal(applyRating(s, first.id, 'solid', first.bpm * 2.6, 2 * DAY + 1).becameMastered, true);
  assert.equal(s.items[first.id].confirmDue, undefined);
});

test('a warm-up at an ordinary tempo stays the warm-up until it is secure', () => {
  const s = mk(10, 4);
  applyLevel(s, 2);
  const first = buildSession(s, 10, 0).slots[0].item;
  applyRating(s, first.id, 'solid', first.bpm, 0);
  assert.equal(buildSession(s, 10, DAY).slots[0].item.id, first.id);
});
