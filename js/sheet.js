// Sheet music view, drawn with VexFlow as one long line that scrolls under a fixed cursor.

import { parseExercise, swingBeat } from './music.js';

const VF = () => window.Vex.Flow;
const DUR = { w: 'w', h: 'h', q: 'q', e: '8', s: '16' };
const key = (name) => {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d)$/.exec(name);
  return `${m[1].toLowerCase()}${m[2] || ''}/${m[3]}`;
};

function makeNotes(bar, clef) {
  const F = VF();
  return bar.map((tok) => {
    const duration = DUR[tok.dur] + (tok.dots ? 'd' : '') + (tok.rest ? 'r' : '');
    const keys = tok.rest ? [clef === 'treble' ? 'b/4' : 'd/3'] : tok.notes.map(key);
    const note = new F.StaveNote({ clef, keys, duration, auto_stem: true });
    if (tok.dots) F.Dot.buildAndAttach([note], { all: true });
    return note;
  });
}

// Draws the exercise into `host` and returns { anchors, width, height }.
// anchors map a playback beat to an x position, for the cursor.
export function renderSheet(host, item, hands = 'B') {
  const F = VF();
  const p = parseExercise(item);
  host.innerHTML = '';
  const showR = !!p.rh && hands !== 'L';
  const showL = !!p.lh && hands !== 'R';
  const voices = [];
  if (showR || (!showL && p.rh)) voices.push({ bars: p.rh, clef: 'treble' });
  if (showL || (!showR && p.lh && !voices.length)) voices.push({ bars: p.lh, clef: 'bass' });
  const two = voices.length === 2;
  const keySig = item.key || 'C';
  const height = two ? 250 : 150;

  const widths = [];
  for (let b = 0; b < p.nBars; b++) {
    const n = Math.max(...voices.map((v) => v.bars[b].length));
    widths.push(Math.max(120, 44 + n * 36) + (b === 0 ? 86 : 0));
  }
  const pad = 14;
  const width = widths.reduce((a, w) => a + w, 0) + pad * 2;
  const renderer = new F.Renderer(host, F.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const anchors = [];
  let x = pad;
  const tsStr = `${p.ts[0]}/${p.ts[1]}`;
  const beamGroups = p.ts[1] === 8 ? [new F.Fraction(3, 8)] : undefined;

  for (let b = 0; b < p.nBars; b++) {
    const staves = voices.map((v, i) => {
      const stave = new F.Stave(x, 16 + i * 100, widths[b]);
      if (b === 0) stave.addClef(v.clef).addKeySignature(keySig).addTimeSignature(tsStr);
      if (b === p.nBars - 1) stave.setEndBarType(F.Barline.type.END);
      return stave;
    });
    const startX = Math.max(...staves.map((s) => s.getNoteStartX()));
    staves.forEach((s) => s.setNoteStartX(startX));
    staves.forEach((s) => s.setContext(ctx).draw());
    if (two) {
      if (b === 0) new F.StaveConnector(staves[0], staves[1]).setType(F.StaveConnector.type.BRACE).setContext(ctx).draw();
      new F.StaveConnector(staves[0], staves[1]).setType(F.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      new F.StaveConnector(staves[0], staves[1])
        .setType(b === p.nBars - 1 ? F.StaveConnector.type.BOLD_DOUBLE_RIGHT : F.StaveConnector.type.SINGLE_RIGHT)
        .setContext(ctx).draw();
    }

    const built = voices.map((v) => {
      const notes = makeNotes(v.bars[b], v.clef);
      const voice = new F.Voice({ num_beats: p.ts[0], beat_value: p.ts[1] }).setStrict(false);
      voice.addTickables(notes);
      F.Accidental.applyAccidentals([voice], keySig);
      const beams = F.Beam.generateBeams(notes, beamGroups ? { groups: beamGroups } : {});
      return { notes, voice, beams };
    });
    const formatter = new F.Formatter();
    built.forEach((v) => formatter.joinVoices([v.voice]));
    formatter.format(built.map((v) => v.voice), staves[0].getNoteEndX() - startX - 12);
    built.forEach((v, i) => {
      v.voice.draw(ctx, staves[i]);
      v.beams.forEach((beam) => beam.setContext(ctx).draw());
      let t = b * p.barBeats;
      v.notes.forEach((note, k) => {
        const beat = item.swing ? swingBeat(t) : t;
        anchors.push({ beat, x: note.getAbsoluteX() + 6 });
        t += voices[i].bars[b][k].beats;
      });
    });
    x += widths[b];
  }
  anchors.push({ beat: p.totalBeats, x: x - 4 });
  anchors.sort((a, b) => a.beat - b.beat || a.x - b.x);
  // Keep x increasing with the beat so the cursor never moves backwards.
  const clean = [];
  for (const a of anchors) {
    const last = clean[clean.length - 1];
    if (last && Math.abs(last.beat - a.beat) < 1e-6) continue;
    clean.push({ beat: a.beat, x: last ? Math.max(a.x, last.x) : a.x });
  }
  return { anchors: clean, width, height };
}

export function cursorX(anchors, beat) {
  if (beat <= anchors[0].beat) return anchors[0].x;
  for (let i = 1; i < anchors.length; i++) {
    if (beat <= anchors[i].beat) {
      const a = anchors[i - 1];
      const b = anchors[i];
      return a.x + ((beat - a.beat) / (b.beat - a.beat)) * (b.x - a.x);
    }
  }
  return anchors[anchors.length - 1].x;
}

// A single note on a short stave, for the note-reading practice.
export function renderNote(host, clef, name) {
  const F = VF();
  host.innerHTML = '';
  const renderer = new F.Renderer(host, F.Renderer.Backends.SVG);
  renderer.resize(200, 190);
  const ctx = renderer.getContext();
  const stave = new F.Stave(10, 40, 180);
  stave.addClef(clef).setContext(ctx).draw();
  const note = new F.StaveNote({ clef, keys: [key(name)], duration: 'w' });
  const voice = new F.Voice({ num_beats: 4, beat_value: 4 }).addTickables([note]);
  new F.Formatter().joinVoices([voice]).format([voice], 80);
  voice.draw(ctx, stave);
}
