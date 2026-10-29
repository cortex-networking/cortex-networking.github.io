// Lesson, song, game and free-play controllers.
import { buildScore, describeNotes, preferFor, noteName, pc, NAMES_SHARP, NAMES_FLAT, spell } from './theory.js';
import { Session } from './session.js';
import { LESSONS, UNITS, SONGS, GAMES } from './library.js';
import { h, segmented, stars, toggle } from './ui.js';
import { GameBase } from './gamebase.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const stavesFor = (step, lesson) => {
  if (step.staves) return step.staves;
  if (step.rh && step.lh) return 'grand';
  if (step.lh) return lesson.staves && lesson.staves !== 'treble' ? lesson.staves : 'bass';
  if (step.rh) return lesson.staves || 'treble';
  return lesson.staves || 'grand';
};

// ======================================================================
// Lessons
// ======================================================================
export class LessonMode {
  constructor(app, lesson) {
    this.app = app;
    this.lesson = lesson;
    this.index = LESSONS.indexOf(lesson);
  }

  enter() {
    const { ui, staff, keyboard } = this.app;
    const unit = UNITS.find((u) => u.id === this.lesson.unit);
    ui.head({ kicker: `Lesson ${this.index + 1} of ${LESSONS.length}, ${unit.title}`, title: this.lesson.title });
    ui.prompt(this.lesson.summary);
    ui.pips(this.lesson.steps.length, -1);
    ui.big();
    staff.showColumn([], { staves: this.lesson.staves || 'grand' });
    keyboard.need(48, 72);
    const best = this.app.store.lesson(this.lesson.id);
    ui.foot(
      h('button', { class: 'btn primary', onclick: () => this.start() }, best ? 'Start again' : 'Start lesson'),
      best ? h('span', { class: 'note' }, stars(best.stars), ' Your best') : null,
    );
  }

  exit() { this.task?.stop?.(); this.task = null; clearTimeout(this.timer); }

  start() {
    this.i = -1;
    this.correct = 0;
    this.mistakes = 0;
    this.next();
  }

  next() {
    this.task?.stop?.();
    this.task = null;
    this.i++;
    const step = this.lesson.steps[this.i];
    if (!step) return this.complete();
    const { ui, staff, keyboard } = this.app;
    ui.pips(this.lesson.steps.length, this.i);
    ui.prompt(step.text);
    ui.big();
    keyboard.clear('cue-r', 'cue-l');
    keyboard.clearFingers();
    const staves = stavesFor(step, this.lesson);
    const skip = h('button', { class: 'btn quiet', onclick: () => this.next() }, 'Skip step');
    if (step.type === 'say') {
      staff.showColumn([], { staves });
      ui.foot(h('button', { class: 'btn primary', onclick: () => this.next(), 'data-enter': '' }, 'Continue'), h('span', { class: 'note' }, 'or press Enter'));
      return;
    }
    if (step.type === 'find') this.task = new FindTask(this.app, step, staves, (r) => this._stepDone(r));
    else if (step.type === 'pcs') this.task = new PcsTask(this.app, step, staves, (r) => this._stepDone(r));
    else if (step.type === 'seq') {
      const score = buildScore({ rh: step.rh, lh: step.lh, key: step.key, time: step.time || [4, 4], tempo: 90 });
      const hands = step.rh && step.lh ? 'B' : step.lh ? 'L' : 'R';
      const s = new Session(this.app, score, {
        mode: 'wait', hands, accompany: false, hints: true, staves,
        onDone: (r) => this._stepDone({ correct: r.correct, wrong: r.wrong }),
        onUpdate: (st) => ui.status(st.wrong ? `${st.wrong} wrong ${st.wrong === 1 ? 'note' : 'notes'} so far` : ''),
      });
      s.mount(); s.start();
      this.task = s;
      ui.status('');
      ui.foot(h('button', { class: 'btn', onclick: () => { s.mount(); s.start(); } }, 'Restart'), skip);
      return;
    } else if (step.type === 'rhythm') {
      this._rhythm(step, staves);
      return;
    }
    ui.foot(skip);
  }

  _rhythm(step, staves) {
    const { ui } = this.app;
    const score = buildScore({ rh: step.rh, lh: step.lh, time: [4, 4], tempo: step.tempo || 80 });
    const run = () => {
      const s = new Session(this.app, score, {
        mode: 'play', hands: 'R', accompany: false, metronome: true, staves,
        onUpdate: (st, last) => ui.status(gradeText(last)),
        onDone: (r) => {
          const pct = Math.round(r.score * 100);
          const passed = r.score >= (step.pass ?? 0.7);
          ui.status('');
          ui.prompt(passed ? `${pct}% in time. Nicely done.` : `${pct}% in time. Try once more and listen for the clicks.`);
          this.correct += r.correct;
          this.mistakes += r.wrong + r.missed;
          ui.foot(
            h('button', { class: `btn ${passed ? '' : 'primary'}`, onclick: () => { ui.prompt(step.text); run(); } }, 'Try again'),
            h('button', { class: `btn ${passed ? 'primary' : ''}`, onclick: () => this.next(), 'data-enter': '' }, 'Continue'),
          );
        },
      });
      this.task = s;
      s.mount(); s.start();
      ui.foot(h('button', { class: 'btn', onclick: () => { s.stop(); this._rhythm(step, staves); } }, 'Stop'), h('span', { class: 'note' }, 'Count-in: listen to the first clicks'));
    };
    const s0 = new Session(this.app, score, { mode: 'play', staves });
    s0.mount();
    ui.foot(
      h('button', { class: 'btn primary', onclick: run, 'data-enter': '' }, 'Start'),
      h('button', { class: 'btn', onclick: () => { const l = new Session(this.app, score, { mode: 'listen', staves, onDone: () => {} }); this.task = l; l.mount(); l.start(); } }, 'Listen first'),
      h('button', { class: 'btn quiet', onclick: () => this.next() }, 'Skip step'),
    );
  }

  _stepDone(r = {}) {
    this.correct += r.correct || 0;
    this.mistakes += r.wrong || 0;
    this.app.ui.status('');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.next(), 650);
  }

  complete() {
    const { ui, store, staff } = this.app;
    const total = Math.max(1, this.correct);
    const ratio = this.mistakes / total;
    const s = ratio <= 0.05 ? 3 : ratio <= 0.2 ? 2 : 1;
    store.saveLesson(this.lesson.id, s);
    this.app.renderList();
    ui.pips(this.lesson.steps.length, this.lesson.steps.length);
    ui.head({ kicker: `Lesson ${this.index + 1} complete`, title: this.lesson.title });
    ui.prompt(s === 3 ? 'Clean playing all the way through.' : s === 2 ? 'Well played. A few slips, nothing a second run won’t fix.' : 'You got through it. Run it again to make it feel easy.');
    ui.big(stars(s), '');
    staff.showColumn([], { staves: this.lesson.staves || 'grand' });
    const nextLesson = LESSONS[this.index + 1];
    ui.foot(
      nextLesson ? h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.app.open('lessons', nextLesson.id) }, `Next: ${nextLesson.title}`)
        : h('button', { class: 'btn primary', onclick: () => this.app.setTab('songs') }, 'Go to songs'),
      h('button', { class: 'btn', onclick: () => this.start() }, 'Repeat lesson'),
    );
  }

  noteOn(e) { this.task?.noteOn?.(e.midi, e.time); }
  noteOff(e) { this.task?.noteOff?.(e.midi); }
  tick(dt) { this.task?.tick?.(dt); }
}

function gradeText(last = {}) {
  if (last.grade === 'perfect') return 'Perfect';
  if (last.grade === 'good' || last.grade === 'ok') return last.early ? 'A little early' : last.late ? 'A little late' : 'Good';
  if (last.grade === 'missed') return 'Missed one';
  if (last.grade === 'wrong') return 'Wrong key';
  return '';
}

/** "Play this note" drills. */
class FindTask {
  constructor(app, step, staves, done) {
    this.app = app; this.step = step; this.staves = staves; this.done = done;
    const pool = step.pool || step.notes;
    if (step.pool) {
      this.queue = [];
      for (let k = 0; k < (step.count || pool.length); k++) {
        let m; do { m = pick(pool); } while (pool.length > 1 && m === this.queue[this.queue.length - 1]);
        this.queue.push(m);
      }
    } else this.queue = [...step.notes];
    this.k = 0; this.correct = 0; this.wrong = 0;
    app.keyboard.need(Math.min(...pool), Math.max(...pool));
    this.present();
  }

  get target() { return this.queue[this.k]; }

  present(extra) {
    const { staff, keyboard, ui } = this.app;
    const t = this.target, show = this.step.show || 'staff';
    const groups = [];
    if (show !== 'name' || extra?.reveal) groups.push({ midis: [t], cls: extra?.reveal ? 'hit' : 'target', prefer: this.step.prefer });
    if (extra?.wrong !== undefined) groups.push({ midis: [extra.wrong], cls: 'wrong', dx: 3.2, prefer: this.step.prefer });
    staff.showColumn(groups, { staves: this.staves });
    keyboard.clear('cue-r'); keyboard.clearFingers();
    if (show === 'both' || this.hinted) {
      keyboard.mark(t, 'cue-r', true);
      if (this.step.finger) keyboard.setFinger(t, this.step.finger);
    }
    if (show === 'both' || show === 'name') ui.big(noteName(t, { prefer: this.step.prefer }), this.queue.length > 1 ? `${this.k + 1} of ${this.queue.length}` : '');
    else ui.big('', this.queue.length > 1 ? `${this.k + 1} of ${this.queue.length}` : '');
  }

  noteOn(midi) {
    const t = this.target;
    if (t === undefined || this.locked) return;
    const { keyboard } = this.app;
    if (midi === t) {
      this.correct++;
      keyboard.flash(midi, 'hit');
      this.locked = true;
      this.present({ reveal: true });
      setTimeout(() => {
        this.locked = false; this.hinted = false; this.k++;
        if (this.k >= this.queue.length) this.done({ correct: this.correct, wrong: this.wrong });
        else this.present();
      }, 380);
    } else {
      this.wrong++;
      keyboard.flash(midi, 'miss', 450);
      this.hinted = true;
      this.present({ wrong: midi });
      clearTimeout(this.wt);
      this.wt = setTimeout(() => this.target === t && this.present(), 900);
    }
  }

  stop() { clearTimeout(this.wt); this.k = Infinity; }
}

/** "Play any C" / "play a group of black keys" drills (any octave). */
class PcsTask {
  constructor(app, step, staves, done) {
    this.app = app; this.step = step; this.staves = staves; this.done = done;
    this.count = 0; this.used = new Set(); this.correct = 0; this.wrong = 0;
    this.need = new Set(step.pcs);
    app.staff.showColumn([], { staves });
    app.keyboard.need(36, 84);
    app.ui.big('', `0 of ${step.count}`);
  }

  _show() {
    const held = [...this.app.input.held.keys()];
    this.app.staff.showColumn(held.length ? [{ midis: held, cls: 'held' }] : [], { staves: this.staves });
  }

  noteOn(midi) {
    const { keyboard, ui } = this.app;
    this._show();
    if (this.waitRelease || this.finished) return;
    if (!this.need.has(pc(midi))) {
      this.wrong++;
      keyboard.flash(midi, 'miss', 450);
      return;
    }
    let group = null;
    if (this.step.together) {
      const held = [...this.app.input.held.keys()].sort((a, b) => a - b);
      for (const lo of held) {
        const win = held.filter((m) => m >= lo && m < lo + 12 && this.need.has(pc(m)));
        if (new Set(win.map(pc)).size === this.need.size) { group = win; break; }
      }
      if (!group) return;
    } else group = [midi];
    const key = Math.min(...group);
    if (this.step.distinct && this.used.has(key)) {
      ui.big(`${this.count} of ${this.step.count}`, 'Try a different one');
      return;
    }
    this.used.add(key);
    this.count++;
    this.correct += group.length;
    group.forEach((m) => keyboard.flash(m, 'hit', 500));
    ui.big('', `${this.count} of ${this.step.count}`);
    if (this.count >= this.step.count) { this.finished = true; this.done({ correct: this.correct, wrong: this.wrong }); }
    else if (this.step.together) this.waitRelease = true;
  }

  noteOff() {
    this._show();
    if (this.waitRelease && this.app.input.held.size === 0) this.waitRelease = false;
  }

  stop() { this.finished = true; }
}

// ======================================================================
// Songs
// ======================================================================
export class SongMode {
  constructor(app, song) {
    this.app = app;
    this.song = song;
    this.score = buildScore(song);
    const saved = app.store.data.songOpts || {};
    this.opts = {
      mode: saved.mode || 'wait',
      hands: saved.hands || 'R',
      accompany: saved.accompany ?? true,
      tempo: saved.tempo || 1,
      metronome: saved.metronome ?? true,
    };
    if (!this.score.hands[this.opts.hands === 'B' ? 'R' : this.opts.hands]) this.opts.hands = 'R';
  }

  enter() {
    const { ui } = this.app;
    ui.head({ kicker: `${this.song.composer}, level ${this.song.level}`, title: this.song.title });
    ui.big();
    this.build();
    this._prompt();
  }

  exit() { this.session?.stop(); }

  _prompt() {
    const best = this.app.store.song(this.song.id);
    const parts = [];
    if (best?.play) parts.push(`Best play-along: ${Math.round(best.play * 100)}%`);
    if (best?.wait) parts.push(`best accuracy in wait mode: ${Math.round(best.wait * 100)}%`);
    const tips = {
      wait: 'Wait mode pauses on every note until you play it.',
      play: 'Play along keeps time. You’ll get a count-in, then the music scrolls without stopping.',
      listen: 'Listen plays the whole piece so you can hear how it goes.',
    };
    this.app.ui.prompt(tips[this.opts.mode] + (parts.length ? ` ${parts.join(', ')}.` : ''));
  }

  build() {
    this.session?.stop(true);
    const o = this.opts;
    this.session = new Session(this.app, this.score, {
      mode: o.mode, hands: o.hands, accompany: o.accompany, tempoScale: o.tempo, metronome: o.metronome,
      hints: this.app.settings.hints, staves: 'grand',
      onUpdate: (st, last) => this._stats(st, last),
      onDone: (r) => this._done(r),
    });
    this.session.mount();
    this.renderControls();
    this._stats(null);
  }

  _save() { this.app.store.data.songOpts = { ...this.opts }; this.app.store.save(); }

  renderControls() {
    const { ui } = this.app;
    const o = this.opts, sc = this.score;
    const running = this.session?.running;
    const set = (k, v) => { o[k] = v; this._save(); this.build(); this._prompt(); };
    const tempoLabel = h('output', { class: 'tempo-val' }, `${Math.round(sc.tempo * o.tempo)} bpm`);
    const controls = [
      segmented('Practice mode', [
        { value: 'wait', label: 'Wait' }, { value: 'play', label: 'Play along' }, { value: 'listen', label: 'Listen' },
      ], o.mode, (v) => set('mode', v)),
      o.mode !== 'listen' ? segmented('Hands', [
        { value: 'R', label: 'Right', disabled: !sc.hands.R }, { value: 'L', label: 'Left', disabled: !sc.hands.L },
        { value: 'B', label: 'Both', disabled: !(sc.hands.R && sc.hands.L) },
      ], o.hands, (v) => set('hands', v)) : null,
      o.mode !== 'listen' && o.hands !== 'B' && sc.hands.R && sc.hands.L
        ? toggle('Play the other hand for me', o.accompany, (v) => set('accompany', v)) : null,
      h('label', { class: 'range' }, 'Tempo',
        h('input', {
          type: 'range', min: 0.4, max: 1.3, step: 0.05, value: o.tempo,
          oninput: (e) => { tempoLabel.textContent = `${Math.round(sc.tempo * e.target.value)} bpm`; },
          onchange: (e) => set('tempo', +e.target.value),
        }), tempoLabel),
      o.mode === 'play' ? toggle('Metronome', o.metronome, (v) => set('metronome', v)) : null,
    ];
    const go = running
      ? h('button', { class: 'btn primary', onclick: () => { this.session.stop(); this.build(); } }, 'Stop')
      : h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.play() }, o.mode === 'listen' ? 'Listen' : 'Start');
    ui.foot(h('div', { class: 'controls' }, go, ...controls.filter(Boolean)));
  }

  play() {
    this.app.sound.unlock();
    this.session.mount();
    this.session.start();
    this.renderControls();
  }

  _stats(st, last) {
    const { ui } = this.app;
    if (!st || !this.session.running) { ui.status(''); return; }
    if (this.opts.mode === 'wait') ui.status(`${st.done} of ${st.totalSteps}${st.wrong ? `, ${st.wrong} wrong` : ''}`);
    else if (this.opts.mode === 'play') {
      const g = gradeText(last);
      ui.status(`${st.correct} of ${st.total} notes${g ? `. ${g}` : ''}`);
    }
  }

  _done(r) {
    const { ui, store } = this.app;
    this.renderControls();
    if (r.mode === 'listen') { ui.status(''); return; }
    const pct = Math.round(r.score * 100);
    const prev = store.song(this.song.id) || {};
    store.saveSong(this.song.id, r.mode, r.score, r.stars);
    this.app.renderList();
    const better = r.score > (prev[r.mode] || 0) && prev[r.mode] !== undefined;
    let msg;
    if (r.mode === 'wait') msg = `${pct}% of your notes were right first time${better ? ', a new best' : ''}.`;
    else msg = `${pct}% — ${r.perfect} perfect, ${r.good + r.ok} close, ${r.missed} missed${better ? '. New best' : ''}.`;
    ui.prompt(msg);
    ui.status('');
    ui.big(stars(r.stars), '');
    setTimeout(() => ui.big(), 2600);
  }

  noteOn(e) { this.session?.noteOn(e.midi, e.time); }
  tick(dt) {
    const wasRunning = this.session?.running;
    this.session?.tick(dt);
    if (wasRunning !== this._lastRunning) { this._lastRunning = wasRunning; this.renderControls(); }
  }
}

// ======================================================================
// Games
// ======================================================================
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
      this.app.staff.noteClass(n.i, 'hit');
      this.app.staff.noteClass(n.i, 'cleared');
      this._markNext();
      kb.flash(e.midi, 'hit');
      if (this.cleared % 5 === 0) this.speed = Math.min(2.4, this.speed * 1.08);
    } else {
      this.combo = 0;
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

export { LESSONS, UNITS, SONGS, GAMES };
