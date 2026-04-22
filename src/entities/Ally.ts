import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Enemy } from './Enemy';
import type { Knight } from './Knight';
import { Projectile } from './Projectile';

// Tier-2 follower unit. Spawns behind the knight, follows him at a
// fixed offset, auto-targets the nearest enemy in range and fires a
// projectile on its own cooldown. Enemies do NOT target allies back
// (deliberate simplification — matches the approved plan).

export type AllyKind = 'fire-archer';

interface AllyProfile {
  idleAnim: string;
  runAnim: string;
  attackAnim: string;
  attackCooldownMs: number;
  attackDamage: number;
  rangePx: number;
  projectileTexture: string;
  projectileTint?: number;
  projectileSpeed: number;
  projectileScale?: number;
  scale: number;
}

const PROFILES: Record<AllyKind, AllyProfile> = {
  'fire-archer': {
    idleAnim: ANIM.archerIdle,
    runAnim: ANIM.archerRun,
    attackAnim: ANIM.archerShoot,
    // Matches the old fireArrow spell tempo + damage so the rework
    // doesn't silently rebalance combat. 15 dmg every 3s.
    attackCooldownMs: 3000,
    attackDamage: 15,
    rangePx: 220,
    projectileTexture: AK.arrow,
    projectileTint: 0xff6a2a, // fiery orange — sells the "fire" flavor
    projectileSpeed: 520,
    projectileScale: 0.42,
    scale: 0.28,
  },
};

export class Ally extends Phaser.GameObjects.Sprite {
  readonly kind: AllyKind;
  private profile: AllyProfile;
  private attackTimerMs = 0;
  private animState: 'idle' | 'run' | 'attack' = 'idle';
  private followOffsetX: number;

  constructor(scene: Phaser.Scene, kind: AllyKind, knight: Knight, offsetX: number) {
    const profile = PROFILES[kind];
    super(scene, knight.x + offsetX, knight.y, AK.archerIdle, 0);
    scene.add.existing(this);
    this.kind = kind;
    this.profile = profile;
    this.followOffsetX = offsetX;
    this.setScale(profile.scale);
    this.setOrigin(0.5, 0.71);
    this.play(profile.idleAnim);
    // Face right by default (same orientation as the knight).
  }

  // Read-only getters so the HUD / cooldown publishing can show a
  // progress sweep that matches the Ally's internal timer.
  get cooldownRemaining(): number { return Math.max(0, this.attackTimerMs); }
  get cooldownTotal(): number { return this.profile.attackCooldownMs; }

  tick(delta: number, knight: Knight, enemies: Enemy[], projectiles: Phaser.GameObjects.Group) {
    if (this.attackTimerMs > 0) this.attackTimerMs -= delta;

    // Move toward the follow slot. Same simple x-ease as the knight's
    // melee range test — no pathfinding, the world is flat.
    const targetX = knight.x + this.followOffsetX;
    const dx = targetX - this.x;
    const absDx = Math.abs(dx);
    if (absDx > 1) {
      const step = Math.min(absDx, (140 * delta) / 1000);
      this.x += Math.sign(dx) * step;
    }
    this.y = knight.y;

    // Find the closest active enemy in range.
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

  private setAnim(state: 'idle' | 'run' | 'attack') {
    if (this.animState === state) return;
    this.animState = state;
    if (state === 'idle') this.play(this.profile.idleAnim);
    else if (state === 'run') this.play(this.profile.runAnim);
    else this.play(this.profile.attackAnim);
  }

  private fireAt(enemy: Enemy, projectiles: Phaser.GameObjects.Group) {
    const p = new Projectile(this.scene, this.x + 10, this.y - 18, {
      textureKey: this.profile.projectileTexture,
      targetX: enemy.x,
      targetY: enemy.y - 12,
      speed: this.profile.projectileSpeed,
      damage: this.profile.attackDamage,
      tint: this.profile.projectileTint,
      scale: this.profile.projectileScale,
    });
    projectiles.add(p);
  }
}
