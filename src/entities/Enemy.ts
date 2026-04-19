import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Knight } from './Knight';

const MELEE_RANGE = 54;
const MELEE_RATE_MS = 1000;
const SPRITE_SCALE = 0.30;
const BOSS_SCALE = 0.42;

export interface EnemyConfig {
  isBoss?: boolean;
}

export class Enemy extends Phaser.GameObjects.Sprite {
  hp: number;
  readonly hpMax: number;
  readonly damage: number;
  speed: number;
  readonly isBoss: boolean;
  slowMs = 0;

  private meleeCooldown = 0;
  private animState: 'run' | 'attack' = 'run';

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: EnemyConfig = {}) {
    super(scene, x, y, AK.enemyRun, 0);
    scene.add.existing(this);

    this.isBoss = !!cfg.isBoss;

    if (this.isBoss) {
      this.hpMax = 72;
      this.hp = 72;
      this.damage = 6;
      this.speed = 44;
      this.setScale(-BOSS_SCALE, BOSS_SCALE);
      this.setTint(0xc0b0c0);
    } else {
      this.hpMax = 36;
      this.hp = 36;
      this.damage = 4;
      this.speed = 55;
      this.setScale(-SPRITE_SCALE, SPRITE_SCALE);
    }
    // Skull painted feet end at y=129/192 (ratio 0.672)
    this.setOrigin(0.5, 0.672);
    this.play(ANIM.enemyRun);
  }

  tick(delta: number, knight: Knight) {
    if (!this.active) return;

    if (this.slowMs > 0) this.slowMs -= delta;
    const speedMultiplier = this.slowMs > 0 ? 0.4 : 1;

    const dx = knight.x - this.x;
    const distance = Math.abs(dx);

    if (distance > MELEE_RANGE) {
      this.x -= this.speed * speedMultiplier * (delta / 1000);
      if (this.animState !== 'run') this.setStateRun();
    } else {
      if (this.animState !== 'attack') this.playAttack();
      if (this.meleeCooldown > 0) this.meleeCooldown -= delta;
      if (this.meleeCooldown <= 0) {
        knight.takeDamage(this.damage);
        this.meleeCooldown = MELEE_RATE_MS;
      }
    }

    if (this.x < -50) this.destroy();
  }

  takeDamage(n: number) {
    this.hp -= n;
    this.setTint(this.isBoss ? 0xffd0d0 : 0xffffff);
    this.scene.time.delayedCall(50, () => {
      if (this.active) this.setTint(this.isBoss ? 0xc0b0c0 : 0xffffff);
      if (this.active && !this.isBoss) this.clearTint();
    });
    this.popDamageNumber(n);
    if (this.hp <= 0) {
      this.scene.game.events.emit('enemy:killed', {
        isBoss: this.isBoss,
        x: this.x,
        y: this.y,
      });
      this.destroy();
    }
  }

  applySlow(ms: number) {
    this.slowMs = Math.max(this.slowMs, ms);
    this.setTint(0xa0c8ff);
    this.scene.time.delayedCall(ms, () => {
      if (this.active) this.setTint(this.isBoss ? 0xc0b0c0 : 0xffffff);
      if (this.active && !this.isBoss) this.clearTint();
    });
  }

  private popDamageNumber(n: number) {
    const t = this.scene.add
      .text(this.x, this.y - 34, `-${n}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#fff0a0',
      })
      .setOrigin(0.5);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 16,
      alpha: 0,
      duration: 600,
      onComplete: () => t.destroy(),
    });
  }

  private setStateRun() {
    this.animState = 'run';
    this.play(ANIM.enemyRun);
  }

  private playAttack() {
    this.animState = 'attack';
    this.play(ANIM.enemyAttack);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.animState = 'run';
      if (this.active) this.play(ANIM.enemyRun);
    });
  }
}
