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
    this.game.events.on('enemy:killed', this.hud.onEnemyKilled, this.hud);
    this.game.events.on('boss:spawned', this.hud.onBossSpawned, this.hud);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(
        'spell:reduced',
        this.hud.flashCooldownBadge,
        this.hud,
      );
      this.game.events.off('enemy:killed', this.hud.onEnemyKilled, this.hud);
      this.game.events.off('boss:spawned', this.hud.onBossSpawned, this.hud);
    });
  }

  update() {
    this.hud.tick(this.registry);
  }
}
