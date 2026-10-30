// Learn home (what to do next), progress page and printable certificates.
import { h, stars } from './ui.js';
import { catalog } from './catalog.js';
import { INTERESTS } from './store.js';
import { lessonUnlocked, resolveRef } from './lesson.js';
import { CATEGORIES } from './coach.js';

const SKILL_NAMES = {
  keyboard: 'Finding keys', 'finger-numbers': 'Finger numbers', treble: 'Treble staff', bass: 'Bass staff', ledger: 'Ledger lines',
  'note-values': 'Note lengths', rests: 'Rests', eighths: 'Eighth notes', dotted: 'Dotted rhythms', ties: 'Ties',
  sixteenths: 'Sixteenth notes', 'three-four': 'Three-four time', 'compound-time': 'Six-eight time', 'left-hand': 'Left hand',
  'hands-together': 'Hands together', chords: 'Chords', 'power-chords': 'Power chords', 'black-keys': 'Sharps and flats',
  'key-signatures': 'Key signatures', 'minor-keys': 'Minor keys', scales: 'Scales', dynamics: 'Loud and soft',
  intervals: 'Intervals', arpeggios: 'Arpeggios', 'sight-reading': 'Reading new music',
};

export function nextLesson(app) {
  const { store } = app;
  return catalog.lessons.find((l) => !store.lesson(l.id)?.passed && lessonUnlocked(app, l)) || catalog.lessons.find((l) => !store.lesson(l.id)?.passed) || null;
}

export function learnerLevel(app) {
  const passed = catalog.lessons.filter((l) => app.store.lesson(l.id)?.passed).length;
  const frac = catalog.lessons.length ? passed / catalog.lessons.length : 0;
  return Math.max(1, Math.min(5, 1 + Math.floor(frac * 5)));
}

export function recommendSongs(app, n = 3) {
  const L = learnerLevel(app);
  const interests = new Set(app.store.profile?.interests || []);
  const today = Math.floor(Date.now() / 86400000);
  return catalog.songs
    .map((s, i) => {
      const rec = app.store.song(s.id);
      if (rec?.stars >= 3) return null;
      if (s.level > L + 1) return null;
      let score = 0;
      for (const t of s.tags || []) if (interests.has(t)) score += 3;
      score += s.level === L ? 2 : s.level === L + 1 ? 1.5 : 0.5;
      if (rec) score += 0.5; // already started: keep going
      score += ((i * 7 + today) % 5) * 0.15; // gentle daily rotation
      return { s, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.s);
}

function meter(frac) {
  return h('div', { class: 'meter', role: 'img', 'aria-label': `${Math.round(frac * 100)}%` }, h('span', { style: `width:${Math.round(frac * 100)}%` }));
}

function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export class HomeMode {
  constructor(app) { this.app = app; }

  enter() {
    const { ui, staff, store } = this.app;
    staff.showColumn([], { staves: 'grand' });
    const p = store.profile;
    const fresh = p.name === 'Player 1' && !Object.keys(store.data.lessons).length;
    ui.head({ kicker: '', title: fresh ? 'Welcome to Middle C' : `Hi, ${p.name}` });
    ui.prompt(fresh ? 'Learn piano one small step at a time. Plug in a keyboard, or use the keys on screen.' : 'Here’s what to work on next.');
    ui.pips(0, 0);
    ui.big();
    ui.foot(h('button', { class: 'btn', onclick: () => this.app.setTab('progress') }, 'Progress and certificates'));
    this.render(fresh);
  }

  render(fresh) {
    const { store, coach } = this.app;
    const cards = [];
    if (fresh) cards.push(this.setupCard());
    // 1. continue the course
    const next = nextLesson(this.app);
    if (next) {
      const ch = catalog.chapter(next.chapter);
      const inCh = catalog.lessonsIn(next.chapter);
      const done = inCh.filter((l) => store.lesson(l.id)?.passed).length;
      cards.push(h('section', { class: 'card card-main' },
        h('p', { class: 'card-kicker' }, `Chapter ${catalog.chapters.indexOf(ch) + 1}: ${ch?.title || ''}`),
        h('h2', {}, next.title),
        h('p', {}, next.goal || next.summary || ''),
        meter(done / Math.max(1, inCh.length)),
        h('p', { class: 'small' }, `${done} of ${inCh.length} lessons done in this chapter`),
        h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.app.open('learn', next.id) }, store.lesson(next.id) ? 'Try it again' : done ? 'Continue' : 'Start'),
      ));
    } else {
      cards.push(h('section', { class: 'card card-main' },
        h('p', { class: 'card-kicker' }, 'Course'), h('h2', {}, 'Every lesson passed'),
        h('p', {}, 'You’ve finished the course. Keep your skills sharp with songs and the practice routine.'),
        h('button', { class: 'btn primary', onclick: () => this.app.setTab('songs') }, 'Choose a song')));
    }
    // 2. practice from mistakes
    const spots = coach.weakSpots(3);
    cards.push(h('section', { class: 'card' },
      h('p', { class: 'card-kicker' }, 'Practice made from your mistakes'),
      spots.length
        ? h('ul', { class: 'spots' }, ...spots.map((s) => h('li', {}, h('strong', {}, s.label), ' ', h('span', {}, s.fix))))
        : h('p', {}, 'Nothing to fix yet. As you play, the coach notices what trips you up and builds a short routine for it.'),
      spots.length ? h('button', { class: 'btn primary', onclick: () => this.app.practiceToday() }, 'Start a 5-minute practice') : null,
    ));
    // 3. a song
    const recs = recommendSongs(this.app, 1);
    if (recs.length) {
      const s = recs[0];
      cards.push(h('section', { class: 'card' },
        h('p', { class: 'card-kicker' }, 'A song for you'),
        h('h2', {}, s.title),
        h('p', { class: 'small' }, `${s.composer}, level ${s.level}`),
        s.blurb ? h('p', {}, s.blurb) : null,
        h('div', { class: 'card-actions' },
          h('button', { class: 'btn primary', onclick: () => import('./songmode.js').then((m) => this.app.practice(m.songPath(this.app, s))) }, 'Learn it with games'),
          h('button', { class: 'btn', onclick: () => this.app.open('songs', s.id) }, 'Open the song')),
      ));
    }
    const today = store.practiceDays(1)[0].seconds;
    const streak = store.streak();
    const wrap = h('div', { class: 'home' },
      h('div', { class: 'home-grid' }, ...cards),
      h('p', { class: 'home-stats' }, `${fmtMinutes(today)} practiced today.${streak > 1 ? ` ${streak}-day streak.` : ''} Short, regular practice beats long sessions.`));
    this.app.ui.layer(wrap);
  }

  setupCard() {
    const { store } = this.app;
    const chosen = new Set(store.profile.interests || []);
    const name = h('input', { type: 'text', id: 'setup-name', placeholder: 'Your name', maxlength: 24, autocomplete: 'off' });
    const chips = h('div', { class: 'chips' }, ...INTERESTS.map((it) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(chosen.has(it.id)), onclick: () => {
        if (chosen.has(it.id)) chosen.delete(it.id); else chosen.add(it.id);
        b.setAttribute('aria-pressed', String(chosen.has(it.id)));
      } }, it.label);
      return b;
    }));
    return h('section', { class: 'card card-setup' },
      h('p', { class: 'card-kicker' }, 'Who’s playing?'),
      h('label', { for: 'setup-name', class: 'small' }, 'Name'), name,
      h('p', { class: 'small' }, 'What music do you like? Song suggestions follow your picks.'), chips,
      h('button', { class: 'btn primary', onclick: () => {
        store.updateProfile(store.profile.id, { name: name.value.trim() || store.profile.name, interests: [...chosen] });
        this.app.renderProfile();
        this.enter();
      } }, 'Save'),
    );
  }

  exit() { this.app.ui.layer(null); }
}

export class ProgressMode {
  constructor(app) { this.app = app; }

  enter() {
    const { ui, store, staff, coach } = this.app;
    staff.showColumn([], { staves: 'grand' });
    const p = store.profile;
    ui.head({ kicker: 'Progress', title: p.name });
    const passed = catalog.lessons.filter((l) => store.lesson(l.id)?.passed).length;
    const total = Object.values(store.data.practice).reduce((a, b) => a + b, 0);
    ui.prompt(`${passed} of ${catalog.lessons.length} lessons passed, ${fmtMinutes(total)} of practice in all.`);
    ui.pips(0, 0);
    ui.big();
    ui.foot(h('button', { class: 'btn', onclick: () => this.app.open('learn', '') }, 'Back to the course'));

    const chapters = h('section', { class: 'card' }, h('p', { class: 'card-kicker' }, 'Chapters'),
      h('ul', { class: 'chapter-list' }, ...catalog.chapters.map((ch, i) => {
        const ls = catalog.lessonsIn(ch.id);
        const done = ls.filter((l) => store.lesson(l.id)?.passed).length;
        const cert = store.data.certs[ch.id];
        return h('li', {},
          h('div', { class: 'row' }, h('span', {}, `${i + 1}. ${ch.title}`), h('span', { class: 'small' }, `${done}/${ls.length}`)),
          meter(done / Math.max(1, ls.length)),
          cert ? h('button', { class: 'linkish', onclick: () => this.app.showCertificate(ch.id) }, 'View certificate') : null);
      })));

    const skills = coach.skillLevels();
    const skillCard = h('section', { class: 'card' }, h('p', { class: 'card-kicker' }, 'Skills'),
      skills.length
        ? h('ul', { class: 'skill-list' }, ...skills.slice(0, 10).map((s) => h('li', {},
          h('div', { class: 'row' }, h('span', {}, SKILL_NAMES[s.skill] || s.skill), h('span', { class: 'small' }, `${Math.round(s.value * 100)}%`)), meter(s.value))))
        : h('p', {}, 'Skill levels appear after a few lessons.'));

    const spots = coach.weakSpots(4);
    const spotCard = h('section', { class: 'card' }, h('p', { class: 'card-kicker' }, 'What trips you up'),
      spots.length
        ? h('ul', { class: 'spots' }, ...spots.map((s) => h('li', {},
          h('strong', {}, s.label), ' ', h('span', {}, s.fix), ' ',
          h('button', { class: 'linkish', onclick: () => this.practice(s.cat) }, 'Practice this'))))
        : h('p', {}, 'No patterns yet. Keep playing.'));

    const days = store.practiceDays(14);
    const max = Math.max(600, ...days.map((d) => d.seconds));
    const W = 280, H = 90, bw = W / days.length;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H + 16}`);
    svg.setAttribute('class', 'days');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Practice minutes over the last 14 days, ${fmtMinutes(days.reduce((a, d) => a + d.seconds, 0))} in total`);
    days.forEach((d, i) => {
      const bh = Math.max(d.seconds ? 3 : 1, (d.seconds / max) * H);
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries({ x: i * bw + 2, y: H - bh, width: bw - 4, height: bh, rx: 2, class: d.seconds ? 'on' : 'off' }).forEach(([k, v]) => r.setAttribute(k, v));
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = `${d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${fmtMinutes(d.seconds)}`;
      r.append(t);
      svg.append(r);
      if (i % 2 === 0 || i === days.length - 1) {
        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        Object.entries({ x: i * bw + bw / 2, y: H + 13, 'text-anchor': 'middle' }).forEach(([k, v]) => lbl.setAttribute(k, v));
        lbl.textContent = d.date.toLocaleDateString(undefined, { weekday: 'narrow' });
        svg.append(lbl);
      }
    });
    const timeCard = h('section', { class: 'card' }, h('p', { class: 'card-kicker' }, 'Last two weeks'), svg,
      h('p', { class: 'small' }, store.streak() > 1 ? `${store.streak()}-day streak` : 'Practice two minutes or more to start a streak.'));

    const songs = catalog.songs.filter((s) => store.song(s.id));
    const songCard = h('section', { class: 'card' }, h('p', { class: 'card-kicker' }, 'Songs'),
      songs.length
        ? h('ul', { class: 'song-list' }, ...songs.slice(0, 8).map((s) => h('li', { class: 'row' }, h('span', {}, s.title), stars(store.song(s.id).stars || 0))))
        : h('p', {}, 'No songs played yet.'));

    // a scrolling region with no buttons in it: focusable, so keyboard users can scroll it
    this.app.ui.layer(h('div', { class: 'home progress', tabindex: '0', role: 'region', 'aria-label': 'Progress' }, h('div', { class: 'home-grid' }, chapters, skillCard, spotCard, timeCard, songCard)));
  }

  practice(cat) {
    const c = this.app.coach.data.contexts[cat] || {};
    const r = this.app.coach.remedy(cat, { ...c, score: resolveRef(c.ref) });
    if (r) this.app.practice(r);
  }

  exit() { this.app.ui.layer(null); }
}

/** Full-screen certificate with print support. */
export function showCertificate(app, chapterId) {
  const ch = catalog.chapter(chapterId);
  const when = app.store.data.certs[chapterId];
  if (!ch || !when) return;
  const idx = catalog.chapters.indexOf(ch) + 1;
  const date = new Date(when).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const skills = [...new Set(catalog.lessonsIn(chapterId).flatMap((l) => l.skills || []))].map((s) => SKILL_NAMES[s] || s).slice(0, 6);
  const close = () => { overlay.remove(); document.body.classList.remove('printing-cert'); };
  const overlay = h('div', { class: 'cert-overlay', role: 'dialog', 'aria-label': `Certificate for chapter ${idx}` },
    h('div', { class: 'cert' },
      h('span', { class: 'cert-mark', 'aria-hidden': 'true' }),
      h('p', { class: 'cert-kicker' }, 'Middle C piano course'),
      h('h1', {}, 'Certificate of achievement'),
      h('p', { class: 'cert-lede' }, 'Awarded to'),
      h('p', { class: 'cert-name' }, app.store.profile.name),
      h('p', { class: 'cert-lede' }, `for completing chapter ${idx}`),
      h('p', { class: 'cert-chapter' }, ch.title),
      skills.length ? h('p', { class: 'cert-skills' }, `Skills: ${skills.join(', ')}`) : null,
      h('p', { class: 'cert-date' }, date),
    ),
    h('div', { class: 'cert-actions' },
      h('button', { class: 'btn primary', onclick: () => { document.body.classList.add('printing-cert'); window.print(); } }, 'Print or save as PDF'),
      h('button', { class: 'btn', onclick: close }, 'Close')),
  );
  const mark = overlay.querySelector('.cert-mark');
  mark.innerHTML = '<svg viewBox="0 0 32 32"><line x1="3" y1="16" x2="29" y2="16" /><ellipse cx="16" cy="16" rx="8.2" ry="5.6" transform="rotate(-20 16 16)" /></svg>';
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-cert'), { once: true });
  document.body.append(overlay);
  overlay.querySelector('.cert-actions .btn').focus();
}

export { CATEGORIES };
