// Recording studio: eight tracks with a voice each, tape-style transport, metronome count-in, loop,
// quantize, a piano-roll view and Standard MIDI File import/export. Songs live in app.store.data.studio.
import { h, segmented, toggle } from './ui.js';
import { isBlack } from './theory.js';
import { writeMidi, readMidi, INSTRUMENT_PROGRAMS, instrumentForProgram } from './midifile.js';

const TPB = 480;                  // storage resolution, ticks per beat
const NT = 8;                     // tracks per song
const LOOKAHEAD = 0.25;           // seconds of audio scheduled ahead of the clock
const GUTTER = 34, RULER = 26, PEDAL = 6;
const MAX_NOTES = 20000;          // per song, keeps local storage in check
const EPS = 1e-9;

export const STUDIO_INSTRUMENTS = [
  { value: 'grand', label: 'Piano' }, { value: 'epiano', label: 'Electric piano' }, { value: 'organ', label: 'Organ' },
  { value: 'bass', label: 'Bass' }, { value: 'pad', label: 'Pad' }, { value: 'choir', label: 'Choir' }, { value: 'pluck', label: 'Pluck' },
];
const INST_LABEL = Object.fromEntries(STUDIO_INSTRUMENTS.map((o) => [o.value, o.label]));
const DEFAULT_INST = ['grand', 'epiano', 'bass', 'organ', 'pad', 'choir', 'pluck', 'grand'];
const METERS = { '4/4': [4, 4], '3/4': [3, 4], '6/8': [6, 8] };
const FALLBACK = ['#d9a93a', '#8fb7de', '#e9705a', '#62c993', '#b99be3', '#e6dcc3', '#e58fb6', '#5fc7c9'];
// General MIDI percussion keys to the synth's drum kinds (used only if app.sound.drum exists).
const DRUM_KIT = {
  35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 39: 'clap', 40: 'snare', 41: 'tomlo', 42: 'hat', 43: 'tomlo', 44: 'hat',
  45: 'tomlo', 46: 'openhat', 47: 'tomhi', 48: 'tomhi', 49: 'crash', 50: 'tomhi', 51: 'hat', 52: 'crash', 53: 'hat', 55: 'crash', 57: 'crash', 59: 'hat',
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const barBeats = (time) => (time[0] * 4) / time[1];
const clickUnit = (time) => (time[1] === 8 && time[0] % 3 === 0 ? 1.5 : 4 / time[1]);
const countUnit = (time) => 4 / time[1];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song';
const sortNotes = (a) => a.sort((x, y) => x.t - y.t || x.midi - y.midi);

// ---------------------------------------------------------------- storage format
// song:  { id, name, bpm, time:[n,d], q:0|8|16, loop:0|1, metro:0|1, at, tracks:[8 x track] }
// track: { name, inst, vol?, mute?, solo?, drums?, n?:[dTick, durTick, midi, vel127, ...], p?:[downTick, upTick, ...] }
// Note start ticks are delta-coded; ticks are 1/480 beat; beats are quarter notes.

function encNotes(notes) {
  const out = [];
  let last = 0;
  for (const n of sortNotes([...notes])) {
    const t = Math.max(0, Math.round(n.t * TPB));
    out.push(t - last, Math.max(1, Math.round(n.d * TPB)), clamp(n.midi | 0, 0, 127), clamp(Math.round((n.vel ?? 0.75) * 127), 1, 127));
    last = t;
  }
  return out;
}
function decNotes(a) {
  const out = [];
  if (!Array.isArray(a)) return out;
  let t = 0;
  for (let i = 0; i + 3 < a.length; i += 4) {
    t += +a[i] || 0;
    out.push({ t: t / TPB, d: Math.max(1, +a[i + 1] || 1) / TPB, midi: clamp(a[i + 2] | 0, 0, 127), vel: clamp((+a[i + 3] || 96) / 127, 0, 1) });
  }
  return out;
}
const encPedal = (p = []) => p.flatMap(([a, b]) => [Math.max(0, Math.round(a * TPB)), Math.max(0, Math.round(b * TPB))]);
function decPedal(a) {
  const out = [];
  if (!Array.isArray(a)) return out;
  for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i] / TPB, Math.max(a[i], a[i + 1]) / TPB]);
  return out;
}

function validTime(t) {
  if (typeof t === 'string') t = t.split('/').map(Number);
  if (!Array.isArray(t)) return [4, 4];
  const k = `${t[0]}/${t[1]}`;
  if (METERS[k]) return [...METERS[k]];
  if (t[1] === 8 && t[0] % 3 === 0) return [6, 8];
  if ((t[0] * 4) / t[1] === 3) return [3, 4];
  return [4, 4];
}
const validInst = (v, i) => (INST_LABEL[v] ? v : DEFAULT_INST[i % NT]);
const blankTrack = (i) => ({ name: `Track ${i + 1}`, inst: DEFAULT_INST[i] });

function rawSong(name) {
  return { id: uid(), name, bpm: 96, time: [4, 4], q: 0, loop: 0, metro: 1, at: Date.now(), tracks: Array.from({ length: NT }, (_, i) => blankTrack(i)) };
}

function decodeSong(r) {
  return {
    id: r.id || uid(),
    name: String(r.name || 'Untitled'),
    bpm: clamp(Math.round(+r.bpm || 96), 40, 200),
    time: validTime(r.time),
    q: [0, 8, 16].includes(r.q) ? r.q : 0,
    loop: !!r.loop,
    metro: r.metro !== 0 && r.metro !== false,
    at: r.at || Date.now(),
    tracks: Array.from({ length: NT }, (_, i) => {
      const t = (r.tracks && r.tracks[i]) || blankTrack(i);
      return {
        name: String(t.name ?? `Track ${i + 1}`), inst: validInst(t.inst, i), vol: clamp(t.vol ?? 0.8, 0, 1),
        mute: !!t.mute, solo: !!t.solo, drums: !!t.drums, notes: decNotes(t.n), pedal: decPedal(t.p),
      };
    }),
  };
}

function encodeSong(s) {
  return {
    id: s.id, name: s.name, bpm: s.bpm, time: [...s.time], q: s.q, loop: s.loop ? 1 : 0, metro: s.metro ? 1 : 0, at: s.at,
    tracks: s.tracks.map((t) => {
      const o = { name: t.name, inst: t.inst };
      if (Math.abs(t.vol - 0.8) > 0.001) o.vol = Math.round(t.vol * 100) / 100;
      if (t.mute) o.mute = 1;
      if (t.solo) o.solo = 1;
      if (t.drums) o.drums = 1;
      if (t.notes.length) o.n = encNotes(t.notes);
      if (t.pedal.length) o.p = encPedal(t.pedal);
      return o;
    }),
  };
}

function studioData(store) {
  let s = store.data.studio;
  if (!s || typeof s !== 'object') s = store.data.studio = {};
  if (!Array.isArray(s.songs)) s.songs = [];
  return s;
}

function uniqueName(st, base) {
  const names = new Set(st.songs.map((s) => s.name));
  base = String(base || 'Song').trim().slice(0, 60) || 'Song';
  if (!names.has(base)) return base;
  for (let k = 2; ; k++) if (!names.has(`${base} ${k}`)) return `${base} ${k}`;
}

function rawInfo(r) {
  let used = 0, last = -1;
  for (const t of r.tracks || []) {
    if (!Array.isArray(t.n) || !t.n.length) continue;
    used++;
    let tick = 0;
    for (let i = 0; i < t.n.length; i += 4) tick += +t.n[i] || 0;
    last = Math.max(last, tick / TPB);
  }
  const bars = last < 0 ? 0 : Math.floor(last / barBeats(validTime(r.time))) + 1;
  return { used, bars };
}

/**
 * Save a performance from another mode as a new studio song. t/d in beats (quarter notes), vel 0..1.
 * Returns the new song id; it also becomes the song the studio opens next.
 */
export function saveRecording(store, { name, tempo = 96, time = [4, 4], tracks = [] } = {}) {
  const st = studioData(store);
  const r = rawSong(uniqueName(st, name || 'Recording'));
  r.bpm = clamp(Math.round(+tempo || 96), 40, 200);
  r.time = validTime(time);
  let budget = MAX_NOTES;
  (tracks || []).slice(0, NT).forEach((t, i) => {
    const o = r.tracks[i];
    if (t.name) o.name = String(t.name).slice(0, 40);
    if (t.instrument) o.inst = validInst(t.instrument, i);
    const notes = (t.notes || [])
      .filter((n) => Number.isFinite(n.t) && Number.isFinite(n.midi))
      .slice(0, Math.max(0, budget))
      .map((n) => ({ t: Math.max(0, n.t), d: Math.max(1 / TPB, +n.d || 0.5), midi: clamp(Math.round(n.midi), 0, 127), vel: clamp(n.vel ?? 0.75, 0.01, 1) }));
    budget -= notes.length;
    if (notes.length) o.n = encNotes(notes);
    if (Array.isArray(t.pedal) && t.pedal.length) o.p = encPedal(t.pedal);
  });
  st.songs.push(r);
  st.cur = r.id;
  store.save();
  return r.id;
}

/** Side list for the studio tab: saved songs, newest first, linking to #/studio/<id>. */
export function renderStudioList(app, list) {
  const st = studioData(app.store);
  const cur = app.ctrl instanceof StudioMode ? app.ctrl.song.id : st.cur;
  const songs = [...st.songs].sort((a, b) => (b.at || 0) - (a.at || 0));
  const item = (r) => {
    const info = rawInfo(r);
    const sub = info.used ? `${info.used} ${info.used === 1 ? 'track' : 'tracks'}, ${info.bars} ${info.bars === 1 ? 'bar' : 'bars'}, ${clamp(r.bpm | 0, 40, 200)} bpm` : 'Empty';
    return h('a', { class: 'item', href: `#/studio/${encodeURIComponent(r.id)}`, 'aria-current': r.id === cur ? 'page' : null },
      h('span', { class: 'item-title' }, r.name), h('span', { class: 'item-sub' }, sub));
  };
  list.append(
    h('p', { class: 'list-note' }, 'Record up to eight tracks, layer parts and export MIDI files. Songs are saved in this browser.'),
    songs.length ? h('section', { class: 'group' }, h('h2', {}, 'Your songs'), ...songs.map(item)) : null,
    h('section', { class: 'group help' },
      h('h2', {}, 'How to record'),
      h('p', {}, 'Pick a track with its round button, choose a sound, then press Record. You get one bar of clicks before it starts.'),
      h('p', {}, 'Other tracks play while you record, so you can build a song one part at a time.'),
      h('p', {}, h('kbd', {}, 'Space'), ' plays and stops. ', h('kbd', {}, 'Ctrl'), ' ', h('kbd', {}, 'Z'), ' undoes the last take.')),
  );
}

// ---------------------------------------------------------------- small helpers

const ICONS = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor"/>',
  record: '<circle cx="12" cy="12" r="6.5" fill="currentColor"/>',
  rewind: '<path d="M6.5 6v12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19 6.5v11L10 12z" fill="currentColor"/>',
  undo: '<path d="M9.5 6.5 5 11l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 11H14a4.5 4.5 0 0 1 0 9h-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  list: '<path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  clear: '<path d="M7.5 7.5l9 9M16.5 7.5l-9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  download: '<path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `rs-ic rs-ic-${name}`);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.innerHTML = ICONS[name];
  return s;
}

/**
 * Schedule a note in a track's voice. Passes opts.instrument for the multi-voice synth, and also sets
 * sound.instrument for the duration of the call so an older synth that ignores opts still picks the voice
 * (unknown voices fall back to piano there).
 */
function playIn(sound, inst, midi, vel, when, dur) {
  const prev = sound.instrument;
  sound.instrument = inst;
  try { sound.play(midi, vel, when, dur, { instrument: inst }); } finally { sound.instrument = prev; }
}

function lowerBound(list, b) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].t < b - EPS) lo = m + 1; else hi = m; }
  return lo;
}

// ======================================================================
// Studio controller
// ======================================================================
export class StudioMode {
  /** def: optional song id (string) or { id } to open; else the id in #/studio/<id>; else the last song used. */
  constructor(app, def) {
    this.app = app;
    this.data = studioData(app.store);
    const [, tab, hashId] = (location.hash || '').split('/');
    const want = typeof def === 'string' ? def : def?.id || (tab === 'studio' ? decodeURIComponent(hashId || '') : '');
    let raw = this.data.songs.find((s) => s.id === want) || this.data.songs.find((s) => s.id === this.data.cur) || this.data.songs[0];
    if (!raw) { raw = rawSong('Song 1'); this.data.songs.push(raw); app.store.save(); }
    this.song = decodeSong(raw);
    this.data.cur = this.song.id;
    this.armed = clamp(this.data.armed | 0, 0, NT - 1);
    this.overdub = !!this.data.overdub;
    this.view = this.data.view === 'tracks' ? 'tracks' : 'roll';
    this.ppb = clamp(+this.data.zoom || 28, 6, 160);
    this.state = 'stopped';
    this.pos = 0;
    this.playBeat = 0;
    this.undo = [];
    this.cache = new Map();
    this.flashes = [];
    this.demoOn = new Set();
    this.dirty = true;
    this.userScrollAt = 0;
    this.progScrollAt = 0;
    this._fixArm();
  }

  // ---------------------------------------------------------------- lifecycle
  enter() {
    const { ui, keyboard } = this.app;
    // the router builds us before the previous controller exits (which may have just saved a take)
    const fresh = this.data.songs.find((x) => x.id === this.song.id);
    if (fresh) { this.song = decodeSong(fresh); this._fixArm(); }
    document.body.classList.add('studio-on');
    ui.pips(0, 0);
    ui.big();
    this._head();
    this._build();
    this._buildFoot();
    this._prompt();
    this._summary();
    this._monitor();
    this._hash();
    keyboard.need(48, 72);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
    this._onTheme = () => { this.colors = null; this.dirty = true; };
    this._mq = matchMedia('(prefers-color-scheme: dark)');
    this._mq.addEventListener?.('change', this._onTheme);
    this._narrow = matchMedia('(max-width: 560px)');
    this._onNarrow = () => this._placeFoot();
    this._narrow.addEventListener?.('change', this._onNarrow);
    this._placeFoot();
    this._mo = new MutationObserver(this._onTheme);
    this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  exit() {
    if (this.state !== 'stopped') this.stop();
    this.app.sound.instrument = this.app.settings?.instrument || 'grand';
    document.body.classList.remove('studio-on');
    window.removeEventListener('keydown', this._onKey);
    this._mq?.removeEventListener?.('change', this._onTheme);
    this._narrow?.removeEventListener?.('change', this._onNarrow);
    clearTimeout(this._lt);
    this._mo?.disconnect();
    this._ro?.disconnect();
    this.overlay?.remove();
    this.app.ui.big();
  }

  // ---------------------------------------------------------------- input from the app
  noteOn(e) {
    if (this.state !== 'recording' || !this.take) return;
    const { b, abs } = this._inputBeat(e.time);
    if (abs < this.take.abs0 - 0.5) return;           // too early in the count-in
    this.open.set(e.midi, { t: Math.max(0, b), abs, vel: e.vel ?? 0.75 });
    this.dirty = true;
  }

  noteOff(e) {
    if (this.state !== 'recording' || !this.take) return;
    const o = this.open.get(e.midi);
    if (!o) return;
    this.open.delete(e.midi);
    const { abs } = this._inputBeat(e.time);
    this.take.notes.push({ t: o.t, d: Math.max(1 / 64, abs - o.abs), midi: e.midi, vel: o.vel });
    this.dirty = true;
  }

  pedal(down) {
    if (this.state !== 'recording' || !this.take) return;
    const { b, abs } = this._inputBeat(performance.now());
    if (down) { if (!this.pedalOpen) this.pedalOpen = { t: Math.max(0, b), abs }; }
    else if (this.pedalOpen) {
      this.take.pedal.push([this.pedalOpen.t, this.pedalOpen.t + Math.max(0, abs - this.pedalOpen.abs)]);
      this.pedalOpen = null;
    }
  }

  tick() {
    const s = this.app.sound;
    if (this.state !== 'stopped' && this.segs) {
      this._schedule();
      const t = s.now() - s.latency;
      const b = this.beatAt(t), abs = this.absAt(t);
      this.playBeat = b;
      if (this.state === 'recording' && this.countIn) {
        if (abs < this.take.abs0 - 1e-3) {
          const n = Math.floor(Math.max(0, abs) / clickUnit(this.song.time) + 1e-6) + 1;
          if (n !== this._count) { this._count = n; this.app.ui.big(String(n), 'Count-in', 'center'); }
        } else { this.countIn = false; this._count = 0; this.app.ui.big(); this._prompt(); }
      }
      if (this.state === 'playing' && this.loopEnd === Infinity) {
        const end = this._end();
        if (end > 0 && b > end + 0.3) { this.stop(); this.pos = 0; }
      }
      this._demoKeys(s.now());
      if (this.state !== 'stopped') this._follow(Math.max(0, b));
      this.dirty = true;
    }
    this._syncCounter();
    if (this.dirty) { this.dirty = false; this._layoutWidth(); this._draw(); }
  }

  // ---------------------------------------------------------------- transport
  get spb() { return 60 / this.song.bpm; }
  get bar() { return barBeats(this.song.time); }
  get grid() { return this.song.q ? 4 / this.song.q : 0; }

  play() {
    if (this.state !== 'stopped') return;
    let from = this.pos;
    const end = this._end();
    if (!this.song.loop && end > 0 && from >= end - 1e-6) from = 0;
    this.state = 'playing';
    this._start(from, 0);
    this._afterState();
  }

  record() {
    if (this.state === 'recording') { this.stop(); return; }
    const tr = this.song.tracks[this.armed];
    if (tr.drums) return;
    const s = this.app.sound;
    let from, abs0;
    if (this.state === 'playing') {                       // punch in where the music is
      const t = s.now() - s.latency;
      from = Math.max(0, this.beatAt(t));
      abs0 = this.absAt(t);
      this.countIn = false;
    } else {
      const cu = clickUnit(this.song.time);
      from = Math.floor(this.pos / cu + 1e-6) * cu;       // start on a click so the count-in lines up
      if (this.song.loop) { const L = this._loopLen(); if (L && from >= L - 1e-6) from = 0; }
      this._start(from, this.bar);
      from = this.segs[0].beat + this.bar;                // _start may have moved it into the loop
      abs0 = this.bar;
      this.countIn = true;
      this._count = 0;
    }
    this.state = 'recording';
    this.take = { track: this.armed, notes: [], pedal: [], from, abs0 };
    this.open = new Map();
    this.pedalOpen = this.app.input.pedal ? { t: from, abs: abs0 } : null;
    this._afterState();
  }

  stop() {
    if (this.state === 'stopped') return;
    const s = this.app.sound;
    const t = s.now() - s.latency;
    const beat = this.segs ? this.beatAt(t) : this.pos;
    const wasRec = this.state === 'recording';
    let msg = null;
    if (wasRec) msg = this._commit(t);
    this.state = 'stopped';
    s.stopAll();
    this._clearDemo();
    this.countIn = false;
    this.app.ui.big();
    this.pos = Math.max(0, wasRec && this.take0From !== undefined && beat < this.take0From ? this.take0From : beat);
    this.take0From = undefined;
    this.segs = null;
    this._afterState(msg);
  }

  rewind() {
    if (this.state === 'recording') this.stop();
    if (this.state === 'playing') this.seek(0);
    else this.pos = 0;
    this._scrollTo(0);
    this.dirty = true;
  }

  seek(b) {
    if (this.state === 'recording') return;
    b = Math.max(0, b);
    if (this.state === 'playing') { this.app.sound.stopAll(); this._clearDemo(); this._start(b, 0); }
    else this.pos = b;
    this.dirty = true;
  }

  _start(from, preroll) {
    const s = this.app.sound;
    s.unlock();
    this.loopEnd = Infinity;
    if (this.song.loop) {
      const L = this._loopLen();
      if (L) { this.loopEnd = L; if (from >= L - 1e-6) from = 0; }
    }
    const spb = this.spb;
    const t0 = s.now() + 0.12;
    const b0 = from - preroll;
    this.segs = [{ time: t0, beat: b0, abs: 0, spb }];
    this.cur = { time: t0, beat: b0, abs: 0 };
    const cu = clickUnit(this.song.time);
    this.nextClick = Math.ceil((b0 - 1e-6) / cu) * cu;
    this.playBeat = b0;
    this.take0From = preroll ? from : undefined;
  }

  _seg(t) {
    let s = this.segs[0];
    for (const x of this.segs) { if (x.time <= t) s = x; else break; }
    return s;
  }
  beatAt(t) { const s = this._seg(t); return s.beat + (t - s.time) / s.spb; }
  absAt(t) { const s = this._seg(t); return s.abs + (t - s.time) / s.spb; }

  /** Audio-clock time the player was hearing at performance.now()-based `time`. */
  heardAt(time = performance.now()) {
    const s = this.app.sound;
    const now = performance.now();
    time = Math.min(time, now);
    const comp = (this.app.settings?.latency || 0) / 1000;
    const ts = s.ctx?.getOutputTimestamp?.();
    // getOutputTimestamp pairs the sample at the speaker with its performance.now(): the precise mapping
    if (ts && ts.performanceTime > 0 && Math.abs(now - ts.performanceTime) < 500 && ts.contextTime > 0) {
      return ts.contextTime + (time - ts.performanceTime) / 1000 - comp;
    }
    return s.now() - (now - time) / 1000 - s.latency - comp;
  }

  _inputBeat(time) {
    const t = this.heardAt(time);
    return { b: this.beatAt(t), abs: this.absAt(t) };
  }

  _schedule() {
    const now = this.app.sound.now();
    const horizon = now + LOOKAHEAD;
    for (let guard = 0; this.cur.time < horizon && guard < 32; guard++) {
      const c = this.cur;
      const spb = this.segs[this.segs.length - 1].spb;
      let to = c.beat + (horizon - c.time) / spb;
      const wrap = c.beat < this.loopEnd - EPS && to >= this.loopEnd - EPS;
      if (wrap) to = this.loopEnd;
      this._range(c.beat, to, c.time, spb);
      const time = c.time + (to - c.beat) * spb, abs = c.abs + (to - c.beat);
      if (wrap) {
        this.cur = { time, beat: 0, abs };
        this.segs.push({ time, beat: 0, abs, spb });
        this.nextClick = 0;
      } else this.cur = { time, beat: to, abs };
    }
    while (this.segs.length > 1 && this.segs[1].time <= now - 1.5) this.segs.shift();
  }

  /** Schedule clicks and notes with song beats in [b0, b1); b0 sounds at audio time t0. */
  _range(b0, b1, t0, spb) {
    const s = this.app.sound;
    const at = (b) => t0 + (b - b0) * spb;
    const bar = this.bar, cu = clickUnit(this.song.time);
    const rec = this.state === 'recording';
    while (this.nextClick < b1 - EPS) {
      const b = this.nextClick;
      if (b >= b0 - EPS) {
        const counting = rec && this.countIn && b < this.take.from - EPS;
        if (counting || this.song.metro) {
          const rel = ((b % bar) + bar) % bar;
          s.click(at(b), rel < 1e-6 || bar - rel < 1e-6);
        }
      }
      this.nextClick += cu;
    }
    if (b1 <= 0) return;
    const anySolo = this.song.tracks.some((t) => t.solo);
    const fire = (t, i, n) => {
      const when = at(n.t), dur = Math.max(0.05, n.d * spb);
      const vel = clamp((n.vel * t.vol) / 0.8, 0.02, 1);
      if (t.drums) { const kind = DRUM_KIT[n.midi]; if (kind && s.drum) s.drum(kind, when, vel); return; }
      playIn(s, t.inst, n.midi, vel, when, dur);
      this.flashes.push({ midi: n.midi, a: when, b: when + dur });
    };
    this.song.tracks.forEach((t, i) => {
      if (!this._audible(t, anySolo)) return;
      if (rec && i === this.armed && !this.overdub) return;      // being replaced
      const list = this._eff(i).play;
      for (let k = lowerBound(list, b0); k < list.length && list[k].t < b1 - EPS; k++) fire(t, i, list[k]);
    });
    // a looping take hears its earlier passes
    if (rec && this.take && this.loopEnd < Infinity) {
      const t = this.song.tracks[this.armed];
      if (this._audible(t, anySolo)) for (const n of this.take.notes) if (n.t >= b0 - EPS && n.t < b1 - EPS) fire(t, this.armed, n);
    }
  }

  _commit(t) {
    const absNow = this.absAt(t), beatNow = this.beatAt(t);
    const take = this.take;
    this.take = null;
    for (const [m, o] of this.open) take.notes.push({ t: o.t, d: Math.max(1 / 64, absNow - o.abs), midi: m, vel: o.vel });
    this.open.clear();
    if (this.pedalOpen) { take.pedal.push([this.pedalOpen.t, this.pedalOpen.t + Math.max(0, absNow - this.pedalOpen.abs)]); this.pedalOpen = null; }
    if (!take.notes.length && !take.pedal.length) return 'Nothing was recorded. Arm a track, press Record and play after the clicks.';
    const tr = this.song.tracks[take.track];
    this.undo.push({ track: take.track, notes: tr.notes, pedal: tr.pedal, drums: tr.drums, what: 'take' });
    if (this.undo.length > 40) this.undo.shift();
    let keepN = tr.notes, keepP = tr.pedal;
    if (!this.overdub) {
      const wrapped = this.loopEnd < Infinity && absNow - take.abs0 >= this.loopEnd - take.from - 1e-6;
      const lo = wrapped ? 0 : take.from - 1e-6, hi = wrapped ? this.loopEnd : Math.max(beatNow, take.from) + 1e-6;
      keepN = tr.notes.filter((n) => n.t < lo || n.t >= hi);
      keepP = tr.pedal.filter(([a]) => a < lo || a >= hi);
    }
    const room = MAX_NOTES - this.song.tracks.reduce((n, x, i) => n + (i === take.track ? keepN.length : x.notes.length), 0);
    // snap to the storage grid so what's in memory is exactly what gets saved and exported
    const tick = (v) => Math.round(v * TPB) / TPB;
    const add = take.notes.slice(0, Math.max(0, room)).map((n) => ({ t: tick(n.t), d: Math.max(1, Math.round(n.d * TPB)) / TPB, midi: n.midi, vel: Math.round(clamp(n.vel, 0.01, 1) * 127) / 127 }));
    take.pedal = take.pedal.map(([a, b]) => [tick(a), tick(b)]);
    tr.notes = sortNotes([...keepN, ...add]);
    tr.pedal = [...keepP, ...take.pedal].sort((x, y) => x[0] - y[0]);
    tr.drums = false;
    this._changed();
    const label = this._trackLabel(take.track);
    return `Take saved: ${add.length} ${add.length === 1 ? 'note' : 'notes'} on ${label}. Undo takes it back.`;
  }

  undoTake() {
    if (this.state === 'recording') return;
    const u = this.undo.pop();
    if (!u) return;
    const tr = this.song.tracks[u.track];
    tr.notes = u.notes; tr.pedal = u.pedal; tr.drums = u.drums;
    this._changed();
    this._syncFoot();
    this._prompt(u.what === 'clear' ? `Brought back ${this._trackLabel(u.track)}.` : `Removed the last take from ${this._trackLabel(u.track)}.`);
  }

  _afterState(msg) {
    this._syncFoot();
    this._syncTracks();
    this._prompt(msg);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- song settings
  setTempo(bpm) {
    bpm = clamp(Math.round(bpm), 40, 200);
    if (bpm === this.song.bpm) return;
    this.song.bpm = bpm;
    if (this.f) this.f.tempoVal.textContent = `${bpm} bpm`;
    if (this.state !== 'stopped' && this.segs) {
      const c = this.cur;
      this.segs.push({ time: c.time, beat: c.beat, abs: c.abs, spb: this.spb });
    }
  }

  setMeter(key) {
    if (this.state !== 'stopped' || !METERS[key]) return;
    this.song.time = [...METERS[key]];
    this._changed(false);
  }

  setQuant(q) {
    this.song.q = q;
    this._changed(false);
    this._prompt(q ? `Quantize snaps note starts to the nearest 1/${q} for the view, playback and export. Your recording itself is kept as played.` : 'Quantize is off: you hear the timing exactly as played.');
  }

  setLoop(on) {
    if (this.state === 'recording') return;
    this.song.loop = on;
    if (this.state === 'playing') {
      const L = this._loopLen();
      this.loopEnd = on && L && this.cur.beat < L ? L : Infinity;
    }
    this._changed(false);
  }

  arm(i) {
    if (this.state === 'recording' || this.song.tracks[i].drums) return;
    this.armed = i;
    this.data.armed = i;
    this._monitor();
    this._syncTracks();
    this._syncFoot();
    this._prompt();
    this.dirty = true;
    this.app.store.save();
  }

  clearTrack(i) {
    if (this.state === 'recording') return;
    const tr = this.song.tracks[i];
    if (!tr.notes.length && !tr.pedal.length) return;
    this.undo.push({ track: i, notes: tr.notes, pedal: tr.pedal, drums: tr.drums, what: 'clear' });
    tr.notes = []; tr.pedal = []; tr.drums = false;
    this._fixArm();
    this._changed();
    this._syncFoot();
    this._prompt(`Cleared ${this._trackLabel(i)}. Undo brings it back.`);
  }

  // ---------------------------------------------------------------- derived data
  _audible(t, anySolo) { return !t.mute && (!anySolo || t.solo); }

  /** Quantized notes for the view/export and pedal-extended notes for playback. */
  _eff(i) {
    let c = this.cache.get(i);
    if (c) return c;
    const t = this.song.tracks[i], g = this.grid;
    const notes = sortNotes(t.notes.map((n) => (g ? { ...n, t: Math.max(0, Math.round(n.t / g) * g) } : n)));
    const play = t.pedal.length ? notes.map((n) => {
      const end = n.t + n.d;
      const p = t.pedal.find(([a, b]) => a <= end + 1e-6 && end < b);
      return p ? { ...n, d: p[1] - n.t } : n;
    }) : notes;
    let maxD = 0;
    for (const n of notes) if (n.d > maxD) maxD = n.d;
    c = { notes, play, maxD };
    this.cache.set(i, c);
    return c;
  }

  _end() {
    if (this.cache.has('end')) return this.cache.get('end');
    let e = 0;
    this.song.tracks.forEach((t, i) => {
      for (const n of this._eff(i).notes) e = Math.max(e, n.t + n.d);
      for (const [, b] of t.pedal) e = Math.max(e, b);
    });
    this.cache.set('end', e);
    return e;
  }

  /** Loop length in beats: whole bars covering every note start (0 when the song is empty). */
  _loopLen() {
    let last = -1;
    this.song.tracks.forEach((t, i) => { const ns = this._eff(i).notes; if (ns.length) last = Math.max(last, ns[ns.length - 1].t); });
    if (last < 0) return 0;
    return (Math.floor(last / this.bar + 1e-6) + 1) * this.bar;
  }

  _pitches() {
    let lo = Infinity, hi = -Infinity;
    const see = (m) => { if (m < lo) lo = m; if (m > hi) hi = m; };
    if (this.cache.has('pitch')) [lo, hi] = this.cache.get('pitch');
    else {
      for (const t of this.song.tracks) for (const n of t.notes) see(n.midi);
      this.cache.set('pitch', [lo, hi]);
    }
    if (this.take) { for (const n of this.take.notes) see(n.midi); for (const m of this.open.keys()) see(m); }
    if (lo === Infinity) { lo = 50; hi = 70; }
    lo -= 2; hi += 2;
    if (hi - lo < 24) { const c = (lo + hi) / 2; lo = Math.round(c - 12); hi = lo + 24; }
    return [Math.max(0, lo), Math.min(127, hi)];
  }

  _changed(structural = true) {
    this.cache.clear();
    this.song.at = Date.now();
    this.dirty = true;
    if (structural) this._syncTracks();
    this._save();
    this._summary();
    this._list();
  }

  /** Re-render the app's side list if it shows studio songs (debounced). */
  _list() {
    if (this.app.tab !== 'studio' || typeof this.app.renderList !== 'function') return;
    clearTimeout(this._lt);
    this._lt = setTimeout(() => { if (this.app.ctrl === this) this.app.renderList(); }, 60);
  }

  /** Keep the address bar on #/studio/<id> without re-routing. */
  _hash() {
    if (this.app.tab !== 'studio' && !/^#\/studio/.test(location.hash)) return;
    const want = `#/studio/${encodeURIComponent(this.song.id)}`;
    if (location.hash !== want) { try { history.replaceState(null, '', want); } catch { /* sandboxed */ } }
  }

  _save() {
    const enc = encodeSong(this.song);
    const i = this.data.songs.findIndex((s) => s.id === this.song.id);
    if (i >= 0) this.data.songs[i] = enc; else this.data.songs.push(enc);
    this.data.cur = this.song.id;
    this.app.store.save();
    this._checkSize();
  }

  /** The store ignores quota errors, so warn early when the studio's share of local storage gets large. */
  _checkSize() {
    const now = performance.now();
    if (this._sizeWarned || now - (this._sizeAt || 0) < 3000) return;
    this._sizeAt = now;
    let n = 0;
    try { n = JSON.stringify(this.data).length; } catch { return; }
    if (n > 1.5e6) {
      this._sizeWarned = true;
      this.app.ui.toast('Studio storage is nearly full. Export songs you want to keep as .mid files and delete old ones.', 7000);
    }
  }

  _fixArm() {
    const ts = this.song.tracks;
    if (ts[this.armed]?.drums) {
      const k = ts.findIndex((t) => !t.drums);
      this.armed = k < 0 ? 0 : k;
    }
  }

  _trackLabel(i) {
    const t = this.song.tracks[i];
    return t.name === `Track ${i + 1}` ? `track ${i + 1}` : `track ${i + 1} (${t.name})`;
  }

  /** What the player hears live follows the armed track's voice. */
  _monitor() {
    const t = this.song.tracks[this.armed];
    if (t && !t.drums) this.app.sound.instrument = t.inst;
  }

  // ---------------------------------------------------------------- songs
  newSong() {
    if (this.state !== 'stopped') this.stop();
    const r = rawSong(uniqueName(this.data, `Song ${this.data.songs.length + 1}`));
    this.data.songs.push(r);
    this.openSong(r.id);
    this._prompt('New song. Pick a track, press Record, and play after one bar of clicks.');
  }

  openSong(id) {
    if (this.state !== 'stopped') this.stop();
    const raw = this.data.songs.find((s) => s.id === id);
    if (!raw) return;
    this.song = decodeSong(raw);
    this.data.cur = id;
    this.app.store.save();
    this.undo = [];
    this.pos = 0;
    this.cache.clear();
    this._fixArm();
    this._monitor();
    this._head();
    this._renderTracks();
    this._buildFoot();
    this._prompt();
    this._summary();
    this._scrollTo(0);
    this._hash();
    this._list();
    this.dirty = true;
  }

  duplicateSong(id) {
    const raw = this.data.songs.find((s) => s.id === id);
    if (!raw) return null;
    const copy = JSON.parse(JSON.stringify(raw));
    copy.id = uid();
    copy.name = uniqueName(this.data, `${raw.name} copy`);
    copy.at = Date.now();
    this.data.songs.push(copy);
    this.app.store.save();
    this._list();
    this.app.ui.toast(`Made a copy: ${copy.name}.`);
    return copy.id;
  }

  renameSong(id, name) {
    name = String(name || '').trim().slice(0, 60);
    if (!name) return;
    if (id === this.song.id) { this.song.name = name; this._changed(false); this._head(); return; }
    const raw = this.data.songs.find((s) => s.id === id);
    if (raw) { raw.name = name; raw.at = Date.now(); this.app.store.save(); this._list(); }
  }

  deleteSong(id) {
    const i = this.data.songs.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [gone] = this.data.songs.splice(i, 1);
    this.app.store.save();
    if (id === this.song.id) {
      if (!this.data.songs.length) this.data.songs.push(rawSong('Song 1'));
      const next = [...this.data.songs].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
      this.openSong(next.id);
    }
    this._list();
    this.app.ui.toast(`Deleted ${gone.name}.`);
  }

  // ---------------------------------------------------------------- MIDI files
  /** Bytes of a format-1 Standard MIDI File for the current song (quantize applied). */
  exportBytes() {
    const tracks = [];
    this.song.tracks.forEach((t, i) => {
      const notes = this._eff(i).notes;
      if (!notes.length && !t.pedal.length) return;
      tracks.push({
        name: t.name, channel: t.drums ? 9 : i, program: t.drums ? null : INSTRUMENT_PROGRAMS[t.inst] ?? 0,
        volume: t.vol, notes, pedal: t.pedal,
      });
    });
    return tracks.length ? writeMidi({ name: this.song.name, bpm: this.song.bpm, time: this.song.time, tracks }) : null;
  }

  exportMidi() {
    const bytes = this.exportBytes();
    if (!bytes) { this.app.ui.toast('Nothing to export yet. Record something first.'); return; }
    const file = `${slug(this.song.name)}.mid`;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const a = h('a', { href: url, download: file, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.app.ui.toast(`Saved ${file}.`);
  }

  /** Import SMF bytes as a new song and open it. Returns the new song id, or null. */
  importBytes(bytes, fileName = 'Imported song') {
    let m;
    try { m = readMidi(bytes); } catch { this.app.ui.toast('That file isn’t a MIDI file Middle C can read.'); return null; }
    const melodic = m.tracks.filter((t) => !t.drums && t.notes.length);
    const drums = m.tracks.filter((t) => t.drums && t.notes.length);
    if (!melodic.length && !drums.length) { this.app.ui.toast('That MIDI file has no notes in it.'); return null; }
    if (this.state !== 'stopped') this.stop();
    const base = (m.name || String(fileName).replace(/\.(mid|midi|rmi|kar)$/i, '')).trim() || 'Imported song';
    const r = rawSong(uniqueName(this.data, base));
    const bpm = Math.round(m.bpm);
    r.bpm = clamp(bpm, 40, 200);
    r.time = validTime(m.time);
    const parts = melodic.slice(0, NT);
    let budget = MAX_NOTES, cut = 0;
    const take = (notes) => { const k = notes.slice(0, Math.max(0, budget)); cut += notes.length - k.length; budget -= k.length; return k; };
    parts.forEach((p, i) => {
      const o = { name: (p.name || `Track ${i + 1}`).slice(0, 40), inst: instrumentForProgram(p.program) };
      const notes = take(p.notes);
      if (notes.length) o.n = encNotes(notes);
      if (p.pedal.length) o.p = encPedal(p.pedal);
      if (p.volume !== null && p.volume !== undefined && Math.abs(p.volume - 0.8) > 0.01) o.vol = Math.round(p.volume * 100) / 100;
      r.tracks[i] = o;
    });
    let drumNote = '';
    if (drums.length && parts.length < NT) {
      const notes = take(sortNotes(drums.flatMap((d) => d.notes)));
      r.tracks[parts.length] = { name: 'Drums', inst: 'grand', drums: 1, mute: 1, n: encNotes(notes) };
      drumNote = ' Drums went on a muted track.';
    } else if (drums.length) drumNote = ' Drums were left out.';
    this.data.songs.push(r);
    this.openSong(r.id);
    const total = parts.reduce((n, p) => n + p.notes.length, 0);
    const extra = [];
    if (melodic.length > parts.length) extra.push(`kept ${parts.length} of ${melodic.length} parts`);
    if (bpm !== r.bpm) extra.push(`tempo set to ${r.bpm} (file says ${bpm})`);
    if (cut) extra.push(`${cut} notes over the limit were dropped`);
    const msg = `Imported ${r.name}: ${parts.length} ${parts.length === 1 ? 'track' : 'tracks'}, ${total} notes.${drumNote}${extra.length ? ` Note: ${extra.join('; ')}.` : ''}`;
    this._prompt(msg);
    this.app.ui.toast(`Imported ${r.name}.`);
    return r.id;
  }

  async _importFile(file) {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      this.importBytes(new Uint8Array(buf), file.name);
    } catch { this.app.ui.toast('Couldn’t read that file.'); }
    this.fileInput.value = '';
    this._closeOverlay();
  }

  // ---------------------------------------------------------------- UI: board text
  _head() { this.app.ui.head({ kicker: 'Recording studio', title: this.song.name }); }

  _prompt(msg) {
    const { ui } = this.app;
    if (msg) { ui.prompt(msg); return; }
    const t = this.song.tracks[this.armed];
    const where = `${this._trackLabel(this.armed)}, ${INST_LABEL[t.inst] || 'Piano'}`;
    if (this.state === 'recording') ui.prompt(this.countIn ? `Get ready: one bar of clicks, then play. Recording on ${where}.` : `Recording on ${where}. Press Stop when you’re done.`);
    else if (this.state === 'playing') ui.prompt(`Playing. Press Record to punch in on ${this._trackLabel(this.armed)}.`);
    else if (!this._end()) ui.prompt(`Recording goes to ${where}. Press Record, wait for one bar of clicks, then play.`);
    else ui.prompt(`Recording goes to ${where}. Press Play to hear the song, or Record to add a part.`);
  }

  _summary() {
    const used = this.song.tracks.filter((t) => t.notes.length).length;
    const L = this._loopLen();
    this.app.ui.status('');
    if (this.canvas) this.canvas.setAttribute('aria-label', used ? `Piano roll: ${used} tracks over ${L / this.bar} bars` : 'Piano roll, empty');
  }

  _syncCounter() {
    if (!this.f) return;
    const b = Math.max(0, this.state === 'stopped' ? this.pos : this.playBeat);
    const bar = this.bar, u = countUnit(this.song.time);
    const n = Math.floor(b / bar + 1e-6);
    const beat = Math.floor((b - n * bar) / u + 1e-6) + 1;
    const txt = `${n + 1}.${beat}`;
    if (txt !== this._ctr) {
      this._ctr = txt;
      this.f.counterVal.textContent = txt;
      this.f.counter.setAttribute('aria-label', `Bar ${n + 1}, beat ${beat}`);
    }
  }

  // ---------------------------------------------------------------- UI: layer
  _build() {
    const fileInput = (this.fileInput = h('input', {
      type: 'file', accept: '.mid,.midi,audio/midi,audio/x-midi', class: 'rs-file', tabindex: '-1', 'aria-hidden': 'true',
      onchange: (e) => this._importFile(e.target.files[0]),
    }));
    this.songsBtn = h('button', { type: 'button', class: 'btn rs-sm', 'aria-haspopup': 'dialog', onclick: () => this._songsPanel() }, icon('list'), h('span', {}, 'Songs'));
    const bar = h('div', { class: 'rs-bar' },
      this.songsBtn,
      h('button', { type: 'button', class: 'btn rs-sm rs-wide', onclick: () => this.newSong() }, 'New song'),
      h('button', { type: 'button', class: 'btn rs-sm rs-wide', onclick: () => fileInput.click() }, 'Import .mid'),
      h('button', { type: 'button', class: 'btn rs-sm', onclick: () => this.exportMidi(), title: 'Download a Standard MIDI File' }, icon('download'), h('span', {}, 'Export', h('span', { class: 'rs-ext' }, ' .mid'))),
      h('div', { class: 'rs-viewseg' }, segmented('View', [{ value: 'roll', label: 'Roll' }, { value: 'tracks', label: 'Tracks' }], this.view, (v) => this._setView(v))),
      fileInput,
    );
    this.tracksEl = h('div', { class: 'rs-tracks', role: 'list', 'aria-label': 'Tracks' });
    this.canvas = h('canvas', { class: 'rs-canvas', role: 'img', 'aria-label': 'Piano roll' });
    this.inner = h('div', { class: 'rs-inner' }, this.canvas);
    this.scroller = h('div', {
      class: 'rs-scroll', tabindex: '0',
      'aria-label': 'Piano roll. Tap to move the playhead. Arrow keys step through beats, Shift with arrows by bars, plus and minus zoom.',
    }, this.inner);
    const zb = (label, title, fn) => h('button', { type: 'button', class: 'rs-zb', 'aria-label': title, title, onclick: fn }, label);
    this.rollEl = h('div', { class: 'rs-roll' }, this.scroller,
      h('div', { class: 'rs-zoom' }, zb('Fit', 'Fit the whole song', () => this.fit()), zb('−', 'Zoom out', () => this.zoom(0.8)), zb('+', 'Zoom in', () => this.zoom(1.25))));
    this.overlay = h('div', { class: 'rs-overlay', hidden: true, role: 'dialog', 'aria-label': 'Songs', 'aria-live': 'off' });
    this.root = h('div', { class: 'studio', 'data-view': this.view, 'aria-live': 'off' }, bar, h('div', { class: 'rs-main' }, this.tracksEl, this.rollEl));
    const layer = this.app.ui.layer(this.root);
    // the songs panel covers the whole board (and becomes a sheet on phones), so it lives outside the layer
    (layer?.closest?.('.board') || this.root).append(this.overlay);
    this._renderTracks();
    this._wireRoll();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.scroller);
  }

  _setView(v) {
    this.view = v;
    this.root.dataset.view = v;
    this.data.view = v;
    this.app.store.save();
    this.dirty = true;
  }

  _renderTracks() {
    const el = this.tracksEl;
    el.textContent = '';
    this.rows = this.song.tracks.map((t, i) => {
      const r = {};
      r.row = h('div', { class: 'rs-track', role: 'listitem', style: `--tc: var(--t${i + 1}, ${FALLBACK[i]})` });
      r.arm = h('button', { type: 'button', class: 'rs-arm', 'aria-label': `Record on track ${i + 1}`, title: 'Arm this track for recording', onclick: () => this.arm(i) }, h('span', { class: 'rs-dot' }));
      r.sw = h('span', { class: 'rs-sw', 'aria-hidden': 'true' }, String(i + 1));
      r.name = h('input', {
        type: 'text', class: 'rs-name', value: t.name, maxlength: 40, spellcheck: 'false', autocomplete: 'off', 'aria-label': `Track ${i + 1} name`,
        onchange: (e) => { t.name = e.target.value.trim().slice(0, 40) || `Track ${i + 1}`; e.target.value = t.name; this._changed(false); this._prompt(); },
        onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = t.name; e.target.blur(); } },
      });
      if (t.drums) r.inst = h('span', { class: 'rs-drums', title: 'Imported drum part. It plays only if the sound engine has drums.' }, 'Drums');
      else {
        r.inst = h('select', {
          class: 'rs-inst', 'aria-label': `Track ${i + 1} instrument`,
          onchange: (e) => this._setInst(i, e.target.value),
        }, ...STUDIO_INSTRUMENTS.map((o) => h('option', { value: o.value }, o.label)));
        r.inst.value = t.inst;
      }
      r.mute = h('button', { type: 'button', class: 'rs-tog rs-mute', 'aria-label': `Mute track ${i + 1}`, onclick: () => { t.mute = !t.mute; this._changed(); } }, 'Mute');
      r.solo = h('button', { type: 'button', class: 'rs-tog rs-solo', 'aria-label': `Solo track ${i + 1}`, onclick: () => { t.solo = !t.solo; this._changed(); } }, 'Solo');
      r.vol = h('input', {
        type: 'range', class: 'rs-vol', min: 0, max: 1, step: 0.05, value: t.vol, 'aria-label': `Track ${i + 1} volume`,
        oninput: (e) => { t.vol = +e.target.value; }, onchange: () => this._changed(false),
      });
      r.clear = h('button', { type: 'button', class: 'rs-clear', 'aria-label': `Clear track ${i + 1}`, title: 'Clear this track', onclick: () => this.clearTrack(i) }, icon('clear'));
      r.row.append(r.arm, r.sw, r.name, r.inst, r.mute, r.solo, r.vol, r.clear);
      el.append(r.row);
      return r;
    });
    this._syncTracks();
  }

  _setInst(i, v) {
    const t = this.song.tracks[i];
    t.inst = validInst(v, i);
    this._changed(false);
    if (i === this.armed) { this._monitor(); this._prompt(); }
    if (this.state === 'stopped') {                       // let them hear the new voice
      const s = this.app.sound;
      s.unlock();
      const ns = t.notes;
      const m = ns.length ? ns[Math.floor(ns.length / 2)].midi : t.inst === 'bass' ? 40 : 60;
      playIn(s, t.inst, m, 0.6, s.now() + 0.03, 0.45);
    }
  }

  _syncTracks() {
    if (!this.rows) return;
    const rec = this.state === 'recording';
    const anySolo = this.song.tracks.some((t) => t.solo);
    this.song.tracks.forEach((t, i) => {
      const r = this.rows[i];
      const armed = i === this.armed;
      r.row.classList.toggle('armed', armed);
      r.row.classList.toggle('rec', armed && rec);
      r.row.classList.toggle('silent', !this._audible(t, anySolo));
      r.arm.setAttribute('aria-pressed', String(armed));
      r.arm.disabled = rec || t.drums;
      r.sw.classList.toggle('full', t.notes.length > 0);
      r.mute.setAttribute('aria-pressed', String(t.mute));
      r.solo.setAttribute('aria-pressed', String(t.solo));
      r.clear.disabled = rec || (!t.notes.length && !t.pedal.length);
      if (document.activeElement !== r.name && r.name.value !== t.name) r.name.value = t.name;
    });
  }

  // ---------------------------------------------------------------- UI: songs panel and confirm
  _songsPanel() {
    if (!this.overlay.hidden) { this._closeOverlay(); return; }
    if (this.state !== 'stopped') this.stop();
    this.overlay.hidden = false;
    this.songsBtn.setAttribute('aria-expanded', 'true');
    this._renderSongs();
    this.overlay.querySelector('[aria-current="true"] .rs-song-open, .rs-song-open')?.focus();
  }

  _closeOverlay() {
    if (this.overlay.hidden) return;
    this.overlay.hidden = true;
    this.overlay.textContent = '';
    this.songsBtn.setAttribute('aria-expanded', 'false');
    this.songsBtn.focus();
  }

  _renderSongs(focusId, focusSel) {
    const o = this.overlay;
    o.textContent = '';
    const songs = [...this.data.songs].sort((a, b) => (b.at || 0) - (a.at || 0));
    const fmt = (at) => { try { return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
    const list = h('ul', { class: 'rs-songs', 'aria-label': 'Saved songs' });
    for (const r of songs) {
      const cur = r.id === this.song.id;
      const info = rawInfo(r);
      const meta = `${info.used ? `${info.used} ${info.used === 1 ? 'track' : 'tracks'}, ${info.bars} ${info.bars === 1 ? 'bar' : 'bars'}` : 'Empty'} · ${validTime(r.time).join('/')} · ${clamp(r.bpm | 0, 40, 200)} bpm · ${fmt(r.at)}`;
      const li = h('li', { class: 'rs-song', 'aria-current': cur ? 'true' : null, 'data-id': r.id });
      const open = h('button', { type: 'button', class: 'rs-song-open', onclick: () => { this.openSong(r.id); this._closeOverlay(); } },
        h('span', { class: 'rs-song-name' }, r.name), h('span', { class: 'rs-song-meta' }, cur ? `Open now · ${meta}` : meta));
      const actions = h('div', { class: 'rs-song-actions' },
        h('button', { type: 'button', class: 'btn rs-sm', 'data-act': 'rename', onclick: () => this._renameRow(li, r) }, 'Rename'),
        h('button', { type: 'button', class: 'btn rs-sm', 'data-act': 'dup', onclick: () => { const id = this.duplicateSong(r.id); this._renderSongs(id); } }, 'Duplicate'),
        h('button', { type: 'button', class: 'btn rs-sm rs-danger', 'data-act': 'delete', onclick: () => this._confirmDelete(li, r) }, 'Delete'),
      );
      li.append(open, actions);
      list.append(li);
    }
    o.append(
      h('div', { class: 'rs-ov-head' },
        h('h2', {}, 'Songs'),
        h('button', { type: 'button', class: 'btn rs-sm primary', onclick: () => { this.newSong(); this._closeOverlay(); } }, 'New song'),
        h('button', { type: 'button', class: 'btn rs-sm', onclick: () => this.fileInput.click() }, 'Import .mid'),
        h('button', { type: 'button', class: 'rs-close', 'aria-label': 'Close songs', onclick: () => this._closeOverlay() }, icon('clear'))),
      list,
      h('p', { class: 'rs-ov-note' }, 'Songs are saved in this browser. Export a .mid file to keep a copy or open it in other music software.'),
    );
    if (focusId) o.querySelector(`[data-id="${focusId}"] ${focusSel || '.rs-song-open'}`)?.focus();
  }

  _renameRow(li, r) {
    const open = li.querySelector('.rs-song-open');
    const input = h('input', { type: 'text', class: 'rs-song-input', value: r.name, maxlength: 60, 'aria-label': 'Song name', spellcheck: 'false' });
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save && input.value.trim()) this.renameSong(r.id, input.value);
      this._renderSongs(r.id, '[data-act="rename"]');
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    open.replaceWith(input);
    input.focus();
    input.select();
  }

  _confirmDelete(li, r) {
    const actions = li.querySelector('.rs-song-actions');
    const keep = h('button', { type: 'button', class: 'btn rs-sm', onclick: () => this._renderSongs(r.id, '[data-act="delete"]') }, 'Keep');
    const box = h('div', { class: 'rs-confirm', role: 'alertdialog', 'aria-label': `Delete ${r.name}?` },
      h('span', {}, `Delete “${r.name}”? This can’t be undone.`),
      h('button', { type: 'button', class: 'btn rs-sm rs-danger-solid', onclick: () => { this.deleteSong(r.id); if (!this.overlay.hidden) this._renderSongs(this.song.id); } }, 'Delete'),
      keep);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); keep.click(); } });
    actions.replaceWith(box);
    keep.focus();
  }

  // ---------------------------------------------------------------- UI: transport in the board foot
  _buildFoot() {
    const f = (this.f = {});
    const s = this.song;
    f.rew = h('button', { type: 'button', class: 'btn rs-tp', 'aria-label': 'Rewind to the start', title: 'Rewind', onclick: () => this.rewind() }, icon('rewind'));
    f.play = h('button', { type: 'button', class: 'btn primary rs-tp rs-play', 'data-enter': '', onclick: () => (this.state === 'stopped' ? this.play() : this.stop()) });
    f.rec = h('button', { type: 'button', class: 'btn rs-tp rs-rec', onclick: () => this.record() }, icon('record'), h('span', {}, 'Record'));
    f.counterVal = h('span', { class: 'rs-ctr-val' }, '1.1');
    f.counter = h('span', { class: 'rs-counter', role: 'timer', 'aria-label': 'Bar 1, beat 1' }, h('span', { class: 'rs-ctr-lbl', 'aria-hidden': 'true' }, 'Bar'), f.counterVal);
    f.undo = h('button', { type: 'button', class: 'btn rs-tp', 'aria-label': 'Undo last take', title: 'Undo last take (Ctrl+Z)', onclick: () => this.undoTake() }, icon('undo'), h('span', { class: 'rs-tp-l' }, 'Undo'));
    f.loop = toggle('Loop', s.loop, (v) => this.setLoop(v));
    f.loopIn = f.loop.querySelector('input');
    f.metro = toggle('Metronome', s.metro, (v) => { this.song.metro = v; this._changed(false); });
    f.set = h('div', { class: 'rs-settings', id: 'rs-settings' });
    f.more = h('button', {
      type: 'button', class: 'btn rs-tp rs-more', 'aria-expanded': 'false', 'aria-controls': 'rs-settings',
      onclick: () => { const open = !f.set.classList.contains('open'); f.set.classList.toggle('open', open); f.more.setAttribute('aria-expanded', String(open)); },
    }, icon('sliders'), h('span', {}, 'Options'));
    f.tempoVal = h('output', { class: 'tempo-val' }, `${s.bpm} bpm`);
    f.tempo = h('input', {
      type: 'range', min: 40, max: 200, step: 1, value: s.bpm, 'aria-label': 'Tempo, quarter notes per minute',
      oninput: (e) => this.setTempo(+e.target.value), onchange: () => { this._changed(false); },
    });
    f.meter = segmented('Time signature', Object.keys(METERS).map((k) => ({ value: k, label: k })), s.time.join('/'), (v) => this.setMeter(v));
    f.quant = segmented('Quantize', [{ value: 0, label: 'Off' }, { value: 8, label: '1/8' }, { value: 16, label: '1/16' }], s.q, (v) => this.setQuant(v));
    f.overdub = toggle('Overdub', this.overdub, (v) => {
      this.overdub = v; this.data.overdub = v; this.app.store.save();
      this._prompt(v ? 'Overdub on: new takes are added on top of what the track already has.' : 'Overdub off: a new take replaces the part of the track you record over.');
    });
    f.transport = h('div', { class: 'rs-transport' }, f.rew, f.play, f.rec, f.counter, f.undo);
    f.modes = h('div', { class: 'rs-modes' });
    f.set.append(
      h('label', { class: 'range' }, 'Tempo', f.tempo, f.tempoVal),
      h('div', { class: 'rs-field' }, h('span', { class: 'rs-flabel', 'aria-hidden': 'true' }, 'Meter'), f.meter),
      h('div', { class: 'rs-field' }, h('span', { class: 'rs-flabel', 'aria-hidden': 'true' }, 'Quantize'), f.quant),
      f.overdub,
    );
    this.app.ui.foot(h('div', { class: 'rs-foot', 'aria-live': 'off' }, f.transport, f.modes, f.set));
    this._placeFoot();
    this._ctr = null;
    this._syncFoot();
    this._syncCounter();
  }

  /** On phones, loop and metronome live in Options and Options sits in the transport row. */
  _placeFoot() {
    const f = this.f;
    if (!f) return;
    if (this._narrow?.matches) {
      f.transport.append(f.more);
      f.set.prepend(f.loop, f.metro);
    } else {
      f.modes.append(f.loop, f.metro, f.more);
    }
  }

  _syncFoot() {
    const f = this.f;
    if (!f) return;
    const rec = this.state === 'recording', running = this.state !== 'stopped';
    f.play.replaceChildren(icon(running ? 'stop' : 'play'), h('span', {}, running ? 'Stop' : 'Play'));
    f.rec.classList.toggle('on', rec);
    f.rec.setAttribute('aria-pressed', String(rec));
    f.rec.lastChild.textContent = rec ? 'Recording' : 'Record';
    f.rec.disabled = !!this.song.tracks[this.armed]?.drums;
    f.rec.title = `Record on track ${this.armed + 1}`;
    f.undo.disabled = rec || !this.undo.length;
    f.loopIn.disabled = rec;
    f.meter.querySelectorAll('button').forEach((b) => { b.disabled = running; });
  }

  // ---------------------------------------------------------------- piano roll
  _wireRoll() {
    const sc = this.scroller;
    sc.addEventListener('scroll', () => {
      if (performance.now() - this.progScrollAt > 120) this.userScrollAt = performance.now();
      this.dirty = true;
    }, { passive: true });
    sc.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = sc.getBoundingClientRect();
        this.zoom(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left);
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        sc.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    let drag = null;
    sc.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.offsetY > sc.clientHeight) return;
      drag = { x: e.clientX, y: e.clientY, sx: sc.scrollLeft, moved: false, id: e.pointerId, mouse: e.pointerType === 'mouse' };
      if (drag.mouse) sc.setPointerCapture(e.pointerId);
    });
    sc.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4 || Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.mouse && drag.moved) { sc.scrollLeft = drag.sx - dx; this.userScrollAt = performance.now(); }
    });
    sc.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.moved) this._tapAt(e);
    });
    sc.addEventListener('pointercancel', () => { drag = null; });
    sc.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const bar = this.bar, unit = countUnit(this.song.time);
      const cur = this.state === 'stopped' ? this.pos : this.playBeat;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? bar : unit;
        const k = e.key === 'ArrowRight' ? Math.floor(cur / step + 1e-6) + 1 : Math.ceil(cur / step - 1e-6) - 1;
        const b = Math.max(0, k * step);
        this.seek(b);
        this._reveal(b);
      } else if (e.key === 'Home') { e.preventDefault(); this.rewind(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(1.25); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoom(0.8); }
    });
  }

  _tapAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < GUTTER) return;
    let b = (x + this.scroller.scrollLeft - GUTTER) / this.ppb;
    let unit = countUnit(this.song.time);
    if (unit * this.ppb > 80) unit /= 2;
    if (!e.shiftKey) b = Math.round(b / unit) * unit;
    this.seek(b);
  }

  zoom(f, anchor) {
    const sc = this.scroller;
    const ax = anchor ?? this.cw / 2;
    const beat = (sc.scrollLeft + ax - GUTTER) / this.ppb;
    this.ppb = clamp(this.ppb * f, 6, 160);
    this.data.zoom = Math.round(this.ppb * 10) / 10;
    this._layoutWidth(true);
    this._setScroll(GUTTER + beat * this.ppb - ax);
    this.dirty = true;
  }

  fit() {
    if (!this.cw) return;
    const beats = Math.max(this.bar * 2, this._loopLen() || this._end());
    this.ppb = clamp((this.cw - GUTTER - 16) / beats, 6, 160);
    this.data.zoom = Math.round(this.ppb * 10) / 10;
    this._layoutWidth(true);
    this._setScroll(0);
    this.dirty = true;
  }

  _setScroll(x) { this.progScrollAt = performance.now(); this.scroller.scrollLeft = Math.max(0, x); }
  _scrollTo(b) { if (this.scroller) this._setScroll(GUTTER + b * this.ppb - GUTTER - 8); }
  _reveal(b) {
    const x = GUTTER + b * this.ppb, sx = this.scroller.scrollLeft;
    if (x < sx + GUTTER + 8 || x > sx + this.cw - 24) this._setScroll(x - this.cw * 0.3);
  }

  _follow(b) {
    if (performance.now() - this.userScrollAt < 1500 || !this.cw) return;
    const x = GUTTER + b * this.ppb, sx = this.scroller.scrollLeft;
    if (x < sx + GUTTER + 4 || x > sx + this.cw * 0.86) this._setScroll(x - GUTTER - this.cw * 0.12);
  }

  _resize() {
    const sc = this.scroller;
    const w = sc.clientWidth, hh = sc.clientHeight;
    if (w === this.cw && hh === this.ch) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = w; this.ch = hh; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(hh * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hh}px`;
    this._layoutWidth(true);
    this.dirty = true;
    this._draw();
  }

  _layoutWidth(force) {
    if (!this.inner) return;
    const bar = this.bar;
    const end = Math.max(this._end(), this.pos, this.state !== 'stopped' ? this.playBeat : 0, this.song.loop ? this._loopLen() : 0);
    const beats = Math.max(8 * bar, (Math.ceil(end / bar + 1e-6) + 4) * bar);
    const w = Math.ceil(Math.max(this.cw || 0, GUTTER + beats * this.ppb + 24));
    if (force || w !== this._w) { this._w = w; this.inner.style.width = `${w}px`; }
  }

  _colors() {
    if (this.colors) return this.colors;
    const cs = getComputedStyle(this.root);
    const v = (n, f) => cs.getPropertyValue(n).trim() || f;
    this.colors = {
      felt: v('--felt', '#1f3a31'), chalk: v('--chalk', '#e8ede3'), chalk2: v('--chalk-2', '#b9c7bd'), chalk3: v('--chalk-3', 'rgba(232,237,227,0.42)'),
      brass: v('--brass', '#d9a93a'), coral: v('--coral', '#e9705a'), sans: v('--sans', 'sans-serif'),
      t: FALLBACK.map((c, i) => v(`--t${i + 1}`, c)),
    };
    return this.colors;
  }

  _draw() {
    if (!this.cw || !this.ch || !this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const col = this._colors();
    const W = this.cw, H = this.ch, ppb = this.ppb;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sx = this.scroller.scrollLeft;
    const top = RULER, bot = H - PEDAL - 4;
    const [lo, hi] = this._pitches();
    const rh = (bot - top) / (hi - lo + 1);
    const X = (b) => GUTTER + b * ppb - sx;
    const Y = (m) => top + (hi - m) * rh;
    const vb0 = Math.max(0, (sx - GUTTER) / ppb) - 0.05, vb1 = (sx + W) / ppb;
    const bar = this.bar, cu = clickUnit(this.song.time);

    // pitch rows
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let m = lo; m <= hi; m++) if (isBlack(m)) ctx.fillRect(GUTTER, Y(m), W - GUTTER, rh);
    ctx.fillStyle = 'rgba(232, 237, 227, 0.10)';
    for (let m = lo; m <= hi; m++) if (m % 12 === 0) ctx.fillRect(GUTTER, Math.round(Y(m) + rh) - 1, W - GUTTER, 1);

    // ruler band and loop region
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(GUTTER, 0, W - GUTTER, RULER - 2);
    if (this.song.loop) {
      const L = this.state !== 'stopped' && this.loopEnd < Infinity ? this.loopEnd : this._loopLen();
      if (L) {
        ctx.fillStyle = col.brass;
        ctx.globalAlpha = 0.32;
        ctx.fillRect(Math.max(GUTTER, X(0)), 0, X(L) - Math.max(GUTTER, X(0)), RULER - 2);
        ctx.globalAlpha = 1;
        ctx.fillRect(X(L) - 1, 0, 2, RULER - 2);
      }
    }

    // grid: quantize subdivisions, beats, bars
    const g = this.grid;
    if (g && g * ppb >= 9) {
      ctx.fillStyle = 'rgba(232, 237, 227, 0.05)';
      for (let b = Math.ceil(vb0 / g) * g; b <= vb1; b += g) { const x = Math.round(X(b)); if (x >= GUTTER) ctx.fillRect(x, top, 1, bot - top); }
    }
    const step = cu * ppb < 8 ? bar : cu;
    for (let b = Math.ceil(vb0 / step - 1e-6) * step; b <= vb1; b += step) {
      const x = Math.round(X(b));
      if (x < GUTTER) continue;
      const isBar = Math.abs(b / bar - Math.round(b / bar)) < 1e-6;
      ctx.fillStyle = isBar ? col.chalk3 : 'rgba(232, 237, 227, 0.13)';
      ctx.fillRect(x, isBar ? 0 : top, 1, (isBar ? bot : bot - top));
    }

    // notes
    const anySolo = this.song.tracks.some((t) => t.solo);
    const rec = this.state === 'recording';
    const nh = Math.max(2, rh - 1), rad = Math.min(3, nh / 3);
    const rect = (x, y, w) => {
      if (x + w < GUTTER || x > W) return;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, nh, rad); ctx.fill(); }
      else ctx.fillRect(x, y, w, nh);
    };
    this.song.tracks.forEach((t, i) => {
      const { notes, maxD } = this._eff(i);
      if (!notes.length) return;
      let alpha = this._audible(t, anySolo) ? 0.95 : 0.25;
      if (rec && i === this.armed && !this.overdub) alpha = 0.22;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col.t[i];
      for (let k = lowerBound(notes, vb0 - maxD); k < notes.length; k++) {
        const n = notes[k];
        if (n.t > vb1) break;
        if (n.t + n.d < vb0) continue;
        rect(X(n.t), Y(n.midi) + 0.5, Math.max(2, n.d * ppb - 1));
      }
    });
    ctx.globalAlpha = 1;

    // the take being recorded
    if (rec && this.take) {
      const now = this.app.sound.now() - this.app.sound.latency;
      const absNow = this.segs ? this.absAt(now) : 0;
      ctx.fillStyle = col.t[this.armed];
      ctx.strokeStyle = col.chalk;
      ctx.lineWidth = 1;
      const draw = (t, d, m) => { const x = X(t), y = Y(m) + 0.5, w = Math.max(2, d * ppb - 1); rect(x, y, w); ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, nh - 1)); };
      for (const n of this.take.notes) draw(n.t, n.d, n.midi);
      for (const [m, o] of this.open) draw(o.t, Math.max(0.05, absNow - o.abs), m);
    }

    // sustain pedal lane
    this.song.tracks.forEach((t, i) => {
      if (!t.pedal.length) return;
      ctx.fillStyle = col.t[i];
      ctx.globalAlpha = this._audible(t, anySolo) ? 0.7 : 0.2;
      for (const [a, b] of t.pedal) if (b >= vb0 && a <= vb1) ctx.fillRect(Math.max(GUTTER, X(a)), bot + 3, Math.max(2, (b - a) * ppb), PEDAL - 2);
    });
    ctx.globalAlpha = 1;

    // bar numbers
    ctx.font = `500 11px ${col.sans}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col.chalk2;
    let every = 1;
    while (every * bar * ppb < 26) every *= 2;
    for (let n = Math.max(0, Math.floor(vb0 / bar)); n * bar <= vb1; n++) {
      if (n % every) continue;
      const x = X(n * bar);
      if (x < GUTTER - 2) continue;
      ctx.fillText(String(n + 1), x + 4, (RULER - 2) / 2 + 0.5);
    }

    // playhead
    const pb = Math.max(0, this.state === 'stopped' ? this.pos : this.playBeat);
    const px = Math.round(X(pb));
    if (px >= GUTTER - 1 && px <= W + 1) {
      ctx.fillStyle = rec ? col.coral : col.brass;
      ctx.fillRect(px - 1, 0, 2, bot);
      ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 7); ctx.closePath(); ctx.fill();
    }

    // empty hint
    if (!this._end() && !(rec && (this.take?.notes.length || this.open?.size))) {
      ctx.fillStyle = col.chalk2;
      ctx.font = `400 14px ${col.sans}`;
      ctx.textAlign = 'center';
      ctx.fillText(rec ? 'Listening…' : 'Nothing recorded yet', GUTTER + (W - GUTTER) / 2, top + (bot - top) / 2);
      ctx.textAlign = 'start';
    }

    // pitch gutter
    ctx.fillStyle = col.felt;
    ctx.fillRect(0, 0, GUTTER, H);
    ctx.fillStyle = 'rgba(232, 237, 227, 0.16)';
    ctx.fillRect(GUTTER - 1, 0, 1, bot);
    ctx.fillStyle = col.chalk2;
    ctx.font = `500 10.5px ${col.sans}`;
    ctx.textAlign = 'right';
    for (let m = lo; m <= hi; m++) if (m % 12 === 0) ctx.fillText(`C${m / 12 - 1}`, GUTTER - 6, Y(m) + rh / 2);
    ctx.textAlign = 'start';
  }

  // ---------------------------------------------------------------- keys, demo lights
  _demoKeys(now) {
    const heard = now - this.app.sound.latency;
    const sounding = new Set();
    this.flashes = this.flashes.filter((d) => {
      if (d.a <= heard && heard < d.b) sounding.add(d.midi);
      return heard < d.b + 0.05;
    });
    const kb = this.app.keyboard;
    for (const m of this.demoOn) if (!sounding.has(m)) kb.mark(m, 'demo', false);
    for (const m of sounding) if (!this.demoOn.has(m)) kb.mark(m, 'demo', true);
    this.demoOn = sounding;
  }

  _clearDemo() {
    this.flashes = [];
    for (const m of this.demoOn) this.app.keyboard.mark(m, 'demo', false);
    this.demoOn = new Set();
  }

  _key(e) {
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const el = e.target;
    const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    if (e.key === 'Escape' && this.overlay && !this.overlay.hidden) { e.preventDefault(); this._closeOverlay(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyZ' && !typing) { e.preventDefault(); this.undoTake(); return; }
    if (e.code === 'Space' && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !(el && /^(BUTTON|A|SUMMARY)$/.test(el.tagName))) {
      if (this.overlay && !this.overlay.hidden) return;
      e.preventDefault();
      if (this.state === 'stopped') this.play(); else this.stop();
    }
  }
}
