// Shared validators for lesson-format steps (course lessons, coach remedies, songPath routines).
import { catalog } from '../js/catalog.js';
import { KEY_SIGS, noteName, pc, parseVoice } from '../js/theory.js';
import { GENERATORS } from '../js/games-extra.js';
import * as ducks from '../js/game-ducks.js';
import * as ripchord from '../js/game-ripchord.js';
import * as aliens from '../js/game-aliens.js';
import * as roboman from '../js/game-roboman.js';

export const STEP_TYPES = new Set(['say', 'find', 'pcs', 'quiz', 'seq', 'rhythm', 'tap', 'song', 'game']);
export const GAMES = { ducks, ripchord, aliens, roboman };
const STAVES = new Set(['treble', 'bass', 'grand']);
const HANDS = new Set(['R', 'L', 'B']);

/** Parameters each game reads from an embedded round (lv.* / embedded.* / emb.* in its module). */
export const GAME_PARAMS = {
  ducks: ['level', 'pool', 'staves', 'count', 'throws', 'speed', 'accidentals', 'song', 'hands', 'fromBar', 'toBar'],
  ripchord: ['level', 'chords', 'count', 'time', 'names', 'staves', 'song', 'hands'],
  aliens: ['level', 'phrases', 'count', 'reps', 'staves', 'song', 'hands', 'fromBar', 'toBar', 'pos', 'bank', 'surprise', 'tempo', 'time', 'hand'],
  roboman: ['level', 'bars', 'rhythm', 'score', 'tempo', 'time', 'song', 'hands', 'fromBar', 'toBar', 'chances', 'staves'],
};

/** Problems with one game step. */
export function gameStepProblems(step) {
  const out = [];
  const mod = GAMES[step.game];
  if (!mod) return [`no game module "game-${step.game}.js"`];
  if (!mod.GAME || !mod.Game) return [`game-${step.game}.js lacks GAME or Game`];
  const p = step.params || {};
  const allowed = new Set(GAME_PARAMS[step.game]);
  for (const k of Object.keys(p)) if (!allowed.has(k)) out.push(`${step.game} ignores param "${k}"`);
  const levels = mod.GAME.levels;
  if (p.level !== undefined && !(Number.isInteger(p.level) && p.level >= 0 && p.level < levels.length)) out.push(`${step.game} level ${p.level} out of range 0..${levels.length - 1}`);
  if (p.level !== undefined && levels[p.level]?.song && !p.song) out.push(`${step.game} level ${p.level} is a song level but no song is given`);
  if (p.song !== undefined) {
    const s = catalog.song(p.song);
    if (!s) out.push(`${step.game} song "${p.song}" does not exist`);
    else if (mod.Game.prototype.songFilter && !mod.Game.prototype.songFilter.call(null, s)) out.push(`${step.game} cannot teach "${p.song}" (fails its songFilter), so a different song would be used`);
    if (s && p.hands === 'L' && !s.lh) out.push(`${step.game} left hand of "${p.song}", which has none`);
  }
  if (p.hands !== undefined && !['R', 'L'].includes(p.hands)) out.push(`${step.game} hands "${p.hands}"`);
  if (p.staves !== undefined && !STAVES.has(p.staves)) out.push(`staves ${p.staves}`);
  if (p.pool !== undefined && !(Array.isArray(p.pool) && p.pool.length && p.pool.every((m) => Number.isInteger(m) && m >= 21 && m <= 108))) out.push(`pool ${JSON.stringify(p.pool)}`);
  if (p.count !== undefined && !(p.count >= 1)) out.push(`count ${p.count}`);
  if (step.pass !== undefined && !(step.pass > 0 && step.pass <= 1)) out.push(`pass ${step.pass}`);
  if (step.game === 'ripchord' && p.chords) {
    for (const c of p.chords) {
      const ok = Array.isArray(c) ? c.length && c.every(Number.isFinite) : typeof c === 'number' || ripchord.chordFromSymbol(String(c));
      if (!ok) out.push(`ripchord chord ${JSON.stringify(c)}`);
    }
  }
  if (step.game === 'aliens' && p.phrases) {
    for (const ph of p.phrases) if (!(Array.isArray(ph) && ph.length && ph.every((n) => Number.isFinite(n.midi ?? n)))) out.push(`aliens phrase ${JSON.stringify(ph)}`);
  }
  if (step.game === 'roboman' && p.rhythm) {
    try { parseVoice(p.rhythm); } catch (e) { out.push(`roboman rhythm: ${e.message}`); }
  }
  if (step.game === 'roboman' && p.score && !(p.score.notes?.length)) out.push('roboman score has no notes');
  if (p.fromBar !== undefined && p.toBar !== undefined && p.fromBar > p.toBar) out.push(`fromBar ${p.fromBar} > toBar ${p.toBar}`);
  return out;
}

/** Problems with one lesson-format step. */
export function stepProblems(st) {
  const out = [];
  const bad = (msg) => out.push(msg);
  if (!STEP_TYPES.has(st.type)) return [`unknown step type "${st.type}"`];
  if (st.pass !== undefined && !(st.pass > 0 && st.pass <= 1)) bad(`pass ${st.pass}`);
  if (st.key !== undefined && !(st.key in KEY_SIGS)) bad(`key ${st.key}`);
  if (st.staves !== undefined && !STAVES.has(st.staves)) bad(`staves ${st.staves}`);
  if (st.type !== 'say' && !st.text) bad('no prompt text');
  switch (st.type) {
    case 'say': if (!st.text) bad('no text'); break;
    case 'find': {
      const list = st.pool || st.notes;
      if (!(Array.isArray(list) && list.length && list.every((m) => Number.isInteger(m) && m >= 21 && m <= 108))) bad(`needs pool or notes, got ${JSON.stringify(list)}`);
      if (st.show && !['staff', 'name', 'both', 'key'].includes(st.show)) bad(`show ${st.show}`);
      if (st.finger !== undefined && !(st.finger >= 1 && st.finger <= 5)) bad(`finger ${st.finger}`);
      if (st.pool && !(st.count >= 1)) bad('pool without count');
      break;
    }
    case 'pcs':
      if (!(Array.isArray(st.pcs) && st.pcs.length && st.pcs.every((p) => p >= 0 && p < 12))) bad('pcs');
      if (!(st.count >= 1)) bad('count');
      break;
    case 'quiz':
      if (st.generator !== undefined && !GENERATORS[st.generator]) bad(`quiz generator "${st.generator}" does not exist`);
      if (!st.generator && !st.items?.length) bad('needs items or a generator');
      for (const [k, it] of (st.items || []).entries()) {
        if (!(Array.isArray(it.choices) && it.choices.length >= 2)) { bad(`item ${k + 1} choices`); continue; }
        if (!(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.choices.length)) bad(`item ${k + 1} answer index ${it.answer}`);
        if (new Set(it.choices).size !== it.choices.length) bad(`item ${k + 1} has duplicate choices`);
        const ka = it.keyAnswer;
        if (ka === undefined) continue;
        if (typeof ka === 'number') {
          if (!(ka >= 21 && ka <= 108)) bad(`item ${k + 1} keyAnswer ${ka}`);
          // "Which note is this?": the right choice must be the name of the note drawn
          const notes = it.staff?.notes;
          if (notes?.length === 1 && notes[0] === ka) {
            const want = noteName(ka, { prefer: it.staff.prefer });
            if (it.choices[it.answer] !== want) bad(`item ${k + 1}: answer "${it.choices[it.answer]}" but the note drawn is ${want}`);
          }
        } else if (!(ka.pc >= 0 && ka.pc < 12 && (ka.midi === undefined || pc(ka.midi) === ka.pc))) bad(`item ${k + 1} keyAnswer ${JSON.stringify(ka)}`);
      }
      break;
    case 'seq': case 'rhythm': case 'tap':
      if (!st.rh && !st.lh && !st.score) bad('no music');
      if (st.score && !st.score.notes?.length) bad('score has no notes');
      if (st.rh || st.lh) { try { if (st.rh) parseVoice(st.rh); if (st.lh) parseVoice(st.lh); } catch (e) { bad(e.message); } }
      if (st.hands !== undefined && !HANDS.has(st.hands)) bad(`hands ${st.hands}`);
      if (st.hands === 'L' && !(st.lh || st.score?.hands?.L)) bad('left hand asked for but there is no left-hand part');
      if (st.hands === 'R' && !(st.rh || st.score?.hands?.R)) bad('right hand asked for but there is no right-hand part');
      if (st.tempo !== undefined && !(st.tempo >= 30 && st.tempo <= 240)) bad(`tempo ${st.tempo}`);
      if (st.tempoScale !== undefined && !(st.tempoScale > 0.2 && st.tempoScale <= 1.5)) bad(`tempoScale ${st.tempoScale}`);
      break;
    case 'song': {
      const s = catalog.song(st.song) || catalog.song(st.alt);
      if (!catalog.song(st.song)) bad(`song "${st.song}" does not exist`);
      if (st.alt && !catalog.song(st.alt)) bad(`alt "${st.alt}" does not exist`);
      if (!['wait', 'play'].includes(st.mode)) bad(`mode ${st.mode}`);
      if (st.hands !== undefined && !HANDS.has(st.hands)) bad(`hands ${st.hands}`);
      if (s && (st.hands === 'L' || st.hands === 'B') && !s.lh) bad(`${s.id} has no left hand`);
      if (st.tempo !== undefined && !(st.tempo > 0.2 && st.tempo <= 1.5)) bad(`tempo scale ${st.tempo}`);
      break;
    }
    case 'game':
      out.push(...gameStepProblems(st));
      break;
    default: break;
  }
  return out;
}
