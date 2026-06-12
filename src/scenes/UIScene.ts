import Phaser from 'phaser';
import { gameEvents } from '../systems/events';
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

    gameEvents(this.game).on('spell:reduced', this.hud.flashCooldownBadge, this.hud);
    gameEvents(this.game).on('spell:penalized', this.hud.flashCooldownPenalty, this.hud);
    gameEvents(this.game).on('enemy:killed', this.hud.onEnemyKilled, this.hud);
    gameEvents(this.game).on('boss:spawned', this.hud.onBossSpawned, this.hud);
    gameEvents(this.game).on('ult:unlocked', this.hud.showUltUnlockBanner, this.hud);
    gameEvents(this.game).on('flow:activated', this.hud.showFlowBanner, this.hud);
    gameEvents(this.game).on('ui:pauseChanged', this.onPauseChanged, this);
    gameEvents(this.game).on('ui:gameOver', this.onGameOver, this);
    this.hud.onPauseButtonClick(() => gameEvents(this.game).emit('ui:togglePause'));
    this.hud.onRestartButtonClick(() => gameEvents(this.game).emit('ui:restart'));
    this.hud.onCityButtonClick(() => gameEvents(this.game).emit('ui:openCity'));
    this.hud.onPauseResumeClick(() => gameEvents(this.game).emit('ui:togglePause'));
    this.hud.onPauseCityClick(() => gameEvents(this.game).emit('ui:openCity'));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameEvents(this.game).off('spell:reduced', this.hud.flashCooldownBadge, this.hud);
      gameEvents(this.game).off('spell:penalized', this.hud.flashCooldownPenalty, this.hud);
      gameEvents(this.game).off('enemy:killed', this.hud.onEnemyKilled, this.hud);
      gameEvents(this.game).off('boss:spawned', this.hud.onBossSpawned, this.hud);
      gameEvents(this.game).off('ult:unlocked', this.hud.showUltUnlockBanner, this.hud);
      gameEvents(this.game).off('flow:activated', this.hud.showFlowBanner, this.hud);
      gameEvents(this.game).off('ui:pauseChanged', this.onPauseChanged, this);
      gameEvents(this.game).off('ui:gameOver', this.onGameOver, this);
      // Tear down the HUD's HTML so the game-over / pause overlays
      // don't linger over the City scene (or any scene that follows).
      // The QuizManager / SentenceBuilder / SkillPicker roots blank
      // themselves — DomOverlay clears innerHTML and drops the visible
      // class on scene shutdown.
      this.hud.unmount();
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
