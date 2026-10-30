// Content rules that every song and lesson piece must keep (from the content audit).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildScore, pc } from '../js/theory.js';
import { chartSegments } from '../js/backing.js';
import { catalog } from '../js/catalog.js';
import { LESSONS } from '../js/curriculum.js';

const N = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m) => `${N[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** Places where both hands need the same key at once (struck together, or struck while the other holds it). */
function sharedKeys(s) {
  const out = [];
  const R = s.notes.filter((n) => n.hand === 'R'), L = s.notes.filter((n) => n.hand === 'L');
  for (const r of R) for (const l of L) {
    if (r.midi !== l.midi) continue;
    const re = r.t + (r.sd ?? r.d), le = l.t + (l.sd ?? l.d);
    if (Math.abs(r.t - l.t) < 1e-6 || (l.t > r.t && l.t < re - 1e-6) || (r.t > l.t && r.t < le - 1e-6)) out.push(`${nm(r.midi)} at beat ${Math.max(r.t, l.t)}`);
  }
  return out;
}

/** Fingerings a hand can't play: chord fingers out of order, or a non-thumb crossing within half a beat. */
function fingerProblems(s) {
  const out = [];
  for (const hand of ['R', 'L']) {
    const g = new Map();
    for (const e of s.events) if (!e.rest && !e.tiedFrom && e.hand === hand) (g.get(e.t) || g.set(e.t, []).get(e.t)).push(e);
    let prev = null;
    for (const [t, ns] of [...g.entries()].sort((a, b) => a[0] - b[0])) {
      ns.sort((a, b) => a.midi - b.midi);
      const f = ns.map((n) => n.finger);
      if (ns.length > 1 && f.every(Boolean)) {
        for (let i = 1; i < ns.length; i++) if (hand === 'R' ? f[i] <= f[i - 1] : f[i] >= f[i - 1]) { out.push(`${hand} chord fingers ${f.join('')} at beat ${t}`); break; }
      }
      if (prev && ns.length === 1 && prev[1].length === 1) {
        const a = prev[1][0], b = ns[0], dt = t - prev[0];
        if (a.finger && b.finger && a.finger !== b.finger && a.midi !== b.midi && dt <= 0.5) {
          const up = b.midi > a.midi;
          const cross = hand === 'R' ? (up && b.finger < a.finger && b.finger !== 1) || (!up && b.finger > a.finger && a.finger !== 1)
            : (up && b.finger > a.finger && a.finger !== 1) || (!up && b.finger < a.finger && b.finger !== 1);
          // a pattern that restarts on a downbeat (stride or boogie bass) is a deliberate hand shift
          const pos = (t - (s.pickup || 0)) / s.bpb;
          if (cross && Math.abs(pos - Math.round(pos)) > 1e-6) out.push(`${hand} ${nm(a.midi)}:${a.finger} -> ${nm(b.midi)}:${b.finger} at beat ${t}`);
        }
      }
      prev = [t, ns];
    }
  }
  return out;
}

const pieces = [
  ...catalog.songs.map((def) => [def.id, buildScore(def)]),
  ...LESSONS.flatMap((l) => l.steps.map((st, i) => [`${l.id} step ${i + 1}`, st]).filter(([, st]) => st.rh || st.lh)
    .map(([id, st]) => [id, buildScore({ rh: st.rh, lh: st.lh, time: st.time })])),
];

describe('every song and lesson piece', () => {
  test('never needs the same key in both hands at once', () => {
    const bad = pieces.flatMap(([id, s]) => sharedKeys(s).map((x) => `${id}: ${x}`));
    assert.deepEqual(bad, []);
  });
  test('has playable finger numbers', () => {
    const bad = pieces.flatMap(([id, s]) => fingerProblems(s).map((x) => `${id}: ${x}`));
    assert.deepEqual(bad, []);
  });
});

describe('checked against the composers’ scores', () => {
  test('Ride of the Valkyries: the bar 7 chord holds the melody’s A natural', () => {
    const s = buildScore(catalog.song('ride-of-the-valkyries'));
    const seg = chartSegments(s).find((x) => x.t <= 6 * s.bpb + 1e-6 && x.t + x.d > 6 * s.bpb);
    assert.ok(seg.chord.ivs.map((iv) => pc(seg.chord.root + iv)).includes(9), seg.chord.sym);
  });
  test('lesson c7-6 plays the same Mountain King figures as the song (D# B D#, then D Bb D)', () => {
    const l = LESSONS.find((x) => x.id === 'c7-6');
    const fig = buildScore({ rh: l.steps[1].rh }).notes.map((n) => nm(n.midi + 12));
    const song = buildScore(catalog.song('hall-of-the-mountain-king')).notes.filter((n) => n.hand === 'R' && n.t < 8).map((n) => nm(n.midi));
    assert.deepEqual(fig, song);
  });
  test('Korobeiniki is the folk melody, not the 1989 video-game variant', () => {
    const first = buildScore(catalog.song('korobeiniki')).notes.filter((n) => n.hand === 'R').slice(0, 5).map((n) => n.midi);
    assert.deepEqual(first, [64, 68, 71, 68, 64]); // E G# B G# E, where the game variant opens E B C D
  });
});
