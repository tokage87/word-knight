import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Enemy } from './Enemy';

const MELEE_RANGE = 58;
const SPRITE_SCALE = 0.32;

export class Knight extends Phaser.GameObjects.Sprite {
  // Stats start at these base values and are boosted via the roguelite
  // stat-upgrade cards (see GameScene StatId / applyStatUpgrade).
  hpMax = 100;
  hp = 100;
  meleeDamage = 10;
  meleeCooldownMs = 900;
  readonly meleeRange = MELEE_RANGE;

  private meleeCooldown = 0;
  private animState: 'idle' | 'run' | 'attack' = 'run';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, AK.knightRun, 0);
    scene.add.existing(this);
    this.setScale(SPRITE_SCALE);
    this.setOrigin(0.5, 0.71);
    this.play(ANIM.knightRun);
  }

  tick(delta: number, enemies: Enemy[]) {
    if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

    const target = enemies.find(
      (e) => e.active && Math.abs(e.x - this.x) < MELEE_RANGE,
    );

    if (target) {
      if (this.animState !== 'attack' && this.meleeCooldown <= 0) {
        this.playAttack();
        target.takeDamage(this.meleeDamage);
        this.meleeCooldown = this.meleeCooldownMs;
      } else if (this.animState !== 'attack' && this.animState !== 'idle') {
        this.setAnim('idle');
      }
    } else if (this.animState !== 'run' && this.animState !== 'attack') {
      this.setAnim('run');
    }
  }

  // Stat-upgrade hooks (called by GameScene when a stat card is picked).
  boostMaxHp(amount: number) {
    this.hpMax += amount;
    this.hp = Math.min(this.hpMax, this.hp + amount);
  }
  boostMeleeDamage(amount: number) {
    this.meleeDamage += amount;
  }
  boostAttackSpeed(pct: number) {
    this.meleeCooldownMs = Math.max(200, Math.round(this.meleeCooldownMs * (1 - pct)));
  }

  anyEnemyInRange(enemies: Enemy[]): boolean {
    return enemies.some(
      (e) => e.active && Math.abs(e.x - this.x) < MELEE_RANGE,
    );
  }

  takeDamage(n: number) {
    if (this.hp <= 0) return; // already dead, waiting for scene restart
    this.hp -= n;
    this.setTint(0xff7070);
    this.scene.time.delayedCall(80, () => this.clearTint());
    this.scene.cameras.main.shake(60, 0.003);
    if (this.hp <= 0) {
      // Don't auto-revive — GameScene will restart the scene and build
      // a fresh knight, which is the full run-reset on death.
      this.hp = 0;
      this.scene.game.events.emit('knight:died');
    }
  }

  heal(n: number) {
    this.hp = Math.min(this.hpMax, this.hp + n);
  }

  resetHp() {
    this.hp = this.hpMax;
  }

  private playAttack() {
    this.animState = 'attack';
    this.play(ANIM.knightAttack);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.setAnim('run');
    });
  }

  private setAnim(s: 'idle' | 'run' | 'attack') {
    if (this.animState === s) return;
    this.animState = s;
    if (s === 'idle') this.play(ANIM.knightIdle);
    else if (s === 'run') this.play(ANIM.knightRun);
  }
}
