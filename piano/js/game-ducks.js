// Ducks: the Miracle's shooting gallery. Ducks swim right to left along the lines and spaces of the
// staff; play the note the leftmost duck sits on to hit it with a paint bomb. A miss splats paint
// on the staff where the note you played lives, so you can see how far off you were.
// Song mode ("Read a song"): the ducks swim a real song's melody in order, spaced like the music,
// with bar posts between bars, so a round is a read-through of that song.
import { ArcadeBase, svg, rand, pick, ease, clamp, PAINT, melodyOf } from './arcade.js';
import { noteName, buildScore } from './theory.js';
import { h } from './ui.js';

const whites = (lo, hi) => { const out = []; for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) out.push(m); return out; };
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

export const GAME = {
  id: 'ducks', title: 'Ducks',
  summary: 'The shooting gallery. Play the note each duck is swimming on before it gets away.',
  how: 'Ducks swim along the lines and spaces. Play the note the leftmost duck is on to hit it with a paint bomb. You get a few throws per duck, and a miss splats on the note you played.',
  skill: 'reading',
  levels: [
    { name: 'Middle C to G', staves: 'treble', pool: whites(60, 67), throws: 3, speed: 0.9, count: 15 },
    { name: 'Up to high C', staves: 'treble', pool: whites(60, 72), throws: 3, speed: 1, count: 20 },
    { name: 'The treble staff', staves: 'treble', pool: whites(62, 79), throws: 2, speed: 1.1, count: 20 },
    { name: 'Bass C to G', staves: 'bass', pool: whites(48, 55), throws: 3, speed: 0.9, count: 15 },
    { name: 'The bass staff', staves: 'bass', pool: whites(43, 57), throws: 2, speed: 1.1, count: 20 },
    { name: 'Both staves', staves: 'grand', pool: whites(43, 79), throws: 2, speed: 1.15, count: 24 },
    { name: 'Ledger lines', staves: 'treble', pool: [55, 57, 59, 60, 79, 81, 83, 84], throws: 2, speed: 1.05, count: 20 },
    { name: 'Sharps and flats', staves: 'treble', pool: range(60, 72), accidentals: true, throws: 2, speed: 1.05, count: 20 },
    { name: 'Read a song', song: true, throws: 3, speed: 0.9 },
  ],
  songHow: 'The ducks swim the song’s melody in order, spaced like the music, with a post at every bar line. Play each duck’s note to hit it. By the last duck you have read the whole tune.',
};

const BODY = { brass: ['#d9a93a', '#b4861f'], chalk: ['#e8ede3', '#b9c7bd'], mint: ['#7fd3a6', '#4ea77a'] };

export class Game extends ArcadeBase {
  stageOptions() {
    const lv = this.lv;
    const base = { mTop: 3.2, mBot: 3, padTop: 0.13, padBot: 0.2, maxSp: 26 };
    if (this.songLevel) {
      const m = this._songMaterial();
      if (m) return { ...base, staves: m.staves, key: m.key };
    }
    return { ...base, staves: lv.staves || 'treble', key: 'C' };
  }

  /** The melody to read on the song level: { title, seq, key, staves, hand, bars }. Cached per song and hand. */
  _songMaterial() {
    const lv = this.lv;
    const def = this.songDef;
    if (!def) return null;
    const hand = lv.hands === 'L' ? 'L' : 'R';
    const k = `${def.id}|${hand}|${lv.fromBar ?? ''}|${lv.toBar ?? ''}`;
    if (this._mat?.k === k) return this._mat;
    const score = buildScore(def);
    const seq = melodyOf(score, hand, { fromBar: lv.fromBar ?? 0, toBar: lv.toBar ?? Infinity });
    if (!seq.length) return null;
    const lo = Math.min(...seq.map((n) => n.midi)), hi = Math.max(...seq.map((n) => n.midi));
    const staves = hand === 'R' ? (lo < 55 ? 'grand' : 'treble') : (hi > 65 ? 'grand' : 'bass');
    const bars = [seq[0].bar, seq[seq.length - 1].bar];
    this._mat = { k, title: def.title, seq, key: score.key, staves, hand, bars, lastBar: score.barlines.length };
    return this._mat;
  }

  reset() {
    for (const d of this.ducks || []) d.g.remove();
    this.ducks = [];
    this.bombs = [];
    this.posts = [];
    this._lastNoteBar = undefined;
    this.target = null;
    this.stage.layers.hud.textContent = '';
    this.stage.layers.back.textContent = '';
    this.stage.layers.fx.textContent = '';
    this._scenery();
  }

  layout() {
    if (!this.ducks) return;
    this._scenery();
    for (const d of this.ducks) this._placeDuck(d, true);
    for (const p of this.posts || []) this._placePost(p, true);
    this._ammo();
    this._hud();
  }

  // ---------- scenery: gallery awning on top, ammo tray below ----------
  _scenery() {
    const st = this.stage, sp = st.sp, g = st.layers.bg;
    g.textContent = '';
    const top = Math.max(st.h * 0.075, 1.6 * sp);
    const n = Math.max(6, Math.round(st.w / (3.2 * sp)));
    const wd = st.w / n;
    svg('rect', { x: 0, y: 0, width: st.w, height: top * 0.45, class: 'ar-awning-band' }, g);
    for (let i = 0; i < n; i++) {
      const x = i * wd;
      svg('path', { d: `M${x},${top * 0.42} h${wd} v${top * 0.18} a${wd / 2},${top * 0.42} 0 0 1 ${-wd},0 Z`, class: i % 2 ? 'ar-awning-a' : 'ar-awning-b' }, g);
    }
    // the water line under the lowest staff, where ducks that escape paddle off
    const tray = st.h - st.h * st.opts.padBot * 0.5;
    svg('line', { x1: 0, x2: st.w, y1: tray - 1.15 * sp, y2: tray - 1.15 * sp, class: 'ar-tray' }, g);
    this.trayY = tray;
  }

  // ---------- ducks ----------
  _duckArt(d) {
    const [body, wing] = BODY[d.color];
    const a = svg('g', { class: 'duck-art' });
    svg('path', { d: 'M1.15,0.55 L2.7,0.32 M0.95,0.72 L2.45,0.86', class: 'duck-wake' }, a);
    svg('path', { d: 'M-1.45,0.55 Q0,0.92 1.45,0.55', class: 'duck-ripple' }, a);
    svg('path', { d: 'M0.95,-0.12 L1.78,-0.78 Q1.66,-0.02 1.18,0.32 Z', fill: body }, a);
    svg('ellipse', { cx: 0, cy: 0, rx: 1.3, ry: 0.56, fill: body, class: 'duck-body' }, a);
    d.wing = svg('path', { d: 'M-0.25,-0.22 Q0.5,-0.62 1.12,-0.2 Q0.6,0.16 -0.12,0.06 Z', fill: wing }, a);
    svg('path', { d: 'M-1.12,-0.08 Q-1.38,-0.6 -1.08,-0.98 L-0.66,-0.78 Q-0.72,-0.36 -0.52,-0.12 Z', fill: body }, a);
    svg('circle', { cx: -1.0, cy: -1.06, r: 0.46, fill: body }, a);
    svg('path', { d: 'M-1.38,-1.03 L-2.0,-0.9 Q-1.76,-0.74 -1.34,-0.82 Z', fill: '#e9705a' }, a);
    svg('circle', { cx: -1.12, cy: -1.16, r: 0.085, fill: '#1a1d1b' }, a);
    return a;
  }

  _spawn(attract = false) {
    const lv = this.lv;
    let m, prefer, note = null;
    const last = this.ducks[this.ducks.length - 1];
    const mat = this.songLevel ? this._songMaterial() : null;
    if (mat) {
      note = mat.seq[attract ? (this.ducks.length % mat.seq.length) : this.spawned] || mat.seq[mat.seq.length - 1];
      m = note.midi; prefer = note.prefer;
    } else {
      do { m = pick(lv.pool); } while (lv.pool.length > 2 && last && m === last.midi);
      const black = [1, 3, 6, 8, 10].includes(m % 12);
      prefer = black ? (Math.random() < 0.5 ? 'flat' : 'sharp') : undefined;
    }
    const d = {
      id: Math.random().toString(36).slice(2, 7), midi: m, note,
      prefer,
      s: attract ? rand(2, this._span()) : this._span() + 2.4,
      throws: lv.throws || 3, used: 0, state: 'swim', phase: rand(0, 6.28),
      color: Math.random() < 0.72 ? 'brass' : Math.random() < 0.6 ? 'chalk' : 'mint',
    };
    d.g = svg('g', { class: 'duck' }, this.stage.layers.sprites);
    d.ledg = svg('g', { class: 'duck-ledgers' }, d.g);
    d.acc = svg('g', {}, d.g);
    d.art = this._duckArt(d);
    d.g.append(d.art);
    this.ducks.push(d);
    this._placeDuck(d, true);
    return d;
  }

  _span() { const st = this.stage; return (st.right - st.noteLeft) / st.sp; }

  _placeDuck(d, full = false) {
    const st = this.stage, sp = st.sp;
    if (full) {
      const p = st.place(d.midi, d.prefer);
      d.y = p.y;
      d.ledg.textContent = '';
      d.acc.textContent = '';
      st.ledgers(d.ledg, 0, p.step, p.clef, 1.75);
      // ledgers were drawn at absolute y; move them into the duck's frame
      for (const l of d.ledg.children) { const yy = +l.getAttribute('y1') - p.y; l.setAttribute('y1', yy); l.setAttribute('y2', yy); }
      if (p.acc !== null && p.acc !== undefined) {
        st.glyph(d.acc, { '-1': '', 0: '', 1: '' }[p.acc], -2.75 * sp, 0, 'duck-acc');
      }
    }
    d.x = st.noteLeft + d.s * sp;
    const wob = Math.sin(d.phase) * 3;
    d.g.setAttribute('transform', `translate(${d.x.toFixed(1)} ${(d.y + (d.dy || 0)).toFixed(1)})`);
    d.art.setAttribute('transform', `scale(${sp * (d.scale || 1)}) rotate(${(wob + (d.rot || 0)).toFixed(1)})`);
  }

  get leftmost() {
    let best = null;
    for (const d of this.ducks) if (d.state === 'swim' && d.s < this._span() + 0.6 && (!best || d.s < best.s)) best = d;
    return best;
  }

  // ---------- round ----------
  attract() {
    for (let i = 0; i < 4; i++) this._spawn(true);
    this.mode = 'attract';
  }

  start() {
    const lv = this.lv;
    this.reset();
    this.mode = 'play';
    this.playing = true;
    this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.spawned = 0; this.hits = 0; this.firstHits = 0; this.lost = 0;
    this.sinceSpawn = 99; this.firstDelay = 0.6; this.endTimer = null;
    this.posts = [];
    this.barMiss = new Map();
    const span = this._span();
    const mat = this.songLevel ? this._songMaterial() : null;
    this.song = mat;
    if (mat) {
      // the melody in order, spaced by rhythm, entering from the right half of the pond
      this.total = mat.seq.length;
      let s = span * 0.55;
      while (this.spawned < this.total && s < span + 2.4) {
        const d = this._spawn(); d.s = s + this._accRoom(d); this._placeDuck(d);
        this._maybePost(d);
        this.spawned++;
        s = d.s + this._gapAfter(d);
      }
      const ms = mat.seq.map((n) => n.midi);
      this.app.keyboard.need(Math.min(...ms), Math.max(...ms));
      this.app.ui.prompt(this.embedded?.text || `${mat.title}, ${mat.hand === 'L' ? 'left' : 'right'} hand: the ducks swim the melody in order. Play each duck’s note to hit it.`);
    } else {
      this.total = lv.count || 20;
      // open with a few ducks already paddling in, so there is always one to read ahead
      for (const f of [0.62, 0.84, 1.04]) { const d = this._spawn(); d.s = span * f; this._placeDuck(d); this.spawned++; }
      this.app.keyboard.need(Math.min(...lv.pool), Math.max(...lv.pool));
      this.app.ui.prompt(this.embedded?.text || 'Play the note the leftmost duck is swimming on. A miss shows you where your note lives.');
    }
    this.firstDelay = 0;
    this.sinceSpawn = 0;
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this._end(true) }, 'Stop'));
    this._ammo();
    this._hud();
  }

  get speed() {
    if (this.song) {
      // steady, and the pond slows right down while the next duck waits near the clef
      // the pond keeps the next duck about a third of the way in: it hurries when you're ahead
      // and slows right down while a duck waits near the clef
      const t = this.target;
      const ease = t ? clamp((t.s - 0.6) / (this._span() * 0.3), 0.18, 3.2) : 3;
      return 2.1 * (this.lv.speed || 1) * ease;
    }
    return clamp((2.1 + 0.07 * this.spawned) * (this.lv.speed || 1), 1.4, 5.6);
  }

  /** Space after a duck in song mode, from its note value (like notation spacing). */
  _gapAfter(d) { return clamp((d.note?.d ?? 1) * 3.1, 3.6, 7.5); }

  /** Extra room in front of a duck that carries an accidental. */
  _accRoom(d) { return d.note && this.stage.place(d.midi, d.prefer).acc != null ? 1.2 : 0; }

  /** A bar post just before the first duck of each bar (song mode). */
  _maybePost(d) {
    if (!this.song || !d.note) return;
    const prev = this._lastNoteBar;
    this._lastNoteBar = d.note.bar;
    if (prev === undefined || d.note.bar === prev) return;
    const st = this.stage, sp = st.sp;
    const g = svg('g', { class: 'duck-post' }, st.layers.back);
    const post = { s: d.s - 1.9, bar: d.note.bar, g };
    this.posts.push(post);
    this._placePost(post, true);
  }

  _placePost(p, full = false) {
    const st = this.stage, sp = st.sp;
    if (full) {
      p.g.textContent = '';
      svg('line', { x1: 0, x2: 0, y1: st.staffTop, y2: st.staffBottom, class: 'duck-post-line' }, p.g);
      const t = svg('text', { x: 0, y: st.staffTop - 0.9 * sp, 'text-anchor': 'middle', 'font-size': clamp(0.95 * sp, 10, 15), class: 'duck-post-num' }, p.g);
      t.textContent = String(p.bar + 1);
    }
    p.g.setAttribute('transform', `translate(${(st.noteLeft + p.s * sp).toFixed(1)} 0)`);
  }

  step(dt) {
    if (!this.ducks) return;
    const st = this.stage;
    if (this.mode === 'attract') {
      for (const d of this.ducks) {
        d.s -= 0.9 * dt; d.phase += dt * 2.2;
        if (d.s < -1) d.s = this._span() + 2;
        this._placeDuck(d);
      }
      return;
    }
    if (this.mode !== 'play') return;
    // spawn: steady spacing, and straight away when the pond is empty
    this.sinceSpawn += dt;
    this.firstDelay -= dt;
    const swimming = this.ducks.filter((d) => d.state === 'swim');
    const speed = this.speed;
    if (this.song) {
      // keep the melody coming at its own spacing behind the last duck
      const last = this.ducks[this.ducks.length - 1];
      const edge = this._span() + 2.4;
      if (this.spawned < this.total && (!last || last.s + this._gapAfter(last) <= edge)) {
        const d = this._spawn();
        d.s = (last ? Math.max(last.s + this._gapAfter(last), 0.6) : edge) + this._accRoom(d);
        this._placeDuck(d);
        this._maybePost(d);
        this.spawned++; this._hud();
      }
      for (const p of this.posts) { p.s -= speed * dt; this._placePost(p); }
      this.posts = this.posts.filter((p) => (p.s > -2 ? true : (p.g.remove(), false)));
    } else {
      const gap = 6.4 / speed;
      const lastS = this.ducks.length ? Math.max(...this.ducks.map((d) => d.s)) : -99;
      const roomy = lastS < this._span() - 1.5;
      if (this.firstDelay <= 0 && this.spawned < this.total && (this.sinceSpawn >= gap || (swimming.length < 2 && roomy))) {
        this._spawn(); this.spawned++; this.sinceSpawn = 0; this._hud();
      }
    }
    for (const d of this.ducks) {
      if (d.state === 'swim') {
        d.s -= speed * dt;
        d.phase += dt * 3;
        if (d.s < -0.4) this._escape(d, 'swam off');
      }
      if (d.state !== 'gone') this._placeDuck(d);
    }
    this.ducks = this.ducks.filter((d) => d.state !== 'gone');
    const t = this.leftmost;
    if (t !== this.target) { this.target = t; this._ammo(); }
    this._crosshair(dt);
    if (this.spawned >= this.total && !this.ducks.length && !this.endTimer) {
      this.endTimer = setTimeout(() => this._end(false), 700);
    }
  }

  _crosshair(dt) {
    const st = this.stage, sp = st.sp, t = this.target;
    if (!this.cross || !this.cross.isConnected) {
      this.cross = svg('g', { class: 'ar-cross' }, st.layers.back);
      svg('circle', { r: 1, class: 'ar-cross-ring' }, this.cross);
      for (const a of [0, 90, 180, 270]) svg('line', { x1: 1.15, x2: 1.6, y1: 0, y2: 0, transform: `rotate(${a})`, class: 'ar-cross-tick' }, this.cross);
      this.crossRot = 0;
    }
    if (!t) { this.cross.setAttribute('opacity', 0); return; }
    this.crossRot = (this.crossRot + dt * 40) % 360;
    this.cross.setAttribute('opacity', 1);
    this.cross.setAttribute('transform', `translate(${t.x} ${t.y}) scale(${1.85 * sp}) rotate(${this.crossRot})`);
  }

  noteOn(e) {
    if (this.mode !== 'play' || !this.playing) return;
    const d = this.target;
    if (!d || d.throws <= 0) return;
    const ok = e.midi === d.midi;
    const attempt = d.used;
    d.used++;
    const color = PAINT[(this.spawned + d.used) % PAINT.length];
    if (ok) {
      d.state = 'hit';
      this.hits++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (attempt === 0) this.firstHits++;
      const pts = [100, 60, 30][attempt] ?? 20;
      const bonus = Math.min(100, 10 * (this.streak - 1));
      this.score += pts + bonus;
      this.app.coach.record('hit');
      this.app.keyboard.flash(e.midi, 'hit');
      this._throw(d.x, d.y, color, () => this._hit(d, pts + bonus));
    } else {
      d.throws--;
      this.streak = 0;
      this.app.coach.record('wrong-pitch', { expected: d.midi, played: e.midi, key: this.stage.opts.key || 'C' });
      if (d.note) this.barMiss.set(d.note.bar, (this.barMiss.get(d.note.bar) || 0) + 1);
      this.app.keyboard.flash(e.midi, 'miss', 450);
      const p = this.stage.place(e.midi, d.prefer && e.midi % 12 === d.midi % 12 ? d.prefer : undefined);
      this._throw(d.x, p.y, color, () => {
        this.sfx.splat();
        this.stage.splat(d.x, p.y, color, noteName(e.midi, { prefer: d.prefer }));
      });
      if (d.throws <= 0) {
        d.state = 'leaving';
        // a game timer (cleared on exit), and only for a duck still in this round
        this.after(0.26, () => { if (this.stage && this.ducks.includes(d)) this._escape(d, 'out of throws'); });
      }
    }
    this._ammo();
    this._hud();
  }

  _throw(x, y, color, done) {
    const st = this.stage, sp = st.sp;
    const x0 = st.w / 2, y0 = this.trayY;
    const b = svg('circle', { r: 0.5 * sp, fill: color, class: 'ar-bomb' }, st.layers.fx);
    this.sfx.whoosh();
    st.tween(0.2, (p) => {
      const bx = x0 + (x - x0) * p;
      const by = y0 + (y - y0) * p - Math.sin(p * Math.PI) * 2.2 * sp;
      b.setAttribute('cx', bx); b.setAttribute('cy', by);
      b.setAttribute('r', (0.5 - 0.15 * p) * sp);
    }, { done: () => { b.remove(); done(); } });
  }

  _hit(d, pts) {
    const st = this.stage, sp = st.sp;
    this.sfx.quack(rand(0.92, 1.12));
    st.puff(d.x, d.y, BODY[d.color][0], 12, 0.3);
    st.float(d.x, d.y - 1.4 * sp, `+${pts}`);
    st.tween(0.4, (p) => {
      d.scale = 1 + 0.35 * p; d.rot = -40 * p; d.dy = -1.2 * sp * p;
      d.g.setAttribute('opacity', 1 - p);
      this._placeDuck(d);
    }, { ease: ease.out, done: () => { d.state = 'gone'; d.g.remove(); } });
  }

  _escape(d, why) {
    if (d.state === 'gone' || d.state === 'fled') return;
    d.state = 'fled';
    this.lost++;
    this.streak = 0;
    if (this.mode === 'play' && why === 'swam off') this.app.coach.record('missed', { expected: d.midi });
    if (this.mode === 'play' && d.note) this.barMiss.set(d.note.bar, (this.barMiss.get(d.note.bar) || 0) + 2);
    this.sfx.laugh();
    const st = this.stage, sp = st.sp;
    const x0 = d.x;
    st.tween(0.9, (p) => {
      d.dy = -p * p * 7 * sp; d.rot = 18 * Math.sin(p * 18) * (1 - p);
      d.wing?.setAttribute('transform', `scale(1 ${1 - 1.6 * Math.abs(Math.sin(p * 30))})`);
      d.g.setAttribute('opacity', 1 - p);
      d.x = x0 - p * 3 * sp;
      d.g.setAttribute('transform', `translate(${d.x} ${d.y + d.dy})`);
      d.art.setAttribute('transform', `scale(${sp}) rotate(${d.rot})`);
    }, { done: () => { d.state = 'gone'; d.g.remove(); } });
    this._hud();
  }

  // ---------- HUD and ammo ----------
  _ammo() {
    const st = this.stage, sp = st.sp;
    if (!this.ammoG) this.ammoG = svg('g', { class: 'ar-ammo' }, st.layers.hud);
    if (!this.ammoG.isConnected) st.layers.hud.append(this.ammoG);
    const g = this.ammoG;
    g.textContent = '';
    if (this.mode !== 'play') return;
    const n = this.lv.throws || 3;
    const left = this.target ? this.target.throws : n;
    const y = this.trayY;
    for (let i = 0; i < n; i++) {
      const x = st.w / 2 + (i - (n - 1) / 2) * 1.6 * sp;
      const used = i >= left;
      svg('circle', { cx: x, cy: y, r: 0.55 * sp, fill: used ? 'none' : PAINT[(this.spawned + i + 1) % PAINT.length], class: used ? 'ar-bomb-used' : 'ar-bomb' }, g);
      if (!used) svg('path', { d: `M${x + 0.3 * sp},${y - 0.45 * sp} q${0.25 * sp},${-0.35 * sp} ${0.5 * sp},${-0.2 * sp}`, class: 'ar-fuse' }, g);
    }
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
      svg('tspan', { class: 'ar-hud-k' }, t).textContent = `${k} `;
      svg('tspan', { class: 'ar-hud-v' }, t).textContent = v;
    };
    label(st.left + sp, 'start', 'SCORE', this.score.toLocaleString());
    const remaining = this.total - this.spawned + this.ducks.filter((d) => d.state === 'swim' || d.state === 'leaving').length;
    if (this.song) {
      const bar = this.target?.note ? this.target.note.bar + 1 : (this.song.bars[1] + 1);
      label(st.right - sp, 'end', 'BAR', `${bar} of ${this.song.bars[1] + 1}`);
    } else label(st.right - sp, 'end', 'DUCKS', `${this.hits} hit · ${remaining} to go`);
    this.app.ui.status(this.streak > 2 ? `${this.streak} in a row` : '');
  }

  _end(stopped) {
    if (this.mode !== 'play') return;
    clearTimeout(this.endTimer);
    this.mode = 'over';
    const total = stopped ? Math.max(1, this.hits + this.lost) : this.total;
    const acc = this.hits / total;
    this._ammo(); this.hudG && (this.hudG.textContent = '');
    if (this.cross) this.cross.setAttribute('opacity', 0);
    if (!stopped && acc >= 0.9) this.sfx.fanfare();
    if (this.song) {
      const m = this.song;
      const worst = [...this.barMiss.entries()].sort((a, b) => b[1] - a[1])[0];
      const range = `bars ${m.bars[0] + 1}–${m.bars[1] + 1}`;
      this.finish({
        score: this.score,
        accuracy: acc,
        passed: acc >= (this.embedded?.pass ?? 0.7),
        detail: stopped
          ? `Stopped. ${this.hits} notes of ${m.title} read so far.`
          : `You read ${m.title} (${m.hand === 'L' ? 'left' : 'right'} hand, ${range}): ${this.hits} of ${total} notes${this.firstHits ? `, ${this.firstHits} on the first throw` : ''}.${worst && worst[1] >= 2 ? ` Bar ${worst[0] + 1} needed the most help.` : ''}`,
        stats: [
          ['Song', m.title],
          ['Notes read', `${this.hits} of ${total}`],
          ['First-throw hits', String(this.firstHits)],
          ['Trickiest bar', worst && worst[1] >= 2 ? String(worst[0] + 1) : 'none'],
        ],
      });
      return;
    }
    this.finish({
      score: this.score,
      accuracy: acc,
      passed: acc >= (this.embedded?.pass ?? 0.7),
      detail: `${this.hits} of ${total} ducks hit${this.firstHits ? `, ${this.firstHits} with the first throw` : ''}.`,
      stats: [
        ['Ducks hit', `${this.hits} of ${total}`],
        ['First-throw hits', String(this.firstHits)],
        ['Longest streak', String(this.bestStreak)],
      ],
    });
  }

  exit() {
    clearTimeout(this.endTimer);
    this.mode = 'off';
    super.exit();
  }
}
