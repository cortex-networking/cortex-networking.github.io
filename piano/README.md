# Middle C

A browser piano tutor for USB MIDI keyboards, in the spirit of the keyboard-plus-software
courses of the early 1990s (the Miracle Piano Teaching System and friends), rebuilt for the web.

Live at `/piano/`. Static files, no build step, no tracking, no accounts.

## What it does

- **Lessons**: 14 short lessons in six units, from finding middle C to hands together.
  Steps are note-finding drills, wait-for-you sequences and timed rhythm exercises.
- **Songs**: 12 public-domain pieces with original arrangements. Wait mode, play-along
  (graded on timing), listen; right, left or both hands; the app can play the other hand.
- **Games**: Note Rush (staff reading), Echo (ear training), Key Hunt (keyboard geography).
- **Free play**: live grand staff plus chord and interval names, metronome.

Progress is saved in the browser's local storage only.

## Input and sound

- USB MIDI through the Web MIDI API (Chrome, Edge, Opera, Firefox; not Safari).
  Sustain pedal (CC64) is supported. Hot-plugging works.
- Without a keyboard: on-screen keys (mouse or touch, glissando) or computer keys
  `A W S E D F T G Y H U J K` from C, with `Z` / `X` for octave.
- Built-in Web Audio synth (piano, electric piano, organ), or route demos and
  accompaniment to a MIDI output such as a digital piano.

## Files

- `index.html`, `css/app.css`
- `js/theory.js` note spelling, voice parser, chord names
- `js/audio.js` synth and MIDI-out routing
- `js/input.js` Web MIDI, computer keys
- `js/keyboard.js` on-screen keyboard
- `js/staff.js` SVG grand staff renderer
- `js/session.js` wait / play-along / listen engine
- `js/library.js` lessons, songs, games (voice syntax documented in `theory.js`)
- `js/modes.js` lesson, song, game and free-play controllers
- `js/app.js` shell, routing (`#/lessons/l3`, `#/songs/ode-to-joy`, ...), settings
- `fonts/notation-subset.woff2` a 29-glyph subset of Bravura (SIL OFL), renamed per the license

Fonts for UI text come from the site's own IBM Plex files in `/fonts/`.

## Adding a song

Add an entry to `SONGS` in `js/library.js`:

```js
{ id: 'my-song', title: 'My Song', composer: 'Traditional', level: 1, key: 'C', time: [4, 4], tempo: 96,
  rh: 'E4q:3 D4:2 C4h:1 | ...', lh: 'C3w:5 | ...' }
```

Durations are `w h q e s` (add `.` for dotted) and carry forward; `r` is a rest;
`C4+E4+G4` is a chord; `:3` is a fingering. Keep every bar the right length.
