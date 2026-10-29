// App shell: tabs, lists, profiles, settings, device status, input routing and the frame loop.
import * as audio from './audio.js';
import { Input } from './input.js';
import { Keyboard } from './keyboard.js';
import { Staff } from './staff.js';
import { h, stars } from './ui.js';
import { Store, INTERESTS } from './store.js';
import { Coach } from './coach.js';
import { catalog, COLLECTIONS } from './catalog.js';
import { LessonMode, PracticeMode, lessonUnlocked, resolveRef } from './lesson.js';
import { SongMode } from './songmode.js';
import { HomeMode, ProgressMode, nextLesson, showCertificate } from './home.js';
import { FreeMode, GAME_CLASSES } from './modes.js';

const $ = (s) => document.querySelector(s);
const TABS = ['learn', 'songs', 'games', 'studio', 'free'];

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
  /** Custom visual for a mode (game scene, piano roll, dashboard). Pass null to clear. */
  layer(node, { hideStaff = true } = {}) {
    const el = $('#layer');
    el.textContent = '';
    if (node) el.append(node);
    el.closest('.score').classList.toggle('has-layer', !!node);
    el.closest('.score').classList.toggle('no-staff', !!node && hideStaff);
    return el;
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
    this.sound = new audio.Sound();
    this.sound.instrument = this.settings.instrument;
    this.sound.volume = this.settings.volume;
    this.sound.setBandVolume?.(this.settings.bandVolume ?? 0.7);
    this.input = new Input();
    this.input.selected = this.settings.input;
    this.keyboard = new Keyboard($('#piano'), this.input);
    this.keyboard.labels = this.settings.labels;
    this.keyboard.preferred = this.settings.range;
    this.keyboard.fit(true);
    this.staff = new Staff($('#staff'));
    this.ui = new UI();
    this.coach = new Coach(this);
    this.ctrl = null;
    this.tab = 'learn';
    this.extras = { games: null, studio: null };
    this._wire();
    this.input.attachComputerKeyboard();
    this.input.autoConnect();
    this._device();
    this.renderProfile();
    this.route();
    this._loadExtras();
    let last = performance.now();
    let saveIn = 20;
    const frame = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      try { this.ctrl?.tick?.(dt); } catch (err) { console.error(err); }
      if (document.visibilityState === 'visible' && performance.now() - this.input.lastActivity < 15000) {
        this.store.addPractice(dt);
        saveIn -= dt;
        if (saveIn <= 0) { saveIn = 20; this.store.save(); }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  get settings() { return this.store.settings; }

  async _loadExtras() {
    try {
      const m = await import('./games-extra.js');
      this.extras.games = m;
      if (m.GAMES_EXTRA) catalog.set({ games: [...catalog.games, ...m.GAMES_EXTRA.filter((g) => !catalog.games.some((x) => x.id === g.id))] });
    } catch { /* optional */ }
    try {
      this.extras.studio = await import('./studio.js');
    } catch { /* optional */ }
    document.querySelector('.tabs [data-tab="studio"]').hidden = !this.extras.studio;
    if (this.tab === 'games' || this.tab === 'studio') this.route(); else this.renderList();
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
    $('#profile').addEventListener('click', () => this.openProfiles());
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.tab)));
    $('#list-toggle').addEventListener('click', () => document.body.classList.toggle('list-open'));
    $('#list-scrim').addEventListener('click', () => document.body.classList.remove('list-open'));
    window.addEventListener('hashchange', () => this.route());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.repeat) return;
      const a = document.activeElement;
      if (a && a !== document.body && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(a.tagName)) return;
      if (document.querySelector('dialog[open]') || document.querySelector('.cert-overlay')) return;
      const btn = $('#foot [data-enter]') || $('#layer [data-enter]');
      if (btn) { e.preventDefault(); btn.click(); }
    });
    window.addEventListener('beforeunload', () => this.store.save());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.store.save(); });
  }

  // ---------- routing ----------
  route() {
    let [, tab, id] = (location.hash || '').split('/');
    if (tab === 'lessons') tab = 'learn';
    const special = tab === 'practice' || tab === 'progress';
    const t = TABS.includes(tab) || special ? tab : 'learn';
    this.tab = special ? 'learn' : t;
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === this.tab)));
    document.body.dataset.tab = this.tab;
    let ctrl;
    this.current = null;
    if (t === 'learn') {
      const lesson = id && catalog.lesson(id);
      if (lesson) { this.current = lesson.id; ctrl = new LessonMode(this, lesson); }
      else { this.current = 'home'; ctrl = new HomeMode(this); }
    } else if (t === 'practice') {
      ctrl = new PracticeMode(this, this.pendingPractice || (id === 'today' ? this._today() : null));
      this.pendingPractice = null;
    } else if (t === 'progress') {
      this.current = 'progress';
      ctrl = new ProgressMode(this);
    } else if (t === 'songs') {
      const song = (id && catalog.song(id)) || this._defaultSong();
      this.current = song.id;
      ctrl = new SongMode(this, song);
    } else if (t === 'games') {
      const game = catalog.games.find((g) => g.id === id) || catalog.games[0];
      this.current = game.id;
      const C = GAME_CLASSES[game.id] || this.extras.games?.GAME_CLASSES_EXTRA?.[game.id];
      ctrl = C ? new C(this, game) : new HomeMode(this);
    } else if (t === 'studio' && this.extras.studio?.StudioMode) {
      ctrl = new this.extras.studio.StudioMode(this, id || undefined);
    } else if (t === 'studio') {
      ctrl = new FreeMode(this);
    } else {
      ctrl = new FreeMode(this);
    }
    this.ctrl?.exit?.();
    this.sound.stopAll();
    this.keyboard.clear('cue-r', 'cue-l', 'demo', 'hit', 'miss');
    this.keyboard.clearFingers();
    this.ui.status('');
    this.ui.pips(0, 0);
    this.ui.big();
    this.ui.layer(null);
    this.ui.prompt('');
    this.ctrl = ctrl;
    this.renderList();
    ctrl.enter();
    document.body.classList.remove('list-open');
  }

  _defaultSong() {
    const ids = Object.keys(this.store.data.songs);
    return catalog.song(ids[ids.length - 1]) || catalog.songs.find((s) => s.level === 1) || catalog.songs[0];
  }

  _today() { return this.coach.todaysPractice((ref) => resolveRef(ref)); }

  setTab(tab) { location.hash = `#/${tab}`; }
  open(tab, id) {
    const target = id ? `#/${tab}/${id}` : `#/${tab}`;
    if (location.hash === target) this.route(); else location.hash = target;
  }
  practice(routine) { this.pendingPractice = routine; this.open('practice', ''); }
  practiceToday() { this.open('practice', 'today'); }
  showCertificate(chapterId) { showCertificate(this, chapterId); }

  // ---------- side list ----------
  renderList() {
    const list = $('#list');
    const keepScroll = list.scrollTop;
    list.textContent = '';
    const item = (tab, id, title, sub, extra, attrs = {}) => h('a', {
      class: 'item', href: `#/${tab}/${id}`, 'aria-current': this.current === id ? 'page' : null, ...attrs,
    }, h('span', { class: 'item-title' }, title), sub ? h('span', { class: 'item-sub' }, sub) : null, extra ? h('span', { class: 'item-extra' }, extra) : null);

    if (this.tab === 'learn') {
      const passed = catalog.lessons.filter((l) => this.store.lesson(l.id)?.passed).length;
      list.append(h('div', { class: 'list-top' },
        h('a', { class: `item${this.current === 'home' ? '' : ''}`, href: '#/learn', 'aria-current': this.current === 'home' ? 'page' : null }, h('span', { class: 'item-title' }, 'What’s next'), h('span', { class: 'item-sub' }, `${passed} of ${catalog.lessons.length} lessons passed`)),
        h('a', { class: 'item', href: '#/progress', 'aria-current': this.current === 'progress' ? 'page' : null }, h('span', { class: 'item-title' }, 'Progress and certificates'))));
      const next = nextLesson(this);
      catalog.chapters.forEach((ch, ci) => {
        const ls = catalog.lessonsIn(ch.id);
        const done = ls.filter((l) => this.store.lesson(l.id)?.passed).length;
        list.append(h('section', { class: 'group' },
          h('h2', {}, `${ci + 1}. ${ch.title}`, h('span', { class: 'count' }, ` ${done}/${ls.length}`)),
          ...ls.map((l) => {
            const rec = this.store.lesson(l.id);
            const open = lessonUnlocked(this, l);
            const extra = rec?.passed ? stars(rec.stars) : !open ? h('span', { class: 'lock' }, 'Locked') : next && next.id === l.id ? h('span', { class: 'next-dot', 'aria-label': 'Next' }) : null;
            return item('learn', l.id, l.title, l.goal || l.summary, extra, { class: `item${open ? '' : ' locked'}` });
          })));
      });
    } else if (this.tab === 'songs') {
      const search = h('input', { type: 'search', class: 'list-search', placeholder: 'Find a song', 'aria-label': 'Find a song', value: this.songQuery || '' });
      const body = h('div', {});
      const draw = () => {
        body.textContent = '';
        const q = (this.songQuery || '').toLowerCase();
        const match = (s) => !q || `${s.title} ${s.composer} ${(s.tags || []).join(' ')}`.toLowerCase().includes(q);
        const placed = new Set();
        const interests = this.store.profile?.interests || [];
        const order = [...COLLECTIONS].sort((a, b) => (interests.includes(b.id) ? 1 : 0) - (interests.includes(a.id) ? 1 : 0));
        for (const col of order) {
          const ss = catalog.songs.filter((s) => !placed.has(s.id) && (s.tags || []).includes(col.id) && match(s)).sort((a, b) => a.level - b.level);
          if (!ss.length) continue;
          ss.forEach((s) => placed.add(s.id));
          body.append(h('section', { class: 'group' }, h('h2', {}, col.title),
            ...ss.map((s) => {
              const b = this.store.song(s.id);
              return item('songs', s.id, s.title, `${s.composer}, level ${s.level}`, b ? stars(b.stars) : null);
            })));
        }
        const rest = catalog.songs.filter((s) => !placed.has(s.id) && match(s));
        if (rest.length) body.append(h('section', { class: 'group' }, h('h2', {}, 'More'), ...rest.map((s) => item('songs', s.id, s.title, `${s.composer}, level ${s.level}`, this.store.song(s.id) ? stars(this.store.song(s.id).stars) : null))));
        if (!body.childNodes.length) body.append(h('p', { class: 'list-note' }, 'No songs match that.'));
      };
      search.addEventListener('input', () => { this.songQuery = search.value; draw(); });
      list.append(search, body);
      draw();
    } else if (this.tab === 'games') {
      list.append(h('section', { class: 'group' }, h('h2', {}, 'Games'),
        ...catalog.games.map((g) => {
          const best = this.store.bestGame(g.id);
          return item('games', g.id, g.title, g.summary, best ? `Best ${best}` : null);
        })));
    } else if (this.tab === 'studio') {
      if (this.extras.studio?.renderStudioList) this.extras.studio.renderStudioList(this, list);
      else list.append(h('section', { class: 'group help' }, h('h2', {}, 'Studio'), h('p', {}, 'Record up to eight tracks, layer parts, and export MIDI files. Recordings stay in this browser.')));
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
    list.scrollTop = keepScroll;
  }

  // ---------- profiles ----------
  renderProfile() {
    const p = this.store.profile;
    const btn = $('#profile');
    btn.querySelector('.avatar').textContent = (p.name || '?').trim().charAt(0).toUpperCase();
    btn.querySelector('.profile-name').textContent = p.name;
    btn.setAttribute('aria-label', `Learner: ${p.name}. Switch or add learners`);
  }

  openProfiles() {
    const d = $('#profiles');
    const s = this.store;
    const render = (mode = 'list', target = null) => {
      d.textContent = '';
      const head = h('div', { class: 'settings-head' }, h('h2', {}, mode === 'add' ? 'Add a learner' : mode === 'edit' ? 'Edit learner' : 'Who’s playing?'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => d.close() }, '✕'));
      if (mode === 'list') {
        d.append(h('div', { class: 'settings' }, head,
          h('ul', { class: 'profile-list' }, ...s.profiles.map((p) => {
            const passed = Object.values(s.root.data[p.id]?.lessons || {}).filter((x) => x.passed).length;
            return h('li', {},
              h('button', { type: 'button', class: `profile-pick${p.id === s.profile.id ? ' current' : ''}`, onclick: () => { s.useProfile(p.id); this.renderProfile(); d.close(); this.route(); } },
                h('span', { class: 'avatar' }, p.name.charAt(0).toUpperCase()), h('span', {}, h('strong', {}, p.name), h('span', { class: 'small' }, `${passed} lessons passed`))),
              h('button', { type: 'button', class: 'btn quiet', onclick: () => render('edit', p) }, 'Edit'));
          })),
          h('div', { class: 'settings-foot' },
            h('button', { type: 'button', class: 'btn', onclick: () => { d.close(); this.open('progress', ''); } }, 'Progress and certificates'),
            h('button', { type: 'button', class: 'btn primary', onclick: () => render('add') }, 'Add a learner'))));
        return;
      }
      const p = target || { name: '', interests: [] };
      const chosen = new Set(p.interests || []);
      const name = h('input', { type: 'text', id: 'pf-name', value: p.name, maxlength: 24, autocomplete: 'off' });
      const chips = h('div', { class: 'chips' }, ...INTERESTS.map((it) => {
        const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(chosen.has(it.id)), onclick: () => {
          if (chosen.has(it.id)) chosen.delete(it.id); else chosen.add(it.id);
          b.setAttribute('aria-pressed', String(chosen.has(it.id)));
        } }, it.label);
        return b;
      }));
      const confirmBox = h('div', { class: 'confirm', hidden: true },
        h('p', {}, `Delete ${p.name} and all of their progress? This can’t be undone.`),
        h('button', { type: 'button', class: 'btn danger', onclick: () => { s.deleteProfile(p.id); this.renderProfile(); render('list'); this.route(); } }, 'Delete'),
        h('button', { type: 'button', class: 'btn quiet', onclick: () => { confirmBox.hidden = true; } }, 'Keep'));
      d.append(h('div', { class: 'settings' }, head,
        h('div', { class: 'field' }, h('label', { for: 'pf-name' }, 'Name'), name),
        h('p', { class: 'help' }, 'Music they like (shapes song suggestions):'), chips,
        mode === 'edit' && s.profiles.length > 1 ? h('button', { type: 'button', class: 'btn quiet', onclick: () => { confirmBox.hidden = false; } }, 'Delete this learner') : null,
        confirmBox,
        h('div', { class: 'settings-foot' },
          h('button', { type: 'button', class: 'btn', onclick: () => render('list') }, 'Back'),
          h('button', { type: 'button', class: 'btn primary', onclick: () => {
            const nm = name.value.trim();
            if (mode === 'add') { const id = s.addProfile(nm, [...chosen]); s.useProfile(id); }
            else s.updateProfile(p.id, { name: nm || p.name, interests: [...chosen] });
            this.renderProfile(); d.close(); this.route();
          } }, mode === 'add' ? 'Add and switch' : 'Save'))));
      name.focus();
    };
    render();
    d.showModal();
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
    this.sound.applyOutputPrograms?.();
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
    const bandVol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e) => { this.sound.setBandVolume?.(+e.target.value); save('bandVolume', +e.target.value); } });
    bandVol.value = s.bandVolume ?? 0.7;
    const lat = h('input', { type: 'range', min: 0, max: 200, step: 5 });
    const latOut = h('output', {}, `${s.latency} ms`);
    lat.value = s.latency;
    lat.addEventListener('input', (e) => { latOut.textContent = `${e.target.value} ms`; save('latency', +e.target.value); });
    const confirmBox = h('div', { class: 'confirm', hidden: true },
      h('p', {}, `Clear ${this.store.profile.name}’s lesson stars, song scores, game records and practice history?`),
      h('button', { type: 'button', class: 'btn danger', onclick: () => { this.store.resetProgress(); confirmBox.hidden = true; this.renderList(); this.ui.toast('Progress cleared.'); this.route(); } }, 'Clear'),
      h('button', { type: 'button', class: 'btn quiet', onclick: () => { confirmBox.hidden = true; } }, 'Keep'));

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
          { value: 'grand', label: 'Grand piano' }, { value: 'epiano', label: 'Electric piano' }, { value: 'organ', label: 'Organ' },
        ], (v) => { save('instrument', v); this.sound.instrument = v; })),
        field('set-vol', 'Volume', vol),
        check('set-echo', 'Play sound when I press my MIDI keyboard', s.echo, (v) => save('echo', v), 'Turn this off if your keyboard has its own speakers.'),
        check('set-band', 'Backing band in play-along and listen', s.band, (v) => save('band', v)),
        field('set-bandvol', 'Band volume', bandVol),
        this.input.outputs.length ? field('set-out', 'Lesson and accompaniment sound', select(s.output, outs, (v) => { save('output', v); this._applyOutput(); }), 'Send demos to a digital piano instead of this device.') : null,
        audio.SAMPLE_CREDIT ? h('p', { class: 'help' }, audio.SAMPLE_CREDIT) : null,
      ),
      h('fieldset', {}, h('legend', {}, 'Practice'),
        check('set-hints', 'Light up the next keys in songs', s.hints, (v) => { save('hints', v); }, 'With this off, keys only light up after a wrong note.'),
        check('set-open', 'Let me open any lesson', s.openAll, (v) => { save('openAll', v); this.renderList(); }, 'Normally each lesson opens once you pass the one before it.'),
        h('div', { class: 'field' }, h('label', { for: 'set-lat' }, 'Timing correction ', latOut), Object.assign(lat, { id: 'set-lat' }),
          h('p', { class: 'help' }, 'If play-along says you’re late when you’re not, raise this a little.')),
      ),
      confirmBox,
      h('div', { class: 'settings-foot' },
        h('button', { type: 'button', class: 'btn quiet', onclick: () => { confirmBox.hidden = false; } }, 'Clear progress'),
        h('button', { class: 'btn primary', value: 'done' }, 'Done'),
      ),
    ));
    d.showModal();
  }
}

window.app = new App();
