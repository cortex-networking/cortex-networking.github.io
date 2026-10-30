// On-screen piano keyboard: rendering, marks (cues, hits, misses) and pointer input.
import { isBlack, noteName } from './theory.js';

const BLACK_SHIFT = { 1: -0.1, 3: 0.1, 6: -0.13, 8: 0, 10: 0.13 };
const PRESETS = { 25: [48, 72], 37: [48, 84], 49: [36, 84], 61: [36, 96], 76: [28, 103], 88: [21, 108] };

const whiteDown = (m) => { while (isBlack(m)) m--; return m; };
const whiteUp = (m) => { while (isBlack(m)) m++; return m; };

export class Keyboard {
  constructor(el, input) {
    this.el = el;
    this.input = input;
    this.lo = 0; this.hi = 0;
    this.preferred = 'auto';
    this.labels = 'c';
    this.needLo = 60; this.needHi = 72;
    this.keys = new Map();
    this.timers = new Map();
    this.pointers = new Map();
    this.wrap = document.createElement('div');
    this.wrap.className = 'kb-keys';
    el.append(this.wrap);
    this._pointer();
    new ResizeObserver(() => this.fit()).observe(el);
  }

  setPreferred(p) { this.preferred = p; this.fit(true); }
  setLabels(mode) { this.labels = mode; this.render(); }

  /** Make sure these notes are on screen (and center the auto range on them). */
  need(lo, hi = lo) {
    this.needLo = Math.min(lo, hi); this.needHi = Math.max(lo, hi);
    this.fit();
  }

  fit(force = false) {
    const w = this.el.clientWidth || 900;
    let lo, hi;
    if (PRESETS[this.preferred]) [lo, hi] = PRESETS[this.preferred];
    else {
      const per = w < 520 ? 30 : w < 900 ? 34 : 38;
      const whites = Math.max(8, Math.min(52, Math.floor(w / per)));
      const octs = Math.max(1, Math.floor((whites - 1) / 7));
      const center = (this.needLo + this.needHi) / 2;
      lo = 12 * Math.round((center - 6 * octs) / 12);
      hi = lo + 12 * octs;
      let extra = whites - (7 * octs + 1);
      while (extra-- > 0) hi = whiteUp(hi + 1);
    }
    lo = Math.min(whiteDown(lo), whiteDown(this.needLo));
    hi = Math.max(whiteUp(hi), whiteUp(this.needHi));
    lo = Math.max(21, lo); hi = Math.min(108, hi);
    if (force || lo !== this.lo || hi !== this.hi) { this.lo = lo; this.hi = hi; this.render(); }
  }

  render() {
    const marks = new Map();
    for (const [m, k] of this.keys) {
      const keep = [...k.classList].filter((c) => !['key', 'white', 'black'].includes(c));
      if (keep.length) marks.set(m, keep);
    }
    this.wrap.textContent = '';
    this.keys.clear();
    const whites = [];
    for (let m = this.lo; m <= this.hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = 100 / whites.length;
    this.wrap.style.setProperty('--ww', `${ww}%`);
    let wi = 0;
    for (let m = this.lo; m <= this.hi; m++) {
      const k = document.createElement('div');
      k.dataset.midi = m;
      const black = isBlack(m);
      k.className = `key ${black ? 'black' : 'white'}`;
      if (black) {
        const shift = BLACK_SHIFT[m % 12] || 0;
        k.style.left = `${(wi + shift) * ww}%`;
      } else {
        k.style.setProperty('--i', wi);
        wi++;
      }
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      if (!black && (this.labels === 'all' || (this.labels === 'c' && m % 12 === 0))) {
        lbl.textContent = m % 12 === 0 ? noteName(m, { octave: true }) : noteName(m);
      }
      const fg = document.createElement('span');
      fg.className = 'fg';
      k.append(fg, lbl);
      (marks.get(m) || []).forEach((c) => k.classList.add(c));
      this.wrap.append(k);
      this.keys.set(m, k);
    }
    this.el.classList.toggle('narrow', ww > 4.5);
  }

  mark(midi, cls, on = true) {
    const k = this.keys.get(midi);
    if (k) k.classList.toggle(cls, on);
  }

  flash(midi, cls, ms = 320) {
    const k = this.keys.get(midi);
    if (!k) return;
    const id = `${midi}:${cls}`;
    clearTimeout(this.timers.get(id));
    k.classList.remove(cls);
    void k.offsetWidth;
    k.classList.add(cls);
    this.timers.set(id, setTimeout(() => k.classList.remove(cls), ms));
  }

  clear(...classes) {
    for (const k of this.keys.values()) k.classList.remove(...classes);
  }

  setFinger(midi, finger) {
    const k = this.keys.get(midi);
    if (k) k.querySelector('.fg').textContent = finger || '';
  }

  clearFingers() { for (const k of this.keys.values()) k.querySelector('.fg').textContent = ''; }

  /** Brief light run across the keys when a keyboard is plugged in. */
  ripple() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.el.classList.remove('ripple');
    void this.el.offsetWidth;
    this.el.classList.add('ripple');
    setTimeout(() => this.el.classList.remove('ripple'), 1400);
  }

  _pointer() {
    const keyAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const k = el && el.closest && el.closest('.key');
      return k && this.wrap.contains(k) ? k : null;
    };
    const velOf = (k, y) => {
      const r = k.getBoundingClientRect();
      return 0.45 + 0.55 * Math.min(1, Math.max(0, (y - r.top) / r.height));
    };
    this.wrap.addEventListener('pointerdown', (e) => {
      const k = keyAt(e.clientX, e.clientY);
      if (!k) return;
      e.preventDefault();
      this.wrap.setPointerCapture(e.pointerId);
      const m = +k.dataset.midi;
      this.pointers.set(e.pointerId, m);
      this.input.press(m, velOf(k, e.clientY), 'screen');
    });
    this.wrap.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const k = keyAt(e.clientX, e.clientY);
      const prev = this.pointers.get(e.pointerId);
      const m = k ? +k.dataset.midi : null;
      if (m === prev) return;
      if (prev !== null) this.input.release(prev, 'screen');
      this.pointers.set(e.pointerId, m);
      if (m !== null) this.input.press(m, velOf(k, e.clientY), 'screen');
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const m = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (m !== null) this.input.release(m, 'screen');
    };
    this.wrap.addEventListener('pointerup', up);
    this.wrap.addEventListener('pointercancel', up);
    this.wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
