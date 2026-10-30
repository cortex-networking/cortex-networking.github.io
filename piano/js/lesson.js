// Lessons and practice routines: step runner with mastery checks and coach-built remediation.
import { buildScore, noteName, pc } from './theory.js';
import { Session } from './session.js';
import { h, stars } from './ui.js';
import { catalog } from './catalog.js';

const PASS = { say: 1, find: 0.7, pcs: 0.5, quiz: 0.7, seq: 0.85, rhythm: 0.7, tap: 0.75, song: 0.8 };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function stavesFor(step, lesson = {}) {
  if (step.staves) return step.staves;
  const rh = step.rh || (step.score && step.score.hands.R);
  const lh = step.lh || (step.score && step.score.hands.L);
  if (rh && lh) return 'grand';
  if (lh) return lesson.staves && lesson.staves !== 'treble' ? lesson.staves : 'bass';
  if (rh) return lesson.staves || 'treble';
  return lesson.staves || 'grand';
}

function scoreFor(step) {
  if (step.score) return step.score;
  return buildScore({ rh: step.rh, lh: step.lh, key: step.key, time: step.time || [4, 4], tempo: step.tempo || 90 });
}

export function gradeText(last = {}) {
  if (last.grade === 'perfect') return 'Perfect';
  if (last.grade === 'good' || last.grade === 'ok') return last.early ? 'A little early' : last.late ? 'A little late' : 'Good';
  if (last.grade === 'missed') return 'Missed one';
  if (last.grade === 'wrong') return 'Wrong key';
  if (last.grade === 'short') return 'Held too short';
  if (last.grade === 'rest') return 'That was a rest';
  return '';
}

/** Resolve a coach context reference back into a score. */
export function resolveRef(ref) {
  if (!ref) return null;
  if (ref.type === 'song') { const s = catalog.song(ref.id); return s ? buildScore(s) : null; }
  if (ref.type === 'lesson') {
    const l = catalog.lesson(ref.id);
    const st = l && l.steps[ref.step];
    if (st && (st.rh || st.lh)) return scoreFor(st);
    if (st && st.type === 'song') { const s = catalog.song(st.song) || catalog.song(st.alt); return s ? buildScore(s) : null; }
  }
  return null;
}

// ----------------------------------------------------------------------
// Small tasks
// ----------------------------------------------------------------------

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
    staff.showColumn(groups, { staves: this.staves, key: this.step.key });
    keyboard.clear('cue-r'); keyboard.clearFingers();
    if (show === 'both' || show === 'key' || this.hinted) {
      keyboard.mark(t, 'cue-r', true);
      if (this.step.finger) keyboard.setFinger(t, this.step.finger);
    }
    const count = this.queue.length > 1 ? `${this.k + 1} of ${this.queue.length}` : '';
    if (show === 'both' || show === 'name' || extra?.reveal) ui.big(noteName(t, { prefer: this.step.prefer }), count);
    else ui.big('', count);
  }

  noteOn(midi) {
    const t = this.target;
    if (t === undefined || this.locked) return;
    const { keyboard, coach } = this.app;
    if (midi === t || (this.step.anyOctave && pc(midi) === pc(t))) {
      this.correct++;
      coach.record('hit');
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
      coach.record('wrong-pitch', { expected: t, played: midi, key: this.step.key || 'C' });
      keyboard.flash(midi, 'miss', 450);
      this.hinted = true;
      this.present({ wrong: midi });
      this.app.ui.big(noteName(midi), `That’s ${noteName(midi)}. Look for ${noteName(t, { prefer: this.step.prefer })}.`);
      clearTimeout(this.wt);
      this.wt = setTimeout(() => this.target === t && this.present(), 1100);
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

// ----------------------------------------------------------------------
// Step runner
// ----------------------------------------------------------------------

export class StepRunner {
  /**
   * opts: steps, lesson (staves/skills), ref ({ type:'lesson', id } for coach contexts),
   *       onProgress(i, n), onDone(results)
   */
  constructor(app, opts) {
    this.app = app;
    this.o = opts;
    this.steps = opts.steps;
    this.results = [];
  }

  start(i = 0) { this.i = i - 1; this.next(); }

  next() {
    this.stopTask();
    this.i++;
    if (this.i >= this.steps.length) { this.o.onDone?.(this.results); return; }
    this.run(this.i);
  }

  stopTask() {
    clearTimeout(this.timer);
    this.task?.stop?.(true);
    this.task = null;
    if (this.tracker) { this.app.coach.end(this.tracker); this.tracker = null; }
  }

  run(i) {
    const step = this.steps[i];
    const { ui, staff, keyboard } = this.app;
    this.o.onProgress?.(i, this.steps.length);
    ui.prompt(step.text || '');
    ui.big();
    ui.status('');
    ui.layer(null);
    keyboard.clear('cue-r', 'cue-l');
    keyboard.clearFingers();
    const staves = stavesFor(step, this.o.lesson);
    const skip = h('button', { class: 'btn quiet', onclick: () => this.skip() }, 'Skip step');
    const ref = this.o.ref ? { ...this.o.ref, step: i } : null;
    const skills = this.o.lesson?.skills || [];

    if (step.type === 'say') {
      staff.showColumn([], { staves });
      ui.foot(h('button', { class: 'btn primary', onclick: () => this.done(i, { score: 1 }), 'data-enter': '' }, 'Continue'), h('span', { class: 'note' }, 'or press Enter'));
      return;
    }
    if (step.type === 'find' || step.type === 'pcs') {
      this.tracker = this.app.coach.begin({ ref, staves, hands: 'R' });
      const T = step.type === 'find' ? FindTask : PcsTask;
      this.task = new T(this.app, step, staves, (r) => this.done(i, { score: r.correct / Math.max(1, r.correct + r.wrong), ...r }));
      ui.foot(skip);
      return;
    }
    if (step.type === 'quiz') { this._quiz(i, step, staves, skip); return; }
    if (step.type === 'seq') {
      const score = scoreFor(step);
      const hands = score.hands.R && score.hands.L ? 'B' : score.hands.L ? 'L' : 'R';
      const s = new Session(this.app, score, {
        mode: 'wait', hands, accompany: false, hints: true, staves, context: { ref, skills },
        onDone: (r) => this.done(i, r),
        onUpdate: (st) => ui.status(st.wrong ? `${st.wrong} wrong ${st.wrong === 1 ? 'note' : 'notes'} so far` : ''),
      });
      s.mount(); s.start();
      this.task = s;
      ui.foot(h('button', { class: 'btn', onclick: () => { s.mount(); s.start(); } }, 'Restart'), skip);
      return;
    }
    if (step.type === 'rhythm' || step.type === 'tap') { this._timed(i, step, staves, scoreFor(step), step.type === 'tap' ? 'tap' : 'play', ref, skills); return; }
    if (step.type === 'song') {
      const def = catalog.song(step.song) || catalog.song(step.alt);
      if (!def) { this.done(i, { score: 1 }); return; }
      const score = buildScore(def);
      if (step.mode === 'play') { this._timed(i, step, 'grand', score, 'play', { type: 'song', id: def.id }, skills, def); return; }
      const hands = step.hands || 'R';
      const s = new Session(this.app, score, {
        mode: 'wait', hands, accompany: true, hints: true, staves: 'grand', tempoScale: step.tempo || 1,
        context: { ref: { type: 'song', id: def.id }, skills },
        onDone: (r) => this.done(i, r),
        onUpdate: (st) => ui.status(`${st.done} of ${st.totalSteps}${st.wrong ? `, ${st.wrong} wrong` : ''}`),
      });
      s.mount(); s.start();
      this.task = s;
      ui.big('', def.title);
      ui.foot(h('button', { class: 'btn', onclick: () => { s.mount(); s.start(); } }, 'Restart'), skip);
    }
  }

  _timed(i, step, staves, score, mode, ref, skills, songDef) {
    const { ui } = this.app;
    const tempoScale = step.tempoScale || (songDef ? step.tempo || 0.8 : 1);
    if (step.tempo && !songDef && !step.score) score.tempo = step.tempo;
    const opts = {
      mode, hands: step.hands || (score.hands.R && score.hands.L && mode !== 'tap' ? 'R' : score.hands.L && !score.hands.R ? 'L' : 'R'),
      accompany: !!songDef, band: !!songDef && this.app.settings.band, metronome: true, staves, tempoScale,
      context: { ref, skills },
    };
    if (mode === 'tap') opts.hands = score.hands.R ? 'R' : 'L';
    const preview = new Session(this.app, score, { ...opts, mode: mode === 'tap' ? 'tap' : 'play' });
    preview.mount();
    const run = () => {
      this.app.sound.unlock();
      const s = new Session(this.app, score, {
        ...opts,
        onUpdate: (st, last) => ui.status(gradeText(last)),
        onDone: (r) => this.done(i, r),
      });
      this.task = s;
      s.mount(); s.start();
      ui.foot(h('button', { class: 'btn', onclick: () => { s.stop(); this.task = null; this._timed(i, step, staves, score, mode, ref, skills, songDef); } }, 'Stop'),
        h('span', { class: 'note' }, mode === 'tap' ? 'Any key works. Listen to the count-in first.' : 'Listen to the count-in first.'));
    };
    const listen = () => {
      const l = new Session(this.app, score, { ...opts, mode: 'listen', band: opts.band, onDone: () => {} });
      this.task = l; l.mount(); l.start();
    };
    ui.foot(
      h('button', { class: 'btn primary', onclick: run, 'data-enter': '' }, 'Start'),
      h('button', { class: 'btn', onclick: listen }, 'Listen first'),
      h('button', { class: 'btn quiet', onclick: () => this.skip() }, 'Skip step'),
    );
    if (mode === 'tap') ui.big('', 'Rhythm only: any key counts');
    if (songDef) ui.big('', songDef.title);
  }

  async _quiz(i, step, staves, skip) {
    const { ui } = this.app;
    let mod = null;
    try { mod = await import('./games-extra.js'); } catch { mod = null; }
    if (!mod || !mod.QuizRunner) {
      ui.prompt('Quiz questions aren’t available right now.');
      ui.foot(h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.done(i, { score: 1 }) }, 'Continue'));
      return;
    }
    if (this.i !== i) return;
    this.tracker = this.app.coach.begin({ ref: this.o.ref ? { ...this.o.ref, step: i } : null, topic: step.generator });
    this.task = new mod.QuizRunner(this.app, { items: step.items, generator: step.generator, count: step.count || 6, staves }, (r) =>
      this.done(i, { score: r.correct / Math.max(1, r.correct + r.wrong), ...r }));
    ui.foot(skip);
  }

  skip() {
    this.results[this.i] = { score: 0, skipped: true, passed: false };
    this.next();
  }

  done(i, r) {
    if (i !== this.i) return;
    const step = this.steps[i];
    const pass = step.pass ?? (step.type === 'song' && step.mode === 'play' ? 0.6 : PASS[step.type] ?? 0.7);
    const summary = r.coach || (this.tracker ? this.app.coach.end(this.tracker, { score: r.score, skills: this.o.lesson?.skills || [] }) : null);
    this.tracker = null;
    const passed = r.score >= pass - 1e-9;
    this.results[i] = { score: r.score, passed, type: step.type };
    const { ui } = this.app;
    ui.status('');
    if (passed) {
      if (['rhythm', 'tap'].includes(step.type) || (step.type === 'song' && step.mode === 'play')) {
        const pct = Math.round(r.score * 100);
        ui.prompt(`${pct}% in time. ${r.score >= 0.9 ? 'Excellent.' : 'Nicely done.'}${summary?.top && r.score < 0.9 ? ` One thing to polish: ${this.app.coach.explain(summary.top).toLowerCase()}` : ''}`);
        ui.foot(
          h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.next() }, 'Continue'),
          h('button', { class: 'btn', onclick: () => this.run(i) }, 'Try again'),
        );
        return;
      }
      if (step.type === 'say') this.next();
      else this.timer = setTimeout(() => this.next(), 650);
      return;
    }
    this._oops(i, step, r, summary, pass);
  }

  _oops(i, step, r, summary, pass) {
    const { ui, coach } = this.app;
    const pct = Math.round(r.score * 100);
    const why = summary?.top ? coach.explain(summary.top) : '';
    if (this.app.staff.score) { this.app.staff.clearClasses('cur', 'done'); this.app.staff.setBeat(0); }
    this.app.keyboard.clear('cue-r', 'cue-l');
    ui.prompt(`Not quite yet: ${pct}%, and this step needs ${Math.round(pass * 100)}%. ${why}`);
    ui.big('', 'Let’s fix it');
    let remedy = null;
    if (summary?.top) {
      const score = step.score || (step.rh || step.lh ? scoreFor(step) : step.type === 'song' ? resolveRef({ type: 'song', id: step.song }) || resolveRef({ type: 'song', id: step.alt }) : null);
      remedy = coach.remedy(summary.top, {
        score, hands: step.hands || (score?.hands?.L && !score?.hands?.R ? 'L' : 'R'), bars: summary.bars,
        confusions: summary.confusions, staves: stavesFor(step, this.o.lesson), key: step.key || score?.key, topic: step.generator,
      });
    }
    ui.foot(
      remedy ? h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this._remedy(i, remedy) }, 'Practice the tricky part') : null,
      h('button', { class: `btn ${remedy ? '' : 'primary'}`, 'data-enter': remedy ? null : '', onclick: () => this.run(i) }, 'Try again'),
      h('button', { class: 'btn quiet', onclick: () => this.skip() }, 'Skip for now'),
    );
  }

  _remedy(i, routine) {
    const { ui } = this.app;
    const back = { kicker: ui.kicker.textContent, title: ui.title.textContent };
    ui.head({ kicker: 'Quick practice', title: routine.title.replace('Practice: ', '') });
    this.sub = new StepRunner(this.app, {
      steps: routine.steps, lesson: this.o.lesson,
      onProgress: (k, n) => ui.pips(n, k),
      onDone: () => {
        this.sub = null;
        ui.head(back);
        this.o.onProgress?.(i, this.steps.length);
        ui.prompt('Now try the step again.');
        setTimeout(() => this.run(i), 900);
      },
    });
    this.sub.start();
  }

  get active() { return this.sub || this; }
  noteOn(e) { const r = this.active; r.task?.noteOn?.(e.midi, e.time, e.vel, e.source); }
  noteOff(e) { const r = this.active; r.task?.noteOff?.(e.midi, e.time); }
  tick(dt) { const r = this.active; r.task?.tick?.(dt); }
  stop() { this.sub?.stop(); this.stopTask(); }
}

// ----------------------------------------------------------------------
// Lessons
// ----------------------------------------------------------------------

export function lessonUnlocked(app, lesson) {
  if (app.settings.openAll) return true;
  const idx = catalog.lessonIndex(lesson.id);
  if (idx <= 0) return true;
  if (app.store.lesson(lesson.id)) return true;
  const prev = catalog.lessons[idx - 1];
  return !!app.store.lesson(prev.id)?.passed;
}

export class LessonMode {
  constructor(app, lesson) {
    this.app = app;
    this.lesson = lesson;
    this.chapter = catalog.chapter(lesson.chapter);
    this.inChapter = catalog.lessonsIn(lesson.chapter);
  }

  enter() {
    const { ui, staff, keyboard, store } = this.app;
    const chIdx = catalog.chapters.indexOf(this.chapter);
    ui.head({ kicker: `Chapter ${chIdx + 1}: ${this.chapter?.title || ''}`, title: this.lesson.title });
    ui.prompt(this.lesson.goal || this.lesson.summary || '');
    ui.pips(this.lesson.steps.length, -1);
    ui.big();
    staff.showColumn([], { staves: this.lesson.staves || 'grand' });
    keyboard.need(48, 72);
    const best = store.lesson(this.lesson.id);
    if (!lessonUnlocked(this.app, this.lesson)) {
      const prev = catalog.lessons[catalog.lessonIndex(this.lesson.id) - 1];
      ui.prompt(`This lesson opens once you pass “${prev.title}”. Each lesson builds on the one before.`);
      ui.foot(
        h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.app.open('learn', prev.id) }, `Go to ${prev.title}`),
        h('button', { class: 'btn quiet', onclick: () => this.start() }, 'Open anyway'),
      );
      return;
    }
    const mins = Math.max(2, Math.round(this.lesson.steps.length * 0.9));
    ui.foot(
      h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.start() }, best ? 'Start again' : 'Start lesson'),
      h('span', { class: 'note' }, best?.passed ? stars(best.stars) : null, best?.passed ? ' Passed' : `${this.lesson.steps.length} steps, about ${mins} minutes`),
    );
  }

  start() {
    const { ui } = this.app;
    ui.head({ kicker: `Lesson ${this.inChapter.indexOf(this.lesson) + 1} of ${this.inChapter.length} in ${this.chapter?.title || 'this chapter'}`, title: this.lesson.title });
    this.runner = new StepRunner(this.app, {
      steps: this.lesson.steps, lesson: this.lesson, ref: { type: 'lesson', id: this.lesson.id },
      onProgress: (i, n) => ui.pips(n, i),
      onDone: (results) => this.complete(results),
    });
    this.runner.start();
  }

  complete(results) {
    const { ui, store, staff } = this.app;
    const graded = results.filter((r) => r && r.type !== 'say');
    const skipped = results.filter((r) => r?.skipped).length;
    const passed = !skipped && results.every((r) => !r || r.passed);
    const avg = graded.length ? graded.reduce((a, r) => a + r.score, 0) / graded.length : 1;
    const s = avg >= 0.95 ? 3 : avg >= 0.85 ? 2 : 1;
    store.saveLesson(this.lesson.id, { stars: passed ? s : 0, passed, accuracy: avg });
    const chapterDone = passed && this.inChapter.every((l) => store.lesson(l.id)?.passed);
    const newCert = chapterDone && store.certify(this.chapter.id);
    this.app.renderList();
    ui.pips(this.lesson.steps.length, this.lesson.steps.length);
    staff.showColumn([], { staves: this.lesson.staves || 'grand' });
    const idx = catalog.lessonIndex(this.lesson.id);
    const next = catalog.lessons[idx + 1];
    if (!passed) {
      ui.head({ kicker: 'Lesson finished with skipped steps', title: this.lesson.title });
      ui.prompt(`You skipped ${skipped} ${skipped === 1 ? 'step' : 'steps'}. Pass every step to unlock the next lesson. Running the lesson again usually goes quicker.`);
      ui.big('', '');
      ui.foot(
        h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.start() }, 'Run it again'),
        h('button', { class: 'btn', onclick: () => this.app.open('learn', '') }, 'Back to the course'),
      );
      return;
    }
    ui.head({ kicker: newCert ? `Chapter complete: ${this.chapter.title}` : 'Lesson complete', title: this.lesson.title });
    ui.prompt(newCert ? 'That finishes the chapter. Your certificate is ready.'
      : s === 3 ? 'Clean playing all the way through.' : s === 2 ? 'Well played. A few slips; the next run will feel easier.' : 'Passed. Run it once more sometime to make it feel easy.');
    ui.big(stars(s), '');
    ui.foot(
      next ? h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.app.open('learn', next.id) }, `Next: ${next.title}`)
        : h('button', { class: 'btn primary', onclick: () => this.app.setTab('songs') }, 'Explore the songs'),
      newCert ? h('button', { class: 'btn', onclick: () => this.app.showCertificate(this.chapter.id) }, 'View certificate') : null,
      h('button', { class: 'btn quiet', onclick: () => this.start() }, 'Repeat lesson'),
    );
  }

  noteOn(e) { this.runner?.noteOn(e); }
  noteOff(e) { this.runner?.noteOff(e); }
  tick(dt) { this.runner?.tick(dt); }
  exit() { this.runner?.stop(); }
}

/** Runs a practice routine (from the coach) outside the course. */
export class PracticeMode {
  constructor(app, routine) { this.app = app; this.routine = routine; }

  enter() {
    const { ui, staff } = this.app;
    staff.showColumn([], { staves: 'grand' });
    if (!this.routine) {
      ui.head({ kicker: 'Practice', title: 'Nothing to fix yet' });
      ui.prompt('Play a few lessons or songs first. Every mistake you make teaches the coach what to practice with you.');
      ui.foot(h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.app.open('learn', '') }, 'Back to the course'));
      return;
    }
    ui.head({ kicker: 'Practice made from your mistakes', title: this.routine.title });
    const spots = this.routine.spots || [];
    ui.prompt(spots.length ? `Today: ${spots.map((s) => s.label.toLowerCase()).join(' and ')}. About ${Math.max(3, this.routine.steps.length)} minutes.` : 'A short, focused routine.');
    ui.pips(this.routine.steps.length, -1);
    ui.foot(h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.start() }, 'Start practice'));
  }

  start() {
    const { ui } = this.app;
    this.runner = new StepRunner(this.app, {
      steps: this.routine.steps, lesson: { skills: [] },
      onProgress: (i, n) => ui.pips(n, i),
      onDone: (results) => {
        const graded = results.filter((r) => r && r.type !== 'say' && !r.skipped);
        const avg = graded.length ? graded.reduce((a, r) => a + r.score, 0) / graded.length : 1;
        ui.head({ kicker: 'Practice done', title: this.routine.title });
        ui.prompt(avg >= 0.85 ? 'Strong work. Those spots are getting solid.' : 'Good effort. Come back to this tomorrow; short, regular practice works best.');
        ui.big(`${Math.round(avg * 100)}%`, 'average');
        ui.foot(
          h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.app.open('learn', '') }, 'Back to the course'),
          h('button', { class: 'btn', onclick: () => this.start() }, 'Practice again'),
        );
      },
    });
    this.runner.start();
  }

  noteOn(e) { this.runner?.noteOn(e); }
  noteOff(e) { this.runner?.noteOff(e); }
  tick(dt) { this.runner?.tick(dt); }
  exit() { this.runner?.stop(); }
}
