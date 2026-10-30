// Extra games: Stepping Stones (rhythm), Chord Stars (chords), Flashcards (theory review),
// and QuizRunner, the multiple-choice engine that lessons reuse.
import { GameBase } from './gamebase.js';
import { h, segmented } from './ui.js';
import { parseVoice, buildScore, spell, noteName, pc } from './theory.js';
import { Staff } from './staff.js';

// ======================================================================
// Shared helpers
// ======================================================================
const NS = 'http://www.w3.org/2000/svg';
const G = {
  whole: '', half: '', black: '', dot: '', flag8: '',
  gClef: '', fClef: '', perc: '',
  flat: '', natural: '', sharp: '',
  rest: { 4: '', 2: '', 1: '', 0.5: '' },
  dyn: { pp: '', p: '', mp: '', mf: '', f: '', ff: '' },
  repeatEnd: '', accent: '', fermata: '',
  digits: (n) => String(n).split('').map((c) => String.fromCharCode(0xe080 + +c)).join(''),
};
const WIN = { perfect: 0.07, good: 0.14, max: 0.24 }; // seconds, as in Session

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const footOf = (app) => app.ui.footEl || document.getElementById('foot');
const num = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
/** Level picker: one scrollable row on narrow boards, with the chosen level in view. */
function gxSeg(foot) {
  const seg = foot.querySelector('.seg');
  if (!seg) return;
  seg.classList.add('gx-seg');
  const on = seg.querySelector('[aria-checked="true"]');
  if (on && seg.scrollWidth > seg.clientWidth) seg.scrollLeft = on.offsetLeft - seg.clientWidth / 2 + on.clientWidth / 2;
}

function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, num(v));
  if (parent) parent.append(n);
  return n;
}
function txt(parent, str, x, y, cls, size) {
  const t = s('text', { x, y, class: cls, 'font-size': size }, parent);
  t.textContent = str;
  return t;
}
const glyph = (parent, ch, x, y, cls = 'glyph', size = 4) => txt(parent, ch, x, y, cls, size);

const baseDur = (d) => (d >= 4 - 1e-6 ? 4 : d >= 2 - 1e-6 ? 2 : d >= 1 - 1e-6 ? 1 : 0.5);
const isDotted = (d) => Math.abs(d - baseDur(d) * 1.5) < 1e-6;

/**
 * Draw a rhythm on a one-line staff (units: staff spaces). Stems up, eighths beamed by beat,
 * ties, dots, rests, and counts ("1 + 2 +") under the line.
 * o: { x0, ppb, y, len, bpb = 4, counts = true, countDy = 2.9 }
 * Returns { root, notes: [{ e, g, x, xc }], counts: [{ t, el }] } with notes in event order.
 */
export function drawRhythm(parent, evs, o) {
  const { x0, ppb, y } = o;
  const bpb = o.bpb || 4;
  const STEM = 3.3;
  const root = s('g', { class: 'rh' }, parent);
  const plainE = (e) => e && !e.rest && Math.abs(e.d - 0.5) < 1e-6;
  const beamed = new Map();
  for (let i = 0; i < evs.length - 1; i++) {
    const a = evs[i], b = evs[i + 1];
    if (plainE(a) && plainE(b) && Math.abs(a.t % 1) < 1e-6 && Math.abs(a.t + 0.5 - b.t) < 1e-6) { beamed.set(a, b); beamed.set(b, a); i++; }
  }
  const notes = [];
  for (const e of evs) {
    const x = x0 + e.t * ppb;
    const g = s('g', { class: `rh-ev${e.rest ? ' rh-rest' : ''}` }, root);
    const base = baseDur(e.d);
    if (e.rest) {
      glyph(g, G.rest[base], base === 4 ? x + Math.max(0, e.d * ppb / 2 - 1.2) : x, y);
    } else {
      const head = base === 4 ? G.whole : base === 2 ? G.half : G.black;
      const hw = base === 4 ? 1.688 : 1.18;
      glyph(g, head, x, y);
      if (base < 4) {
        const sx = x + hw - 0.06;
        s('line', { class: 'rh-stem', x1: sx, x2: sx, y1: y - 0.17, y2: y - STEM }, g);
        if (base < 1 && !beamed.has(e)) glyph(g, G.flag8, sx - 0.06, y - STEM);
      }
      if (isDotted(e.d)) glyph(g, G.dot, x + hw + 0.3, y - 0.5);
    }
    notes.push({ e, g, x, xc: x + 0.59 });
  }
  for (const [a, b] of beamed) {
    if (b.t < a.t) continue;
    const x1 = x0 + a.t * ppb + 1.06, x2 = x0 + b.t * ppb + 1.18;
    s('polygon', { class: 'rh-beam', points: `${num(x1)},${num(y - STEM)} ${num(x2)},${num(y - STEM)} ${num(x2)},${num(y - STEM + 0.5)} ${num(x1)},${num(y - STEM + 0.5)}` }, root);
  }
  for (const e of evs) {
    if (!e.tieTo) continue;
    const hw = baseDur(e.d) === 4 ? 1.688 : 1.18;
    const xs = x0 + e.t * ppb + hw + 0.12, xe = x0 + e.tieTo.t * ppb - 0.12;
    const ys = y + 0.65, hg = Math.min(0.9, 0.3 + 0.04 * (xe - xs)), mx = (xs + xe) / 2;
    s('path', { class: 'rh-tie', d: `M${num(xs)},${num(ys)} Q${num(mx)},${num(ys + hg * 2)} ${num(xe)},${num(ys)} Q${num(mx)},${num(ys + (hg - 0.22) * 2)} ${num(xs)},${num(ys)} Z` }, root);
  }
  const counts = [];
  if (o.counts !== false) {
    const len = o.len ?? Math.max(...evs.map((e) => e.t + e.d));
    const starts = new Set(evs.filter((e) => !e.rest && !e.tiedFrom).map((e) => Math.round(e.t * 2)));
    const cy = y + (o.countDy ?? 2.9);
    const gC = s('g', { class: 'rh-counts' }, root);
    for (let b = 0; b < len - 1e-6; b++) {
      const on = starts.has(b * 2);
      const rest = !on && evs.some((e) => e.rest && e.t <= b + 1e-6 && b < e.t + e.d - 1e-6);
      counts.push({ t: b, el: txt(gC, String((b % bpb) + 1), x0 + b * ppb + 0.59, cy, `rh-count ${on ? 'on' : rest ? 'rest' : 'held'}`, o.countSize || 1.45) });
    }
    for (const e of evs) {
      if (e.rest || e.tiedFrom || Math.abs((e.t % 1) - 0.5) > 1e-6) continue;
      counts.push({ t: e.t, el: txt(gC, '+', x0 + e.t * ppb + 0.59, cy, 'rh-count on plus', o.countSize || 1.45) });
    }
    counts.sort((a, b) => a.t - b.t);
  }
  return { root, notes, counts };
}

// ======================================================================
// Stepping Stones: rhythm game
// ======================================================================
const VOICE = { w: 'B4w', h: 'B4h', q: 'B4q', e: 'B4e', 'q.': 'B4q.', wr: 'rw', hr: 'rh', qr: 'rq', er: 're' };
const fill = (gen, ok) => { for (let i = 0; i < 60; i++) { const b = gen(); if (ok(b)) return b; } return gen(); };
const BARS = {
  quarters: () => ['q', 'q', 'q', 'q'],
  long: () => pick([['h', 'h'], ['w'], ['q', 'q', 'h'], ['h', 'q', 'q'], ['q', 'h', 'q'], ['q', 'q', 'q', 'q'], ['h', 'h'], ['q', 'q', 'h']]),
  eighths: () => fill(() => {
    const out = [];
    for (let b = 0; b < 4;) {
      if (b % 2 === 0 && Math.random() < 0.15) { out.push('h'); b += 2; } else { out.push(...(Math.random() < 0.5 ? ['e', 'e'] : ['q'])); b++; }
    }
    return out;
  }, (bar) => bar.includes('e')),
  rests: () => fill(() => {
    const out = [];
    for (let b = 0; b < 4;) {
      const r = Math.random();
      if (b % 2 === 0 && r < 0.14) { out.push('h'); b += 2; } else if (b % 2 === 0 && r < 0.24) { out.push('hr'); b += 2; } else { out.push(Math.random() < 0.32 ? 'qr' : 'q'); b++; }
    }
    return out;
  }, (bar) => bar.some((t) => t.endsWith('r')) && bar.some((t) => !t.endsWith('r'))),
  dotted: () => fill(() => {
    const out = [];
    for (let b = 0; b < 4; b += 2) {
      const r = Math.random();
      if (r < 0.55) out.push('q.', 'e'); else if (r < 0.7) out.push('h'); else out.push(...pick([['q', 'q'], ['e', 'e', 'q'], ['q', 'e', 'e']]));
    }
    return out;
  }, (bar) => bar.includes('q.')),
  offbeats: () => fill(() => {
    const out = [];
    for (let b = 0; b < 4;) {
      const r = Math.random();
      if (b % 2 === 0 && r < 0.4) { out.push('e', 'q', 'e'); b += 2; } else if (b % 2 === 0 && r < 0.5) { out.push('q.', 'e'); b += 2; } else { out.push(...pick([['q'], ['e', 'e'], ['er', 'e'], ['er', 'e']])); b++; }
    }
    return out;
  }, (bar) => bar.join(' ').includes('e q e') || bar.includes('er')),
};

const KINDS = {
  quarter: { plural: 'quarter notes', count: '“1 2 3 4”', level: 0, skill: 'note-values' },
  half: { plural: 'half notes', count: '“1 2” through each one', level: 1, skill: 'note-values' },
  whole: { plural: 'whole notes', count: '“1 2 3 4” through each one', level: 1, skill: 'note-values' },
  eighth: { plural: 'eighth notes', count: '“1 + 2 +”', level: 2, skill: 'eighths' },
  dotted: { plural: 'dotted rhythms', count: '“1 2 +”', level: 4, skill: 'dotted' },
  offbeat: { plural: 'offbeat notes', count: '“1 + 2 +” and tap right on the “+”', level: 5, skill: 'eighths' },
};

/** A random rhythm for one round: { evs, len, key, minGap } (events from parseVoice, plus .kind). */
export function makePattern(lv, bars = 2) {
  const toks = [];
  for (let b = 0; b < bars; b++) toks.push(...(BARS[lv.bars] || BARS.quarters)());
  const key = toks.map((t) => VOICE[t]).join(' ');
  const { events, length } = parseVoice(key);
  const onsets = new Set(events.filter((e) => !e.rest).map((e) => Math.round(e.t * 2)));
  let prev = null;
  for (const e of events) {
    if (e.rest) { prev = null; continue; }
    const frac = e.t % 1;
    const crosses = Math.floor(e.t + 1e-6) !== Math.floor(e.t + e.d - 1e-6);
    if (isDotted(e.d) || (prev && isDotted(prev.d) && Math.abs(e.d - 0.5) < 1e-6)) e.kind = 'dotted';
    else if (Math.abs(frac - 0.5) < 1e-6 && (crosses || !onsets.has(Math.floor(e.t) * 2))) e.kind = 'offbeat';
    else e.kind = { 4: 'whole', 2: 'half', 1: 'quarter', 0.5: 'eighth' }[baseDur(e.d)];
    prev = e;
  }
  const on = events.filter((e) => !e.rest).map((e) => e.t);
  let minGap = 1;
  for (let i = 1; i < on.length; i++) minGap = Math.min(minGap, on[i] - on[i - 1]);
  return { evs: events, len: length, key, minGap };
}


/** The river scene: notation on a one-line staff, stones under each note, and a hopping figure. */
class PathScene {
  constructor() {
    this.el = h('div', { class: 'gx-scene ss-scene' });
    this.svg = s('svg', { class: 'ss-svg', role: 'img', 'aria-label': 'Rhythm path: one stepping stone for each note, counts written underneath' }, this.el);
    this.evs = []; this.len = 4; this.marks = new Map();
    this.beat = -9; this.info = ''; this.lives = [0, 0]; this.cin = 0; this.curCount = -1;
    this.still = reduced();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
  }

  destroy() { this.ro.disconnect(); }
  get wide() { return (this.el.clientWidth || 800) >= 600; }

  set(evs, len) {
    this.evs = evs; this.len = len; this.marks = new Map(); this._land = null;
    this.layout();
  }

  layout() {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (W < 40 || H < 40) return;
    const FIX = 8.2, pad = W < 600 ? 10 : 20;
    const compact = W < 600 || H < 210;
    const CH = compact ? 14.6 : 17;
    const sp = Math.min(H / CH, (W - 2 * pad) / (FIX + this.len * 5.2), 19);
    const w = W / sp, hh = H / sp;
    const ppb = Math.min(10, (w - 2 * pad / sp - FIX) / this.len);
    const span = FIX + this.len * ppb;
    const ox = Math.max(pad / sp, (w - span) / 2), oy = Math.max(0, (hh - CH) / 2);
    const x0 = 5.2, L = compact ? 6.4 : 7.2, yS = compact ? 11.9 : 13.6, wy = yS - 1.3;
    const xEnd = x0 + this.len * ppb - 0.3;
    this.txtSize = (n) => Math.max(n, 12 / sp);
    Object.assign(this, { ppb, x0, xEnd, L, yS, span, sp });
    const svg = this.svg;
    svg.setAttribute('viewBox', `${num(-ox)} ${num(-oy)} ${num(w)} ${num(hh)}`);
    svg.textContent = '';
    this.gHud = s('g', { class: 'ss-hud' }, svg);
    // the one-line staff
    s('line', { class: 'rh-line', x1: 0, x2: xEnd, y1: L, y2: L }, svg);
    glyph(svg, G.perc, 0.3, L, 'glyph rh-clef');
    glyph(svg, G.digits(4), 2.5, L - 1, 'glyph rh-clef');
    glyph(svg, G.digits(4), 2.5, L + 1, 'glyph rh-clef');
    for (let b = 4; b < this.len; b += 4) {
      const x = x0 + b * ppb - 0.75;
      s('line', { class: 'rh-bar', x1: x, x2: x, y1: L - 2, y2: L + 2 }, svg);
    }
    s('line', { class: 'rh-bar', x1: xEnd - 0.8, x2: xEnd - 0.8, y1: L - 2, y2: L + 2 }, svg);
    s('rect', { class: 'rh-bar-end', x: xEnd - 0.45, y: L - 2, width: 0.45, height: 4 }, svg);
    // river, banks
    const gR = s('g', { class: 'ss-river' }, svg);
    const wx = x0 - 1.1, ww = xEnd - x0 + 1.9;
    s('rect', { class: 'ss-water', x: wx, y: wy, width: ww, height: CH - 0.4 - wy, rx: 0.9 }, gR);
    for (let k = 0; k < 3; k++) {
      const yy = yS + 1.4 + k * 0.55, n = Math.max(1, Math.floor((ww - 2) / 0.8));
      let d = `M${num(wx + 0.6 + (k % 2) * 0.8)},${num(yy)} q0.4,-0.28 0.8,0`;
      for (let i = 1; i < n; i++) d += ' t0.8,0';
      s('path', { class: 'ss-ripple', d }, gR);
    }
    s('path', { class: 'ss-bank', d: `M-0.3,${yS} H${num(x0 - 0.9)} q0.55,0 0.55,0.8 V${CH - 0.2} H-0.3 Z` }, gR);
    s('path', { class: 'ss-bank', d: `M${num(xEnd + 2.9)},${yS} H${num(xEnd + 0.95)} q-0.55,0 -0.55,0.8 V${CH - 0.2} H${num(xEnd + 2.9)} Z` }, gR);
    // stones under the notes, then the notation itself
    const gStones = s('g', { class: 'ss-stones' }, svg);
    const nt = drawRhythm(svg, this.evs, { x0, ppb, y: L, len: this.len, countSize: Math.max(1.45, 11.5 / sp), countDy: 2.4 + Math.max(1.45, 11.5 / sp) * 0.35 });
    this.counts = nt.counts; this.noteEls = nt.notes; this.curCount = -1;
    this.stones = [];
    nt.notes.forEach((n, i) => {
      if (n.e.rest || n.e.tiedFrom) return;
      const x1 = x0 + n.e.t * ppb - 0.25;
      const x2 = Math.max(x1 + 1.7, x0 + (n.e.t + (n.e.sd ?? n.e.d)) * ppb - 0.7);
      const g = s('g', { class: 'ss-stone' }, gStones);
      s('rect', { class: 'ss-rock', x: x1, y: yS, width: x2 - x1, height: 1.05, rx: 0.5 }, g);
      s('line', { class: 'ss-onset', x1: n.xc, x2: n.xc, y1: yS + 0.22, y2: yS + 0.83 }, g);
      this.stones[i] = { g, x1, x2, xc: n.xc };
    });
    this.gFx = s('g', { class: 'ss-fx' }, svg);
    // the walker
    this.fig = s('g', { class: 'ss-fig' }, svg);
    const body = s('g', { class: 'ss-fig-body' }, this.fig);
    s('line', { class: 'ss-leg', x1: -0.36, y1: -0.3, x2: -0.44, y2: 0 }, body);
    s('line', { class: 'ss-leg', x1: 0.36, y1: -0.3, x2: 0.44, y2: 0 }, body);
    s('ellipse', { class: 'ss-skin', cx: 0, cy: -1.3, rx: 0.95, ry: 1.1 }, body);
    s('path', { class: 'ss-scarf', d: 'M-0.93,-1.0 Q0,-0.62 0.93,-1.0 L0.9,-0.66 Q0,-0.3 -0.9,-0.66 Z M-0.6,-0.8 L-1.5,-0.35 L-1.3,-0.1 L-0.45,-0.55 Z' }, body);
    s('circle', { class: 'ss-eye', cx: 0.42, cy: -1.6, r: 0.16 }, body);
    this._hud();
    for (const i of this.marks.keys()) this._mark(i);
    this.setBeat(this.beat);
  }

  hud(info, lives = 0, max = 0) { this.info = info; this.lives = [lives, max]; this._hud(); }
  countIn(n) { if (n !== this.cin) { this.cin = n; this._hud(); } }

  _hud() {
    const g = this.gHud;
    if (!g) return;
    g.textContent = '';
    const t = txt(g, '', 0, 1.6, 'ss-info', this.txtSize(1.15));
    if (this.cin) {
      const a = s('tspan', {}, t); a.textContent = 'Count in ';
      for (let k = 1; k <= 4; k++) {
        const b = s('tspan', { class: k === this.cin ? 'ss-cin now' : 'ss-cin', dx: 0.35 }, t);
        b.textContent = String(k);
      }
    } else t.textContent = this.info || '';
    const [n, max] = this.lives;
    for (let i = 0; i < max; i++) {
      s('ellipse', { class: `ss-life${i < n ? ' on' : ''}`, cx: this.span - 0.7 - i * 1.25, cy: 1.2, rx: 0.48, ry: 0.32 }, g);
    }
  }

  _landings() {
    if (this._land) return this._land;
    const L = [{ t: -0.6, end: -0.6 }];
    for (const e of this.evs) if (!e.rest && !e.tiedFrom) L.push({ t: e.t, end: e.t + (e.sd ?? e.d) - 0.2 });
    L.push({ t: this.len + 0.25, end: Infinity });
    return (this._land = L);
  }

  _hop(beat) {
    if (this.still) return 0;
    const L = this._landings();
    for (let k = 0; k < L.length - 1; k++) {
      const a = L[k], b = L[k + 1];
      if (beat < a.t || beat >= b.t) continue;
      const hs = Math.max(a.t, Math.min(a.end, b.t - 0.5));
      if (beat < hs) return 0;
      const span = b.t - hs, ph = (beat - hs) / span;
      return Math.min(1.3, 0.45 + 0.55 * span) * 4 * ph * (1 - ph);
    }
    return 0;
  }

  setBeat(beat) {
    this.beat = beat;
    if (!this.fig) return;
    const x = clamp(this.x0 + 0.59 + beat * this.ppb, 1.2, this.xEnd + 1.8);
    this.fig.setAttribute('transform', `translate(${num(x)},${num(this.yS - this._hop(beat))})`);
    let cur = -1;
    if (beat >= -0.05 && beat < this.len) for (let i = 0; i < this.counts.length; i++) if (this.counts[i].t <= beat + 0.05) cur = i;
    if (cur !== this.curCount) {
      this.counts[this.curCount]?.el.classList.remove('now');
      this.counts[cur]?.el.classList.add('now');
      this.curCount = cur;
    }
  }

  /** cls: '' | 'next' | 'hit' | 'ok' | 'miss'; off = where the tap landed, in beats from the note. */
  mark(i, cls, off = null) {
    if (cls) this.marks.set(i, { cls, off }); else this.marks.delete(i);
    this._mark(i);
  }

  _mark(i) {
    const m = this.marks.get(i), st = this.stones?.[i], ne = this.noteEls?.[i];
    if (!st) return;
    st.g.setAttribute('class', `ss-stone ${m?.cls || ''}`.trim());
    ne?.g.setAttribute('class', `rh-ev ${m?.cls || ''}`.trim());
    st.g.querySelector('.ss-foot')?.remove();
    if (m && m.off !== null && m.off !== undefined) {
      s('ellipse', { class: 'ss-foot', cx: clamp(st.xc + m.off * this.ppb, st.x1 - 0.8, st.x2 + 0.8), cy: this.yS + 0.52, rx: 0.34, ry: 0.24 }, st.g);
    }
    const c = this.counts?.find((x) => Math.abs(x.t - ne.e.t) < 1e-6);
    c?.el.classList.toggle('miss', m?.cls === 'miss');
  }

  stumble() {
    if (!this.fig) return;
    this.fig.classList.remove('stumble');
    void this.fig.getBoundingClientRect();
    this.fig.classList.add('stumble');
    clearTimeout(this.st);
    this.st = setTimeout(() => this.fig?.classList.remove('stumble'), 500);
  }

  splash(beat) {
    if (!this.gFx) return;
    const x = clamp(this.x0 + 0.59 + beat * this.ppb, this.x0 - 0.5, this.xEnd);
    const c = s('ellipse', { class: 'ss-splash', cx: x, cy: this.yS + 0.8, rx: 1.0, ry: 0.4 }, this.gFx);
    setTimeout(() => c.remove(), 750);
  }
}

const MAX_LIVES = 5;
const SPEEDS = [{ value: 0.8, label: 'Relaxed' }, { value: 1, label: 'Steady' }, { value: 1.2, label: 'Brisk' }];

function rhythmTakeaway(log, levels, cur, speed) {
  if (!log.length) return '';
  const taps = log.filter((x) => !x.stray);
  const restTaps = log.filter((x) => x.kind === 'rest').length;
  const heldTaps = log.filter((x) => x.kind === 'held').length;
  const by = {};
  for (const x of taps) {
    const k = (by[x.kind] ||= { n: 0, miss: 0, sum: 0, cnt: 0, off: 0 });
    k.n++;
    if (x.d === null) k.miss++;
    else { k.sum += x.d; k.cnt++; if (Math.abs(x.d) > WIN.good) k.off++; }
  }
  let worst = null, wScore = 0;
  for (const [kind, k] of Object.entries(by)) {
    const sc = (k.miss * 2 + k.off) / Math.max(3, k.n);
    if (sc > wScore) { wScore = sc; worst = kind; }
  }
  const slower = speed > 0.8 ? ' at Relaxed speed' : '';
  const suggest = (idx) => (idx === cur || idx === undefined ? `Try this level again${slower}.` : `Try “${levels[idx].name}”${slower}.`);
  const worstPts = worst ? by[worst].miss * 2 + by[worst].off : 0;
  if (restTaps >= 2 && restTaps * 2 >= worstPts) return `You tapped during the rests. Lift your hand on a rest and keep counting through the silence. ${suggest(3)}`;
  if (heldTaps >= 2 && heldTaps * 2 >= worstPts) return 'You tapped again in the middle of long notes. Stay on the stone and count through it: a half note is “1 2”.';
  if (!worst || wScore < 0.12) {
    const all = taps.filter((x) => x.d !== null);
    const mean = all.length ? all.reduce((a, x) => a + x.d, 0) / all.length : 0;
    if (mean < -0.035) return 'Good run. You tend to be a hair early: let each click land before you tap.';
    if (mean > 0.035) return 'Good run. You tend to be a hair late: feel the next count coming.';
    return speed < 1.2 ? 'Steady timing all the way. Try Brisk speed or the next level.' : 'Steady timing all the way, even at Brisk speed. Try the next level.';
  }
  const k = by[worst], K = KINDS[worst];
  const mean = k.cnt ? k.sum / k.cnt : 0;
  if (k.miss && k.miss * 2 >= k.off) return `Some ${K.plural} slipped past. Say ${K.count} out loud as you tap. ${suggest(K.level)}`;
  if (mean < -0.03) return `You rushed the ${K.plural}: let the click land, then tap. ${suggest(K.level)}`;
  if (mean > 0.03) return `You were late on the ${K.plural}: say the next count before it arrives. ${suggest(K.level)}`;
  return `The ${K.plural} were uneven. Count ${K.count} and keep each tap on the click. ${suggest(K.level)}`;
}

function roundLine(c) {
  const errs = c.missed + c.strays;
  const parts = [];
  if (c.missed) parts.push(`${c.missed} missed`);
  if (c.strays) parts.push(`${c.strays} extra ${c.strays === 1 ? 'tap' : 'taps'}`);
  if (c.early) parts.push(`${c.early} early`);
  if (c.late) parts.push(`${c.late} late`);
  if (!errs && c.early + c.late <= 1) return `Round ${c.r}: clean${c.bonus ? ', and you earned a stone back' : ''}. Read the next path while the clicks count you in.`;
  let tip = 'Say the counts under the stones as you go.';
  if (c.restTaps) tip = 'Rests are silent: count them without tapping.';
  else if (c.early > c.late + 1) tip = 'You’re rushing: let the click land first.';
  else if (c.late > c.early + 1) tip = 'You’re dragging: say the next count before it comes.';
  return `Round ${c.r}: ${parts.join(', ')}. ${tip}`;
}

export class RhythmGame extends GameBase {
  constructor(app, game) {
    super(app, game);
    this.speed = app.store.data.beatSpeed ?? 1;
  }

  get lv() { return this.game.levels[this.level]; }

  enter() {
    this.onKey = (ev) => {
      if (ev.code !== 'Space' || ev.metaKey || ev.ctrlKey || ev.altKey || !this.playing) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName || '')) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.repeat) return;
      const { sound } = this.app;
      if (sound.drum) sound.drum('rim', sound.now(), 0.7); else sound.click(sound.now(), false);
      this._tap(performance.now());
    };
    window.addEventListener('keydown', this.onKey, true);
    super.enter();
  }

  exit() {
    this.demoRun = null;
    super.exit();
    window.removeEventListener('keydown', this.onKey, true);
    if (this.tracker) { this.app.coach?.end?.(this.tracker); this.tracker = null; }
    this.scene?.destroy();
    this.scene = null;
  }

  _scene() {
    if (!this.scene) this.scene = new PathScene();
    if (!this.scene.el.isConnected) this.app.ui.layer(this.scene.el, { hideStaff: true });
    return this.scene;
  }

  _bpm(base) { return Math.round(base * this.speed); }

  preview() {
    const sc = this._scene();
    this.app.keyboard.need(60, 72);
    this.sample = makePattern(this.lv, sc.wide ? 2 : 1);
    sc.set(this.sample.evs, this.sample.len);
    sc.hud(`${this.lv.name} · ${this._bpm(this.lv.tempo)} bpm`);
    sc.setBeat(-1);
    this.app.ui.prompt(this.lv.tip);
  }

  intro() {
    this._stopDemo();
    super.intro();
    const foot = footOf(this.app);
    gxSeg(foot);
    foot.querySelector('.controls')?.append(segmented('Speed', SPEEDS, this.speed, (v) => {
      this.speed = v;
      this.app.store.data.beatSpeed = v;
      this.app.store.save();
      this.scene?.hud(`${this.lv.name} · ${this._bpm(this.lv.tempo)} bpm`);
    }));
    foot.querySelector('[data-enter]')?.after(h('button', { class: 'btn', onclick: () => this._demo(this.sample, this._bpm(this.lv.tempo)) }, 'Hear it first'));
  }

  start() {
    this._stopDemo();
    const { sound, ui } = this.app;
    sound.unlock();
    const sc = this._scene();
    this.playing = true;
    this.score = 0; this.combo = 0; this.lives = MAX_LIVES;
    this.log = []; this.rounds = []; this.next = null; this.lastTap = -1e9;
    this.bars = sc.wide ? 2 : 1;
    if (this.tracker) this.app.coach?.end?.(this.tracker);
    this.tracker = this.app.coach?.begin?.({ topic: 'rhythm', skills: [this.lv.skill] }) || null;
    this.cur = this._makeRound(sound.now() + 0.3, null);
    this._show(this.cur);
    ui.prompt('Tap any key, or Space, as you reach each stone. Four clicks count you in.');
    ui.foot(h('button', { class: 'btn', onclick: () => this._end('Stopped.') }, 'Stop'), h('span', { class: 'note' }, 'Any key or Space'));
    this._status();
  }

  _makeRound(ready, prev) {
    const lv = this.lv;
    let bpm = lv.tempo;
    if (prev) {
      const errs = prev.missed + prev.strays;
      bpm = errs === 0 ? prev.base + lv.step : errs === 1 ? prev.base : Math.max(lv.tempo, prev.base - lv.step);
      bpm = Math.min(lv.max, bpm);
    }
    const real = this._bpm(bpm), spb = 60 / real;
    let pat;
    do { pat = makePattern(lv, this.bars); } while (prev && pat.key === prev.pat.key && lv.bars !== 'quarters');
    return {
      r: (prev?.r || 0) + 1, pat, evs: pat.evs, notes: pat.evs.filter((e) => !e.rest), len: pat.len,
      base: bpm, bpm: real, spb, t0: ready + 4 * spb, clickNext: -4, judged: new Map(),
      missed: 0, strays: 0, early: 0, late: 0, restTaps: 0, win: Math.min(WIN.max, 0.45 * pat.minGap * spb),
    };
  }

  _show(c) {
    this.scene.set(c.evs, c.len);
    this.scene.hud(`Round ${c.r} · ${c.bpm} bpm`, this.lives, MAX_LIVES);
  }

  _status(fb = '') {
    this.app.ui.status(`${this.score} points${fb ? ` · ${fb}` : ''}`);
    if (this.cur && this.scene) this.scene.hud(`Round ${this.cur.r} · ${this.cur.bpm} bpm`, this.lives, MAX_LIVES);
  }

  _coach(type, info) { this.app.coach?.record?.(type, info, this.tracker || undefined); }

  _clicks(r, now) {
    const { sound } = this.app;
    while (r.clickNext < r.len && r.t0 + r.clickNext * r.spb < now + 0.25) {
      const b = r.clickNext++;
      const when = r.t0 + b * r.spb;
      if (when > now - 0.03) sound.click(when, ((b % 4) + 4) % 4 === 0);
    }
  }

  tick() {
    if (this.demoRun) { this._demoTick(); return; }
    if (!this.playing || !this.cur) return;
    const { sound } = this.app;
    const now = sound.now(), lat = sound.latency, c = this.cur;
    const beat = (now - lat - c.t0) / c.spb;
    this._clicks(c, now);
    if (this.next) this._clicks(this.next, now);
    for (const n of c.notes) {
      if (c.judged.has(n)) continue;
      if (c.t0 + n.t * c.spb + lat + c.win < now) { this._miss(c, n); if (!this.playing) return; } else break;
    }
    if (!this.next && beat >= c.len - 1) this.next = this._makeRound(c.t0 + c.len * c.spb, c);
    if (beat >= c.len + 0.3 && this.next) {
      this._finishRound(c);
      this.cur = this.next;
      this.next = null;
      this._show(this.cur);
      return;
    }
    this.scene.setBeat(beat);
    this.scene.countIn(beat < 0 && beat >= -4 ? Math.floor(beat) + 5 : 0);
    const nx = c.notes.find((n) => !c.judged.has(n));
    if (nx !== c.marked) {
      if (c.marked && !c.judged.has(c.marked)) this.scene.mark(c.evs.indexOf(c.marked), '');
      if (nx) this.scene.mark(c.evs.indexOf(nx), 'next');
      c.marked = nx;
    }
  }

  noteOn(e) { this._tap(e.time ?? performance.now()); }

  _tap(time) {
    if (!this.playing || !this.cur) return;
    if (time - this.lastTap < 70) return; // key bounce
    this.lastTap = time;
    const { sound, settings } = this.app;
    const tIn = sound.now() - Math.max(0, performance.now() - time) / 1000 - (settings.latency || 0) / 1000;
    const lat = sound.latency, c = this.cur;
    let best = null, bd = Infinity;
    for (const n of c.notes) {
      if (c.judged.has(n)) continue;
      const d = tIn - (c.t0 + n.t * c.spb + lat);
      if (Math.abs(d) <= c.win && Math.abs(d) < Math.abs(bd)) { best = n; bd = d; }
    }
    const beat = (tIn - lat - c.t0) / c.spb;
    if (best) this._hit(c, best, bd);
    else if (beat >= -0.6 && beat <= c.len + 0.2) this._stray(c, beat);
  }

  _hit(c, n, d) {
    c.judged.set(n, d);
    const a = Math.abs(d);
    const grade = a <= WIN.perfect ? 'perfect' : a <= WIN.good ? 'good' : 'ok';
    this.combo++;
    this.score += (grade === 'perfect' ? 10 : grade === 'good' ? 7 : 4) + Math.min(10, Math.floor(this.combo / 4));
    this.scene.mark(c.evs.indexOf(n), grade === 'ok' ? 'ok' : 'hit', d / c.spb);
    this.log.push({ kind: n.kind, d, r: c.r });
    if (grade === 'perfect') this._coach('hit', {});
    else {
      if (d < 0) c.early++; else c.late++;
      this._coach(d < 0 ? 'early' : 'late', { ms: Math.round(d * 1000), skill: KINDS[n.kind].skill, t: n.t });
    }
    this._status(grade === 'perfect' ? 'Perfect' : `${grade === 'good' ? 'A little ' : ''}${d < 0 ? 'early' : 'late'}`.replace(/^e/, 'E').replace(/^l/, 'L'));
  }

  _miss(c, n) {
    c.judged.set(n, null);
    c.missed++;
    this.combo = 0;
    this.log.push({ kind: n.kind, d: null, r: c.r });
    this.scene.mark(c.evs.indexOf(n), 'miss');
    this.scene.stumble();
    this._coach('missed', { skill: KINDS[n.kind].skill, t: n.t });
    this._lose('Missed one');
  }

  _stray(c, beat) {
    c.strays++;
    this.combo = 0;
    const inRest = c.evs.find((e) => e.rest && beat >= e.t - 0.1 && beat < e.t + e.d - 0.15);
    const held = !inRest && c.evs.find((e) => !e.rest && beat > e.t + 0.3 && beat < e.t + e.d - 0.2);
    if (inRest) { c.restTaps++; this._coach('rest', { t: beat, skill: 'rests' }); }
    else {
      const nx = c.notes.find((n) => n.t > beat);
      const pv = [...c.notes].reverse().find((n) => n.t <= beat);
      if (nx && (!pv || nx.t - beat < beat - pv.t)) this._coach('early', { ms: Math.round((beat - nx.t) * c.spb * 1000), skill: KINDS[nx.kind].skill, t: nx.t });
      else if (pv) this._coach('late', { ms: Math.round((beat - pv.t) * c.spb * 1000), skill: KINDS[pv.kind].skill, t: pv.t });
    }
    this.log.push({ kind: inRest ? 'rest' : held ? 'held' : 'extra', stray: true, r: c.r });
    this.scene.splash(beat);
    this._lose(inRest ? 'That was a rest' : held ? 'Hold on, that note is still sounding' : 'Extra tap');
  }

  _lose(msg) {
    this.lives--;
    this._status(msg);
    if (this.lives <= 0) {
      this.playing = false;
      this.app.sound.stopAll();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this._end(), 900);
    }
  }

  _finishRound(c) {
    const errs = c.missed + c.strays;
    if (!errs) { this.score += 20; if (this.lives < MAX_LIVES) { this.lives++; c.bonus = true; } }
    this.rounds.push({ r: c.r, pat: c.pat, bpm: c.bpm, marks: new Map(this.scene.marks), errs: errs + (c.early + c.late) * 0.25 });
    this.app.ui.prompt(roundLine(c));
    this._status();
  }

  _end(prefix = '') {
    if (this.cur && !this.rounds.some((r) => r.r === this.cur.r) && this.cur.judged.size) {
      const c = this.cur;
      this.rounds.push({ r: c.r, pat: c.pat, bpm: c.bpm, marks: new Map(this.scene.marks), errs: c.missed + c.strays + (c.early + c.late) * 0.25 });
    }
    this.playing = false;
    clearTimeout(this.timer);
    this.app.sound.stopAll();
    const taps = this.log.filter((x) => !x.stray);
    const good = taps.filter((x) => x.d !== null).length;
    const acc = this.log.length ? good / this.log.length : 0;
    if (this.tracker) { this.app.coach?.end?.(this.tracker, { score: acc, skills: [this.lv.skill] }); this.tracker = null; }
    const cleared = this.rounds.filter((r) => r.errs < 1).length;
    const head = `${prefix ? `${prefix} ` : ''}${this.score} points: ${good} of ${taps.length} stones in time, ${cleared} clean ${cleared === 1 ? 'round' : 'rounds'}.`;
    this.over(this.score, `${head} ${rhythmTakeaway(this.log, this.game.levels, this.level, this.speed)}`.trim());
  }

  over(score, detail) {
    super.over(score, detail);
    const worst = [...(this.rounds || [])].sort((a, b) => b.errs - a.errs)[0];
    if (!worst || worst.errs <= 0 || !this.scene) return;
    const show = () => {
      this.scene.set(worst.pat.evs, worst.pat.len);
      for (const [i, m] of worst.marks) this.scene.mark(i, m.cls === 'next' ? '' : m.cls, m.off);
      this.scene.hud(`Round ${worst.r}, your trickiest · ${worst.bpm} bpm`);
      this.scene.setBeat(-1);
    };
    show();
    const btn = h('button', {
      class: 'btn', onclick: () => this._demo(worst.pat, Math.max(50, Math.round(worst.bpm * 0.9)), worst.marks, `Listen: round ${worst.r}`),
    }, 'Hear the tricky round');
    const foot = footOf(this.app), note = foot.querySelector('.note');
    if (note) note.before(btn); else foot.append(btn);
  }

  // ---------- listen-first demo ----------
  _demo(pat, bpm, marks, label = 'Listen') {
    if (!pat) return;
    this._stopDemo();
    const { sound } = this.app;
    sound.unlock();
    const sc = this._scene();
    sc.set(pat.evs, pat.len);
    if (marks) for (const [i, m] of marks) if (m.cls !== 'next') sc.mark(i, m.cls, m.off);
    const spb = 60 / bpm, t0 = sound.now() + 0.25 + 4 * spb;
    for (let b = -4; b < pat.len; b++) sound.click(t0 + b * spb, ((b % 4) + 4) % 4 === 0);
    for (const e of pat.evs) if (!e.rest && !e.tiedFrom) sound.play(72, 0.62, t0 + e.t * spb, Math.max(0.1, (e.sd ?? e.d) * spb * 0.9));
    this.demoRun = { t0, spb, len: pat.len };
    sc.hud(`${label} · ${bpm} bpm`);
  }

  _demoTick() {
    const d = this.demoRun, { sound } = this.app;
    const beat = (sound.now() - sound.latency - d.t0) / d.spb;
    this.scene?.setBeat(beat);
    this.scene?.countIn(beat < 0 && beat >= -4 ? Math.floor(beat) + 5 : 0);
    if (beat > d.len + 0.6) { this.demoRun = null; this.scene?.countIn(0); }
  }

  _stopDemo() {
    if (!this.demoRun) return;
    this.demoRun = null;
    this.app.sound.stopAll();
    this.scene?.countIn(0);
  }
}

// ======================================================================
// Chord Stars: chord game
// ======================================================================
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LET = 'CDEFGAB';
const IV = { M3: [4, 2], m3: [3, 2], P5: [7, 4], m7: [10, 6], R: [0, 0] };
const QUAL = {
  maj: { ivs: ['R', 'M3', 'P5'], suffix: '', long: 'major' },
  min: { ivs: ['R', 'm3', 'P5'], suffix: 'm', long: 'minor' },
  dom7: { ivs: ['R', 'M3', 'P5', 'm7'], suffix: '7', long: 'dominant 7th' },
  pow: { ivs: ['R', 'P5'], suffix: '5', long: 'power chord' },
};
const ROLE = { R: 'root', M3: 'third', m3: 'third', P5: 'fifth', m7: 'seventh' };

function parseRoot(name) {
  const letter = LET.indexOf(name[0]);
  const alter = name.includes('♭') || name.includes('b') ? -1 : name.includes('♯') || name.includes('#') ? 1 : 0;
  return { letter, alter, pc: pc(LETTER_PC[letter] + alter) };
}
const accName = (letter, alter) => LET[letter] + (alter > 0 ? '♯'.repeat(alter) : alter < 0 ? '♭'.repeat(-alter) : '');

/** Build a chord: { sym, name, tones: [{name, role, pc}], voicing: [midi], bass, prefer, rootPos }. */
export function makeChord(rootName, q, inversion = 0, opts = {}) {
  const r = parseRoot(rootName), Q = QUAL[q];
  const tones = Q.ivs.map((iv) => {
    const [semi, off] = IV[iv];
    const letter = (r.letter + off) % 7;
    const p = pc(r.pc + semi);
    let alter = p - LETTER_PC[letter];
    if (alter > 6) alter -= 12; if (alter < -6) alter += 12;
    return { name: accName(letter, alter), role: ROLE[iv], pc: p };
  });
  const base = opts.octave ?? 4;
  let root = (base + 1) * 12 + r.pc;
  if (opts.maxRoot && root > opts.maxRoot) root -= 12;
  let voicing = Q.ivs.map((iv) => root + IV[iv][0]);
  for (let k = 0; k < inversion; k++) voicing = [...voicing.slice(1), voicing[0] + 12];
  if (inversion && voicing[voicing.length - 1] > 79) voicing = voicing.map((m) => m - 12);
  const rootSym = accName(r.letter, r.alter);
  const bassTone = tones[inversion];
  const sym = rootSym + Q.suffix + (inversion ? `/${bassTone.name}` : '');
  const prefer = tones.some((t) => t.name.includes('♭')) ? 'flat' : 'sharp';
  return {
    sym, rootName: rootSym, q, name: `${rootSym} ${Q.long}`, tones, voicing, inversion,
    bass: inversion || opts.rootPos ? bassTone.pc : null, rootPc: r.pc, prefer, rootPos: !!opts.rootPos,
  };
}

export const CHORD_LEVELS = [
  {
    name: 'C position', fall: 10, staves: 'treble', skill: 'chords',
    tip: 'Three chords from one hand position: C, F and G. Keep your thumb near middle C.',
    pool: () => [
      { ...makeChord('C', 'maj'), voicing: [60, 64, 67] },
      { ...makeChord('F', 'maj'), voicing: [60, 65, 69] },
      { ...makeChord('G', 'maj'), voicing: [59, 62, 67] },
    ],
  },
  {
    name: 'Major triads', skill: 'chords', fall: 9, staves: 'treble',
    tip: 'Major triads in root position: the chord’s name note at the bottom, then skip a key, skip a key.',
    pool: () => ['C', 'D', 'E', 'F', 'G', 'A', 'B♭'].map((r) => makeChord(r, 'maj', 0, { rootPos: true })),
  },
  {
    name: 'Minor triads', skill: 'chords', fall: 9, staves: 'treble',
    tip: 'Minor triads: like major, but the middle note drops a half step. Any inversion or octave counts.',
    pool: () => ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((r) => makeChord(r, 'min')),
  },
  {
    name: 'Inversions', skill: 'chords', fall: 10, staves: 'treble',
    tip: 'C/E means a C chord with E at the bottom. Play the note after the slash as your lowest note.',
    pool: () => [['C', 'maj'], ['F', 'maj'], ['G', 'maj'], ['A', 'min'], ['D', 'min'], ['E', 'min']]
      .flatMap(([r, q]) => [0, 1, 2].map((inv) => makeChord(r, q, inv, { rootPos: inv === 0 }))),
  },
  {
    name: 'Dominant 7ths', skill: 'chords', fall: 11, staves: 'treble',
    tip: 'A dominant 7th is a major triad plus the note a whole step below the root. All four notes, any order.',
    pool: () => ['C', 'D', 'E', 'F', 'G', 'A', 'B♭'].map((r) => makeChord(r, 'dom7', 0, { maxRoot: 67 })),
  },
  {
    name: 'Power chords', skill: 'power-chords', fall: 7, staves: 'bass',
    tip: 'Power chords are just root and fifth, the root at the bottom. The sound of rock guitar, on piano.',
    pool: () => ['C', 'D', 'E', 'F', 'G', 'A', 'B♭'].map((r) => makeChord(r, 'pow', 0, { octave: 3, rootPos: true })),
  },
];

const SF_TOTAL = 16, SF_LIVES = 3;

/** The night-sky scene: a falling star with a chord symbol, a horizon and a constellation of catches. */
class SkyScene {
  constructor() {
    this.el = h('div', { class: 'gx-scene sf-scene' });
    this.cap = h('div', { class: 'sf-caption', 'aria-live': 'polite' });
    this.svg = s('svg', { class: 'sf-svg', role: 'img', 'aria-label': 'Night sky with a falling chord star' }, this.el);
    this.wrap = h('div', { class: 'sf-wrap' }, this.cap, this.el);
    this.caught = []; this.star = null; this.p = 0; this.lives = [0, 0]; this.dots = [];
    this.still = reduced();
    for (let i = 0; i < 26; i++) this.dots.push([Math.random(), Math.random() * 0.75, Math.random() < 0.2 ? 1.6 : 1]);
    this.ro = new ResizeObserver(() => this.onResize?.());
    this.ro.observe(this.wrap);
  }

  destroy() { this.ro.disconnect(); }

  place(left) { this.el.style.left = `${Math.round(left)}px`; this.left = left; this.layout(); }
  /** Width of board to the right of the sky (covered so staff lines stop at the sky). */
  get rightGap() { return Math.max(0, (this.wrap.clientWidth || 0) - (this.el.offsetLeft + this.el.clientWidth)); }

  layout() {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (W < 40 || H < 40) return;
    this.W = W; this.H = H;
    const svg = this.svg;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';
    s('rect', { class: 'sf-mask', x: W - 4, y: -4, width: this.rightGap + 4, height: H + 8 }, svg);
    s('rect', { class: 'sf-sky', x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 10 }, svg);
    const gBg = s('g', { class: 'sf-dots' }, svg);
    for (const [x, y, r] of this.dots) s('circle', { cx: 8 + x * (W - 16), cy: 26 + y * (H - 70), r }, gBg);
    this.ground = H - 20;
    const g = this.ground;
    s('path', { class: 'sf-hills', d: `M1,${g} C${W * 0.18},${g - 12} ${W * 0.3},${g - 4} ${W * 0.46},${g - 6} S${W * 0.78},${g - 15} ${W - 1},${g - 3} V${H - 1} H1 Z` }, svg);
    this.gHud = s('g', {}, svg);
    this.gCon = s('g', { class: 'sf-con' }, svg);
    this.gFx = s('g', {}, svg);
    this.gStar = s('g', { class: 'sf-star' }, svg);
    this._drawCon();
    this._hud();
    if (this.star) this._drawStar();
  }

  hud(lives, max, text = '') { this.lives = [lives, max]; this.hudText = text; this._hud(); }

  _hud() {
    const g = this.gHud;
    if (!g) return;
    g.textContent = '';
    if (this.hudText) txt(g, this.hudText, 12, 20, 'sf-hud', 13);
    const [n, max] = this.lives;
    for (let i = 0; i < max; i++) this._starPath(g, this.W - 14 - i * 17, 15, 6, `sf-life${i < n ? ' on' : ''}`);
  }

  _starPath(parent, cx, cy, r, cls) {
    let d = '';
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
      d += `${k ? 'L' : 'M'}${num(cx + rr * Math.cos(a))},${num(cy + rr * Math.sin(a))}`;
    }
    return s('path', { class: cls, d: `${d}Z` }, parent);
  }

  _slot(i) {
    const n = SF_TOTAL, W = this.W;
    return [14 + (i + 0.5) * ((W - 28) / n), 40 + (i % 2 ? 9 : 0) + ((i * 7) % 3) * 3];
  }

  _drawCon() {
    const g = this.gCon;
    g.textContent = '';
    this.caught.forEach((c, i) => {
      const [x, y] = this._slot(c.slot);
      if (i) { const [px, py] = this._slot(this.caught[i - 1].slot); s('line', { class: 'sf-link', x1: px, y1: py, x2: x, y2: y }, g); }
    });
    for (const c of this.caught) { const [x, y] = this._slot(c.slot); this._starPath(g, x, y, 4.5, `sf-cstar ${c.cls}`); }
  }

  /** Start a new falling star for a chord symbol. */
  drop(sym) {
    this.star = { sym, x: 0.3 + Math.random() * 0.25, cls: '' };
    this.p = 0;
    this._drawStar();
  }

  _drawStar() {
    const g = this.gStar, st = this.star;
    if (!g || !st) return;
    g.textContent = '';
    g.setAttribute('class', `sf-star ${st.cls}`.trim());
    const r = clamp(Math.min(this.W, this.H) * 0.07, 9, 16);
    this.r = r;
    s('line', { class: 'sf-trail', x1: 0, y1: -r * 1.4, x2: -r * 0.6, y2: -r * 4.2 }, g);
    this._starPath(g, 0, 0, r, 'sf-head');
    const fs = clamp(this.H * 0.13, 18, 36);
    const t = txt(g, st.sym, r + 7, fs * 0.36, 'sf-sym', fs);
    t.setAttribute('text-anchor', 'start');
    this.setP(this.p);
  }

  setP(p) {
    this.p = p;
    if (!this.star || !this.gStar) return;
    const top = 70, bot = this.ground - (this.r || 12);
    const y = top + (bot - top) * clamp(p, 0, 1);
    this.gStar.setAttribute('transform', `translate(${num(this.star.x * this.W)},${num(y)})`);
  }

  state(cls) { if (this.star) { this.star.cls = cls; this.gStar?.setAttribute('class', `sf-star ${cls}`.trim()); } }

  catchStar(fast) {
    const slot = this.caught.length;
    this.caught.push({ slot, cls: fast ? 'fast' : '' });
    this.star = null;
    if (this.gStar && !this.still) {
      const [x, y] = this._slot(slot);
      const ghost = this._starPath(this.gFx, x, y, 9, 'sf-burst');
      setTimeout(() => ghost.remove(), 600);
    }
    if (this.gStar) this.gStar.textContent = '';
    this._drawCon();
  }

  land() {
    this.state('landed');
    if (!this.gFx) return;
    const x = this.star.x * this.W;
    const ring = s('ellipse', { class: 'sf-thud', cx: x, cy: this.ground - 2, rx: 22, ry: 5 }, this.gFx);
    setTimeout(() => ring.remove(), 900);
  }

  clearStar() { this.star = null; if (this.gStar) this.gStar.textContent = ''; }

  caption(main, sub = '') {
    this.cap.textContent = '';
    if (main) this.cap.append(h('div', { class: 'sf-cap-main' }, main));
    if (sub) this.cap.append(h('div', { class: 'sf-cap-sub' }, sub));
  }
}

const toneList = (c) => c.tones.map((t) => t.name).join(' ');
const pcName = (p, prefer) => noteName(60 + p, { prefer });

function chordTakeaway(st, lvIdx, levels) {
  const conf = st.conf;
  const count = (fn) => conf.filter(fn).length;
  const minorAsMajor = count((x) => x.chord.q === 'min' && x.played === pc(x.chord.rootPc + 4));
  const majorAsMinor = count((x) => (x.chord.q === 'maj' || x.chord.q === 'dom7') && x.played === pc(x.chord.rootPc + 3));
  const wrong7 = count((x) => x.chord.q === 'dom7' && x.played === pc(x.chord.rootPc + 11));
  const powThird = count((x) => x.chord.q === 'pow' && [3, 4].includes(pc(x.played - x.chord.rootPc)));
  const ex = (fn) => conf.find(fn)?.chord;
  if (minorAsMajor >= 2) { const c = ex((x) => x.chord.q === 'min'); return `In minor chords the middle note is a half step lower than in major: ${c.name} is ${toneList(c)}. Practice the minor shapes slowly.`; }
  if (majorAsMinor >= 2) { const c = ex((x) => x.chord.q !== 'min'); return `The third of a major chord is four half steps above the root: ${c.sym} needs ${c.tones[1].name}. Count the half steps up from the root.`; }
  if (wrong7 >= 2) { const c = ex((x) => x.chord.q === 'dom7'); return `The 7th in ${c.sym} is ${c.tones[3].name}, a whole step below the root, not a half step. Find the root, then step down two keys.`; }
  if (powThird >= 2) return 'Power chords leave out the third: only the root and the fifth, root at the bottom.';
  if (st.rootPos >= 2) return lvIdx === 3
    ? 'The note after the slash goes at the bottom: C/E means E is your lowest note. Practice moving one chord through its three positions.'
    : 'This level wants root position: the chord’s name note as your lowest note.';
  const worst = Object.entries(st.per).map(([sym, v]) => ({ sym, bad: v.miss * 2 + v.wrong, c: v.chord })).filter((x) => x.bad > 0).sort((a, b) => b.bad - a.bad);
  if (worst.length) {
    const two = worst.slice(0, 2);
    return `${two.map((x) => x.sym).join(' and ')} gave you the most trouble. Practice ${two.length > 1 ? 'those shapes' : 'that shape'} slowly: ${two.map((x) => `${x.sym} is ${toneList(x.c)}`).join(', ')}.`;
  }
  const avg = st.heights.length ? st.heights.reduce((a, b) => a + b, 0) / st.heights.length : 0;
  if (avg > 0.6) return 'Every chord was right, but found late. Picture the shape before you press: root, skip a key, skip a key.';
  return lvIdx < levels.length - 1 ? `Clean catches. Try “${levels[lvIdx + 1].name}” next.` : 'Clean catches all the way. Try a faster finish next time.';
}

export class ChordGame extends GameBase {
  get lv() { return CHORD_LEVELS[this.level] ? { ...this.game.levels[this.level], ...CHORD_LEVELS[this.level] } : this.game.levels[this.level]; }

  enter() {
    this.scene = new SkyScene();
    this.scene.onResize = () => this._place();
    this.app.ui.layer(this.scene.wrap, { hideStaff: false });
    this.down = new Map();
    super.enter();
  }

  exit() {
    super.exit();
    clearTimeout(this.wait);
    clearTimeout(this.colT);
    for (let k = 0; k < 4; k++) clearTimeout(this['hk' + k]);
    if (this.tracker) { this.app.coach?.end?.(this.tracker); this.tracker = null; }
    this.app.keyboard.clear('cue-r');
    this.scene?.destroy();
    this.scene = null;
  }

  /** Lay out the staff column on the left and the sky on the right. */
  _place() {
    const { staff } = this.app;
    if (!this.scene || !staff.sp) return;
    const sp = staff.sp, W = this.scene.wrap.clientWidth;
    const colX = staff.panelW + 3.4 * sp;
    const left = Math.min(W * (W < 600 ? 0.62 : 0.55), colX + 7.2 * sp);
    this.colX = colX;
    this.scene.cap.style.left = `${Math.round(Math.max(4, colX - 2.2 * sp))}px`;
    this.scene.cap.style.width = `${Math.round(left - colX + 2.2 * sp - 8)}px`;
    this.scene.place(left);
    if (staff.column) { staff.column.opts.x = colX; staff._drawColumn(); }
  }

  _column(groups) {
    const lv = this.lv, { staff } = this.app;
    staff.showColumn(groups, { staves: lv.staves });
    if (this.colX === undefined || staff.column.opts.x !== this.colX) this._place();
  }

  preview() {
    const lv = this.lv;
    const c = pick(lv.pool());
    this.app.keyboard.need(lv.staves === 'bass' ? 43 : 55, lv.staves === 'bass' ? 67 : 79);
    this.scene.clearStar();
    this.scene.drop(c.sym);
    this.scene.setP(0.3);
    this.scene.hud(0, 0, lv.name);
    this.scene.caption(c.sym, `${c.name}: ${toneList(c)}`);
    this._column([{ midis: c.voicing, cls: 'target', prefer: c.prefer }]);
    this.app.ui.prompt(lv.tip);
  }

  intro() {
    super.intro();
    gxSeg(footOf(this.app));
  }

  start() {
    const lv = this.lv;
    this.app.sound.unlock();
    this.playing = true;
    this.score = 0; this.lives = SF_LIVES; this.n = 0; this.combo = 0; this.speed = 1;
    this.st = { per: {}, conf: [], rootPos: 0, heights: [], caught: 0, missed: 0 };
    this.scene.caught = [];
    this.scene.layout();
    if (this.tracker) this.app.coach?.end?.(this.tracker);
    this.tracker = this.app.coach?.begin?.({ topic: 'chords', skills: [lv.q === 'pow' ? 'power-chords' : 'chords'] }) || null;
    this.app.ui.prompt('Play every note of the chord together before the star touches the hills.');
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this._end('Stopped.') }, 'Stop'));
    this.last = null;
    this._next();
  }

  _coach(type, info) { this.app.coach?.record?.(type, info, this.tracker || undefined); }

  _next() {
    if (!this.playing) return;
    if (this.n >= SF_TOTAL) { this._end(); return; }
    const lv = this.lv, { keyboard } = this.app;
    const pool = lv.pool();
    let c; do { c = pick(pool); } while (pool.length > 1 && this.last && c.sym === this.last.sym);
    this.last = c; this.chord = c; this.n++;
    this.state = 'fall'; this.hinted = false; this.wrongs = 0; this.since = performance.now(); this.rootWarned = false;
    this.fall = lv.fall * this.speed;
    this.st.per[c.sym] ||= { chord: c, seen: 0, miss: 0, wrong: 0 };
    this.st.per[c.sym].seen++;
    keyboard.clear('cue-r');
    this.scene.drop(c.sym);
    this.scene.caption(c.sym, c.name);
    this._column([{ midis: c.voicing, cls: 'target', prefer: c.prefer }]);
    this._hud();
  }

  _hud(msg = '') {
    this.app.ui.status(`${this.score} points · chord ${Math.min(this.n, SF_TOTAL)} of ${SF_TOTAL}${msg ? ` · ${msg}` : ''}`);
    this.scene.hud(this.lives, SF_LIVES, this.combo > 2 ? `${this.combo} in a row` : '');
  }

  tick(dt) {
    if (!this.playing || this.state !== 'fall') return;
    this.scene.setP(this.scene.p + dt / this.fall);
    if (this.scene.p >= 1) this._land();
  }

  _cand() { return [...this.down].filter(([, t]) => t >= this.since).map(([m]) => m).sort((a, b) => a - b); }

  noteOff(e) {
    this.down?.delete(e.midi);
    // releasing a stray key can leave exactly the chord held
    if (!this.playing || this.state !== 'fall' || !this.chord) return;
    const cand = this._cand();
    if (!cand.length) return;
    const req = new Set(this.chord.tones.map((t) => t.pc)), pcs = new Set(cand.map(pc));
    if ([...req].every((p) => pcs.has(p)) && [...pcs].every((p) => req.has(p)) && (this.chord.bass === null || pc(cand[0]) === this.chord.bass)) this._catch(cand);
  }

  noteOn(e) {
    this.down.set(e.midi, performance.now());
    if (!this.playing || !this.chord) return;
    const c = this.chord, kb = this.app.keyboard;
    const req = new Set(c.tones.map((t) => t.pc));
    if (this.state === 'show') {
      const cand = this._cand();
      if (!req.has(pc(e.midi))) { kb.flash(e.midi, 'miss', 450); return; }
      const pcs = new Set(cand.map(pc));
      if ([...req].every((p) => pcs.has(p)) && [...pcs].every((p) => req.has(p))) {
        cand.forEach((m) => kb.flash(m, 'hit', 500));
        clearTimeout(this.wait);
        this.app.ui.prompt(`That’s ${c.sym}. Next one.`);
        this.state = 'gap';
        this.wait = setTimeout(() => this._next(), 700);
      }
      return;
    }
    if (this.state !== 'fall') return;
    const cand = this._cand();
    if (!req.has(pc(e.midi))) return this._wrong(e.midi, cand);
    const pcs = new Set(cand.map(pc));
    if (![...req].every((p) => pcs.has(p)) || ![...pcs].every((p) => req.has(p))) return;
    if (c.bass !== null && pc(cand[0]) !== c.bass) {
      if (!this.rootWarned) {
        this.rootWarned = true;
        this.st.rootPos++;
        this._coach('chord', { expected: c.voicing, played: cand, skill: 'chords' });
      }
      const bassName = c.tones.find((t) => t.pc === c.bass).name;
      this.app.ui.prompt(c.inversion ? `Right notes, but ${c.sym} needs ${bassName} at the bottom.` : `Right notes. This level wants root position: put ${bassName} at the bottom.`);
      return;
    }
    this._catch(cand);
  }

  _wrong(midi, cand) {
    const c = this.chord, kb = this.app.keyboard;
    this.wrongs++;
    this.combo = 0;
    this.st.per[c.sym].wrong++;
    const missing = c.tones.filter((t) => !cand.some((m) => pc(m) === t.pc));
    const near = (missing.length ? missing : c.tones).reduce((a, t) => {
      const d = (x) => Math.min(pc(x - midi), pc(midi - x));
      return !a || d(t.pc) < d(a.pc) ? t : a;
    }, null);
    this.st.conf.push({ chord: c, played: pc(midi), expected: near.pc });
    this._coach('chord', { expected: c.voicing, played: cand, skill: c.q === 'pow' ? 'power-chords' : 'chords' });
    kb.flash(midi, 'miss', 500);
    const wrongName = pcName(pc(midi), c.prefer);
    this._column([
      { midis: c.voicing, cls: 'target', prefer: c.prefer },
      { midis: [midi], cls: 'wrong', prefer: c.prefer, dx: 4.2 },
    ]);
    clearTimeout(this.colT);
    this.colT = setTimeout(() => this.state === 'fall' && this.chord === c && this._column([{ midis: c.voicing, cls: 'target', prefer: c.prefer }]), 1200);
    let why = `${wrongName} isn’t in ${c.sym}. It’s ${toneList(c)}.`;
    if (pc(midi) === near.pc + 0 || Math.min(pc(midi - near.pc), pc(near.pc - midi)) === 1) {
      why = `${wrongName} is a half step off: ${c.sym} uses ${near.name} (its ${near.role}). The notes are ${toneList(c)}.`;
    }
    this.app.ui.prompt(why);
    this.scene.setP(Math.min(0.97, this.scene.p + 0.06));
    if (!this.hinted) {
      this.hinted = true;
      c.voicing.forEach((m) => kb.mark(m, 'cue-r', true));
      this.scene.caption(c.sym, `${c.name}: ${toneList(c)}`);
    }
    this._hud('Wrong note');
  }

  _catch(cand) {
    const c = this.chord, kb = this.app.keyboard;
    const left = 1 - this.scene.p;
    const pts = Math.round((10 + left * 15) * (this.hinted ? 0.5 : 1)) + Math.min(10, this.combo * 2);
    this.score += pts;
    this.combo++;
    this.st.caught++;
    this.st.heights.push(this.scene.p);
    this.speed = Math.max(0.55, this.speed * 0.96);
    cand.forEach((m) => kb.flash(m, 'hit', 500));
    kb.clear('cue-r');
    this._column([{ midis: cand, cls: 'hit', prefer: c.prefer }]);
    this.scene.caption(c.sym, `${c.name}: ${toneList(c)}`);
    this.scene.catchStar(left > 0.5 && !this.hinted);
    this._coach('hit', {});
    this.app.ui.prompt(this.wrongs ? `Caught: ${c.sym} is ${toneList(c)}.` : pick(['Caught.', 'Got it.', 'Nice chord.', 'Clean.']));
    this.state = 'gap';
    this._hud(`+${pts}`);
    this.wait = setTimeout(() => this._next(), 650);
  }

  _land() {
    const c = this.chord, kb = this.app.keyboard;
    this.state = 'show';
    this.lives--;
    this.combo = 0;
    this.st.missed++;
    this.st.per[c.sym].miss++;
    this.scene.land();
    this._coach('chord', { expected: c.voicing, played: this._cand(), skill: c.q === 'pow' ? 'power-chords' : 'chords' });
    c.voicing.forEach((m) => kb.mark(m, 'cue-r', true));
    this._column([{ midis: c.voicing, cls: 'target', prefer: c.prefer }]);
    this.scene.caption(c.sym, `${c.name}: ${toneList(c)}`);
    const parts = c.tones.map((t) => `${t.name} (${t.role})`).join(', ');
    this._hud('Landed');
    const now = this.app.sound.now();
    c.voicing.forEach((m) => this.app.sound.play(m, 0.55, now + 0.05, 1.1));
    if (this.lives <= 0) {
      this.app.ui.prompt(`${c.sym} is ${parts}.`);
      this.playing = false;
      this.wait = setTimeout(() => this._end(), 1700);
      return;
    }
    this.since = performance.now();
    this.app.ui.prompt(`${c.sym} is ${parts}. The keys are lit: play it to go on.`);
    clearTimeout(this.wait);
    this.wait = setTimeout(() => { if (this.state === 'show') { this.state = 'gap'; this._next(); } }, 6500);
  }

  _end(prefix = '') {
    this.playing = false;
    this.state = 'over';
    clearTimeout(this.wait);
    clearTimeout(this.colT);
    this.app.keyboard.clear('cue-r');
    const st = this.st;
    const seen = st.caught + st.missed;
    if (this.tracker) {
      this.app.coach?.end?.(this.tracker, { score: seen ? st.caught / seen : 0, skills: [this.lv.skill || 'chords'] });
      this.tracker = null;
    }
    this.scene.clearStar();
    const head = `${prefix ? `${prefix} ` : ''}${this.score} points: ${st.caught} of ${seen} chords caught.`;
    this.over(this.score, `${head} ${chordTakeaway(st, this.level, CHORD_LEVELS)}`);
    // show the chord that caused the most trouble, with a button to hear it
    const worst = Object.values(st.per).map((v) => ({ ...v, bad: v.miss * 2 + v.wrong })).filter((v) => v.bad > 0).sort((a, b) => b.bad - a.bad)[0];
    const c = worst?.chord || this.chord;
    if (!c) return;
    this._column([{ midis: c.voicing, cls: 'target', prefer: c.prefer }]);
    this.scene.caption(c.sym, `${c.name}: ${toneList(c)}`);
    if (!worst) return;
    const btn = h('button', { class: 'btn', onclick: () => this._hear(c) }, `Hear ${c.sym}`);
    const foot = footOf(this.app), note = foot.querySelector('.note');
    if (note) note.before(btn); else foot.append(btn);
  }

  /** Play a chord note by note, then together, lighting the keys. */
  _hear(c) {
    const { sound, keyboard } = this.app;
    sound.unlock();
    const t0 = sound.now() + 0.08, gap = 0.32;
    c.voicing.forEach((m, k) => {
      sound.play(m, 0.62, t0 + k * gap, 0.5);
      sound.play(m, 0.55, t0 + c.voicing.length * gap + 0.1, 1.2);
      clearTimeout(this['hk' + k]);
      this['hk' + k] = setTimeout(() => keyboard.flash(m, 'demo', 1600 + (c.voicing.length - k) * gap * 1000), (0.08 + k * gap) * 1000);
    });
  }
}

// ======================================================================
// Quiz questions
// ======================================================================
const ORDER = 'CDEFGAB';
const byLetter = (a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]) || a.length - b.length;
const CLEF = {
  treble: { bottom: 30, lines: 'E G B D F', spaces: 'F A C E', name: 'treble' },
  bass: { bottom: 18, lines: 'G B D F A', spaces: 'A C E G', name: 'bass' },
};
const ORD = ['first', 'second', 'third', 'fourth', 'fifth'];

/** Where a note sits on a staff, in words, plus a tag for the takeaway. */
function staffPos(midi, clef) {
  const st = spell(midi, 'C').step;
  const i = st - CLEF[clef].bottom;
  if (i >= 0 && i <= 8) return i % 2 === 0 ? { text: `the ${ORD[i / 2]} line`, tag: 'line' } : { text: `the ${ORD[(i - 1) / 2]} space`, tag: 'space' };
  if (i === -1) return { text: 'the space just below the staff', tag: 'ledger' };
  if (i === 9) return { text: 'the space just above the staff', tag: 'ledger' };
  if (i < 0) return { text: i % 2 === 0 ? `ledger line ${-i / 2} below the staff` : `just below ledger line ${(-i - 1) / 2}`, tag: 'ledger' };
  return { text: i % 2 === 0 ? `ledger line ${(i - 8) / 2} above the staff` : `just above ledger line ${(i - 9) / 2}`, tag: 'ledger' };
}

/** Make a choices array with the answer at a random index. */
function choose(right, wrongs, n = 4, sort = null) {
  const pool = [...new Set(wrongs.filter((w) => w !== right))];
  const list = [right, ...shuffle(pool).slice(0, n - 1)];
  const out = sort ? list.sort(sort) : shuffle(list);
  return { choices: out, answer: out.indexOf(right) };
}

function noteReading(clef, pool) {
  const m = pick(pool);
  const name = noteName(m);
  const step = spell(m, 'C').step;
  const nb = [-2, -1, 1, 2, 7].map((d) => ORDER[(((step + d) % 7) + 7) % 7]);
  const pos = staffPos(m, clef);
  const C = CLEF[clef];
  let explain = `${name} is on ${pos.text}. ${C.name[0].toUpperCase() + C.name.slice(1)} lines from the bottom: ${C.lines}. Spaces: ${C.spaces}.`;
  if (m === 60) explain = clef === 'treble' ? 'Middle C sits on its own ledger line just below the treble staff.' : 'Middle C sits on its own ledger line just above the bass staff.';
  else if (pos.tag === 'ledger') explain = `${name} is on ${pos.text}. Count on from the nearest staff line: line, space, line, as if the staff kept going.`;
  return {
    q: 'What is this note?', ...choose(name, nb, 4, byLetter),
    staff: { notes: [m], staves: clef }, keyAnswer: { pc: pc(m), midi: m },
    explain, tag: pos.tag, review: `${noteName(m, { octave: true })} on ${pos.text}`, key: `n${m}`,
  };
}

const VALUES = [
  { v: 'B4w', name: 'whole note', beats: '4', tag: 'whole', why: 'A whole note is an open notehead with no stem: 4 beats.' },
  { v: 'B4h', name: 'half note', beats: '2', tag: 'half', why: 'A half note is open with a stem: 2 beats.' },
  { v: 'B4q', name: 'quarter note', beats: '1', tag: 'quarter', why: 'A quarter note is filled in with a stem: 1 beat.' },
  { v: 'B4e', name: 'eighth note', beats: '½', tag: 'eighth', why: 'An eighth note has a flag: half a beat. Two eighths fill one beat, counted “1 +”.' },
  { v: 'B4h.', name: 'dotted half note', beats: '3', tag: 'dotted', why: 'A dot adds half the note’s value: 2 + 1 = 3 beats.' },
  { v: 'B4q.', name: 'dotted quarter note', beats: '1½', tag: 'dotted', why: 'A dot adds half the note’s value: 1 + ½ = 1½ beats.' },
];
const BEATS = ['4', '3', '2', '1½', '1', '½'];
const cap = (t) => t[0].toUpperCase() + t.slice(1);

function noteValueItem() {
  const r = Math.random();
  if (r < 0.4) {
    const x = pick(VALUES);
    return { q: 'How many beats does this note last in 4/4 time?', ...choose(x.beats, BEATS), rhythm: x.v, explain: x.why, tag: x.tag, review: `${cap(x.name)}: ${x.beats} ${x.beats === '1' ? 'beat' : 'beats'}`, key: `b${x.v}` };
  }
  if (r < 0.7) {
    const x = pick(VALUES);
    return { q: 'What is this note called?', ...choose(cap(x.name), VALUES.map((y) => cap(y.name))), rhythm: x.v, explain: x.why, tag: x.tag, review: `${cap(x.name)} (${x.beats})`, key: `nm${x.v}` };
  }
  const bars = [
    ['B4h B4q', 'Quarter note', '2 + 1 = 3 beats so far. 4/4 needs 4, so one more beat: a quarter note.', 'quarter', 'Half + quarter = 3, add a quarter'],
    ['B4q B4q', 'Half note', '1 + 1 = 2 beats so far. Two more beats make 4: a half note.', 'half', 'Two quarters = 2, add a half'],
    ['B4q B4e B4e B4q', 'Quarter note', '1 + ½ + ½ + 1 = 3 beats so far. One more beat: a quarter note.', 'eighth', 'Quarter, two eighths, quarter = 3, add a quarter'],
    ['B4h.', 'Quarter note', 'A dotted half is 3 beats. One more beat fills the bar: a quarter note.', 'dotted', 'Dotted half = 3, add a quarter'],
    ['B4q. B4e', 'Half note', 'Dotted quarter plus eighth is 1½ + ½ = 2 beats. Two more beats: a half note.', 'dotted', 'Dotted quarter + eighth = 2, add a half'],
    ['B4q B4q B4q B4e', 'Eighth note', '1 + 1 + 1 + ½ = 3½ beats so far. Half a beat left: an eighth note.', 'eighth', 'Three quarters + an eighth = 3½, add an eighth'],
  ];
  const [v, ans, why, tag, rev] = pick(bars);
  return {
    q: 'This bar is in 4/4 but it’s not full. Which one note completes it?',
    ...choose(ans, ['Whole note', 'Half note', 'Quarter note', 'Eighth note']), rhythm: v, rhythmLen: 4,
    explain: why, tag, review: rev, key: `f${v}`,
  };
}

const RESTS = [
  { v: 'rw', name: 'whole rest', beats: '4', why: 'A whole rest hangs down from the line, like a hole: a whole bar of silence, 4 beats in 4/4.' },
  { v: 'rh', name: 'half rest', beats: '2', why: 'A half rest sits on top of the line, like a hat: 2 beats of silence.' },
  { v: 'rq', name: 'quarter rest', beats: '1', why: 'The zigzag is a quarter rest: 1 beat of silence.' },
  { v: 're', name: 'eighth rest', beats: '½', why: 'An eighth rest looks like a 7 with a dot: half a beat of silence.' },
];

function restItem() {
  const r = Math.random();
  if (r < 0.4) {
    const x = pick(RESTS);
    return { q: 'What is this rest called?', ...choose(cap(x.name), RESTS.map((y) => cap(y.name))), rhythm: x.v, explain: x.why, tag: x.v === 'rw' || x.v === 'rh' ? 'whole-half-rest' : 'rest', review: `${cap(x.name)}: ${x.beats} silent`, key: `rn${x.v}` };
  }
  if (r < 0.65) {
    const x = pick(RESTS);
    return { q: 'How many beats of silence is this rest in 4/4?', ...choose(x.beats, ['4', '2', '1', '½']), rhythm: x.v, explain: x.why, tag: x.v === 'rw' || x.v === 'rh' ? 'whole-half-rest' : 'rest', review: `${cap(x.name)}: ${x.beats}`, key: `rb${x.v}` };
  }
  const bars = [['B4q rq B4q B4q', 'Beat 2'], ['B4q B4q rq B4q', 'Beat 3'], ['B4h B4q rq', 'Beat 4'], ['rq B4q B4h', 'Beat 1'], ['B4q B4q B4q rq', 'Beat 4']];
  const [v, ans] = pick(bars);
  return {
    q: 'Count this bar out loud. Which beat is silent?', ...choose(ans, ['Beat 1', 'Beat 2', 'Beat 3', 'Beat 4'], 4, (a, b) => a.localeCompare(b)),
    rhythm: v, explain: 'Count every beat, sounding or silent: the rest still takes its beat. The counts are written under the notes now.',
    tag: 'rest-count', review: `Silent beat: ${ans.toLowerCase()}`, key: `rc${v}`,
  };
}

const DYN = [
  { g: G.dyn.pp, t: 'pp', name: 'pianissimo', mean: 'Very softly' },
  { g: G.dyn.p, t: 'p', name: 'piano', mean: 'Softly' },
  { g: G.dyn.mp, t: 'mp', name: 'mezzo piano', mean: 'Moderately softly' },
  { g: G.dyn.mf, t: 'mf', name: 'mezzo forte', mean: 'Moderately loudly' },
  { g: G.dyn.f, t: 'f', name: 'forte', mean: 'Loudly' },
  { g: G.dyn.ff, t: 'ff', name: 'fortissimo', mean: 'Very loudly' },
];
const DYN_WHY = 'Dynamics are Italian: p (piano) means soft, f (forte) means loud, and m (mezzo) means “moderately”.';

function dynamicsItem(basic = false) {
  const set = basic ? DYN.filter((d) => ['p', 'mf', 'f'].includes(d.t)) : DYN;
  if (basic || Math.random() < 0.6) {
    const x = pick(set);
    return {
      q: 'What does this mark tell you?', ...choose(`Play ${x.mean.toLowerCase()}`, DYN.map((d) => `Play ${d.mean.toLowerCase()}`)),
      figure: { note: true, below: x.g }, explain: `${x.t} is ${x.name}. ${DYN_WHY}`, tag: 'dynamics', review: `${x.t} = ${x.name}, ${x.mean.toLowerCase()}`, key: `d${x.t}`,
    };
  }
  const four = shuffle(DYN).slice(0, 4);
  const loud = Math.random() < 0.5;
  const target = [...four].sort((a, b) => DYN.indexOf(a) - DYN.indexOf(b))[loud ? 3 : 0];
  return {
    q: `Which of these is the ${loud ? 'loudest' : 'softest'}?`, choices: four.map((d) => d.g), choiceLabels: four.map((d) => `${d.t}, ${d.name}`), glyphChoices: true,
    answer: four.indexOf(target), explain: `From soft to loud: pp p mp mf f ff. ${DYN_WHY}`, tag: 'dynamics', review: `${loud ? 'Loudest' : 'Softest'}: ${target.t}`, key: `dl${four.map((d) => d.t).join()}`,
  };
}

const SIGN_CHOICES = ['Raise it a half step', 'Lower it a half step', 'Cancel a sharp or flat', 'Play it louder'];
const SYMBOLS = [
  () => ({ q: 'What is this sign at the start of the staff?', ...choose('Treble clef', ['Bass clef', 'Repeat sign', 'Time signature', 'Sharp']), staff: { notes: [], staves: 'treble' }, explain: 'The treble clef (G clef) curls around the second line and marks it as the G above middle C. Right-hand music usually uses it.', tag: 'clef', review: 'Treble clef: marks G on line 2' }),
  () => ({ q: 'What is this sign at the start of the staff?', ...choose('Bass clef', ['Treble clef', 'Repeat sign', 'Time signature', 'Flat']), staff: { notes: [], staves: 'bass' }, explain: 'The bass clef (F clef) puts its two dots around the fourth line and marks it as the F below middle C. Left-hand music usually uses it.', tag: 'clef', review: 'Bass clef: marks F on line 4' }),
  () => ({ q: 'What does the sign in front of this note do?', ...choose(SIGN_CHOICES[0], SIGN_CHOICES), staff: { notes: [66], staves: 'treble', prefer: 'sharp' }, explain: 'That’s a sharp. It raises a note a half step, to the very next key on the right: this is F♯, the black key just right of F.', tag: 'sharp', review: 'Sharp (♯) raises a half step', keyAnswer: null }),
  () => ({ q: 'What does the sign in front of this note do?', ...choose(SIGN_CHOICES[1], SIGN_CHOICES), staff: { notes: [70], staves: 'treble', prefer: 'flat' }, explain: 'That’s a flat. It lowers a note a half step, to the very next key on the left: this is B♭, the black key just left of B.', tag: 'flat', review: 'Flat (♭) lowers a half step' }),
  () => ({ q: 'This music is in G major, which has F♯. What does the sign in front of this F do?', ...choose(SIGN_CHOICES[2], SIGN_CHOICES), staff: { notes: [65], staves: 'treble', key: 'G' }, explain: 'That’s a natural sign. It cancels a sharp or flat: the key signature says F♯, but this note is plain F, the white key.', tag: 'natural', review: 'Natural (♮) cancels a sharp or flat' }),
  () => ({ q: 'What does the curved line joining these two notes mean?', ...choose('Play once, hold for both', ['Play both notes smoothly', 'Repeat the note', 'Play it louder']), staff: { voice: 'G4h~ G4h', staves: 'treble' }, explain: 'That’s a tie. It joins two notes of the same pitch: play once and hold for both values, here 2 + 2 = 4 beats.', tag: 'tie', review: 'Tie: play once, hold for both' }),
  () => ({ q: 'What does the dot after the first note do?', ...choose('Adds half its value', ['Makes it short', 'Doubles its value', 'Makes it louder']), staff: { voice: 'G4h. G4q', staves: 'treble' }, explain: 'A dot after a note adds half its value: a half note (2) plus its dot (1) lasts 3 beats. A dot above or below the notehead is different: that means short and detached.', tag: 'dot', review: 'Dot after a note: adds half its value' }),
  () => ({ q: 'What does this barline with two dots mean?', ...choose('Go back and play it again', ['The piece is over', 'Pause here', 'Play faster']), figure: { notes: 2, barline: G.repeatEnd }, explain: 'That’s a repeat sign. Go back to the start, or to a matching sign facing the other way, and play the section again.', tag: 'repeat', review: 'Repeat sign: play the section again' }),
  () => ({ q: 'What does the mark above this note ask for?', ...choose('Hold it longer than written', ['Play it short', 'Play it louder', 'Go back to the start']), figure: { note: true, above: G.fermata }, explain: 'That’s a fermata, or pause. Hold the note longer than its value, then carry on.', tag: 'fermata', review: 'Fermata: hold longer' }),
  () => ({ q: 'What does the mark above this note ask for?', ...choose('Play it with extra weight', ['Hold it longer than written', 'Play it softly', 'Repeat it']), figure: { note: true, above: G.accent }, explain: 'That’s an accent. Lean on that note so it stands out from the ones around it.', tag: 'accent', review: 'Accent: lean on the note' }),
  () => {
    const t = pick([[4, 4], [3, 4], [2, 4]]);
    return { q: 'What does the top number of this time signature tell you?', ...choose(`${t[0]} beats in each bar`, [`${t[0]} bars in the piece`, `Each note gets ${t[0]} beats`, `Play at speed ${t[0]}`]), staff: { notes: [], staves: 'treble', time: t }, explain: `The top number says how many beats are in each bar; the bottom 4 means a quarter note gets one beat. ${t[0] === 3 ? '3/4 is waltz time: 1 2 3, 1 2 3.' : t[0] === 2 ? '2/4 is march time: 1 2, 1 2.' : '4/4 is the most common time: 1 2 3 4.'}`, tag: 'time', review: `${t[0]}/4: ${t[0]} beats per bar`, key: `ts${t[0]}` };
  },
  () => dynamicsItem(true),
];

const MAJORS = [
  { k: 'C', name: 'C major', minor: 'A minor', n: 0, acc: 'no sharps or flats' },
  { k: 'G', name: 'G major', minor: 'E minor', n: 1, acc: 'one sharp, F♯' },
  { k: 'D', name: 'D major', minor: 'B minor', n: 2, acc: 'two sharps, F♯ and C♯' },
  { k: 'F', name: 'F major', minor: 'D minor', n: -1, acc: 'one flat, B♭' },
  { k: 'Bb', name: 'B♭ major', minor: 'G minor', n: -2, acc: 'two flats, B♭ and E♭' },
];
const keyRule = (x) => (x.n > 0 ? 'For sharp keys, the key note is a half step above the last sharp.' : x.n === -1 ? 'One flat is always F major.' : x.n < -1 ? 'For flat keys, the second-to-last flat names the key.' : 'No sharps or flats means C major (or A minor).');
const countText = (n) => (n === 0 ? 'None' : `${Math.abs(n)} ${n > 0 ? 'sharp' : 'flat'}${Math.abs(n) > 1 ? 's' : ''}`);

function keySigItem() {
  const x = pick(MAJORS), r = Math.random();
  if (r < 0.45) {
    return { q: 'Which major key has this key signature?', ...choose(x.name, MAJORS.map((y) => y.name)), staff: { notes: [], staves: 'treble', key: x.k }, explain: `${cap(x.acc)}: ${x.name}. ${keyRule(x)}`, tag: x.n >= 0 ? 'sharp-keys' : 'flat-keys', review: `${x.name}: ${x.acc}`, key: `km${x.k}` };
  }
  if (r < 0.75) {
    return { q: `This is the key signature of ${x.name}. Which minor key shares it?`, ...choose(x.minor, MAJORS.map((y) => y.minor)), staff: { notes: [], staves: 'treble', key: x.k }, explain: `Every major key has a relative minor with the same key signature. Count down three half steps from the key note: ${x.name.split(' ')[0]} down to ${x.minor.split(' ')[0]}, so ${x.minor}.`, tag: 'relative', review: `${x.name} ↔ ${x.minor}`, key: `kr${x.k}` };
  }
  return { q: `How many sharps or flats does ${x.name} have?`, ...choose(countText(x.n), MAJORS.map((y) => countText(y.n))), staff: { notes: [], staves: 'treble', key: 'C' }, reveal: { notes: [], staves: 'treble', key: x.k }, explain: `${x.name} has ${x.acc}. ${keyRule(x)}`, tag: x.n >= 0 ? 'sharp-keys' : 'flat-keys', review: `${x.name}: ${x.acc}`, key: `kc${x.k}` };
}

const INTERVALS = [
  { num: 2, semis: 2, name: '2nd', tune: 'the first two notes of “Frère Jacques” (traditional)' },
  { num: 3, semis: 4, name: '3rd', tune: 'the first two notes of “When the Saints Go Marching In” (traditional)' },
  { num: 4, semis: 5, name: '4th', tune: 'the first two notes of “Amazing Grace” (traditional)' },
  { num: 5, semis: 7, name: '5th', tune: 'the jump in “Twinkle, Twinkle, Little Star” (traditional)' },
  { num: 6, semis: 9, name: '6th', tune: 'the first two notes of “My Bonnie Lies Over the Ocean” (traditional)' },
  { num: 8, semis: 12, name: 'Octave', tune: 'the same letter, higher: the two notes blend almost into one' },
];
function topNote(lowMidi, num, semis) {
  const s0 = spell(lowMidi, 'C');
  const letter = (s0.letter + num - 1) % 7;
  const m = lowMidi + semis;
  let alter = pc(m) - LETTER_PC[letter];
  if (alter > 6) alter -= 12; if (alter < -6) alter += 12;
  return { midi: m, name: accName(letter, alter), prefer: alter < 0 ? 'flat' : 'sharp' };
}
function intervalItem() {
  const x = pick(INTERVALS);
  const low = pick([60, 62, 64, 65, 67]);
  const top = topNote(low, x.num, x.semis);
  const lowName = noteName(low);
  const letters = [];
  for (let k = 0; k < Math.min(x.num, 8); k++) letters.push(ORDER[(ORDER.indexOf(lowName[0]) + k) % 7]);
  const count = x.num === 8 ? `${lowName} up to the next ${lowName} is eight letter names.` : `${lowName} up to ${top.name}: ${letters.join(' ')}, ${x.num} letter names.`;
  return {
    q: 'Listen. How far apart are the two notes?', ...choose(x.name, INTERVALS.map((i) => i.name), 4, (a, b) => parseInt(a, 10) - parseInt(b, 10) || (a === 'Octave' ? 1 : -1)),
    play: [low, top.midi], harmonic: true, reveal: { notes: [low, top.midi], staves: 'treble', prefer: top.prefer, split: true, names: [lowName, top.name] },
    explain: `A ${x.name === 'Octave' ? 'n octave' : x.name}: ${count} It sounds like ${x.tune}.`.replace('A n octave', 'An octave'),
    tag: `int-${x.num}`, review: `${x.name}: ${x.tune.split(' (')[0]}`, key: `i${x.num}`,
  };
}

function chordItem() {
  const roots = ['C', 'D', 'E', 'F', 'G', 'A'];
  const c = makeChord(pick(roots), Math.random() < 0.6 ? 'maj' : 'min');
  const r = parseRoot(c.rootName);
  const alt = makeChord(c.rootName, c.q === 'maj' ? 'min' : 'maj');
  const next = makeChord(ORDER[(r.letter + 1) % 7], c.q);
  const sus = `${c.tones[0].name} ${ORDER[(r.letter + 3) % 7]} ${c.tones[2].name}`;
  if (Math.random() < 0.5) {
    return { q: `Which notes make ${c.sym}?`, ...choose(toneList(c), [toneList(alt), toneList(next), sus]), reveal: { notes: c.voicing, staves: 'treble', prefer: c.prefer }, explain: `${c.name}: root ${c.tones[0].name}, third ${c.tones[1].name}, fifth ${c.tones[2].name}. ${c.q === 'min' ? 'A minor third is 3 half steps above the root.' : 'A major third is 4 half steps above the root.'}`, tag: 'chords', review: `${c.sym} = ${toneList(c)}`, key: `ct${c.sym}` };
  }
  return { q: 'Which chord is this?', ...choose(c.sym, [alt.sym, next.sym, makeChord(ORDER[(r.letter + 4) % 7], c.q).sym]), staff: { notes: c.voicing, staves: 'treble', prefer: c.prefer }, explain: `The notes are ${toneList(c)}: root ${c.tones[0].name} at the bottom, so ${c.name}.`, tag: 'chords', review: `${toneList(c)} = ${c.sym}`, key: `cn${c.sym}` };
}

const TREBLE_POOL = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81];
const BASS_POOL = [40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60];

export const GENERATORS = {
  'treble-notes': () => noteReading('treble', TREBLE_POOL),
  'bass-notes': () => noteReading('bass', BASS_POOL),
  'note-values': noteValueItem,
  rests: restItem,
  values: () => (Math.random() < 0.6 ? noteValueItem() : restItem()),
  symbols: () => pick(SYMBOLS)(),
  'key-signatures': keySigItem,
  intervals: intervalItem,
  dynamics: () => dynamicsItem(false),
  chords: chordItem,
};
const ALIASES = { treble: 'treble-notes', bass: 'bass-notes', reading: 'treble-notes', rhythm: 'note-values', 'note-and-rest-values': 'values', keys: 'key-signatures', 'power-chords': 'chords' };

/** Make `count` questions from a generator name (or function), avoiding repeats where possible. */
export function generateItems(gen, count = 6) {
  const fn = typeof gen === 'function' ? gen : GENERATORS[gen] || GENERATORS[ALIASES[gen]] || GENERATORS['treble-notes'];
  const out = [], seen = new Set();
  for (let k = 0; k < count; k++) {
    let it, tries = 0;
    do { it = fn(); tries++; } while (tries < 25 && seen.has(it.key || it.q + it.choices[it.answer]));
    seen.add(it.key || it.q + it.choices[it.answer]);
    out.push(it);
  }
  return out;
}

/** Small SVG figure: a staff with a note and a mark above or below, or a repeat barline. */
function drawFigure(svg, f) {
  svg.textContent = '';
  const W = 22, H = 14, top = 3.5;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const g = s('g', { class: 'qz-fig' }, svg);
  for (let i = 0; i < 5; i++) s('line', { class: 'qz-fig-line', x1: 1, x2: W - 1, y1: top + i, y2: top + i }, g);
  glyph(g, G.gClef, 1.6, top + 3);
  const head = (x) => {
    glyph(g, G.black, x, top + 2);
    s('line', { class: 'qz-fig-stem', x1: x + 1.12, x2: x + 1.12, y1: top + 1.83, y2: top - 1.5 }, g);
  };
  if (f.note) {
    head(10.5);
    if (f.above) { const t = glyph(g, f.above, 10.5 + 0.59, top - 2.6); t.setAttribute('text-anchor', 'middle'); }
    if (f.below) { const t = glyph(g, f.below, 10.5 + 0.59, top + 7.4); t.setAttribute('text-anchor', 'middle'); }
  }
  if (f.notes) { head(8); head(12.5); }
  if (f.barline) glyph(g, f.barline, 16, top + 4);
}

// ======================================================================
// QuizRunner: reusable multiple-choice engine (Flashcards and lesson quiz steps)
// ======================================================================
export class QuizRunner {
  /**
   * opts: { items, generator, count = 6, staves, topic, preview, onAnswer(info) }
   * Item: { q, choices, answer, staff?: { notes, staves, prefer, key, time, voice }, rhythm?, play?, keyAnswer?, explain? }
   * onDone({ correct, wrong, missed })
   */
  constructor(app, opts = {}, onDone = () => {}) {
    this.app = app;
    this.o = { count: 6, ...opts };
    this.onDone = onDone;
    this.items = opts.items?.length ? [...opts.items] : generateItems(opts.generator, this.o.count);
    this.topic = opts.topic || (typeof opts.generator === 'string' ? opts.generator : 'quiz');
    this.i = -1; this.correct = 0; this.wrong = 0; this.missed = [];
    this.timers = new Set();
    this._build();
    if (this.o.preview) { this._show(0, true); return; }
    this.onKey = (e) => this._key(e);
    window.addEventListener('keydown', this.onKey, true);
    const notes = this.items.flatMap((it) => it.staff?.notes || []).filter((m) => typeof m === 'number');
    if (notes.length) app.keyboard.need(Math.min(...notes), Math.max(...notes));
    this._next();
  }

  get item() { return this.items[this.i]; }

  _later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }

  _build() {
    this.vis = h('div', { class: 'qz-vis' });
    this.svgStaff = s('svg', { class: 'qz-staff', role: 'img', 'aria-label': 'Music staff' });
    this.svgFig = s('svg', { class: 'qz-svg', role: 'img' });
    this.playBtn = h('button', { type: 'button', class: 'qz-play', onclick: () => this.replay() },
      h('span', { class: 'qz-play-icon', 'aria-hidden': 'true' }), h('span', {}, 'Play again'), h('kbd', {}, 'R'));
    this.vis.append(this.svgStaff, this.svgFig, this.playBtn);
    this.meta = h('p', { class: 'qz-meta' });
    this.qEl = h('p', { class: 'qz-q', 'aria-live': 'polite' });
    this.choicesEl = h('div', { class: 'qz-choices', role: 'group', 'aria-label': 'Answers' });
    this.nextBtn = h('button', { type: 'button', class: 'btn primary qz-next', onclick: () => this._advance() }, 'Next');
    this.actions = h('div', { class: 'qz-actions' }, this.nextBtn);
    this.main = h('div', { class: 'qz-main' }, this.meta, this.qEl, this.choicesEl, this.actions);
    this.root = h('div', { class: `qz${this.o.preview ? ' qz-preview' : ''}`, role: 'group', 'aria-label': 'Quiz' }, this.vis, this.main);
    this.host = h('div', { class: 'qz-host' }, this.root);
    this.app.ui.layer(this.host, { hideStaff: true });
    this.staff = null;
  }

  _staff() {
    if (!this.staff) {
      this.staff = new Staff(this.svgStaff);
      const draw = this.staff._drawColumn.bind(this.staff);
      this.staff._drawColumn = () => { draw(); this._labels(); };
    }
    return this.staff;
  }

  /** Note-name labels under column notes (shown after an answer). */
  _labels() {
    const st = this.staff, L = this.labels;
    if (!L || !st?.gCol || !st.column) return;
    const sp = st.sp;
    const cx = st.column.opts.x ?? st.panelW + (st.w - st.panelW) * 0.42;
    for (const lb of L) {
      const clef = st.clefFor({ midi: lb.midi });
      const y = st.y(spell(lb.midi, st.key, lb.prefer).step, clef);
      const bottom = (clef === 'treble' ? st.tTop : st.bTop) + 4 * sp;
      const t = s('text', { class: `qz-label ${lb.cls || ''}`, x: cx + (lb.dx || 0) * sp + 0.84 * sp, y: Math.max(bottom + 2.3 * sp, y + 2.6 * sp), 'font-size': 1.7 * sp, 'text-anchor': 'middle' }, st.gCol);
      t.textContent = lb.text;
    }
  }

  _drawStaff(spec, extra = []) {
    const st = this._staff();
    this.svgStaff.style.display = '';
    if (spec.voice) {
      this.labels = null;
      const sc = buildScore({ rh: spec.voice, time: spec.time || [4, 4], key: spec.key || 'C' });
      st.setScore(sc, { staves: spec.staves || 'treble', hideTime: !spec.time, showZone: false, noEnd: true, hideFingers: true, ppb: 4.2 });
      st.setBeat(-0.4);
      return;
    }
    const notes = spec.notes || [];
    const groups = [];
    if (spec.split && notes.length) notes.forEach((m, k) => groups.push({ midis: [m], cls: spec.cls || '', prefer: spec.prefer, dx: (k - (notes.length - 1) / 2) * 4.2 }));
    else if (notes.length) groups.push({ midis: notes, cls: spec.cls || '', prefer: spec.prefer });
    st.showColumn([...groups, ...extra], { staves: spec.staves || this.o.staves || 'treble', key: spec.key || 'C', time: spec.time || null });
  }

  _drawRhythmSvg(voice, len, counts) {
    const { events, length } = parseVoice(voice);
    const L = Math.max(len || 0, length);
    const ppb = L <= 2 ? 6 : 5.2;
    const w = 6 + L * ppb, H = 9;
    const svg = this.svgFig;
    svg.textContent = '';
    svg.style.display = '';
    const vw = Math.max(w, 24);
    svg.setAttribute('viewBox', `${num(-(vw - w) / 2)} 0 ${num(vw)} ${H}`);
    svg.setAttribute('aria-label', 'Rhythm on a one-line staff');
    const y = 4.6;
    s('line', { class: 'rh-line', x1: 0.3, x2: w - 0.3, y1: y, y2: y }, svg);
    glyph(svg, G.perc, 0.5, y, 'glyph rh-clef');
    if (len && len > length) {
      const gx = 3.9 + length * ppb;
      s('rect', { class: 'qz-gap', x: gx, y: y - 2.2, width: (len - length) * ppb - 0.6, height: 4.4, rx: 0.5 }, svg);
      txt(svg, '?', gx + ((len - length) * ppb - 0.6) / 2, y + 0.7, 'qz-gap-q', 2).setAttribute('text-anchor', 'middle');
    }
    drawRhythm(svg, events, { x0: 3.9, ppb, y, len: L, counts, countDy: 3.3 });
    if (L >= 4) s('line', { class: 'rh-bar', x1: w - 0.8, x2: w - 0.8, y1: y - 2, y2: y + 2 }, svg);
  }

  _visual(it, revealed) {
    this.svgStaff.style.display = 'none';
    this.svgFig.style.display = 'none';
    this.playBtn.hidden = !it.play;
    const spec = revealed && it.reveal ? it.reveal : it.staff;
    let shown = !!it.play;
    if (spec) { this._drawStaff(spec); shown = true; }
    else if (it.rhythm) { this._drawRhythmSvg(it.rhythm, it.rhythmLen, revealed && !it.hideCounts); shown = true; }
    else if (it.figure) { this.svgFig.style.display = ''; drawFigure(this.svgFig, it.figure); this.svgFig.setAttribute('aria-label', 'Notation symbol'); shown = true; }
    if (it.play && !spec) {
      this._drawStaff({ notes: [], staves: 'treble' });
    }
    this.root.classList.toggle('qz-novis', !shown);
    this.root.classList.toggle('qz-has-play', !!it.play);
  }

  _show(i, preview = false) {
    this.i = i;
    const it = this.item;
    this.answered = false;
    this.labels = null;
    this.root.scrollTop = 0;
    this.app.keyboard.clear('cue-r');
    this.root.classList.remove('qz-done', 'qz-answered');
    this.meta.textContent = preview ? 'Sample question' : `Question ${i + 1} of ${this.items.length}`;
    this.qEl.textContent = it.q;
    this.choicesEl.textContent = '';
    const longest = Math.max(...it.choices.map((c) => String(c).length));
    const cols = it.glyphChoices || longest <= 3 ? 'qz-c4' : longest <= 14 ? 'qz-c2' : longest <= 24 ? 'qz-c2 qz-long' : 'qz-c1';
    this.choicesEl.className = `qz-choices ${cols}`;
    this.btns = it.choices.map((c, k) => {
      const b = h('button', {
        type: 'button', class: 'qz-choice', disabled: preview,
        'aria-label': it.choiceLabels ? `${k + 1}: ${it.choiceLabels[k]}` : null,
        onclick: () => this.answer(k),
      }, h('span', { class: 'qz-num', 'aria-hidden': 'true' }, String(k + 1)), h('span', { class: `qz-txt${it.glyphChoices ? ' glyph' : ''}` }, c));
      this.choicesEl.append(b);
      return b;
    });
    this.actions.hidden = true;
    this._visual(it, false);
    if (it.keyAnswer && !preview) this.meta.textContent += ' · or play it';
    if (it.play && !preview) this._later(() => this.replay(), 350);
  }

  replay() {
    const it = this.item;
    if (!it?.play) return;
    const { sound } = this.app;
    sound.unlock();
    const t0 = sound.now() + 0.08, gap = 0.75;
    it.play.forEach((m, k) => sound.play(m, 0.72, t0 + k * gap, gap * 0.95));
    if (it.harmonic) it.play.forEach((m) => sound.play(m, 0.6, t0 + it.play.length * gap + 0.15, 1.3));
    if (this.answered) {
      it.play.forEach((m, k) => this._later(() => this.app.keyboard.flash(m, 'demo', 700), (0.08 + k * gap) * 1000));
    }
  }

  _key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || !this.root.isConnected) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || document.querySelector('dialog[open]')) return;
    const n = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
    if (n && !this.answered && this.item) {
      const k = +n[1] - 1;
      if (k < this.item.choices.length) { e.preventDefault(); e.stopPropagation(); this.answer(k); }
      return;
    }
    if (e.code === 'KeyR' && this.item?.play) { e.preventDefault(); this.replay(); return; }
    if (this.answered && !this.finished && (e.key === 'Enter' || e.code === 'Space' || e.key === 'ArrowRight')) {
      if (e.repeat) return;
      const a = document.activeElement;
      if (a === this.nextBtn && e.key !== 'ArrowRight') return; // the button handles it
      // leave other focused controls (tabs, settings) alone
      if (e.key !== 'ArrowRight' && a && a !== document.body && !this.root.contains(a) && /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(a.tagName)) return;
      e.preventDefault(); e.stopPropagation();
      this._advance();
    }
  }

  /** Piano input: answers "which note is this" questions. */
  noteOn(midi) {
    const it = this.item;
    if (!it || this.answered || this.finished || !it.keyAnswer) return;
    const ka = it.keyAnswer;
    const want = typeof ka === 'number' ? ka : ka.midi;
    const ok = typeof ka === 'number' ? midi === ka : pc(midi) === ka.pc;
    const name = noteName(midi, { prefer: it.staff?.prefer });
    let k = it.choices.findIndex((c) => c === name);
    if (ok) k = it.answer;
    this.answer(k, { midi, ok, want });
  }

  answer(k, played = null) {
    const it = this.item;
    if (!it || this.answered || this.finished || this.o.preview) return;
    this.answered = true;
    const ok = played ? played.ok : k === it.answer;
    if (ok) this.correct++; else { this.wrong++; this.missed.push({ item: it, chose: k, played }); }
    const coach = this.app.coach;
    coach?.record?.('quiz', { topic: it.topic || this.topic, correct: ok });
    if (played && !ok && played.want !== undefined) {
      coach?.record?.('wrong-pitch', { expected: played.want, played: played.midi, skill: it.staff?.staves === 'bass' ? 'bass' : 'treble', key: 'C' });
    }
    const kb = this.app.keyboard;
    const spec = it.reveal || it.staff;
    const name = (m) => noteName(m, { prefer: spec?.prefer });
    this.btns.forEach((b, j) => {
      b.disabled = true;
      b.classList.toggle('right', j === it.answer);
      b.classList.toggle('wrong', j === k && !ok);
      b.classList.toggle('dim', j !== it.answer && j !== k);
    });
    if (played) kb.flash(played.midi, ok ? 'hit' : 'miss', 500);
    // feedback: verdict and explanation, correct answer on the staff and keyboard
    const right = it.glyphChoices ? it.choiceLabels?.[it.answer] : it.choices[it.answer];
    let verdict = ok ? pick(['Right.', 'Correct.', 'Yes.', 'That’s it.']) : `Not quite. The answer is ${right}.`;
    if (played && ok && played.want !== undefined && played.midi !== played.want) {
      verdict = `Right name. On the staff this is ${noteName(played.want, { octave: true })}; you played ${noteName(played.midi, { octave: true })}.`;
    } else if (played && !ok) {
      verdict = `You played ${name(played.midi)}. This note is ${right}.`;
    }
    this.qEl.textContent = '';
    this.qEl.append(h('strong', { class: ok ? 'qz-ok' : 'qz-no' }, verdict), it.explain ? ` ${it.explain}` : '');
    this.root.classList.add('qz-answered');
    if (spec && !spec.voice) {
      const notes = spec.notes || [];
      const prefer = spec.prefer;
      if (notes.length === 1 || spec.names) {
        this.labels = (spec.names || [noteName(notes[0], { prefer })]).map((text, j) => ({
          midi: notes[j], text, prefer, cls: 'hit', dx: spec.split ? (j - (notes.length - 1) / 2) * 4.2 : 0,
        }));
      }
      const extra = played && !ok && notes.length === 1 && played.midi !== notes[0] ? [{ midis: [played.midi], cls: 'wrong', prefer, dx: 3.6 }] : [];
      if (extra.length) this.labels.push({ midi: played.midi, text: name(played.midi), prefer, cls: 'wrong', dx: 3.6 });
      this._drawStaff({ ...spec, cls: ok ? 'hit' : 'target' }, extra);
      if (!ok || it.reveal) notes.forEach((m) => kb.mark(m, 'cue-r', true));
    } else if (it.rhythm) this._drawRhythmSvg(it.rhythm, it.rhythmLen, !it.hideCounts);
    if (it.play) this._later(() => this.replay(), 450);
    this.o.onAnswer?.({ ok, item: it, index: this.i, correct: this.correct, wrong: this.wrong });
    const last = this.i >= this.items.length - 1;
    this.nextBtn.textContent = last ? 'Finish' : 'Next';
    this.actions.hidden = false;
    requestAnimationFrame(() => { if (this.root.scrollHeight > this.root.clientHeight) this.root.scrollTop = this.root.scrollHeight; });
    if (ok) {
      const ms = clamp(900 + (it.explain || '').length * 28, 1600, 4200) + (it.play ? 1200 : 0);
      this.autoT = this._later(() => this._advance(), ms);
    } else if (this.root.contains(document.activeElement) || document.activeElement === document.body) {
      this.nextBtn.focus({ preventScroll: true });
    }
  }

  /** End early: show the review for what was answered and report. */
  finishNow(note = '') {
    if (this.finished) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.items = this.items.slice(0, Math.max(0, this.i + (this.answered ? 1 : 0)));
    this.note = note;
    this._finish();
  }

  _advance() {
    if (!this.answered || this.finished) return;
    clearTimeout(this.autoT);
    this.timers.delete(this.autoT);
    this._next();
  }

  _next() {
    if (this.i + 1 >= this.items.length) { this._finish(); return; }
    this._show(this.i + 1);
  }

  _finish() {
    this.finished = true;
    this.app.keyboard.clear('cue-r');
    const total = this.correct + this.wrong;
    this.root.classList.add('qz-done', 'qz-novis');
    this.root.classList.remove('qz-has-play');
    this.meta.textContent = 'Review';
    this.qEl.textContent = '';
    this.qEl.append(h('strong', {}, `${this.correct} of ${total} right.`), this.missed.length ? ' Worth another look:' : ' All correct.');
    this.choicesEl.className = 'qz-review';
    this.choicesEl.textContent = '';
    for (const m of this.missed.slice(0, 4)) this.choicesEl.append(h('p', { class: 'qz-review-item' }, m.item.review || `${m.item.q} ${m.item.choices[m.item.answer]}`));
    this.actions.hidden = true;
    this.onDone({ correct: this.correct, wrong: this.wrong, missed: this.missed, note: this.note });
  }

  stop() {
    this.finished = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.onKey) window.removeEventListener('keydown', this.onKey, true);
    this.app.keyboard.clear('cue-r');
    if (this.host.isConnected) this.app.ui.layer(null);
  }

  tick() {}
}

// ======================================================================
// Flashcards game
// ======================================================================
const TAG_TIPS = {
  line: (t) => `Line notes tripped you up. ${t === 'bass-notes' ? 'Bass lines from the bottom: G B D F A.' : 'Treble lines from the bottom: E G B D F.'} Say them as you read.`,
  space: (t) => `Space notes tripped you up. ${t === 'bass-notes' ? 'Bass spaces from the bottom: A C E G.' : 'Treble spaces spell F A C E.'}`,
  ledger: () => 'Ledger-line notes were tricky. Count on from the staff as if its lines kept going: line, space, line.',
  whole: () => 'Review note values: whole 4 beats, half 2, quarter 1, eighth ½.',
  half: () => 'A half note is open with a stem: 2 beats. Count “1 2” through it.',
  quarter: () => 'A quarter note is filled with a stem: 1 beat. Bars of 4/4 add up to four.',
  eighth: () => 'Two eighth notes share one beat: count them “1 +”.',
  dotted: () => 'A dot adds half the note’s value: dotted half = 3, dotted quarter = 1½.',
  'whole-half-rest': () => 'Whole rest hangs down like a hole (4 beats); half rest sits up like a hat (2 beats).',
  rest: () => 'Quarter rest: 1 beat of silence. Eighth rest: half a beat.',
  'rest-count': () => 'Count every beat out loud, including the silent ones.',
  clef: () => 'Treble clef curls around G; bass clef’s dots surround F.',
  sharp: () => 'Sharp raises a half step, flat lowers, natural cancels.',
  flat: () => 'Sharp raises a half step, flat lowers, natural cancels.',
  natural: () => 'A natural cancels the key signature for that note.',
  tie: () => 'A tie joins same-pitch notes: play once, hold for both.',
  dot: () => 'A dot after a note adds half its value.',
  dynamics: () => 'p is soft, f is loud, m means moderately: pp p mp mf f ff.',
  time: () => 'Time signature: top number is beats per bar; bottom 4 means a quarter note gets the beat.',
  'sharp-keys': () => 'Sharp keys: the key note is a half step above the last sharp.',
  'flat-keys': () => 'Flat keys: one flat is F major; otherwise the second-to-last flat names the key.',
  relative: () => 'Relative minor: three half steps down from the major key note.',
  chords: () => 'Build a triad from the root: skip a letter, skip a letter. Major third = 4 half steps, minor = 3.',
};

function quizTakeaway(missed, topic, levels, cur) {
  if (!missed.length) return cur < levels.length - 1 ? `Every answer right. Try “${levels[cur + 1].name}” next.` : 'Every answer right.';
  const tags = {};
  for (const m of missed) tags[m.item.tag] = (tags[m.item.tag] || 0) + 1;
  const [tag, n] = Object.entries(tags).sort((a, b) => b[1] - a[1])[0];
  if (tag?.startsWith('int-')) {
    const first = missed.find((m) => m.item.tag === tag).item;
    const iv = INTERVALS.find((x) => `int-${x.num}` === tag);
    const others = [...new Set(missed.map((m) => m.item.choices[m.item.answer]))].filter((x) => x !== first.choices[first.answer]);
    const more = others.length ? ` Then the ${others.slice(0, 2).join(' and ')}.` : '';
    return `The ${iv.name === 'Octave' ? 'octave' : iv.name} was hardest to hear. Link it to a tune: ${iv.tune}. Hum it before you answer.${more}`;
  }
  const tip = TAG_TIPS[tag]?.(topic);
  return tip ? `${tip}${n < missed.length ? ' Then run this topic again.' : ' Run this topic again to lock it in.'}` : 'Run this topic again: the explanations after each answer are the quickest way to learn them.';
}

export const QUIZ_LEVELS = [
  { name: 'Treble notes', generator: 'treble-notes', tip: 'Name notes on the treble staff. Click an answer, press 1–4, or play the key.' },
  { name: 'Bass notes', generator: 'bass-notes', tip: 'Name notes on the bass staff. Click an answer, press 1–4, or play the key.' },
  { name: 'Note and rest values', generator: 'values', tip: 'How long each note and rest lasts, and how they fill a bar.' },
  { name: 'Symbols', generator: 'symbols', tip: 'Clefs, sharps and flats, ties, dots, repeats, time signatures and loud and soft.' },
  { name: 'Key signatures', generator: 'key-signatures', tip: 'C, G, D, F and B♭ major, and the minor keys that share their signatures.' },
  { name: 'Intervals by ear', generator: 'intervals', tip: 'Two notes play. How far apart are they? Press R to hear them again.' },
];
const QUIZ_COUNT = 10;

export class QuizGame extends GameBase {
  get lv() { const L = this.game.levels?.[this.level]; return L?.generator ? L : QUIZ_LEVELS[this.level] || QUIZ_LEVELS[0]; }

  preview() {
    this.runner?.stop();
    this.runner = new QuizRunner(this.app, { generator: this.lv.generator, count: 1, preview: true });
    this.app.ui.prompt(this.lv.tip);
    this.app.keyboard.need(this.lv.generator === 'bass-notes' ? 40 : 60, this.lv.generator === 'bass-notes' ? 60 : 81);
  }

  intro() {
    super.intro();
    gxSeg(footOf(this.app));
  }

  start() {
    const lv = this.lv;
    this.app.sound.unlock();
    this.runner?.stop();
    this.playing = true;
    this.score = 0; this.streak = 0;
    this.tracker = this.app.coach?.begin?.({ topic: lv.generator }) || null;
    this.app.ui.prompt(lv.tip);
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this.runner?.finishNow('Stopped.') }, 'Stop'));
    this.runner = new QuizRunner(this.app, {
      generator: lv.generator, count: QUIZ_COUNT, topic: lv.generator,
      onAnswer: ({ ok, index }) => {
        if (ok) { this.score += 10 + Math.min(10, this.streak * 2); this.streak++; } else this.streak = 0;
        this._hud(index + 1);
      },
    }, (r) => this._done(r, r.note || ''));
    this._hud(0);
  }

  _hud(n) {
    this.app.ui.status(`${this.score} points · ${n} of ${QUIZ_COUNT} answered${this.streak > 2 ? ` · ${this.streak} in a row` : ''}`);
  }

  _done(r, prefix = '') {
    if (!this.playing) return;
    this.playing = false;
    const total = r.correct + r.wrong;
    if (this.tracker) { this.app.coach?.end?.(this.tracker, { score: total ? r.correct / total : 0 }); this.tracker = null; }
    const head = `${prefix ? `${prefix} ` : ''}${r.correct} of ${total} right, ${this.score} points.`;
    this.over(this.score, `${head} ${quizTakeaway(r.missed || [], this.lv.generator, this.game.levels, this.level)}`);
  }

  noteOn(e) { if (this.playing) this.runner?.noteOn(e.midi); }

  exit() {
    super.exit();
    this.runner?.stop();
    this.runner = null;
    if (this.tracker) { this.app.coach?.end?.(this.tracker); this.tracker = null; }
  }
}

// ======================================================================
// Catalog entries
// ======================================================================
export const RHYTHM_LEVELS = [
  { name: 'Quarter notes', bars: 'quarters', tempo: 72, step: 6, max: 126, skill: 'note-values', tip: 'One stone per beat. Tap any key, or Space, with every click: “1 2 3 4”.' },
  { name: 'Halves and wholes', bars: 'long', tempo: 72, step: 6, max: 120, skill: 'note-values', tip: 'Long stones are long notes. Tap once, then keep counting while you stand on it.' },
  { name: 'Eighth notes', bars: 'eighths', tempo: 66, step: 5, max: 108, skill: 'eighths', tip: 'Two eighths share a beat. Count “1 + 2 +” and tap on the “+” too.' },
  { name: 'Rests', bars: 'rests', tempo: 72, step: 5, max: 116, skill: 'rests', tip: 'A rest has no stone: keep counting, keep your hands still.' },
  { name: 'Dotted quarters', bars: 'dotted', tempo: 66, step: 4, max: 104, skill: 'dotted', tip: 'A dotted quarter lasts a beat and a half: “1 (2) +”. The eighth after it lands on the “+”.' },
  { name: 'Syncopation', bars: 'offbeats', tempo: 60, step: 4, max: 96, skill: 'eighths', tip: 'Notes on the “+” that ring across the beat. Count eighths steadily and trust the count.' },
];

export const GAMES_EXTRA = [
  {
    id: 'beat', title: 'Stepping Stones',
    summary: 'Cross the river in rhythm. Tap any key in time with the notes, counted against the click.',
    levels: RHYTHM_LEVELS,
  },
  {
    id: 'chords', title: 'Chord Stars',
    summary: 'A chord symbol falls through the night sky. Play all its notes together before it lands.',
    levels: CHORD_LEVELS,
  },
  {
    id: 'quiz', title: 'Flashcards',
    summary: 'Quick review of note names, rhythms, symbols, key signatures and intervals, with an explanation after every answer.',
    levels: QUIZ_LEVELS,
  },
];

export const GAME_CLASSES_EXTRA = { beat: RhythmGame, chords: ChordGame, quiz: QuizGame };
