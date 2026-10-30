// Music theory helpers: spelling, staff positions, parsing, chord names.

export const LETTERS = 'CDEFGAB';
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B (letter indices)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F

export const KEY_SIGS = { C: 0, G: 1, D: 2, A: 3, E: 4, F: -1, Bb: -2, Eb: -3, Am: 0, Em: 1, Dm: -1, Gm: -2, Cm: -3, Bm: 2 };

export const DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };

export const NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NAMES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const ROOT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const pc = (m) => ((m % 12) + 12) % 12;
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(pc(m));
export const freq = (m) => 440 * 2 ** ((m - 69) / 12);

/** letterIndex -> alteration for a key signature */
export function keySigMap(key = 'C') {
  const n = KEY_SIGS[key] ?? 0;
  const map = {};
  if (n > 0) SHARP_ORDER.slice(0, n).forEach((l) => (map[l] = 1));
  if (n < 0) FLAT_ORDER.slice(0, -n).forEach((l) => (map[l] = -1));
  return map;
}

/**
 * Spell a MIDI note in a key.
 * Returns { letter, alter, octave, step, name, accidental }
 * step is a diatonic index (C4 = 28), accidental is the sign to draw (null, 1, -1, 0 for natural).
 */
export function spell(midi, key = 'C', prefer) {
  const p = pc(midi);
  const sig = keySigMap(key);
  const flats = prefer ? prefer === 'flat' : (KEY_SIGS[key] ?? 0) < 0;
  let letter, alter;
  for (const [l, a] of Object.entries(sig)) {
    if (pc(LETTER_PC[l] + a) === p) { letter = +l; alter = a; }
  }
  // minor keys: the raised 7th (leading tone) keeps the 7th's letter, so D minor has C♯, not D♭
  if (letter === undefined && !prefer && /^[A-G][b#]?m$/.test(key)) {
    const tl = LETTERS.indexOf(key[0]);
    const tonic = LETTER_PC[tl] + (key[1] === 'b' ? -1 : key[1] === '#' ? 1 : 0);
    if (p === pc(tonic - 1)) {
      const l7 = (tl + 6) % 7;
      const a = ((p - LETTER_PC[l7] + 18) % 12) - 6;
      if (Math.abs(a) <= 1) { letter = l7; alter = a; }
    }
  }
  if (letter === undefined) {
    const nat = LETTER_PC.indexOf(p);
    if (nat >= 0) { letter = nat; alter = 0; }
    else if (flats) { letter = LETTER_PC.indexOf(pc(p + 1)); alter = -1; }
    else { letter = LETTER_PC.indexOf(pc(p - 1)); alter = 1; }
  }
  const octave = Math.floor((midi - alter) / 12) - 1;
  const sigAlter = sig[letter] || 0;
  return {
    letter, alter, octave,
    step: octave * 7 + letter,
    name: LETTERS[letter] + (alter > 0 ? '♯' : alter < 0 ? '♭' : ''),
    accidental: alter === sigAlter ? null : alter,
  };
}

export function noteName(midi, { octave = false, prefer } = {}) {
  const s = spell(midi, 'C', prefer);
  return s.name + (octave ? s.octave : '');
}

export function parsePitch(str) {
  const m = /^([A-G])([#b♯♭]?)(-?\d)$/.exec(str);
  if (!m) throw new Error(`Bad pitch "${str}"`);
  const alter = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return (+m[3] + 1) * 12 + LETTER_PC[LETTERS.indexOf(m[1])] + alter;
}

const TOKEN = /^(r|[A-G][#b]?-?\d(?:\+[A-G][#b]?-?\d)*)([whqes])?(\.)?(?::(\d+))?(~)?$/;

/**
 * Parse a voice string into events.
 *   "E4q D4 C4 D4 | E4 E4 E4h"  — durations w h q e s (+ '.'), carried forward
 *   "C3+E3+G3h"                  — chord
 *   "rq"                         — rest
 *   "E4q:3"                      — fingering (chords: one digit per note, low to high)
 * Returns { events, length, bars } where bars are beat positions of '|' marks.
 */
export const DYNAMICS = { ppp: 0.2, pp: 0.3, p: 0.42, mp: 0.55, mf: 0.68, f: 0.82, ff: 0.92, fff: 1 };
const DYN_TOKEN = /^!(ppp|pp|p|mp|mf|f|ff|fff)$/;

/**
 * Parse a voice string into events.
 *   "E4q D4 C4 D4 | E4 E4 E4h"  durations w h q e s (+ '.'), carried forward
 *   "C3+E3+G3h"                  chord
 *   "rq"                         rest
 *   "E4q:3"                      fingering (chords: one digit per note, low to high)
 *   "C4h~ C4q"                   tie: the second C is held, not replayed
 *   "!p"  "!f"                   dynamic mark for the notes that follow
 * Returns { events, length, bars, marks } where bars are beat positions of '|' marks.
 */
export function parseVoice(str, hand = 'R', startBeat = 0) {
  const events = [];
  const bars = [];
  const marks = [];
  let t = startBeat;
  let dur = 1;
  let base = 1; // the last undotted note value, so a bare '.' dots it once
  let dyn = null;
  let tieFrom = new Map(); // midi -> event that is tied forward
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') { bars.push(t); continue; }
    const dm = DYN_TOKEN.exec(tok);
    if (dm) { dyn = dm[1]; marks.push({ t, hand, dyn }); continue; }
    const m = TOKEN.exec(tok);
    if (!m) throw new Error(`Bad token "${tok}"`);
    if (m[2]) { base = DUR[m[2]]; dur = base * (m[3] ? 1.5 : 1); }
    else if (m[3]) dur = base * 1.5;
    const nextTies = new Map();
    if (m[1] === 'r') {
      events.push({ t, d: dur, rest: true, hand });
    } else {
      const parts = m[1].split('+').map((p) => ({ midi: parsePitch(p), prefer: /^[A-G]b/.test(p) ? 'flat' : /^[A-G]#/.test(p) ? 'sharp' : undefined }))
        .sort((a, b) => a.midi - b.midi);
      const fingers = m[4] ? m[4].split('').map(Number) : [];
      parts.forEach(({ midi, prefer }, i) => {
        const e = { t, d: dur, midi, hand, finger: fingers[i], dyn };
        if (prefer) e.prefer = prefer;
        const from = tieFrom.get(midi);
        if (from) { e.tiedFrom = from; from.tieTo = e; }
        if (m[5]) nextTies.set(midi, e);
        events.push(e);
      });
    }
    tieFrom = nextTies;
    t += dur;
  }
  // sounding duration: a tied note rings through its continuations
  for (const e of events) {
    if (e.rest || e.tiedFrom) continue;
    let sd = e.d, c = e.tieTo;
    while (c) { sd += c.d; c = c.tieTo; }
    e.sd = sd;
  }
  return { events, length: t, bars, marks };
}

/** Build a full score object from a song/exercise definition. */
export function buildScore(def) {
  const bpb = def.time ? (def.time[0] * 4) / def.time[1] : 4;
  const pickup = def.pickup || 0;
  const empty = { events: [], length: 0, bars: [], marks: [] };
  const rh = def.rh ? parseVoice(def.rh, 'R') : empty;
  const lh = def.lh ? parseVoice(def.lh, 'L') : empty;
  const events = [...rh.events, ...lh.events].sort((a, b) => a.t - b.t || (a.midi ?? 0) - (b.midi ?? 0));
  const length = Math.max(rh.length, lh.length);
  const barlines = [];
  for (let b = pickup > 0 ? pickup : bpb; b < length - 1e-6; b += bpb) barlines.push(b);
  events.forEach((e, i) => (e.i = i));
  return {
    id: def.id, title: def.title, key: def.key || 'C', time: def.time || [4, 4], bpb, pickup,
    tempo: def.tempo || 90, events,
    notes: events.filter((e) => !e.rest && !e.tiedFrom),
    length, barlines,
    marks: [...rh.marks, ...lh.marks],
    hands: { R: rh.events.some((e) => !e.rest), L: lh.events.some((e) => !e.rest) },
    chords: def.chords || null, style: def.style || null,
    _bars: { R: rh.bars, L: lh.bars },
  };
}

/** Group note events (optionally filtered) by start time. */
export function groupSteps(notes) {
  const steps = [];
  for (const e of notes) {
    const last = steps[steps.length - 1];
    if (last && Math.abs(last.t - e.t) < 1e-6) last.notes.push(e);
    else steps.push({ t: e.t, notes: [e] });
  }
  return steps;
}

// ---------- chord naming ----------
const CHORDS = [
  ['', 'major', [0, 4, 7]], ['m', 'minor', [0, 3, 7]], ['dim', 'diminished', [0, 3, 6]],
  ['aug', 'augmented', [0, 4, 8]], ['sus2', 'sus2', [0, 2, 7]], ['sus4', 'sus4', [0, 5, 7]],
  ['7', 'dominant 7th', [0, 4, 7, 10]], ['7', 'dominant 7th', [0, 4, 10]],
  ['maj7', 'major 7th', [0, 4, 7, 11]], ['m7', 'minor 7th', [0, 3, 7, 10]],
  ['m7♭5', 'half-diminished', [0, 3, 6, 10]], ['dim7', 'diminished 7th', [0, 3, 6, 9]],
  ['6', 'major 6th', [0, 4, 7, 9]], ['m6', 'minor 6th', [0, 3, 7, 9]],
  ['add9', 'add 9', [0, 2, 4, 7]], ['5', 'power chord', [0, 7]],
];
const INTERVALS = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'];

export function describeNotes(midis) {
  const sorted = [...midis].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return { title: noteName(sorted[0], { octave: true }), sub: 'single note' };
  const pcs = [...new Set(sorted.map(pc))];
  if (pcs.length === 1) return { title: noteName(sorted[0]), sub: 'octaves' };
  if (sorted.length === 2) {
    const iv = sorted[1] - sorted[0];
    return { title: iv > 12 ? `${INTERVALS[iv % 12]} + octave` : INTERVALS[iv], sub: 'interval' };
  }
  const bass = pc(sorted[0]);
  for (const root of [bass, ...pcs.filter((p) => p !== bass)]) {
    const set = pcs.map((p) => pc(p - root)).sort((a, b) => a - b);
    for (const [sym, long, tpl] of CHORDS) {
      if (tpl.length === set.length && tpl.every((v, i) => v === set[i])) {
        const slash = root !== bass ? `/${ROOT_NAMES[bass]}` : '';
        return { title: `${ROOT_NAMES[root]}${sym}${slash}`, sub: long + (slash ? ` over ${ROOT_NAMES[bass]}` : '') };
      }
    }
  }
  return { title: pcs.map((p) => ROOT_NAMES[p]).join(' '), sub: `${sorted.length} notes` };
}

/** Prefer flat spellings when the chord root is a "flat" name. */
export function preferFor(midis) {
  const d = describeNotes(midis);
  return d && /♭/.test(d.title.split('/')[0]) ? 'flat' : 'sharp';
}
