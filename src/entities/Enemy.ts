import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Knight } from './Knight';

const MELEE_RANGE = 54;
const MELEE_RATE_MS = 1000;
const SPRITE_SCALE = 0.30;
const BOSS_SCALE = 0.42;

export interface EnemyConfig {
  isBoss?: boolean;
  // Difficulty tier for regular enemies. Ignored when `isBoss: true`.
  // WaveSpawner increments the tier every time a boss is defeated, so
  // the next wave of regulars is meaningfully stronger. Tier 0 is the
  // baseline skeleton; each tier adds +50% base HP, +2 damage, +5
  // speed, and a different body tint so the player sees the threat.
  tier?: number;
}

// Base stats for tier-0 regulars. Scaling lives in applyTierStats().
const BASE_REGULAR_HP = 36;
const BASE_REGULAR_DMG = 4;
const BASE_REGULAR_SPEED = 55;
// Each tier layers on top of the previous — kept as per-tier deltas so
// the formula stays readable when we add more tiers later.
const TIER_HP_STEP = 18;      // +50% of base per tier
const TIER_DMG_STEP = 2;
const TIER_SPEED_STEP = 5;
// Each tier gets its own tint, cycled if the player outruns the list.
// Tier 0 = no tint (natural skull colour); tier 1+ tinted.
const TIER_TINTS: number[] = [0xffffff, 0xff9a9a, 0xb0a0ff, 0xffc878, 0x9affc8];

export class Enemy extends Phaser.GameObjects.Sprite {
  hp: number;
  readonly hpMax: number;
  readonly damage: number;
  speed: number;
  readonly isBoss: boolean;
  readonly tier: number;
  slowMs = 0;

  private meleeCooldown = 0;
  private animState: 'run' | 'attack' = 'run';
  private baseTint: number;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: EnemyConfig = {}) {
    super(scene, x, y, AK.enemyRun, 0);
    scene.add.existing(this);

    this.isBoss = !!cfg.isBoss;
    this.tier = this.isBoss ? 0 : Math.max(0, cfg.tier ?? 0);

    if (this.isBoss) {
      this.hpMax = 72;
      this.hp = 72;
      this.damage = 6;
      this.speed = 44;
      this.baseTint = 0xc0b0c0;
      this.setScale(-BOSS_SCALE, BOSS_SCALE);
      this.setTint(this.baseTint);
    } else {
      this.hpMax = BASE_REGULAR_HP + TIER_HP_STEP * this.tier;
      this.hp = this.hpMax;
      this.damage = BASE_REGULAR_DMG + TIER_DMG_STEP * this.tier;
      this.speed = BASE_REGULAR_SPEED + TIER_SPEED_STEP * this.tier;
      this.baseTint = TIER_TINTS[this.tier % TIER_TINTS.length]!;
      this.setScale(-SPRITE_SCALE, SPRITE_SCALE);
      if (this.tier > 0) this.setTint(this.baseTint);
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
    this.scene.time.delayedCall(50, () => this.restoreBaseTint());
    this.popDamageNumber(n);
    if (this.hp <= 0) {
      this.scene.game.events.emit('enemy:killed', {
        isBoss: this.isBoss,
        tier: this.tier,
        x: this.x,
        y: this.y,
      });
      this.destroy();
    }
  }

  applySlow(ms: number) {
    this.slowMs = Math.max(this.slowMs, ms);
    this.setTint(0xa0c8ff);
    this.scene.time.delayedCall(ms, () => this.restoreBaseTint());
  }

  // Restore whichever tint this enemy was born with — the boss ghostly
  // purple, or the tier tint for regulars (or none at tier 0).
  private restoreBaseTint() {
    if (!this.active) return;
    if (this.isBoss || this.tier > 0) this.setTint(this.baseTint);
    else this.clearTint();
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
