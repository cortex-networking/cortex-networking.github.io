// Course, song and game catalog: one place that joins the content files.
import { SONGS as OLD_SONGS } from './library.js';
import { CHAPTERS, LESSONS } from './curriculum.js';
import { SONGS_ROCK } from './songs-rock.js';
import { SONGS_FOLK } from './songs-folk.js';
import { SONGS_CLASSICAL } from './songs-classical.js';
import { SONGS_EPIC } from './songs-epic.js';

/** Later collections replace earlier entries with the same id (they carry chords, tags and blurbs). */
function mergeSongs(...lists) {
  const byId = new Map();
  for (const list of lists) for (const s of list) byId.set(s.id, { ...(byId.get(s.id) || {}), ...s });
  return [...byId.values()];
}

let songs = mergeSongs(OLD_SONGS.map((s) => ({ tags: ['starter'], style: 'folk', ...s })), SONGS_FOLK, SONGS_CLASSICAL, SONGS_EPIC, SONGS_ROCK);
let chapters = CHAPTERS;
let lessons = [];
let games = [];

/** Lessons whose chapter target tune isn't in the library switch to their alternate wording. */
function resolveLessons(raw) {
  const has = (id) => songs.some((s) => s.id === id);
  return raw.map((l) => {
    const ch = chapters.find((c) => c.id === l.chapter);
    const missing = l.altTitle && ch && ch.target && !has(ch.target);
    if (!missing) return l;
    return {
      ...l, title: l.altTitle, summary: l.altSummary || l.summary, goal: l.altGoal || l.goal,
      steps: l.steps.map((st) => (st.altText ? { ...st, text: st.altText } : st)),
    };
  });
}
lessons = resolveLessons(LESSONS);

export const catalog = {
  get chapters() { return chapters; },
  get lessons() { return lessons; },
  get songs() { return songs; },
  get games() { return games; },
  set({ chapters: c, lessons: l, songs: s, games: g }) {
    if (c) chapters = c;
    if (s) songs = s;
    if (l || s) lessons = resolveLessons(l || LESSONS);
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

/** The shelf at the top of the Songs list: the most recognisable epic and game pieces. */
export const FEATURED = ['mars', 'night-on-bald-mountain', 'hall-of-the-mountain-king', 'verdi-dies-irae', 'beethoven-7-allegretto',
  'korobeiniki', 'ride-of-the-valkyries', 'zarathustra', 'queen-mary-march', 'danse-macabre', 'william-tell-finale', 'toccata-d-minor'];

export const COLLECTIONS = [
  { id: 'epic', title: 'Epic and dark' },
  { id: 'classical', title: 'Classical favorites' },
  { id: 'folk', title: 'Folk songs' },
  { id: 'shanty', title: 'Sea shanties' },
  { id: 'march', title: 'Marches' },
  { id: 'games', title: 'Game and film favorites' },
  { id: 'blues', title: 'Blues, ragtime and rock' },
  { id: 'holiday', title: 'Holiday' },
  { id: 'starter', title: 'First tunes' },
];
