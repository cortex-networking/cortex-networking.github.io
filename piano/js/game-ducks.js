// Ducks: the Miracle's shooting gallery. Ducks swim right to left along the lines and spaces of the
// staff; play the note the leftmost duck sits on to hit it with a paint bomb. A miss splats paint
// on the staff where the note you played lives, so you can see how far off you were.
import { ArcadeBase, svg, rand, pick, ease, clamp, PAINT } from './arcade.js';
import { noteName } from './theory.js';
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
  ],
};

const BODY = { brass: ['#d9a93a', '#b4861f'], chalk: ['#e8ede3', '#b9c7bd'], mint: ['#7fd3a6', '#4ea77a'] };

export class Game extends ArcadeBase {
  stageOptions() {
    const lv = this.lv;
    return { staves: lv.staves || 'treble', mTop: 3.2, mBot: 3, padTop: 0.13, padBot: 0.2, maxSp: 26 };
  }

  reset() {
    for (const d of this.ducks || []) d.g.remove();
    this.ducks = [];
    this.bombs = [];
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
    let m;
    const last = this.ducks[this.ducks.length - 1];
    do { m = pick(lv.pool); } while (lv.pool.length > 2 && last && m === last.midi);
    const black = [1, 3, 6, 8, 10].includes(m % 12);
    const d = {
      id: Math.random().toString(36).slice(2, 7), midi: m,
      prefer: black ? (Math.random() < 0.5 ? 'flat' : 'sharp') : undefined,
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
    this.total = lv.count || 20;
    this.sinceSpawn = 99; this.firstDelay = 0.6; this.endTimer = null;
    // open with a few ducks already paddling in, so there is always one to read ahead
    const span = this._span();
    for (const f of [0.62, 0.84, 1.04]) { const d = this._spawn(); d.s = span * f; this._placeDuck(d); this.spawned++; }
    this.firstDelay = 0;
    this.sinceSpawn = 0;
    this.app.keyboard.need(Math.min(...lv.pool), Math.max(...lv.pool));
    this.app.ui.prompt(this.embedded?.text || 'Play the note the leftmost duck is swimming on. A miss shows you where your note lives.');
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this._end(true) }, 'Stop'));
    this._ammo();
    this._hud();
  }

  get speed() { return clamp((2.1 + 0.07 * this.spawned) * (this.lv.speed || 1), 1.4, 5.6); }

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
    const gap = 6.4 / this.speed;
    const lastS = this.ducks.length ? Math.max(...this.ducks.map((d) => d.s)) : -99;
    const roomy = lastS < this._span() - 1.5;
    if (this.firstDelay <= 0 && this.spawned < this.total && (this.sinceSpawn >= gap || (swimming.length < 2 && roomy))) {
      this._spawn(); this.spawned++; this.sinceSpawn = 0; this._hud();
    }
    for (const d of this.ducks) {
      if (d.state === 'swim') {
        d.s -= this.speed * dt;
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
      this.app.coach.record('wrong-pitch', { expected: d.midi, played: e.midi, key: 'C' });
      this.app.keyboard.flash(e.midi, 'miss', 450);
      const p = this.stage.place(e.midi, d.prefer && e.midi % 12 === d.midi % 12 ? d.prefer : undefined);
      this._throw(d.x, p.y, color, () => {
        this.sfx.splat();
        this.stage.splat(d.x, p.y, color, noteName(e.midi, { prefer: d.prefer }));
      });
      if (d.throws <= 0) {
        d.state = 'leaving';
        setTimeout(() => this._escape(d, 'out of throws'), 260);
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
    label(st.right - sp, 'end', 'DUCKS', `${this.hits} hit · ${remaining} to go`);
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
