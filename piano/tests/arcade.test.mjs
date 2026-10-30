// arcade.js helpers: melodyOf / phrasesOf over every song and hand, the Hall of Fame.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { melodyOf, phrasesOf, addFame, fameList, songBar } from '../js/arcade.js';
import { buildScore } from '../js/theory.js';
import { catalog } from '../js/catalog.js';

const MIN = 3, MAX = 8;

describe('melodyOf', () => {
  test('top note of right-hand chords, bottom of left-hand ones; ties skipped; sounding length', () => {
    const s = buildScore({ rh: 'C4+E4+G4q:135 D4h~ D4q', lh: 'C3+G3w' });
    assert.deepEqual(melodyOf(s, 'R').map((n) => [n.t, n.midi, n.d, n.finger]), [[0, 67, 1, 5], [1, 62, 3, undefined]]);
    assert.deepEqual(melodyOf(s, 'L').map((n) => [n.t, n.midi]), [[0, 48]]);
  });
  test('bar range is inclusive and counts a pickup as bar 0', () => {
    const s = buildScore({ rh: 'G4q | C5q D5 E5 F5 | G5w | A5w', pickup: 1 });
    assert.deepEqual(melodyOf(s, 'R', { fromBar: 1, toBar: 2 }).map((n) => n.midi), [72, 74, 76, 77, 79]);
    assert.equal(songBar(s, 0), 0);
    assert.equal(songBar(s, 5), 2);
  });
});

describe('phrasesOf over every song and hand', () => {
  for (const song of catalog.songs) {
    const score = buildScore(song);
    for (const hand of ['R', 'L']) {
      if (!score.hands[hand]) continue;
      test(`${song.id} ${hand}`, () => {
        const line = melodyOf(score, hand);
        const ph = phrasesOf(score, hand, { min: MIN, max: MAX });
        assert.ok(ph.length > 0);
        // every note of the line exactly once, in order
        const flat = ph.flatMap((p) => p.notes);
        assert.deepEqual(flat.map((n) => [n.t, n.midi]), line.map((n) => [n.t, n.midi]));
        const perBar = new Map();
        for (const n of line) perBar.set(n.bar, (perBar.get(n.bar) || 0) + 1);
        ph.forEach((p, i) => {
          const last = i === ph.length - 1;
          const label = `phrase ${i + 1} (bars ${p.fromBar}-${p.toBar}, ${p.notes.length} notes)`;
          assert.ok(p.notes.length >= 1, label);
          assert.ok(p.fromBar <= p.toBar, label);
          for (const n of p.notes) assert.ok(n.bar >= p.fromBar && n.bar <= p.toBar, `${label}: note in bar ${n.bar}`);
          if (i > 0) assert.ok(p.fromBar >= ph[i - 1].toBar, `${label} starts before the previous phrase ends`);
          // documented exceptions to max: half of a very busy bar, and a short last phrase folded in (max + 2)
          const busyHalf = p.fromBar === p.toBar && perBar.get(p.fromBar) > MAX;
          if (busyHalf) assert.ok(p.notes.length <= Math.ceil(perBar.get(p.fromBar) / 2), label);
          else assert.ok(p.notes.length <= (last ? MAX + 2 : MAX), label);
          // below min only when the phrase already covers two bars with notes, the next bar would
          // overflow it, or it is the last phrase
          if (p.notes.length < MIN && !last && !busyHalf) {
            const barsWithNotes = new Set(p.notes.map((n) => n.bar)).size;
            const next = ph[i + 1];
            const nextFirstBar = next.notes.filter((n) => n.bar === next.fromBar).length;
            assert.ok(barsWithNotes >= 2 || p.notes.length + nextFirstBar > MAX || perBar.get(next.fromBar) > MAX, label);
          }
          // whole bars: a phrase never splits a bar except a busy one
          if (!busyHalf && i > 0 && ph[i - 1].toBar === p.fromBar) {
            const prevBusy = ph[i - 1].fromBar === ph[i - 1].toBar && perBar.get(ph[i - 1].fromBar) > MAX;
            assert.ok(prevBusy, `${label} shares bar ${p.fromBar} with the phrase before`);
          }
        });
      });
    }
  }

  test('a bar range limits the phrases', () => {
    const score = buildScore(catalog.song('ode-to-joy'));
    const ph = phrasesOf(score, 'R', { fromBar: 4, toBar: 7 });
    assert.ok(ph.length > 0);
    for (const p of ph) assert.ok(p.fromBar >= 4 && p.toBar <= 7);
    assert.equal(ph.flatMap((p) => p.notes).length, melodyOf(score, 'R', { fromBar: 4, toBar: 7 }).length);
  });

  test('a very busy bar is cut in half', () => {
    const score = buildScore({ rh: 'C4s D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6 D6' });
    const ph = phrasesOf(score, 'R');
    assert.deepEqual(ph.map((p) => p.notes.length), [8, 8]);
  });

  test('an empty hand gives no phrases', () => {
    assert.deepEqual(phrasesOf(buildScore({ rh: 'C4w' }), 'L'), []);
  });
});

describe('Hall of Fame', () => {
  function store(name = 'Rio', id = 'p1') {
    return { root: {}, profile: { name, id }, saves: 0, save() { this.saves++; } };
  }

  test('keeps the ten best, sorted high to low, and returns the rank', () => {
    const st = store();
    const ranks = [];
    for (const score of [50, 10, 90, 30, 70, 20, 80, 60, 40, 100, 5, 95]) ranks.push(addFame(st, 'ducks', { score }));
    const list = fameList(st, 'ducks');
    assert.equal(list.length, 10);
    assert.deepEqual(list.map((e) => e.score), [100, 95, 90, 80, 70, 60, 50, 40, 30, 20]);
    assert.equal(ranks[0], 0, 'first score is top');
    assert.equal(ranks[9], 0, '100 takes the top spot');
    assert.equal(ranks[10], -1, '5 does not make the table');
    assert.equal(ranks[11], 1, '95 comes in second');
    assert.ok(list.every((e) => e.name === 'Rio' && e.pid === 'p1' && e.at));
    assert.equal(st.saves, 12);
  });

  test('ties keep the earlier score above the later one', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1000 });
    const st = store();
    addFame(st, 'aliens', { score: 500, level: 'L1' });
    t.mock.timers.tick(10);
    const r = addFame(st, 'aliens', { score: 500, level: 'L2' });
    assert.equal(r, 1);
    assert.deepEqual(fameList(st, 'aliens').map((e) => e.level), ['L1', 'L2']);
  });

  test('a full table rejects a score equal to the lowest one', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1000 });
    const st = store();
    for (let k = 0; k < 10; k++) { addFame(st, 'roboman', { score: 100 }); t.mock.timers.tick(1); }
    assert.equal(addFame(st, 'roboman', { score: 100 }), -1);
    assert.equal(fameList(st, 'roboman').length, 10);
  });

  test('tables are per game and shared by every profile on the device', () => {
    const st = store('Rio', 'p1');
    addFame(st, 'ducks', { score: 10 });
    st.profile = { name: 'Jonathan', id: 'p2' };
    addFame(st, 'ducks', { score: 20 });
    addFame(st, 'ripchord', { score: 5 });
    assert.deepEqual(fameList(st, 'ducks').map((e) => e.name), ['Jonathan', 'Rio']);
    assert.equal(fameList(st, 'ripchord').length, 1);
    assert.deepEqual(fameList(st, 'aliens'), []);
  });
});

describe('songHasHand', async () => {
  const { ArcadeBase } = await import('../js/arcade.js');
  const has = (def, hand) => ArcadeBase.prototype.songHasHand.call({ songDef: def }, hand);
  test('notes count; rests, bar lines and dynamics do not', () => {
    assert.equal(has({ rh: 'C4q D4', lh: '!mf rw | rw' }, 'L'), false);
    assert.equal(has({ rh: 'C4q', lh: '!p rh F#3h' }, 'L'), true);
    assert.equal(has({ rh: 'Bb4w' }, 'R'), true);
    assert.equal(has({ rh: 'C4w' }, 'L'), false);
    assert.equal(has(null, 'R'), false);
  });
  test('every song with a left hand still has one', () => {
    for (const s of catalog.songs) if (s.lh) assert.equal(has(s, 'L'), true, s.id);
  });
});
