// Arcade kit for the Miracle-style games: an SVG stage with its own staff, small sprite and tween
// helpers, synthesized sound effects, the device-wide Hall of Fame, and ArcadeBase (intro, attract
// screen, results, and an "embedded" mode so lessons and the coach can run a short round).
import { spell, noteName, buildScore } from './theory.js';
import { catalog } from './catalog.js';
import { barOf } from './coach.js';
import { GameBase } from './gamebase.js';
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
export const GLYPH = {
  gClef: '', fClef: '', brace: '', black: '', half: '', whole: '',
  acc: { '-1': '', '0': '', '1': '' },
};
const STEP = { trebleTop: 38, trebleBot: 30, bassTop: 26, bassBot: 18 };
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];
const GAP = 6;

export const PAINT = ['#62c993', '#8fb7de', '#e9705a', '#d9a93a'];
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = {
  out: (p) => 1 - (1 - p) ** 3,
  in: (p) => p ** 2,
  inOut: (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  back: (p) => 1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2,
};

/** Create an SVG element. */
export function svg(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}

/**
 * The play area. Owns an <svg> (sized 1:1 with the board, so sp is in screen pixels) and an HTML
 * panel for attract and results screens. Layers: bg, staff, back, sprites, fx, hud.
 */
export class Stage {
  constructor(app, opts = {}) {
    this.app = app;
    this.opts = { staves: 'treble', key: 'C', mTop: 3, mBot: 3, padTop: 0.12, padBot: 0.18, maxSp: 19, ...opts };
    this.tweens = [];
    this.w = 800; this.h = 360; this.sp = 12;
  }

  mount() {
    this.wrap = h('div', { class: 'arcade' });
    this.svg = svg('svg', { class: 'arcade-stage', 'aria-hidden': 'true' });
    this.wrap.append(this.svg);
    this.panel = h('div', { class: 'arcade-panel', hidden: true });
    this.wrap.append(this.panel);
    this.layers = {};
    for (const k of ['bg', 'staff', 'back', 'sprites', 'fx', 'hud']) this.layers[k] = svg('g', { class: `ar-${k}` }, this.svg);
    this.app.ui.layer(this.wrap, { hideStaff: true });
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.wrap);
    this.layout();
    return this;
  }

  destroy() {
    this.ro?.disconnect();
    this.tweens = [];
    this.app.ui.layer(null);
  }

  /** Change staves or key and relayout. */
  configure(patch) { Object.assign(this.opts, patch); this.layout(); }

  layout() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.round(r.width), hgt = Math.round(r.height);
    const resized = w !== this.w || hgt !== this.h;
    this.w = w; this.h = hgt;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    const o = this.opts;
    const block = (o.staves === 'grand' ? 8 + GAP : 4) + o.mTop + o.mBot;
    const top = hgt * o.padTop, bot = hgt * (1 - o.padBot);
    this.sp = clamp(Math.min((bot - top) / block, w / (o.wDiv || 30)), 6, o.maxSp);
    const sp = this.sp;
    const used = block * sp;
    const y0 = top + Math.max(0, (bot - top - used) / 2) + o.mTop * sp;
    if (o.staves === 'bass') { this.bTop = y0; this.tTop = y0 - (4 + GAP) * sp; }
    else { this.tTop = y0; this.bTop = y0 + (4 + GAP) * sp; }
    this.left = Math.max(10, Math.round(w * 0.015));
    this.right = w - this.left;
    const nSig = Math.abs(this._sig());
    this.noteLeft = this.left + (o.staves === 'grand' ? 1.2 * sp : 0) + 3.6 * sp + nSig * 1.0 * sp + 1.2 * sp;
    this.staffTop = o.staves === 'bass' ? this.bTop : this.tTop;
    this.staffBottom = (o.staves === 'treble' ? this.tTop : this.bTop) + 4 * sp;
    this.drawStaff();
    this.onLayout?.(resized);
  }

  _sig() {
    const KEY = { C: 0, G: 1, D: 2, A: 3, E: 4, F: -1, Bb: -2, Eb: -3, Am: 0, Em: 1, Dm: -1, Gm: -2, Cm: -3, Bm: 2 };
    return KEY[this.opts.key] ?? 0;
  }

  drawStaff() {
    const g = this.layers.staff;
    g.textContent = '';
    const { sp, left, right } = this;
    const staves = this.opts.staves === 'grand' ? ['treble', 'bass'] : [this.opts.staves];
    const x0 = left + (this.opts.staves === 'grand' ? 1.2 * sp : 0);
    for (const clef of staves) {
      const top = clef === 'treble' ? this.tTop : this.bTop;
      for (let i = 0; i < 5; i++) svg('line', { x1: x0, x2: right, y1: top + i * sp, y2: top + i * sp, class: 'ar-line' }, g);
      this.glyph(g, clef === 'treble' ? GLYPH.gClef : GLYPH.fClef, x0 + 0.5 * sp, top + (clef === 'treble' ? 3 : 1) * sp, 'ar-clef');
      const n = this._sig();
      const steps = n > 0 ? SHARP_STEPS : FLAT_STEPS;
      for (let i = 0; i < Math.abs(n); i++) {
        const st = steps[i] - (clef === 'bass' ? 14 : 0);
        this.glyph(g, GLYPH.acc[n > 0 ? '1' : '-1'], x0 + 3.6 * sp + i * sp, this.yOfStep(st, clef), 'ar-clef');
      }
    }
    if (staves.length === 2) {
      svg('line', { x1: x0, x2: x0, y1: this.tTop, y2: this.bTop + 4 * sp, class: 'ar-line' }, g);
      svg('text', { x: left, y: this.bTop + 4 * sp, 'font-size': (this.bTop + 4 * sp - this.tTop), class: 'ar-glyph ar-clef' }, g).textContent = GLYPH.brace;
    } else {
      svg('line', { x1: x0, x2: x0, y1: this.staffTop, y2: this.staffTop + 4 * sp, class: 'ar-line' }, g);
    }
  }

  /** Draw a notation glyph (SMuFL size: font-size is four staff spaces). */
  glyph(parent, ch, x, y, cls = '', scale = 1) {
    const t = svg('text', { x, y, 'font-size': 4 * this.sp * scale, class: `ar-glyph ${cls}` }, parent);
    t.textContent = ch;
    return t;
  }

  clefOf(midi) {
    if (this.opts.staves !== 'grand') return this.opts.staves;
    return midi >= 60 ? 'treble' : 'bass';
  }

  yOfStep(step, clef) {
    return clef === 'treble'
      ? this.tTop + (STEP.trebleTop - step) * this.sp / 2
      : this.bTop + (STEP.bassTop - step) * this.sp / 2;
  }

  /** Where a MIDI note sits: { y, step, clef, acc, name }. */
  place(midi, prefer, clef = this.clefOf(midi)) {
    const s = spell(midi, this.opts.key, prefer);
    return { y: this.yOfStep(s.step, clef), step: s.step, clef, acc: s.accidental, name: s.name };
  }

  /** Ledger lines for a note at `step` on `clef`, centred on x. */
  ledgers(parent, x, step, clef, half = 0.95) {
    const top = clef === 'treble' ? STEP.trebleTop : STEP.bassTop;
    const bot = clef === 'treble' ? STEP.trebleBot : STEP.bassBot;
    const out = [];
    for (let s = bot - 2; s >= step; s -= 2) out.push(s);
    for (let s = top + 2; s <= step; s += 2) out.push(s);
    return out.map((s) => svg('line', { x1: x - half * this.sp, x2: x + half * this.sp, y1: this.yOfStep(s, clef), y2: this.yOfStep(s, clef), class: 'ar-ledger' }, parent));
  }

  /** A plain notehead with ledgers and accidental, for previews and labels. */
  note(parent, x, midi, { prefer, cls = '', head = GLYPH.black, clef } = {}) {
    const p = this.place(midi, prefer, clef || this.clefOf(midi));
    const g = svg('g', { class: `ar-note ${cls}` }, parent);
    this.ledgers(g, x + 0.59 * this.sp, p.step, p.clef);
    if (p.acc !== null && p.acc !== undefined) this.glyph(g, GLYPH.acc[String(p.acc)], x - 1.1 * this.sp, p.y);
    this.glyph(g, head, x, p.y);
    return { g, ...p };
  }

  // ---------- animation ----------
  tween(dur, fn, { ease: e = (p) => p, done, delay = 0 } = {}) {
    const tw = { t: -delay, dur, fn, e, done };
    this.tweens.push(tw);
    if (delay <= 0) fn(e(0));
    return tw;
  }

  /** Drop every running tween (between rounds). */
  clearTweens() { this.tweens = []; }

  update(dt) {
    if (!this.tweens.length) return;
    const list = this.tweens;
    this.tweens = [];               // tweens started by callbacks land here
    const keep = [];
    for (const tw of list) {
      if (tw.killed) continue;
      tw.t += dt;
      if (tw.t < 0) { keep.push(tw); continue; }
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.e(p));
      if (p < 1) keep.push(tw); else tw.done?.();
    }
    this.tweens = keep.concat(this.tweens);
  }

  /** Floating score text. */
  float(x, y, text, cls = 'ar-float') {
    const t = svg('text', { x, y, class: cls, 'text-anchor': 'middle', 'font-size': 1.5 * this.sp }, this.layers.fx);
    t.textContent = text;
    this.tween(0.9, (p) => {
      t.setAttribute('y', y - p * 2.6 * this.sp);
      t.setAttribute('opacity', 1 - p * p);
    }, { ease: ease.out, done: () => t.remove() });
    return t;
  }

  /** A burst of small particles. */
  puff(x, y, color = 'var(--chalk)', n = 10, size = 0.32) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const dist = rand(1.2, 2.6) * this.sp;
      const c = svg('ellipse', { cx: x, cy: y, rx: size * this.sp, ry: size * 0.55 * this.sp, fill: color, class: 'ar-puff' }, this.layers.fx);
      const rot = rand(0, 180);
      this.tween(rand(0.45, 0.75), (p) => {
        c.setAttribute('cx', x + Math.cos(a) * dist * p);
        c.setAttribute('cy', y + Math.sin(a) * dist * p + p * p * this.sp);
        c.setAttribute('transform', `rotate(${rot + p * 160} ${x + Math.cos(a) * dist * p} ${y + Math.sin(a) * dist * p})`);
        c.setAttribute('opacity', 1 - p);
      }, { ease: ease.out, done: () => c.remove() });
    }
  }

  /** A paint splat with drips, labelled with the note that was played. Fades out. */
  splat(x, y, color, label, life = 1.8) {
    const sp = this.sp;
    const g = svg('g', { class: 'ar-splat' }, this.layers.fx);
    const pts = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = (i % 2 ? rand(0.55, 0.8) : rand(0.95, 1.35)) * sp;
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.82]);
    }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n], q = pts[(i - 1) % n];
      d += ` Q${((p[0] + q[0]) / 2 + rand(-3, 3)).toFixed(1)},${((p[1] + q[1]) / 2 + rand(-3, 3)).toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    }
    svg('path', { d: d + 'Z', fill: color }, g);
    for (let i = 0; i < 4; i++) svg('circle', { cx: x + rand(-1.9, 1.9) * sp, cy: y + rand(-1.4, 1.4) * sp, r: rand(0.12, 0.26) * sp, fill: color }, g);
    const drips = [];
    for (let i = 0; i < 2; i++) drips.push(svg('rect', { x: x + rand(-0.6, 0.5) * sp, y, width: 0.22 * sp, height: 0.1, rx: 0.11 * sp, fill: color }, g));
    if (label) {
      const t = svg('text', { x, y: y + 0.42 * sp, 'text-anchor': 'middle', 'font-size': 1.1 * sp, class: 'ar-splat-label' }, g);
      t.textContent = label;
    }
    this.tween(0.12, (p) => g.setAttribute('transform', `translate(${x} ${y}) scale(${0.3 + 0.7 * p}) translate(${-x} ${-y})`));
    this.tween(life, (p) => {
      drips.forEach((r, i) => r.setAttribute('height', (0.5 + p * (1.2 + i)) * sp));
      g.setAttribute('opacity', p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
    }, { done: () => g.remove() });
    return g;
  }

  // ---------- panel ----------
  showPanel(...nodes) {
    this.panel.textContent = '';
    nodes.filter(Boolean).forEach((n) => this.panel.append(n));
    this.panel.hidden = false;
  }
  hidePanel() { this.panel.hidden = true; this.panel.textContent = ''; }
}

// ---------- sound effects ----------
export class Sfx {
  constructor(sound) { this.sound = sound; this.loops = new Set(); }
  get ctx() { return this.sound.ctx; }
  get ok() { return !!this.ctx && !this.sound.offline && this.ctx.state === 'running'; }

  _out(gain) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.sound.master || this.ctx.destination);
    return g;
  }

  _noiseBuf() {
    if (this._nb) return this._nb;
    const ctx = this.ctx, len = ctx.sampleRate;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (this._nb = b);
  }

  _env(param, t, a, peak, dec) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  _blip({ type = 'square', f0, f1, dur, gain = 0.2, at = 0, filter }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this._env(g.gain, t, 0.008, 1, dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'bandpass'; f.frequency.value = filter.f; f.Q.value = filter.q || 1;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(this._out(gain));
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noise({ dur, gain = 0.2, at = 0, type = 'lowpass', f0 = 1200, f1 = 300, q = 1 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf();
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this._env(g.gain, t, 0.005, 1, dur);
    src.connect(f); f.connect(g); g.connect(this._out(gain));
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  quack(pitch = 1) {
    if (!this.ok) return;
    for (const at of [0, 0.13]) this._blip({ type: 'sawtooth', f0: 560 * pitch, f1: 330 * pitch, dur: 0.11, gain: 0.16, at, filter: { f: 1250 * pitch, q: 2.5 } });
  }
  laugh() { if (!this.ok) return; [0, 0.11, 0.22].forEach((at, i) => this._blip({ type: 'sawtooth', f0: 760 - i * 60, f1: 520 - i * 60, dur: 0.08, gain: 0.13, at, filter: { f: 1500, q: 2 } })); }
  splat() { if (!this.ok) return; this._noise({ dur: 0.28, gain: 0.32, f0: 1600, f1: 220 }); this._blip({ type: 'sine', f0: 170, f1: 55, dur: 0.16, gain: 0.35 }); }
  whoosh() { if (!this.ok) return; this._noise({ dur: 0.2, gain: 0.08, type: 'bandpass', f0: 2600, f1: 700, q: 1.4 }); }
  pop() { if (!this.ok) return; this._blip({ type: 'sine', f0: 700, f1: 1500, dur: 0.07, gain: 0.18 }); }
  buzz() { if (!this.ok) return; this._blip({ type: 'square', f0: 140, f1: 110, dur: 0.24, gain: 0.08, filter: { type: 'lowpass', f: 700 } }); }
  tick(strong = false) { if (!this.ok) return; this._blip({ type: 'square', f0: strong ? 1800 : 1300, f1: strong ? 1700 : 1250, dur: 0.03, gain: 0.05 }); }

  bell() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [[1, 0.5], [2, 0.22], [2.76, 0.16], [5.4, 0.08]].forEach(([r, a]) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = 1175 * r;
      const g = ctx.createGain();
      this._env(g.gain, t, 0.004, a, 1.4 / r ** 0.4);
      o.connect(g); g.connect(this._out(0.35));
      o.start(t); o.stop(t + 1.6);
    });
  }

  fanfare(midis = [72, 76, 79, 84], step = 0.11) {
    if (!this.ok) return;
    midis.forEach((m, i) => {
      const f = 440 * 2 ** ((m - 69) / 12);
      const last = i === midis.length - 1;
      this._blip({ type: 'triangle', f0: f, f1: f * 1.001, dur: last ? 0.5 : step * 0.9, gain: 0.18, at: i * step });
      this._blip({ type: 'square', f0: f, f1: f, dur: last ? 0.45 : step * 0.8, gain: 0.035, at: i * step, filter: { type: 'lowpass', f: 2400 } });
    });
  }

  /** Rising shimmer, for tractor beams and power-ups. */
  beam(dur = 0.6, up = true) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(up ? 320 : 900, t);
    o.frequency.exponentialRampToValueAtTime(up ? 900 : 320, t + dur);
    lfo.frequency.value = 9; lg.gain.value = 30;
    lfo.connect(lg); lg.connect(o.frequency);
    this._env(g.gain, t, 0.05, 1, dur);
    o.connect(g); g.connect(this._out(0.07));
    o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }

  /** A looping sound (helicopter rotor, engine hum). Returns a stop function. */
  loop(kind = 'rotor', gain = 0.12) {
    if (!this.ok) return () => {};
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf(); src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = kind === 'rotor' ? 420 : 160; f.Q.value = kind === 'rotor' ? 1.2 : 3;
    const amp = ctx.createGain(); amp.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = kind === 'rotor' ? 13 : 30;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(amp.gain);
    const out = this._out(0.0001);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.4);
    src.connect(f); f.connect(amp); amp.connect(out);
    src.start(t); lfo.start(t);
    const stop = () => {
      const n = ctx.currentTime;
      out.gain.cancelScheduledValues(n);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), n);
      out.gain.exponentialRampToValueAtTime(0.0001, n + 0.5);
      src.stop(n + 0.55); lfo.stop(n + 0.55);
      this.loops.delete(stop);
    };
    this.loops.add(stop);
    return stop;
  }

  stopAll() { for (const s of [...this.loops]) s(); }
}

// ---------- Hall of Fame (shared by every player on this device) ----------
const FAME_SIZE = 10;

export function fameList(store, gameId) { return store.root.hall?.[gameId] || []; }

/** Add a score; returns its rank (0-based) or -1 if it didn't make the table. */
export function addFame(store, gameId, entry) {
  const root = store.root;
  root.hall ||= {};
  const list = (root.hall[gameId] ||= []);
  const rec = { name: store.profile?.name || 'Player', pid: store.profile?.id, at: Date.now(), ...entry };
  list.push(rec);
  list.sort((a, b) => b.score - a.score || a.at - b.at);
  list.length = Math.min(list.length, FAME_SIZE);
  store.save();
  return list.indexOf(rec);
}

export function fameTable(store, gameId, { highlight = -1, limit = 5, empty = 'No scores yet. Be the first.' } = {}) {
  const list = fameList(store, gameId).slice(0, limit);
  if (!list.length) return h('p', { class: 'ar-fame-empty' }, empty);
  return h('ol', { class: 'ar-fame' }, ...list.map((e, i) => h('li', { class: i === highlight ? 'me' : null },
    h('span', { class: 'ar-rank' }, String(i + 1)),
    h('span', { class: 'ar-name' }, e.name),
    h('span', { class: 'ar-lv' }, e.level || ''),
    h('span', { class: 'ar-score' }, e.score.toLocaleString()))));
}


// ---------- songs: the material for each game's song mode ----------
/** Bar number (0-based, pickup bar = 0 when there is one) for a beat. */
export function songBar(score, t) { return barOf(score, t); }

/**
 * One line of a song for a hand: the top note of each right-hand chord, the bottom of each
 * left-hand one, in order. Tied continuations are skipped. Optional bar range (inclusive).
 * Returns [{ midi, t, d, finger, prefer, bar, hand }].
 */
export function melodyOf(score, hand = 'R', { fromBar = 0, toBar = Infinity } = {}) {
  const byT = new Map();
  for (const n of score.notes) {
    if ((n.hand || 'R') !== hand || n.tiedFrom) continue;
    const bar = barOf(score, n.t);
    if (bar < fromBar || bar > toBar) continue;
    const cur = byT.get(n.t);
    if (!cur || (hand === 'R' ? n.midi > cur.midi : n.midi < cur.midi)) byT.set(n.t, { ...n, bar, hand });
  }
  return [...byT.values()].sort((a, b) => a.t - b.t)
    .map((n) => ({ midi: n.midi, t: n.t, d: n.sd ?? n.d, finger: n.finger, prefer: n.prefer, bar: n.bar, hand }));
}

/**
 * Split a hand's line into short phrases for learning: whole bars, one or two at a time, aiming
 * for min..max notes; a very busy bar is cut in half. Returns [{ notes, fromBar, toBar }].
 */
export function phrasesOf(score, hand = 'R', { min = 3, max = 8, fromBar = 0, toBar = Infinity } = {}) {
  const line = melodyOf(score, hand, { fromBar, toBar });
  const bars = new Map();
  for (const n of line) (bars.get(n.bar) || bars.set(n.bar, []).get(n.bar)).push(n);
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.notes.length) out.push(cur); cur = null; };
  for (const [bar, notes] of [...bars.entries()].sort((a, b) => a[0] - b[0])) {
    if (notes.length > max) {
      flush();
      const half = Math.ceil(notes.length / 2);
      out.push({ notes: notes.slice(0, half), fromBar: bar, toBar: bar });
      out.push({ notes: notes.slice(half), fromBar: bar, toBar: bar });
      continue;
    }
    if (cur && (cur.notes.length + notes.length > max || cur.toBar - cur.fromBar >= 1)) flush();
    if (!cur) cur = { notes: [], fromBar: bar, toBar: bar };
    cur.notes.push(...notes);
    cur.toBar = bar;
    if (cur.notes.length >= min && cur.toBar - cur.fromBar >= 1) flush();
  }
  flush();
  // fold a tiny last phrase into the one before it
  if (out.length > 1 && out[out.length - 1].notes.length < min && out[out.length - 2].notes.length + out[out.length - 1].notes.length <= max + 2) {
    const last = out.pop();
    const prev = out[out.length - 1];
    prev.notes.push(...last.notes); prev.toBar = last.toBar;
  }
  return out;
}

/** Songs a player has practised, most recent first. */
export function recentSongs(store) {
  return Object.entries(store.data.songs || {}).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .map(([id]) => catalog.song(id)).filter(Boolean);
}

// ---------- ArcadeBase ----------
/**
 * Base for the arcade games. Subclasses implement: stageOptions(), attract() (idle scene),
 * start(), noteOn(e), step(dt) and layout(resized). Call this.finish({ score, detail, stats })
 * to end a round.
 *
 * opts.embedded = { pool, count, staves, text, pass, onDone(result) } runs one short round with no
 * intro or Hall of Fame, for lessons and coach practice.
 */
export class ArcadeBase extends GameBase {
  constructor(app, game, opts = {}) {
    super(app, game);
    this.embedded = opts.embedded || null;
    if (this.embedded && this.embedded.level !== undefined) this.level = this.embedded.level;
    this.level = Math.min(this.level, this.game.levels.length - 1);
    this.sfx = new Sfx(app.sound);
  }

  get lv() {
    const base = this.game.levels[this.level];
    const lv = this.embedded ? { ...base, ...this.embedded } : { ...base };
    if (lv.song) {
      lv.song = this.songId;
      if (!this.embedded?.hands) lv.hands = this.songHand;
    }
    return lv;
  }

  /** The hand to learn in song mode (picked in the intro; right if the song has no left-hand part). */
  get songHand() {
    if (this.embedded?.hands) return this.embedded.hands;
    const want = this.app.store.data.gameHand?.[this.game.id] || 'R';
    return want === 'L' && !this.songHasHand('L') ? 'R' : want;
  }

  songHasHand(hand) {
    const def = this.songDef;
    return !!def && !!String(hand === 'L' ? def.lh || '' : def.rh || '').replace(/[|\s]|r[whqes.]*/g, '').length;
  }

  /** True when the current level (or the embedded round) teaches a song. */
  get songLevel() { return !!(this.embedded?.song || this.game.levels[this.level]?.song); }

  /** Songs this game can teach (a game may narrow it, e.g. Ripchord needs a chord chart). */
  songChoices() { return catalog.songs.filter((s) => this.songFilter?.(s) ?? true); }

  /** The song for song mode: the embedded one, the one picked here, a recent one, or a familiar default. */
  get songId() {
    const ok = (s) => s && (this.songFilter?.(s) ?? true);
    if (this._songId && ok(catalog.song(this._songId))) return this._songId;
    const want = this.embedded?.song;
    if (want && want !== 'auto' && ok(catalog.song(want))) return want;
    const picked = this.app.store.data.gameSong?.[this.game.id];
    if (!this.embedded && picked && ok(catalog.song(picked))) return picked;
    const recent = recentSongs(this.app.store).find(ok);
    if (recent) return recent.id;
    return ['ode-to-joy', 'korobeiniki', 'hall-of-the-mountain-king', 'greensleeves'].find((id) => ok(catalog.song(id))) || this.songChoices()[0]?.id;
  }

  set songId(v) { this._songId = v; }

  get songDef() { return catalog.song(this.songId); }

  stageOptions() { return { staves: this.lv.staves || 'treble' }; }

  enter() {
    const { ui } = this.app;
    ui.head({ kicker: this.embedded ? 'Practice game' : 'Arcade', title: this.game.title });
    ui.prompt(this.embedded?.text || this.game.summary);
    ui.status('');
    ui.big();
    this.stage = new Stage(this.app, this.stageOptions()).mount();
    this.stage.onLayout = (resized) => this.layout?.(resized);
    if (this.embedded) { this.app.sound.unlock(); this.begin(); return; }
    this.intro();
  }

  intro() {
    const { ui } = this.app;
    this.playing = false;
    this.sfx.stopAll();
    const levels = this.game.levels;
    const sel = h('select', { 'aria-label': 'Level', onchange: (e) => this._setLevel(+e.target.value) },
      ...levels.map((l, i) => h('option', { value: i }, `${i + 1}. ${l.name}`)));
    sel.value = String(this.level);
    const best = this.app.store.game(this.game.id, this.level);
    let songSel = null;
    if (this.songLevel) {
      const recent = recentSongs(this.app.store).filter((x) => this.songFilter?.(x) ?? true).slice(0, 6);
      const all = this.songChoices().slice().sort((a, b) => a.title.localeCompare(b.title));
      const opt = (x) => h('option', { value: x.id }, `${x.title} (level ${x.level})`);
      songSel = h('select', { 'aria-label': 'Song', onchange: (e) => this._setSong(e.target.value) },
        recent.length ? h('optgroup', { label: 'Your recent songs' }, ...recent.map(opt)) : null,
        h('optgroup', { label: 'All songs' }, ...all.map(opt)));
      songSel.value = this.songId;
    }
    let handSel = null;
    if (this.songLevel && this.songHasHand('L') && this.game.songHands !== false) {
      handSel = h('select', { 'aria-label': 'Hand', onchange: (e) => this._setHand(e.target.value) },
        h('option', { value: 'R' }, 'Right hand'), h('option', { value: 'L' }, 'Left hand'));
      handSel.value = this.songHand;
    }
    ui.foot(
      h('label', { class: 'ar-level' }, h('span', {}, 'Level'), sel),
      songSel ? h('label', { class: 'ar-level ar-song' }, h('span', {}, 'Song'), songSel) : null,
      handSel ? h('label', { class: 'ar-level' }, h('span', { class: 'sr-only' }, 'Hand'), handSel) : null,
      h('button', { class: 'btn primary', 'data-enter': '', onclick: () => { this.app.sound.unlock(); this.begin(); } }, 'Start game'),
      best ? h('span', { class: 'note' }, `Your best: ${best.toLocaleString()}`) : null,
    );
    this.stage.configure(this.stageOptions());
    this.reset?.();
    this.attract?.();
    this._attractPanel();
  }

  _setLevel(v) {
    this.level = v;
    const d = this.app.store.data;
    d.gameLevel = { ...(d.gameLevel || {}), [this.game.id]: v };
    this.app.store.save();
    this.intro();
  }

  _setHand(hand) {
    const d = this.app.store.data;
    d.gameHand = { ...(d.gameHand || {}), [this.game.id]: hand };
    this.app.store.save();
    this.intro();
  }

  _setSong(id) {
    const d = this.app.store.data;
    d.gameSong = { ...(d.gameSong || {}), [this.game.id]: id };
    this.app.store.save();
    this.intro();
  }

  _attractPanel() {
    const lv = this.game.levels[this.level];
    const song = this.songLevel ? this.songDef : null;
    this.stage.showPanel(
      h('div', { class: 'ar-card' },
        h('p', { class: 'ar-eyebrow' }, `Level ${this.level + 1}: ${lv.name}`),
        h('h2', { class: 'ar-title' }, song ? song.title : this.game.title),
        song ? h('p', { class: 'ar-song-by' }, `${this.game.title} · ${song.composer}`) : null,
        h('p', { class: 'ar-how' }, song ? (this.game.songHow || this.game.how || this.game.summary) : (this.game.how || this.game.summary)),
        h('h3', { class: 'ar-fame-h' }, 'Hall of Fame'),
        fameTable(this.app.store, this.game.id)));
  }

  begin() {
    this.stage.clearTweens();
    this.stage.hidePanel();
    this.stage.configure(this.stageOptions());
    this.reset?.();
    this.app.coach.begin({ topic: this.game.id });
    this.playing = true;
    this.start();
  }

  /** End a round. stats: [label, value] pairs shown on the results card. */
  finish({ score, detail, stats = [], passed, accuracy }) {
    if (!this.playing && !this.embedded) return;
    this.playing = false;
    this.sfx.stopAll();
    const summary = this.app.coach.current ? this.app.coach.end(this.app.coach.current) : null;
    const tips = this._tips(summary);
    if (this.embedded) {
      const acc = accuracy ?? summary?.accuracy ?? (passed ? 1 : 0);
      this.embedded.onDone?.({ score, accuracy: acc, passed: passed ?? acc >= (this.embedded.pass ?? 0.7), stats, summary, detail });
      return;
    }
    const { store, ui } = this.app;
    const prev = store.game(this.game.id, this.level) || 0;
    store.saveGame(this.game.id, this.level, score);
    const rank = score > 0 ? addFame(store, this.game.id, { score, level: `L${this.level + 1}` }) : -1;
    this.app.renderList();
    ui.prompt(detail);
    ui.status('');
    this.stage.showPanel(
      h('div', { class: 'ar-card' },
        h('p', { class: 'ar-eyebrow' }, rank === 0 ? 'New top score' : rank > 0 ? `Into the Hall of Fame at number ${rank + 1}` : score > prev && prev ? 'New personal best' : 'Round over'),
        h('p', { class: 'ar-big' }, score.toLocaleString()),
        stats.length ? h('dl', { class: 'ar-stats' }, ...stats.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
        tips ? h('p', { class: 'ar-tip' }, tips) : null,
        h('h3', { class: 'ar-fame-h' }, 'Hall of Fame'),
        fameTable(store, this.game.id, { highlight: rank })));
    ui.foot(
      h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.begin() }, 'Play again'),
      h('button', { class: 'btn', onclick: () => { ui.prompt(this.game.summary); this.intro(); } }, 'Change level'),
      this.songLevel ? h('a', { class: 'btn quiet', href: `#/songs/${this.songId}` }, `Open ${this.songDef?.title || 'the song'}`) : null,
    );
  }

  /** One line about the most common mix-up, from the coach. */
  _tips(summary) {
    const conf = summary?.confusions || [];
    if (!conf.length) return '';
    const count = new Map();
    for (const [want, got] of conf) count.set(`${want}>${got}`, (count.get(`${want}>${got}`) || 0) + 1);
    const [k, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    const [want, got] = k.split('>').map(Number);
    const a = noteName(want, { octave: true }), b = noteName(got, { octave: true });
    return n > 1 ? `Watch out: you played ${b} for ${a} ${n === 2 ? 'twice' : `${n} times`}.` : `Watch out: you played ${b} when the note was ${a}.`;
  }

  tick(dt) {
    const d = Math.min(dt, 0.1);
    this.stage?.update(d);
    this.step?.(d);
  }

  noteOff() {}
  pedal() {}

  /** setTimeout that is cleared automatically when the game exits. */
  after(sec, fn) {
    this._timers ||= new Set();
    const id = setTimeout(() => { this._timers.delete(id); fn(); }, sec * 1000);
    this._timers.add(id);
    return id;
  }

  clearTimers() { for (const id of this._timers || []) clearTimeout(id); this._timers?.clear(); }

  exit() {
    this.clearTimers();
    super.exit();
    this.sfx.stopAll();
    this.stage?.destroy();
    this.stage = null;
  }
}

/** The Hall of Fame page: every arcade game's top ten on this device. */
export class FameMode {
  constructor(app, games) { this.app = app; this.games = games; }
  enter() {
    const { ui, store } = this.app;
    ui.head({ kicker: 'Arcade', title: 'Hall of Fame' });
    ui.prompt('The top scores on this device, for everyone who plays here.');
    ui.status('');
    ui.big();
    ui.foot();
    ui.layer(h('div', { class: 'ar-fame-page' }, ...this.games.map((g) => h('section', { class: 'ar-card ar-fame-card' },
      h('h2', { class: 'ar-fame-title' }, g.title),
      fameTable(store, g.id, { limit: 10, empty: 'No scores yet.' }),
      h('a', { class: 'ar-play', href: `#/games/${g.id}` }, `Play ${g.title}`)))), { hideStaff: true });
  }
  noteOn() {}
  noteOff() {}
  tick() {}
  exit() { this.app.ui.layer(null); }
}
