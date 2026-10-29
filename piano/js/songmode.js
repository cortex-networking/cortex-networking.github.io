// Song practice: wait, play along (with the band), rhythm only, listen. Feedback goes to the coach.
import { buildScore } from './theory.js';
import { Session } from './session.js';
import { h, segmented, stars, toggle } from './ui.js';
import { gradeText } from './lesson.js';

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
    if (this.opts.hands === 'B' ? !(this.score.hands.R && this.score.hands.L) : !this.score.hands[this.opts.hands]) this.opts.hands = this.score.hands.R ? 'R' : 'L';
  }

  /** Key hints fade once a piece is mastered in wait mode. */
  get hints() {
    const best = this.app.store.song(this.song.id);
    return this.app.settings.hints && !(best && best.wait >= 0.95 && (best.plays || 0) >= 2);
  }

  get hasBand() { return !!this.song.chords && this.song.style !== 'none'; }

  enter() {
    const { ui } = this.app;
    const year = this.song.year ? `, ${this.song.year}` : '';
    ui.head({ kicker: `${this.song.composer}${year}. Level ${this.song.level}`, title: this.song.title });
    ui.big();
    this.build();
    this._prompt();
  }

  exit() { this.session?.stop(); }

  _prompt() {
    const best = this.app.store.song(this.song.id);
    const tips = {
      wait: 'Wait mode pauses on every note until you play it. Learn the notes here first.',
      play: `Play along keeps time${this.hasBand && this.app.settings.band ? ' with the band' : ''}. You get a count-in, then the music scrolls without stopping.`,
      tap: 'Rhythm only: tap any key in time. Get the rhythm solid before adding the notes.',
      listen: 'Listen to the whole piece first, so you know how it should sound.',
    };
    const parts = [];
    if (best?.play) parts.push(`best play-along ${Math.round(best.play * 100)}%`);
    if (best?.wait) parts.push(`best wait-mode accuracy ${Math.round(best.wait * 100)}%`);
    let text = `${this.song.blurb ? `${this.song.blurb} ` : ''}${tips[this.opts.mode]}`;
    if (parts.length) text += ` Your ${parts.join(', ')}.`;
    if (this.opts.mode === 'wait' && this.app.settings.hints && !this.hints) text += ' You know this one, so key hints stay off unless you miss.';
    this.app.ui.prompt(text);
  }

  build() {
    this.session?.stop(true);
    const o = this.opts;
    this.session = new Session(this.app, this.score, {
      mode: o.mode, hands: o.hands, accompany: o.accompany, tempoScale: o.tempo, metronome: o.metronome,
      band: this.hasBand && this.app.settings.band && (o.mode === 'play' || o.mode === 'listen'),
      hints: this.hints, staves: 'grand',
      context: { ref: { type: 'song', id: this.song.id }, skills: o.hands === 'B' ? ['hands-together', 'sight-reading'] : o.hands === 'L' ? ['left-hand', 'sight-reading'] : ['sight-reading'] },
      onUpdate: (st, last) => this._stats(st, last),
      onDone: (r) => this._done(r),
    });
    this.session.mount();
    this.renderControls();
    this._stats(null);
  }

  _save() { this.app.store.data.songOpts = { ...this.opts }; this.app.store.save(); }

  renderControls(extra) {
    const { ui } = this.app;
    const o = this.opts, sc = this.score;
    const running = this.session?.running;
    const set = (k, v) => { o[k] = v; this._save(); this.build(); this._prompt(); };
    const tempoLabel = h('output', { class: 'tempo-val' }, `${Math.round(sc.tempo * o.tempo)} bpm`);
    const go = running
      ? h('button', { class: 'btn primary', onclick: () => { this.session.stop(); this.build(); } }, 'Stop')
      : h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.play() }, o.mode === 'listen' ? 'Listen' : 'Start');
    const controls = [
      go,
      segmented('Practice mode', [
        { value: 'wait', label: 'Wait' }, { value: 'play', label: 'Play along' },
        { value: 'tap', label: 'Rhythm' }, { value: 'listen', label: 'Listen' },
      ], o.mode, (v) => set('mode', v)),
      o.mode !== 'listen' ? segmented('Hands', [
        { value: 'R', label: 'Right', disabled: !sc.hands.R }, { value: 'L', label: 'Left', disabled: !sc.hands.L },
        { value: 'B', label: 'Both', disabled: !(sc.hands.R && sc.hands.L) || o.mode === 'tap' },
      ], o.hands, (v) => set('hands', v)) : null,
      o.mode !== 'listen' && o.mode !== 'tap' && o.hands !== 'B' && sc.hands.R && sc.hands.L
        ? toggle('Play the other hand for me', o.accompany, (v) => set('accompany', v)) : null,
      this.hasBand && (o.mode === 'play' || o.mode === 'listen')
        ? toggle('Band', this.app.settings.band, (v) => { this.app.settings.band = v; this.app.store.save(); this.build(); this._prompt(); }) : null,
      h('label', { class: 'range' }, 'Tempo',
        h('input', {
          type: 'range', min: 0.4, max: 1.3, step: 0.05, value: o.tempo,
          oninput: (e) => { tempoLabel.textContent = `${Math.round(sc.tempo * e.target.value)} bpm`; },
          onchange: (e) => set('tempo', +e.target.value),
        }), tempoLabel),
      o.mode === 'play' || o.mode === 'tap' ? toggle('Metronome', o.metronome, (v) => set('metronome', v)) : null,
    ];
    ui.foot(h('div', { class: 'controls' }, ...controls.filter(Boolean)), extra || null);
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
    else if (this.opts.mode === 'play' || this.opts.mode === 'tap') {
      const g = gradeText(last);
      ui.status(`${st.correct} of ${st.total}${g ? `. ${g}` : ''}`);
    }
  }

  async _done(r) {
    const { ui, store, coach } = this.app;
    this._last = false;
    if (r.mode === 'listen') { this.renderControls(); ui.status(''); return; }
    const pct = Math.round(r.score * 100);
    const prev = store.song(this.song.id) || {};
    if (r.mode !== 'tap') store.saveSong(this.song.id, r.mode, r.score, r.stars);
    this.app.renderList();
    const better = prev[r.mode] !== undefined && r.score > prev[r.mode];
    let msg;
    if (r.mode === 'wait') msg = `${pct}% of your notes were right first time${better ? ', a new best' : ''}.`;
    else if (r.mode === 'tap') msg = `Rhythm ${pct}%: ${r.perfect} right on the beat, ${r.good + r.ok} close, ${r.missed} missed.`;
    else msg = `${pct}%: ${r.perfect} perfect, ${r.good + r.ok} close, ${r.missed} missed${better ? '. New best' : ''}.`;
    const top = r.coach?.top;
    if (top) msg += ` Main thing to work on: ${coach.explain(top).toLowerCase()}`;
    ui.prompt(msg);
    ui.status('');
    ui.big(stars(r.stars), r.mode === 'play' && r.stars >= 2 ? 'Performance complete' : '');
    const actions = [];
    if (top) {
      actions.push(h('button', { class: 'btn', onclick: () => {
        const routine = coach.remedy(top, {
          score: this.score, hands: this.opts.hands, bars: r.coach.bars, confusions: r.coach.confusions, key: this.score.key,
          staves: this.opts.hands === 'L' ? 'bass' : this.opts.hands === 'R' ? 'treble' : 'grand',
        });
        if (routine) this.app.practice(routine);
      } }, 'Practice the tricky part'));
    }
    if (r.mode === 'play' && this.performance?.length) {
      actions.push(h('button', { class: 'btn quiet', onclick: (e) => this._saveTake(e.target) }, 'Save this take to the studio'));
    }
    this.renderControls(actions.length ? h('div', { class: 'controls' }, ...actions) : null);
  }

  noteOn(e) {
    if (this.session?.running && this.opts.mode === 'play') {
      if (!this.performance || this.session.t0 !== this.perfT0) { this.performance = []; this.perfT0 = this.session.t0; this.perfOpen = new Map(); }
      const beat = (this.session._inputTime(e.time) - this.app.sound.latency - this.session.t0) / this.session.spb;
      const n = { t: Math.max(0, beat), d: 0.25, midi: e.midi, vel: e.vel };
      this.performance.push(n);
      this.perfOpen.set(e.midi, n);
    }
    this.session?.noteOn(e.midi, e.time, e.vel, e.source);
  }

  noteOff(e) {
    const n = this.perfOpen?.get(e.midi);
    if (n && this.session) {
      const beat = (this.session._inputTime(e.time) - this.app.sound.latency - this.session.t0) / this.session.spb;
      n.d = Math.max(0.1, beat - n.t);
      this.perfOpen.delete(e.midi);
    }
    this.session?.noteOff(e.midi, e.time);
  }

  async _saveTake(btn) {
    let mod = null;
    try { mod = await import('./studio.js'); } catch { mod = null; }
    if (!mod?.saveRecording) { this.app.ui.toast('The studio isn’t available right now.'); return; }
    const tracks = [{ name: 'Your take', instrument: this.app.settings.instrument || 'grand', notes: this.performance.map((n) => ({ ...n })) }];
    if (this.opts.hands !== 'B') {
      const other = this.score.notes.filter((n) => n.hand !== this.opts.hands).map((n) => ({ t: n.t, d: n.sd ?? n.d, midi: n.midi, vel: 0.6 }));
      if (other.length) tracks.push({ name: this.opts.hands === 'R' ? 'Left hand' : 'Right hand', instrument: 'grand', notes: other });
    }
    mod.saveRecording(this.app.store, { name: `${this.song.title} take`, tempo: Math.round(this.score.tempo * this.opts.tempo), time: this.score.time, tracks });
    btn.disabled = true;
    btn.textContent = 'Saved to the studio';
    this.app.ui.toast('Saved. Open the Studio tab to hear it or add parts.');
  }

  pedal() {}
  tick(dt) {
    const was = this.session?.running;
    this.session?.tick(dt);
    if (was !== this._last) { this._last = was; if (!was) this.renderControls(); }
  }
}
