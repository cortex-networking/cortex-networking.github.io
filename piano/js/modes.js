// Original games (Note Rush, Echo, Key Hunt) and free play.
import { buildScore, describeNotes, preferFor, noteName, pc, NAMES_SHARP, NAMES_FLAT } from './theory.js';
import { h, toggle } from './ui.js';
import { GameBase } from './gamebase.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class RushGame extends GameBase {
  get lv() { return this.game.levels[this.level]; }

  preview() {
    const lv = this.lv;
    this.app.staff.showColumn([{ midis: [pick(lv.pool)], cls: 'target' }], { staves: lv.staves });
    this.app.keyboard.need(Math.min(...lv.pool), Math.max(...lv.pool));
  }

  start() {
    const { staff, ui } = this.app;
    const lv = this.lv;
    this.app.coach.begin({});
    this.playing = true;
    this.score = 0; this.lives = 3; this.combo = 0; this.cleared = 0;
    this.speed = 0.55;           // beats per second
    this.spacing = 2;            // beats between notes
    this.notes = []; this.nextT = 4; this.uid = 0;
    this.beat = 0;
    staff.setScore({ key: 'C', time: null, events: [], notes: [], length: 0, barlines: [] },
      { staves: lv.staves, ppb: 6.5, hideTime: true, showZone: true, noEnd: true });
    this._spawn();
    this._markNext();
    ui.prompt('Play each note before it reaches the line.');
    ui.foot(h('button', { class: 'btn', onclick: () => { this.playing = false; this.over(this.score, `Stopped at ${this.score} points.`); } }, 'Stop'));
    this._hud();
  }

  _spawn() {
    const lv = this.lv;
    while (this.nextT < this.beat + 26) {
      let m; do { m = pick(lv.pool); } while (lv.pool.length > 2 && this.notes.length && m === this.notes[this.notes.length - 1].midi);
      const e = { t: this.nextT, d: 4, midi: m, i: `r${this.uid++}`, prefer: lv.accidentals && Math.random() < 0.5 ? 'flat' : 'sharp' };
      this.notes.push(e);
      this.app.staff.append([e]);
      this.nextT += this.spacing;
    }
  }

  get current() { return this.notes.find((n) => !n.done); }

  _markNext() {
    const n = this.current;
    if (n) this.app.staff.noteClass(n.i, 'next');
  }

  noteOn(e) {
    if (!this.playing) return;
    const n = this.current;
    const kb = this.app.keyboard;
    if (!n) return;
    if (e.midi === n.midi) {
      n.done = true;
      this.combo++; this.cleared++;
      this.score += 10 + Math.min(20, this.combo * 2);
      this.app.coach.record('hit');
      this.app.staff.noteClass(n.i, 'hit');
      this.app.staff.noteClass(n.i, 'cleared');
      this._markNext();
      kb.flash(e.midi, 'hit');
      if (this.cleared % 5 === 0) this.speed = Math.min(2.4, this.speed * 1.08);
    } else {
      this.combo = 0;
      this.app.coach.record('wrong-pitch', { expected: n.midi, played: e.midi });
      kb.flash(e.midi, 'miss', 450);
      this.app.staff.noteClass(n.i, 'shake', false);
      void this.app.staff.svg.offsetWidth;
      this.app.staff.noteClass(n.i, 'shake', true);
    }
    this._hud();
  }

  tick(dt) {
    if (!this.playing) return;
    this.beat += this.speed * Math.min(dt, 0.1);
    this.app.staff.setBeat(this.beat);
    const n = this.current;
    if (n && this.beat >= n.t) {
      n.done = true;
      this.lives--; this.combo = 0;
      this.app.coach.record('missed', { expected: n.midi });
      this.app.staff.noteClass(n.i, 'miss');
      this._markNext();
      this.app.keyboard.flash(n.midi, 'cue-r', 900);
      this._hud();
      if (this.lives <= 0) {
        this.playing = false;
        this.timer = setTimeout(() => this.over(this.score, `Game over: ${this.score} points, ${this.cleared} notes cleared.`), 700);
        return;
      }
    }
    this._spawn();
  }

  _hud() {
    this.app.ui.status(`${this.score} points`);
    this.app.ui.big('♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 3 - this.lives)), this.combo > 2 ? `${this.combo} in a row` : '');
  }
}

export class EchoGame extends GameBase {
  get lv() { return this.game.levels[this.level]; }

  preview() {
    this.app.staff.showColumn([], { staves: 'treble' });
    this.app.keyboard.need(60, 72);
  }

  start() {
    this.app.coach.begin({});
    this.playing = true;
    this.phrase = [pick(this.lv.pool), pick(this.lv.pool)];
    this.lives = 3; this.best = 0;
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this.over(this.best, `Stopped. Longest phrase: ${this.best} notes.`) }, 'Stop'));
    this._grow();
  }

  _grow() {
    let m; do { m = pick(this.lv.pool); } while (m === this.phrase[this.phrase.length - 1] && this.lv.pool.length > 1);
    this.phrase.push(m);
    this._round();
  }

  _round() {
    const { sound, ui, keyboard } = this.app;
    this.state = 'listen';
    this.pos = 0;
    this._showPlayed();
    ui.prompt('Listen…');
    ui.big('♥'.repeat(this.lives) + '♡'.repeat(3 - this.lives), `${this.phrase.length} notes`);
    const spb = 0.5, t0 = sound.now() + 0.4;
    this.phrase.forEach((m, k) => {
      sound.play(m, 0.75, t0 + k * spb, spb * 0.85);
      if (this.lv.showKeys) {
        setTimeout(() => this.playing && keyboard.flash(m, 'demo', spb * 850), (0.4 + k * spb) * 1000);
      }
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.playing) return;
      this.state = 'repeat';
      ui.prompt('Your turn. Play it back.');
    }, (0.4 + this.phrase.length * spb) * 1000);
  }

  _showPlayed(extraWrong) {
    const played = this.phrase.slice(0, this.pos);
    const rh = played.map((m) => `${noteName(m, { octave: true }).replace('♯', '#')}q`).join(' ');
    if (!played.length && extraWrong === undefined) { this.app.staff.showColumn([], { staves: 'treble' }); return; }
    const score = buildScore({ rh: rh || 'rq', tempo: 100 });
    score.time = null;
    this.app.staff.setScore(score, { staves: 'treble', hideTime: true, showZone: false, hideFingers: true });
    score.notes.forEach((n) => this.app.staff.noteClass(n.i, 'hit'));
    this.app.staff.setBeat(-0.5);
  }

  noteOn(e) {
    if (!this.playing || this.state !== 'repeat') return;
    const want = this.phrase[this.pos];
    const kb = this.app.keyboard;
    if (e.midi === want) {
      kb.flash(e.midi, 'hit');
      this.pos++;
      this._showPlayed();
      if (this.pos === this.phrase.length) {
        this.best = Math.max(this.best, this.phrase.length);
        this.state = 'wait';
        this.app.ui.prompt('Got it.');
        this.timer = setTimeout(() => this.playing && this._grow(), 900);
      }
    } else {
      kb.flash(e.midi, 'miss', 500);
      kb.flash(want, 'cue-r', 900);
      this.app.coach.record('wrong-pitch', { expected: want, played: e.midi });
      this.lives--;
      this.state = 'wait';
      if (this.lives <= 0) {
        this.playing = false;
        this.timer = setTimeout(() => this.over(this.best, `Game over. Longest phrase: ${this.best} notes.`), 900);
        return;
      }
      this.app.ui.prompt(`That was ${noteName(e.midi)}; the note was ${noteName(want)}. Listen again.`);
      this.timer = setTimeout(() => this.playing && this._round(), 1500);
    }
  }
}

export class HuntGame extends GameBase {
  get lv() { return this.game.levels[this.level]; }

  preview() {
    this.app.staff.showColumn([], { staves: 'grand' });
    this.app.keyboard.need(48, 84);
  }

  start() {
    this.playing = true;
    this.score = 0;
    this.ends = performance.now() + 60000;
    this.prev = null;
    this.app.ui.prompt('Find each note anywhere on the keyboard.');
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => { this.playing = false; this.over(this.score, `Stopped with ${this.score} found.`); } }, 'Stop'));
    this._next();
  }

  _next() {
    let p; do { p = pick(this.lv.pcs); } while (p === this.prev);
    this.prev = p;
    this.target = p;
    const black = [1, 3, 6, 8, 10].includes(p);
    this.label = black ? (Math.random() < 0.5 ? NAMES_SHARP[p] : NAMES_FLAT[p]) : NAMES_SHARP[p];
    this.app.ui.big(this.label, 'Find it anywhere', 'huge');
  }

  noteOn(e) {
    if (!this.playing) return;
    const kb = this.app.keyboard;
    if (pc(e.midi) === this.target) {
      this.score++;
      kb.flash(e.midi, 'hit');
      const prefer = /♭/.test(this.label) ? 'flat' : 'sharp';
      this.app.staff.showColumn([{ midis: [e.midi], cls: 'hit', prefer }], { staves: 'grand' });
      this._next();
    } else {
      kb.flash(e.midi, 'miss', 450);
    }
  }

  tick() {
    if (!this.playing) return;
    const left = Math.max(0, this.ends - performance.now());
    this.app.ui.status(`${this.score} found, ${Math.ceil(left / 1000)} s left`);
    if (left <= 0) { this.playing = false; this.over(this.score, `Time’s up: ${this.score} found.`); }
  }
}

export const GAME_CLASSES = { rush: RushGame, echo: EchoGame, hunt: HuntGame };

// ======================================================================
// Free play
// ======================================================================
export class FreeMode {
  constructor(app) { this.app = app; this.metro = false; this.bpm = app.store.data.freeBpm || 90; }

  enter() {
    const { ui } = this.app;
    ui.head({ kicker: 'Free play', title: 'Play anything' });
    ui.prompt('Notes appear on the staff as you play, and chords are named as you hold them.');
    ui.pips(0, 0);
    this.app.keyboard.need(48, 72);
    this.render();
    this.controls();
  }

  controls() {
    const { ui } = this.app;
    const val = h('output', { class: 'tempo-val' }, `${this.bpm} bpm`);
    ui.foot(h('div', { class: 'controls' },
      toggle('Metronome', this.metro, (v) => { this.metro = v; this.next = this.app.sound.now() + 0.1; this.beatN = 0; this.app.sound.unlock(); }),
      h('label', { class: 'range' }, 'Speed', h('input', {
        type: 'range', min: 40, max: 200, step: 1, value: this.bpm,
        oninput: (e) => { this.bpm = +e.target.value; val.textContent = `${this.bpm} bpm`; },
        onchange: () => { this.app.store.data.freeBpm = this.bpm; this.app.store.save(); },
      }), val),
    ));
  }

  render() {
    const { input, staff, ui } = this.app;
    const held = [...input.held.keys()].sort((a, b) => a - b);
    const prefer = held.length ? preferFor(held) : 'sharp';
    staff.showColumn(held.length ? [{ midis: held, cls: 'held', prefer }] : [], { staves: 'grand' });
    const d = describeNotes(held);
    if (!d) ui.big('', input.pedal ? 'Sustain on' : '');
    else ui.big(d.title, d.sub + (input.pedal ? ', sustain on' : ''));
  }

  noteOn() { this.render(); }
  noteOff() { this.render(); }
  pedal() { this.render(); }
  exit() {}

  tick() {
    if (!this.metro) return;
    const s = this.app.sound;
    if (!s.ready) return;
    const spb = 60 / this.bpm;
    if (!this.next || this.next < s.now() - 0.2) { this.next = s.now() + 0.05; this.beatN = 0; }
    while (this.next < s.now() + 0.2) {
      s.click(this.next, this.beatN % 4 === 0);
      this.next += spb; this.beatN++;
    }
  }
}
