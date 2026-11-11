// The exercise player: transport, metronome, guide sound, scoring, and the two views
// (falling keys on a canvas, or scrolling sheet music).

import { parseExercise, isBlackKey, midiToName } from './music.js';
import { audio, playNote, click, silence } from './audio.js';
import { renderSheet, cursorX } from './sheet.js';
import { onNote, hears, inputMode } from './input.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createPlayer({ item, stage, bpm, view, hands = 'B', guide = true, metronome = true, onPass, onState }) {
  const p = parseExercise(item);
  const countIn = p.barBeats;
  const cycle = countIn + p.totalBeats;
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
  const spb = () => 60 / bpm;
  const beatNow = () => (audio().currentTime - t0) / spb();

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
        sheet = renderSheet(paper, item, hands);
        paper.style.width = sheet.width + 'px';
        sheetWrap.classList.toggle('single', sheet.height < 200);
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

  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
  }
  const ro = new ResizeObserver(() => { if (view === 'keys') { resize(); draw(); } });
  ro.observe(stage);

  // ---- audio scheduling
  function schedule() {
    const now = beatNow();
    const horizon = now + 0.25 / spb();
    const c0 = Math.floor(Math.max(0, scheduled) / cycle);
    const c1 = Math.floor(horizon / cycle);
    for (let c = c0; c <= c1; c++) {
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
        for (const e of active()) {
          const abs = base + countIn + e.t;
          if (abs < scheduled || abs >= horizon) continue;
          playNote(e.midi, t0 + abs * spb(), e.d * spb() * 0.95, e.hand === 'L' ? 0.6 : 0.78);
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
    const list = active();
    if (!list.length) return;
    const hits = list.filter((e) => marks.get(e) === 'hit').length;
    const wrong = inputMode() === 'midi' ? extras : 0;
    const score = Math.max(0, Math.round((100 * hits) / (list.length + wrong * 0.5)));
    if (onPass) onPass(score);
  }

  function track(pos) {
    const pass = Math.floor(beatNow() / cycle);
    if (pass !== passIndex) {
      if (passIndex >= 0) finishPass();
      passIndex = pass;
      marks = new Map();
      extras = 0;
    }
    if (!scoring()) return;
    const sec = spb();
    for (const e of active()) {
      if (marks.has(e)) continue;
      const dt = (pos - e.t) * sec;
      if (dt > WINDOW_AFTER()) marks.set(e, 'miss');
      else if (dt >= -WINDOW_BEFORE && inputMode() === 'mic' && hears(e.midi)) marks.set(e, 'hit');
    }
  }

  function midiIn(midi) {
    pressed.set(midi, performance.now());
    if (!playing || !scoring()) return;
    const pos = (beatNow() % cycle) - countIn;
    const sec = spb();
    let best = null;
    for (const e of active()) {
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
    const visible = Math.max(4, p.barBeats * 1.5);
    const ppb = lineY / visible;

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
        }
        g.globalAlpha = 1;
        if (c === 0 && playing && pos >= e.t && pos < e.t + e.d) sounding.set(e.midi, e.hand);
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

    if (playing && pos < 0) {
      const n = Math.floor((countIn + pos) / p.pulse) + 1;
      g.fillStyle = css('--text');
      g.globalAlpha = 0.85;
      g.font = '700 64px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(String(n), W / 2, lineY * 0.5);
      g.globalAlpha = 1;
    }
  }

  function drawSheet(pos) {
    if (!sheet) return;
    const x = cursorX(sheet.anchors, Math.max(0, pos));
    const lead = scroller.clientWidth * 0.3;
    const scroll = Math.max(0, Math.min(sheet.width - scroller.clientWidth, x - lead));
    if (playing) scroller.scrollLeft = scroll;
    cursor.style.transform = `translateX(${x - scroller.scrollLeft}px)`;
    cursor.style.opacity = playing ? 1 : 0.35;
    if (playing && pos < 0) {
      badge.textContent = String(Math.floor((countIn + pos) / p.pulse) + 1);
      badge.style.display = 'grid';
    } else badge.style.display = 'none';
  }

  function draw() {
    const pos = playing ? (beatNow() % cycle) - countIn : 0;
    if (view === 'keys') drawKeys(pos);
    else drawSheet(pos);
  }

  function frame() {
    if (!playing) return;
    const pos = (beatNow() % cycle) - countIn;
    track(pos);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing || destroyed) return;
    playing = true;
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
    draw();
    if (onState) onState(false);
  }

  const restart = (fn) => {
    const was = playing;
    stop();
    fn();
    if (was) play();
  };

  mount();

  return {
    play,
    stop,
    toggle: () => (playing ? stop() : play()),
    isPlaying: () => playing,
    setTempo: (v) => restart(() => { bpm = v; }),
    setHands: (v) => restart(() => { hands = v; mount(); }),
    setView: (v) => { view = v; mount(); },
    setGuide: (v) => restart(() => { guide = v; }),
    setMetronome: (v) => restart(() => { metronome = v; }),
    scoring,
    hasBothHands: () => !!p.rh && !!p.lh,
    destroy: () => { stop(); destroyed = true; ro.disconnect(); stage.innerHTML = ''; },
  };
}
