// Backing band: turns a song's chord chart into bass, drums, pad and chord stabs.
import { pc } from './theory.js';

const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], add9: [0, 4, 7, 14], 5: [0, 7], m7b5: [0, 3, 6, 10],
};
const CHORD = /^([A-G])([#b]?)(maj7|m7b5|m7|m6|m|dim7|dim|aug|sus2|sus4|add9|7|6|5)?(?:\/([A-G])([#b]?))?$/;

export function parseChord(sym) {
  const m = CHORD.exec(sym);
  if (!m) return null;
  const acc = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  const root = pc(ROOTS[m[1]] + acc(m[2]));
  const ivs = QUALITY[m[3] || ''];
  const bass = m[4] ? pc(ROOTS[m[4]] + acc(m[5])) : root;
  return { root, bass, ivs, minor: ivs[1] === 3, sym };
}

/** Split a chord chart into timed segments: [{ t, d, chord }]. */
export function chartSegments(score) {
  if (!score.chords) return [];
  const bpb = score.bpb || 4;
  const bars = score.chords.split('|').map((s) => s.trim()).filter(Boolean);
  const segs = [];
  bars.forEach((bar, bi) => {
    const start = (score.pickup || 0) + bi * bpb;
    const toks = bar.split(/\s+/).map((tok) => {
      const [sym, beats] = tok.split(':');
      return { sym, beats: beats ? +beats : null };
    });
    const fixed = toks.reduce((a, t) => a + (t.beats || 0), 0);
    const free = toks.filter((t) => !t.beats).length;
    const each = free ? (bpb - fixed) / free : 0;
    let t = start;
    for (const tok of toks) {
      const d = tok.beats || each;
      const chord = tok.sym === 'N.C.' ? null : parseChord(tok.sym);
      if (d > 0) segs.push({ t, d, chord });
      t += d;
    }
  });
  return segs;
}

const near = (p, lo) => lo + ((p - lo) % 12 + 12) % 12; // first pitch with class p at or above lo

function voicing(chord, lo = 55) {
  const out = chord.ivs.map((iv) => near(pc(chord.root + iv), lo));
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Generate band events for a score.
 * Returns [{ t, d, midi, vel, instrument } | { t, drum, vel }], sorted by t (beats).
 */
export function generateBacking(score, { style = score.style || 'folk' } = {}) {
  const segs = chartSegments(score);
  if (!segs.length || style === 'none') return [];
  const time = score.time || [4, 4];
  const bpb = score.bpb || 4;
  const compound = time[1] === 8 && time[0] % 3 === 0;
  const pulse = time[1] === 8 ? 1.5 : 1;
  const P = Math.max(1, Math.round(bpb / pulse));
  const ev = [];
  const chordAt = (t) => { for (const s of segs) if (t >= s.t - 1e-6 && t < s.t + s.d - 1e-6) return s; return null; };
  const bassNote = (ch, which = 'R') => {
    const base = which === 'F' ? pc(ch.root + 7) : which === '3' ? pc(ch.root + ch.ivs[1]) : which === '6' ? pc(ch.root + 9) : ch.bass;
    return near(base, 36);
  };
  const note = (t, d, midi, vel, instrument) => ev.push({ t, d, midi, vel, instrument });
  const stab = (t, d, ch, vel = 0.34, power = false) => {
    const notes = power ? [near(ch.root, 48), near(ch.root, 48) + 7] : voicing(ch, 53);
    notes.forEach((m) => note(t, d, m, vel, 'pluck'));
  };
  const drum = (t, kind, vel) => ev.push({ t, drum: kind, vel });

  // sustained layers per chord segment
  for (const s of segs) {
    if (!s.chord) continue;
    if (['ballad', 'classical', 'epic'].includes(style)) voicing(s.chord, 55).forEach((m) => note(s.t, s.d, m, 0.28, 'pad'));
    if (style === 'chant') {
      note(s.t, s.d, near(s.chord.root, 48), 0.3, 'choir');
      note(s.t, s.d, near(s.chord.root, 48) + 7, 0.26, 'choir');
      note(s.t, s.d, near(s.chord.root, 36), 0.35, 'bass');
    }
    if (style === 'classical' || style === 'ballad') note(s.t, s.d, bassNote(s.chord), 0.42, 'bass');
  }

  const end = score.length;
  const first = score.pickup || 0;
  let bar = 0;
  for (let b0 = first; b0 < end - 1e-6; b0 += bpb, bar++) {
    for (let p = 0; p < P; p++) {
      const t = b0 + p * pulse;
      if (t >= end - 1e-6) break;
      const seg = chordAt(t);
      const ch = seg && seg.chord;
      const strong = p === 0 || (P === 4 && p === 2) || (compound && P === 4 && p === 2);
      switch (style) {
        case 'march':
          if (ch) { if (p % 2 === 0) note(t, pulse * 0.9, bassNote(ch, p % 4 === 0 ? 'R' : 'F'), 0.55, 'bass'); else stab(t, pulse * 0.5, ch, 0.3); }
          drum(t, p % 2 === 0 ? 'kick' : 'snare', p % 2 === 0 ? 0.55 : 0.4);
          if (p === P - 1 && bar % 4 === 3) drum(t + pulse / 2, 'snare', 0.3);
          break;
        case 'waltz':
          if (ch) { if (p === 0) note(t, pulse * 0.95, bassNote(ch, bar % 2 ? 'F' : 'R'), 0.5, 'bass'); else stab(t, pulse * 0.6, ch, 0.28); }
          if (p === 0) drum(t, 'kick', 0.35); else drum(t, 'hat', 0.18);
          break;
        case 'folk':
          if (ch) {
            if (p === 0 || (P >= 4 && p === 2)) note(t, pulse * 0.95, bassNote(ch, p === 0 ? 'R' : 'F'), 0.5, 'bass');
            stab(t, pulse * 0.45, ch, strong ? 0.3 : 0.24);
          }
          drum(t, p === 0 ? 'kick' : 'hat', p === 0 ? 0.35 : 0.16);
          break;
        case 'ballad':
          if (p === 0) drum(t, 'kick', 0.22);
          break;
        case 'rock':
          if (ch) {
            for (let k = 0; k < 2; k++) note(t + (k * pulse) / 2, pulse / 2 * 0.85, bassNote(ch), 0.55, 'bass');
            if (p === 0) stab(t, pulse * 1.8, ch, 0.36, true);
          }
          if (p % 2 === 0) drum(t, 'kick', 0.65); else drum(t, 'snare', 0.55);
          if (p === P - 1) drum(t + pulse / 2, 'kick', 0.45);
          drum(t, 'hat', 0.22); drum(t + pulse / 2, 'hat', 0.16);
          if (p === 0 && bar % 4 === 0) drum(t, 'crash', 0.35);
          break;
        case 'swing':
        case 'blues':
          if (ch) {
            const walk = ['R', '3', 'F', '6'][p % 4];
            note(t, pulse * 0.9, bassNote(ch, walk), 0.5, 'bass');
            if (p % 2 === 1) stab(t, pulse * 0.4, ch, 0.28);
          }
          drum(t, 'hat', 0.24);
          if (p % 2 === 1) drum(t, 'snare', 0.22); else drum(t, 'kick', 0.3);
          break;
        case 'rag':
          if (ch) { if (p % 2 === 0) note(t, pulse * 0.8, bassNote(ch, p % 4 === 0 ? 'R' : 'F'), 0.5, 'bass'); else stab(t, pulse * 0.45, ch, 0.3); }
          break;
        case 'shanty':
          if (ch) {
            if (p === 0 || p === Math.floor(P / 2)) note(t, pulse * 0.9, bassNote(ch, p === 0 ? 'R' : 'F'), 0.55, 'bass');
            else stab(t, pulse * 0.45, ch, 0.3);
          }
          if (p === 0 || p === Math.floor(P / 2)) drum(t, 'kick', 0.6); else drum(t, 'clap', 0.4);
          if (P <= 2) drum(t + pulse / 2, 'clap', 0.3);
          break;
        case 'chant':
          if (p === 0) drum(t, 'tomlo', 0.35);
          break;
        case 'epic':
          if (ch) for (let k = 0; k < 2; k++) note(t + (k * pulse) / 2, pulse / 2 * 0.8, bassNote(ch), k ? 0.4 : 0.55, 'bass');
          if (p === 0) { drum(t, 'kick', 0.6); drum(t, 'tomlo', 0.5); }
          else if (strong) drum(t, 'tomlo', 0.45);
          else drum(t, 'tomhi', 0.3);
          if (p === 0 && bar % 4 === 0) drum(t, 'crash', 0.3);
          break;
        default: // 'classical' and anything else: no rhythm section
          break;
      }
    }
  }
  return ev.filter((e) => e.t < end - 1e-6).sort((a, b) => a.t - b.t);
}
