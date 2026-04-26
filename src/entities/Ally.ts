import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Enemy } from './Enemy';
import type { Knight } from './Knight';
import { Projectile } from './Projectile';

// Tier-2 follower unit. Spawns behind the knight, follows him at a
// fixed offset, auto-targets the nearest enemy in range and fires a
// projectile on its own cooldown. Enemies do NOT target allies back
// (deliberate simplification — matches the approved plan).

export type AllyKind =
  | 'fire-archer'
  | 'ice-archer'
  | 'fire-monk'
  | 'ice-monk'
  | 'wind-monk'
  | 'cleric'
  | 'wind-lancer'
  | 'earth-lancer'
  | 'earth-pawn';

// Behavior branch. Ranged = fires a projectile at nearest enemy.
// Heal = targets the knight himself and restores HP on cooldown.
type AllyBehavior = 'ranged' | 'heal';

interface AllyProfile {
  behavior: AllyBehavior;
  idleAnim: string;
  runAnim: string;
  attackAnim: string;
  attackCooldownMs: number;
  // Ranged: damage dealt to the enemy hit by the projectile.
  // Heal: HP restored to the knight per cast.
  attackDamage: number;
  rangePx: number;
  // Only used by ranged behavior.
  projectileTexture?: string;
  projectileTint?: number;
  projectileSpeed?: number;
  projectileScale?: number;
  scale: number;
  // Flat enemy slow (ms) applied on projectile hit. Used by the ice
  // variants so their shots feel distinct from the fire variants.
  projectileSlowMs?: number;
  // Enemies a single shot can chew through before despawning. Wind
  // Lancer uses this so its strike feels like a piercing sweep.
  projectilePierceCount?: number;
  // When true, the ally walks ahead of the knight and wanders in a
  // small patrol instead of trailing tight behind. Archers use this
  // so they read as their own walking characters, not shadows.
  solo?: boolean;
}

export function isSoloAlly(kind: AllyKind): boolean {
  return !!PROFILES[kind].solo;
}

const PROFILES: Record<AllyKind, AllyProfile> = {
  'fire-archer': {
    behavior: 'ranged',
    idleAnim: ANIM.archerIdle,
    runAnim: ANIM.archerRun,
    attackAnim: ANIM.archerShoot,
    // Slower, heavier shot — relies on quiz-correct cooldown cuts
    // to fire more often. 15s base, quiz answers trim it down.
    attackCooldownMs: 15000,
    attackDamage: 15,
    rangePx: 220,
    projectileTexture: AK.arrow,
    projectileTint: 0xff6a2a, // fiery orange
    projectileSpeed: 520,
    projectileScale: 0.42,
    scale: 0.28,
    solo: true,
  },
  'ice-archer': {
    behavior: 'ranged',
    idleAnim: ANIM.archerIdle,
    runAnim: ANIM.archerRun,
    attackAnim: ANIM.archerShoot,
    // Same archer tempo philosophy: heavy shot every 15s, quiz
    // answers shave it down.
    attackCooldownMs: 15000,
    attackDamage: 10,
    rangePx: 240,
    projectileTexture: AK.arrow,
    projectileTint: 0x6ac8ff, // icy blue
    projectileSpeed: 480,
    projectileScale: 0.42,
    projectileSlowMs: 2000,
    scale: 0.28,
    solo: true,
  },
  'fire-monk': {
    behavior: 'ranged',
    idleAnim: ANIM.monkIdle,
    runAnim: ANIM.monkRun,
    attackAnim: ANIM.monkCast,
    // Old fireball was 30 dmg on 30s CD (screen-wide AOE). As an
    // ally we scale that down to a single-target burst at monk's
    // own cadence — 22 dmg every 4s keeps the "heavy hitter" vibe.
    attackCooldownMs: 4000,
    attackDamage: 22,
    rangePx: 260,
    projectileTexture: AK.arrow,
    projectileTint: 0xff3820,
    projectileSpeed: 380,
    projectileScale: 0.55,
    scale: 0.28,
  },
  'ice-monk': {
    behavior: 'ranged',
    idleAnim: ANIM.monkIdle,
    runAnim: ANIM.monkRun,
    attackAnim: ANIM.monkCast,
    // Blizzard equivalent. Heavier slow, moderate damage.
    attackCooldownMs: 4000,
    attackDamage: 14,
    rangePx: 260,
    projectileTexture: AK.arrow,
    projectileTint: 0x4090ff,
    projectileSpeed: 360,
    projectileScale: 0.55,
    projectileSlowMs: 3000,
    scale: 0.28,
  },
  'wind-monk': {
    behavior: 'ranged',
    idleAnim: ANIM.monkIdle,
    runAnim: ANIM.monkRun,
    attackAnim: ANIM.monkCast,
    // Tornado equivalent. Fast firing, lower damage to compensate.
    attackCooldownMs: 2500,
    attackDamage: 9,
    rangePx: 240,
    projectileTexture: AK.arrow,
    projectileTint: 0x9df59d,
    projectileSpeed: 560,
    projectileScale: 0.5,
    scale: 0.28,
  },
  cleric: {
    behavior: 'heal',
    idleAnim: ANIM.monkIdle,
    runAnim: ANIM.monkRun,
    attackAnim: ANIM.monkCast,
    // Heals the knight periodically. Stays modest so it doesn't
    // trivialise combat — 12 HP every 5s is ~2.4 HP/s passive,
    // meaningful but not an i-win button.
    attackCooldownMs: 5000,
    attackDamage: 12, // reused field = heal amount for heal behavior
    rangePx: 0,       // unused for heal
    scale: 0.28,
  },
  'wind-lancer': {
    behavior: 'ranged',
    idleAnim: ANIM.lancerIdle,
    runAnim: ANIM.lancerRun,
    attackAnim: ANIM.lancerAttack,
    // Old windSlash was 14 dmg / 2.5s single-target. As an ally we
    // keep the fast cadence but give it piercing so a single thrust
    // hits up to 3 enemies in a line.
    attackCooldownMs: 2500,
    attackDamage: 11,
    rangePx: 260,
    projectileTexture: AK.arrow,
    projectileTint: 0xd9ffb0,
    projectileSpeed: 640,
    projectileScale: 0.45,
    projectilePierceCount: 3,
    // Lancer frames are 320px vs archer's 192px — smaller render
    // scale keeps the on-screen silhouette comparable.
    scale: 0.18,
  },
  'earth-lancer': {
    behavior: 'ranged',
    idleAnim: ANIM.lancerIdle,
    runAnim: ANIM.lancerRun,
    attackAnim: ANIM.lancerAttack,
    // Old earthquake was 20 dmg on 26s CD (screen-wide AOE). As an
    // ally we trade screen-wide reach for guaranteed hit + stun-ish
    // slow and faster cadence.
    attackCooldownMs: 4500,
    attackDamage: 20,
    rangePx: 220,
    projectileTexture: AK.arrow,
    projectileTint: 0x8d6e3b, // earth brown
    projectileSpeed: 340,
    projectileScale: 0.65,
    projectileSlowMs: 1500,
    scale: 0.18,
  },
  'earth-pawn': {
    behavior: 'ranged',
    idleAnim: ANIM.pawnAxeIdle,
    runAnim: ANIM.pawnAxeRun,
    attackAnim: ANIM.pawnAxeAttack,
    // Old stoneShield spell was a self-invuln buff for the knight,
    // which doesn't map cleanly to a follower. Earth Pawn instead
    // acts as a sturdy frontliner: short-range axe swings for
    // moderate damage at a comfortable cadence. Feels tanky because
    // the sprite carries an axe and stays close to the knight.
    attackCooldownMs: 2500,
    attackDamage: 13,
    rangePx: 120,
    projectileTexture: AK.arrow,
    projectileTint: 0xd1d1d1, // pale silver — reads as "chop"
    projectileSpeed: 420,
    projectileScale: 0.4,
    scale: 0.28,
  },
};

export class Ally extends Phaser.GameObjects.Sprite {
  readonly kind: AllyKind;
  private profile: AllyProfile;
  private attackTimerMs = 0;
  private animState: 'idle' | 'run' | 'attack' = 'idle';
  private followOffsetX: number;
  // Per-instance phase for the solo-wander sine so multiple solo
  // allies don't drift in perfect lockstep.
  private walkPhase: number;

  constructor(scene: Phaser.Scene, kind: AllyKind, knight: Knight, offsetX: number) {
    const profile = PROFILES[kind];
    // Pick the initial texture based on the idle-anim family so the
    // sprite has the right image even before its first play().
    const idleTexture =
      profile.idleAnim === ANIM.monkIdle
        ? AK.monkIdle
        : profile.idleAnim === ANIM.lancerIdle
        ? AK.lancerIdle
        : profile.idleAnim === ANIM.pawnAxeIdle
        ? AK.pawnAxeIdle
        : AK.archerIdle;
    super(scene, knight.x + offsetX, knight.y, idleTexture, 0);
    scene.add.existing(this);
    this.kind = kind;
    this.profile = profile;
    this.followOffsetX = offsetX;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.setScale(profile.scale);
    this.setOrigin(0.5, 0.71);
    this.play(profile.idleAnim);
    // Face right by default (same orientation as the knight).
  }

  // Read-only getters so the HUD / cooldown publishing can show a
  // progress sweep that matches the Ally's internal timer.
  get cooldownRemaining(): number { return Math.max(0, this.attackTimerMs); }
  get cooldownTotal(): number { return this.profile.attackCooldownMs; }

  tick(
    delta: number,
    knight: Knight,
    enemies: Enemy[],
    projectiles: Phaser.GameObjects.Group,
    cooldownMult: number = 1,
  ) {
    if (this.attackTimerMs > 0) this.attackTimerMs -= delta * cooldownMult;

    // Solo allies (archers) wander ±14 px around a home slot slightly
    // ahead of the knight — reads as a unit walking on its own rather
    // than a shadow glued behind. Non-solo allies still trail.
    const wander = this.profile.solo
      ? Math.sin((this.scene.time.now / 700) + this.walkPhase) * 14
      : 0;
    const targetX = knight.x + this.followOffsetX + wander;
    const dx = targetX - this.x;
    const absDx = Math.abs(dx);
    if (absDx > 1) {
      const step = Math.min(absDx, (140 * delta) / 1000);
      this.x += Math.sign(dx) * step;
    }
    this.y = knight.y;

    // Dispatch by behavior.
    if (this.profile.behavior === 'heal') {
      this.tickHealBehavior(knight, absDx);
      return;
    }

    // Default: ranged. Find the closest active enemy in range.
    let closest: Enemy | undefined;
    let closestDist = this.profile.rangePx;
    for (const e of enemies) {
      if (!e.active) continue;
      const d = Math.abs(e.x - this.x);
      if (d < closestDist) {
        closest = e;
        closestDist = d;
      }
    }

    if (closest && this.attackTimerMs <= 0) {
      this.fireAt(closest, projectiles);
      this.attackTimerMs = this.profile.attackCooldownMs;
      this.setAnim('attack');
    } else if (this.animState === 'attack') {
      // Stay in attack pose until the shoot animation completes; then
      // fall back to idle (or run if we're still catching up).
      if (!this.anims.isPlaying) {
        this.setAnim(absDx > 1 ? 'run' : 'idle');
      }
    } else if (absDx > 1) {
      this.setAnim('run');
    } else {
      this.setAnim('idle');
    }
  }

  // Heal behavior — the Cleric only acts on the knight. Fires when the
  // knight is below max HP and the cooldown is ready. No projectiles;
  // a subtle green camera flash sells the cast and the monk plays its
  // Heal animation.
  private tickHealBehavior(knight: Knight, absDx: number) {
    const canHeal =
      this.attackTimerMs <= 0 && knight.hp > 0 && knight.hp < knight.hpMax;

    if (canHeal) {
      const healed = Math.min(this.profile.attackDamage, knight.hpMax - knight.hp);
      knight.hp += healed;
      this.attackTimerMs = this.profile.attackCooldownMs;
      this.setAnim('attack');
      // Small green flash so the player notices the heal landed.
      this.scene.cameras.main.flash(120, 120, 255, 160);
    } else if (this.animState === 'attack') {
      if (!this.anims.isPlaying) this.setAnim(absDx > 1 ? 'run' : 'idle');
    } else if (absDx > 1) {
      this.setAnim('run');
    } else {
      this.setAnim('idle');
    }
  }

  private setAnim(state: 'idle' | 'run' | 'attack') {
    if (this.animState === state) return;
    this.animState = state;
    if (state === 'idle') this.play(this.profile.idleAnim);
    else if (state === 'run') this.play(this.profile.runAnim);
    else this.play(this.profile.attackAnim);
  }

  private fireAt(enemy: Enemy, projectiles: Phaser.GameObjects.Group) {
    const p = new Projectile(this.scene, this.x + 10, this.y - 18, {
      textureKey: this.profile.projectileTexture!,
      targetX: enemy.x,
      targetY: enemy.y - 12,
      speed: this.profile.projectileSpeed!,
      damage: this.profile.attackDamage,
      tint: this.profile.projectileTint,
      scale: this.profile.projectileScale,
      slowMs: this.profile.projectileSlowMs,
      pierceCount: this.profile.projectilePierceCount,
    });
    projectiles.add(p);
  }
}
