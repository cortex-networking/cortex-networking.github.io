// Ripchord: the Miracle's chord game. A helicopter tows a chord in over the staff and hovers while
// a timer runs down. Hold every note of the chord down together and the parachutists jump and
// float down to the landing pad; a wrong note, or running out of time, and they drop without
// their chutes (a cartoon splat: they bounce, see stars and walk it off) while the right chord is
// shown on the staff, lit on the keys and played so you can hear it.
//
// Embedded params (lessons and the coach), merged over the level:
//   chords  [[60, 64, 67], 'F', 'G7/B', 62, ...]: MIDI arrays, single MIDI notes or chord symbols.
//           Symbols are voiced close from middle C up (from G2 on the bass staff), sevenths
//           included; a slash chord is voiced as that inversion. 'C5' is the power chord, so give
//           single notes as numbers. Pitch strings like 'C4 E4 G4' work too. They come in the
//           order given, repeating if count is longer (levels shuffle their own chords).
//   song    a catalog song id: song mode, walking that song's chord chart in order (see below).
//   hands   song mode: 'R' (default) close triads from middle C; 'L' left-hand chords on the bass
//           staff, as the song's left hand plays them
//   fromBar, toBar   song mode: only these bars (inclusive, 0-based as songBar counts them)
//   passes  song mode: 1 or 2 times through (default: twice if the progression is short)
//   count   helicopters in the round (default 10; song mode plays the song instead)
//   time    seconds per chord at the start of the round; it shrinks to 70% by the last one
//   staves  'treble' | 'bass' | 'grand' (default: from the notes in `chords`, else the level's)
//   names   show the chord name on the banner before it is played (it always shows after)
//   pass    share of chords to get right to pass (default 0.7); text: the prompt line
import { ArcadeBase, svg, rand, ease, clamp, GLYPH, songBar } from './arcade.js';
import { spell, parsePitch, pc, LETTERS, buildScore, keySigMap } from './theory.js';
import { parseChord, chartSegments } from './backing.js';
import { h } from './ui.js';

// ---------- chords: voicing, spelling and names ----------
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SIGN = { '-1': '♭', 0: '', 1: '♯' };
const ACC_W = { '-1': 0.904, 0: 0.672, 1: 0.996 }; // accidental glyph widths, staff spaces
const HEAD_W = 1.688;                              // whole notehead width, staff spaces
const STAFF = { treble: [30, 38], bass: [18, 26] };  // diatonic steps of the bottom and top lines

const QUALITIES = [
  { ivs: [0, 4, 7], steps: [0, 2, 4], sym: '', word: 'major', roots: 'major' },
  { ivs: [0, 3, 7], steps: [0, 2, 4], sym: 'm', word: 'minor', roots: 'minor' },
  { ivs: [0, 3, 6], steps: [0, 2, 4], sym: 'dim', word: 'diminished', roots: 'dim' },
  { ivs: [0, 4, 8], steps: [0, 2, 4], sym: 'aug', word: 'augmented', roots: 'major' },
  { ivs: [0, 5, 7], steps: [0, 3, 4], sym: 'sus4', word: 'sus4', roots: 'major' },
  { ivs: [0, 2, 7], steps: [0, 1, 4], sym: 'sus2', word: 'sus2', roots: 'major' },
  { ivs: [0, 7], steps: [0, 4], sym: '5', word: 'power chord', roots: 'major' },
  { ivs: [0, 4, 7, 10], steps: [0, 2, 4, 6], sym: '7', word: 'seventh', roots: 'major' },
  { ivs: [0, 4, 7, 11], steps: [0, 2, 4, 6], sym: 'maj7', word: 'major seventh', roots: 'major' },
  { ivs: [0, 3, 7, 10], steps: [0, 2, 4, 6], sym: 'm7', word: 'minor seventh', roots: 'minor' },
  { ivs: [0, 3, 6, 10], steps: [0, 2, 4, 6], sym: 'm7♭5', word: 'half-diminished', roots: 'dim' },
  { ivs: [0, 3, 6, 9], steps: [0, 2, 4, 6], sym: 'dim7', word: 'diminished seventh', roots: 'dim' },
];
const INVERSION = ['', ', first inversion', ', second inversion', ', third inversion'];
// how a black-key root is usually written for each kind of chord
const ROOT_NAMES = {
  major: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  minor: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  dim: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
};

const near = (p, lo) => lo + pc(p - lo);       // first pitch of class p at or above lo
const nameOf = (hd) => LETTERS[hd.letter] + (SIGN[hd.alter] ?? '');
const rootOf = (s) => ({ letter: LETTERS.indexOf(s[0]), alter: s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0 });
const pretty = (s) => s.replace(/([A-G])#/g, '$1♯').replace(/([A-G])b/g, '$1♭');
const P = (s) => s.split(' ').map(parsePitch);

/** A notehead spelled on a given letter: { midi, letter, alter, octave, step }. */
function headOf(midi, letter) {
  let alter = pc(midi) - LETTER_PC[letter];
  if (alter > 6) alter -= 12;
  if (alter < -6) alter += 12;
  const octave = Math.floor((midi - alter) / 12) - 1;
  return { midi, letter, alter, octave, step: octave * 7 + letter };
}

/**
 * A playable chord: { notes (low to high), heads (spelled), name ('C/E'), title ('C major'),
 * long ('C major, first inversion'), letters ('E G C'), from (the song's symbol, if different) }.
 */
function build(root, q, notes) {
  const rootPc = pc(LETTER_PC[root.letter] + root.alter);
  const heads = notes.map((m) => {
    const i = q.ivs.findIndex((v) => pc(v) === pc(m - rootPc));
    return i < 0 ? headOf(m, spell(m).letter) : headOf(m, (root.letter + q.steps[i]) % 7);
  });
  const r = LETTERS[root.letter] + SIGN[root.alter];
  const inv = q.ivs.findIndex((v) => pc(v) === pc(notes[0] - rootPc));
  const slash = inv > 0 ? `/${nameOf(heads[0])}` : '';
  const title = `${r} ${q.word}`;
  let more = q.ivs.length >= 3 && inv > 0 ? INVERSION[inv] : '';
  if (q.ivs.length === 2 && !slash) more = notes.length === 2 ? ', a bare fifth' : ', with the octave';
  const long = title + more;
  return { notes, heads, name: r + q.sym + slash, title, long, letters: heads.map(nameOf).join(' ') };
}

function single(midi) {
  const hd = headOf(midi, spell(midi).letter);
  const n = nameOf(hd);
  return { notes: [midi], heads: [hd], name: n, title: `${n}${hd.octave}`, long: `${n}${hd.octave}`, letters: '' };
}

/** Name and spell a chord given as MIDI notes. */
export function chordFromMidi(list) {
  const notes = [...new Set(list.map(Number))].filter(Number.isFinite).sort((a, b) => a - b);
  if (!notes.length) return null;
  if (notes.length === 1) return single(notes[0]);
  const pcs = [...new Set(notes.map(pc))];
  if (pcs.length === 1) {
    const c = single(notes[0]);
    return { ...c, notes, heads: notes.map((m) => headOf(m, c.heads[0].letter)), title: `${c.name} in octaves`, long: `${c.name} in octaves` };
  }
  const bass = pc(notes[0]);
  for (const r of [bass, ...pcs.filter((p) => p !== bass)]) {
    const set = pcs.map((p) => pc(p - r)).sort((a, b) => a - b);
    const q = QUALITIES.find((x) => x.ivs.length === set.length && x.ivs.every((v, i) => v === set[i]));
    if (q) return build(rootOf(ROOT_NAMES[q.roots][r]), q, notes);
  }
  const heads = notes.map((m) => headOf(m, spell(m).letter));
  const name = heads.map(nameOf).join(' ');
  return { notes, heads, name, title: name, long: name, letters: name };
}

/**
 * Voice a chord symbol close, from middle C up (G2 on the bass staff). With `triads`, sevenths
 * and added notes are left off (the song level); otherwise only 6ths and add9s are.
 */
export function chordFromSymbol(sym, staves = 'treble', inversions = true, triads = false) {
  const s = String(sym).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const p = parseChord(s);
  if (!p) return null;
  const same = (ivs) => (x) => x.ivs.length === ivs.length && x.ivs.every((v, i) => v === ivs[i]);
  const q = (!triads && QUALITIES.find(same(p.ivs))) || QUALITIES.find(same(p.ivs.length <= 2 ? p.ivs : p.ivs.slice(0, 3)));
  if (!q) return null;
  const tones = q.ivs.map((v) => pc(p.root + v));
  const k = inversions && p.bass !== p.root ? tones.indexOf(p.bass) : 0;
  const order = k > 0 ? [...tones.slice(k), ...tones.slice(0, k)] : tones;
  const notes = [near(order[0], staves === 'bass' ? 43 : 60)];
  for (const t of order.slice(1)) notes.push(notes[notes.length - 1] + pc(t - notes[notes.length - 1]));
  const c = build(rootOf(s), q, notes);
  if (pretty(s) !== c.name) c.from = pretty(s);
  return c;
}

/**
 * Spell given notes as the chord a symbol names (a left-hand voicing taken from the song): the
 * name stays the song's symbol; a bare root and fifth says so.
 */
function voiceSymbol(sym, notes) {
  const s = String(sym).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const p = parseChord(s);
  if (!p) return chordFromMidi(notes);
  const same = (ivs) => (x) => x.ivs.length === ivs.length && x.ivs.every((v, i) => v === ivs[i]);
  const q = QUALITIES.find(same(p.ivs)) || QUALITIES.find(same(p.ivs.length <= 2 ? p.ivs : p.ivs.slice(0, 3)));
  if (!q) return chordFromMidi(notes);
  const c = build(rootOf(s), q, notes);
  const ivs = [...new Set(notes.map((m) => pc(m - p.root)))].sort((a, b) => a - b);
  if (q.ivs.length > 2 && ivs.length === 2 && ivs[0] === 0 && [6, 7, 8].includes(ivs[1])) c.long = `${c.title}, root and fifth`;
  return c;
}

function toChord(entry, staves) {
  try {
    if (typeof entry === 'number') return chordFromMidi([entry]);
    if (Array.isArray(entry)) return chordFromMidi(entry);
    if (typeof entry !== 'string') return null;
    const s = entry.trim();
    if (/[\s+]/.test(s)) return chordFromMidi(s.split(/[\s+]+/).map(parsePitch));
    return chordFromSymbol(s, staves) || chordFromMidi([parsePitch(s)]);
  } catch { return null; }
}

/** A song's chord chart as root-position triads, repeats in a row merged. */
function progression(song) {
  const out = [];
  for (const tok of String(song.chords || '').split(/[|\s]+/)) {
    const sym = tok.split(':')[0];
    if (!sym || sym === 'N.C.') continue;
    const c = chordFromSymbol(sym, 'treble', false, true);
    if (c && c.name !== out[out.length - 1]?.name) out.push(c);
  }
  return out;
}

/** Can this song's chart be played? At least two different chords we can voice. Cached. */
const USABLE = new Map();
function usableChart(song) {
  if (!song?.chords) return false;
  if (!USABLE.has(song.id)) USABLE.set(song.id, new Set(progression(song).map((c) => c.name)).size >= 2);
  return USABLE.get(song.id);
}

/** '½ bar', '1½ bars', '3 beats' */
function barsLong(bars, bpb) {
  const n = Math.floor(bars + 1e-6), f = bars - n;
  const frac = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']].find(([v]) => Math.abs(f - v) < 0.02);
  if (!frac) { const b = Math.round(bars * bpb * 2) / 2; return `${b} beat${b === 1 ? '' : 's'}`; }
  return `${n || ''}${frac[1]} bar${bars > 1.01 ? 's' : ''}`;
}

export const GAME = {
  id: 'ripchord', title: 'Ripchord',
  summary: 'The chord drop. Hold down the whole chord the helicopter tows in before time runs out.',
  how: 'A helicopter tows in a chord. Hold all its notes down together before the timer runs out and the parachutists float down to the pad. Notes you hold turn green. A wrong note, or too slow, and they go splat.',
  songHow: 'Play the song’s chords in order, bar by bar. Each helicopter brings the next chord and says which bars it lasts; the strip along the ground shows the progression.',
  skill: 'chords',
  levels: [
    { name: 'Single notes', staves: 'treble', names: true, time: 6, count: 10, chords: [60, 62, 64, 65, 67] },
    { name: 'Fifths and power chords', staves: 'treble', names: true, time: 7, count: 10,
      chords: ['C4 G4', 'D4 A4', 'E4 B4', 'F4 C5', 'G4 D5', 'A4 E5', 'C4 G4 C5', 'D4 A4 D5', 'E4 B4 E5', 'G4 D5 G5'].map(P) },
    { name: 'C, F and G major', staves: 'treble', names: true, time: 8, count: 10, chords: ['C', 'F', 'G'] },
    { name: 'A, D and E minor', staves: 'treble', names: true, time: 8, count: 10, chords: ['Am', 'Dm', 'Em'] },
    { name: 'All the white-key triads', staves: 'treble', names: false, time: 7, count: 10, chords: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'] },
    { name: 'Inversions of C, F and G', staves: 'treble', names: false, time: 8, count: 10, chords: ['C/E', 'C/G', 'F/A', 'F/C', 'G/B', 'G/D', 'C', 'F', 'G'] },
    { name: 'Left-hand chords', staves: 'bass', names: true, time: 8, count: 10, chords: ['C', 'F', 'G', 'Am', 'Dm', 'Em', 'F/C', 'G/B'] },
    { name: 'Chords from a song', song: true, staves: 'treble', names: true, time: 8 },
  ],
};

// ---------- timing and scoring ----------
const IN_DUR = 1.35;     // fly-in, seconds (a little quicker as the round goes on)
const OUT_DUR = 1.2;     // fly-off
const REVEAL = 2.8;      // time to study the right chord after a miss
const GRACE = 0.07;      // once the chord is down, listen this long for a stray extra note
const WRONG_WIN = 0.16;  // after a wrong note, gather the rest of the attempt before judging
const MAN_PTS = 100, TIME_PTS = 100;

// ---------- art (unit coordinates, scaled by the staff space) ----------
const HELMETS = ['#62c993', '#8fb7de', '#e9705a', '#d9a93a'];
const CANOPIES = [['#62c993', '#e8ede3'], ['#8fb7de', '#e8ede3'], ['#e9705a', '#e8ede3'], ['#d9a93a', '#e8ede3']];
const CABIN = 'M-2.15,0.12 C-2.15,-0.72 -1.4,-1 -0.4,-1 L0.95,-1 C1.55,-1 1.85,-0.72 1.95,-0.42 L1.95,0.2 C1.75,0.72 1.25,0.96 0.62,0.96 L-1,0.96 C-1.72,0.96 -2.15,0.7 -2.15,0.12 Z';
const BELLY = 'M-2.11,0.42 C-1.97,0.8 -1.62,0.96 -1,0.96 L0.62,0.96 C1.2,0.96 1.62,0.76 1.86,0.42 Z';
const DOME = 'M-1.35,-3.1 C-1.35,-4.12 1.35,-4.12 1.35,-3.1 Q1.01,-3.3 0.68,-3.1 Q0.34,-3.3 0,-3.1 Q-0.34,-3.3 -0.68,-3.1 Q-1.01,-3.3 -1.35,-3.1 Z';
const GORE = 'M-0.46,-3.12 C-0.52,-3.98 0.52,-3.98 0.46,-3.12 Q0.23,-3.28 0,-3.12 Q-0.23,-3.28 -0.46,-3.12 Z';
const LINES = 'M-1.3,-3.12 L-0.3,-1.66 M-0.62,-3.14 L-0.3,-1.66 M0.62,-3.14 L0.3,-1.66 M1.3,-3.12 L0.3,-1.66';
const ARMS = {
  up: 'M-0.18,-1.2 L-0.3,-1.66 M0.18,-1.2 L0.3,-1.66',
  free: 'M-0.18,-1.18 L-0.66,-1.48 M0.18,-1.18 L0.66,-1.48',
  cheer: 'M-0.18,-1.2 L-0.46,-1.76 M0.18,-1.2 L0.46,-1.76',
  down: 'M-0.18,-1.2 L-0.27,-0.74 M0.18,-1.2 L0.27,-0.74',
};
const legs = (s = 0) => `M-0.1,-0.6 L${(-0.17 + 0.13 * s).toFixed(2)},-0.09 M0.1,-0.6 L${(0.17 - 0.13 * s).toFixed(2)},-0.09`;
const STAR = (() => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.065 : 0.16;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`;
  }
  return d + 'Z';
})();
const CLOUD = 'M-2,0.5 C-2.5,0.5 -2.6,-0.3 -1.75,-0.35 C-1.65,-1.1 -0.55,-1.2 -0.2,-0.6 C0.2,-1.35 1.6,-1.15 1.5,-0.25 C2.3,-0.3 2.5,0.5 1.9,0.5 Z';

export class Game extends ArcadeBase {
  stageOptions() {
    const key = this.songMode ? this.songDef?.key || 'C' : 'C';   // a song keeps its key signature
    return { staves: this._staves(), key, mTop: 6.6, mBot: 3, padTop: 0.03, padBot: 0.16, maxSp: 24 };
  }

  /** Embedded chords pick their own staff unless one is given. */
  _staves() {
    const e = this.embedded;
    if (e?.staves) return e.staves;
    if (this.songMode) return this._songPlan()?.staves || 'treble';
    if (e?.chords) {
      const nums = e.chords.flatMap((c) => (typeof c === 'number' ? [c] : Array.isArray(c) ? c : []));
      if (!nums.length) return 'treble';
      const lo = Math.min(...nums), hi = Math.max(...nums);
      return hi <= 62 && lo < 57 ? 'bass' : lo < 55 ? 'grand' : 'treble';
    }
    return this.lv.staves || 'treble';
  }

  reset() {
    this.rotorStop?.();
    this.rotorStop = null;
    this.helis = []; this.men = []; this.timers = [];
    this.cur = null;
    this.down ||= new Set();
    this.clock = 0;
    const L = this.stage.layers;
    for (const k of ['hud', 'back', 'fx', 'sprites']) L[k].textContent = '';
    this.heliG = svg('g', {}, L.sprites);
    this.menG = svg('g', {}, L.sprites);
    this.hudG = null; this.timerG = null;
    this._geom();
    this._scenery();
  }

  layout() {
    if (!this.helis) return;
    this._geom();
    this._scenery();
    for (const hl of this.helis) { this._drawChord(hl); this._drawBanner(hl); this._placeHeli(hl); }
    for (const m of this.men) this._placeMan(m);
    this._timer(true);
    this._hud();
  }

  /** Layout numbers shared by everything, from the stage's staff space. */
  _geom() {
    const st = this.stage, sp = st.sp;
    const hs = clamp(16.5 / sp, 1.12, 1.35);    // helicopter units per staff space
    const band = clamp(2 * sp, 30, 52);
    const attract = this.mode === 'attract';
    const hookX = Math.round(st.w * (attract ? 0.8 : 0.47));
    this.geo = {
      sp, hs, band, hookX,
      ms: clamp(14 / sp, 1, 1.2),              // parachutist units per staff space
      heliY: st.staffTop - (2.35 + 1.6 * hs) * sp,
      groundY: st.h - band,
      padX: attract ? Math.max(st.left + 3 * sp, st.w * 0.15) : hookX - 5.4 * sp,
    };
    return this.geo;
  }

  // ---------- scenery: sky, ground, landing pad, windsock ----------
  _scenery() {
    const st = this.stage, G = this.geo, sp = st.sp, g = st.layers.bg;
    g.textContent = '';
    this.clouds ||= [[0.1, 0.62, 1], [0.48, 0.2, 0.75], [0.83, 0.75, 1.1]].map(([f, y, s]) => ({ f, y, s }));
    for (const c of this.clouds) c.el = svg('path', { d: CLOUD, class: 'rc-cloud' }, g);
    this._placeClouds();
    svg('rect', { x: 0, y: G.groundY, width: st.w, height: st.h - G.groundY, class: 'rc-ground' }, g);
    svg('line', { x1: 0, x2: st.w, y1: G.groundY, y2: G.groundY, class: 'rc-ground-line' }, g);
    const gap = 3.1 * sp;
    let d = '';
    for (let i = 0; i * gap < st.w; i++) {
      const x = (i + 0.5 + 0.3 * Math.sin(i * 12.9)) * gap, s = 0.32 * sp * (0.8 + 0.3 * Math.cos(i * 7.3));
      d += `M${(x - s).toFixed(1)},${(G.groundY - s * 0.9).toFixed(1)} L${x.toFixed(1)},${G.groundY} L${(x + s * 0.5).toFixed(1)},${(G.groundY - s * 1.2).toFixed(1)} `;
    }
    svg('path', { d, class: 'rc-grass' }, g);
    // landing pad: a target mat on the ground
    const px = G.padX, py = G.groundY;
    svg('ellipse', { cx: px, cy: py, rx: 2.6 * sp, ry: 0.42 * sp, class: 'rc-pad' }, g);
    svg('ellipse', { cx: px, cy: py, rx: 1.75 * sp, ry: 0.28 * sp, class: 'rc-pad-ring' }, g);
    svg('ellipse', { cx: px, cy: py, rx: 0.75 * sp, ry: 0.12 * sp, class: 'rc-pad' }, g);
    // windsock beside it, blowing the way the jumpers drift
    const wx = px - 3.6 * sp, top = py - 2.3 * sp;
    svg('line', { x1: wx, x2: wx, y1: py, y2: top, class: 'rc-pole', 'stroke-width': Math.max(1.5, 0.1 * sp) }, g);
    this.sock = svg('g', {}, g);
    this.sockAt = [wx, top + 0.2 * sp];
    const u = sp;
    for (let i = 0; i < 4; i++) {
      const x0 = -i * 0.55 * u, x1 = -(i + 1) * 0.55 * u, h0 = 0.34 * u * (1 - i * 0.16), h1 = 0.34 * u * (1 - (i + 1) * 0.16);
      svg('path', { d: `M${x0},${-h0} L${x1},${-h1} L${x1},${h1} L${x0},${h0} Z`, class: i % 2 ? 'rc-sock-b' : 'rc-sock-a' }, this.sock);
    }
    this._placeSock();
  }

  _placeClouds() {
    const st = this.stage, sp = st.sp;
    for (const c of this.clouds || []) {
      const x = ((c.f % 1.25) - 0.12) * st.w;
      const y = 0.5 * sp + c.y * Math.max(sp, st.staffTop - 2.5 * sp);
      c.el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(sp * 1.25 * c.s).toFixed(2)})`);
    }
  }

  _placeSock() {
    if (!this.sock) return;
    const [x, y] = this.sockAt;
    const a = Math.sin(this.clock * 3.1) * 4 + Math.sin(this.clock * 7.7) * 1.5;
    this.sock.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(8 + a).toFixed(1)})`);
  }

  // ---------- the chords for a round ----------
  /** Song mode: only songs whose chord chart we can play. */
  songFilter(song) { return usableChart(song); }

  get songMode() { return this.songLevel && !this.embedded?.chords?.length; }

  /**
   * The song-mode plan: the song's chord chart walked bar by bar, in order. A chord that carries
   * on merges into one helicopter that says which bars it lasts; a run of 4 bars or more that
   * repeats bars already played is skipped (unless the lesson asked for those bars); a short
   * progression goes round twice, the second time with the names hidden.
   */
  _songPlan() {
    const def = this.songDef;
    if (!def || !this.songMode) return null;
    const e = this.embedded || {};
    const hands = this.lv.hands === 'L' ? 'L' : 'R';
    const id = `${def.id}|${hands}|${e.fromBar ?? ''}|${e.toBar ?? ''}|${e.passes ?? ''}`;
    if (this.plan?.id === id) return this.plan;
    const score = buildScore(def);
    const nBars = score.barlines.length + 1;
    const starts = [0, ...score.barlines, score.length];
    const ranged = e.fromBar !== undefined || e.toBar !== undefined;
    const lo = clamp(e.fromBar ?? 0, 0, nBars - 1), hi = clamp(e.toBar ?? nBars - 1, lo, nBars - 1);
    const t0 = starts[lo], t1 = starts[hi + 1] ?? score.length;
    const segs = chartSegments(score)
      .filter((g) => g.t + g.d > t0 + 1e-6 && g.t < t1 - 1e-6)
      .map((g) => {
        const t = Math.max(g.t, t0), end = Math.min(g.t + g.d, t1);
        // the right hand plays root positions; the left hand follows the chart's bass (G/B ≠ G)
        const tri = g.chord ? chordFromSymbol(g.chord.sym, hands === 'L' ? 'bass' : 'treble', hands === 'L', true) : null;
        return { t, end, sym: tri ? g.chord.sym : null, name: tri?.name || null, bar: songBar(score, t + 1e-3) };
      });
    // repeats: a phrase (4 bars or more, starting on a 4-bar boundary) that is the same as one
    // already played is played once
    const skip = new Set(), repeats = [];
    if (!ranged) {
      const bars = [...new Set(segs.map((g) => g.bar))];
      const sig = new Map(bars.map((b) => [b, segs.filter((g) => g.bar === b).map((g) => `${g.name}@${(g.t - starts[b]).toFixed(2)}+${(g.end - g.t).toFixed(2)}`).join(' ')]));
      for (let i = 4; i < bars.length; i += 4) {
        let best = null;
        for (let j = 0; j < i; j += 4) {
          let L = 0;
          while (j + L < i && i + L < bars.length && sig.get(bars[j + L]) === sig.get(bars[i + L])) L++;
          L -= L % 4;
          if (L >= 4 && (!best || L > best.L)) best = { j, L };
        }
        if (!best) continue;
        for (let k = 0; k < best.L; k++) skip.add(bars[i + k]);
        repeats.push({ from: bars[i], to: bars[i + best.L - 1], ofFrom: bars[best.j], ofTo: bars[best.j + best.L - 1] });
        i += best.L - 4;
      }
    }
    // spans: one helicopter per chord, merged while the chord carries on
    const spans = [];
    let joinable = false;
    for (const g of segs) {
      if (skip.has(g.bar) || !g.sym) {
        if (skip.has(g.bar) && spans.length && !spans[spans.length - 1].repeat) spans[spans.length - 1].repeat = repeats.find((r) => r.from === g.bar);
        joinable = false;
        continue;
      }
      const last = spans[spans.length - 1];
      if (joinable && last.name === g.name && Math.abs(last.end - g.t) < 1e-6) last.end = g.end;
      else spans.push({ sym: g.sym, name: g.name, t: g.t, end: g.end, brk: !joinable });
      joinable = true;
    }
    // voice each chord for the hand; a shape that doesn't change (G/D then G as root and fifth) stays one helicopter
    const lh = hands === 'L' ? this._leftHand(score, segs) : null;
    let once = [];
    for (const sp of spans) {
      const c = lh ? this._lhChord(sp, lh) : chordFromSymbol(sp.sym, 'treble', false, true);
      const last = once[once.length - 1];
      if (last && !sp.brk && last.name === c.name && last.notes.join() === c.notes.join() && Math.abs(last.span.end - sp.t) < 1e-6) {
        last.span.end = sp.end;
        last.span.repeat = sp.repeat;
        continue;
      }
      once.push({ ...c, span: { ...sp }, pass: 1 });
    }
    const capped = once.length > 40;
    once = once.slice(0, 40);
    for (const [k, c] of once.entries()) {
      const sp = c.span;
      sp.k = k;
      sp.fromBar = songBar(score, sp.t + 1e-3);
      sp.toBar = songBar(score, sp.end - 1e-3);
      sp.beats = sp.end - sp.t;
      sp.whole = Math.abs(sp.t - starts[sp.fromBar]) < 1e-6 && Math.abs(sp.end - starts[sp.toBar + 1]) < 1e-6;
    }
    const passes = clamp(e.passes ?? (once.length <= 12 ? 2 : 1), 1, 2);
    const seq = passes > 1 ? [...once, ...once.map((c) => ({ ...c, span: { ...c.span }, pass: 2 }))] : once;
    const all = seq.flatMap((c) => c.notes);
    const staves = hands === 'L' ? (Math.max(...all) > 64 ? 'grand' : 'bass') : 'treble';
    this.plan = {
      id, def, title: def.title, hands, score, nBars, bpb: score.bpb, spans: once, seq, passes, repeats, staves, capped,
      from: once.length ? once[0].span.fromBar : lo, to: once.length ? once[once.length - 1].span.toBar : hi, ranged,
    };
    return this.plan;
  }

  /** How the song's left hand plays: its chord shapes, and whether its single notes outline roots and fifths. */
  _leftHand(score, segs) {
    const at = new Map();
    for (const n of score.notes) if (n.hand === 'L') (at.get(n.t) || at.set(n.t, []).get(n.t)).push(n.midi);
    const groups = [...at.entries()].map(([t, ms]) => ({ t, notes: [...new Set(ms)].sort((a, b) => a - b) }));
    const chords = groups.filter((g) => new Set(g.notes.map(pc)).size >= 2);
    let style;
    if (chords.length >= 3) style = chords.filter((g) => g.notes.length >= 3).length > chords.length / 2 ? 'triad' : 'power';
    else {
      // single notes: if they keep to the root and fifth of each chord, the left hand thinks in fifths
      let rf = 0, n = 0;
      for (const g of groups) {
        const seg = segs.find((x) => x.sym && g.t >= x.t - 1e-6 && g.t < x.end - 1e-6);
        const p = seg && parseChord(seg.sym);
        if (!p) continue;
        for (const m of g.notes) { n++; if ([0, 7].includes(pc(m - p.root))) rf++; }
      }
      style = n && rf / n >= 0.8 ? 'power' : 'triad';
    }
    return { chords, style };
  }

  /** A left-hand chord for one span: the shape the song's left hand plays there, else its usual kind. */
  _lhChord(sp, lh) {
    const p = parseChord(sp.sym.replace(/♯/g, '#').replace(/♭/g, 'b'));
    const tones = p.ivs.map((v) => pc(p.root + v));
    const here = lh.chords.filter((g) => g.t >= sp.t - 1e-6 && g.t < sp.end - 1e-6 && g.notes.every((m) => tones.includes(pc(m))));
    if (here.length) {
      const count = new Map();
      for (const g of here) count.set(g.notes.join(), (count.get(g.notes.join()) || 0) + 1);
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return voiceSymbol(sp.sym, best.split(',').map(Number));
    }
    if (lh.style === 'power') {
      const root = near(p.root, 43);
      const fifth = p.ivs.find((v) => [7, 6, 8].includes(v)) ?? 7;
      return voiceSymbol(sp.sym, [root, root + fifth]);
    }
    return chordFromSymbol(sp.sym, 'bass', true, true);
  }

  /** Where this round's chords come from: { chords, ordered } or { chords, plan }. */
  _source() {
    const e = this.embedded || {}, lv = this.lv, staves = this._staves();
    const list = (arr) => arr.map((c) => toChord(c, staves)).filter(Boolean);
    if (e.chords?.length) { const c = list(e.chords); if (c.length) return { chords: c, ordered: true }; }
    const plan = this._songPlan();
    if (plan?.seq.length) return { chords: plan.seq, plan };
    const c = list(lv.chords || GAME.levels[2].chords);
    return { chords: c.length ? c : list(GAME.levels[2].chords) };
  }

  _sequence() {
    const n = Math.max(1, this.lv.count || 10);
    const src = this._source();
    this.songTitle = src.plan ? src.plan.title : null;
    if (src.plan) return src.plan.seq;   // the song, in order
    const seq = [];
    if (src.ordered) {    // a lesson's own list, in its order
      for (let i = 0; i < n; i++) seq.push(src.chords[i % src.chords.length]);
      return seq;
    }
    // otherwise shuffled, each chord once before any repeats, never the same twice running
    let bag = [];
    while (seq.length < n) {
      if (!bag.length) bag = src.chords.slice().sort(() => Math.random() - 0.5);
      let c = bag.pop();
      const last = seq[seq.length - 1];
      if (last && c.name === last.name && src.chords.length > 1) {
        if (bag.length) { const d = bag.pop(); bag.unshift(c); c = d; } else bag.unshift(c);
        if (c.name === last.name) continue;
      }
      seq.push(c);
    }
    return seq;
  }

  /** "bars 5–6 of 16", plus how long it lasts when that isn't whole bars. */
  _barsText(span, plan = this.plan) {
    const a = span.fromBar + 1, b = span.toBar + 1;
    const range = a === b ? `bar ${a}` : `bars ${a}–${b}`;
    return `${range} of ${plan.nBars}${span.whole ? '' : ` · ${barsLong(span.beats / plan.bpb, plan.bpb)}`}`;
  }

  /** What the round covers, for the attract card and the results. */
  _coverText(plan, upTo = plan.to) {
    const rep = plan.repeats.filter((r) => r.from <= upTo + 1).map((r) => `${r.from + 1}–${r.to + 1} repeat ${r.ofFrom + 1}–${r.ofTo + 1}`);
    return `bars ${plan.from + 1}–${upTo + 1} of ${plan.nBars}${rep.length ? ` (${rep.join(', ')})` : ''}`;
  }

  // ---------- round ----------
  /** On a song level the attract card also says what the round covers and with which hand. */
  _attractPanel() {
    super._attractPanel();
    const plan = this.songMode && this._songPlan();
    const how = this.stage.panel.querySelector('.ar-how');
    if (!plan || !how) return;
    const hand = plan.hands === 'L' ? 'Left hand, on the bass staff' : 'Right hand, around middle C';
    how.after(h('p', { class: 'ar-how rc-song' }, `${hand}: ${plan.spans.length} chords, ${this._coverText(plan)}${plan.passes > 1 ? ', twice through' : ''}.`));
  }

  attract() {
    this.mode = 'attract';
    this._geom();
    this._scenery();
    const { chords } = this._source();
    const hl = this._spawn(chords.find((c) => c.notes.length === 3) || chords[0], true);
    hl.revealed = true;
    this._drawBanner(hl);
    this.floatIn = 0.4;
  }

  start() {
    this.mode = 'play';
    this.playing = true;
    this._geom();
    this._scenery();
    this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.good = 0; this.bad = 0; this.landed = 0; this.menSeen = 0; this.bonus = 0;
    this.fastest = Infinity; this.spawned = 0; this.endIn = null;
    this.results = []; this.chordStats = new Map(); this.passCard = false;
    this.seq = this._sequence();
    this.total = this.seq.length;
    this.noun = this.seq.every((c) => c.notes.length === 1) ? 'note' : 'chord';
    const all = this.seq.flatMap((c) => c.notes);
    this.app.keyboard.need(Math.min(...all), Math.max(...all));
    if (this.songTitle) this._titleCard(this.plan.hands === 'L' ? 'Left-hand chords from' : 'Chords from', this.songTitle);
    this._after(this.songTitle ? 1.9 : 0.45, () => this._next());
    this.app.ui.prompt(this.embedded?.text || this._promptText());
    this.app.ui.status('');
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this._end(true) }, 'Stop'));
    this._timer(true);
    this._hud();
  }

  _promptText() {
    if (this.songTitle) return `${this.songTitle}${this.plan.hands === 'L' ? ', left hand' : ''}: play the song’s chords in order, bar by bar.`;
    if (this.seq.every((c) => c.notes.length === 1)) return 'Play the note the helicopter is towing before the timer runs out.';
    return 'Hold the whole chord down together. Notes you are holding turn green.';
  }

  _timeFor(i) {
    const f = this.total > 1 ? i / (this.total - 1) : 0;
    const base = this.songMode ? this.embedded?.time ?? GAME.levels[7].time : this.lv.time;
    return (base || 8) * (1 - 0.3 * f);
  }

  /** Show chord names before the answer? Song mode does (it's learning the chart) unless told not to. */
  _names() { return this.songMode ? this.embedded?.names ?? true : !!this.lv.names; }

  _next() {
    if (this.mode !== 'play' || this.spawned >= this.total) return;
    if (this.seq[this.spawned].pass === 2 && !this.passCard) {
      // second time through the song: the names are hidden, so it's the chart from memory
      this.passCard = true;
      this._titleCard('Second time through', 'Names hidden');
      this.app.ui.status('Again from the top. This time the names stay hidden until you play.');
      this._after(1.9, () => this._next());
      this._strip();
      return;
    }
    const i = this.spawned++;
    this.cur = this._spawn(this.seq[i]);
    const prev = this.seq[i - 1]?.span, span = this.seq[i].span;
    const skipped = prev && span && span.k > 0 && prev.repeat;
    this.app.ui.status(skipped ? `Bars ${prev.repeat.from + 1}–${prev.repeat.to + 1} repeat bars ${prev.repeat.ofFrom + 1}–${prev.repeat.ofTo + 1}, so on to bar ${span.fromBar + 1}.`
      : this.streak > 2 ? `${this.streak} in a row` : '');
    this._check(this.cur);
    this._hud();
  }

  _after(sec, fn) { this.timers.push({ t: sec, fn }); }

  step(dt) {
    if (!this.helis || this.mode === 'off') return;
    this.clock += dt;
    if (this.timers.length) {
      const due = [];
      this.timers = this.timers.filter((x) => ((x.t -= dt) > 0 ? true : (due.push(x), false)));
      due.forEach((x) => x.fn());
    }
    for (const c of this.clouds || []) c.f += dt * 0.006 * (1.3 - c.y * 0.5);
    this._placeClouds();
    this._placeSock();
    for (const hl of this.helis) this._stepHeli(hl, dt);
    this.helis = this.helis.filter((hl) => hl.phase !== 'gone');
    for (const m of this.men) this._stepMan(m, dt);
    this.men = this.men.filter((m) => m.state !== 'gone');
    if (this.mode === 'attract') {
      this.floatIn -= dt;
      if (this.floatIn <= 0) { this.floatIn = 3.4; this._floater(); }
      return;
    }
    // the rotor sound runs while there is a helicopter in the sky
    const flying = this.mode === 'play' && this.helis.length > 0;
    if (flying && !this.rotorStop) this.rotorStop = this.sfx.loop('rotor', 0.07);
    if (!flying && this.rotorStop) { this.rotorStop(); this.rotorStop = null; }
    this._updateTimer();
    if (this.mode === 'play' && this.spawned >= this.total && !this.helis.length
      && this.men.every((m) => !['free', 'chute', 'tumble'].includes(m.state))) {
      this.endIn = (this.endIn ?? 0.5) - dt;
      if (this.endIn <= 0) this._end(false);
    }
  }

  // ---------- helicopters ----------
  _spawn(chord, attract = false) {
    const i = this.spawned ? this.spawned - 1 : 0;
    const f = this.total > 1 ? i / (this.total - 1) : 0;
    const hl = {
      chord, idx: i, phase: attract ? 'show' : 'fly',
      inDur: IN_DUR * (1 - 0.25 * f), inT: attract ? 9 : 0, outT: 0, pt: 0,
      time: attract ? 8 : this._timeFor(i), left: 0, born: this.clock,
      rot: rand(0, 6), bobPh: rand(0, 6), wave: 0, release: null,
      // chord tones already held from the last chord count (keep common tones down), but a
      // fresh key press is still needed before it can be judged
      armed: new Set(attract ? [] : chord.notes.filter((m) => this.down.has(m))), fresh: false,
      wrong: [], stale: [], men: chord.notes.length, jumped: 0,
      revealed: this._names() && chord.pass !== 2, answered: false, result: null,
    };
    hl.left = hl.time;
    hl.chordG = svg('g', { class: 'rc-cargo' }, this.stage.layers.back);
    hl.g = svg('g', { class: 'rc-heli' }, this.heliG);
    hl.g.append(this._heliArt(hl));
    this._drawChord(hl);
    this._drawBanner(hl);
    this.helis.push(hl);
    this._placeHeli(hl);
    return hl;
  }

  /** A flat-vector helicopter facing left, in units of about a staff space. */
  _heliArt(hl) {
    const a = svg('g', { class: 'rc-heli-art' });
    svg('path', { d: 'M-0.12,-0.98 L-0.08,-1.38 L0.08,-1.38 L0.12,-0.98 Z', class: 'rc-mast' }, a);
    svg('path', { d: 'M1.5,-0.66 L4.62,-0.38 L4.62,-0.08 L1.5,0.3 Z', class: 'rc-body' }, a);
    svg('path', { d: 'M4.2,-0.36 L4.5,-1.14 L4.86,-1.14 L4.8,-0.34 Z', class: 'rc-body' }, a);
    svg('path', { d: 'M4.36,-0.1 L4.5,0.36 L4.78,0.36 L4.74,-0.1 Z', class: 'rc-body-dark' }, a);
    svg('path', { d: 'M2,-0.25 L4.55,-0.24', class: 'rc-stripe' }, a);
    svg('path', { d: CABIN, class: 'rc-body' }, a);
    svg('path', { d: BELLY, class: 'rc-body-dark' }, a);
    svg('path', { d: 'M-2.1,0.22 L1.92,0.22', class: 'rc-stripe' }, a);
    svg('path', { d: 'M-2.03,-0.06 C-1.99,-0.62 -1.56,-0.88 -0.98,-0.9 L-0.98,-0.06 Z', class: 'rc-glass' }, a);
    svg('path', { d: 'M-1.74,-0.3 C-1.64,-0.56 -1.44,-0.7 -1.22,-0.75', class: 'rc-glint' }, a);
    // the open side door, the jumpers waiting in it, and the door slid back behind
    svg('rect', { x: -0.8, y: -0.82, width: 1.32, height: 1.42, rx: 0.14, class: 'rc-door' }, a);
    hl.crew = svg('g', {}, a);
    svg('rect', { x: 0.6, y: -0.8, width: 0.6, height: 1.36, rx: 0.1, class: 'rc-door-panel' }, a);
    svg('path', { d: 'M-1.05,0.9 L-1.28,1.4 M0.75,0.9 L0.98,1.4', class: 'rc-strut' }, a);
    svg('path', { d: 'M-2.38,1.16 Q-2.32,1.4 -2.04,1.4 L1.72,1.4', class: 'rc-strut' }, a);
    svg('rect', { x: 0.6, y: 0.86, width: 0.3, height: 0.22, rx: 0.06, class: 'rc-winch' }, a);
    // rotors: two blades seen edge-on, each foreshortened as it turns, over a faint blur disc
    svg('ellipse', { cx: 0, cy: -1.44, rx: 3.3, ry: 0.2, class: 'rc-disc' }, a);
    hl.bladeA = svg('rect', { x: -3.3, y: -1.5, width: 6.6, height: 0.13, rx: 0.065, class: 'rc-blade' }, a);
    hl.bladeB = svg('rect', { x: -3.3, y: -1.5, width: 6.6, height: 0.13, rx: 0.065, class: 'rc-blade' }, a);
    svg('ellipse', { cx: 0, cy: -1.42, rx: 0.32, ry: 0.13, class: 'rc-hub' }, a);
    const tail = svg('g', { transform: 'translate(4.64 -0.64)' }, a);
    svg('circle', { r: 0.56, class: 'rc-disc' }, tail);
    hl.tailBlade = svg('rect', { x: -0.56, y: -0.055, width: 1.12, height: 0.11, rx: 0.05, class: 'rc-blade' }, tail);
    svg('circle', { r: 0.09, class: 'rc-hub' }, tail);
    hl.bannerG = svg('g', { class: 'rc-bannerg' }, a);
    this._crew(hl);
    return a;
  }

  /** Where the jumpers stand in the door (helicopter units). */
  _crewX(n, i) { return n > 1 ? -0.5 + (i * 0.74) / (n - 1) : -0.14; }

  _crew(hl) {
    const g = hl.crew;
    g.textContent = '';
    for (let i = hl.men - 1; i >= hl.jumped; i--) {
      const x = this._crewX(hl.men, i);
      svg('rect', { x: x - 0.24, y: -0.04, width: 0.48, height: 0.62, rx: 0.18, class: 'rc-suit' }, g);
      svg('circle', { cx: x, cy: -0.27, r: 0.23, fill: HELMETS[(hl.idx + i) % 4], class: 'rc-helmet' }, g);
      svg('rect', { x: x - 0.16, y: -0.31, width: 0.32, height: 0.1, rx: 0.05, class: 'rc-visor' }, g);
    }
  }

  /**
   * The banner towed behind the tail: the chord name (or '?' until it has been played) and, in
   * song mode, a second line with the bars it lasts (and the song title where there is room).
   */
  _drawBanner(hl) {
    const g = hl.bannerG;
    g.textContent = '';
    const k = this.geo.hs * this.geo.sp;                  // px per helicopter unit
    const span = hl.chord.span && this.plan && this.mode !== 'attract' ? hl.chord.span : null;
    const fs1 = Math.max(0.78, 14 / k), fs2 = Math.max(0.46, 10.5 / k), pad = 0.2;
    const lines = [hl.revealed ? hl.chord.name : '?'];
    // the second line says as much as fits between the tail and the edge of the stage
    const fits = [];
    if (span) {
      const title = this.plan.title.length > 24 ? `${this.plan.title.slice(0, 23)}…` : this.plan.title;
      const full = this._barsText(span), bars = full.split(' · ')[0];
      const range = bars.replace(/ of \d+$/, ''), dur = full.includes(' · ') ? ` · ${full.split(' · ')[1]}` : '';
      fits.push(`${title} · ${full}`, full, `${range}${dur}`, bars, range);
      lines.push(fits[0]);
    }
    const H = pad * 2 + fs1 * 0.95 + (span ? fs2 * 1.25 : 0);
    hl.flagTop = -0.2 - H / 2;
    hl.flagBot = -0.2 + H / 2;
    svg('path', { d: `M4.72,-0.24 L5.3,${hl.flagTop.toFixed(2)} M4.72,-0.24 L5.3,${hl.flagBot.toFixed(2)}`, class: 'rc-bridle' }, g);
    hl.flag = svg('path', { class: `rc-banner${hl.answered ? ' is-answer' : ''}` }, g);
    hl.flagText = lines.map((txt, i) => {
      const t = svg('text', { x: 0, y: 0, 'font-size': i ? fs2 : fs1, 'text-anchor': 'middle', class: i ? 'rc-banner-sub' : 'rc-banner-text' }, g);
      t.textContent = txt;
      return t;
    });
    hl.flagY = [hl.flagTop + pad + fs1 * 0.78, hl.flagTop + pad + fs1 * 0.95 + fs2 * 0.95];
    if (fits.length) {
      const room = (this.stage.w - 6 - (this.geo.hookX - 0.75 * k)) / k - 5.3 - 0.8;
      const sub = hl.flagText[1];
      for (const txt of fits) {
        sub.textContent = txt;
        let tw = 0;
        try { tw = sub.getComputedTextLength(); } catch { /* not laid out */ }
        if ((tw || 0.5 * txt.length * fs2) <= room) break;
      }
    }
    let w = 0;
    for (const t of hl.flagText) {
      let tw = 0;
      try { tw = t.getComputedTextLength(); } catch { /* not laid out */ }
      w = Math.max(w, tw || 0.5 * t.textContent.length * +t.getAttribute('font-size'));
    }
    hl.flagW = Math.max(1.35, w + 0.8);
    this._waveBanner(hl);
  }

  _waveBanner(hl) {
    if (!hl.flag) return;
    const x0 = 5.3, W = hl.flagW, top = hl.flagTop, bot = hl.flagBot, n = 6;
    const wv = (x) => 0.09 * Math.sin(hl.wave - x * 2.3) * ((x - x0) / W + 0.15);
    let up = '', dn = '';
    for (let i = 0; i <= n; i++) {
      const x = x0 + (W * i) / n;
      up += `${i ? 'L' : 'M'}${x.toFixed(2)},${(top + wv(x)).toFixed(3)} `;
      const xb = x0 + W - (W * i) / n;
      dn += `L${xb.toFixed(2)},${(bot + wv(xb)).toFixed(3)} `;
    }
    hl.flag.setAttribute('d', `${up}${dn}Z`);
    const xc = x0 + W / 2;
    hl.flagText.forEach((t, i) => {
      t.setAttribute('x', xc.toFixed(2));
      t.setAttribute('y', (hl.flagY[i] + wv(xc)).toFixed(3));
    });
  }

  _placeHeli(hl) {
    const st = this.stage, G = this.geo, sp = G.sp, k = G.hs * sp;
    let dx = 0, dy = 0, tilt = 0;
    if (hl.inT < hl.inDur) {
      const p = clamp(hl.inT / hl.inDur, 0, 1);
      dx = (1 - ease.out(p)) * (st.w - G.hookX + 11 * k);
      tilt = -8 * (1 - ease.inOut(p)) + 7 * Math.sin(Math.PI * clamp((p - 0.5) / 0.5, 0, 1));
    }
    if (hl.phase === 'out' || hl.phase === 'gone') {
      const p = clamp(hl.outT / OUT_DUR, 0, 1);
      dx = -ease.in(p) * (G.hookX + 7 * k);
      dy = -ease.in(p) * 2.6 * sp;
      tilt = -11 * Math.min(1, p * 3);
    }
    const bob = Math.sin(this.clock * 2.3 + hl.bobPh) * 0.09 * sp;
    tilt += Math.sin(this.clock * 1.4 + hl.bobPh) * 1.2;
    hl.hx = G.hookX - 0.75 * k + dx;
    hl.hy = G.heliY + bob + dy;
    hl.g.setAttribute('transform', `translate(${hl.hx.toFixed(1)} ${hl.hy.toFixed(1)}) rotate(${tilt.toFixed(2)}) scale(${k.toFixed(3)})`);
    hl.bladeA.setAttribute('transform', `scale(${Math.cos(hl.rot).toFixed(3)} 1)`);
    hl.bladeB.setAttribute('transform', `scale(${Math.sin(hl.rot).toFixed(3)} 1)`);
    hl.tailBlade.setAttribute('transform', `rotate(${((hl.rot * 75) % 360).toFixed(1)})`);
    this._waveBanner(hl);
    // the chord rides along while the helicopter flies in, then stays put on the staff
    const cx = G.hookX + (hl.phase === 'out' || hl.phase === 'gone' ? 0 : dx);
    hl.chordG.setAttribute('transform', `translate(${cx.toFixed(1)} 0)`);
    const r = hl.release === null ? 1 : 1 - ease.out(clamp(hl.release / 0.3, 0, 1));
    const hookY = hl.hy + 1.02 * k;
    hl.ropeEl.setAttribute('y1', hookY.toFixed(1));
    hl.ropeEl.setAttribute('y2', (hookY + (hl.slingTop - hookY) * r).toFixed(1));
    hl.ropeEl.setAttribute('x1', (hl.hx + 0.75 * k - cx).toFixed(1));
    hl.ropeEl.setAttribute('opacity', r > 0.02 ? 1 : 0);
    hl.chordG.setAttribute('opacity', hl.release === null ? 1 : clamp(1 - (hl.release - 0.15) / 0.45, 0, 1));
  }

  _stepHeli(hl, dt) {
    hl.rot += dt * 37;
    hl.wave += dt * 7;
    if (hl.inT < hl.inDur) hl.inT = Math.min(hl.inDur, hl.inT + dt);
    if (hl.release !== null) hl.release += dt;
    const arrived = hl.inT >= hl.inDur;
    switch (hl.phase) {
      case 'fly':
        if (arrived) {
          const before = Math.ceil(hl.left);
          hl.left -= dt;
          if (hl.left > 0 && hl.left <= 3 && Math.ceil(hl.left) < before) this.sfx.tick(hl.left < 1);
          if (hl.left <= 0) { hl.left = 0; this._fail(hl, 'time'); }
        }
        break;
      case 'confirm':
        hl.ct -= dt;
        if (hl.ct <= 0) this._success(hl);
        break;
      case 'wrong':
        hl.wt -= dt;
        if (hl.wt <= 0) this._fail(hl, 'wrong');
        break;
      case 'drop': {
        hl.pt += dt;
        while (hl.jumped < hl.men && hl.pt >= 0.2 + hl.jumped * 0.3) this._jump(hl, true);
        if (hl.pt >= 0.95 && hl.release === null) hl.release = 0;
        if (hl.jumped >= hl.men && hl.pt >= 0.55 + hl.men * 0.3 && arrived) this._leave(hl);
        break;
      }
      case 'reveal':
        hl.pt += dt;
        while (hl.jumped < hl.men && hl.pt >= 0.12 + hl.jumped * 0.13) this._jump(hl, false);
        if (hl.pt >= REVEAL && arrived) this._leave(hl);
        break;
      case 'out':
        hl.outT += dt;
        if (hl.outT >= OUT_DUR) { hl.phase = 'gone'; hl.g.remove(); hl.chordG.remove(); return; }
        break;
      default: break;
    }
    this._placeHeli(hl);
  }

  _leave(hl) {
    hl.phase = 'out';
    hl.outT = 0;
    if (hl.release === null) hl.release = 0;
    if (hl === this.cur) this.cur = null;
    this._next();
  }

  // ---------- the chord on the staff ----------
  _drawChord(hl) {
    const st = this.stage, sp = st.sp, g = hl.chordG;
    g.textContent = '';
    hl.ropeEl = svg('line', { x1: 0, x2: 0, class: 'rc-rope', 'stroke-width': Math.max(1.4, 0.1 * sp) }, g);
    const sling = svg('rect', { class: 'rc-sling', 'stroke-width': Math.max(1.2, 0.08 * sp) }, g);
    const col = this._column(g, hl.chord.heads, { halo: true });
    hl.heads = col.els;
    const pad = 0.55 * sp;
    const x0 = col.left - pad, x1 = col.right + pad, y0 = col.top - pad, y1 = col.bottom + pad;
    Object.assign(hl, { slingTop: y0, colLeft: x0, colRight: x1, colTop: col.top, colBottom: col.bottom });
    for (const [k, v] of Object.entries({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 0.7 * sp })) sling.setAttribute(k, v.toFixed(1));
    svg('circle', { cx: 0, cy: y0, r: Math.max(2.5, 0.2 * sp), class: 'rc-shackle', 'stroke-width': Math.max(1.2, 0.08 * sp) }, g);
    hl.wrongRight = null;
    if (hl.wrong.length || hl.stale.length) this._drawWrong(hl);
    if (hl.answered) this._drawCallout(hl);
    this._lit(hl);
  }

  /**
   * A stack of whole notes centred on x = 0 with standard engraving: a note a 2nd above its
   * neighbour sits to the right, ledger lines span every head that needs them, and accidentals
   * stagger into columns so they never collide. Returns the heads by MIDI note and the extents.
   */
  _column(parent, heads, { cls = 'rc-head', halo = false, labels = false, ledgerCls = '' } = {}) {
    const st = this.stage, sp = st.sp, W = HEAD_W * sp;
    const items = heads.map((hd) => {
      const clef = st.clefOf(hd.midi);
      return { ...hd, clef, y: st.yOfStep(hd.step, clef), shift: false };
    }).sort((a, b) => b.y - a.y || a.midi - b.midi);
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      if (a.clef === b.clef && b.step - a.step <= 1 && !a.shift) b.shift = true;
    }
    for (const it of items) it.left = -W / 2 + (it.shift ? W * 0.97 : 0);
    const els = new Map(items.map((it) => [it.midi, {}]));
    if (halo) for (const it of items) els.get(it.midi).halo = svg('ellipse', { cx: it.left + W / 2, cy: it.y, rx: 1.22 * sp, ry: 0.72 * sp, class: 'rc-halo' }, parent);
    const ledg = new Map();
    for (const it of items) {
      const [bot, top] = STAFF[it.clef];
      const steps = [];
      for (let s = bot - 2; s >= it.step; s -= 2) steps.push(s);
      for (let s = top + 2; s <= it.step; s += 2) steps.push(s);
      for (const s of steps) {
        const key = `${it.clef}:${s}`;
        const e = ledg.get(key) || { y: st.yOfStep(s, it.clef), l: Infinity, r: -Infinity };
        e.l = Math.min(e.l, it.left - 0.4 * sp);
        e.r = Math.max(e.r, it.left + W + 0.4 * sp);
        ledg.set(key, e);
      }
    }
    for (const e of ledg.values()) svg('line', { x1: e.l, x2: e.r, y1: e.y, y2: e.y, class: `ar-ledger ${ledgerCls}` }, parent);
    // accidentals against the key signature on the staff (a natural where the key says otherwise)
    let left = -W / 2;
    const sig = keySigMap(st.opts.key);
    for (const it of items) it.acc = it.alter !== (sig[it.letter] || 0) ? it.alter : null;
    const accs = items.filter((it) => it.acc !== null && GLYPH.acc[String(it.acc)]).sort((a, b) => a.y - b.y);
    const cols = [];
    for (const it of accs) {
      let c = 0;
      while ((cols[c] || []).some((o) => Math.abs(o.y - it.y) < 3 * sp)) c++;
      (cols[c] ||= []).push(it);
      const x = -W / 2 - 0.24 * sp - c * 1.15 * sp - ACC_W[it.acc] * sp;
      els.get(it.midi).acc = st.glyph(parent, GLYPH.acc[String(it.acc)], x, it.y, it.cls || cls);
      left = Math.min(left, x);
    }
    let right = W / 2;
    for (const it of items) {
      els.get(it.midi).head = st.glyph(parent, GLYPH.whole, it.left, it.y, it.cls || cls);
      right = Math.max(right, it.left + W);
    }
    if (labels) {
      // names in a column of their own to the right; crowded neighbours take a second column
      const fs = Math.max(0.95 * sp, 11), x0 = right + 0.3 * sp, colW = fs * 1.5;
      const last = [Infinity, Infinity];
      let edge = right;
      for (const it of items) {
        const c = last[0] - it.y >= fs * 0.9 ? 0 : last[1] - it.y >= fs * 0.9 ? 1 : 0;
        last[c] = it.y;
        const t = svg('text', { x: x0 + c * colW, y: it.y + fs * 0.36, 'font-size': fs, class: `rc-wrong-label ${it.cls ? 'rc-stale' : ''}` }, parent);
        t.textContent = nameOf(it);
        edge = Math.max(edge, x0 + c * colW + fs * 0.62 * t.textContent.length);
      }
      right = edge;
    }
    return { els, left, right, top: Math.min(...items.map((i) => i.y)) - 0.5 * sp, bottom: Math.max(...items.map((i) => i.y)) + 0.5 * sp };
  }

  /**
   * What was actually played, in coral beside the chord, each note named. Keys still held from
   * before that aren't in this chord show faintly: they don't count as a miss, but the chord
   * isn't done until they are let go.
   */
  _drawWrong(hl) {
    hl.wrongG?.remove();
    hl.wrongG = null;
    hl.wrongRight = null;
    const list = [...hl.wrong, ...hl.stale.filter((m) => !hl.wrong.includes(m))];
    if (!list.length) return;
    const sp = this.stage.sp;
    hl.wrongG = svg('g', { class: 'rc-played' }, hl.chordG);
    const flats = hl.chord.heads.some((x) => x.alter < 0), sharps = hl.chord.heads.some((x) => x.alter > 0);
    const prefer = flats ? 'flat' : sharps ? 'sharp' : undefined;   // else as the key spells it
    const key = this.stage.opts.key;
    const heads = list.map((m) => ({ ...headOf(m, spell(m, key, prefer).letter), cls: hl.wrong.includes(m) ? '' : 'rc-wrong rc-stale' }));
    const col = this._column(hl.wrongG, heads, { cls: 'rc-wrong', labels: true, ledgerCls: 'rc-wrong-ledger' });
    const dx = hl.colRight + 0.55 * sp - col.left;
    hl.wrongG.setAttribute('transform', `translate(${dx.toFixed(1)} 0)`);
    hl.wrongRight = dx + col.right;
  }

  /** The answer, spelled out next to the chord: its name and its notes. */
  _drawCallout(hl) {
    hl.calloutG?.remove();
    const st = this.stage, sp = st.sp, G = this.geo;
    const g = hl.calloutG = svg('g', { class: 'rc-callout' }, hl.chordG);
    const fs1 = Math.max(1.2 * sp, 14), fs2 = Math.max(0.92 * sp, 11.5);
    const bg = svg('rect', { class: 'rc-callout-bg', rx: Math.max(5, 0.45 * sp) }, g);
    const t1 = svg('text', { 'font-size': fs1, class: 'rc-callout-name' }, g);
    t1.textContent = hl.chord.title;
    const t2 = hl.chord.letters ? svg('text', { 'font-size': fs2, class: 'rc-callout-notes' }, g) : null;
    if (t2) t2.textContent = hl.chord.letters;
    const len = (t, fs) => { let w = 0; try { w = t.getComputedTextLength(); } catch { /* */ } return w || t.textContent.length * fs * 0.55; };
    const padX = 0.55 * sp, padY = 0.4 * sp;
    const w = Math.max(len(t1, fs1), t2 ? len(t2, fs2) : 0) + 2 * padX;
    const hgt = fs1 * 1.05 + (t2 ? fs2 * 1.25 : 0) + 2 * padY;
    let x = (hl.wrongRight ?? hl.colRight) + 0.5 * sp;
    if (G.hookX + x + w > st.right - 2) x = hl.colLeft - 0.5 * sp - w;
    const yc = st.opts.staves === 'grand' ? (st.tTop + st.bTop + 4 * sp) / 2 : st.staffTop + 2 * sp;
    const y = yc - hgt / 2;
    for (const [k, v] of Object.entries({ x, y, width: w, height: hgt })) bg.setAttribute(k, v.toFixed(1));
    hl.callout = { x: x + w / 2, top: y };
    t1.setAttribute('x', (x + padX).toFixed(1));
    t1.setAttribute('y', (y + padY + fs1 * 0.82).toFixed(1));
    if (t2) { t2.setAttribute('x', (x + padX).toFixed(1)); t2.setAttribute('y', (y + padY + fs1 * 1.05 + fs2 * 0.95).toFixed(1)); }
  }

  /** Light the noteheads: green while held, brass for the ones that were missing. */
  _lit(hl) {
    for (const [m, el] of hl.heads || []) {
      const held = hl.armed.has(m) || hl.result === 'ok';
      const cue = hl.result === 'fail' && !hl.armed.has(m);
      for (const n of [el.head, el.acc]) {
        n?.classList.toggle('is-held', held);
        n?.classList.toggle('is-cue', cue);
      }
      el.halo?.classList.toggle('on', held);
      el.halo?.classList.toggle('cue', cue);
    }
  }

  // ---------- input ----------
  noteOn(e) {
    this.down.add(e.midi);
    if (this.mode !== 'play' || !this.playing) return;
    const hl = this.cur;
    if (!hl || !['fly', 'confirm', 'wrong'].includes(hl.phase)) return;
    if (hl.chord.notes.includes(e.midi)) {
      hl.armed.add(e.midi);
      hl.fresh = true;
      this._lit(hl);
      this._check(hl);
      return;
    }
    // a note that isn't in the chord: show it, then judge once the rest of the attempt is in
    if (!hl.wrong.includes(e.midi)) hl.wrong.push(e.midi);
    this.app.keyboard.flash(e.midi, 'miss', 700);
    this._drawWrong(hl);
    if (hl.phase !== 'wrong') { hl.phase = 'wrong'; hl.wt = WRONG_WIN; this.sfx.buzz(); }
  }

  noteOff(e) {
    this.down.delete(e.midi);
    const hl = this.cur;
    if (!hl || hl.phase !== 'fly') return;
    if (hl.armed.delete(e.midi)) this._lit(hl);
    this._check(hl);
  }

  /** Is the whole chord down, with nothing else held? Then listen briefly for strays and judge. */
  _check(hl) {
    const stale = [...this.down].filter((m) => !hl.chord.notes.includes(m)).sort((a, b) => a - b);
    if (stale.join() !== hl.stale.join()) { hl.stale = stale; this._drawWrong(hl); }
    const all = hl.chord.notes.every((m) => hl.armed.has(m));
    if (hl.phase !== 'fly' || !hl.fresh || !all) return;
    if (stale.length) { this.app.ui.status('Let go of the other keys.'); return; }
    hl.phase = 'confirm';
    hl.ct = GRACE;
    hl.doneLeft = hl.inT < hl.inDur ? hl.time : hl.left;
    hl.took = this.clock - hl.born;
  }

  // ---------- outcomes ----------
  _success(hl) {
    hl.phase = 'drop'; hl.pt = 0; hl.result = 'ok';
    if (this.cur === hl) this.cur = null;
    const frac = clamp(hl.doneLeft / hl.time, 0, 1);
    const bonus = Math.round(TIME_PTS * frac);
    const pts = MAN_PTS * hl.men;
    this._tally(hl, true, frac < 0.35);
    this.score += pts + bonus;
    this.bonus += bonus;
    this.good++; this.landed += hl.men; this.menSeen += hl.men;
    this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.fastest = Math.min(this.fastest, hl.took);
    this.app.coach.record('hit');
    this.sfx.bell();
    for (const m of hl.chord.notes) this.app.keyboard.flash(m, 'hit', 500);
    this._answer(hl);
    // the points rise from just above the answer, clear of the helicopter and the jumpers
    const st = this.stage, sp = st.sp, x = this.geo.hookX + hl.callout.x, y = hl.callout.top - 0.5 * sp;
    st.float(x, y, `+${pts}`);
    if (bonus) this._after(0.45, () => st.float(x, y, `+${bonus} time`, 'ar-float rc-float-time'));
    this._hud();
  }

  _fail(hl, why) {
    hl.phase = 'reveal'; hl.pt = 0; hl.result = 'fail';
    if (this.cur === hl) this.cur = null;
    this.bad++; this.menSeen += hl.men; this.streak = 0;
    this._tally(hl, false);
    const missing = hl.chord.notes.filter((m) => !hl.armed.has(m));
    if (why === 'time') {
      this.app.coach.record('missed', { expected: missing[0] ?? hl.chord.notes[0] });
      this.sfx.buzz();
    } else {
      for (const p of hl.wrong.slice(0, hl.men)) {   // a fistful of keys counts once per note wanted
        const pool = missing.length ? missing : hl.chord.notes;
        const expected = pool.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));
        this.app.coach.record('wrong-pitch', { expected, played: p, key: 'C' });
      }
      if (missing.length > hl.wrong.length) this.app.coach.record('chord');
    }
    const cue = this.stage.opts.staves === 'bass' || hl.chord.notes.every((m) => m < 60) ? 'cue-l' : 'cue-r';
    for (const m of hl.chord.notes) this.app.keyboard.flash(m, cue, (REVEAL - 0.2) * 1000);
    this._answer(hl, why === 'time' ? 'Out of time.' : 'Not quite.');
    // and hear it: the right chord, gently rolled
    this._after(0.6, () => {
      if (!this.app.sound.ready || this.mode === 'off') return;
      const t = this.app.sound.now();
      hl.chord.notes.forEach((m, i) => this.app.sound.play(m, 0.5, t + i * 0.035, 1.3));
    });
    this._hud();
  }

  /** Name the chord: on the banner, beside the notes, and in the status line. */
  _answer(hl, lead = '') {
    hl.revealed = true;
    hl.answered = true;
    this._drawBanner(hl);
    this._drawCallout(hl);
    this._lit(hl);
    const c = hl.chord;
    const from = c.from ? ` (the song’s ${c.from}, as a triad)` : '';
    const streak = this.streak > 2 ? ` · ${this.streak} in a row` : '';
    const bars = c.span && this.plan ? ` · ${this._barsText(c.span)}` : '';
    this.app.ui.status(`${lead ? `${lead} ` : ''}${c.long}${c.letters ? `: ${c.letters}` : ''}${from}${bars}${streak}`);
  }

  // ---------- parachutists ----------
  _man(i, idx) {
    const g = svg('g', { class: 'rc-man' }, this.menG);
    const [c1, c2] = CANOPIES[(idx + i) % 4];
    const m = { g, t: 0, rx: 0, ry: 0, vx: 0, vy: 0, rot: 0, sx: 1, sy: 1, op: 1, cs: 0, fold: 0, stars: 0, ph: rand(0, 6), walk: 0 };
    m.canopy = svg('g', {}, g);
    svg('path', { d: LINES, class: 'rc-lines' }, m.canopy);
    svg('path', { d: DOME, fill: c1, class: 'rc-dome' }, m.canopy);
    svg('path', { d: GORE, fill: c2 }, m.canopy);
    svg('path', { d: 'M-0.98,-3.42 C-0.88,-3.72 -0.62,-3.84 -0.4,-3.87', class: 'rc-shine' }, m.canopy);
    m.legs = svg('path', { d: legs(0), class: 'rc-limb' }, g);
    svg('rect', { x: -0.21, y: -1.3, width: 0.42, height: 0.76, rx: 0.17, class: 'rc-suit' }, g);
    m.arms = svg('path', { d: ARMS.free, class: 'rc-limb' }, g);
    svg('circle', { cx: 0, cy: -1.52, r: 0.25, fill: HELMETS[(idx + i) % 4], class: 'rc-helmet' }, g);
    svg('rect', { x: -0.17, y: -1.57, width: 0.34, height: 0.11, rx: 0.055, class: 'rc-visor' }, g);
    m.starG = svg('g', { opacity: 0 }, g);
    m.starEls = [0, 1, 2].map(() => svg('path', { d: STAR, class: 'rc-star' }, m.starG));
    this.men.push(m);
    return m;
  }

  _pose(m, k) { if (m.pose !== k) { m.pose = k; m.arms.setAttribute('d', ARMS[k]); } }

  /** The next jumper leaves the door: with a chute after a right chord, without after a miss. */
  _jump(hl, chute) {
    const G = this.geo, sp = G.sp, k = G.hs * sp;
    const i = hl.jumped++;
    const m = this._man(i, hl.idx);
    m.rx = (hl.hx + this._crewX(hl.men, i) * k - G.hookX) / sp;
    m.ry = (hl.hy + 0.58 * k - G.groundY) / sp;
    if (chute) {
      m.state = 'free'; m.vx = -2.3 + rand(-0.3, 0.3); m.vy = -1.4;
      m.lx = (G.padX - G.hookX) / sp + (i - (hl.men - 1) / 2) * 1.35 + rand(-0.15, 0.15);
      m.dur = rand(1.95, 2.35);
    } else {
      // aim each one at its own patch of ground between the pad and the chord
      m.state = 'tumble'; m.vy = -1.8;
      const fall = (-m.vy + Math.sqrt(m.vy * m.vy - 60 * m.ry)) / 30;
      const lx = (G.padX - G.hookX) / sp + 2.6 + (i - (hl.men - 1) / 2) * 1.4;
      m.vx = (lx - m.rx) / Math.max(0.3, fall);
      m.spin = rand(420, 640) * (i % 2 ? -1 : 1);
      m.loud = i === 0;
    }
    this._crew(hl);
    this.sfx.whoosh();
    this._placeMan(m);
  }

  /** Attract screen: a parachutist drifting down onto the pad now and then. */
  _floater() {
    const G = this.geo, sp = G.sp;
    const m = this._man(Math.floor(rand(0, 4)), 0);
    m.state = 'chute';
    m.t = 0.4;
    m.ox = m.rx = (G.padX - G.hookX) / sp + rand(-2.5, 2.5);
    m.oy = m.ry = (this.stage.staffTop - 2 * sp - G.groundY) / sp;
    m.lx = (G.padX - G.hookX) / sp + rand(-0.6, 0.6);
    m.dur = 4.6;
    this._pose(m, 'up');
    this._placeMan(m);
  }

  _stepMan(m, dt) {
    const lerp = (a, b, p) => a + (b - a) * p;
    const G = this.geo, sp = G.sp;
    m.t += dt;
    switch (m.state) {
      case 'free':      // out of the door, chute still packed
        this._pose(m, 'free');
        m.vy += 15 * dt; m.rx += m.vx * dt; m.ry += m.vy * dt;
        if (m.t >= 0.3) { m.state = 'chute'; m.t = 0; m.ox = m.rx; m.oy = m.ry; this._pose(m, 'up'); this.sfx.pop(); }
        break;
      case 'chute': {   // the canopy blooms, then a slow swaying drift down to the pad
        const p = Math.min(1, m.t / m.dur);
        m.cs = ease.back(Math.min(1, m.t / 0.4));
        const sway = Math.sin(m.t * 2.7 + m.ph);
        m.rx = lerp(m.ox, m.lx, ease.inOut(p)) + sway * 0.3 * (1 - p);
        m.ry = lerp(m.oy, 0, p);
        m.rot = sway * 10 * (1 - 0.85 * p);
        if (p >= 1) {
          m.state = 'landed'; m.t = 0; m.ry = 0; m.rot = 0;
          this._dust(G.hookX + m.rx * sp, G.groundY, 3, 0.6);
        }
        break;
      }
      case 'landed':    // the chute folds away, a little cheer, then off he goes
        m.fold = Math.min(1, m.t / 0.5);
        m.sy = m.t < 0.18 ? 1 - 0.16 * Math.sin((m.t / 0.18) * Math.PI) : 1;
        if (m.t > 0.45 && m.t < 0.95) { this._pose(m, 'cheer'); m.ry = -0.35 * Math.sin(((m.t - 0.45) / 0.5) * Math.PI); }
        if (m.t >= 0.95) { m.state = 'walk'; m.t = 0; m.ry = 0; this._pose(m, 'down'); }
        break;
      case 'tumble':    // no chute: arms windmilling all the way down
        this._pose(m, Math.sin(m.t * 26) > 0 ? 'free' : 'cheer');
        m.vy += 30 * dt; m.rx += m.vx * dt; m.ry += m.vy * dt; m.rot += m.spin * dt;
        if (m.ry >= 0) {
          m.ry = 0; m.state = 'splat'; m.t = 0; m.rot = 0;
          this._dust(G.hookX + m.rx * sp, G.groundY, 8);
          if (m.loud) this.sfx.splat(); else this.sfx.pop();
        }
        break;
      case 'splat': {   // flat as a pancake, boing back up, see stars, walk it off
        if (m.t < 0.18) { m.sx = 1.55; m.sy = 0.4; this._pose(m, 'free'); }
        else if (m.t < 0.55) {
          const p = (m.t - 0.18) / 0.37;
          m.sx = lerp(1.55, 1, ease.out(p)); m.sy = lerp(0.4, 1, ease.out(p));
          m.ry = -0.9 * Math.sin(p * Math.PI);
          this._pose(m, 'down');
        } else {
          m.sx = m.sy = 1; m.ry = 0;
          m.rot = Math.sin(m.t * 10) * 7;
          m.stars = Math.min(1, (m.t - 0.55) * 6);
        }
        if (m.t >= 1.75) { m.state = 'walk'; m.t = 0; m.rot = 0; m.stars = 0; }
        break;
      }
      case 'walk':      // stroll off to the left and fade
        m.rx -= 1.7 * dt;
        m.walk = Math.sin(m.t * 11);
        m.ry = -0.05 * Math.abs(m.walk);
        m.op = Math.max(0, 1 - Math.max(0, m.t - 0.35) / 0.7);
        if (m.op <= 0) { m.state = 'gone'; m.g.remove(); return; }
        break;
      default: break;
    }
    this._placeMan(m);
  }

  /** A puff of dust rolling out along the ground. */
  _dust(x, y, n, size = 1) {
    const st = this.stage, sp = st.sp;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1, dx = rand(0.5, 2) * sp * dir * size, up = rand(0.2, 0.9) * sp * size;
      const r0 = rand(0.22, 0.4) * sp * size;
      const c = svg('circle', { cx: x, cy: y - r0 * 0.6, r: r0, class: 'rc-dust' }, st.layers.fx);
      st.tween(rand(0.55, 0.85), (p) => {
        c.setAttribute('cx', (x + dx * p).toFixed(1));
        c.setAttribute('cy', (y - r0 * 0.6 - up * p).toFixed(1));
        c.setAttribute('r', (r0 * (1 + 0.9 * p)).toFixed(1));
        c.setAttribute('opacity', (0.5 * (1 - p)).toFixed(3));
      }, { ease: ease.out, done: () => c.remove() });
    }
  }

  _placeMan(m) {
    const G = this.geo, sp = G.sp, k = G.ms * sp;
    const x = G.hookX + m.rx * sp, y = G.groundY + m.ry * sp;
    m.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)}) scale(${m.sx.toFixed(3)} ${m.sy.toFixed(3)}) rotate(${m.rot.toFixed(1)} 0 -0.9)`);
    m.g.setAttribute('opacity', m.op.toFixed(3));
    const cs = m.cs, f = m.fold;
    m.canopy.setAttribute('opacity', cs > 0.01 ? (1 - f).toFixed(3) : 0);
    if (cs > 0.01) m.canopy.setAttribute('transform', `translate(0 -1.66) rotate(${(-80 * f).toFixed(1)}) scale(${((0.2 + 0.8 * cs) * (1 - 0.35 * f)).toFixed(3)} ${(cs * (1 - 0.8 * f)).toFixed(3)}) translate(0 1.66)`);
    m.legs.setAttribute('d', legs(m.state === 'walk' ? m.walk : 0));
    m.starG.setAttribute('opacity', m.stars.toFixed(2));
    if (m.stars > 0) {
      m.starEls.forEach((s, i) => {
        const a = m.t * 6 + (i * Math.PI * 2) / 3;
        s.setAttribute('transform', `translate(${(Math.cos(a) * 0.6).toFixed(3)} ${(-2.08 + Math.sin(a) * 0.2).toFixed(3)}) scale(1.7)`);
      });
    }
  }

  // ---------- timer, HUD, title card ----------
  _timer(rebuild = false) {
    const st = this.stage, sp = st.sp;
    if (rebuild || !this.timerG || !this.timerG.isConnected) {
      this.timerG?.remove();
      const R = Math.max(1.45 * sp, 20);
      const cx = st.right - R - 0.4 * sp, cy = R + Math.max(0.4 * sp, 6);
      const g = this.timerG = svg('g', { class: 'rc-timer', transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})` }, st.layers.hud);
      svg('circle', { r: R, class: 'rc-timer-bg' }, g);
      svg('circle', { r: R * 0.8, class: 'rc-timer-track', 'stroke-width': R * 0.17 }, g);
      this.timerArc = svg('circle', { r: R * 0.8, class: 'rc-timer-arc', 'stroke-width': R * 0.17, pathLength: 100, transform: 'rotate(-90)' }, g);
      this.timerNum = svg('text', { y: R * 0.29, 'text-anchor': 'middle', 'font-size': R * 0.8, class: 'rc-timer-num' }, g);
    }
    this._updateTimer();
  }

  _updateTimer() {
    if (!this.timerG) return;
    const c = this.cur;
    this.timerG.setAttribute('opacity', this.mode !== 'play' ? 0 : c ? 1 : 0.35);
    const left = c ? (c.inT < c.inDur ? c.time : c.left) : 0;
    const frac = c ? clamp(left / c.time, 0, 1) : 0;
    this.timerArc.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(2)} 100`);
    this.timerArc.setAttribute('opacity', frac > 0.004 ? 1 : 0);
    this.timerArc.classList.toggle('mid', frac <= 0.5 && frac > 0.25);
    this.timerArc.classList.toggle('low', frac <= 0.25);
    const txt = c ? String(Math.max(0, Math.ceil(left - 1e-6))) : '';
    if (this.timerNum.textContent !== txt) this.timerNum.textContent = txt;
  }

  _hud() {
    const st = this.stage, G = this.geo, sp = st.sp;
    if (!this.hudG || !this.hudG.isConnected) this.hudG = svg('g', { class: 'ar-hudtext' }, st.layers.hud);
    const g = this.hudG;
    g.textContent = '';
    if (this.mode !== 'play') { this.stripG?.remove(); this.stripG = null; return; }
    const fs = clamp(sp * 0.95, 11, 17);
    const y = G.groundY + G.band * 0.56 + fs * 0.35;
    const label = (x, anchor, k, v) => {
      const t = svg('text', { x, y, 'text-anchor': anchor, 'font-size': fs, class: 'ar-hud' }, g);
      svg('tspan', { class: 'ar-hud-k' }, t).textContent = `${k} `;
      svg('tspan', { class: 'ar-hud-v' }, t).textContent = v;
    };
    label(st.left + 0.6 * sp, 'start', 'SCORE', this.score.toLocaleString());
    if (this.plan && this.songTitle) { this._strip(); return; }
    label(st.right - 0.6 * sp, 'end', `${this.noun.toUpperCase()}S`, `${this.good} played · ${this.total - this.good - this.bad} to go`);
  }

  /**
   * Song mode: the progression as a strip of chord cells along the ground, the current chord lit,
   * the played ones marked, a repeat sign where a repeated section was skipped. Long songs scroll.
   */
  _strip() {
    const st = this.stage, G = this.geo, sp = st.sp, plan = this.plan;
    this.stripG?.remove();
    this.stripG = null;
    if (this.mode !== 'play' || !plan || !this.songTitle) return;
    const g = this.stripG = svg('g', { class: 'rc-strip' }, st.layers.hud);
    const fs = clamp(sp * 0.78, 10.5, 15), ch = Math.min(G.band * 0.66, fs * 1.85), gap = fs * 0.3;
    const cy = G.groundY + G.band * 0.54;
    const x0 = st.left + 0.6 * sp + clamp(sp * 0.95, 11, 17) * 7.2, x1 = st.right - 0.6 * sp, room = x1 - x0;
    const n = plan.spans.length;
    // the chord in the air is lit; between helicopters the strip stays on the last one played
    const now = this.cur ? this.cur.idx : -1;
    const at = this.cur ? this.cur.idx : clamp(this.spawned - (this.passCard && this.spawned === n ? 0 : 1), 0, this.total - 1);
    const base = at >= n ? n : 0;                        // which time through
    const cells = plan.spans.map(({ span }, k) => {
      const i = base + k, r = this.results[i];
      const label = this.seq[i].pass === 2 && !r ? '?' : this.seq[i].name;
      const w = fs * (0.6 * label.length + 1.2) + Math.min(4, span.beats / plan.bpb) * fs * 0.45;
      return { i, label, w, r, now: i === now, repeat: span.repeat ? fs * 1.3 : 0 };
    });
    const width = (a, b) => cells.slice(a, b + 1).reduce((t, c) => t + c.w + gap + c.repeat, 0);
    let a = 0, b = cells.length - 1;
    if (width(a, b) > room) {
      const k = clamp(at - base, 0, cells.length - 1);
      a = b = k;
      while (a > 0 && width(a - 1, b) < room * 0.3) a--;
      while (b < cells.length - 1 && width(a, b + 1) <= room - fs) b++;
      while (a > 0 && width(a - 1, b) <= room - fs) a--;
    }
    let x = x0;
    const more = (xx) => { const t = svg('text', { x: xx, y: cy + fs * 0.36, 'font-size': fs, 'text-anchor': 'middle', class: 'rc-cell-more' }, g); t.textContent = '…'; };
    if (a > 0) { more(x + fs * 0.4); x += fs; }
    for (const c of cells.slice(a, b + 1)) {
      const cls = c.now ? ' now' : c.r === 'ok' ? ' ok' : c.r === 'miss' ? ' miss' : '';
      svg('rect', { x: x.toFixed(1), y: (cy - ch / 2).toFixed(1), width: c.w.toFixed(1), height: ch.toFixed(1), rx: (ch * 0.3).toFixed(1), class: `rc-cell${cls}` }, g);
      const t = svg('text', { x: (x + c.w / 2).toFixed(1), y: (cy + fs * 0.36).toFixed(1), 'font-size': fs, 'text-anchor': 'middle', class: `rc-cell-t${cls}` }, g);
      t.textContent = c.label;
      x += c.w + gap;
      if (c.repeat) {
        // a repeat sign: what follows in the song is a section already played
        const rs = svg('text', { x: x.toFixed(1), y: (cy + ch / 2).toFixed(1), 'font-size': ch, class: 'ar-glyph rc-cell-rpt' }, g);
        rs.textContent = '\uE041';
        x += c.repeat;
      }
    }
    if (b < cells.length - 1) more(Math.min(x1 - fs * 0.4, x + fs * 0.4));
  }

  /** Tally a resolved chord: for the strip, and per chord of the song for the results. */
  _tally(hl, ok, slow = false) {
    this.results[hl.idx] = ok ? 'ok' : 'miss';
    if (!this.plan || !this.songTitle) return;
    const s = this.chordStats.get(hl.chord.name) || { chord: hl.chord, tries: 0, miss: 0, slow: 0 };
    s.tries++;
    if (!ok) s.miss++; else if (slow) s.slow++;
    this.chordStats.set(hl.chord.name, s);
  }

  _titleCard(kicker, title) {
    const st = this.stage, sp = st.sp;
    const g = svg('g', { class: 'rc-titlecard' }, st.layers.hud);
    const fs1 = Math.max(0.8 * sp, 11), fs2 = Math.max(1.6 * sp, 18);
    const cx = st.w / 2, cy = st.staffTop + 2 * sp;
    const bg = svg('rect', { class: 'rc-callout-bg', rx: 10 }, g);
    const t1 = svg('text', { x: cx, y: cy - fs2 * 0.45, 'text-anchor': 'middle', 'font-size': fs1, class: 'rc-title-k' }, g);
    t1.textContent = kicker.toUpperCase();
    const t2 = svg('text', { x: cx, y: cy + fs2 * 0.62, 'text-anchor': 'middle', 'font-size': fs2, class: 'rc-title-t' }, g);
    t2.textContent = title;
    let w = 0;
    try { w = Math.max(t1.getComputedTextLength(), t2.getComputedTextLength()); } catch { /* */ }
    w = Math.min(st.w - 16, (w || title.length * fs2 * 0.55) + 2.4 * sp);
    const hh = fs1 + fs2 * 1.5 + 1.2 * sp;
    for (const [k, v] of Object.entries({ x: cx - w / 2, y: cy - hh / 2 - fs1 * 0.2, width: w, height: hh })) bg.setAttribute(k, v.toFixed(1));
    st.tween(1.9, (p) => g.setAttribute('opacity', p < 0.12 ? p / 0.12 : p > 0.8 ? (1 - p) / 0.2 : 1), { done: () => g.remove() });
  }

  _end(stopped) {
    if (this.mode !== 'play') return;
    this.mode = 'over';
    this.cur = null;
    this.timers = [];
    this.rotorStop?.();
    this.rotorStop = null;
    for (const hl of this.helis) if (hl.phase !== 'out') { hl.phase = 'out'; hl.outT = 0; if (hl.release === null) hl.release = 0; }
    const total = stopped ? Math.max(1, this.good + this.bad) : this.total;
    const men = stopped ? Math.max(this.menSeen, 1) : this.seq.reduce((a, c) => a + c.notes.length, 0);
    const acc = this.good / total;
    this._timer();
    this._hud();
    this.app.ui.status('');
    if (!stopped && acc >= 0.9) this.sfx.fanfare();
    const passed = acc >= (this.embedded?.pass ?? 0.7);
    if (this.plan && this.songTitle) {
      this.finish({ score: this.score, accuracy: acc, passed, ...this._songResults(total) });
      return;
    }
    this.finish({
      score: this.score,
      accuracy: acc,
      passed,
      detail: `${this.good} of ${total} ${this.noun}s played, ${this.landed} parachutist${this.landed === 1 ? '' : 's'} landed safely.`,
      stats: [
        [`${this.noun === 'note' ? 'Notes' : 'Chords'} played`, `${this.good} of ${total}`],
        ['Parachutists landed', `${this.landed} of ${men}`],
        ['Time bonus', `+${this.bonus.toLocaleString()}`],
        [`Fastest ${this.noun}`, this.fastest < Infinity ? `${this.fastest.toFixed(1)} s` : '–'],
      ],
    });
  }

  /** Song mode results: what part of the song was covered, and which of its chords were shaky. */
  _songResults(total) {
    const plan = this.plan;
    const done = this.seq.slice(0, this.good + this.bad);
    const upTo = done.length ? Math.max(...done.map((c) => c.span.toBar)) : plan.from;
    const shaky = [...this.chordStats.values()].filter((x) => x.miss || x.slow).sort((a, b) => b.miss - a.miss || b.slow - a.slow);
    const top = shaky[0];
    let work;
    if (top) {
      const what = top.miss ? `missed ${top.miss} of ${top.tries} time${top.tries === 1 ? '' : 's'}` : `slow ${top.slow} of ${top.tries} time${top.tries === 1 ? '' : 's'}`;
      work = `Work on ${top.chord.long} (${top.chord.letters || top.chord.name}): ${what}.`;
    } else if (!done.length) work = '';
    else work = plan.hands === 'R' && this.songHasHand('L') ? 'Every chord was solid. Try the left hand next.' : 'Every chord was solid. Now play the song for real.';
    const rep = plan.repeats.filter((r) => r.from <= upTo + 1);
    return {
      detail: `${plan.title}${plan.hands === 'L' ? ', left hand' : ''}, ${this._coverText(plan, upTo)}: ${this.good} of ${total} chords played. ${work}`.trim(),
      stats: [
        ['Chords played', `${this.good} of ${total}${plan.passes > 1 ? ' (twice through)' : ''}`],
        ['Bars covered', `${plan.from + 1}–${upTo + 1} of ${plan.nBars}${rep.length ? ` (${rep.map((r) => `${r.from + 1}–${r.to + 1}`).join(', ')} repeat)` : ''}`],
        ['Shaky chords', shaky.length ? shaky.slice(0, 4).map((x) => x.chord.name).join(', ') : 'None'],
        ['Time bonus', `+${this.bonus.toLocaleString()}`],
      ],
    };
  }

  exit() {
    this.mode = 'off';
    this.rotorStop?.();
    this.rotorStop = null;
    super.exit();
  }
}
