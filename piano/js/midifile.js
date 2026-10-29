// Standard MIDI File (SMF) reading and writing. No dependencies; runs in browsers and node.
// All times are in beats (quarter notes); velocities are 0..1.

export const PPQ = 480;

/** General MIDI program written for each studio instrument. */
export const INSTRUMENT_PROGRAMS = { grand: 0, epiano: 4, organ: 16, bass: 33, pad: 89, choir: 52, pluck: 25 };

/** Closest studio instrument for a General MIDI program number (0-127). */
export function instrumentForProgram(p = 0) {
  if (p <= 3) return 'grand';
  if (p === 4 || p === 5 || p === 7 || p === 11) return 'epiano';
  if (p <= 15) return 'pluck';                 // harpsichord, mallets, bells
  if (p <= 23) return 'organ';                 // organs, accordion, harmonica
  if (p <= 31) return 'pluck';                 // guitars
  if (p <= 39) return 'bass';
  if (p === 45 || p === 46) return 'pluck';    // pizzicato, harp
  if (p === 47) return 'bass';                 // timpani
  if (p >= 52 && p <= 54) return 'choir';
  if (p <= 55) return 'pad';                   // strings, ensembles
  if (p <= 87) return 'organ';                 // brass, reeds, pipes, leads
  if (p <= 103) return 'pad';                  // synth pads and effects
  if (p <= 108) return 'pluck';                // sitar, banjo, koto, kalimba
  if (p <= 111) return 'organ';                // bagpipe, fiddle, shanai
  if (p <= 119) return 'pluck';                // percussive
  return 'pad';
}

// ---------------------------------------------------------------- writing

const utf8 = (s) => [...new TextEncoder().encode(String(s ?? ''))];
const vel7 = (v) => Math.max(1, Math.min(127, Math.round((v ?? 0.75) * 127)));

function vlq(n) {
  n = Math.max(0, Math.floor(n));
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

function chunk(id, body) {
  const n = body.length;
  return [...id].map((c) => c.charCodeAt(0)).concat([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], body);
}

function trackBytes(events) {
  // stable sort: tick, then order class (offs 0 < controllers 1 < ons 2), then insertion order
  events.forEach((e, k) => { e.k = k; });
  events.sort((a, b) => a.t - b.t || a.o - b.o || a.k - b.k);
  const body = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.t - last), ...e.d);
    last = e.t;
  }
  body.push(...vlq(0), 0xff, 0x2f, 0x00);
  return chunk('MTrk', body);
}

/**
 * Build a format-1 SMF.
 * song: { name, bpm, time:[n,d], ppq?, tracks:[{ name, channel, program (null = none), volume (0..1, optional),
 *         notes:[{t, d, midi, vel}], pedal:[[downBeat, upBeat], ...] }] }
 * Returns a Uint8Array.
 */
export function writeMidi(song) {
  const ppq = song.ppq || PPQ;
  const tk = (b) => Math.max(0, Math.round(b * ppq));
  const out = [];
  const [num, den] = song.time || [4, 4];
  const us = Math.round(60e6 / (song.bpm || 120));
  const cond = [];
  if (song.name) { const s = utf8(song.name); cond.push({ t: 0, o: 0, d: [0xff, 0x03, ...vlq(s.length), ...s] }); }
  cond.push({ t: 0, o: 0, d: [0xff, 0x58, 4, num & 255, Math.max(0, Math.round(Math.log2(den))), 24, 8] });
  cond.push({ t: 0, o: 0, d: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
  out.push(trackBytes(cond));
  for (const tr of song.tracks || []) {
    const ch = (tr.channel ?? 0) & 15;
    const ev = [];
    const nm = utf8(tr.name || '');
    ev.push({ t: 0, o: -3, d: [0xff, 0x03, ...vlq(nm.length), ...nm] });
    if (tr.program !== null && tr.program !== undefined) ev.push({ t: 0, o: -2, d: [0xc0 | ch, tr.program & 127] });
    if (tr.volume !== undefined && tr.volume !== null) {
      ev.push({ t: 0, o: -1, d: [0xb0 | ch, 7, Math.max(0, Math.min(127, Math.round(tr.volume * 127)))] });
    }
    // Same-pitch notes on one channel can't overlap in MIDI: end the earlier one where the next starts.
    const spans = (tr.notes || []).map((n) => { const a = tk(n.t); return { a, b: a + Math.round(n.d * ppq), m: n.midi & 127, v: vel7(n.vel) }; })
      .sort((x, y) => x.a - y.a || x.m - y.m);
    const lastBy = new Map();
    const keep = [];
    for (const s of spans) {
      s.b = Math.max(s.a + 1, s.b);
      const prev = lastBy.get(s.m);
      if (prev && prev.b > s.a) {
        if (prev.a === s.a) { prev.b = Math.max(prev.b, s.b); prev.v = Math.max(prev.v, s.v); continue; }
        prev.b = s.a;
      }
      lastBy.set(s.m, s);
      keep.push(s);
    }
    for (const s of keep) {
      ev.push({ t: s.a, o: 2, d: [0x90 | ch, s.m, s.v] });
      ev.push({ t: s.b, o: 0, d: [0x80 | ch, s.m, 64] });
    }
    for (const [a, b] of tr.pedal || []) {
      const ta = tk(a), tb = Math.max(ta, tk(b));
      ev.push({ t: ta, o: 1, d: [0xb0 | ch, 64, 127] });
      ev.push({ t: tb, o: 1, d: [0xb0 | ch, 64, 0] });
    }
    out.push(trackBytes(ev));
  }
  const ntr = out.length;
  const head = chunk('MThd', [0, 1, (ntr >> 8) & 255, ntr & 255, (ppq >> 8) & 255, ppq & 255]);
  const bytes = head.concat(...out);
  return Uint8Array.from(bytes);
}

// ---------------------------------------------------------------- reading

/**
 * Parse an SMF (format 0, 1 or 2). Returns
 * { format, ppq, bpm, time:[n,d], name, tempos:[{t,bpm}],
 *   tracks:[{ name, channel, program, volume, drums, notes:[{t,d,midi,vel}], pedal:[[a,b]] }] }
 * One entry in `tracks` per (track chunk, channel) pair that carries any channel data, in order of appearance.
 * Throws on data that is not a MIDI file.
 */
export function readMidi(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  let p = 0;
  const u8 = () => { if (p >= buf.length) throw new Error('Unexpected end of file'); return buf[p++]; };
  const u16 = () => (u8() << 8) | u8();
  const u32 = () => ((u8() << 24) >>> 0) + (u8() << 16) + (u8() << 8) + u8();
  const id = () => String.fromCharCode(u8(), u8(), u8(), u8());
  const readVlq = () => { let n = 0, b; let guard = 0; do { b = u8(); n = (n << 7) | (b & 0x7f); } while (b & 0x80 && ++guard < 4); return n; };
  const text = (bytes) => { try { return new TextDecoder('utf-8').decode(Uint8Array.from(bytes)).replace(/\0+$/, '').trim(); } catch { return ''; } };

  if (buf.length < 14) throw new Error('Not a MIDI file');
  // allow a RIFF (RMID) wrapper
  if (id() === 'RIFF') {
    p = 12;
    while (p + 8 <= buf.length) {
      const cid = id(), len = u32() >>> 0;
      if (cid === 'data') break;
      p += len + (len & 1);
    }
  } else p = 0;
  if (id() !== 'MThd') throw new Error('Not a MIDI file');
  const hlen = u32();
  const hstart = p;
  const format = u16(), ntrks = u16(), div = u16();
  p = hstart + hlen;
  let ppq = div;
  if (div & 0x8000) {
    const fps = 256 - (div >> 8), tpf = div & 0xff;
    ppq = Math.max(1, Math.round((fps * tpf) / 2));   // assume 120 bpm for SMPTE timing
  }
  ppq = ppq || PPQ;

  const parts = [];
  const tempos = [];
  let time = null, songName = '';
  for (let ti = 0; ti < ntrks && p + 8 <= buf.length; ti++) {
    const cid = id(), len = u32();
    const end = Math.min(buf.length, p + len);
    if (cid !== 'MTrk') { p = end; ti--; continue; }
    let tick = 0, status = 0, trackName = '';
    const byCh = new Map();
    const part = (ch) => {
      if (!byCh.has(ch)) byCh.set(ch, { ch, program: null, volume: null, notes: [], pedal: [], open: new Map(), pedalAt: null, first: tick });
      return byCh.get(ch);
    };
    const noteOff = (pt, m) => {
      const q = pt.open.get(m);
      if (!q || !q.length) return;
      const s = q.shift();
      pt.notes.push({ t: s.t, d: Math.max(1, tick - s.t), midi: m, vel: s.vel });
    };
    while (p < end) {
      tick += readVlq();
      let b = buf[p];
      if (b & 0x80) { p++; } else if (!status) { p++; continue; } else b = status;
      if (b === 0xff) {
        const type = u8(), l = readVlq();
        const data = buf.subarray(p, p + l); p += l;
        if (type === 0x2f) break;
        if (type === 0x03 && !trackName) trackName = text(data);
        else if (type === 0x51 && l >= 3) tempos.push({ t: tick, us: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x58 && l >= 2 && !time) time = [data[0], 2 ** data[1]];
        status = 0;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) { const l = readVlq(); p += l; status = 0; continue; }
      if (b >= 0xf8) continue;           // real-time bytes
      if (b > 0xf0) { status = 0; continue; }
      status = b;
      const cmd = b & 0xf0, ch = b & 0x0f;
      const d1 = u8() & 0x7f;
      const d2 = cmd === 0xc0 || cmd === 0xd0 ? 0 : u8() & 0x7f;
      if (cmd === 0x90 && d2 > 0) {
        const pt = part(ch);
        if (!pt.open.has(d1)) pt.open.set(d1, []);
        pt.open.get(d1).push({ t: tick, vel: d2 });
      } else if (cmd === 0x80 || cmd === 0x90) noteOff(part(ch), d1);
      else if (cmd === 0xb0) {
        const pt = part(ch);
        if (d1 === 64) {
          const down = d2 >= 64;
          if (down && pt.pedalAt === null) pt.pedalAt = tick;
          else if (!down && pt.pedalAt !== null) { pt.pedal.push([pt.pedalAt, tick]); pt.pedalAt = null; }
        } else if (d1 === 7 && pt.volume === null) pt.volume = d2 / 127;
        else if (d1 === 120 || d1 === 123) for (const m of [...pt.open.keys()]) while (pt.open.get(m).length) noteOff(pt, m);
      } else if (cmd === 0xc0) { const pt = part(ch); if (pt.program === null || !pt.notes.length) pt.program = d1; }
    }
    p = end;
    for (const pt of byCh.values()) {
      for (const [m, q] of pt.open) while (q.length) { const s = q.shift(); pt.notes.push({ t: s.t, d: Math.max(1, tick - s.t), midi: m, vel: s.vel }); }
      if (pt.pedalAt !== null) pt.pedal.push([pt.pedalAt, Math.max(pt.pedalAt, tick)]);
    }
    const chans = [...byCh.values()].filter((pt) => pt.notes.length || pt.pedal.length || pt.program !== null);
    if (ti === 0 && format === 1 && !chans.some((pt) => pt.notes.length)) songName = trackName;
    const withNotes = chans.filter((pt) => pt.notes.length);
    for (const pt of withNotes) {
      pt.notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
      parts.push({
        name: trackName && withNotes.length > 1 ? `${trackName} ${pt.ch + 1}` : trackName,
        channel: pt.ch,
        program: pt.program ?? 0,
        volume: pt.volume,
        drums: pt.ch === 9,
        notes: pt.notes.map((n) => ({ t: n.t / ppq, d: n.d / ppq, midi: n.midi, vel: n.vel / 127 })),
        pedal: pt.pedal.map(([a, b]) => [a / ppq, b / ppq]),
      });
    }
  }
  tempos.sort((a, b) => a.t - b.t);
  const bpm = tempos.length ? 60e6 / tempos[0].us : 120;
  return {
    format, ppq, bpm, time: time || [4, 4], name: songName,
    tempos: tempos.map((x) => ({ t: x.t / ppq, bpm: 60e6 / x.us })),
    tracks: parts,
  };
}
