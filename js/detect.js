// Microphone note detection.
//
// Instead of guessing which single pitch is sounding (which fails on chords), this asks a narrower
// question: "is the note I expect present in what the microphone hears?" It measures the energy at
// a few harmonics of the expected note and compares each with the energy a semitone either side.

import { midiToFreq } from './music.js';

const SEMI = Math.pow(2, 1 / 12);

export function hann(buf) {
  const n = buf.length;
  const out = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    out[i] = buf[i] * w;
    energy += out[i] * out[i];
  }
  return { data: out, energy };
}

// Share of the windowed signal's energy found at one frequency (about 1 for a pure tone there).
export function energyAt(win, sampleRate, freq) {
  const { data, energy } = win;
  if (energy <= 0) return 0;
  const n = data.length;
  const coeff = 2 * Math.cos((2 * Math.PI * freq) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = data[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return (power * 3) / (energy * n);
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

// win: result of hann() on roughly 170 ms of audio.
export function notePresent(win, sampleRate, midi) {
  const f0 = midiToFreq(midi);
  const n = win.data.length;
  // Only use harmonics high enough that a semitone is clearly separated at this window length.
  const minFreq = (2.2 * sampleRate) / n / (SEMI - 1);
  let h = Math.max(1, Math.ceil(minFreq / f0));
  let found = 0;
  let checked = 0;
  for (; checked < 3; h++) {
    const f = f0 * h;
    if (f > Math.min(5000, sampleRate / 2 - 200)) break;
    checked += 1;
    const here = energyAt(win, sampleRate, f);
    if (here < 0.004) continue;
    const beside = Math.max(energyAt(win, sampleRate, f * SEMI), energyAt(win, sampleRate, f / SEMI));
    if (here > beside * 5) found += 1;
  }
  return checked > 0 && found >= Math.min(2, checked);
}
