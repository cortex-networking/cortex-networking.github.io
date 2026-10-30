// Adaptive coach: classifies mistakes, tracks skill mastery, and writes targeted practice.
import { pc, isBlack, spell, noteName, buildScore } from './theory.js';

const DAY = 86400000;

export const CATEGORIES = {
  reading: { label: 'Note reading', fix: 'Some notes were misread on the staff.', skill: 'sight-reading' },
  'line-space': { label: 'Lines and spaces', fix: 'Line and space notes got mixed up, a step off on the staff.', skill: 'sight-reading' },
  neighbor: { label: 'Finger slips', fix: 'Fingers slipped onto the key next door.', skill: 'finger-numbers' },
  accidental: { label: 'Sharps and flats', fix: 'A sharp or flat was missed, or added where it didn’t belong.', skill: 'black-keys' },
  octave: { label: 'Octaves', fix: 'Right note name, wrong octave.', skill: 'ledger' },
  missed: { label: 'Missing notes', fix: 'Some notes were left out.', skill: 'sight-reading' },
  early: { label: 'Rushing', fix: 'You were ahead of the beat.', skill: 'note-values' },
  late: { label: 'Dragging', fix: 'You were behind the beat.', skill: 'note-values' },
  short: { label: 'Holding notes', fix: 'Long notes were let go before their time was up.', skill: 'note-values' },
  rest: { label: 'Rests', fix: 'Notes were played where the music rests.', skill: 'rests' },
  chord: { label: 'Chords', fix: 'Chords were missing a note.', skill: 'chords' },
  hands: { label: 'Hands together', fix: 'The two hands didn’t land together.', skill: 'hands-together' },
  dynamics: { label: 'Loud and soft', fix: 'Loud and soft passages sounded too alike.', skill: 'dynamics' },
  quiz: { label: 'Theory', fix: 'Some review questions were missed.', skill: 'sight-reading' },
};

/** Classify a wrong note against what was expected. */
export function classifyPitch(expected, played, key = 'C') {
  const diff = played - expected;
  if (diff !== 0 && pc(diff) === 0) return 'octave';
  const a = spell(expected, key), b = spell(played, key);
  if (Math.abs(diff) === 1 && isBlack(expected) !== isBlack(played) && a.letter === b.letter) return 'accidental';
  if (Math.abs(diff) <= 2 && Math.abs(a.step - b.step) <= 1) return 'neighbor';
  if (Math.abs(a.step - b.step) === 2) return 'line-space';
  return 'reading';
}

/** Copy bars [fromBar, toBar] of a score (bar 0 = first bar or pickup) into a new score. */
export function excerpt(score, fromBar, toBar, hands = 'B') {
  const starts = [0, ...score.barlines, score.length];
  const a = starts[Math.max(0, fromBar)] ?? 0;
  const b = starts[Math.min(starts.length - 1, toBar + 1)] ?? score.length;
  const keep = score.events.filter((e) => e.t >= a - 1e-6 && e.t < b - 1e-6 && (hands === 'B' || e.hand === hands));
  const map = new Map();
  const events = keep.map((e, i) => { const c = { ...e, t: e.t - a, i }; map.set(e, c); return c; });
  for (const c of events) {
    if (c.tieTo) c.tieTo = map.get(c.tieTo) || undefined;
    if (c.tiedFrom) c.tiedFrom = map.get(c.tiedFrom) || undefined;
    if (c.tieTo === undefined) delete c.tieTo;
  }
  return {
    ...score, events, notes: events.filter((e) => !e.rest && !e.tiedFrom),
    length: b - a, pickup: 0,
    barlines: score.barlines.filter((x) => x > a + 1e-6 && x < b - 1e-6).map((x) => x - a),
    marks: (score.marks || []).filter((m) => m.t >= a && m.t < b).map((m) => ({ ...m, t: m.t - a })),
    hands: { R: events.some((e) => e.hand === 'R' && !e.rest), L: events.some((e) => e.hand === 'L' && !e.rest) },
  };
}

export function barOf(score, t) {
  let n = 0;
  for (const b of score.barlines) { if (b <= t + 1e-6) n++; else break; }
  return n;
}

export class Coach {
  constructor(app) {
    this.app = app;
    this.saveTimer = null;
  }

  get data() {
    const d = this.app.store.data;
    if (!d.coach) d.coach = { cats: {}, skills: {}, contexts: {}, confusions: {}, quiz: {} };
    return d.coach;
  }

  _save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.app.store.save(), 1500);
  }

  /** Start tracking one activity (a lesson step, a song run, a game round). */
  begin(context = {}) {
    const tracker = { context, counts: {}, confusions: [], bars: new Map(), hits: 0, at: Date.now() };
    this.current = tracker;
    return tracker;
  }

  /**
   * Record one event. Types: 'hit', 'wrong-pitch' {expected, played, key, t}, 'early'/'late' {ms, t},
   * 'missed' {expected, t}, 'short' {ratio, t}, 'rest' {t}, 'chord' {t}, 'hands' {ms, t},
   * 'dynamics' {want, got, t}, 'quiz' {topic, correct}.
   */
  record(type, info = {}, tracker = this.current) {
    let cat = type;
    if (type === 'hit') { if (tracker) tracker.hits++; return null; }
    if (type === 'wrong-pitch') {
      cat = classifyPitch(info.expected, info.played, info.key);
      if (tracker) tracker.confusions.push([info.expected, info.played]);
      const k = `${info.expected}>${info.played}`;
      this.data.confusions[k] = (this.data.confusions[k] || 0) + 1;
    }
    if (type === 'quiz') {
      const q = this.data.quiz;
      const s = (q[info.topic] ||= { right: 0, wrong: 0 });
      if (info.correct) { s.right++; this._save(); return null; }
      s.wrong++;
      cat = 'quiz';
    }
    if (!CATEGORIES[cat]) return null;
    const c = (this.data.cats[cat] ||= { n: 0, w: 0, last: 0 });
    // exponentially decayed weight so recent trouble counts more
    const now = Date.now();
    c.w = c.w * Math.exp(-(now - (c.last || now)) / (7 * DAY)) + 1;
    c.n++;
    c.last = now;
    if (tracker) {
      tracker.counts[cat] = (tracker.counts[cat] || 0) + 1;
      if (info.t !== undefined && tracker.context.score) {
        const bar = barOf(tracker.context.score, info.t);
        tracker.bars.set(bar, (tracker.bars.get(bar) || 0) + 1);
      }
      if (type === 'quiz') tracker.topic = info.topic;
    }
    this._save();
    return cat;
  }

  /** Finish an activity: update skills, store a replayable context for the worst problem. */
  end(tracker = this.current, { score = null, skills = [] } = {}) {
    if (!tracker) return null;
    const top = Object.entries(tracker.counts).sort((a, b) => b[1] - a[1])[0];
    const errs = Object.values(tracker.counts).reduce((a, b) => a + b, 0);
    const acc = score ?? (tracker.hits + errs ? tracker.hits / (tracker.hits + errs) : 1);
    const allSkills = new Set(skills);
    if (top) allSkills.add(CATEGORIES[top[0]].skill);
    for (const sk of allSkills) {
      const s = (this.data.skills[sk] ||= { v: 0.5, n: 0 });
      s.v = s.v * 0.65 + acc * 0.35;
      s.n++;
    }
    const summary = {
      top: top ? top[0] : null, topCount: top ? top[1] : 0, counts: tracker.counts,
      accuracy: acc, bars: [...tracker.bars.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b),
      confusions: tracker.confusions,
    };
    if (summary.top) {
      const ctx = tracker.context;
      this.data.contexts[summary.top] = {
        ref: ctx.ref || null, hands: ctx.hands || 'R', tempo: ctx.tempo || 1, staves: ctx.staves,
        bars: summary.bars.slice(0, 2), confusions: tracker.confusions.slice(-6), topic: tracker.topic || ctx.topic,
        at: Date.now(),
      };
    }
    this._save();
    if (this.current === tracker) this.current = null;
    return summary;
  }

  explain(cat) { return CATEGORIES[cat]?.fix || ''; }

  /** Weak spots ranked by recent weight. */
  weakSpots(limit = 3) {
    const now = Date.now();
    return Object.entries(this.data.cats)
      .map(([cat, c]) => ({ cat, n: c.n, w: c.w * Math.exp(-(now - c.last) / (7 * DAY)), label: CATEGORIES[cat]?.label, fix: CATEGORIES[cat]?.fix }))
      .filter((x) => x.w > 0.8)
      .sort((a, b) => b.w - a.w)
      .slice(0, limit);
  }

  skillLevels() {
    return Object.entries(this.data.skills).map(([skill, s]) => ({ skill, value: s.v, n: s.n })).sort((a, b) => a.value - b.value);
  }

  /**
   * Build a short practice routine aimed at one problem.
   * ctx: { score, hands, bars, confusions, tempo, staves, key, topic }
   * Returns { title, steps } in lesson-step format (steps may carry a ready `score`).
   */
  remedy(cat, ctx = {}) {
    const key = ctx.key || ctx.score?.key || 'C';
    const hands = ctx.hands || 'R';
    const tempo = ctx.score?.tempo || 80;
    const staves = ctx.staves || (hands === 'L' ? 'bass' : hands === 'R' ? 'treble' : 'grand');
    const bars = ctx.bars && ctx.bars.length ? ctx.bars : [0];
    const lo = Math.max(0, Math.min(...bars)), hi = Math.min(lo + 1, Math.max(...bars));
    const passage = ctx.score ? excerpt(ctx.score, lo, hi, hands) : null;
    const usable = passage && passage.notes.length >= 2;
    const conf = (ctx.confusions || []).filter(([e]) => e !== undefined);
    const expected = [...new Set(conf.map(([e]) => e))].slice(0, 4);
    const steps = [];
    const where = usable ? `bar${lo === hi ? '' : 's'} ${lo + 1}${lo === hi ? '' : `–${hi + 1}`}` : '';

    const readingPool = () => {
      const pool = new Set(expected);
      for (const [e, p] of conf.slice(-4)) { pool.add(e); if (Math.abs(p - e) <= 7) pool.add(p); }
      if (pool.size < 3) for (const e of expected) [e - 2, e + 2].forEach((m) => { if (!isBlack(m)) pool.add(m); });
      return [...pool].filter((m) => m >= 36 && m <= 88);
    };

    switch (cat) {
      case 'reading': case 'line-space': case 'octave': {
        const pool = readingPool();
        if (pool.length) {
          if (cat === 'line-space') steps.push({ type: 'say', text: 'Notes on lines sit on a line; space notes sit between two. Count up or down from a note you know: line, space, line. These are the notes that got mixed up.' });
          if (cat === 'octave') steps.push({ type: 'say', text: 'The same letter repeats every eight white keys. Find the exact one: its height on the staff tells you which octave, and ledger lines count as extra staff lines.' });
          steps.push({ type: 'find', notes: expected.length ? expected : pool.slice(0, 3), show: 'both', key, text: 'Watch where each one sits, then play it.' });
          steps.push({ type: 'find', pool, count: 8, show: 'staff', key, text: 'Now from the staff alone.' });
        }
        break;
      }
      case 'accidental': {
        steps.push({ type: 'say', text: key !== 'C' && key !== 'Am'
          ? `This piece is in ${key.replace('b', '♭').replace('m', ' minor')}. The sharps or flats at the start of each line apply to every note with that letter, all the way through.`
          : 'A sharp moves a note to the very next key on the right, a flat to the very next key on the left. A natural sign cancels them.' });
        const pool = new Set([...expected, ...conf.map(([, p]) => p)].filter((m) => m >= 48 && m <= 84));
        if (passage) passage.notes.filter((n) => isBlack(n.midi)).forEach((n) => pool.add(n.midi));
        if (pool.size < 2) [61, 63, 66, 68, 70].forEach((m) => pool.add(m));
        steps.push({ type: 'find', pool: [...pool], count: 8, show: 'staff', key, text: 'Read each note, sharps and flats included.' });
        break;
      }
      case 'neighbor': case 'missed': case 'chord': {
        if (usable) {
          steps.push({ type: 'seq', score: passage, staves, text: `Slowly, ${where} only. Look at each note before you play it, and use the finger numbers.` });
          steps.push({ type: 'seq', score: passage, staves, text: 'Once more, a little more smoothly.' });
          steps.push({ type: 'rhythm', score: passage, staves, tempoScale: 0.7, text: 'Now in time, at a slower tempo.' });
        } else {
          steps.push({ type: 'seq', rh: 'C4q:1 D4:2 E4:3 F4:4 | G4:5 F4:4 E4:3 D4:2 | C4q:1 E4:3 D4:2 F4:4 | E4:3 G4:5 C4h:1', text: 'Keep each finger over its own key. Slow and exact beats fast and sloppy.' });
        }
        break;
      }
      case 'early': case 'late': {
        steps.push({ type: 'say', text: cat === 'early'
          ? 'Rushing usually means the hands move before the beat arrives. Listen for the click and let it land first, then play.'
          : 'Dragging usually comes from looking for the next note too late. Look one note ahead while you play.' });
        if (usable) {
          steps.push({ type: 'tap', score: passage, tempoScale: 0.75, text: `Tap the rhythm of ${where} on any key. Only the timing counts.` });
          steps.push({ type: 'rhythm', score: passage, staves, tempoScale: 0.8, text: 'Now with the real notes, still a little slower.' });
        } else {
          steps.push({ type: 'tap', rh: 'B4q B4 B4 B4 | B4h B4h | B4q B4 B4h | B4w', tempo: 72, text: 'Tap on any key, right with the clicks.' });
        }
        break;
      }
      case 'short': {
        steps.push({ type: 'say', text: 'Long notes need their full value. Keep the key down and count through the note: a half note is “one, two”, a whole note “one, two, three, four”.' });
        steps.push({ type: 'rhythm', rh: 'C4w | E4h G4h | E4h. rq | C4w', tempo: 72, text: 'Hold each note right up to the next one.' });
        if (usable) steps.push({ type: 'rhythm', score: passage, staves, tempoScale: 0.8, text: `Now ${where}, holding every long note.` });
        break;
      }
      case 'rest': {
        steps.push({ type: 'say', text: 'A rest is silence you count. Lift your hand off the keys during a rest and keep counting in your head.' });
        steps.push({ type: 'tap', rh: 'B4q rq B4q rq | B4h rh | B4q B4 rh | B4w', tempo: 76, text: 'Tap the notes and stay silent through the rests.' });
        if (usable) steps.push({ type: 'tap', score: passage, tempoScale: 0.8, text: `The rhythm of ${where}, rests included.` });
        break;
      }
      case 'hands': {
        steps.push({ type: 'say', text: 'When notes line up vertically, both hands press at exactly the same moment. Get both hands ready over their keys first, then play together.' });
        if (usable) {
          steps.push({ type: 'seq', score: passage, staves: 'grand', text: `${where[0].toUpperCase() + where.slice(1)}, hands together, as slowly as you like.` });
          steps.push({ type: 'rhythm', score: passage, staves: 'grand', tempoScale: 0.7, text: 'Now in time, slower.' });
        } else {
          steps.push({ type: 'seq', rh: 'C4q:1 D4:2 E4:3 F4:4 | G4w:5', lh: 'C3q:5 B2:1 C3:5 D3:4 | C3w:5', text: 'Hands together, landing at the same moment.' });
        }
        break;
      }
      case 'dynamics': {
        steps.push({ type: 'say', text: 'Loud and soft come from how fast the key goes down. For p (soft), sink in gently; for f (loud), drop in with weight from the arm.' });
        steps.push({ type: 'rhythm', rh: '!p C4q E4 G4 E4 | C4w | !f C4q E4 G4 E4 | C4w', tempo: 80, text: 'Soft, then loud. Make the difference obvious.' });
        break;
      }
      case 'quiz': {
        steps.push({ type: 'quiz', generator: ctx.topic || 'treble-notes', count: 6, text: 'A quick review.' });
        break;
      }
      default: break;
    }
    if (!steps.length) return null;
    return { title: `Practice: ${CATEGORIES[cat]?.label || cat}`, steps, cat };
  }

  /** Mixed routine from recent weak spots, resolving stored contexts to scores. */
  todaysPractice(resolveScore) {
    const spots = this.weakSpots(2);
    const steps = [];
    for (const s of spots) {
      const c = this.data.contexts[s.cat] || {};
      const score = c.ref ? resolveScore(c.ref) : null;
      const r = this.remedy(s.cat, { ...c, score });
      if (r) steps.push({ type: 'say', text: `${s.label}: ${s.fix}` }, ...r.steps.filter((x) => x.type !== 'say'));
    }
    return steps.length ? { title: 'Today’s practice', steps, spots } : null;
  }
}

export { buildScore, noteName };
