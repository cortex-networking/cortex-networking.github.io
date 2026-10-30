// lesson.js StepRunner: step transitions, timers, and stale callbacks after skip / exit.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, fakeApp, advance } from './helpers.mjs';

installDom();
const { StepRunner, gradeText, resolveRef } = await import('../js/lesson.js');
const { Coach } = await import('../js/coach.js');

function makeApp() {
  const app = fakeApp();
  app.coach = new Coach(app);
  return app;
}
const calls = (app, obj, method) => app.calls.filter((c) => c[0] === obj && c[1] === method).map((c) => c[2]);
const prompts = (app) => calls(app, 'ui', 'prompt').map((a) => a[0]);
/** The footer button whose label contains `label`, from the latest ui.foot() call. */
function button(app, label) {
  const foot = calls(app, 'ui', 'foot').at(-1) || [];
  const btn = foot.flat().find((n) => n && n.tagName === 'BUTTON' && n.text.includes(label));
  assert.ok(btn, `no "${label}" button in ${foot.filter(Boolean).map((n) => n.text).join(' | ')}`);
  return btn;
}
const note = (r, midi) => r.noteOn({ midi, time: performance.now(), vel: 0.7, source: 'midi' });

describe('StepRunner basics', () => {
  test('say steps continue on the button and the runner reports progress and results', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = makeApp();
    const progress = [];
    let results = null;
    const r = new StepRunner(app, {
      steps: [{ type: 'say', text: 'Hello' }, { type: 'find', notes: [60], show: 'both', text: 'Play C' }],
      onProgress: (i, n) => progress.push([i, n]), onDone: (res) => { results = res; },
    });
    r.start();
    assert.deepEqual(prompts(app).at(-1), 'Hello');
    button(app, 'Continue').click();
    assert.equal(r.i, 1);
    note(r, 60);
    advance(t, 380 + 650 + 10);
    assert.deepEqual(progress, [[0, 2], [1, 2]]);
    assert.deepEqual(results.map((x) => [x.type, x.passed]), [['say', true], ['find', true]]);
  });

  test('skip marks the step skipped and moves on', () => {
    const app = makeApp();
    const r = new StepRunner(app, { steps: [{ type: 'find', notes: [60], text: 'a' }, { type: 'say', text: 'b' }] });
    r.start();
    r.skip();
    assert.equal(r.i, 1);
    assert.deepEqual(r.results[0], { score: 0, skipped: true, passed: false });
    assert.equal(prompts(app).at(-1), 'b');
  });

  test('a failed step offers a remedy; finishing it returns to the step', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = makeApp();
    const r = new StepRunner(app, { steps: [{ type: 'find', notes: [64], show: 'staff', text: 'Play E' }, { type: 'say', text: 'next' }] });
    r.start();
    note(r, 65); note(r, 67); note(r, 64);   // 1 of 3: fails the 70% pass mark
    advance(t, 400);
    assert.match(prompts(app).at(-1), /^Not quite yet: 33%/);
    button(app, 'Practice the tricky part').click();
    assert.ok(r.sub, 'remedy routine running');
    while (r.sub && r.sub.i < r.sub.steps.length) r.sub.skip();
    advance(t, 1000);
    assert.equal(r.i, 0);
    assert.equal(prompts(app).at(-1), 'Play E', 'back on the step');
  });

  test('gradeText', () => {
    assert.equal(gradeText({ grade: 'perfect' }), 'Perfect');
    assert.equal(gradeText({ grade: 'good', early: true }), 'A little early');
    assert.equal(gradeText({ grade: 'ok', late: true }), 'A little late');
    assert.equal(gradeText({ grade: 'rest' }), 'That was a rest');
    assert.equal(gradeText({}), '');
  });

  test('resolveRef finds songs and lesson-step music', () => {
    assert.ok(resolveRef({ type: 'song', id: 'mary' }).notes.length);
    assert.equal(resolveRef({ type: 'song', id: 'nope' }), null);
    assert.ok(resolveRef({ type: 'lesson', id: 'c1-2', step: 4 }).notes.length);
    assert.equal(resolveRef({ type: 'lesson', id: 'c1-2', step: 0 }), null);
    assert.equal(resolveRef(null), null);
  });
});

describe('nothing runs after the lesson is closed', () => {
  test('closing right after the last note of a find step does not start the next step', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = makeApp();
    const r = new StepRunner(app, { steps: [{ type: 'find', notes: [60], show: 'both', text: 'Play C' }, { type: 'seq', rh: 'C4q D4', text: 'NEXT STEP' }] });
    r.start();
    note(r, 60);          // correct: the step completes 380 ms later
    r.stop();             // the learner leaves the lesson
    const before = app.calls.length;
    advance(t, 5000);
    assert.ok(!prompts(app).includes('NEXT STEP'), 'next step started after exit');
    assert.equal(r.i, 0);
    assert.deepEqual(app.calls.slice(before).filter((c) => c[0] === 'ui' || c[0] === 'staff').map((c) => c[1]), [], 'no UI drawn after exit');
  });

  test('closing during the pause after a remedy does not reopen the step', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = makeApp();
    const r = new StepRunner(app, { steps: [{ type: 'find', notes: [64], show: 'staff', text: 'Play E' }] });
    r.start();
    note(r, 65); note(r, 67); note(r, 64);
    advance(t, 400);
    button(app, 'Practice the tricky part').click();
    while (r.sub && r.sub.i < r.sub.steps.length) r.sub.skip();   // remedy done: "Now try the step again." then 900 ms
    r.stop();
    const n = prompts(app).length;
    advance(t, 5000);
    assert.equal(prompts(app).length, n, `step reopened after exit: ${prompts(app).slice(n)}`);
  });

  test('closing while a game step is still loading does not start the game', async () => {
    const app = makeApp();
    const r = new StepRunner(app, { steps: [{ type: 'game', game: 'ducks', params: { pool: [60, 62, 64], count: 3 }, text: 'Ducks' }] });
    const errors = [];
    const onErr = (e) => errors.push(e);
    process.on('unhandledRejection', onErr);
    r.start();
    r.stop();
    await new Promise((res) => setTimeout(res, 200));
    process.off('unhandledRejection', onErr);
    assert.equal(r.task, null, 'no game task after exit');
    assert.ok(!calls(app, 'ui', 'head').some(([h]) => h?.kicker === 'Practice game'), 'game entered after exit');
    assert.deepEqual(errors.map(String), []);
  });

  test('closing while a quiz step is still loading does not start the quiz', async () => {
    const app = makeApp();
    const r = new StepRunner(app, { steps: [{ type: 'quiz', generator: 'intervals', count: 3, text: 'Quiz' }] });
    const errors = [];
    const onErr = (e) => errors.push(e);
    process.on('unhandledRejection', onErr);
    r.start();
    r.stop();
    await new Promise((res) => setTimeout(res, 200));
    process.off('unhandledRejection', onErr);
    assert.equal(r.task, null, 'no quiz task after exit');
    assert.ok(!r.tracker, 'no coach tracker left open');
    assert.deepEqual(errors.map(String), []);
  });
});
