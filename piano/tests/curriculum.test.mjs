// Course and catalog integrity: step types, references to songs/games/quiz generators, game
// parameters that each game actually understands, unique ids.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, LESSONS } from '../js/curriculum.js';
import { catalog, FEATURED } from '../js/catalog.js';
import { GENERATORS } from '../js/games-extra.js';
import { GAMES, stepProblems, gameStepProblems } from './validate.mjs';

describe('ids', () => {
  test('chapter and lesson ids are unique', () => {
    const ch = CHAPTERS.map((c) => c.id), ls = LESSONS.map((l) => l.id);
    assert.equal(new Set(ch).size, ch.length);
    assert.equal(new Set(ls).size, ls.length);
  });
  test('every lesson belongs to a chapter; every chapter has lessons, a review and its target tune', () => {
    for (const l of LESSONS) assert.ok(CHAPTERS.some((c) => c.id === l.chapter), `${l.id} chapter ${l.chapter}`);
    for (const c of CHAPTERS) {
      const ls = LESSONS.filter((l) => l.chapter === c.id);
      assert.ok(ls.length > 0, `${c.id} has no lessons`);
      assert.ok(ls.some((l) => l.review), `${c.id} has no review lesson`);
      assert.ok(ls.some((l) => l.steps.some((s) => s.type === 'song' && (s.song === c.target || s.alt === c.target))), `${c.id} never plays its target tune ${c.target}`);
    }
  });
  test('the catalog resolves every lesson', () => {
    assert.equal(catalog.lessons.length, LESSONS.length);
    for (const l of LESSONS) assert.ok(catalog.lesson(l.id));
  });
  test('chapter target and alternate songs exist', () => {
    for (const c of CHAPTERS) {
      assert.ok(catalog.song(c.target), `${c.id} target ${c.target}`);
      if (c.alt) assert.ok(catalog.song(c.alt), `${c.id} alt ${c.alt}`);
      assert.ok(catalog.targetSong(c));
    }
  });
  test('FEATURED songs exist and are not repeated', () => {
    for (const id of FEATURED) assert.ok(catalog.song(id), `featured ${id}`);
    assert.equal(new Set(FEATURED).size, FEATURED.length);
  });
});

describe('lesson steps', () => {
  for (const l of LESSONS) {
    test(l.id, () => {
      const problems = [];
      if (l.staves && !['treble', 'bass', 'grand'].includes(l.staves)) problems.push(`lesson staves ${l.staves}`);
      if (!l.steps.length) problems.push('no steps');
      l.steps.forEach((st, i) => { for (const p of stepProblems(st)) problems.push(`step ${i + 1} (${st.type}): ${p}`); });
      assert.deepEqual(problems, []);
    });
  }
});

describe('games', () => {
  test('every game module loads and has named levels', () => {
    for (const [id, { GAME, Game }] of Object.entries(GAMES)) {
      assert.equal(GAME.id, id);
      assert.equal(typeof Game, 'function');
      assert.ok(GAME.levels.length > 0);
      for (const lv of GAME.levels) assert.ok(lv.name);
    }
  });

  test('the game-step validator catches bad steps (self-check)', () => {
    assert.match(gameStepProblems({ type: 'game', game: 'aliens', params: { level: 8 } }).join(), /out of range/);
    assert.match(gameStepProblems({ type: 'game', game: 'tetris', params: {} }).join(), /no game module/);
    assert.match(gameStepProblems({ type: 'game', game: 'ducks', params: { song: 'nope' } }).join(), /does not exist/);
    assert.match(gameStepProblems({ type: 'game', game: 'roboman', params: { lvl: 1 } }).join(), /ignores param "lvl"/);
    assert.match(stepProblems({ type: 'quiz', generator: 'nope', text: 'x' }).join(), /does not exist/);
    assert.match(stepProblems({ type: 'dance', text: 'x' }).join(), /unknown step type/);
  });

  test('every quiz generator makes valid questions', () => {
    for (const [name, gen] of Object.entries(GENERATORS)) {
      for (let k = 0; k < 200; k++) {
        const it = gen();
        assert.ok(it.q || it.staff || it.rhythm, `${name} question text`);
        assert.ok(Array.isArray(it.choices) && it.choices.length >= 2, `${name} choices`);
        assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.choices.length, `${name} answer ${it.answer}`);
        assert.equal(new Set(it.choices).size, it.choices.length, `${name} duplicate choices: ${it.choices}`);
      }
    }
  });
});
