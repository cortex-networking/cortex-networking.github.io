// Free play: live staff, chord and interval names, metronome.
import { buildScore, describeNotes, preferFor, noteName, pc, NAMES_SHARP, NAMES_FLAT } from './theory.js';
import { h, toggle } from './ui.js';



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
