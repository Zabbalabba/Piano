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

// Strongest energy close to a frequency. Real pianos are tuned progressively sharp towards the top
// and their overtones run sharper still, so the search reaches further up the higher it looks.
function peakNear(win, sampleRate, freq) {
  const up = Math.min(40, 6 + freq / 60); // cents
  const down = -8;
  const stepHz = sampleRate / win.data.length / 2;
  const steps = Math.max(1, Math.ceil((freq * (Math.pow(2, up / 1200) - Math.pow(2, down / 1200))) / stepHz));
  let best = 0;
  for (let i = 0; i <= steps; i++) {
    const cents = down + ((up - down) * i) / steps;
    best = Math.max(best, energyAt(win, sampleRate, freq * Math.pow(2, cents / 1200)));
  }
  return best;
}

// win: result of hann() on roughly 170 ms of audio.
export function notePresent(win, sampleRate, midi) {
  const f0 = midiToFreq(midi);
  const n = win.data.length;
  // Only use harmonics high enough that a semitone is clearly separated at this window length.
  const minFreq = (2.2 * sampleRate) / n / (SEMI - 1);
  const first = Math.max(1, Math.ceil(minFreq / f0));
  let found = 0;
  let checked = 0;
  let fundamental = 0;
  for (let h = first; checked < 3; h++) {
    const f = f0 * h;
    if (f > Math.min(5000, sampleRate / 2 - 200)) break;
    checked += 1;
    const here = peakNear(win, sampleRate, f);
    if (here < 0.004) continue;
    const beside = Math.max(peakNear(win, sampleRate, f * SEMI), peakNear(win, sampleRate, f / SEMI));
    if (here > beside * 5) {
      found += 1;
      if (h === 1) fundamental = here;
    }
  }
  // High notes on a real piano are almost a pure tone: a dominant fundamental is enough there.
  if (fundamental > 0.12) return true;
  return checked > 0 && found >= Math.min(2, checked);
}
