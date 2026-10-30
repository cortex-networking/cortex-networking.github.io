// Aliens!: the Miracle's memory game. A flying saucer beams a short phrase onto the staff, note by
// note, while the aliens play it; the lit window in its hull shows which finger plays each note.
// Then you copy the phrase with less help each time: the red triangle, the lit key and the finger
// first; then the triangle and the finger; then from memory before the red bar on the right of the
// staff drains. Get most of the notes right first time and the aliens come out to celebrate.
//
// Song mode ("Learn a song") teaches a real song from the catalog this way, phrase by phrase, with
// chaining: each new phrase is shown and copied (guided, then from memory), then joined to the
// phrases before it and played from memory, so the song is learned in growing chunks.
import { ArcadeBase, GLYPH, svg, rand, pick, ease, clamp, phrasesOf } from './arcade.js';
import { noteName, spell, isBlack, buildScore, keySigMap } from './theory.js';
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
  songHow: 'The aliens teach the song phrase by phrase: copy each one with help, then from memory, then joined to the phrase before, until you have played the whole song.',
  skill: 'fingering',
  levels: [
    { name: 'Right hand, C position', staves: 'treble', pos: { R: POS.cR }, bank: 'steps' },
    { name: 'Left hand, C position', staves: 'bass', pos: { L: POS.cL }, bank: 'steps' },
    { name: 'Right hand, G position', staves: 'treble', pos: { R: POS.gR }, bank: 'steps' },
    { name: 'Middle C position', staves: 'grand', pos: { L: POS.mcL, R: POS.cR }, bank: 'middleC' },
    { name: 'Steps and skips', staves: 'treble', pos: { R: POS.cR }, bank: 'skips' },
    { name: 'A minor position', staves: 'treble', pos: { R: POS.aR }, bank: 'mixed' },
    { name: 'Hands take turns', staves: 'grand', pos: { L: POS.cL, R: POS.cR }, bank: 'turns' },
    { name: 'Learn a song', song: true },
  ],
};

/*
 * Embedded params (lessons and the coach): new Game(app, GAME, { embedded: { ... } })
 * Song mode:
 *   song      catalog id of the song to teach (turns on song mode; the kit resolves 'auto')
 *   hands     'R' | 'L' (default 'R'): which hand's line to learn
 *   fromBar, toBar  optional bar range, inclusive, 0-based as songBar counts them
 * Made-up phrases:
 *   phrases   array of phrases, each an array of MIDI numbers or { midi, finger, hand: 'L'|'R' }.
 *             Missing fingers come from the five-finger position: the lowest note of each hand is
 *             the right thumb (1) or the left pinky (5). Phrases spanning more than five white keys
 *             get no finger numbers unless given.
 *   hand      'L' or 'R' for plain MIDI phrases (default: L when every note is below middle C)
 *   staves    'treble' | 'bass' | 'grand' (default: from the hands used)
 *   reps      copies after the demo (default 3; the last one is from memory, against the clock)
 *   count     phrases to play (default: every given phrase, or 3 from the level's bank)
 *   tempo     seconds per note in the aliens' demo (default 0.85)
 * Both:
 *   pass      share of notes right first time needed to pass (default 0.7)
 *   surprise  share needed in one phrase or join for the aliens' surprise (default 0.8)
 *   time      seconds for each memory copy (default 2.5 + 1.3 per note)
 *   text      prompt shown above the board
 */

const ALIEN_COLORS = ['#7fd3a6', '#f0c25a', '#8fb7de', '#ef8a73'];
const SPARK = 'M0,-1 Q0.16,-0.16 1,0 Q0.16,0.16 0,1 Q-0.16,0.16 -1,0 Q-0.16,-0.16 0,-1 Z';
const MOUTH = {
  smile: 'M-0.17,-0.74 Q0,-0.6 0.17,-0.74',
  frown: 'M-0.15,-0.66 Q0,-0.79 0.15,-0.66',
  open: 'M-0.15,-0.74 Q0,-0.48 0.15,-0.74 Q0,-0.68 -0.15,-0.74 Z',
};
const JOIN_MAX = 12;   // notes in a joined chunk before the chain slides on instead of growing
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Game extends ArcadeBase {
  stageOptions() {
    const staves = this._staves();
    this.topExtra = 0;
    if (this.songLevel && this._song()) {
      // room above and below the staff for the song's highest and lowest notes
      const s = this._song(), ext = this._extent(s.line, s.score.key, staves);
      this.topExtra = ext.up;
      return { staves, key: s.score.key, mTop: 7 + ext.up, mBot: Math.max(3.4, ext.down + 2.3), padTop: 0.04, padBot: 0.2, maxSp: 22 };
    }
    // headroom above the staff for the saucer; the grand staff trades a little of it for bigger notes
    return staves === 'grand'
      ? { staves, key: 'C', mTop: 5.5, mBot: 2.6, padTop: 0.04, padBot: 0.17, maxSp: 22 }
      : { staves, key: 'C', mTop: 7, mBot: 3.4, padTop: 0.04, padBot: 0.2, maxSp: 22 };
  }

  _staves() {
    const lv = this.lv;
    if (this.songLevel) return lv.hands === 'L' ? 'bass' : 'treble';
    if (this.embedded?.staves) return this.embedded.staves;
    if (lv.phrases?.length) {
      const hands = new Set(lv.phrases.flatMap((p) => this._spec(p).map((n) => n.hand)));
      return hands.size > 1 ? 'grand' : hands.has('L') ? 'bass' : 'treble';
    }
    return lv.staves || 'treble';
  }

  /** Space a list of notes needs above and below the staff, in staff spaces. */
  _extent(notes, key, staves = this.stage.opts.staves) {
    if (!notes.length) return { up: 0, down: 0 };
    const steps = notes.map((n) => spell(n.midi, key, n.prefer).step);
    const top = staves === 'bass' ? 26 : 38, bot = staves === 'bass' ? 18 : 30;
    return { up: Math.max(0, (Math.max(...steps) - top) / 2 + 0.7), down: Math.max(0, (bot - Math.min(...steps)) / 2 + 0.7) };
  }

  reset() {
    const st = this.stage;
    this._clearQueue();
    this.clock = this.clock || 0;
    this.notes = [];
    this.decor = [];
    this.aliens = [];
    this.phase = 'idle';
    this.view = 0; this.viewTo = 0; this.gap = 0; this.cap = 0; this.x0 = 0;
    this.chunkUp = this.topExtra || 0;
    for (const k of ['hud', 'back', 'sprites', 'fx']) st.layers[k].textContent = '';
    this.noteWrap = svg('g', { class: 'al-notewrap' }, st.layers.sprites);
    this.noteG = svg('g', { class: 'al-notes' }, this.noteWrap);
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
    this._layoutNotes();
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
  _hoverY() { return Math.max(2.45 * this.u + 4, this.stage.staffTop - (2.3 + (this.chunkUp || 0)) * this.stage.sp - this.u); }
  _emitY() { return this.ship.py + 0.85 * this.u; }

  /**
   * Lay the chunk out across the staff. Short chunks are centred; long ones show a window of as many
   * notes as fit comfortably and slide along it (the notes group scrolls, the window fades at its edges).
   */
  _layoutNotes() {
    const [l, r] = this._span(), sp = this.stage.sp, count = Math.max(1, this.notes.length);
    const minGap = 2.8 * sp;
    let gap = Math.min(5.6 * sp, (r - l) / count);
    if (gap >= minGap) { this.cap = count; this.x0 = l + (r - l - gap * count) / 2; }
    else { this.cap = Math.max(3, Math.floor((r - l) / minGap)); gap = (r - l) / this.cap; this.x0 = l; }
    this.gap = gap;
    const max = Math.max(0, count - this.cap);
    this.view = clamp(this.view, 0, max); this.viewTo = clamp(this.viewTo, 0, max);
    for (const n of this.notes) n.bx = this._baseX(n);
    this.noteWrap.setAttribute('mask', this.cap < this.notes.length ? 'url(#al-fade)' : 'none');
    this._drawBars();
    this._applyView();
  }

  _baseX(n) { return this.x0 + (n.i + 0.5) * this.gap; }

  _noteX(n) {
    if (n.f !== undefined) { const [l, r] = this._span(); return l + n.f * (r - l); }
    return this._baseX(n) - this.view * this.gap;
  }

  _applyView() {
    const px = (this.view || 0) * (this.gap || 0);
    this.noteG.setAttribute('transform', `translate(${(-px).toFixed(1)} 0)`);
    for (const n of this.notes) n.x = (n.bx ?? 0) - px;
  }

  _scrollTo(s, dur = 0.38) {
    if (s === this.viewTo) return;
    this.viewTo = s;
    if (this.viewTw) this.viewTw.killed = true;
    const a = this.view;
    this.viewTw = this.stage.tween(dur, (p) => { this.view = a + (s - a) * p; this._applyView(); }, { ease: ease.inOut });
  }

  /** Keep note i in the window, with `look` notes of read-ahead after it. */
  _follow(i, look = 2) {
    if (this.cap >= this.notes.length) return;
    const W = this.cap, max = this.notes.length - W;
    let s = this.viewTo;
    if (i > s + W - 1 - look) s = Math.min(max, i - (W - 1 - look));
    if (i < s) s = Math.max(0, i - 1);
    this._scrollTo(s);
  }

  _staffBottom(clef) { const st = this.stage; return (clef === 'bass' ? st.bTop : st.tTop) + 4 * st.sp; }
  _staffTopOf(clef) { const st = this.stage; return clef === 'bass' ? st.bTop : st.tTop; }

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
    // soft edges for a scrolling window of notes
    const [l, r] = this._span();
    const x1 = l - 1.6 * sp, x2 = r + 1.6 * sp, f = (1.2 * sp) / (x2 - x1);
    const fg = svg('linearGradient', { id: 'al-fade-g', gradientUnits: 'userSpaceOnUse', x1, x2, y1: 0, y2: 0 }, defs);
    for (const [o, a] of [[0, 0], [f, 1], [1 - f, 1], [1, 0]]) svg('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': a }, fg);
    const mask = svg('mask', { id: 'al-fade', maskUnits: 'userSpaceOnUse', x: x1, y: 0, width: x2 - x1, height: st.h }, defs);
    svg('rect', { x: x1, y: 0, width: x2 - x1, height: st.h, fill: 'url(#al-fade-g)' }, mask);
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
    const room = (st.staffTop - (1.6 + (this.topExtra || 0)) * st.sp - 4) / 3.35;
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
  /** A note on the staff: head shaped by its length (song mode), stem, flags, dot, accidental, ledgers. */
  _drawNote(n) {
    n.el?.remove();
    n.el = null;
    if (!n.shown) return;
    const st = this.stage, sp = st.sp;
    const bx = n.f !== undefined ? this._noteX(n) : this._baseX(n);
    const p = st.place(n.midi, n.prefer, n.clef);
    n.bx = bx; n.y = p.y;
    n.x = n.f !== undefined ? bx : bx - this.view * this.gap;
    const g = svg('g', { class: `al-note ${n.hand === 'L' ? 'lh' : 'rh'} ${n.state || ''}` }, this.noteG);
    st.ledgers(g, bx, p.step, p.clef, 0.95);
    const acc = n.acc !== undefined ? n.acc : p.acc;
    if (acc !== null && acc !== undefined) st.glyph(g, GLYPH.acc[String(acc)], bx - 1.75 * sp, p.y);
    const d = n.d;
    const kind = d === undefined ? 'q' : d >= 3.99 ? 'w' : d >= 1.99 ? 'h' : d >= 0.99 ? 'q' : d >= 0.49 ? 'e' : 's';
    const hw = kind === 'w' ? 0.84 : 0.59;
    st.glyph(g, kind === 'w' ? GLYPH.whole : kind === 'h' ? GLYPH.half : GLYPH.black, bx - hw * sp, p.y, 'al-head');
    if (d !== undefined && [6, 3, 1.5, 0.75].some((v) => Math.abs(d - v) < 0.01)) {
      svg('circle', { cx: bx + (hw + 0.42) * sp, cy: p.y - (p.step % 2 === 0 ? 0.5 * sp : 0), r: 0.17 * sp, class: 'al-dot' }, g);
    }
    if (kind === 'w') { n.el = g; this._applyDrop(n); return; }
    const up = p.step < (p.clef === 'bass' ? 22 : 34);
    const sx = up ? bx + 0.53 * sp : bx - 0.53 * sp;
    const len = kind === 's' ? 3.7 : 3.3;
    const tip = p.y + (up ? -len : len) * sp;
    const sw = Math.max(1.2, 0.12 * sp);
    svg('line', { x1: sx, x2: sx, y1: p.y + (up ? -0.2 : 0.2) * sp, y2: tip, 'stroke-width': sw, class: 'al-stem' }, g);
    const flags = kind === 'e' ? 1 : kind === 's' ? 2 : 0;
    for (let i = 0; i < flags; i++) {
      const y0 = tip + (up ? 0.75 : -0.75) * i * sp, s = up ? 1 : -1;
      svg('path', { d: `M${sx},${y0} c${0.1 * sp},${0.85 * sp * s} ${0.95 * sp},${1.05 * sp * s} ${0.78 * sp},${2.1 * sp * s}`, 'stroke-width': sw * 1.25, class: 'al-flag' }, g);
    }
    n.el = g;
    this._applyDrop(n);
  }

  /** Bar lines between the notes of a song chunk, in the scrolling notes group. */
  _drawBars() {
    this.barG?.remove();
    this.barG = svg('g', { class: 'al-bars' });
    this.noteG.prepend(this.barG);
    const sp = this.stage.sp;
    for (let i = 1; i < this.notes.length; i++) {
      const a = this.notes[i - 1], b = this.notes[i];
      if (a.bar === undefined || a.bar === b.bar) continue;
      const x = (a.bx + b.bx) / 2 + (b.acc !== null && b.acc !== undefined ? -0.5 * sp : 0);
      const top = this._staffTopOf(b.clef);
      svg('line', { x1: x, x2: x, y1: top, y2: top + 4 * sp, class: 'al-barline' }, this.barG);
    }
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
    const p = st.place(midi, isBlack(midi) && n.prefer && Math.abs(midi - n.midi) <= 2 ? n.prefer : undefined, clef);
    if (p.y < 0 || p.y > st.h) return;
    const x = n.x + 1.2 * sp;
    const g = svg('g', { class: 'al-ghost' }, st.layers.fx);
    st.ledgers(g, x, p.step, p.clef, 0.95);
    st.glyph(g, GLYPH.black, x - 0.59 * sp, p.y);
    const fs = clamp(1.05 * sp, 12, 20);
    const t = svg('text', { x: x - 0.25 * sp, y: p.y - 0.8 * sp, 'font-size': fs, class: 'al-ghost-label' }, g);
    t.textContent = p.name;
    st.tween(1.5, (q) => {
      const shake = q < 0.25 ? Math.sin(q * 60) * (1 - q / 0.25) * 0.25 * sp : 0;
      g.setAttribute('transform', `translate(${shake.toFixed(1)} 0)`);
      g.setAttribute('opacity', q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4);
    }, { done: () => g.remove() });
  }

  /** Beam every note in view back up into the saucer. */
  _collect() {
    const st = this.stage, sp = st.sp, [l, r] = this._span();
    const shown = this.notes.filter((n) => n.shown && n.el);
    for (const n of shown) if (n.x < l - this.gap || n.x > r + this.gap) { n.el.remove(); n.el = null; n.shown = false; }
    const vis = shown.filter((n) => n.el);
    this.barG?.setAttribute('opacity', 0);
    if (!vis.length) return;
    this.ship.anchor = 'center';
    for (const n of vis) { if (n.state === 'dim') this._setState(n, ''); }
    this.beam.dir = -1;
    this.sfx.beam(0.55, true);
    this._beam(() => {
      const xs = vis.map((n) => n.x), ys = vis.map((n) => n.y);
      const a = Math.min(...xs), b = Math.max(...xs);
      return { x: (a + b) / 2, y: Math.max(...ys) + 0.9 * sp, w: (b - a) / 2 + 1.3 * sp };
    }, true, 0.15);
    vis.forEach((n, j) => {
      st.tween(0.42, (p) => {
        if (!n.el) return;
        const dx = (this.ship.px - n.x) * p, dy = (this._emitY() - n.y) * p, s = 1 - 0.75 * p;
        n.el.setAttribute('transform', `translate(${(n.bx + dx).toFixed(1)} ${(n.y + dy).toFixed(1)}) scale(${s.toFixed(3)}) translate(${(-n.bx).toFixed(1)} ${(-n.y).toFixed(1)})`);
        n.el.setAttribute('opacity', (1 - 0.7 * p).toFixed(2));
      }, { ease: ease.in, delay: 0.18 + j * Math.min(0.06, 0.6 / vis.length), done: () => { n.shown = false; n.el?.remove(); n.el = null; } });
    });
    this._after(0.4 + Math.min(0.6, vis.length * 0.06), () => { this._beam(null, false, 0.25); this.beam.dir = 1; });
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

  /** How much help the current note gets: the copy's level, raised after repeated misses. */
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
    this._follow(this.idx, 2);
    this._windows(n.hand, lvl >= 1 ? n.finger : null);
    if (lvl >= 2) kb.mark(n.midi, n.hand === 'L' ? 'cue-l' : 'cue-r', true);
    // song fingerings change within a phrase, so only the key in play shows its finger
    if (this.songLevel) { kb.clearFingers(); if (lvl >= 2 && n.finger) kb.setFinger(n.midi, n.finger); }
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

  // ---------- made-up phrases (the concept levels) ----------
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
    const pos = this.lv.pos, def = Object.keys(pos)[0];
    return str.trim().split(/\s+/).map((tok) => {
      const [, hd, d] = /^([LR]?)(\d)$/.exec(tok);
      const hand = hd || def;
      return { midi: pos[hand][+d], hand, finger: hand === 'L' ? 5 - +d : +d + 1 };
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

  // ---------- songs ----------
  /** The song in play: its score, the hand's line in learning phrases (cached per song, hand and range). */
  _song() {
    const lv = this.lv, def = this.songDef;
    if (!def) return null;
    const hand = lv.hands === 'L' ? 'L' : 'R';
    const key = `${def.id}|${hand}|${lv.fromBar ?? ''}|${lv.toBar ?? ''}`;
    if (this._songCache?.key === key) return this._songCache;
    const score = buildScore(def);
    const range = { fromBar: lv.fromBar ?? 0, toBar: lv.toBar ?? Infinity };
    const raw = phrasesOf(score, hand, { min: 3, max: 8, ...range });
    // sparse accompaniment lines come out in phrases of one or two notes: fold them together
    const phrases = [];
    for (const p of raw) {
      const last = phrases[phrases.length - 1];
      if (last && (last.notes.length < 3 || p.notes.length < 3) && last.notes.length + p.notes.length <= 9) {
        last.notes = last.notes.concat(p.notes); last.toBar = p.toBar;
      } else phrases.push({ ...p, notes: [...p.notes] });
    }
    phrases.forEach((p, i) => {
      this._fingerFill(p.notes, hand, score.key);
      for (const n of p.notes) { n.pi = i; n.hand = hand; }
    });
    const line = phrases.flatMap((p) => p.notes);
    this._songCache = {
      key, def, score, hand, phrases, line, noteBars: new Set(line.map((n) => n.bar)),
      whole: range.fromBar <= 0 && range.toBar === Infinity,
      fromBar: phrases[0]?.fromBar ?? 0, toBar: phrases[phrases.length - 1]?.toBar ?? 0,
    };
    return this._songCache;
  }

  /**
   * Fill in fingers the song doesn't give: from the nearest fingered note (keeping the hand where it
   * is), otherwise the five-finger rule when the phrase fits under one hand. Unknown stays unlit.
   */
  _fingerFill(notes, hand, key) {
    const dir = hand === 'L' ? -1 : 1;
    const steps = notes.map((n) => spell(n.midi, key, n.prefer).step);
    const known = notes.map((n, i) => (n.finger ? i : -1)).filter((i) => i >= 0);
    const lo = Math.min(...steps), span = Math.max(...steps) - lo;
    notes.forEach((n, i) => {
      if (n.finger) return;
      let f = null, best = -1, bd = 1e9;
      for (const j of known) { const d = Math.abs(j - i) + (j > i ? 0.5 : 0); if (d < bd) { bd = d; best = j; } }
      if (best >= 0) { const g = notes[best].finger + dir * (steps[i] - steps[best]); if (g >= 1 && g <= 5) f = g; }
      if (f === null && span <= 4) f = hand === 'L' ? 5 - (steps[i] - lo) : steps[i] - lo + 1;
      n.finger = f;
    });
  }

  /**
   * The chaining plan: each new phrase is shown and copied twice (guided, then from memory), then
   * joined to the phrases before it and played once from memory. Joins grow from the start of the
   * section while they stay short (JOIN_MAX notes), then slide along in pairs. Songs repeat
   * themselves, so a phrase heard before is not taught again, one that starts like an earlier phrase
   * goes straight to memory, and a stretch already played from memory is not joined twice. Short
   * songs end with one run through the whole tune.
   */
  _songSteps(phrases) {
    const steps = [], played = new Set();
    const sig = (notes) => notes.map((n) => n.midi).join(',');
    const count = (a, b) => phrases.slice(a, b + 1).reduce((s, p) => s + p.notes.length, 0);
    phrases.forEach((p, i) => {
      const me = sig(p.notes);
      p.same = phrases.findIndex((q, j) => j < i && sig(q.notes) === me);
      const head = Math.max(3, Math.ceil(p.notes.length * 0.6));
      p.like = p.same >= 0 || p.notes.length < 4 ? -1
        : phrases.findIndex((q, j) => j < i && q.notes.length >= head && sig(q.notes.slice(0, head)) === sig(p.notes.slice(0, head)));
    });
    let start = 0;
    phrases.forEach((p, k) => {
      if (p.same < 0) steps.push({ kind: 'new', from: k, to: k, helps: p.like >= 0 ? [0] : [2, 0], surprise: phrases.length === 1 });
      if (k === 0) return;
      let j = start;
      while (j < k - 1 && count(j, k) > JOIN_MAX) j++;
      start = j;
      const key = sig(phrases.slice(j, k + 1).flatMap((q) => q.notes));
      if (played.has(key)) return;
      played.add(key);
      steps.push({ kind: 'join', from: j, to: k, helps: [0], surprise: true });
    });
    if (phrases.length > 2 && count(0, phrases.length - 1) <= 24) {
      steps.push({ kind: 'whole', from: 0, to: phrases.length - 1, helps: [1], surprise: true });
    }
    for (const s of steps) s.notes = phrases.slice(s.from, s.to + 1).flatMap((p) => p.notes);
    return steps;
  }

  /** Bars of the song (for this hand) learned from memory; a repeated phrase counts once its twin is learned. */
  _learnedBars() {
    const s = this._song(), out = new Set();
    s.phrases.forEach((p, i) => {
      if (this.learned.has(i) || (p.same >= 0 && this.learned.has(p.same))) for (const n of p.notes) out.add(n.bar);
    });
    return out;
  }

  /** Bar numbers as a musician counts them: the pickup is not bar 1. */
  _bars(a, b) {
    const pick0 = (this._song()?.score.pickup || 0) > 0;
    const lab = (x) => (pick0 ? x : x + 1);
    if (pick0 && a === 0 && b === 0) return 'the pickup';
    const la = Math.max(1, lab(a)), lb = lab(b);
    return la === lb ? `bar ${la}` : `bars ${la}–${lb}`;
  }

  // ---------- notes for a chunk ----------
  /** Notes ready for the staff: clef, spelling, and accidentals as a musician would write them. */
  _dress(spec) {
    const st = this.stage, staves = st.opts.staves, key = st.opts.key || 'C', song = this.songLevel;
    const sig = keySigMap(key);
    let bar = null, seen = new Map();
    return spec.map((n, i) => {
      const out = {
        ...n, i,
        clef: staves !== 'grand' ? staves : n.hand === 'L' ? (n.midi <= 62 ? 'bass' : 'treble') : (n.midi >= 57 ? 'treble' : 'bass'),
        prefer: n.prefer ?? (!song && isBlack(n.midi) ? 'sharp' : undefined),
        shown: false, drop: 1, state: '', el: null, x: 0, y: 0, bx: 0,
      };
      if (song) {
        // an accidental lasts to the bar line: show altered notes, and a natural where one is cancelled
        if (n.bar !== bar) { bar = n.bar; seen = new Map(); }
        const s = spell(n.midi, key, out.prefer);
        const sigAlter = sig[s.letter] || 0;
        out.acc = s.alter !== sigAlter ? s.alter : seen.has(s.step) && seen.get(s.step) !== s.alter ? 0 : null;
        seen.set(s.step, s.alter);
      }
      return out;
    });
  }

  // ---------- attract: the saucer drifts and beams notes silently ----------
  attract() {
    this.mode = 'attract';
    this.ship.anchor = { f: 0.72 };
    const t = this._anchorXY(this.ship.anchor);
    this.ship.x = t.x; this.ship.y = t.y;
    if (this.songLevel) {
      const s = this._song();
      this.attractPool = s ? s.line.slice(0, 16) : [];
    } else {
      const lv = this.game.levels[this.level];
      this.attractPool = Object.entries(lv.pos).flatMap(([hand, list]) => list.map((midi) => ({ midi, hand })));
    }
    this.attractI = 0;
    if (this.attractPool.length) this._after(0.6, () => this._attractBeam());
  }

  _attractBeam() {
    if (this.mode !== 'attract') return;
    const song = this.songLevel;
    const i = this.attractI++;
    const f = song ? 0.06 + (i % 8) * 0.12 : rand(0.06, 0.94);
    this.ship.anchor = { f };
    this._after(0.75, () => {
      const src = song ? this.attractPool[i % this.attractPool.length] : pick(this.attractPool);
      const n = this._dress([{ ...src, finger: null }])[0];
      n.f = f;
      this.decor.push(n);
      this._beam(this._noteTarget(n), true, 0.12);
      this._dropNote(n, 0.3);
      this._after(0.55, () => this._beam(null, false, 0.3));
      this._after(2.6, () => {
        const g = n.el;
        if (g) this.stage.tween(0.6, (p) => g.setAttribute('opacity', 1 - p), { done: () => { g.remove(); this.decor = this.decor.filter((d) => d !== n); } });
      });
      this._after(song ? 1.0 : 1.4, () => this._attractBeam());
    });
  }

  // ---------- round ----------
  start() {
    const lv = this.lv, song = this.songLevel;
    this.reset();
    this.mode = 'play';
    this.playing = true;
    this.score = 0; this.right = 0; this.done = 0; this.errors = 0;
    this.surprises = 0; this.surpriseChances = 0; this.timeouts = 0; this.stepsDone = 0;
    this.learned = new Set(); this.phraseErr = [];
    this.surpriseOrder = shuffle(['wave', 'hop', 'spin']);
    this.k = -1; this.rep = -1; this.help = 2; this.miss = 0; this.idx = 0; this.timed = false;
    this.fingerKeys = new Map();
    let all;
    if (song) {
      const s = this._song();
      if (!s || !s.phrases.length) { this.plan = []; this._end(true); return; }
      this.plan = this._songSteps(s.phrases);
      all = s.line.map((n) => n.midi);
      // let the coach tie trouble to bars of this song
      const cur = this.app.coach.current;
      if (cur) Object.assign(cur.context, { ref: { type: 'song', id: s.def.id }, score: s.score, hands: s.hand, staves: this.stage.opts.staves });
      this.app.ui.prompt(this.embedded?.text || `${s.def.title}${s.hand === 'L' ? ', left hand' : ''}: ${s.phrases.length} phrase${s.phrases.length > 1 ? 's' : ''} to learn. Watch the saucer.`);
    } else {
      const reps = Math.max(1, Math.round(lv.reps || 3));
      const helps = Array.from({ length: reps }, (_, r) => (reps > 1 && r === reps - 1 ? 0 : r === 0 ? 2 : 1));
      this.plan = this._makePhrases().map((notes) => ({ kind: 'phrase', notes, helps, surprise: true }));
      // finger numbers for the keyboard: the whole five-finger position(s) in play
      if (lv.pos && !lv.phrases?.length) {
        for (const [hand, list] of Object.entries(lv.pos)) list.forEach((m, d) => this.fingerKeys.set(m, hand === 'L' ? 5 - d : d + 1));
      } else {
        for (const st of this.plan) for (const n of st.notes) if (n.finger) this.fingerKeys.set(n.midi, n.finger);
      }
      all = this.plan.flatMap((st) => st.notes.map((n) => n.midi)).concat([...this.fingerKeys.keys()]);
      this.app.ui.prompt(this.embedded?.text || 'Watch the saucer. The aliens play a phrase, then you copy it.');
    }
    this.app.keyboard.need(Math.min(...all), Math.max(...all));
    this.app.ui.status('');
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this._end(true) }, 'Stop'));
    // fly in from the top left
    this.ship.x = -5 * this.u; this.ship.y = -3 * this.u;
    this.ship.anchor = 'center';
    this.phase = 'arrive';
    this._after(0.35, () => this.sfx.loop('hum', 0.045));   // a gentle hover hum; finish() stops it
    this._after(1.1, () => this._step(0));
    this._hud();
  }

  /** One step of the plan: the aliens beam and play the chunk, then the copies begin. */
  _step(k) {
    const step = this.plan[k], song = this.songLevel;
    this.k = k; this.cur = step;
    for (const n of this.notes) n.el?.remove();
    this.notes = this._dress(step.notes);
    this.helps = step.helps;
    this.rep = -1; this.phase = 'demo'; this.pRight = 0; this.idx = 0;
    if (this.viewTw) this.viewTw.killed = true;
    this.view = 0; this.viewTo = 0;
    this.chunkUp = song ? this._extent(this.notes, this.stage.opts.key).up : 0;
    this._layoutNotes();
    const n = this.notes.length;
    if (!this.embedded?.text) {
      if (song) {
        const s = this._song(), P = s.phrases.length, title = s.def.title;
        const where = this._bars(this.notes[0].bar, this.notes[n - 1].bar);
        const ph = s.phrases[step.to];
        this.app.ui.prompt(step.kind === 'new'
          ? (ph.like >= 0 ? `${title}, phrase ${step.from + 1} of ${P} (${where}) starts like phrase ${ph.like + 1}. Listen for what changes.` : `${title}, phrase ${step.from + 1} of ${P} (${where}): watch and listen.`)
          : step.kind === 'join'
            ? (ph.same >= 0 ? `Phrase ${step.to + 1} is phrase ${ph.same + 1} again, so you know it. Here it is joined up (${where}).` : `Now phrases ${step.from + 1} to ${step.to + 1} joined up (${where}). Listen to how they connect.`)
            : `The whole of ${title}. Listen once more.`);
      } else {
        const grand = this.stage.opts.staves === 'grand';
        this.app.ui.prompt(`Watch and listen: ${n} notes. The lit window shows which finger plays each note.${grand ? ' Blue notes are for the left hand.' : ''}`);
      }
    }
    this.app.ui.status('');
    const again = song && step.kind === 'join' && this._song().phrases[step.to].same >= 0;
    this._banner(step.kind === 'join' ? (again ? 'You know this' : 'Join up') : step.kind === 'whole' ? 'Whole song' : 'Listen');
    this._fingerMap(!song);
    const gaps = this._gaps(step);
    this.dropT = clamp(Math.min(...gaps) * 0.6, 0.16, 0.24);
    let t = 0.45;
    this.notes.forEach((note, i) => { this._after(t, () => this._demoNote(note, gaps[i], i === n - 1)); t += gaps[i]; });
    this._after(t + 0.35, () => this._turn(0));
    this._hud();
  }

  /** Seconds between demo notes: even for made-up phrases; the song's own rhythm, a little slower, for songs. */
  _gaps(step) {
    const ns = this.notes;
    if (!this.songLevel) { const g = this.lv.tempo || (ns.length >= 6 ? 0.78 : 0.85); return ns.map(() => g); }
    const spb = 60 / (this._song().score.tempo || 90);
    const slow = step.kind === 'new' ? 0.72 : 1, min = step.kind === 'new' ? 0.42 : 0.3;
    return ns.map((x, i) => {
      const ioi = i + 1 < ns.length ? ns[i + 1].t - x.t : x.d || 1;
      return clamp((Math.min(ioi, 2.5) * spb) / slow, min, 1.4);
    });
  }

  _demoNote(n, gap, last) {
    const kb = this.app.keyboard, song = this.songLevel, drop = this.dropT || 0.24;
    this.ship.anchor = { i: n.i };
    this._follow(n.i, 1);
    this._after(0.2, () => {
      if (gap >= 0.55 || n.i === 0) this.sfx.beam(0.4);
      this._beam(this._noteTarget(n), true, 0.1);
      this._windows(n.hand, n.finger);
      kb.clear('demo');
      kb.mark(n.midi, 'demo', true);
      if (song) { kb.clearFingers(); if (n.finger) kb.setFinger(n.midi, n.finger); }
      this._dropNote(n, drop);
      this._after(drop, () => this.app.sound.play(n.midi, 0.78, undefined, gap * 0.95));
      this._after(Math.max(0.2, Math.min(gap - 0.12, 0.55)), () => {
        kb.mark(n.midi, 'demo', false);
        if (gap >= 0.6 || last) this._beam(null, false, 0.18);
        if (song && last) kb.clearFingers();
      });
    });
  }

  _turn(r) {
    const n = this.notes.length, song = this.songLevel, kind = this.cur.kind;
    this.rep = r; this.idx = 0; this.miss = 0; this.repRight = 0;
    this.help = this.helps[r];
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
    this.barG?.setAttribute('opacity', 1);
    this._scrollTo(0);
    const { ui } = this.app;
    if (!this.embedded?.text) {
      ui.prompt(this.help === 2 ? 'Your turn. Play the note above the red triangle, with the finger in the lit window.'
        : this.help === 1 ? (kind === 'whole' ? 'Play the whole song. The triangle and the lit window show the way.' : 'Again, with less help: just the triangle and the finger number.')
          : kind === 'join' ? 'Play them together from memory, before the red bar runs out.' : 'Now from memory, before the red bar runs out.');
    }
    ui.status(song ? (kind === 'new' ? (this.help ? 'Guided copy' : 'From memory') : kind === 'join' ? 'Joined up, from memory' : 'The whole song') : `Copy ${r + 1} of ${this.helps.length}`);
    this._banner(this.help === 2 ? 'Your turn' : this.help === 0 ? 'From memory' : kind === 'whole' ? 'Play it through' : 'Less help');
    this._windows('R', null);
    this._fingerMap(!song && this.help >= 2);
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

  /** Coach info for a note: the song's key and the beat, so trouble can be tied to bars. */
  _coachInfo(n) { return this.songLevel ? { key: this.stage.opts.key, t: n.t } : { key: 'C' }; }

  _right(n) {
    const st = this.stage, sp = st.sp;
    const first = this.miss === 0;
    if (first) { this.right++; this.pRight++; this.repRight++; }
    this.done++;
    const pts = Math.round([100, 75, 50][this.help] * (first ? 1 : 0.5));
    this.score += pts;
    this.app.coach.record('hit', this._coachInfo(n));
    this.app.keyboard.flash(n.midi, 'hit');
    this._setState(n, 'hit');
    st.puff(n.x, n.y, '#62c993', 7, 0.22);
    st.float(n.x, n.y - 1.7 * sp, `+${pts}`);
    this._zap(n);
    this.idx++; this.miss = 0;
    if (this.idx >= this.notes.length) this._repDone(); else this._cues();
    this._hud();
  }

  _wrong(n, midi) {
    this.miss++; this.errors++;
    if (n.pi !== undefined) this.phraseErr[n.pi] = (this.phraseErr[n.pi] || 0) + 1;
    this.score = Math.max(0, this.score - 20);
    this.app.coach.record('wrong-pitch', { expected: n.midi, played: midi, ...this._coachInfo(n) });
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

  /** A memory copy finished: in song mode, the phrases in it count as learned when 80% were right. */
  _memory(frac) {
    if (!this.songLevel || this.help !== 0) return;
    if (frac >= (this.lv.surprise ?? 0.8)) for (let p = this.cur.from; p <= this.cur.to; p++) this.learned.add(p);
  }

  _repDone() {
    const st = this.stage;
    this.phase = 'between';
    this.triOn = false; this._placeTri();
    this.app.keyboard.clear('cue-r', 'cue-l');
    if (this.songLevel) this.app.keyboard.clearFingers();
    this._windows('R', null, 'party');
    this._memory(this.repRight / this.notes.length);
    if (this.timed && this.timeLeft > 0) {
      const b = Math.round(this.timeLeft * 10);
      this.score += b;
      st.float(st.right - 1.35 * st.sp, st.staffTop - 0.4 * st.sp, `+${b}`);
    }
    this.timed = false;
    this._timeBar();
    this._hud();
    if (this.rep < this.helps.length - 1) this._after(0.85, () => this._turn(this.rep + 1));
    else this._after(0.6, () => this._stepDone());
  }

  _timeUp() {
    this.phase = 'timeup';
    this.timeouts++;
    const n = this.notes[this.idx];
    if (n) this.app.coach.record('missed', { expected: n.midi, ...this._coachInfo(n) });
    this.done += this.notes.length - this.idx;
    for (const m of this.notes.slice(this.idx)) {
      this._setState(m, 'late');
      if (m.pi !== undefined) this.phraseErr[m.pi] = (this.phraseErr[m.pi] || 0) + 1;
    }
    this._memory(this.repRight / this.notes.length);
    this.triOn = false; this._placeTri();
    this.app.keyboard.clear('cue-r', 'cue-l');
    if (this.songLevel) this.app.keyboard.clearFingers();
    this._windows('R', null, 'sad');
    this._mouth('frown', 1.2);
    this.sfx.buzz();
    this._banner('Time is up');
    this.app.ui.status('Out of time. These were the notes left.');
    this._after(1.5, () => { this.timed = false; this._timeBar(); this._stepDone(); });
  }

  /** After the last copy of a step: beam the notes up, maybe a surprise, then on to the next step. */
  _stepDone() {
    const step = this.cur, song = this.songLevel, last = this.k + 1 >= this.plan.length;
    const slots = this.notes.length * this.helps.length;
    const need = this.lv.surprise ?? 0.8;
    const ok = this.pRight / slots >= need;
    this.stepsDone++;
    this.phase = 'collect';
    this.app.ui.status('');
    this._collect();
    let wait;
    if (step.surprise) this.surpriseChances++;
    if (step.surprise && ok) {
      this.surprises++;
      const short = song && !last;
      this._after(0.75, () => this._surprise(short));
      wait = 0.75 + (short ? 3.3 : 5.0);
    } else if (step.surprise) {
      this._windows('R', null, 'sad');
      this._mouth('frown', 1.4);
      if (!this.embedded?.text) this.app.ui.prompt(`${this.pRight} of ${slots} right first time. The aliens wanted ${Math.round(need * 100)}% for their surprise.`);
      this._banner('So close');
      wait = 1.8;
    } else {
      // a new song phrase: no surprise yet (it comes after the join), just a word and on we go
      this._banner(ok ? 'Got it' : 'Keep going');
      if (!ok) this._mouth('frown', 0.8);
      wait = 0.95;
    }
    this._after(wait, () => {
      this._windows('R', null);
      if (!last) this._step(this.k + 1); else this._end(false);
    });
    this._hud();
  }

  // ---------- the aliens' surprise ----------
  /** The hatch opens and the aliens come out to dance. `short` is the quick one between song joins. */
  _surprise(short = false) {
    const st = this.stage, sp = st.sp, s = this.ship;
    this.phase = 'surprise';
    const kind = this.surpriseOrder[(this.surprises - 1) % this.surpriseOrder.length];
    const count = short ? 2 : this.surprises % 2 ? 3 : 2;
    const bonus = 150 + 40 * Math.min(this.notes.length, 12);
    const T = short ? { drop: 0.5, dance: 0.6, dur: 1.15, home: 1.8, loop: 2.3, bonus: 2.55, end: 3.1 }
      : { drop: 1.0, dance: 1.15, dur: 1.95, home: 3.2, loop: 3.85, bonus: 4.25, end: 4.9 };
    if (!this.embedded?.text) {
      const song = this.songLevel && this._song();
      this.app.ui.prompt(song && this.k + 1 >= this.plan.length ? `You played ${song.def.title} from memory. The aliens are throwing a party!`
        : pick(['Surprise! The aliens loved that.', 'The aliens are coming out to say thanks!', 'You played it from memory. Party on the saucer!']));
    }
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
      st.tween(short ? 0.5 : 0.62, (p) => { a.f = p; a.dy = -Math.sin(p * Math.PI) * 0.6; this._pose(a); }, { ease: ease.out, delay: 0.15 + i * 0.16 });
    });
    this._after(T.drop, () => this._beam(null, false, 0.3));
    this._after(T.dance, () => this._dance(kind, T.dur));
    this._after(T.home, () => this._aliensHome());
    this._after(T.loop, () => { this._hatch(false); this._loop(short ? 0.8 : 1.05); });
    this._after(T.bonus, () => {
      this.score += bonus;
      st.float(s.px, s.py - 2.4 * this.u, `+${bonus}`, 'ar-float al-bonus');
      this._hud();
    });
    this._after(T.end, () => this._mouth('smile'));
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

  _dance(kind, dur = 1.95) {
    const st = this.stage, al = this.aliens;
    if (kind === 'hop') {
      // the aliens hop in turn and replay the phrase, an octave up
      const step = dur < 1.5 ? 0.17 : 0.24;
      const tune = this.notes.slice(0, Math.max(3, Math.floor((dur - 0.3) / step))).map((n) => n.midi + 12);
      tune.forEach((m, j) => this._after(j * step, () => {
        const a = al[j % al.length];
        this.app.sound.play(m, 0.6, undefined, 0.3);
        st.tween(step, (p) => { a.dy = -Math.sin(p * Math.PI) * 0.9; a.armL = a.armR = 70 * Math.sin(p * Math.PI); this._pose(a); });
      }));
      this._after(tune.length * step + 0.05, () => {
        this.sfx.bell();
        al.forEach((a) => st.tween(0.4, (p) => { a.dy = -Math.sin(p * Math.PI) * 1.4; a.armL = a.armR = 120 * Math.sin(p * Math.PI); this._pose(a); }));
      });
    } else if (kind === 'spin') {
      // a conga line that spins as it shuffles, to the phrase as a fanfare
      this.sfx.fanfare(this.notes.slice(0, 8).map((n) => n.midi + 12), 0.12);
      st.tween(dur, (p) => al.forEach((a, i) => {
        a.sx = Math.cos(p * Math.PI * 4 + i * 0.6);
        a.dx = Math.sin(p * Math.PI * 2) * 1.3;
        a.dy = -Math.abs(Math.sin(p * Math.PI * 8 + i)) * 0.25;
        a.armL = a.armR = 40 + 30 * Math.sin(p * 20 + i);
        this._pose(a);
      }), { done: () => al.forEach((a) => { a.sx = 1; a.dx = 0; a.dy = 0; this._pose(a); }) });
    } else {
      // everybody waves
      this.sfx.fanfare([72, 76, 79, 84]);
      st.tween(dur, (p) => al.forEach((a, i) => {
        const t = p * dur;
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
  _loop(dur = 1.05) {
    const st = this.stage, s = this.ship, sp = st.sp, dir = pick([-1, 1]);
    this.sfx.whoosh();
    let last = 0;
    st.tween(dur, (p) => {
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
  /** Lowest point of the chunk on the staff: noteheads, down-stems, and the triangle row under them. */
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
    if (this.k < 0) return;
    const cx = st.w / 2;
    if (this.songLevel) {
      const s = this._song(), c = this.cur;
      if (c.kind === 'new') label(st.right - sp, 'end', 'PHRASE', `${c.from + 1} of ${s.phrases.length}`);
      else if (c.kind === 'join') label(st.right - sp, 'end', 'PHRASES', `${c.from + 1}–${c.to + 1}`);
      else label(st.right - sp, 'end', 'WHOLE SONG', '');
      this._strip(g, cx, y, fs);
      return;
    }
    label(st.right - sp, 'end', 'PHRASE', `${this.k + 1} of ${this.plan.length}`);
    // centre: listening, or one pip per copy
    if (this.phase === 'demo') { label(cx, 'middle', 'LISTEN', ''); return; }
    const r = Math.max(4, 0.36 * fs);
    const gap = r * 3;
    const n = this.helps.length;
    const x0 = cx - ((n - 1) * gap) / 2 + fs * 1.6;
    label(x0 - r * 2.2, 'end', 'COPY', '');
    for (let i = 0; i < n; i++) {
      const done = i < this.rep || (i === this.rep && this.phase !== 'turn' && this.phase !== 'timeup') || this.phase === 'collect' || this.phase === 'surprise';
      const cur = i === this.rep && (this.phase === 'turn' || this.phase === 'timeup');
      svg('circle', { cx: x0 + i * gap, cy: y, r, class: `al-pip${done ? ' done' : cur ? ' cur' : ''}` }, g);
    }
  }

  /** The song's bars as a strip: learned from memory (mint), in play now (brass), still to come. */
  _strip(g, cx, y, fs) {
    const s = this._song(), st = this.stage;
    const bars = s.toBar - s.fromBar + 1;
    const learned = this._learnedBars();
    const now = new Set(this.notes.map((n) => n.bar));
    const w = Math.min(st.w * (st.w < 520 ? 0.34 : 0.4), bars * 14);
    const seg = w / bars, hh = Math.max(5, fs * 0.45), x0 = cx - w / 2;
    for (let i = 0; i < bars; i++) {
      const b = s.fromBar + i;
      svg('rect', {
        x: (x0 + i * seg + (seg > 4 ? 1 : 0.5)).toFixed(1), y: (y - hh / 2).toFixed(1),
        width: Math.max(1.5, seg - (seg > 4 ? 2 : 1)).toFixed(1), height: hh.toFixed(1), rx: Math.min(2, seg / 4).toFixed(1),
        class: `al-seg${!s.noteBars.has(b) ? ' rest' : now.has(b) && this.phase !== 'collect' && this.phase !== 'surprise' ? ' cur' : learned.has(b) ? ' done' : ''}`,
      }, g);
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
    const acc = this.done ? this.right / total : 0;
    if (!stopped && acc >= 0.9) this.sfx.fanfare();
    const passed = this.done > 0 && acc >= (this.embedded?.pass ?? 0.7);
    const rightStat = ['Right first time', `${this.right} of ${this.done}${this.done ? ` (${Math.round(acc * 100)}%)` : ''}`];
    const surpriseStat = this.surpriseChances ? [['Alien surprises', `${this.surprises} of ${this.surpriseChances}`]] : [];
    if (this.songLevel && this._song()?.phrases.length) {
      const s = this._song(), title = s.def.title;
      const bars = s.noteBars.size, learnedBars = this._learnedBars();
      const part = s.whole ? '' : `, ${this._bars(s.fromBar, s.toBar)}`;
      let worst = -1;
      this.phraseErr.forEach((e, i) => { if (e && (worst < 0 || e > this.phraseErr[worst])) worst = i; });
      const wp = worst >= 0 ? s.phrases[worst] : null;
      const work = wp ? `Phrase ${worst + 1}, ${this._bars(wp.fromBar, wp.toBar)} (${this.phraseErr[worst]} slip${this.phraseErr[worst] > 1 ? 's' : ''})` : 'None, a clean run';
      const all = learnedBars.size >= bars;
      this.finish({
        score: this.score, passed, accuracy: acc,
        detail: `${title}${part}${s.hand === 'L' ? ' (left hand)' : ''}: ${all ? 'every bar' : `${learnedBars.size} of ${bars} bars`} learned from memory.${wp ? ` Work on phrase ${worst + 1} (${this._bars(wp.fromBar, wp.toBar)}) next.` : all ? ' Now play it for real!' : ''}`,
        stats: [
          ['Song', `${title}${part}${s.hand === 'L' ? ', left hand' : ''}`],
          ['Learned from memory', `${learnedBars.size} of ${bars} bars`],
          rightStat,
          ['Needed the most help', work],
          ...surpriseStat,
          ...(this.timeouts ? [['Ran out of time', String(this.timeouts)]] : []),
        ],
      });
      return;
    }
    this.finish({
      score: this.score, passed, accuracy: acc,
      detail: `${this.right} of ${this.done} notes right first time${this.surprises ? `, and ${this.surprises} alien surprise${this.surprises > 1 ? 's' : ''}` : ''}.`,
      stats: [
        rightStat,
        ...surpriseStat,
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
