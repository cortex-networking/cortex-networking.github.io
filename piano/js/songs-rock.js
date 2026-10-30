// Marches, ragtime/blues and original rock/epic pieces for Middle C.
// Public-domain melodies (pre-1929 or traditional), checked against period editions;
// every arrangement here is original and simplified. Originals are composed for this app.
// Voice syntax: see parseVoice() in theory.js.

export const SONGS_ROCK = [
  {
    id: 'men-of-harlech', title: 'Men of Harlech', composer: 'Traditional (Wales)',
    level: 2, key: 'G', time: [4, 4], tempo: 108, tags: ['march', 'epic'], style: 'march',
    blurb: 'A Welsh war march with a defiant dotted stride, built for the left hand to stamp out roots and fifths.',
    chords: 'G | G | C G | D | G | G Em | G D | G | G | G | C G | D | G | G Em | G D | G | D | D | G | G | G | G | G | D7 | C G | Am G | D7 | D | G | G Em | G D | G',
    rh: '!mf G4q.:4 F#4e:3 E4q.:2 F#4e:3 | G4q:1 A4:2 B4:3 G4:1 | C5:4 B4:3 A4:2 G4:1 | F#4:3 E4:2 F#4:3 D4:1 | G4q.:4 F#4e:3 E4q.:2 F#4e:3 | G4q:1 A4:2 B4:3 E5:5 | D5e:4 B4q.:3 A4q.:2 B4e:3 | G4h.:1 rq | '
      + 'G4q.:4 F#4e:3 E4q.:2 F#4e:3 | G4q:1 A4:2 B4:3 G4:1 | C5:4 B4:3 A4:2 G4:1 | F#4:3 E4:2 F#4:3 D4:1 | G4q.:4 F#4e:3 E4q.:2 F#4e:3 | G4q:1 A4:2 B4:3 E5:5 | D5e:4 B4q.:3 A4q.:2 B4e:3 | G4h.:1 rq | '
      + '!f A4q.:3 G4e:2 F#4q.:1 G4e:2 | A4q:3 A4 rh | D5q.:4 C5e:3 B4q.:2 C5e:3 | D5q:4 D5 rh | D5q.:4 C5e:3 B4q.:2 C5e:3 | D5q. C5e B4q. C5e | D5e:4 E5:5 D5:4 C5:3 B4:2 A4:1 B4:2 C5:3 | D5q:4 D5 rh | '
      + 'E5q:5 E5 D5:4 D5 | C5:4 C5 B4:3 B4 | A4e:2 B4:3 C5:4 B4:3 A4q:2 G4:1 | F#4:3 E4:2 F#4:3 D4:1 | G4q.:4 F#4e:3 E4q.:2 F#4e:3 | G4q:1 A4:2 B4:3 E5:5 | D5e:4 B4q.:3 A4q.:2 B4e:3 | G4h.:1 rq',
    lh: 'G2h:5 D3h:1 | G2h D3h | C3h G2h | D3h A2h | G2h D3h | G2h E3h | G2h D3h | G2w | '
      + 'G2h D3h | G2h D3h | C3h G2h | D3h A2h | G2h D3h | G2h E3h | G2h D3h | G2w | '
      + 'D3h:1 A2h:4 | D3h rh | G2h:5 D3h:1 | G2h rh | G2h D3h | G2h D3h | G2h D3h | D3h rh | '
      + 'C3h G2h | A2h G2h | D3h A2h | D3h A2h | G2h D3h | G2h E3h | G2h D3h | G2w',
  },
  {
    id: 'minstrel-boy', title: 'The Minstrel Boy', composer: 'Traditional (Ireland)',
    level: 3, key: 'G', time: [4, 4], tempo: 92, pickup: 1, tags: ['march', 'folk', 'epic'], style: 'march',
    blurb: 'An old Irish air sung by soldiers marching to war, with a proud leap up the octave and a sharp dotted snap.',
    chords: 'G | G | C G | D G | G | G | C G | D G | G | D | Em | C G | G | G | C G | D G',
    rh: '!mf D4q:1 | G4q.:1 A4e:2 C5e:4 B4e:3 A4e:2 G4e:1 | B4q:1 D5:2 G5:5 F#5e.:4 G5s:5 | E5q:3 D5:2 B4e.:1 C5s:2 D5e:3 B4e:1 | A4h:2 G4q:1 D4q:1 | '
      + 'G4q.:1 A4e:2 C5e:4 B4e:3 A4e:2 G4e:1 | B4q:1 D5:2 G5:5 F#5e.:4 G5s:5 | E5q:3 D5:2 B4e.:1 C5s:2 D5e:3 B4e:1 | A4h:2 G4q:1 re D5e:2 | '
      + '!f G5q:5 F#5:4 E5:3 F#5e:4 G5e:5 | F#5q:4 E5:3 D5:2 re D5e:2 | E5q.:3 B4e:1 B4q:1 D5q:2 | E5q.:3 F#5e:4 G5q:5 G5 | '
      + '!mf G4q.:1 A4e:2 C5e:4 B4e:3 A4e:2 G4e:1 | B4q:1 D5:2 G5:5 F#5e.:4 G5s:5 | E5q:3 D5:2 B4e.:1 C5s:2 D5e:3 B4e:1 | A4q.:2 G4e:1 G4h:1',
    lh: 'rq | G2h:5 D3h:1 | G2h D3h | C3h G2h | D3h G2h | G2h D3h | G2h D3h | C3h G2h | D3h G2h | '
      + 'G2h D3h | D3h A2h | E3h B2h | C3h G2h | G2h D3h | G2h D3h | C3h G2h | D3h G2h',
  },
  {
    id: 'scotland-the-brave', title: 'Scotland the Brave', composer: 'Traditional (Scotland)',
    level: 3, key: 'D', time: [4, 4], tempo: 96, tags: ['march', 'folk'], style: 'march',
    blurb: 'The pipe-band march: the right hand plays the tune with its Scotch snaps while the left hand holds a bagpipe drone.',
    chords: 'D | D | G D | E A | D | D | G D | A D | A | D | Bm A | E A | D | D | G D | A D',
    rh: '!f D4q:1 D4e. E4s:2 F#4e:3 D4:1 F#4:3 A4:5 | D5q:5 D5e. C#5s:4 D5e:5 A4:2 F#4:1 D4:1 | G4q:3 B4e.:5 G4s:3 F#4e:2 A4:4 F#4:2 D4:1 | E4q:1 A4e.:4 B4s:5 A4e:4 G4:3 F#4:2 E4:1 | '
      + 'D4q:1 D4e. E4s:2 F#4e:3 D4:1 F#4:3 A4:5 | D5q:5 D5e. C#5s:4 D5e:5 A4:2 F#4:1 D4:1 | G4q:3 B4e.:5 G4s:3 F#4e:2 A4:4 F#4:2 D4:1 | E4q:3 D4e.:2 C#4s:1 D4h:2 | '
      + 'E5q:5 E5e. E5s E5e C#5:3 A4q:1 | D5q:3 F#5e.:5 E5s:4 D5e:3 B4:2 A4q:1 | D5q:4 D5 C#5:3 D5e:4 C#5:3 | B4e:2 D5:4 C#5:3 B4:2 A4:1 G4:3 F#4:2 E4:1 | '
      + 'D4q:1 D4e. E4s:2 F#4e:3 D4:1 F#4:3 A4:5 | D5q:5 D5e. C#5s:4 D5e:5 A4:2 F#4:1 D4:1 | G4q:3 B4e.:5 G4s:3 F#4e:2 A4:4 F#4:2 D4:1 | E4q:3 D4e.:2 C#4s:1 D4h:2',
    lh: 'D3+A3w:51 | D3+A3w | D3+A3w | D3+A3w | D3+A3w | D3+A3w | D3+A3w | D3+A3w | '
      + 'D3+A3w | D3+A3w | D3+A3w | D3+A3w | D3+A3w | D3+A3w | D3+A3w | D3+A3w',
  },
  {
    id: 'battle-hymn', title: 'Battle Hymn of the Republic', composer: 'Traditional (America)', year: 1861,
    level: 3, key: 'Bb', time: [4, 4], tempo: 96, pickup: 0.5, tags: ['march', 'epic'], style: 'march',
    blurb: 'The Civil War camp-meeting tune behind the famous hymn: dotted marching rhythms and a chorus that lands like a drumbeat.',
    chords: 'Bb | Bb | Eb | Bb | Bb | Bb | Eb F7 | Bb | Bb | Bb | Eb | Bb | Bb | Bb | Eb F7 | Bb',
    rh: '!mf F4e:3 | F4e:3 F4 F4e. Eb4s:2 D4e.:1 F4s:2 Bb4e.:1 C5s:2 | D5e.:3 D5s D5e. C5s:2 Bb4q:1 re Bb4s:3 Bb4s | G4e.:1 G4s G4e. A4s:2 Bb4e.:3 Bb4s A4e.:2 G4s:1 | F4e.:2 G4s:3 F4e.:2 D4s:1 F4q:2 re F4s:3 F4s | '
      + 'F4e.:3 F4s F4e. Eb4s:2 D4e.:1 F4s:2 Bb4e.:1 C5s:2 | D5e.:3 D5s D5e. C5s:2 Bb4q:1 re Bb4e:3 | C5q:4~ C5e. C5s Bb4q:3 A4q:2 | Bb4h:3 rh | '
      + '!f F4q.:3 Eb4e:2 D4e.:1 F4s:2 Bb4e.:1 C5s:2 | D5h:3 Bb4q:1 rq | G4e.:1 G4s G4e. A4s:2 Bb4e.:3 Bb4s A4e.:2 G4s:1 | F4q:3 D4:1 F4h:3 | '
      + 'F4q.:3 Eb4e:2 D4e.:1 F4s:2 Bb4e.:1 C5s:2 | D5h:3 Bb4q:1 re Bb4e:3 | C5q:4 C5 Bb4:3 A4:2 | Bb4h:3 rh',
    lh: 're | Bb2h:5 F3h:1 | Bb2h F3h | Eb3h Bb2h | Bb2h F3h | Bb2h F3h | Bb2h F3h | Eb3h F3h | Bb2h rh | '
      + 'Bb2h F3h | Bb2h F3h | Eb3h Bb2h | Bb2h F3h | Bb2h F3h | Bb2h F3h | Eb3h F3h | Bb2h rh',
  },
  {
    id: 'british-grenadiers', title: 'The British Grenadiers', composer: 'Traditional (England)',
    level: 2, key: 'G', time: [4, 4], tempo: 112, pickup: 1, tags: ['march', 'folk'], style: 'march',
    blurb: 'A swaggering fife-and-drum march from the 1700s, built from steps and skips with a few clearly marked hand shifts.',
    chords: 'G | G D | G D | G | G | G D | G D | G | G D7 | G | C D | G D7 | G | G D | G D | G',
    rh: '!mf D4q:1 | G4q:4 D4:1 G4:1 A4:2 | B4h:3 A4q:2 B4e:3 C5e:4 | D5q:5 G4:2 B4e:4 A4:3 G4:2 F#4:1 | G4h.:2 D4q:1 | '
      + 'G4q:4 D4:1 G4:1 A4:2 | B4h:3 A4q:2 B4e:3 C5e:4 | D5q:5 G4:2 B4e:4 A4:3 G4:2 F#4:1 | G4h.:2 !f E5e:5 E5 | '
      + 'D5q.:4 E5e:5 D5q:4 C5:3 | B4q.:2 C5e:3 D5q:4 D5 | E5q:5 E5 D5e:4 C5:3 B4:2 A4:1 | G4h:2 F#4q:1 !mf D4e:1 D4 | '
      + 'G4q:4 D4:1 G4:1 A4:2 | B4h:3 A4q:2 B4e:3 C5e:4 | D5q:5 G4:2 B4e:4 A4:3 G4:2 F#4:1 | G4h.:2 rq',
    lh: 'rq | G2h:5 D3h:1 | G2h D3h | G2h D3h | G2h D3h | G2h D3h | G2h D3h | G2h D3h | G2h D3h | '
      + 'G2h:5 D3h:1 | G2h D3h | C3h:2 D3h:1 | G2h:5 D3h:1 | G2h D3h | G2h D3h | G2h D3h | G2h rh',
  },
  {
    id: 'when-johnny-comes-marching', title: 'When Johnny Comes Marching Home', composer: 'Traditional (America)', year: 1863,
    level: 3, key: 'Em', time: [6, 8], tempo: 144, pickup: 0.5, tags: ['march', 'epic', 'folk'], style: 'march',
    blurb: 'The Civil War march in its darkest colors: E minor, a lilting 6/8 tramp, and a chorus that climbs to a shout.',
    chords: 'Em | Em | G | D | Em | Em | G | B7 | G | D | Em | B7 | G D | Em B7 | Em B7 | Em',
    rh: '!p E4e:3 | B3e:1 E4:3 E4 E4q:3 F#4e:4 | G4q:5 F#4e:4 G4q:5 E4e:3 | D4q.:2~ D4q B3e:1 | D4q.:2~ D4q E4e:3 | '
      + 'B3e:1 E4:3 E4:2 E4q:1 F#4e:2 | G4q:3 F#4e:2 G4q:3 A4e:4 | B4q.:5~ B4q G4e:3 | B4h:5 F#4e:2 A4e:4 | '
      + '!f B4q:5 B4e B4e A4e:4 G4e:3 | A4q:4 A4e A4q F#4e:2 | G4q:3 G4e G4e F#4e:2 E4e:1 | F#4q:2 F#4e F#4e G4e:3 A4e:4 | '
      + 'B4q.:5 A4q.:4 | G4q.:3 F#4q.:2 | !mf B3e:1 E4:3 E4 E4q:3 D#4e:2 | E4h.:3',
    lh: 're | E2q.:5 B2q.:1 | E2q. B2q. | G2q.:5 D3q.:1 | D3q.:1 A2q.:4 | E2q.:5 B2q.:1 | E2q. B2q. | G2q.:5 D3q.:1 | B2q.:1 F#2q.:4 | '
      + 'G2q.:5 D3q.:1 | D3q.:1 A2q.:4 | E2q.:5 B2q.:1 | B2q.:1 F#2q.:4 | G2q.:5 D3q.:1 | E2q.:5 B2q.:1 | E2q. B2q. | E2+B2h.:51',
  },
  {
    id: 'radetzky-march', title: 'Radetzky March (main tune)', composer: 'Johann Strauss I', year: 1848,
    level: 5, key: 'D', time: [2, 2], tempo: 152, pickup: 1, tags: ['march', 'classical'], style: 'march',
    blurb: 'The clap-along Viennese march, written down an octave so the tune sits on the staff: crisp staccato eighths over an oom-pah left hand.',
    chords: 'D | D | D | D | A7 | D | A E7 | A A7 | D | D | D | D | E7 | D/A | A7 | D',
    rh: '!p F#4e:3 E#4:2 | F#4e:3 re F#4e E#4e:2 F#4e:3 re F#4e E#4e:2 | F#4e:3 re E4e:2 re D4e:1 re F#4e:3 E#4e:2 | F#4e:3 re F#4e E#4e:2 F#4e:3 re F#4e E#4e:2 | F#4e:1 re B4e:4 re A4e:3 re A4e F#4e:1 | '
      + 'G4e:2 re B4e:4 re A4e:3 re A4e E4e:1 | F#4e:1 re B4e:4 re A4e:3 re A4e F#4e:1 | E4e:1 re C#5q:5 D4e:1 re B4q:5 | A4e:2 re A4e G#4e:1 A4e:2 B4e:3 A4e:2 G4e:1 | '
      + 'F#4e:3 re F#4e E#4e:2 F#4e:3 re F#4e E#4e:2 | F#4e:3 re E4e:2 re D4e:1 re F#4e:3 E#4e:2 | F#4e:3 re F#4e E#4e:2 F#4e:3 re F#4e E#4e:2 | F#4e:1 re B4e:4 re A4e:3 re A4e F#4e:1 | '
      + '!f G#4e:1 re F#5e:5 re E5h:4 | F#4e:1 re E5e:5 re D5h:4 | C#5q.:4 B4e:3 A4e:2 G4e:1 F#4e:3 E4e:2 | D4q:1 D4 D4 rq',
    lh: 'rq | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | '
      + 'A2q:5 E3+G3q:21 A2q:5 E3+G3q:21 | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | A2q:5 C#3+E3q:21 E2q:5 G#2+D3q:21 | A2q:5 C#3+E3q:21 E2q:5 C#3+G3q:31 | '
      + 'D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | D3q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | '
      + 'E3q:5 G#3+D4q:31 E3q:5 G#3+D4q:31 | A2q:5 F#3+A3q:21 A2q:5 F#3+A3q:21 | A2q:5 E3+G3q:21 A2q:5 E3+G3q:21 | D3+F#3+A3q:531 D3+F#3+A3q D3+F#3+A3q rq',
  },
  {
    id: 'colonel-bogey', title: 'Colonel Bogey March', composer: 'Kenneth J. Alford', year: 1914,
    level: 3, key: 'D', time: [2, 2], tempo: 144, tags: ['march', 'games'], style: 'march',
    blurb: 'The famous whistling march: count the rests carefully, because the silences are where the swagger lives.',
    chords: 'D | D | D | D | D | D | A7 | A7 | A7 | A7 | D | D E7 | A | E7 | A | A7 | D | D | D | D | D | D | A7 | A7 | A7 | A7 | D | D | Em7 | A7 | D | D',
    rh: '!p A4q:5 F#4e:3 re rh | rq F#4q:3 G4:4 A4:5 | F#5q:5 rq F#5q rq | D5w:3 | A4q:5 F#4e:3 re rh | rq F#4q:3 G4:4 F#4:3 | A4q:5 rq A4q rq | G4w:4 | '
      + 'G4q:3 E4e:1 re rh | rq E4q:1 F#4:2 G4:3 | A4q:4 F#4e:2 re rh | rq F#4q:2 G#4q.:3 F#4e:2 | !mf E4q:1 A4:4 rq F#4:2 | G#4q:3 E4:1 rq B4:5 | A4w:4~ | A4q A4e:4 A4 A4q A4 | '
      + 'A4q:5 F#4e:3 re rh | rq F#4q:3 G4:4 A4:5 | F#5q:5 rq F#5q rq | D5w:3 | A4q:5 F#4e:3 re rh | rq F#4q:3 G4:4 F#4:3 | A4q:5 rq A4q rq | G4w:4 | '
      + 'G4q:3 E4e:1 re rh | rq B4q:3 C#5:4 B4:3 | D5q:5 A4e:2 re rh | rq A4q:3 G4:2 F#4:1 | !f E4q:1 B4e:5 re rq D4q:1 | C#4q:1 A4e:5 re rq C#5q:4 | D5w:5 | F#4+A4+D5q:125 rq rh',
    lh: 'D3h:5 A3h:1 | D3h A3h | D3h A3h | D3h A3h | D3h A3h | D3h A3h | A2h:5 E3h:1 | A2h E3h | '
      + 'A2h E3h | A2h E3h | D3h:5 A3h:1 | D3h:5 E3h:4 | A2h:5 E3h:1 | E3h:1 B2h:4 | A2h:5 E3h:1 | A2q:1 G2:2 F#2:3 E2:4 | '
      + 'D3h:5 A3h:1 | D3h A3h | D3h A3h | D3h A3h | D3h A3h | D3h A3h | A2h:5 E3h:1 | A2h E3h | '
      + 'A2h E3h | A2h E3h | D3h:5 A3h:1 | D3h A3h | E3h:5 B3h:1 | A2h:5 E3h:1 | D3h:5 A3h:1 | D3+A3q:51 rq rh',
  },
  {
    id: 'stars-and-stripes', title: 'The Stars and Stripes Forever (trio)', composer: 'John Philip Sousa', year: 1897,
    level: 4, key: 'G', time: [2, 2], tempo: 160, pickup: 2, tags: ['march'], style: 'march',
    blurb: 'The broad, singing trio of Sousa\u2019s most famous march, moved from A-flat to G, over a classic oom-pah left hand that leaps from bass note to chord.',
    chords: 'G | G | G | G | G | G | D7 | D7 | D7 | D7 | D7 | D7 | G | C | D | D | G | G | G | G | B7 | B7 | Esus4 | Em | Cm/Eb | Eb | G | G | G | G Em | D7 | G',
    rh: '!p D5h:5 | D5h:5 C5q:4 B4q:3 | B4h:3 A#4q:2 B4q:3 | B4w~ | B4h A#4q B4q | B4h A#4q B4q | D5h:5 B4q.:3 D5e:5 | C5w:4 | A4h:2 A4h | A4h:2 G#4q:1 A4q:2 | A4h G#4q A4q | C5w:4~ | C5h B4q:3 A4q:2 | '
      + '!mf B4q:1 D5h.:3 | E5h.:4 E5q | A4w:1~ | A4h D5h:5 | !p D5h:5 C5q:4 B4q:3 | B4h:3 A#4q:2 B4q:3 | B4w~ | B4h A#4q B4q | B4h A#4q B4q | C5q:3 B4q:2 A4q.:1 F#5e:5 | A4w:2 | G4h:1 G4h | G4h:2 F#4q:1 G4q:2 | '
      + '!mf Bb4h:4 A4q:3 G4q:2 | !f G4+G5w:15~ | G4+G5q G4q:1 A4q:2 B4q:3 | D5e:5 re G4q:1 A4q:2 B4q:3 | D5e:5 re D4q:1 E4q:2 B4q:5 | A4w:4 | G4q:3 rq rh',
    lh: 'rh | G2q:5 B2+D3+G3q:531 D2q:5 B2+D3+G3q:531 | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | A2q:4 C3+F#3+A3q:531 D2q:5 C3+F#3+A3q:531 | A2q C3+F#3+A3q D2q C3+F#3+A3q | A2q C3+F#3+A3q D2q C3+F#3+A3q | A2q C3+F#3+A3q D2q C3+F#3+A3q | A2q C3+F#3+A3q D2q C3+F#3+A3q | A2q C3+F#3+A3q D2q C3+F#3+A3q | G2q B2+D3+G3q D2q B2+D3+G3q | C3q E3+G3+C4q G2q E3+G3+C4q | D2q D3+F#3+A3q A2q D3+F#3+A3q | D2q D3+F#3+A3q A2q D3+F#3+A3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | F#2q:5 D#3+F#3+A3q:531 B2q:5 D#3+F#3+A3q:531 | F#2q D#3+F#3+A3q B2q D#3+F#3+A3q | E2q:5 E3+A3+B3q:521 B2q:5 E3+A3+B3q:521 | E2q E3+G3+B3q B2q E3+G3+B3q | Eb2q:5 C3+Eb3+G3q:531 G2q:5 C3+Eb3+G3q | Eb2q Eb3+G3+Bb3q:531 Eb3+G3+Bb3q Eb3+G3+Bb3q | D2q:5 B2+D3+G3q:531 G2q:5 B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q D2q B2+D3+G3q | G2q B2+D3+G3q B2q:4 E3+G3+B3q:531 | F#2q:5 C3+D3+A3q:431 D2q:5 C3+D3+A3q | B2+D3+G3q:531 rq G2q:5 G2q',
  },
  {
    id: 'the-entertainer', title: 'The Entertainer (opening)', composer: 'Scott Joplin', year: 1902,
    level: 4, key: 'C', time: [2, 4], tempo: 72, pickup: 0.5, tags: ['blues', 'classical', 'games'], style: 'rag',
    blurb: 'Joplin’s ragtime hit, simplified to single notes: tied off-beat syncopations in the right hand over a stride left hand that jumps from bass note to chord.',
    chords: 'C C7 | F C/E | C/G G7 | C G7 | C C7 | F C/E | D7 | G7 | C C7 | F C/E | C/G G7 | C | C C7 | F/A Fm/Ab | C/G G7 | C',
    rh: '!mf D4s:1 D#4:2 | E4s:1 C5e:5 E4s:1 C5e:5 E4s:1 C5s:5~ | C5q~ C5s C5s:1 D5:2 D#5:3 | E5s:4 C5:2 D5:3 E5s:4~ E5 B4:1 D5e:3 | C5q.:2 D4s:1 D#4:2 | '
      + 'E4s:1 C5e:5 E4s:1 C5e:5 E4s:1 C5s:5~ | C5q.:5 A4s:3 G4:2 | F#4s:1 A4:2 C5:3 E5s:5~ E5 D5:4 C5:3 A4:2 | D5q.:5 D4s:1 D#4:2 | '
      + 'E4s:1 C5e:5 E4s:1 C5e:5 E4s:1 C5s:5~ | C5q~ C5s C5s:1 D5:2 D#5:3 | E5s:4 C5:2 D5:3 E5s:4~ E5 B4:1 D5e:3 | C5q.:2 C5s:1 D5:2 | '
      + '!f E5s:3 C5:1 D5:2 E5s:3~ E5 C5:1 D5:2 C5:1 | E5s:3 C5:1 D5:2 E5s:3~ E5 C5:1 D5:2 C5:1 | E5s:3 C5:1 D5:2 E5s:3~ E5 B4:1 D5e:3 | C5q:2 rq',
    lh: 're | C3e:5 E3+G3+C4e:321 G2e:5 G3+Bb3+C4e:321 | F2e:5 A3+C4e:21 E2e:5 G3+C4e:21 | G2e:5 E3+G3+C4e:321 G2e:5 F3+G3+B3e:321 | C3e:5 E3+G3+C4e:321 E3+G3+C4e G3+B3e:21 | '
      + 'C3e:5 E3+G3+C4e:321 G2e:5 G3+Bb3+C4e:321 | F2e:5 A3+C4e:21 E2e:5 Eb2e:4 | D2e:5 D3+F#3+A3+C4e:5321 D3e:5 F#3+A3+C4e:321 | G3+B3e:21 G2e:5 A2e:4 B2e:3 | '
      + 'C3e:5 E3+G3+C4e:321 G2e:5 G3+Bb3+C4e:321 | F2e:5 A3+C4e:21 E2e:5 G3+C4e:21 | G2e:5 E3+G3+C4e:321 G2e:5 F3+G3+B3e:321 | C3e:5 E3+G3+C4e:321 C3+E3+G3e:531 re | '
      + 'C3e:5 G3+C4e:21 Bb2e:5 G3+C4e:21 | A2e:5 F3+C4e:21 Ab2e:5 F3+C4e:21 | G2e:5 G3+C4e:21 G2e:5 G3+B3e:21 | C3+G3e:51 G2e:5 C2e:5 re',
  },
  {
    id: 'st-louis-blues', title: 'St. Louis Blues (simplified)', composer: 'W. C. Handy', year: 1914,
    level: 3, key: 'G', time: [4, 4], tempo: 84, tags: ['blues'], style: 'swing',
    blurb: 'The first great blues hit: a twelve-bar verse full of “blue” notes, with an A-sharp slipping up to B and a B-flat rubbing against the G chord.',
    chords: 'G | C7 | G | G7 | C7 | C7 | G | G | D7 | D7 | G | G | G | C7 | G | G7 | C7 | C7 | G | G | D7 | D7 | G | G',
    rh: '!mf A#4s:2 B4s:3 D5e:5 B4e:3 G4e:1~ G4h | re D#4:1 E4:2 G4:3 Bb4q.:4 A4e:3 | G4w:2~ | G4h. rq | '
      + 're E4:1 G4:2 A4:3~ A4h | re E4:1 G4:2 A4:3 Bb4q.:4 A4e:3 | G4w:2~ | G4h rh | '
      + 'F#4e:2 A4:4 F#4:2 D4:1~ D4q D4 | rq Bb4e:4 Bb4 Bb4q. A4e:3 | G4w:2~ | G4h rh | '
      + 'A#4s:2 B4s:3 D5e:5 B4e:3 G4e:1~ G4h | re D#4:1 E4:2 G4:3 Bb4q.:4 A4e:3 | G4w:2~ | G4h. rq | '
      + 're E4:1 G4:2 A4:3~ A4h | re E4:1 G4:2 A4:3 Bb4q.:4 A4e:3 | G4w:2~ | G4h rh | '
      + 'F#4e:2 A4:4 F#4:2 D4:1~ D4q D4 | rq Bb4e:4 Bb4 Bb4q. A4e:3 | G4w:2~ | G4h rh',
    lh: 'G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | C3q:5 E3+Bb3q:31 G2q:5 E3+Bb3q:31 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | G2q:5 D3+F3q:21 B2q:3 D3+F3q:21 | '
      + 'C3q:5 E3+Bb3q:31 G2q:5 E3+Bb3q:31 | C3q:5 E3+Bb3q:31 G2q:5 E3+Bb3q:31 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | '
      + 'D3q:5 F#3+C4q:31 A2q:5 F#3+C4q:31 | D3q:5 F#3+C4q:31 A2q:5 F#3+C4q:31 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | G2q:5 D3+G3q:21 D3q:3 G2q:5 | '
      + 'G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | C3q:5 E3+Bb3q:31 G2q:5 E3+Bb3q:31 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | G2q:5 D3+F3q:21 B2q:3 D3+F3q:21 | '
      + 'C3q:5 E3+Bb3q:31 G2q:5 E3+Bb3q:31 | C3q:5 E3+Bb3q:31 G2q:5 E3+Bb3q:31 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | '
      + 'D3q:5 F#3+C4q:31 A2q:5 F#3+C4q:31 | D3q:5 F#3+C4q:31 A2q:5 F#3+C4q:31 | G2q:5 D3+G3q:21 B2q:3 D3+G3q:21 | G2+D3+G3w:521',
  },
  {
    id: 'when-the-saints', title: 'When the Saints Go Marching In', composer: 'Traditional (America)',
    level: 1, key: 'G', time: [4, 4], tempo: 112, pickup: 3, tags: ['blues', 'march', 'starter'], style: 'swing',
    blurb: 'The New Orleans parade tune: five notes in one hand position, long held notes to count through, and a left hand that holds G, C and D underneath.',
    chords: 'G | G | G | G | G | G | D7 | D7 | G | G7 | C | C | G | D7 | G',
    rh: '!mf G4q:1 B4:3 C5:4 | D5w:5 | rq G4:1 B4:3 C5:4 | D5w:5 | rq G4:1 B4:3 C5:4 | D5h:5 B4h:3 | G4h:1 B4h:3 | A4w:2 | '
      + 'rq B4:3 B4 A4:2 | G4h.:1 G4q | B4h:3 D5h:5 | D5q:5 C5h.:4~ | C5q C5:4 B4:3 C5:4 | D5h:5 B4h:3 | G4h:1 A4h:2 | G4w:1',
    lh: 'rh. | G2w:5 | G2w | G2w | G2w | G2w | G2w | D3w:1 | D3w | '
      + 'G2w:5 | G2w | C3w:4 | C3w | G2w:5 | D3w:1 | G2w:5',
  },
  {
    id: 'iron-riff', title: 'Iron Riff', composer: 'Original',
    level: 2, key: 'Em', time: [4, 4], tempo: 100, tags: ['epic'], style: 'rock',
    blurb: 'A heavy E-minor riff built on power chords: the left hand clamps fingers 5 and 1 on a bare fifth and moves the whole shape as one block.',
    chords: 'E5:3 G5:1 | E5 | C5 D5 | E5 | E5:3 G5:1 | E5 | C5 D5 | B5 | E5:3 G5:1 | E5 | C5 D5 | E5 | G5 D5 | C5 B5 | C5 D5 | E5',
    rh: '!mf E4q:1 E4 G4:3 E4:1 | A4q:4 G4:3 E4h:1 | E4q:1 E4 F#4:2 A4:4 | B4h:5 rh | E4q:1 E4 G4:3 E4:1 | A4q:4 G4:3 E4h:1 | G4q:3 E4:1 F#4:2 A4:4 | F#4h:2 rh | '
      + '!f B4q:2 B4 D5:4 B4:2 | E5q:5 D5:4 B4h:2 | C5q:3 B4:2 A4:1 B4:2 | E4h:1 rh | D5q:5 B4:3 A4:2 F#4:1 | C5h:4 B4h:3 | C5q:4 B4:3 A4:2 F#4:1 | !ff E4w:1',
    lh: '!mf E2+B2e:51 E2+B2 E2+B2 E2+B2 E2+B2 E2+B2 G2+D3q:51 | E2+B2e E2+B2 E2+B2 E2+B2 E2+B2h | C2+G2e:51 C2+G2 C2+G2 C2+G2 D2+A2e:51 D2+A2 D2+A2 D2+A2 | E2+B2h:51 E2+B2h | '
      + 'E2+B2e:51 E2+B2 E2+B2 E2+B2 E2+B2 E2+B2 G2+D3q:51 | E2+B2e E2+B2 E2+B2 E2+B2 E2+B2h | C2+G2e:51 C2+G2 C2+G2 C2+G2 D2+A2e:51 D2+A2 D2+A2 D2+A2 | B2+F#3h:51 B2+F#3h | '
      + '!f E2+B2e:51 E2+B2 E2+B2 E2+B2 E2+B2 E2+B2 G2+D3q:51 | E2+B2e E2+B2 E2+B2 E2+B2 E2+B2h | C2+G2e:51 C2+G2 C2+G2 C2+G2 D2+A2e:51 D2+A2 D2+A2 D2+A2 | E2+B2h:51 E2+B2h | '
      + 'G2+D3e:51 G2+D3 G2+D3 G2+D3 D2+A2e:51 D2+A2 D2+A2 D2+A2 | C2+G2e:51 C2+G2 C2+G2 C2+G2 B2+F#3e:51 B2+F#3 B2+F#3 B2+F#3 | C2+G2e:51 C2+G2 C2+G2 C2+G2 D2+A2e:51 D2+A2 D2+A2 D2+A2 | !ff E2+B2w:51',
  },
  {
    id: 'twelve-bar-blues', title: 'Back Porch Shuffle', composer: 'Original',
    level: 3, key: 'C', time: [12, 8], tempo: 96, tags: ['blues'], style: 'swing',
    blurb: 'A twelve-bar blues in C with a long-short shuffle written in 12/8, the left hand rocking between the fifth and the sixth of each chord.',
    chords: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7',
    rh: '!mf G4q.:2 Bb4q:4 G4e:2 C5q.:5 G4q.:2 | A4q.:3 C5q:5 A4e:3 Eb4q:1 E4e:2 F4q.:3 | G4q.:2 Bb4q:4 G4e:2 C5q:5 Bb4e:4 G4q.:2 | Eb4q:1 E4e:2 G4q.:3 rh. | '
      + 'A4q.:1 C5q:3 A4e:1 Eb5q.:5 C5q.:3 | A4q:4 G4e:3 F4q.:2 Eb4q:1 E4e:2 F4q.:3 | G4q.:2 Bb4q:4 G4e:2 C5q.:5 G4q.:2 | E4q.:1 G4q:3 E4e:1 C4h.:1 | '
      + '!f D5q.:5 B4q:3 G4e:1 D5q:5 C5e:4 B4q.:3 | C5q.:5 A4q:3 F4e:1 C5q:5 Bb4e:4 A4q.:3 | G4q:2 Bb4e:4 C5q:5 G4e:2 Eb4q:1 E4e:2 C4q.:1 | !mf D4q.:1 F4q:2 G4e:3 B4q.:5 rq.',
    lh: 'C3q:5 G3e:1 C3q:5 G3e:1 C3q:5 A3e:1 C3q:5 G3e:1 | F2q:5 C3e:1 F2q:5 C3e:1 F2q:5 D3e:1 F2q:5 C3e:1 | C3q:5 G3e:1 C3q:5 G3e:1 C3q:5 A3e:1 C3q:5 G3e:1 | C3q:5 G3e:1 C3q:5 G3e:1 C3q:5 A3e:1 C3q:5 Bb3e:1 | '
      + 'F2q:5 C3e:1 F2q:5 C3e:1 F2q:5 D3e:1 F2q:5 C3e:1 | F2q:5 C3e:1 F2q:5 C3e:1 F2q:5 D3e:1 F2q:5 Eb3e:1 | C3q:5 G3e:1 C3q:5 G3e:1 C3q:5 A3e:1 C3q:5 G3e:1 | C3q:5 G3e:1 C3q:5 G3e:1 C3q:5 A3e:1 C3q:5 G3e:1 | '
      + 'G2q:5 D3e:1 G2q:5 D3e:1 G2q:5 E3e:1 G2q:5 D3e:1 | F2q:5 C3e:1 F2q:5 C3e:1 F2q:5 D3e:1 F2q:5 C3e:1 | C3q:5 G3e:1 C3q:5 G3e:1 C3q:5 A3e:1 C3q:5 G3e:1 | G2q:5 D3e:1 G2q:5 D3e:1 G2q.:5 rq.',
  },
  {
    id: 'boogie-stomp', title: 'Boogie Stomp', composer: 'Original',
    level: 4, key: 'C', time: [4, 4], tempo: 120, tags: ['blues'], style: 'swing',
    blurb: 'A twelve-bar boogie-woogie: the left hand walks up and down each chord without stopping while the right hand fires short blues riffs on top.',
    chords: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | C7',
    rh: '!f G4e:2 Bb4:4 C5:5 G4:2 Bb4:4 C5:5 G4q:2 | A4e:2 C5:4 D5:5 A4:2 C5:4 D5:5 A4q:2 | G4e:2 Bb4:4 C5:5 G4:2 Bb4:4 C5:5 G4q:2 | Eb4e:2 E4:3 G4:4 Bb4:5 A4q:4 G4q:3 | '
      + '!mf A4e:2 C5:4 D5:5 A4:2 C5:4 D5:5 A4q:2 | C5e:4 Eb5:5 C5:4 A4:2 F4q:1 rq | G4e:2 Bb4:4 C5:5 G4:2 Bb4:4 C5:5 G4q:2 | E4e:1 G4:2 A4:3 Bb4:4 C5q:5 rq | '
      + '!f B4e:2 D5:4 F5:5 D5:4 B4q:2 G4q:1 | A4e:2 C5:4 Eb5:5 C5:4 A4q:2 F4q:1 | G4e:3 Bb4:4 C5:5 G4:3 E4q:2 C4q:1 | Eb4e:2 E4:3 G4:4 C5:5~ C5h',
    lh: '!f C2e:5 E2:4 G2:3 A2:2 Bb2:1 A2:2 G2:3 E2:4 | F2e:5 A2:4 C3:3 D3:2 Eb3:1 D3:2 C3:3 A2:4 | C2e:5 E2:4 G2:3 A2:2 Bb2:1 A2:2 G2:3 E2:4 | C2e:5 E2:4 G2:3 A2:2 Bb2:1 A2:2 G2:3 E2:4 | F2e:5 A2:4 C3:3 D3:2 Eb3:1 D3:2 C3:3 A2:4 | F2e:5 A2:4 C3:3 D3:2 Eb3:1 D3:2 C3:3 A2:4 | C2e:5 E2:4 G2:3 A2:2 Bb2:1 A2:2 G2:3 E2:4 | C2e:5 E2:4 G2:3 A2:2 Bb2:1 A2:2 G2:3 E2:4 | G2e:5 B2:4 D3:3 E3:2 F3:1 E3:2 D3:3 B2:4 | F2e:5 A2:4 C3:3 D3:2 Eb3:1 D3:2 C3:3 A2:4 | C2e:5 E2:4 G2:3 A2:2 Bb2:1 A2:2 G2:3 E2:4 | C2e:5 E2:4 G2:3 E2:4 C2+C3h:51',
  },
  {
    id: 'siege-march', title: 'Siege March', composer: 'Original',
    level: 3, key: 'Dm', time: [4, 4], tempo: 72, tags: ['march', 'epic'], style: 'epic',
    blurb: 'A slow, grim march in D minor: the left hand pounds open fifths in a war-drum rhythm while the right hand climbs from a low chant to a defiant cry.',
    chords: 'Dm | Dm | Gm | A | Dm | Bb | Gm A | Dm | Dm | C | Bb | A | Dm | Gm | A5 | Dm',
    rh: '!p D4q.:1 E4e:2 F4q:3 D4q:1 | A4h:5 F4q:3 D4q:1 | G4q.:4 F4e:3 G4q:4 D4q:1 | E4h:2 C#4h:1 | '
      + 'D4q.:1 E4e:2 F4q:3 A4q:4 | Bb4h:5 A4q:4 G4q:3 | G4q:4 F4:3 E4h:2 | D4w:1 | '
      + '!mf A4q.:1 A4e A4q:1 D5q:4 | E5q.:5 D5e:4 C5h:3 | D5q.:4 C5e:3 Bb4q:2 D5q:4 | C#5h:3 A4h:1 | '
      + '!f D5q.:4 E5e:5 D5q:4 A4q:1 | Bb4q.:2 C5e:3 Bb4q:2 G4q:1 | A4q.:2 G4e:1 F4q:3 E4q:2 | !p D4w:1',
    lh: '!p D2+A2q.:51 D2+A2e D2+A2q D2+A2q | D2+A2q. D2+A2e D2+A2q D2+A2q | G2+D3q.:51 G2+D3e G2+D3q G2+D3q | A2+E3q.:51 A2+E3e A2+E3q A2+E3q | '
      + 'D2+A2q.:51 D2+A2e D2+A2q D2+A2q | Bb2+F3q.:51 Bb2+F3e Bb2+F3q Bb2+F3q | G2+D3q.:51 G2+D3e A2+E3q:51 A2+E3q | D2+A2q.:51 D2+A2e D2+A2h | '
      + '!mf D2+A2q.:51 D2+A2e D2+A2q D2+A2q | C2+G2q.:51 C2+G2e C2+G2q C2+G2q | Bb2+F3q.:51 Bb2+F3e Bb2+F3q Bb2+F3q | A2+E3q.:51 A2+E3e A2+E3q A2+E3q | '
      + '!f D2+A2q.:51 D2+A2e D2+A2q D2+A2q | G2+D3q.:51 G2+D3e G2+D3q G2+D3q | A2+E3q.:51 A2+E3e A2+E3q A2+E3q | !p D2+A2w:51',
  },
  {
    id: 'void-chant', title: 'Chant of the Deep Halls', composer: 'Original',
    level: 2, key: 'Am', time: [4, 4], tempo: 66, tags: ['epic'], style: 'chant',
    blurb: 'A slow modal chant in E Phrygian: the dark half-step from E to F hangs over bare open fifths in the left hand, like monks singing in a stone vault.',
    chords: 'E5 | E5 | E5 | F5 | E5 | A5 | D5 | E5 | A5 | A5 | F5 | E5 | A5 | D5 | F5 | E5',
    rh: '!p E4h:1 F4h:2 | G4h:3 F4h:2 | E4q:1 F4:2 G4:3 F4:2 | F4w:2 | E4h:1 G4h:3 | A4h:4 G4q:3 A4q:4 | A4h:4 F4h:2 | E4w:1 | '
      + '!mf A4h:1 B4h:2 | C5h:3 B4q:2 A4q:1 | C5h:3 A4h:1 | B4w:2 | E5h:5 D5q:4 C5q:3 | D5h:4 A4h:1 | !p F4h:3 G4q:4 F4q:3 | !pp E4w:2',
    lh: '!p E2+B2w:51 | E2+B2w | E2+B2w | F2+C3w:51 | E2+B2w:51 | A2+E3w:51 | D2+A2w:51 | E2+B2w:51 | '
      + '!mf A2+E3w:51 | A2+E3w | F2+C3w:51 | E2+B2w:51 | A2+E3w:51 | D2+A2w:51 | !p F2+C3w:51 | !pp E2+B2w:51',
  },
  {
    id: 'forge-anthem', title: 'Anthem of the Forge', composer: 'Original',
    level: 4, key: 'Am', time: [4, 4], tempo: 112, tags: ['epic'], style: 'epic',
    blurb: 'A big A-minor anthem: the left hand hammers octave eighths like a smith at the anvil while the right hand melody soars up to a high F.',
    chords: 'Am | F | G | E | Am | F | Dm | E | F | G | Am | Am | Dm | Am | Dm E | Am',
    rh: '!mf E4h:1 A4q.:2 B4e:3 | C5h.:4 A4q:2 | B4q:3 C5:4 D5:5 B4:3 | G#4h:1 B4h:3 | '
      + 'A4q.:1 B4e:2 C5q:3 E5q:4 | F5h.:5 E5q:4 | D5q.:3 C5e:2 D5h:3 | B4w:1 | '
      + '!f A4q:1 C5:2 F5h:5 | E5q:4 D5:3 B4h:1 | C5q.:2 B4e:1 C5q:2 E5q:4 | E5w:4 | '
      + '!ff F5q.:5 E5e:4 D5q:3 F5q:5 | E5h:4 C5h:2 | D5q:4 C5:3 B4h:2 | A4w:1',
    lh: '!mf A2e:5 A3:1 A2 A3 A2 A3 A2 A3 | F2e:5 F3:1 F2 F3 F2 F3 F2 F3 | G2e:5 G3:1 G2 G3 G2 G3 G2 G3 | E2e:5 E3:1 E2 E3 E2 E3 E2 E3 | A2e:5 A3:1 A2 A3 A2 A3 A2 A3 | F2e:5 F3:1 F2 F3 F2 F3 F2 F3 | D2e:5 D3:1 D2 D3 D2 D3 D2 D3 | E2e:5 E3:1 E2 E3 E2 E3 E2 E3 | !f F2e:5 F3:1 F2 F3 F2 F3 F2 F3 | G2e:5 G3:1 G2 G3 G2 G3 G2 G3 | A2e:5 A3:1 A2 A3 A2 A3 A2 A3 | A2e:5 A3:1 A2 A3 A2 A3 A2 A3 | !ff D2e:5 D3:1 D2 D3 D2 D3 D2 D3 | A2e:5 A3:1 A2 A3 A2 A3 A2 A3 | D2e:5 D3:1 D2 D3 E2e:5 E3:1 E2 E3 | A2+E3+A3w:521',
  },
];
