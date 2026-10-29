// App shell: tabs, lists, settings, device status, input routing and the frame loop.
import { Sound } from './audio.js';
import { Input } from './input.js';
import { Keyboard } from './keyboard.js';
import { Staff } from './staff.js';
import { h, stars } from './ui.js';
import { LessonMode, SongMode, FreeMode, GAME_CLASSES, LESSONS, UNITS, SONGS, GAMES } from './modes.js';

const $ = (s) => document.querySelector(s);
const DEFAULTS = {
  instrument: 'grand', volume: 0.8, echo: true, output: 'builtin', input: 'all',
  labels: 'c', range: 'auto', latency: 0, hints: true,
};

class Store {
  constructor() {
    this.key = 'middle-c/v1';
    this.data = { settings: {}, lessons: {}, songs: {}, games: {} };
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch { /* storage unavailable */ }
    this.data.settings = { ...DEFAULTS, ...this.data.settings };
  }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* ignore */ } }
  lesson(id) { return this.data.lessons[id]; }
  saveLesson(id, n) { this.data.lessons[id] = { stars: Math.max(n, this.data.lessons[id]?.stars || 0) }; this.save(); }
  song(id) { return this.data.songs[id]; }
  saveSong(id, mode, score, n) {
    const p = this.data.songs[id] || {};
    p[mode] = Math.max(score, p[mode] || 0);
    p.stars = Math.max(n, p.stars || 0);
    this.data.songs[id] = p;
    this.save();
  }
  game(id, level) { return this.data.games[`${id}:${level}`]; }
  bestGame(id) { return Math.max(0, ...Object.entries(this.data.games).filter(([k]) => k.startsWith(`${id}:`)).map(([, v]) => v)); }
  saveGame(id, level, score) {
    const k = `${id}:${level}`;
    this.data.games[k] = Math.max(score, this.data.games[k] || 0);
    this.save();
  }
  reset() { this.data.lessons = {}; this.data.songs = {}; this.data.games = {}; this.save(); }
}

class UI {
  constructor() {
    this.kicker = $('#kicker'); this.title = $('#title'); this.promptEl = $('#prompt');
    this.statusEl = $('#status'); this.pipsEl = $('#pips'); this.bigEl = $('#big'); this.footEl = $('#foot');
    this.toastEl = $('#toast');
  }
  head({ kicker = '', title = '' }) { this.kicker.textContent = kicker; this.title.textContent = title; }
  prompt(text = '') { this.promptEl.textContent = text; }
  status(text = '') { this.statusEl.textContent = text; }
  pips(n, i) {
    this.pipsEl.textContent = '';
    this.pipsEl.setAttribute('aria-label', n ? `Step ${Math.min(i + 1, n)} of ${n}` : '');
    for (let k = 0; k < n; k++) this.pipsEl.append(h('span', { class: k < i ? 'done' : k === i ? 'now' : '' }));
  }
  big(main = '', sub = '', mode = '') {
    const el = this.bigEl;
    el.textContent = '';
    el.classList.toggle('center', mode === 'center' || mode === true);
    el.classList.toggle('huge', mode === 'huge');
    if (main) el.append(h('div', { class: 'big-main' }, main));
    if (sub) el.append(h('div', { class: 'big-sub' }, sub));
  }
  foot(...nodes) { this.footEl.textContent = ''; nodes.filter(Boolean).forEach((n) => this.footEl.append(n)); }
  toast(text, ms = 3600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.tt);
    this.tt = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}

class App {
  constructor() {
    this.store = new Store();
    this.settings = this.store.data.settings;
    this.sound = new Sound();
    this.sound.instrument = this.settings.instrument;
    this.sound.volume = this.settings.volume;
    this.input = new Input();
    this.input.selected = this.settings.input;
    this.keyboard = new Keyboard($('#piano'), this.input);
    this.keyboard.labels = this.settings.labels;
    this.keyboard.preferred = this.settings.range;
    this.keyboard.fit(true);
    this.staff = new Staff($('#staff'));
    this.ui = new UI();
    this.ctrl = null;
    this.tab = 'lessons';
    this._wire();
    this.input.attachComputerKeyboard();
    this.input.autoConnect();
    this._device();
    this.route();
    let last = performance.now();
    const frame = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      try { this.ctrl?.tick?.(dt); } catch (err) { console.error(err); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---------- events ----------
  _wire() {
    const unlock = () => this.sound.unlock();
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    this.sound.onChange(() => document.body.classList.toggle('muted', !this.sound.ready));

    this.input.addEventListener('noteon', (ev) => {
      const e = ev.detail;
      if (e.source !== 'midi' || this.settings.echo) this.sound.noteOn(e.midi, e.vel);
      if (e.source === 'midi' && !this.sound.ready && !this.warnedSound) {
        this.warnedSound = true;
        this.ui.toast('Click or tap anywhere on the page to turn on sound.');
      }
      this.keyboard.mark(e.midi, 'down', true);
      this.ctrl?.noteOn?.(e);
    });
    this.input.addEventListener('noteoff', (ev) => {
      const e = ev.detail;
      this.sound.noteOff(e.midi);
      this.keyboard.mark(e.midi, 'down', false);
      this.ctrl?.noteOff?.(e);
    });
    this.input.addEventListener('pedal', (ev) => {
      this.sound.setSustain(ev.detail.down);
      this.ctrl?.pedal?.(ev.detail.down);
    });
    this.input.addEventListener('status', () => this._device());
    this.input.addEventListener('plugged', () => {
      this.keyboard.ripple();
      const d = this.input.devices[this.input.devices.length - 1];
      this.ui.toast(`${d.name} connected.`);
      this._applyOutput();
    });
    this.input.addEventListener('octave', () => this.ui.toast(`Computer keys now start at C${this.input.pcOctave}.`, 1800));

    $('#device').addEventListener('click', () => this._deviceClick());
    $('#open-settings').addEventListener('click', () => this.openSettings());
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.tab)));
    $('#list-toggle').addEventListener('click', () => document.body.classList.toggle('list-open'));
    $('#list-scrim').addEventListener('click', () => document.body.classList.remove('list-open'));
    window.addEventListener('hashchange', () => this.route());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.repeat) return;
      const a = document.activeElement;
      if (a && a !== document.body && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(a.tagName)) return;
      if ($('#settings').open) return;
      const btn = $('#foot [data-enter]');
      if (btn) { e.preventDefault(); btn.click(); }
    });
  }

  // ---------- routing ----------
  route() {
    const [, tab, id] = (location.hash || '').split('/');
    const valid = ['lessons', 'songs', 'games', 'free'];
    const t = valid.includes(tab) ? tab : 'lessons';
    this.tab = t;
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.body.dataset.tab = t;
    let ctrl;
    if (t === 'lessons') {
      const lesson = LESSONS.find((l) => l.id === id) || LESSONS.find((l) => !this.store.lesson(l.id)) || LESSONS[0];
      this.current = lesson.id;
      ctrl = new LessonMode(this, lesson);
    } else if (t === 'songs') {
      const song = SONGS.find((s) => s.id === id) || SONGS[0];
      this.current = song.id;
      ctrl = new SongMode(this, song);
    } else if (t === 'games') {
      const game = GAMES.find((g) => g.id === id) || GAMES[0];
      this.current = game.id;
      ctrl = new GAME_CLASSES[game.id](this, game);
    } else {
      this.current = null;
      ctrl = new FreeMode(this);
    }
    this.ctrl?.exit?.();
    this.sound.stopAll();
    this.keyboard.clear('cue-r', 'cue-l', 'demo', 'hit', 'miss');
    this.keyboard.clearFingers();
    this.ui.status('');
    this.ui.pips(0, 0);
    this.ui.big();
    this.ctrl = ctrl;
    this.renderList();
    ctrl.enter();
    document.body.classList.remove('list-open');
  }

  setTab(tab) { location.hash = `#/${tab}`; }
  open(tab, id) {
    const target = `#/${tab}/${id}`;
    if (location.hash === target) this.route(); else location.hash = target;
  }

  // ---------- side list ----------
  renderList() {
    const list = $('#list');
    list.textContent = '';
    const item = (tab, id, title, sub, extra) => h('a', {
      class: 'item', href: `#/${tab}/${id}`, 'aria-current': this.current === id ? 'page' : null,
    }, h('span', { class: 'item-title' }, title), sub ? h('span', { class: 'item-sub' }, sub) : null, extra ? h('span', { class: 'item-extra' }, extra) : null);

    if (this.tab === 'lessons') {
      const done = LESSONS.filter((l) => this.store.lesson(l.id)).length;
      list.append(h('p', { class: 'list-note' }, done ? `${done} of ${LESSONS.length} lessons finished` : `${LESSONS.length} short lessons, from finding middle C to playing with both hands.`));
      for (const u of UNITS) {
        const ls = LESSONS.filter((l) => l.unit === u.id);
        list.append(h('section', { class: 'group' }, h('h2', {}, u.title),
          ...ls.map((l) => {
            const b = this.store.lesson(l.id);
            return item('lessons', l.id, `${LESSONS.indexOf(l) + 1}. ${l.title}`, l.summary, b ? stars(b.stars) : null);
          })));
      }
    } else if (this.tab === 'songs') {
      for (const lv of [1, 2, 3, 4]) {
        const ss = SONGS.filter((s) => s.level === lv);
        if (!ss.length) continue;
        list.append(h('section', { class: 'group' }, h('h2', {}, `Level ${lv}`),
          ...ss.map((s) => {
            const b = this.store.song(s.id);
            return item('songs', s.id, s.title, s.composer, b ? stars(b.stars) : null);
          })));
      }
    } else if (this.tab === 'games') {
      list.append(h('section', { class: 'group' }, h('h2', {}, 'Games'),
        ...GAMES.map((g) => {
          const best = this.store.bestGame(g.id);
          return item('games', g.id, g.title, g.summary, best ? `Best ${best}` : null);
        })));
    } else {
      list.append(h('section', { class: 'group help' },
        h('h2', {}, 'No keyboard plugged in?'),
        h('p', {}, 'Tap the keys on screen, or use your computer keys:'),
        h('p', { class: 'keys-help' }, ...['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K'].map((k) => h('kbd', {}, k))),
        h('p', {}, 'A plays C, the row above adds the black keys. ', h('kbd', {}, 'Z'), ' and ', h('kbd', {}, 'X'), ' move down or up an octave.'),
        h('h2', {}, 'Sustain pedal'),
        h('p', {}, 'A pedal plugged into your MIDI keyboard works here too.'),
      ));
    }
  }

  // ---------- MIDI device ----------
  _device() {
    const btn = $('#device');
    const label = btn.querySelector('.device-label');
    const st = this.input.status;
    btn.dataset.state = st;
    if (st === 'connected') {
      const names = this.input.devices.map((d) => d.name);
      label.textContent = names.length > 1 ? `${names.length} keyboards` : names[0];
      btn.title = names.join(', ');
    } else if (st === 'waiting') { label.textContent = 'Plug in a keyboard'; btn.title = 'MIDI is on. Connect a USB MIDI keyboard.'; }
    else if (st === 'denied') { label.textContent = 'MIDI blocked'; btn.title = 'MIDI access was blocked in this browser.'; }
    else if (st === 'unsupported') { label.textContent = 'On-screen keys'; btn.title = 'This browser can’t read USB MIDI keyboards.'; }
    else { label.textContent = 'Connect keyboard'; btn.title = 'Use a USB MIDI keyboard'; }
  }

  async _deviceClick() {
    const st = this.input.status;
    if (st === 'unsupported') return this.ui.toast('This browser can’t read USB MIDI. Use Chrome, Edge or Firefox on a computer, or play the on-screen keys.', 6000);
    if (st === 'denied') return this.ui.toast('MIDI access is blocked. Allow MIDI devices for this site in your browser settings, then reload.', 6000);
    if (st === 'connected' || st === 'waiting') return this.openSettings();
    const ok = await this.input.connect();
    if (ok && !this.input.devices.length) this.ui.toast('MIDI is on. Plug in your keyboard and it will appear here.');
    this._applyOutput();
  }

  _applyOutput() {
    const id = this.settings.output;
    this.sound.output = id && id !== 'builtin' ? this.input.outputs.find((o) => o.id === id) || null : null;
  }

  // ---------- settings ----------
  openSettings() {
    const d = $('#settings');
    const s = this.settings;
    const save = (k, v) => { s[k] = v; this.store.save(); };
    const select = (value, options, onChange) => {
      const el = h('select', { onchange: (e) => onChange(e.target.value) }, ...options.map((o) => h('option', { value: o.value }, o.label)));
      el.value = value;
      return el;
    };
    const field = (id, label, control, help) => {
      control.id = id;
      return h('div', { class: 'field' }, h('label', { for: id }, label), control, help ? h('p', { class: 'help' }, help) : null);
    };
    const check = (id, label, value, onChange, help) => {
      const c = h('input', { type: 'checkbox', id, onchange: (e) => onChange(e.target.checked) });
      c.checked = value;
      return h('div', { class: 'field check' }, c, h('label', { for: id }, label), help ? h('p', { class: 'help' }, help) : null);
    };
    const ins = [{ value: 'all', label: 'All connected keyboards' }, ...this.input.devices.map((x) => ({ value: x.id, label: x.name }))];
    const outs = [{ value: 'builtin', label: 'Built-in sound' }, ...this.input.outputs.map((o) => ({ value: o.id, label: o.name }))];
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e) => { this.sound.setVolume(+e.target.value); save('volume', +e.target.value); } });
    vol.value = s.volume;
    const lat = h('input', { type: 'range', min: 0, max: 200, step: 5 });
    const latOut = h('output', {}, `${s.latency} ms`);
    lat.value = s.latency;
    lat.addEventListener('input', (e) => { latOut.textContent = `${e.target.value} ms`; save('latency', +e.target.value); });

    d.textContent = '';
    d.append(h('form', { method: 'dialog', class: 'settings' },
      h('div', { class: 'settings-head' }, h('h2', {}, 'Settings'), h('button', { class: 'icon-btn', value: 'close', 'aria-label': 'Close settings' }, '✕')),
      h('fieldset', {}, h('legend', {}, 'Keyboard'),
        this.input.status === 'connected' || this.input.status === 'waiting'
          ? field('set-in', 'Play from', select(s.input, ins, (v) => { save('input', v); this.input.selected = v; }))
          : h('p', { class: 'help' }, this.input.supported ? 'Connect a USB MIDI keyboard with the button at the top of the page.' : 'This browser can’t read USB MIDI. Chrome, Edge and Firefox on a computer can.'),
        field('set-range', 'On-screen keys', select(s.range, [
          { value: 'auto', label: 'Fit to screen' }, { value: '25', label: '25 keys' }, { value: '37', label: '37 keys' },
          { value: '49', label: '49 keys' }, { value: '61', label: '61 keys' }, { value: '76', label: '76 keys' }, { value: '88', label: '88 keys' },
        ], (v) => { save('range', v); this.keyboard.setPreferred(v); }), 'Match your keyboard’s size so the screen lines up with your hands.'),
        field('set-labels', 'Key names', select(s.labels, [
          { value: 'none', label: 'Hidden' }, { value: 'c', label: 'C keys only' }, { value: 'all', label: 'All white keys' },
        ], (v) => { save('labels', v); this.keyboard.setLabels(v); })),
        h('p', { class: 'help' }, 'Computer keys: A W S E D F T G Y H U J K play from C upward. Z and X change octave.'),
      ),
      h('fieldset', {}, h('legend', {}, 'Sound'),
        field('set-inst', 'Instrument', select(s.instrument, [
          { value: 'grand', label: 'Piano' }, { value: 'epiano', label: 'Electric piano' }, { value: 'organ', label: 'Organ' },
        ], (v) => { save('instrument', v); this.sound.instrument = v; })),
        field('set-vol', 'Volume', vol),
        check('set-echo', 'Play sound when I press my MIDI keyboard', s.echo, (v) => save('echo', v), 'Turn this off if your keyboard has its own speakers.'),
        this.input.outputs.length ? field('set-out', 'Lesson and accompaniment sound', select(s.output, outs, (v) => { save('output', v); this._applyOutput(); }), 'Send demos to a digital piano instead of this device.') : null,
      ),
      h('fieldset', {}, h('legend', {}, 'Practice'),
        check('set-hints', 'Light up the next keys in songs', s.hints, (v) => { save('hints', v); }, 'With this off, keys only light up after a wrong note.'),
        h('div', { class: 'field' }, h('label', { for: 'set-lat' }, 'Timing correction ', latOut), Object.assign(lat, { id: 'set-lat' }),
          h('p', { class: 'help' }, 'If play-along says you’re late when you’re not, raise this a little.')),
      ),
      h('div', { class: 'settings-foot' },
        h('button', { type: 'button', class: 'btn quiet', onclick: () => {
          if (confirm('Clear all lesson stars, song scores and game records?')) { this.store.reset(); this.renderList(); this.ui.toast('Progress cleared.'); }
        } }, 'Clear progress'),
        h('button', { class: 'btn primary', value: 'done' }, 'Done'),
      ),
    ));
    d.showModal();
  }
}

window.app = new App();
