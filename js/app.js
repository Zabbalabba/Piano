// Screens and flow. State lives in localStorage on this device.

import { GENRES, TRACK_ITEMS, PIECE_ITEMS, TRACK_INFO, ITEM_BY_ID, ASSESS_PASSAGES } from './content.js';
import { parseExercise, noteToMidi } from './music.js';
import {
  newState, buildSession, structureFor, lengthBounds, applyRating, completeSession, applyLevel,
  startTempo, nextPiece, sampleBars, stats, trackProgress, rotates, ROTATE_FROM, MODULES_FROM,
} from './planner.js';
import { unlock, playEvents, playNote, chime, audio, silence } from './audio.js';
import { startInput, stopInput, inputMode, midiSupported, micSupported } from './input.js';
import { createPlayer } from './player.js';
import { renderSheet, renderNote } from './sheet.js';
import { readingQuestion, earQuestion, adjustLevel, READ_LEVELS, EAR_LEVELS } from './quiz.js';

const KEY = 'piano.v1';
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const LEVELS = { 1: 'Beginner', 2: 'Advanced beginner', 3: 'Early intermediate' };
const ROLE_NAMES = { warmup: 'Warm-up', focus: 'Focus', review: 'Review' };
const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60];

// ---------------------------------------------------------------- state

function load() {
  const base = newState();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.v === 1) {
      return {
        ...base, ...saved,
        profile: { ...base.profile, ...saved.profile, level: { ...base.profile.level, ...(saved.profile || {}).level } },
        settings: { ...base.settings, ...saved.settings, modules: { ...base.settings.modules, ...(saved.settings || {}).modules } },
        quiz: { ...base.quiz, ...saved.quiz },
      };
    }
  } catch { /* start fresh */ }
  return base;
}
let S = load();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save on this device.'); }
};

// ---------------------------------------------------------------- appearance

const THEMES = { system: 'Follow phone', light: 'Light', dark: 'Dark', evening: 'Evening' };
const EVENING_FROM = 19;
const EVENING_UNTIL = 6;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function currentTheme(now = new Date()) {
  const { theme, autoEvening } = S.settings;
  const h = now.getHours();
  if (theme === 'evening' || (autoEvening && (h >= EVENING_FROM || h < EVENING_UNTIL))) return 'evening';
  if (theme === 'light' || theme === 'dark') return theme;
  return systemDark.matches ? 'dark' : 'light';
}
function applyTheme() {
  const t = currentTheme();
  if (document.documentElement.dataset.theme === t) return;
  document.documentElement.dataset.theme = t;
  const bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.content = { light: '#f6f3ec', dark: '#14161c', evening: '#100d0a' }[t];
}
systemDark.addEventListener('change', applyTheme);
setInterval(applyTheme, 60000);

// ---------------------------------------------------------------- small helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtMin = (m) => (Number.isInteger(m) ? `${m} min` : `${Math.floor(m)}:30 min`);
const clock = (sec) => `${Math.floor(Math.abs(sec) / 60)}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, '0')}`;

let toastTimer = null;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 3200);
}

let actions = {};
let leave = null;
function show(html, acts = {}, onLeave = null) {
  if (leave) { const fn = leave; leave = null; fn(); }
  stopSample();
  actions = acts;
  leave = onLeave;
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && navigator.wakeLock && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not available */ }
}

const ICON = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  library: '<path d="M5 4h3v16H5zM10.5 4h3v16h-3zM16 6l3-.8 3 13.6-3 .8z"/>',
  progress: '<path d="M4 20V10h3.5v10zM10.2 20V4h3.5v16zM16.5 20v-7H20v7z"/>',
  settings: '<path d="M4 7h9v2H4zM17 7h3v2h-3zM4 15h3v2H4zM11 15h9v2h-9z"/><circle cx="15" cy="8" r="2.6"/><circle cx="9" cy="16" r="2.6"/>',
};
function nav(current) {
  const tab = (id, label) => `<button class="tab ${current === id ? 'on' : ''}" data-act="go" data-to="${id}">
    <svg viewBox="0 0 24 24" aria-hidden="true">${ICON[id]}</svg><span>${label}</span></button>`;
  return `<nav class="tabs">${tab('home', 'Home')}${tab('library', 'Library')}${tab('progress', 'Progress')}${tab('settings', 'Settings')}</nav>`;
}
const VIEWS = { home, library, progress, settings };
const go = (el) => VIEWS[el.dataset.to]();

function chips(name, values, current, label = (v) => v) {
  return `<div class="chips">${values.map((v) => `<button class="chip ${v === current ? 'on' : ''}" data-act="${name}" data-v="${v}">${label(v)}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------- genre samples

let stopSampleFn = null;
function stopSample() {
  if (stopSampleFn) { stopSampleFn(); stopSampleFn = null; }
  document.querySelectorAll('.sample.on').forEach((b) => b.classList.remove('on'));
}
async function playSample(el) {
  const wasOn = el.classList.contains('on');
  stopSample();
  if (wasOn) return;
  await unlock();
  const piece = ITEM_BY_ID[el.dataset.id];
  const p = parseExercise(piece);
  const { from, bars, bpm } = sampleBars(piece);
  const a = from * p.barBeats;
  const b = a + bars * p.barBeats;
  const ev = p.events.filter((e) => e.t >= a - 1e-6 && e.t < b - 1e-6).map((e) => ({ ...e, t: e.t - a, d: Math.min(e.d, b - e.t) }));
  const first = Math.min(...ev.map((e) => e.t));
  ev.forEach((e) => { e.t -= first; });
  el.classList.add('on');
  stopSampleFn = playEvents(ev, bpm, () => { el.classList.remove('on'); stopSampleFn = null; });
}

function genreList(selected) {
  return `<div class="genres">${GENRES.map((g) => {
    const on = selected.includes(g.id);
    return `<div class="genre ${on ? 'on' : ''}">
      <button class="genre-main" data-act="genre" data-id="${g.id}" aria-pressed="${on}">
        <span class="check" aria-hidden="true"></span>
        <span><b>${esc(g.name)}</b><small>${esc(g.blurb)}</small></span>
      </button>
      <div class="samples" aria-label="Samples">${PIECE_ITEMS[g.id].map((p, i) =>
        `<button class="sample" data-act="sample" data-id="${p.id}" title="${esc(p.t)}" aria-label="Play sample ${i + 1}: ${esc(p.t)}"><i></i>${i + 1}</button>`).join('')}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function routineNote(minutes, perWeek) {
  const roles = structureFor(minutes);
  const n = roles.length;
  let shape;
  if (roles[0] === 'single') shape = 'One exercise per session. Technique, genre work and review take turns.';
  else if (n === 2) shape = 'Two exercises: a short technique warm-up, then one focus exercise.';
  else if (n === 3) shape = 'Three exercises: a warm-up and two focus exercises.';
  else shape = `${n} exercises: a warm-up, ${n - 2} focus exercises and a review.`;
  const rot = perWeek >= ROTATE_FROM
    ? 'Focus exercises rotate between your genres from session to session.'
    : `With fewer than ${ROTATE_FROM} sessions a week the same exercises repeat until you have them down, because the gap between sessions is too long for rotating to help.`;
  return `<p class="note">${shape} ${rot}</p>`;
}

function inputOptions(current) {
  const opt = (id, title, text, ok = true) => `<button class="option ${current === id ? 'on' : ''}" data-act="input" data-v="${id}">
    <span class="check" aria-hidden="true"></span><span><b>${title}</b><small>${text}${ok ? '' : ' <em>Not available in this browser.</em>'}</small></span></button>`;
  return `<div class="options">
    ${opt('none', 'Play along', 'The app shows and plays the exercise. You rate yourself afterwards. Works everywhere.')}
    ${opt('mic', 'Microphone', 'The app listens through the microphone and estimates how many notes you hit. Approximate, best at slow tempos.', micSupported())}
    ${opt('midi', 'MIDI keyboard', 'Exact feedback on every note through a cable from your piano.', midiSupported())}
  </div>
  <details class="help"><summary>How to connect a MIDI keyboard</summary>
    <ol>
      <li>Find the round five-pin sockets marked MIDI on the back or underside of the piano. A Clavinova from the early 2000s should have MIDI IN and OUT; some models also have a USB or TO HOST socket. Check the manual for your model.</li>
      <li>Get a USB-MIDI interface cable. Plug the cable's plug marked IN into the piano's MIDI OUT.</li>
      <li>Plug the USB end into a laptop or an Android phone or tablet.</li>
      <li>Open this app there in Chrome or Edge, choose MIDI keyboard, and allow access when asked.</li>
    </ol>
    <p>iPhone and iPad: Safari does not support MIDI on web pages, so use Play along or Microphone there.</p>
  </details>
  <details class="help"><summary>Getting the most from the microphone</summary>
    <p>Put the phone on the music stand, close to the piano's speakers. The guide sound is switched off while the app listens, so it only hears you. Scores are an estimate: it can check whether the expected notes sounded, but not every wrong note.</p>
  </details>`;
}

// ---------------------------------------------------------------- setup

function onboarding() {
  const ob = { step: 'welcome', genres: [...S.profile.genres], minutes: S.settings.minutes, perWeek: S.settings.perWeek, input: S.settings.input };
  const render = () => {
    const frame = (n, title, body, nextLabel = 'Continue', canNext = true) => `<main class="page setup">
      <div class="steps">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>
      <h1>${title}</h1>${body}
      <div class="foot"><button class="btn primary" data-act="next" ${canNext ? '' : 'disabled'}>${nextLabel}</button></div></main>`;
    if (ob.step === 'welcome') {
      return show(`<main class="page setup center">
        <div class="logo" aria-hidden="true"><i></i><i></i><i class="hl"></i><i></i></div>
        <h1>Piano</h1>
        <p class="lead">Short, focused practice sessions built around the music you want to play.</p>
        <div class="foot"><button class="btn primary" data-act="next">Set up</button></div></main>`, { next: () => { ob.step = 'genres'; render(); } });
    }
    if (ob.step === 'genres') {
      return show(frame(1, 'What do you want to play?',
        `<p class="lead">Pick one to three to start with. Tap the numbers to hear what each sounds like. You can change this any time.</p>${genreList(ob.genres)}`,
        'Continue', ob.genres.length > 0), {
        genre: (el) => {
          const id = el.dataset.id;
          ob.genres = ob.genres.includes(id) ? ob.genres.filter((g) => g !== id) : [...ob.genres, id];
          const y = window.scrollY;
          render();
          window.scrollTo(0, y);
        },
        sample: playSample,
        next: () => { ob.step = 'routine'; render(); },
      });
    }
    if (ob.step === 'routine') {
      return show(frame(2, 'Your routine',
        `<h2>Minutes per session</h2>${chips('min', MINUTE_CHOICES, ob.minutes)}
         <h2>Sessions per week</h2>${chips('week', [1, 2, 3, 4, 5, 6, 7], ob.perWeek)}
         ${routineNote(ob.minutes, ob.perWeek)}
         <p class="note">Short and often beats long and rare: ten minutes a day teaches your hands more than twenty minutes every other day.</p>`), {
        min: (el) => { ob.minutes = Number(el.dataset.v); render(); },
        week: (el) => { ob.perWeek = Number(el.dataset.v); render(); },
        next: () => { ob.step = 'input'; render(); },
      });
    }
    if (ob.step === 'input') {
      return show(frame(3, 'How should the app follow you?', inputOptions(ob.input)), {
        input: (el) => {
          const v = el.dataset.v;
          if ((v === 'midi' && !midiSupported()) || (v === 'mic' && !micSupported())) return toast('Not available in this browser.');
          ob.input = v;
          render();
        },
        next: () => {
          S.profile.genres = ob.genres;
          S.settings.minutes = ob.minutes;
          S.settings.perWeek = ob.perWeek;
          S.settings.input = ob.input;
          save();
          skillCheck(() => { S.profile.ready = true; save(); home(); });
        },
      });
    }
  };
  render();
}

// ---------------------------------------------------------------- skill check

function skillCheck(done) {
  const result = { play: 1, read: 1, ear: 1 };
  const head = (n) => `<div class="steps">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;

  const finish = () => {
    const seg = (key, names) => `<div class="seg">${[1, 2, 3].map((l) => `<button class="${result[key] === l ? 'on' : ''}" data-act="lvl" data-k="${key}" data-v="${l}" title="${esc(names[l])}">${l}</button>`).join('')}</div>`;
    show(`<main class="page setup">${head(4)}<h1>Your starting point</h1>
      <p class="lead">This sets which exercises come first. It adjusts as you practise, and you can change it here.</p>
      <div class="card rows">
        <div class="row"><span><b>Playing</b><small>${LEVELS[result.play]}</small></span>${seg('play', LEVELS)}</div>
        <div class="row"><span><b>Note reading</b><small>${READ_LEVELS[result.read]}</small></span>${seg('read', READ_LEVELS)}</div>
        <div class="row"><span><b>Ear</b><small>${EAR_LEVELS[result.ear]}</small></span>${seg('ear', EAR_LEVELS)}</div>
      </div>
      <div class="foot"><button class="btn primary" data-act="ok">Start practising</button></div></main>`, {
      lvl: (el) => { result[el.dataset.k] = Number(el.dataset.v); finish(); },
      ok: () => {
        S.profile.level.read = result.read;
        S.profile.level.ear = result.ear;
        S.quiz = { ear: [], read: [] };
        applyLevel(S, result.play);
        save();
        done();
      },
    });
  };

  const playStep = (i) => {
    const item = ITEM_BY_ID[ASSESS_PASSAGES[i]];
    let stop = null;
    show(`<main class="page setup">${head(3)}<h1>Try this at the piano</h1>
      <p class="lead">Passage ${i + 1} of up to ${ASSESS_PASSAGES.length}. Take a minute with it, slowly. No need to be perfect.</p>
      <div class="sheet-static"><div id="pv"></div></div>
      <button class="btn" data-act="listen">Listen to it</button>
      <h2>How did it go?</h2>
      <div class="stack">
        <button class="btn" data-act="rate" data-v="no">Could not play it</button>
        <button class="btn" data-act="rate" data-v="effort">Managed it with effort</button>
        <button class="btn" data-act="rate" data-v="easy">Played it comfortably</button>
      </div></main>`, {
      listen: async () => {
        await unlock();
        if (stop) stop();
        stop = playEvents(parseExercise(item).events, Math.round(item.bpm * 0.85));
      },
      rate: (el) => {
        const v = el.dataset.v;
        if (v === 'easy' && i < ASSESS_PASSAGES.length - 1) return playStep(i + 1);
        result.play = v === 'no' ? Math.max(1, i) : Math.min(3, i + 1);
        finish();
      },
    }, () => { if (stop) stop(); });
    try { renderSheet(document.getElementById('pv'), item); } catch (err) { console.error(err); }
  };

  // Six questions at most, harder after two right in a row, stops after two misses.
  const quizStep = (kind, n, then) => {
    let level = 1;
    let streak = 0;
    let misses = 0;
    let asked = 0;
    let last = null;
    const ask = () => {
      if (asked >= 6 || misses >= 2) { result[kind] = level; return then(); }
      asked += 1;
      const q = kind === 'read' ? readingQuestion(level, last) : earQuestion(level);
      last = q;
      askQuestion({
        kind, q, header: `${head(n)}<h1>${kind === 'read' ? 'Which note is this?' : 'Listen'}</h1>`,
        skip: kind === 'read' ? 'I cannot read notes yet' : 'Skip this part',
        onSkip: () => { result[kind] = 1; then(); },
        onAnswer: (right) => {
          if (right) { streak += 1; if (streak >= 2 && level < 3) { level += 1; streak = 0; } } else { streak = 0; misses += 1; }
          ask();
        },
      });
    };
    ask();
  };

  show(`<main class="page setup">${head(1)}<h1>How much have you played?</h1>
    <p class="lead">A quick check so you start in the right place. About three minutes.</p>
    <div class="stack">
      <button class="btn" data-act="exp" data-v="0">Never, or almost never</button>
      <button class="btn" data-act="exp" data-v="1">A little, I know some basics</button>
      <button class="btn" data-act="exp" data-v="2">I used to play, but I am rusty</button>
      <button class="btn" data-act="exp" data-v="3">I play regularly</button>
    </div></main>`, {
    exp: (el) => {
      if (el.dataset.v === '0') return finish();
      quizStep('read', 2, () => quizStep('ear', 2, () => playStep(0)));
    },
  });
}

// One quiz question (reading or ear). Shared by the skill check and the practice modules.
function askQuestion({ kind, q, header, skip, onSkip, onAnswer, progressText = '' }) {
  let answered = false;
  let stop = null;
  const play = async () => {
    await unlock();
    if (stop) stop();
    const ev = [];
    q.notes.forEach((group, i) => group.forEach((m) => ev.push({ t: i * 1.1, d: 1, midi: m })));
    stop = playEvents(ev, 60);
  };
  show(`<main class="page quiz">${header}
    ${progressText ? `<p class="muted">${progressText}</p>` : ''}
    ${kind === 'read'
      ? '<div class="note-card"><div id="nt"></div></div>'
      : `<p class="lead">${q.prompt}</p><button class="btn big" data-act="play">Play the sound</button>`}
    <div class="answers n${q.choices.length}">${q.choices.map((c) => `<button class="btn answer" data-act="ans" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    ${skip ? `<button class="link" data-act="skip">${skip}</button>` : ''}</main>`, {
    play,
    skip: () => onSkip && onSkip(),
    ans: async (el) => {
      if (answered) return;
      answered = true;
      const right = el.dataset.v === q.answer;
      el.classList.add(right ? 'right' : 'wrong');
      if (!right) $app.querySelectorAll('.answer').forEach((b) => { if (b.dataset.v === q.answer) b.classList.add('right'); });
      if (kind === 'read') {
        await unlock();
        playNote(noteToMidi(q.note), audio().currentTime + 0.02, 0.8);
      }
      setTimeout(() => onAnswer(right), right ? 650 : 1500);
    },
  }, () => { if (stop) stop(); });
  if (kind === 'read') {
    try { renderNote(document.getElementById('nt'), q.clef, q.note); } catch (err) { console.error(err); }
  } else {
    // Needs a tap on some browsers before sound may start; try anyway.
    if (audio().state === 'running') play();
  }
}

// Ten questions of reading or ear training. Calls done(minutes).
function runQuiz(kind, done) {
  const total = 10;
  const started = Date.now();
  let i = 0;
  let right = 0;
  let last = null;
  const key = kind === 'read' ? 'read' : 'ear';
  const title = kind === 'read' ? 'Note reading' : 'Ear training';
  const ask = () => {
    if (i >= total) {
      const minutes = Math.min(10, (Date.now() - started) / 60000);
      save();
      return show(`<main class="page center"><h1>${right} of ${total}</h1>
        <p class="lead">${title} · ${kind === 'read' ? READ_LEVELS[S.profile.level.read] : EAR_LEVELS[S.profile.level.ear]}</p>
        <div class="foot"><button class="btn primary" data-act="ok">Done</button></div></main>`, { ok: () => done(minutes) });
    }
    const level = S.profile.level[key];
    const q = kind === 'read' ? readingQuestion(level, last) : earQuestion(level);
    last = q;
    askQuestion({
      kind, q,
      header: `<div class="topbar"><button class="icon-btn" data-act="quit" aria-label="Close">✕</button><b>${title}</b><span>${i + 1} / ${total}</span></div>`,
      onAnswer: (ok) => {
        i += 1;
        if (ok) right += 1;
        S.quiz[key].push(ok ? 1 : 0);
        const next = adjustLevel(level, S.quiz[key]);
        if (next !== level) {
          S.profile.level[key] = next;
          S.quiz[key] = [];
          toast(next > level ? 'Level up. The questions get a little harder.' : 'Stepping back a level to make this solid.');
        }
        ask();
      },
    });
    actions.quit = () => done((Date.now() - started) / 60000, true);
  };
  ask();
}

// ---------------------------------------------------------------- home

function weekDots(st) {
  const n = Math.max(st.goal, st.weekSessions);
  return `<div class="dots" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < st.weekSessions ? 'on' : ''}"></i>`).join('')}</div>`;
}

function planList(plan) {
  return `<ol class="plan">${plan.slots.map((s) => `<li>
    <span class="role ${s.role}">${ROLE_NAMES[s.role]}</span>
    <span class="what"><b>${esc(s.item.t)}</b><small>${esc(TRACK_INFO[s.item.track].name)}</small></span>
    <span class="mins">${fmtMin(s.minutes)}</span></li>`).join('')}</ol>`;
}

function home() {
  if (!S.profile.ready) return onboarding();
  const st = stats(S);
  const plan = buildSession(S, S.settings.minutes);
  const left = Math.max(0, st.goal - st.weekSessions);
  const weekLine = left === 0 ? 'Weekly goal reached.' : `${st.weekSessions} of ${st.goal} sessions this week`;
  show(`<main class="page home">
    <header class="hero">
      <div><h1>${st.totalSessions === 0 ? 'Ready when you are' : 'Up next'}</h1><p class="muted">${weekLine}</p></div>
      ${weekDots(st)}
    </header>
    <section class="card">
      ${planList(plan)}
      <button class="btn primary big" data-act="start">Start · ${S.settings.minutes} min</button>
      <button class="link" data-act="quick">Low on time or energy? Just 2 minutes</button>
    </section>
    <h2>Separate practice</h2>
    <div class="tiles">
      <button class="tile" data-act="ear"><b>Ear training</b><small>10 questions</small></button>
      <button class="tile" data-act="read"><b>Note reading</b><small>10 questions</small></button>
      <button class="tile" data-act="pieces"><b>Pieces</b><small>${S.profile.genres.length * 3} for your genres</small></button>
    </div>
  </main>${nav('home')}`, {
    go,
    start: () => lengthPicker(),
    quick: () => beginSession(2),
    ear: async () => { await unlock(); runQuiz('ear', (min, quit) => { recordExtra('ear', min, quit); home(); }); },
    read: async () => { await unlock(); runQuiz('read', (min, quit) => { recordExtra('read', min, quit); home(); }); },
    pieces: () => library('pieces'),
  });
}

function recordExtra(type, minutes, quit) {
  if (quit && minutes < 0.5) return;
  completeSession(S, { done: [], minutes, extras: [type] });
  save();
}

// The one decision before a session: how long today.
function lengthPicker() {
  const target = S.settings.minutes;
  const { min, max } = lengthBounds(target);
  let minutes = target;
  const quick = [...new Set([target - 3, target, target + 5, target + 10].filter((v) => v >= min && v <= max))];
  const render = () => {
    const plan = buildSession(S, minutes);
    const full = buildSession(S, target).slots.length;
    const dropped = full - plan.slots.length;
    show(`<main class="page picker">
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">✕</button><b>How long today?</b><span></span></div>
      <div class="stepper">
        <button class="round" data-act="less" ${minutes <= min ? 'disabled' : ''} aria-label="One minute less">−</button>
        <div class="big-num">${minutes}<small>min</small></div>
        <button class="round" data-act="more" ${minutes >= max ? 'disabled' : ''} aria-label="One minute more">+</button>
      </div>
      ${chips('set', quick, minutes, (v) => (v === target ? `${v} · usual` : v))}
      <section class="card">${planList(plan)}
        ${dropped > 0 ? `<p class="note">Shorter today, so ${dropped === 1 ? 'one exercise waits' : `${dropped} exercises wait`} until next time.</p>` : ''}
        ${minutes > target ? '<p class="note">Longer today: the same exercises, with more time on each. For more exercises per session, raise the session length in Settings.</p>' : ''}
      </section>
      <div class="foot"><button class="btn primary big" data-act="begin">Begin</button></div>
    </main>`, {
      back: home,
      less: () => { minutes = Math.max(min, minutes - 1); render(); },
      more: () => { minutes = Math.min(max, minutes + 1); render(); },
      set: (el) => { minutes = Number(el.dataset.v); render(); },
      begin: () => beginSession(minutes),
    });
  };
  render();
}

// ---------------------------------------------------------------- session

let session = null;

async function prepareSound() {
  const want = S.settings.input;
  await unlock(want === 'mic');
  if (want !== 'none' && inputMode() !== want) {
    const r = await startInput(want);
    if (!r.ok) toast(`${r.message} Continuing in play-along mode.`);
    else if (want === 'midi' && r.message) toast(r.message);
  }
}

async function beginSession(minutes) {
  await prepareSound();
  session = { plan: buildSession(S, minutes), i: 0, done: [], seconds: 0, mastered: 0, news: [], extras: [] };
  nextSlot();
}

function nextSlot() {
  const { plan } = session;
  if (session.i >= plan.slots.length) return endSession();
  const slot = plan.slots[session.i];
  runExercise({
    item: slot.item,
    minutes: slot.minutes,
    label: `${session.i + 1} / ${plan.slots.length} · ${ROLE_NAMES[slot.role]}`,
    onDone: (r) => {
      session.done.push(slot);
      session.seconds += Math.min(r.seconds, slot.minutes * 120);
      if (r.info.becameMastered) {
        session.news.push(slot.item.t);
        if (slot.item.kind === 'focus' && slot.item.track !== 'foundations') session.mastered += 1;
      }
      session.i += 1;
      nextSlot();
    },
    onQuit: (seconds) => {
      session.seconds += Math.min(seconds, slot.minutes * 120);
      endSession();
    },
  });
}

function endSession() {
  const s = session;
  if (!s.recorded) {
    completeSession(S, { done: s.done, minutes: s.seconds / 60, masteredGenreItems: s.mastered });
    s.recorded = true;
    save();
  }
  summary();
}

function summary() {
  const s = session;
  const st = stats(S);
  const minutes = Math.max(1, Math.round(s.seconds / 60));
  const offer = S.settings.minutes >= MODULES_FROM && s.done.length > 0;
  const m = S.settings.modules;
  const piece = nextPiece(S);
  const has = (t) => s.extras.includes(t);
  const extra = (type, label, sub) => `<button class="tile ${has(type) ? 'done' : ''}" data-act="extra" data-v="${type}"><b>${label}</b><small>${has(type) ? 'Done' : sub}</small></button>`;
  const tiles = [
    m.ear ? extra('ear', 'Ear training', 'About 3 min') : '',
    m.reading ? extra('read', 'Note reading', 'About 3 min') : '',
    m.pieces && piece ? extra('piece', 'A piece', esc(piece.t)) : '',
  ].join('');
  if (s.done.length && !s.chimed) { s.chimed = true; try { chime(); } catch { /* no sound */ } }
  show(`<main class="page center summary">
    <h1>${s.done.length ? 'Session done' : 'Session ended'}</h1>
    <p class="lead">${s.done.length ? `${minutes} min · ${s.done.length} ${s.done.length === 1 ? 'exercise' : 'exercises'}` : 'Nothing was recorded. The same exercises will be waiting.'}</p>
    ${s.news.map((t) => `<p class="win">Mastered: ${esc(t)}</p>`).join('')}
    <div class="card"><p class="muted">${st.weekSessions >= st.goal ? 'Weekly goal reached.' : `${st.weekSessions} of ${st.goal} sessions this week`}</p>${weekDots(st)}</div>
    ${offer && tiles ? `<h2>Add something? Entirely optional.</h2><div class="tiles">${tiles}</div>` : ''}
    <div class="foot"><button class="btn primary" data-act="finish">Finish</button></div>
  </main>`, {
    finish: () => { stopInput(); keepAwake(false); session = null; home(); },
    extra: (el) => {
      const type = el.dataset.v;
      const after = (min, quit) => {
        if (!(quit && min < 0.5)) { s.extras.push(type); recordExtra(type, min, false); }
        summary();
      };
      if (type === 'piece') {
        return runExercise({
          item: piece, minutes: 5, label: 'Piece',
          onDone: (r) => after(r.seconds / 60, false),
          onQuit: (sec) => after(sec / 60, true),
        });
      }
      runQuiz(type, after);
    },
  });
}

// ---------------------------------------------------------------- exercise screen

function runExercise({ item, minutes, label, onDone, onQuit }) {
  const started = Date.now();
  const listening = inputMode() !== 'none';
  let tempo = startTempo(S, item);
  let hands = 'B';
  let guide = inputMode() === 'mic' ? false : S.settings.guide;
  let metronome = S.settings.metronome;
  let view = S.settings.view;
  let last = null;
  let best = null;
  let rang = false;
  let rating = false;
  const lowT = Math.max(30, Math.round(item.bpm * 0.4));
  const highT = Math.round(item.bpm * 1.3);
  const total = minutes ? minutes * 60 : 0;

  show(`<main class="exercise">
    <div class="topbar">
      <button class="icon-btn" data-act="quit" aria-label="End">✕</button>
      <b>${esc(label)}</b>
      <span class="timer" id="timer"></span>
    </div>
    <div class="ex-head">
      <h1>${esc(item.t)}</h1>
      <p>${esc(item.focus)}</p>
      <details><summary>How to practise it</summary><p>${esc(item.tip)}${item.swing ? ' Swing feel: play the eighth notes long–short.' : ''}${item.src ? ` <span class="muted">(${esc(item.src)})</span>` : ''}</p></details>
    </div>
    <div class="stage" id="stage"></div>
    <div class="score" id="score" hidden></div>
    <div class="controls">
      <div class="ctl-row">
        <button class="btn primary play" data-act="play" id="play">Play</button>
        <div class="tempo">
          <button class="round sm" data-act="slower" aria-label="Slower">−</button>
          <div><b id="bpm"></b><small id="bpmNote"></small></div>
          <button class="round sm" data-act="faster" aria-label="Faster">+</button>
        </div>
      </div>
      <div class="ctl-row wrap">
        <div class="seg" id="viewSeg"><button data-act="view" data-v="keys">Keys</button><button data-act="view" data-v="sheet">Sheet</button></div>
        <div class="seg" id="handSeg"><button data-act="hands" data-v="B">Both</button><button data-act="hands" data-v="R">Right</button><button data-act="hands" data-v="L">Left</button></div>
        <button class="toggle" data-act="guide" id="guide">Guide sound</button>
        <button class="toggle" data-act="click" id="click">Click</button>
      </div>
      <button class="btn next" data-act="done">Done with this one</button>
    </div>
    <div class="sheet-modal" id="rate" hidden>
      <div class="sheet-body">
        <h2>How did that feel?</h2>
        <p class="muted" id="rateHint"></p>
        <div class="stack">
          <button class="btn" data-act="rate" data-v="hard"><b>Hard</b><small>Slow it down next time</small></button>
          <button class="btn" data-act="rate" data-v="ok"><b>Getting there</b><small>Keep it as it is</small></button>
          <button class="btn" data-act="rate" data-v="solid"><b>Solid</b><small>Ready for more</small></button>
        </div>
        <button class="link" data-act="resume">Keep practising</button>
      </div>
    </div>
  </main>`, {}, () => {
    clearInterval(tick);
    player.destroy();
  });

  const $ = (id) => document.getElementById(id);
  const player = createPlayer({
    item, stage: $('stage'), bpm: tempo, view, hands, guide, metronome,
    onPass: (score) => {
      last = score;
      best = best === null ? score : Math.max(best, score);
      refresh();
    },
    onState: (on) => {
      $('play').textContent = on ? 'Stop' : 'Play';
      $('play').classList.toggle('stop', on);
      keepAwake(true);
    },
  });

  function refresh() {
    $('bpm').textContent = `${tempo} bpm`;
    $('bpmNote').textContent = tempo === item.bpm ? 'target tempo' : `target ${item.bpm}`;
    $('viewSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    $('handSeg').hidden = !player.hasBothHands();
    $('handSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === hands));
    $('guide').classList.toggle('on', guide);
    $('click').classList.toggle('on', metronome);
    const sc = $('score');
    sc.hidden = !listening;
    if (listening) {
      if (!player.scoring()) sc.textContent = 'Switch the guide sound off and the app will listen and score you.';
      else if (last === null) sc.textContent = inputMode() === 'midi' ? 'Listening on MIDI. Play along after the count-in.' : 'Listening. Play along after the count-in.';
      else sc.innerHTML = `Last pass <b>${last}%</b> · best <b>${best}%</b>`;
    }
  }

  const tick = setInterval(() => {
    const el = $('timer');
    if (!el) return;
    const elapsed = (Date.now() - started) / 1000;
    if (!total) { el.textContent = clock(elapsed); return; }
    const left = total - elapsed;
    el.textContent = left >= 0 ? clock(left) : `+${clock(left)}`;
    el.classList.toggle('over', left < 0);
    if (left < 0 && !rang) {
      rang = true;
      if (!rating) { try { chime(); } catch { /* no sound */ } toast('Time for this exercise is up. Move on when you are ready.'); }
    }
  }, 250);

  const setTempo = (v) => { tempo = Math.max(lowT, Math.min(highT, v)); player.setTempo(tempo); refresh(); };

  Object.assign(actions, {
    play: async () => { await unlock(inputMode() === 'mic'); player.toggle(); },
    slower: () => setTempo(tempo - 4),
    faster: () => setTempo(tempo + 4),
    view: (el) => { view = el.dataset.v; S.settings.view = view; save(); player.setView(view); refresh(); },
    hands: (el) => { hands = el.dataset.v; player.setHands(hands); refresh(); },
    guide: () => { guide = !guide; if (inputMode() !== 'mic') { S.settings.guide = guide; save(); } player.setGuide(guide); last = best = null; refresh(); },
    click: () => { metronome = !metronome; S.settings.metronome = metronome; save(); player.setMetronome(metronome); refresh(); },
    quit: () => { const sec = (Date.now() - started) / 1000; onQuit(sec); },
    done: () => {
      player.stop();
      rating = true;
      const hint = $('rateHint');
      if (best !== null) hint.textContent = `Best pass: ${best}%. ${best >= 85 ? 'That points to Solid.' : best >= 60 ? 'That points to Getting there.' : 'That points to Hard.'}`;
      else hint.textContent = tempo < item.bpm * 0.9 ? `You played at ${tempo} bpm. The target is ${item.bpm}.` : '';
      $('rate').hidden = false;
    },
    resume: () => { rating = false; $('rate').hidden = true; },
    rate: (el) => {
      const info = applyRating(S, item.id, el.dataset.v, tempo);
      save();
      if (info.becameMastered) toast('Mastered. It comes back for a quick review in a few days.');
      else if (el.dataset.v === 'solid' && !info.atTempo) toast(`Next time a little faster: ${info.nextTempo} bpm.`);
      else if (el.dataset.v === 'hard') toast(`Next time a little slower: ${info.nextTempo} bpm.`);
      onDone({ rating: el.dataset.v, seconds: (Date.now() - started) / 1000, info });
    },
  });
  refresh();
  keepAwake(true);
}

// ---------------------------------------------------------------- library

function statusOf(id) {
  const p = S.items[id];
  if (!p || p.st === 'new') return ['new', 'Not started'];
  if (p.st === 'skipped') return ['known', 'Below your level'];
  if (p.st === 'mastered') return ['mastered', 'Mastered'];
  return ['learning', `Learning · ${p.bpm} bpm`];
}

function library(focus) {
  const mine = S.profile.genres;
  const others = GENRES.map((g) => g.id).filter((g) => !mine.includes(g));
  const itemRow = (it) => {
    const [cls, text] = statusOf(it.id);
    return `<button class="item" data-act="open" data-id="${it.id}"><i class="st ${cls}"></i><span><b>${esc(it.t)}</b><small>${text} · ${LEVELS[it.lv]}</small></span></button>`;
  };
  const section = (track, open) => {
    const info = TRACK_INFO[track];
    const pr = trackProgress(S, track);
    const pieces = PIECE_ITEMS[track];
    return `<details class="track" ${open ? 'open' : ''}><summary><span><b>${esc(info.name)}</b><small>${pr.done} of ${pr.total} done</small></span>
      <span class="bar"><i style="width:${(100 * pr.done) / pr.total}%"></i></span></summary>
      ${focus === 'pieces' ? '' : TRACK_ITEMS[track].map(itemRow).join('')}
      ${pieces ? `<h3>Pieces</h3>${pieces.map(itemRow).join('')}` : ''}</details>`;
  };
  const core = focus === 'pieces' ? '' : section('technique', false) + section('foundations', false);
  show(`<main class="page">
    <h1>${focus === 'pieces' ? 'Pieces' : 'Library'}</h1>
    <p class="lead">${focus === 'pieces' ? 'Three short pieces per genre. Play any of them whenever you like.' : 'Everything in the repertoire. Your sessions pick from this for you, but you can open anything to practise freely.'}</p>
    ${core}${mine.map((g) => section(g, focus === 'pieces')).join('')}
    ${focus === 'pieces' ? '' : `<h2>Other genres</h2>${others.map((g) => section(g, false)).join('')}`}
  </main>${nav(focus === 'pieces' ? 'home' : 'library')}`, {
    go,
    open: async (el) => {
      const item = ITEM_BY_ID[el.dataset.id];
      await prepareSound();
      const back = () => { stopInput(); keepAwake(false); library(focus); };
      runExercise({
        item, minutes: 0, label: item.kind === 'piece' ? 'Piece' : 'Free practice',
        onDone: (r) => { recordExtra(item.kind === 'piece' ? 'piece' : 'free', r.seconds / 60, false); back(); },
        onQuit: back,
      });
    },
  });
}

// ---------------------------------------------------------------- progress

function progress() {
  const st = stats(S);
  const maxMin = Math.max(10, ...st.weeks.map((w) => w.minutes));
  const tracks = ['technique', 'foundations', ...S.profile.genres];
  const fmtWeek = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  show(`<main class="page">
    <h1>Progress</h1>
    <section class="card">
      <div class="hero"><div><h2 class="flat">This week</h2><p class="muted">${st.weekSessions} of ${st.goal} sessions · ${Math.round(st.weekMinutes)} min</p></div>${weekDots(st)}</div>
      ${st.weeksOnTarget > 1 ? `<p class="note">${st.weeksOnTarget} weeks in a row on target.</p>` : ''}
    </section>
    <div class="stat-grid">
      <div class="stat"><b>${st.totalMinutes}</b><small>minutes played</small></div>
      <div class="stat"><b>${st.totalSessions}</b><small>sessions</small></div>
      <div class="stat"><b>${st.mastered}</b><small>exercises mastered</small></div>
      <div class="stat"><b>${st.daysPlayed}</b><small>days played</small></div>
    </div>
    <h2>Minutes per week</h2>
    <section class="card"><div class="weeks">${st.weeks.map((w, i) => `<div class="wk ${i === 7 ? 'now' : ''}">
      <span>${Math.round(w.minutes) || ''}</span><i style="height:${Math.max(2, (100 * w.minutes) / maxMin)}%"></i><small>${fmtWeek(w.start)}</small></div>`).join('')}</div></section>
    <h2>Where you are</h2>
    <section class="card rows">${tracks.map((t) => {
      const pr = trackProgress(S, t);
      return `<div class="row"><span><b>${esc(TRACK_INFO[t].name)}</b><small>${pr.done} of ${pr.total}</small></span><span class="bar wide"><i style="width:${(100 * pr.done) / pr.total}%"></i></span></div>`;
    }).join('')}
      <div class="row"><span><b>Note reading</b><small>${READ_LEVELS[S.profile.level.read]}</small></span><span class="lvl">Level ${S.profile.level.read}</span></div>
      <div class="row"><span><b>Ear</b><small>${EAR_LEVELS[S.profile.level.ear]}</small></span><span class="lvl">Level ${S.profile.level.ear}</span></div>
    </section>
  </main>${nav('progress')}`, { go });
}

// ---------------------------------------------------------------- settings

function settings() {
  const s = S.settings;
  const keep = (fn) => (el) => { const y = window.scrollY; fn(el); save(); settings(); window.scrollTo(0, y); };
  const sw = (key, label, sub) => `<button class="row switch ${s.modules[key] ? 'on' : ''}" data-act="module" data-v="${key}"><span><b>${label}</b><small>${sub}</small></span><i></i></button>`;
  show(`<main class="page">
    <h1>Settings</h1>
    <h2>Appearance</h2>${chips('theme', Object.keys(THEMES), s.theme, (v) => THEMES[v])}
    <section class="card rows gap">
      <button class="row switch ${s.autoEvening ? 'on' : ''}" data-act="autoEvening"><span><b>Evening mode at night</b><small>Switches on by itself from 7 pm to 6 am</small></span><i></i></button>
    </section>
    <p class="note">Evening mode is dim and warm, with dark sheet music and muted keys.</p>
    <h2>Minutes per session</h2>${chips('min', MINUTE_CHOICES, s.minutes)}
    <h2>Sessions per week</h2>${chips('week', [1, 2, 3, 4, 5, 6, 7], s.perWeek)}
    ${routineNote(s.minutes, s.perWeek)}
    <h2>Optional extras after a session</h2>
    <section class="card rows">
      ${sw('ear', 'Ear training', 'Offered at the end of a session')}
      ${sw('reading', 'Note reading', 'Offered at the end of a session')}
      ${sw('pieces', 'Pieces', 'One piece from your genres')}
    </section>
    ${s.minutes < MODULES_FROM ? `<p class="note">Extras are offered after sessions of ${MODULES_FROM} minutes or more. They are always available from the Home screen.</p>` : ''}
    <h2>How the app follows you</h2>${inputOptions(s.input)}
    <h2>Genres</h2>${genreList(S.profile.genres)}
    <h2>Level</h2>
    <section class="card rows">
      <div class="row"><span><b>Playing</b><small>${LEVELS[S.profile.level.play]}</small></span><button class="btn sm" data-act="recheck">Redo skill check</button></div>
    </section>
    <h2>Your data</h2>
    <p class="note">Everything is stored on this device only. On an iPhone, add the app to your Home Screen (Share, then Add to Home Screen) so Safari keeps the data, and export a backup now and then.</p>
    <div class="stack">
      <button class="btn" data-act="export">Export backup</button>
      <label class="btn">Import backup<input type="file" id="imp" accept="application/json,.json" hidden></label>
      <button class="btn danger" data-act="reset">Erase everything</button>
    </div>
  </main>${nav('settings')}`, {
    go,
    sample: playSample,
    theme: keep((el) => { s.theme = el.dataset.v; applyTheme(); }),
    autoEvening: keep(() => { s.autoEvening = !s.autoEvening; applyTheme(); }),
    min: keep((el) => { s.minutes = Number(el.dataset.v); }),
    week: keep((el) => { s.perWeek = Number(el.dataset.v); }),
    module: keep((el) => { s.modules[el.dataset.v] = !s.modules[el.dataset.v]; }),
    input: (el) => {
      const v = el.dataset.v;
      if ((v === 'midi' && !midiSupported()) || (v === 'mic' && !micSupported())) return toast('Not available in this browser.');
      keep(() => { s.input = v; stopInput(); })(el);
    },
    genre: (el) => {
      const id = el.dataset.id;
      const has = S.profile.genres.includes(id);
      if (has && S.profile.genres.length === 1) return toast('Keep at least one genre.');
      keep(() => { S.profile.genres = has ? S.profile.genres.filter((g) => g !== id) : [...S.profile.genres, id]; })(el);
    },
    recheck: () => skillCheck(settings),
    export: () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `piano-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    reset: () => {
      if (!confirm('Erase all progress and settings on this device?')) return;
      localStorage.removeItem(KEY);
      S = load();
      applyTheme();
      home();
    },
  });
  document.getElementById('imp').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.v !== 1 || !data.profile || !data.settings) throw new Error('wrong file');
      localStorage.setItem(KEY, JSON.stringify(data));
      S = load();
      applyTheme();
      toast('Backup restored.');
      settings();
    } catch {
      toast('That file is not a backup from this app.');
    }
  });
}

// ---------------------------------------------------------------- start

document.addEventListener('visibilitychange', () => {
  if (document.hidden) silence();
  else applyTheme();
});
applyTheme();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
const boot = () => home();
if (window.Vex) boot();
else window.addEventListener('DOMContentLoaded', boot);
