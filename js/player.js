// The exercise player: transport, metronome, guide sound, scoring, and the two views
// (falling keys on a canvas, or scrolling sheet music).

import { parseExercise, isBlackKey, midiToName } from './music.js';
import { audio, playNote, click, silence, resumeIfPaused } from './audio.js';
import { renderSheet, cursorX, beatAtX } from './sheet.js';
import { onNote, hears, inputMode } from './input.js';

// Shown when the phone paused the sound and it could not be restarted without a tap.
const defaultStall = () => {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = 'The phone paused the sound. Tap Play to start again.';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
};

// Every player on screen, so they can all be stopped when the app goes into the background.
const players = new Set();
export function stopAllPlayers() { for (const p of players) p.stop(); }

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createPlayer({ item, stage, bpm, view, hands = 'B', guide = true, metronome = true, fingers = true, once = false, onPass, onState, onEnd, onPosition, onStall = defaultStall }) {
  const p = parseExercise(item);
  const countIn = p.barBeats;
  // Where you are in the exercise while stopped (in beats), and where playing starts and loops back
  // to: the start of the bar you are in. Drag the notes or step with the arrows to move.
  let at = 0;
  let from = 0;
  const cycleLen = () => countIn + p.totalBeats - from;
  let playing = false;
  let t0 = 0;
  let scheduled = 0; // absolute beat up to which audio has been queued
  let timer = null;
  let raf = null;
  let passIndex = -1;
  let marks = new Map(); // event -> 'hit' | 'miss'
  let extras = 0;
  let pressed = new Map(); // midi -> time, recent MIDI key presses to light up
  let offNote = null;
  let sheet = null;
  let destroyed = false;

  const canvas = document.createElement('canvas');
  canvas.className = 'keys-canvas';
  const sheetWrap = document.createElement('div');
  sheetWrap.className = 'sheet-wrap';
  sheetWrap.innerHTML = '<div class="sheet-scroll"><div class="sheet-paper"></div></div><div class="sheet-cursor"></div><div class="count-badge"></div>';
  const paper = sheetWrap.querySelector('.sheet-paper');
  const scroller = sheetWrap.querySelector('.sheet-scroll');
  const cursor = sheetWrap.querySelector('.sheet-cursor');
  const badge = sheetWrap.querySelector('.count-badge');

  const active = () => p.events.filter((e) => hands === 'B' || e.hand === hands);
  const inPlay = () => active().filter((e) => e.t >= from - 1e-6);
  // Position in the exercise while playing; negative during the count-in before `from`.
  const posNow = () => from + (beatNow() % cycleLen()) - countIn;
  const spb = () => 60 / bpm;
  // Never before the start: in the first instant the clock can be just short of t0.
  const beatNow = () => Math.max(0, (audio().currentTime - t0) / spb());

  // ---- keyboard geometry
  let lo = Math.min(...p.events.map((e) => e.midi));
  let hi = Math.max(...p.events.map((e) => e.midi));
  lo -= lo % 12;
  hi += 11 - (hi % 12);
  while (hi - lo < 23) hi += 12;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);

  function mount() {
    stage.innerHTML = '';
    if (view === 'sheet') {
      stage.appendChild(sheetWrap);
      try {
        sheet = renderSheet(paper, item, hands, fingers);
        paper.style.width = sheet.width + 'px';
        fitSheet();
        sheetWrap.classList.toggle('single', sheet.height < 230);
      } catch (err) {
        paper.textContent = 'Could not draw the sheet music for this exercise.';
        console.error(err);
        sheet = null;
      }
    } else {
      stage.appendChild(canvas);
      resize();
    }
    draw();
  }

  // Shrink the sheet to the height available, so nothing (finger numbers included) is cut off.
  function fitSheet() {
    if (!sheet) return;
    const room = stage.clientHeight - 8;
    sheet.scale = room > 0 ? Math.min(1, room / sheet.height) : 1;
    paper.style.zoom = sheet.scale;
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
  }
  const ro = new ResizeObserver(() => { if (view === 'keys') resize(); else fitSheet(); draw(); });
  ro.observe(stage);

  // ---- audio scheduling
  function schedule() {
    const now = beatNow();
    const horizon = now + 0.25 / spb();
    const cycle = cycleLen();
    const c0 = Math.floor(Math.max(0, scheduled) / cycle);
    const c1 = Math.floor(horizon / cycle);
    for (let c = c0; c <= c1; c++) {
      if (once && c > 0) break;
      const base = c * cycle;
      for (let b = 0; b < cycle - 1e-6; b += p.pulse) {
        const abs = base + b;
        if (abs < scheduled || abs >= horizon) continue;
        const inCount = b < countIn - 1e-6;
        if (inCount || metronome) {
          const accent = Math.abs((b % p.barBeats)) < 1e-6;
          click(t0 + abs * spb(), accent);
        }
      }
      if (guide) {
        for (const e of inPlay()) {
          const abs = base + countIn + e.t - from;
          if (abs < scheduled || abs >= horizon) continue;
          playNote(e.midi, t0 + abs * spb(), e.d * spb(), e.hand === 'L' ? 0.58 : 0.78, 0.16);
        }
      }
    }
    scheduled = horizon;
  }

  // ---- scoring
  const scoring = () => inputMode() !== 'none' && !(inputMode() === 'mic' && guide);
  const WINDOW_BEFORE = 0.14;
  const WINDOW_AFTER = () => (inputMode() === 'mic' ? 0.45 : 0.22);

  function finishPass() {
    if (!scoring()) return;
    const list = inPlay();
    if (!list.length) return;
    const hits = list.filter((e) => marks.get(e) === 'hit').length;
    const wrong = inputMode() === 'midi' ? extras : 0;
    const score = Math.max(0, Math.round((100 * hits) / (list.length + wrong * 0.5)));
    if (onPass) onPass(score);
  }

  function track(pos) {
    const pass = Math.floor(beatNow() / cycleLen());
    if (pass !== passIndex) {
      if (passIndex >= 0) finishPass();
      passIndex = pass;
      marks = new Map();
      extras = 0;
    }
    if (!scoring()) return;
    const sec = spb();
    for (const e of inPlay()) {
      if (marks.has(e)) continue;
      const dt = (pos - e.t) * sec;
      if (dt > WINDOW_AFTER()) marks.set(e, 'miss');
      else if (dt >= -WINDOW_BEFORE && inputMode() === 'mic' && hears(e.midi)) marks.set(e, 'hit');
    }
  }

  function midiIn(midi) {
    pressed.set(midi, performance.now());
    if (!playing || !scoring()) return;
    const pos = posNow();
    const sec = spb();
    let best = null;
    for (const e of inPlay()) {
      if (e.midi !== midi || marks.has(e)) continue;
      const dt = Math.abs(pos - e.t) * sec;
      if (dt <= 0.22 && (!best || dt < best.dt)) best = { e, dt };
    }
    if (best) marks.set(best.e, 'hit');
    else if (pos > -0.2) extras += 1;
  }

  // ---- drawing
  function drawKeys(pos) {
    const g = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const kbH = Math.min(120, Math.max(64, H * 0.24));
    const lineY = H - kbH;
    const ww = W / whites.length;
    const bw = ww * 0.62;
    const keyX = (m) => {
      if (!isBlackKey(m)) return { x: whites.indexOf(m) * ww, w: ww };
      return { x: (whites.indexOf(m - 1) + 1) * ww - bw / 2, w: bw };
    };
    const colR = css('--rh');
    const colL = css('--lh');
    // Show fewer beats ahead on a short stage, so notes stay big enough to read their finger numbers.
    const visible = Math.max(2.5, Math.min(Math.max(4, p.barBeats * 1.5), (H - Math.min(120, Math.max(64, H * 0.24))) / 30));
    const ppb = lineY / visible;
    lastPpb = ppb;
    const cycle = cycleLen();

    // lanes for the C keys and bar lines
    g.strokeStyle = css('--line');
    g.lineWidth = 1;
    for (const m of whites) {
      if (m % 12 === 0) {
        const { x } = keyX(m);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, lineY);
        g.stroke();
      }
    }
    for (let c = 0; c < 2; c++) {
      for (let b = 0; b <= p.nBars; b++) {
        if (c > 0 && b * p.barBeats < from - 1e-6) continue;
        const y = lineY - (c * cycle + b * p.barBeats - pos) * ppb;
        if (y < 0 || y > lineY) continue;
        g.globalAlpha = 0.6;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    const sounding = new Map();
    const list = active();
    for (let c = 0; c < 2; c++) {
      for (const e of list) {
        if (c > 0 && (!playing || e.t < from - 1e-6)) continue;
        const t = e.t + c * cycle;
        const yBottom = lineY - (t - pos) * ppb;
        const h = Math.max(6, e.d * ppb - 3);
        if (yBottom < 0 || yBottom - h > lineY) continue;
        const { x, w } = keyX(e.midi);
        const mark = c === 0 ? marks.get(e) : null;
        g.fillStyle = mark === 'hit' ? css('--good') : mark === 'miss' ? css('--bad') : e.hand === 'R' ? colR : colL;
        g.globalAlpha = mark === 'miss' ? 0.55 : 1;
        const top = Math.max(0, yBottom - h);
        const bottom = Math.min(lineY, yBottom);
        if (bottom > top) {
          g.beginPath();
          g.roundRect(x + 1.5, top, w - 3, bottom - top, 4);
          g.fill();
          if (fingers && e.f && bottom - top >= 11 && w >= 10) {
            const size = Math.min(14, Math.round(w * 0.62), Math.round(bottom - top - 2));
            g.fillStyle = css('--on-note');
            g.font = `700 ${size}px system-ui, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'alphabetic';
            g.fillText(String(e.f), x + w / 2, bottom - Math.max(2, (bottom - top - size) / 2));
          }
        }
        g.globalAlpha = 1;
        if (c === 0 && pos >= e.t - 1e-6 && pos < e.t + e.d) sounding.set(e.midi, e.hand);
      }
    }

    // keyboard
    const now = performance.now();
    const drawKey = (m, black) => {
      const { x, w } = keyX(m);
      const h = black ? kbH * 0.62 : kbH;
      const hand = sounding.get(m);
      const tapped = pressed.has(m) && now - pressed.get(m) < 180;
      g.fillStyle = hand ? (hand === 'R' ? colR : colL) : tapped ? css('--good') : black ? css('--key-black') : css('--key-white');
      g.beginPath();
      g.roundRect(x + 0.5, lineY, w - 1, h, [0, 0, 4, 4]);
      g.fill();
      if (!black) {
        g.strokeStyle = css('--key-edge');
        g.stroke();
        if (m % 12 === 0) {
          g.fillStyle = css('--key-label');
          g.font = '600 10px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillText(midiToName(m), x + w / 2, lineY + h - 7);
        }
      }
    };
    whites.forEach((m) => drawKey(m, false));
    for (let m = lo; m <= hi; m++) if (isBlackKey(m)) drawKey(m, true);
    g.fillStyle = css('--accent');
    g.fillRect(0, lineY - 2, W, 2);

    if (playing && pos < from) {
      const n = Math.floor((countIn + pos - from) / p.pulse) + 1;
      g.fillStyle = css('--text');
      g.globalAlpha = 0.85;
      g.font = '700 64px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(String(n), W / 2, lineY * 0.5);
      g.globalAlpha = 1;
    }
  }

  function drawSheet(pos, follow) {
    if (!sheet) return;
    const scale = sheet.scale || 1;
    const x = cursorX(sheet.anchors, Math.max(from, pos)) * scale;
    const lead = scroller.clientWidth * 0.3;
    const scroll = Math.max(0, Math.min(sheet.width * scale - scroller.clientWidth, x - lead));
    if (follow && Math.abs(scroller.scrollLeft - scroll) > 0.5) {
      ignoreScrollUntil = performance.now() + 120;
      scroller.scrollLeft = scroll;
    }
    cursor.style.transform = `translateX(${x - scroller.scrollLeft}px)`;
    cursor.style.opacity = playing ? 1 : 0.8;
    if (playing && pos < from) {
      badge.textContent = String(Math.floor((countIn + pos - from) / p.pulse) + 1);
      badge.style.display = 'grid';
    } else badge.style.display = 'none';
  }

  function draw(follow = true) {
    const pos = playing ? posNow() : at;
    if (view === 'keys') drawKeys(pos);
    else drawSheet(pos, follow);
  }

  // ---- moving through the exercise while stopped
  let lastPpb = 40;
  let ignoreScrollUntil = 0;
  const report = () => { if (onPosition) onPosition(position()); };
  function position() {
    return { beat: at, bar: Math.min(p.nBars, Math.floor(at / p.barBeats + 1e-6) + 1), nBars: p.nBars, atStart: at < 1e-6 };
  }
  const lastOnset = Math.max(...p.events.map((e) => e.t));
  function setPosition(beat, follow = true) {
    // No further than the last note, so playing from here never runs off the end.
    at = Math.max(0, Math.min(lastOnset, beat));
    draw(follow);
    report();
  }
  // Step to the next (or previous) note or chord and sound it.
  function step(dir) {
    if (playing) return;
    const onsets = [...new Set(active().map((e) => e.t))].sort((a, b) => a - b);
    const target = dir > 0 ? onsets.find((t) => t > at + 1e-6) : [...onsets].reverse().find((t) => t < at - 1e-6);
    setPosition(target === undefined ? (dir > 0 ? at : 0) : target);
    const now = audio().currentTime + 0.02;
    for (const e of active()) {
      if (Math.abs(e.t - at) < 1e-6) playNote(e.midi, now, Math.min(1.2, e.d * spb()), e.hand === 'L' ? 0.58 : 0.78, 0.25);
    }
  }
  // Keys view: drag the falling notes up or down. Sheet view: scroll the music sideways.
  let drag = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (playing) return;
    drag = { y: ev.clientY, at };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag || playing) return;
    setPosition(drag.at + (ev.clientY - drag.y) / lastPpb);
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  scroller.addEventListener('scroll', () => {
    if (playing || !sheet || performance.now() < ignoreScrollUntil) return;
    const scale = sheet.scale || 1;
    const lead = scroller.clientWidth * 0.3;
    setPosition(beatAtX(sheet.anchors, (scroller.scrollLeft + lead) / scale), false);
  }, { passive: true });

  // Watchdog: if the audio clock stops moving (the phone paused the sound), try to restart it, and
  // if that does not work, stop and say so instead of sitting frozen.
  let clockAt = -1;
  let clockSeen = 0;
  let stalledSince = 0;
  function watchClock() {
    const now = performance.now();
    const ct = audio().currentTime;
    if (ct !== clockAt) {
      clockAt = ct;
      clockSeen = now;
      stalledSince = 0;
      return true;
    }
    if (now - clockSeen < 250) return true;
    if (!stalledSince) {
      stalledSince = now;
      resumeIfPaused();
    }
    if (now - stalledSince > 1500) {
      stop();
      if (onStall) onStall();
      return false;
    }
    return true;
  }

  function frame() {
    if (!playing) return;
    if (!watchClock()) return;
    if (once && beatNow() >= cycleLen()) {
      stop();
      if (onEnd) onEnd();
      return;
    }
    const pos = posNow();
    track(pos);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing || destroyed) return;
    // Start (and loop back to) the beginning of the bar you are in.
    from = Math.floor(at / p.barBeats + 1e-6) * p.barBeats;
    if (from >= p.totalBeats - 1e-6) from = 0;
    playing = true;
    resumeIfPaused();
    clockAt = -1;
    clockSeen = performance.now();
    stalledSince = 0;
    t0 = audio().currentTime + 0.12;
    scheduled = 0;
    passIndex = -1;
    marks = new Map();
    offNote = onNote(midiIn);
    timer = setInterval(schedule, 25);
    schedule();
    raf = requestAnimationFrame(frame);
    if (onState) onState(true);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    if (offNote) offNote();
    silence();
    marks = new Map();
    at = from;
    draw();
    report();
    if (onState) onState(false);
  }

  const restart = (fn) => {
    const was = playing;
    stop();
    fn();
    if (was) play();
  };

  mount();

  const api = {
    play,
    stop,
    toggle: () => (playing ? stop() : play()),
    isPlaying: () => playing,
    setTempo: (v) => restart(() => { bpm = v; }),
    setHands: (v) => restart(() => { hands = v; mount(); }),
    setView: (v) => { view = v; mount(); },
    setGuide: (v) => restart(() => { guide = v; }),
    setMetronome: (v) => restart(() => { metronome = v; }),
    setFingers: (v) => { fingers = v; mount(); },
    setOnce: (v) => restart(() => { once = v; }),
    step,
    setPosition: (beat) => { if (!playing) setPosition(beat); },
    position,
    scoring,
    hasBothHands: () => !!p.rh && !!p.lh,
    destroy: () => { stop(); destroyed = true; ro.disconnect(); stage.innerHTML = ''; players.delete(api); },
  };
  players.add(api);
  return api;
}
