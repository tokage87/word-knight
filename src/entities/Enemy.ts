import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Knight } from './Knight';

const MELEE_RANGE = 54;
// Moderate slowdown pass (2026-04-22): 1000→1300 ms. Gives the kid
// an extra beat between incoming hits to answer a quiz.
const MELEE_RATE_MS = 1300;
const BOSS_SCALE = 0.42;

export interface EnemyConfig {
  isBoss?: boolean;
  // Difficulty tier for regular enemies. Ignored when `isBoss: true`.
  // WaveSpawner increments the tier every time a boss is defeated. Each
  // tier swaps to a stronger-looking sprite (skeleton → goblin → spider
  // → minotaur) and bumps HP / damage / speed. Tiers above the last
  // entry in TIER_PROFILES cycle back to the top-end sprite (minotaur)
  // so content never runs out; stat scaling keeps climbing.
  tier?: number;
}

// Base stats for tier-0 regulars. Deltas per tier layer on top.
const BASE_REGULAR_HP = 36;
const BASE_REGULAR_DMG = 4;
// Moderate slowdown pass (2026-04-22): 55→40 px/s. Gives the kid
// more reaction time to answer a quiz before enemies reach melee range.
const BASE_REGULAR_SPEED = 40;
const TIER_HP_STEP = 18; // +50% of base per tier
const TIER_DMG_STEP = 2;
const TIER_SPEED_STEP = 5;

// One entry per visual tier. `scale` accounts for the source frame size
// (minotaur frames are 320px vs the 192px base, so its display scale is
// smaller to avoid a giant pixel blob). `originY` puts the feet on the
// ground — each sprite's painted feet sit at a different y/frameHeight
// ratio, so we tune per-sprite.
interface TierProfile {
  texture: string;
  idle: string;
  run: string;
  attack: string;
  scale: number;
  originY: number;
}

const TIER_PROFILES: TierProfile[] = [
  // Tier 0 — skeleton (baseline)
  {
    texture: AK.enemyRun,
    idle: ANIM.enemyIdle,
    run: ANIM.enemyRun,
    attack: ANIM.enemyAttack,
    scale: 0.30,
    originY: 0.672,
  },
  // Tier 1 — goblin
  {
    texture: AK.goblinRun,
    idle: ANIM.goblinIdle,
    run: ANIM.goblinRun,
    attack: ANIM.goblinAttack,
    scale: 0.30,
    originY: 0.72,
  },
  // Tier 2 — spider (low silhouette)
  {
    texture: AK.spiderRun,
    idle: ANIM.spiderIdle,
    run: ANIM.spiderRun,
    attack: ANIM.spiderAttack,
    scale: 0.32,
    originY: 0.78,
  },
  // Tier 3+ — minotaur (frames are 320px, so scale is smaller for the
  // same on-screen footprint; still reads bigger than earlier tiers).
  {
    texture: AK.minotaurRun,
    idle: ANIM.minotaurIdle,
    run: ANIM.minotaurRun,
    attack: ANIM.minotaurAttack,
    scale: 0.22,
    originY: 0.72,
  },
];

function profileForTier(tier: number): TierProfile {
  const clamped = Math.min(Math.max(0, tier), TIER_PROFILES.length - 1);
  return TIER_PROFILES[clamped]!;
}

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
  private profile: TierProfile;
  // Boss keeps a gentle purple tint; regular-enemy sprites wear their
  // own art so we don't tint them (white "tint" is a no-op anyway).
  private bossTint = 0xc0b0c0;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: EnemyConfig = {}) {
    const isBoss = !!cfg.isBoss;
    const tier = isBoss ? 0 : Math.max(0, cfg.tier ?? 0);
    const profile = isBoss
      ? TIER_PROFILES[0]! // bosses always render as the skull silhouette
      : profileForTier(tier);

    super(scene, x, y, profile.texture, 0);
    scene.add.existing(this);

    this.isBoss = isBoss;
    this.tier = tier;
    this.profile = profile;

    if (this.isBoss) {
      this.hpMax = 72;
      this.hp = 72;
      this.damage = 6;
      // Moderate slowdown pass: boss speed 44→36.
      this.speed = 36;
      this.setScale(-BOSS_SCALE, BOSS_SCALE);
      this.setTint(this.bossTint);
    } else {
      this.hpMax = BASE_REGULAR_HP + TIER_HP_STEP * this.tier;
      this.hp = this.hpMax;
      this.damage = BASE_REGULAR_DMG + TIER_DMG_STEP * this.tier;
      this.speed = BASE_REGULAR_SPEED + TIER_SPEED_STEP * this.tier;
      this.setScale(-profile.scale, profile.scale);
    }
    this.setOrigin(0.5, profile.originY);
    this.play(profile.run);
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

  // Restore the birth tint — boss keeps its purple glow; regulars have
  // no tint and just display the raw sprite art.
  private restoreBaseTint() {
    if (!this.active) return;
    if (this.isBoss) this.setTint(this.bossTint);
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

  // Oversized gold damage popup for ULT hits. Same tween shape as
  // popDamageNumber but bigger, gold, with stroke + slower lift so the
  // standard yellow popup that takeDamage just spawned doesn't crowd it.
  popBigDamageNumber(n: number) {
    const t = this.scene.add
      .text(this.x, this.y - 38, `-${n}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffd75a',
        stroke: '#3a2a10',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 28,
      alpha: 0,
      duration: 850,
      onComplete: () => t.destroy(),
    });
  }

  private setStateRun() {
    this.animState = 'run';
    this.play(this.profile.run);
  }

  private playAttack() {
    this.animState = 'attack';
    this.play(this.profile.attack);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.animState = 'run';
      if (this.active) this.play(this.profile.run);
    });
  }
}
