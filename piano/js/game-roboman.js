// Roboman: the Miracle's rhythm game. A little robot rolls across the piano factory at the tempo of
// a rhythm written on the strip along the bottom. Short notes are power plugs dangling over his
// path: tap any key right on the note to grab one and refuel. Long notes are gaps in the walkway:
// press on the note and hold it for its full value while Roboman builds a bridge under his treads.
// Rests are solid floor, and presses there burn fuel. A fall costs a chance and sends him back to
// the start of that bar, with his fuel as it was. Song mode walks through a whole song's rhythm a
// few bars at a time, with a checkpoint between sections that refuels him and adjusts the tempo.
import { ArcadeBase, svg, rand, pick, ease, clamp, PAINT } from './arcade.js';
import { parseVoice, buildScore } from './theory.js';
import { h } from './ui.js';

const PERFECT = 0.06, GOOD = 0.11, WINDOW = 0.18;   // seconds either side of a note's start
const SLACK = 0.035;       // input events can land a frame after the deadline they beat
const CHORD = 0.07;        // presses closer together than this count as one
const WASTE = 6;           // percent of the tank burnt by a press where no note starts
const CHANCES = 3;
const PARA = 0.35;         // the back wall scrolls at this fraction of the walkway speed
const DOCK = 1.6;          // beats past the last bar line where the charging dock stands
const STRIP_BG = '#152a23';
const eps = 1e-6;

const GL = {
  head: { 4: '', 2: '', 1: '' },
  flag: { 0.5: '', 0.25: '' },
  rest: { 4: '', 2: '', 1: '', 0.5: '', 0.25: '' },
  dot: '', perc: '',
  digits: (n) => [...String(n)].map((d) => String.fromCharCode(0xE080 + +d)).join(''),
};
/** Note values the strip can draw, as [base value, dots]. */
const VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];
const BASE = { 4: [4, 0], 3: [2, 1], 2: [2, 0], 1.5: [1, 1], 1: [1, 0], 0.75: [0.5, 1], 0.5: [0.5, 0], 0.375: [0.25, 1], 0.25: [0.25, 0] };
const REST_W = { 4: 1.13, 2: 1.13, 1: 1.08, 0.5: 1.0, 0.25: 1.28 };
const NAMES = { 4: 'whole note', 3: 'dotted half note', 2: 'half note', 1.5: 'dotted quarter note', 1: 'quarter note', 0.75: 'dotted eighth note', 0.5: 'eighth note', 0.25: 'sixteenth note' };
const RB = { brass: '#d9a93a', brassD: '#b4861f', chalk: '#e8ede3', chalkD: '#b9c7bd', ink: '#1a1d1b', steel: '#33493f', steelL: '#62786d', mint: '#62c993', coral: '#e9705a', blue: '#8fb7de' };

const valueKey = (d) => VALUES.reduce((a, v) => (Math.abs(v - d) < Math.abs(a - d) ? v : a), VALUES[0]);
const plural = (n, w) => `${+n.toFixed(1)} ${w}${Math.abs(n - 1) < 0.05 ? '' : 's'}`;

/** ['5', '6', '9'] -> "in bars 5–6 and 9" (bar 0 is a pickup). */
function barList(labels) {
  const nums = [...new Set(labels.map(Number))].filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  const parts = [];
  for (const n of nums) { const last = parts[parts.length - 1]; if (last && n === last[1] + 1) last[1] = n; else parts.push([n, n]); }
  if (!parts.length) return '';
  if (parts.length === 1 && parts[0][0] === parts[0][1]) return parts[0][0] === 0 ? 'in the pickup' : `in bar ${parts[0][0]}`;
  const txt = parts.slice(0, 4).map(([a, b]) => (a === b ? String(a) : `${a}–${b}`));
  if (parts.length > 4) return `in bars ${txt.join(', ')} and elsewhere`;
  return `in bars ${txt.length > 1 ? `${txt.slice(0, -1).join(', ')} and ${txt[txt.length - 1]}` : txt[0]}`;
}

/** A small seeded random generator, so the scenery stays put when the stage is redrawn. */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ---------- rhythms ----------
/** 'q q h~ | rq' (our bar patterns) to a voice string on a dummy pitch. */
const voiceOf = (pattern) => pattern.split(/\s+/).map((tok) => (tok === '|' || tok[0] === 'r' ? tok : `B4${tok}`)).join(' ');

/** Voice events for one hand to rhythm tokens { t, d, rest, tied, tieNext }: chords count once. */
function tokensFromEvents(events) {
  const groups = [];
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.t - e.t) < eps) g.list.push(e); else groups.push({ t: e.t, list: [e] });
  }
  return groups.map((g, i) => {
    const notes = g.list.filter((e) => !e.rest);
    const next = groups[i + 1] ? groups[i + 1].t : Infinity;
    const d = Math.min(Math.max(...(notes.length ? notes : g.list).map((e) => e.d)), next - g.t);
    if (!notes.length) return { t: g.t, d, rest: true };
    return { t: g.t, d, rest: false, tied: notes.every((e) => e.tiedFrom), tieNext: notes.some((e) => e.tieTo) };
  });
}

/** Rests in the gaps, so the tokens cover 0..length. */
function fillGaps(tokens, length) {
  const out = [];
  let at = 0;
  for (const tk of tokens) {
    if (tk.t > at + eps) out.push({ t: at, d: tk.t - at, rest: true });
    if (tk.t + tk.d > at + eps) out.push(tk.t < at ? { ...tk, t: at, d: tk.t + tk.d - at } : tk);
    at = Math.max(at, tk.t + tk.d);
  }
  if (length > at + eps) out.push({ t: at, d: length - at, rest: true });
  return out;
}

/** Pad a pickup bar at the front and the last bar at the end with rests, so every bar is whole. */
function wholeBars(tokens, length, pickup, bpb) {
  let toks = tokens;
  if (pickup > eps && pickup < bpb - eps) {
    const sh = bpb - pickup;
    toks = [{ t: 0, d: sh, rest: true }, ...toks.map((k) => ({ ...k, t: k.t + sh }))];
    length += sh;
  }
  const full = Math.max(bpb, Math.ceil(length / bpb - 1e-4) * bpb);
  return { tokens: fillGaps(toks, full).filter((k) => k.t < full - eps).map((k) => ({ ...k, d: Math.min(k.d, full - k.t) })), length: full };
}

const cutBars = ({ tokens, length }, n, bpb) => {
  const end = Math.min(length, n * bpb);
  return { tokens: tokens.filter((k) => k.t < end - eps).map((k) => ({ ...k, d: Math.min(k.d, end - k.t) })), length: end };
};

const loopBars = ({ tokens, length }, reps) => ({
  tokens: Array.from({ length: reps }, (_, r) => tokens.map((k) => ({ ...k, t: k.t + r * length }))).flat(),
  length: length * reps,
});

/** Can a value v start at p beats into the bar and still read clearly? */
function fits(p, v, compound) {
  const on = (x, m) => Math.abs(x / m - Math.round(x / m)) < 1e-4;
  const within = (g) => Math.floor(p / g + 1e-6) === Math.floor((p + v) / g - 1e-6);
  if (compound) {
    if (v >= 3) return on(p, 3);
    if (v === 1.5) return on(p, 1.5);
    return within(1.5);
  }
  if (v >= 4) return p < eps;
  if (v >= 2) return on(p, 1);
  if (v >= 1) return on(p, 0.5);
  return within(1);
}

/** Split tokens at bar lines and into values the strip can draw; long notes become ties. */
function spellTokens(tokens, bpb, compound) {
  const out = [];
  for (const tk of tokens) {
    const end = tk.t + tk.d, pieces = [];
    let t = tk.t;
    while (end - t > 0.12) {
      const bar = Math.floor(t / bpb + 1e-6) * bpb;
      const room = Math.min(end, bar + bpb) - t;
      const v = VALUES.find((x) => x <= room + eps && fits(t - bar, x, compound)) ?? Math.min(room, 0.25);
      pieces.push({ t, d: v });
      t += v;
    }
    pieces.forEach((pc, i) => out.push(tk.rest ? { ...pc, rest: true, pad: !!tk.pad }
      : { ...pc, rest: false, tied: i > 0 || !!tk.tied, tieNext: i < pieces.length - 1 || !!tk.tieNext }));
  }
  return out;
}

/**
 * Build a course: drawable tokens, the notes Roboman meets (plugs and gaps), rests and the fuel
 * economy. Notes no longer than plugMax beats are plugs; longer ones are gaps to bridge.
 */
function makeCourse({ tokens: raw, length }, time, { plugMax = 1, sections = null, barMap = null, barLabel = (b) => String(b + 1), ...extra } = {}) {
  const bpb = (time[0] * 4) / time[1];
  const compound = time[1] === 8 && time[0] % 3 === 0 && time[0] > 3;
  const unit = 4 / time[1];
  const tokens = spellTokens(fillGaps(raw, length), bpb, compound);
  const notes = [], rests = [], pads = [];
  const merge = (list, tk) => {
    const last = list[list.length - 1];
    if (last && Math.abs(last.t + last.d - tk.t) < eps) last.d += tk.d; else list.push({ t: tk.t, d: tk.d });
  };
  let cur = null;
  tokens.forEach((tk, k) => {
    if (tk.rest) {
      cur = null;
      merge(tk.pad ? pads : rests, tk);   // pads (a pickup's silent start, a checkpoint bar) are counted, not rests
      return;
    }
    if (tk.tied && cur && cur.open) { cur.d += tk.d; cur.toks.push(k); }
    else { cur = { i: notes.length, t: tk.t, d: tk.d, toks: [k] }; notes.push(cur); }
    cur.open = tk.tieNext;
    tk.note = cur.i;
  });
  const bars = Math.round(length / bpb);
  barMap ||= Array.from({ length: bars }, (_, i) => i);
  for (const n of notes) {
    n.end = n.t + n.d;
    n.kind = n.d > plugMax + eps ? 'bridge' : 'plug';
    n.bar = Math.floor(n.t / bpb + 1e-6);
    n.label = barLabel(barMap[n.bar] ?? n.bar);
    delete n.open;
  }
  let minIOI = 4;
  for (let i = 1; i < notes.length; i++) minIOI = Math.min(minIOI, notes[i].t - notes[i - 1].t);
  const perBar = Math.round(bpb / unit);
  // fuel: a clean run with no plugs grabbed would end nearly dry, and each plug tops the tank up.
  // Song sections refuel at each checkpoint, so they burn more gently: a fall replays bars there.
  const song = !!sections;
  sections ||= [{ start: 0, end: length, from: barMap[0], to: barMap[bars - 1] }];
  sections.forEach((sec, i) => {
    const ns = notes.filter((n) => n.t >= sec.start - eps && n.t < sec.end - eps);
    const span = Math.max(ns.filter((n) => n.kind === 'bridge').reduce((a, n) => a + n.d, 0), song ? 2 * bpb : 0);
    const plugs = ns.filter((n) => n.kind === 'plug').length;
    const burn = span ? (song ? (plugs ? 66 : 50) : (plugs ? 88 : 62)) / span : 0, gain = plugs ? clamp(70 / plugs, 5, 30) : 0;
    for (const n of ns) Object.assign(n, { sec: i, burn, gain });
    sec.cp = sec.end + Math.min(0.6, 0.8 * unit);   // where the checkpoint gate stands
  });
  return {
    time, bpb, unit, compound, group: time[1] === 8 ? 1.5 : 1, perBar,
    countIn: bpb * Math.max(1, Math.ceil(3 / perBar - eps)),
    length, bars, tokens, notes, rests, pads, minIOI, sections, barMap, barLabel,
    seed: Math.floor(Math.random() * 1e9), ...extra,
  };
}

/** Bars per section in song mode: four of 4/4, fewer long bars, more short ones. */
const sectionBars = (bpb) => (bpb >= 6 ? 2 : bpb <= 2 ? 8 : 4);

/**
 * Song mode: one hand's rhythm through a whole song, or bars fromBar..toBar (0-based, as songBar
 * counts them: a pickup is bar 0). Sections of a few bars, with a one-bar checkpoint stop between
 * them; the pickup rides with the first section. A range shorter than four bars repeats.
 */
function songCourse(def, hand, { fromBar, toBar, plugMax }) {
  const sc = buildScore(def);
  const bpb = sc.bpb;
  const used = scoreTokens(sc, hand) ? hand : hand === 'R' ? 'L' : 'R';
  const toks = scoreTokens(sc, used);
  if (!toks) return null;
  const pickup = sc.pickup > eps && sc.pickup < bpb - eps;
  const whole = wholeBars(fillGaps(toks, sc.length), sc.length, sc.pickup, bpb);
  if (pickup && whole.tokens[0]?.rest) whole.tokens[0].pad = true;   // the silent start of the pickup bar
  const nb = Math.round(whole.length / bpb);
  const a = clamp(Math.round(fromBar ?? 0), 0, nb - 1), b = clamp(Math.round(toBar ?? nb - 1), a, nb - 1);
  const S = sectionBars(bpb);
  let ranges = [];
  for (let s0 = a; s0 <= b;) {
    const e = Math.min(b, s0 + (pickup && s0 === 0 ? S : S - 1));
    ranges.push([s0, e]);
    s0 = e + 1;
  }
  const tail = ranges[ranges.length - 1];
  if (ranges.length > 1 && tail[0] === tail[1]) { ranges.pop(); ranges[ranges.length - 1][1] = tail[1]; }
  const full = b - a + 1 - (pickup && a === 0 ? 1 : 0);
  if (ranges.length === 1 && full < 4) ranges = Array.from({ length: clamp(Math.ceil(4 / Math.max(1, full)), 2, 4) }, () => [a, b]);
  const tokens = [], barMap = [], sections = [];
  let at = 0;
  ranges.forEach(([s0, e], i) => {
    if (i) { tokens.push({ t: at, d: bpb, rest: true, pad: true }); barMap.push(-1); at += bpb; }
    const start = at, endT = (e + 1) * bpb;
    for (const tk of whole.tokens) {
      const bar = Math.floor(tk.t / bpb + 1e-6);
      if (bar >= s0 && bar <= e) tokens.push({ ...tk, t: tk.t - s0 * bpb + at, d: Math.min(tk.d, endT - tk.t) });
    }
    for (let k = s0; k <= e; k++) barMap.push(k);
    at += (e - s0 + 1) * bpb;
    sections.push({ start, end: at, from: s0, to: e, again: ranges.slice(0, i).some(([p, q]) => p === s0 && q === e) });
  });
  // bars as a printed score numbers them: a pickup is bar 0, the first full bar is bar 1
  const barLabel = (bar) => String(pickup ? bar : bar + 1);
  return makeCourse({ tokens, length: at }, sc.time, {
    plugMax, sections, barMap, barLabel, title: def.title, hand: used, song: def.id,
    songTempo: sc.tempo, firstBar: a, lastBar: b, songBars: nb, pickup,
  });
}

/** Rhythm tokens for one hand of a score (buildScore or coach excerpt); null if it has no notes. */
function scoreTokens(score, hand) {
  const evs = (score.events || score.notes || []).filter((e) => (e.hand || 'R') === hand);
  if (!evs.some((e) => !e.rest)) return null;
  return tokensFromEvents(evs);
}

export const GAME = {
  id: 'roboman', title: 'Roboman',
  summary: 'The rhythm factory. Tap the short notes to grab power plugs and hold the long ones to build bridges, right in time.',
  how: 'Tap any key on a short note to grab a power plug. Press a long note as Roboman reaches the gap and hold it for its full value to build a bridge. In rests, keep still: stray presses burn fuel.',
  songHow: 'The whole song’s rhythm, a few bars at a time: tap the short notes, hold the long ones for their full value. Each checkpoint refuels Roboman and gives back his chances.',
  skill: 'rhythm',
  levels: [
    { name: 'Quarters and halves', time: [4, 4], tempo: 80, first: ['q q q q', 'h h'], pool: ['q q q q', 'h h', 'q q h', 'h q q', 'q h q'], focus: ['q q h', 'h q q', 'q h q'], last: ['h h'] },
    { name: 'Whole notes and rests', time: [4, 4], tempo: 84, first: ['q q h'], pool: ['w', 'q rq q rq', 'h q rq', 'q q h', 'rq q h', 'h rq q', 'q rq h', 'h h', 'q q q q'], focus: ['w', 'q rq q rq', 'h rq q', 'rq q h'], last: ['w'] },
    { name: 'Eighth notes', time: [4, 4], tempo: 80, first: ['q q h'], pool: ['e e q q q', 'q e e q q', 'q q e e q', 'e e e e h', 'h e e e e', 'q rq e e q', 'e e q h', 'q q h', 'e e e e q q'], focus: ['e e q q q', 'e e e e h', 'q q e e q'], last: ['w', 'h h'] },
    { name: 'Dotted halves in 3/4', time: [3, 4], tempo: 92, first: ['q q q'], pool: ['h.', 'h q', 'q h', 'q q q', 'q q rq', 'e e q q', 'rq q q'], focus: ['h.', 'h q', 'q h'], last: ['h.'] },
    { name: 'Dotted quarter and eighth', time: [4, 4], tempo: 80, first: ['q q h'], pool: ['q. e q q', 'q. e h', 'q q q. e', 'h q. e', 'q. e q. e', 'q q h'], focus: ['q. e q q', 'q. e h', 'q. e q. e'], last: ['w'] },
    { name: 'Ties and syncopation', time: [4, 4], tempo: 76, first: ['q q h'], pool: ['e q e q q', 'q e q e q', 'e q q q e', 'h~ e e q', 'q q~ q q', 'e q e h', 'q h q', 'q q h~ | q q h'], focus: ['e q e q q', 'q q~ q q', 'q q h~ | q q h', 'h~ e e q'], last: ['w'] },
    { name: '6/8 time', time: [6, 8], tempo: 84, first: ['q. q.'], pool: ['q. q.', 'q e q e', 'e e e q.', 'q. e e e', 'e e e e e e', 'q e q.', 'q. q e', 'q. rq.'], focus: ['q e q e', 'e e e q.', 'q. e e e'], last: ['h.'] },
    { name: 'Rhythm of a song', song: true },
  ],
};

/**
 * Embedded params (lessons and the coach), all optional:
 *   rhythm: a voice string, pitches ignored ('C4q C4q C4h | C4w'); looped or cut to `bars`
 *   score + hands: a score from buildScore() or coach excerpt(); that hand's onsets and durations
 *          (chords count once, gaps are rests). Short excerpts loop to make at least 4 bars.
 *   song + hands ('R' | 'L') + fromBar/toBar (0-based, inclusive): song mode on a catalog song,
 *          section by section with checkpoints, starting at 0.8 of the song's tempo
 *   time [4, 4], tempo (quarter notes per minute; fixes the tempo), bars (course length; default 4),
 *   plugMax (notes this many beats or shorter are plugs; default 1), chances (3), pass (0.7), text.
 */
export class Game extends ArcadeBase {
  stageOptions() { return { staves: 'treble', mTop: 9, mBot: 9, padTop: 0, padBot: 0, maxSp: 19 }; }

  reset() {
    this.epoch = (this.epoch || 0) + 1;
    this._stopHum();
    const L = this.stage.layers;
    for (const k of ['bg', 'back', 'sprites', 'fx', 'hud']) L[k].textContent = '';
    L.staff.setAttribute('display', 'none');
    this.mode = 'idle';
    this.course = null;
  }

  layout() {
    this.stage.layers.staff.setAttribute('display', 'none');
    if (this.course) this._build();
  }

  // ---------- courses ----------
  _makeCourse(demo) {
    const lv = this.lv, emb = this.embedded || {};
    const plugMax = lv.plugMax ?? 1;
    const bars = emb.bars ?? (this.embedded ? 4 : 8);
    if (emb.score) {
      const c = this._scoreCourse(emb.score, emb.hands || 'R', emb.bars, plugMax);
      if (c) return c;
    }
    if (emb.rhythm) {
      const time = emb.time || lv.time || [4, 4], bpb = (time[0] * 4) / time[1];
      const v = parseVoice(emb.rhythm, 'R');
      const pickup = v.bars.length && v.bars[0] < bpb - eps ? v.bars[0] : 0;
      let part = wholeBars(tokensFromEvents(v.events), v.length, pickup, bpb);
      const nb = Math.round(part.length / bpb);
      if (emb.bars) part = cutBars(loopBars(part, Math.ceil(emb.bars / nb)), emb.bars, bpb);
      else if (nb < 4) part = loopBars(part, Math.ceil(4 / nb));
      return makeCourse(part, time, { plugMax });
    }
    if (lv.song) return this._songCourse(plugMax, demo);
    return this._genCourse(lv, bars, plugMax);
  }

  /** A course from the level's bar patterns: an easy opener, the level's new idea, a long finish. */
  _genCourse(lv, n, plugMax) {
    const time = this.embedded?.time || lv.time || [4, 4];
    const size = (p) => p.split('|').length;
    const middle = [];
    let count = 0;
    const room = Math.max(0, n - 2);
    const focus = [...lv.focus].sort(() => Math.random() - 0.5);
    for (const p of focus.slice(0, 2)) if (count + size(p) <= room) { middle.push(p); count += size(p); }
    let guard = 0;
    while (count < room && guard++ < 60) {
      const p = pick(lv.pool);
      if (count + size(p) > room || p === middle[middle.length - 1]) continue;
      middle.push(p); count += size(p);
    }
    middle.sort(() => Math.random() - 0.5);
    const list = n >= 2 ? [pick(lv.first), ...middle, pick(lv.last)] : [pick(lv.first)];
    const v = parseVoice(list.map(voiceOf).join(' | '), 'R');
    return makeCourse({ tokens: tokensFromEvents(v.events), length: v.length }, time, { plugMax });
  }

  /** An embedded score (a coach excerpt): one hand's rhythm, looped so short excerpts make 4 bars. */
  _scoreCourse(score, hand, bars, plugMax) {
    const time = this.embedded?.time || score.time || [4, 4];
    const bpb = (time[0] * 4) / time[1];
    const toks = scoreTokens(score, hand) || scoreTokens(score, hand === 'R' ? 'L' : 'R');
    if (!toks) return null;
    const len = score.length || toks.reduce((a, k) => Math.max(a, k.t + k.d), 0);
    let part = wholeBars(fillGaps(toks, len), len, score.pickup || 0, bpb);
    const nb = Math.round(part.length / bpb);
    if (bars) part = cutBars(loopBars(part, Math.ceil(bars / nb)), bars, bpb);
    else if (nb >= 4) part = cutBars(part, 8, bpb);
    else part = loopBars(part, clamp(Math.ceil(4 / nb), 2, 4));
    const tempo = score.tempo ? clamp(Math.round(score.tempo * 0.8), 56, 110) : null;
    return makeCourse(part, time, { plugMax, tempo });
  }

  /** Song mode: the kit's song and hand, the whole song or fromBar..toBar ("Continue" resumes a section). */
  _songCourse(plugMax, demo) {
    const def = this.songDef, emb = this.embedded || {};
    const fromBar = !demo && this.resumeBar != null ? this.resumeBar : emb.fromBar;
    const c = def && songCourse(def, this.lv.hands || 'R', { fromBar, toBar: emb.toBar, plugMax });
    return c || this._genCourse(GAME.levels[0], 8, plugMax);
  }

  // ---------- round ----------
  _setup(demo) {
    const c = this.course = this._makeCourse(demo);
    this.demo = demo;
    // songs start at 0.8 of their tempo and move a notch up or down at each checkpoint
    this.adapt = !!c.songTempo && !this.embedded?.tempo;
    this.factor = 0.8;
    this.tempo = this.embedded?.tempo || (c.songTempo ? this._songTempo() : c.tempo || this.lv.tempo || 80);
    this._windows();
    for (const n of c.notes) this._clearNote(n);
    this.from = 0;
    this.idle = -c.countIn;
    this.cam = this.idle;
    this.ptr = 0;
    this.building = new Set();
    this.fuel = 100;
    this.chances = this.lv.chances ?? CHANCES;
    this.plugs = 0;
    this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.s = { notes: 0, onBeat: 0, credit: 0, bridges: 0, held: 0, plugTries: 0, plugs: 0, rests: 0, strays: 0, falls: 0, short: 0 };
    this.rob = { beat: this.idle, dy: 0, rot: 0, alpha: 1, flash: 0, flashAt: -9, teeter: false, parts: null, lowWarned: false };
    this.attempt = 0;
    this.doneAt = null;
    this.pendingMiss = null;
    this.earlyFor = null;
    this.statusMsg = '';
    this.statusShown = null;
    this.secIdx = 0;
    this.sec = { falls: 0, notes: 0, onBeat: 0 };
    this.problems = [];
    this.tip = '';
    this.lastPress = -9;
    this.anim = 0;
    this._build();
  }

  _songTempo() { return clamp(Math.round(this.course.songTempo * this.factor), 44, 160); }

  /** Timing windows in seconds; they shrink for close-packed notes so neighbours never overlap. */
  _windows() {
    this.spb = 60 / this.tempo;
    this.win = Math.min(WINDOW, 0.45 * this.course.minIOI * this.spb);
    this.good = Math.min(GOOD, this.win * 0.8);
    this.perfect = Math.min(PERFECT, this.good * 0.6);
    this.late = Math.max(this.win, Math.min(0.32, 0.45 * this.spb));
  }

  _clearNote(n) {
    n.state = 'pending'; n.grade = null; n.built = n.t; n.complete = false; n.short = false;
    n.building = false; n.key = null; n.pose = { lift: 0, swing: 0, dim: 0 };
  }

  attract() {
    this._setup(true);
    this.mode = 'attract';
    this.t0 = performance.now() / 1000 + 0.8 - this.idle * this.spb;
    this.lastClick = null;
    const c = this.course;
    if (c.song) this.app.ui.prompt(`The ${c.hand === 'L' ? 'left' : 'right'}-hand rhythm of ${c.title}, bars ${this._range(c.firstBar, c.lastBar)}, a few bars at a time, pitches left out.`);
  }

  start() {
    this.reset();
    this._setup(false);
    this.resumeBar = null;
    this.mode = 'ready';
    this.readyT = 0.45;
    this.playing = true;
    this.app.keyboard.need(60, 72);
    const c = this.course;
    const S = sectionBars(c.bpb);
    this.app.ui.prompt(this.embedded?.text || (c.song
      ? `${this._songName()}: its rhythm, ${S} bars at a time. Tap the short notes, hold the long ones for their full value.`
      : 'Tap the short notes to grab plugs. Hold the long notes for their full value to build bridges. In rests, keep still.'));
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this._end('stopped') }, 'Stop'));
    this._hud();
  }

  /** Start (or restart) the clock so Roboman sets off with the first click of a one-bar count-in. */
  _go(from = 0) {
    const c = this.course;
    this.audioClock = !this.demo && this.app.sound.ready;
    this.from = from;
    this.idle = from - c.countIn;
    this.t0 = this.now() + 0.25 - this.idle * this.spb;
    this.clickBeat = this.idle;
    this.lastClick = null;
    this.earlyFor = null;
    this.ptr = c.notes.findIndex((n) => n.t >= from - eps);
    if (this.ptr < 0) this.ptr = c.notes.length;
    this.attempt++;
    this.mode = 'run';
    this._hud();
  }

  _songName() { const c = this.course; return `${c.title}${c.hand === 'L' ? ', left hand' : ''}`; }
  /** "5–8" for song bars a..b, in printed numbering (a pickup is folded into bar 1). */
  _range(a, b) {
    const c = this.course, lo = c.barLabel(a) === '0' ? c.barLabel(a + 1) : c.barLabel(a), hi = c.barLabel(Math.max(a + (lo !== c.barLabel(a) ? 1 : 0), b));
    return lo === hi ? lo : `${lo}–${hi}`;
  }
  /** Printed bar number at a course beat (a checkpoint bar counts as the bar after it). */
  _barAt(beat) {
    const c = this.course;
    let i = clamp(Math.floor(beat / c.bpb + 1e-6), 0, c.bars - 1);
    while (i < c.bars - 1 && c.barMap[i] < 0) i++;
    return c.barLabel(c.barMap[i]);
  }

  now() { return this.audioClock ? this.app.sound.now() : performance.now() / 1000; }
  get lat() { return this.audioClock ? this.app.sound.latency : 0; }
  /** Visual and judged beat: what the learner hears at audio time t (as session.js does). */
  beatAt(t) { return (t - this.lat - this.t0) / this.spb; }
  _inTime(time) {
    const comp = (this.app.settings.latency || 0) / 1000;
    return this.now() - Math.max(0, performance.now() - time) / 1000 - comp;
  }
  /** How early a bridge key may come up and still count as held: about a third of a beat, a bit more on long notes. */
  _grace(n) { return Math.min(0.45 * n.d, Math.max(0.3, 0.1 * n.d, 0.15 / this.spb)); }

  step(dt) {
    if (!this.course || !this.rob || !this.worldG) return;
    this.anim += dt;
    if (this.mode === 'attract') this._attractStep();
    else if (this.mode === 'ready') { this.readyT -= dt; if (this.readyT <= 0) this._go(0); }
    else if (this.mode === 'run') this._runStep();
    else if (this.mode === 'done') this._doneStep();
    else if (this.mode === 'fall' && this.pendingMiss && this.now() > this.pendingMiss.until) this._settleMiss();
    this._render();
  }

  _runStep() {
    const c = this.course, now = this.now();
    const vb = this.beatAt(now);
    const rb = Math.max(vb, this.idle);
    this.rob.beat = rb;
    this.cam = rb;
    this._clicks(now);
    if (this._pulse(vb)) this._hud();
    this._grow(rb);
    if (this.mode !== 'run') return;
    this._misses(rb);
    this._support(rb);
    if (this.mode !== 'run') return;
    while (this.ptr < c.notes.length && this._resolved(c.notes[this.ptr])) this.ptr++;
    const sec = c.sections[this.secIdx];
    if (this.secIdx < c.sections.length - 1 && rb >= sec.cp && !c.notes.some((n) => n.sec === this.secIdx && !this._resolved(n))) this._checkpoint();
    if (rb >= c.length - eps && this.ptr >= c.notes.length) this._done();
  }

  /** Past a section: refuel, chances back, and a tempo notch up after a clean section (down after a rough one). */
  _checkpoint() {
    const c = this.course, st = this.stage, s = this.sec;
    const done = c.sections[this.secIdx], next = c.sections[++this.secIdx];
    let note = '';
    if (this.adapt) {
      const f0 = this.factor, acc = s.notes ? s.onBeat / s.notes : 1;
      if (!s.falls && acc >= 0.85) this.factor = Math.min(1, this.factor + 0.05);
      else if (s.falls >= 2 || acc < 0.6) this.factor = Math.max(0.7, this.factor - 0.05);
      if (this.factor !== f0) {
        this._retime(this._songTempo());
        note = this.factor > f0 ? `, faster: ${this.tempo} bpm` : `, slower: ${this.tempo} bpm`;
      }
    }
    this.sec = { falls: 0, notes: 0, onBeat: 0 };
    this.chances = this.lv.chances ?? CHANCES;
    this.rob.lowWarned = false;
    const f0 = this.fuel;
    st.tween(0.8, (p) => { this.fuel = f0 + (100 - f0) * p; });
    this.gateEls?.[this.secIdx - 1]?.classList.add('on');
    if (!this.demo) {
      this.sfx.bell();
      this._say(`bars ${this._range(done.from, done.to)} done`, 'perfect');
      this.statusMsg = `Next: bars ${this._range(next.from, next.to)}${next.again ? ' again' : ''}${note}`;
      this._hud();
    }
  }

  /** Change tempo mid-run without a jump: the current beat stays where it is. */
  _retime(tempo) {
    const now = this.now(), vb = this.beatAt(now);
    this.tempo = tempo;
    this._windows();
    this.t0 = now - this.lat - vb * this.spb;
  }

  _attractStep() {
    const c = this.course;
    const vb = (performance.now() / 1000 - this.t0) / this.spb;
    const rb = Math.max(vb, this.idle);
    this.rob.beat = rb;
    this.cam = rb;
    this._pulse(vb);
    for (let i = this.ptr; i < c.notes.length && c.notes[i].t <= rb; i++) {
      const n = c.notes[i];
      if (n.state === 'pending') this._onset(n, 0, -1);
    }
    this._grow(rb);
    while (this.ptr < c.notes.length && this._resolved(c.notes[this.ptr])) this.ptr++;
    if (this.secIdx < c.sections.length - 1 && rb >= c.sections[this.secIdx].cp) this._checkpoint();
    if (rb > c.length + DOCK + 2.5) {
      // loop the demo
      for (const n of c.notes) this._clearNote(n);
      this._paintTokens();
      this.ptr = 0; this.fuel = 100; this.secIdx = 0;
      this.gateEls?.forEach((el) => el.classList.remove('on'));
      this.t0 = performance.now() / 1000 + 0.6 - this.idle * this.spb;
      this.lastClick = null;
    }
  }

  /** Done with: plugs once judged; gaps once bridged or missed (a short bridge still has to drop him). */
  _resolved(n) { return n.kind === 'plug' ? n.state !== 'pending' : n.complete || n.state === 'missed'; }

  /** Metronome: schedule clicks a little ahead on the audio clock. */
  _clicks(now) {
    const c = this.course, end = c.length - c.unit + eps;
    const gate = this.secIdx < c.sections.length - 1 ? c.sections[this.secIdx].cp : Infinity;
    while (this.clickBeat <= end && this.clickBeat <= gate + eps && this.t0 + this.clickBeat * this.spb < now + 0.25) {
      const b = this.clickBeat, when = this.t0 + b * this.spb;
      const rel = b < this.from - eps ? b - this.idle : b;
      const down = Math.abs(rel / c.bpb - Math.round(rel / c.bpb)) < 1e-4;
      if (when >= now - 0.03 && this.audioClock) this.app.sound.click(when, down);
      this.clickBeat += c.unit;
    }
  }

  /** On every heard click: the antenna flashes, and the count-in numbers pop up. */
  _pulse(vb) {
    const c = this.course;
    const k = Math.floor((vb - this.idle) / c.unit + 1e-6);
    if (k === this.lastClick) return false;
    this.lastClick = k;
    if (k < 0) return false;
    const b = this.idle + k * c.unit;
    const main = !c.compound || Math.abs((b / 1.5) - Math.round(b / 1.5)) < 1e-4;
    this.rob.flash = main ? 1 : 0.5;
    this.rob.flashAt = this.anim;
    const inPad = c.pads.some((p) => b >= p.t - eps && b < p.t + p.d - eps);
    if ((b < this.from - eps || inPad) && !this.demo) this._countFlash(Math.round((b - Math.floor(b / c.bpb + 1e-6) * c.bpb) / c.unit) + 1);
    return true;
  }

  /** Bridges under construction grow with Roboman, burning fuel. */
  _grow(rb) {
    for (const n of [...this.building]) {
      const end = Math.min(n.end, Math.max(n.t, rb));
      if (end > n.built + eps) {
        this._burn((end - n.built) * n.burn);
        if (this.mode !== 'run' && this.mode !== 'attract') return;
        n.built = end;
        if (rb >= n.t && this.anim - (n.sparkAt || 0) > 0.05) { n.sparkAt = this.anim; this._sparks(end * this.ppb, this.floorY + 0.15 * this.u, 3); }
      }
      if (rb >= n.end - eps) this._complete(n);
    }
  }

  /** Plugs that went by untouched. */
  _misses(rb) {
    const c = this.course;
    for (let i = this.ptr; i < c.notes.length && c.notes[i].t < rb; i++) {
      const n = c.notes[i];
      if (n.kind !== 'plug' || n.state !== 'pending' || (rb - n.t) * this.spb <= this.late + SLACK) continue;
      n.state = 'missed';
      this._tally(n, 0);
      this._problem('missed', n);
      this.streak = 0;
      this.app.coach.record('missed', { t: n.t });
      this._say('missed', 'bad');
      this._swingAway(n);
      this._paintNote(n, 'miss');
      this._hud();
    }
  }

  /** Is there floor under Roboman? Gaps need a started bridge; a short bridge ends where it ends. */
  _support(rb) {
    const c = this.course;
    this.rob.teeter = false;
    for (let i = this.ptr; i < c.notes.length && c.notes[i].t <= rb; i++) {
      const n = c.notes[i];
      if (n.kind !== 'bridge' || rb >= n.end) continue;
      if (n.state === 'pending') {
        if ((rb - n.t) * this.spb > this.win + SLACK) return this._fall(n, 'missed');
        this.rob.teeter = true;
      } else if (n.short && rb > n.built + 0.02) return this._fall(n, 'short');
    }
  }

  // ---------- input ----------
  noteOn(e) {
    if (!this.playing || !this.course) return;
    if (this.mode === 'fall') { this._lateForBridge(e); return; }
    if (this.mode !== 'run') return;
    const c = this.course, tIn = this._inTime(e.time), ib = this.beatAt(tIn);
    if (tIn - this.lastPress < CHORD) return;            // a chord is one press
    let best = null, bd = Infinity;
    for (let i = this.ptr; i < c.notes.length; i++) {
      const n = c.notes[i];
      if ((n.t - ib) * this.spb > this.win) break;
      if (n.state !== 'pending') continue;
      const d = (ib - n.t) * this.spb;
      if (Math.abs(d) <= this.win && Math.abs(d) < Math.abs(bd)) { best = n; bd = d; }
    }
    if (best) {
      this.lastPress = tIn;
      this._light(e.midi, 'hit');
      this._onset(best, bd, e.midi);
      return;
    }
    if (ib < this.from - 0.6 || ib > c.length + 0.05) return;   // still counting in, or done
    this.lastPress = tIn;
    this._stray(e.midi, ib);
  }

  noteOff(e) {
    if (this.mode !== 'run') return;
    for (const n of this.building) {
      if (n.key === e.midi) { this._release(n, this.beatAt(this._inTime(e.time))); break; }
    }
  }

  /** A press that landed on a note: grab the plug or start the bridge. */
  _onset(n, d, midi) {
    const a = Math.abs(d);
    const grade = a <= this.perfect ? 'perfect' : a <= this.good ? 'good' : d < 0 ? 'early' : 'late';
    n.state = 'hit';
    n.grade = grade;
    n.ms = Math.round(d * 1000);
    if (this.demo) {
      if (n.kind === 'plug') { this._fuel(n.gain); this._grab(n, true); }
      else { n.building = true; this.building.add(n); this._paintNote(n, 'on'); }
      return;
    }
    const ok = grade === 'perfect' || grade === 'good';
    if (ok) this.app.coach.record('hit');
    else { this.app.coach.record(grade, { ms: n.ms, t: n.t }); this._problem(grade, n); }
    if (this.earlyFor?.n === n) this.earlyFor = null;
    this.statusMsg = '';
    this.streak = ok ? this.streak + 1 : 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += { perfect: 100, good: 70 }[grade] ?? 40;
    if (ok) this.score += Math.min(50, 5 * (this.streak - 1));
    this._say(grade, grade);
    if (n.kind === 'plug') {
      this._tally(n, ok ? 1 : 0.6);
      this.plugs++;
      this._fuel(n.gain);
      this._grab(n);
    } else {
      n.building = true;
      n.key = midi;
      this.building.add(n);
      this._paintNote(n, 'on');
      this._startHum();
    }
    this._hud();
  }

  /** A press where no note starts: too early, in a rest, or just extra. All of them burn fuel. */
  _stray(midi, ib) {
    const c = this.course;
    this._light(midi, 'miss', 450);
    // a plug that just went past: honest "late", and it swings away
    let prev = null;
    for (const n of c.notes) { if (n.t <= ib) prev = n; else break; }
    if (prev && prev.kind === 'plug' && prev.state === 'pending' && (ib - prev.t) * this.spb <= this.late + SLACK) {
      prev.state = 'late';
      this._tally(prev, 0.3);
      this._problem('late', prev);
      this.streak = 0;
      this.app.coach.record('late', { ms: Math.round((ib - prev.t) * this.spb * 1000), t: prev.t });
      this._say('too late', 'late');
      this._swingAway(prev);
      this._paintNote(prev, 'miss');
      this._hud();
      return;
    }
    const next = c.notes.find((n) => n.state === 'pending' && n.t > ib);
    const rest = c.rests.find((r) => ib >= r.t - 0.02 && ib < r.t + r.d - 0.02);
    const counting = c.pads.some((p) => ib >= p.t - 0.02 && ib < p.t + p.d - 0.02);
    if (counting && !(next && next.t - ib <= 0.6)) return;   // tapping along with the count is fine
    this.s.strays++;
    this.streak = 0;
    if (next && (next.t - ib) <= 0.6 && !(rest && next.t - ib > 0.35)) {
      const ms = Math.round((ib - next.t) * this.spb * 1000);
      this.app.coach.record('early', { ms, t: next.t });
      this.earlyFor = { n: next, ms };
      this._problem('early', next);
      this._say('too early', 'early');
    } else if (rest) {
      this.s.rests++;
      this.app.coach.record('rest', { t: ib });
      this._problem('rest', null, this._barAt(ib));
      this._say('rest!', 'bad');
    } else {
      this._say('extra', 'bad');
    }
    this.sfx.buzz();
    this._sparks(ib * this.ppb, this.floorY, 6, [RB.coral, RB.chalkD]);
    this._burn(WASTE);
    this._hud();
  }

  /** Letting go of a bridge key: close enough to the end finishes it; earlier leaves it short. */
  _release(n, rb) {
    this.building.delete(n);
    n.building = false;
    if (rb >= n.end - this._grace(n)) {
      if (n.end > n.built) this._burn((n.end - n.built) * n.burn);
      if (this.mode !== 'run') return;
      n.built = n.end;
      this._complete(n);
    } else {
      n.short = true;
      n.built = clamp(rb, n.t, n.end);
      const ratio = (n.built - n.t) / n.d;
      this.s.short++;
      this.streak = 0;
      this.app.coach.record('short', { ratio: Math.round(ratio * 100) / 100, t: n.t });
      this._problem('short', n);
      this._tally(n, this._onsetCredit(n) * 0.4, true);
      this._say('held too short', 'bad');
      this._paintNote(n, 'miss');
    }
    if (!this.building.size) this._stopHum();
  }

  _complete(n) {
    this.building.delete(n);
    n.building = false;
    n.complete = true;
    n.built = n.end;
    this._paintNote(n, 'hit');
    if (!this.building.size) this._stopHum();
    if (this.demo) return;
    this._tally(n, this._onsetCredit(n), true, true);
    this.score += Math.round(25 * n.d);
    this.sfx.pop();
    this._sparks(n.end * this.ppb, this.floorY + 0.2 * this.u, 10, [RB.brass, RB.chalk, RB.mint]);
    this._hud();
  }

  _onsetCredit(n) { return n.grade === 'perfect' || n.grade === 'good' ? 1 : 0.6; }

  /** Count one note attempt toward accuracy (bridges are counted when they finish or fall). */
  _tally(n, credit, bridge = false, held = false) {
    this.s.notes++;
    this.s.credit += credit;
    this.sec.notes++;
    if (n.grade === 'perfect' || n.grade === 'good') { this.s.onBeat++; this.sec.onBeat++; }
    if (n.kind === 'plug') { this.s.plugTries++; if (credit > 0.5) this.s.plugs++; }
    if (bridge) { this.s.bridges++; if (held) this.s.held++; }
  }

  /** Remember what went wrong where, for the results: "held the half notes short in bars 5–6". */
  _problem(type, n, bar = n?.label) {
    if (this.demo) return;
    const v = !n ? '' : n.toks.length > 1 ? 'tied notes' : `${NAMES[valueKey(n.d)] || 'note'}s`;
    this.problems.push({ type, v, bar });
  }

  _fuel(add) { this.fuel = clamp(this.fuel + add, 0, 100); }

  _burn(amount) {
    if (this.demo) { this.fuel = Math.max(8, this.fuel - amount); return; }
    this.fuel = Math.max(0, this.fuel - amount);
    if (this.fuel < 25 && !this.rob.lowWarned) { this.rob.lowWarned = true; this.sfx.tick(); this._hud(); }
    if (this.fuel <= 0 && this.mode === 'run') this._apart();
  }

  // ---------- falls, fuel out, finish ----------
  _fall(n, why) {
    const st = this.stage, u = this.u, r = this.rob, ep = this.epoch;
    this.mode = 'fall';
    this.fallNote = n;
    this.chances--;
    this.s.falls++;
    this.sec.falls++;
    this.streak = 0;
    this._stopHum();
    for (const b of this.building) b.building = false;
    this.building.clear();
    const c = this.course, unitName = c.unit === 0.5 ? 'eighth' : 'beat';
    const name = n.toks.length > 1 ? 'tied note' : (NAMES[valueKey(n.d)] || 'long note');
    if (why === 'missed' && this.earlyFor?.n === n) {
      // the press came, but too soon to count: that is what to fix (already coached as early)
      n.state = 'missed';
      this._paintNote(n, 'miss');
      this._tally(n, 0, true);
      this.app.ui.prompt(`Too early: you pressed ${-this.earlyFor.ms} ms before the ${name} began, so no bridge started. Wait for the click on ${this._beatName(n.t)}, then press.`);
      this.earlyFor = null;
    } else if (why === 'missed') {
      n.state = 'missed';
      this._paintNote(n, 'miss');
      this.pendingMiss = { n, until: this.now() + 0.4 };
      this._problem('missed', n);
      this._say('missed', 'bad');
      this.app.ui.prompt(`No key at the start of the ${name} on ${this._beatName(n.t)} of bar ${n.label}, so there was no bridge. Press just as Roboman reaches the gap.`);
    } else {
      const held = (n.built - n.t) / c.unit, want = n.d / c.unit;
      this.app.ui.prompt(`You let go after ${plural(held, unitName)}, but the ${name} lasts ${plural(want, unitName)}. Keep the key down right up to the next note.`);
    }
    this.sfx.whoosh();
    // tumble into the gap and land on the conveyor below, staying inside the gap
    const half = (1.35 * this.ru) / this.ppb, lo = n.t + half, hi = n.end - half;
    const land = hi > lo ? clamp(r.beat + 0.35, lo, hi) : (n.t + n.end) / 2;
    const b0 = r.beat, drop = this.beltY - this.floorY - 0.05 * u;
    st.tween(0.5, (p) => { r.beat = b0 + (land - b0) * p; r.dy = drop * p * p; r.rot = 34 * p + 14 * Math.sin(p * Math.PI); }, {
      done: () => {
        if (ep !== this.epoch) return;
        this.sfx.splat(); this.sfx.buzz();
        r.dazed = true;
        const x = this.rx + (r.beat - this.cam) * this.ppb;
        st.puff(x, this.beltY - 0.4 * u, RB.chalkD, 9, 0.22);
        st.puff(x, this.beltY - 0.4 * u, RB.brass, 6, 0.16);
        st.tween(0.32, (p) => { r.dy = drop - Math.sin(p * Math.PI) * 0.6 * this.ru; r.rot = 34 - 20 * p; });
      },
    });
    this._hud();
    st.tween(1.3, () => {}, { done: () => { if (ep === this.epoch) this.chances > 0 ? this._respawn() : this._end('chances'); } });
  }

  /** A press just after a missed bridge: tell the truth (late, not missing). */
  _lateForBridge(e) {
    const pm = this.pendingMiss;
    if (!pm) return;
    const ib = this.beatAt(this._inTime(e.time));
    if (ib - pm.n.t > 0.75) return;
    this.pendingMiss = null;
    const ms = Math.round((ib - pm.n.t) * this.spb * 1000);
    this.app.coach.record('late', { ms, t: pm.n.t });
    const pi = this.problems.findLastIndex((q) => q.type === 'missed');
    if (pi >= 0) this.problems[pi].type = 'late';
    this._light(e.midi, 'miss', 450);
    this._tally(pm.n, 0, true);
    this._say('too late', 'late');
    this.app.ui.prompt(`Too late for the bridge, by ${ms} ms. The gap starts on ${this._beatName(pm.n.t)}: press right with the click.`);
  }

  _settleMiss() {
    const pm = this.pendingMiss;
    this.pendingMiss = null;
    this.app.coach.record('missed', { t: pm.n.t });
    this._tally(pm.n, 0, true);
  }

  _beatName(t) {
    const c = this.course, p = t - Math.floor(t / c.bpb + 1e-6) * c.bpb;
    const k = Math.floor(p / c.unit + 1e-6), off = p - k * c.unit;
    return off > eps ? `the “and” of ${k + 1}` : `beat ${k + 1}`;
  }

  /** Back to the start of the bar he fell in: rewind the factory, lower him in, count in again. */
  _respawn() {
    if (this.pendingMiss) this._settleMiss();
    const st = this.stage, r = this.rob, c = this.course, ep = this.epoch;
    const from = Math.floor(this.fallNote.t / c.bpb + 1e-6) * c.bpb;
    for (const n of c.notes) if (n.t >= from - eps) this._clearNote(n);
    this._paintTokens();
    this.mode = 'respawn';
    const cam0 = this.cam, cam1 = from - c.countIn;
    st.tween(0.25, (p) => { r.alpha = 1 - p; });
    st.tween(0.8, (p) => { this.cam = cam0 + (cam1 - cam0) * p; }, {
      ease: ease.inOut, delay: 0.2,
      done: () => {
        if (ep !== this.epoch) return;
        Object.assign(r, { beat: cam1, rot: 0, alpha: 1, parts: null, dazed: false });
        this.sfx.whoosh();
        st.tween(0.45, (p) => { r.dy = -7 * this.ru * (1 - ease.back(p)); }, {
          done: () => { if (ep !== this.epoch) return; this.sfx.tick(true); r.dy = 0; this._go(from); },
        });
      },
    });
    this.statusMsg = `${this.chances} ${this.chances === 1 ? 'chance' : 'chances'} left · from bar ${this._barAt(from)}`;
    this._hud();
  }

  /** Out of fuel: he shudders and falls to pieces. */
  _apart() {
    const st = this.stage, r = this.rob, ep = this.epoch;
    this.mode = 'apart';
    this._stopHum();
    for (const b of this.building) b.building = false;
    this.building.clear();
    this.sfx.buzz();
    this.app.ui.prompt('Out of fuel. Each plug you grab refuels Roboman, and every press where no note starts burns some.');
    const parts = { head: [rand(-0.6, 0.6), -5.5, rand(-200, 200)], torso: [0.3, -1.5, 30], armL: [-2.2, -3, -160], armR: [2.4, -3.4, 190] };
    const land = { head: 2.6, torso: 0.55, armL: 1.6, armR: 1.6 };
    r.parts = {};
    st.tween(0.35, (p) => { r.rot = Math.sin(p * 40) * 5 * (1 - p); }, {
      done: () => {
        if (ep !== this.epoch) return;
        this.sfx.splat();
        st.puff(this.rx, this.floorY - 2 * this.ru, RB.chalkD, 12, 0.24);
        st.tween(0.9, (p) => {
          const t = p * 0.9;
          for (const [k, [vx, vy, va]] of Object.entries(parts)) {
            const y = Math.min(land[k], vy * t + 0.5 * 16 * t * t);
            r.parts[k] = { x: vx * t, y, a: y >= land[k] ? va * 0.5 : va * t };
          }
        }, { done: () => { if (ep === this.epoch) this.sfx.tick(); } });
      },
    });
    st.tween(1.9, () => {}, { done: () => { if (ep === this.epoch) this._end('fuel'); } });
  }

  _done() {
    this.mode = 'done';
    this._stopHum();
    this.doneAt = null;
  }

  /** Roll on to the charging dock, then celebrate. */
  _doneStep() {
    const c = this.course, r = this.rob, st = this.stage, ep = this.epoch;
    if (this.doneAt !== null) return;
    const rb = Math.min(this.beatAt(this.now()), c.length + DOCK);
    r.beat = rb; this.cam = rb;
    this._pulse(rb);
    if (rb < c.length + DOCK - eps) return;
    this.doneAt = this.anim;
    this.sfx.fanfare();
    for (let i = 0; i < 2; i++) {
      st.tween(0.32, (p) => { r.dy = -Math.sin(p * Math.PI) * 1.2 * this.ru; }, { delay: i * 0.36 });
    }
    PAINT.forEach((col, i) => st.tween(0.01, () => {}, {
      delay: 0.12 + i * 0.16, done: () => st.puff(this.rx + rand(-2, 2) * this.ru, this.floorY - rand(2.5, 5.5) * this.ru, col, 12, 0.28),
    }));
    st.tween(0.01, () => {}, { delay: 0.4, done: () => this.sfx.bell() });
    st.tween(1.7, () => {}, { done: () => { if (ep === this.epoch) this._end('done'); } });
  }

  _end(why) {
    if (!['ready', 'run', 'fall', 'respawn', 'apart', 'done'].includes(this.mode)) return;
    if (this.pendingMiss) this._settleMiss();
    const done = why === 'done';
    this.mode = 'over';
    this.epoch++;
    this._stopHum();
    const c = this.course, s = this.s;
    const acc = s.notes ? s.credit / (s.notes + s.strays) : 0;   // a stray press counts like a missed note
    if (done) this.score += 300 + this.chances * 150 + Math.round(this.fuel) * 3;
    const bar = this._barAt(this.rob.beat);
    const onBeat = s.notes ? `${s.onBeat} of ${s.notes} notes right on the beat.` : '';
    const falls = s.falls ? ` with ${s.falls} ${s.falls === 1 ? 'fall' : 'falls'}` : ' without a fall';
    const who = c.song ? `${this._songName()}: ` : '';
    let detail = {
      done: c.song ? `${who}bars ${this._range(c.firstBar, c.lastBar)}${falls}. ${onBeat}` : `Roboman made it across${falls}. ${onBeat}`,
      fuel: `${who}${c.song ? 'out' : 'Roboman ran out'} of fuel in bar ${bar}. ${onBeat}`,
      chances: `${who}${c.song ? 'out' : 'Out'} of chances in bar ${bar}. ${onBeat}`,
      stopped: s.notes ? `${who}${c.song ? 'stopped' : 'Stopped'} in bar ${bar}. ${onBeat}` : 'Stopped before the first note.',
    }[why].trim();
    this.tip = this._shakyTip();
    if (this.embedded && this.tip) detail += ` ${this.tip}`;
    // short enough to fit the card on a phone: zero counts of trouble are left out
    const stats = [
      ['Notes on the beat', `${s.onBeat} of ${s.notes}`],
      s.bridges ? ['Long notes held', `${s.held} of ${s.bridges}`] : null,
      s.plugTries ? ['Plugs grabbed', `${s.plugs} of ${s.plugTries}`] : null,
      s.rests ? ['Presses in rests', String(s.rests)] : null,
      ['Falls', String(s.falls)],
    ].filter(Boolean);
    const lastBar = c.barLabel(c.lastBar), firstBar = this._range(c.firstBar, c.firstBar);
    if (c.song) stats.unshift(['Bars', done ? `${this._range(c.firstBar, c.lastBar)}, all of them` : `${bar === firstBar ? bar : `${firstBar}–${bar}`} of ${lastBar}`]);
    this.app.ui.status('');
    this.statusShown = '';
    this.finish({ score: this.score, passed: done && acc >= (this.embedded?.pass ?? 0.7), accuracy: Math.round(acc * 100) / 100, detail, stats });
    // a song round that stopped part-way can carry on from the section it reached
    const sec = c.sections[this.secIdx];
    if (c.song && !done && !this.embedded && sec && (this.secIdx > 0 || sec.from !== 0)) {
      this.app.ui.footEl?.append(h('button', { class: 'btn', onclick: () => { this.resumeBar = sec.from; this.begin(); } }, `Continue from bar ${this._range(sec.from, sec.from)}`));
    }
  }

  /** The one thing to work on: the biggest group of one kind of slip on one note value, and where. */
  _shakyTip() {
    const groups = new Map();
    for (const q of this.problems) {
      const k = q.type === 'rest' ? 'rest' : `${q.type}|${q.v}`;
      if (!groups.has(k)) groups.set(k, { type: q.type, v: q.v, bars: [] });
      groups.get(k).bars.push(q.bar);
    }
    const order = ['short', 'missed', 'late', 'early', 'rest'];
    const g = [...groups.values()].sort((a, b) => b.bars.length - a.bars.length || order.indexOf(a.type) - order.indexOf(b.type))[0];
    if (!g) return '';
    const where = barList(g.bars);
    const what = {
      short: [`held the ${g.v} short ${where}`, 'Count through each one and keep the key down right up to the next note.'],
      missed: [`missed the ${g.v} ${where}`, 'Look a little ahead on the strip so each note is ready before it arrives.'],
      late: [`came in late on the ${g.v} ${where}`, 'Have your finger ready before the click, then press with it.'],
      early: [`rushed the ${g.v} ${where}`, 'Let each click land, then press with it.'],
      rest: [`played during the rests ${where}`, 'A rest is a silent beat: count it with your hands still.'],
    }[g.type];
    return `Shakiest spot: you ${what[0]}. ${what[1]}`;
  }

  /** The results tip: the rhythm problem that came up most. */
  _tips(summary) {
    if (this.tip) return this.tip;
    const counts = summary?.counts || {};
    const [top, n] = ['short', 'late', 'early', 'rest', 'missed'].map((k) => [k, counts[k] || 0]).sort((a, b) => b[1] - a[1])[0];
    if (!n) return '';
    return {
      short: 'Long notes were let go too soon. Count through each one: a half note is “one, two”, held all the way.',
      late: 'You were often behind the click. Look ahead on the strip so your finger is ready before the note arrives.',
      early: 'You were often ahead of the click. Let each click land, then press with it.',
      rest: 'Keys were pressed in rests. A rest is a silent beat: count it with your hands still.',
      missed: 'Some notes went by without a press. Keep your eyes on the strip, just ahead of the blue line.',
    }[top];
  }

  exit() {
    for (const id of this.lit?.values() || []) clearTimeout(id);
    this.epoch = (this.epoch || 0) + 1;
    this._stopHum();
    this.mode = 'off';
    super.exit();
  }

  _startHum() { if (!this.hum && !this.demo) this.hum = this.sfx.loop('hum', 0.045); }
  _stopHum() { if (this.hum) { this.hum(); this.hum = null; } }

  // ---------- drawing: geometry and scenery ----------
  _build() {
    const st = this.stage;
    for (const k of ['bg', 'back', 'sprites', 'fx', 'hud']) st.layers[k].textContent = '';
    this.hudG = null; this.hudKey = null; this.fb = null;
    this._geometry();
    this._defs();
    this._backdrop();
    this._world();
    this._strip();
    this._robot();
    this._gauge();
    this._hud();
    this._render();
  }

  _geometry() {
    const st = this.stage, u = st.sp, W = st.w, H = st.h;
    this.u = u;
    const s = this.sp2 = clamp(u * 0.8, 7.5, 15);     // staff space on the rhythm strip
    this.trayY = H - clamp(u * 1.1, 14, 22);
    this.stripBot = this.trayY - clamp(u * 1.0, 12, 20);
    this.stripTop = this.stripBot - 6.6 * s;
    this.lineY = this.stripTop + 3.9 * s;
    this.beltY = this.stripTop - 0.95 * u;             // top of the conveyor on the lower level
    this.floorY = this.beltY - 2.55 * u;               // the walkway Roboman rolls on
    this.ceilY = Math.max(0.5 * u, 6);                 // the rail the plugs hang from
    this.lc = Math.max(3.6 * u, 4.4 * s);              // left column: fuel gauge above, clef below
    this.rx = this.lc + (W - this.lc) * 0.27;          // Roboman (and the blue line) stay here
    // pixels per beat: about six beats ahead, but never so tight that the closest notes collide
    const room = (1.6 * s) / Math.max(0.25, this.course?.minIOI ?? 1);
    this.ppb = Math.max(clamp((W - this.rx) / 6, 3 * u, 7 * u), Math.min(room, (W - this.rx) / 2.5));
    // Roboman and the plugs fill the height there is, but stay about a beat wide
    this.ru = clamp((this.floorY - this.ceilY) / 8.8, u, Math.min(1.45 * u, 0.43 * this.ppb));
    this.plugY = this.floorY - 5.75 * this.ru;         // top of a hanging plug
  }

  _defs() {
    const st = this.stage, u = this.u;
    this.uid ||= Math.random().toString(36).slice(2, 7);
    const id = `rb${this.uid}`;
    const d = svg('defs', {}, st.layers.bg);
    const hz = svg('pattern', { id: `${id}hz`, patternUnits: 'userSpaceOnUse', width: 0.6 * u, height: 0.6 * u, patternTransform: 'rotate(45)' }, d);
    svg('rect', { width: 0.6 * u, height: 0.6 * u, fill: RB.ink }, hz);
    svg('rect', { width: 0.3 * u, height: 0.6 * u, fill: RB.brass }, hz);
    const br = svg('pattern', { id: `${id}br`, patternUnits: 'userSpaceOnUse', width: 0.9 * u, height: 0.42 * u, y: this.floorY }, d);
    svg('rect', { width: 0.9 * u, height: 0.42 * u, fill: RB.brass }, br);
    svg('path', { d: `M0,${0.42 * u} L${0.45 * u},0 L${0.9 * u},${0.42 * u}`, fill: 'none', stroke: RB.brassD, 'stroke-width': Math.max(1, 0.07 * u) }, br);
    const cp = svg('clipPath', { id: `${id}clip` }, d);
    svg('rect', { x: -st.w, y: -st.h, width: 3 * st.w, height: st.h + this.stripTop }, cp);
    const tube = svg('clipPath', { id: `${id}tube` }, d);
    this.tubeRect = svg('rect', {}, tube);
    const gr = svg('linearGradient', { id: `${id}fade`, x1: 0, x2: 1, y1: 0, y2: 0 }, d);
    svg('stop', { offset: 0, 'stop-color': STRIP_BG, 'stop-opacity': 1 }, gr);
    svg('stop', { offset: 1, 'stop-color': STRIP_BG, 'stop-opacity': 0 }, gr);
    this.ids = { hz: `url(#${id}hz)`, br: `url(#${id}br)`, clip: `url(#${id}clip)`, tube: `url(#${id}tube)`, fade: `url(#${id}fade)` };
  }

  /** Back wall: chalk drawings of the factory's machines, scrolling slower than the walkway. */
  _backdrop() {
    const st = this.stage, u = this.u, c = this.course, g = st.layers.bg;
    svg('rect', { x: 0, y: 0, width: st.w, height: this.beltY + 0.6 * u, class: 'rb-wall' }, g);
    this.para = svg('g', { class: 'rb-para' }, g);
    this.gears = []; this.hammers = [];
    const rnd = rng(c.seed);
    let x = (-c.countIn - 8) * this.ppb * PARA - st.w * 0.3;
    const end = (c.length + 14) * this.ppb * PARA + st.w;
    const kinds = ['gear', 'hammers', 'harp', 'crates', 'window'];
    let last = 'window';
    while (x < end) {
      let k;
      do { k = kinds[Math.floor(rnd() * kinds.length)]; } while (k === last);
      last = k;
      const w = this._machine(k, x, rnd);
      x += w + (3 + rnd() * 5) * u;
    }
  }

  /** One background machine standing on the lower floor; returns its width. */
  _machine(kind, x, rnd) {
    const u = this.u, g = svg('g', { class: 'rb-chalk' }, this.para);
    const base = this.beltY + 0.4 * u;
    const top = Math.max(this.ceilY + 1.8 * u, base - 9 * u);
    const tall = base - top;
    if (kind === 'gear') {
      const r = Math.min(2.3 * u, tall * 0.26);
      const cx = x + r + 0.4 * u, cy = base - r - 1.6 * u;
      svg('path', { d: `M${cx},${cy} L${cx - 0.9 * r},${base} M${cx},${cy} L${cx + 0.9 * r},${base}` }, g);
      const gear = (gx, gy, rr, n, speed) => {
        const gg = svg('g', {}, g), pts = [];
        for (let i = 0; i < n * 4; i++) {
          const a = (i / (n * 4)) * Math.PI * 2, rad = i % 4 === 1 || i % 4 === 2 ? rr + 0.34 * u : rr;
          pts.push(`${(gx + Math.cos(a) * rad).toFixed(1)},${(gy + Math.sin(a) * rad).toFixed(1)}`);
        }
        svg('polygon', { points: pts.join(' ') }, gg);
        svg('circle', { cx: gx, cy: gy, r: rr * 0.42 }, gg);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; svg('line', { x1: gx + Math.cos(a) * rr * 0.42, y1: gy + Math.sin(a) * rr * 0.42, x2: gx + Math.cos(a) * rr * 0.85, y2: gy + Math.sin(a) * rr * 0.85 }, gg); }
        this.gears.push({ el: gg, cx: gx, cy: gy, speed });
      };
      gear(cx, cy, r, 12, 22);
      const r2 = r * 0.55;
      gear(cx + r + r2 + 0.5 * u, cy + r * 0.45, r2, 7, -22 * (r / r2));
      return 2 * r + 2 * r2 + 1.2 * u;
    }
    if (kind === 'hammers') {
      // a bank of piano hammers that strike their strings on the beat
      const n = 6, gap = 0.95 * u, w = n * gap + 0.6 * u;
      const rail = base - 2.2 * u, str = rail - Math.min(4 * u, tall - 3 * u);
      svg('rect', { x, y: rail, width: w, height: 0.5 * u, rx: 0.15 * u }, g);
      svg('line', { x1: x + 0.1 * u, x2: x + w - 0.1 * u, y1: str, y2: str }, g);
      svg('line', { x1: x - 0.2 * u, x2: x + w + 0.2 * u, y1: str - 0.3 * u, y2: str - 0.3 * u }, g);
      svg('path', { d: `M${x + 0.3 * u},${rail + 0.5 * u} V${base} M${x + w - 0.3 * u},${rail + 0.5 * u} V${base}` }, g);
      for (let i = 0; i < n; i++) {
        const px = x + 0.6 * u + i * gap, len = rail - str - 0.35 * u;
        const hm = svg('g', {}, g);
        svg('line', { x1: px, y1: rail, x2: px, y2: rail - len + 0.5 * u }, hm);
        svg('rect', { x: px - 0.32 * u, y: rail - len, width: 0.64 * u, height: 0.55 * u, rx: 0.25 * u }, hm);
        this.hammers.push({ el: hm, px, py: rail, i, n });
      }
      return w;
    }
    if (kind === 'harp') {
      // the cast-iron frame of a grand piano, waiting for its strings to be tuned
      const w = Math.min(6.5 * u, tall * 0.9), hh = Math.min(5.8 * u, tall - 1.2 * u), y0 = base - 1.2 * u;
      svg('path', { d: `M${x},${y0} L${x},${y0 - hh} Q${x + w * 0.25},${y0 - hh * 1.08} ${x + w * 0.45},${y0 - hh * 0.8} Q${x + w * 0.75},${y0 - hh * 0.3} ${x + w},${y0 - hh * 0.22} L${x + w},${y0} Z` }, g);
      const strings = [];
      for (let i = 1; i < 11; i++) {
        const sx = x + (w * i) / 11, f = sx - x;
        const yTop = f < w * 0.45 ? y0 - hh * (1 - 0.15 * (f / (w * 0.45))) : y0 - hh * (0.8 - 0.58 * ((f - w * 0.45) / (w * 0.55)));
        strings.push(`M${sx.toFixed(1)},${(y0 - 0.3 * u).toFixed(1)} V${(yTop + 0.4 * u).toFixed(1)}`);
      }
      svg('path', { d: strings.join(' '), class: 'rb-chalk-thin' }, g);
      for (const f of [0.18, 0.5, 0.78]) svg('circle', { cx: x + w * f, cy: y0 - hh * (f < 0.4 ? 0.62 : 0.3), r: 0.35 * u }, g);
      svg('path', { d: `M${x + 0.6 * u},${y0} V${base} M${x + w - 0.6 * u},${y0} V${base}` }, g);
      return w;
    }
    if (kind === 'crates') {
      const cw = 2.3 * u, ch = Math.min(1.8 * u, tall * 0.3);
      const crate = (cx, cy) => {
        svg('rect', { x: cx, y: cy, width: cw, height: ch }, g);
        svg('path', { d: `M${cx},${cy} L${cx + cw},${cy + ch} M${cx + cw},${cy} L${cx},${cy + ch}`, class: 'rb-chalk-thin' }, g);
      };
      crate(x, base - ch); crate(x + cw + 0.2 * u, base - ch); crate(x + cw * 0.55, base - 2 * ch - 0.1 * u);
      const t = svg('text', { x: x + cw * 1.05 + cw * 0.5, y: base - 1.5 * ch, 'text-anchor': 'middle', 'font-size': 0.9 * u, class: 'rb-chalk-text' }, g);
      t.textContent = '88';
      // a bundle of new keys sticking out of the top crate
      const kx = x + cw * 0.75, ky = base - 2 * ch - 0.1 * u;
      for (let i = 0; i < 5; i++) svg('rect', { x: kx + i * 0.32 * u, y: ky - (0.9 + (i % 2) * 0.25) * u, width: 0.26 * u, height: (0.9 + (i % 2) * 0.25) * u, class: i % 2 ? 'rb-chalk-dark' : '' }, g);
      return 2 * cw + 0.2 * u;
    }
    // a tall factory window high on the wall
    const w = 3.2 * u, wt = Math.min(5 * u, tall * 0.62), wy = top;
    svg('path', { d: `M${x},${wy + wt} V${wy + w / 2} A${w / 2},${w / 2} 0 0 1 ${x + w},${wy + w / 2} V${wy + wt} Z`, class: 'rb-window' }, g);
    svg('path', { d: `M${x + w / 2},${wy} V${wy + wt} M${x},${wy + wt * 0.55} H${x + w} M${x},${wy + wt * 0.8} H${x + w}`, class: 'rb-chalk-thin' }, g);
    return w;
  }

  /** The walkway, gaps, rail, plugs, conveyor and dock, laid out in beats (x = beat * ppb). */
  _world() {
    const st = this.stage, u = this.u, c = this.course, X = (b) => b * this.ppb;
    const w = this.worldG = svg('g', { class: 'rb-world' }, st.layers.back);
    const x0 = X(-c.countIn - 12), x1 = X(c.length + 16);
    // the lower level: a conveyor carrying finished parts along
    svg('rect', { x: x0, y: this.beltY, width: x1 - x0, height: 0.62 * u, rx: 0.31 * u, class: 'rb-belt' }, w);
    this.belt = svg('line', { x1: x0, x2: x1, y1: this.beltY + 0.31 * u, y2: this.beltY + 0.31 * u, class: 'rb-belt-run', 'stroke-dasharray': `${0.5 * u} ${0.7 * u}` }, w);
    svg('line', { x1: x0, x2: x1, y1: this.beltY + 0.31 * u, y2: this.beltY + 0.31 * u, class: 'rb-belt-rollers', 'stroke-dasharray': `0 ${1.4 * u}` }, w);
    // the ceiling rail, with a tag hanging at each bar line
    svg('rect', { x: x0, y: this.ceilY, width: x1 - x0, height: 0.62 * u, class: 'rb-rail' }, w);
    svg('line', { x1: x0, x2: x1, y1: this.ceilY + 0.31 * u, y2: this.ceilY + 0.31 * u, class: 'rb-rivets', 'stroke-dasharray': `0 ${1.1 * u}` }, w);
    for (let b = 0; b < c.bars; b++) {
      const label = c.barMap[b] < 0 ? '' : c.barLabel(c.barMap[b]);
      if (!label || label === '0') continue;
      const x = X(b * c.bpb), ty = this.ceilY + 0.62 * u, tw = Math.max(1.1, 0.42 * label.length + 0.3) * u;
      svg('line', { x1: x, x2: x, y1: ty, y2: ty + 0.5 * u, class: 'rb-cable' }, w);
      svg('rect', { x: x - tw / 2, y: ty + 0.5 * u, width: tw, height: 0.85 * u, rx: 0.15 * u, class: 'rb-tag' }, w);
      const t = svg('text', { x, y: ty + 1.17 * u, 'text-anchor': 'middle', 'font-size': 0.62 * u, class: 'rb-tag-text' }, w);
      t.textContent = label;
    }
    // song mode: the song's name on the wall at the door, and a checkpoint gate after each section
    if (c.song) {
      // high on the wall just ahead of where Roboman starts, over the count-in
      const fs = clamp(0.8 * u, 11, 16), name = this._songName(), x = X(-c.countIn) + 1.7 * this.ru, y = this.ceilY + 2.3 * u;
      const tw = name.length * fs * 0.56 + 1.2 * u;
      svg('rect', { x, y, width: tw, height: fs * 1.9, rx: 6, class: 'rb-sign' }, w);
      const t = svg('text', { x: x + tw / 2, y: y + fs * 1.28, 'text-anchor': 'middle', 'font-size': fs, class: 'rb-sign-text' }, w);
      t.textContent = name;
    }
    this.gateEls = c.sections.slice(0, -1).map((sec, i) => this._gate(w, X(sec.cp), c.sections[i + 1]));
    this.gateEls.forEach((el, i) => el.classList.toggle('on', i < this.secIdx));
    // walkway: solid stretches with pillars, and gaps where long notes are
    let at = -c.countIn - 12;
    const gaps = c.notes.filter((n) => n.kind === 'bridge');
    for (const n of gaps) {
      if (n.t > at + eps) this._girder(w, X(at), X(n.t), at > -c.countIn - 11, true);
      at = Math.max(at, n.end);
    }
    this._girder(w, X(at), X(c.length + 16), true, false);
    // posts between back-to-back gaps: each one is a fresh press
    gaps.forEach((n, i) => {
      const next = gaps[i + 1];
      if (next && Math.abs(next.t - n.end) < eps) {
        const x = X(n.end);
        svg('rect', { x: x - 0.16 * u, y: this.floorY + 0.42 * u, width: 0.32 * u, height: this.beltY - this.floorY - 0.42 * u, class: 'rb-post' }, w);
        svg('rect', { x: x - 0.3 * u, y: this.floorY + 0.4 * u, width: 0.6 * u, height: 0.24 * u, rx: 0.06 * u, class: 'rb-post-cap' }, w);
      }
    });
    for (const n of gaps) {
      n.el = svg('rect', { x: X(n.t), y: this.floorY, height: 0.42 * u, width: Math.max(0, X(n.built - n.t)), fill: this.ids.br, class: n.short ? 'rb-bridge short' : 'rb-bridge' }, w);
      n.edge = svg('rect', { y: this.floorY - 0.04 * u, width: 0.22 * u, height: 0.5 * u, rx: 0.08 * u, class: 'rb-weld', opacity: 0 }, w);
    }
    for (const n of c.notes) if (n.kind === 'plug') n.el = this._plug(w, X(n.t), n.i);
    this._dock(w, X(c.length + DOCK));
    this.wfx = svg('g', {}, w);
  }

  _girder(g, xa, xb, capA, capB) {
    const u = this.u, y = this.floorY, gg = svg('g', { class: 'rb-girder' }, g);
    const pill = (x) => svg('rect', { x: x - 0.26 * u, y: y + 0.8 * u, width: 0.52 * u, height: this.beltY - y - 0.8 * u, class: 'rb-pillar' }, gg);
    const len = xb - xa;
    if (len > 1.4 * u) {
      const n = Math.max(1, Math.round(len / (4.5 * u)));
      for (let i = 0; i <= n; i++) pill(xa + 0.6 * u + ((len - 1.2 * u) * i) / n);
    } else pill(xa + len / 2);
    svg('rect', { x: xa, y: y + 0.24 * u, width: len, height: 0.46 * u, class: 'rb-web' }, gg);
    let d = `M${xa.toFixed(1)},${(y + 0.7 * u).toFixed(1)}`;
    for (let x = xa, up = true; x < xb; x += 0.45 * u, up = !up) d += ` L${Math.min(x + 0.45 * u, xb).toFixed(1)},${(y + (up ? 0.26 : 0.7) * u).toFixed(1)}`;
    svg('path', { d, class: 'rb-truss' }, gg);
    svg('rect', { x: xa, y: y + 0.66 * u, width: len, height: 0.16 * u, class: 'rb-flange' }, gg);
    svg('rect', { x: xa, y, width: len, height: 0.26 * u, class: 'rb-deck' }, gg);
    svg('line', { x1: xa + 0.3 * u, x2: xb - 0.3 * u, y1: y + 0.13 * u, y2: y + 0.13 * u, class: 'rb-rivets', 'stroke-dasharray': `0 ${0.8 * u}` }, gg);
    if (capA) svg('rect', { x: xa, y, width: Math.min(0.55 * u, len / 2), height: 0.82 * u, fill: this.ids.hz, class: 'rb-hazard' }, gg);
    if (capB) svg('rect', { x: xb - Math.min(0.55 * u, len / 2), y, width: Math.min(0.55 * u, len / 2), height: 0.82 * u, fill: this.ids.hz, class: 'rb-hazard' }, gg);
  }

  /** A power plug on a cable from the rail (art in units of u, origin at the top of the plug). */
  _plug(g, x, i) {
    const u = this.u, len = this.plugY - this.ceilY - 0.62 * u, pu = this.ru * 1.1;
    const p = svg('g', { class: 'rb-plug' }, g);
    p.dataset.x = x;
    p.dataset.phase = (i * 1.7) % 6.28;
    svg('line', { x1: 0, x2: 0, y1: -len, y2: 0, class: 'rb-cable' }, p);
    const a = svg('g', { transform: `scale(${pu})` }, p);
    svg('rect', { x: -0.11, y: -0.2, width: 0.22, height: 0.26, rx: 0.06, fill: RB.steelL }, a);
    svg('rect', { x: -0.36, y: 0.02, width: 0.72, height: 0.62, rx: 0.14, fill: RB.chalk }, a);
    svg('rect', { x: -0.36, y: 0.46, width: 0.72, height: 0.18, rx: 0.07, fill: RB.chalkD }, a);
    svg('path', { d: 'M0.04,0.1 L-0.1,0.3 L0.02,0.3 L-0.04,0.44 L0.12,0.22 L0,0.22 Z', fill: RB.brassD }, a);
    svg('path', { d: 'M-0.15,0.64 V0.95 M0.15,0.64 V0.95', class: 'rb-prong' }, a);
    p.led = svg('circle', { cx: 0.22, cy: 0.14, r: 0.065, class: 'rb-led' }, a);
    p.len = len;
    p.setAttribute('transform', `translate(${x} ${this.plugY})`);
    return p;
  }

  /** A checkpoint gate: an arch with the next section's bars on its sign; its lamp lights when passed. */
  _gate(g, x, next) {
    const u = this.ru, y = this.floorY, d = svg('g', { class: 'rb-gate' }, g);
    svg('path', { d: `M${x - 1.75 * u},${y} V${y - 5.1 * u} M${x + 1.75 * u},${y} V${y - 5.1 * u}`, class: 'rb-gate-post' }, d);
    svg('rect', { x: x - 2.05 * u, y: y - 5.95 * u, width: 4.1 * u, height: 0.95 * u, rx: 0.2 * u, class: 'rb-gate-sign' }, d);
    const t = svg('text', { x: x + 0.25 * u, y: y - 5.28 * u, 'text-anchor': 'middle', 'font-size': 0.52 * u, class: 'rb-gate-text' }, d);
    t.textContent = `BARS ${this._range(next.from, next.to)}`;
    svg('circle', { cx: x - 1.6 * u, cy: y - 5.47 * u, r: 0.2 * u, class: 'rb-gate-lamp' }, d);
    svg('rect', { x: x - 1.6 * u, y: y - 0.12 * u, width: 3.2 * u, height: 0.14 * u, rx: 0.06 * u, class: 'rb-dock-pad' }, d);
    return d;
  }

  _dock(g, x) {
    const u = this.ru, y = this.floorY;
    const d = svg('g', { class: 'rb-dock' }, g);
    svg('rect', { x: x - 1.7 * u, y: y - 0.16 * u, width: 3.4 * u, height: 0.2 * u, rx: 0.08 * u, class: 'rb-dock-pad' }, d);
    svg('path', { d: `M${x - 2 * u},${y} V${y - 5 * u} Q${x - 2 * u},${y - 6 * u} ${x - u},${y - 6 * u} H${x + u} Q${x + 2 * u},${y - 6 * u} ${x + 2 * u},${y - 5 * u} V${y}`, class: 'rb-dock-arch' }, d);
    this.dockBolt = svg('path', { d: `M${x + 0.15 * u},${y - 6.55 * u} L${x - 0.45 * u},${y - 5.65 * u} H${x}  L${x - 0.2 * u},${y - 4.95 * u} L${x + 0.5 * u},${y - 5.95 * u} H${x + 0.05 * u} Z`, class: 'rb-dock-bolt' }, d);
  }

  // ---------- the rhythm strip ----------
  _strip() {
    const st = this.stage, c = this.course, s = this.sp2, u = this.u, y = this.lineY, X = (b) => b * this.ppb;
    const back = st.layers.back, sc = s / st.sp;
    const glyph = (p, ch, x, yy, cls = '') => st.glyph(p, ch, x, yy, cls, sc);
    svg('rect', { x: 0, y: this.stripTop, width: st.w, height: this.stripBot - this.stripTop, fill: STRIP_BG }, back);
    svg('line', { x1: 0, x2: st.w, y1: this.stripTop + 0.5, y2: this.stripTop + 0.5, class: 'rb-strip-edge' }, back);
    svg('line', { x1: 0, x2: st.w, y1: y, y2: y, class: 'rb-staff' }, back);
    const g = this.noteG = svg('g', { class: 'rb-notes' }, back);
    this.nums = [];
    // the count-in, before bar 1
    for (let k = 0, b = -c.countIn; b < -eps; k++, b += c.unit) {
      svg('line', { x1: X(b), x2: X(b), y1: y - 0.55 * s, y2: y + 0.55 * s, class: 'rb-tick' }, g);
      this._num(g, X(b), String((k % c.perBar) + 1), b, c.unit, 'rb-num rb-num-count');
    }
    // bar lines sit just before the downbeat, clear of its notehead; sections end with a double bar
    const inPad = (b) => c.pads.some((p) => b >= p.t - eps && b < p.t + p.d - eps);
    const ends = new Set(c.sections.slice(0, -1).map((sec) => Math.round(sec.end / c.bpb)));
    for (let b = 0; b < c.bars; b++) {
      const bx = X(b * c.bpb) - 1.05 * s;
      if (b) svg('line', { x1: bx, x2: bx, y1: y - 2 * s, y2: y + 2 * s, class: 'rb-barline' }, g);
      if (ends.has(b)) svg('line', { x1: bx - 0.45 * s, x2: bx - 0.45 * s, y1: y - 2 * s, y2: y + 2 * s, class: 'rb-barline' }, g);
      for (let k = 0; k < c.perBar; k++) {
        const beat = b * c.bpb + k * c.unit;
        if (!inPad(beat)) { this._num(g, X(beat), String(k + 1), beat, c.unit, 'rb-num'); continue; }
        // counted, not played: a checkpoint bar, or the silent start of a pickup bar
        svg('line', { x1: X(beat), x2: X(beat), y1: y - 0.55 * s, y2: y + 0.55 * s, class: 'rb-tick' }, g);
        this._num(g, X(beat), String(k + 1), beat, c.unit, 'rb-num rb-num-count');
      }
    }
    // song mode: each section's bars, written over the count that leads into it
    if (c.song) {
      c.sections.forEach((sec, i) => {
        const x = X(i ? sec.start - c.bpb : -c.countIn) + 0.2 * s;
        const t = svg('text', { x, y: this.stripTop + 1.35 * s, 'font-size': Math.max(9, 1.05 * s), class: 'rb-sec' }, g);
        t.textContent = `Bars ${this._range(sec.from, sec.to)}${sec.again ? ' again' : ''}`;
      });
    }
    const xe = X(c.length) - 0.5 * s;
    svg('line', { x1: xe - 0.65 * s, x2: xe - 0.65 * s, y1: y - 2 * s, y2: y + 2 * s, class: 'rb-barline' }, g);
    svg('rect', { x: xe - 0.4 * s, y: y - 2 * s, width: 0.4 * s, height: 4 * s, class: 'rb-final' }, g);
    // notes and rests, each right under its gap or plug
    c.tokens.forEach((tk) => {
      if (tk.pad) return;
      const x = X(tk.t), [base, dots] = BASE[valueKey(tk.d)];
      const tg = tk.el = svg('g', { class: 'rb-tok' }, g);
      if (tk.rest) {
        const w = REST_W[base] * s;
        glyph(tg, GL.rest[base], x - w / 2, y);
        if (dots) glyph(tg, GL.dot, x + w / 2 + 0.2 * s, y - 0.5 * s);
        return;
      }
      const hw = (base === 4 ? 1.69 : 1.18) * s;
      tk.hx = x - hw / 2; tk.hw = hw;
      glyph(tg, GL.head[base >= 2 ? base : 1], tk.hx, y);
      if (base < 4) {
        tk.stemX = tk.hx + hw - 0.06 * s;
        svg('line', { x1: tk.stemX, x2: tk.stemX, y1: y - 0.17 * s, y2: y - 3.5 * s, class: 'rb-stem', 'stroke-width': 0.12 * s }, tg);
      }
      if (dots) glyph(tg, GL.dot, tk.hx + hw + 0.3 * s, y - 0.5 * s);
    });
    // in simple time, the off-beats get their "and"
    if (c.unit === 1) for (const tk of c.tokens) if (!tk.pad && Math.abs((tk.t % 1) - 0.5) < eps) this._num(g, X(tk.t), '+', tk.t, 0.5, 'rb-num rb-and');
    // beams within each beat (dotted-quarter beat in 6/8), flags on lone eighths
    let grp = [];
    const flush = () => {
      if (grp.length === 1) { const tk = grp[0]; glyph(tk.el, GL.flag[BASE[valueKey(tk.d)][0]], tk.stemX - 0.06 * s, y - 3.5 * s); }
      if (grp.length > 1) {
        const a = grp[0], b = grp[grp.length - 1], top = y - 3.5 * s;
        const bg = svg('g', { class: 'rb-beam' }, g);
        bg.dataset.notes = grp.map((tk) => tk.note).join(',');
        svg('rect', { x: a.stemX - 0.06 * s, y: top, width: b.stemX - a.stemX + 0.12 * s, height: 0.5 * s }, bg);
        grp.forEach((tk, i) => {
          if (BASE[valueKey(tk.d)][0] > 0.25) return;
          const nb = grp[i + 1], pv = grp[i - 1];
          if (nb && BASE[valueKey(nb.d)][0] <= 0.25) svg('rect', { x: tk.stemX - 0.06 * s, y: top + 0.75 * s, width: nb.stemX - tk.stemX + 0.12 * s, height: 0.5 * s }, bg);
          else if (!(pv && BASE[valueKey(pv.d)][0] <= 0.25)) {
            const toward = nb ? 1 : -1;
            svg('rect', { x: toward > 0 ? tk.stemX - 0.06 * s : tk.stemX - 1.0 * s, y: top + 0.75 * s, width: 1.06 * s, height: 0.5 * s }, bg);
          }
        });
      }
      grp = [];
    };
    c.tokens.forEach((tk, i) => {
      const flagged = !tk.rest && BASE[valueKey(tk.d)][0] <= 0.5;
      if (!flagged) { flush(); return; }
      const key = Math.floor((tk.t + eps) / c.group);
      const prev = grp[grp.length - 1];
      if (prev && (prev.gk !== key || prev.idx !== i - 1)) flush();
      tk.gk = key; tk.idx = i;
      grp.push(tk);
    });
    flush();
    // ties, curving under the noteheads
    c.tokens.forEach((tk, i) => {
      const nx = c.tokens[i + 1];
      if (tk.rest || !tk.tieNext || !nx || nx.rest) return;
      const a = tk.hx + tk.hw * 0.8, b = nx.hx + nx.hw * 0.2, m = (a + b) / 2, y0 = y + 0.45 * s;
      const k = Math.min(1.0 * s, 0.18 * (b - a)) + 0.3 * s;
      svg('path', { d: `M${a},${y0} Q${m},${y0 + k} ${b},${y0} Q${m},${y0 + k - 0.22 * s} ${a},${y0} Z`, class: 'rb-tie' }, tk.el);
    });
    // clef panel: percussion clef and time signature stay put while the notes scroll under
    svg('rect', { x: 0, y: this.stripTop + 1, width: this.lc, height: this.stripBot - this.stripTop - 1, fill: STRIP_BG }, back);
    svg('rect', { x: this.lc, y: this.stripTop + 1, width: 1.2 * u, height: this.stripBot - this.stripTop - 1, fill: this.ids.fade }, back);
    glyph(back, GL.perc, st.left + 0.2 * s, y, 'rb-clef');
    const tx = st.left + 3.1 * s;
    for (const [v, dy] of [[c.time[0], -0.85], [c.time[1], 0.85]]) st.glyph(back, GL.digits(v), tx, y + dy * s, 'rb-clef rb-timesig', sc * 0.85).setAttribute('text-anchor', 'middle');
    // the blue line: now
    const ph = svg('g', { class: 'rb-playhead' }, back);
    svg('line', { x1: this.rx, x2: this.rx, y1: this.stripTop + 0.3 * s, y2: y + 1.25 * s, class: 'rb-ph-glow' }, ph);
    svg('line', { x1: this.rx, x2: this.rx, y1: this.stripTop + 0.3 * s, y2: y + 1.25 * s, class: 'rb-ph' }, ph);
    svg('path', { d: `M${this.rx - 0.5 * s},${this.stripTop + 0.5} h${s} l${-0.5 * s},${0.6 * s} Z`, class: 'rb-ph-cap' }, ph);
    this.nums.sort((p, q) => p.b - q.b);
    this.numPtr = 0;
    this._paintTokens();
  }

  _num(g, x, label, b, span, cls) {
    const s = this.sp2, fs = Math.max(9, 1.05 * s) * (label === '+' ? 0.95 : 1);
    const t = svg('text', { x, y: this.lineY + 2.45 * s, 'text-anchor': 'middle', 'font-size': fs, class: cls }, g);
    t.textContent = label;
    this.nums.push({ b, span, el: t });
  }

  /** Colour each note on the strip by how it went: hit, missed, or a bridge being held. */
  _paintNote(n, cls) {
    n.paint = cls;
    const c = this.course;
    for (const k of n.toks) {
      const el = c.tokens[k].el;
      if (!el) continue;
      el.classList.remove('hit', 'miss', 'on');
      if (cls) el.classList.add(cls);
    }
    for (const bg of this.noteG?.querySelectorAll('.rb-beam') || []) {
      const ids = bg.dataset.notes.split(',').map(Number);
      const states = ids.map((i) => c.notes[i].paint);
      bg.classList.toggle('hit', states.every((p) => p === 'hit'));
      bg.classList.toggle('miss', states.some((p) => p === 'miss'));
    }
  }

  _paintTokens() {
    if (!this.course || !this.noteG) return;
    for (const n of this.course.notes) {
      const p = n.state === 'pending' ? null : n.complete || (n.kind === 'plug' && n.state === 'hit') ? 'hit' : n.building ? 'on' : n.state === 'hit' && !n.short ? null : 'miss';
      this._paintNote(n, p);
    }
  }

  // ---------- Roboman ----------
  /** A boxy robot built from piano parts: keyboard on his chest, treads, antenna light. Units of u. */
  _robot() {
    const st = this.stage, holder = svg('g', { 'clip-path': this.ids.clip }, st.layers.sprites);
    this.shadow = svg('ellipse', { rx: 1.4 * this.ru, ry: 0.15 * this.ru, class: 'rb-shadow' }, holder);
    const g = svg('g', { class: 'rb-robot' }, holder);
    const P = {};
    P.armB = svg('g', {}, g);
    svg('rect', { x: -0.12, y: -0.05, width: 0.24, height: 0.78, rx: 0.12, fill: RB.steel }, P.armB);
    svg('circle', { cx: 0, cy: 0.78, r: 0.17, fill: RB.steel }, P.armB);
    // treads
    P.treads = svg('g', {}, g);
    svg('rect', { x: -1.28, y: -0.76, width: 2.56, height: 0.76, rx: 0.38, fill: RB.ink }, P.treads);
    P.lugs = svg('rect', { x: -1.22, y: -0.7, width: 2.44, height: 0.64, rx: 0.32, fill: 'none', stroke: RB.steelL, 'stroke-width': 0.09, 'stroke-dasharray': '0.13 0.17' }, P.treads);
    P.wheels = [-0.84, 0, 0.84].map((x) => {
      const wg = svg('g', {}, P.treads);
      wg.dataset.x = x;
      svg('circle', { r: 0.24, fill: RB.steel, stroke: RB.steelL, 'stroke-width': 0.06 }, wg);
      svg('path', { d: 'M-0.16,0 H0.16 M0,-0.16 V0.16', stroke: RB.steelL, 'stroke-width': 0.06 }, wg);
      return wg;
    });
    svg('rect', { x: -0.95, y: -0.9, width: 1.9, height: 0.22, rx: 0.08, fill: RB.steelL }, P.treads);
    // body: a little upright piano
    P.torso = svg('g', {}, g);
    svg('rect', { x: -0.42, y: -1.08, width: 0.84, height: 0.24, fill: RB.steel }, P.torso);
    svg('rect', { x: -1.0, y: -2.5, width: 2.0, height: 1.46, rx: 0.14, fill: RB.brass }, P.torso);
    svg('rect', { x: 0.7, y: -2.42, width: 0.22, height: 1.3, rx: 0.07, fill: RB.brassD }, P.torso);
    svg('rect', { x: -1.08, y: -2.64, width: 2.16, height: 0.2, rx: 0.08, fill: RB.brassD }, P.torso);
    svg('rect', { x: -0.82, y: -2.0, width: 1.64, height: 0.38, rx: 0.04, fill: RB.chalk }, P.torso);
    for (const i of [0, 1, 3, 4, 5]) svg('rect', { x: -0.82 + (i + 1) * 0.2343 - 0.07, y: -2.0, width: 0.14, height: 0.23, fill: RB.ink }, P.torso);
    svg('rect', { x: -0.86, y: -1.62, width: 1.72, height: 0.07, fill: RB.brassD }, P.torso);
    P.light = svg('circle', { cx: -0.58, cy: -1.3, r: 0.1, fill: RB.mint }, P.torso);
    svg('path', { d: 'M0.05,-1.4 H0.55 M0.05,-1.27 H0.55 M0.05,-1.14 H0.55', stroke: RB.brassD, 'stroke-width': 0.06, 'stroke-linecap': 'round' }, P.torso);
    // head
    P.head = svg('g', {}, g);
    svg('rect', { x: -0.17, y: -2.84, width: 0.34, height: 0.24, fill: RB.steel }, P.head);
    svg('circle', { cx: -0.84, cy: -3.2, r: 0.12, fill: RB.steelL }, P.head);
    svg('circle', { cx: 0.84, cy: -3.2, r: 0.12, fill: RB.steelL }, P.head);
    svg('rect', { x: -0.8, y: -3.64, width: 1.6, height: 0.86, rx: 0.3, fill: RB.chalk }, P.head);
    svg('rect', { x: -0.8, y: -3.0, width: 1.6, height: 0.22, rx: 0.1, fill: RB.chalkD }, P.head);
    svg('rect', { x: -0.62, y: -3.44, width: 1.24, height: 0.42, rx: 0.21, fill: RB.ink }, P.head);
    P.eyes = svg('g', {}, P.head);
    svg('circle', { cx: 0.04, cy: -3.23, r: 0.1, fill: RB.mint }, P.eyes);
    svg('circle', { cx: 0.38, cy: -3.23, r: 0.1, fill: RB.mint }, P.eyes);
    svg('line', { x1: 0, y1: -3.64, x2: 0, y2: -4.1, stroke: RB.steelL, 'stroke-width': 0.08 }, P.head);
    P.halo = svg('circle', { cx: 0, cy: -4.22, r: 0.36, fill: RB.mint, opacity: 0 }, P.head);
    P.ball = svg('circle', { cx: 0, cy: -4.22, r: 0.15, fill: RB.mint }, P.head);
    // front arm
    P.armF = svg('g', {}, g);
    svg('rect', { x: -0.12, y: -0.05, width: 0.24, height: 0.78, rx: 0.12, fill: RB.steelL }, P.armF);
    svg('path', { d: 'M-0.2,0.72 A0.2,0.2 0 1 0 0.2,0.72', fill: 'none', stroke: RB.steelL, 'stroke-width': 0.1, 'stroke-linecap': 'round' }, P.armF);
    this.robEl = { g, P };
  }

  // ---------- HUD ----------
  _gauge() {
    const st = this.stage, u = this.u, g = svg('g', { class: 'rb-gauge' }, st.layers.hud);
    const w = clamp(0.9 * u, 10, 17), x = st.left + 0.15 * u;
    const top = Math.min(this.ceilY + 3.4 * u, this.floorY - 5 * u), bot = this.floorY - 0.3 * u;   // below the bar tags
    svg('rect', { x: x - 4, y: top - 1.15 * u - 2, width: w + 8, height: bot - top + 1.15 * u + 6, rx: 6, class: 'rb-gauge-back' }, g);
    const t = svg('text', { x: x + w / 2, y: top - 0.4 * u, 'text-anchor': 'middle', 'font-size': clamp(0.55 * u, 8, 11), class: 'rb-gauge-label' }, g);
    t.textContent = 'FUEL';
    Object.entries({ x, y: top, width: w, height: bot - top, rx: w / 2 }).forEach(([k, v]) => this.tubeRect.setAttribute(k, v));
    const tube = svg('g', { 'clip-path': this.ids.tube }, g);
    svg('rect', { x, y: top, width: w, height: bot - top, class: 'rb-fuel-used' }, tube);
    this.fuelEl = svg('rect', { x, width: w, class: 'rb-fuel' }, tube);
    for (const f of [0.25, 0.5, 0.75]) svg('line', { x1: x, x2: x + w * 0.35, y1: bot - f * (bot - top), y2: bot - f * (bot - top), class: 'rb-fuel-tick' }, tube);
    svg('rect', { x, y: top, width: w, height: bot - top, rx: w / 2, class: 'rb-tube' }, g);
    this.gaugeG = g;
    this.gaugeBox = { top, bot };
  }

  /** The tray: score, bar, plugs and chances. Redrawn only when one of them changes. */
  _hud() {
    const st = this.stage, u = this.u;
    const live = ['ready', 'run', 'fall', 'respawn', 'apart', 'done'].includes(this.mode);
    const c = this.course, last = c.barLabel(c.barMap[c.bars - 1]);
    const now = live ? this._barAt(Math.max(0, this.rob.beat)) : '';
    // the status line always says something during a round, so the board never changes height under it
    const sec = c.sections[this.secIdx];
    const where = c.song && sec ? `Bars ${this._range(sec.from, sec.to)} · ` : '';
    const status = live ? this.statusMsg || (this.fuel < 25 ? 'Fuel low: grab plugs, keep still in rests'
      : `${where}${this.tempo} bpm${this.streak >= 4 ? ` · ${this.streak} in a row` : ''}`) : null;
    if (status !== null && status !== this.statusShown) { this.statusShown = status; this.app.ui.status(status); }
    const key = live ? `${this.score}|${now}|${this.plugs}|${this.chances}` : '';
    if (this.hudG?.isConnected && key === this.hudKey) return;
    this.hudKey = key;
    if (!this.hudG || !this.hudG.isConnected) this.hudG = svg('g', { class: 'ar-hudtext' }, st.layers.hud);
    const g = this.hudG;
    g.textContent = '';
    if (!live) return;
    const y = this.trayY, fs = clamp(u * 0.92, 11, 16);
    const label = (x, anchor, k, v) => {
      const t = svg('text', { x, y: y + fs * 0.35, 'text-anchor': anchor, 'font-size': fs, class: 'ar-hud' }, g);
      svg('tspan', { class: 'ar-hud-k' }, t).textContent = `${k} `;
      svg('tspan', { class: 'ar-hud-v' }, t).textContent = v;
    };
    label(st.left + 0.3 * u, 'start', 'SCORE', this.score.toLocaleString());
    label(st.w / 2, 'middle', 'BAR', now === '0' ? 'pickup' : `${now}/${last}`);
    // chances: little robot heads, then the plug count
    const hw = fs * 1.05, gap = fs * 0.35;
    let x = st.right - 0.3 * u - hw;
    for (let i = (this.lv.chances ?? CHANCES) - 1; i >= 0; i--) {
      const live = i < this.chances;
      svg('rect', { x, y: y - hw * 0.4, width: hw, height: hw * 0.78, rx: hw * 0.25, class: live ? 'rb-life' : 'rb-life lost' }, g);
      svg('rect', { x: x + hw * 0.16, y: y - hw * 0.22, width: hw * 0.68, height: hw * 0.28, rx: hw * 0.14, class: live ? 'rb-life-visor' : 'rb-life-visor lost' }, g);
      x -= hw + gap;
    }
    label(x + hw - gap * 0.5, 'end', 'PLUGS', String(this.plugs));
  }

  _countFlash(n) {
    const st = this.stage, u = this.u;
    // just ahead of Roboman, below the plugs and above the walkway
    const x = this.rx + 1.35 * this.ru + 1.9 * u, y = this.floorY - 2.5 * this.ru;
    const t = svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 3.4 * u, class: 'rb-count' }, st.layers.hud);
    t.textContent = String(n);
    st.tween(Math.min(0.6, this.course.unit * this.spb * 0.95), (p) => {
      t.setAttribute('transform', `translate(${x} ${y}) scale(${1.3 - 0.3 * ease.out(p)}) translate(${-x} ${-y})`);
      t.setAttribute('opacity', 1 - p ** 4);
    }, { done: () => t.remove() });
  }

  /** One feedback word above Roboman: perfect, good, early, late, held too short, rest!, missed. */
  _say(text, kind) {
    if (this.demo) return;
    const st = this.stage, u = this.u;
    const x = this.rx, y = this.plugY - 0.5 * this.ru;
    if (this.fb?.tw) this.fb.tw.killed = true;
    if (!this.fb?.el.isConnected) this.fb = { el: svg('text', { x, 'text-anchor': 'middle', 'font-size': clamp(1.25 * u, 14, 22) }, st.layers.fx) };
    const el = this.fb.el;
    el.setAttribute('class', `rb-fb rb-fb-${kind}`);
    el.textContent = text;
    this.fb.tw = st.tween(0.85, (p) => {
      el.setAttribute('y', y - p * 1.6 * u);
      el.setAttribute('opacity', p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4);
    }, { ease: ease.out });
  }

  /** Light a key without the forced reflow of keyboard.flash (it runs on every press here). */
  _light(midi, cls, ms = 320) {
    const kb = this.app.keyboard;
    kb.mark(midi, cls, true);
    this.lit ||= new Map();
    clearTimeout(this.lit.get(`${midi}${cls}`));
    this.lit.set(`${midi}${cls}`, setTimeout(() => kb.mark(midi, cls, false), ms));
  }

  // ---------- effects ----------
  /** Welding sparks in world space (they scroll with the walkway). */
  _sparks(x, y, n, colors = [RB.brass, RB.chalk]) {
    if (!this.wfx) return;
    const st = this.stage, u = this.u;
    for (let i = 0; i < n; i++) {
      const vx = rand(-5, 2) * u, vy = rand(-5.5, -1) * u, life = rand(0.28, 0.5);
      const l = svg('line', { x1: x, y1: y, x2: x, y2: y, stroke: pick(colors), 'stroke-width': Math.max(1.6, 0.13 * u), 'stroke-linecap': 'round', class: 'rb-spark' }, this.wfx);
      st.tween(life, (p) => {
        const t = p * life, px = x + vx * t, py = y + vy * t + 9 * u * t * t;
        l.setAttribute('x1', px); l.setAttribute('y1', py);
        l.setAttribute('x2', px - vx * 0.05); l.setAttribute('y2', py - (vy + 18 * u * t) * 0.05);
        l.setAttribute('opacity', 1 - p);
      }, { done: () => l.remove() });
    }
  }

  /** Grab a plug: a zap from the prongs to the antenna, then the plug retracts. */
  _grab(n, quiet = false) {
    const st = this.stage, u = this.u;
    this._paintNote(n, 'hit');
    if (!quiet) this.sfx.beam(0.28, true);
    this.rob.flash = 1.4; this.rob.flashAt = this.anim; this.rob.zapAt = this.anim;
    const bolt = svg('polyline', { class: 'rb-zap' }, st.layers.fx);
    const glow = svg('polyline', { class: 'rb-zap-glow' }, st.layers.fx);
    st.tween(0.22, (p) => {
      const px = this.rx + (n.t - this.cam) * this.ppb;
      const ax = this.rx + (this.rob.beat - this.cam) * this.ppb;
      const y1 = this.plugY + 1.05 * this.ru - n.pose.lift, y2 = this.floorY + this.rob.dy - 4.22 * this.ru;
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const f = i / 5, j = i % 5 ? rand(-0.32, 0.32) * u : 0;
        pts.push(`${(px + (ax - px) * f + j).toFixed(1)},${(y1 + (y2 - y1) * f).toFixed(1)}`);
      }
      bolt.setAttribute('points', pts.join(' '));
      glow.setAttribute('points', pts.join(' '));
      bolt.setAttribute('opacity', 1 - p * p);
      glow.setAttribute('opacity', 0.5 * (1 - p));
    }, { done: () => { bolt.remove(); glow.remove(); } });
    if (!quiet) st.puff(this.rx, this.floorY - 4.2 * this.ru, RB.blue, 8, 0.18);
    const up = n.el.len * 0.85;
    st.tween(0.5, (p) => { n.pose.lift = up * p; n.pose.dim = 1.25 * p; }, { ease: ease.in, delay: 0.1 });
  }

  _swingAway(n) {
    this.stage.tween(1.1, (p) => { n.pose.swing = 32 * Math.sin(p * Math.PI * 2.5) * (1 - p); n.pose.dim = Math.min(1, p * 3) * 0.75; });
  }

  // ---------- per-frame render ----------
  _render() {
    if (!this.worldG) return;
    const off = this.rx - this.cam * this.ppb;
    const tr = `translate(${off.toFixed(2)} 0)`;
    this.worldG.setAttribute('transform', tr);
    this.noteG.setAttribute('transform', tr);
    this.para.setAttribute('transform', `translate(${(-this.cam * this.ppb * PARA).toFixed(2)} 0)`);
    const lo = this.cam - this.rx / this.ppb - 1, hi = this.cam + (this.stage.w - this.rx) / this.ppb + 1;
    const beat = this.cam;
    // machines: gears turn, hammers strike their strings on the beat
    for (const gr of this.gears) gr.el.setAttribute('transform', `rotate(${(this.anim * gr.speed % 360).toFixed(1)} ${gr.cx.toFixed(1)} ${gr.cy.toFixed(1)})`);
    const hb = Math.floor(beat + 1e-6), hf = beat - hb;
    for (const hm of this.hammers) {
      const on = ((hb % hm.n) + hm.n) % hm.n === hm.i ? 1 : 0;
      const swing = on ? Math.max(0, 1 - hf * 4) : 0;
      hm.el.setAttribute('transform', `rotate(${(-24 + 24 * swing).toFixed(1)} ${hm.px.toFixed(1)} ${hm.py.toFixed(1)})`);
    }
    this.belt.setAttribute('stroke-dashoffset', (-this.anim * 1.2 * this.u).toFixed(1));
    // bridges and plugs near the camera
    for (const n of this.course.notes) {
      if (n.end < lo || n.t > hi) continue;
      if (n.kind === 'bridge') {
        n.el.setAttribute('width', Math.max(0, (n.built - n.t) * this.ppb).toFixed(1));
        n.el.classList.toggle('short', n.short);
        const hot = n.building && n.built > n.t;
        n.edge.setAttribute('x', (n.built * this.ppb - 0.11 * this.u).toFixed(1));
        n.edge.setAttribute('opacity', hot ? 0.6 + 0.4 * Math.sin(this.anim * 50) : 0);
      } else {
        const sway = n.state === 'pending' ? Math.min(3, 160 / n.el.len) * Math.sin(this.anim * 2.1 + +n.el.dataset.phase) : 0;
        n.el.setAttribute('transform', `translate(${n.el.dataset.x} ${(this.plugY - n.pose.lift).toFixed(1)}) rotate(${(sway + n.pose.swing).toFixed(1)} 0 ${(-n.el.len).toFixed(1)})`);
        n.el.setAttribute('opacity', Math.max(0, 1 - 0.8 * n.pose.dim).toFixed(2));
        n.el.led.classList.toggle('off', n.state !== 'pending');
      }
    }
    this.dockBolt?.classList.toggle('on', this.doneAt != null);
    this._renderRobot();
    // fuel gauge
    const { top, bot } = this.gaugeBox, f = this.fuel / 100;
    this.fuelEl.setAttribute('y', (bot - f * (bot - top)).toFixed(1));
    this.fuelEl.setAttribute('height', (f * (bot - top)).toFixed(1));
    this.gaugeG.classList.toggle('low', this.fuel < 25 && !this.demo);
    // the count under the blue line lights up
    const nums = this.nums;
    let cur = null;
    for (const nm of nums) { if (nm.b <= beat + 0.02 && beat < nm.b + nm.span) cur = nm; if (nm.b > beat + 0.02) break; }
    if (cur !== this.curNum) { this.curNum?.el.classList.remove('now'); cur?.el.classList.add('now'); this.curNum = cur; }
  }

  _renderRobot() {
    const r = this.rob, el = this.robEl;
    if (!el) return;
    const u = this.ru, P = el.P;
    const x = this.rx + (r.beat - this.cam) * this.ppb, y = this.floorY + r.dy;
    const walking = ['run', 'done', 'attract'].includes(this.mode) && r.beat > this.idle + 0.01 && this.doneAt == null;
    let rot = r.rot;
    if (r.teeter && this.mode === 'run') rot += 7 + Math.sin(this.anim * 34) * 4;
    el.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${u.toFixed(3)})`);
    el.g.setAttribute('opacity', r.alpha);
    this.shadow.setAttribute('cx', x.toFixed(1));
    this.shadow.setAttribute('cy', (this.floorY + 0.06 * u).toFixed(1));
    this.shadow.setAttribute('opacity', (Math.abs(r.dy) < 0.3 * u && r.alpha > 0.5 && !r.parts ? 0.32 : 0).toString());
    const dist = (r.beat * this.ppb) / u;
    const wr = ((dist / 0.24) * 57.3) % 360;
    for (const w of P.wheels) w.setAttribute('transform', `translate(${w.dataset.x} -0.38) rotate(${wr.toFixed(1)})`);
    P.lugs.setAttribute('stroke-dashoffset', (-dist % 0.3).toFixed(3));
    const ph = r.beat - Math.floor(r.beat);
    const bob = walking ? -0.08 * Math.sin(Math.PI * ph) ** 2 : -0.025 * Math.sin(this.anim * 2.2);
    const swing = walking ? 16 * Math.sin(Math.PI * r.beat) : 4 * Math.sin(this.anim * 1.6);
    const pp = r.parts || {};
    const pose = (k, base) => {
      const q = pp[k];
      return q ? `translate(${q.x.toFixed(2)} ${q.y.toFixed(2)}) ${base} rotate(${q.a.toFixed(1)})` : base;
    };
    P.torso.setAttribute('transform', pose('torso', `translate(0 ${bob.toFixed(3)})`));
    P.head.setAttribute('transform', pose('head', `translate(0 ${(bob * 1.35).toFixed(3)})`));
    P.armF.setAttribute('transform', pose('armR', `translate(1.02 ${(-2.32 + bob).toFixed(3)}) rotate(${(-swing - 8).toFixed(1)})`));
    P.armB.setAttribute('transform', pose('armL', `translate(-1.02 ${(-2.32 + bob).toFixed(3)}) rotate(${(swing + 8).toFixed(1)})`));
    // eyes blink every few seconds and look up as a plug arrives
    const blink = this.anim % 3.4 < 0.11 ? 0.15 : 1;
    const plugNear = this.course.notes.some((n) => n.kind === 'plug' && n.state === 'pending' && n.t - r.beat < 1.2 && n.t - r.beat > -0.1);
    P.eyes.setAttribute('transform', `translate(0 ${plugNear ? -0.06 : 0}) translate(0 -3.23) scale(1 ${blink}) translate(0 3.23)`);
    const fl = r.flash * Math.max(0, 1 - (this.anim - r.flashAt) / 0.28);
    const low = this.fuel < 25 && !this.demo, dead = this.mode === 'apart' || (this.mode === 'over' && this.fuel <= 0);
    const ball = dead ? RB.steelL : r.dazed ? (this.anim % 0.3 < 0.15 ? RB.coral : RB.steelL) : low ? (this.anim % 0.5 < 0.25 ? RB.coral : '#7a3b30') : r.teeter && this.mode === 'run' ? RB.coral : RB.mint;
    for (const e of P.eyes.children) e.setAttribute('fill', dead || r.dazed ? RB.coral : RB.mint);
    P.ball.setAttribute('fill', ball);
    P.light.setAttribute('fill', dead ? RB.steelL : low ? RB.coral : RB.mint);
    P.halo.setAttribute('fill', this.anim - (r.zapAt || -9) < 0.3 ? RB.blue : ball);
    P.halo.setAttribute('opacity', (dead ? 0 : Math.min(0.75, fl * 0.6)).toFixed(2));
    P.halo.setAttribute('r', (0.3 + 0.18 * Math.min(1, fl)).toFixed(3));
  }
}
