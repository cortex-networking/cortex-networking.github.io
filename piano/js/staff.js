// Grand-staff renderer (SVG + SMuFL glyphs): a scrolling score and a static "column" view.
import { spell, keySigMap, KEY_SIGS } from './theory.js';

const NS = 'http://www.w3.org/2000/svg';
const GL = {
  gClef: '', fClef: '', brace: '', whole: '', half: '', black: '',
  dot: '', flag: { '0.5u': '', '0.5d': '', '0.25u': '', '0.25d': '' },
  acc: { '-1': '', '0': '', '1': '' },
  rest: { 4: '', 2: '', 1: '', 0.5: '', 0.25: '' },
  dyn: { p: '\uE520', f: '\uE522', ppp: '\uE52A', pp: '\uE52B', mp: '\uE52C', mf: '\uE52D', ff: '\uE52F', fff: '\uE530' },
};
const ACC_W = { '-1': 0.904, '0': 0.672, '1': 0.996 };
const STEP = { trebleTop: 38, trebleMid: 34, trebleBot: 30, bassTop: 26, bassMid: 22, bassBot: 18 };
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];
const GAP = 6;

const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
};
const baseDur = (d) => (d >= 4 - 1e-6 ? 4 : d >= 2 - 1e-6 ? 2 : d >= 1 - 1e-6 ? 1 : d >= 0.5 - 1e-6 ? 0.5 : 0.25);

export class Staff {
  constructor(svg) {
    this.svg = svg;
    this.staves = 'grand';
    this.key = 'C';
    this.time = null;
    this.score = null;
    this.column = null;
    this.noteEls = new Map();
    this.chordEls = [];
    this.beat = 0;
    this.ppbScale = 1;
    this.uid = Math.random().toString(36).slice(2, 7);
    new ResizeObserver(() => this.layout()).observe(svg);
  }

  configure({ staves = 'grand', key = 'C', time = null } = {}) {
    this.staves = staves; this.key = key; this.time = time;
    this.layout();
  }

  clefFor(e) {
    if (this.staves === 'treble') return 'treble';
    if (this.staves === 'bass') return 'bass';
    if (e.hand === 'R') return 'treble';
    if (e.hand === 'L') return 'bass';
    return e.midi >= 60 ? 'treble' : 'bass';
  }

  y(step, clef) {
    const sp = this.sp;
    return clef === 'treble'
      ? this.tTop + (STEP.trebleTop - step) * sp / 2
      : this.bTop + (STEP.bassTop - step) * sp / 2;
  }

  layout() {
    const w = this.svg.clientWidth || 800, h = this.svg.clientHeight || 300;
    if (w < 10 || h < 10) return;
    this.w = w; this.h = h;
    const grand = this.staves === 'grand';
    const units = grand ? 4.6 + 4 + GAP + 4 + 4.6 : 5.6 + 4 + 6;
    const sp = (this.sp = Math.max(5, Math.min(15, h / units, w / 28)));
    const totalH = (grand ? 4 + GAP + 4 : 4) * sp;
    const top = (h - totalH) / 2 + (grand ? 0 : -0.6 * sp);
    if (this.staves === 'bass') { this.bTop = top; this.tTop = top - (4 + GAP) * sp; }
    else { this.tTop = top; this.bTop = top + (4 + GAP) * sp; }
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.textContent = '';
    const defs = el('defs', {}, this.svg);
    // panel geometry
    this.xBrace = 0.9 * sp;
    this.xClef = (grand ? 2.1 : 1.0) * sp;
    const nSig = Math.abs(KEY_SIGS[this.key] ?? 0);
    this.xKey = this.xClef + 3.3 * sp;
    this.xTime = this.xKey + nSig * 1.05 * sp + (nSig ? 0.5 * sp : 0);
    this.panelW = this.xTime + (this.time ? 2.6 * sp : 0) + 1.6 * sp;
    this.headX = this.panelW + 3.8 * sp;
    const clipId = `clip-${this.uid}`;
    const clip = el('clipPath', { id: clipId }, defs);
    el('rect', { x: this.panelW + 1.2 * sp, y: 0, width: w - this.panelW, height: h }, clip);

    this.gLines = el('g', { class: 'st-lines' }, this.svg);
    this.gZone = el('g', { class: 'st-zone' }, this.svg);
    this.gScrollClip = el('g', { 'clip-path': `url(#${clipId})` }, this.svg);
    this.gScroll = el('g', { class: 'st-scroll' }, this.gScrollClip);
    this.gPanel = el('g', { class: 'st-panel' }, this.svg);
    this.gCol = el('g', { class: 'st-col' }, this.svg);
    this._drawStaff();
    if (this.score) this._drawScore();
    if (this.column) this._drawColumn();
  }

  _staffList() {
    return this.staves === 'grand' ? ['treble', 'bass'] : [this.staves];
  }

  _drawStaff() {
    const sp = this.sp, fs = 4 * sp, w = this.w;
    const x0 = this.staves === 'grand' ? this.xBrace + 0.5 * sp : 0.4 * sp;
    for (const clef of this._staffList()) {
      const top = clef === 'treble' ? this.tTop : this.bTop;
      for (let i = 0; i < 5; i++) {
        el('line', { x1: x0, x2: w, y1: top + i * sp, y2: top + i * sp, 'stroke-width': Math.max(1, 0.13 * sp) }, this.gLines);
      }
      const glyph = clef === 'treble' ? GL.gClef : GL.fClef;
      const gy = clef === 'treble' ? top + 3 * sp : top + sp;
      this._glyph(this.gPanel, glyph, this.xClef, gy, fs);
      // key signature
      const n = KEY_SIGS[this.key] ?? 0;
      const steps = (n > 0 ? SHARP_STEPS : FLAT_STEPS).slice(0, Math.abs(n)).map((s) => (clef === 'bass' ? s - 14 : s));
      steps.forEach((s, i) => this._glyph(this.gPanel, GL.acc[n > 0 ? 1 : -1], this.xKey + i * 1.05 * sp, this.y(s, clef), fs));
      if (this.time) {
        const [a, b] = this.time;
        this._digits(String(a), this.xTime, top + sp, fs);
        this._digits(String(b), this.xTime, top + 3 * sp, fs);
      }
    }
    if (this.staves === 'grand') {
      const yTop = this.tTop, yBot = this.bTop + 4 * sp;
      el('line', { x1: x0, x2: x0, y1: yTop, y2: yBot, 'stroke-width': Math.max(1, 0.16 * sp) }, this.gLines);
      const scale = (yBot - yTop) / (4 * sp);
      const t = el('text', { class: 'glyph', 'font-size': fs, transform: `translate(${this.xBrace - 0.15 * sp},${yBot}) scale(${Math.min(2, scale * 0.42)},${scale})` }, this.gPanel);
      t.textContent = GL.brace;
    }
    // playhead zone
    const zTop = (this.staves === 'bass' ? this.bTop : this.tTop) - 2.5 * sp;
    const zBot = (this.staves === 'treble' ? this.tTop : this.bTop) + 6.5 * sp;
    this.zone = el('rect', { x: this.headX - 1.25 * sp, y: zTop, width: 2.5 * sp, height: zBot - zTop, rx: 0.6 * sp }, this.gZone);
    this.gZone.style.display = this.score && this.showZone !== false ? '' : 'none';
  }

  _digits(str, x, y, fs) {
    const t = this._glyph(this.gPanel, [...str].map((c) => String.fromCharCode(0xe080 + +c)).join(''), x, y, fs);
    return t;
  }

  _glyph(parent, ch, x, y, fs, cls = 'glyph') {
    const t = el('text', { x, y, 'font-size': fs, class: cls }, parent);
    t.textContent = ch;
    return t;
  }

  // ---------- scrolling score ----------
  /** Draw a score. opts: { ppb (in staff spaces), showZone, dimHands: ['L'] } */
  setScore(score, opts = {}) {
    this.score = score;
    this.scoreOpts = opts;
    this.column = null;
    this.configure({ staves: opts.staves || 'grand', key: score.key, time: opts.hideTime ? null : score.time });
  }

  clearScore() { this.score = null; this.noteEls.clear(); this.chordEls = []; this.layout(); }

  get ppb() {
    const notes = this.score ? this.score.notes : [];
    const minDur = notes.reduce((m, e) => Math.min(m, e.d), 1);
    const per = this.scoreOpts?.ppb ?? Math.max(8, 4.6 / Math.max(0.25, minDur));
    return per * this.sp;
  }

  _drawScore() {
    const sp = this.sp, ppb = this.ppb, score = this.score;
    this.noteEls.clear();
    this.chordEls = [];
    this.gZone.style.display = this.scoreOpts.showZone === false ? 'none' : '';
    const hasAcc = new Set();
    // group into chords: same t, same hand, same duration, same clef
    const groups = new Map();
    for (const e of score.events) {
      const clef = this.clefFor(e);
      const k = e.rest ? `r${e.t}${e.hand}${Math.random()}` : `${e.t.toFixed(4)}|${e.hand}|${e.d}|${clef}`;
      if (!groups.has(k)) groups.set(k, { t: e.t, d: e.d, hand: e.hand, clef, rest: !!e.rest, notes: [] });
      groups.get(k).notes.push(e);
    }
    const beamOf = this._beams([...groups.values()], score, ppb);
    const upOf = new Map();
    for (const g of groups.values()) {
      const x = g.t * ppb;
      if (g.rest) { this._rest(this.gScroll, x, g.d, g.clef); continue; }
      const dim = this.scoreOpts.dimHands && this.scoreOpts.dimHands.includes(g.hand);
      const b = beamOf.get(g);
      const res = this._chord(this.gScroll, g.notes, x, g.d, g.clef, {
        finger: !this.scoreOpts.hideFingers, cls: dim ? 'other' : '',
        ...(b ? { up: b.up, stemEnd: b.yAt(b.stemX(g)), beamed: true } : {}),
      });
      if (res.hasAcc) hasAcc.add(g.t.toFixed(4));
      res.g.dataset.t = g.t;
      this.chordEls.push({ t: g.t, hand: g.hand, g: res.g, notes: g.notes });
      res.noteGroups.forEach((ng, i) => {
        this.noteEls.set(g.notes[i].i, ng);
        upOf.set(g.notes[i].i, { up: baseDur(g.d) < 4 ? res.up : null, clef: g.clef, headW: res.headW });
      });
    }
    for (const b of new Set(beamOf.values())) this._drawBeam(b);
    this._ties(score, ppb, upOf);
    this._dynamics(score, ppb);
    // barlines
    const yTop = this.staves === 'bass' ? this.bTop : this.tTop;
    const yBot = (this.staves === 'treble' ? this.tTop : this.bTop) + 4 * sp;
    for (const b of score.barlines) {
      const x = b * ppb - (hasAcc.has(b.toFixed(4)) ? 2.6 : 1.7) * sp;
      el('line', { class: 'barline', x1: x, x2: x, y1: yTop, y2: yBot, 'stroke-width': Math.max(1, 0.16 * sp) }, this.gScroll);
    }
    const xe = score.length * ppb - 1.2 * sp;
    if (!this.scoreOpts.noEnd) el('line', { class: 'barline', x1: xe - 0.9 * sp, x2: xe - 0.9 * sp, y1: yTop, y2: yBot, 'stroke-width': Math.max(1, 0.16 * sp) }, this.gScroll);
    if (!this.scoreOpts.noEnd) el('rect', { class: 'bar-end', x: xe - 0.5 * sp, y: yTop, width: 0.5 * sp, height: yBot - yTop }, this.gScroll);
    this.setBeat(this.beat);
  }

  /** Find beam groups (eighths/sixteenths within a beat) and their beam lines. */
  _beams(groups, score, ppb) {
    const out = new Map();
    const time = score.time || [4, 4];
    const unit = time[1] === 8 ? 1.5 : 1;
    const bars = score.barlines || [];
    const bpb = score.bpb || 4;
    const barStart = (t) => {
      let s = bars.length ? bars[0] - bpb : 0;
      for (const b of bars) { if (b <= t + 1e-6) s = b; else break; }
      return s;
    };
    const streams = new Map();
    for (const g of [...groups].sort((a, b) => a.t - b.t)) {
      if (g.rest) continue;
      const k = `${g.hand}|${g.clef}`;
      if (!streams.has(k)) streams.set(k, []);
      streams.get(k).push(g);
    }
    for (const list of streams.values()) {
      let run = [];
      const flush = () => { if (run.length > 1) this._beamLine(run, ppb, out); run = []; };
      for (const g of list) {
        if (baseDur(g.d) > 0.5) { flush(); continue; }
        const prev = run[run.length - 1];
        const bs = barStart(g.t);
        const unitIdx = Math.floor((g.t - bs + 1e-6) / unit);
        if (prev && (Math.abs(prev.t + prev.d - g.t) > 1e-6 || prev._bar !== bs || prev._unit !== unitIdx)) flush();
        g._bar = bs; g._unit = unitIdx;
        run.push(g);
      }
      flush();
    }
    return out;
  }

  _beamLine(run, ppb, out) {
    const sp = this.sp, headW = 1.18 * sp;
    const clef = run[0].clef;
    const mid = clef === 'treble' ? STEP.trebleMid : STEP.bassMid;
    const info = run.map((g) => {
      const steps = g.notes.map((n) => spell(n.midi, this.key, n.prefer).step);
      return { g, lo: Math.min(...steps), hi: Math.max(...steps) };
    });
    const all = info.flatMap((i) => [i.lo, i.hi]);
    const far = all.reduce((a, s) => (Math.abs(s - mid) > Math.abs(a - mid) ? s : a), all[0]);
    const up = far < mid || (far === mid && all.reduce((a, b) => a + b, 0) / all.length < mid);
    const stemX = (g) => (up ? g.t * ppb + headW - 0.06 * sp : g.t * ppb + 0.06 * sp);
    const tip = (i) => (up ? this.y(i.hi, clef) - 3.5 * sp : this.y(i.lo, clef) + 3.5 * sp);
    const x1 = stemX(run[0]), x2 = stemX(run[run.length - 1]);
    const y1 = tip(info[0]);
    const dy = Math.max(-sp, Math.min(sp, tip(info[info.length - 1]) - y1));
    const slope = x2 > x1 ? dy / (x2 - x1) : 0;
    let shift = 0;
    for (const i of info) {
      const x = stemX(i.g);
      const yLine = y1 + slope * (x - x1);
      const limit = up ? this.y(i.hi, clef) - 2.8 * sp : this.y(i.lo, clef) + 2.8 * sp;
      const over = up ? yLine - limit : limit - yLine;
      if (over > shift) shift = over;
    }
    const base = y1 + (up ? -shift : shift);
    const beam = { up, run, stemX, yAt: (x) => base + slope * (x - x1), x1, x2 };
    run.forEach((g) => out.set(g, beam));
  }

  _drawBeam(b) {
    const sp = this.sp, th = 0.5 * sp, gap = 0.75 * sp;
    const dir = b.up ? 1 : -1; // beams grow toward the noteheads
    const dim = this.scoreOpts.dimHands && this.scoreOpts.dimHands.includes(b.run[0].hand);
    const g = el('g', { class: `beam${dim ? ' other' : ''}` }, this.gScroll);
    const seg = (xa, xb, level) => {
      const off = level * gap * dir;
      const ya = b.yAt(xa) + off, yb = b.yAt(xb) + off;
      el('polygon', { points: `${xa},${ya} ${xb},${yb} ${xb},${yb + th * dir} ${xa},${ya + th * dir}` }, g);
    };
    const w = Math.max(1, 0.12 * sp) / 2;
    seg(b.x1 - w, b.x2 + w, 0);
    const run = b.run;
    for (let i = 0; i < run.length; i++) {
      if (baseDur(run[i].d) > 0.25) continue;
      const x = b.stemX(run[i]);
      const next = run[i + 1], prev = run[i - 1];
      if (next && baseDur(next.d) <= 0.25) seg(x - w, b.stemX(next) + w, 1);
      else if (!(prev && baseDur(prev.d) <= 0.25)) {
        if (prev) seg(x - 1.1 * sp, x + w, 1); else seg(x - w, x + 1.1 * sp, 1);
      }
    }
  }

  _ties(score, ppb, upOf) {
    const sp = this.sp;
    for (const e of score.events) {
      if (!e.tieTo) continue;
      const a = upOf.get(e.i);
      const ng = this.noteEls.get(e.i);
      if (!a || !ng || !upOf.get(e.tieTo.i)) continue;
      const s = spell(e.midi, this.key, e.prefer);
      const y = this.y(s.step, a.clef);
      const mid = a.clef === 'treble' ? STEP.trebleMid : STEP.bassMid;
      const below = a.up === null ? s.step < mid : a.up;
      const dir = below ? 1 : -1;
      const xs = e.t * ppb + a.headW + 0.12 * sp, xe = e.tieTo.t * ppb - 0.12 * sp;
      const ys = y + dir * 0.55 * sp;
      const len = Math.max(sp, xe - xs);
      const hgt = dir * Math.min(0.95 * sp, 0.3 * sp + 0.035 * len);
      const mx = (xs + xe) / 2;
      el('path', {
        class: 'tie',
        d: `M${xs},${ys} Q${mx},${ys + hgt * 2} ${xe},${ys} Q${mx},${ys + (hgt - dir * 0.24 * sp) * 2} ${xs},${ys} Z`,
      }, ng);
    }
  }

  _dynamics(score, ppb) {
    const sp = this.sp;
    const marks = score.marks || [];
    const rh = new Set(marks.filter((m) => m.hand === 'R').map((m) => `${m.t}|${m.dyn}`));
    for (const m of marks) {
      // one mark between the staves serves both hands, as in piano music
      if (m.hand === 'L' && this.staves === 'grand' && rh.has(`${m.t}|${m.dyn}`)) continue;
      const clef = this.clefFor({ hand: m.hand, midi: 60 });
      const top = clef === 'treble' ? this.tTop : this.bTop;
      const y = top + 4 * sp + (clef === 'treble' ? (this.staves === 'grand' ? 2.6 : 3.0) : 4.6) * sp;
      const glyph = GL.dyn[m.dyn];
      if (glyph) this._glyph(this.gScroll, glyph, m.t * ppb - 0.3 * sp, y, 4 * sp, 'glyph dyn');
    }
  }

  /** Add note events to the existing scroll layer (used by games). Returns chord groups. */
  append(events, cls = '') {
    const out = [];
    for (const e of events) {
      if (this.score && !this.score.events.includes(e)) this.score.events.push(e);
      const res = this._chord(this.gScroll, [e], e.t * this.ppb, e.d, this.clefFor(e), { cls });
      this.noteEls.set(e.i, res.noteGroups[0]);
      out.push(res.g);
    }
    return out;
  }

  /** Scroll so that `beat` sits on the playhead. */
  setBeat(beat) {
    this.beat = beat;
    if (!this.gScroll) return;
    const tx = this.headX - 0.59 * this.sp - beat * this.ppb;
    this.gScroll.setAttribute('transform', `translate(${tx.toFixed(2)},0)`);
  }

  /** x position (in screen px) of a beat, for games. */
  xOfBeat(beat) { return this.headX - 0.59 * this.sp + (beat - this.beat) * this.ppb; }

  noteClass(i, cls, on = true) {
    const g = this.noteEls.get(i);
    if (g) g.classList.toggle(cls, on);
  }

  chordClassAt(t, cls, on = true, hand) {
    for (const c of this.chordEls) {
      if (Math.abs(c.t - t) < 1e-6 && (!hand || c.hand === hand)) c.g.classList.toggle(cls, on);
    }
  }

  clearClasses(...cls) {
    this.gScroll?.querySelectorAll('.chord, .nh').forEach((n) => n.classList.remove(...cls));
  }

  // ---------- static column ----------
  /** groups: [{ midis: [...], cls, prefer }] drawn as whole notes at the centre. */
  showColumn(groups, opts = {}) {
    this.column = { groups, opts };
    const staves = opts.staves || 'grand', key = opts.key || 'C', time = opts.time || null;
    if (this.score || staves !== this.staves || key !== this.key || String(time) !== String(this.time) || !this.gCol) {
      this.score = null; this.staves = staves; this.key = key; this.time = time;
      this.layout();
      return;
    }
    this._drawColumn();
  }

  _drawColumn() {
    if (!this.gCol) return;
    this.gCol.textContent = '';
    const { groups, opts } = this.column;
    const cx = opts.x ?? (this.panelW + (this.w - this.panelW) * 0.42);
    groups.forEach((grp, gi) => {
      const byClef = { treble: [], bass: [] };
      for (const m of grp.midis) byClef[this.clefFor({ midi: m })].push({ midi: m, i: `c${gi}-${m}` });
      for (const clef of ['treble', 'bass']) {
        if (!byClef[clef].length) continue;
        const x = cx + (grp.dx || 0) * this.sp;
        this._chord(this.gCol, byClef[clef], x, 4, clef, { cls: grp.cls || '', prefer: grp.prefer });
      }
    });
  }

  clearColumn() { this.column = { groups: [], opts: {} }; this.gCol && (this.gCol.textContent = ''); }

  // ---------- note drawing ----------
  _rest(parent, x, d, clef) {
    const sp = this.sp, base = baseDur(d);
    const top = clef === 'treble' ? this.tTop : this.bTop;
    const y = base === 4 ? top + sp : top + 2 * sp;
    this._glyph(parent, GL.rest[base], x, y, 4 * sp, 'glyph rest');
  }

  _chord(parent, notes, x, d, clef, opts = {}) {
    const sp = this.sp, fs = 4 * sp;
    const g = el('g', { class: `chord ${opts.cls || ''}`.trim() }, parent);
    const items = notes.map((n) => ({ n, s: spell(n.midi, this.key, opts.prefer ?? n.prefer) }));
    const order = items.map((it, idx) => ({ ...it, idx })).sort((a, b) => a.s.step - b.s.step);
    const base = baseDur(d);
    const dotted = Math.abs(d - base * 1.5) < 1e-6;
    const head = base === 4 ? GL.whole : base === 2 ? GL.half : GL.black;
    const headW = (base === 4 ? 1.688 : 1.18) * sp;
    const mid = clef === 'treble' ? STEP.trebleMid : STEP.bassMid;
    const steps = order.map((o) => o.s.step);
    const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
    const far = Math.abs(steps[0] - mid) > Math.abs(steps[steps.length - 1] - mid) ? steps[0] : steps[steps.length - 1];
    const up = opts.up ?? (steps.length > 1 ? far < mid : avg < mid);
    // seconds displacement
    const disp = new Array(order.length).fill(0);
    if (up) { for (let i = 1; i < order.length; i++) if (steps[i] - steps[i - 1] === 1 && !disp[i - 1]) disp[i] = 1; }
    else { for (let i = order.length - 2; i >= 0; i--) if (steps[i + 1] - steps[i] === 1 && !disp[i + 1]) disp[i] = -1; }
    const noteGroups = new Array(items.length);
    let hasAcc = false;
    let accCol = 0, lastAccStep = 999;
    const lw = Math.max(1, 0.16 * sp);
    for (let k = order.length - 1; k >= 0; k--) {
        const o = order[k];
        const y = this.y(o.s.step, clef);
        const hx = x + disp[k] * (headW - 0.12 * sp);
        const ng = el('g', { class: 'nh' }, g);
        noteGroups[o.idx] = ng;
        // ledger lines
        const ledgers = [];
        const [bot, topL] = clef === 'treble' ? [STEP.trebleBot, STEP.trebleTop] : [STEP.bassBot, STEP.bassTop];
        for (let s = bot - 2; s >= o.s.step; s -= 2) ledgers.push(s);
        for (let s = topL + 2; s <= o.s.step; s += 2) ledgers.push(s);
        for (const s of ledgers) {
          const ly = this.y(s, clef);
          el('line', { class: 'ledger', x1: hx - 0.45 * sp, x2: hx + headW + 0.45 * sp, y1: ly, y2: ly, 'stroke-width': lw }, ng);
        }
        this._glyph(ng, head, hx, y, fs, 'glyph head');
        if (o.s.accidental !== null && o.s.accidental !== undefined) {
          hasAcc = true;
          accCol = lastAccStep - o.s.step < 6 ? accCol + 1 : 0;
          lastAccStep = o.s.step;
          const a = String(o.s.accidental);
          const minX = Math.min(x, x + Math.min(...disp) * headW);
          this._glyph(ng, GL.acc[a], minX - (0.3 + ACC_W[a] + accCol * 1.1) * sp, y, fs, 'glyph acc');
        }
        if (dotted) {
          const onLine = (o.s.step - (clef === 'treble' ? STEP.trebleBot : STEP.bassBot)) % 2 === 0;
          const maxX = x + headW + (Math.max(...disp) > 0 ? headW : 0);
          this._glyph(ng, GL.dot, maxX + 0.35 * sp, y - (onLine ? sp / 2 : 0), fs, 'glyph dot');
        }
    }
    // stem + flag
    if (base < 4) {
      const yLo = this.y(steps[0], clef), yHi = this.y(steps[steps.length - 1], clef);
      const yMid = this.y(mid, clef);
      const sx = up ? x + headW - 0.06 * sp : x + 0.06 * sp;
      let y1, y2;
      if (up) { y1 = yLo - 0.168 * sp; y2 = Math.min(yHi - 3.5 * sp, yMid); }
      else { y1 = yHi + 0.168 * sp; y2 = Math.max(yLo + 3.5 * sp, yMid); }
      if (opts.stemEnd !== undefined) y2 = opts.stemEnd;
      el('line', { class: 'stem', x1: sx, x2: sx, y1, y2, 'stroke-width': Math.max(1, 0.12 * sp) }, g);
      if (base < 1 && !opts.beamed) this._glyph(g, GL.flag[`${base}${up ? 'u' : 'd'}`], sx - 0.06 * sp, y2, fs, 'glyph flag');
      g.dataset.stem = up ? 'up' : 'down';
      this._fingers(g, order, x, headW, clef, up, y2);
    } else {
      this._fingers(g, order, x, headW, clef, null, null);
    }
    return { g, noteGroups, hasAcc, up, headW };
  }

  _fingers(g, order, x, headW, clef, up, stemEnd) {
    const fingers = order.filter((o) => o.n.finger);
    if (!fingers.length) return;
    const sp = this.sp;
    const above = order[0].n.hand !== 'L';
    const staffTop = clef === 'treble' ? this.tTop : this.bTop;
    const staffBot = staffTop + 4 * sp;
    const ys = order.map((o) => this.y(o.s.step, clef));
    let y;
    if (above) {
      const top = Math.min(...ys, up ? stemEnd : Infinity);
      y = Math.min(staffTop - 0.8 * sp, top - 1.1 * sp);
    } else {
      const bot = Math.max(...ys, up === false ? stemEnd : -Infinity);
      y = Math.max(staffBot + 1.9 * sp, bot + 2.1 * sp);
    }
    const list = above ? [...fingers].reverse() : fingers;
    list.forEach((o, i) => {
      const t = el('text', { x: x + headW / 2, y: y + (above ? -i : i) * 1.25 * sp, class: 'finger', 'font-size': 1.35 * sp, 'text-anchor': 'middle' }, g);
      t.textContent = o.n.finger;
    });
  }
}
