// Local storage with learner profiles. Settings belong to the device; progress belongs to a profile.

const KEY = 'middle-c/v2';
const OLD = 'middle-c/v1';

export const DEFAULT_SETTINGS = {
  instrument: 'grand', volume: 0.8, echo: true, output: 'builtin', input: 'all',
  labels: 'c', range: 'auto', latency: 0, hints: true, openAll: false, band: true, bandVolume: 0.7,
};

export const INTERESTS = [
  { id: 'epic', label: 'Epic and dark' },
  { id: 'classical', label: 'Classical' },
  { id: 'folk', label: 'Folk and sea shanties' },
  { id: 'march', label: 'Marches' },
  { id: 'blues', label: 'Blues, ragtime, rock' },
  { id: 'games', label: 'Game and film favorites' },
  { id: 'starter', label: 'Simple tunes' },
];

const blankData = () => ({ lessons: {}, songs: {}, games: {}, coach: null, practice: {}, certs: {} });
const uid = () => Math.random().toString(36).slice(2, 9);
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export class Store {
  constructor() {
    let root = read(KEY);
    if (!root) {
      const old = read(OLD);
      const id = uid();
      root = { settings: {}, profiles: [{ id, name: 'Player 1', interests: [], created: Date.now() }], current: id, data: { [id]: blankData() } };
      if (old) {
        root.settings = old.settings || {};
        const d = root.data[id];
        // old lesson ids (l1…) are kept; the new course ignores unknown ids
        Object.assign(d, { lessons: old.lessons || {}, songs: old.songs || {}, games: old.games || {} });
        for (const k of ['songOpts', 'gameLevel', 'freeBpm']) if (old[k] !== undefined) d[k] = old[k];
      }
    }
    root.settings = { ...DEFAULT_SETTINGS, ...root.settings };
    if (!root.profiles?.length) { const id = uid(); root.profiles = [{ id, name: 'Player 1', interests: [], created: Date.now() }]; root.current = id; }
    if (!root.profiles.some((p) => p.id === root.current)) root.current = root.profiles[0].id;
    for (const p of root.profiles) root.data[p.id] = { ...blankData(), ...(root.data[p.id] || {}) };
    this.root = root;
    this.listeners = new Set();
    this.save();
  }

  get settings() { return this.root.settings; }
  get profiles() { return this.root.profiles; }
  get profile() { return this.root.profiles.find((p) => p.id === this.root.current); }
  get data() { return this.root.data[this.root.current]; }

  onChange(fn) { this.listeners.add(fn); }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.root)); } catch { /* storage full or unavailable */ }
  }

  // ---------- profiles ----------
  addProfile(name, interests = []) {
    const id = uid();
    this.root.profiles.push({ id, name: name.trim() || `Player ${this.root.profiles.length + 1}`, interests, created: Date.now() });
    this.root.data[id] = blankData();
    this.save();
    return id;
  }
  useProfile(id) {
    if (!this.root.profiles.some((p) => p.id === id)) return;
    this.root.current = id;
    this.save();
    this.listeners.forEach((fn) => fn());
  }
  updateProfile(id, patch) {
    const p = this.root.profiles.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    this.save();
    this.listeners.forEach((fn) => fn());
  }
  deleteProfile(id) {
    if (this.root.profiles.length < 2) return false;
    this.root.profiles = this.root.profiles.filter((p) => p.id !== id);
    delete this.root.data[id];
    if (this.root.current === id) this.root.current = this.root.profiles[0].id;
    this.save();
    this.listeners.forEach((fn) => fn());
    return true;
  }

  // ---------- lessons ----------
  lesson(id) { return this.data.lessons[id]; }
  saveLesson(id, rec) {
    const p = this.data.lessons[id] || {};
    const passed = !!(rec.passed || p.passed);
    this.data.lessons[id] = {
      stars: Math.max(rec.stars || 0, p.stars || 0),
      passed,
      accuracy: Math.max(rec.accuracy || 0, p.accuracy || 0),
      at: Date.now(),
    };
    this.save();
  }
  certify(chapterId) {
    if (!this.data.certs[chapterId]) { this.data.certs[chapterId] = Date.now(); this.save(); return true; }
    return false;
  }

  // ---------- songs and games ----------
  song(id) { return this.data.songs[id]; }
  saveSong(id, mode, score, n) {
    const p = this.data.songs[id] || {};
    p[mode] = Math.max(score, p[mode] || 0);
    p.stars = Math.max(n, p.stars || 0);
    p.plays = (p.plays || 0) + 1;
    p.at = Date.now();
    this.data.songs[id] = p;
    this.save();
  }
  game(id, level) { return this.data.games[`${id}:${level}`]; }
  bestGame(id) { return Math.max(0, ...Object.entries(this.data.games).filter(([k]) => k.startsWith(`${id}:`)).map(([, v]) => v)); }
  saveGame(id, level, score) {
    const k = `${id}:${level}`;
    this.data.games[k] = Math.max(score, this.data.games[k] || 0);
    this.save();
  }

  // ---------- practice time ----------
  addPractice(seconds) {
    const k = day();
    this.data.practice[k] = (this.data.practice[k] || 0) + seconds;
  }
  practiceDays(n = 14) {
    const out = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      out.push({ day: day(x), date: x, seconds: this.data.practice[day(x)] || 0 });
    }
    return out;
  }
  streak() {
    let s = 0;
    const d = new Date();
    for (let i = 0; i < 400; i++) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      const secs = this.data.practice[day(x)] || 0;
      if (secs >= 120) s++;
      else if (i > 0) break;
    }
    return s;
  }

  resetProgress() {
    this.root.data[this.root.current] = { ...blankData(), songOpts: this.data.songOpts };
    this.save();
  }
}
