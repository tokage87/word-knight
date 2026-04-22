import Phaser from 'phaser';
import type { Enemy } from './Enemy';

// Generic projectile — flies in a straight line at a target's last
// known position. Damages whichever active enemy it overlaps first.
// Ships with ally unlocks (Fire Archer first) but is deliberately
// generic so future allies can fire arrows, bolts, darts, etc.
export interface ProjectileConfig {
  textureKey: string;    // Phaser texture key for the projectile sprite
  targetX: number;       // where the projectile is aiming (world coords)
  targetY: number;
  speed: number;         // px per second
  damage: number;
  tint?: number;         // optional color tint (Fire Archer = red)
  scale?: number;        // render scale (Arrow.png is 64x64, too big at 1.0)
  ttlMs?: number;        // max flight time before self-destruct
}

export class Projectile extends Phaser.GameObjects.Image {
  private vx: number;
  private vy: number;
  private damage: number;
  private ttlMs: number;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: ProjectileConfig) {
    super(scene, x, y, cfg.textureKey);
    scene.add.existing(this);
    this.setScale(cfg.scale ?? 0.35);
    this.setOrigin(0.5, 0.5);
    if (cfg.tint !== undefined) this.setTint(cfg.tint);

    const dx = cfg.targetX - x;
    const dy = cfg.targetY - y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    this.vx = (dx / dist) * cfg.speed;
    this.vy = (dy / dist) * cfg.speed;
    this.damage = cfg.damage;
    this.ttlMs = cfg.ttlMs ?? 2000;
    // Rotate sprite to face travel direction. Arrow.png points right
    // by default, so atan2 gives us the correct visual angle.
    this.setRotation(Math.atan2(dy, dx));
  }

  // Called each frame by GameScene. `enemies` is the active enemy list
  // for collision tests. Returns true if the projectile should be kept
  // alive; false means "destroy me" and the caller removes it from its
  // group.
  tick(delta: number, enemies: Enemy[]): boolean {
    this.ttlMs -= delta;
    if (this.ttlMs <= 0) return false;
    this.x += (this.vx * delta) / 1000;
    this.y += (this.vy * delta) / 1000;
    // Offscreen cleanup: if we've flown past the right edge there's
    // nothing to hit. Left edge is less likely but guarded too.
    if (this.x < -40 || this.x > this.scene.cameras.main.width + 40) return false;

    // Simple AABB-ish collision: any enemy within ~24 px of the
    // projectile's center gets hit. Enemies lined up in the run path
    // have ~40 px between them, so 24 is a safe hit radius.
    const HIT_RADIUS = 24;
    for (const e of enemies) {
      if (!e.active) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
        e.takeDamage(this.damage);
        return false;
      }
    }
    return true;
  }
}
