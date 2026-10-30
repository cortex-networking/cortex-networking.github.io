// Sound engine (Web Audio) with optional routing to a MIDI output.
//
// Player instruments: sampled grand piano (Salamander, loaded lazily after the first unlock, with
// the original synth as a seamless fallback), electric piano and organ synths.
// Band instruments for accompaniment: bass, pad (strings), choir ("aah"), pluck, and a synth drum kit.
// The band has its own gain bus (setBandVolume) so it can be balanced against the player.
import { freq } from './theory.js';

export const SAMPLE_CREDIT = 'Piano samples: Salamander Grand Piano by Alexander Holm (CC-BY 3.0)';
const SAMPLE_URL = new URL('../samples/piano/', import.meta.url).href;

const MAX_VOICES = 56;          // pitched voices (player + band)
const MAX_HITS = 24;            // drum hits
const BAND = ['bass', 'pad', 'choir', 'pluck'];

// General MIDI routing for an output port: instrument -> [channel (0-based), program].
// The player's instrument always lives on channel 1.
const MIDI_MAP = {
  grand: [0, 0], epiano: [0, 4], organ: [0, 16],
  bass: [1, 33], pad: [2, 48], choir: [3, 52], pluck: [4, 25],
};
const DRUM_CH = 9;
const GM_DRUMS = { kick: 36, snare: 38, hat: 42, openhat: 46, crash: 49, tomlo: 45, tomhi: 50, rim: 37, clap: 39 };

// Levels (linear gain at velocity 1). Calibrated so the band sits under a piano melody.
const SAMPLE_GAIN = 1.5;
const LEVEL = { bass: 0.27, pad: 0.08, choir: 0.85, pluck: 0.8 };
const DRUM_LEVEL = { kick: 0.8, snare: 0.4, hat: 0.14, openhat: 0.12, crash: 0.12, tomlo: 0.58, tomhi: 0.48, rim: 0.28, clap: 0.36 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hold = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); };

export class Sound {
  /**
   * opts.context: use this (Offline)AudioContext instead of creating one (rendering, tests).
   * opts.samples: base URL of the piano sample folder, or false for synth only.
   */
  constructor(opts = {}) {
    this.ctx = null;
    this._ctxOpt = opts.context || null;
    this.sampleUrl = opts.samples === undefined ? SAMPLE_URL : opts.samples;
    this._instrument = 'grand';
    this.volume = 0.8;
    this.bandVolume = 0.7;
    this._output = null;         // MIDIOutput or null for the built-in sound
    this.held = new Map();       // midi -> voice (live notes from the player)
    this.sustain = false;
    this.sustained = new Set();
    this.live = [];              // every pitched voice currently sounding
    this.hits = [];              // drum voices currently sounding
    this.outNotes = new Set();   // channel*128+note sent to MIDI out (for panic)
    this.outChannels = new Set();
    this.listeners = new Set();
    this.samples = null;         // { layers: [{ id, maxVel, db, list: [{ note, buffer, offset }] }] }
    this.sampleState = 'idle';   // idle | loading | ready | failed | off
    this._sampleLoad = null;
    this.plucks = new Map();     // midi -> AudioBuffer (Karplus-Strong, rendered on demand)
  }

  // ---------- context ----------
  /** Create/resume the context. Must be called from a user gesture at least once. */
  unlock() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed' && !this.offline) this.ctx.resume().then(() => this._emit(), () => {});
    if (!this._sampleLoad && this.sampleUrl) setTimeout(() => this.loadSamples(), 0);
    return this.ctx;
  }
  get ready() { return !!this.ctx && (this.offline || this.ctx.state === 'running'); }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  /** Seconds between scheduling a sound and hearing it. */
  get latency() { return this.ctx && !this.offline ? (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) : 0; }
  onChange(fn) { this.listeners.add(fn); }
  _emit() { this.listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  get instrument() { return this._instrument; }
  set instrument(v) {
    this._instrument = v;
    if (this._output) this._out([0xc0, (MIDI_MAP[v] || MIDI_MAP.grand)[1]]);
  }

  get output() { return this._output; }
  set output(o) {
    const prev = this._output;
    if (prev === o) return;
    if (prev) this._panic(prev);
    this._output = o || null;
    if (this._output) this.applyOutputPrograms();
  }

  _build() {
    let ctx = this._ctxOpt;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    ctx.onstatechange = () => this._emit();

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // player and band are compressed separately; a latency-free soft clipper keeps their sum clean
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = i / 2048 - 1, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.75 ? a : 0.75 + 0.25 * Math.tanh((a - 0.75) / 0.25));
    }
    clip.curve = curve;
    this.master.connect(clip); clip.connect(ctx.destination);
    // player path
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(this.master);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(comp);
    // shared room
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.9);
    const wet = ctx.createGain(); wet.gain.value = 0.16;
    this.verb.connect(wet); wet.connect(comp);
    this.bus.connect(this.verb);
    // band path: voices and drums each get a gain set by setBandVolume, then a gentle glue compressor
    const bcomp = ctx.createDynamicsCompressor();
    bcomp.threshold.value = -20; bcomp.knee.value = 10; bcomp.ratio.value = 3;
    bcomp.attack.value = 0.004; bcomp.release.value = 0.18;
    bcomp.connect(this.master);
    this.bandBus = ctx.createGain();
    this.bandBus.gain.value = this.bandVolume;
    this.bandBus.connect(bcomp);
    const bsend = ctx.createGain(); bsend.gain.value = 0.9;
    this.bandBus.connect(bsend); bsend.connect(this.verb);
    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = this.bandVolume;
    this.drumBus.connect(bcomp);
    const dsend = ctx.createGain(); dsend.gain.value = 0.3;
    this.drumBus.connect(dsend); dsend.connect(this.verb);
    // metronome
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
    const n = Math.floor(ctx.sampleRate * 0.06);
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    this.white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
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

  /** Accompaniment level (band voices and drums), 0..1. Default 0.7. */
  setBandVolume(v) {
    this.bandVolume = clamp(+v || 0, 0, 1.5);
    if (this.bandBus) {
      this.bandBus.gain.setTargetAtTime(this.bandVolume, this.now(), 0.02);
      this.drumBus.gain.setTargetAtTime(this.bandVolume, this.now(), 0.02);
    }
    if (this._output) this._bandChannelVolume();
  }

  // ---------- piano samples ----------
  /** Fetch and decode the piano samples (idempotent). Resolves true when the sampler is in use. */
  loadSamples() {
    if (this._sampleLoad) return this._sampleLoad;
    if (!this.sampleUrl) { this.sampleState = 'off'; return (this._sampleLoad = Promise.resolve(false)); }
    if (!this.ctx) this._build();
    this.sampleState = 'loading';
    this._sampleLoad = (async () => {
      try {
        const base = new URL(this.sampleUrl, location.href);
        if (!base.pathname.endsWith('/')) base.pathname += '/';
        const res = await fetch(new URL('manifest.json', base));
        if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
        const man = await res.json();
        const layers = man.layers.map((l) => ({ id: l.id, maxVel: +l.maxVel || 1, db: +l.db || 0, list: [] }));
        const jobs = [];
        const tune = man.tune || [];
        man.layers.forEach((l, li) => l.files.forEach((file, k) => jobs.push({ li, note: man.notes[k], tune: +tune[k] || 0, url: new URL(file, base) })));
        let next = 0;
        const worker = async () => {
          while (next < jobs.length) {
            const j = jobs[next++];
            try {
              const r = await fetch(j.url);
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const buffer = await this._decode(await r.arrayBuffer());
              layers[j.li].list.push({ note: j.note, tune: j.tune, buffer, offset: onset(buffer) });
            } catch { /* a missing file is covered by its neighbours */ }
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
        const usable = layers.filter((l) => l.list.length);
        if (!usable.length) throw new Error('no samples decoded');
        usable.forEach((l) => l.list.sort((a, b) => a.note - b.note));
        usable[usable.length - 1].maxVel = 1;
        this.samples = { layers: usable };
        this.sampleState = 'ready';
        this._emit();
        return true;
      } catch (err) {
        this.sampleState = 'failed';
        console.info('Piano samples unavailable; using the built-in piano synth.', (err && err.message) || err);
        return false;
      }
    })();
    return this._sampleLoad;
  }

  _decode(ab) {
    return new Promise((res, rej) => {
      const p = this.ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }

  _pickSample(midi, vel) {
    const layers = this.samples && this.samples.layers;
    if (!layers) return null;
    let li = layers.findIndex((l) => vel <= l.maxVel);
    if (li < 0) li = layers.length - 1;
    const order = layers.map((_, i) => i).sort((a, b) => Math.abs(a - li) - Math.abs(b - li));
    for (const i of order) {
      const L = layers[i];
      let best = null, bd = Infinity;
      for (const s of L.list) {
        const d = Math.abs(s.note - midi) - (s.note > midi ? 0.01 : 0);   // prefer shifting down
        if (d < bd) { bd = d; best = s; }
      }
      if (!best || bd > 7) continue;
      const lo = i > 0 ? layers[i - 1].maxVel : 0;
      const pos = clamp((vel - lo) / Math.max(0.05, L.maxVel - lo), 0, 1);
      return { ...best, layer: L, pos };
    }
    return null;
  }

  // ---------- player notes ----------
  noteOn(midi, vel = 0.75) {
    this.noteOff(midi, true);
    if (this._output) {
      this._out([0x90, midi, clamp(Math.round(vel * 127), 1, 127)]);
      this.held.set(midi, { midi: true });
      return;
    }
    if (!this.ready) return;
    const v = this._voice(midi, vel, this.now(), this._instrument, this.bus);
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
    if (this._output) this._out([0xb0, 64, down ? 127 : 0]);
    if (!down) {
      for (const m of [...this.sustained]) { this.sustained.delete(m); this.noteOff(m, true); }
    }
  }

  // ---------- scheduled notes (demos, accompaniment) ----------
  /**
   * Schedule a note. opts.instrument picks a voice ('grand' 'epiano' 'organ' 'bass' 'pad' 'choir' 'pluck';
   * anything else falls back to piano). A voice other than the player's own goes to the band bus
   * (override with opts.bus = 'band' | 'player').
   */
  play(midi, vel = 0.7, when, dur = 0.5, opts = {}) {
    const req = (opts && opts.instrument) || this._instrument;
    const inst = MIDI_MAP[req] ? req : 'grand';
    const band = opts && opts.bus ? opts.bus === 'band' : req !== this._instrument;
    const t = Math.max(when ?? this.now(), this.now());
    dur = Math.max(0.02, +dur || 0.5);
    if (this._output) {
      const [ch] = MIDI_MAP[inst];
      const v = clamp(Math.round(vel * 127), 1, 127);
      this._send([0x90 | ch, midi, v], t);
      this._send([0x80 | ch, midi, 0], t + dur);
      this.outNotes.add(ch * 128 + midi); this.outChannels.add(ch);
      return;
    }
    if (!this.ready) return;
    const v = this._voice(midi, vel, t, inst, band ? this.bandBus : this.bus);
    v.release(t + dur);
  }

  /** Schedule a drum hit: kick snare hat openhat crash tomlo tomhi rim clap. */
  drum(kind, when, vel = 0.8) {
    const note = GM_DRUMS[kind];
    if (!note) return;
    const t = Math.max(when ?? this.now(), this.now());
    if (this._output) {
      this._send([0x90 | DRUM_CH, note, clamp(Math.round(vel * 127), 1, 127)], t);
      this._send([0x80 | DRUM_CH, note, 0], t + 0.12);
      this.outNotes.add(DRUM_CH * 128 + note); this.outChannels.add(DRUM_CH);
      return;
    }
    if (!this.ready) return;
    this._steal(this.hits, MAX_HITS);
    const v = this._drum(kind, clamp(vel, 0.02, 1), t);
    if (v) this.hits.push(v);
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
    for (const v of this.hits) v.release(t, 0.02);
    this.live = []; this.hits = [];
    this._openHat = null;
    this.held.clear(); this.sustained.clear();
    if (this._output) this._panic(this._output);
  }

  /** Send program changes (and band channel volumes) to the MIDI output. Called when output is set. */
  applyOutputPrograms() {
    if (!this._output) return;
    this._out([0xc0, (MIDI_MAP[this._instrument] || MIDI_MAP.grand)[1]]);
    for (const inst of BAND) { const [ch, prog] = MIDI_MAP[inst]; this._out([0xc0 | ch, prog]); }
    this._bandChannelVolume();
  }

  _bandChannelVolume() {
    const cc = clamp(Math.round(this.bandVolume * 127), 0, 127);
    for (const ch of [...new Set(BAND.map((i) => MIDI_MAP[i][0])), DRUM_CH]) this._out([0xb0 | ch, 7, cc]);
  }

  _panic(port) {
    if (port.clear) try { port.clear(); } catch {}
    const send = (d) => { try { port.send(d); } catch {} };
    for (const k of this.outNotes) send([0x80 | (k >> 7), k & 127, 0]);
    for (const ch of new Set([0, ...this.outChannels])) send([0xb0 | ch, 123, 0]);
    this.outNotes.clear();
  }

  _perf(when) { return performance.now() + Math.max(0, when - this.now()) * 1000; }
  _out(data) { try { this._output.send(data); } catch {} }
  _send(data, when) { try { this._output.send(data, this._perf(when)); } catch {} }

  // ---------- voices ----------
  /**
   * Free a slot. Victim order: a voice already fading out (released longest ago), then the oldest
   * sounding voice; future voices only when nothing else is left (the one that would end first).
   */
  _steal(list, max) {
    const now = this.now();
    while (list.length >= max) {
      let i = -1, best = Infinity;
      list.forEach((v, k) => { if (v.off <= now && v.off < best) { best = v.off; i = k; } });
      if (i < 0) list.forEach((v, k) => { if (v.when <= now && v.when < best) { best = v.when; i = k; } });
      if (i < 0) list.forEach((v, k) => { if (v.off < best) { best = v.off; i = k; } });
      if (i < 0) i = 0;
      list.splice(i, 1)[0].release(now, 0.015);
    }
  }

  _voice(midi, vel, when, inst, dest) {
    this._steal(this.live, MAX_VOICES);
    vel = clamp(vel, 0.05, 1);
    let v;
    switch (inst) {
      case 'epiano': v = this._epiano(midi, vel, when, dest); break;
      case 'organ': v = this._organ(midi, vel, when, dest); break;
      case 'bass': v = this._bass(midi, vel, when, dest); break;
      case 'pad': v = this._pad(midi, vel, when, dest); break;
      case 'choir': v = this._choir(midi, vel, when, dest); break;
      case 'pluck': v = this._pluck(midi, vel, when, dest); break;
      default: v = (this.samples && this._sampled(midi, vel, when, dest)) || this._grand(midi, vel, when, dest);
    }
    v.inst = inst; v.note = midi;
    this.live.push(v);
    return v;
  }

  /** Stop nodes at endAt and tidy up when the first one ends. */
  _finish(nodes, out, endAt) {
    nodes.forEach((n) => { try { n.stop(endAt); } catch {} });
    nodes[0].onended = () => {
      try { out.disconnect(); } catch {}
      this.live = this.live.filter((x) => x.out !== out);
      this.hits = this.hits.filter((x) => x.out !== out);
    };
  }

  /** Build the voice handle: release(t, rt) fades out.gain from time t with time constant rt. */
  _wrap(out, nodes, when, endAt, rt0, minHold = 0.01) {
    const g = out.gain;
    const v = { out, when, off: Infinity };
    v.release = (t, rt = rt0) => {
      if (t < when - 0.002) {                 // never started: cancel outright
        hold(g, t); g.setValueAtTime(0, t);
        v.off = t;
        this._finish(nodes, out, Math.max(t, this.now()) + 0.01);
        return;
      }
      t = Math.max(t, when + minHold);
      hold(g, t);
      g.setTargetAtTime(0, t, rt);
      v.off = t;
      this._finish(nodes, out, t + rt * 8);
    };
    this._finish(nodes, out, endAt);
    return v;
  }

  /** Connect node to dest through a stereo panner (level-matched so the centre stays at unity). */
  _pan(node, dest, pan) {
    if (!pan || !this.ctx.createStereoPanner) { node.connect(dest); return; }
    if (!this._panIn) this._panIn = new WeakMap();
    let into = this._panIn.get(dest);
    if (!into) {
      into = this.ctx.createGain(); into.gain.value = Math.SQRT2; into.connect(dest);
      this._panIn.set(dest, into);
    }
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    node.connect(p); p.connect(into);
  }

  // ---------- grand piano ----------
  _sampled(midi, vel, when, dest) {
    const s = this._pickSample(midi, vel);
    if (!s) return null;
    const ctx = this.ctx, f = freq(midi);
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    const rate = 2 ** ((midi - s.note) / 12 + s.tune / 1200);
    src.playbackRate.value = rate;
    // velocity sets level, and brightness inside a layer, so dynamics stay continuous
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    const base = s.layer.maxVel < 1 ? 1600 * 2 ** (s.pos * 3) : 4500 * 2 ** (s.pos * 2.2);
    lp.frequency.value = Math.min(20000, Math.max(f * 3.5, base));
    const out = ctx.createGain();
    const gain = SAMPLE_GAIN * (0.15 + 0.85 * vel ** 1.5) / 10 ** (s.layer.db / 20);
    out.gain.setValueAtTime(gain, when);
    src.connect(lp); lp.connect(out);
    this._pan(out, dest, (midi - 64) / 44 * 0.22);
    src.start(when, s.offset);
    const len = (s.buffer.duration - s.offset) / rate;
    // dampers: slower in the bass; the top octaves have none and ring on
    const rt = midi >= 89 ? 0.6 : midi < 40 ? 0.12 : midi < 70 ? 0.085 : 0.065;
    return this._wrap(out, [src], when, when + len + 0.05, rt);
  }

  _grand(midi, vel, when, dest) {
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
    this._pan(out, dest, (midi - 64) / 44 * 0.22);
    o1.start(when); o2.start(when); nz.start(when);
    return this._wrap(out, [o1, o2], when, when + 0.2 + tau * 7, 0.07);
  }

  _epiano(midi, vel, when, dest) {
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
    out.connect(dest);
    [car, mod, tine].forEach((o) => o.start(when));
    return this._wrap(out, [car, mod, tine], when, when + tau * 7, 0.12);
  }

  _organ(midi, vel, when, dest) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain();
    const o = ctx.createOscillator(); o.setPeriodicWave(this.waves.organ); o.frequency.value = f;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
    const lg = ctx.createGain(); lg.gain.value = 3;
    lfo.connect(lg); lg.connect(o.detune);
    o.connect(out);
    const g = out.gain;
    g.setValueAtTime(0, when); g.linearRampToValueAtTime(0.16, when + 0.012);
    out.connect(dest);
    o.start(when); lfo.start(when);
    return this._wrap(out, [o, lfo], when, when + 600, 0.03, 0.02);
  }

  // ---------- band voices ----------
  /** Round electric/upright bass: triangle + filtered saw with a plucked filter envelope. */
  _bass(midi, vel, when, dest) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain();
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = f;
    for (const o of [o1, o2, o3]) {                  // the string starts a touch sharp
      o.detune.setValueAtTime(14, when); o.detune.setTargetAtTime(0, when, 0.025);
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(Math.min(2600, f * (5 + 9 * vel)), when);
    lp.frequency.setTargetAtTime(Math.max(160, f * 2), when + 0.004, 0.1);
    const g1 = ctx.createGain(); g1.gain.value = 0.55;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    o1.connect(g1); o2.connect(lp); lp.connect(g2); o3.connect(g3);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800; tone.Q.value = 0.5;
    g1.connect(tone); g2.connect(tone); g3.connect(tone); tone.connect(out);
    const peak = LEVEL.bass * vel;
    const g = out.gain;
    g.setValueAtTime(0, when);
    g.linearRampToValueAtTime(peak, when + 0.006);
    g.setTargetAtTime(peak * 0.55, when + 0.01, 0.3);
    g.setTargetAtTime(0, when + 0.9, 2.4);
    out.connect(dest);
    [o1, o2, o3].forEach((o) => o.start(when));
    return this._wrap(out, [o1, o2, o3], when, when + 0.9 + 2.4 * 7, 0.06, 0.02);
  }

  /** Warm string pad: two detuned saws spread in stereo, slow attack, gentle vibrato. */
  _pad(midi, vel, when, dest) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6 + Math.random() * 0.8;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, when); lg.gain.setTargetAtTime(7, when + 0.25, 0.4);
    lfo.connect(lg);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    const cut = Math.min(4200, 650 + f * 2.4);
    lp.frequency.setValueAtTime(cut * 0.55, when);
    lp.frequency.setTargetAtTime(cut, when, 0.5);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 130; hp.Q.value = 0.5;
    const oscs = [[-11, -0.5], [-3.5, 0.2], [4.5, -0.2], [12, 0.5]].map(([cents, pan]) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = cents;
      lg.connect(o.detune);
      this._pan(o, lp, pan);
      return o;
    });
    lp.connect(hp); hp.connect(out);
    const peak = LEVEL.pad * vel;
    const g = out.gain;
    g.setValueAtTime(0, when);
    g.setTargetAtTime(peak, when, 0.16);
    out.connect(dest);
    [...oscs, lfo].forEach((o) => o.start(when));
    return this._wrap(out, [...oscs, lfo], when, when + 120, 0.32, 0.05);
  }

  /** Soft "aah" choir: detuned saws through vowel formants, with delayed vibrato. */
  _choir(midi, vel, when, dest) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 0.6;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, when); lg.gain.setTargetAtTime(11, when + 0.35, 0.45);
    lfo.connect(lg);
    const src = ctx.createGain(); src.gain.value = 0.36;
    const oscs = [-9, 2, 11].map((c) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = c;
      lg.connect(o.detune); o.connect(src);
      return o;
    });
    const k = midi >= 60 ? 1.1 : 1;                   // higher voices, slightly higher formants
    const sum = ctx.createGain();
    for (const [fc, q, a] of [[730 * k, 6, 1], [1090 * k, 7, 0.55], [2450 * k, 9, 0.22]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = q;
      const ga = ctx.createGain(); ga.gain.value = a * 2.2;
      src.connect(bp); bp.connect(ga); ga.connect(sum);
    }
    const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 420; body.Q.value = 0.4;
    const bg = ctx.createGain(); bg.gain.value = 0.35;
    src.connect(body); body.connect(bg); bg.connect(sum);
    sum.connect(out);
    const peak = LEVEL.choir * vel;
    const g = out.gain;
    g.setValueAtTime(0, when);
    g.setTargetAtTime(peak, when, 0.2);
    this._pan(out, dest, -0.12);
    [...oscs, lfo].forEach((o) => o.start(when));
    return this._wrap(out, [...oscs, lfo], when, when + 120, 0.3, 0.05);
  }

  /** Light guitar/harp pluck: a Karplus-Strong string rendered once per pitch. */
  _pluck(midi, vel, when, dest) {
    const ctx = this.ctx, f = freq(midi);
    const src = ctx.createBufferSource();
    src.buffer = this._pluckBuffer(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.value = Math.min(9000, Math.max(f * 4, 1100 + 3800 * vel));
    const out = ctx.createGain();
    out.gain.setValueAtTime(LEVEL.pluck * vel, when);
    src.connect(lp); lp.connect(out);
    this._pan(out, dest, 0.22);
    src.start(when);
    return this._wrap(out, [src], when, when + src.buffer.duration + 0.02, 0.1);
  }

  _pluckBuffer(midi) {
    const hit = this.plucks.get(midi);
    if (hit) return hit;
    const sr = this.ctx.sampleRate, f = freq(midi);
    const dur = clamp(2.4 * 2 ** ((48 - midi) / 24), 0.8, 3);
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const y = buf.getChannelData(0);
    const P = sr / f, d = P - 0.5;             // the two-point average adds half a sample of delay
    const t60 = clamp(2 * 2 ** ((45 - midi) / 20), 0.45, 3.5);
    const loss = 10 ** (-3 / (t60 * f));
    // excitation: one period of soft noise, minus a delayed copy (plucked a fifth of the way along)
    const L = Math.ceil(P), raw = new Float32Array(L), exc = new Float32Array(L);
    let lpv = 0;
    for (let i = 0; i < L; i++) { lpv += 0.32 * ((Math.random() * 2 - 1) - lpv); raw[i] = lpv; }
    const pick = Math.max(1, Math.round(P * 0.2));
    for (let i = 0; i < L; i++) exc[i] = raw[i] - (i >= pick ? raw[i - pick] : 0);
    const at = (p) => { const i0 = Math.floor(p), fr = p - i0; return i0 < 0 ? 0 : y[i0] + ((y[i0 + 1] || 0) - y[i0]) * fr; };
    let pk = 0;
    for (let i = 0; i < n; i++) {
      const p = i - d;
      const fb = p >= 1 ? loss * 0.5 * (at(p) + at(p - 1)) : 0;
      y[i] = (i < L ? exc[i] : 0) + fb;
      const a = Math.abs(y[i]); if (a > pk) pk = a;
    }
    // DC blocker, normalise, fade the tail
    let px = 0, py = 0;
    const fade = Math.floor(n * 0.25), norm = pk > 0 ? 0.9 / pk : 1;
    for (let i = 0; i < n; i++) {
      const x = y[i]; py = x - px + 0.995 * py; px = x;
      y[i] = py * norm * (i > n - fade ? (n - i) / fade : 1);
    }
    this.plucks.set(midi, buf);
    return buf;
  }

  // ---------- drums ----------
  _noise(when) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.white; s.loop = true;
    s.start(when, Math.random() * 0.9);
    return s;
  }

  _drum(kind, vel, when) {
    const ctx = this.ctx;
    const amp = DRUM_LEVEL[kind] * vel ** 1.3;
    const out = ctx.createGain();
    const g = out.gain;
    const nodes = [];
    let end = 0.5, rt = 0.03, pan = 0;
    const filt = (type, fq, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fq; b.Q.value = q; return b; };
    const env = (gain, attack, tau) => {
      const e = ctx.createGain(); e.gain.setValueAtTime(0, when);
      e.gain.linearRampToValueAtTime(gain, when + attack);
      e.gain.setTargetAtTime(0, when + attack, tau);
      return e;
    };
    const chain = (...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; };
    const tone = (type, f0, f1, sweep) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, when);
      o.frequency.exponentialRampToValueAtTime(f1, when + sweep);
      o.start(when); nodes.push(o);
      return o;
    };
    const noise = () => { const s = this._noise(when); nodes.push(s); return s; };
    g.value = amp;
    switch (kind) {
      case 'kick': {
        chain(tone('sine', 150, 48, 0.09), env(1, 0.002, 0.13), out);
        chain(noise(), filt('lowpass', 2200), env(0.12, 0.001, 0.005), out);
        end = 1.1; break;
      }
      case 'snare': {
        chain(tone('triangle', 200, 165, 0.06), env(0.55, 0.001, 0.05), out);
        chain(noise(), filt('highpass', 1000), filt('lowpass', 6200), env(0.75, 0.001, 0.07), out);
        end = 0.5; break;
      }
      case 'hat':
      case 'openhat': {
        const open = kind === 'openhat';
        if (this._openHat) { this._openHat.release(when, 0.015); this._openHat = null; }
        chain(noise(), filt('highpass', 7000), filt('lowpass', 12500), env(1, 0.001, open ? 0.17 : 0.022), out);
        end = open ? 1.1 : 0.18; pan = 0.22; break;
      }
      case 'crash': {
        chain(noise(), filt('highpass', 3800), filt('lowpass', 11000), env(1, 0.003, 0.6), out);
        chain(noise(), filt('bandpass', 5200, 0.8), env(0.4, 0.002, 0.25), out);
        end = 3.6; rt = 0.12; pan = -0.25; break;
      }
      case 'tomlo':
      case 'tomhi': {
        const hi = kind === 'tomhi';
        chain(tone('sine', hi ? 175 : 112, hi ? 125 : 78, 0.22), env(1, 0.002, hi ? 0.13 : 0.17), out);
        chain(noise(), filt('lowpass', 1600), env(0.15, 0.001, 0.01), out);
        end = 1.3; pan = hi ? 0.18 : -0.18; break;
      }
      case 'rim': {
        chain(tone('triangle', 560, 500, 0.02), env(0.8, 0.0005, 0.012), out);
        chain(noise(), filt('bandpass', 2600, 2), env(0.7, 0.0005, 0.007), out);
        end = 0.12; pan = 0.1; break;
      }
      case 'clap': {
        const e = ctx.createGain();
        e.gain.setValueAtTime(0, when);
        [0, 0.011, 0.022].forEach((dt, i) => {
          e.gain.setValueAtTime(1 - i * 0.12, when + dt);
          e.gain.setTargetAtTime(0.05, when + dt + 0.001, 0.004);
        });
        e.gain.setValueAtTime(0.9, when + 0.033);
        e.gain.setTargetAtTime(0, when + 0.034, 0.075);
        chain(noise(), filt('bandpass', 1150, 1.1), filt('highpass', 500), e, out);
        end = 0.6; break;
      }
      default: return null;
    }
    g.setValueAtTime(amp, when + end * 0.7);
    g.linearRampToValueAtTime(0, when + end);
    this._pan(out, this.drumBus, pan);
    const v = this._wrap(out, nodes, when, when + end + 0.01, rt, 0.001);
    if (kind === 'openhat') this._openHat = v;
    return v;
  }
}

/** Seconds to skip at the start of a decoded sample (codec padding before the hammer strike). */
function onset(buf) {
  const d = buf.getChannelData(0), n = Math.min(d.length, Math.floor(buf.sampleRate * 0.25));
  let pk = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
  let i = 0;
  while (i < n && Math.abs(d[i]) < pk * 0.02) i++;
  return Math.max(0, i / buf.sampleRate - 0.0015);
}
