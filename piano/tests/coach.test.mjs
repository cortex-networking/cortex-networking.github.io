// coach.js: mistake taxonomy, excerpts, remedies, today's practice.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, CATEGORIES, classifyPitch, excerpt, barOf } from '../js/coach.js';
import { buildScore } from '../js/theory.js';
import { catalog } from '../js/catalog.js';
import { stepProblems } from './validate.mjs';

const coaches = [];
function makeCoach(data = {}) {
  const store = { data, saves: 0, save() { this.saves++; } };
  const c = new Coach({ store });
  coaches.push(c);
  return c;
}
afterEach(() => { for (const c of coaches.splice(0)) clearTimeout(c.saveTimer); });

describe('classifyPitch', () => {
  test('octave: same letter, different octave', () => {
    assert.equal(classifyPitch(60, 72), 'octave');
    assert.equal(classifyPitch(64, 52), 'octave');
    assert.equal(classifyPitch(60, 84), 'octave');
  });
  test('accidental: the sharp/flat was missed or added (same letter, one key away)', () => {
    assert.equal(classifyPitch(66, 65, 'G'), 'accidental', 'F♯ in G played as F');
    assert.equal(classifyPitch(65, 66, 'C'), 'accidental', 'F played as F♯');
    assert.equal(classifyPitch(70, 71, 'F'), 'accidental', 'B♭ in F played as B');
    assert.equal(classifyPitch(61, 60, 'Dm'), 'accidental', 'C♯ (leading tone) in D minor played as C');
    assert.equal(classifyPitch(66, 65, 'Gm'), 'accidental', 'F♯ (leading tone) in G minor played as F');
    assert.equal(classifyPitch(68, 67, 'Am'), 'accidental', 'G♯ in A minor played as G');
  });
  test('neighbor: the key next door (a step on the staff)', () => {
    assert.equal(classifyPitch(64, 65), 'neighbor');
    assert.equal(classifyPitch(64, 62), 'neighbor');
    assert.equal(classifyPitch(60, 62), 'neighbor');
    assert.equal(classifyPitch(71, 72), 'neighbor');
    assert.equal(classifyPitch(62, 61, 'C'), 'neighbor', 'D played as C♯: different letter');
  });
  test('line-space: two staff steps away (a third)', () => {
    assert.equal(classifyPitch(60, 64), 'line-space');
    assert.equal(classifyPitch(67, 71), 'line-space');
    assert.equal(classifyPitch(53, 50), 'line-space');
  });
  test('reading: anything further', () => {
    assert.equal(classifyPitch(60, 67), 'reading');
    assert.equal(classifyPitch(60, 69), 'reading');
    assert.equal(classifyPitch(72, 65), 'reading');
  });
  test('every result is a category the coach knows', () => {
    for (let e = 48; e <= 84; e++) for (let p = 36; p <= 96; p++) if (p !== e) assert.ok(CATEGORIES[classifyPitch(e, p, 'Eb')]);
  });
});

describe('excerpt and barOf', () => {
  const score = buildScore({ rh: 'G4q | C5h E5h | G5w~ | G5h C5h | D5w', pickup: 1 });
  test('barOf counts the pickup as bar 0', () => {
    assert.equal(barOf(score, 0), 0);
    assert.equal(barOf(score, 1), 1);
    assert.equal(barOf(score, 4.9), 1);
    assert.equal(barOf(score, 5), 2);
    assert.equal(barOf(score, 16), 4);
  });
  test('cuts whole bars, rebases time and indexes', () => {
    const ex = excerpt(score, 1, 2);
    assert.equal(ex.length, 8);
    assert.equal(ex.pickup, 0);
    assert.deepEqual(ex.barlines, [4]);
    assert.deepEqual(ex.notes.map((n) => [n.t, n.midi]), [[0, 72], [2, 76], [4, 79]]);
    ex.events.forEach((e, i) => assert.equal(e.i, i));
    // the original is untouched
    assert.equal(score.events[1].t, 1);
  });
  test('a tie cut off by the end of the excerpt only rings to the end of the excerpt', () => {
    const ex = excerpt(score, 2, 2);
    assert.equal(ex.notes.length, 1);
    assert.equal(ex.notes[0].tieTo, undefined);
    assert.equal(ex.notes[0].sd ?? ex.notes[0].d, 4, 'G5 is held for its own bar, not into a bar that is not there');
  });
  test('a continuation whose tie starts before the excerpt becomes a played note', () => {
    const ex = excerpt(score, 3, 3);
    assert.deepEqual(ex.notes.map((n) => [n.t, n.midi]), [[0, 79], [2, 72]]);
    assert.equal(ex.notes[0].tiedFrom, undefined);
  });
  test('ties inside the excerpt are kept', () => {
    const ex = excerpt(score, 2, 3);
    const g = ex.notes.find((n) => n.midi === 79);
    assert.ok(g.tieTo);
    assert.equal(g.sd, 6);
    assert.equal(ex.notes.length, 2);
  });
  test('one hand only', () => {
    const s = buildScore({ rh: 'C5w | D5w', lh: 'C3w | G2w' });
    const ex = excerpt(s, 1, 1, 'L');
    assert.deepEqual(ex.notes.map((n) => n.midi), [43]);
    assert.deepEqual(ex.hands, { R: false, L: true });
  });
});

describe('record, end, weakSpots', () => {
  test('wrong notes are classified, counted and remembered as confusions', () => {
    const c = makeCoach();
    const score = buildScore({ rh: 'C4q D4 E4 F4 | G4w' });
    const tr = c.begin({ score, ref: { type: 'song', id: 'x' }, hands: 'R' });
    c.record('hit', {}, tr);
    assert.equal(c.record('wrong-pitch', { expected: 64, played: 65, key: 'C', t: 2 }, tr), 'neighbor');
    assert.equal(c.record('wrong-pitch', { expected: 64, played: 65, key: 'C', t: 2 }, tr), 'neighbor');
    assert.equal(c.record('late', { ms: 120, t: 4 }, tr), 'late');
    assert.equal(c.record('nonsense', {}, tr), null);
    const sum = c.end(tr, { score: 0.6, skills: ['sight-reading'] });
    assert.equal(sum.top, 'neighbor');
    assert.equal(sum.topCount, 2);
    assert.deepEqual(sum.bars, [0, 1]);
    assert.deepEqual(sum.confusions, [[64, 65], [64, 65]]);
    assert.equal(c.data.confusions['64>65'], 2);
    assert.equal(c.data.contexts.neighbor.ref.id, 'x');
    assert.ok(c.data.skills['sight-reading'].n === 1);
    assert.ok(c.data.skills['finger-numbers'], 'the top category\'s skill is updated too');
    assert.equal(c.current, null);
    assert.deepEqual(c.weakSpots().map((w) => w.cat), ['neighbor', 'late']);
    assert.deepEqual(c.weakSpots(1).map((w) => w.cat), ['neighbor']);
  });
  test('quiz answers: right ones only count, wrong ones become the quiz category', () => {
    const c = makeCoach();
    const tr = c.begin({});
    assert.equal(c.record('quiz', { topic: 'intervals', correct: true }, tr), null);
    assert.equal(c.record('quiz', { topic: 'intervals', correct: false }, tr), 'quiz');
    assert.deepEqual(c.data.quiz.intervals, { right: 1, wrong: 1 });
    const sum = c.end(tr);
    assert.equal(sum.top, 'quiz');
    assert.equal(c.data.contexts.quiz.topic, 'intervals');
  });
  test('end with nothing recorded is harmless', () => {
    const c = makeCoach();
    const sum = c.end(c.begin({}));
    assert.equal(sum.top, null);
    assert.equal(sum.accuracy, 1);
    assert.equal(c.end(null), null);
  });
});

describe('remedy', () => {
  const songs = ['ode-to-joy', 'au-clair', 'hall-of-the-mountain-king', 'fur-elise', 'dies-irae', 'iron-riff', 'greensleeves', 'moonlight-sonata'].map((id) => catalog.song(id));

  function check(routine, label) {
    if (routine === null) return;
    assert.ok(routine.title && routine.cat, `${label}: title/cat`);
    assert.ok(Array.isArray(routine.steps) && routine.steps.length > 0, `${label}: steps`);
    const problems = routine.steps.flatMap((st, i) => stepProblems(st).map((p) => `step ${i + 1} (${st.type}${st.game ? ` ${st.game}` : ''}): ${p}`));
    assert.deepEqual(problems, [], label);
  }

  for (const cat of Object.keys(CATEGORIES)) {
    test(`${cat}: no context`, () => {
      const c = makeCoach();
      const r = c.remedy(cat, {});
      // pitch-reading categories need the confused notes; a topic-less quiz has nothing to drill
      if (!['quiz', 'reading', 'line-space', 'octave'].includes(cat)) assert.ok(r, 'a generic routine');
      if (['reading', 'line-space', 'octave'].includes(cat)) check(c.remedy(cat, { confusions: [[64, 67], [60, 72]] }), `${cat} confusions only`);
      check(r, `${cat} {}`);
    });

    test(`${cat}: with a song excerpt, every hand, confusions and bars`, () => {
      const c = makeCoach();
      for (const def of songs) {
        const score = buildScore(def);
        for (const hands of ['R', 'L', 'B']) {
          const exp = score.notes.find((n) => hands === 'B' || n.hand === hands)?.midi ?? 60;
          for (const bars of [[0], [2, 3], [5], [999]]) {
            const r = c.remedy(cat, { score, hands, bars, confusions: [[exp, exp + 1], [exp, exp + 12], [exp, exp - 3]], key: score.key, topic: 'intervals' });
            check(r, `${cat} ${def.id} ${hands} bars ${bars}`);
          }
        }
      }
    });
  }

  test('a passage remedy names the bars it practises', () => {
    const c = makeCoach();
    const score = buildScore(catalog.song('ode-to-joy'));
    const r = c.remedy('neighbor', { score, hands: 'R', bars: [2] });
    assert.match(r.steps[0].text, /bar 3 only/);
    assert.ok(r.steps[0].score.notes.length >= 2);
  });

  test('bars past the end of the piece do not turn the whole piece into "the tricky part"', () => {
    const c = makeCoach();
    const score = buildScore(catalog.song('ode-to-joy'));
    const r = c.remedy('missed', { score, hands: 'R', bars: [40] });
    for (const st of r.steps) if (st.score) assert.ok(st.score.length <= 2 * score.bpb, `excerpt of ${st.score.length} beats`);
  });

  test('a hands-together remedy practises both hands in its timed steps too', () => {
    // lesson.js _timed() practises only the right hand of a two-hand score unless the step says hands: 'B'
    const c = makeCoach();
    const score = buildScore(catalog.song('ode-to-joy'));
    for (const cat of ['hands', 'neighbor', 'missed', 'chord']) {
      const r = c.remedy(cat, { score, hands: 'B', bars: [2] });
      const timed = r.steps.filter((s) => s.type === 'rhythm' && s.score);
      assert.ok(timed.length, `${cat} has a timed step`);
      for (const s of timed) assert.equal(s.hands, 'B', `${cat}: "${s.text}"`);
    }
    // one hand stays one hand
    const left = c.remedy('neighbor', { score, hands: 'L', bars: [2] });
    for (const s of left.steps.filter((x) => x.type === 'rhythm' && x.score)) assert.ok(!s.hands || s.hands === 'L');
  });

  test('a quiz remedy reuses a real generator topic', () => {
    const r = makeCoach().remedy('quiz', { topic: 'key-signatures' });
    assert.equal(r.steps[0].generator, 'key-signatures');
  });

  test('a quiz made of the lesson\'s own questions does not get an unrelated staff-reading quiz', () => {
    // QuizRunner files item-based lesson quizzes under the topic "quiz"; lesson 1 has not taught the staff yet
    const c = makeCoach();
    for (const topic of [undefined, 'quiz']) {
      const r = c.remedy('quiz', { topic });
      assert.ok(!r || !r.steps.some((s) => s.type === 'quiz' && (s.generator === 'treble-notes' || s.generator === 'quiz')), `topic ${topic}`);
    }
  });
});

describe('todaysPractice', () => {
  test('empty data: nothing to practise', () => {
    const c = makeCoach();
    assert.equal(c.todaysPractice(() => null), null);
    const c2 = makeCoach({ coach: { cats: {}, skills: {}, contexts: {}, confusions: {}, quiz: {} } });
    assert.equal(c2.todaysPractice(() => null), null);
  });
  test('weak spots become a routine, resolving stored song references', () => {
    const c = makeCoach();
    const score = buildScore(catalog.song('ode-to-joy'));
    for (let k = 0; k < 3; k++) {
      const tr = c.begin({ score, ref: { type: 'song', id: 'ode-to-joy' }, hands: 'R' });
      c.record('wrong-pitch', { expected: 64, played: 65, key: 'C', t: 9 }, tr);
      c.record('early', { ms: -90, t: 9 }, tr);
      c.record('early', { ms: -90, t: 10 }, tr);
      c.end(tr);
    }
    const asked = [];
    const r = c.todaysPractice((ref) => { asked.push(ref); return ref.type === 'song' ? buildScore(catalog.song(ref.id)) : null; });
    assert.ok(r);
    assert.equal(r.title, 'Today’s practice');
    assert.deepEqual(r.spots.map((s) => s.cat).sort(), ['early', 'neighbor']);
    assert.ok(asked.length >= 1 && asked.every((a) => a.id === 'ode-to-joy'));
    const problems = r.steps.flatMap((st, i) => stepProblems(st).map((p) => `step ${i + 1}: ${p}`));
    assert.deepEqual(problems, []);
  });
  test('a stored reference that no longer resolves still gives a routine', () => {
    const c = makeCoach();
    const tr = c.begin({ ref: { type: 'song', id: 'deleted-song' } });
    c.record('short', { ratio: 0.3 }, tr); c.record('short', { ratio: 0.3 }, tr);
    c.end(tr);
    const r = c.todaysPractice(() => null);
    assert.ok(r && r.steps.length);
  });
});
