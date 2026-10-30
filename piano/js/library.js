// Original starter songs. Newer song collections live in songs-*.js
// and replace entries here with the same id. Voice syntax: see parseVoice() in theory.js.

export const SONGS = [
  {
    id: 'hot-cross-buns', title: 'Hot Cross Buns', composer: 'Traditional', level: 1, key: 'C', time: [4, 4], tempo: 96,
    rh: 'E4q:3 D4:2 C4h:1 | E4q:3 D4:2 C4h:1 | C4e:1 C4 C4 C4 D4:2 D4 D4 D4 | E4q:3 D4:2 C4h:1',
    lh: 'C3w:5 | C3w | C3h G3h:1 | C3w:5',
  },
  {
    id: 'mary', title: 'Mary Had a Little Lamb', composer: 'Traditional', level: 1, key: 'C', time: [4, 4], tempo: 100,
    rh: 'E4q:3 D4:2 C4:1 D4:2 | E4:3 E4 E4h | D4q:2 D4 D4h | E4q:3 G4:5 G4h | E4q:3 D4:2 C4:1 D4:2 | E4:3 E4 E4 E4 | D4:2 D4 E4:3 D4:2 | C4w:1',
    lh: 'C3w:5 | C3w | G3w:1 | C3w:5 | C3w | C3w | G3w:1 | C3w:5',
  },
  {
    id: 'au-clair', title: 'Au Clair de la Lune', composer: 'Traditional (France)', level: 1, key: 'C', time: [4, 4], tempo: 92,
    rh: 'C4q:1 C4 C4 D4:2 | E4h:3 D4h:2 | C4q:1 E4:3 D4:2 D4 | C4w:1 | C4q C4 C4 D4 | E4h D4h | C4q E4 D4 D4 | C4w | D4q:5 D4 D4 D4 | A3h:2 A3h | D4q:5 C4:4 B3:3 A3:2 | G3w:1 | C4q:1 C4 C4 D4:2 | E4h:3 D4h:2 | C4q:1 E4:3 D4:2 D4 | C4w:1',
    lh: 'C3w:5 | C3h G3h:1 | C3h G3h | C3w:5 | C3w | C3h G3h | C3h G3h | C3w | G3w:1 | F3w:2 | G3w:1 | B2w:5 | C3w:5 | C3h G3h:1 | C3h G3h | C3w:5',
  },
  {
    id: 'ode-to-joy', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', level: 2, key: 'C', time: [4, 4], tempo: 100,
    rh: 'E4q:3 E4 F4:4 G4:5 | G4 F4:4 E4:3 D4:2 | C4:1 C4 D4:2 E4:3 | E4q.:3 D4e:2 D4h | E4q:3 E4 F4:4 G4:5 | G4 F4:4 E4:3 D4:2 | C4:1 C4 D4:2 E4:3 | D4q.:2 C4e:1 C4h | D4q:2 D4 E4:3 C4:1 | D4 E4e:3 F4:4 E4q:3 C4:1 | D4:2 E4e:3 F4:4 E4q:3 D4:2 | C4:1 D4:2 G3h | E4q:3 E4 F4:4 G4:5 | G4 F4:4 E4:3 D4:2 | C4:1 C4 D4:2 E4:3 | D4q.:2 C4e:1 C4h',
    lh: 'C3w:5 | G3w:1 | C3w:5 | G3h:1 G3h | C3w:5 | G3w:1 | C3w:5 | G3h:1 C3h:5 | G3h:1 C3h:5 | G3h C3h | G3w:1 | C3h:5 G2h | C3w:5 | G3w:1 | C3w:5 | G3h:1 C3h:5',
  },
  {
    id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional (France)', level: 2, key: 'C', time: [4, 4], tempo: 100,
    rh: 'C4q:1 C4 G4:4 G4 | A4:5 A4 G4h:4 | F4q:3 F4 E4:2 E4 | D4:1 D4 C4h | G4q G4 F4 F4 | E4 E4 D4h | G4q G4 F4 F4 | E4 E4 D4h | C4q C4 G4 G4 | A4 A4 G4h | F4q F4 E4 E4 | D4 D4 C4h',
    lh: 'C3w:5 | F3h:2 C3h:5 | F3h:2 C3h:5 | G3h:1 C3h:5 | C3h F3h:2 | C3h:5 G3h:1 | C3h:5 F3h:2 | C3h:5 G3h:1 | C3w:5 | F3h:2 C3h:5 | F3h:2 C3h:5 | G3h:1 C3h:5',
  },
  {
    id: 'frere-jacques', title: 'Frère Jacques', composer: 'Traditional (France)', level: 2, key: 'C', time: [4, 4], tempo: 108,
    rh: 'C4q:1 D4:2 E4:3 C4:1 | C4 D4 E4 C4 | E4:3 F4:4 G4h:5 | E4q:3 F4:4 G4h:5 | G4e:4 A4:5 G4:4 F4:3 E4q:2 C4:1 | G4e A4 G4 F4 E4q C4 | C4q:2 G3:1 C4h:2 | C4q G3 C4h',
    lh: 'C3h:5 G3h:1 | C3h G3h | C3h G3h | C3h G3h | C3h G3h | C3h G3h | C3h G3h | C3w:5',
  },
  {
    id: 'london-bridge', title: 'London Bridge', composer: 'Traditional (England)', level: 2, key: 'C', time: [4, 4], tempo: 104,
    rh: 'G4q.:4 A4e:5 G4q:4 F4:3 | E4:2 F4:3 G4h:4 | D4q:1 E4:2 F4h:3 | E4q:2 F4:3 G4h:4 | G4q.:4 A4e:5 G4q:4 F4:3 | E4:2 F4:3 G4h:4 | D4h:1 G4h:4 | E4q:2 C4h.:1',
    lh: 'C3w:5 | C3w | G3w:1 | C3w:5 | C3w | C3w | G3w:1 | C3w:5',
  },
  {
    id: 'row-your-boat', title: 'Row, Row, Row Your Boat', composer: 'Traditional', level: 2, key: 'C', time: [6, 8], tempo: 120,
    rh: 'C4q.:1 C4q. | C4q D4e:2 E4q.:3 | E4q:3 D4e:2 E4q:3 F4e:4 | G4h.:5 | C5e C5 C5 G4 G4 G4 | E4 E4 E4 C4 C4 C4 | G4q:5 F4e:4 E4q:3 D4e:2 | C4h.:1',
    lh: 'C3q.:5 G3q.:1 | C3q. G3q. | C3q. G3q. | C3q. G3q. | C3q. G3q. | C3q. G3q. | G3h.:1 | C3h.:5',
  },
  {
    id: 'yankee-doodle', title: 'Yankee Doodle', composer: 'Traditional (America)', level: 2, key: 'C', time: [4, 4], tempo: 112,
    rh: 'C4q:1 C4 D4:2 E4:3 | C4:1 E4:3 D4:2 G3 | C4:1 C4 D4:2 E4:3 | C4h:1 B3h | C4q:1 C4 D4:2 E4:3 | F4:4 E4:3 D4:2 C4:1 | B3 G3 A3 B3 | C4h C4h',
    lh: 'C3w:5 | C3h B2h:5 | C3w:5 | C3h G3h:1 | C3w:5 | F3h:2 C3h:5 | B2w:5 | C3w:5',
  },
  {
    id: 'jingle-bells', title: 'Jingle Bells', composer: 'James Lord Pierpont', level: 3, key: 'C', time: [4, 4], tempo: 120,
    rh: 'E4q:3 E4 E4h | E4q E4 E4h | E4q:3 G4:5 C4q.:1 D4e:2 | E4w:3 | F4q:4 F4 F4q. F4e | F4q E4:3 E4 E4e E4e | E4q:3 D4:2 D4 E4:3 | D4h:2 G4h:5 | E4q:3 E4 E4h | E4q E4 E4h | E4q:3 G4:5 C4q.:1 D4e:2 | E4w:3 | F4q:4 F4 F4q. F4e | F4q E4:3 E4 E4e E4e | G4q:5 G4 F4:4 D4:2 | C4w:1',
    lh: 'C3w:5 | C3w | C3w | C3w | F3w:2 | C3w:5 | G3w:1 | G3w | C3w:5 | C3w | C3w | C3w | F3w:2 | C3w:5 | G3w:1 | C3w:5',
  },
  {
    id: 'minuet-in-g', title: 'Minuet in G', composer: 'Christian Petzold', level: 3, key: 'G', time: [3, 4], tempo: 112,
    rh: 'D5q:5 G4e:1 A4:2 B4:3 C5:4 | D5q:5 G4:1 G4 | E5q:5 C5e:1 D5:2 E5:3 F#5:4 | G5q:5 G4:1 G4 | C5q:4 D5e:5 C5:4 B4:3 A4:2 | B4q:3 C5e:4 B4:3 A4:2 G4:1 | F#4q:2 G4e:1 A4:2 B4:3 G4:1 | A4h.:2 | D5q:5 G4e:1 A4:2 B4:3 C5:4 | D5q:5 G4:1 G4 | E5q:5 C5e:1 D5:2 E5:3 F#5:4 | G5q:5 G4:1 G4 | C5q:4 D5e:5 C5:4 B4:3 A4:2 | B4q:3 C5e:4 B4:3 A4:2 G4:1 | A4q:2 B4e:3 A4:2 G4:1 F#4:2 | G4h.:1',
    lh: 'G3h.:1 | B3h. | C4h. | B3h. | A3h. | G3h. | D3h. | D3h. | G3h. | B3h. | C4h. | B3h. | A3h. | G3h. | D3h. | G2h.',
  },
  {
    id: 'fur-elise', title: 'Für Elise (opening)', composer: 'Ludwig van Beethoven', level: 4, key: 'Am', time: [3, 8], tempo: 72, pickup: 0.5,
    rh: 'E5s:5 D#5:4 | E5:5 D#5:4 E5:5 B4:2 D5:4 C5:3 | A4e:1 rs C4s:1 E4:2 A4:3 | B4e:4 rs E4s:1 G#4:3 B4:4 | C5e:5 rs E4s:1 E5:5 D#5:4 | E5:5 D#5:4 E5:5 B4:2 D5:4 C5:3 | A4e:1 rs C4s:1 E4:2 A4:3 | B4e:4 rs E4s:1 C5:4 B4:3 | A4q.:2',
    lh: 're | rq. | A2s:5 E3:2 A3:1 re. | E2s:5 E3:1 G#3:2 re. | A2s:5 E3:2 A3:1 re. | rq. | A2s:5 E3:2 A3:1 re. | E2s:5 E3:1 G#3:2 re. | A2s:5 E3:2 A3:1 re.',
  },
];
