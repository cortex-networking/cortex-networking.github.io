// songmode.js songPath(): the "Learn it with games" routine for every song.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { songPath } from '../js/songmode.js';
import { buildScore } from '../js/theory.js';
import { catalog } from '../js/catalog.js';
import { Game as Ripchord } from '../js/game-ripchord.js';
import { stepProblems } from './validate.mjs';

function appWith(data = {}) {
  return { store: { data, saves: 0, save() { this.saves++; } } };
}

describe('songPath for every song', () => {
  for (const song of catalog.songs) {
    test(song.id, () => {
      const app = appWith();
      const r = songPath(app, song);
      const score = buildScore(song);
      const both = score.hands.R && score.hands.L;
      assert.equal(r.title, song.title);
      assert.ok(r.steps.length >= 4);
      const problems = r.steps.flatMap((st, i) => stepProblems(st).map((p) => `step ${i + 1} (${st.type} ${st.game || st.mode}): ${p}`));
      assert.deepEqual(problems, []);
      r.steps.forEach((st, i) => {
        assert.match(st.text, new RegExp(`^Step ${i + 1} of ${r.steps.length}: `));
        if (st.type === 'game' || st.type === 'song') assert.equal(st.params?.song ?? st.song, song.id, 'every step teaches this song');
      });
      // the left hand only when the song has one
      const leftSteps = r.steps.filter((st) => st.params?.hands === 'L' || st.hands === 'L' || st.hands === 'B');
      if (!both) assert.equal(leftSteps.length, 0);
      else assert.ok(leftSteps.length >= 2, 'left-hand ducks and hands-together wait mode');
      // Ripchord only when it can really play this song's chords (else it would quietly pick another song)
      const rip = r.steps.some((st) => st.game === 'ripchord');
      assert.equal(rip, Ripchord.prototype.songFilter.call(null, song), `ripchord step ${rip ? 'present' : 'missing'}`);
      if (rip) assert.ok(new Set(String(song.chords).split(/[|\s]+/).map((t) => t.split(':')[0]).filter((t) => t && t !== 'N.C.')).size >= 2);
      // last step: play along
      assert.deepEqual([r.steps.at(-1).type, r.steps.at(-1).mode], ['song', 'play']);
    });
  }
});

describe('songPath progress', () => {
  test('resumes where the learner left off and restarts once done', () => {
    const song = catalog.song('ode-to-joy');
    const app = appWith();
    const r = songPath(app, song);
    assert.equal(r.startAt, 0);
    r.onProgress(3);
    assert.equal(app.store.data.songPaths['ode-to-joy'].step, 3);
    assert.equal(songPath(app, song).startAt, 3);
    r.onDone(0.7);
    const p = app.store.data.songPaths['ode-to-joy'];
    assert.deepEqual([p.done, p.step, p.best], [true, 0, 0.7]);
    assert.equal(songPath(app, song).startAt, 0);
    songPath(app, song).onDone(0.5);
    assert.equal(app.store.data.songPaths['ode-to-joy'].best, 0.7, 'best is kept');
  });
  test('songs keep separate progress', () => {
    const app = appWith();
    songPath(app, catalog.song('mary')).onProgress(2);
    songPath(app, catalog.song('twinkle')).onProgress(4);
    assert.equal(songPath(app, catalog.song('mary')).startAt, 2);
    assert.equal(songPath(app, catalog.song('twinkle')).startAt, 4);
  });
  test('a chart with one chord, or one repeated chord with different symbols, gets no Ripchord step', () => {
    const base = { id: 'x', title: 'X', composer: 'Y', level: 1, key: 'C', tempo: 90, rh: 'C4w | E4w', lh: 'C3w | C3w' };
    for (const chords of ['C | C', 'C | C7', 'C | C/E', 'C | N.C.', undefined]) {
      const r = songPath(appWith(), { ...base, chords });
      assert.equal(r.steps.some((s) => s.game === 'ripchord'), false, `chords ${chords}`);
    }
    assert.equal(songPath(appWith(), { ...base, chords: 'C | G' }).steps.some((s) => s.game === 'ripchord'), true);
  });
});
