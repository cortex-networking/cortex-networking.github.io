// Practice engine for a score: wait mode, play-along (timed), rhythm-only (tap) and listen.
// Every mistake is classified and reported to the coach.
import { groupSteps, DYNAMICS } from './theory.js';
import { generateBacking } from './backing.js';

const PERFECT = 0.07, GOOD = 0.14, WINDOW = 0.24;
const SYNC = 0.09; // seconds allowed between hands on a shared beat

export class Session {
  /**
   * opts: mode 'wait'|'play'|'tap'|'listen', hands 'R'|'L'|'B', accompany, band, tempoScale, hints,
   *       metronome, staves, context (for the coach: { ref, skills }), onDone(result), onUpdate(stats, last)
   */
  constructor(app, score, opts = {}) {
    this.app = app;
    this.score = score;
    this.o = { mode: 'wait', hands: 'B', accompany: true, band: false, tempoScale: 1, hints: true, metronome: true, staves: 'grand', ...opts };
    const hands = this.o.hands === 'B' ? ['R', 'L'] : [this.o.hands];
    if (this.o.mode === 'listen') { this.practice = []; this.other = [...score.notes]; }
    else {
      this.practice = score.notes.filter((n) => hands.includes(n.hand));
      this.other = this.o.accompany && this.o.mode !== 'tap' ? score.notes.filter((n) => !hands.includes(n.hand)) : [];
    }
    this.steps = groupSteps(this.practice);
    this.band = this.o.band && this.o.mode !== 'wait' ? generateBacking(score, { style: score.style }) : [];
    this.running = false;
    this.demo = [];
    this.cued = new Map();
    this.curT = null;
    this.viewBeat = 0;
    this._resetStats();
  }

  _resetStats() {
    const total = this.o.mode === 'tap' ? this.steps.length : this.practice.length;
    this.stats = { correct: 0, wrong: 0, perfect: 0, good: 0, ok: 0, missed: 0, short: 0, rest: 0, sync: 0, loud: 0, total };
  }

  get spb() { return 60 / (this.score.tempo * this.o.tempoScale); }
  get clickUnit() {
    const t = this.score.time;
    if (!t || t[1] !== 8) return 1;
    return t[0] % 3 === 0 && t[0] > 3 ? 1.5 : 0.5;
  }
  get countInBeats() {
    const bpb = this.score.bpb || 4;
    return bpb * Math.max(1, Math.ceil((3 * this.clickUnit) / bpb - 1e-6));
  }

  mount() {
    const { staff, keyboard } = this.app;
    const dim = this.o.mode === 'listen' || this.o.hands === 'B' ? [] : [this.o.hands === 'R' ? 'L' : 'R'];
    staff.setScore(this.score, { staves: this.o.staves, dimHands: dim, showZone: true });
    const ms = this.score.notes.map((n) => n.midi);
    if (ms.length) keyboard.need(Math.min(...ms), Math.max(...ms));
    this.viewBeat = this.o.mode === 'wait' ? (this.steps[0]?.t ?? 0) : 0;
    staff.setBeat(this.viewBeat);
    if (this.o.mode === 'wait') this._cueStep(false);
  }

  start() {
    const { sound, coach } = this.app;
    this.stop(true);
    this.running = true;
    this.app.staff.clearClasses('hit', 'miss', 'cur', 'done', 'late', 'early');
    this._resetStats();
    this.judged = new Set();
    this.down = new Map();       // midi -> { note, at } for hold checks
    this.handHits = new Map();   // step t -> { R: time, L: time }
    this.dynFlag = new Set();
    this.tracker = this.o.mode !== 'listen' && coach ? coach.begin({ ...(this.o.context || {}), score: this.score, hands: this.o.hands, tempo: this.o.tempoScale, staves: this.o.staves }) : null;
    if (this.o.mode === 'wait') {
      this.idx = 0;
      this.hits = new Set();
      this.misses = 0;
      this.targetBeat = this.steps[0]?.t ?? 0;
      if (this.other.length && this.steps.length) {
        const first = this.steps[0].t;
        const lead = this.other.filter((e) => e.t < first - 1e-6);
        const t0 = lead.length ? lead[0].t : 0;
        lead.forEach((e) => this._playOther(e, sound.now() + 0.05 + (e.t - t0) * this.spb));
      }
      this._cueStep();
    } else {
      const lead = this.o.mode === 'listen' ? 0 : this.countInBeats;
      this.t0 = sound.now() + (this.o.mode === 'listen' ? 0.35 : 0.25) + lead * this.spb;
      this.clickBeat = -lead;
      this.otherPtr = 0;
      this.bandPtr = 0;
      this.missPtr = 0;
      this.ended = false;
    }
    this._update();
  }

  stop(silent = false) {
    this.running = false;
    clearTimeout(this._finishTimer); // a finish scheduled by the run being stopped must not end the next one
    this.app.sound.stopAll();
    this.app.keyboard.clear('cue-r', 'cue-l', 'demo');
    this.app.keyboard.clearFingers();
    this.cued.clear();
    this.demo = [];
    if (!silent) this.app.staff.chordClassAt(this.curT, 'cur', false);
  }

  _coach(type, info) { if (this.tracker) this.app.coach.record(type, { key: this.score.key, ...info }, this.tracker); }

  // ---------- input ----------
  noteOn(midi, time = performance.now(), vel = 0.75, source = 'midi') {
    if (!this.running) return;
    if (this.o.mode === 'wait') this._waitNote(midi);
    else if (this.o.mode === 'play' || this.o.mode === 'tap') this._timedNote(midi, time, vel, source);
  }

  noteOff(midi, time = performance.now()) {
    if (!this.running || !this.down) return;
    const d = this.down.get(midi);
    if (!d) return;
    this.down.delete(midi);
    const n = d.note;
    const want = (n.sd ?? n.d) * this.spb;
    if (want < 0.4) return; // only judge notes long enough to matter
    const held = (time - d.at) / 1000;
    const ratio = held / want;
    if (ratio < 0.55) {
      this.stats.short++;
      this.app.staff.noteClass(n.i, 'short');
      this._coach('short', { ratio, t: n.t });
      this._update({ grade: 'short' });
    }
  }

  _waitNote(midi) {
    const step = this.steps[this.idx];
    if (!step) return;
    const n = step.notes.find((e) => e.midi === midi && !this.hits.has(e.i));
    const kb = this.app.keyboard;
    if (n) {
      this.hits.add(n.i);
      this.stats.correct++;
      this._coach('hit', {});
      this.app.staff.noteClass(n.i, 'hit');
      kb.flash(midi, 'hit');
      kb.mark(midi, n.hand === 'L' ? 'cue-l' : 'cue-r', false);
      kb.setFinger(midi, '');
      if (step.notes.every((e) => this.hits.has(e.i))) this._advance();
      else this._update({ grade: 'hit' });
    } else if (!step.notes.some((e) => e.midi === midi)) {
      this.stats.wrong++;
      this.misses++;
      kb.flash(midi, 'miss', 450);
      const pending = step.notes.filter((e) => !this.hits.has(e.i));
      const nearest = pending.reduce((a, e) => (!a || Math.abs(e.midi - midi) < Math.abs(a.midi - midi) ? e : a), null);
      if (nearest) this._coach(step.notes.length > 1 && step.notes.some((e) => this.hits.has(e.i)) ? 'chord' : 'wrong-pitch', { expected: nearest.midi, played: midi, t: step.t });
      if (!this.o.hints && this.misses >= 1) this._cueStep(true);
      this._update({ grade: 'wrong' });
    }
  }

  _advance() {
    const step = this.steps[this.idx];
    const next = this.steps[this.idx + 1];
    const { sound, staff } = this.app;
    staff.chordClassAt(step.t, 'cur', false);
    staff.chordClassAt(step.t, 'done', true);
    const now = sound.now();
    for (const e of this.other) {
      if (e.t >= step.t - 1e-6 && (!next || e.t < next.t - 1e-6)) this._playOther(e, now + 0.02 + (e.t - step.t) * this.spb);
    }
    this.idx++;
    this.misses = 0;
    this.app.keyboard.clear('cue-r', 'cue-l');
    this.app.keyboard.clearFingers();
    if (!next) { this._update(); this._finishLater(500); return; }
    this.targetBeat = next.t;
    this._cueStep();
    this._update({ grade: 'step' });
  }

  _cueStep(force = this.o.hints) {
    const step = this.steps[this.idx ?? 0];
    if (!step) return;
    this.curT = step.t;
    this.app.staff.chordClassAt(step.t, 'cur', true);
    if (!force) return;
    const kb = this.app.keyboard;
    for (const n of step.notes) {
      if (this.hits && this.hits.has(n.i)) continue;
      kb.mark(n.midi, n.hand === 'L' ? 'cue-l' : 'cue-r', true);
      if (n.finger) kb.setFinger(n.midi, n.finger);
    }
  }

  _inputTime(time) {
    const comp = (this.app.settings.latency || 0) / 1000;
    return this.app.sound.now() - Math.max(0, performance.now() - time) / 1000 - comp;
  }

  _timedNote(midi, time, vel, source) {
    const tIn = this._inputTime(time);
    const lat = this.app.sound.latency;
    const tap = this.o.mode === 'tap';
    let best = null, bestD = Infinity;
    const pool = tap ? this.steps.map((s) => ({ ...s.notes[0], i: `s${s.t}`, t: s.t, step: s })) : this.practice;
    for (const n of pool) {
      if ((!tap && n.midi !== midi) || this.judged.has(n.i)) continue;
      const d = tIn - (this.t0 + n.t * this.spb + lat);
      if (Math.abs(d) <= WINDOW && Math.abs(d) < Math.abs(bestD)) { best = n; bestD = d; }
    }
    const kb = this.app.keyboard;
    if (!best) {
      const beat = (tIn - lat - this.t0) / this.spb;
      const resting = this.score.events.some((e) => e.rest && (this.o.hands === 'B' || e.hand === this.o.hands) && beat >= e.t - 0.05 && beat < e.t + e.d - 0.1);
      const due = this.practice.find((n) => !this.judged.has(n.i) && Math.abs(n.t - beat) < 0.5);
      this.stats.wrong++;
      kb.flash(midi, 'miss', 450);
      if (resting && !due) { this.stats.rest++; this._coach('rest', { t: beat }); }
      else if (due && !tap) this._coach('wrong-pitch', { expected: due.midi, played: midi, t: due.t });
      else this._coach(tap ? 'early' : 'missed', { t: beat, ms: 0 });
      this._update({ grade: resting ? 'rest' : 'wrong' });
      return;
    }
    this.judged.add(best.i);
    const a = Math.abs(bestD);
    const grade = a <= PERFECT ? 'perfect' : a <= GOOD ? 'good' : 'ok';
    this.stats[grade]++;
    this.stats.correct++;
    if (grade === 'perfect') this._coach('hit', {});
    else this._coach(bestD < 0 ? 'early' : 'late', { ms: Math.round(bestD * 1000), t: best.t });
    if (tap) best.step.notes.forEach((n) => this.app.staff.noteClass(n.i, 'hit'));
    else {
      this.app.staff.noteClass(best.i, 'hit');
      this.down.set(midi, { note: best, at: time });
      // hands together?
      const hh = this.handHits.get(best.t) || {};
      hh[best.hand] = tIn;
      this.handHits.set(best.t, hh);
      if (hh.R !== undefined && hh.L !== undefined && !hh.checked) {
        hh.checked = true;
        if (Math.abs(hh.R - hh.L) > SYNC) { this.stats.sync++; this._coach('hands', { ms: Math.round((hh.R - hh.L) * 1000), t: best.t }); }
      }
      // loud / soft (real keyboards only)
      if (best.dyn && source === 'midi' && !this.dynFlag.has(best.dyn + best.t)) {
        const want = DYNAMICS[best.dyn];
        if ((want <= 0.45 && vel > 0.72) || (want >= 0.8 && vel < 0.5)) {
          this.dynFlag.add(best.dyn + best.t);
          this.stats.loud++;
          this._coach('dynamics', { want: best.dyn, got: vel, t: best.t });
        }
      }
    }
    kb.flash(midi, 'hit');
    this._update({ grade, early: grade !== 'perfect' && bestD < 0, late: grade !== 'perfect' && bestD > 0 });
  }

  // ---------- clock ----------
  tick(dt) {
    if (this.o.mode === 'wait') {
      if (this.targetBeat !== undefined) {
        this.viewBeat += (this.targetBeat - this.viewBeat) * Math.min(1, dt * 9);
        this.app.staff.setBeat(this.viewBeat);
      }
      this._demoKeys(this.app.sound.now());
      return;
    }
    if (!this.running) return;
    const { sound, staff } = this.app;
    const now = sound.now();
    const lat = sound.latency;
    const spb = this.spb;
    const beat = (now - lat - this.t0) / spb;
    staff.setBeat(beat);
    if (this.o.mode !== 'listen') {
      const lead = this.countInBeats;
      const n = beat < 0 ? Math.floor((beat + lead) / this.clickUnit) + 1 : 0;
      if (n !== this._count) {
        this._count = n;
        if (n > 0) this.app.ui.big(String(n), 'Count in', 'huge');
        else this.app.ui.big();
      }
    }
    const horizon = now + 0.3;
    while (this.t0 + this.clickBeat * spb < horizon) {
      const b = this.clickBeat;
      const bpb = this.score.bpb || 4;
      if (b < 0 || (this.o.metronome && this.o.mode !== 'listen')) {
        const rel = b < 0 ? b + this.countInBeats : b - (this.score.pickup || 0);
        const down = Math.abs(((rel % bpb) + bpb) % bpb) < 1e-6;
        if (b < this.score.length - 1e-6) sound.click(this.t0 + b * spb, down);
      }
      this.clickBeat += this.clickUnit;
      if (this.clickBeat > this.score.length + 4) break;
    }
    while (this.otherPtr < this.other.length && this.t0 + this.other[this.otherPtr].t * spb < horizon) {
      const e = this.other[this.otherPtr++];
      this._playOther(e, this.t0 + e.t * spb);
    }
    while (this.bandPtr < this.band.length && this.t0 + this.band[this.bandPtr].t * spb < horizon) {
      const e = this.band[this.bandPtr++];
      const when = this.t0 + e.t * spb;
      if (when < now - 0.05) continue;
      if (e.drum) sound.drum?.(e.drum, when, e.vel);
      else sound.play(e.midi, e.vel, when, Math.max(0.08, e.d * spb * 0.95), { instrument: e.instrument });
    }
    // missed notes
    const tap = this.o.mode === 'tap';
    const due = tap ? this.steps.map((s) => ({ i: `s${s.t}`, t: s.t, notes: s.notes })) : this.practice;
    // a key press reaches us `latency` ms after it happens (see _inputTime), so wait that long
    // before calling a note missed, or a late-but-in-window note is failed before it arrives
    const inLat = (this.app.settings.latency || 0) / 1000;
    while (this.missPtr < due.length) {
      const n = due[this.missPtr];
      if (this.t0 + n.t * spb + lat + WINDOW + inLat > now) break;
      if (!this.judged.has(n.i)) {
        this.judged.add(n.i);
        this.stats.missed++;
        (tap ? n.notes : [n]).forEach((x) => staff.noteClass(x.i, 'miss'));
        this._coach('missed', { expected: n.midi, t: n.t });
        this._update({ grade: 'missed' });
      }
      this.missPtr++;
    }
    // cue keys that are due now
    if (!tap) {
      const want = new Map();
      for (let i = Math.max(0, this.missPtr - 4); i < this.practice.length; i++) {
        const n = this.practice[i];
        if (n.t > beat + 0.6) break;
        if (!this.judged.has(n.i) && n.t + Math.min(n.d, 1) > beat - 0.1) want.set(n.midi, n.hand === 'L' ? 'cue-l' : 'cue-r');
      }
      const kb = this.app.keyboard;
      for (const [m, c] of this.cued) if (want.get(m) !== c) kb.mark(m, c, false);
      for (const [m, c] of want) if (this.cued.get(m) !== c) kb.mark(m, c, true);
      this.cued = want;
    }
    const pool = this.o.mode === 'listen' ? this.other : this.practice;
    let cur = null;
    for (const n of pool) { if (n.t <= beat + 0.02) cur = n.t; else break; }
    if (cur !== this.curT) {
      if (this.curT !== null) staff.chordClassAt(this.curT, 'cur', false);
      if (cur !== null) staff.chordClassAt(cur, 'cur', true);
      this.curT = cur;
    }
    this._demoKeys(now);
    if (!this.ended && beat > this.score.length + 0.3 && this.missPtr >= due.length) {
      this.ended = true;
      this._finishLater(300);
    }
  }

  _playOther(e, when) {
    const vel = this.o.mode === 'listen' ? (e.dyn ? DYNAMICS[e.dyn] : 0.72) : 0.52;
    const dur = Math.max(0.08, (e.sd ?? e.d) * this.spb * 0.94);
    this.app.sound.play(e.midi, vel, when, dur);
    this.demo.push({ midi: e.midi, a: when, b: when + dur });
  }

  _demoKeys(now) {
    if (!this.demo.length && !(this._demoOn && this._demoOn.size)) return;
    const heard = now - this.app.sound.latency;
    const kb = this.app.keyboard;
    const sounding = new Set();
    this.demo = this.demo.filter((d) => {
      if (d.a <= heard && heard < d.b) sounding.add(d.midi);
      return heard < d.b + 0.05;
    });
    if (!this._demoOn) this._demoOn = new Set();
    for (const m of this._demoOn) if (!sounding.has(m)) kb.mark(m, 'demo', false);
    for (const m of sounding) if (!this._demoOn.has(m)) kb.mark(m, 'demo', true);
    this._demoOn = sounding;
  }

  // ---------- results ----------
  result() {
    const s = this.stats;
    let out;
    if (this.o.mode === 'wait') {
      const acc = s.correct + s.wrong ? s.correct / (s.correct + s.wrong) : 1;
      out = { mode: 'wait', score: acc, stars: acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : 1, ...s };
    } else if (this.o.mode === 'listen') out = { mode: 'listen', score: 1, stars: 0, ...s };
    else {
      const pts = s.perfect + 0.75 * s.good + 0.5 * s.ok - 0.25 * s.wrong - 0.15 * (s.short + s.sync);
      const score = s.total ? Math.max(0, Math.min(1, pts / s.total)) : 1;
      out = { mode: this.o.mode, score, stars: score >= 0.9 ? 3 : score >= 0.75 ? 2 : score >= 0.5 ? 1 : 0, ...s };
    }
    if (this.tracker) {
      out.coach = this.app.coach.end(this.tracker, { score: out.score, skills: this.o.context?.skills || [] });
      this.tracker = null;
    }
    return out;
  }

  _finishLater(ms) {
    clearTimeout(this._finishTimer);
    this._finishTimer = setTimeout(() => this._finish(), ms);
  }

  _finish() {
    if (!this.running) return;
    this.running = false;
    this.app.keyboard.clear('cue-r', 'cue-l');
    this.app.keyboard.clearFingers();
    if (this.curT !== null) this.app.staff.chordClassAt(this.curT, 'cur', false);
    this.o.onDone && this.o.onDone(this.result());
  }

  _update(last = {}) {
    const s = this.stats;
    const done = this.o.mode === 'wait' ? (this.idx ?? 0) : s.correct + s.missed;
    const total = this.o.mode === 'wait' ? this.steps.length : s.total;
    this.o.onUpdate && this.o.onUpdate({ ...s, done, totalSteps: total }, last);
  }
}
