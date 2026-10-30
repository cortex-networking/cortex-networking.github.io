// The arcade, modelled on the Miracle Piano Teaching System's games. Each game lives in its own
// module exporting GAME (definition and levels) and Game (an ArcadeBase subclass).
import { FameMode } from './arcade.js';

const MODULES = ['./game-ducks.js', './game-ripchord.js', './game-aliens.js', './game-roboman.js'];

export async function loadArcade() {
  const mods = await Promise.allSettled(MODULES.map((m) => import(m)));
  const games = [], classes = {};
  mods.forEach((r, i) => {
    if (r.status !== 'fulfilled') { if (!/Failed to fetch|Cannot find|404/.test(String(r.reason))) console.error(MODULES[i], r.reason); return; }
    const { GAME, Game } = r.value;
    if (!GAME || !Game) return;
    games.push(GAME);
    classes[GAME.id] = Game;
  });
  return { ARCADE_GAMES: games, ARCADE_CLASSES: classes, FameMode };
}
