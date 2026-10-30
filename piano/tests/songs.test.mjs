// Every song in the catalog and every voice in the course: builds, bars line up, hands agree,
// notes fit a 61-key keyboard (C2–C7, MIDI 36–96), chord charts parse, the band generates
// sane events.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildScore, parseVoice, KEY_SIGS, noteName } from '../js/theory.js';
import { parseChord, chartSegments, generateBacking } from '../js/backing.js';
import { catalog, COLLECTIONS } from '../js/catalog.js';
import { LESSONS } from '../js/curriculum.js';
import { SONGS as LIBRARY } from '../js/library.js';
import { SONGS_FOLK } from '../js/songs-folk.js';
import { SONGS_CLASSICAL } from '../js/songs-classical.js';
import { SONGS_EPIC } from '../js/songs-epic.js';
import { SONGS_ROCK } from '../js/songs-rock.js';

const EPS = 1e-6;
const LOW = 36, HIGH = 96; // C2..C7
const INSTRUMENTS = new Set(['bass', 'pad', 'choir', 'pluck']);
const DRUMS = new Set(['kick', 'snare', 'hat', 'openhat', 'crash', 'tomlo', 'tomhi', 'rim', 'clap']);
const STYLES = ['folk', 'classical', 'march', 'waltz', 'rock', 'shanty', 'ballad', 'epic', 'chant', 'rag', 'swing', 'blues', 'none'];

/** Problems with one rh/lh definition (a song or a lesson step). */
function voiceProblems(def) {
  const out = [];
  const time = def.time || [4, 4];
  const bpb = (time[0] * 4) / time[1];
  const pickup = def.pickup || 0;
  const lens = {};
  for (const h of ['rh', 'lh']) {
    if (!def[h]) continue;
    let v;
    try { v = parseVoice(def[h], h === 'rh' ? 'R' : 'L'); } catch (e) { out.push(`${h}: ${e.message}`); continue; }
    lens[h] = v.length;
    v.bars.forEach((b, i) => {
      const want = pickup + (pickup ? i : i + 1) * bpb;
      if (Math.abs(b - want) > EPS) out.push(`${h}: bar line ${i + 1} at beat ${b}, expected ${want}`);
    });
    const bars = (v.length - pickup) / bpb;
    if (Math.abs(bars - Math.round(bars)) > EPS) out.push(`${h}: ends mid-bar (${v.length} beats, ${bpb} per bar, pickup ${pickup})`);
    for (const e of v.events) {
      if (!(e.d > 0)) out.push(`${h}: non-positive duration at beat ${e.t}`);
      if (e.tieTo && e.tieTo.midi !== e.midi) out.push(`${h}: tie between different pitches at beat ${e.t}`);
      if (e.finger !== undefined && !(e.finger >= 1 && e.finger <= 5)) out.push(`${h}: finger ${e.finger} at beat ${e.t}`);
    }
  }
  if (lens.rh !== undefined && lens.lh !== undefined && Math.abs(lens.rh - lens.lh) > EPS) out.push(`hands differ: rh ${lens.rh} beats, lh ${lens.lh}`);
  return out;
}

function rangeOf(score) {
  const ms = score.notes.map((n) => n.midi);
  return ms.length ? [Math.min(...ms), Math.max(...ms)] : null;
}

describe('song catalog', () => {
  test('no duplicate ids inside any one song file', () => {
    for (const [name, list] of Object.entries({ LIBRARY, SONGS_FOLK, SONGS_CLASSICAL, SONGS_EPIC, SONGS_ROCK })) {
      const seen = new Set();
      for (const s of list) {
        assert.ok(!seen.has(s.id), `${name} lists "${s.id}" twice`);
        seen.add(s.id);
      }
    }
    const ids = catalog.songs.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('every collection on the Songs page has songs', () => {
    for (const c of COLLECTIONS) assert.ok(catalog.songs.some((s) => (s.tags || []).includes(c.id)), `collection ${c.id} is empty`);
  });

  for (const song of catalog.songs) {
    describe(song.id, () => {
      test('metadata and build', () => {
        for (const k of ['id', 'title', 'composer', 'rh']) assert.ok(song[k], `missing ${k}`);
        assert.ok(Number.isFinite(song.level), 'level');
        assert.ok(song.key in KEY_SIGS, `key "${song.key}" is not in KEY_SIGS (would silently fall back to C)`);
        assert.ok(song.tempo > 20 && song.tempo < 300, `tempo ${song.tempo}`);
        assert.ok(!song.style || STYLES.includes(song.style), `style ${song.style}`);
        const s = buildScore(song);
        assert.ok(s.notes.length > 0);
        assert.ok(s.hands.R, 'every song has a right-hand part (songPath and the games rely on it)');
      });

      test('bars and hands line up', () => {
        assert.deepEqual(voiceProblems(song), []);
      });

      test(`notes fit a 61-key keyboard (${LOW}–${HIGH})`, () => {
        const [lo, hi] = rangeOf(buildScore(song));
        assert.ok(lo >= LOW && hi <= HIGH, `range ${noteName(lo, { octave: true })}–${noteName(hi, { octave: true })} (${lo}–${hi})`);
      });

      if (song.chords) {
        test('chord chart parses and matches the music', () => {
          const score = buildScore(song);
          const bars = song.chords.split('|').map((b) => b.trim()).filter(Boolean);
          const want = Math.round((score.length - score.pickup) / score.bpb);
          assert.equal(bars.length, want, `chart has ${bars.length} bars, music has ${want}`);
          bars.forEach((bar, i) => {
            const toks = bar.split(/\s+/);
            for (const tok of toks) {
              const [sym, beats] = tok.split(':');
              assert.ok(sym === 'N.C.' || parseChord(sym), `bar ${i + 1}: chord "${sym}" does not parse`);
              if (beats !== undefined) assert.ok(+beats > 0, `bar ${i + 1}: "${tok}" beats`);
            }
            const fixed = toks.reduce((a, t) => a + (+(t.split(':')[1]) || 0), 0);
            const free = toks.filter((t) => !t.includes(':')).length;
            assert.ok(fixed <= score.bpb + EPS && (free || Math.abs(fixed - score.bpb) < EPS), `bar ${i + 1} "${bar}" fills ${fixed} of ${score.bpb} beats`);
          });
          const segs = chartSegments(score);
          for (const s of segs) assert.ok(s.d > 0 && Number.isFinite(s.t));
        });

        test('backing band events are well formed', () => {
          const score = buildScore(song);
          const ev = generateBacking(score);
          if (song.style !== 'none') assert.ok(ev.length > 0, 'a song with a chart gets a band');
          let prev = -Infinity;
          for (const e of ev) {
            assert.ok(Number.isFinite(e.t) && e.t >= -EPS && e.t < score.length, `event time ${e.t} outside 0..${score.length}`);
            assert.ok(e.t >= prev - EPS, 'sorted by time');
            prev = e.t;
            assert.ok(Number.isFinite(e.vel) && e.vel > 0 && e.vel <= 1, `velocity ${e.vel}`);
            if (e.drum) assert.ok(DRUMS.has(e.drum), `drum ${e.drum}`);
            else {
              assert.ok(INSTRUMENTS.has(e.instrument), `instrument ${e.instrument}`);
              assert.ok(Number.isInteger(e.midi) && e.midi >= 24 && e.midi <= 100, `band note ${e.midi}`);
              assert.ok(Number.isFinite(e.d) && e.d > 0, `duration ${e.d}`);
            }
          }
        });
      }
    });
  }
});

describe('backing band styles', () => {
  // one chart, every style and the meters the songs use, so every branch of the generator runs
  const base = { rh: 'C4h E4h | F4h G4h | A4h F4h | G4w', chords: 'C | F | Am F:2 | G7', tempo: 100 };
  for (const style of STYLES) {
    for (const [time, rh, chords] of [
      [[4, 4], base.rh, base.chords],
      [[3, 4], 'C4h. | F4h. | A4h. | G4h.', 'C | F | Am | G7'],
      [[6, 8], 'C4h. | F4h. | A4h. | G4h.', 'C | F | Am | G7'],
      [[2, 2], base.rh, base.chords],
      [[12, 8], 'C4w. | G4w.', 'C | G'],
    ]) {
      test(`${style} in ${time.join('/')}`, () => {
        const score = buildScore({ ...base, rh, chords, time, style });
        const ev = generateBacking(score, { style });
        if (style === 'none') { assert.equal(ev.length, 0); return; }
        for (const e of ev) {
          assert.ok(Number.isFinite(e.t) && e.t >= 0 && e.t < score.length);
          if (e.drum) assert.ok(DRUMS.has(e.drum), e.drum);
          else { assert.ok(INSTRUMENTS.has(e.instrument), e.instrument); assert.ok(Number.isFinite(e.midi) && Number.isFinite(e.d)); }
        }
      });
    }
  }

  test('parseChord: qualities, accidentals and slash bass', () => {
    assert.deepEqual(parseChord('C'), { root: 0, bass: 0, ivs: [0, 4, 7], minor: false, sym: 'C' });
    assert.equal(parseChord('F#m').root, 6);
    assert.equal(parseChord('F#m').minor, true);
    assert.equal(parseChord('Bb7').root, 10);
    assert.deepEqual(parseChord('Bbmaj7').ivs, [0, 4, 7, 11]);
    assert.deepEqual(parseChord('Bm7b5').ivs, [0, 3, 6, 10]);
    assert.equal(parseChord('C/E').bass, 4);
    assert.equal(parseChord('Am/G').bass, 7);
    assert.equal(parseChord('E5').ivs.length, 2);
    assert.equal(parseChord('H'), null);
    assert.equal(parseChord('Cmaj9'), null);
  });

  test('chartSegments: free chords share what is left of the bar; pickup offsets the chart', () => {
    const score = buildScore({ rh: 'G4q | C5w | C5w', pickup: 1, chords: 'C G:1 | N.C.' });
    assert.deepEqual(chartSegments(score).map((s) => [s.t, s.d, s.chord?.sym ?? null]), [[1, 3, 'C'], [4, 1, 'G'], [5, 4, null]]);
  });
});

describe('course voices', () => {
  for (const l of LESSONS) {
    l.steps.forEach((st, i) => {
      if (!st.rh && !st.lh) return;
      test(`${l.id} step ${i + 1} (${st.type})`, () => {
        assert.deepEqual(voiceProblems({ ...st, time: st.time || [4, 4] }), []);
        if (st.key) assert.ok(st.key in KEY_SIGS, `key ${st.key}`);
        const s = buildScore({ rh: st.rh, lh: st.lh, key: st.key, time: st.time || [4, 4] });
        const [lo, hi] = rangeOf(s);
        assert.ok(lo >= LOW && hi <= HIGH, `range ${lo}–${hi}`);
      });
    });
  }
});
