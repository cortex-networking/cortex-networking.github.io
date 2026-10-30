// Hardware controls on the learner's keyboard: device profiles (the Alesis QX61 first), MIDI learn
// for knobs, faders, buttons and pads, and the actions they can drive in the app.
import { catalog } from './catalog.js';

/** Things a knob, fader, button or pad can do. */
export const ACTIONS = [
  { id: 'start', label: 'Start / continue', kind: 'trigger', hint: 'Same as the yellow button: start a song or game, continue a lesson.' },
  { id: 'stop', label: 'Stop', kind: 'trigger', hint: 'Stops the song or game that is playing.' },
  { id: 'listen', label: 'Listen to the song', kind: 'trigger', hint: 'On a song page: play it with the band so you can hear it.' },
  { id: 'next', label: 'Next song', kind: 'trigger', hint: 'Jukebox and song pages.' },
  { id: 'prev', label: 'Previous song', kind: 'trigger', hint: 'Jukebox and song pages.' },
  { id: 'volume', label: 'Volume', kind: 'range', hint: 'A fader or knob.' },
  { id: 'bandVolume', label: 'Band volume', kind: 'range', hint: 'A fader or knob.' },
  { id: 'tempo', label: 'Tempo', kind: 'range', hint: 'A knob. Song pages; takes effect the next time you press Start.' },
];

/** The guided setup asks for these, in order. */
export const WIZARD = [
  { action: 'volume', ask: 'Move the fader you want for VOLUME (the first fader works well).' },
  { action: 'bandVolume', ask: 'Move the fader you want for BAND VOLUME (try the second fader).' },
  { action: 'tempo', ask: 'Turn the knob you want for TEMPO (try the first knob).' },
  { action: 'start', ask: 'Press the button or pad you want for START (the PLAY button is a good choice).' },
  { action: 'stop', ask: 'Press the button or pad you want for STOP.' },
  { action: 'listen', ask: 'Press a pad or button for LISTEN.' },
  { action: 'next', ask: 'Press a button or pad for NEXT SONG.' },
  { action: 'prev', ask: 'Press a button or pad for PREVIOUS SONG.' },
];

/** What we know about a keyboard from its USB name. */
export function profileFor(name = '') {
  const n = String(name);
  if (/qx\s*61/i.test(n)) {
    return {
      id: 'qx61', name: 'Alesis QX61', keys: 61, range: '61', controls: true,
      octaveDown: 'press OCTAVE DOWN on the keyboard until the display shows 00',
      octaveUp: 'press OCTAVE UP on the keyboard until the display shows 00',
      transpose: 'set TRANSPOSE back to 00 on the keyboard',
      padTip: 'On the QX61 you can move the pads to channel 10 with ADVANCED, then CHAN ASSIGN, tap the pad, type 10 and press ENTER. Do the same for the other pads.',
    };
  }
  const keys = (n.match(/(?:^|\D)(25|32|37|49|61|76|88)(?:\D|$)/) || [])[1];
  return {
    id: 'generic', name: n || 'MIDI keyboard', keys: keys ? +keys : null, range: keys && ['25', '37', '49', '61', '76', '88'].includes(keys) ? keys : null,
    controls: /alesis|akai|arturia|novation|m-audio|nektar|keylab|launchkey|mpk|oxygen/i.test(n),
    octaveDown: 'press the octave down button on the keyboard until it is back to normal',
    octaveUp: 'press the octave up button on the keyboard until it is back to normal',
    transpose: 'set the keyboard’s transpose back to zero',
    padTip: 'If the pads play notes, set them to MIDI channel 10 on the keyboard so the app can tell them apart from the keys.',
  };
}

const keyOf = (m) => `${m.kind}:${m.ch}:${m.num ?? 0}`;

/** A readable name for a control message. */
export function describe(m) {
  if (!m) return '';
  if (m.kind === 'pb') return 'Pitch wheel';
  if (m.kind === 'cc' && m.num === 1) return 'Mod wheel';
  if (m.kind === 'cc') return `Knob, fader or button (CC ${m.num}, channel ${m.ch + 1})`;
  if (m.kind === 'note') return `Pad (note ${m.num}, channel ${m.ch + 1})`;
  if (m.kind === 'pc') return `Program button (channel ${m.ch + 1})`;
  return 'Control';
}

export class Controls {
  constructor(app) {
    this.app = app;
    this.learner = null;      // resolve(msg) while learning
    this.last = new Map();    // key -> last value (edge detection for buttons)
    this.padHinted = false;
    this.rangeTimer = null;
  }

  get store() { return this.app.store; }
  get map() {
    const s = this.store.settings;
    if (!s.controls || typeof s.controls !== 'object') s.controls = { map: {} };
    if (!s.controls.map) s.controls.map = {};
    return s.controls.map;
  }

  /** The control assigned to an action, as the message descriptor. */
  assigned(action) {
    const k = Object.keys(this.map).find((x) => this.map[x] === action);
    if (!k) return null;
    const [kind, ch, num] = k.split(':');
    return { kind, ch: +ch, num: +num };
  }

  assign(action, msg) {
    for (const k of Object.keys(this.map)) if (this.map[k] === action) delete this.map[k];
    this.map[keyOf(msg)] = action;
    this.store.save();
  }

  clear(action) {
    for (const k of Object.keys(this.map)) if (this.map[k] === action) delete this.map[k];
    this.store.save();
  }

  clearAll() { this.store.settings.controls = { map: {} }; this.store.save(); }

  /** Wait for the next knob, fader, button or pad. Resolves with the message, or null on cancel/timeout. */
  learn(kind, timeoutMs = 15000) {
    this.cancelLearn();
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.learner = null; resolve(null); }, timeoutMs);
      this.learner = { kind, resolve: (m) => { clearTimeout(t); this.learner = null; if (m) this.justLearned = keyOf(m); resolve(m); } };
    });
  }

  cancelLearn() { if (this.learner) { const l = this.learner; this.learner = null; l.resolve(null); } }

  /** Every non-key MIDI message from the input lands here. */
  handle(m) {
    const k = keyOf(m);
    const prev = this.last.get(k);
    this.last.set(k, m.value);
    const now = performance.now();
    const seen = this.seenAt?.get(k);
    (this.seenAt ||= new Map()).set(k, now);
    if (this.learner) {
      // a fader keeps sending while it moves: don't let the tail of the last one land on the next job
      if (this.justLearned === k && seen !== undefined && now - seen < 800) return;
      // a trigger wants a press; a range wants something that moves
      const pressed = m.kind === 'note' ? m.value > 0 : m.kind === 'pc' || (m.value >= 0.5 && !(prev >= 0.5));
      const moved = (m.kind === 'cc' || m.kind === 'pb') && prev !== undefined && prev !== m.value;
      if (this.learner.kind === 'trigger' ? pressed : (moved || m.kind === 'cc' || m.kind === 'pb')) this.learner.resolve(m);
      return;
    }
    const action = this.map[k];
    if (!action) {
      if (m.kind === 'note' && m.value > 0 && !this.padHinted) {
        this.padHinted = true;
        this.app.ui.toast('That was a pad. You can give pads jobs like Start, Stop and Listen in Settings, under Keyboard controls.', 6000);
      }
      return;
    }
    const def = ACTIONS.find((a) => a.id === action);
    if (!def) return;
    if (def.kind === 'range') { this._range(action, m.value); return; }
    const pressed = m.kind === 'note' ? m.value > 0 : m.kind === 'pc' || (m.value >= 0.5 && !(prev >= 0.5));
    if (pressed) this._trigger(action);
  }

  _range(action, v) {
    const { app } = this;
    const s = app.settings;
    let text = '';
    if (action === 'volume') { s.volume = v; app.sound.setVolume(v); text = `Volume ${Math.round(v * 100)}%`; }
    if (action === 'bandVolume') { s.bandVolume = v; app.sound.setBandVolume?.(v); text = `Band volume ${Math.round(v * 100)}%`; }
    if (action === 'tempo') {
      const ctrl = app.ctrl;
      if (ctrl?.opts && 'tempo' in ctrl.opts && ctrl.score) {
        const t = Math.round((0.4 + v * 0.9) * 20) / 20;
        if (t !== ctrl.opts.tempo) {
          ctrl.opts.tempo = t;
          ctrl._save?.();
          if (!ctrl.session?.running) { ctrl.build?.(); ctrl._prompt?.(); }
        }
        text = `Tempo ${Math.round(ctrl.score.tempo * t)} bpm${ctrl.session?.running ? ' (next start)' : ''}`;
      } else text = 'Tempo works on song pages.';
    }
    clearTimeout(this.rangeTimer);
    this.rangeTimer = setTimeout(() => this.store.save(), 600);
    if (text) app.ui.toast(text, 1200);
  }

  _trigger(action) {
    const { app } = this;
    const foot = document.getElementById('foot');
    const ctrl = app.ctrl;
    const click = (el) => { if (el && !el.disabled) { app.sound.unlock(); el.click(); return true; } return false; };
    const byText = (re) => [...(foot?.querySelectorAll('button, a.btn') || [])].find((b) => re.test(b.textContent.trim()));
    if (action === 'start') {
      if (!click(foot?.querySelector('[data-enter]')) && !click(foot?.querySelector('.btn.primary'))) app.ui.toast('Nothing to start here.', 1500);
    } else if (action === 'stop') {
      if (!click(byText(/^stop$/i))) app.ui.toast('Nothing is playing.', 1200);
    } else if (action === 'listen') {
      if (ctrl?.opts && ctrl.score && ctrl.build) {
        ctrl.session?.stop?.(true);
        ctrl.opts.mode = 'listen';
        ctrl._save?.(); ctrl.build(); ctrl._prompt?.(); ctrl.play?.();
      } else app.ui.toast('Listen works on song pages.', 1500);
    } else if (action === 'next' || action === 'prev') {
      const dir = action === 'next' ? 1 : -1;
      if (ctrl?._skip) ctrl._skip(dir);
      else if (ctrl?.song && ctrl.score) {
        const list = catalog.songs;
        const i = list.findIndex((s) => s.id === ctrl.song.id);
        const next = list[(i + dir + list.length) % list.length];
        app.open('songs', next.id);
      } else app.ui.toast('Next and previous work in the Jukebox and on song pages.', 1800);
    }
  }
}
