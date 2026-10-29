// Course and song library. All melodies are public domain; arrangements are original.
// Voice syntax: see parseVoice() in theory.js.  ":n" = fingering.

export const UNITS = [
  { id: 'u1', title: 'The keyboard' },
  { id: 'u2', title: 'Reading music' },
  { id: 'u3', title: 'Rhythm' },
  { id: 'u4', title: 'The left hand' },
  { id: 'u5', title: 'Black keys and scales' },
  { id: 'u6', title: 'Chords and both hands' },
];

const C_POS = [60, 62, 64, 65, 67];
const LH_POS = [48, 50, 52, 53, 55];

export const LESSONS = [
  {
    id: 'l1', unit: 'u1', title: 'Find your way around',
    summary: 'Black-key groups, and how they lead you to every C on the keyboard.',
    steps: [
      { type: 'say', text: 'The black keys come in groups of two and three. That pattern repeats from one end of the keyboard to the other, and it’s how pianists find any note without labels.' },
      { type: 'pcs', pcs: [1, 3], together: true, count: 2, text: 'Play a group of two black keys together. Then find another pair somewhere else.' },
      { type: 'pcs', pcs: [6, 8, 10], together: true, count: 2, text: 'Now a group of three black keys, twice.' },
      { type: 'say', text: 'C is the white key just left of every pair of black keys. The C closest to the middle of your keyboard is called middle C, and it’s home base for this course.' },
      { type: 'find', notes: [60], show: 'both', text: 'Play middle C.' },
      { type: 'pcs', pcs: [0], count: 3, distinct: true, text: 'Play three other Cs, higher or lower.' },
    ],
  },
  {
    id: 'l2', unit: 'u1', title: 'C, D and E',
    summary: 'Finger numbers and your first three notes.',
    steps: [
      { type: 'say', text: 'Your fingers have numbers: the thumb is 1 and the little finger is 5. Rest your right thumb on middle C, with fingers 2 and 3 over the next two white keys.' },
      { type: 'find', notes: [62], show: 'both', finger: 2, text: 'D sits between the two black keys. Play it with finger 2.' },
      { type: 'find', notes: [64], show: 'both', finger: 3, text: 'E is just right of the two black keys. Play it with finger 3.' },
      { type: 'seq', rh: 'C4q:1 D4:2 E4:3 D4:2 | C4w:1', text: 'Walk up and back. The music waits for you, so take your time.' },
      { type: 'seq', rh: 'E4q:3 D4:2 C4h:1 | E4q:3 D4:2 C4h:1', text: 'Down the hill: E, D, C.' },
    ],
  },
  {
    id: 'l3', unit: 'u1', title: 'Five-finger position',
    summary: 'One finger per note from C to G.',
    steps: [
      { type: 'say', text: 'Add F and G and your right hand covers five notes, one finger each: C D E F G. This hand shape is called C position.' },
      { type: 'find', pool: [65, 67], count: 4, show: 'both', text: 'F is finger 4, G is finger 5. Play each one as it appears.' },
      { type: 'seq', rh: 'C4q:1 D4:2 E4:3 F4:4 | G4w:5 | G4q:5 F4:4 E4:3 D4:2 | C4w:1', text: 'Up and back down. Keep each finger over its own key.' },
      { type: 'find', pool: C_POS, count: 6, show: 'name', text: 'Play each note when its name appears.' },
    ],
  },
  {
    id: 'l4', unit: 'u2', title: 'Notes on the staff',
    summary: 'Lines, spaces and the treble clef.',
    staves: 'treble',
    steps: [
      { type: 'say', text: 'Music is written on five lines called a staff. The curling sign at the start is the treble clef, used for the right hand. Each line and each space is one white key, and middle C sits on a short line of its own below the staff.' },
      { type: 'find', notes: C_POS, show: 'both', text: 'Watch where each note sits as you play it.' },
      { type: 'find', pool: C_POS, count: 8, show: 'staff', text: 'Now read the staff alone. After a wrong note, the right key lights up.' },
    ],
  },
  {
    id: 'l5', unit: 'u2', title: 'Up to the next C',
    summary: 'A, B and C on the staff.',
    staves: 'treble',
    steps: [
      { type: 'say', text: 'Above G come A, B and then C again, one octave above middle C. Move your hand up so your thumb rests on G.' },
      { type: 'find', notes: [69, 71, 72], show: 'both', text: 'Play A, B and C.' },
      { type: 'seq', rh: 'G4q:1 A4:2 B4:3 C5:4 | C5 B4:3 A4:2 G4:1 | G4w:1', text: 'From G up to C, and back.' },
      { type: 'find', pool: [60, 62, 64, 65, 67, 69, 71, 72], count: 8, show: 'staff', text: 'Read eight notes anywhere from middle C to the C above.' },
    ],
  },
  {
    id: 'l6', unit: 'u2', title: 'Your first tune',
    summary: 'A famous Beethoven melody, in two halves.',
    staves: 'treble',
    steps: [
      { type: 'say', text: 'You know enough notes for a real melody. This is the opening of a theme Beethoven wrote for his Ninth Symphony.' },
      { type: 'seq', rh: 'E4q:3 E4 F4:4 G4:5 | G4 F4:4 E4:3 D4:2 | C4:1 C4 D4:2 E4:3 | E4q.:3 D4e:2 D4h', text: 'The first half asks a question.' },
      { type: 'seq', rh: 'E4q:3 E4 F4:4 G4:5 | G4 F4:4 E4:3 D4:2 | C4:1 C4 D4:2 E4:3 | D4q.:2 C4e:1 C4h', text: 'The second half answers it and comes home to C.' },
    ],
  },
  {
    id: 'l7', unit: 'u3', title: 'Beats and note lengths',
    summary: 'Quarter, half and whole notes against a click.',
    staves: 'treble',
    steps: [
      { type: 'say', text: 'Music moves over a steady beat. A filled note with a stem lasts one beat (a quarter note). A hollow note with a stem lasts two (a half note). A hollow note with no stem lasts four (a whole note).' },
      { type: 'rhythm', rh: 'C4q C4 C4 C4 | C4h C4h | C4w | C4q C4 C4h', tempo: 72, text: 'You’ll hear four clicks, then play middle C on every note. Hold the long ones for their full length.' },
      { type: 'rhythm', rh: 'C4q:1 D4:2 E4h:3 | E4q:3 D4:2 C4h:1 | C4q E4 D4 F4 | E4w:3', tempo: 76, text: 'Same idea with three notes.' },
    ],
  },
  {
    id: 'l8', unit: 'u3', title: 'Keeping time',
    summary: 'Two short tunes played in time.',
    staves: 'treble',
    steps: [
      { type: 'rhythm', rh: 'C4q:1 D4:2 E4:3 C4:1 | C4 D4 E4 C4 | E4:3 F4:4 G4h:5 | E4q:3 F4:4 G4h:5', tempo: 84, text: 'A round you may know. If a note goes wrong, keep going with the clicks.' },
      { type: 'rhythm', rh: 'E4q:3 D4:2 C4:1 D4:2 | E4 E4 E4h | D4q:2 D4 D4h | E4q:3 G4:5 G4h', tempo: 88, text: 'Keep the half notes held for two full beats.' },
    ],
  },
  {
    id: 'l9', unit: 'u4', title: 'The bass clef',
    summary: 'Low notes, the bass staff and your left hand.',
    steps: [
      { type: 'say', text: 'Low notes are written on the lower staff, marked with the bass clef. Put your left little finger (5) on the C below middle C. Your left thumb lands on G.' },
      { type: 'find', notes: LH_POS, show: 'both', text: 'Play C, D, E, F and G with your left hand.' },
      { type: 'find', pool: LH_POS, count: 8, show: 'staff', text: 'Now read them from the bass staff.' },
    ],
  },
  {
    id: 'l10', unit: 'u4', title: 'Left-hand patterns',
    summary: 'Scales and jumps for the left hand.',
    steps: [
      { type: 'seq', lh: 'C3q:5 D3:4 E3:3 F3:2 | G3w:1 | G3q:1 F3:2 E3:3 D3:4 | C3w:5', text: 'Up five and back. The finger numbers run the opposite way from your right hand.' },
      { type: 'seq', lh: 'C3h:5 G3h:1 | C3h G3h | C3q:5 E3:3 G3h:1 | C3w:5', text: 'Jump between C and G, then fill in E.' },
    ],
  },
  {
    id: 'l11', unit: 'u5', title: 'Sharps and flats',
    summary: 'Naming the black keys.',
    staves: 'treble',
    steps: [
      { type: 'say', text: 'A sharp (♯) raises a note to the very next key on the right. A flat (♭) lowers it to the next key on the left. So the black key between F and G is both F♯ and G♭.' },
      { type: 'find', notes: [66], show: 'both', text: 'Play F♯.' },
      { type: 'find', notes: [70], show: 'both', prefer: 'flat', text: 'Play B♭. Same idea, written with a flat.' },
      { type: 'pcs', pcs: [6], count: 3, distinct: true, text: 'Find three different F♯s.' },
      { type: 'find', pool: [61, 63, 66, 68, 70], count: 6, show: 'staff', text: 'Read these black-key notes.' },
    ],
  },
  {
    id: 'l12', unit: 'u5', title: 'Major scales',
    summary: 'Eight notes, a thumb tuck, and your first key signature.',
    staves: 'treble',
    steps: [
      { type: 'say', text: 'A scale climbs from one C to the next. Five fingers aren’t enough for eight notes, so after E your thumb tucks under to play F.' },
      { type: 'seq', rh: 'C4q:1 D4:2 E4:3 F4:1 | G4:2 A4:3 B4:4 C5:5 | C5:5 B4:4 A4:3 G4:2 | F4:1 E4:3 D4:2 C4:1', text: 'Up and down. Keep your wrist level as the thumb passes under.' },
      { type: 'seq', key: 'G', rh: 'G4q:1 A4:2 B4:3 C5:1 | D5:2 E5:3 F#5:4 G5:5', text: 'The G major scale has one sharp. It’s written once at the start of the line, the key signature, and turns every F into F♯.' },
    ],
  },
  {
    id: 'l13', unit: 'u6', title: 'Chords',
    summary: 'C, F and G major in C position.',
    staves: 'treble',
    steps: [
      { type: 'say', text: 'Three notes played together make a chord. In C position, fingers 1, 3 and 5 play C major: C, E and G.' },
      { type: 'seq', rh: 'C4+E4+G4w:135', text: 'Play C, E and G together.' },
      { type: 'seq', rh: 'C4+F4+A4w:125', text: 'F major: keep your thumb on C and reach F and A with fingers 2 and 5.' },
      { type: 'seq', rh: 'B3+D4+G4w:125', text: 'G major: thumb drops to B, fingers 2 and 5 on D and G.' },
      { type: 'seq', rh: 'C4+E4+G4h:135 C4+F4+A4h:125 | B3+D4+G4h:125 C4+E4+G4h:135', text: 'Now change between them.' },
    ],
  },
  {
    id: 'l14', unit: 'u6', title: 'Hands together',
    summary: 'A melody over a held bass note.',
    steps: [
      { type: 'say', text: 'Time to combine hands. The right hand plays the tune and the left holds a note underneath. The music waits until every note lined up together has been played.' },
      { type: 'seq', rh: 'C4q:1 D4:2 E4:3 F4:4 | G4w:5', lh: 'C3w:5 | C3w', text: 'Hold the left-hand C under the whole bar.' },
      { type: 'seq', rh: 'E4q:3 D4:2 C4:1 D4:2 | E4 E4 E4h | D4q:2 D4 D4h | E4q:3 G4:5 G4h', lh: 'C3w:5 | C3w | G3w:1 | C3w:5', text: 'A whole tune with both hands.' },
      { type: 'say', text: 'That’s the whole course. Head to Songs for complete pieces with both hands, or try the Games to sharpen your reading.' },
    ],
  },
];

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
    lh: 'C3w:5 | C3h G3h:1 | C3h G3h | C3w:5 | C3w | C3h G3h | C3h G3h | C3w | G3w:1 | F3w:2 | G3w:1 | G3w | C3w:5 | C3h G3h:1 | C3h G3h | C3w:5',
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
    lh: 'C3w:5 | C3h G3h:1 | C3w:5 | C3h G3h:1 | C3w:5 | F3h:2 C3h:5 | G3w:1 | C3w:5',
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

export const GAMES = [
  {
    id: 'rush', title: 'Note Rush',
    summary: 'Notes slide toward the line. Play each one before it gets there.',
    levels: [
      { name: 'Middle C to G', pool: [60, 62, 64, 65, 67], staves: 'treble' },
      { name: 'Treble staff', pool: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79], staves: 'treble' },
      { name: 'Bass staff', pool: [43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60], staves: 'bass' },
      { name: 'Both staves', pool: [43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79], staves: 'grand' },
      { name: 'Sharps and flats', pool: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72], staves: 'treble', accidentals: true },
    ],
  },
  {
    id: 'echo', title: 'Echo',
    summary: 'Listen to a phrase and play it back. Each round adds a note.',
    levels: [
      { name: 'Five notes', pool: [60, 62, 64, 65, 67], showKeys: true },
      { name: 'One octave', pool: [60, 62, 64, 65, 67, 69, 71, 72], showKeys: true },
      { name: 'By ear only', pool: [60, 62, 64, 65, 67, 69, 71, 72], showKeys: false },
      { name: 'With black keys', pool: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72], showKeys: false },
    ],
  },
  {
    id: 'hunt', title: 'Key Hunt',
    summary: 'A note name appears. Find it anywhere, as many as you can in a minute.',
    levels: [
      { name: 'White keys', pcs: [0, 2, 4, 5, 7, 9, 11] },
      { name: 'All twelve', pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    ],
  },
];
