// Session planning and progress rules. Pure functions over the saved state, no DOM.

import { TRACK_ITEMS, PIECE_ITEMS, ITEM_BY_ID, GENRES } from './content.js';
import { parseExercise } from './music.js';

export const DAY = 86400000;

// How a slot of each role shares the session time, and the least it is worth doing.
const ROLE = {
  warmup: { weight: 0.8, min: 1 },
  focus: { weight: 1.2, min: 2 },
  review: { weight: 0.7, min: 1.5 },
};

// From this many planned sessions a week, focus exercises rotate between genres.
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

export function remaining(state, track) {
  return TRACK_ITEMS[track].filter((x) => !isDone(state, x.id));
}

export function trackProgress(state, track) {
  const items = TRACK_ITEMS[track];
  return { done: items.filter((x) => isDone(state, x.id)).length, total: items.length };
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

function pickWarmup(state) {
  const left = remaining(state, 'technique');
  if (left.length) return left[0];
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
    else if (turn === 1) add('warmup', pickWarmup(state));
    else pickFocus(state, 1, used).forEach((it) => slots.push({ role: 'focus', item: it }));
    if (!slots.length) add('warmup', pickWarmup(state));
  } else {
    add('warmup', pickWarmup(state));
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

export function startTempo(state, item) {
  const p = state.items[item.id];
  if (p && p.bpm) return p.bpm;
  return Math.round(item.bpm * 0.7);
}

// rating: 'hard' | 'ok' | 'solid'
export function applyRating(state, id, rating, tempo, now = Date.now()) {
  const item = ITEM_BY_ID[id];
  const p = (state.items[id] = { ...prog(state, id) });
  const wasMastered = p.st === 'mastered';
  p.reps += 1;
  p.last = now;
  p.bpm = tempo;
  const atTempo = tempo >= item.bpm * 0.9;
  let becameMastered = false;

  if (wasMastered) {
    if (rating === 'solid') p.ivl = Math.min(60, Math.round(p.ivl * 2.2));
    else if (rating === 'ok') p.ivl = Math.max(2, p.ivl);
    else {
      p.st = 'learning';
      p.solid = 0;
    }
    if (p.st === 'mastered') p.due = now + p.ivl * DAY;
  } else {
    p.st = 'learning';
    if (rating === 'hard') {
      p.solid = 0;
      p.bpm = Math.max(Math.round(item.bpm * 0.5), Math.round(tempo * 0.9));
    } else if (rating === 'solid') {
      if (atTempo) p.solid += 1;
      else p.bpm = Math.min(item.bpm, Math.round(tempo * 1.12));
      if (p.solid >= 2) {
        p.st = 'mastered';
        p.ivl = 3;
        p.due = now + 3 * DAY;
        becameMastered = true;
      }
    }
  }
  return { becameMastered, atTempo, nextTempo: p.bpm, target: item.bpm };
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

// Mark exercises below the assessed level as known, so the queue starts in the right place.
export function applyLevel(state, level) {
  state.profile.level.play = level;
  for (const items of Object.values(TRACK_ITEMS)) {
    for (const it of items) {
      const p = state.items[it.id];
      if (it.lv < level && (!p || p.st === 'new')) state.items[it.id] = { st: 'skipped', solid: 0, reps: 0 };
      if (it.lv >= level && p && p.st === 'skipped') delete state.items[it.id];
    }
  }
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
    });
  }
  const goal = state.settings.perWeek;
  // Weeks in a row that met the goal. The current week counts once it is met, and never breaks the run.
  let run = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].sessions >= goal) run += 1;
    else if (i !== weeks.length - 1) break;
  }
  const days = new Set(state.history.map((h) => new Date(h.d).toDateString()));
  const mastered = Object.entries(state.items).filter(([id, p]) => p.st === 'mastered' && ITEM_BY_ID[id]).length;
  return {
    weeks,
    goal,
    weekSessions: weeks[weeks.length - 1].sessions,
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
      modules: { ear: true, reading: true, pieces: true }, metronome: true, guide: true,
    },
    items: {},
    rot: 0,
    sessions: 0,
    history: [],
    quiz: { ear: [], read: [] },
  };
}

export { GENRES };
