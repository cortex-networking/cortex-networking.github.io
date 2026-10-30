# Middle C

A browser piano tutor for USB MIDI keyboards, in the spirit of the keyboard-plus-software
courses of the early 1990s (the Miracle Piano Teaching System and friends), rebuilt for the web.

Live at `/piano/`. Static files, no build step, no tracking, no accounts.

## What it does

- **Learn**: a 10-chapter, 61-lesson course from finding middle C to hands together, chords,
  sharps and flats, minor keys and dynamics. Every lesson states a goal, ends with a check that
  has to be passed to open the next lesson, and builds toward a target tune for the chapter.
  Finishing a chapter earns a printable certificate.
- **Coach**: every mistake is classified (reading, line or space, neighbor key, accidental,
  octave, missed, early, late, hands, dynamics and so on). The coach tracks which ones keep
  coming back, writes short practice routines from the exact bars that went wrong, and puts
  the weakest skills on the home screen as "Today's practice".
- **Songs**: 67 public-domain pieces with original arrangements, in collections (epic and dark,
  classical, folk, sea shanties, marches, game and film favorites, blues and rock, holiday).
  Wait mode, play-along (graded on timing), rhythm-only tapping and listen; right, left or
  both hands; the app can play the other hand. A backing band (bass, drums, pads, chords) is
  generated from each song's chord chart in one of eleven styles.
- **Arcade**: games modelled on the Miracle's: Ducks (the shooting gallery, for reading notes),
  Ripchord (chords against the clock), Aliens! (copy the aliens' phrase, for fingering and memory)
  and Roboman (rhythm: hold notes to build bridges). Every game also has a song mode that teaches
  a real song: Ducks swims its melody in order, Aliens! teaches it phrase by phrase and chains the
  phrases together, Roboman rolls through its rhythm, Ripchord drills its chords. A shared Hall of
  Fame lists the top scores of everyone on the device. Flashcards cover theory.
- **Learn it with games**: every song page has a path that teaches that song through the games
  (rhythm, notes, phrases, left hand, chords) and ends with playing it with the band. The coach
  and the course drop into the same games when they spot a weakness.
- **Jukebox**: as in the original, every song with the full band, one after another, by
  collection or shuffled.
- **Free play**: live grand staff plus chord and interval names, metronome.
- **Profiles**: several learners on one device, each with their own progress, interests,
  practice streak and 14-day practice chart.

Progress is saved in the browser's local storage only.

## Input and sound

- USB MIDI through the Web MIDI API (Chrome, Edge, Opera, Firefox; not Safari).
  Sustain pedal (CC64) is supported. Hot-plugging works.
- Without a keyboard: on-screen keys (mouse or touch, glissando) or computer keys
  `A W S E D F T G Y H U J K` from C, with `Z` / `X` for octave.
- Sampled grand piano (Salamander Grand, CC BY 3.0, see `samples/CREDITS.txt`), plus synth
  electric piano, organ and the band voices. Demos, the other hand and the band can be routed
  to a MIDI output such as a digital piano.
- Latency compensation for play-along grading is in Settings.

## Files

- `index.html`, `css/app.css`, `css/games.css`, `css/arcade.css`, `css/game-*.css`
- `js/theory.js` note spelling, voice parser, chord names
- `js/staff.js` SVG grand staff (beams, ties, dynamics, key signatures, fingerings)
- `js/audio.js` sampled piano, synth voices, drum kit, MIDI-out routing
- `js/input.js` Web MIDI, computer keys; `js/keyboard.js` on-screen keyboard
- `js/session.js` wait / play-along / tap / listen engine
- `js/coach.js` mistake taxonomy, skill tracking, practice routines
- `js/backing.js` backing band from chord charts
- `js/curriculum.js` chapters and lessons; `js/lesson.js` lesson runner and mastery gates
- `js/songs-*.js`, `js/library.js` songs; `js/catalog.js` joins songs, lessons and games
- `js/home.js` Learn home, progress page, certificates
- `js/arcade.js` arcade kit (stage, sound effects, Hall of Fame); `js/game-*.js` the four games;
  `js/arcade-games.js` registry
- `js/songmode.js` (with the Learn-it-with-games path), `js/jukebox.js`, `js/modes.js`, `js/gamebase.js`,
  `js/games-extra.js` songs, Jukebox, free play, Flashcards
- `js/store.js` profiles and local storage; `js/app.js` shell, routing, settings
- `fonts/notation-subset.woff2` a subset of Bravura (SIL OFL), renamed per the license

Fonts for UI text come from the site's own IBM Plex files in `/fonts/`.

## Adding a song

Add an entry to one of the `js/songs-*.js` files:

```js
{ id: 'my-song', title: 'My Song', composer: 'Traditional', level: 1, key: 'C', time: [4, 4], tempo: 96,
  tags: ['folk'], style: 'folk', chords: 'C | G7 | C | ...',
  rh: '!mf E4q:3 D4:2 C4h:1 | ...', lh: 'C3w:5 | ...' }
```

Durations are `w h q e s` (add `.` for dotted) and carry forward; `r` is a rest;
`C4+E4+G4` is a chord; `:3` is a fingering; `~` ties into the next note; `!p` / `!f` set the
dynamic; `pickup: 1` gives a one-beat pickup bar. Keep every bar the right length.
Chord charts have one chord per bar, or `C:3 G7:1` to split a bar by beats.
