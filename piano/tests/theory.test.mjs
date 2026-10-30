// theory.js: voice parser, score builder, spelling and note names.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVoice, buildScore, spell, noteName, parsePitch, keySigMap, KEY_SIGS, LETTERS, pc, groupSteps, describeNotes,
} from '../js/theory.js';

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

describe('parsePitch', () => {
  test('naturals, accidentals and octaves', () => {
    assert.equal(parsePitch('C4'), 60);
    assert.equal(parsePitch('A4'), 69);
    assert.equal(parsePitch('C#4'), 61);
    assert.equal(parsePitch('Db4'), 61);
    assert.equal(parsePitch('B♭3'), 58);
    assert.equal(parsePitch('A0'), 21);
    assert.equal(parsePitch('C8'), 108);
    assert.equal(parsePitch('C-1'), 0);
  });
  test('rejects junk', () => {
    assert.throws(() => parsePitch('H4'));
    assert.throws(() => parsePitch('C'));
    assert.throws(() => parsePitch('C##4'));
  });
});

describe('parseVoice', () => {
  test('every duration letter, with start times and total length', () => {
    const v = parseVoice('C4w D4h E4q F4e G4s');
    assert.deepEqual(v.events.map((e) => e.d), [4, 2, 1, 0.5, 0.25]);
    assert.deepEqual(v.events.map((e) => e.t), [0, 4, 6, 7, 7.5]);
    assert.equal(v.length, 7.75);
    assert.deepEqual(v.events.map((e) => e.midi), [60, 62, 64, 65, 67]);
  });

  test('dotted durations', () => {
    const v = parseVoice('C4q. D4e E4h. F4e. G4s');
    assert.deepEqual(v.events.map((e) => e.d), [1.5, 0.5, 3, 0.75, 0.25]);
    assert.equal(v.length, 6);
  });

  test('a duration carries forward to the following notes, dots included', () => {
    assert.deepEqual(parseVoice('C4e D4 E4 F4q G4').events.map((e) => e.d), [0.5, 0.5, 0.5, 1, 1]);
    assert.deepEqual(parseVoice('C4q. D4 E4e').events.map((e) => e.d), [1.5, 1.5, 0.5]);
    // the first note defaults to a quarter
    assert.equal(parseVoice('C4 D4').events[0].d, 1);
  });

  test('a bare dot dots the carried note value once, never twice', () => {
    assert.deepEqual(parseVoice('C4q D4.').events.map((e) => e.d), [1, 1.5]);
    // after a dotted quarter, "D4." is still a dotted quarter, not a double-dotted 2.25 beats
    assert.deepEqual(parseVoice('C4q. D4.').events.map((e) => e.d), [1.5, 1.5]);
    assert.deepEqual(parseVoice('C4h. D4. E4q').events.map((e) => e.d), [3, 3, 1]);
  });

  test('rests take time but are not notes', () => {
    const v = parseVoice('C4q rq rh E4w');
    assert.deepEqual(v.events.map((e) => [e.t, e.d, !!e.rest]), [[0, 1, false], [1, 1, true], [2, 2, true], [4, 4, false]]);
    assert.equal(v.length, 8);
    const s = buildScore({ rh: 'C4q rq rh E4w' });
    assert.deepEqual(s.notes.map((n) => n.midi), [60, 64]);
  });

  test('chords are sorted low to high and fingerings follow that order', () => {
    const v = parseVoice('E4+C4+G4h:135 D4q:2');
    assert.deepEqual(v.events.map((e) => [e.t, e.midi, e.finger, e.d]), [[0, 60, 1, 2], [0, 64, 3, 2], [0, 67, 5, 2], [2, 62, 2, 1]]);
    assert.equal(v.length, 3);
  });

  test('a chord with fewer finger digits leaves the rest unfingered', () => {
    const v = parseVoice('C3+G3w:5');
    assert.deepEqual(v.events.map((e) => e.finger), [5, undefined]);
  });

  test('ties: the continuation is held, not replayed, and rings for the whole value', () => {
    const v = parseVoice('C4h~ C4q D4q');
    const [a, b, c] = v.events;
    assert.equal(a.tieTo, b);
    assert.equal(b.tiedFrom, a);
    assert.equal(a.sd, 3);
    assert.equal(b.sd, undefined);
    assert.equal(c.sd, 1);
    const s = buildScore({ rh: 'C4h~ C4q D4q' });
    assert.deepEqual(s.notes.map((n) => [n.t, n.midi]), [[0, 60], [3, 62]]);
    assert.equal(s.events.length, 3);
  });

  test('ties across a bar line and chains of ties', () => {
    const v = parseVoice('C4h. D4q~ | D4w');
    assert.deepEqual(v.bars, [4]);
    const d1 = v.events[1], d2 = v.events[2];
    assert.equal(d1.tieTo, d2);
    assert.equal(d1.sd, 5);
    const chain = parseVoice('C4q~ C4h~ | C4q E4q');
    assert.equal(chain.events[0].sd, 4);
    assert.equal(chain.events[1].tiedFrom, chain.events[0]);
    assert.equal(chain.events[2].tiedFrom, chain.events[1]);
  });

  test('a dynamic mark between tied notes keeps the tie', () => {
    const v = parseVoice('C4h~ !p C4h');
    assert.equal(v.events[0].tieTo, v.events[1]);
  });

  test('in a chord only the matching pitch is tied', () => {
    const v = parseVoice('C4+E4h~ C4+G4h');
    const [c1, e1, c2, g2] = v.events;
    assert.equal(c1.tieTo, c2);
    assert.equal(e1.tieTo, undefined);
    assert.equal(e1.sd, 2);
    assert.equal(g2.tiedFrom, undefined);
    assert.equal(c1.sd, 4);
  });

  test('a tie to a different pitch, or into a rest, is dropped', () => {
    const v = parseVoice('C4h~ D4h');
    assert.equal(v.events[0].tieTo, undefined);
    assert.equal(v.events[1].tiedFrom, undefined);
    const r = parseVoice('C4h~ rh C4h');
    assert.equal(r.events[0].tieTo, undefined);
    assert.equal(r.events[2].tiedFrom, undefined);
  });

  test('dynamics mark the notes that follow and are listed as marks', () => {
    const v = parseVoice('!p C4q D4 !f E4 F4', 'L');
    assert.deepEqual(v.events.map((e) => e.dyn), ['p', 'p', 'f', 'f']);
    assert.deepEqual(v.marks, [{ t: 0, hand: 'L', dyn: 'p' }, { t: 2, hand: 'L', dyn: 'f' }]);
    assert.equal(parseVoice('C4q').events[0].dyn, null);
  });

  test('bar checks record the beat of every bar line', () => {
    const v = parseVoice('C4q D4 E4 F4 | G4w | A4h B4h |');
    assert.deepEqual(v.bars, [4, 8, 12]);
  });

  test('startBeat offsets everything; hand is stamped on each event', () => {
    const v = parseVoice('C4q D4', 'L', 2);
    assert.deepEqual(v.events.map((e) => [e.t, e.hand]), [[2, 'L'], [3, 'L']]);
    assert.equal(v.length, 4);
  });

  test('accidentals in the voice set the preferred spelling', () => {
    const v = parseVoice('Bb3q C#4 D4');
    assert.deepEqual(v.events.map((e) => [e.midi, e.prefer]), [[58, 'flat'], [61, 'sharp'], [62, undefined]]);
  });

  test('extra whitespace is fine; bad tokens throw with the token in the message', () => {
    assert.equal(parseVoice('  C4q   D4  \n E4 ').events.length, 3);
    assert.throws(() => parseVoice('C4q H4'), /H4/);
    assert.throws(() => parseVoice('C4x'), /C4x/);
    assert.throws(() => parseVoice('C4q:'), /C4q:/);
    assert.throws(() => parseVoice('!loud C4'), /!loud/);
  });
});

describe('buildScore', () => {
  test('defaults: 4/4, C, 90 bpm, no pickup', () => {
    const s = buildScore({ rh: 'C4w | D4w' });
    assert.equal(s.bpb, 4);
    assert.equal(s.key, 'C');
    assert.equal(s.tempo, 90);
    assert.equal(s.pickup, 0);
    assert.deepEqual(s.time, [4, 4]);
    assert.deepEqual(s.barlines, [4]);
    assert.equal(s.length, 8);
  });

  test('beats per bar for simple and compound meters', () => {
    const bpb = (time) => buildScore({ rh: 'C4q', time }).bpb;
    assert.equal(bpb([3, 4]), 3);
    assert.equal(bpb([2, 4]), 2);
    assert.equal(bpb([2, 2]), 4);
    assert.equal(bpb([6, 8]), 3);
    assert.equal(bpb([3, 8]), 1.5);
    assert.equal(bpb([12, 8]), 6);
    assert.equal(bpb([15, 8]), 7.5);
  });

  test('a pickup moves every bar line', () => {
    const s = buildScore({ rh: 'G4q | C5h E5h | G5w', pickup: 1 });
    assert.deepEqual(s.barlines, [1, 5]);
    assert.equal(s.length, 9);
    assert.equal(s.pickup, 1);
  });

  test('3/4 bar lines, and no bar line at the very end', () => {
    const s = buildScore({ rh: 'C4h. | D4h. | E4h.', time: [3, 4] });
    assert.deepEqual(s.barlines, [3, 6]);
  });

  test('both hands are merged, sorted by time then pitch, and indexed', () => {
    const s = buildScore({ rh: 'E4q G4q', lh: 'C3h' });
    assert.deepEqual(s.events.map((e) => [e.t, e.midi, e.hand]), [[0, 48, 'L'], [0, 64, 'R'], [1, 67, 'R']]);
    s.events.forEach((e, i) => assert.equal(e.i, i));
    assert.deepEqual(s.hands, { R: true, L: true });
    assert.equal(s.length, 2);
  });

  test('hands only counts real notes, not rests', () => {
    const s = buildScore({ rh: 'C4w', lh: 'rw' });
    assert.deepEqual(s.hands, { R: true, L: false });
    assert.deepEqual(buildScore({ lh: 'C3w' }).hands, { R: false, L: true });
  });

  test('marks from both hands and the chord chart are kept', () => {
    const s = buildScore({ rh: '!f C4w', lh: '!p C3w', chords: 'C', style: 'rock' });
    assert.equal(s.marks.length, 2);
    assert.equal(s.chords, 'C');
    assert.equal(s.style, 'rock');
  });
});

describe('groupSteps and describeNotes', () => {
  test('groupSteps groups notes that start together', () => {
    const s = buildScore({ rh: 'E4q G4q', lh: 'C3h' });
    assert.deepEqual(groupSteps(s.notes).map((g) => [g.t, g.notes.map((n) => n.midi)]), [[0, [48, 64]], [1, [67]]]);
  });
  test('describeNotes names chords, inversions and intervals', () => {
    assert.equal(describeNotes([60, 64, 67]).title, 'C');
    assert.equal(describeNotes([57, 60, 64]).title, 'Am');
    assert.equal(describeNotes([64, 67, 72]).title, 'C/E');
    assert.equal(describeNotes([60, 67]).title, 'perfect 5th');
    assert.equal(describeNotes([60]).title, 'C4');
    assert.equal(describeNotes([]), null);
  });
});

describe('key signatures and spell()', () => {
  const SIG_LETTERS = {
    C: {}, Am: {},
    G: { F: 1 }, Em: { F: 1 },
    D: { F: 1, C: 1 }, Bm: { F: 1, C: 1 },
    A: { F: 1, C: 1, G: 1 },
    E: { F: 1, C: 1, G: 1, D: 1 },
    F: { B: -1 }, Dm: { B: -1 },
    Bb: { B: -1, E: -1 }, Gm: { B: -1, E: -1 },
    Eb: { B: -1, E: -1, A: -1 }, Cm: { B: -1, E: -1, A: -1 },
  };

  test('every key in KEY_SIGS is covered here', () => {
    assert.deepEqual(Object.keys(KEY_SIGS).sort(), Object.keys(SIG_LETTERS).sort());
  });

  for (const key of Object.keys(SIG_LETTERS)) {
    test(`${key}: signature letters`, () => {
      const got = Object.fromEntries(Object.entries(keySigMap(key)).map(([l, a]) => [LETTERS[l], a]));
      assert.deepEqual(got, SIG_LETTERS[key]);
    });

    test(`${key}: scale notes need no accidental, other notes always get one`, () => {
      const minor = key.endsWith('m');
      const tonicName = minor ? key.slice(0, -1) : key;
      const tonicLetter = LETTERS.indexOf(tonicName[0]);
      const tonic = 60 + LETTER_PC[tonicLetter] + (tonicName[1] === 'b' ? -1 : tonicName[1] === '#' ? 1 : 0);
      const steps = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      const scalePcs = new Set(steps.map((s) => pc(tonic + s)));
      steps.forEach((s, deg) => {
        const sp = spell(tonic + s, key);
        assert.equal(sp.letter, (tonicLetter + deg) % 7, `${key} degree ${deg + 1} letter`);
        assert.equal(sp.accidental, null, `${key} degree ${deg + 1} should take no accidental`);
      });
      for (let m = 60; m < 72; m++) {
        const sp = spell(m, key);
        assert.equal(pc(LETTER_PC[sp.letter] + sp.alter), pc(m), `${key} ${m} spelled ${sp.name} sounds right`);
        assert.ok(Math.abs(sp.alter) <= 1, `${key} ${m} no double accidentals`);
        if (!scalePcs.has(pc(m))) assert.notEqual(sp.accidental, null, `${key} ${m} (${sp.name}) needs an accidental`);
      }
    });
  }

  test('naturals cancel the key signature', () => {
    assert.deepEqual([spell(65, 'G').name, spell(65, 'G').accidental], ['F', 0]);
    assert.deepEqual([spell(71, 'F').name, spell(71, 'F').accidental], ['B', 0]);
    assert.deepEqual([spell(69, 'Eb').name, spell(69, 'Eb').accidental], ['A', 0]);
  });

  test('outside a signature: sharps in sharp keys, flats in flat keys, unless asked', () => {
    assert.equal(spell(61, 'C').name, 'C♯');
    assert.equal(spell(61, 'C', 'flat').name, 'D♭');
    assert.equal(spell(70, 'C').name, 'A♯');
    assert.equal(spell(70, 'C', 'flat').name, 'B♭');
    assert.equal(spell(68, 'G').name, 'G♯');
    assert.equal(spell(68, 'F').name, 'A♭');
    assert.equal(spell(63, 'Bb', 'sharp').name, 'E♭', 'the key signature wins over a preference');
    assert.equal(spell(66, 'G', 'flat').name, 'F♯', 'the key signature wins over a preference');
  });

  test('minor keys spell the raised seventh (leading tone) as a sharp or natural', () => {
    // harmonic minor: the leading tone is the 7th letter raised, never the flattened tonic
    assert.equal(spell(61, 'Dm').name, 'C♯');
    assert.equal(spell(61, 'Dm').accidental, 1);
    assert.equal(spell(66, 'Gm').name, 'F♯');
    assert.equal(spell(71, 'Cm').name, 'B');
    assert.equal(spell(71, 'Cm').accidental, 0);
    assert.equal(spell(68, 'Am').name, 'G♯');
    assert.equal(spell(63, 'Em').name, 'D♯');
    assert.equal(spell(70, 'Bm').name, 'A♯');
    // an explicit flat in the music is still respected
    assert.equal(spell(61, 'Dm', 'flat').name, 'D♭');
    // other chromatic notes in flat minor keys still lean flat
    assert.equal(spell(68, 'Dm').name, 'A♭');
  });

  test('octave and staff step', () => {
    assert.deepEqual([spell(60).octave, spell(60).step], [4, 28]);
    assert.deepEqual([spell(59).octave, spell(59).step], [3, 27]);
    assert.deepEqual([spell(72).octave, spell(72).step], [5, 35]);
    assert.equal(spell(61, 'C', 'flat').step, 29, 'D♭ sits on the D line/space');
    assert.equal(spell(61, 'C', 'sharp').step, 28, 'C♯ sits on the C line/space');
  });
});

describe('noteName', () => {
  test('names with and without octave', () => {
    assert.equal(noteName(60), 'C');
    assert.equal(noteName(61), 'C♯');
    assert.equal(noteName(61, { prefer: 'flat' }), 'D♭');
    assert.equal(noteName(60, { octave: true }), 'C4');
    assert.equal(noteName(70, { octave: true, prefer: 'flat' }), 'B♭4');
    assert.equal(noteName(21, { octave: true }), 'A0');
    assert.equal(noteName(108, { octave: true }), 'C8');
    assert.equal(noteName(36, { octave: true }), 'C2');
    assert.equal(noteName(96, { octave: true }), 'C7');
  });
});
