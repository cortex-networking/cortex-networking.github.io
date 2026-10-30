// Jukebox, as in the original Miracle: plays the songs with the full band, one after another, with
// no metronome. Pick a collection or shuffle; the staff and keys show every note as it plays.
import { buildScore } from './theory.js';
import { Session } from './session.js';
import { catalog, COLLECTIONS } from './catalog.js';
import { h, toggle } from './ui.js';

const GAP = 1.6; // seconds between songs

export class JukeboxMode {
  constructor(app) {
    this.app = app;
    const saved = app.store.data.jukebox || {};
    this.col = saved.col || 'all';
    this.shuffle = saved.shuffle ?? true;
    this.queue = [];
    this.i = 0;
  }

  enter() {
    this._build(this.app.store.data.jukebox?.last);
    this._show();
  }

  exit() { this._stop(); clearTimeout(this.timer); }

  _save() {
    this.app.store.data.jukebox = { col: this.col, shuffle: this.shuffle, last: this.queue[this.i] };
    this.app.store.save();
  }

  _songs() {
    return catalog.songs.filter((s) => s.chords && (this.col === 'all' || (s.tags || []).includes(this.col)));
  }

  /** Build the play queue, starting from `first` when it is in the collection. */
  _build(first) {
    let ids = this._songs().map((s) => s.id);
    if (this.shuffle) {
      for (let k = ids.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [ids[k], ids[j]] = [ids[j], ids[k]]; }
    }
    if (first && ids.includes(first)) ids = [first, ...ids.filter((x) => x !== first)];
    this.queue = ids;
    this.i = 0;
  }

  get song() { return catalog.song(this.queue[this.i]); }

  _show() {
    const { ui } = this.app;
    const song = this.song;
    if (!song) {
      ui.head({ kicker: 'Jukebox', title: 'Nothing to play' });
      ui.prompt('No songs in this collection have a band part yet.');
      this._controls();
      return;
    }
    ui.head({ kicker: `Jukebox · ${this.i + 1} of ${this.queue.length}`, title: song.title });
    ui.prompt(`${song.composer}${song.year ? `, ${song.year}` : ''}. ${song.blurb || ''}`);
    this._stop();
    this.score = buildScore(song);
    this.session = new Session(this.app, this.score, {
      mode: 'listen', hands: 'B', accompany: true, metronome: false, hints: false, staves: 'grand',
      band: this.app.settings.band, onDone: () => this._ended(),
    });
    this.session.mount();
    const next = catalog.song(this.queue[(this.i + 1) % this.queue.length]);
    ui.status(next && this.queue.length > 1 ? `Up next: ${next.title}` : '');
    this._controls();
  }

  _controls() {
    const { ui } = this.app;
    const playing = !!this.session?.running;
    const sel = h('select', { 'aria-label': 'Collection', onchange: (e) => { this.col = e.target.value; this._build(); this._save(); this._show(); } },
      h('option', { value: 'all' }, 'All songs'),
      ...COLLECTIONS.filter((c) => catalog.songs.some((s) => s.chords && (s.tags || []).includes(c.id))).map((c) => h('option', { value: c.id }, c.title)));
    sel.value = this.col;
    ui.foot(
      h('div', { class: 'controls' },
        h('button', { class: 'btn primary', 'data-enter': '', onclick: () => (playing ? this._pause() : this._play()) }, playing ? 'Stop' : 'Play'),
        h('button', { class: 'btn', 'aria-label': 'Previous song', onclick: () => this._skip(-1) }, 'Previous'),
        h('button', { class: 'btn', 'aria-label': 'Next song', onclick: () => this._skip(1) }, 'Next'),
        h('label', { class: 'ar-level' }, h('span', { class: 'sr-only' }, 'Collection'), sel),
        toggle('Shuffle', this.shuffle, (v) => { this.shuffle = v; const cur = this.queue[this.i]; this._build(cur); this._save(); this._show(); }),
        this.song ? h('a', { class: 'btn quiet', href: `#/songs/${this.song.id}` }, 'Learn this one') : null,
      ),
    );
  }

  _play() {
    this.app.sound.unlock();
    clearTimeout(this.timer);
    if (!this.session) this._show();
    this.session.mount();
    this.session.start();
    this.autoplay = true;
    this._save();
    this._controls();
  }

  _pause() {
    this.autoplay = false;
    clearTimeout(this.timer);
    this._stop();
    this._show();
  }

  _stop() { if (this.session) { this.session.stop(true); this.session = null; } }

  _skip(dir) {
    clearTimeout(this.timer);
    if (!this.queue.length) return;
    const wasPlaying = !!this.session?.running || this.autoplay;
    this.i = (this.i + dir + this.queue.length) % this.queue.length;
    this._save();
    this._show();
    if (wasPlaying) this._play();
  }

  _ended() {
    if (!this.autoplay) return;
    this.timer = setTimeout(() => this._skip(1), GAP * 1000);
  }

  noteOn() {}
  noteOff() {}
  tick(dt) { this.session?.tick?.(dt); }
}
