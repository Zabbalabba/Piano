// Sound: a sampled grand piano (with a synthesised fallback while it loads), a metronome click and a chime.

import { midiToFreq } from './music.js';

let ctx = null;
let master = null;
let wave = null;
let silentEl = null;

export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    // A soft, piano-like harmonic series.
    const amps = [0, 1, 0.55, 0.3, 0.18, 0.1, 0.07, 0.04, 0.03, 0.02, 0.012];
    wave = ctx.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps));
  }
  return ctx;
}

// Must be called from a tap. Also tells iOS to play even when the ring switch is on silent.
export async function unlock(recording = false) {
  audio();
  loadPiano();
  try {
    if (navigator.audioSession) navigator.audioSession.type = recording ? 'play-and-record' : 'playback';
  } catch { /* not supported */ }
  if (ctx.state !== 'running') {
    try { await ctx.resume(); } catch { /* ignore */ }
  }
  if (!silentEl && !navigator.audioSession) {
    // Older iOS: a playing media element moves Web Audio off the muted "ringer" channel.
    silentEl = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA');
    silentEl.loop = true;
    silentEl.play().catch(() => {});
  }
  return ctx;
}

const live = new Set();

// ---- sampled piano: one recording every three semitones, pitched to the notes in between.
const SAMPLE_NOTES = [33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96];
const samples = new Map(); // midi -> { buffer, offset }
let loading = null;

// Where the sound actually starts, so notes are not late by the silence at the head of the file.
function onsetOf(buffer) {
  const data = buffer.getChannelData(0);
  const n = Math.min(data.length, Math.floor(buffer.sampleRate * 0.3));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = 0; i < n; i++) if (Math.abs(data[i]) > peak * 0.05) return Math.max(0, i / buffer.sampleRate - 0.002);
  return 0;
}

export function loadPiano() {
  if (loading) return loading;
  const c = audio();
  loading = Promise.all(SAMPLE_NOTES.map(async (m) => {
    try {
      const res = await fetch(`piano/${m}.mp3`);
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      const buffer = await new Promise((ok, fail) => {
        const p = c.decodeAudioData(raw, ok, fail);
        if (p && p.then) p.then(ok, fail);
      });
      samples.set(m, { buffer, offset: onsetOf(buffer) });
    } catch { /* this note falls back to its neighbours or the synth */ }
  })).then(() => samples.size);
  return loading;
}

export const pianoReady = () => samples.size > 0;

function playSampled(midi, t, seconds, velocity) {
  let best = null;
  for (const m of samples.keys()) if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  if (best === null || Math.abs(best - midi) > 4) return false;
  const c = ctx;
  const { buffer, offset } = samples.get(best);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, (midi - best) / 12);
  const gain = c.createGain();
  const level = 0.25 + velocity * 1.05;
  const hold = Math.max(0.12, seconds);
  gain.gain.setValueAtTime(level, t);
  gain.gain.setValueAtTime(level, t + hold);
  // Key release: the damper stops the string quickly but not instantly.
  gain.gain.setTargetAtTime(0, t + hold, 0.09);
  src.connect(gain).connect(master);
  src.start(t, offset);
  src.stop(t + hold + 0.7);
  const voice = { gain, osc: src, osc2: null };
  live.add(voice);
  src.onended = () => live.delete(voice);
  return true;
}

export function playNote(midi, when, seconds, velocity = 0.7) {
  const c = audio();
  const t = Math.max(when, c.currentTime);
  if (samples.size && playSampled(midi, t, seconds, velocity)) return;
  const f = midiToFreq(midi);
  const osc = c.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = f;
  const osc2 = c.createOscillator();
  osc2.setPeriodicWave(wave);
  osc2.frequency.value = f;
  osc2.detune.value = 4;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const bright = Math.min(9000, f * 7 + 900);
  filter.frequency.setValueAtTime(bright, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2), t + 0.9);
  const gain = c.createGain();
  // Lower notes ring longer, as on a real piano.
  const decay = Math.max(0.5, 2.6 - (midi - 36) * 0.03);
  const peak = velocity * 0.32 * (midi < 48 ? 1.15 : 1);
  const hold = Math.max(0.08, seconds);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * Math.exp(-hold / decay)), t + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.18);
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain).connect(master);
  osc.start(t);
  osc2.start(t);
  osc.stop(t + hold + 0.2);
  osc2.stop(t + hold + 0.2);
  const voice = { gain, osc, osc2 };
  live.add(voice);
  osc.onended = () => live.delete(voice);
}

export function click(when, accent = false) {
  const c = audio();
  const t = Math.max(when, c.currentTime);
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = accent ? 1760 : 1320;
  const g = c.createGain();
  g.gain.setValueAtTime(accent ? 0.16 : 0.09, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.05);
  const voice = { gain: g, osc, osc2: null };
  live.add(voice);
  osc.onended = () => live.delete(voice);
}

export function chime() {
  const c = audio();
  const t = c.currentTime + 0.02;
  [76, 81, 88].forEach((m, i) => playNote(m, t + i * 0.09, 0.5, 0.35));
}

// Cut everything that is sounding or scheduled.
export function silence() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const v of live) {
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(0.0001, t);
      v.osc.stop(t + 0.02);
      if (v.osc2) v.osc2.stop(t + 0.02);
    } catch { /* already stopped */ }
  }
  live.clear();
}

// Play a list of {t, d, midi} events (in beats) once. Returns a stop function.
export function playEvents(events, bpm, onEnd) {
  const c = audio();
  const spb = 60 / bpm;
  const t0 = c.currentTime + 0.08;
  let end = 0;
  for (const e of events) {
    playNote(e.midi, t0 + e.t * spb, e.d * spb, e.hand === 'L' ? 0.6 : 0.78);
    end = Math.max(end, (e.t + e.d) * spb);
  }
  const timer = setTimeout(() => onEnd && onEnd(), (end + 0.4) * 1000);
  return () => {
    clearTimeout(timer);
    silence();
  };
}
