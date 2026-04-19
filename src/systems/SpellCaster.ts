import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants/layout';
import type { Enemy } from '../entities/Enemy';
import type { Knight } from '../entities/Knight';

export type SpellId = 'heal' | 'fire' | 'ice';

export const MAX_RANK = 3;

interface SpellState {
  id: SpellId;
  baseCooldownAtRank1: number;
  current: number;
  unlocked: boolean;
  rank: number; // 0 when locked; 1..MAX_RANK when unlocked
}

// Priority order per tick: Heal > Fire > Ice. One spell casts per frame.
// Spells start LOCKED — the player picks them via the roguelite-style
// SkillPicker on level-up, and can also spend level-ups to upgrade
// already-picked spells (rank 1 → MAX_RANK). Rank scales the effect and
// reduces the base cooldown. Basic melee attack is always available on
// the Knight (see entities/Knight.ts).
export class SpellCaster {
  private readonly spells: Record<SpellId, SpellState> = {
    // Cooldowns tuned so the opener usually lands within ~15s of the
    // spell being picked (new skills start "ready to cast").
    heal: { id: 'heal', baseCooldownAtRank1: 35_000, current: 35_000, unlocked: false, rank: 0 },
    fire: { id: 'fire', baseCooldownAtRank1: 30_000, current: 30_000, unlocked: false, rank: 0 },
    ice:  { id: 'ice',  baseCooldownAtRank1: 22_000, current: 22_000, unlocked: false, rank: 0 },
  };

  constructor(private readonly scene: Phaser.Scene) {}

  // ────────── picking / leveling ──────────

  unlock(id: SpellId) {
    const s = this.spells[id];
    if (s.unlocked) return;
    s.unlocked = true;
    s.rank = 1;
    s.current = 0;
  }

  upgrade(id: SpellId) {
    const s = this.spells[id];
    if (!s.unlocked || s.rank >= MAX_RANK) return;
    s.rank += 1;
    // New cooldown drops 15% per rank above 1, cap current at the new base.
    if (s.current > this.getBaseCooldown(id)) s.current = this.getBaseCooldown(id);
  }

  isUnlocked(id: SpellId): boolean {
    return this.spells[id].unlocked;
  }

  getRank(id: SpellId): number {
    return this.spells[id].rank;
  }

  canUpgrade(id: SpellId): boolean {
    return this.spells[id].unlocked && this.spells[id].rank < MAX_RANK;
  }

  getLocked(): SpellId[] {
    return (Object.keys(this.spells) as SpellId[]).filter(
      (id) => !this.spells[id].unlocked,
    );
  }

  getUpgradable(): SpellId[] {
    return (Object.keys(this.spells) as SpellId[]).filter((id) => this.canUpgrade(id));
  }

  // ────────── per-rank effect scaling ──────────

  private rankMultiplier(rank: number): number {
    // Rank 1 = 1.00, Rank 2 = 1.35, Rank 3 = 1.70
    return 1 + 0.35 * Math.max(0, rank - 1);
  }

  private cooldownScale(rank: number): number {
    // Rank 1 = 1.00, Rank 2 = 0.85, Rank 3 = 0.70
    return Math.max(0.5, 1 - 0.15 * Math.max(0, rank - 1));
  }

  private fireDamage(): number {
    return Math.round(30 * this.rankMultiplier(this.spells.fire.rank));
  }
  private iceDamage(): number {
    return Math.round(10 * this.rankMultiplier(this.spells.ice.rank));
  }
  private iceSlowMs(): number {
    return Math.round(3000 * this.rankMultiplier(this.spells.ice.rank));
  }
  private healAmount(): number {
    return Math.round(50 * this.rankMultiplier(this.spells.heal.rank));
  }

  // ────────── main tick ──────────

  update(delta: number, knight: Knight, enemies: Enemy[]) {
    (Object.keys(this.spells) as SpellId[]).forEach((id) => {
      const s = this.spells[id];
      if (s.current > 0) s.current = Math.max(0, s.current - delta);
    });

    const visible = enemies.filter(
      (e) => e.active && e.x > 0 && e.x < LOGICAL_WIDTH + 20,
    );
    const hpFraction = knight.hp / knight.hpMax;
    const closestDist = visible.reduce(
      (min, e) => Math.min(min, Math.abs(e.x - knight.x)),
      Infinity,
    );

    if (this.isUnlocked('heal') && this.spells.heal.current <= 0 && hpFraction < 0.55) {
      this.castHeal(knight);
      this.spells.heal.current = this.getBaseCooldown('heal');
      return;
    }
    if (this.isUnlocked('fire') && this.spells.fire.current <= 0 && visible.length >= 2) {
      this.castFire(visible);
      this.spells.fire.current = this.getBaseCooldown('fire');
      return;
    }
    // Ice casts independently of Fire now — the priority loop (Heal > Fire > Ice)
    // and one-cast-per-frame already keeps spells from stepping on each other.
    if (this.isUnlocked('ice') && this.spells.ice.current <= 0 && closestDist < 90) {
      this.castIce(visible);
      this.spells.ice.current = this.getBaseCooldown('ice');
      return;
    }
  }

  reduceAll(ms: number) {
    (Object.keys(this.spells) as SpellId[]).forEach((id) => {
      this.spells[id].current = Math.max(0, this.spells[id].current - ms);
    });
    this.scene.game.events.emit('spell:reduced', ms);
  }

  getCooldown(id: SpellId): number {
    return this.spells[id].current;
  }

  getBaseCooldown(id: SpellId): number {
    const s = this.spells[id];
    // If locked, return rank-1 base so HUD shows a consistent fill value.
    const effectiveRank = Math.max(1, s.rank);
    return s.baseCooldownAtRank1 * this.cooldownScale(effectiveRank);
  }

  private castFire(targets: Enemy[]) {
    const dmg = this.fireDamage();
    targets.forEach((t) => t.takeDamage(dmg));
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0xff6a30, 0.5)
      .setOrigin(0, 0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 240,
      onComplete: () => flash.destroy(),
    });
    this.scene.cameras.main.shake(140, 0.006);
    this.scene.game.events.emit('spell:cast', { id: 'fire' });
  }

  private castIce(targets: Enemy[]) {
    const slowMs = this.iceSlowMs();
    const dmg = this.iceDamage();
    targets.forEach((t) => {
      t.takeDamage(dmg);
      if (t.active) t.applySlow(slowMs);
    });
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0x6ac8ff, 0.45)
      .setOrigin(0, 0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 260,
      onComplete: () => flash.destroy(),
    });
    this.scene.game.events.emit('spell:cast', { id: 'ice' });
  }

  private castHeal(knight: Knight) {
    knight.heal(this.healAmount());
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0x80ff90, 0.35)
      .setOrigin(0, 0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
    this.scene.game.events.emit('spell:cast', { id: 'heal' });
  }
}
