// Course, song and game catalog: one place that joins the content files.
import { LESSONS as OLD_LESSONS, UNITS, SONGS as OLD_SONGS, GAMES as BASE_GAMES } from './library.js';

let chapters = UNITS.map((u) => ({ id: u.id, title: u.title, summary: '', target: null }));
let lessons = OLD_LESSONS.map((l) => ({ ...l, chapter: l.unit, goal: l.summary, skills: l.skills || [] }));
let songs = OLD_SONGS.map((s) => ({ tags: ['starter'], style: 'folk', ...s }));
let games = [...BASE_GAMES];

export const catalog = {
  get chapters() { return chapters; },
  get lessons() { return lessons; },
  get songs() { return songs; },
  get games() { return games; },
  set({ chapters: c, lessons: l, songs: s, games: g }) {
    if (c) chapters = c;
    if (l) lessons = l;
    if (s) songs = s;
    if (g) games = g;
  },
  song(id) { return songs.find((s) => s.id === id) || null; },
  lesson(id) { return lessons.find((l) => l.id === id) || null; },
  chapter(id) { return chapters.find((c) => c.id === id) || null; },
  lessonsIn(chapterId) { return lessons.filter((l) => l.chapter === chapterId); },
  lessonIndex(id) { return lessons.findIndex((l) => l.id === id); },
  /** Target tune for a chapter, falling back to its alternate if the song is missing. */
  targetSong(ch) {
    if (!ch) return null;
    return this.song(ch.target) || this.song(ch.alt) || null;
  },
};

export const COLLECTIONS = [
  { id: 'starter', title: 'First tunes' },
  { id: 'epic', title: 'Epic and dark' },
  { id: 'classical', title: 'Classical favorites' },
  { id: 'folk', title: 'Folk songs' },
  { id: 'shanty', title: 'Sea shanties' },
  { id: 'march', title: 'Marches' },
  { id: 'games', title: 'Game and film favorites' },
  { id: 'blues', title: 'Blues, ragtime and rock' },
  { id: 'holiday', title: 'Holiday' },
];
