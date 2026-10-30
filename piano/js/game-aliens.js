// Aliens!: the Miracle's memory game. A flying saucer beams a short phrase onto the staff, note by
// note, while the aliens play it; the lit window in its hull shows which finger plays each note.
// Then you copy the phrase three times with less help each time: the red triangle, the lit key and
// the finger first; then the triangle and the finger; then from memory before the red bar on the
// right of the staff drains. Get most of the notes right first time and the aliens come out to
// celebrate.
import { ArcadeBase, GLYPH, svg, rand, pick, ease, clamp } from './arcade.js';
import { noteName, spell, isBlack } from './theory.js';
import { h } from './ui.js';

// Five-finger positions, lowest note first (index = degree). Right-hand finger = degree + 1 (thumb
// on the lowest note); left-hand finger = 5 - degree (pinky on the lowest note).
const POS = {
  cR: [60, 62, 64, 65, 67],   // C position, right hand: C4 to G4
  cL: [48, 50, 52, 53, 55],   // C position, left hand: C3 to G3
  gR: [67, 69, 71, 72, 74],   // G position, right hand: G4 to D5
  mcL: [53, 55, 57, 59, 60],  // Middle C position, left hand: F3 to C4, thumb on middle C
  aR: [69, 71, 72, 74, 76],   // A minor position, right hand: A4 to E5
};

// Phrase banks by length, in scale degrees of the position ("L3" = left hand, degree 3; a bare digit
// uses the level's only hand). Phrases move by step or skip and end on a stable note (degree 0, 2
// or 4), so they sound like music and are easier to remember than random notes.
const BANK = {
  steps: {
    3: ['0 1 2', '2 1 0', '4 3 2', '2 3 4', '0 1 0', '4 3 4'],
    4: ['3 2 1 0', '1 2 3 4', '1 0 1 2', '3 4 3 2', '2 1 1 0', '2 2 3 4'],
    5: ['0 1 2 3 4', '4 3 2 1 0', '2 1 0 1 2', '0 1 2 1 0', '4 3 2 3 4', '2 3 4 3 2', '2 2 1 1 0'],
    6: ['2 1 0 1 2 2', '0 0 1 2 1 0', '2 2 3 4 3 2', '1 2 3 2 1 0', '3 2 1 0 1 2', '4 3 2 1 1 0'],
    7: ['2 1 0 1 2 2 2', '0 1 2 3 2 1 0', '2 3 4 3 2 1 0', '4 3 2 1 2 3 4', '0 1 2 3 4 3 2', '2 2 3 4 4 3 2'],
  },
  skips: {
    3: ['0 2 4', '4 2 0', '1 3 2', '3 1 2', '0 4 2'],
    4: ['0 2 4 2', '4 2 1 0', '0 2 1 0', '2 4 3 2', '0 4 3 2', '1 3 2 0'],
    5: ['0 2 4 3 2', '4 2 0 1 2', '0 2 1 3 2', '0 4 2 1 0', '2 4 3 1 0', '4 3 1 2 0'],
    6: ['0 2 4 2 1 0', '4 2 3 1 2 0', '0 1 2 4 3 2', '2 0 2 4 3 2', '0 2 1 3 2 4'],
    7: ['0 2 4 2 3 1 0', '4 2 0 2 4 3 2', '0 2 1 3 2 1 0', '0 4 3 2 1 2 0', '0 1 2 0 2 3 4'],
  },
  // Middle C position: the tune passes between the hands through the shared middle C.
  middleC: {
    3: ['L1 L3 R0', 'L2 L3 R0', 'L4 L3 L1', 'R0 L3 R0', 'R1 R0 L1'],
    4: ['L3 R0 R1 R2', 'L1 L2 L3 R0', 'R1 R0 L3 R0', 'R2 R1 R0 L1'],
    5: ['R2 R1 R0 L3 R0', 'L2 L3 R0 R1 R2', 'R0 L3 L2 L3 R0', 'L1 L3 R0 R1 R2', 'R2 R1 R0 L3 L1'],
    6: ['R2 R1 R0 L3 L2 L1', 'L1 L2 L3 R0 R1 R2', 'R1 R0 L3 L2 L3 R0', 'R2 R2 R1 R0 L3 R0'],
    7: ['R2 R1 R0 L3 L2 L3 R0', 'L1 L2 L3 R0 R1 R2 R0', 'R4 R3 R2 R1 R0 L3 R0', 'L0 L1 L2 L3 R0 R1 R2'],
  },
  // Hands taking turns: call and answer between two C positions an octave apart.
  turns: {
    3: ['L4 R0 R2', 'L0 L2 R0', 'L0 L4 R0', 'R4 R2 L0'],
    4: ['R2 R0 L2 L0', 'L0 L4 R0 R4', 'L2 L0 R2 R0', 'R4 R2 L4 L2'],
    5: ['R2 R1 R0 L2 L0', 'L0 L1 L2 R1 R0', 'R0 R2 R4 L4 L0', 'L4 L3 L2 R1 R0'],
    6: ['R2 R1 R0 L2 L1 L0', 'L0 L1 L2 R0 R1 R2', 'R4 R3 R2 L4 L3 L2', 'L2 L1 L0 R2 R1 R0'],
    7: ['R2 R1 R0 L2 L1 L0 R0', 'L0 L2 L4 R0 R2 R4 R0', 'R4 R3 R2 R1 L2 L1 L0', 'L0 L1 L2 R0 R1 R2 R0'],
  },
};
BANK.mixed = Object.fromEntries([3, 4, 5, 6, 7].map((n) => [n, [...BANK.steps[n], ...BANK.skips[n]]]));

export const GAME = {
  id: 'aliens', title: 'Aliens!',
  summary: 'The memory game. The aliens play a short phrase; copy it with the right fingers, with less help each time.',
  how: 'The aliens beam a phrase onto the staff, and the lit window on their saucer shows the finger for each note. Copy it three times with less help each time, the last from memory before the red bar runs out. Get most notes right for a surprise.',
  skill: 'fingering',
  levels: [
    { name: 'Right hand, C position', staves: 'treble', hands: { R: POS.cR }, bank: 'steps' },
    { name: 'Left hand, C position', staves: 'bass', hands: { L: POS.cL }, bank: 'steps' },
    { name: 'Right hand, G position', staves: 'treble', hands: { R: POS.gR }, bank: 'steps' },
    { name: 'Middle C position', staves: 'grand', hands: { L: POS.mcL, R: POS.cR }, bank: 'middleC' },
    { name: 'Steps and skips', staves: 'treble', hands: { R: POS.cR }, bank: 'skips' },
    { name: 'A minor position', staves: 'treble', hands: { R: POS.aR }, bank: 'mixed' },
    { name: 'Hands take turns', staves: 'grand', hands: { L: POS.cL, R: POS.cR }, bank: 'turns' },
  ],
};

/*
 * Embedded params (lessons and the coach): new Game(app, GAME, { embedded: { ... } })
 *   phrases   array of phrases, each an array of MIDI numbers or { midi, finger, hand: 'L'|'R' }.
 *             Missing fingers come from the five-finger position: the lowest note of each hand is
 *             the right thumb (1) or the left pinky (5). Phrases spanning more than five white keys
 *             get no finger numbers unless given.
 *   hand      'L' or 'R' for plain MIDI phrases (default: L when every note is below middle C)
 *   staves    'treble' | 'bass' | 'grand' (default: from the hands used)
 *   reps      copies after the demo (default 3; the last one is from memory, against the clock)
 *   count     phrases to play (default: every given phrase, or 3 from the level's bank)
 *   pass      share of notes right first time needed to pass (default 0.7)
 *   surprise  share needed in one phrase for the aliens' surprise (default 0.8)
 *   tempo     seconds per note in the aliens' demo (default 0.85)
 *   time      seconds for the memory repetition (default 2.5 + 1.3 per note)
 *   text      prompt shown above the board
 */

const ALIEN_COLORS = ['#7fd3a6', '#f0c25a', '#8fb7de', '#ef8a73'];
const SPARK = 'M0,-1 Q0.16,-0.16 1,0 Q0.16,0.16 0,1 Q-0.16,0.16 -1,0 Q-0.16,-0.16 0,-1 Z';
const MOUTH = {
  smile: 'M-0.17,-0.74 Q0,-0.6 0.17,-0.74',
  frown: 'M-0.15,-0.66 Q0,-0.79 0.15,-0.66',
  open: 'M-0.15,-0.74 Q0,-0.48 0.15,-0.74 Q0,-0.68 -0.15,-0.74 Z',
};
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Game extends ArcadeBase {
  stageOptions() {
    const staves = this._staves();
    // headroom above the staff for the saucer; the grand staff trades a little of it for bigger notes
    return staves === 'grand'
      ? { staves, mTop: 5.5, mBot: 2.6, padTop: 0.04, padBot: 0.17, maxSp: 22 }
      : { staves, mTop: 7, mBot: 3.4, padTop: 0.04, padBot: 0.2, maxSp: 22 };
  }

  _staves() {
    const lv = this.lv;
    if (this.embedded?.staves) return this.embedded.staves;
    if (lv.phrases?.length) {
      const hands = new Set(lv.phrases.flatMap((p) => this._spec(p).map((n) => n.hand)));
      return hands.size > 1 ? 'grand' : hands.has('L') ? 'bass' : 'treble';
    }
    return lv.staves || 'treble';
  }

  reset() {
    const st = this.stage;
    this._clearQueue();
    this.clock = this.clock || 0;
    this.notes = [];
    this.decor = [];
    this.aliens = [];
    this.phase = 'idle';
    for (const k of ['hud', 'back', 'sprites', 'fx']) st.layers[k].textContent = '';
    this.noteG = svg('g', { class: 'al-notes' }, st.layers.sprites);
    this.alienG = svg('g', { class: 'al-aliens' }, st.layers.sprites);
    this.shipG = svg('g', {}, st.layers.sprites);
    this._scenery();
    this._makeBeam();
    this._makeCues();
    this._makeShip();
    this.ship.x = this._centerX(); this.ship.y = this._hoverY();
    this._clearKeys();
  }

  layout() {
    if (!this.ship) return;
    this._scenery();
    this.ship.art.setAttribute('transform', `scale(${this.u.toFixed(2)})`);
    for (const n of this.notes) this._drawNote(n);
    for (const n of this.decor) this._drawNote(n);
    for (const a of this.aliens) this._pose(a);
    this._cues();
    this._timeBar();
    this._hud();
    // the keyboard re-renders its keys on resize, which drops finger numbers
    if (this.fingersOn) this._after(0.05, () => this._fingerMap(this.fingersOn));
  }

  // ---------- a tiny scheduler in game time (paused with the game, cleared on reset) ----------
  _after(sec, fn) { this.queue.push({ t: sec, fn }); }
  _clearQueue() { this.queue = []; this.gen = (this.gen || 0) + 1; }
  _runQueue(dt) {
    if (!this.queue.length) return;
    const gen = this.gen, list = this.queue, keep = [];
    this.queue = [];
    for (const q of list) {
      if (this.gen !== gen) break;
      q.t -= dt;
      if (q.t <= 0) q.fn(); else keep.push(q);
    }
    if (this.gen === gen) this.queue = keep.concat(this.queue);
  }

  // ---------- geometry ----------
  _span() {
    const st = this.stage, sp = st.sp;
    return [st.noteLeft + 0.6 * sp, st.right - 3.4 * sp];
  }
  _centerX() { const [l, r] = this._span(); return (l + r) / 2; }
  _hoverY() { return Math.max(2.45 * this.u + 4, this.stage.staffTop - 2.3 * this.stage.sp - this.u); }
  _emitY() { return this.ship.py + 0.85 * this.u; }

  _noteX(n) {
    const [l, r] = this._span();
    if (n.f !== undefined) return l + n.f * (r - l);
    const count = Math.max(1, this.notes.length);
    const gap = Math.min(5.6 * this.stage.sp, (r - l) / count);
    return l + (r - l - gap * count) / 2 + (n.i + 0.5) * gap;
  }

  _staffBottom(clef) { const st = this.stage; return (clef === 'bass' ? st.bTop : st.tTop) + 4 * st.sp; }

  _anchorXY(a) {
    const st = this.stage, y = this._hoverY();
    if (a === 'away') return { x: st.w + 9 * this.u, y: -5 * this.u };
    if (a && a.i !== undefined) return { x: this._noteX(this.notes[a.i] || { i: a.i }), y };
    if (a && a.f !== undefined) { const [l, r] = this._span(); return { x: l + a.f * (r - l), y }; }
    return { x: this._centerX(), y };
  }

  // ---------- scenery: a few stars over the felt ----------
  _scenery() {
    const st = this.stage, sp = st.sp, g = st.layers.bg;
    g.textContent = '';
    const defs = svg('defs', {}, g);
    const lg = svg('linearGradient', { id: 'al-beam-grad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: '0%', 'stop-color': '#a8f0c8', 'stop-opacity': 0.62 }, lg);
    svg('stop', { offset: '100%', 'stop-color': '#8fb7de', 'stop-opacity': 0.12 }, lg);
    // seeded so the sky stays put across relayouts; kept out of the staff band
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = Math.round((st.w * st.h) / 7000);
    const bandTop = st.staffTop - 1.2 * sp, bandBot = st.staffBottom + 1.2 * sp;
    for (let i = 0; i < n; i++) {
      const x = rnd() * st.w, y = rnd() * st.h * 0.9, big = rnd() < 0.18;
      if (y > bandTop && y < bandBot) continue;
      svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: big ? 1.5 : 0.9, class: `al-star${big ? ' big' : ''} t${i % 5}` }, g);
    }
    this.trayY = st.h - st.h * st.opts.padBot * 0.5;
    svg('line', { x1: 0, x2: st.w, y1: this.trayY - 1.15 * sp, y2: this.trayY - 1.15 * sp, class: 'ar-tray' }, g);
    this.u = this._shipScale();
  }

  /**
   * Saucer size in px per unit: follows the staff, stays big enough to read its windows on a phone,
   * and never needs more headroom than there is above the staff.
   */
  _shipScale() {
    const st = this.stage;
    const room = (st.staffTop - 1.6 * st.sp - 4) / 3.35;
    return clamp(Math.min(Math.max(st.sp * 1.22, Math.min(st.w / 17, 22)), room), 11, 27);
  }

  // ---------- the saucer ----------
  _makeShip() {
    const g = svg('g', { class: 'al-ship' }, this.shipG);
    const a = svg('g', {}, g);
    svg('line', { x1: 0, y1: -1.64, x2: 0, y2: -2.12, class: 'al-antenna' }, a);
    const tipGlow = svg('circle', { cx: 0, cy: -2.22, r: 0.32, class: 'al-tip-glow' }, a);
    svg('circle', { cx: 0, cy: -2.22, r: 0.14, class: 'al-tip' }, a);
    // the pilot sits behind the glass
    const pilot = svg('g', { class: 'al-pilot' }, a);
    for (const s of [-1, 1]) {
      svg('path', { d: `M${0.2 * s},-1.42 L${0.36 * s},-1.6`, class: 'al-pilot-ant' }, pilot);
      svg('circle', { cx: 0.38 * s, cy: -1.62, r: 0.07, class: 'al-pilot-tip' }, pilot);
    }
    svg('ellipse', { cx: 0, cy: -0.98, rx: 0.6, ry: 0.52, class: 'al-pilot-head' }, pilot);
    const pupils = [-1, 1].map((s) => {
      svg('ellipse', { cx: 0.21 * s, cy: -1.04, rx: 0.15, ry: 0.18, class: 'al-eye' }, pilot);
      return svg('circle', { cx: 0.21 * s, cy: -1.02, r: 0.075, class: 'al-pupil' }, pilot);
    });
    const mouth = svg('path', { d: MOUTH.smile, class: 'al-mouth' }, pilot);
    svg('path', { d: 'M-1.55,-0.42 C-1.5,-2.1 1.5,-2.1 1.55,-0.42 Z', class: 'al-dome' }, a);
    svg('path', { d: 'M-1.08,-0.82 C-1.02,-1.36 -0.62,-1.62 -0.2,-1.68', class: 'al-glint' }, a);
    svg('ellipse', { cx: 0, cy: -0.38, rx: 2.05, ry: 0.4, class: 'al-deck' }, a);
    svg('ellipse', { cx: 0, cy: 0, rx: 3.2, ry: 0.8, class: 'al-hull' }, a);
    svg('path', { d: 'M-3.2,0 A3.2,0.8 0 0 0 3.2,0 Q0,0.34 -3.2,0 Z', class: 'al-hull-lo' }, a);
    svg('ellipse', { cx: 0, cy: 0, rx: 3.2, ry: 0.8, class: 'al-rim' }, a);
    // five windows, one per finger
    const wins = [0, 1, 2, 3, 4].map((i) => {
      const w = svg('g', { class: 'al-win', transform: `translate(${i - 2} -0.06)` }, a);
      svg('circle', { r: 0.62, class: 'al-win-glow' }, w);
      svg('circle', { r: 0.38, class: 'al-win-pane' }, w);
      const t = svg('text', { y: 0.2, 'text-anchor': 'middle', 'font-size': 0.56, class: 'al-win-num' }, w);
      t.textContent = String(i + 1);
      return { g: w, t };
    });
    svg('ellipse', { cx: 0, cy: 0.6, rx: 1.45, ry: 0.36, class: 'al-belly' }, a);
    svg('ellipse', { cx: 0, cy: 0.8, rx: 0.84, ry: 0.21, class: 'al-port' }, a);
    const hatch = svg('ellipse', { cx: 0, cy: 0.8, rx: 0.84, ry: 0.21, class: 'al-hatch' }, a);
    const lights = [];
    for (let i = 0; i < 9; i++) {
      const th = (0.1 + (0.8 * i) / 8) * Math.PI;
      lights.push(svg('circle', { cx: (2.98 * Math.cos(th)).toFixed(3), cy: (0.64 * Math.sin(th) + 0.04).toFixed(3), r: 0.1, class: 'al-light' }, a));
    }
    a.setAttribute('transform', `scale(${this.u.toFixed(2)})`);
    this.ship = {
      g, art: a, wins, hatch, lights, pupils, mouth, tipGlow,
      x: 0, y: 0, px: 0, py: 0, offX: 0, offY: 0, rot: 0, wob: 0, anchor: 'center', lightPhase: -1, winKey: '',
    };
    this._windows('R', null);
  }

  /** Light the window for a finger. Windows run in keyboard order: 1-5 for the right hand, 5-1 for the left. */
  _windows(hand, finger, mood = '') {
    const s = this.ship;
    if (!s) return;
    const key = `${hand}|${finger}|${mood}`;
    if (s.winKey === key) return;
    s.winKey = key;
    const labels = hand === 'L' ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
    s.wins.forEach((w, i) => {
      const lit = !mood && finger && labels[i] === finger;
      w.t.textContent = String(labels[i]);
      w.g.setAttribute('class', `al-win${lit ? ` lit ${hand === 'L' ? 'l' : 'r'}` : ''}${mood ? ` ${mood}` : ''}`);
      w.g.setAttribute('transform', `translate(${i - 2} -0.06) scale(${lit ? 1.42 : 1})`);
    });
  }

  _mouth(kind, hold = 0) {
    const s = this.ship;
    s.mouth.setAttribute('d', MOUTH[kind]);
    s.mouth.classList.toggle('open', kind === 'open');
    if (hold) { const id = (s.mouthId = (s.mouthId || 0) + 1); this._after(hold, () => { if (s.mouthId === id) this._mouth('smile'); }); }
  }

  _hatch(open) {
    const s = this.ship, from = open ? 1 : 0, to = open ? 0 : 1;
    this.stage.tween(0.24, (p) => {
      const sx = from + (to - from) * p;
      s.hatch.setAttribute('transform', `translate(0 0.8) scale(${sx.toFixed(3)} 1) translate(0 -0.8)`);
    }, { ease: ease.out });
  }

  _shipStep(dt) {
    const s = this.ship, sp = this.stage.sp;
    const t = this._anchorXY(s.anchor);
    const k = 1 - Math.exp(-dt * (s.anchor === 'away' ? 2.6 : 9));
    const vx = (t.x - s.x) * k;
    s.x += vx; s.y += (t.y - s.y) * k;
    s.wob = Math.max(0, s.wob - dt * 1.7);
    const bob = Math.sin(this.clock * 2.1) * 0.16 * sp;
    const lean = clamp(vx / (dt || 0.016) / (40 * sp), -1, 1) * 10;
    const wob = Math.sin(this.clock * 34) * 11 * s.wob;
    s.px = s.x + s.offX; s.py = s.y + s.offY + bob;
    s.g.setAttribute('transform', `translate(${s.px.toFixed(1)} ${s.py.toFixed(1)}) rotate(${(lean + wob + s.rot).toFixed(2)})`);
    // running lights chase around the rim
    const ph = Math.floor(this.clock * 7) % 3;
    if (ph !== s.lightPhase) { s.lightPhase = ph; s.lights.forEach((l, i) => l.setAttribute('class', `al-light${i % 3 === ph ? ' on' : ''}`)); }
    s.tipGlow.setAttribute('opacity', (0.35 + 0.3 * Math.sin(this.clock * 5)).toFixed(2));
    // the pilot watches the note in play
    let look = s.px;
    const b = this.beam;
    if (b.alpha > 0.1 && b.target) look = b.target().x;
    else if (this.phase === 'turn' && this.notes[this.idx]) look = this.notes[this.idx].x;
    const dx = clamp((look - s.px) / (7 * sp), -1, 1) * 0.07;
    const blink = (this.clock % 3.7) < 0.12 ? 0.2 : 1;
    s.pupils.forEach((p, i) => { p.setAttribute('cx', ((i ? 0.21 : -0.21) + dx).toFixed(3)); p.setAttribute('transform', `translate(0 -1.02) scale(1 ${blink}) translate(0 1.02)`); });
  }

  // ---------- the tractor beam ----------
  _makeBeam() {
    const g = svg('g', { class: 'al-beam', opacity: 0 }, this.stage.layers.back);
    const poly = svg('polygon', { class: 'al-beam-poly' }, g);
    const glow = svg('ellipse', { class: 'al-beam-glow' }, g);
    const rings = [0, 1, 2].map(() => svg('ellipse', { class: 'al-beam-ring' }, g));
    this.beam = { g, poly, glow, rings, alpha: 0, target: null, dir: 1, seq: 0, tw: null };
  }

  /** Fade the beam on (towards target(), which returns {x, y, w} from the current layout) or off. */
  _beam(target, on = true, dur = 0.12) {
    const b = this.beam;
    if (b.tw) b.tw.killed = true;
    if (target) b.target = target;
    const a0 = b.alpha, a1 = on ? 1 : 0;
    b.tw = this.stage.tween(dur, (p) => { b.alpha = a0 + (a1 - a0) * p; });
    b.seq++;
  }

  _noteTarget(n) { return () => ({ x: n.x, y: n.y + 0.7 * this.stage.sp, w: 1.25 * this.stage.sp }); }

  /** A quick approving flash of the beam onto a note. */
  _zap(n) {
    const b = this.beam;
    this._beam(this._noteTarget(n), true, 0.05);
    const id = b.seq;
    this._after(0.16, () => { if (b.seq === id) this._beam(null, false, 0.22); });
  }

  _beamStep() {
    const b = this.beam;
    if (b.alpha <= 0.002 || !b.target) { b.g.setAttribute('opacity', 0); this.ship?.g.classList.remove('beaming'); return; }
    const sp = this.stage.sp, u = this.u, s = this.ship;
    const t = b.target();
    const sx = s.px, sy = this._emitY(), top = 0.6 * u;
    b.poly.setAttribute('points', `${(sx - top).toFixed(1)},${sy.toFixed(1)} ${(sx + top).toFixed(1)},${sy.toFixed(1)} ${(t.x + t.w).toFixed(1)},${t.y.toFixed(1)} ${(t.x - t.w).toFixed(1)},${t.y.toFixed(1)}`);
    b.glow.setAttribute('cx', t.x.toFixed(1)); b.glow.setAttribute('cy', t.y.toFixed(1));
    b.glow.setAttribute('rx', t.w.toFixed(1)); b.glow.setAttribute('ry', (0.36 * sp).toFixed(1));
    b.rings.forEach((r, j) => {
      let f = (this.clock * 1.4 + j / 3) % 1;
      if (b.dir < 0) f = 1 - f;
      const w = top + (t.w - top) * f;
      r.setAttribute('cx', (sx + (t.x - sx) * f).toFixed(1));
      r.setAttribute('cy', (sy + (t.y - sy) * f).toFixed(1));
      r.setAttribute('rx', w.toFixed(1)); r.setAttribute('ry', (w * 0.22).toFixed(1));
      r.setAttribute('opacity', (Math.sin(f * Math.PI) * 0.7).toFixed(2));
    });
    b.g.setAttribute('opacity', (b.alpha * (0.88 + 0.12 * Math.sin(this.clock * 40))).toFixed(2));
    s.g.classList.toggle('beaming', b.alpha > 0.3);
  }

  // ---------- notes ----------
  _drawNote(n) {
    n.el?.remove();
    n.el = null;
    if (!n.shown) return;
    const st = this.stage, sp = st.sp;
    const x = this._noteX(n);
    const p = st.place(n.midi, n.prefer, n.clef);
    n.x = x; n.y = p.y;
    const g = svg('g', { class: `al-note ${n.hand === 'L' ? 'lh' : 'rh'} ${n.state || ''}` }, this.noteG);
    st.ledgers(g, x, p.step, p.clef, 0.95);
    if (p.acc !== null && p.acc !== undefined) st.glyph(g, GLYPH.acc[String(p.acc)], x - 1.75 * sp, p.y);
    st.glyph(g, GLYPH.black, x - 0.59 * sp, p.y, 'al-head');
    const up = p.step < (p.clef === 'bass' ? 22 : 34);
    const sx = up ? x + 0.53 * sp : x - 0.53 * sp;
    svg('line', { x1: sx, x2: sx, y1: p.y + (up ? -0.2 : 0.2) * sp, y2: p.y + (up ? -3.3 : 3.3) * sp, 'stroke-width': Math.max(1.2, 0.12 * sp), class: 'al-stem' }, g);
    n.el = g;
    this._applyDrop(n);
  }

  _applyDrop(n) {
    if (!n.el) return;
    if (n.drop >= 1) { n.el.removeAttribute('transform'); n.el.removeAttribute('opacity'); return; }
    const dy = (this._emitY() - n.y) * (1 - n.drop);
    n.el.setAttribute('transform', `translate(0 ${dy.toFixed(1)})`);
    n.el.setAttribute('opacity', (0.35 + 0.65 * n.drop).toFixed(2));
  }

  _setState(n, state) {
    if (n.state === state) return;
    n.state = state;
    if (n.el) n.el.setAttribute('class', `al-note ${n.hand === 'L' ? 'lh' : 'rh'} ${state || ''}`);
  }

  /** Beam a notehead down from the saucer onto the staff. */
  _dropNote(n, dur = 0.26, done) {
    n.shown = true; n.drop = 0;
    this._drawNote(n);
    this.stage.tween(dur, (p) => { n.drop = p; this._applyDrop(n); }, { ease: ease.in, done: () => { this._ring(n.x, n.y); done?.(); } });
  }

  _ring(x, y) {
    const st = this.stage, sp = st.sp;
    const r = svg('ellipse', { cx: x, cy: y, class: 'al-ring' }, st.layers.fx);
    st.tween(0.45, (p) => {
      r.setAttribute('rx', (0.6 + 1.3 * p) * sp); r.setAttribute('ry', (0.3 + 0.55 * p) * sp);
      r.setAttribute('opacity', 1 - p);
    }, { ease: ease.out, done: () => r.remove() });
  }

  /** The note that was played, in coral on the staff next to the one that was wanted. */
  _ghost(midi, n) {
    const st = this.stage, sp = st.sp;
    const clef = st.opts.staves === 'grand' && Math.abs(midi - n.midi) <= 5 ? n.clef : st.clefOf(midi);
    const p = st.place(midi, isBlack(midi) ? n.prefer || 'sharp' : undefined, clef);
    if (p.y < 0 || p.y > st.h) return;
    const x = n.x + 1.2 * sp;
    const g = svg('g', { class: 'al-ghost' }, st.layers.fx);
    st.ledgers(g, x, p.step, p.clef, 0.95);
    st.glyph(g, GLYPH.black, x - 0.59 * sp, p.y);
    const fs = clamp(1.05 * sp, 12, 20);
    const t = svg('text', { x: x - 0.25 * sp, y: p.y - 0.8 * sp, 'font-size': fs, class: 'al-ghost-label' }, g);
    t.textContent = noteName(midi, { prefer: p.acc ? (n.prefer || 'sharp') : undefined });
    st.tween(1.5, (q) => {
      const shake = q < 0.25 ? Math.sin(q * 60) * (1 - q / 0.25) * 0.25 * sp : 0;
      g.setAttribute('transform', `translate(${shake.toFixed(1)} 0)`);
      g.setAttribute('opacity', q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4);
    }, { done: () => g.remove() });
  }

  /** Beam every note on the staff back up into the saucer. */
  _collect() {
    const st = this.stage, sp = st.sp;
    const shown = this.notes.filter((n) => n.shown && n.el);
    if (!shown.length) return;
    this.ship.anchor = 'center';
    for (const n of shown) { if (n.state === 'dim') this._setState(n, ''); }
    this.beam.dir = -1;
    this.sfx.beam(0.55, true);
    this._beam(() => {
      const xs = this.notes.map((n) => n.x), ys = this.notes.map((n) => n.y);
      const l = Math.min(...xs), r = Math.max(...xs);
      return { x: (l + r) / 2, y: Math.max(...ys) + 0.9 * sp, w: (r - l) / 2 + 1.3 * sp };
    }, true, 0.15);
    shown.forEach((n, j) => {
      st.tween(0.42, (p) => {
        if (!n.el) return;
        const dx = (this.ship.px - n.x) * p, dy = (this._emitY() - n.y) * p, s = 1 - 0.75 * p;
        n.el.setAttribute('transform', `translate(${(n.x + dx).toFixed(1)} ${(n.y + dy).toFixed(1)}) scale(${s.toFixed(3)}) translate(${(-n.x).toFixed(1)} ${(-n.y).toFixed(1)})`);
        n.el.setAttribute('opacity', (1 - 0.7 * p).toFixed(2));
      }, { ease: ease.in, delay: 0.18 + j * 0.06, done: () => { n.shown = false; n.el?.remove(); n.el = null; } });
    });
    this._after(0.4 + shown.length * 0.06, () => { this._beam(null, false, 0.25); this.beam.dir = 1; });
  }

  // ---------- cues: red triangle, finger window, key spotlight ----------
  _makeCues() {
    const back = this.stage.layers.back;
    this.tri = svg('path', { d: 'M0,-0.55 L0.62,0.45 L-0.62,0.45 Z', class: 'al-tri', opacity: 0 }, back);
    this.bar = svg('g', { class: 'al-bar', opacity: 0 }, back);
    this.barTrack = svg('rect', { class: 'al-bar-track' }, this.bar);
    this.barFill = svg('rect', { class: 'al-bar-fill' }, this.bar);
    this.triOn = false;
  }

  /** How much help the current note gets: the repetition's level, raised after repeated misses. */
  get cueLevel() {
    if (this.phase !== 'turn') return -1;
    return Math.max(this.help, this.miss >= 3 ? 2 : this.miss >= 2 ? 1 : 0);
  }

  _cues() {
    const kb = this.app.keyboard;
    kb.clear('cue-r', 'cue-l');
    const n = this.phase === 'turn' ? this.notes[this.idx] : null;
    const lvl = this.cueLevel;
    this.triOn = !!n && lvl >= 1;
    if (!n) { if (this.phase === 'turn') this._windows('R', null); return; }
    this._windows(n.hand, lvl >= 1 ? n.finger : null);
    if (lvl >= 2) kb.mark(n.midi, n.hand === 'L' ? 'cue-l' : 'cue-r', true);
    this.ship.anchor = lvl >= 1 ? { i: n.i } : 'center';
    if (this.help === 0 && n.state === 'dim' && lvl >= 1) this._setState(n, '');
    this._placeTri();
  }

  _placeTri() {
    const n = this.notes[this.idx];
    if (!this.triOn || !n) { this.tri.setAttribute('opacity', 0); return; }
    const sp = this.stage.sp, size = Math.max(sp, 13);
    // a row just under the staff (lower for ledger notes below it), nudged clear of a down-stem
    const p = this.stage.place(n.midi, n.prefer, n.clef);
    const stemDown = p.step >= (n.clef === 'bass' ? 22 : 34);
    const apex = Math.max(this._staffBottom(n.clef) + 0.5 * sp, n.y + 0.95 * sp);
    const x = n.x + (stemDown ? 0.32 * sp : 0);
    const y = apex + 0.55 * size + Math.sin(this.clock * 5) * 0.12 * sp;
    this.tri.setAttribute('opacity', 1);
    this.tri.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${size.toFixed(2)})`);
  }

  _timeBar() {
    if (!this.bar) return;
    const show = this.timed && (this.phase === 'turn' || this.phase === 'timeup');
    this.bar.setAttribute('opacity', show ? 1 : 0);
    if (!show) return;
    const st = this.stage, sp = st.sp;
    const x = st.right - 1.35 * sp, w = Math.max(5, 0.6 * sp);
    const top = st.staffTop, hgt = st.staffBottom - st.staffTop;
    const f = clamp(this.timeLeft / this.timeMax, 0, 1);
    for (const [r, hh, yy] of [[this.barTrack, hgt, top], [this.barFill, hgt * f, top + hgt * (1 - f)]]) {
      r.setAttribute('x', x - w / 2); r.setAttribute('width', w); r.setAttribute('rx', w / 2);
      r.setAttribute('y', yy); r.setAttribute('height', Math.max(0, hh));
    }
    this.bar.classList.toggle('low', f < 0.3);
  }

  _fingerMap(on) {
    const kb = this.app.keyboard;
    kb.clearFingers();
    this.fingersOn = !!on;
    if (!on) return;
    for (const [m, f] of this.fingerKeys) kb.setFinger(m, f);
  }

  _clearKeys() {
    const kb = this.app.keyboard;
    kb.clear('demo', 'cue-r', 'cue-l');
    kb.clearFingers();
    this.fingersOn = false;
  }

  // ---------- phrases ----------
  /** Normalize a phrase given as MIDI numbers or {midi, finger, hand}; fill in five-finger fingering. */
  _spec(list) {
    const items = list.map((x) => (typeof x === 'number' ? { midi: x } : { ...x }));
    const hand = this.lv.hand || (items.every((x) => x.midi < 60) ? 'L' : 'R');
    for (const x of items) x.hand ||= hand;
    for (const hd of ['L', 'R']) {
      const mine = items.filter((x) => x.hand === hd);
      if (!mine.length) continue;
      const steps = mine.map((x) => spell(x.midi).step);
      const lo = Math.min(...steps);
      const ok = Math.max(...steps) - lo <= 4;
      mine.forEach((x, i) => { if (x.finger == null) x.finger = ok ? (hd === 'L' ? 5 - (steps[i] - lo) : steps[i] - lo + 1) : null; });
    }
    return items.map((x) => ({ midi: x.midi, hand: x.hand, finger: x.finger }));
  }

  _fromTokens(str) {
    const hands = this.lv.hands, def = Object.keys(hands)[0];
    return str.trim().split(/\s+/).map((tok) => {
      const [, hd, d] = /^([LR]?)(\d)$/.exec(tok);
      const hand = hd || def;
      return { midi: hands[hand][+d], hand, finger: hand === 'L' ? 5 - +d : +d + 1 };
    });
  }

  _makePhrases() {
    const lv = this.lv;
    if (lv.phrases?.length) {
      const list = lv.phrases.map((p) => this._spec(p));
      const count = this.embedded?.count ?? list.length;
      return Array.from({ length: count }, (_, i) => list[i % list.length]);
    }
    const count = this.embedded ? (this.embedded.count ?? 3) : (lv.count || 5);
    const bank = BANK[lv.bank] || BANK.steps;
    const used = new Set();
    return Array.from({ length: count }, (_, i) => {
      const len = count === 1 ? 5 : Math.round(3 + (4 * i) / (count - 1));
      const fresh = bank[len].filter((s) => !used.has(s));
      const s = pick(fresh.length ? fresh : bank[len]);
      used.add(s);
      return this._fromTokens(s);
    });
  }

  _dress(spec) {
    const staves = this.stage.opts.staves;
    return spec.map((n, i) => ({
      ...n, i,
      clef: staves !== 'grand' ? staves : n.hand === 'L' ? (n.midi <= 62 ? 'bass' : 'treble') : (n.midi >= 57 ? 'treble' : 'bass'),
      prefer: isBlack(n.midi) ? 'sharp' : undefined,
      shown: false, drop: 1, state: '', el: null, x: 0, y: 0,
    }));
  }

  // ---------- attract: the saucer drifts and beams notes silently ----------
  attract() {
    this.mode = 'attract';
    this.ship.anchor = { f: 0.72 };
    const t = this._anchorXY(this.ship.anchor);
    this.ship.x = t.x; this.ship.y = t.y;
    const lv = this.game.levels[this.level];
    this.attractPool = Object.entries(lv.hands).flatMap(([hand, list]) => list.map((midi) => ({ midi, hand })));
    this._after(0.6, () => this._attractBeam());
  }

  _attractBeam() {
    if (this.mode !== 'attract') return;
    const f = rand(0.06, 0.94);
    this.ship.anchor = { f };
    this._after(0.75, () => {
      const pick1 = pick(this.attractPool);
      const n = this._dress([{ ...pick1, finger: null }])[0];
      n.f = f;
      this.decor.push(n);
      this._beam(this._noteTarget(n), true, 0.12);
      this._dropNote(n, 0.3);
      this._after(0.55, () => this._beam(null, false, 0.3));
      this._after(2.6, () => {
        const g = n.el;
        if (g) this.stage.tween(0.6, (p) => g.setAttribute('opacity', 1 - p), { done: () => { g.remove(); this.decor = this.decor.filter((d) => d !== n); } });
      });
      this._after(1.4, () => this._attractBeam());
    });
  }

  // ---------- round ----------
  start() {
    const lv = this.lv;
    this.reset();
    this.mode = 'play';
    this.playing = true;
    this.score = 0; this.right = 0; this.done = 0; this.errors = 0;
    this.surprises = 0; this.timeouts = 0; this.phrasesDone = 0;
    this.reps = Math.max(1, Math.round(lv.reps || 3));
    this.phrases = this._makePhrases();
    this.surpriseOrder = shuffle(['wave', 'hop', 'spin']);
    this.k = -1; this.rep = -1; this.help = 2; this.miss = 0; this.idx = 0; this.timed = false;
    // finger numbers for the keyboard: the whole five-finger position(s) in play
    this.fingerKeys = new Map();
    if (lv.hands && !lv.phrases?.length) {
      for (const [hand, list] of Object.entries(lv.hands)) list.forEach((m, d) => this.fingerKeys.set(m, hand === 'L' ? 5 - d : d + 1));
    } else {
      for (const p of this.phrases) for (const n of p) if (n.finger) this.fingerKeys.set(n.midi, n.finger);
    }
    const all = this.phrases.flat().map((n) => n.midi).concat([...this.fingerKeys.keys()]);
    this.app.keyboard.need(Math.min(...all), Math.max(...all));
    this.app.ui.prompt(this.embedded?.text || 'Watch the saucer. The aliens play a phrase, then you copy it.');
    this.app.ui.status('');
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this._end(true) }, 'Stop'));
    // fly in from the top left
    this.ship.x = -5 * this.u; this.ship.y = -3 * this.u;
    this.ship.anchor = 'center';
    this.phase = 'arrive';
    this._after(0.35, () => this.sfx.loop('hum', 0.045));   // a gentle hover hum; finish() stops it
    this._after(1.1, () => this._phrase(0));
    this._hud();
  }

  _phrase(k) {
    const lv = this.lv;
    this.k = k;
    for (const n of this.notes) n.el?.remove();
    this.notes = this._dress(this.phrases[k]);
    this.rep = -1; this.phase = 'demo'; this.pRight = 0; this.idx = 0;
    const n = this.notes.length;
    const grand = this.stage.opts.staves === 'grand';
    this.app.ui.prompt(this.embedded?.text || `Watch and listen: ${n} notes. The lit window shows which finger plays each note.${grand ? ' Blue notes are for the left hand.' : ''}`);
    this.app.ui.status('');
    this._banner('Listen');
    this._fingerMap(true);
    const gap = lv.tempo || (n >= 6 ? 0.78 : 0.85);
    this.notes.forEach((note, i) => this._after(0.55 + i * gap, () => this._demoNote(note, gap)));
    this._after(0.55 + n * gap + 0.45, () => this._turn(0));
    this._hud();
  }

  _demoNote(n, gap) {
    const kb = this.app.keyboard;
    this.ship.anchor = { i: n.i };
    this._after(0.2, () => {
      this.sfx.beam(0.4);
      this._beam(this._noteTarget(n), true, 0.1);
      this._windows(n.hand, n.finger);
      kb.clear('demo');
      kb.mark(n.midi, 'demo', true);
      this._dropNote(n, 0.24);
      this._after(0.24, () => this.app.sound.play(n.midi, 0.78, undefined, gap * 0.95));
      this._after(Math.max(0.36, gap - 0.32), () => { this._beam(null, false, 0.18); kb.mark(n.midi, 'demo', false); });
    });
  }

  _helpFor(r) {
    if (this.reps > 1 && r === this.reps - 1) return 0;
    return r === 0 ? 2 : 1;
  }

  _turn(r) {
    const n = this.notes.length;
    this.rep = r; this.idx = 0; this.miss = 0;
    this.help = this._helpFor(r);
    this.timed = this.help === 0;
    this.timeMax = this.timed ? (this.lv.time || 2.5 + 1.3 * n) : 0;
    this.timeLeft = this.timeMax;
    this.lastTick = Math.ceil(this.timeLeft);
    this.phase = 'turn';
    for (const note of this.notes) {
      note.shown = true; note.drop = 1;
      note.state = this.help === 0 ? 'dim' : '';
      this._drawNote(note);
    }
    const { ui } = this.app;
    if (!this.embedded?.text) {
      ui.prompt(this.help === 2 ? 'Your turn. Play the note above the red triangle, with the finger in the lit window.'
        : this.help === 1 ? 'Again, with less help: just the triangle and the finger number.'
          : 'Now from memory, before the red bar runs out.');
    }
    ui.status(`Copy ${r + 1} of ${this.reps}`);
    this._banner(r === 0 ? 'Your turn' : this.help === 0 ? 'From memory' : 'Less help');
    this._windows('R', null);
    this._fingerMap(this.help >= 2);
    this._cues();
    this._timeBar();
    this._hud();
  }

  noteOn(e) {
    if (this.mode !== 'play' || !this.playing) return;
    if (this.phase !== 'turn') {
      if (this.phase === 'demo') this.app.ui.status('Listen first, then copy.');
      return;
    }
    const n = this.notes[this.idx];
    if (!n) return;
    if (e.midi === n.midi) this._right(n); else this._wrong(n, e.midi);
  }

  _right(n) {
    const st = this.stage, sp = st.sp;
    const first = this.miss === 0;
    if (first) { this.right++; this.pRight++; }
    this.done++;
    const pts = Math.round([100, 75, 50][this.help] * (first ? 1 : 0.5));
    this.score += pts;
    this.app.coach.record('hit');
    this.app.keyboard.flash(n.midi, 'hit');
    this._setState(n, 'hit');
    st.puff(n.x, n.y, '#62c993', 7, 0.22);
    st.float(n.x, n.y - 1.7 * sp, `+${pts}`);
    this._zap(n);
    this.idx++; this.miss = 0;
    this.app.ui.status(this.idx < this.notes.length ? `Copy ${this.rep + 1} of ${this.reps}` : 'Copied');
    if (this.idx >= this.notes.length) this._repDone(); else this._cues();
    this._hud();
  }

  _wrong(n, midi) {
    this.miss++; this.errors++;
    this.score = Math.max(0, this.score - 20);
    this.app.coach.record('wrong-pitch', { expected: n.midi, played: midi, key: 'C' });
    this.app.keyboard.flash(midi, 'miss', 450);
    this.sfx.buzz();
    this.ship.wob = 1;
    this._mouth('frown', 0.7);
    this._ghost(midi, n);
    this._cues();
    const lvl = this.cueLevel;
    const dir = midi < n.midi ? 'higher' : 'lower';
    this.app.ui.status(`That was ${noteName(midi, { octave: true })}. Go ${dir}${lvl >= 1 && n.finger ? `, finger ${n.finger}` : ''}.`);
    this._hud();
  }

  _repDone() {
    const st = this.stage;
    this.phase = 'between';
    this.triOn = false; this._placeTri();
    this.app.keyboard.clear('cue-r', 'cue-l');
    this._windows('R', null, 'party');
    if (this.timed && this.timeLeft > 0) {
      const b = Math.round(this.timeLeft * 10);
      this.score += b;
      st.float(st.right - 1.35 * st.sp, st.staffTop - 0.4 * st.sp, `+${b}`);
    }
    this.timed = false;
    this._timeBar();
    this._hud();
    if (this.rep < this.reps - 1) this._after(0.95, () => this._turn(this.rep + 1));
    else this._after(0.7, () => this._phraseDone());
  }

  _timeUp() {
    this.phase = 'timeup';
    this.timeouts++;
    const n = this.notes[this.idx];
    if (n) this.app.coach.record('missed', { expected: n.midi });
    this.done += this.notes.length - this.idx;
    for (const m of this.notes.slice(this.idx)) this._setState(m, 'late');
    this.triOn = false; this._placeTri();
    this.app.keyboard.clear('cue-r', 'cue-l');
    this._windows('R', null, 'sad');
    this._mouth('frown', 1.2);
    this.sfx.buzz();
    this._banner('Time is up');
    this.app.ui.status('Out of time. These were the notes left.');
    this._after(1.5, () => { this.timed = false; this._timeBar(); this._phraseDone(); });
  }

  _phraseDone() {
    const slots = this.notes.length * this.reps;
    const need = this.lv.surprise ?? 0.8;
    const won = this.pRight / slots >= need;
    this.phrasesDone++;
    this.phase = 'collect';
    this.app.ui.status('');
    this._collect();
    let wait;
    if (won) {
      this.surprises++;
      this._after(0.8, () => this._surprise());
      wait = 0.8 + 5.0;
    } else {
      this._windows('R', null, 'sad');
      this._mouth('frown', 1.4);
      if (!this.embedded?.text) this.app.ui.prompt(`${this.pRight} of ${slots} right first time. The aliens wanted ${Math.round(need * 100)}% for their surprise.`);
      this._banner('So close');
      wait = 1.8;
    }
    this._after(wait, () => {
      this._windows('R', null);
      if (this.k + 1 < this.phrases.length) this._phrase(this.k + 1); else this._end(false);
    });
    this._hud();
  }

  // ---------- the aliens' surprise ----------
  _surprise() {
    const st = this.stage, sp = st.sp, s = this.ship;
    this.phase = 'surprise';
    const kind = this.surpriseOrder[(this.surprises - 1) % this.surpriseOrder.length];
    const count = this.surprises % 2 ? 3 : 2;
    const bonus = 150 + 50 * this.notes.length;
    if (!this.embedded?.text) this.app.ui.prompt(pick(['Surprise! The aliens loved that.', 'The aliens are coming out to say thanks!', 'You played it from memory. Party on the saucer!']));
    this._banner('Surprise!');
    this._windows('R', null, 'party');
    this._mouth('open');
    s.anchor = 'center';
    this._hatch(true);
    this.sfx.pop();
    st.tween(0.4, (p) => { s.offY = -0.7 * sp * p; }, { ease: ease.out });
    const offs = count === 3 ? [-6, 0, 6] : [-4, 4];
    const c0 = this.surprises;
    this.aliens = offs.map((off, i) => this._spawnAlien(off, ALIEN_COLORS[(c0 + i) % ALIEN_COLORS.length], i));
    this.sfx.beam(0.7, false);
    this._beam(() => ({ x: s.px, y: st.staffTop, w: 6.6 * sp }), true, 0.2);
    this.aliens.forEach((a, i) => {
      st.tween(0.62, (p) => { a.f = p; a.dy = -Math.sin(p * Math.PI) * 0.6; this._pose(a); }, { ease: ease.out, delay: 0.15 + i * 0.16 });
    });
    this._after(1.0, () => this._beam(null, false, 0.3));
    this._after(1.15, () => this._dance(kind));
    this._after(3.2, () => this._aliensHome());
    this._after(3.85, () => { this._hatch(false); this._loop(); });
    this._after(4.25, () => {
      this.score += bonus;
      st.float(s.px, s.py - 2.4 * this.u, `+${bonus}`, 'ar-float al-bonus');
      this._hud();
    });
    this._after(4.9, () => this._mouth('smile'));
  }

  _alienArt(color) {
    const g = svg('g', { class: 'al-alien' });
    for (const s of [-1, 1]) {
      svg('path', { d: `M${0.2 * s},-1.34 Q${0.28 * s},-1.84 ${0.52 * s},-1.94`, class: 'al-alien-ant', stroke: color }, g);
      svg('circle', { cx: 0.55 * s, cy: -1.96, r: 0.12, class: 'al-alien-tip' }, g);
    }
    const arms = [-1, 1].map((s) => {
      const arm = svg('g', {}, g);
      svg('path', { d: `M${0.52 * s},-0.62 Q${0.86 * s},-0.66 ${0.96 * s},-1.0`, class: 'al-alien-arm', stroke: color }, arm);
      svg('circle', { cx: 0.97 * s, cy: -1.04, r: 0.11, fill: color }, arm);
      return arm;
    });
    svg('path', { d: 'M-0.62,-0.12 C-0.72,-1.85 0.72,-1.85 0.62,-0.12 Q0,0.06 -0.62,-0.12 Z', fill: color, class: 'al-alien-body' }, g);
    svg('ellipse', { cx: 0, cy: -0.34, rx: 0.32, ry: 0.19, class: 'al-alien-belly' }, g);
    for (const s of [-1, 1]) {
      svg('ellipse', { cx: 0.22 * s, cy: -0.98, rx: 0.17, ry: 0.21, class: 'al-alien-eye' }, g);
      svg('circle', { cx: 0.24 * s, cy: -0.95, r: 0.085, class: 'al-alien-pupil' }, g);
      svg('circle', { cx: 0.42 * s, cy: -0.66, r: 0.08, class: 'al-alien-cheek' }, g);
    }
    svg('path', { d: 'M-0.16,-0.64 Q0,-0.46 0.16,-0.64', class: 'al-alien-mouth' }, g);
    for (const s of [-1, 1]) svg('ellipse', { cx: 0.3 * s, cy: -0.05, rx: 0.21, ry: 0.1, fill: color, class: 'al-alien-foot' }, g);
    return { g, arms };
  }

  _spawnAlien(off, color, i) {
    const art = this._alienArt(color);
    this.alienG.append(art.g);
    const a = { ...art, off, i, f: 0, dx: 0, dy: 0, sx: 1, size: [1, 0.9, 1.08][i % 3], armL: 0, armR: 0 };
    this._pose(a);
    return a;
  }

  _pose(a) {
    const st = this.stage, sp = st.sp, s = this.ship;
    const A = clamp(Math.max(sp * 1.1, this.u * 0.8), 13, 28) * a.size;
    const [l, r] = this._span();
    const gx = clamp(s.x + a.off * Math.max(sp, this.u * 0.75), l + sp, r - sp), gy = st.staffTop;
    const hx = s.px, hy = this._emitY();
    const x = hx + (gx - hx) * a.f + a.dx * sp, y = hy + (gy - hy) * a.f + a.dy * A;
    const sc = A * (0.25 + 0.75 * a.f);
    a.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(sc * a.sx).toFixed(2)} ${sc.toFixed(2)})`);
    a.arms[0].setAttribute('transform', `rotate(${a.armL.toFixed(1)} -0.52 -0.62)`);
    a.arms[1].setAttribute('transform', `rotate(${(-a.armR).toFixed(1)} 0.52 -0.62)`);
  }

  _dance(kind) {
    const st = this.stage, al = this.aliens;
    if (kind === 'hop') {
      // the aliens hop in turn and replay the phrase, an octave up
      const tune = this.notes.map((n) => n.midi + 12);
      tune.forEach((m, j) => this._after(j * 0.24, () => {
        const a = al[j % al.length];
        this.app.sound.play(m, 0.6, undefined, 0.32);
        st.tween(0.24, (p) => { a.dy = -Math.sin(p * Math.PI) * 0.9; a.armL = a.armR = 70 * Math.sin(p * Math.PI); this._pose(a); });
      }));
      this._after(tune.length * 0.24 + 0.05, () => {
        this.sfx.bell();
        al.forEach((a) => st.tween(0.4, (p) => { a.dy = -Math.sin(p * Math.PI) * 1.4; a.armL = a.armR = 120 * Math.sin(p * Math.PI); this._pose(a); }));
      });
    } else if (kind === 'spin') {
      // a conga line that spins as it shuffles, to the phrase as a fanfare
      this.sfx.fanfare(this.notes.map((n) => n.midi + 12), 0.12);
      st.tween(1.95, (p) => al.forEach((a, i) => {
        a.sx = Math.cos(p * Math.PI * 4 + i * 0.6);
        a.dx = Math.sin(p * Math.PI * 2) * 1.3;
        a.dy = -Math.abs(Math.sin(p * Math.PI * 8 + i)) * 0.25;
        a.armL = a.armR = 40 + 30 * Math.sin(p * 20 + i);
        this._pose(a);
      }), { done: () => al.forEach((a) => { a.sx = 1; a.dx = 0; a.dy = 0; this._pose(a); }) });
    } else {
      // everybody waves
      this.sfx.fanfare([72, 76, 79, 84]);
      st.tween(1.95, (p) => al.forEach((a, i) => {
        const t = p * 1.95;
        a.armL = 30 + 70 * Math.max(0, Math.sin(t * 11 + i * 1.3));
        a.armR = 30 + 70 * Math.max(0, Math.sin(t * 11 + i * 1.3 + Math.PI));
        a.dy = -Math.abs(Math.sin(t * 6 + i)) * 0.3;
        this._pose(a);
      }), { done: () => al.forEach((a) => { a.armL = a.armR = 0; a.dy = 0; this._pose(a); }) });
    }
  }

  _aliensHome() {
    const st = this.stage, s = this.ship;
    this.sfx.beam(0.5, true);
    this.beam.dir = -1;
    this._beam(() => ({ x: s.px, y: st.staffTop, w: 6.6 * st.sp }), true, 0.15);
    this.aliens.forEach((a, i) => {
      st.tween(0.45, (p) => { a.f = 1 - p; a.armL = a.armR = 60; this._pose(a); }, { ease: ease.in, delay: i * 0.08, done: () => a.g.remove() });
    });
    this._after(0.6, () => {
      this._beam(null, false, 0.2); this.beam.dir = 1; this.aliens = [];
      const y0 = s.offY;
      st.tween(0.2, (p) => { s.offY = y0 * (1 - p); });
    });
  }

  /** A loop-the-loop, trailing sparkles. */
  _loop() {
    const st = this.stage, s = this.ship, sp = st.sp, dir = pick([-1, 1]);
    this.sfx.whoosh();
    let last = 0;
    st.tween(1.05, (p) => {
      const ph = p * Math.PI * 2;
      s.offX = Math.sin(ph) * 2.4 * sp * dir;
      s.offY = (1 - Math.cos(ph)) * 1.3 * sp;
      s.rot = 360 * p * dir;
      if (p - last > 0.035) { last = p; this._sparkle(s.px + rand(-1.6, 1.6) * this.u, s.py + rand(-0.6, 0.9) * this.u); }
    }, { ease: ease.inOut, done: () => { s.offX = 0; s.offY = 0; s.rot = 0; } });
  }

  _sparkle(x, y) {
    const st = this.stage, sp = st.sp;
    const color = pick(['#ffd877', '#a8f0c8', '#e8ede3', '#8fb7de']);
    const r = rand(0.3, 0.6) * sp, rot0 = rand(0, 90);
    const p = svg('path', { d: SPARK, fill: color, class: 'al-spark' }, st.layers.fx);
    st.tween(rand(0.5, 0.8), (q) => {
      const sc = r * Math.sin(Math.PI * Math.min(1, q * 1.3 + 0.1));
      p.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + q * 0.8 * sp).toFixed(1)}) rotate(${(rot0 + q * 120).toFixed(0)}) scale(${Math.max(0.01, sc).toFixed(2)})`);
      p.setAttribute('opacity', (1 - q * q).toFixed(2));
    }, { done: () => p.remove() });
  }

  // ---------- banner and HUD ----------
  /** Lowest point of the phrase on the staff: noteheads, down-stems, and the triangle row under them. */
  _lowest() {
    const st = this.stage, sp = st.sp, size = Math.max(sp, 13);
    let y = st.staffBottom;
    for (const n of this.notes) {
      const p = st.place(n.midi, n.prefer, n.clef);
      const down = p.step >= (n.clef === 'bass' ? 22 : 34);
      const apex = Math.max(this._staffBottom(n.clef) + 0.5 * sp, p.y + 0.95 * sp);
      y = Math.max(y, down ? p.y + 3.3 * sp : p.y + 0.5 * sp, apex + size + 0.12 * sp);
    }
    return y;
  }

  /** A short word in the free band between the staff and the score tray; skipped if there is no room. */
  _banner(text, life = 1.25) {
    const st = this.stage, sp = st.sp;
    this.bannerG?.remove();
    const top = this._lowest() + 4, bot = this.trayY - 1.15 * sp - 4;
    const fs = Math.min(clamp(sp * 1.0, 15, 22), (bot - top) / 0.8);
    if (fs < 11) return;
    const y = bot - (bot - top - 0.72 * fs) / 2;
    const cx = this._centerX(), cy = y - 0.36 * fs;
    const g = svg('g', { class: 'al-banner' }, st.layers.hud);
    const t = svg('text', { x: cx, y, 'text-anchor': 'middle', 'font-size': fs, class: 'al-banner-t' }, g);
    t.textContent = text.toUpperCase();
    this.bannerG = g;
    st.tween(life, (p) => {
      const a = p < 0.14 ? p / 0.14 : p > 0.72 ? (1 - p) / 0.28 : 1;
      const sc = 0.82 + 0.18 * ease.back(Math.min(1, p / 0.2));
      g.setAttribute('opacity', a.toFixed(2));
      g.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${sc.toFixed(3)}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`);
    }, { done: () => g.remove() });
  }

  _hud() {
    const st = this.stage, sp = st.sp;
    if (!this.hudG || !this.hudG.isConnected) this.hudG = svg('g', { class: 'ar-hudtext' }, st.layers.hud);
    const g = this.hudG;
    g.textContent = '';
    if (this.mode !== 'play') return;
    const y = this.trayY;
    const fs = clamp(sp * 0.95, 11, 17);
    const label = (x, anchor, k, v) => {
      const t = svg('text', { x, y: y + fs * 0.35, 'text-anchor': anchor, 'font-size': fs, class: 'ar-hud' }, g);
      svg('tspan', { class: 'ar-hud-k' }, t).textContent = v ? `${k} ` : k;
      if (v) svg('tspan', { class: 'ar-hud-v' }, t).textContent = v;
      return t;
    };
    label(st.left + sp, 'start', 'SCORE', this.score.toLocaleString());
    if (this.k >= 0) label(st.right - sp, 'end', 'PHRASE', `${this.k + 1} of ${this.phrases.length}`);
    // centre: listening, or one pip per copy
    const cx = st.w / 2;
    if (this.phase === 'demo') { label(cx, 'middle', 'LISTEN', ''); return; }
    if (this.k < 0) return;
    const r = Math.max(4, 0.36 * fs);
    const gap = r * 3;
    const x0 = cx - ((this.reps - 1) * gap) / 2 + fs * 1.6;
    label(x0 - r * 2.2, 'end', 'COPY', '');
    for (let i = 0; i < this.reps; i++) {
      const done = i < this.rep || (i === this.rep && this.phase !== 'turn' && this.phase !== 'timeup') || this.phase === 'collect' || this.phase === 'surprise';
      const cur = i === this.rep && (this.phase === 'turn' || this.phase === 'timeup');
      svg('circle', { cx: x0 + i * gap, cy: y, r, class: `al-pip${done ? ' done' : cur ? ' cur' : ''}` }, g);
    }
  }

  // ---------- frame ----------
  step(dt) {
    if (!this.ship || !this.stage) return;
    this.clock += dt;
    if (this.mode === 'play' || this.mode === 'attract') this._runQueue(dt);
    if (this.mode === 'play' && this.phase === 'turn' && this.timed) {
      this.timeLeft -= dt;
      const sec = Math.ceil(this.timeLeft);
      if (sec < this.lastTick) { this.lastTick = sec; if (sec <= 3 && sec > 0) this.sfx.tick(sec === 1); }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this._timeUp(); }
      this._timeBar();
    }
    this._shipStep(dt);
    this._beamStep();
    if (this.triOn) this._placeTri();
  }

  _end(stopped) {
    if (this.mode !== 'play') return;
    this._clearQueue();
    this.mode = 'over';
    this.phase = 'away';
    this.triOn = false; this._placeTri();
    this.timed = false; this._timeBar();
    this._beam(null, false, 0.2);
    this._clearKeys();
    for (const a of this.aliens) a.g.remove();
    this.aliens = [];
    this.ship.anchor = 'away';
    this.hudG && (this.hudG.textContent = '');
    const total = Math.max(1, this.done);
    const acc = this.right / total;
    if (!stopped && acc >= 0.9) this.sfx.fanfare();
    this.finish({
      score: this.score,
      passed: this.done > 0 && acc >= (this.embedded?.pass ?? 0.7),
      detail: `${this.right} of ${this.done} notes right first time${this.surprises ? `, and ${this.surprises} alien surprise${this.surprises > 1 ? 's' : ''}` : ''}.`,
      stats: [
        ['Right first time', `${this.right} of ${this.done}${this.done ? ` (${Math.round(acc * 100)}%)` : ''}`],
        ...(this.phrasesDone ? [['Alien surprises', `${this.surprises} of ${this.phrasesDone}`]] : []),
        ['Wrong notes', String(this.errors)],
        ...(this.timeouts ? [['Ran out of time', String(this.timeouts)]] : []),
      ],
    });
  }

  exit() {
    this._clearQueue?.();
    this.mode = 'off';
    if (this.app?.keyboard) this._clearKeys();
    super.exit();
  }
}
