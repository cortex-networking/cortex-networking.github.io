// Built-in synth (Web Audio) with optional routing to a MIDI output.
import { freq } from './theory.js';

const MAX_VOICES = 48;

export class Sound {
  constructor() {
    this.ctx = null;
    this.instrument = 'grand';
    this.volume = 0.8;
    this.output = null;          // MIDIOutput or null for built-in synth
    this.held = new Map();       // midi -> voice (live notes from the player)
    this.sustain = false;
    this.sustained = new Set();
    this.live = [];              // every voice currently sounding
    this.outNotes = new Set();   // notes sent to MIDI out (for panic)
    this.listeners = new Set();
  }

  /** Create/resume the context. Must be called from a user gesture at least once. */
  unlock() {
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') this.ctx.resume().then(() => this._emit());
    return this.ctx;
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  /** Seconds between scheduling a sound and hearing it. */
  get latency() { return this.ctx ? (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) : 0; }
  onChange(fn) { this.listeners.add(fn); }
  _emit() { this.listeners.forEach((fn) => fn()); }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    ctx.onstatechange = () => this._emit();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.9);
    const wet = ctx.createGain(); wet.gain.value = 0.16;
    this.bus.connect(comp);
    this.bus.connect(this.verb); this.verb.connect(wet); wet.connect(comp);
    comp.connect(this.master);
    this.master.connect(ctx.destination);
    this.clickBus = ctx.createGain(); this.clickBus.gain.value = 0.5;
    this.clickBus.connect(this.master);

    const wave = (amps) => {
      const real = new Float32Array(amps.length), imag = new Float32Array(amps);
      return ctx.createPeriodicWave(real, imag);
    };
    this.waves = {
      piano: wave([0, 1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05, 0.035, 0.02]),
      organ: wave([0, 1, 0.75, 0.45, 0.5, 0, 0.28, 0, 0.22, 0, 0, 0, 0.12]),
    };
    const n = ctx.sampleRate * 0.06;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    this._emit();
  }

  _impulse(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        data[i] = lp * (1 - i / len) ** 3.2;
      }
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.now(), 0.02);
  }

  // ---------- player notes ----------
  noteOn(midi, vel = 0.75) {
    this.noteOff(midi, true);
    if (this.output) {
      this._out([0x90, midi, Math.max(1, Math.round(vel * 127))]);
      this.held.set(midi, { midi: true });
      return;
    }
    if (!this.ready) return;
    const v = this._voice(midi, vel, this.now());
    this.held.set(midi, v);
  }

  noteOff(midi, immediate = false) {
    const v = this.held.get(midi);
    if (!v) return;
    if (this.sustain && !immediate && !v.midi) { this.sustained.add(midi); return; }
    this.held.delete(midi);
    this.sustained.delete(midi);
    if (v.midi) this._out([0x80, midi, 0]);
    else v.release(this.now());
  }

  setSustain(down) {
    this.sustain = down;
    if (this.output) this._out([0xb0, 64, down ? 127 : 0]);
    if (!down) {
      for (const m of [...this.sustained]) { this.sustained.delete(m); this.noteOff(m, true); }
    }
  }

  // ---------- scheduled notes (demos, accompaniment) ----------
  play(midi, vel, when, dur) {
    if (this.output) {
      const ts = this._perf(when);
      this.output.send([0x90, midi, Math.round(vel * 100)], ts);
      this.output.send([0x80, midi, 0], this._perf(when + dur));
      this.outNotes.add(midi);
      return;
    }
    if (!this.ready) return;
    const v = this._voice(midi, vel, when);
    v.release(when + dur);
  }

  click(when, accent = false) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = accent ? 1760 : 1180;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.32, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0008, when + 0.05);
    o.connect(g); g.connect(this.clickBus);
    o.start(when); o.stop(when + 0.06);
  }

  /** Silence everything that was scheduled or is ringing. */
  stopAll() {
    const t = this.now();
    for (const v of this.live) v.release(t, 0.03);
    this.live = [];
    this.held.clear(); this.sustained.clear();
    if (this.output) {
      for (const m of this.outNotes) this.output.send([0x80, m, 0]);
      this.output.send([0xb0, 123, 0]);
      if (this.output.clear) try { this.output.clear(); } catch {}
      this.outNotes.clear();
    }
  }

  _perf(when) { return performance.now() + Math.max(0, when - this.now()) * 1000; }
  _out(data) { try { this.output.send(data); } catch {} }

  // ---------- voices ----------
  _voice(midi, vel, when) {
    while (this.live.length >= MAX_VOICES) this.live.shift().release(this.now(), 0.02);
    const make = { grand: this._grand, epiano: this._epiano, organ: this._organ }[this.instrument] || this._grand;
    const v = make.call(this, midi, Math.max(0.05, Math.min(1, vel)), when);
    this.live.push(v);
    return v;
  }

  _finish(nodes, out, endAt) {
    nodes.forEach((n) => { try { n.stop(endAt); } catch {} });
    const v = this;
    nodes[0].onended = () => { out.disconnect(); v.live = v.live.filter((x) => x.out !== out); };
  }

  _grand(midi, vel, when) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    const tau = Math.min(5, Math.max(0.35, 3.2 * 2 ** ((48 - midi) / 22)));
    const bright = Math.min(16000, f * (3 + 13 * vel * vel));
    lp.frequency.setValueAtTime(bright, when);
    lp.frequency.setTargetAtTime(Math.max(f * 1.6, 500), when + 0.01, tau * 0.45);
    const o1 = ctx.createOscillator(); o1.setPeriodicWave(this.waves.piano); o1.frequency.value = f; o1.detune.value = 2.5;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f; o2.detune.value = -2.5;
    const g1 = ctx.createGain(); g1.gain.value = 0.55;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    o1.connect(g1); o2.connect(g2); g1.connect(lp); g2.connect(lp); lp.connect(out);
    // hammer
    const nz = ctx.createBufferSource(); nz.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(7000, f * 5); bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.06 * vel;
    nz.connect(bp); bp.connect(ng); ng.connect(out);
    const peak = (0.1 + 0.32 * vel) * (midi > 84 ? 0.75 : 1);
    const g = out.gain;
    g.setValueAtTime(0, when);
    g.linearRampToValueAtTime(peak, when + 0.004);
    g.setTargetAtTime(peak * 0.45, when + 0.005, 0.09);
    g.setTargetAtTime(0, when + 0.2, tau);
    out.connect(this.bus);
    o1.start(when); o2.start(when); nz.start(when);
    const nodes = [o1, o2];
    const voice = {
      out,
      release: (t, rt = 0.07) => {
        t = Math.max(t, when + 0.01);
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
        g.setTargetAtTime(0, t, rt);
        this._finish(nodes, out, t + rt * 8);
      },
    };
    this._finish(nodes, out, when + 0.2 + tau * 7);
    return voice;
  }

  _epiano(midi, vel, when) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain();
    const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * (0.6 + 2.4 * vel), when);
    mg.gain.setTargetAtTime(f * 0.25, when, 0.35);
    const tine = ctx.createOscillator(); tine.type = 'sine'; tine.frequency.value = f * 14;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(f * 1.2 * vel, when); tg.gain.setTargetAtTime(0, when, 0.03);
    mod.connect(mg); mg.connect(car.frequency); tine.connect(tg); tg.connect(car.frequency);
    car.connect(out);
    const tau = Math.min(4, Math.max(0.5, 2.6 * 2 ** ((52 - midi) / 26)));
    const peak = 0.08 + 0.28 * vel;
    const g = out.gain;
    g.setValueAtTime(0, when); g.linearRampToValueAtTime(peak, when + 0.003);
    g.setTargetAtTime(0, when + 0.01, tau);
    out.connect(this.bus);
    [car, mod, tine].forEach((o) => o.start(when));
    const nodes = [car, mod, tine];
    this._finish(nodes, out, when + tau * 7);
    return {
      out,
      release: (t, rt = 0.12) => {
        t = Math.max(t, when + 0.01);
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
        g.setTargetAtTime(0, t, rt);
        this._finish(nodes, out, t + rt * 8);
      },
    };
  }

  _organ(midi, vel, when) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain();
    const o = ctx.createOscillator(); o.setPeriodicWave(this.waves.organ); o.frequency.value = f;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
    const lg = ctx.createGain(); lg.gain.value = 3;
    lfo.connect(lg); lg.connect(o.detune);
    o.connect(out);
    const g = out.gain;
    g.setValueAtTime(0, when); g.linearRampToValueAtTime(0.16, when + 0.012);
    out.connect(this.bus);
    o.start(when); lfo.start(when);
    const nodes = [o, lfo];
    return {
      out,
      release: (t, rt = 0.03) => {
        t = Math.max(t, when + 0.02);
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
        g.setTargetAtTime(0, t, rt);
        this._finish(nodes, out, t + rt * 10);
      },
    };
  }
}
