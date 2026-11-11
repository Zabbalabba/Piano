// How the app hears you: MIDI keyboard, microphone, or not at all.

import { audio } from './audio.js';
import { hann, rms, notePresent } from './detect.js';

const state = { mode: 'none', midi: null, stream: null, analyser: null, source: null, buf: null, win: null, winAt: -1 };
const listeners = new Set();

export const midiSupported = () => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
export const micSupported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export function onNote(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function onMidi(msg) {
  const [status, note, vel] = msg.data;
  if ((status & 0xf0) === 0x90 && vel > 0) for (const cb of listeners) cb(note);
}

export function midiDevices() {
  return state.midi ? [...state.midi.inputs.values()].map((i) => i.name) : [];
}

// Returns { ok, message }.
export async function startInput(mode) {
  stopInput();
  if (mode === 'midi') {
    if (!midiSupported()) return { ok: false, message: 'This browser cannot use MIDI.' };
    try {
      state.midi = await navigator.requestMIDIAccess();
      const hook = () => { for (const i of state.midi.inputs.values()) i.onmidimessage = onMidi; };
      hook();
      state.midi.onstatechange = hook;
      state.mode = 'midi';
      const names = midiDevices();
      return names.length ? { ok: true, message: `Connected: ${names.join(', ')}` } : { ok: true, message: 'MIDI is on, but no keyboard was found yet.' };
    } catch {
      return { ok: false, message: 'MIDI permission was not given.' };
    }
  }
  if (mode === 'mic') {
    if (!micSupported()) return { ok: false, message: 'This browser cannot use the microphone.' };
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = audio();
      state.source = ctx.createMediaStreamSource(state.stream);
      state.analyser = ctx.createAnalyser();
      state.analyser.fftSize = 8192;
      state.analyser.smoothingTimeConstant = 0;
      state.source.connect(state.analyser);
      state.buf = new Float32Array(state.analyser.fftSize);
      state.mode = 'mic';
      return { ok: true, message: 'Microphone is on.' };
    } catch {
      return { ok: false, message: 'Microphone permission was not given.' };
    }
  }
  state.mode = 'none';
  return { ok: true, message: '' };
}

export function stopInput() {
  if (state.midi) for (const i of state.midi.inputs.values()) i.onmidimessage = null;
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  if (state.source) state.source.disconnect();
  Object.assign(state, { mode: 'none', midi: null, stream: null, analyser: null, source: null, win: null, winAt: -1 });
}

export const inputMode = () => state.mode;

function window_() {
  const ctx = audio();
  if (state.winAt !== ctx.currentTime) {
    state.analyser.getFloatTimeDomainData(state.buf);
    state.level = rms(state.buf);
    state.win = hann(state.buf);
    state.winAt = ctx.currentTime;
  }
  return state.win;
}

// Microphone only: is this note sounding right now?
export function hears(midi) {
  if (state.mode !== 'mic') return false;
  const win = window_();
  if (state.level < 0.004) return false;
  return notePresent(win, audio().sampleRate, midi);
}

export function micLevel() {
  if (state.mode !== 'mic') return 0;
  window_();
  return state.level;
}
