// The exercise repertoire.
//
// Genres marked pedal: true have their samples played with the sustain pedal, as is usual for them.
//
// Every item: id, t (title), lv (1 beginner .. 3 early intermediate), bpm (target, in quarter
// notes), optional ts / key / swing, rh / lh in the notation described in music.js,
// focus (what it trains and why it is here) and tip (how to practise it).
// Pieces additionally carry src (where the music comes from) and perf (performance tempo).

import { pat, seq, rep, bars, scaleNotes, transposeNote, noteToMidi, isBlackKey } from './music.js';

export const GENRES = [
  { id: 'classical', pedal: true, name: 'Classical', blurb: 'Clear melodies, even fingers, Alberti bass.' },
  { id: 'jazz', name: 'Jazz', blurb: 'Swing feel, shell voicings, ii–V–I.' },
  { id: 'blues', name: 'Blues & Boogie-woogie', blurb: '12-bar form, shuffle, blues scale.' },
  { id: 'ragtime', name: 'Ragtime & Stride', blurb: 'Oom-pah left hand, syncopated right.' },
  { id: 'pop', pedal: true, name: 'Pop', blurb: 'Four-chord songs, broken chords, steady pulse.' },
  { id: 'rock', name: 'Rock', blurb: 'Power chords, driving eighths, riffs.' },
  { id: 'gospel', pedal: true, name: 'Gospel', blurb: 'Rich cadences, walk-ups, 12/8 feel.' },
  { id: 'rnb', pedal: true, name: 'R&B & Soul', blurb: 'Seventh chords, backbeat, slow grooves.' },
  { id: 'funk', name: 'Funk', blurb: 'Tight off-beats and locking in on the one.' },
  { id: 'latin', name: 'Latin', blurb: 'Bossa nova, habanera and montuno patterns.' },
  { id: 'folk', pedal: true, name: 'Folk & Singer-songwriter', blurb: 'Open chords, waltz time, song accompaniment.' },
  { id: 'country', name: 'Country', blurb: 'Boom-chick bass, pentatonic tunes, slip notes.' },
  { id: 'film', pedal: true, name: 'Film, Neo-classical & Ambient', blurb: 'Slow arpeggios, ostinatos, space.' },
];

// ---------------------------------------------------------------- technique (warm-up track)

const upDown = (notes) => [...notes, ...[...notes].reverse()];
const fingered = (notes, fingers) => notes.map((n, i) => `${n}@${fingers[i]}`);
// Standard scale fingerings, going up. Going down uses the same fingers in reverse.
const SCALE_FINGERS = {
  R: { default: [1, 2, 3, 1, 2, 3, 4, 5], F: [1, 2, 3, 4, 1, 2, 3, 4] },
  L: { default: [5, 4, 3, 2, 1, 3, 2, 1] },
};
const scaleFingers = (root, hand) => SCALE_FINGERS[hand][root] || SCALE_FINGERS[hand].default;
const inBars = (notes, per = 4, dur = 'q') => {
  const out = [];
  for (let i = 0; i < notes.length; i += per) {
    out.push(notes.slice(i, i + per).map((n, j) => (i === 0 && j === 0 ? `${n}/${dur}` : n)).join(' '));
  }
  return out.join(' | ');
};
const scaleUpDown = (root, mode, hand) =>
  upDown(fingered(scaleNotes(root, mode), scaleFingers(root.replace(/\d/, ''), hand)));
const scaleLine = (root, mode, hand = 'R') => inBars(scaleUpDown(root, mode, hand));
const SCALE_TIP_R = 'Right hand fingering up: 1-2-3, thumb under, 1-2-3-4-5. Same fingers back down.';
const SCALE_TIP_L = 'Left hand fingering up: 5-4-3-2-1, third finger over, 3-2-1. Same fingers back down.';
const SCALE_TIP_HT = 'Slow enough that both hands land exactly together. ' + SCALE_TIP_R + ' ' + SCALE_TIP_L;

function scaleItem(id, name, root, mode, lv, bpm, hands, tip, gain) {
  const r = scaleLine(root + '4', mode, 'R');
  const l = scaleLine(root + '3', mode, 'L');
  return {
    id, lv, bpm,
    t: `${name} scale, ${hands === 'R' ? 'right hand' : hands === 'L' ? 'left hand' : 'hands together'}`,
    key: mode === 'major' ? root : undefined,
    rh: hands !== 'L' ? r : '',
    lh: hands !== 'R' ? l : '',
    focus: 'Scales build finger independence and teach you the layout of a key.',
    gain: gain || 'Makes the thumb passing under automatic, which helps runs and melodies in this key.',
    tip: tip || (hands === 'R' ? SCALE_TIP_R : hands === 'L' ? SCALE_TIP_L : SCALE_TIP_HT),
  };
}

const TECHNIQUE = [
  {
    id: 'tq-five-r', lv: 1, bpm: 80, t: 'Five-finger pattern, right hand',
    rh: 'C4/q D4 E4 F4 | G4 F4 E4 D4 | C4 E4 G4 E4 | C4/w',
    focus: 'One finger per key, in the hand position a lot of beginner music starts from.',
    gain: 'Builds even, independent fingers and a sense of where each finger sits without looking.',
    tip: 'Thumb on middle C. Curved fingers, press from the fingertip, keep the wrist loose.',
  },
  {
    id: 'tq-five-l', lv: 1, bpm: 80, t: 'Five-finger pattern, left hand',
    lh: 'C3/q D3 E3 F3 | G3 F3 E3 D3 | C3 E3 G3 E3 | C3/w',
    focus: 'The same pattern for the left hand, which for most people is the weaker one.',
    gain: 'Brings your left hand closer to your right, so it can take on bass lines and chords later.',
    tip: 'Little finger on the C below middle C. Aim for the same even tone as your right hand.',
  },
  {
    id: 'tq-five-ht', lv: 1, bpm: 72, t: 'Five-finger pattern, hands together',
    rh: 'C4/q D4 E4 F4 | G4 F4 E4 D4 | C4 E4 G4 E4 | C4/w',
    lh: 'C3/q D3 E3 F3 | G3 F3 E3 D3 | C3 E3 G3 E3 | C3/w',
    focus: 'Both hands moving in the same direction: a first step in coordination.',
    gain: 'Gets your hands used to moving together, which most later pieces build on.',
    tip: 'Listen for one sound per beat, not two. Slow down until that happens.',
  },
  {
    id: 'tq-triad-c', lv: 1, bpm: 72, t: 'C chord, broken and blocked',
    rh: 'C4/q E4 G4 E4 | C4+E4+G4/h C4+E4+G4 | C4/q E4 G4 E4 | C4+E4+G4/w',
    lh: 'C3/q E3 G3 E3 | C3+E3+G3/h C3+E3+G3 | C3/q E3 G3 E3 | C3+E3+G3/w',
    focus: 'Chords are a building block in nearly every genre. First feel the shape, then play it at once.',
    gain: 'Teaches your hand the chord shape, so later you can find chords by feel.',
    tip: 'Fingers 1-3-5 in the right hand, 5-3-1 in the left. All three notes should sound at the same instant.',
  },
  scaleItem('tq-c-r', 'C major', 'C', 'major', 1, 84, 'R'),
  scaleItem('tq-c-l', 'C major', 'C', 'major', 1, 84, 'L'),
  {
    id: 'tq-c-contrary', lv: 1, bpm: 72, t: 'C major scale, contrary motion',
    rh: scaleLine('C4', 'major'),
    lh: 'C4@1/q B3@2 A3@3 G3@1 | F3@2 E3@3 D3@4 C3@5 | C3@5 D3@4 E3@3 F3@2 | G3@1 A3@3 B3@2 C4@1',
    focus: 'Both hands use the same fingers at the same time, an easy way into hands-together scales.',
    gain: 'Lets you practise the thumb passing under in both hands at once while the fingering stays simple.',
    tip: 'Both thumbs start on middle C and the hands mirror each other: 1-2-3, 1-2-3-4-5 outwards.',
  },
  scaleItem('tq-c-ht', 'C major', 'C', 'major', 2, 76, 'HT'),
  {
    id: 'tq-inv-c', lv: 2, bpm: 66, t: 'C chord inversions',
    rh: 'C4+E4+G4/h E4+G4+C5 | G4+C5+E5/h E4+G4+C5 | C4+E4+G4/h E4+G4+C5 | G4+C5+E5/h C4+E4+G4',
    focus: 'Inversions let you change chords with less jumping around the keyboard.',
    gain: 'Lets you move between chords smoothly, as accompaniments in most styles do.',
    tip: 'Root position 1-3-5, first inversion 1-2-5, second inversion 1-3-5. Move the whole hand as one shape.',
  },
  {
    id: 'tq-cadence-c', lv: 2, bpm: 66, t: 'C–F–G–C chord changes',
    rh: 'C4+E4+G4/h C4+F4+A4 | B3+D4+G4/h C4+E4+G4 | C4+E4+G4/h C4+F4+A4 | B3+D4+G4/h C4+E4+G4',
    lh: 'C3/h F2 | G2/h C3 | C3/h F2 | G2/h C3',
    focus: 'Three chords found in a great many songs, voiced so the hand barely moves.',
    gain: 'Gives you the chord changes for many simple songs, and trains changing chords by feel.',
    tip: 'Keep the common note held down between chords and move only the fingers that need to change.',
  },
  scaleItem('tq-g-ht', 'G major', 'G', 'major', 2, 76, 'HT', 'One black key: F sharp. Same fingering as C major in both hands.', 'Gets you comfortable with black keys inside a scale, so keys other than C stop feeling foreign.'),
  {
    id: 'tq-arp-c', lv: 2, bpm: 76, t: 'C arpeggio, hands in turn',
    rh: 'C4@1/q E4@2 G4@3 C5@1 | E5@2 C5@1 G4@3 E4@2 | C4@1/w | r/w | r/w | r/w',
    lh: 'r/w | r/w | r/w | C3@5/q E3@4 G3@2 C4@1 | E4@3 C4@1 G3@2 E3@4 | C3@5/w',
    focus: 'Arpeggios stretch the hand and train the thumb to pass under smoothly.',
    gain: 'Widens your comfortable reach and smooths the thumb passing under, which runs and broken chords rely on.',
    tip: 'Right hand 1-2-3, thumb under to C, then 2. Left hand 5-4-2-1, then 3 crosses over the thumb. Let the arm carry the hand sideways, do not twist the wrist.',
  },
  scaleItem('tq-f-r', 'F major', 'F', 'major', 2, 80, 'R', 'One black key: B flat. Right hand fingering is different: 1-2-3-4, thumb under, 1-2-3-4.', 'Teaches a second scale fingering, which you will need for keys with flats.'),
  scaleItem('tq-am-ht', 'A harmonic minor', 'A', 'harmonic', 2, 72, 'HT', 'One black key: G sharp. Same fingering as C major. Listen for the wide step between F and G sharp.', 'Gets your ear and hands used to minor keys.'),
  scaleItem('tq-d-ht', 'D major', 'D', 'major', 3, 80, 'HT', 'Two black keys: F sharp and C sharp. Same fingering as C major.', 'Gets you comfortable with black keys inside a scale, so keys other than C stop feeling foreign.'),
  {
    id: 'tq-c-eighths', lv: 3, bpm: 72, t: 'C major scale in eighth notes',
    rh: inBars(scaleUpDown('C4', 'major', 'R'), 8, 'e'),
    lh: inBars(scaleUpDown('C3', 'major', 'L'), 8, 'e'),
    focus: 'Same scale, twice the speed per beat. Evenness matters more than tempo.',
    gain: 'Shows up unevenness in your scale and builds steady, controlled speed.',
    tip: 'Every note the same length and loudness. If the thumb note sticks out, slow down.',
  },
  {
    id: 'tq-chromatic', lv: 3, bpm: 72, t: 'Chromatic scale, right hand',
    rh: 'C4@1/e C#4@3 D4@1 D#4@3 E4@1 F4@2 F#4@3 G4@1 | G#4@3 A4@1 A#4@3 B4@1 C5@2 B4@1 A#4@3 A4@1 | G#4@3 G4@1 F#4@3 F4@2 E4@1 D#4@3 D4@1 C#4@3 | C4@1/w',
    focus: 'Every key in order. Trains compact, precise finger movement.',
    gain: 'Builds precise movement close to the keys, and confidence on the black keys.',
    tip: 'Third finger on every black key, thumb on white keys, second finger on F and C.',
  },
  scaleItem('tq-em-ht', 'E natural minor', 'E', 'minor', 3, 80, 'HT', 'One black key: F sharp. Same fingering as C major.', 'Gets your ear and hands used to minor keys.'),
  {
    id: 'tq-cadence-g', lv: 3, bpm: 72, t: 'G–C–D–G chord changes',
    key: 'G',
    rh: 'B3+D4+G4/h C4+E4+G4 | A3+D4+F#4/h B3+D4+G4 | B3+D4+G4/h C4+E4+G4 | A3+D4+F#4/h B3+D4+G4',
    lh: 'G2/h C3 | D3/h G2 | G2/h C3 | D3/h G2',
    focus: 'The same three-chord family in a second key, so the shapes become general.',
    gain: 'Shows your hands that chord shapes move to other keys, so you are not tied to C.',
    tip: 'Say the chord names out loud as you play them.',
  },
];

// ---------------------------------------------------------------- foundations (shared focus track)

const FOUNDATIONS = [
  {
    id: 'fd-rh', lv: 1, bpm: 76, t: 'A first melody, right hand',
    rh: 'C4/q D4 E4 C4 | E4 F4 G4/h | G4/q F4 E4 D4 | C4/w',
    focus: 'Quarter, half and whole notes in one hand position.',
    gain: 'Builds steady counting, and the habit of holding long notes for their full length.',
    tip: 'Count "1 2 3 4" out loud. Hold the long notes for their full length.',
  },
  {
    id: 'fd-lh', lv: 1, bpm: 76, t: 'A first melody, left hand',
    lh: 'C3/q E3 G3/h | G3/q F3 E3 D3 | C3 E3 D3 F3 | E3/h C3',
    focus: 'Reading and playing in the bass clef.',
    gain: 'Gets you reading the bass clef, which many beginners find harder than the treble clef.',
    tip: 'Little finger on C. Keep your eyes on the notes, not on your hand.',
  },
  {
    id: 'fd-turns', lv: 1, bpm: 76, t: 'Hands taking turns',
    rh: 'C4/q D4 E4/h | r/w | E4/q F4 G4/h | r/w | G4/q F4 E4 D4 | r/w | C4/w',
    lh: 'r/w | C3/q D3 E3/h | r/w | E3/q F3 G3/h | r/w | G3/q F3 E3 D3 | C3/w',
    focus: 'Switching attention between hands without losing the beat.',
    gain: 'Trains you to keep the beat while your attention moves from hand to hand.',
    tip: 'Keep counting through the rests. The resting hand stays in position over its keys.',
  },
  {
    id: 'fd-bass', lv: 1, bpm: 72, t: 'Melody over a held bass',
    rh: 'C4/q C4 C4 D4 | E4/h D4 | C4/q E4 D4 D4 | C4/w',
    lh: 'C3/w | C3/h G3 | C3/h G3 | C3/w',
    src: 'Au clair de la lune, traditional',
    focus: 'A first step into hands together: one hand moves, the other holds.',
    gain: 'A gentle start on hands doing different things at the same time.',
    tip: 'Learn each hand alone first (use the Hands button), then combine at a slower tempo.',
  },
  {
    id: 'fd-chords', lv: 1, bpm: 66, t: 'Three chords: C, F and G',
    lh: 'C3+E3+G3/h C3+E3+G3 | C3+F3+A3/h C3+F3+A3 | B2+D3+G3/h B2+D3+G3 | C3+E3+G3/w',
    focus: 'The I, IV and V chords in positions that sit under one hand.',
    gain: 'Gives you three chords that fit a lot of simple tunes, with very little hand movement.',
    tip: 'From C to F only two fingers move. From C to G only two fingers move. Find them before you play.',
  },
  {
    id: 'fd-melody-chords', lv: 2, bpm: 72, t: 'Melody with chords',
    rh: 'E4/q G4 G4/h | F4/q A4 A4/h | D4/q G4 F4 D4 | E4/h C4',
    lh: 'C3+E3+G3/w | C3+F3+A3/w | B2+D3+G3/w | C3+E3+G3/w',
    focus: 'A common texture in piano music: tune on top, harmony below.',
    gain: 'Trains balance between the hands, so the melody stands out above the chords.',
    tip: 'Play the left hand quieter than the right so the melody stands out.',
  },
  {
    id: 'fd-eighths', lv: 2, bpm: 72, t: 'Eighth notes',
    rh: 'C4/e D4 E4 F4 G4/q G4 | A4/e G4 F4 E4 D4/q D4 | E4/e F4 G4 A4 G4/q E4 | D4/e E4 D4 B3 C4/h',
    lh: 'C3/w | F3/h G3 | C3/w | G3/h C3',
    focus: 'Two notes per beat while the other hand keeps the slow pulse.',
    gain: 'Builds rhythmic independence: one hand moving twice as fast as the other.',
    tip: 'Count "1 and 2 and". The left hand notes land exactly with a right hand note.',
  },
];

// ---------------------------------------------------------------- shared left-hand figures

const BLUES12 = ['C3', 'C3', 'C3', 'C3', 'F2', 'F2', 'C3', 'C3', 'G2', 'F2', 'C3', 'G2'];
const SHUFFLE = '1+5/q 1+6 1+5 1+6';
const BOOGIE_A = '1/q 3 5 6';
const BOOGIE_B = 'b7/q 6 5 3';
const boogie12 = bars(
  pat('C3', BOOGIE_A), pat('C3', BOOGIE_B), pat('C3', BOOGIE_A), pat('C3', BOOGIE_B),
  pat('F2', BOOGIE_A), pat('F2', BOOGIE_B), pat('C3', BOOGIE_A), pat('C3', BOOGIE_B),
  pat('G2', BOOGIE_A), pat('F2', BOOGIE_A), pat('C3', BOOGIE_A), pat('G2', '1/q 3 5 3'),
);
const OOM_C = 'C3/q E3+G3 G2 E3+G3';
const OOM_F = 'F2/q F3+A3 C3 F3+A3';
const OOM_G7 = 'G2/q F3+B3 D3 F3+B3';
const POP_ROOTS = ['C3', 'G2', 'A2', 'F2'];
const BROKEN = '1@5/e 5@2 8@1 5@2 1@5 5@2 8@1 5@2';
const BOSSA_BASS = '1@5/q. 5@1/e 5@1/q. 1@5/e';
const bossaBass = seq(['D3', 'G2', 'C3', 'C3'], BOSSA_BASS);
const bossaA = (c) => `${c}/q r/e ${c}/e r/q ${c}/q`;
const bossaB = (c) => `r/e ${c}/e r/q ${c}/q r/q`;
const bossaComp = bars(bossaA('F4+A4+C5'), bossaB('F4+G4+B4'), bossaA('E4+G4+B4'), bossaB('E4+G4+B4'));
const BOOM_G = 'G2/q B3+D4 D3 B3+D4';
const BOOM_C = 'C3/q C4+E4 G2 C4+E4';
const BOOM_D7 = 'D3/q F#3+C4 A2 F#3+C4';
const HAB = '1@5/q. 5@2/e 8@1/q 5@2';
const montuno = {
  C: 'C4/e E4 G4 C5/q G4/e E4/q', F: 'C4/e F4 A4 C5/q A4/e F4/q', G: 'B3/e D4 G4 B4/q G4/e D4/q',
};
const tumbao = { C: 'C3/q. G3/e G3/h', F: 'F2/q. C3/e C3/h', G: 'G2/q. D3/e D3/h' };
const stab = (c) => `r/q ${c}/q r/q ${c}/q`;
const FUNK_OCT = 'D2/e D3 r D3 r/q C3/e D3';
const FUNK_A = 'D4/e D4 r F4 G4 r A4 G4';
const FUNK_B = 'D4/e D4 r F4 G4/q F4/e D4';
// Slip notes: the top note stays on 5 while 3 slides up a step underneath.
const SLIP_G = bars(
  'A4@3+D5@5/e B4@3+D5@5/q. A4@3+D5@5/e B4@3+D5@5/q.', 'D5@3+G5@5/e E5@3+G5@5/q. D5@3+G5@5/e E5@3+G5@5/q.',
  'E4@3+A4@5/e F#4@3+A4@5/q. E4@3+A4@5/e F#4@3+A4@5/q.', 'A4@3+D5@5/e B4@3+D5@5/q. B4@3+D5@5/h',
);
const ODE_A1 = 'E4/q E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/q. D4/e D4/h';
const ODE_A2 = 'E4/q E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/q. C4/e C4/h';
const SCARB = bars(
  'D4/h D4/q', 'A4/h A4/q', 'E4/q. F4/e E4/q', 'D4/h.', 'r/q A4 C5', 'D5/h C5/q', 'A4/q B4 G4', 'A4/h.',
  'r/h D5/q', 'D5/h D5/q', 'C5/h A4/q', 'A4/q G4 F4', 'E4/h C4/q', 'D4/h A4/q', 'G4/h F4/q', 'E4/q D4 C4', 'D4/h.',
);
const dm = 'D3+A3/h.', cM = 'C3+G3/h.', fM = 'F3+C4/h.', gM = 'G3+D4/h.';

// ---------------------------------------------------------------- genre tracks

const TRACKS = {
  classical: [
    {
      id: 'cl-ode-r', lv: 1, bpm: 96, t: 'Legato melody: Ode to Joy',
      src: 'Beethoven, public domain',
      rh: bars(ODE_A1, ODE_A2),
      focus: 'Legato, connecting notes smoothly, is a core classical touch.',
      gain: 'Develops a smooth, singing tone that helps in slow music of any style.',
      tip: 'Lift each finger only as the next one goes down, so no gap and no overlap.',
    },
    {
      id: 'cl-ode-bass', lv: 1, bpm: 88, t: 'Ode to Joy with a bass line',
      src: 'Beethoven, public domain',
      rh: bars(ODE_A1, ODE_A2),
      lh: 'C3/w | G3/w | C3/w | G3/h G3 | C3/w | G3/w | C3/w | G3/h C3',
      focus: 'Independent hands: a moving melody against slow bass notes.',
      gain: 'Trains one hand to hold still while the other moves, an early step towards independent hands.',
      tip: 'Hold each bass note for the whole bar while the right hand keeps moving.',
    },
    {
      id: 'cl-alberti', lv: 2, bpm: 72, t: 'Alberti bass',
      lh: bars(rep('C3/e G3 E3 G3', 2), rep('C3/e A3 F3 A3', 2), rep('B2/e G3 D3 G3', 2), rep('C3/e G3 E3 G3', 2)),
      focus: 'A classical accompaniment pattern (bottom, top, middle, top) that Mozart and Haydn used a lot.',
      gain: 'Builds a relaxed rocking motion in the hand and a quiet, even accompaniment.',
      tip: 'Rock the hand gently instead of lifting individual fingers. Keep it quiet and even.',
    },
    {
      id: 'cl-run', lv: 2, bpm: 80, t: 'Scale-run study',
      rh: 'C4/e D4 E4 F4 G4/q E4 | D4/e E4 F4 G4 A4/q F4 | E4/e F4 G4 A4 B4/q G4 | C5/h. r/q',
      lh: 'C3+G3/w | F3+A3/w | G3+B3/w | C3+E3+G3/h. r/q',
      focus: 'Short runs in the style of Czerny studies: quick fingers over calm chords.',
      gain: 'Builds light, quick fingers over steady harmony.',
      tip: 'Play the runs lightly. The chord changes exactly on beat one.',
    },
    {
      id: 'cl-melody-alberti', lv: 3, bpm: 76, t: 'Melody over Alberti bass',
      rh: 'E5/h G5 | F5/q E5 D5/h | D5/h F5 | E5/q D5 C5/h',
      lh: bars(rep('C4/e G4 E4 G4', 2), rep('B3/e G4 D4 G4', 2), rep('B3/e G4 F4 G4', 2), rep('C4/e G4 E4 G4', 2)),
      focus: 'A typical classical texture: singing right hand, murmuring left hand.',
      gain: 'Combines balance and independence, as in many classical sonatinas.',
      tip: 'Left hand much softer than the right. Practise the left hand alone until it runs by itself.',
    },
  ],
  jazz: [
    {
      id: 'jz-swing', lv: 1, bpm: 96, swing: true, t: 'Swing eighths',
      rh: 'C4/e D4 E4 F4 G4 A4 G4/q | G4/e F4 E4 D4 C4/h | C4/e D4 E4 F4 G4 A4 G4/q | A4/e G4 E4 D4 C4/h',
      focus: 'Swing feel: the first eighth is long, the second short. One of the rhythms at the heart of jazz.',
      gain: 'Gets swing into your hands, so jazz lines sound relaxed rather than stiff.',
      tip: 'Think "doo-BAH doo-BAH". Listen to the guide first and copy its lilt.',
    },
    {
      id: 'jz-shells', lv: 2, bpm: 80, t: 'Shell voicings: ii–V–I',
      lh: 'D3+C4/w | G3+B3/w | C3+B3/w | C3+B3/w',
      focus: 'Two-note left hand chords (root plus 3rd or 7th), a common first jazz voicing.',
      gain: 'Gives you a compact way to play jazz chords and to hear how they connect.',
      tip: 'Notice how the top note only moves one step from chord to chord: C, B, B.',
    },
    {
      id: 'jz-251', lv: 2, bpm: 96, swing: true, t: 'ii–V–I with melody',
      rh: 'F4/q A4 C5 A4 | B4/q G4 F4 D4 | E4/h G4 | E4/w',
      lh: 'D3+C4/w | G3+B3/w | C3+B3/w | C3+B3/w',
      focus: 'One of the most common chord progressions in jazz, with a line that outlines each chord.',
      gain: 'Trains your ear and hands on a progression that turns up in a great many jazz tunes.',
      tip: 'Name the chords as you go: D minor 7, G7, C major 7.',
    },
    {
      id: 'jz-walk', lv: 3, bpm: 100, t: 'Walking bass',
      lh: 'D3/q E3 F3 F#3 | G3 F3 E3 D3 | C3 D3 E3 G3 | A2 C#3 E3 Eb3',
      focus: 'One bass note per beat that leads into each new chord.',
      gain: 'Develops steady time and a sense of how a bass line leads from chord to chord.',
      tip: 'Even, slightly detached quarter notes. The last note of each bar leans into the next.',
    },
    {
      id: 'jz-charleston', lv: 3, bpm: 104, swing: true, t: 'Comping: Charleston rhythm',
      rh: bars(
        'F4+A4+C5/q. F4+A4+C5/e r/h', 'F4+G4+B4/q. F4+G4+B4/e r/h',
        'E4+G4+B4/q. E4+G4+B4/e r/h', 'E4+G4+B4/q. E4+G4+B4/e r/h',
      ),
      lh: 'D3/w | G2/w | C3/w | C3/w',
      focus: 'A basic comping rhythm: on beat one, then just before beat three.',
      gain: 'Gives you a first way to accompany in jazz, and confidence placing chords off the beat.',
      tip: 'Short, crisp chords. The second one is the surprise, so place it confidently.',
    },
  ],
  blues: [
    {
      id: 'bl-form', lv: 1, bpm: 96, t: '12-bar blues: the form',
      lh: BLUES12.map((r, i) => (i === 0 ? r + '/w' : r)).join(' | '),
      focus: 'The 12-bar pattern of C, F and G that a great many songs share. Learn the map first.',
      gain: 'Helps you keep your place in a 12-bar blues, which many songs and jam sessions are built on.',
      tip: 'Count the bars out loud: four of C, two of F, two of C, then G, F, C, G.',
    },
    {
      id: 'bl-shuffle', lv: 1, bpm: 92, t: 'Shuffle left hand',
      lh: seq(BLUES12, SHUFFLE),
      focus: 'A classic blues accompaniment: the fifth rocks up to the sixth and back.',
      gain: 'Builds a steady, automatic left hand, which frees your attention for the right.',
      tip: 'Little finger holds the root. Thumb alternates between two neighbouring keys.',
    },
    {
      id: 'bl-scale', lv: 2, bpm: 88, swing: true, t: 'Blues scale, right hand',
      rh: 'C4@1/q Eb4@2 F4@3 F#4@4 | G4@1 Bb4@2 C5@3/h | C5@3/q Bb4@2 G4@1 F#4@4 | F4@3 Eb4@2 C4@1/h',
      focus: 'Six notes that fit over all three chords of a blues.',
      gain: 'Gives you notes to improvise with that work over the whole 12-bar form.',
      tip: 'Fingering up: 1-2-3-4, thumb under to G, then 2-3. The same fingers come back down. Lean on the F sharp, the "blue note".',
    },
    {
      id: 'bl-call', lv: 2, bpm: 88, swing: true, t: 'Call and response',
      rh: 'r/q Eb4/e E4 G4/q C5 | r/w | r/q C5/e Bb4 G4/q Eb4/e C4 | r/w',
      lh: seq(['C3', 'C3', 'C3', 'C3'], SHUFFLE),
      focus: 'A lick, then space. Short statements like these are a common way to build a blues solo.',
      gain: 'Trains your right hand to phrase freely while the left keeps going.',
      tip: 'Keep the left hand going. Get it automatic before adding the right.',
    },
    {
      id: 'bl-boogie', lv: 3, bpm: 108, t: 'Boogie-woogie bass line',
      lh: boogie12,
      focus: 'The walking boogie bass: up the chord to the flat seventh and back down.',
      gain: 'Builds left hand stamina and the walking motion of boogie-woogie.',
      tip: 'Loop one chord until it is automatic, then play the whole 12 bars.',
    },
  ],
  ragtime: [
    {
      id: 'rg-oompah', lv: 1, bpm: 80, t: 'Oom-pah left hand',
      lh: bars(OOM_C, OOM_C, OOM_G7, 'C3/q E3+G3 C3/h'),
      focus: 'Bass note, chord, bass note, chord: the left hand engine of ragtime and stride.',
      gain: 'Trains accurate jumps without looking, which helps in many styles.',
      tip: 'Look ahead to where the hand lands next. Keep the jump low and close to the keys.',
    },
    {
      id: 'rg-chromatic', lv: 2, bpm: 84, t: 'Chromatic approach notes',
      rh: 'D4@2/e D#4@3 E4@1/q C5@5 E4@1 | D4@2/e D#4@3 E4@1/q C5@5/h | A4@2/e A#4@3 B4@1/q D5@3 B4@1 | C5@2/w',
      focus: 'Sliding into a chord note from a half step below, a typical ragtime ornament.',
      gain: 'Adds a characteristic ornament and trains quick, precise fingers.',
      tip: 'The slide is fingered like a chromatic scale: 2 and 3, then the thumb lands on the chord note.',
    },
    {
      id: 'rg-synco', lv: 2, bpm: 80, t: 'Syncopation: short–long–short',
      rh: 'E4/e G4/q E4/e G4/h | F4/e A4/q F4/e A4/h | G4/e B4/q G4/e B4/q A4 | C5/w',
      lh: 'C3/h E3 | F3/h A3 | G2/h B2 | C3/w',
      focus: 'A typical ragtime rhythm: the long note falls between the beats.',
      gain: 'Builds a feel for syncopation, which ragtime, jazz and pop all use.',
      tip: 'Count "1 and 2 and" and feel the second note land on the "and".',
    },
    {
      id: 'rg-together', lv: 3, bpm: 76, t: 'Oom-pah with syncopated melody',
      rh: 'E4/e G4/q E4/e G4/h | F4/e A4/q F4/e A4/h | G4/e B4/q G4/e B4/q A4 | C5/w',
      lh: bars(OOM_C, OOM_F, OOM_G7, 'C3/q E3+G3 C3/h'),
      focus: 'A steady left hand against an off-beat right hand, the core of ragtime.',
      gain: 'Trains a steady hand to stay steady under a syncopated one.',
      tip: 'The left hand is a metronome. If it wobbles, go back to hands separately.',
    },
    {
      id: 'rg-stride', lv: 3, bpm: 72, t: 'Stride leaps',
      lh: bars(
        'C2/q E3+G3+C4 G2 E3+G3+C4', 'F2/q F3+A3+C4 C3 F3+A3+C4',
        'G2/q F3+G3+B3 D3 F3+G3+B3', 'C2/q E3+G3+C4 C3/h',
      ),
      focus: 'Wider jumps between a low bass note and a mid-range chord.',
      gain: 'Extends accurate jumps to wider distances.',
      tip: 'Practise only the jump: bass, then touch the chord silently, back and forth.',
    },
  ],
  pop: [
    {
      id: 'pp-four', lv: 1, bpm: 80, t: 'The four chords: C, G, Am, F',
      rh: 'C4+E4+G4/w | B3+D4+G4/w | C4+E4+A4/w | C4+F4+A4/w',
      lh: 'C3/w | G2/w | A2/w | F2/w',
      focus: 'The I–V–vi–IV progression found in a large number of pop songs.',
      gain: 'Lets you accompany a lot of pop songs with one pattern.',
      tip: 'The right hand stays in one place and changes one or two notes per chord.',
    },
    {
      id: 'pp-pulse', lv: 2, bpm: 88, t: 'Pulsing chords',
      rh: bars(rep('C4+E4+G4/q', 4), rep('B3+D4+G4/q', 4), rep('C4+E4+A4/q', 4), rep('C4+F4+A4/q', 4)),
      lh: 'C3/w | G2/w | A2/w | F2/w',
      focus: 'Repeated quarter-note chords, a common pop ballad accompaniment.',
      gain: 'Builds steady, even chords and a relaxed wrist.',
      tip: 'Stay close to the keys and bounce from the wrist. Every chord the same volume.',
    },
    {
      id: 'pp-broken', lv: 2, bpm: 84, t: 'Broken-chord left hand',
      lh: seq(POP_ROOTS, BROKEN),
      focus: 'Root, fifth, octave: a left hand pattern that fills out a chord.',
      gain: 'Gives you a flexible accompaniment that suits many songs.',
      tip: 'Fingers 5-2-1. Open the hand to the octave and rotate the forearm gently.',
    },
    {
      id: 'pp-melody', lv: 3, bpm: 80, t: 'Melody over broken chords',
      rh: 'G4/q. E4/e E4/h | G4/q. D4/e D4/h | A4/q. G4/e E4/q C4 | A4/q G4 F4/h',
      lh: seq(POP_ROOTS, BROKEN),
      focus: 'A singing melody over a flowing accompaniment, a full pop piano texture.',
      gain: 'Puts melody and accompaniment together, so you can play songs on your own.',
      tip: 'Get the left hand pattern running without thinking before you add the tune.',
    },
    {
      id: 'pp-332', lv: 3, bpm: 96, t: 'Syncopated rhythm: 3+3+2',
      rh: bars(
        'C4+E4+G4/q. C4+E4+G4 C4+E4+G4/q', 'B3+D4+G4/q. B3+D4+G4 B3+D4+G4/q',
        'C4+E4+A4/q. C4+E4+A4 C4+E4+A4/q', 'C4+F4+A4/q. C4+F4+A4 C4+F4+A4/q',
      ),
      lh: 'C3/q. C3 C3/q | G2/q. G2 G2/q | A2/q. A2 A2/q | F2/q. F2 F2/q',
      focus: 'Eight eighth notes grouped 3+3+2, a rhythm common in modern pop.',
      gain: 'Builds a feel for syncopated pop rhythms.',
      tip: 'Count "1-2-3, 1-2-3, 1-2" in fast, even counts.',
    },
  ],
  rock: [
    {
      id: 'rk-power', lv: 1, bpm: 96, t: 'Power chords',
      lh: bars(rep('A2+E3/q', 4), rep('F2+C3/q', 4), rep('C3+G3/q', 4), rep('G2+D3/q', 4)),
      focus: 'Root and fifth only: a typical rock sound, and an easy shape to move around.',
      gain: 'Trains moving one fixed hand shape around the keyboard.',
      tip: 'Fingers 5 and 1. Keep the hand shape fixed and move the whole arm.',
    },
    {
      id: 'rk-eighths', lv: 2, bpm: 96, t: 'Driving eighths',
      rh: 'A3+C4+E4/w | A3+C4+F4/w | G3+C4+E4/w | G3+B3+D4/w',
      lh: bars(rep('A2/e', 8), rep('F2/e', 8), rep('C3/e', 8), rep('G2/e', 8)),
      focus: 'Steady eighth-note bass, the motor of a lot of rock piano.',
      gain: 'Builds endurance and steady time.',
      tip: 'Accent beats one and three slightly. Do not speed up.',
    },
    {
      id: 'rk-riff', lv: 2, bpm: 92, t: 'Minor pentatonic riff',
      rh: 'A4/e C5 D5/q E5 D5/e C5 | A4/e C5 D5/q C5/h | A4/e C5 D5/q E5 G5 | E5/h. r/q',
      lh: 'A2+E3/w | A2+E3/w | A2+E3/w | A2+E3/h. r/q',
      focus: 'Five notes that a lot of rock riffs and solos are made from.',
      gain: 'Gives you material for riffs and short solos.',
      tip: 'Play it with attitude: firm fingers, clear accents on the long notes.',
    },
    {
      id: 'rk-rnr', lv: 2, bpm: 104, t: "Rock 'n' roll left hand",
      lh: seq(['C3', 'F2', 'C3', 'G2'], '1+5/e 1+5 1+6 1+6 1+5 1+5 1+6 1+6'),
      focus: 'The fifth–sixth pattern in straight eighths, as heard in 1950s rock and roll.',
      gain: 'Uses the blues shuffle shape in straight time, which sharpens your sense of swung versus straight.',
      tip: 'Same hand shape as the blues shuffle, but even eighths instead of swing.',
    },
    {
      id: 'rk-stabs', lv: 3, bpm: 100, t: 'Octave bass and chord stabs',
      rh: bars(stab('A3+C4+E4'), stab('A3+C4+F4'), stab('G3+C4+E4'), stab('G3+B3+D4')),
      lh: bars(rep('A2/e A3', 4), rep('F2/e F3', 4), rep('C3/e C4', 4), rep('G2/e G3', 4)),
      focus: 'Rocking octaves below, chords on beats two and four, a full band feel from two hands.',
      gain: 'Builds coordination between a busy left hand and a rhythmic right hand.',
      tip: 'Rotate the left forearm like turning a door handle. The right hand chords are short.',
    },
  ],
  gospel: [
    {
      id: 'gs-amen', lv: 1, bpm: 66, t: 'The Amen cadence',
      rh: 'C4+E4+G4/w | C4+F4+A4/w | C4+E4+G4/h B3+D4+G4 | C4+E4+G4/w',
      lh: 'C3/w | F2/w | G2/h G2 | C3/w',
      focus: 'IV to I, the "Amen" sound common in gospel and hymns.',
      gain: 'Trains your ear for a resolution you will hear in church music, soul and pop.',
      tip: 'Full, warm chords. Press all notes together and let them ring.',
    },
    {
      id: 'gs-waltz', lv: 2, bpm: 84, ts: [3, 4], key: 'G', t: 'Gospel waltz',
      rh: 'r/q B3+D4+G4 B3+D4+G4 | r/q C4+E4+G4 C4+E4+G4 | r/q B3+D4+G4 B3+D4+G4 | r/q A3+D4+F#4 A3+D4+F#4',
      lh: 'G2/h. | C3/h. | G2/h. | D3/h.',
      focus: 'Bass on one, chords on two and three, a typical accompaniment for hymns in three.',
      gain: 'Builds a steady accompaniment in three.',
      tip: 'Count "ONE two three". The bass note is strong, the chords are light.',
    },
    {
      id: 'gs-walkup', lv: 2, bpm: 76, t: 'Walk-up bass',
      rh: 'E4+G4+C5/w | F4+A4+C5/w | F4+A4+C5/w | E4+G4+C5/w',
      lh: 'C3/h D3/q E3 | F3/w | F3/h E3/q D3 | C3/w',
      focus: 'Stepping the bass from one chord to the next instead of jumping.',
      gain: 'Trains smooth bass movement between chords, so accompaniments sound connected.',
      tip: 'The walking notes get a little louder as they approach the new chord.',
    },
    {
      id: 'gs-passing', lv: 3, bpm: 66, t: 'Passing chords',
      rh: 'E4+G4+C5/w | E4+G4+Bb4/w | F4+A4+C5/w | F4+Ab4+C5/w | E4+G4+C5/w',
      lh: 'C3/w | C3/w | F2/w | F2/w | C3/w',
      focus: 'C to C7 to F to F minor and home: one changed note per chord gives a gospel colour.',
      gain: 'Develops your ear for how small changes in a chord create pull and colour.',
      tip: 'Only one finger moves each time. Listen to how each change pulls toward the next chord.',
    },
    {
      id: 'gs-128', lv: 3, bpm: 90, ts: [12, 8], t: '12/8 feel',
      rh: bars(rep('E4+G4+C5/e', 12), rep('E4+A4+C5/e', 12), rep('F4+A4+C5/e', 12), rep('D4+G4+B4/e', 12)),
      lh: 'C3/h. C3 | A2/h. A2 | F2/h. F2 | G2/h. G2',
      focus: 'Four slow beats, each divided in three: the rolling feel of much slow gospel.',
      gain: 'Builds a feel for time divided in threes.',
      tip: 'Count "1-and-a 2-and-a". Lean on the first chord of each group of three.',
    },
  ],
  rnb: [
    {
      id: 'rb-backbeat', lv: 1, bpm: 84, t: 'Backbeat chords',
      rh: bars(stab('E4+G4+C5'), stab('E4+A4+C5'), stab('F4+A4+C5'), stab('D4+G4+B4')),
      lh: 'C3/h C3 | A2/h A2 | F2/h F2 | G2/h G2',
      focus: 'Chords on beats two and four, where the snare drum sits.',
      gain: 'Locks your playing onto the backbeat, which R&B, soul and pop lean on.',
      tip: 'Bass on one and three, chords on two and four. Think "boom, clap, boom, clap".',
    },
    {
      id: 'rb-sevenths', lv: 2, bpm: 72, t: 'Seventh chords',
      rh: 'E4+G4+B4/w | E4+G4+C5/w | F4+A4+C5/w | F4+G4+B4/w',
      lh: 'C3/w | A2/w | D3/w | G2/w',
      focus: 'C major 7, A minor 7, D minor 7, G7: richer chords often heard in soul.',
      gain: 'Trains your hands and ear on seventh chords.',
      tip: 'The right hand leaves out the root because the left hand plays it.',
    },
    {
      id: 'rb-melody', lv: 2, bpm: 76, t: 'Pentatonic soul melody',
      rh: 'E5/q D5/e C5 A4/h | G4/e A4 C5/q D5/h | E5/q G5/e E5 D5/q C5 | A4/w',
      lh: 'A2+E3/w | F2+C3/w | C3+G3/w | A2+E3/w',
      focus: 'Minor pentatonic phrasing, a large part of the language of soul and R&B melody.',
      gain: 'Gives you melodic vocabulary for soul and R&B.',
      tip: 'Play it like a singer would: slightly behind the beat, with shape to each phrase.',
    },
    {
      id: 'rb-68', lv: 2, bpm: 80, ts: [6, 8], t: 'Soul ballad arpeggios',
      lh: 'C3@5/e G3@2 C4@1 E4@3 C4@1 G3@2 | A2@5 E3@2 A3@1 C4@3 A3@1 E3@2 | F2@5 C3@2 F3@1 A3@3 F3@1 C3@2 | G2@5 D3@2 G3@1 B3@3 G3@1 D3@2',
      focus: 'Six flowing eighths per bar, a classic slow soul ballad accompaniment.',
      gain: 'Builds a flowing, even left hand in six-eight time.',
      tip: 'Count "1-2-3 4-5-6" with a small lean on 1 and 4.',
    },
    {
      id: 'rb-groove', lv: 3, bpm: 88, t: 'Minor groove',
      rh: bars(stab('C4+E4+G4'), stab('C4+F#4+A4'), stab('C4+E4+G4'), stab('C4+F#4+A4')),
      lh: 'A2/q. A2/e r/q E3/e G3 | D3/q. D3/e r/q A2/e C3 | A2/q. A2/e r/q E3/e G3 | D3/q. D3/e r/q A2/e C3',
      focus: 'A syncopated bass line under backbeat chords, with A minor 7 moving to D7.',
      gain: 'Builds independence between a syncopated bass line and steady chords.',
      tip: 'Loop the left hand until it grooves, then drop the right hand chords on two and four.',
    },
  ],
  funk: [
    {
      id: 'fu-one', lv: 1, bpm: 88, t: 'Lock in the one',
      rh: 'r/q F4+A4+C5/q r/h | r/q F4+A4+C5/q r/h | r/q F4+A4+C5/q r/h | r/q F4+A4+C5/q r/h',
      lh: 'D3/q r r/h | D3/q r r C3 | D3/q r r/h | D3/q r r C3',
      focus: 'Funk leans on a strong beat one and plenty of silence.',
      gain: 'Trains you to place notes precisely and keep counting through rests.',
      tip: 'Short notes, long rests. The rests are part of the rhythm, so count through them.',
    },
    {
      id: 'fu-offbeat', lv: 2, bpm: 88, t: 'Off-beat stabs',
      rh: bars(rep('r/e F4+A4+C5/e', 4), rep('r/e F4+A4+C5/e', 4), rep('r/e F4+G4+B4/e', 4), rep('r/e F4+G4+B4/e', 4)),
      lh: 'D3/h D3 | D3/h D3 | G2/h G2 | G2/h G2',
      focus: 'Chords on every "and", a tight, percussive funk keyboard sound.',
      gain: 'Sharpens your timing between the beats.',
      tip: 'Tap your foot on the beat and play in between. Keep the chords very short.',
    },
    {
      id: 'fu-riff', lv: 3, bpm: 92, t: 'Syncopated riff',
      rh: bars(FUNK_A, FUNK_B, FUNK_A, 'D4/e D4 r F4 G4/q A4'),
      focus: 'A single-note clavinet-style line where the rests give it bounce.',
      gain: 'Builds a crisp, detached touch and syncopated timing.',
      tip: 'Say the rhythm before you play it. Detached, almost staccato notes.',
    },
    {
      id: 'fu-octave', lv: 3, bpm: 88, t: 'Octave bass line',
      lh: bars(FUNK_OCT, FUNK_OCT, FUNK_OCT, 'D2/e D3 r D3 r/q D3'),
      focus: 'Low note, high note: the octave pop of funk bass.',
      gain: 'Trains quick octave movement with a relaxed hand.',
      tip: 'Little finger low, thumb high. Bounce between them without tensing the hand.',
    },
    {
      id: 'fu-both', lv: 3, bpm: 88, t: 'Bass and stabs together',
      rh: rep('r/e F4+A4+C5/e r/q r/e F4+A4+C5/e r/q |', 3) + ' r/e F4+A4+C5/e r/q F4+A4+C5/h',
      lh: rep('D3/q r/e D3/e r/q C3/q |', 3) + ' D3/q r/e D3/e D3/h',
      focus: 'The two hands interlock like a drummer and a bass player.',
      gain: 'Builds hands that interlock instead of playing together.',
      tip: 'Work out which hand plays on each eighth note, very slowly, before adding tempo.',
    },
  ],
  latin: [
    {
      id: 'lt-bossa-bass', lv: 1, bpm: 96, t: 'Bossa nova bass',
      lh: bossaBass,
      focus: 'Root and fifth in a long–short rhythm, a basic bossa nova bass.',
      gain: 'Gives you the steady bass that bossa nova sits on.',
      tip: 'The short note is a pickup into the next long one. Keep it gentle.',
    },
    {
      id: 'lt-habanera', lv: 2, bpm: 92, key: 'F', t: 'Habanera rhythm',
      rh: 'A4/h F4/q D4 | A4/h F4/q D4 | G4/q. F4/e E4/q C#4 | D4/w',
      lh: bars(pat('D3', HAB), pat('D3', HAB), pat('A2', HAB), 'D3/q. A3/e D4/h'),
      focus: 'The long, short, long, long bass rhythm found in tango and in much Cuban music.',
      gain: 'Builds a feel for a rhythm that runs through a lot of Latin music.',
      tip: 'Clap the left hand rhythm first: "ONE (two) and THREE FOUR".',
    },
    {
      id: 'lt-comp', lv: 2, bpm: 96, t: 'Bossa nova comping',
      rh: bossaComp,
      lh: 'D3/w | G2/w | C3/w | C3/w',
      focus: 'A two-bar syncopated chord rhythm typical of bossa nova.',
      gain: 'Trains placing chords off the beat over a two-bar pattern.',
      tip: 'Learn the rhythm on one chord first by tapping it on your knees.',
    },
    {
      id: 'lt-bossa', lv: 3, bpm: 92, t: 'Bossa nova: both hands',
      rh: bossaComp,
      lh: bossaBass,
      focus: 'Bass and comping together: a complete bossa accompaniment.',
      gain: 'Combines bass and comping into an accompaniment you can use for bossa songs.',
      tip: 'Mark where the hands play together and where they alternate. Go bar by bar.',
    },
    {
      id: 'lt-montuno', lv: 3, bpm: 92, t: 'Montuno pattern',
      rh: bars(montuno.C, montuno.F, montuno.G, montuno.F),
      lh: bars(tumbao.C, tumbao.F, tumbao.G, tumbao.F),
      focus: 'A syncopated broken-chord figure in the style of salsa piano.',
      gain: 'Builds a repeating syncopated pattern used in salsa piano.',
      tip: 'The high note arrives early, on the "and" of two. Let it ring.',
    },
  ],
  folk: [
    {
      id: 'fk-drone', lv: 1, bpm: 84, t: 'Melody over a drone',
      rh: 'D4/q E4 F4 G4 | A4/h A4 | G4/q F4 E4 F4 | D4/w',
      lh: 'D3+A3/w | D3+A3/w | D3+A3/w | D3+A3/w',
      focus: 'An open fifth held under a modal tune, one of the oldest folk accompaniments.',
      gain: 'Trains your ear for modal melodies over a simple bass.',
      tip: 'Re-strike the left hand softly each bar and let it ring.',
    },
    {
      id: 'fk-waltz', lv: 2, bpm: 96, ts: [3, 4], key: 'G', t: 'Waltz accompaniment',
      lh: 'G2/q D3+G3+B3 D3+G3+B3 | C3/q E3+G3+C4 E3+G3+C4 | D3/q F#3+A3 F#3+A3 | G2/q D3+G3+B3 D3+G3+B3',
      focus: 'Bass, chord, chord: a common accompaniment for songs in three.',
      gain: 'Builds a steady accompaniment for songs in waltz time.',
      tip: 'Strong first beat, two light chords. Sway with it.',
    },
    {
      id: 'fk-picking', lv: 2, bpm: 84, t: 'Fingerpicking-style arpeggios',
      rh: bars(rep('E4/e G4 C5 G4', 2), rep('E4/e A4 C5 A4', 2), rep('F4/e A4 C5 A4', 2), rep('D4/e G4 B4 G4', 2)),
      lh: 'C3/h C3 | A2/h A2 | F2/h F2 | G2/h G2',
      focus: 'A rolling right hand pattern that imitates a fingerpicked guitar.',
      gain: 'Gives you a flowing accompaniment pattern for songs.',
      tip: 'Thumb on the lowest note, little finger on the top. Keep it flowing and quiet, like an accompaniment under a voice.',
    },
    {
      id: 'fk-sus', lv: 2, bpm: 76, t: 'Suspended chords',
      rh: 'C4+F4+G4/h C4+E4+G4 | D4+G4+C5/h D4+G4+B4 | C4+E4+A4/w | C4+F4+G4/h C4+F4+A4',
      lh: 'C3/w | G2/w | A2/w | F2/w',
      focus: 'Sus chords and their resolutions, a common singer-songwriter colour.',
      gain: 'Develops your ear for tension and release.',
      tip: 'One finger moves down a step to resolve each chord. Listen for the release of tension.',
    },
    {
      id: 'fk-scarb', lv: 3, bpm: 92, ts: [3, 4], t: 'Tune with open-fifth bass',
      src: 'Scarborough Fair, traditional',
      rh: SCARB.split(' | ').slice(0, 8).join(' | '),
      lh: bars(dm, dm, cM, dm, fM, dm, gM, dm),
      focus: 'A complete folk-song texture: modal melody in three with a simple bass.',
      gain: 'Puts a melody and a simple bass together in three.',
      tip: 'Let each bass chord ring for the whole bar. Shape the melody in four-bar phrases.',
    },
  ],
  country: [
    {
      id: 'ct-penta', lv: 1, bpm: 88, key: 'G', t: 'Major pentatonic melody',
      rh: 'G4/q A4 B4 D5 | E5/h D5 | B4/q A4 G4 A4 | G4/w',
      focus: 'Five notes (G, A, B, D, E) that give many country melodies their open sound.',
      gain: 'Gives you notes for country-style melodies and fills.',
      tip: 'Thumb on G. The five notes fit under one hand: G-A-B-D-E with fingers 1 to 5.',
    },
    {
      id: 'ct-boom', lv: 1, bpm: 84, key: 'G', t: 'Boom-chick left hand',
      lh: bars(BOOM_G, BOOM_C, BOOM_D7, 'G2/q B3+D4 G2/h'),
      focus: 'Alternating bass with an off-beat chord, a country rhythm section in one hand.',
      gain: 'Builds a steady alternating bass.',
      tip: 'The bass alternates between root and fifth. Look ahead to the next landing spot.',
    },
    {
      id: 'ct-walk', lv: 2, bpm: 88, key: 'G', t: 'Walking between chords',
      rh: 'B3+D4+G4/w | C4+E4+G4/w | A3+D4+F#4/w | B3+D4+G4/w',
      lh: 'G2/q G2 A2 B2 | C3 C3 C3 C#3 | D3 D3 E3 F#3 | G3/h G2',
      focus: 'Bass runs that lead the ear from one chord to the next.',
      gain: 'Trains bass runs that connect chords.',
      tip: 'The last two notes of each bar are the "walk". Give them direction.',
    },
    {
      id: 'ct-slip', lv: 2, bpm: 80, key: 'G', t: 'Slip notes',
      rh: SLIP_G,
      lh: 'G2/w | C3/w | D3/w | G2/w',
      focus: 'Sliding from the second to the third of a chord under a held top note, a signature of Nashville piano.',
      gain: 'Builds finger independence within one hand.',
      tip: 'The top finger holds. The lower finger plays the short note and slips up a step.',
    },
    {
      id: 'ct-both', lv: 3, bpm: 80, key: 'G', t: 'Boom-chick with melody',
      rh: 'B4/q D5/h B4/q | C5/q E5/h C5/q | A4/q D5 C5 A4 | G4/w',
      lh: bars(BOOM_G, BOOM_C, BOOM_D7, 'G2/q B3+D4 G2/h'),
      focus: 'Self-accompanied country piano: steady left hand, relaxed tune on top.',
      gain: 'Combines a steady left hand with a relaxed melody on top.',
      tip: 'The melody has long notes on purpose, giving you time to watch the left hand.',
    },
  ],
  film: [
    {
      id: 'fm-fifths', lv: 1, bpm: 60, t: 'Open fifths and space',
      rh: 'A4+E5/w | A4+C5/w | G4+E5/w | G4+D5/w',
      lh: 'A2+E3/w | F2+C3/w | C3+G3/w | G2+D3/w',
      focus: 'Slow, open sounds. Tone and timing matter most here.',
      gain: 'Develops control of tone and timing at slow tempos.',
      tip: 'If your piano has a sustain pedal: press it after each chord and change it with each new bar.',
    },
    {
      id: 'fm-arp', lv: 1, bpm: 72, t: 'Slow arpeggios',
      lh: seq(['A2', 'F2', 'C3', 'G2'], '1@5/q 5@2 8@1 5@2'),
      focus: 'Even, quiet broken chords, a foundation of film and ambient piano.',
      gain: 'Builds an even, quiet touch.',
      tip: 'Every note the same soft volume. Fingers 5-2-1-2.',
    },
    {
      id: 'fm-ostinato', lv: 2, bpm: 80, t: 'Right hand ostinato',
      rh: bars(rep('A4/e C5 E5 C5', 2), rep('A4/e C5 F5 C5', 2), rep('G4/e C5 E5 C5', 2), rep('G4/e B4 D5 B4', 2)),
      lh: 'A2/w | F2/w | C3/w | G2/w',
      focus: 'A repeating figure where one note changes at a time, a technique used in minimalist music.',
      gain: 'Trains evenness over long repetition.',
      tip: 'Keep the pattern perfectly even and let the bass notes carry the emotion.',
    },
    {
      id: 'fm-melody', lv: 3, bpm: 72, t: 'Melody over arpeggios',
      rh: 'E5/h. D5/q | C5/h A4 | G4/h. C5/q | B4/w',
      lh: seq(['A2', 'F2', 'C3', 'G2'], '1@5/q 5@2 8@1 5@2'),
      focus: 'A slow, singing line above a moving left hand.',
      gain: 'Builds balance between a singing melody and a moving accompaniment.',
      tip: 'Make the long melody notes sing by playing them a little firmer than the left hand.',
    },
    {
      id: 'fm-332', lv: 3, bpm: 84, t: 'Cross-rhythm ostinato',
      rh: 'A4/e C5 E5 A4 C5 E5 A4 C5 | A4 C5 F5 A4 C5 F5 A4 C5 | G4 C5 E5 G4 C5 E5 G4 C5 | G4 B4 D5 G4 B4 D5 G4 B4',
      lh: 'A2/q. A2 A2/q | F2/q. F2 F2/q | C3/q. C3 C3/q | G2/q. G2 G2/q',
      focus: 'A three-note pattern across a four-beat bar, a sound often heard in modern film scores.',
      gain: 'Builds a feel for cross-rhythm.',
      tip: 'The left hand plays with the first note of each group: 3+3+2.',
    },
  ],
};

// ---------------------------------------------------------------- pieces (three per genre)

const SAINTS = bars(
  'r/q C4 E4 F4', 'G4/w', 'r/q C4 E4 F4', 'G4/w', 'r/q C4 E4 F4', 'G4/h E4', 'C4/h E4', 'D4/w',
  'r/q E4 E4 D4', 'C4/h. C4/q', 'E4/h G4', 'G4/h F4', 'r/h E4/q F4', 'G4/h E4', 'C4/h D4', 'C4/w',
);
const SUS_1 = 'E4/q G4 G4/q. A4/e', SUS_2 = 'G4/q E4 C4/q. D4/e', SUS_7 = 'E4/q E4 D4 D4';
const gospelG = 'G2+D3/h.', gospelC = 'C3+G3/h.', gospelD = 'D3+A3/h.';
const ENT_2 = 'E4/e C5/q E4/e C5/q E4/e C5';
const tripC = rep('E4+G4+C5/e', 3), tripF = rep('F4+A4+C5/e', 3), tripG = rep('D4+G4+B4/e', 3);
const LONG = '1/e 5 8 9 10 9 8 5';

const PIECES = {
  classical: [
    {
      id: 'pc-ode', lv: 1, bpm: 100, perf: 120, t: 'Ode to Joy', src: 'Ludwig van Beethoven, public domain',
      rh: bars(ODE_A1, ODE_A2, 'D4/q D4 E4 C4 | D4 E4/e F4 E4/q C4 | D4 E4/e F4 E4/q D4 | C4/q D4 G3/h', ODE_A2),
      lh: bars(
        'C3/w | G3/w | C3/w | G3/h G3', 'C3/w | G3/w | C3/w | G3/h C3',
        'G3/w | G3/h C3 | G3/w | C3/h G2', 'C3/w | G3/w | C3/w | G3/h C3',
      ),
    },
    {
      id: 'pc-minuet', lv: 2, bpm: 92, perf: 116, ts: [3, 4], key: 'G', t: 'Minuet in G',
      src: 'Christian Petzold (Anna Magdalena Notebook), public domain',
      rh: 'D5/q G4/e A4 B4 C5 | D5/q G4 G4 | E5/q C5/e D5 E5 F#5 | G5/q G4 G4 | C5/q D5/e C5 B4 A4 | B4/q C5/e B4 A4 G4 | F#4/q G4/e A4 B4 G4 | B4/q A4/h',
      lh: 'G3/h A3/q | B3/h. | C4/h. | B3/h. | A3/h. | G3/h. | D4/q B3 G3 | D4/q D3/h',
    },
    {
      id: 'pc-elise', lv: 3, bpm: 44, perf: 60, ts: [3, 8], t: 'Für Elise (theme)',
      src: 'Ludwig van Beethoven, public domain',
      rh: 'r/q E5/s D#5 | E5/s D#5 E5 B4 D5 C5 | A4/e r/s C4 E4 A4 | B4/e r/s E4 G#4 B4 | C5/e r/s E4 E5 D#5 | E5/s D#5 E5 B4 D5 C5 | A4/e r/s C4 E4 A4 | B4/e r/s E4 C5 B4 | A4/q.',
      lh: 'r/q. | r/q. | A2/s E3 A3 r r/e | E2/s E3 G#3 r r/e | A2/s E3 A3 r r/e | r/q. | A2/s E3 A3 r r/e | E2/s E3 G#3 r r/e | A2/s E3 A3 r r/e',
    },
  ],
  jazz: [
    {
      id: 'pc-saints', lv: 1, bpm: 108, perf: 150, swing: true, t: 'When the Saints Go Marching In',
      src: 'Traditional',
      rh: SAINTS,
      lh: 'C3+G3/w | C3+G3 | C3+G3 | C3+G3 | C3+G3 | C3+G3 | C3+G3 | G2+F3 | C3+G3 | C3+Bb3 | F3+A3 | F3+Ab3 | C3+G3 | C3+G3 | C3+G3/h G2+F3 | C3+G3/w',
    },
    {
      id: 'pc-bluehour', lv: 2, bpm: 96, perf: 120, swing: true, t: 'Blue Hour', src: 'Original for this app',
      rh: 'r/e A4 C5/q A4 F4 | G4/q. F4/e D4/h | r/e G4 B4/q G4 E4 | G4/q. E4/e C#4/h | r/e A4 C5/q E5 D5 | B4/q. A4/e G4/q F4 | E4/h. G4/q | E4/w',
      lh: 'D3+C4/w | G3+B3 | C3+B3 | A2+G3 | D3+C4 | G3+B3 | C3+B3 | C3+B3',
    },
    {
      id: 'pc-slowcorner', lv: 3, bpm: 66, perf: 76, t: 'Slow Corner', src: 'Original for this app',
      rh: 'E4/h G4/q B4 | C5/h. A4/q | F4/h A4/q C5 | B4/h. G4/q | G4/h B4/q D5 | C#5/h. E5/q | D5/q A4 B4 G4 | G4/w',
      lh: 'C3+B3/w | A2+G3 | D3+C4 | G2+F3 | E3+D4 | A2+G3 | D3+C4/h G2+F3 | C3+B3/w',
    },
  ],
  blues: [
    {
      id: 'pc-stroll', lv: 2, bpm: 92, perf: 112, swing: true, t: 'Twelve-Bar Stroll', src: 'Original for this app',
      rh: bars(
        'r/e G4 Bb4/q C5/h', 'r/e C5 Bb4/q G4/h', 'r/e G4 Bb4/q C5/h', 'r/e C5 Bb4/q G4/h',
        'r/e Eb4 F4/q G4/h', 'r/e G4 F4/q Eb4/h', 'r/e G4 Bb4/q C5/h', 'r/e C5 Bb4/q G4/h',
        'r/e G4 Bb4/q D5/h', 'r/e C5 Bb4/q A4/h', 'r/e G4 Eb4/q C4/h', 'r/q G4 G4/h',
      ),
      lh: seq(BLUES12, SHUFFLE),
    },
    {
      id: 'pc-lowlight', lv: 2, bpm: 66, perf: 76, swing: true, t: 'Low Light Blues', src: 'Original for this app',
      rh: bars(
        'r/q Eb4/e E4 G4/h', 'r/q A4/e G4 F4/h', 'r/q C5/e Bb4 G4/q E4', 'C4/w',
        'r/q Eb4/e F4 A4/h', 'r/q C5/e A4 F4/h', 'r/q G4/e Bb4 C5/h', 'Bb4/q G4 E4 C4',
        'D4/q. F4/e G4/h', 'Eb4/q. F4/e A4/h', 'G4/q E4/e C4 C4/h', 'r/q B3 D4/h',
      ),
      lh: 'C3+Bb3/w | F2+Eb3 | C3+Bb3 | C3+Bb3 | F2+Eb3 | F2+Eb3 | C3+Bb3 | C3+Bb3 | G2+F3 | F2+Eb3 | C3+Bb3 | G2+F3',
    },
    {
      id: 'pc-boogie', lv: 3, bpm: 108, perf: 138, t: 'Boogie on the Line', src: 'Original for this app',
      rh: bars(
        'r/q E4+G4+C5 r E4+G4+Bb4', 'r/q E4+G4+C5 r E4+G4+Bb4', 'r/q E4+G4+C5 r E4+G4+Bb4', 'r/q E4+G4+C5 r E4+G4+Bb4',
        'r/q F4+A4+C5 r Eb4+F4+A4', 'r/q F4+A4+C5 r Eb4+F4+A4', 'r/q E4+G4+C5 r E4+G4+Bb4', 'r/q E4+G4+C5 r E4+G4+Bb4',
        'r/q D4+G4+B4 r D4+F4+B4', 'r/q F4+A4+C5 r Eb4+F4+A4', 'r/q E4+G4+C5 r E4+G4+Bb4', 'r/q D4+G4+B4 D4+F4+B4/h',
      ),
      lh: boogie12,
    },
  ],
  ragtime: [
    {
      id: 'pc-porch', lv: 2, bpm: 84, perf: 104, t: 'Porch Rag', src: 'Original for this app',
      rh: 'E4/e G4/q E4/e G4/h | E4/e G4/q A4/e G4/h | F4/e A4/q F4/e A4/h | G4/e E4/q C4/e E4/h | D4/e F4/q D4/e F4/h | E4/e G4/q E4/e C5/h | B4/e D5/q B4/e G4/q F4 | C5/h. r/q',
      lh: bars(OOM_C, OOM_C, OOM_F, OOM_C, OOM_G7, OOM_C, OOM_G7, 'C3/q E3+G3 C3/h'),
    },
    {
      id: 'pc-slowdrag', lv: 2, bpm: 76, perf: 92, key: 'G', t: 'Slow Drag', src: 'Original for this app',
      rh: 'A#4/e B4/q D5/e B4/h | A#4/e B4/q D5/e G5/h | D#5/e E5/q G5/e E5/h | D5/q B4 G4/h | C5/e A4/q F#4/e A4/h | C5/e A4/q C5/e D5/h | B4/e D5/q B4/e G4/h | G4/h. r/q',
      lh: bars(BOOM_G, BOOM_G, BOOM_C, BOOM_G, BOOM_D7, BOOM_D7, BOOM_G, 'G2/q B3+D4 G2/h'),
    },
    {
      id: 'pc-entertainer', lv: 3, bpm: 84, perf: 112, t: 'The Entertainer (theme)',
      src: 'Scott Joplin, public domain, simplified',
      rh: bars(
        'r/h. D4/e D#4', ENT_2, 'C5/h r/e C5 D5 D#5', 'E5/e C5 D5 E5/q B4/e D5/q', 'C5/h r/q D4/e D#4',
        ENT_2, 'C5/h r/q A4/e G4', 'F#4/e A4 C5 E5/q D5/e C5 A4', 'D5/h. r/q',
      ),
      lh: bars(
        'r/w', OOM_C, OOM_C, 'C3/q E3+G3 G2 F3+G3', 'C3/q E3+G3 C3/h',
        OOM_C, 'C3/q E3+G3 C3 r', 'D3/q F#3+C4 A2 F#3+C4', 'G2/q D3+G3 G2/h',
      ),
    },
  ],
  pop: [
    {
      id: 'pc-window', lv: 1, bpm: 84, perf: 100, t: 'Window Seat', src: 'Original for this app',
      rh: 'E4/h G4 | D4/h G4 | E4/q E4 C4/h | F4/q E4 C4/h | E4/q G4 G4/h | D4/q G4 G4/h | A4/q G4 E4/h | F4/q D4 C4/h',
      lh: 'C3/w | G2 | A2 | F2 | C3 | G2 | A2 | F2',
    },
    {
      id: 'pc-latebus', lv: 2, bpm: 88, perf: 104, t: 'Late Bus Home', src: 'Original for this app',
      rh: 'G4/q. E4/e E4/h | G4/q. D4/e D4/h | A4/q. G4/e E4/q C4 | A4/q G4 F4/h | C5/q. G4/e G4/h | B4/q. G4/e G4/h | C5/q B4/e A4 A4/h | A4/q G4/e F4 F4/h',
      lh: seq([...POP_ROOTS, ...POP_ROOTS], BROKEN),
    },
    {
      id: 'pc-bright', lv: 3, bpm: 100, perf: 116, t: 'Bright Side Street', src: 'Original for this app',
      rh: bars(
        'C4+E4+G4/q. C4+E4+G4 C4+E4+G4/q', 'B3+D4+G4/q. B3+D4+G4 B3+D4+G4/q',
        'C4+E4+A4/q. C4+E4+A4 C4+E4+A4/q', 'C4+F4+A4/q. C4+F4+A4 C4+F4+A4/q',
        'E5/q. D5 C5/q', 'D5/q. B4 G4/q', 'C5/q. B4 A4/q', 'A4/q. G4 F4/q',
      ),
      lh: rep('C3/q. C3 C3/q | G2/q. G2 G2/q | A2/q. A2 A2/q | F2/q. F2 F2/q |', 1) +
        ' C3/q. C3 C3/q | G2/q. G2 G2/q | A2/q. A2 A2/q | F2/q. F2 F2/q',
    },
  ],
  rock: [
    {
      id: 'pc-garage', lv: 1, bpm: 96, perf: 120, t: 'Garage Door', src: 'Original for this app',
      rh: 'E4/q E4 A4/h | F4/q F4 A4/h | E4/q E4 G4/h | D4/q D4 G4/h | A4/q C5 A4/h | C5/q A4 F4/h | G4/q E4 G4/h | D4/h. r/q',
      lh: 'A2+E3/h A2+E3 | F2+C3 F2+C3 | C3+G3 C3+G3 | G2+D3 G2+D3 | A2+E3 A2+E3 | F2+C3 F2+C3 | C3+G3 C3+G3 | G2+D3/h. r/q',
    },
    {
      id: 'pc-rising', lv: 2, bpm: 96, perf: 126, ts: [6, 8], t: 'Rising Arpeggios',
      src: 'Original study on a traditional chord progression',
      rh: 'A3/e C4 E4 A4 E4 C4 | C4 E4 G4 C5 G4 E4 | D4 F#4 A4 D5 A4 F#4 | C4 F4 A4 C5 A4 F4 | A3 C4 E4 A4 E4 C4 | B3 E4 G#4 B4 G#4 E4 | A3 C4 E4 A4 E4 C4 | B3 E4 G#4 B4 G#4 E4',
      lh: 'A2/h. | C3 | D3 | F2 | A2 | E2 | A2 | E2',
    },
    {
      id: 'pc-driver', lv: 3, bpm: 108, perf: 138, t: 'Sunday Driver', src: 'Original for this app',
      rh: bars(
        'E4+G4+C5/q r E4+G4+C5 r', 'E4+G4+C5/q r E4+G4+C5 r', 'E4+G4+C5/q r E4+G4+C5 r', 'E4+G4+C5/q r E4+G4+Bb4/h',
        'F4+A4+C5/q r F4+A4+C5 r', 'F4+A4+C5/q r F4+A4+C5 r', 'E4+G4+C5/q r E4+G4+C5 r', 'E4+G4+C5/q r E4+G4+C5 r',
        'D4+G4+B4/q r D4+G4+B4 r', 'F4+A4+C5/q r F4+A4+C5 r', 'E4+G4+C5/q r E4+G4+C5 r', 'D4+G4+B4/h D4+F4+B4',
      ),
      lh: seq(BLUES12, '1+5/e 1+5 1+6 1+6 1+5 1+5 1+6 1+6'),
    },
  ],
  gospel: [
    {
      id: 'pc-grace', lv: 2, bpm: 80, perf: 92, ts: [3, 4], key: 'G', t: 'Amazing Grace', src: 'Traditional',
      rh: bars(
        'r/h D4/q', 'G4/h B4/e G4', 'B4/h A4/q', 'G4/h E4/q', 'D4/h D4/q', 'G4/h B4/e G4', 'B4/h A4/q', 'D5/h.',
        'D5/h B4/q', 'D5/q. B4/e D5 B4', 'G4/h D4/q', 'E4/q. G4/e G4 E4', 'D4/h D4/q', 'G4/h B4/e G4', 'B4/h A4/q', 'G4/h.',
      ),
      lh: bars(
        'r/h.', gospelG, gospelG, gospelC, gospelG, gospelG, gospelG, gospelD,
        gospelD, gospelG, gospelG, gospelC, gospelG, gospelG, 'G2+D3/h D3+A3/q', gospelG,
      ),
    },
    {
      id: 'pc-sundaywalk', lv: 2, bpm: 80, perf: 92, t: 'Sunday Morning Walk', src: 'Original for this app',
      rh: 'G4/h C5/q C5 | A4+C5/h. A4/q | A4/h G4/q F4 | E4+G4/w | G4/h C5/q E5 | F5/h Eb5 | E5/h D5 | C5/w',
      lh: 'C3/h D3/q E3 | F3/w | F3/h E3/q D3 | C3/w | C3/h D3/q E3 | F3/h F#3 | G3/h G2 | C3/w',
    },
    {
      id: 'pc-glory', lv: 3, bpm: 84, perf: 96, ts: [12, 8], t: 'Glory Shuffle', src: 'Original for this app',
      rh: bars(
        rep(tripC, 4), rep(tripF, 4), rep(tripC, 4), rep(tripG, 4),
        rep(tripC, 4), rep(tripF, 4), rep(tripC, 2) + ' ' + rep(tripG, 2), 'E4+G4+C5/h. r/h.',
      ),
      lh: 'C3/q. C3 E3 G3 | F2 F2 A2 C3 | C3 C3 E3 G3 | G2 G2 B2 D3 | C3 C3 E3 G3 | F2 F2 A2 C3 | C3 C3 G2 G2 | C3/h. r/h.',
    },
  ],
  rnb: [
    {
      id: 'pc-slowjam', lv: 2, bpm: 72, perf: 80, t: 'Slow Jam in C', src: 'Original for this app',
      rh: 'E4+G4+B4/h E4+G4+B4 | E4+G4+C5 E4+G4+C5 | F4+A4+C5 F4+A4+C5 | F4+G4+B4 F4+G4+B4 | B4/q. G4/e E4/h | C5/q. G4/e E4/h | C5/q A4 F4 A4 | B4/h G4',
      lh: 'C3/w | A2 | D3 | G2 | C3+B3 | A2+G3 | D3+C4 | G2+F3',
    },
    {
      id: 'pc-velvet', lv: 2, bpm: 80, perf: 96, ts: [6, 8], t: 'Velvet Six-Eight', src: 'Original for this app',
      rh: 'E5/q. G5 | E5 C5 | A4 C5 | B4 D5 | E5/q G5/e E5/q. | C5/q E5/e C5/q. | A4/q C5/e F5/q. | D5/h.',
      lh: rep('C3@5/e G3@2 C4@1 E4@3 C4@1 G3@2 | A2@5 E3@2 A3@1 C4@3 A3@1 E3@2 | F2@5 C3@2 F3@1 A3@3 F3@1 C3@2 | G2@5 D3@2 G3@1 B3@3 G3@1 D3@2 |', 1) +
        ' C3@5/e G3@2 C4@1 E4@3 C4@1 G3@2 | A2@5 E3@2 A3@1 C4@3 A3@1 E3@2 | F2@5 C3@2 F3@1 A3@3 F3@1 C3@2 | G2@5 D3@2 G3@1 B3@3 G3@1 D3@2',
    },
    {
      id: 'pc-corner', lv: 3, bpm: 88, perf: 100, t: 'Corner Store Groove', src: 'Original for this app',
      rh: bars(
        stab('C4+E4+G4'), stab('C4+F#4+A4'), stab('C4+E4+G4'), stab('C4+F#4+A4'),
        'E5/q D5/e C5 A4/h', 'F#4/e A4 C5/q A4/h', 'E5/q G5/e E5 D5/q C5', 'A4/w',
      ),
      lh: rep('A2/q. A2/e r/q E3/e G3 | D3/q. D3/e r/q A2/e C3 |', 3) + ' A2/q. A2/e r/q E3/e G3 | D3/q. D3/e D3/h',
    },
  ],
  funk: [
    {
      id: 'pc-ontheone', lv: 2, bpm: 88, perf: 104, t: 'On the One', src: 'Original for this app',
      rh: bars(
        'r/q F4+A4+C5 r/h', 'r/q F4+A4+C5 r/e D5 C5/q', 'r/q F4+A4+C5 r/h', 'r/q F4+A4+C5 r/e A4 C5/q',
        'r/q F4+G4+B4 r/h', 'r/q F4+G4+B4 r/e D5 B4/q', 'r/q F4+A4+C5 r/h', 'r/q F4+A4+C5 F4+A4+D5/h',
      ),
      lh: 'D3/q r r/h | D3/q r r C3 | D3/q r r/h | D3/q r r C3 | G2/q r r/h | G2/q r r A2 | D3/q r r/h | D3/q r D3/h',
    },
    {
      id: 'pc-pocket', lv: 2, bpm: 92, perf: 104, t: 'Pocket Change', src: 'Original for this app',
      rh: rep('r/e F4+A4+C5/e r/q r/e F4+A4+C5/e r/q |', 2) + rep(' r/e F4+G4+B4/e r/q r/e F4+G4+B4/e r/q |', 2) +
        rep(' r/e F4+A4+C5/e r/q r/e F4+A4+C5/e r/q |', 2) + ' r/e F4+G4+B4/e r/q r/e F4+G4+B4/e r/q | r/e F4+A4+C5/e r/q F4+A4+C5/h',
      lh: rep('D3/q r/e D3/e r/q C3/q |', 2) + rep(' G2/q r/e G2/e r/q B2/q |', 2) +
        rep(' D3/q r/e D3/e r/q C3/q |', 2) + ' G2/q r/e G2/e r/q B2/q | D3/q r/e D3/e D3/h',
    },
    {
      id: 'pc-sidestep', lv: 3, bpm: 92, perf: 104, t: 'Side Step', src: 'Original for this app',
      rh: bars(FUNK_A, FUNK_B, FUNK_A, 'D4/e D4 r F4 G4/q A4', FUNK_A, FUNK_B, FUNK_A, 'D4+F4+A4/q r D4+F4+A4/h'),
      lh: bars(FUNK_OCT, FUNK_OCT, FUNK_OCT, FUNK_OCT, FUNK_OCT, FUNK_OCT, FUNK_OCT, 'D2/q r D3/h'),
    },
  ],
  latin: [
    {
      id: 'pc-tango', lv: 2, bpm: 88, perf: 108, key: 'F', t: 'Tango Pequeño', src: 'Original for this app',
      rh: 'A4/h F4/q D4 | A4/h F4/q D4 | G4/q. F4/e E4/q C#4 | D4/h. r/q | Bb4/h G4/q D4 | A4/h F4/q D4 | E4/q. F4/e G4/q E4 | D4/w',
      lh: bars(
        pat('D3', HAB), pat('D3', HAB), pat('A2', HAB), pat('D3', HAB),
        pat('G2', HAB), pat('D3', HAB), pat('A2', HAB), 'D3/q. A3/e D3/h',
      ),
    },
    {
      id: 'pc-rio', lv: 3, bpm: 92, perf: 116, t: 'Rio Morning', src: 'Original for this app',
      rh: bars(bossaComp, 'A4/q. F4/e F4/h', 'G4/q. F4/e D4/h', 'E4/q. G4/e G4/h', 'E4/w'),
      lh: bars(bossaBass, bossaBass),
    },
    {
      id: 'pc-calle', lv: 3, bpm: 92, perf: 108, t: 'Calle Montuno', src: 'Original for this app',
      rh: bars(montuno.C, montuno.F, montuno.G, montuno.F, montuno.C, montuno.F, montuno.G, 'E4+G4+C5/w'),
      lh: bars(tumbao.C, tumbao.F, tumbao.G, tumbao.F, tumbao.C, tumbao.F, tumbao.G, 'C3/w'),
    },
  ],
  folk: [
    {
      id: 'pc-scarborough', lv: 2, bpm: 92, perf: 112, ts: [3, 4], t: 'Scarborough Fair', src: 'Traditional',
      rh: SCARB,
      lh: bars(dm, dm, cM, dm, fM, dm, gM, dm, dm, dm, fM, fM, cM, dm, cM, cM, dm),
    },
    {
      id: 'pc-auld', lv: 2, bpm: 84, perf: 96, key: 'F', t: 'Auld Lang Syne', src: 'Traditional',
      rh: 'r/h. C4/q | F4/q. F4/e F4/q A4 | G4/q. F4/e G4/q A4 | F4/q. F4/e A4/q C5 | D5/h. D5/q | C5/q. A4/e A4/q F4 | G4/q. F4/e G4/q A4 | F4/q. D4/e D4/q C4 | F4/h. r/q',
      lh: 'r/w | F3+A3 | C3+G3 | F3+A3 | Bb2+F3 | F3+A3 | C3+G3 | Bb2+F3/h C3+G3 | F2+C3/w',
    },
    {
      id: 'pc-kitchen', lv: 3, bpm: 84, perf: 96, t: 'Kitchen Table Song', src: 'Original for this app',
      rh: 'E4/q G4/h E4/q | E4/q A4/h G4/q | F4/q A4/h C5/q | B4/q G4/h D4/q | E4/q G4 C5/h | C5/q B4/e A4 A4/h | A4/q C5 B4 D5 | C5/w',
      lh: bars(
        seq(['C3', 'A2', 'F2', 'G2', 'C3', 'A2'], BROKEN),
        pat('F2', '1/e 5 8 5') + ' ' + pat('G2', '1/e 5 8 5'), 'C3/e G3 C4/h.',
      ),
    },
  ],
  country: [
    {
      id: 'pc-susanna', lv: 2, bpm: 96, perf: 120, t: 'Oh! Susanna', src: 'Stephen Foster, public domain',
      rh: bars(
        'r/h. C4/e D4', SUS_1, SUS_2, 'E4/q E4 D4 C4', 'D4/h. C4/e D4', SUS_1, SUS_2, SUS_7, 'C4/h. r/q',
        'F4/h F4', 'A4/q A4/h A4/q', 'G4/q G4 E4 C4', 'D4/h. C4/e D4', SUS_1, SUS_2, SUS_7, 'C4/w',
      ),
      lh: 'r/w | C3/h G2 | C3 G2 | C3 G2 | G2 D3 | C3 G2 | C3 G2 | C3 G2 | C3/w | F2/h C3 | F2 C3 | C3 G2 | G2 D3 | C3 G2 | C3 G2 | C3 G2 | C3/w',
    },
    {
      id: 'pc-dusty', lv: 2, bpm: 96, perf: 120, ts: [3, 4], key: 'G', t: 'Dusty Road Waltz', src: 'Original for this app',
      rh: 'B4/h D5/q | B4/h G4/q | E5/h C5/q | D5/h. | B4/h D5/q | C5/h A4/q | F#4/q A4 C5 | G4/h.',
      lh: 'G2/q B3+D4 B3+D4 | G2 B3+D4 B3+D4 | C3 C4+E4 C4+E4 | G2 B3+D4 B3+D4 | G2 B3+D4 B3+D4 | D3 A3+C4 A3+C4 | D3 A3+C4 A3+C4 | G2/h.',
    },
    {
      id: 'pc-frontporch', lv: 3, bpm: 80, perf: 96, key: 'G', t: 'Front Porch Slip', src: 'Original for this app',
      rh: bars(SLIP_G, 'B4/q D5/h B4/q', 'C5/q E5/h C5/q', 'D5/q C5 A4 F#4', 'A4+D5/e B4+D5/q. B4+D5/h'),
      lh: bars(BOOM_G, BOOM_C, BOOM_D7, BOOM_G, BOOM_G, BOOM_C, BOOM_D7, 'G2/q B3+D4 G2/h'),
    },
  ],
  film: [
    {
      id: 'pc-firstlight', lv: 2, bpm: 80, perf: 92, t: 'First Light', src: 'Original for this app',
      rh: bars(
        rep('A4/e C5 E5 C5', 2), rep('A4/e C5 F5 C5', 2), rep('G4/e C5 E5 C5', 2), rep('G4/e B4 D5 B4', 2),
        rep('A4/e C5 E5 C5', 2), rep('A4/e C5 F5 C5', 2), rep('G4/e C5 E5 C5', 2), rep('G4/e B4 D5 B4', 2), 'A4+C5+E5/w',
      ),
      lh: 'A2/w | F2 | C3 | G2 | A2/h E3 | F2 C3 | C3 G3 | G2 D3 | A2+E3/w',
    },
    {
      id: 'pc-gymnopedie', lv: 2, bpm: 66, perf: 76, sampleFrom: 4, ts: [3, 4], key: 'D', t: 'Gymnopédie No. 1 (opening)',
      src: 'Erik Satie, public domain',
      rh: 'r/h. | r | r | r | r/q F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4/h. | F#4 | F#4 | F#4 | F#4',
      lh: rep('G2/q B3+D4+F#4/h | D2/q A3+C#4+F#4/h |', 5) + ' G2/q B3+D4+F#4/h | D2/q A3+C#4+F#4/h',
    },
    {
      id: 'pc-longway', lv: 3, bpm: 72, perf: 84, t: 'Long Way Home', src: 'Original for this app',
      rh: 'E5/h. D5/q | C5/h A4 | G4/h. C5/q | B4/w | E5/q G5/h E5/q | F5/q E5 C5/h | E5/q D5 C5 G4 | B4/h. r/q | A4/w',
      lh: bars(
        pat('A2', '1/e 5 8 9 b10 9 8 5'), pat('F2', LONG), pat('C3', LONG), pat('G2', LONG),
        pat('A2', '1/e 5 8 9 b10 9 8 5'), pat('F2', LONG), pat('C3', LONG), pat('G2', LONG), 'A2+E3/w',
      ),
    },
  ],
};

// ---------------------------------------------------------------- assembly

const tag = (list, track, kind) => list.map((x) => ({ ...x, track, kind }));

export const TRACK_INFO = {
  technique: { id: 'technique', name: 'Technique', blurb: 'Warm-ups: finger patterns, scales, chords.' },
  foundations: { id: 'foundations', name: 'Foundations', blurb: 'Reading, both hands, first chords.' },
};
for (const g of GENRES) TRACK_INFO[g.id] = g;

export const TRACK_ITEMS = {
  technique: tag(TECHNIQUE, 'technique', 'technique'),
  foundations: tag(FOUNDATIONS, 'foundations', 'focus'),
};
export const PIECE_ITEMS = {};
for (const g of GENRES) {
  TRACK_ITEMS[g.id] = tag(TRACKS[g.id], g.id, 'focus');
  PIECE_ITEMS[g.id] = tag(PIECES[g.id], g.id, 'piece').map((p) => ({
    focus: 'A complete short piece that puts the genre skills together.',
    gain: 'Brings the skills from the exercises together in something you can play from start to finish.',
    tip: 'Learn it in small sections, hands separately first. Only then connect the sections.',
    ...p,
  }));
}

// ---------------------------------------------------------------- stages of mastery
//
// Speed exercises (perf): the third stage is Solid at a tempo this is commonly played at.
// Feel exercises (goal): faster is not better; the third stage is Solid against this goal, and they
// keep coming back for refinement. Goals are written as things you can check for yourself.
const STAGE_INFO = {
  'fd-rh': { perf: 100 },
  'fd-lh': { perf: 100 },
  'fd-turns': { goal: 'The beat carries straight on through every hand change, with no hesitation before a new hand comes in.' },
  'fd-bass': { goal: 'The bass notes ring for their full length while the tune moves above them, smooth and unhurried.' },
  'fd-chords': { perf: 96 },
  'fd-melody-chords': { goal: 'The tune is clearly louder than the chords, and the chords change without a gap.' },
  'fd-eighths': { perf: 100 },

  'cl-ode-r': { goal: 'Every note joins the next with no gaps or bumps, and each phrase rises and falls like a singer would shape it.' },
  'cl-ode-bass': { goal: 'The melody sings over quiet bass notes that last their full length.' },
  'cl-alberti': { perf: 112 },
  'cl-run': { perf: 116 },
  'cl-melody-alberti': { perf: 108 },

  'jz-swing': { goal: 'The long–short feel comes without thinking, and the off-beats lean forward slightly. Hum along: it should feel like walking, not marching.' },
  'jz-shells': { goal: 'Each shape lands without looking, and the top notes move smoothly from chord to chord.' },
  'jz-251': { goal: 'Swung and relaxed, with the line flowing into each new chord instead of stopping on it.' },
  'jz-walk': { perf: 160 },
  'jz-charleston': { goal: 'Short, crisp chords, with the second one landing confidently just before beat three every time.' },

  'bl-form': { goal: 'You keep your place through all twelve bars without counting out loud, and feel each chord change coming.' },
  'bl-shuffle': { perf: 132 },
  'bl-scale': { perf: 132 },
  'bl-call': { goal: 'The left hand rolls on unchanged while the right hand phrases freely, with real silence between the licks.' },
  'bl-boogie': { perf: 160 },

  'rg-oompah': { perf: 112 },
  'rg-chromatic': { perf: 112 },
  'rg-synco': { goal: 'The off-beat notes bounce against a rock-steady left hand, without the tune pulling the beat.' },
  'rg-together': { perf: 100 },
  'rg-stride': { perf: 104 },

  'pp-four': { goal: 'Chords change smoothly with no gaps, and you can play through without watching your hands.' },
  'pp-pulse': { goal: 'Every chord at the same volume with a loose wrist. It could carry a whole song.' },
  'pp-broken': { goal: 'Flowing and even, the bass note a touch stronger, no bump when the hand opens to the octave.' },
  'pp-melody': { goal: 'The tune sings clearly above a flowing accompaniment that runs without your attention.' },
  'pp-332': { goal: 'The 3+3+2 grooves without counting, and the accents feel natural rather than placed.' },

  'rk-power': { perf: 140 },
  'rk-eighths': { perf: 140 },
  'rk-riff': { perf: 130 },
  'rk-rnr': { perf: 160 },
  'rk-stabs': { perf: 132 },

  'gs-amen': { goal: 'Full, warm chords with every note sounding together, ringing into each other without blurring.' },
  'gs-waltz': { goal: 'A strong bass on one and light chords on two and three: it sways rather than marches.' },
  'gs-walkup': { goal: 'Each walk-up grows slightly louder and leads naturally into the new chord.' },
  'gs-passing': { goal: 'You hear each changed note pulling towards the next chord, and the changes sound connected.' },
  'gs-128': { goal: 'A rolling three-to-a-beat feel with a gentle lean on each group, unhurried and even.' },

  'rb-backbeat': { goal: 'Chords sit exactly on two and four, locked with the bass like a drummer and bass player.' },
  'rb-sevenths': { goal: 'Each seventh chord sounds full and balanced, and the changes are smooth without looking.' },
  'rb-melody': { goal: 'Phrased like a singer: slightly behind the beat, with each phrase shaped rather than played note by note.' },
  'rb-68': { goal: 'Six flowing notes per bar, soft and even, with a small lean on 1 and 4.' },
  'rb-groove': { goal: 'The bass line grooves on its own, and the chords drop in on two and four without disturbing it.' },

  'fu-one': { goal: 'Tight and precise: short notes, and silences that land exactly in time.' },
  'fu-offbeat': { goal: 'Every chord short and exactly between the beats, with your foot steady on the beat.' },
  'fu-riff': { perf: 108 },
  'fu-octave': { perf: 108 },
  'fu-both': { goal: 'The hands interlock without thinking, and it grooves at a steady tempo for a full minute.' },

  'lt-bossa-bass': { goal: 'Gentle and steady, with the short note always leading into the next long one.' },
  'lt-habanera': { goal: 'The long, short, long, long rhythm sways, and the melody floats on top of it.' },
  'lt-comp': { goal: 'The off-beat chords feel natural rather than counted, light and evenly spaced.' },
  'lt-bossa': { goal: 'The bass never wavers and the chords sit lightly between its notes. You could keep it going for a minute while humming a melody.' },
  'lt-montuno': { perf: 132 },

  'fk-drone': { goal: 'The drone rings softly underneath while the tune moves freely above it.' },
  'fk-waltz': { goal: 'A strong first beat and two light chords: it sways like a dance.' },
  'fk-picking': { goal: 'Rolling and even like a fingerpicked guitar, quiet enough to sing over.' },
  'fk-sus': { goal: 'You hear the tension in each sus chord and its release, and shape the resolution gently.' },
  'fk-scarb': { goal: 'The melody moves in long phrases over a ringing bass, never rushed.' },

  'ct-penta': { perf: 120 },
  'ct-boom': { perf: 120 },
  'ct-walk': { perf: 120 },
  'ct-slip': { goal: 'The slip sounds like a quick slide into the note, with the top note held clean above it.' },
  'ct-both': { perf: 112 },

  'fm-fifths': { goal: 'Each sound starts softly and is allowed to ring. Silence and tone matter more than the notes.' },
  'fm-arp': { goal: 'Every note the same soft volume, with no bumps where the hand moves.' },
  'fm-ostinato': { goal: 'The pattern stays perfectly even through every change, and the bass notes carry the emotion.' },
  'fm-melody': { goal: 'The long melody notes sing above a quiet, flowing left hand.' },
  'fm-332': { goal: 'The 3+3+2 pulse feels effortless, the left hand locked to the first note of each group.' },
};
for (const items of Object.values(TRACK_ITEMS)) {
  items.forEach((it, i) => { if (STAGE_INFO[it.id]) items[i] = { ...it, ...STAGE_INFO[it.id] }; });
}

// ---------------------------------------------------------------- the same exercises in new keys
//
// Once you master a genre or foundation exercise, it comes back later in a new key: the same skill
// with new hand positions, black keys and a new key signature. Keys follow what is common in each
// genre. Scales and arpeggios already have their own keys in the technique track, and pieces stay
// in the key they were written in.
const UP4 = [5, 3];
const UP5 = [7, 4];
const UP2 = [2, 1];
const DOWN2 = [-2, -1];
const KEY_PLAN = {
  foundations: [UP5, UP4, UP2],
  classical: [UP5, UP4, UP2],
  pop: [UP5, UP4, UP2],
  folk: [UP5, UP4, UP2],
  rock: [UP5, UP4, UP2],
  jazz: [UP4, DOWN2, UP5],
  blues: [UP4, UP5, DOWN2],
  latin: [UP4, UP5, UP2],
  gospel: [UP4, DOWN2, UP5],
  rnb: [UP4, DOWN2, UP5],
  ragtime: [UP4, DOWN2, UP5],
  funk: [UP2, UP4, UP5],
  country: [UP4, UP5, UP2],
  film: [UP4, UP5, DOWN2],
};
const NOTE_RE = /([A-G](?:#{1,2}|b{1,2})?-?\d)(@[1-5])?/g;
const noteNames = (str) => (str ? [...str.matchAll(NOTE_RE)].map((m) => m[1]) : []);
const shiftVoice = (str, steps, semis) => (str ? str.replace(NOTE_RE, (_, n, f) => transposeNote(n, steps, semis) + (f || '')) : str);
const pitchName = (note) => note.replace(/-?\d$/, '').replace('#', '♯').replace(/b$/, '♭').replace('bb', '𝄫');

// The home key of exercises that are in minor (all others are in the major key of their key
// signature), so a version can be named "in D minor" rather than after its key signature.
const MINOR_HOME = {
  'fm-fifths': 'A', 'fm-arp': 'A', 'fm-ostinato': 'A', 'fm-melody': 'A', 'fm-332': 'A',
  'fu-one': 'D', 'fu-offbeat': 'D', 'fu-riff': 'D', 'fu-octave': 'D', 'fu-both': 'D',
  'rk-power': 'A', 'rk-eighths': 'A', 'rk-riff': 'A', 'rk-stabs': 'A',
  'lt-habanera': 'D', 'rb-melody': 'A', 'rb-groove': 'A', 'fk-drone': 'D', 'fk-scarb': 'D',
};
function keyLabel(item, steps, semis) {
  const sig = transposeNote((item.key || 'C') + '4', steps, semis).replace(/-?\d$/, '');
  const minor = MINOR_HOME[item.id];
  if (minor) return { sig, name: `${pitchName(transposeNote(minor + '4', steps, semis))} minor` };
  return { sig, name: pitchName(sig) };
}

// How far a hand's notes stray from its staff (bass G2-A3, treble E4-F5), in semitones.
const offStaff = (midis, hand) => {
  const [lo, hi] = hand === 'L' ? [43, 57] : [64, 77];
  return midis.reduce((a, m) => a + Math.max(0, lo - m, m - hi), 0);
};

function keyVersions(item) {
  const plan = KEY_PLAN[item.track];
  if (!plan) return [];
  return plan.map(([semis, steps], i) => {
    // Up or down: each hand takes the octave that keeps it closest to its own staff, within a
    // normal keyboard range.
    const options = semis > 0 ? [[semis, steps], [semis - 12, steps - 7]] : [[semis, steps], [semis + 12, steps + 7]];
    const voice = (str, hand) => {
      if (!str) return str;
      const notes = noteNames(str).map(noteToMidi);
      const fits = ([d]) => notes.every((m) => m + d >= 36 && m + d <= 96);
      const score = ([d]) => offStaff(notes.map((m) => m + d), hand) + 0.1 * Math.abs(d);
      const [d, st] = options.filter(fits).sort((x, y) => score(x) - score(y))[0] || options[0];
      let out = shiftVoice(str, st, d);
      // A written fingering that would put the thumb on a black key is left to the fingering engine.
      if ([...out.matchAll(NOTE_RE)].some((m) => m[2] === '@1' && isBlackKey(noteToMidi(m[1])))) out = out.replace(/@[1-5]/g, '');
      return out;
    };
    const { sig, name } = keyLabel(item, steps, semis);
    return {
      ...item,
      id: `${item.id}~${i + 1}`,
      base: item.id,
      version: i + 1,
      keyName: name,
      t: `${item.t} · in ${name}`,
      key: sig,
      rh: voice(item.rh, 'R'),
      lh: voice(item.lh, 'L'),
    };
  });
}

// The versions of each exercise in other keys, in the order they come.
export const KEY_VERSIONS = {};
for (const track of Object.keys(KEY_PLAN)) {
  for (const item of TRACK_ITEMS[track] || []) KEY_VERSIONS[item.id] = keyVersions(item);
}
const VERSION_ITEMS = Object.values(KEY_VERSIONS).flat();

export const ALL_ITEMS = [...Object.values(TRACK_ITEMS).flat(), ...Object.values(PIECE_ITEMS).flat(), ...VERSION_ITEMS];
export const ITEM_BY_ID = Object.fromEntries(ALL_ITEMS.map((x) => [x.id, x]));

// The exercise to build up with when one is too hard for now. Without an entry, it is the one
// before it in the same track (for a piece, the genre exercise at its position).
export const PREP = {
  'tq-c-ht': 'tq-c-contrary', 'tq-g-ht': 'tq-c-ht', 'tq-d-ht': 'tq-g-ht', 'tq-f-r': 'tq-c-r',
  'tq-am-ht': 'tq-c-ht', 'tq-em-ht': 'tq-am-ht', 'tq-c-eighths': 'tq-c-ht', 'tq-cadence-g': 'tq-cadence-c',
};

// Passages used by the skill check when setting up a profile.
export const ASSESS_PASSAGES = ['tq-five-r', 'fd-melody-chords', 'cl-melody-alberti'];
// Exercises for the speed part of the skill check, one per level, shown as falling keys.
export const ASSESS_SPEED = ['tq-five-ht', 'fd-eighths', 'tq-c-eighths'];
