# Piano

A no-nonsense piano practice app. It runs entirely in the browser, stores everything on the device,
and installs to a phone's home screen.

## What it does

- **Sessions built for you.** Set minutes per session and practice days per week; the app picks the
  exercises. Before each session you make one choice: how long today.
- **Two views.** Falling keys or sheet music, switchable at any time.
- **13 genres**, each with five graded exercises, three short pieces and three audio samples.
- **Three ways to follow you.** Play along and rate yourself, microphone (approximate), or a MIDI
  keyboard (exact; needs Chrome or Edge on a laptop or Android device).
- **Finger numbers** (1 thumb to 5 little finger) on the falling notes and in the sheet music.
- **A walkthrough** opens any exercise you have not yet played near its target tempo: step through it
  note by note, drag through it, or play it slowly.
- **Play from any bar**: while stopped, step or drag to a bar and practise from there.
- **Too hard for now?** sets an exercise aside for a couple of sessions and puts the step before it in
  its place. After two Hard ratings in a row, the app offers this itself.
- **Every exercise explains itself**: what it is, what it does for you, and how to practise it.
- **Ear training and note reading**: choose the number of questions (steps of 5). Small levels (five
  for reading, four for ear). Moving up is offered at 85% over your last 40 answers at a level (90%
  from 20 on), and you can decline. The first 20 answers after a level change never count against
  you; after that a step back is offered under 60%, and only happens automatically at 50% or less
  with under 60% of answers right. Every note or interval counts equally in the score, and ones you
  get wrong (or, in note reading, answer much more slowly than usual) come up more often.
  In note reading, consecutive notes are at least a third apart (never the note from two questions
  back), and right answers slower than the level's time limit (3 s on level 1 down to 1.5 s on level
  5) count half towards moving up. Ear questions start anywhere from C3 to C5, never on a note just
  heard.
- **No tempo limit**: play as fast as you can, and progress follows.
- **New keys**: once you master a genre or foundation exercise, it returns (after a couple of sessions,
  and after new exercises) in a new key that suits the genre, up to three keys each, e.g. jazz in F,
  B♭ and G. Notes, key signature and fingering are worked out by the app; each key version starts at
  85% of your tempo on the original. Scales have their own keys; pieces stay in theirs.
- **Three stages of mastery**: Secure (Solid at the target on two different days), Fluent and In the
  style. Speed exercises move through tempos (target, about 25% faster, and a tempo the music is often
  played at; scales up to about 170 notes a minute). Feel exercises move through goals (relaxed and
  steady, then a written goal for the style) and keep coming back every week or two to refine. Each
  stage needs Solid on two different days. Levels only mark technique and foundation exercises as
  known; genre exercises are never skipped.
- **Skill check** at setup (note reading, ear, sight-reading passages and a speed check on real exercises), **ear training** and **note reading** as optional extras or on their own.
- **Progress** centred on a weekly goal rather than a daily streak.
- **Evening mode**: a dim, warm theme with dark sheet music, switchable by hand or automatically at night.

## How sessions are planned

| Target length | Structure |
|---|---|
| under 8 min | one exercise; technique, genre work and review take turns |
| 8–12 min | technique warm-up + one focus exercise |
| 13–19 min | warm-up + two focus exercises |
| 20 min and up | warm-up + 2–5 focus exercises + review |

- The structure follows the target length in Settings. A longer or shorter session on the day
  stretches or shrinks the same exercises; a much shorter one drops exercises from the end.
- With three or more practice days a week, focus exercises rotate between genres. With one or two,
  the same set repeats until mastered.
- The weekly goal counts practice days, not sessions: a second session on the same day still counts
  in the stats and moves the queue on.
- There is no calendar. The queue only moves when you play, so skipped or extra sessions need no
  special handling.
- An exercise is secure after Solid ratings at its target tempo on two different days. It then
  returns every few days for the next stage, and at growing gaps once all stages are done.
- Playing well above the target counts towards later stages too, but every stage still needs two
  days. After three solid ratings in a row at full tempo, new exercises start at full tempo instead
  of 70%. The skill check's speed result raises the starting tempo the same way.
- After three exercises in a row secured well above tempo, the app offers to move you up a level.

## Run it

No build step. Serve the folder with any static server:

```
npm start        # python3 -m http.server 8080
npm test         # planner, content and note-detection tests
```

To host it, enable GitHub Pages for the repository (Settings → Pages → Deploy from a branch, root folder).

## Layout

- `js/content.js` – genres, exercises and pieces, written in a compact text notation
- `js/music.js` – the notation parser and theory helpers
- `js/fingering.js` – works out finger numbers; fingers written in the music (`C4@1`) are kept
- `js/planner.js` – session building, mastery and review rules, statistics
- `js/player.js`, `js/sheet.js` – the exercise player and its two views
- `js/audio.js`, `js/input.js`, `js/detect.js` – sound, MIDI and microphone listening
- `piano/` – grand piano samples, one every three semitones
- `js/quiz.js` – note reading and ear training questions
- `js/app.js` – screens
- `vendor/vexflow.js` – VexFlow 4.2.5 (MIT) for music notation

## Music sources

Public-domain and traditional pieces are marked as such in the app. Everything else was written for
this app.

## Piano sound

The samples in `piano/` are from the Salamander Grand Piano V3 by Alexander Holm, licensed under
[CC BY 3.0](http://creativecommons.org/licenses/by/3.0/). They were converted to mono, trimmed and faded for this app.
