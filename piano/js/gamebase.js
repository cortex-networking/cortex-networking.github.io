// Shared base for games: intro screen with level picker, game-over screen, best scores.
import { h, segmented } from './ui.js';

export class GameBase {
  constructor(app, game) {
    this.app = app; this.game = game;
    this.level = app.store.data.gameLevel?.[game.id] ?? 0;
  }

  enter() {
    const { ui } = this.app;
    ui.head({ kicker: 'Game', title: this.game.title });
    ui.prompt(this.game.summary);
    ui.status('');
    ui.big();
    this.intro();
  }

  intro() {
    const { ui } = this.app;
    this.playing = false;
    const best = this.app.store.game(this.game.id, this.level);
    ui.foot(
      h('div', { class: 'controls' },
        segmented('Level', this.game.levels.map((l, i) => ({ value: i, label: l.name })), this.level, (v) => {
          this.level = v;
          const d = this.app.store.data;
          d.gameLevel = { ...(d.gameLevel || {}), [this.game.id]: v };
          this.app.store.save();
          this.intro();
          this.preview?.();
        }),
      ),
      h('button', { class: 'btn primary', 'data-enter': '', onclick: () => { this.app.sound.unlock(); this.start(); } }, 'Start game'),
      best ? h('span', { class: 'note' }, `Best: ${best}`) : null,
    );
    this.preview?.();
  }

  over(score, detail) {
    const { ui, store } = this.app;
    if (this.app.coach?.current) this.app.coach.end(this.app.coach.current);
    this.playing = false;
    const prev = store.game(this.game.id, this.level) || 0;
    store.saveGame(this.game.id, this.level, score);
    this.app.renderList();
    ui.prompt(`${detail}${score > prev ? (prev ? ' New best.' : '') : ` Best: ${prev}.`}`);
    ui.status('');
    this.app.keyboard.clear('cue-r', 'demo');
    const best = Math.max(prev, score);
    ui.foot(
      h('button', { class: 'btn primary', 'data-enter': '', onclick: () => this.start() }, 'Play again'),
      h('button', { class: 'btn', onclick: () => { ui.prompt(this.game.summary); this.intro(); } }, 'Change level'),
      h('span', { class: 'note' }, `Best: ${best}`),
    );
  }

  exit() { this.playing = false; this.app.sound.stopAll(); clearTimeout(this.timer); }
}
