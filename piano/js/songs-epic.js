// Epic, dark and cinematic classics for Middle C: the kind of music heard in trailers, war films,
// games and big montages. Every piece is public domain (composer died 1955 or earlier and the work
// was published by 1930); every arrangement here is original and simplified, and melodies were
// checked note by note against public-domain editions and sequences (Mutopia, mfiles, IMSLP parts).
// Voice syntax: see parseVoice() in theory.js.

const rep = (tok, n) => Array(n).fill(tok).join(' ');

// Mars: the 5/4 ostinato written in 15/8 so its opening triplet is exact (one bar = five big beats).
const MARS_OST = 'G2e G2 G2 G2q. G2q. G2e. G2e. G2q.';

// Night on Bald Mountain: the shivering two-note figure (repeated twice per bar).
const witch = (lo, a, b, fa = '', fb = '') => `${lo}+${a}e${fa ? ':' + fa : ''} ${lo}+${b}e${fb ? ':' + fb : ''} ${lo}+${b}e ${lo}+${a}e`;

// Beethoven 7: the long-short-short-long-long rhythm on one note, or on two notes for the last beat.
const dactyl = (a, b = a) => `${a}q ${a}e ${b}e`;

// Symphony 40: viola-style eighth-note pulse in the left hand.
const pulse = (bass, a, b) => `${bass}+${a}e ${b}e ${a}e ${b}e ${a}e ${b}e ${a}e ${b}e`;

export const SONGS_EPIC = [
  {
    id: 'mars', title: 'Mars, the Bringer of War (opening)', composer: 'Gustav Holst', year: 1914,
    level: 3, key: 'C', time: [15, 8], tempo: 150,
    tags: ['epic', 'classical', 'games'], style: 'epic',
    blurb: 'The god of war arrives: a relentless five-beat drumbeat on G (written as five big beats, each split in three) while brass calls grind against it. The sound behind countless battle scenes.',
    chords: 'G5 | G5 | G5 | G5 | Db/G | Db/G | G5 | G5 | G5 | Db/G:4.5 Ab5/G:3 | G5 | Db/G:4.5 Ab5/G:3 | G5 | Db/G | Db/G | Db/G',
    rh: 'rh. rq. rh. | rh. rq. rh. | !p G4h.:1~ G4q.~ G4h.~ | G4h.~ G4q. D5h.:5 | Db5h.:4~ Db5q.~ Db5h.~ | Db5h.~ Db5q. rh. | rh. rq. rh. | '
      + 'G4h.:1~ G4q.~ G4h.~ | G4h.~ G4q. D5h.:5 | Db5h.:4~ Db5q. Ab4h.:2 | !mp G4h.:1~ G4q. D5h.:5 | Db5h.:4~ Db5q. Ab4h.:2 | G4h.:1~ G4q. D5h.:5 | '
      + '!mf F4+Ab4+Db5h.:135~ F4+Ab4+Db5q.~ F4+Ab4+Db5h.~ | F4+Ab4+Db5h.~ F4+Ab4+Db5q.~ F4+Ab4+Db5h.~ | F4+Ab4+Db5q. rq. rq. rh.',
    lh: `!pp G2e:3 ${MARS_OST.slice(4)} | ${MARS_OST} | !p ${MARS_OST} | ${MARS_OST} | ${MARS_OST} | ${MARS_OST} | ${MARS_OST} | ${MARS_OST} | ${MARS_OST} | ${MARS_OST} | `
      + `!mp ${MARS_OST} | ${MARS_OST} | ${MARS_OST} | !mf ${MARS_OST} | ${MARS_OST} | ${MARS_OST}`,
  },
  {
    id: 'night-on-bald-mountain', title: 'Night on Bald Mountain (brass theme)', composer: 'Modest Mussorgsky, arr. Rimsky-Korsakov', year: 1886,
    level: 4, key: 'Dm', time: [4, 4], tempo: 120,
    tags: ['epic', 'classical', 'games'], style: 'epic',
    blurb: 'Witches gather on a mountain at midnight: the right hand shivers on two notes while the left hand stomps out the brass theme, the one an animated film made famous.',
    chords: 'Dm | F | E | E:2 Dm:2 | Am/E:2 F:2 | G#dim7 | G#dim7:2 F/A:2 | Am/C | Am/C | Dm/C | Dm/C | Gm/Bb',
    rh: `!f ${witch('F4', 'A4', 'G#4', '13', '12')} ${witch('F4', 'A4', 'G#4')} | ${witch('F4', 'A4', 'G#4')} ${witch('F4', 'A4', 'G#4')} | ${witch('F4', 'A4', 'G#4')} ${witch('F4', 'A4', 'G#4')} | `
      + `${witch('F4', 'A4', 'G#4')} ${witch('F4', 'A4', 'G#4')} | ${witch('A4', 'C5', 'B4', '13', '12')} ${witch('A4', 'C5', 'B4')} | ${witch('F4', 'B4', 'A#4', '14', '13')} ${witch('F4', 'B4', 'A#4')} | `
      + `${witch('F4', 'B4', 'A#4')} ${witch('F4', 'C5', 'B4', '15', '14')} | ${witch('E4', 'A4', 'G#4', '14', '13')} ${witch('E4', 'A4', 'G#4')} | ${witch('E4', 'A4', 'G#4')} ${witch('E4', 'A4', 'G#4')} | `
      + `${witch('F4', 'A4', 'G#4', '13', '12')} ${witch('F4', 'A4', 'G#4')} | ${witch('F4', 'A4', 'G#4')} ${witch('F4', 'A4', 'G#4')} | !ff G4+D5e:15 re rq rh`,
    lh: 'rw | !f F2+F3w:51 | E2+E3w:51~ | E2+E3h D2+D3h:51 | E2+E3h:51 F2+F3h | G#2+G#3w:51~ | G#2+G#3h A2+A3h:51 | C2+C3w:51~ | C2+C3w | C3+D3w:21~ | C3+D3w | !ff Bb2+Bb3e:51 re rq rh',
  },
  {
    id: 'great-gate-of-kiev', title: 'The Great Gate of Kiev', composer: 'Modest Mussorgsky', year: 1886,
    level: 3, key: 'Eb', time: [4, 4], tempo: 96,
    tags: ['epic', 'classical'], style: 'epic',
    blurb: 'The giant finale of a piano suite about an art exhibition: a hymn for the gates of an ancient city, all bells, brass and grandeur (in E♭ major).',
    chords: 'Eb/G | Bb/F | Eb:2 Cm:2 | Bb/D:2 Bb:2 | Eb:2 Bb/D:1 Cm:1 | Bb:2 Eb/G:2 | Eb:2 Bb/D:1 Cm:1 | Bb:2 Eb/G:2 | Eb/G | Bb/F | Eb:2 Cm:2 | Bb/D:2 Bb:2 | Ab/C:2 Bb7:1 Eb/G:1 | Ab:2 Fm:1 Ab:1 | Eb/G:2 Fm7:1 Eb:1 | Fm | Bb/D:2 Cm:2 | Cm:2 Bb7:1 Ab:1 | Eb/G:2 Fm7:1 Eb:1 | Ab6 | Gm | Eb',
    rh: '!f G4+Bb4+Eb5w:135 | Bb4+D5+F5w:135 | Bb4+Eb5+G5h:135 G4+C5+Eb5q:135 G4+G5q:15 | Bb4+D5+F5h:135 Bb4h:1 | '
      + 'Eb5+G5q:24 Bb5:5 F5:3 Eb5:2 | Bb4+D5h:13 G4+Bb4h:13 | Eb5+G5q:24 Bb5:5 F5:3 Eb5:2 | Bb4+D5h:13 G4+Bb4h:13 | '
      + 'G4+Bb4+Eb5w:135 | Bb4+D5+F5w:135 | Bb4+Eb5+G5h:135 G4+C5+Eb5q:135 G4+G5q:15 | Bb4+D5+F5h:135 Bb4h:1 | '
      + 'Eb5q:5 Eb5 D5:4 Bb4:3 | C5q:4 C5 Ab4:2 C5:4 | Bb4h:3 Ab4q:2 G4:1 | !mf F4+Ab4+C5w:135 | D4+F4+Bb4h:125 Eb4+G4+C5h:125 | '
      + 'Eb5q:3 Eb5 D5:2 C5:1 | Bb4h:3 Ab4q:2 G4:1 | !f C4+Eb4+F4w:134 | D4+G4+Bb4w:135 | !ff G4+Bb4+Eb5w:125',
    lh: '!f G2+Eb3w:51 | F2+D3w:51 | Eb2+Bb2h:51 C2+G2h:51 | D2+Bb2h:51 Bb2h:1 | Eb2+Bb2h:31 D2q:4 C2q:5 | Bb2h:2 G2h:4 | Eb2+Bb2h:31 D2q:4 C2q:5 | Bb2h:2 G2h:4 | '
      + 'G2+Eb3w:51 | F2+D3w:51 | Eb2+Bb2h:51 C2+G2h:51 | D2+Bb2h:51 Bb2h:1 | '
      + 'C3q:1 C3 Bb2:2 G2:4 | Ab2q:2 Ab2 F2:4 Ab2:2 | G2h:3 F2q:4 Eb2:5 | !mf F2+C3w:51 | D3+Bb3h:51 C3+G3h:51 | '
      + 'C3q:3 C3 Bb2:2 Ab2:1 | G2h:3 F2q:2 Eb2:1 | !f Ab2+Ab3w:51 | G2+G3w:51 | !ff Eb2+Eb3w:51',
  },
  {
    id: 'beethoven-7-allegretto', title: 'Symphony No. 7: Allegretto', composer: 'Ludwig van Beethoven', year: 1816,
    level: 3, key: 'Am', time: [2, 4], tempo: 72,
    tags: ['epic', 'classical', 'games'], style: 'epic',
    blurb: 'The slow, unstoppable march that film-makers reach for in their darkest scenes. First the theme on one repeated note, then the famous singing countermelody over it.',
    chords: 'Am | E/G# | E | Am | Am:1.5 D/A:0.5 | C/G | G | C | Am | E/G# | E | Am | Am:1.5 D/A:0.5 | C/G | G | C | C | B | Bm:1.5 E/B:0.5 | A:1 Am:1 | Am | E/G#:1 Am:1 | E | Am',
    rh: `!pp E4q:1 E4e E4 | E4q E4 | ${dactyl('E4')} | E4q E4 | E4q E4e F#4:2 | G4q:3 G4 | ${dactyl('G4')} | G4q rq | `
      + '!p C5h:3 | B4h:2 | B4s:2 C5:3 D5q:4 C5s:3 B4:2 | B4e:2 C5:3 C5q:3 | C5q.:2 C5s:2 D5:3 | D#5e:4 E5:5 E5 E5 | D5s:3 E5:4 F5q:5 E5s:4 D5:3 | D5e:3 E5:4 E5q:4 | '
      + '!mf E5h:4 | D#5h:3 | D5e:3 B4s:1 C#5:2 D5e:3 E5s:4 D5:3 | D5e:3 C#5:2 C5q:2 | C5h:2 | B4q:1 C5:2 | B4s:1 C5:2 D5q:4 C5s:3 B4:2 | A4q:1 rq',
    lh: `!pp A2q:1 A2e A2 | G#2q:2 G#2 | E2q:5 E2e E2 | A2q:1 A2 | ${dactyl('A2')} | G2q:2 G2 | ${dactyl('G2')} | C3q:1 rq | `
      + `!p E3q:3 E3e E3 | E3q E3 | ${dactyl('E3')} | E3q E3 | E3q E3e F#3:2 | G3q:1 G3 | ${dactyl('G3')} | G3q rq | `
      + '!mf G3q:3 G3e A3:2 | B3q:1 B3 | F#3q:4 F#3e G#3:3 | A3q:2 A3 | E3q:5 E3e E3 | E3q E3 | E3q F#3e:4 G#3:3 | A3q:2 rq',
  },
  {
    id: 'handel-sarabande', title: 'Sarabande in D Minor', composer: 'George Frideric Handel', year: 1733,
    level: 3, key: 'Dm', time: [3, 4], tempo: 60,
    tags: ['epic', 'classical', 'games'], style: 'classical',
    blurb: 'A slow, heavy baroque dance that films and trailers love for duels and doom: two solemn chords, then a lift on the last beat, bar after bar.',
    chords: 'Dm | A | F | C:2 D7:1 | Gm | Dm:2 F/C:1 | Bb:1 Gm/Bb:1 A:1 | A | Dm | A | F | C:2 D7:1 | Gm:1 C7:2 | F:2 Bb:1 | Gm:1 A:1 A7:1 | Dm',
    rh: '!mf D4+F4q:13 D4+F4 re E4+G4e:24 | C#4+E4q:13 C#4+E4 rq | F4+A4q:24 F4+A4 re G4+Bb4e:35 | E4+G4q:24 E4+G4 re F#4+A4e:35 | '
      + 'G4+Bb4q:24 G4+Bb4 re A4+C5e:35 | F4+A4q:13 F4+A4 re A4e:3 | A4+D5q:25 G4+D5:15 re E5e:5 | A4+C#5q:24 A4+C#5 rq | '
      + '!p D4+F4q:13 D4+F4 re E4+G4e:24 | C#4+E4q:13 C#4+E4 rq | F4+A4q:24 F4+A4 re G4+Bb4e:35 | E4+G4q:24 E4+G4 re F#4+A4e:35 | '
      + '!mf G4+Bb4q:24 G4+Bb4 re C5e:5 | F4+A4q.:13 A4e:1 D5:3 C#5:2 | D5e:3 E5:4 F5q:5 E5e:4 D5:3 | A4+D5q:15 A4+D5 rq',
    lh: '!mf D3q:1 D2:5 rq | A2q.:3 Bb2e:2 A2:3 G2:4 | F2+F3q:51 F2+F3 rq | C3q.:1 C3e Bb2:2 A2:3 | G2q:4 G3:1 G2:5 | D3q:2 D3 re C3e:3 | Bb2q:4 Bb3:1 rq | A3q.:1 G3e:2 F3:3 E3:4 | '
      + '!p D3q:1 D2:5 rq | A2q.:3 Bb2e:2 A2:3 G2:4 | F2+F3q:51 F2+F3 rq | C3q.:1 C3e Bb2:2 A2:3 | '
      + '!mf G2q:5 E3:2 C3:4 | F3q.:1 D3e:3 Bb2q:5 | G3q:2 A3:1 A2:5 | D3q:1 D2:5 rq',
  },
  {
    id: 'queen-mary-march', title: 'March for Queen Mary', composer: 'Henry Purcell', year: 1695,
    level: 3, key: 'Cm', time: [4, 4], tempo: 60,
    tags: ['epic', 'classical', 'march', 'games'], style: 'epic',
    blurb: 'A funeral march for a 17th-century queen, written for brass and muffled drums. Centuries later a famous dystopian film turned it into pure menace. Quiet the first time, loud the second.',
    chords: 'C:2 Fm:2 | C | Cm:2 Ab:1 Fm/Ab:1 | G | Gm:2 Am7b5/C:1 D:1 | Gm | Eb:2 Fm/Ab:1 Bb:1 | Eb | Cm:2 Dm7b5/F:1 G:1 | C | '
      + 'C:2 Fm:2 | C | Cm:2 Ab:1 Fm/Ab:1 | G | Gm:2 Am7b5/C:1 D:1 | Gm | Eb:2 Fm/Ab:1 Bb:1 | Eb | Cm:2 Dm7b5/F:1 G:1 | C',
    rh: '!p E4+G4h:13 F4+Ab4h:24 | E4+G4w:13 | Eb4+G4h:12 C5q.:4 D5e:5 | G4+B4w:24 | Bb4+D5h:35 A4+C5q:24 F#4+A4q:13 | G4+Bb4w:24 | G4+Bb4h:35 F4+Ab4q:24 D4+F4q:12 | Eb4+G4w:13 | G4+C5h:25 Ab4+C5q:35 G4+B4q:24 | E4+G4+C5w:125 | '
      + '!f E4+G4h:13 F4+Ab4h:24 | E4+G4w:13 | Eb4+G4h:12 C5q.:4 D5e:5 | G4+B4w:24 | Bb4+D5h:35 A4+C5q:24 F#4+A4q:13 | G4+Bb4w:24 | G4+Bb4h:35 F4+Ab4q:24 D4+F4q:12 | Eb4+G4w:13 | G4+C5h:25 Ab4+C5q:35 G4+B4q:24 | E4+G4+C5w:125',
    lh: '!p C3h:5 F3h:2 | C3h:5 C4e:1 C4 C4 G3:4 | C3h:5 Ab3h:1 | G3h:1 G3e G3 G3 D3:4 | G3h:1 C3q:5 D3q:4 | G3q.:1 D3e:4 G3:1 G3 F3:2 F3 | Eb3h:2 Ab2q:5 Bb2q:4 | Eb3q.:1 Bb2e:4 Eb3:1 Eb3 D3:2 D3 | C3h:5 F3q:2 G3q:1 | C3+C4w:51 | '
      + '!f C3h:5 F3h:2 | C3h:5 C4e:1 C4 C4 G3:4 | C3h:5 Ab3h:1 | G3h:1 G3e G3 G3 D3:4 | G3h:1 C3q:5 D3q:4 | G3q.:1 D3e:4 G3:1 G3 F3:2 F3 | Eb3h:2 Ab2q:5 Bb2q:4 | Eb3q.:1 Bb2e:4 Eb3:1 Eb3 D3:2 D3 | C3h:5 F3q:2 G3q:1 | C3+C4w:51',
  },
  {
    id: 'nimrod', title: 'Nimrod (Enigma Variations)', composer: 'Edward Elgar', year: 1899,
    level: 4, key: 'Eb', time: [3, 4], tempo: 50,
    tags: ['epic', 'classical'], style: 'classical',
    blurb: 'Elgar’s noble slow tune, played at memorials and in war films: it starts as a hush and grows, phrase by phrase, into an enormous climax.',
    chords: 'Eb:1 Ab/C:2 | Eb/G:1 Bb:1 Bb7/F:1 | Eb:1 Cm:1 F/A:1 | Bb:1 Eb/G:1 Bb7:1 | Eb:2 F/C:1 | Dm:1 G/B:1 Cm7:1 | F7/C:2 Cm7:1 | Gm7/F:1 F:1 Bb7:1 | '
      + 'Eb:1 Ab/C:2 | Eb/G:1 Bb:1 Bb7:1 | Eb:1 Cm:1 F/C:1 | Bb:1 Eb/Bb:1 Bb7:1 | Eb:2 Ab/C:1 | Bb7/D:1 Eb/Bb:1 Ab/C:1 | Bb7:1 Fm/Ab:2 | Eb/G:1 F#dim7:1 Bb7/F:1 | '
      + 'Eb:1 Ab/C:1 Fm7/C:1 | Eb/G:1 Bbsus4:1 Bb7:1 | Eb',
    rh: '!pp G4e:3 Eb4:1 Eb4+Ab4q:14 F4q:2 | Eb4+Bb4q:15 F4q:2 F4e:2 Ab4:4 | G4e:1 Bb4:2 G4+Eb5q:15 F4q:1 | F4+D5q:15 Eb4q:1 F4e:2 Ab4:4 | '
      + '!p G4e:1 Bb4:2 G5q:5 A4q:2 | A4+F5q:15 G4q:1 A4e:2 C5:4 | Eb5e:5 C5:3 A4q.:1 Bb4e:2 | Bb4e:4 G4:2 F4q.:1 Ab4e:3 | '
      + '!mp G4e:3 Eb4:1 Eb4+Ab4q:14 Eb4+F4q:12 | Eb4+Bb4q:15 Eb4+F4q:12 F4e:2 Ab4:4 | G4e:1 Bb4:2 G4+Eb5q:15 F4q:1 | F4+D5q:15 Eb4q:1 F4e:2 Ab4:4 | '
      + '!mf G4e:1 Bb4:2 G5q:5 Ab4q:2 | Ab4+F5q:15 G4q:1 Ab4e:2 C5:4 | !f D5e:1 F5:2 C6q:5 D5q:1 | Eb5+Bb5q:25 C5q:1 D5e:2 F5:4 | '
      + '!ff G5e:5 Eb5:2 Eb5+Ab5q:25 F5q:3 | Eb5+Bb5q:25 Bb4+F5q.:14 Ab5e:5 | G4+Bb4+Eb5+G5h.:1235',
    lh: '!pp Eb2+Bb2q:51 C2+Ab2h:51 | G2+Eb3q:51 Bb2+F3q:51 F2+Bb2q:51 | Eb2+Bb2q:51 C3+G3q:51 A3q:1 | Bb2+F3q:52 G3q:1 Bb2+Ab3q:51 | '
      + '!p Eb3+G3q:52 Eb3+Bb3q:51 C4q:1 | D3+A3q:51 B3q:1 C3+C4e:51 Bb3e:2 | A3e:1 G3:2 F3q:3 C3e:5 G3:1 | F3e:3 Bb3:1 A3q:2 Bb2+Ab3q:51 | '
      + '!mp Eb2+Bb2q:51 C2+Ab2h:51 | G2+Eb3q:51 Bb2+F3q:51 Bb2+Ab3q:51 | Eb2+Bb2q:51 C3+G3q:51 C3+A3q:51 | Bb2+F3q:51 Bb2+G3q:51 Bb2+Ab3q:51 | '
      + '!mf Eb3+G3q:52 Eb3+Bb3q:51 C4q:1 | D3+Ab3q:51 Bb3q:1 C3+Ab3q:51 | !f Bb2+F3q:51 Ab2+F3h:52 | G2+Eb3q:51 F#2+Eb3q:51 F2+Bb2q:51 | '
      + '!ff Eb2+Bb2q:51 C2+Ab2q:51 C3+Ab3q:51 | G2+Eb3q:51 Bb2+Bb3q:51 Bb2+F3q:51 | Eb2+Bb2+Eb3h.:521',
  },
  {
    id: 'paganini-caprice-24', title: 'Caprice No. 24 (theme)', composer: 'Niccolò Paganini', year: 1820,
    level: 4, key: 'Am', time: [2, 4], tempo: 80,
    tags: ['epic', 'classical'], style: 'epic',
    blurb: 'The devilish violin theme that a hundred composers have written variations on: a snappy rhythm and big leaps, then a chain of falling sequences. The left hand keeps a simple bass.',
    chords: 'Am | E | Am | E | Am | E | Am | E | A7 | Dm | G7 | C | Bdim | Am | F:1 E7:1 | Am',
    rh: '!mf A4e:1 rs A4s:1 A4 C5:3 B4:2 A4:1 | E5e:5 rs E4s:1 E4 G#4:3 F#4:2 E4:1 | A4e:1 rs A4s:1 A4 C5:3 B4:2 A4:1 | E5q:5 E4e:1 re | '
      + 'A4e:1 rs A4s:1 A4 C5:3 B4:2 A4:1 | E5e:5 rs E4s:1 E4 G#4:3 F#4:2 E4:1 | A4e:1 rs A4s:1 A4 C5:3 B4:2 A4:1 | E5q:5 E4e:1 re | '
      + '!f A5e:4 rs A5s:4 A5 Bb5:5 A5:4 G5:3 | F5e:2 rs D5s:1 D5 F5:3 E5:2 D5:1 | G5e:4 rs G5s:4 G5 A5:5 G5:4 F5:3 | E5e:2 rs C5s:1 C5 E5:3 D5:2 C5:1 | '
      + 'F5e:4 rs B4s:1 B4 D5:3 C5:2 B4:1 | E5e:4 rs A4s:1 A4 C5:3 B4:2 A4:1 | F4e:1 rs D#5s:5 E4:1 E5:5 D5:4 B4:2 | A4q:1 A3e:1 re',
    lh: '!mf A2q:5 E3q:1 | E2q:5 B2q:1 | A2q:5 E3q:1 | E2+E3q:51 rq | A2q:5 E3q:1 | E2q:5 B2q:1 | A2q:5 E3q:1 | E2+E3q:51 rq | '
      + '!f A2q:5 C#3q:3 | D3q:1 A2q:4 | G2q:5 B2q:3 | C3q:2 G2q:5 | B2q:3 D3q:1 | A2q:5 E3q:1 | F2q:4 E2q:5 | A2q:5 rq',
  },
  {
    id: 'mozart-dies-irae', title: 'Dies Irae (Requiem)', composer: 'Wolfgang Amadeus Mozart', year: 1800,
    level: 3, key: 'Dm', time: [4, 4], tempo: 112,
    tags: ['epic', 'classical', 'games'], style: 'epic',
    blurb: 'Mozart’s choir of doom: hammering “day of wrath” chords, then a hushed, trembling answer. The right hand sings the sopranos’ line, the left hand the basses.',
    chords: 'Dm | A7/D | A7/C# | Dm | A7/E:1 Dm/F:3 | A/C#:1 Dm:3 | Gm/Bb:1 Dm/A:1 A7/G:1 Dm:1 | Asus4:1 A:3 | A:2 C7:2 | F | F | D7/F# | Gsus4:2 G:2 | G | G#dim7 | Am:2 E7/B:2 | Am/C:2 Dm7:2 | E7:1 Am:1 E:2 | Am',
    rh: '!f A4+D5h:14 A4h:1 | A4+E5q:15 A4q:1 rh | A4+E5h:15 A4h:1 | A4+F5q:15 A4+D5q:14 rq A4+D5e:14 A4+D5 | G4+C#5q:14 A4+D5q:14 rq A4+D5e:14 A4+D5 | '
      + 'A4+E5q:15 A4+F5q:15 D5q.:4 D5e:4 | G5q:5 F5:4 E5:3 D5:2 | A4+D5q:14 A4+C#5q:13 rh | rw | '
      + '!p A4+F5h.:15 C5q:3 | A4q:2 F4:1 A4:2 C5:4 | C5+Eb5h:35 A4+D5h:24 | G5h.:5 D5q:3 | B4q:2 G4:1 B4:2 D5:4 | '
      + 'D5+F5h:24 B4+E5h:14 | A4+E5h:15 G#4+E5h:15 | A4+E5h:15 D5h:4 | G#4+D5q:15 A4+C5q:24 B4h:3 | E4+A4h.:14 rq',
    lh: '!f D2+D3h:51 D2+D3h | D3q:1 D3 rh | C#2+C#3h:51 C#2+C#3h | D3q:1 D3 rq D2e:5 D2 | E2q:4 F2q:3 rq F2e:3 F2 | '
      + 'C#2q:5 D2q:4 rq D3e:2 C3e:1 | Bb2q:2 A2:3 G2:4 D2:5 | A2q:1 A2 rh | A2e:5 A2 Bb2:4 B2:3 C3:2 A2:4 Bb2:3 G2:5 | '
      + `!p ${rep('F2e', 8)} | ${rep('F2e', 8)} | F#2h F#2h | ${rep('G2e', 8)} | ${rep('G2e', 8)} | `
      + 'G#2h G#2h | A2h B2h | C3h D3h | E3q:1 A2q:4 E2h:5 | A2+E3h.:51 rq',
  },
  {
    id: 'verdi-dies-irae', title: 'Dies Irae (Requiem, opening)', composer: 'Giuseppe Verdi', year: 1874,
    level: 4, key: 'Gm', time: [4, 4], tempo: 84,
    tags: ['epic', 'classical', 'games'], style: 'epic',
    blurb: 'Four hammer-blow chords, a rush up from the strings and trombones, then the choir’s falling chromatic cry: the opening of Verdi’s “day of wrath”, a trailer favourite, played twice.',
    chords: 'Gm | Gm | Gm:2 Eb:2 | Edim:2 F:1 D7/F#:1 | Gm | Gm | Gm | Gm | Gm:2 Eb:2 | Edim:2 F:1 D7/F#:1 | Gm | Gm | Gm',
    rh: '!ff G4+Bb4+D5e:135 re rq G4+Bb4+D5e re rq | G4+Bb4+D5e re rq G4+Bb4+D5e re rq | G4+Bb4+D5e re rq Eb4+Eb5q.:15 rs Eb4+Eb5s | E4+E5q.:15 rs E4+E5s F4+F5q:15 F#4+F#5q:15 | '
      + 'G4+G5h:15 F#5q:4 F5q:3 | E5q:2 Eb5:1 D5:3 C5:2 | '
      + 'G4+Bb4+D5e:135 re rq G4+Bb4+D5e re rq | G4+Bb4+D5e re rq G4+Bb4+D5e re rq | G4+Bb4+D5e re rq Eb4+Eb5q.:15 rs Eb4+Eb5s | E4+E5q.:15 rs E4+E5s F4+F5q:15 F#4+F#5q:15 | '
      + 'G4+G5h:15 F#5q:4 F5q:3 | E5q:2 Eb5:1 D5:3 C5:2 | D5+G5e:15 re rq rh',
    lh: '!ff G2+D3e:51 re rq G2+D3e re rq | G2+D3e re rq G2+D3e re rq | G2+D3e:51 G2e:5 Bb2:4 D3:2 Eb3:1 G2:5 Bb2:3 Eb3:1 | E3e:1 G2:5 Bb2:3 E3:1 F3:1 G2:5 F#3:1 G2:5 | '
      + 'G2+G3w:51 | G2+G3w | '
      + 'G2+D3e:51 re rq G2+D3e re rq | G2+D3e re rq G2+D3e re rq | G2+D3e:51 G2e:5 Bb2:4 D3:2 Eb3:1 G2:5 Bb2:3 Eb3:1 | E3e:1 G2:5 Bb2:3 E3:1 F3:1 G2:5 F#3:1 G2:5 | '
      + 'G2+G3w:51 | G2+G3w | G2+D3e:51 re rq rh',
  },
  {
    id: 'zarathustra', title: 'Also sprach Zarathustra (sunrise)', composer: 'Richard Strauss', year: 1896,
    level: 3, key: 'C', time: [4, 4], tempo: 60,
    tags: ['epic', 'classical', 'games'], style: 'classical',
    blurb: 'The sunrise fanfare made famous by a 1968 space film: a low rumble, three rising trumpet notes, then a chord that flips from major to minor, and the second time from minor to major.',
    chords: 'C5 | C5 | C5 | C5 | Cm | Cm | C5 | C5 | C',
    rh: 'rw | rw | !p C4h:1 G4h:1 | C5h:3~ C5q.~ C5s G4+E5s:15 | !f G4+Eb5w:14 | G4+Eb5s:14 rs re rq rh | !mf C4h:1 G4h:1 | C5h:3~ C5q.~ C5s G4+Eb5s:14 | !ff G4+E5w:15',
    lh: '!pp C2w:5~ | C2w~ | C2w~ | C2w | !f C2+G2+C3w:521 | C2w~ | C2w~ | C2w | !ff C2+G2+C3w:521',
  },
  {
    id: 'hungarian-dance-5', title: 'Hungarian Dance No. 5', composer: 'Johannes Brahms', year: 1869,
    level: 4, key: 'Gm', time: [2, 4], tempo: 100,
    tags: ['classical', 'games'], style: 'march',
    blurb: 'Brahms’s fiery dance in G minor, a favourite of cartoons and comedy chases: a long-short swagger, then a whirl of sixteenths.',
    chords: 'Gm | Gm | Cm/G | Gm | Cm/G | Gm | D7/F# | Gm | Gm | Gm | Cm/G | Gm | Eb/G:1 Dm/F:1 | Cm/Eb:1 Bb/D:1 | D7 | Gm',
    rh: '!f D4q.:1 G4e:4 | Bb4q.:5 G4e:3 | F#4q.:2 G4s:3 A4:4 | G4h:3 | Eb4q.:2 F4s:3 G4:4 | D4h:1 | C4s:3 Bb3:2 Bb3:2 A3:1 A3e.:1 D4s:4 | G3h:1 | '
      + 'D4q.:1 G4s:2 Bb4:3 | D5q.:5 Bb4e:3 | A4q.:2 Bb4s:3 C5:4 | Bb4h:3 | Eb5s:2 F5:3 G5:4 Eb5:2 D5:1 Eb5:2 F5:3 D5:1 | '
      + 'C5s:2 D5:3 Eb5:4 C5:2 Bb4:1 C5:2 D5:3 Bb4:1 | C5s:3 Bb4:2 Bb4:2 A4:1 A4e.:1 D5s:4 | G4q:1 G4+Bb4+D5e:135 re',
    lh: '!f G2e:5 Bb2+D3e:21 D2e:5 Bb2+D3e:21 | G2e Bb2+D3e D2e Bb2+D3e | G2e:5 C3+Eb3e:21 C2e:5 C3+Eb3e:21 | G2e Bb2+D3e D2e Bb2+D3e | '
      + 'G2e C3+Eb3e C2e C3+Eb3e | G2e Bb2+D3e D2e Bb2+D3e | F#2e:5 D3+F#3e:21 D2e:5 C3+F#3e:21 | G2e Bb2+D3e D2e Bb2+D3e | '
      + 'G2e Bb2+D3e D2e Bb2+D3e | G2e Bb2+D3e D2e Bb2+D3e | G2e C3+Eb3e C2e C3+Eb3e | G2e Bb2+D3e D2e Bb2+D3e | '
      + 'G3e:2 Bb3:1 F3:3 A3+D4e:21 | Eb3e:4 G3+C4e:21 D3e:5 Bb3+D4e:21 | D2e:5 A3+C4e:21 re F#3+C4e:21 | G2e:5 Bb2+D3e:21 G2q:5',
  },
  {
    id: 'symphony-40', title: 'Symphony No. 40 (opening)', composer: 'Wolfgang Amadeus Mozart', year: 1788,
    level: 3, key: 'Gm', time: [4, 4], tempo: 120,
    tags: ['classical'], style: 'classical',
    blurb: 'Mozart’s restless G minor symphony: a sighing three-note figure over a nervous eighth-note pulse, climbing to the big pause on D before the theme returns.',
    chords: 'Gm | Gm | Gm | Gm | Am7b5/G | Am7b5/G | D7/F# | D7 | Gm | Cdim7 | Gm/Bb | Cdim7 | Gm/Bb | C7/E | C#dim7/Eb:2 D/F#:1 Gm:1 | D:2 C#dim7/G:2 | D',
    rh: '!p rh. Eb5e:3 D5e:2 | D5q:2 Eb5e:3 D5:2 D5q:2 Eb5e:3 D5:2 | D5q:1 Bb5q:5 rq Bb5e:5 A5:4 | G5q:3 G5e:3 F5:2 Eb5q:1 Eb5e:1 D5:3 | C5q:2 C5 rq D5e:3 C5:2 | '
      + 'C5q:2 D5e:3 C5:2 C5q:2 D5e:3 C5:2 | C5q:1 A5q:5 rq A5e:5 G5:4 | F#5q:3 F#5e:3 Eb5:2 D5q:1 D5e:1 C5:3 | Bb4q:2 Bb4 rq Bb5e:5 A5:4 | '
      + 'A5q:4 C6:5 F#5:2 A5:4 | G5q:3 D5:1 rq Bb5e:5 A5:4 | A5q:4 C6:5 F#5:2 A5:4 | !mf G5q:2 Bb5:4 A5e:3 G5:2 F5:1 Eb5:2 | '
      + 'D5q:1 F#5:2 G5:3 A5:4 | Bb5q:4 C6e:5 Bb5:4 A5q:3 G5:2 | !f D5+F#5q:13 rq E5+G5+Bb5h:124 | D5+F#5+A5w:125',
    lh: `!p G3+Bb3e:52 D4e:1 Bb3:2 D4:1 Bb3:2 D4:1 Bb3:2 D4:1 | ${pulse('G3', 'Bb3', 'D4')} | ${pulse('G3', 'Bb3', 'D4')} | ${pulse('G3', 'Bb3', 'D4')} | `
      + 'G3+A3e:43 Eb4e:1 C4:2 Eb4:1 A3:3 Eb4:1 C4:2 Eb4:1 | G3+A3e Eb4e C4 Eb4 A3 Eb4 C4 Eb4 | '
      + 'F#3+A3e:42 D4e:1 C4:2 D4:1 A3:3 D4:1 C4:2 D4:1 | D3+A3e:51 D4e:1 C4:2 D4:1 F#3:4 D4:1 A3:3 D4:1 | G3e:4 D4:1 Bb3:2 D4:1 G3:4 D4:1 Bb3:2 D4:1 | '
      + 'C3+Eb3e:52 A3e:1 F#3:2 A3:1 Eb3:3 A3:1 F#3:2 A3:1 | Bb2+D3e:52 Bb3e:1 G3:2 Bb3:1 D3:4 Bb3:1 G3:2 Bb3:1 | C3+Eb3e:52 A3e:1 F#3:2 A3:1 Eb3:3 A3:1 F#3:2 A3:1 | '
      + '!mf Bb2+D3+G3w:521 | E3+Bb3+D4w:531 | Eb3+G3+C#4h:521 F#3q:3 G3q:2 | !f D3+A3+D4q:521 rq G3+Bb3h:21 | D3+A3+D4w:521',
  },
  {
    id: 'rachmaninoff-prelude', title: 'Prelude in C-sharp Minor (opening)', composer: 'Sergei Rachmaninoff', year: 1893,
    level: 4, key: 'Cm', time: [4, 4], tempo: 60, pickup: 2,
    tags: ['epic', 'classical'], style: 'classical',
    blurb: 'Three huge bell strokes, then the bells keep tolling softly under shifting chords: Rachmaninoff’s most famous piano piece, moved down a half step to C minor.',
    chords: 'C5 | Cm:1 Eb/G:0.5 D/F#:0.5 Db7/Ab:1 G7:1 | Cm:1 Eb/G:0.5 D/F#:0.5 Db7/Ab:1 G7:1 | Cm:1 Cm7:0.5 Fm:0.5 Fm7b5/B:1 Bb7:1 | Eb:1 Ebmaj7:0.5 Ab:0.5 Am7b5/Eb:1 D7:1 | '
      + 'Gm:1 Ab:0.5 Fm:0.5 Gm:0.5 Eb:0.5 Fm:0.5 Ddim:0.5 | Eb:1 Fm:0.5 Ddim:0.5 Eb:0.5 Cm:0.5 Ddim:0.5 Bdim:0.5 | Cm:1 Eb/G:0.5 D/F#:0.5 Db7/Ab:1 G7:1 | Cm:1 Cm7:0.5 Fm:0.5 Ab:1 G7:1 | '
      + 'Cm:1 Db:0.5 Bb:0.5 Cm:0.5 Ab:0.5 Bb:0.5 G7:0.5 | Fm/Ab:1 F:0.5 Bb:0.5 Ab/F#:1 G:1 | Cm',
    rh: '!fff Ab4q:3 G4:2 | C4w:1 | '
      + '!pp re C4+G4+C5e:135 Eb4+Bb4+Eb5e:135 D4+A4+D5e:135 re Db4+Ab4+Db5e:135 re B3+F4+B4e:135 | '
      + 're C4+G4+C5e:135 Eb4+Bb4+Eb5e:135 D4+A4+D5e:135 re Db4+Ab4+Db5e:135 re B3+F4+B4e:135 | '
      + 're C4+G4+C5e:135 G4+C5+G5e:135 F4+C5+F5e:135 re Eb4+Ab4+Eb5e:125 re D4+Ab4+D5e:125 | '
      + 're Eb4+Bb4+Eb5e:135 Bb4+Eb5+Bb5e:125 Ab4+Eb5+Ab5e:135 re G4+C5+G5e:125 re F#4+C5+F#5e:125 | '
      + '!p re G4+D5+G5e:135 Ab4+Eb5+Ab5e:135 F4+C5+F5e:135 G4+D5+G5e:135 Eb4+Bb4+Eb5e:135 F4+C5+F5e:135 D4+Ab4+D5e:125 | '
      + 'Eb4+Bb4+Eb5e:135 Eb4+Bb4+Eb5e F4+C5+F5e:135 D4+Ab4+D5e:125 Eb4+Bb4+Eb5e:135 C4+G4+C5e:135 D4+Ab4+D5e:125 B3+F4+B4e:135 | '
      + '!pp C4+G4+C5e:135 C4+G4+C5e Eb4+Bb4+Eb5e:135 D4+A4+D5e:135 re Db4+Ab4+Db5e:135 re B3+F4+B4e:135 | '
      + 're C4+G4+C5e:135 G4+C5+G5e:135 F4+C5+F5e:135 re Eb4+Ab4+Eb5e:125 re B3+F4+B4e:135 | '
      + 're C4+G4+C5e:135 Db4+Ab4+Db5e:135 Bb3+F4+Bb4e:135 C4+G4+C5e:135 Ab3+Eb4+Ab4e:135 Bb3+F4+Bb4e:135 G3+Db4+G4e:135 | '
      + 'Ab3+F4+Ab4e:135 Ab3+F4+Ab4e C4+F4+C5e:125 Bb3+F4+Bb4e:135 re Ab3+Eb4+Ab4e:135 re G3+D4+G4e:135 | !ppp C4+Eb4+G4w:135',
    lh: '!fff Ab2+Ab3q:51 G2+G3q:51 | C2+C3w:51~ | !pp C2+C3h Ab2+Ab3q:51 G2+G3q:51 | C2+C3h:51 Ab2+Ab3q:51 G2+G3q:51 | C2+C3h:51 B2+B3q:51 Bb2+Bb3q:51 | '
      + 'Eb2+Eb3h:51 Eb2+Eb3q D2+D3q:51 | !p G2+G3w:51~ | G2+G3e re rq rh | !pp rh Ab2+Ab3q:51 G2+G3q:51 | C2+C3h:51 Ab2+Ab3q:51 G2+G3q:51 | '
      + 'C2+C3w:51~ | C2+C3e re rq F#2+F#3q:51 G2q:5 | !ppp C2+C3w:51',
  },
  {
    id: 'william-tell-finale', title: 'William Tell Overture (finale)', composer: 'Gioachino Rossini', year: 1829,
    level: 4, key: 'E', time: [2, 4], tempo: 108, pickup: 0.5,
    tags: ['classical', 'games', 'march'], style: 'march',
    blurb: 'The cavalry charge that ends an opera overture, famous as a TV cowboy theme: a galloping da-da-dum rhythm, then the whole tune again.',
    chords: 'E | E | E | B7 | E | E | B7 | E | E | E | E | B7 | E | E | B7 | E',
    rh: '!f B4s:1 B4 | B4e:1 B4s B4 B4e B4s B4 | E5e:2 F#5:3 G#5:4 B4s:1 B4 | B4e:1 B4s B4 E5e:2 G#5s:4 G#5 | F#5e:3 D#5:2 B4:1 B4s B4 | '
      + 'B4e:1 B4s B4 B4e B4s B4 | E5e:2 F#5:3 G#5:4 E5s:2 G#5:4 | B5q:5 rs A5s:5 G#5:4 F#5:3 | E5e:2 G#5:4 E5:2 B4s:1 B4 | '
      + 'B4e:1 B4s B4 B4e B4s B4 | E5e:2 F#5:3 G#5:4 B4s:1 B4 | B4e:1 B4s B4 E5e:2 G#5s:4 G#5 | F#5e:3 D#5:2 B4:1 B4s B4 | '
      + 'B4e:1 B4s B4 B4e B4s B4 | E5e:2 F#5:3 G#5:4 E5s:2 G#5:4 | B5q:5 rs A5s:5 G#5:4 F#5:3 | E5e:2 G#5:4 E5:2 re',
    lh: 're | !f E2q:5 E3q:1 | E2q:5 E3q:1 | E2q:5 E3q:1 | B2q:3 F#3q:1 | E2q:5 E3q:1 | E2q:5 E3q:1 | B2q:3 F#3q:1 | E2q:5 E3q:1 | '
      + 'E2q:5 E3q:1 | E2q:5 E3q:1 | E2q:5 E3q:1 | B2q:3 F#3q:1 | E2q:5 E3q:1 | E2q:5 E3q:1 | B2q:3 F#3q:1 | E2+E3q:51 rq',
  },
];
