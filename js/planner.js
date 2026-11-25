// Session planning and progress rules. Pure functions over the saved state, no DOM.

import { TRACK_ITEMS, PIECE_ITEMS, ITEM_BY_ID, GENRES, PREP, KEY_VERSIONS } from './content.js';
import { parseExercise, pulseOf, barBeatsOf } from './music.js';

export const DAY = 86400000;

// How a slot of each role shares the session time, and the least it is worth doing.
const ROLE = {
  warmup: { weight: 0.8, min: 1 },
  focus: { weight: 1.2, min: 2 },
  review: { weight: 0.7, min: 1.5 },
};

// From this many practice days a week, focus exercises rotate between genres.
// Below it, the same set repeats until it is mastered.
export const ROTATE_FROM = 3;
// From this target length a session has the full warm-up / skills / review structure.
export const FULL_STRUCTURE_FROM = 20;
// Optional modules (ear training, note reading, pieces) are offered from this length.
export const MODULES_FROM = 15;

export function rotates(state) {
  return state.settings.perWeek >= ROTATE_FROM;
}

// The roles in a session depend only on the target length from Settings,
// never on the length picked for one session.
export function structureFor(target) {
  if (target < 8) return ['single'];
  if (target < 13) return ['warmup', 'focus'];
  if (target < FULL_STRUCTURE_FROM) return ['warmup', 'focus', 'focus'];
  const k = target < 25 ? 2 : target < 35 ? 3 : target < 50 ? 4 : 5;
  return ['warmup', ...Array(k).fill('focus'), 'review'];
}

export function lengthBounds(target) {
  return { min: Math.max(2, Math.round(target / 2)), max: target * 2 };
}

const prog = (state, id) => state.items[id] || { st: 'new', solid: 0, reps: 0 };
const isDone = (state, id) => ['mastered', 'skipped'].includes(prog(state, id).st);

// ---- new keys
// A version in a new key opens once the one before it (the original, or the previous key) is
// mastered, and waits a couple of sessions so it does not follow straight on from it.
export const KEY_WAIT_SESSIONS = 2;
const before = (v) => (v.version === 1 ? v.base : `${v.base}~${v.version - 1}`);

export function openVersions(state, track) {
  const out = [];
  for (const item of TRACK_ITEMS[track] || []) {
    for (const v of KEY_VERSIONS[item.id] || []) {
      const prev = state.items[before(v)];
      if (!prev || prev.st !== 'mastered') break;
      out.push({ v, since: prev.masteredAt || 0 });
    }
  }
  return out.sort((a, b) => a.since - b.since);
}

// Versions of one exercise to list in the library: those opened or already practised.
export function versionsShown(state, baseId) {
  return (KEY_VERSIONS[baseId] || []).filter((v) => state.items[v.id] || prog(state, before(v)).st === 'mastered');
}

// Exercises still to learn in a track, in order: new exercises first, then versions in new keys.
// One set aside as "too hard for now", or a key version that has just opened, waits a couple of
// sessions, unless nothing else is left.
export function remaining(state, track) {
  const originals = TRACK_ITEMS[track].filter((x) => !isDone(state, x.id));
  const versions = openVersions(state, track).filter(({ v }) => !isDone(state, v.id));
  const left = [...originals, ...versions.map(({ v }) => v)];
  const waiting = new Set(versions.filter(({ since }) => state.sessions < since + KEY_WAIT_SESSIONS).map(({ v }) => v.id));
  const ready = left.filter((x) => !(prog(state, x.id).later > state.sessions) && !waiting.has(x.id));
  return ready.length ? ready : left;
}

// How many sessions an exercise set aside as too hard waits before it comes back.
export const SET_ASIDE_SESSIONS = 2;

// The exercise to build up with first, or null when this is already the first step.
export function easierThan(item) {
  if (item.base) return ITEM_BY_ID[item.base];
  if (PREP[item.id]) return ITEM_BY_ID[PREP[item.id]];
  if (item.kind === 'piece') {
    const pieces = PIECE_ITEMS[item.track];
    const i = pieces.findIndex((x) => x.id === item.id);
    if (i > 0) return pieces[i - 1];
    const ex = TRACK_ITEMS[item.track];
    return ex[ex.length - 1];
  }
  const list = TRACK_ITEMS[item.track];
  const i = list.findIndex((x) => x.id === item.id);
  return i > 0 ? list[i - 1] : null;
}

// Set an exercise aside for now: it comes back after a couple of sessions at a gentler tempo, and
// the easier one is put back in the queue (even if it was below your level). Returns the easier one.
export function setAside(state, id) {
  const item = ITEM_BY_ID[id];
  const easier = easierThan(item);
  if (!easier) return null;
  const p = (state.items[id] = { ...prog(state, id) });
  if (p.st === 'skipped' || p.st === 'new') p.st = 'learning';
  p.later = state.sessions + SET_ASIDE_SESSIONS;
  p.bpm = Math.min(p.bpm || Infinity, Math.round(targetOf(state, item) * 0.6));
  p.hardRun = 0;
  const e = state.items[easier.id];
  if (e && e.st === 'skipped') delete state.items[easier.id];
  return easier;
}

// done: secure or further, known: marked as known from your level (not practised).
export function trackProgress(state, track) {
  const items = TRACK_ITEMS[track];
  const mastered = items.filter((x) => prog(state, x.id).st === 'mastered').length;
  const known = items.filter((x) => prog(state, x.id).st === 'skipped').length;
  return { done: mastered + known, mastered, known, total: items.length };
}

function dueReviews(state, now, exclude) {
  return Object.entries(state.items)
    .filter(([id, p]) => p.st === 'mastered' && p.due <= now && !exclude.has(id) && ITEM_BY_ID[id])
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => ITEM_BY_ID[id]);
}

function oldestMastered(state, exclude) {
  const list = Object.entries(state.items)
    .filter(([id, p]) => p.st === 'mastered' && !exclude.has(id) && ITEM_BY_ID[id])
    .sort((a, b) => (a[1].last || 0) - (b[1].last || 0));
  return list.length ? ITEM_BY_ID[list[0][0]] : null;
}

// A warm-up played Solid at 150% or more of its target on its first day makes way for the next
// one: it is clearly not new to you. It comes back as the warm-up a couple of days later, where
// Solid confirms it as Secure (the second day).
export const FAST_MOVE_ON = 1.5;
const CONFIRM_AFTER_DAYS = 2;

function pickWarmup(state, now = Date.now()) {
  const waiting = (it) => { const p = state.items[it.id]; return p && p.confirmDue && (p.stage || 0) === 0; };
  const due = TRACK_ITEMS.technique.filter((it) => waiting(it) && state.items[it.id].confirmDue <= now)
    .sort((a, b) => state.items[a.id].confirmDue - state.items[b.id].confirmDue);
  if (due.length) return due[0];
  const left = remaining(state, 'technique').filter((it) => !waiting(it));
  if (left.length) return left[0];
  const pending = remaining(state, 'technique');
  if (pending.length) return pending[0];
  const all = TRACK_ITEMS.technique;
  return all[state.sessions % all.length];
}

// Focus exercises for this session. Foundations come first while unfinished;
// the other slots go to the chosen genres, starting at the rotation pointer.
function pickFocus(state, count, used) {
  const out = [];
  const take = (item) => {
    if (item && !used.has(item.id) && out.length < count) {
      used.add(item.id);
      out.push(item);
    }
  };
  const genres = state.profile.genres.filter((g) => remaining(state, g).length);
  const found = remaining(state, 'foundations');
  if (found.length) {
    const genreTurn = count === 1 && rotates(state) && genres.length && state.sessions % 2 === 1;
    if (!genreTurn) take(found[0]);
  }
  for (let depth = 0; depth < 5 && out.length < count && genres.length; depth++) {
    for (let i = 0; i < genres.length && out.length < count; i++) {
      take(remaining(state, genres[(state.rot + i) % genres.length])[depth]);
    }
  }
  if (out.length < count && found.length > 1) take(found[1]);
  // Everything in the tracks is mastered: move on to pieces.
  for (const p of unmasteredPieces(state)) take(p);
  return out;
}

function unmasteredPieces(state) {
  return state.profile.genres
    .flatMap((g) => PIECE_ITEMS[g])
    .filter((p) => !isDone(state, p.id))
    .sort((a, b) => a.lv - b.lv);
}

export function nextPiece(state) {
  const list = unmasteredPieces(state);
  if (!list.length) {
    const all = state.profile.genres.flatMap((g) => PIECE_ITEMS[g]);
    return all.length ? all[state.sessions % all.length] : null;
  }
  const easiest = list.filter((p) => p.lv === list[0].lv);
  return easiest[state.sessions % easiest.length];
}

export function buildSession(state, minutes, now = Date.now()) {
  const roles = structureFor(state.settings.minutes);
  const used = new Set();
  let slots = [];
  const add = (role, item) => {
    if (item) {
      used.add(item.id);
      slots.push({ role, item });
    }
  };

  if (roles[0] === 'single') {
    const turn = state.sessions % 3;
    const due = dueReviews(state, now, used);
    if (turn === 2 && due.length) add('review', due[0]);
    else if (turn === 1) add('warmup', pickWarmup(state, now));
    else pickFocus(state, 1, used).forEach((it) => slots.push({ role: 'focus', item: it }));
    if (!slots.length) add('warmup', pickWarmup(state, now));
  } else {
    add('warmup', pickWarmup(state, now));
    let focusCount = roles.filter((r) => r === 'focus').length;
    let review = null;
    const due = dueReviews(state, now, used);
    if (roles.includes('review')) {
      review = due[0] || oldestMastered(state, used);
    } else if (due.length && (focusCount > 1 || state.sessions % 2 === 1)) {
      review = due[0];
      focusCount -= 1;
    }
    if (review) used.add(review.id);
    pickFocus(state, focusCount, used).forEach((it) => slots.push({ role: 'focus', item: it }));
    if (review) slots.push({ role: 'review', item: review });
  }

  slots = allocate(slots, minutes);
  return { slots, minutes, target: state.settings.minutes };
}

// Split the session length over the slots. A short session drops slots from the end
// rather than squeezing an exercise below a useful length.
export function allocate(slots, minutes) {
  let list = slots.map((s) => ({ ...s }));
  const minOf = (s) => ROLE[s.role].min;
  const dropOrder = (l) => {
    const i = l.findIndex((s) => s.role === 'review');
    return i >= 0 ? i : l.length - 1;
  };
  while (list.length > 1 && list.reduce((a, s) => a + minOf(s), 0) > minutes) list.splice(dropOrder(list), 1);

  const units = Math.max(list.length, Math.round(minutes * 2)); // half minutes
  let free = list.map((_, i) => i);
  const share = list.map(() => 0);
  let left = units;
  for (let pass = 0; pass < list.length + 1; pass++) {
    const w = free.reduce((a, i) => a + ROLE[list[i].role].weight, 0);
    const low = free.filter((i) => (left * ROLE[list[i].role].weight) / w < minOf(list[i]) * 2);
    if (!low.length || low.length === free.length) {
      for (const i of free) share[i] = (left * ROLE[list[i].role].weight) / w;
      break;
    }
    for (const i of low) {
      share[i] = minOf(list[i]) * 2;
      left -= share[i];
    }
    free = free.filter((i) => !low.includes(i));
  }
  // Largest-remainder rounding so the parts add up to the chosen length.
  const floor = share.map(Math.floor);
  let rest = units - floor.reduce((a, b) => a + b, 0);
  const order = share.map((s, i) => [s - Math.floor(s), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floor[i] += 1;
    rest -= 1;
  }
  list.forEach((s, i) => (s.minutes = floor[i] / 2));
  return list;
}

// Securing an exercise this far above its target counts as a fast one, towards a level-up offer.
export const FAST_FACTOR = 1.15;
// After this many solid ratings in a row at full tempo, new exercises start at full tempo too.
const PACE_RUN = 3;

// After this many exercises in a row mastered well above tempo, the app suggests moving up a level.
export const LEVEL_UP_RUN = 3;

// ---- speed part of the skill check
// One exercise per level. Reaching this share of its target tempo clears that level.
export const SPEED_CLEAR = 0.9;

// Decides the next step of the speed check from the results so far ({ index: reached / target }).
// It moves up a level after a clear and down a level after a miss, never testing anything twice.
// Returns { next } for the exercise to test next, or { level, speed } when done: the playing level
// is the highest level cleared (1 if none), and speed is the result on that exercise.
export function speedCheckStep(results, current, count) {
  const cleared = results[current] >= SPEED_CLEAR;
  const next = cleared ? current + 1 : current - 1;
  if (next >= 0 && next < count && results[next] === undefined) return { next };
  const tested = Object.keys(results).map(Number);
  const passed = tested.filter((i) => results[i] >= SPEED_CLEAR);
  const best = passed.length ? Math.max(...passed) : -1;
  const speed = best >= 0 ? results[best] : results[Math.min(...tested)];
  return { level: best + 1 || 1, speed };
}

// ---- stages of mastery
//
// Every exercise has three stages, each reached with Solid ratings on two different days:
//   1 Secure       Solid at the target tempo. This is what "mastered" means.
//   2 Fluent       speed exercises: Solid at about 25% above the target;
//                  feel exercises: relaxed and steady through several repeats, eyes mostly off the screen.
//   3 In the style speed exercises: Solid at the tempo the music is usually played (technique: about
//                  170 notes a minute); feel exercises: Solid against a goal written for the exercise.
// Exercises with a written goal (item.goal) are feel exercises; all others are speed exercises.
// A Solid rating on a speed exercise counts towards every stage whose tempo it reaches, so playing
// well above the target moves you on faster, but each stage still needs two different days.
export const STAGES = ['Learning', 'Secure', 'Fluent', 'In the style'];
const NOTES_PER_MINUTE_CAP = 170;
const DAYS_PER_STAGE = 2;
const TEMPO_SLACK = 0.97; // a beat or two under the stage tempo still counts
export const isFeel = (item) => !!item.goal;

// Notes per beat in the busiest hand, e.g. 1 for a quarter-note scale, 2 for eighth notes.
function density(item) {
  const p = parseExercise(item);
  const perHand = (hand) => new Set(p.events.filter((e) => e.hand === hand).map((e) => e.t)).size;
  return Math.max(perHand('R'), perHand('L')) / p.totalBeats;
}

// Fastest sensible target for technique: about 170 notes a minute (or 2.4 times the starting
// target, for slow chord exercises).
export function maxTarget(item) {
  return Math.round(Math.min(item.bpm * 2.4, NOTES_PER_MINUTE_CAP / Math.max(0.25, density(item))));
}

// The tempo for stages 1, 2 and 3.
export function stageTempos(item) {
  if (isFeel(item)) return [item.bpm, item.bpm, item.bpm];
  const top = Math.max(Math.round(item.bpm * 1.3), item.perf || (item.track === 'technique' ? maxTarget(item) : Math.round(item.bpm * 1.4)));
  const mid = Math.min(Math.round(item.bpm * 1.25), top);
  return [item.bpm, mid, top];
}

export const stageOf = (state, item) => (state.items[item.id] && state.items[item.id].stage) || 0;

// The tempo you are working towards now: the next stage's tempo (the last one once all are done).
export function targetOf(state, item) {
  return stageTempos(item)[Math.min(stageOf(state, item), 2)];
}

// Days with a Solid rating counted towards the stage you are working on.
export function stageDays(state, item) {
  const p = state.items[item.id];
  const s = Math.min(stageOf(state, item) + 1, 3);
  return (p && p.days && p.days[s] ? p.days[s].length : 0);
}

// What to aim for now, in words.
export function stageGoal(state, item) {
  const s = stageOf(state, item);
  const [t1, t2, t3] = stageTempos(item);
  const days = stageDays(state, item);
  const twice = s < 3 ? ` Solid on two different days${days ? ` (${days} of 2 done)` : ''}.` : '';
  if (s === 0) return `Secure: play it Solid at ${t1} bpm.${twice}`;
  if (isFeel(item)) {
    if (s === 1) return `Fluent: relaxed and steady through several repeats, with your eyes mostly off the screen.${twice}`;
    if (s === 2) return `In the style: ${item.goal}${twice}`;
    return `Keep refining: ${item.goal}`;
  }
  if (s === 1) return `Fluent: Solid at ${t2} bpm.${twice}`;
  const usual = item.track === 'technique' ? 'a fluent scale tempo' : 'a tempo it is often played at';
  if (s === 2) return `Full tempo: Solid at ${t3} bpm, ${usual}.${twice}`;
  return `All three stages done. Keep it fresh at ${t3} bpm.`;
}

// Tempo a new exercise starts at: 70% of the target, or more once you have shown you are faster
// (in the skill check, or with a run of solid ratings at full tempo). There is no upper limit.
export function startTempo(state, item) {
  const p = state.items[item.id];
  if (p && p.bpm) return p.bpm;
  // A new key of a pattern you know: start a little below your tempo on the original.
  const base = item.base && state.items[item.base];
  if (base && base.bpm) return Math.round(base.bpm * 0.85);
  let factor = (state.pace || 0) >= PACE_RUN ? 1 : 0.7;
  if (state.speed) factor = Math.max(factor, Math.min(1.5, state.speed * 0.85));
  return Math.round(item.bpm * factor);
}

// Whether you have played this exercise at (nearly) its target tempo yet. If not, it opens with a demo.
export function knowsExercise(state, item) {
  const p = state.items[item.id];
  return !!p && ((p.stage || 0) >= 1 || (p.top || 0) >= item.bpm * 0.9);
}

export const suggestLevelUp = (state) => (state.fastRun || 0) >= LEVEL_UP_RUN && state.profile.level.play < 3;

const dayOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// rating: 'hard' | 'ok' | 'solid'
export function applyRating(state, id, rating, tempo, now = Date.now()) {
  const item = ITEM_BY_ID[id];
  const p = (state.items[id] = { ...prog(state, id) });
  p.days = { ...(p.days || {}) };
  const before = p.stage || 0;
  const tempos = stageTempos(item);
  const target = tempos[Math.min(before, 2)];
  p.reps += 1;
  p.last = now;
  if (rating !== 'hard') p.top = Math.max(p.top || 0, tempo);
  p.hardRun = rating === 'hard' ? (p.hardRun || 0) + 1 : 0;
  const atTempo = tempo >= target * TEMPO_SLACK;
  const today = dayOf(now);
  const addDay = (s) => {
    const list = p.days[s] || [];
    if (!list.includes(today)) p.days[s] = [...list, today];
  };

  if (rating === 'solid') {
    if (isFeel(item)) {
      if (before < 3 && tempo >= item.bpm * 0.9) addDay(before + 1);
    } else {
      for (let s = before + 1; s <= 3; s++) if (tempo >= tempos[s - 1] * TEMPO_SLACK) addDay(s);
    }
    let s = before;
    while (s < 3 && (p.days[s + 1] || []).length >= DAYS_PER_STAGE) s += 1;
    p.stage = s;
  } else if (rating === 'hard') {
    // A hard day: the days counted towards the stage you are working on start again.
    if (before < 3) p.days[before + 1] = [];
  }
  const stage = p.stage || 0;
  const becameMastered = before === 0 && stage >= 1;

  // Tempo to start at next time.
  if (rating === 'hard') p.bpm = Math.max(Math.round(item.bpm * 0.5), Math.round(tempo * 0.9));
  else if (rating === 'solid' && !atTempo) p.bpm = Math.min(target, Math.round(tempo * 1.12));
  else p.bpm = tempo;

  // A fast first day on a warm-up: move on, and confirm it in a couple of days.
  if (item.track === 'technique' && stage === 0 && rating === 'solid' && tempo >= item.bpm * FAST_MOVE_ON) {
    p.confirmDue = now + CONFIRM_AFTER_DAYS * DAY;
  } else if (stage >= 1 || rating !== 'solid') {
    delete p.confirmDue;
  }

  if (stage >= 1) {
    p.st = 'mastered';
    if (becameMastered) p.masteredAt = state.sessions;
    // Reviews: every few days while stages remain; afterwards growing gaps, but feel exercises
    // keep coming back every week or two for refinement.
    const cap = stage < 3 ? 5 : isFeel(item) ? 14 : 60;
    if (becameMastered) p.ivl = 3;
    else if (rating === 'solid') p.ivl = Math.min(cap, Math.round((p.ivl || 3) * (stage < 3 ? 1.5 : 2.2)));
    else if (rating === 'ok') p.ivl = Math.max(2, Math.min(p.ivl || 3, 5));
    else p.ivl = 2;
    p.due = now + p.ivl * DAY;
  } else {
    p.st = 'learning';
  }

  // A run of solid ratings at full tempo means the slow start is not needed for the next new exercise.
  if (rating === 'solid' && tempo >= item.bpm) state.pace = (state.pace || 0) + 1;
  else if (rating === 'hard' || (rating === 'solid' && tempo < item.bpm * 0.9)) state.pace = 0;
  const fast = becameMastered && tempo >= item.bpm * FAST_FACTOR;
  if (fast) state.fastRun = (state.fastRun || 0) + 1;
  else if (becameMastered || rating === 'hard') state.fastRun = 0;
  return {
    becameMastered, fast, atTempo, target, nextTempo: p.bpm,
    stageUp: stage > before ? stage : 0, stage, daysToward: stageDays(state, item),
    hardTwice: p.hardRun >= 2,
  };
}

// Record a finished (or partly finished) session and move the queue on.
export function completeSession(state, result, now = Date.now()) {
  const { done, minutes, masteredGenreItems = 0, extras = [] } = result;
  if (!done.length && !extras.length) return;
  const genreFocus = done.filter((s) => s.role === 'focus' && s.item.kind === 'focus' && s.item.track !== 'foundations').length;
  state.rot += rotates(state) ? genreFocus : masteredGenreItems;
  if (done.length) state.sessions += 1;
  state.history.push({ d: now, min: Math.round(minutes * 10) / 10, n: done.length, extras, core: done.length > 0 });
}

// Levels only mark technique and foundation exercises below your level as known. Genre exercises
// are never skipped: being fast at scales says nothing about swing or bossa nova. If they are easy
// for you, they start at your tempo and are quickly secure.
const SKIPPABLE = ['technique', 'foundations'];
export function applyLevel(state, level) {
  state.profile.level.play = level;
  for (const [track, items] of Object.entries(TRACK_ITEMS)) {
    for (const it of items) {
      const p = state.items[it.id];
      const skip = SKIPPABLE.includes(track) && it.lv < level;
      if (skip && (!p || p.st === 'new')) state.items[it.id] = { st: 'skipped', solid: 0, reps: 0 };
      if (!skip && p && p.st === 'skipped') delete state.items[it.id];
    }
  }
}

// Bring progress saved before the stages up to date. Mastery used to come from one fast Solid
// rating; now it takes two days. Mastered exercises with two Solid ratings stay secure; the others
// keep the day they were rated as one of two. Genre exercises marked as known become new again.
export function migrateProgress(state) {
  for (const [id, p] of Object.entries(state.items)) {
    const item = ITEM_BY_ID[id];
    if (!item) continue;
    if (p.st === 'skipped' && !SKIPPABLE.includes(item.track)) {
      delete state.items[id];
      continue;
    }
    if (p.stage !== undefined || p.st === 'skipped') continue;
    const tempos = stageTempos(item);
    const day = p.last ? dayOf(p.last) : null;
    p.days = {};
    delete p.target;
    if (p.st === 'mastered' && (p.solid || 0) >= 2) {
      p.stage = 1;
      if (day && !isFeel(item) && (p.top || 0) >= tempos[1] * TEMPO_SLACK) p.days[2] = [day];
      p.ivl = Math.min(p.ivl || 3, 5);
    } else {
      p.stage = 0;
      if (p.st === 'mastered' || (p.solid || 0) >= 1) {
        if (day) p.days[1] = [day];
        if (day && !isFeel(item) && (p.top || 0) >= tempos[1] * TEMPO_SLACK) p.days[2] = [day];
      }
      p.st = (p.reps || 0) > 0 || p.bpm ? 'learning' : p.st;
      delete p.due;
      delete p.ivl;
    }
  }
  state.fastRun = 0;
  return state;
}

// The opening of a piece, trimmed to at most ten seconds, used as a genre sample.
export function sampleBars(piece) {
  const p = parseExercise(piece);
  const barSec = (p.barBeats * 60) / piece.perf;
  const from = piece.sampleFrom || 0;
  const bars = Math.max(1, Math.min(p.nBars - from, Math.floor(10 / barSec)));
  return { from, bars, seconds: bars * barSec, bpm: piece.perf };
}

// ---------------------------------------------------------------- stats

export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

// A day counts as a practice day when you played: a session, a piece or free practice (not only quizzes).
const atPiano = (h) => h.core !== false || (h.extras || []).some((x) => x === 'piece' || x === 'free');

export function stats(state, now = Date.now()) {
  const core = state.history.filter((h) => h.core !== false);
  const thisWeek = weekStart(now);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - i * 7);
    const start = d.getTime();
    const e = new Date(start);
    e.setDate(e.getDate() + 7);
    const inWeek = state.history.filter((h) => h.d >= start && h.d < e.getTime());
    weeks.push({
      start,
      minutes: inWeek.reduce((a, h) => a + h.min, 0),
      sessions: inWeek.filter((h) => h.core !== false).length,
      days: new Set(inWeek.filter(atPiano).map((h) => new Date(h.d).toDateString())).size,
    });
  }
  // The weekly goal is in practice days: a second session on the same day still counts in the
  // stats and moves the queue on, but it is the spread over days that helps learning most.
  const goal = state.settings.perWeek;
  // Weeks in a row that met the goal. The current week counts once it is met, and never breaks the run.
  let run = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].days >= goal) run += 1;
    else if (i !== weeks.length - 1) break;
  }
  const days = new Set(state.history.map((h) => new Date(h.d).toDateString()));
  const mastered = Object.entries(state.items).filter(([id, p]) => p.st === 'mastered' && ITEM_BY_ID[id]).length;
  return {
    weeks,
    goal,
    weekSessions: weeks[weeks.length - 1].sessions,
    weekDays: weeks[weeks.length - 1].days,
    weekMinutes: weeks[weeks.length - 1].minutes,
    weeksOnTarget: run,
    totalMinutes: Math.round(state.history.reduce((a, h) => a + h.min, 0)),
    totalSessions: core.length,
    daysPlayed: days.size,
    mastered,
    learning: Object.values(state.items).filter((p) => p.st === 'learning').length,
  };
}

export function newState(now = Date.now()) {
  return {
    v: 1,
    profile: { created: now, genres: [], level: { play: 1, read: 1, ear: 1 }, ready: false },
    settings: {
      minutes: 10, perWeek: 5, input: 'none', view: 'keys', theme: 'system', autoEvening: false,
      modules: { ear: true, reading: true, pieces: true }, metronome: true, guide: true, fingers: true, quizCount: 10,
    },
    items: {},
    progressV: 2,
    rot: 0,
    pace: 0,
    fastRun: 0,
    speed: 0,
    sessions: 0,
    history: [],
    quiz: { ear: [], read: [], stats: { ear: {}, read: {} }, times: { read: [] }, count: { ear: 0, read: 0 }, quiet: { ear: 0, read: 0 }, levels: 2 },
  };
}

export { GENRES };
