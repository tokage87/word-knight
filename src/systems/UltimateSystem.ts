import type Phaser from 'phaser';
import { gameEvents } from './events';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants/layout';
import type { Enemy } from '../entities/Enemy';

// Ultimate ability — unlocked the first time the player hits
// ULT_UNLOCK_LEVEL. 120s base cooldown, quiz-correct shaves 3s off,
// quiz-wrong adds 1s back (capped at base). When ready, auto-casts
// on the next update() and wipes all on-screen enemies.
const ULT_UNLOCK_LEVEL = 10;
const ULT_BASE_CD_MS = 120_000;
const ULT_CORRECT_CUT_MS = 3000;
const ULT_WRONG_PENALTY_MS = 1000;
const ULT_DAMAGE = 200;

// Owns the ULT unlock/cooldown state plus the cast visuals. GameScene
// constructs a fresh instance every create(), so a death-restart starts
// locked with a zeroed cooldown again — no manual field resets needed.
export class UltimateSystem {
  private ultUnlocked = false;
  private ultCdMs = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  // Ultimate tick. Only ticks once unlocked; when it reaches 0 it
  // auto-casts, blasts every on-screen enemy, and resets to base.
  // Flow doubles the tick rate same as ally cooldowns (the caller
  // passes the flow multiplier as `cooldownMult`).
  tick(delta: number, cooldownMult: number, enemies: Enemy[]) {
    if (!this.ultUnlocked) return;
    if (this.ultCdMs > 0) {
      this.ultCdMs = Math.max(0, this.ultCdMs - delta * cooldownMult);
    }
    if (this.ultCdMs <= 0) {
      this.castUlt(enemies);
      this.ultCdMs = ULT_BASE_CD_MS;
    }
    this.scene.registry.set('ultCdMs', this.ultCdMs);
    this.scene.registry.set('ultCdBase', ULT_BASE_CD_MS);
  }

  // Called once per gained level — unlocks the ULT the first time the
  // player reaches ULT_UNLOCK_LEVEL and starts the cooldown at base.
  onLevelChanged(level: number) {
    if (!this.ultUnlocked && level >= ULT_UNLOCK_LEVEL) {
      this.ultUnlocked = true;
      this.ultCdMs = ULT_BASE_CD_MS;
      gameEvents(this.scene.game).emit('ult:unlocked');
    }
  }

  onQuizCorrect() {
    if (this.ultUnlocked && this.ultCdMs > 0) {
      this.ultCdMs = Math.max(0, this.ultCdMs - ULT_CORRECT_CUT_MS);
    }
  }

  onQuizWrong() {
    if (this.ultUnlocked) {
      this.ultCdMs = Math.min(ULT_BASE_CD_MS, this.ultCdMs + ULT_WRONG_PENALTY_MS);
    }
  }

  // Screen-wide ultimate. Applies ULT_DAMAGE to every active enemy in
  // the passed list, plus a layered visual: yellow screen-flash, a
  // lightning bolt + impact ring on each target, an oversized gold
  // damage popup, and the existing camera flash + shake. Skips
  // enemies already off-screen so the bolts don't whiff into the void.
  private castUlt(enemies: Enemy[]) {
    // Screen-wide yellow flash — same pattern as SpellCaster.castFire.
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0xfff080, 0.55)
      .setOrigin(0, 0)
      .setDepth(80);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 320,
      onComplete: () => flash.destroy(),
    });

    // Snapshot the list before iterating — `takeDamage` can lethal an
    // enemy and remove it from the underlying group array mid-loop,
    // which would skip the next index. Slice gives us a stable view.
    const targets = enemies.slice();
    let hitCount = 0;
    for (const e of targets) {
      if (!e.active) continue;
      if (e.x < -20 || e.x > LOGICAL_WIDTH + 40) continue;

      // Lightning bolt from above the screen down onto the enemy.
      const bolt = this.scene.add.graphics().setDepth(70);
      bolt.lineStyle(3, 0xfff080, 1);
      bolt.lineBetween(e.x, -10, e.x, e.y - 4);
      bolt.lineStyle(1, 0xffffff, 1);
      bolt.lineBetween(e.x - 1, -10, e.x - 1, e.y - 4);
      this.scene.tweens.add({
        targets: bolt,
        alpha: 0,
        duration: 220,
        onComplete: () => bolt.destroy(),
      });

      // Impact ring expands at the strike point.
      const ring = this.scene.add.circle(e.x, e.y - 8, 18, 0xfff080, 0.7).setDepth(71);
      ring.setScale(0.3);
      this.scene.tweens.add({
        targets: ring,
        scale: 1.5,
        alpha: 0,
        duration: 320,
        onComplete: () => ring.destroy(),
      });

      // Big gold popup BEFORE takeDamage — the enemy may destroy itself
      // on lethal damage, and we need a live `this` to spawn from.
      e.popBigDamageNumber(ULT_DAMAGE);
      e.takeDamage(ULT_DAMAGE);
      hitCount += 1;
    }
    this.scene.cameras.main.flash(650, 255, 210, 80);
    this.scene.cameras.main.shake(320, 0.012);
    gameEvents(this.scene.game).emit('ult:cast', { hitCount });
  }
}
