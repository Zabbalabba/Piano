# Piano

A no-nonsense piano practice app. It runs entirely in the browser, stores everything on the device,
and installs to a phone's home screen.

## What it does

- **Sessions built for you.** Set minutes per session and sessions per week; the app picks the
  exercises. Before each session you make one choice: how long today.
- **Two views.** Falling keys or sheet music, switchable at any time.
- **13 genres**, each with five graded exercises, three short pieces and three audio samples.
- **Three ways to follow you.** Play along and rate yourself, microphone (approximate), or a MIDI
  keyboard (exact; needs Chrome or Edge on a laptop or Android device).
- **Skill check** at setup, **ear training** and **note reading** as optional extras or on their own.
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
- With three or more sessions a week, focus exercises rotate between genres. With one or two, the
  same set repeats until mastered.
- There is no calendar. The queue only moves when you play, so skipped or extra sessions need no
  special handling.
- An exercise is mastered after two "Solid" ratings at (or near) its target tempo. It then returns
  for review after 3 days, with the gap growing each time.

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
