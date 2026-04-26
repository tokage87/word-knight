import Phaser from 'phaser';
import { QuizManager } from '../systems/QuizManager';
import { SkillPicker } from '../systems/SkillPicker';
import { SentenceBuilder } from '../systems/SentenceBuilder';
import { Hud } from '../ui/Hud';

// UIScene no longer draws anything in Phaser — the HUD is a plain HTML
// overlay (see src/ui/Hud.ts and index.html). UIScene only drives
// updates and owns the quiz + skill-picker lifecycles so they react to
// scene events.
export class UIScene extends Phaser.Scene {
  private hud!: Hud;
  private quiz!: QuizManager;
  private picker!: SkillPicker;
  private sentence!: SentenceBuilder;

  constructor() {
    super('UI');
  }

  create() {
    this.hud = new Hud();
    this.hud.mount();

    this.quiz = new QuizManager(this);
    this.quiz.mount();

    this.picker = new SkillPicker(this);
    this.picker.mount();

    this.sentence = new SentenceBuilder(this);
    this.sentence.mount();

    this.game.events.on('spell:reduced', this.hud.flashCooldownBadge, this.hud);
    this.game.events.on('spell:penalized', this.hud.flashCooldownPenalty, this.hud);
    this.game.events.on('enemy:killed', this.hud.onEnemyKilled, this.hud);
    this.game.events.on('boss:spawned', this.hud.onBossSpawned, this.hud);
    this.game.events.on('ult:unlocked', this.hud.showUltUnlockBanner, this.hud);
    this.game.events.on('flow:activated', this.hud.showFlowBanner, this.hud);
    this.game.events.on('ui:pauseChanged', this.onPauseChanged, this);
    this.game.events.on('ui:gameOver', this.onGameOver, this);
    this.hud.onPauseButtonClick(() => this.game.events.emit('ui:togglePause'));
    this.hud.onRestartButtonClick(() => this.game.events.emit('ui:restart'));
    this.hud.onCityButtonClick(() => this.game.events.emit('ui:openCity'));
    this.hud.onPauseResumeClick(() => this.game.events.emit('ui:togglePause'));
    this.hud.onPauseCityClick(() => this.game.events.emit('ui:openCity'));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(
        'spell:reduced',
        this.hud.flashCooldownBadge,
        this.hud,
      );
      this.game.events.off(
        'spell:penalized',
        this.hud.flashCooldownPenalty,
        this.hud,
      );
      this.game.events.off('enemy:killed', this.hud.onEnemyKilled, this.hud);
      this.game.events.off('boss:spawned', this.hud.onBossSpawned, this.hud);
      this.game.events.off('ult:unlocked', this.hud.showUltUnlockBanner, this.hud);
      this.game.events.off('flow:activated', this.hud.showFlowBanner, this.hud);
      this.game.events.off('ui:pauseChanged', this.onPauseChanged, this);
      this.game.events.off('ui:gameOver', this.onGameOver, this);
      // Tear down the HUD's HTML so the game-over / pause overlays
      // don't linger over the City scene (or any scene that follows).
      this.hud.unmount();
      // Blank every other HTML overlay root too — the QuizManager /
      // SentenceBuilder / SkillPicker each own their own #*-root and
      // leaving any of them populated leaks into the next scene.
      ['quiz-root', 'sentence-root', 'skill-picker-root'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.innerHTML = '';
          el.classList.remove('quiz--visible', 'sentence--visible', 'skill-picker--visible');
        }
      });
    });
  }

  update() {
    this.hud.tick(this.registry);
  }

  private onPauseChanged(payload: { paused: boolean }) {
    const stats = (this.registry.get('stats') as Record<string, number> | undefined) ?? {};
    this.hud.setPaused(payload.paused, stats);
  }

  private onGameOver(payload: Record<string, number>) {
    this.hud.showGameOver(payload);
  }
}
