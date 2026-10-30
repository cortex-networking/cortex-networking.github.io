// session.js: wait / play / tap engine with a fake audio clock.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../js/session.js';
import { buildScore } from '../js/theory.js';
import { catalog } from '../js/catalog.js';
import { fakeApp } from './helpers.mjs';

function setup(def, opts = {}, { latency = 0, inputLatency = 0 } = {}) {
  const app = fakeApp({ latency, settings: { latency: inputLatency } });
  const coached = [];
  app.coach = { begin: () => ({}), record: (type, info) => coached.push([type, info]), end: () => ({ top: null }) };
  const score = buildScore({ tempo: 60, ...def });
  const done = [];
  const s = new Session(app, score, { hands: 'R', metronome: true, onDone: (r) => done.push(r), ...opts });
  s.mount();
  return { app, s, score, done, coached };
}
/** AudioContext time at which practice note k should be heard. */
const due = (s, n) => s.t0 + n.t * s.spb + s.app.sound.latency;
function press(s, midi, at, { vel = 0.75, source = 'midi' } = {}) {
  s.app.clock.t = at;
  s.noteOn(midi, performance.now(), vel, source);
}
function run(s, until, dt = 0.02) {
  while (s.app.clock.t < until) { s.app.clock.t += dt; s.tick(dt); }
}

describe('play mode timing grades', () => {
  test('perfect, good (late), ok (early), outside the window, missed', () => {
    const { s } = setup({ rh: 'C4q D4 E4 F4 | C5w' }, { mode: 'play' });
    s.start();
    const [c, d, e, f] = s.practice;
    press(s, 60, due(s, c));
    press(s, 62, due(s, d) + 0.10);
    press(s, 64, due(s, e) - 0.20);
    press(s, 65, due(s, f) + 0.30);
    run(s, due(s, s.practice[4]) + 1);
    const st = s.stats;
    assert.deepEqual([st.perfect, st.good, st.ok, st.wrong, st.missed, st.correct], [1, 1, 1, 1, 2, 3]);
  });

  test('wrong pitch at the right time is wrong, and the coach hears which note was expected', () => {
    const { s, coached } = setup({ rh: 'C4q D4 E4 F4' }, { mode: 'play' });
    s.start();
    press(s, 61, due(s, s.practice[0]));
    assert.equal(s.stats.wrong, 1);
    assert.deepEqual(coached.at(-1), ['wrong-pitch', { key: 'C', expected: 60, played: 61, t: 0 }]);
  });

  test('output latency: the target is when the beat is heard', () => {
    const { s } = setup({ rh: 'C4q D4' }, { mode: 'play' }, { latency: 0.08 });
    s.start();
    press(s, 60, s.t0 + 0.08);
    assert.equal(s.stats.perfect, 1);
    press(s, 62, s.t0 + 1); // heard at +1.08, so 80 ms early
    assert.equal(s.stats.good, 1);
  });

  test('input latency setting is subtracted from key presses', () => {
    const { s } = setup({ rh: 'C4q D4' }, { mode: 'play' }, { inputLatency: 50 });
    s.start();
    press(s, 60, due(s, s.practice[0]) + 0.05);
    assert.equal(s.stats.perfect, 1);
  });

  test('with input latency compensation, a late note inside the window is not also marked missed', () => {
    // a key pressed 200 ms late reaches the app 100 ms after that (the latency setting);
    // the missed-note sweep must wait for it instead of failing the note first
    const { s, coached } = setup({ rh: 'C4q rq rh | C5w' }, { mode: 'play' }, { inputLatency: 100 });
    s.start();
    const target = due(s, s.practice[0]);
    run(s, target + 0.25);
    press(s, 60, target + 0.30);
    assert.deepEqual([s.stats.ok, s.stats.missed, s.stats.wrong], [1, 0, 0], JSON.stringify(s.stats));
    assert.ok(!coached.some(([t]) => t === 'missed'));
  });

  test('a press in a rest is a rest mistake', () => {
    const { s, coached } = setup({ rh: 'C4q rq E4h' }, { mode: 'play' });
    s.start();
    press(s, 64, s.t0 + 1.3 * s.spb);
    assert.deepEqual([s.stats.wrong, s.stats.rest], [1, 1]);
    assert.equal(coached.at(-1)[0], 'rest');
  });

  test('hands together: more than 90 ms apart is a sync slip', () => {
    const a = setup({ rh: 'C4w', lh: 'C3w' }, { mode: 'play', hands: 'B' });
    a.s.start();
    press(a.s, 60, a.s.t0);
    press(a.s, 48, a.s.t0 + 0.12);
    assert.equal(a.s.stats.sync, 1);
    const b = setup({ rh: 'C4w', lh: 'C3w' }, { mode: 'play', hands: 'B' });
    b.s.start();
    press(b.s, 60, b.s.t0);
    press(b.s, 48, b.s.t0 + 0.04);
    assert.equal(b.s.stats.sync, 0);
  });

  test('holding: letting a long note go early is reported, a full hold is not', () => {
    const { s } = setup({ rh: 'C4w D4w' }, { mode: 'play' });
    s.start();
    s.app.clock.t = s.t0;
    const t1 = performance.now();
    s.noteOn(60, t1, 0.7, 'midi');
    s.noteOff(60, t1 + 1000);
    assert.equal(s.stats.short, 1);
    s.app.clock.t = s.t0 + 4;
    const t2 = performance.now();
    s.noteOn(62, t2, 0.7, 'midi');
    s.noteOff(62, t2 + 3500);
    assert.equal(s.stats.short, 1);
  });

  test('a tied note is held for its whole tied length', () => {
    const { s } = setup({ rh: 'C4h~ C4h | D4w' }, { mode: 'play' });
    s.start();
    s.app.clock.t = s.t0;
    const t = performance.now();
    s.noteOn(60, t, 0.7, 'midi');
    s.noteOff(60, t + 1900); // half of the tied whole note
    assert.equal(s.stats.short, 1);
  });

  test('loud and soft: judged on a real keyboard only', () => {
    const { s } = setup({ rh: '!p C4q D4 !f E4 F4' }, { mode: 'play' });
    s.start();
    press(s, 60, due(s, s.practice[0]), { vel: 0.95 });
    press(s, 62, due(s, s.practice[1]), { vel: 0.95, source: 'pc' });
    press(s, 64, due(s, s.practice[2]), { vel: 0.3 });
    assert.equal(s.stats.loud, 2);
  });

  test('score and stars', () => {
    const { s, done } = setup({ rh: 'C4q D4 E4 F4' }, { mode: 'play' });
    s.start();
    for (const n of s.practice) press(s, n.midi, due(s, n));
    run(s, s.t0 + 6);
    assert.equal(done.length, 0, 'finishes a moment after the end');
    return new Promise((resolve) => setTimeout(() => {
      assert.equal(done.length, 1);
      assert.deepEqual([done[0].score, done[0].stars, done[0].perfect], [1, 3, 4]);
      resolve();
    }, 350));
  });
});

describe('tap mode', () => {
  test('any key counts; each onset is one step', () => {
    const { s } = setup({ rh: 'C4q D4 E4+G4h' }, { mode: 'tap' });
    s.start();
    assert.equal(s.stats.total, 3);
    for (const st of s.steps) press(s, 99, s.t0 + st.t * s.spb);
    assert.equal(s.stats.perfect, 3);
  });
});

describe('wait mode', () => {
  test('waits for each note; chords need every note; wrong keys are counted', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { s, done } = setup({ rh: 'C4+E4q G4q' }, { mode: 'wait' });
    s.start();
    s.noteOn(60);
    assert.equal(s.idx, 0);
    s.noteOn(64);
    assert.equal(s.idx, 1);
    s.noteOn(61);
    assert.equal(s.stats.wrong, 1);
    s.noteOn(67);
    t.mock.timers.tick(600);
    assert.equal(done.length, 1);
    assert.deepEqual([done[0].correct, done[0].wrong, done[0].score, done[0].stars], [3, 1, 0.75, 1]);
  });

  test('pressing a chord note twice is neither progress nor a mistake', () => {
    const { s } = setup({ rh: 'C4+E4q G4q' }, { mode: 'wait' });
    s.start();
    s.noteOn(60); s.noteOn(60);
    assert.deepEqual([s.idx, s.stats.wrong, s.stats.correct], [0, 0, 1]);
  });

  test('restarting just after the last note does not finish the new run', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { s, done } = setup({ rh: 'C4q D4q' }, { mode: 'wait' });
    s.start();
    s.noteOn(60); s.noteOn(62);   // last note: finish is scheduled
    s.start();                    // learner hits Restart straight away
    t.mock.timers.tick(1000);
    assert.equal(done.length, 0, 'the old run\'s finish timer must not end the new run');
    assert.equal(s.running, true);
  });

  test('stopping just after the last note does not report a result', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { s, done } = setup({ rh: 'C4q' }, { mode: 'wait' });
    s.start();
    s.noteOn(60);
    s.stop();
    t.mock.timers.tick(1000);
    assert.equal(done.length, 0);
  });
});

describe('restart in play mode', () => {
  test('restarting right after the end does not finish the new run', (t) => {
    const { s, done } = setup({ rh: 'C4q D4q' }, { mode: 'play' });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    s.start();
    run(s, s.t0 + 3);   // past the end: finish is scheduled for 300 ms later
    s.start();
    t.mock.timers.tick(1000);
    assert.equal(done.length, 0);
  });
});

describe('count-in and metronome', () => {
  function clicks(def, opts = {}) {
    const { s, app, score } = setup(def, { mode: 'play', ...opts });
    s.start();
    run(s, s.t0 + (score.length + 1) * s.spb, 0.05);
    const out = app.calls.filter((c) => c[0] === 'sound' && c[1] === 'click')
      .map(([, , [when, down]]) => ({ beat: Math.round(((when - s.t0) / s.spb) * 1000) / 1000, down }));
    return { s, score, out };
  }

  test('count-in length for each meter', () => {
    const lead = (time, pickup = 0, rh = 'C4q') => setup({ rh, time, pickup }, { mode: 'play' }).s.countInBeats;
    assert.equal(lead([4, 4]), 4);
    assert.equal(lead([3, 4]), 3);
    assert.equal(lead([2, 4]), 4);
    assert.equal(lead([2, 2]), 4);
    assert.equal(lead([6, 8]), 6);
    assert.equal(lead([12, 8]), 6);
    assert.equal(lead([3, 8]), 1.5);
  });

  test('without a pickup: clicks on every beat, accents on every downbeat', () => {
    const { out, score } = clicks({ rh: 'C4w | D4w', time: [4, 4] });
    assert.deepEqual(out.map((c) => c.beat), [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(out.filter((c) => c.down).map((c) => c.beat), [-4, 0, 4]);
    assert.equal(score.pickup, 0);
  });

  for (const id of ['greensleeves', 'battle-hymn', 'william-tell-finale', 'when-the-saints', 'wellerman', 'fur-elise', 'bella-ciao', 'rachmaninoff-prelude']) {
    test(`${id}: the metronome follows the bars of a song with a pickup`, () => {
      const def = catalog.song(id);
      const { out, score, s } = clicks({ ...def, tempo: 60 });
      const unit = s.clickUnit, bpb = score.bpb, pk = score.pickup;
      const mod = (x, m) => ((x % m) + m) % m;
      // every click on the beat grid of the bars (bars start at the pickup)
      for (const c of out) assert.ok(Math.abs(mod(c.beat - pk + 1e-9, unit)) < 1e-6, `click at beat ${c.beat} is off the beat (pickup ${pk}, beat unit ${unit})`);
      // accents exactly on downbeats, including the first click of the count-in
      for (const c of out) assert.equal(c.down, Math.abs(mod(c.beat - pk + 1e-9, bpb)) < 1e-6, `click at ${c.beat}`);
      assert.equal(out[0].down, true, 'the count-in starts on a downbeat');
      // at least one full bar of count-in before the pickup bar
      assert.ok(s.countInBeats >= bpb);
      assert.ok(out.some((c) => c.down && c.beat > 0), 'downbeats are accented during the song');
    });
  }

  test('the big count-in numbers count each bar from 1', () => {
    const { s, app } = setup({ rh: 'C4q | D4w', pickup: 1 }, { mode: 'play' });
    s.start();
    run(s, s.t0, 0.05);
    const nums = app.calls.filter((c) => c[0] === 'ui' && c[1] === 'big' && c[2][1] === 'Count in').map((c) => c[2][0]);
    assert.deepEqual(nums, ['1', '2', '3', '4', '1', '2', '3']);
  });
});

describe('listen mode', () => {
  test('plays every note itself and grades nothing', () => {
    const { s, app } = setup({ rh: 'C4q D4', lh: 'C3h' }, { mode: 'listen' });
    s.start();
    assert.equal(s.practice.length, 0);
    assert.equal(s.other.length, 3);
    run(s, s.t0 + 3);
    assert.equal(app.calls.filter((c) => c[0] === 'sound' && c[1] === 'play').length, 3);
    assert.equal(app.calls.filter((c) => c[0] === 'sound' && c[1] === 'click').length, 0);
    s.noteOn(60);
    assert.equal(s.stats.wrong, 0);
  });
});
