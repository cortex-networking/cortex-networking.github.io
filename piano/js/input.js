// Note input from USB MIDI keyboards, the computer keyboard and the on-screen keys.

const PC_KEYS = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

export class Input extends EventTarget {
  constructor() {
    super();
    this.access = null;
    this.devices = [];
    this.outputs = [];
    this.selected = 'all';
    this.held = new Map();      // midi -> source
    this.pedal = false;
    this.pcOctave = 4;
    this.pcDown = new Map();    // code -> midi
    this.status = navigator.requestMIDIAccess ? 'idle' : 'unsupported';
    this.lastActivity = 0;
    // notes that are really pads or buttons: channel 10 (the drum channel) always, plus any note
    // the app has learned as a control
    this.isControlNote = () => false;
  }

  get supported() { return !!navigator.requestMIDIAccess; }

  async connect() {
    if (!this.supported) { this.status = 'unsupported'; this._emit('status'); return false; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.status = 'denied'; this._emit('status'); return false;
    }
    this.access.onstatechange = () => this._refresh();
    this._refresh();
    return true;
  }

  /** Connect silently if the browser already granted MIDI permission. */
  async autoConnect() {
    if (!this.supported || !navigator.permissions) return;
    try {
      const p = await navigator.permissions.query({ name: 'midi', sysex: false });
      if (p.state === 'granted') await this.connect();
    } catch { /* permission name unsupported */ }
  }

  _refresh() {
    const ins = [...this.access.inputs.values()].filter((p) => p.state === 'connected');
    const before = this.devices.length;
    this.devices = ins.map((p) => ({ id: p.id, name: p.name || 'MIDI keyboard' }));
    this.outputs = [...this.access.outputs.values()].filter((p) => p.state === 'connected');
    for (const port of this.access.inputs.values()) {
      port.onmidimessage = (e) => this._message(e, port);
    }
    if (this.selected !== 'all' && !this.devices.some((d) => d.id === this.selected)) this.selected = 'all';
    this.status = this.devices.length ? 'connected' : 'waiting';
    this._emit('status');
    if (this.devices.length > before) this._emit('plugged');
  }

  _message(e, port) {
    if (this.selected !== 'all' && port.id !== this.selected) return;
    const [st, d1, d2 = 0] = e.data;
    if (st >= 0xf0) return;
    const cmd = st & 0xf0, ch = st & 0x0f;
    const isNote = cmd === 0x90 || cmd === 0x80;
    if (isNote && (ch === 9 || this.isControlNote(ch, d1))) {
      const on = cmd === 0x90 && d2 > 0;
      this._control({ kind: 'note', ch, num: d1, value: on ? d2 / 127 : 0, port: port.id, name: port.name });
      return;
    }
    if (cmd === 0x90 && d2 > 0) this.press(d1, d2 / 127, 'midi', e.timeStamp);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this.release(d1, 'midi', e.timeStamp);
    else if (cmd === 0xb0 && d1 === 64) this.setPedal(d2 >= 64);
    else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) this.releaseAll();
    else if (cmd === 0xb0) this._control({ kind: 'cc', ch, num: d1, value: d2 / 127, port: port.id, name: port.name });
    else if (cmd === 0xe0) this._control({ kind: 'pb', ch, num: 0, value: ((d2 << 7) | d1) / 16383, port: port.id, name: port.name });
    else if (cmd === 0xc0) this._control({ kind: 'pc', ch, num: d1, value: 1, port: port.id, name: port.name });
  }

  /** Knobs, faders, buttons, wheels and pads: everything that isn't a key. */
  _control(detail) {
    this.lastActivity = performance.now();
    this.dispatchEvent(new CustomEvent('control', { detail }));
  }

  press(midi, vel = 0.75, source = 'screen', time = performance.now()) {
    if (midi < 0 || midi > 127) return;
    if (this.held.has(midi)) this.release(midi, this.held.get(midi), time);
    this.held.set(midi, source);
    this.lastActivity = performance.now();
    this.dispatchEvent(new CustomEvent('noteon', { detail: { midi, vel, source, time } }));
  }

  release(midi, source, time = performance.now()) {
    if (!this.held.has(midi)) return;
    this.held.delete(midi);
    this.dispatchEvent(new CustomEvent('noteoff', { detail: { midi, source, time } }));
  }

  releaseAll() { for (const [m, s] of [...this.held]) this.release(m, s); }

  setPedal(down) {
    if (down === this.pedal) return;
    this.pedal = down;
    this.dispatchEvent(new CustomEvent('pedal', { detail: { down } }));
  }

  /** Computer keyboard: A W S E D F T G Y H U J K … play C4 upward; Z / X shift octave. */
  attachComputerKeyboard(target = window) {
    const typing = (e) => {
      const el = e.target;
      return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    target.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (e.code === 'KeyZ' || e.code === 'KeyX') {
        if (e.repeat) return;
        this.pcOctave = Math.max(1, Math.min(7, this.pcOctave + (e.code === 'KeyZ' ? -1 : 1)));
        this._emit('octave');
        return;
      }
      const off = PC_KEYS[e.code];
      if (off === undefined) return;
      e.preventDefault();
      if (e.repeat || this.pcDown.has(e.code)) return;
      const midi = (this.pcOctave + 1) * 12 + off;
      this.pcDown.set(e.code, midi);
      this.press(midi, 0.75, 'pc');
    });
    target.addEventListener('keyup', (e) => {
      const midi = this.pcDown.get(e.code);
      if (midi === undefined) return;
      this.pcDown.delete(e.code);
      this.release(midi, 'pc');
    });
    window.addEventListener('blur', () => {
      for (const [code, midi] of this.pcDown) this.release(midi, 'pc');
      this.pcDown.clear();
    });
  }

  _emit(type) { this.dispatchEvent(new Event(type)); }
}
