// store.js: profiles, migration, corrupt storage, progress records.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Store, DEFAULT_SETTINGS } from '../js/store.js';
import { MemoryStorage } from './helpers.mjs';

const KEY = 'middle-c/v2', OLD = 'middle-c/v1';
const saved = () => JSON.parse(globalThis.localStorage.getItem(KEY));

beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });

describe('fresh start', () => {
  test('one profile, default settings, saved right away', () => {
    const s = new Store();
    assert.equal(s.profiles.length, 1);
    assert.equal(s.profile.name, 'Player 1');
    assert.deepEqual(s.settings, DEFAULT_SETTINGS);
    assert.deepEqual(Object.keys(s.data).sort(), ['certs', 'coach', 'games', 'lessons', 'practice', 'songs']);
    assert.equal(saved().current, s.profile.id);
  });
  test('reloads what it saved', () => {
    const a = new Store();
    a.saveLesson('c1-1', { stars: 2, passed: true, accuracy: 0.9 });
    a.settings.volume = 0.4; a.save();
    const b = new Store();
    assert.equal(b.lesson('c1-1').stars, 2);
    assert.equal(b.settings.volume, 0.4);
    assert.equal(b.profile.id, a.profile.id);
  });
});

describe('migration from v1', () => {
  test('settings, lessons, songs, games and options carry over', () => {
    localStorage.setItem(OLD, JSON.stringify({
      settings: { volume: 0.3, latency: 25, instrument: 'epiano' },
      lessons: { l1: { stars: 3, passed: true } }, songs: { mary: { wait: 0.9, stars: 2 } }, games: { 'quiz:0': 7 },
      songOpts: { mode: 'play' }, gameLevel: { quiz: 2 }, freeBpm: 100,
    }));
    const s = new Store();
    assert.equal(s.settings.volume, 0.3);
    assert.equal(s.settings.latency, 25);
    assert.equal(s.settings.instrument, 'epiano');
    assert.equal(s.settings.band, DEFAULT_SETTINGS.band, 'new settings get defaults');
    assert.deepEqual(s.data.lessons, { l1: { stars: 3, passed: true } });
    assert.equal(s.song('mary').wait, 0.9);
    assert.equal(s.game('quiz', 0), 7);
    assert.deepEqual(s.data.songOpts, { mode: 'play' });
    assert.deepEqual(s.data.gameLevel, { quiz: 2 });
    assert.equal(s.data.freeBpm, 100);
    assert.deepEqual(s.data.certs, {});
    assert.ok(saved(), 'written to v2');
  });
  test('a v1 object without settings or progress', () => {
    localStorage.setItem(OLD, JSON.stringify({}));
    const s = new Store();
    assert.deepEqual(s.settings, DEFAULT_SETTINGS);
    assert.deepEqual(s.data.lessons, {});
  });
  test('v2 wins over v1 when both exist', () => {
    new Store().saveLesson('c1-1', { passed: true, stars: 1 });
    localStorage.setItem(OLD, JSON.stringify({ lessons: { l9: { passed: true } } }));
    const s = new Store();
    assert.ok(s.lesson('c1-1'));
    assert.equal(s.lesson('l9'), undefined);
  });
});

describe('corrupt or unusual storage never stops the app', () => {
  for (const [label, raw] of [
    ['truncated JSON', '{"settings":{"volume":0.5},"profiles":[{"id":"a"'],
    ['not JSON', 'hello'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['a number', '42'],
    ['a string', '"middle c"'],
    ['an object with no data', JSON.stringify({ settings: { volume: 0.2 }, profiles: [{ id: 'a', name: 'A' }], current: 'a' })],
    ['null settings and profiles', JSON.stringify({ settings: null, profiles: null, data: null })],
    ['a current profile that does not exist', JSON.stringify({ settings: {}, profiles: [{ id: 'a', name: 'A' }], current: 'zzz', data: { a: { lessons: { x: { passed: true } } } } })],
  ]) {
    test(label, () => {
      localStorage.setItem(KEY, raw);
      const s = new Store();
      assert.ok(s.profile, 'has a profile');
      assert.ok(s.data && s.data.lessons && s.data.songs && s.data.games && s.data.certs, 'has progress tables');
      assert.equal(typeof s.settings.volume, 'number');
      s.saveLesson('c1-1', { passed: true, stars: 1 });
      assert.ok(new Store().lesson('c1-1'), 'and can save and reload');
    });
  }
  test('progress in an object with missing tables is kept', () => {
    localStorage.setItem(KEY, JSON.stringify({ settings: {}, profiles: [{ id: 'a', name: 'A' }], current: 'a', data: { a: { lessons: { x: { passed: true } } } } }));
    const s = new Store();
    assert.ok(s.lesson('x').passed);
    assert.deepEqual(s.data.songs, {});
  });
  test('storage that throws (private mode, quota) is tolerated', () => {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    const s = new Store();
    s.saveLesson('c1-1', { passed: true });
    assert.ok(s.lesson('c1-1').passed);
  });
});

describe('profiles', () => {
  test('each profile has its own progress; settings are shared', () => {
    const s = new Store();
    const first = s.profile.id;
    s.saveLesson('c1-1', { passed: true, stars: 3 });
    s.settings.latency = 30;
    const id = s.addProfile('  Rio  ', ['epic']);
    assert.equal(s.profiles.find((p) => p.id === id).name, 'Rio');
    s.useProfile(id);
    assert.equal(s.lesson('c1-1'), undefined);
    assert.equal(s.settings.latency, 30);
    s.saveSong('mary', 'wait', 0.8, 2);
    s.useProfile(first);
    assert.ok(s.lesson('c1-1'));
    assert.equal(s.song('mary'), undefined);
    const again = new Store();
    assert.equal(again.profiles.length, 2);
    assert.equal(again.profile.id, first);
  });
  test('a blank name gets a numbered default; unknown ids are ignored', () => {
    const s = new Store();
    const id = s.addProfile('   ');
    assert.equal(s.profiles.find((p) => p.id === id).name, 'Player 2');
    const cur = s.profile.id;
    s.useProfile('nope');
    assert.equal(s.profile.id, cur);
  });
  test('the last profile cannot be deleted; deleting the current one switches', () => {
    const s = new Store();
    assert.equal(s.deleteProfile(s.profile.id), false);
    const second = s.addProfile('B');
    s.useProfile(second);
    assert.equal(s.deleteProfile(second), true);
    assert.notEqual(s.profile.id, second);
    assert.equal(s.root.data[second], undefined);
  });
  test('listeners hear profile changes', () => {
    const s = new Store();
    let n = 0;
    s.onChange(() => n++);
    const id = s.addProfile('B');
    s.useProfile(id);
    s.updateProfile(id, { name: 'Bee' });
    assert.equal(n, 2);
    assert.equal(s.profile.name, 'Bee');
  });
});

describe('records', () => {
  test('lessons keep the best stars, accuracy and a pass', () => {
    const s = new Store();
    s.saveLesson('a', { stars: 3, passed: true, accuracy: 0.97 });
    s.saveLesson('a', { stars: 1, passed: false, accuracy: 0.5 });
    assert.deepEqual([s.lesson('a').stars, s.lesson('a').passed, s.lesson('a').accuracy], [3, true, 0.97]);
  });
  test('songs and games keep bests and count plays', () => {
    const s = new Store();
    s.saveSong('mary', 'play', 0.6, 1);
    s.saveSong('mary', 'play', 0.4, 0);
    s.saveSong('mary', 'wait', 0.9, 2);
    assert.deepEqual([s.song('mary').play, s.song('mary').wait, s.song('mary').stars, s.song('mary').plays], [0.6, 0.9, 2, 3]);
    s.saveGame('ducks', 0, 100); s.saveGame('ducks', 0, 50); s.saveGame('ducks', 3, 400);
    assert.equal(s.game('ducks', 0), 100);
    assert.equal(s.bestGame('ducks'), 400);
    assert.equal(s.bestGame('aliens'), 0);
  });
  test('certificates are issued once', () => {
    const s = new Store();
    assert.equal(s.certify('c1'), true);
    assert.equal(s.certify('c1'), false);
  });
  test('practice time, days and streak', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 30, 12).getTime() });
    const s = new Store();
    s.addPractice(200);
    t.mock.timers.setTime(new Date(2026, 9, 29, 12).getTime());
    s.addPractice(130);
    t.mock.timers.setTime(new Date(2026, 9, 27, 12).getTime());
    s.addPractice(500);
    t.mock.timers.setTime(new Date(2026, 9, 30, 18).getTime());
    assert.equal(s.streak(), 2, 'today and yesterday; the 28th breaks it');
    const days = s.practiceDays(7);
    assert.equal(days.length, 7);
    assert.equal(days[6].seconds, 200);
    assert.equal(days[5].seconds, 130);
    assert.equal(days[3].seconds, 500);
  });
  test('a streak survives not having practised yet today', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 29, 12).getTime() });
    const s = new Store();
    s.addPractice(300);
    t.mock.timers.setTime(new Date(2026, 9, 30, 8).getTime());
    assert.equal(s.streak(), 1);
  });
});

describe('resetProgress', () => {
  test('wipes this profile\'s progress, keeps settings, song options, the Hall of Fame and other profiles', () => {
    const s = new Store();
    const other = s.addProfile('Other');
    s.useProfile(other);
    s.saveLesson('keep-me', { passed: true });
    s.useProfile(s.profiles[0].id);
    s.settings.latency = 40; s.settings.instrument = 'organ';
    s.root.hall = { ducks: [{ name: 'Rio', score: 9 }] };
    s.data.songOpts = { mode: 'play', tempo: 0.8 };
    s.saveLesson('c1-1', { passed: true, stars: 3 });
    s.saveSong('mary', 'wait', 1, 3);
    s.data.coach = { cats: { neighbor: { n: 1, w: 1, last: 1 } } };
    s.resetProgress();
    assert.equal(s.lesson('c1-1'), undefined);
    assert.equal(s.song('mary'), undefined);
    assert.equal(s.data.coach, null);
    assert.deepEqual(s.data.songOpts, { mode: 'play', tempo: 0.8 });
    assert.equal(s.settings.latency, 40);
    assert.equal(s.settings.instrument, 'organ');
    assert.equal(s.root.hall.ducks.length, 1);
    s.useProfile(other);
    assert.ok(s.lesson('keep-me'));
    const reloaded = new Store();
    assert.equal(reloaded.settings.latency, 40);
  });
});
