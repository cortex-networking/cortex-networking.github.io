// Flashcards (theory review) and QuizRunner, the multiple-choice engine that lessons reuse.
import { GameBase } from './gamebase.js';
import { h, segmented } from './ui.js';
import { parseVoice, buildScore, spell, noteName, pc } from './theory.js';
import { Staff } from './staff.js';

// ======================================================================
// Shared helpers
// ======================================================================
const NS = 'http://www.w3.org/2000/svg';
const G = {
  whole: '', half: '', black: '', dot: '', flag8: '',
  gClef: '', fClef: '', perc: '',
  flat: '', natural: '', sharp: '',
  rest: { 4: '', 2: '', 1: '', 0.5: '' },
  dyn: { pp: '', p: '', mp: '', mf: '', f: '', ff: '' },
  repeatEnd: '', accent: '', fermata: '',
  digits: (n) => String(n).split('').map((c) => String.fromCharCode(0xe080 + +c)).join(''),
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const footOf = (app) => app.ui.footEl || document.getElementById('foot');
const num = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
/** Level picker: one scrollable row on narrow boards, with the chosen level in view. */

function gxSeg(foot) {
  const seg = foot.querySelector('.seg');
  if (!seg) return;
  seg.classList.add('gx-seg');
  const on = seg.querySelector('[aria-checked="true"]');
  if (on && seg.scrollWidth > seg.clientWidth) seg.scrollLeft = on.offsetLeft - seg.clientWidth / 2 + on.clientWidth / 2;
}

function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, num(v));
  if (parent) parent.append(n);
  return n;
}
function txt(parent, str, x, y, cls, size) {
  const t = s('text', { x, y, class: cls, 'font-size': size }, parent);
  t.textContent = str;
  return t;
}
const glyph = (parent, ch, x, y, cls = 'glyph', size = 4) => txt(parent, ch, x, y, cls, size);

const baseDur = (d) => (d >= 4 - 1e-6 ? 4 : d >= 2 - 1e-6 ? 2 : d >= 1 - 1e-6 ? 1 : 0.5);
const isDotted = (d) => Math.abs(d - baseDur(d) * 1.5) < 1e-6;

/**
 * Draw a rhythm on a one-line staff (units: staff spaces). Stems up, eighths beamed by beat,
 * ties, dots, rests, and counts ("1 + 2 +") under the line.
 * o: { x0, ppb, y, len, bpb = 4, counts = true, countDy = 2.9 }
 * Returns { root, notes: [{ e, g, x, xc }], counts: [{ t, el }] } with notes in event order.
 */
export function drawRhythm(parent, evs, o) {
  const { x0, ppb, y } = o;
  const bpb = o.bpb || 4;
  const STEM = 3.3;
  const root = s('g', { class: 'rh' }, parent);
  const plainE = (e) => e && !e.rest && Math.abs(e.d - 0.5) < 1e-6;
  const beamed = new Map();
  for (let i = 0; i < evs.length - 1; i++) {
    const a = evs[i], b = evs[i + 1];
    if (plainE(a) && plainE(b) && Math.abs(a.t % 1) < 1e-6 && Math.abs(a.t + 0.5 - b.t) < 1e-6) { beamed.set(a, b); beamed.set(b, a); i++; }
  }
  const notes = [];
  for (const e of evs) {
    const x = x0 + e.t * ppb;
    const g = s('g', { class: `rh-ev${e.rest ? ' rh-rest' : ''}` }, root);
    const base = baseDur(e.d);
    if (e.rest) {
      glyph(g, G.rest[base], base === 4 ? x + Math.max(0, e.d * ppb / 2 - 1.2) : x, y);
    } else {
      const head = base === 4 ? G.whole : base === 2 ? G.half : G.black;
      const hw = base === 4 ? 1.688 : 1.18;
      glyph(g, head, x, y);
      if (base < 4) {
        const sx = x + hw - 0.06;
        s('line', { class: 'rh-stem', x1: sx, x2: sx, y1: y - 0.17, y2: y - STEM }, g);
        if (base < 1 && !beamed.has(e)) glyph(g, G.flag8, sx - 0.06, y - STEM);
      }
      if (isDotted(e.d)) glyph(g, G.dot, x + hw + 0.3, y - 0.5);
    }
    notes.push({ e, g, x, xc: x + 0.59 });
  }
  for (const [a, b] of beamed) {
    if (b.t < a.t) continue;
    const x1 = x0 + a.t * ppb + 1.06, x2 = x0 + b.t * ppb + 1.18;
    s('polygon', { class: 'rh-beam', points: `${num(x1)},${num(y - STEM)} ${num(x2)},${num(y - STEM)} ${num(x2)},${num(y - STEM + 0.5)} ${num(x1)},${num(y - STEM + 0.5)}` }, root);
  }
  for (const e of evs) {
    if (!e.tieTo) continue;
    const hw = baseDur(e.d) === 4 ? 1.688 : 1.18;
    const xs = x0 + e.t * ppb + hw + 0.12, xe = x0 + e.tieTo.t * ppb - 0.12;
    const ys = y + 0.65, hg = Math.min(0.9, 0.3 + 0.04 * (xe - xs)), mx = (xs + xe) / 2;
    s('path', { class: 'rh-tie', d: `M${num(xs)},${num(ys)} Q${num(mx)},${num(ys + hg * 2)} ${num(xe)},${num(ys)} Q${num(mx)},${num(ys + (hg - 0.22) * 2)} ${num(xs)},${num(ys)} Z` }, root);
  }
  const counts = [];
  if (o.counts !== false) {
    const len = o.len ?? Math.max(...evs.map((e) => e.t + e.d));
    const starts = new Set(evs.filter((e) => !e.rest && !e.tiedFrom).map((e) => Math.round(e.t * 2)));
    const cy = y + (o.countDy ?? 2.9);
    const gC = s('g', { class: 'rh-counts' }, root);
    for (let b = 0; b < len - 1e-6; b++) {
      const on = starts.has(b * 2);
      const rest = !on && evs.some((e) => e.rest && e.t <= b + 1e-6 && b < e.t + e.d - 1e-6);
      counts.push({ t: b, el: txt(gC, String((b % bpb) + 1), x0 + b * ppb + 0.59, cy, `rh-count ${on ? 'on' : rest ? 'rest' : 'held'}`, o.countSize || 1.45) });
    }
    for (const e of evs) {
      if (e.rest || e.tiedFrom || Math.abs((e.t % 1) - 0.5) > 1e-6) continue;
      counts.push({ t: e.t, el: txt(gC, '+', x0 + e.t * ppb + 0.59, cy, 'rh-count on plus', o.countSize || 1.45) });
    }
    counts.sort((a, b) => a.t - b.t);
  }
  return { root, notes, counts };
}

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LET = 'CDEFGAB';
const IV = { M3: [4, 2], m3: [3, 2], P5: [7, 4], m7: [10, 6], R: [0, 0] };
const QUAL = {
  maj: { ivs: ['R', 'M3', 'P5'], suffix: '', long: 'major' },
  min: { ivs: ['R', 'm3', 'P5'], suffix: 'm', long: 'minor' },
  dom7: { ivs: ['R', 'M3', 'P5', 'm7'], suffix: '7', long: 'dominant 7th' },
  pow: { ivs: ['R', 'P5'], suffix: '5', long: 'power chord' },
};
const ROLE = { R: 'root', M3: 'third', m3: 'third', P5: 'fifth', m7: 'seventh' };

function parseRoot(name) {
  const letter = LET.indexOf(name[0]);
  const alter = name.includes('♭') || name.includes('b') ? -1 : name.includes('♯') || name.includes('#') ? 1 : 0;
  return { letter, alter, pc: pc(LETTER_PC[letter] + alter) };
}
const accName = (letter, alter) => LET[letter] + (alter > 0 ? '♯'.repeat(alter) : alter < 0 ? '♭'.repeat(-alter) : '');

/** Build a chord: { sym, name, tones: [{name, role, pc}], voicing: [midi], bass, prefer, rootPos }. */
const toneList = (c) => c.tones.map((t) => t.name).join(' ');

export function makeChord(rootName, q, inversion = 0, opts = {}) {
  const r = parseRoot(rootName), Q = QUAL[q];
  const tones = Q.ivs.map((iv) => {
    const [semi, off] = IV[iv];
    const letter = (r.letter + off) % 7;
    const p = pc(r.pc + semi);
    let alter = p - LETTER_PC[letter];
    if (alter > 6) alter -= 12; if (alter < -6) alter += 12;
    return { name: accName(letter, alter), role: ROLE[iv], pc: p };
  });
  const base = opts.octave ?? 4;
  let root = (base + 1) * 12 + r.pc;
  if (opts.maxRoot && root > opts.maxRoot) root -= 12;
  let voicing = Q.ivs.map((iv) => root + IV[iv][0]);
  for (let k = 0; k < inversion; k++) voicing = [...voicing.slice(1), voicing[0] + 12];
  if (inversion && voicing[voicing.length - 1] > 79) voicing = voicing.map((m) => m - 12);
  const rootSym = accName(r.letter, r.alter);
  const bassTone = tones[inversion];
  const sym = rootSym + Q.suffix + (inversion ? `/${bassTone.name}` : '');
  const prefer = tones.some((t) => t.name.includes('♭')) ? 'flat' : 'sharp';
  return {
    sym, rootName: rootSym, q, name: `${rootSym} ${Q.long}`, tones, voicing, inversion,
    bass: inversion || opts.rootPos ? bassTone.pc : null, rootPc: r.pc, prefer, rootPos: !!opts.rootPos,
  };
}

// ======================================================================
// Quiz questions
// ======================================================================
const ORDER = 'CDEFGAB';
const byLetter = (a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]) || a.length - b.length;
const CLEF = {
  treble: { bottom: 30, lines: 'E G B D F', spaces: 'F A C E', name: 'treble' },
  bass: { bottom: 18, lines: 'G B D F A', spaces: 'A C E G', name: 'bass' },
};
const ORD = ['first', 'second', 'third', 'fourth', 'fifth'];

/** Where a note sits on a staff, in words, plus a tag for the takeaway. */
function staffPos(midi, clef) {
  const st = spell(midi, 'C').step;
  const i = st - CLEF[clef].bottom;
  if (i >= 0 && i <= 8) return i % 2 === 0 ? { text: `the ${ORD[i / 2]} line`, tag: 'line' } : { text: `the ${ORD[(i - 1) / 2]} space`, tag: 'space' };
  if (i === -1) return { text: 'the space just below the staff', tag: 'ledger' };
  if (i === 9) return { text: 'the space just above the staff', tag: 'ledger' };
  if (i < 0) return { text: i % 2 === 0 ? `ledger line ${-i / 2} below the staff` : `just below ledger line ${(-i - 1) / 2}`, tag: 'ledger' };
  return { text: i % 2 === 0 ? `ledger line ${(i - 8) / 2} above the staff` : `just above ledger line ${(i - 9) / 2}`, tag: 'ledger' };
}

/** Make a choices array with the answer at a random index. */
function choose(right, wrongs, n = 4, sort = null) {
  const pool = [...new Set(wrongs.filter((w) => w !== right))];
  const list = [right, ...shuffle(pool).slice(0, n - 1)];
  const out = sort ? list.sort(sort) : shuffle(list);
  return { choices: out, answer: out.indexOf(right) };
}

function noteReading(clef, pool) {
  const m = pick(pool);
  const name = noteName(m);
  const step = spell(m, 'C').step;
  const nb = [-2, -1, 1, 2, 7].map((d) => ORDER[(((step + d) % 7) + 7) % 7]);
  const pos = staffPos(m, clef);
  const C = CLEF[clef];
  let explain = `${name} is on ${pos.text}. ${C.name[0].toUpperCase() + C.name.slice(1)} lines from the bottom: ${C.lines}. Spaces: ${C.spaces}.`;
  if (m === 60) explain = clef === 'treble' ? 'Middle C sits on its own ledger line just below the treble staff.' : 'Middle C sits on its own ledger line just above the bass staff.';
  else if (pos.tag === 'ledger') explain = `${name} is on ${pos.text}. Count on from the nearest staff line: line, space, line, as if the staff kept going.`;
  return {
    q: 'What is this note?', ...choose(name, nb, 4, byLetter),
    staff: { notes: [m], staves: clef }, keyAnswer: { pc: pc(m), midi: m },
    explain, tag: pos.tag, review: `${noteName(m, { octave: true })} on ${pos.text}`, key: `n${m}`,
  };
}

const VALUES = [
  { v: 'B4w', name: 'whole note', beats: '4', tag: 'whole', why: 'A whole note is an open notehead with no stem: 4 beats.' },
  { v: 'B4h', name: 'half note', beats: '2', tag: 'half', why: 'A half note is open with a stem: 2 beats.' },
  { v: 'B4q', name: 'quarter note', beats: '1', tag: 'quarter', why: 'A quarter note is filled in with a stem: 1 beat.' },
  { v: 'B4e', name: 'eighth note', beats: '½', tag: 'eighth', why: 'An eighth note has a flag: half a beat. Two eighths fill one beat, counted “1 +”.' },
  { v: 'B4h.', name: 'dotted half note', beats: '3', tag: 'dotted', why: 'A dot adds half the note’s value: 2 + 1 = 3 beats.' },
  { v: 'B4q.', name: 'dotted quarter note', beats: '1½', tag: 'dotted', why: 'A dot adds half the note’s value: 1 + ½ = 1½ beats.' },
];
const BEATS = ['4', '3', '2', '1½', '1', '½'];
const cap = (t) => t[0].toUpperCase() + t.slice(1);

function noteValueItem() {
  const r = Math.random();
  if (r < 0.4) {
    const x = pick(VALUES);
    return { q: 'How many beats does this note last in 4/4 time?', ...choose(x.beats, BEATS), rhythm: x.v, explain: x.why, tag: x.tag, review: `${cap(x.name)}: ${x.beats} ${x.beats === '1' ? 'beat' : 'beats'}`, key: `b${x.v}` };
  }
  if (r < 0.7) {
    const x = pick(VALUES);
    return { q: 'What is this note called?', ...choose(cap(x.name), VALUES.map((y) => cap(y.name))), rhythm: x.v, explain: x.why, tag: x.tag, review: `${cap(x.name)} (${x.beats})`, key: `nm${x.v}` };
  }
  const bars = [
    ['B4h B4q', 'Quarter note', '2 + 1 = 3 beats so far. 4/4 needs 4, so one more beat: a quarter note.', 'quarter', 'Half + quarter = 3, add a quarter'],
    ['B4q B4q', 'Half note', '1 + 1 = 2 beats so far. Two more beats make 4: a half note.', 'half', 'Two quarters = 2, add a half'],
    ['B4q B4e B4e B4q', 'Quarter note', '1 + ½ + ½ + 1 = 3 beats so far. One more beat: a quarter note.', 'eighth', 'Quarter, two eighths, quarter = 3, add a quarter'],
    ['B4h.', 'Quarter note', 'A dotted half is 3 beats. One more beat fills the bar: a quarter note.', 'dotted', 'Dotted half = 3, add a quarter'],
    ['B4q. B4e', 'Half note', 'Dotted quarter plus eighth is 1½ + ½ = 2 beats. Two more beats: a half note.', 'dotted', 'Dotted quarter + eighth = 2, add a half'],
    ['B4q B4q B4q B4e', 'Eighth note', '1 + 1 + 1 + ½ = 3½ beats so far. Half a beat left: an eighth note.', 'eighth', 'Three quarters + an eighth = 3½, add an eighth'],
  ];
  const [v, ans, why, tag, rev] = pick(bars);
  return {
    q: 'This bar is in 4/4 but it’s not full. Which one note completes it?',
    ...choose(ans, ['Whole note', 'Half note', 'Quarter note', 'Eighth note']), rhythm: v, rhythmLen: 4,
    explain: why, tag, review: rev, key: `f${v}`,
  };
}

const RESTS = [
  { v: 'rw', name: 'whole rest', beats: '4', why: 'A whole rest hangs down from the line, like a hole: a whole bar of silence, 4 beats in 4/4.' },
  { v: 'rh', name: 'half rest', beats: '2', why: 'A half rest sits on top of the line, like a hat: 2 beats of silence.' },
  { v: 'rq', name: 'quarter rest', beats: '1', why: 'The zigzag is a quarter rest: 1 beat of silence.' },
  { v: 're', name: 'eighth rest', beats: '½', why: 'An eighth rest looks like a 7 with a dot: half a beat of silence.' },
];

function restItem() {
  const r = Math.random();
  if (r < 0.4) {
    const x = pick(RESTS);
    return { q: 'What is this rest called?', ...choose(cap(x.name), RESTS.map((y) => cap(y.name))), rhythm: x.v, explain: x.why, tag: x.v === 'rw' || x.v === 'rh' ? 'whole-half-rest' : 'rest', review: `${cap(x.name)}: ${x.beats} silent`, key: `rn${x.v}` };
  }
  if (r < 0.65) {
    const x = pick(RESTS);
    return { q: 'How many beats of silence is this rest in 4/4?', ...choose(x.beats, ['4', '2', '1', '½']), rhythm: x.v, explain: x.why, tag: x.v === 'rw' || x.v === 'rh' ? 'whole-half-rest' : 'rest', review: `${cap(x.name)}: ${x.beats}`, key: `rb${x.v}` };
  }
  const bars = [['B4q rq B4q B4q', 'Beat 2'], ['B4q B4q rq B4q', 'Beat 3'], ['B4h B4q rq', 'Beat 4'], ['rq B4q B4h', 'Beat 1'], ['B4q B4q B4q rq', 'Beat 4']];
  const [v, ans] = pick(bars);
  return {
    q: 'Count this bar out loud. Which beat is silent?', ...choose(ans, ['Beat 1', 'Beat 2', 'Beat 3', 'Beat 4'], 4, (a, b) => a.localeCompare(b)),
    rhythm: v, explain: 'Count every beat, sounding or silent: the rest still takes its beat. The counts are written under the notes now.',
    tag: 'rest-count', review: `Silent beat: ${ans.toLowerCase()}`, key: `rc${v}`,
  };
}

const DYN = [
  { g: G.dyn.pp, t: 'pp', name: 'pianissimo', mean: 'Very softly' },
  { g: G.dyn.p, t: 'p', name: 'piano', mean: 'Softly' },
  { g: G.dyn.mp, t: 'mp', name: 'mezzo piano', mean: 'Moderately softly' },
  { g: G.dyn.mf, t: 'mf', name: 'mezzo forte', mean: 'Moderately loudly' },
  { g: G.dyn.f, t: 'f', name: 'forte', mean: 'Loudly' },
  { g: G.dyn.ff, t: 'ff', name: 'fortissimo', mean: 'Very loudly' },
];
const DYN_WHY = 'Dynamics are Italian: p (piano) means soft, f (forte) means loud, and m (mezzo) means “moderately”.';

function dynamicsItem(basic = false) {
  const set = basic ? DYN.filter((d) => ['p', 'mf', 'f'].includes(d.t)) : DYN;
  if (basic || Math.random() < 0.6) {
    const x = pick(set);
    return {
      q: 'What does this mark tell you?', ...choose(`Play ${x.mean.toLowerCase()}`, DYN.map((d) => `Play ${d.mean.toLowerCase()}`)),
      figure: { note: true, below: x.g }, explain: `${x.t} is ${x.name}. ${DYN_WHY}`, tag: 'dynamics', review: `${x.t} = ${x.name}, ${x.mean.toLowerCase()}`, key: `d${x.t}`,
    };
  }
  const four = shuffle(DYN).slice(0, 4);
  const loud = Math.random() < 0.5;
  const target = [...four].sort((a, b) => DYN.indexOf(a) - DYN.indexOf(b))[loud ? 3 : 0];
  return {
    q: `Which of these is the ${loud ? 'loudest' : 'softest'}?`, choices: four.map((d) => d.g), choiceLabels: four.map((d) => `${d.t}, ${d.name}`), glyphChoices: true,
    answer: four.indexOf(target), explain: `From soft to loud: pp p mp mf f ff. ${DYN_WHY}`, tag: 'dynamics', review: `${loud ? 'Loudest' : 'Softest'}: ${target.t}`, key: `dl${four.map((d) => d.t).join()}`,
  };
}

const SIGN_CHOICES = ['Raise it a half step', 'Lower it a half step', 'Cancel a sharp or flat', 'Play it louder'];
const SYMBOLS = [
  () => ({ q: 'What is this sign at the start of the staff?', ...choose('Treble clef', ['Bass clef', 'Repeat sign', 'Time signature', 'Sharp']), staff: { notes: [], staves: 'treble' }, explain: 'The treble clef (G clef) curls around the second line and marks it as the G above middle C. Right-hand music usually uses it.', tag: 'clef', review: 'Treble clef: marks G on line 2' }),
  () => ({ q: 'What is this sign at the start of the staff?', ...choose('Bass clef', ['Treble clef', 'Repeat sign', 'Time signature', 'Flat']), staff: { notes: [], staves: 'bass' }, explain: 'The bass clef (F clef) puts its two dots around the fourth line and marks it as the F below middle C. Left-hand music usually uses it.', tag: 'clef', review: 'Bass clef: marks F on line 4' }),
  () => ({ q: 'What does the sign in front of this note do?', ...choose(SIGN_CHOICES[0], SIGN_CHOICES), staff: { notes: [66], staves: 'treble', prefer: 'sharp' }, explain: 'That’s a sharp. It raises a note a half step, to the very next key on the right: this is F♯, the black key just right of F.', tag: 'sharp', review: 'Sharp (♯) raises a half step', keyAnswer: null }),
  () => ({ q: 'What does the sign in front of this note do?', ...choose(SIGN_CHOICES[1], SIGN_CHOICES), staff: { notes: [70], staves: 'treble', prefer: 'flat' }, explain: 'That’s a flat. It lowers a note a half step, to the very next key on the left: this is B♭, the black key just left of B.', tag: 'flat', review: 'Flat (♭) lowers a half step' }),
  () => ({ q: 'This music is in G major, which has F♯. What does the sign in front of this F do?', ...choose(SIGN_CHOICES[2], SIGN_CHOICES), staff: { notes: [65], staves: 'treble', key: 'G' }, explain: 'That’s a natural sign. It cancels a sharp or flat: the key signature says F♯, but this note is plain F, the white key.', tag: 'natural', review: 'Natural (♮) cancels a sharp or flat' }),
  () => ({ q: 'What does the curved line joining these two notes mean?', ...choose('Play once, hold for both', ['Play both notes smoothly', 'Repeat the note', 'Play it louder']), staff: { voice: 'G4h~ G4h', staves: 'treble' }, explain: 'That’s a tie. It joins two notes of the same pitch: play once and hold for both values, here 2 + 2 = 4 beats.', tag: 'tie', review: 'Tie: play once, hold for both' }),
  () => ({ q: 'What does the dot after the first note do?', ...choose('Adds half its value', ['Makes it short', 'Doubles its value', 'Makes it louder']), staff: { voice: 'G4h. G4q', staves: 'treble' }, explain: 'A dot after a note adds half its value: a half note (2) plus its dot (1) lasts 3 beats. A dot above or below the notehead is different: that means short and detached.', tag: 'dot', review: 'Dot after a note: adds half its value' }),
  () => ({ q: 'What does this barline with two dots mean?', ...choose('Go back and play it again', ['The piece is over', 'Pause here', 'Play faster']), figure: { notes: 2, barline: G.repeatEnd }, explain: 'That’s a repeat sign. Go back to the start, or to a matching sign facing the other way, and play the section again.', tag: 'repeat', review: 'Repeat sign: play the section again' }),
  () => ({ q: 'What does the mark above this note ask for?', ...choose('Hold it longer than written', ['Play it short', 'Play it louder', 'Go back to the start']), figure: { note: true, above: G.fermata }, explain: 'That’s a fermata, or pause. Hold the note longer than its value, then carry on.', tag: 'fermata', review: 'Fermata: hold longer' }),
  () => ({ q: 'What does the mark above this note ask for?', ...choose('Play it with extra weight', ['Hold it longer than written', 'Play it softly', 'Repeat it']), figure: { note: true, above: G.accent }, explain: 'That’s an accent. Lean on that note so it stands out from the ones around it.', tag: 'accent', review: 'Accent: lean on the note' }),
  () => {
    const t = pick([[4, 4], [3, 4], [2, 4]]);
    return { q: 'What does the top number of this time signature tell you?', ...choose(`${t[0]} beats in each bar`, [`${t[0]} bars in the piece`, `Each note gets ${t[0]} beats`, `Play at speed ${t[0]}`]), staff: { notes: [], staves: 'treble', time: t }, explain: `The top number says how many beats are in each bar; the bottom 4 means a quarter note gets one beat. ${t[0] === 3 ? '3/4 is waltz time: 1 2 3, 1 2 3.' : t[0] === 2 ? '2/4 is march time: 1 2, 1 2.' : '4/4 is the most common time: 1 2 3 4.'}`, tag: 'time', review: `${t[0]}/4: ${t[0]} beats per bar`, key: `ts${t[0]}` };
  },
  () => dynamicsItem(true),
];

const MAJORS = [
  { k: 'C', name: 'C major', minor: 'A minor', n: 0, acc: 'no sharps or flats' },
  { k: 'G', name: 'G major', minor: 'E minor', n: 1, acc: 'one sharp, F♯' },
  { k: 'D', name: 'D major', minor: 'B minor', n: 2, acc: 'two sharps, F♯ and C♯' },
  { k: 'F', name: 'F major', minor: 'D minor', n: -1, acc: 'one flat, B♭' },
  { k: 'Bb', name: 'B♭ major', minor: 'G minor', n: -2, acc: 'two flats, B♭ and E♭' },
];
const keyRule = (x) => (x.n > 0 ? 'For sharp keys, the key note is a half step above the last sharp.' : x.n === -1 ? 'One flat is always F major.' : x.n < -1 ? 'For flat keys, the second-to-last flat names the key.' : 'No sharps or flats means C major (or A minor).');
const countText = (n) => (n === 0 ? 'None' : `${Math.abs(n)} ${n > 0 ? 'sharp' : 'flat'}${Math.abs(n) > 1 ? 's' : ''}`);

function keySigItem() {
  const x = pick(MAJORS), r = Math.random();
  if (r < 0.45) {
    return { q: 'Which major key has this key signature?', ...choose(x.name, MAJORS.map((y) => y.name)), staff: { notes: [], staves: 'treble', key: x.k }, explain: `${cap(x.acc)}: ${x.name}. ${keyRule(x)}`, tag: x.n >= 0 ? 'sharp-keys' : 'flat-keys', review: `${x.name}: ${x.acc}`, key: `km${x.k}` };
  }
  if (r < 0.75) {
    return { q: `This is the key signature of ${x.name}. Which minor key shares it?`, ...choose(x.minor, MAJORS.map((y) => y.minor)), staff: { notes: [], staves: 'treble', key: x.k }, explain: `Every major key has a relative minor with the same key signature. Count down three half steps from the key note: ${x.name.split(' ')[0]} down to ${x.minor.split(' ')[0]}, so ${x.minor}.`, tag: 'relative', review: `${x.name} ↔ ${x.minor}`, key: `kr${x.k}` };
  }
  return { q: `How many sharps or flats does ${x.name} have?`, ...choose(countText(x.n), MAJORS.map((y) => countText(y.n))), staff: { notes: [], staves: 'treble', key: 'C' }, reveal: { notes: [], staves: 'treble', key: x.k }, explain: `${x.name} has ${x.acc}. ${keyRule(x)}`, tag: x.n >= 0 ? 'sharp-keys' : 'flat-keys', review: `${x.name}: ${x.acc}`, key: `kc${x.k}` };
}

const INTERVALS = [
  { num: 2, semis: 2, name: '2nd', tune: 'the first two notes of “Frère Jacques” (traditional)' },
  { num: 3, semis: 4, name: '3rd', tune: 'the first two notes of “When the Saints Go Marching In” (traditional)' },
  { num: 4, semis: 5, name: '4th', tune: 'the first two notes of “Amazing Grace” (traditional)' },
  { num: 5, semis: 7, name: '5th', tune: 'the jump in “Twinkle, Twinkle, Little Star” (traditional)' },
  { num: 6, semis: 9, name: '6th', tune: 'the first two notes of “My Bonnie Lies Over the Ocean” (traditional)' },
  { num: 8, semis: 12, name: 'Octave', tune: 'the same letter, higher: the two notes blend almost into one' },
];
function topNote(lowMidi, num, semis) {
  const s0 = spell(lowMidi, 'C');
  const letter = (s0.letter + num - 1) % 7;
  const m = lowMidi + semis;
  let alter = pc(m) - LETTER_PC[letter];
  if (alter > 6) alter -= 12; if (alter < -6) alter += 12;
  return { midi: m, name: accName(letter, alter), prefer: alter < 0 ? 'flat' : 'sharp' };
}
function intervalItem() {
  const x = pick(INTERVALS);
  const low = pick([60, 62, 64, 65, 67]);
  const top = topNote(low, x.num, x.semis);
  const lowName = noteName(low);
  const letters = [];
  for (let k = 0; k < Math.min(x.num, 8); k++) letters.push(ORDER[(ORDER.indexOf(lowName[0]) + k) % 7]);
  const count = x.num === 8 ? `${lowName} up to the next ${lowName} is eight letter names.` : `${lowName} up to ${top.name}: ${letters.join(' ')}, ${x.num} letter names.`;
  return {
    q: 'Listen. How far apart are the two notes?', ...choose(x.name, INTERVALS.map((i) => i.name), 4, (a, b) => parseInt(a, 10) - parseInt(b, 10) || (a === 'Octave' ? 1 : -1)),
    play: [low, top.midi], harmonic: true, reveal: { notes: [low, top.midi], staves: 'treble', prefer: top.prefer, split: true, names: [lowName, top.name] },
    explain: `A ${x.name === 'Octave' ? 'n octave' : x.name}: ${count} It sounds like ${x.tune}.`.replace('A n octave', 'An octave'),
    tag: `int-${x.num}`, review: `${x.name}: ${x.tune.split(' (')[0]}`, key: `i${x.num}`,
  };
}

function chordItem() {
  const roots = ['C', 'D', 'E', 'F', 'G', 'A'];
  const c = makeChord(pick(roots), Math.random() < 0.6 ? 'maj' : 'min');
  const r = parseRoot(c.rootName);
  const alt = makeChord(c.rootName, c.q === 'maj' ? 'min' : 'maj');
  const next = makeChord(ORDER[(r.letter + 1) % 7], c.q);
  const sus = `${c.tones[0].name} ${ORDER[(r.letter + 3) % 7]} ${c.tones[2].name}`;
  if (Math.random() < 0.5) {
    return { q: `Which notes make ${c.sym}?`, ...choose(toneList(c), [toneList(alt), toneList(next), sus]), reveal: { notes: c.voicing, staves: 'treble', prefer: c.prefer }, explain: `${c.name}: root ${c.tones[0].name}, third ${c.tones[1].name}, fifth ${c.tones[2].name}. ${c.q === 'min' ? 'A minor third is 3 half steps above the root.' : 'A major third is 4 half steps above the root.'}`, tag: 'chords', review: `${c.sym} = ${toneList(c)}`, key: `ct${c.sym}` };
  }
  return { q: 'Which chord is this?', ...choose(c.sym, [alt.sym, next.sym, makeChord(ORDER[(r.letter + 4) % 7], c.q).sym]), staff: { notes: c.voicing, staves: 'treble', prefer: c.prefer }, explain: `The notes are ${toneList(c)}: root ${c.tones[0].name} at the bottom, so ${c.name}.`, tag: 'chords', review: `${toneList(c)} = ${c.sym}`, key: `cn${c.sym}` };
}

const TREBLE_POOL = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81];
const BASS_POOL = [40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60];

export const GENERATORS = {
  'treble-notes': () => noteReading('treble', TREBLE_POOL),
  'bass-notes': () => noteReading('bass', BASS_POOL),
  'note-values': noteValueItem,
  rests: restItem,
  values: () => (Math.random() < 0.6 ? noteValueItem() : restItem()),
  symbols: () => pick(SYMBOLS)(),
  'key-signatures': keySigItem,
  intervals: intervalItem,
  dynamics: () => dynamicsItem(false),
  chords: chordItem,
};
const ALIASES = { treble: 'treble-notes', bass: 'bass-notes', reading: 'treble-notes', rhythm: 'note-values', 'note-and-rest-values': 'values', keys: 'key-signatures', 'power-chords': 'chords' };

/** Make `count` questions from a generator name (or function), avoiding repeats where possible. */
export function generateItems(gen, count = 6) {
  const fn = typeof gen === 'function' ? gen : GENERATORS[gen] || GENERATORS[ALIASES[gen]] || GENERATORS['treble-notes'];
  const out = [], seen = new Set();
  for (let k = 0; k < count; k++) {
    let it, tries = 0;
    do { it = fn(); tries++; } while (tries < 25 && seen.has(it.key || it.q + it.choices[it.answer]));
    seen.add(it.key || it.q + it.choices[it.answer]);
    out.push(it);
  }
  return out;
}

/** Small SVG figure: a staff with a note and a mark above or below, or a repeat barline. */
function drawFigure(svg, f) {
  svg.textContent = '';
  const W = 22, H = 14, top = 3.5;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const g = s('g', { class: 'qz-fig' }, svg);
  for (let i = 0; i < 5; i++) s('line', { class: 'qz-fig-line', x1: 1, x2: W - 1, y1: top + i, y2: top + i }, g);
  glyph(g, G.gClef, 1.6, top + 3);
  const head = (x) => {
    glyph(g, G.black, x, top + 2);
    s('line', { class: 'qz-fig-stem', x1: x + 1.12, x2: x + 1.12, y1: top + 1.83, y2: top - 1.5 }, g);
  };
  if (f.note) {
    head(10.5);
    if (f.above) { const t = glyph(g, f.above, 10.5 + 0.59, top - 2.6); t.setAttribute('text-anchor', 'middle'); }
    if (f.below) { const t = glyph(g, f.below, 10.5 + 0.59, top + 7.4); t.setAttribute('text-anchor', 'middle'); }
  }
  if (f.notes) { head(8); head(12.5); }
  if (f.barline) glyph(g, f.barline, 16, top + 4);
}

// ======================================================================
// QuizRunner: reusable multiple-choice engine (Flashcards and lesson quiz steps)
// ======================================================================
export class QuizRunner {
  /**
   * opts: { items, generator, count = 6, staves, topic, preview, onAnswer(info) }
   * Item: { q, choices, answer, staff?: { notes, staves, prefer, key, time, voice }, rhythm?, play?, keyAnswer?, explain? }
   * onDone({ correct, wrong, missed })
   */
  constructor(app, opts = {}, onDone = () => {}) {
    this.app = app;
    this.o = { count: 6, ...opts };
    this.onDone = onDone;
    this.items = opts.items?.length ? [...opts.items] : generateItems(opts.generator, this.o.count);
    this.topic = opts.topic || (typeof opts.generator === 'string' ? opts.generator : 'quiz');
    this.i = -1; this.correct = 0; this.wrong = 0; this.missed = [];
    this.timers = new Set();
    this._build();
    if (this.o.preview) { this._show(0, true); return; }
    this.onKey = (e) => this._key(e);
    window.addEventListener('keydown', this.onKey, true);
    const notes = this.items.flatMap((it) => it.staff?.notes || []).filter((m) => typeof m === 'number');
    if (notes.length) app.keyboard.need(Math.min(...notes), Math.max(...notes));
    this._next();
  }

  get item() { return this.items[this.i]; }

  _later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }

  _build() {
    this.vis = h('div', { class: 'qz-vis' });
    this.svgStaff = s('svg', { class: 'qz-staff', role: 'img', 'aria-label': 'Music staff' });
    this.svgFig = s('svg', { class: 'qz-svg', role: 'img' });
    this.playBtn = h('button', { type: 'button', class: 'qz-play', onclick: () => this.replay() },
      h('span', { class: 'qz-play-icon', 'aria-hidden': 'true' }), h('span', {}, 'Play again'), h('kbd', {}, 'R'));
    this.vis.append(this.svgStaff, this.svgFig, this.playBtn);
    this.meta = h('p', { class: 'qz-meta' });
    this.qEl = h('p', { class: 'qz-q', 'aria-live': 'polite' });
    this.choicesEl = h('div', { class: 'qz-choices', role: 'group', 'aria-label': 'Answers' });
    this.nextBtn = h('button', { type: 'button', class: 'btn primary qz-next', onclick: () => this._advance() }, 'Next');
    this.actions = h('div', { class: 'qz-actions' }, this.nextBtn);
    this.main = h('div', { class: 'qz-main' }, this.meta, this.qEl, this.choicesEl, this.actions);
    this.root = h('div', { class: `qz${this.o.preview ? ' qz-preview' : ''}`, role: 'group', 'aria-label': 'Quiz' }, this.vis, this.main);
    this.host = h('div', { class: 'qz-host' }, this.root);
    this.app.ui.layer(this.host, { hideStaff: true });
    this.staff = null;
  }

  _staff() {
    if (!this.staff) {
      this.staff = new Staff(this.svgStaff);
      const draw = this.staff._drawColumn.bind(this.staff);
      this.staff._drawColumn = () => { draw(); this._labels(); };
    }
    return this.staff;
  }

  /** Note-name labels under column notes (shown after an answer). */
  _labels() {
    const st = this.staff, L = this.labels;
    if (!L || !st?.gCol || !st.column) return;
    const sp = st.sp;
    const cx = st.column.opts.x ?? st.panelW + (st.w - st.panelW) * 0.42;
    for (const lb of L) {
      const clef = st.clefFor({ midi: lb.midi });
      const y = st.y(spell(lb.midi, st.key, lb.prefer).step, clef);
      const bottom = (clef === 'treble' ? st.tTop : st.bTop) + 4 * sp;
      const t = s('text', { class: `qz-label ${lb.cls || ''}`, x: cx + (lb.dx || 0) * sp + 0.84 * sp, y: Math.max(bottom + 2.3 * sp, y + 2.6 * sp), 'font-size': 1.7 * sp, 'text-anchor': 'middle' }, st.gCol);
      t.textContent = lb.text;
    }
  }

  _drawStaff(spec, extra = []) {
    const st = this._staff();
    this.svgStaff.style.display = '';
    if (spec.voice) {
      this.labels = null;
      const sc = buildScore({ rh: spec.voice, time: spec.time || [4, 4], key: spec.key || 'C' });
      st.setScore(sc, { staves: spec.staves || 'treble', hideTime: !spec.time, showZone: false, noEnd: true, hideFingers: true, ppb: 4.2 });
      st.setBeat(-0.4);
      return;
    }
    const notes = spec.notes || [];
    const groups = [];
    if (spec.split && notes.length) notes.forEach((m, k) => groups.push({ midis: [m], cls: spec.cls || '', prefer: spec.prefer, dx: (k - (notes.length - 1) / 2) * 4.2 }));
    else if (notes.length) groups.push({ midis: notes, cls: spec.cls || '', prefer: spec.prefer });
    st.showColumn([...groups, ...extra], { staves: spec.staves || this.o.staves || 'treble', key: spec.key || 'C', time: spec.time || null });
  }

  _drawRhythmSvg(voice, len, counts) {
    const { events, length } = parseVoice(voice);
    const L = Math.max(len || 0, length);
    const ppb = L <= 2 ? 6 : 5.2;
    const w = 6 + L * ppb, H = 9;
    const svg = this.svgFig;
    svg.textContent = '';
    svg.style.display = '';
    const vw = Math.max(w, 24);
    svg.setAttribute('viewBox', `${num(-(vw - w) / 2)} 0 ${num(vw)} ${H}`);
    svg.setAttribute('aria-label', 'Rhythm on a one-line staff');
    const y = 4.6;
    s('line', { class: 'rh-line', x1: 0.3, x2: w - 0.3, y1: y, y2: y }, svg);
    glyph(svg, G.perc, 0.5, y, 'glyph rh-clef');
    if (len && len > length) {
      const gx = 3.9 + length * ppb;
      s('rect', { class: 'qz-gap', x: gx, y: y - 2.2, width: (len - length) * ppb - 0.6, height: 4.4, rx: 0.5 }, svg);
      txt(svg, '?', gx + ((len - length) * ppb - 0.6) / 2, y + 0.7, 'qz-gap-q', 2).setAttribute('text-anchor', 'middle');
    }
    drawRhythm(svg, events, { x0: 3.9, ppb, y, len: L, counts, countDy: 3.3 });
    if (L >= 4) s('line', { class: 'rh-bar', x1: w - 0.8, x2: w - 0.8, y1: y - 2, y2: y + 2 }, svg);
  }

  _visual(it, revealed) {
    this.svgStaff.style.display = 'none';
    this.svgFig.style.display = 'none';
    this.playBtn.hidden = !it.play;
    const spec = revealed && it.reveal ? it.reveal : it.staff;
    let shown = !!it.play;
    if (spec) { this._drawStaff(spec); shown = true; }
    else if (it.rhythm) { this._drawRhythmSvg(it.rhythm, it.rhythmLen, revealed && !it.hideCounts); shown = true; }
    else if (it.figure) { this.svgFig.style.display = ''; drawFigure(this.svgFig, it.figure); this.svgFig.setAttribute('aria-label', 'Notation symbol'); shown = true; }
    if (it.play && !spec) {
      this._drawStaff({ notes: [], staves: 'treble' });
    }
    this.root.classList.toggle('qz-novis', !shown);
    this.root.classList.toggle('qz-has-play', !!it.play);
  }

  _show(i, preview = false) {
    this.i = i;
    const it = this.item;
    this.answered = false;
    this.labels = null;
    this.root.scrollTop = 0;
    this.app.keyboard.clear('cue-r');
    this.root.classList.remove('qz-done', 'qz-answered');
    this.meta.textContent = preview ? 'Sample question' : `Question ${i + 1} of ${this.items.length}`;
    this.qEl.textContent = it.q;
    this.choicesEl.textContent = '';
    const longest = Math.max(...it.choices.map((c) => String(c).length));
    const cols = it.glyphChoices || longest <= 3 ? 'qz-c4' : longest <= 14 ? 'qz-c2' : longest <= 24 ? 'qz-c2 qz-long' : 'qz-c1';
    this.choicesEl.className = `qz-choices ${cols}`;
    this.btns = it.choices.map((c, k) => {
      const b = h('button', {
        type: 'button', class: 'qz-choice', disabled: preview,
        'aria-label': it.choiceLabels ? `${k + 1}: ${it.choiceLabels[k]}` : null,
        onclick: () => this.answer(k),
      }, h('span', { class: 'qz-num', 'aria-hidden': 'true' }, String(k + 1)), h('span', { class: `qz-txt${it.glyphChoices ? ' glyph' : ''}` }, c));
      this.choicesEl.append(b);
      return b;
    });
    this.actions.hidden = true;
    this._visual(it, false);
    if (it.keyAnswer && !preview) this.meta.textContent += ' · or play it';
    if (it.play && !preview) this._later(() => this.replay(), 350);
  }

  replay() {
    const it = this.item;
    if (!it?.play) return;
    const { sound } = this.app;
    sound.unlock();
    const t0 = sound.now() + 0.08, gap = 0.75;
    it.play.forEach((m, k) => sound.play(m, 0.72, t0 + k * gap, gap * 0.95));
    if (it.harmonic) it.play.forEach((m) => sound.play(m, 0.6, t0 + it.play.length * gap + 0.15, 1.3));
    if (this.answered) {
      it.play.forEach((m, k) => this._later(() => this.app.keyboard.flash(m, 'demo', 700), (0.08 + k * gap) * 1000));
    }
  }

  _key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || !this.root.isConnected) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || document.querySelector('dialog[open]')) return;
    const n = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
    if (n && !this.answered && this.item) {
      const k = +n[1] - 1;
      if (k < this.item.choices.length) { e.preventDefault(); e.stopPropagation(); this.answer(k); }
      return;
    }
    if (e.code === 'KeyR' && this.item?.play) { e.preventDefault(); this.replay(); return; }
    if (this.answered && !this.finished && (e.key === 'Enter' || e.code === 'Space' || e.key === 'ArrowRight')) {
      if (e.repeat) return;
      const a = document.activeElement;
      if (a === this.nextBtn && e.key !== 'ArrowRight') return; // the button handles it
      // leave other focused controls (tabs, settings) alone
      if (e.key !== 'ArrowRight' && a && a !== document.body && !this.root.contains(a) && /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(a.tagName)) return;
      e.preventDefault(); e.stopPropagation();
      this._advance();
    }
  }

  /** Piano input: answers "which note is this" questions. */
  noteOn(midi) {
    const it = this.item;
    if (!it || this.answered || this.finished || !it.keyAnswer) return;
    const ka = it.keyAnswer;
    const want = typeof ka === 'number' ? ka : ka.midi;
    const ok = typeof ka === 'number' ? midi === ka : pc(midi) === ka.pc;
    const name = noteName(midi, { prefer: it.staff?.prefer });
    let k = it.choices.findIndex((c) => c === name);
    if (ok) k = it.answer;
    this.answer(k, { midi, ok, want });
  }

  answer(k, played = null) {
    const it = this.item;
    if (!it || this.answered || this.finished || this.o.preview) return;
    this.answered = true;
    const ok = played ? played.ok : k === it.answer;
    if (ok) this.correct++; else { this.wrong++; this.missed.push({ item: it, chose: k, played }); }
    const coach = this.app.coach;
    coach?.record?.('quiz', { topic: it.topic || this.topic, correct: ok });
    if (played && !ok && played.want !== undefined) {
      coach?.record?.('wrong-pitch', { expected: played.want, played: played.midi, skill: it.staff?.staves === 'bass' ? 'bass' : 'treble', key: 'C' });
    }
    const kb = this.app.keyboard;
    const spec = it.reveal || it.staff;
    const name = (m) => noteName(m, { prefer: spec?.prefer });
    this.btns.forEach((b, j) => {
      b.disabled = true;
      b.classList.toggle('right', j === it.answer);
      b.classList.toggle('wrong', j === k && !ok);
      b.classList.toggle('dim', j !== it.answer && j !== k);
    });
    if (played) kb.flash(played.midi, ok ? 'hit' : 'miss', 500);
    // feedback: verdict and explanation, correct answer on the staff and keyboard
    const right = it.glyphChoices ? it.choiceLabels?.[it.answer] : it.choices[it.answer];
    let verdict = ok ? pick(['Right.', 'Correct.', 'Yes.', 'That’s it.']) : `Not quite. The answer is ${right}.`;
    if (played && ok && played.want !== undefined && played.midi !== played.want) {
      verdict = `Right name. On the staff this is ${noteName(played.want, { octave: true })}; you played ${noteName(played.midi, { octave: true })}.`;
    } else if (played && !ok) {
      verdict = `You played ${name(played.midi)}. This note is ${right}.`;
    }
    this.qEl.textContent = '';
    this.qEl.append(h('strong', { class: ok ? 'qz-ok' : 'qz-no' }, verdict), it.explain ? ` ${it.explain}` : '');
    this.root.classList.add('qz-answered');
    if (spec && !spec.voice) {
      const notes = spec.notes || [];
      const prefer = spec.prefer;
      if (notes.length === 1 || spec.names) {
        this.labels = (spec.names || [noteName(notes[0], { prefer })]).map((text, j) => ({
          midi: notes[j], text, prefer, cls: 'hit', dx: spec.split ? (j - (notes.length - 1) / 2) * 4.2 : 0,
        }));
      }
      const extra = played && !ok && notes.length === 1 && played.midi !== notes[0] ? [{ midis: [played.midi], cls: 'wrong', prefer, dx: 3.6 }] : [];
      if (extra.length) this.labels.push({ midi: played.midi, text: name(played.midi), prefer, cls: 'wrong', dx: 3.6 });
      this._drawStaff({ ...spec, cls: ok ? 'hit' : 'target' }, extra);
      if (!ok || it.reveal) notes.forEach((m) => kb.mark(m, 'cue-r', true));
    } else if (it.rhythm) this._drawRhythmSvg(it.rhythm, it.rhythmLen, !it.hideCounts);
    if (it.play) this._later(() => this.replay(), 450);
    this.o.onAnswer?.({ ok, item: it, index: this.i, correct: this.correct, wrong: this.wrong });
    const last = this.i >= this.items.length - 1;
    this.nextBtn.textContent = last ? 'Finish' : 'Next';
    this.actions.hidden = false;
    requestAnimationFrame(() => { if (this.root.scrollHeight > this.root.clientHeight) this.root.scrollTop = this.root.scrollHeight; });
    if (ok) {
      const ms = clamp(900 + (it.explain || '').length * 28, 1600, 4200) + (it.play ? 1200 : 0);
      this.autoT = this._later(() => this._advance(), ms);
    } else if (this.root.contains(document.activeElement) || document.activeElement === document.body) {
      this.nextBtn.focus({ preventScroll: true });
    }
  }

  /** End early: show the review for what was answered and report. */
  finishNow(note = '') {
    if (this.finished) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.items = this.items.slice(0, Math.max(0, this.i + (this.answered ? 1 : 0)));
    this.note = note;
    this._finish();
  }

  _advance() {
    if (!this.answered || this.finished) return;
    clearTimeout(this.autoT);
    this.timers.delete(this.autoT);
    this._next();
  }

  _next() {
    if (this.i + 1 >= this.items.length) { this._finish(); return; }
    this._show(this.i + 1);
  }

  _finish() {
    this.finished = true;
    this.app.keyboard.clear('cue-r');
    const total = this.correct + this.wrong;
    this.root.classList.add('qz-done', 'qz-novis');
    this.root.classList.remove('qz-has-play');
    this.meta.textContent = 'Review';
    this.qEl.textContent = '';
    this.qEl.append(h('strong', {}, `${this.correct} of ${total} right.`), this.missed.length ? ' Worth another look:' : ' All correct.');
    this.choicesEl.className = 'qz-review';
    this.choicesEl.textContent = '';
    for (const m of this.missed.slice(0, 4)) this.choicesEl.append(h('p', { class: 'qz-review-item' }, m.item.review || `${m.item.q} ${m.item.choices[m.item.answer]}`));
    this.actions.hidden = true;
    this.onDone({ correct: this.correct, wrong: this.wrong, missed: this.missed, note: this.note });
  }

  stop() {
    this.finished = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.onKey) window.removeEventListener('keydown', this.onKey, true);
    this.app.keyboard.clear('cue-r');
    if (this.host.isConnected) this.app.ui.layer(null);
  }

  tick() {}
}

// ======================================================================
// Flashcards game
// ======================================================================
const TAG_TIPS = {
  line: (t) => `Line notes tripped you up. ${t === 'bass-notes' ? 'Bass lines from the bottom: G B D F A.' : 'Treble lines from the bottom: E G B D F.'} Say them as you read.`,
  space: (t) => `Space notes tripped you up. ${t === 'bass-notes' ? 'Bass spaces from the bottom: A C E G.' : 'Treble spaces spell F A C E.'}`,
  ledger: () => 'Ledger-line notes were tricky. Count on from the staff as if its lines kept going: line, space, line.',
  whole: () => 'Review note values: whole 4 beats, half 2, quarter 1, eighth ½.',
  half: () => 'A half note is open with a stem: 2 beats. Count “1 2” through it.',
  quarter: () => 'A quarter note is filled with a stem: 1 beat. Bars of 4/4 add up to four.',
  eighth: () => 'Two eighth notes share one beat: count them “1 +”.',
  dotted: () => 'A dot adds half the note’s value: dotted half = 3, dotted quarter = 1½.',
  'whole-half-rest': () => 'Whole rest hangs down like a hole (4 beats); half rest sits up like a hat (2 beats).',
  rest: () => 'Quarter rest: 1 beat of silence. Eighth rest: half a beat.',
  'rest-count': () => 'Count every beat out loud, including the silent ones.',
  clef: () => 'Treble clef curls around G; bass clef’s dots surround F.',
  sharp: () => 'Sharp raises a half step, flat lowers, natural cancels.',
  flat: () => 'Sharp raises a half step, flat lowers, natural cancels.',
  natural: () => 'A natural cancels the key signature for that note.',
  tie: () => 'A tie joins same-pitch notes: play once, hold for both.',
  dot: () => 'A dot after a note adds half its value.',
  dynamics: () => 'p is soft, f is loud, m means moderately: pp p mp mf f ff.',
  time: () => 'Time signature: top number is beats per bar; bottom 4 means a quarter note gets the beat.',
  'sharp-keys': () => 'Sharp keys: the key note is a half step above the last sharp.',
  'flat-keys': () => 'Flat keys: one flat is F major; otherwise the second-to-last flat names the key.',
  relative: () => 'Relative minor: three half steps down from the major key note.',
  chords: () => 'Build a triad from the root: skip a letter, skip a letter. Major third = 4 half steps, minor = 3.',
};

function quizTakeaway(missed, topic, levels, cur) {
  if (!missed.length) return cur < levels.length - 1 ? `Every answer right. Try “${levels[cur + 1].name}” next.` : 'Every answer right.';
  const tags = {};
  for (const m of missed) tags[m.item.tag] = (tags[m.item.tag] || 0) + 1;
  const [tag, n] = Object.entries(tags).sort((a, b) => b[1] - a[1])[0];
  if (tag?.startsWith('int-')) {
    const first = missed.find((m) => m.item.tag === tag).item;
    const iv = INTERVALS.find((x) => `int-${x.num}` === tag);
    const others = [...new Set(missed.map((m) => m.item.choices[m.item.answer]))].filter((x) => x !== first.choices[first.answer]);
    const more = others.length ? ` Then the ${others.slice(0, 2).join(' and ')}.` : '';
    return `The ${iv.name === 'Octave' ? 'octave' : iv.name} was hardest to hear. Link it to a tune: ${iv.tune}. Hum it before you answer.${more}`;
  }
  const tip = TAG_TIPS[tag]?.(topic);
  return tip ? `${tip}${n < missed.length ? ' Then run this topic again.' : ' Run this topic again to lock it in.'}` : 'Run this topic again: the explanations after each answer are the quickest way to learn them.';
}

export const QUIZ_LEVELS = [
  { name: 'Treble notes', generator: 'treble-notes', tip: 'Name notes on the treble staff. Click an answer, press 1–4, or play the key.' },
  { name: 'Bass notes', generator: 'bass-notes', tip: 'Name notes on the bass staff. Click an answer, press 1–4, or play the key.' },
  { name: 'Note and rest values', generator: 'values', tip: 'How long each note and rest lasts, and how they fill a bar.' },
  { name: 'Symbols', generator: 'symbols', tip: 'Clefs, sharps and flats, ties, dots, repeats, time signatures and loud and soft.' },
  { name: 'Key signatures', generator: 'key-signatures', tip: 'C, G, D, F and B♭ major, and the minor keys that share their signatures.' },
  { name: 'Intervals by ear', generator: 'intervals', tip: 'Two notes play. How far apart are they? Press R to hear them again.' },
];
const QUIZ_COUNT = 10;

export class QuizGame extends GameBase {
  get lv() { const L = this.game.levels?.[this.level]; return L?.generator ? L : QUIZ_LEVELS[this.level] || QUIZ_LEVELS[0]; }

  preview() {
    this.runner?.stop();
    this.runner = new QuizRunner(this.app, { generator: this.lv.generator, count: 1, preview: true });
    this.app.ui.prompt(this.lv.tip);
    this.app.keyboard.need(this.lv.generator === 'bass-notes' ? 40 : 60, this.lv.generator === 'bass-notes' ? 60 : 81);
  }

  intro() {
    super.intro();
    gxSeg(footOf(this.app));
  }

  start() {
    const lv = this.lv;
    this.app.sound.unlock();
    this.runner?.stop();
    this.playing = true;
    this.score = 0; this.streak = 0;
    this.tracker = this.app.coach?.begin?.({ topic: lv.generator }) || null;
    this.app.ui.prompt(lv.tip);
    this.app.ui.foot(h('button', { class: 'btn', onclick: () => this.runner?.finishNow('Stopped.') }, 'Stop'));
    this.runner = new QuizRunner(this.app, {
      generator: lv.generator, count: QUIZ_COUNT, topic: lv.generator,
      onAnswer: ({ ok, index }) => {
        if (ok) { this.score += 10 + Math.min(10, this.streak * 2); this.streak++; } else this.streak = 0;
        this._hud(index + 1);
      },
    }, (r) => this._done(r, r.note || ''));
    this._hud(0);
  }

  _hud(n) {
    this.app.ui.status(`${this.score} points · ${n} of ${QUIZ_COUNT} answered${this.streak > 2 ? ` · ${this.streak} in a row` : ''}`);
  }

  _done(r, prefix = '') {
    if (!this.playing) return;
    this.playing = false;
    const total = r.correct + r.wrong;
    if (this.tracker) { this.app.coach?.end?.(this.tracker, { score: total ? r.correct / total : 0 }); this.tracker = null; }
    const head = `${prefix ? `${prefix} ` : ''}${r.correct} of ${total} right, ${this.score} points.`;
    this.over(this.score, `${head} ${quizTakeaway(r.missed || [], this.lv.generator, this.game.levels, this.level)}`);
  }

  noteOn(e) { if (this.playing) this.runner?.noteOn(e.midi); }

  exit() {
    super.exit();
    this.runner?.stop();
    this.runner = null;
    if (this.tracker) { this.app.coach?.end?.(this.tracker); this.tracker = null; }
  }
}


export const GAMES_EXTRA = [
  {
    id: 'quiz', title: 'Flashcards',
    summary: 'Quick review of note names, rhythms, symbols, key signatures and intervals, with an explanation after every answer.',
    levels: QUIZ_LEVELS,
  },
];

export const GAME_CLASSES_EXTRA = { quiz: QuizGame };
