import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Enemy } from './Enemy';

const MELEE_RANGE = 58;
const MELEE_DAMAGE = 10;
const MELEE_RATE_MS = 900;
const SPRITE_SCALE = 0.32;

export class Knight extends Phaser.GameObjects.Sprite {
  readonly hpMax = 100;
  hp = 100;
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
        target.takeDamage(MELEE_DAMAGE);
        this.meleeCooldown = MELEE_RATE_MS;
      } else if (this.animState !== 'attack' && this.animState !== 'idle') {
        this.setAnim('idle');
      }
    } else if (this.animState !== 'run' && this.animState !== 'attack') {
      this.setAnim('run');
    }
  }

  anyEnemyInRange(enemies: Enemy[]): boolean {
    return enemies.some(
      (e) => e.active && Math.abs(e.x - this.x) < MELEE_RANGE,
    );
  }

  takeDamage(n: number) {
    this.hp -= n;
    this.setTint(0xff7070);
    this.scene.time.delayedCall(80, () => this.clearTint());
    this.scene.cameras.main.shake(60, 0.003);
    if (this.hp <= 0) {
      this.hp = this.hpMax;
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
