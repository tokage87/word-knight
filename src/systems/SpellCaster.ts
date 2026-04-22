import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants/layout';
import type { Enemy } from '../entities/Enemy';
import type { Knight } from '../entities/Knight';

export type SpellId =
  // Existing three spells (back-compat): heal, fire (full-screen AoE),
  // ice (full-screen slow+damage).
  | 'heal' | 'fire' | 'ice'
  // Fire-tree additions — fast single-target projectile, full AoE alt.
  | 'fireArrow'
  // Water-tree additions — bigger chill AoE.
  | 'blizzard'
  // Wind-tree additions — piercing projectile, brief orbiting AoE.
  | 'windSlash' | 'tornado'
  // Earth-tree additions — short invulnerability, stun AoE.
  | 'stoneShield' | 'earthquake';

export const ALL_SPELL_IDS: SpellId[] = [
  'fire','ice','heal',
  'fireArrow','blizzard',
  'windSlash','tornado',
  'stoneShield','earthquake',
];

export const MAX_RANK = 3;

interface SpellState {
  id: SpellId;
  baseCooldownAtRank1: number;
  current: number;
  unlocked: boolean;
  rank: number; // 0 when locked; 1..MAX_RANK when unlocked
  // How many of the rank-ups were taken under the WEAKENED flag (i.e.
  // the player made a mistake in the level-up gate). Each weakened rank
  // contributes half the usual rank-bonus to damage/heal/cooldown math.
  weakenedRanks: number;
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
    heal:        { id: 'heal',        baseCooldownAtRank1: 35_000, current: 35_000, unlocked: false, rank: 0, weakenedRanks: 0 },
    fire:        { id: 'fire',        baseCooldownAtRank1: 30_000, current: 30_000, unlocked: false, rank: 0, weakenedRanks: 0 },
    ice:         { id: 'ice',         baseCooldownAtRank1: 22_000, current: 22_000, unlocked: false, rank: 0, weakenedRanks: 0 },
    fireArrow:   { id: 'fireArrow',   baseCooldownAtRank1:  3_000, current:      0, unlocked: false, rank: 0, weakenedRanks: 0 },
    blizzard:    { id: 'blizzard',    baseCooldownAtRank1: 26_000, current: 26_000, unlocked: false, rank: 0, weakenedRanks: 0 },
    windSlash:   { id: 'windSlash',   baseCooldownAtRank1:  2_500, current:      0, unlocked: false, rank: 0, weakenedRanks: 0 },
    tornado:     { id: 'tornado',     baseCooldownAtRank1: 18_000, current: 18_000, unlocked: false, rank: 0, weakenedRanks: 0 },
    stoneShield: { id: 'stoneShield', baseCooldownAtRank1: 24_000, current: 24_000, unlocked: false, rank: 0, weakenedRanks: 0 },
    earthquake:  { id: 'earthquake',  baseCooldownAtRank1: 26_000, current: 26_000, unlocked: false, rank: 0, weakenedRanks: 0 },
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

  upgrade(id: SpellId, weakened = false) {
    const s = this.spells[id];
    if (!s.unlocked || s.rank >= MAX_RANK) return;
    s.rank += 1;
    if (weakened) s.weakenedRanks += 1;
    // New cooldown drops 15% per rank above 1 (or 7.5% if this rank was
    // taken weakened, via cooldownScale below). Cap current at new base.
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

  // A spell's effective "bonus rank count" is (rank - 1) normally, but
  // each WEAKENED rank contributes only 0.5 instead of 1 — so a spell
  // with rank 3 and one weakened rank sits at effective +1.5 ranks
  // (= 2 full + 1 half).
  private effectiveBonus(s: SpellState): number {
    const normalBonus = Math.max(0, s.rank - 1 - s.weakenedRanks);
    return normalBonus + 0.5 * s.weakenedRanks;
  }

  private rankMultiplier(s: SpellState): number {
    // Rank 1 = 1.00, Rank 2 = 1.35, Rank 3 = 1.70; weakened ranks
    // contribute half the +0.35 bonus.
    return 1 + 0.35 * this.effectiveBonus(s);
  }

  private cooldownScale(s: SpellState): number {
    // Rank 1 = 1.00, Rank 2 = 0.85, Rank 3 = 0.70; weakened ranks only
    // trim 7.5% instead of 15%.
    return Math.max(0.5, 1 - 0.15 * this.effectiveBonus(s));
  }

  // Extra multiplier applied to all spell damage — set by
  // applyMetaProgression from the 'stat: spellDmg' tree nodes.
  spellDmgMult = 1;

  private fireDamage(): number {
    return Math.round(30 * this.rankMultiplier(this.spells.fire) * this.spellDmgMult);
  }
  private iceDamage(): number {
    return Math.round(10 * this.rankMultiplier(this.spells.ice) * this.spellDmgMult);
  }
  private iceSlowMs(): number {
    return Math.round(3000 * this.rankMultiplier(this.spells.ice));
  }
  private healAmount(hpMax: number): number {
    // Heal floors at 50 but scales with max HP so fully-geared Knights
    // (~235 HP) actually get a meaningful refill — previously capped at
    // 85 HP (36% of bar).
    const base = Math.max(50, Math.round(0.35 * hpMax));
    return Math.round(base * this.rankMultiplier(this.spells.heal));
  }

  private fireArrowDamage(): number {
    return Math.round(15 * this.rankMultiplier(this.spells.fireArrow) * this.spellDmgMult);
  }
  private blizzardDamage(): number {
    return Math.round(18 * this.rankMultiplier(this.spells.blizzard) * this.spellDmgMult);
  }
  private blizzardSlowMs(): number {
    return Math.round(4000 * this.rankMultiplier(this.spells.blizzard));
  }
  private windSlashDamage(): number {
    return Math.round(14 * this.rankMultiplier(this.spells.windSlash) * this.spellDmgMult);
  }
  private tornadoTickDamage(): number {
    return Math.round(6 * this.rankMultiplier(this.spells.tornado) * this.spellDmgMult);
  }
  private earthquakeDamage(): number {
    return Math.round(20 * this.rankMultiplier(this.spells.earthquake) * this.spellDmgMult);
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

    // Priority order: defensive > AoE > projectile. Self-buffs first
    // so the player doesn't die mid-frame waiting for offensive spells.
    if (this.isUnlocked('stoneShield') && this.spells.stoneShield.current <= 0 && hpFraction < 0.3) {
      this.castStoneShield(knight);
      this.spells.stoneShield.current = this.getBaseCooldown('stoneShield');
      return;
    }
    if (this.isUnlocked('heal') && this.spells.heal.current <= 0 && hpFraction < 0.55) {
      this.castHeal(knight);
      this.spells.heal.current = this.getBaseCooldown('heal');
      return;
    }
    if (this.isUnlocked('earthquake') && this.spells.earthquake.current <= 0 && visible.length >= 2) {
      this.castEarthquake(visible);
      this.spells.earthquake.current = this.getBaseCooldown('earthquake');
      return;
    }
    if (this.isUnlocked('fire') && this.spells.fire.current <= 0 && visible.length >= 2) {
      this.castFire(visible);
      this.spells.fire.current = this.getBaseCooldown('fire');
      return;
    }
    if (this.isUnlocked('blizzard') && this.spells.blizzard.current <= 0 && visible.length >= 2) {
      this.castBlizzard(visible);
      this.spells.blizzard.current = this.getBaseCooldown('blizzard');
      return;
    }
    if (this.isUnlocked('tornado') && this.spells.tornado.current <= 0 && visible.length >= 2) {
      this.castTornado(visible);
      this.spells.tornado.current = this.getBaseCooldown('tornado');
      return;
    }
    // Ice casts independently of Fire — the priority loop and
    // one-cast-per-frame already keep spells from stepping on each other.
    if (this.isUnlocked('ice') && this.spells.ice.current <= 0 && closestDist < 90) {
      this.castIce(visible);
      this.spells.ice.current = this.getBaseCooldown('ice');
      return;
    }
    // Fast projectiles fire whenever there's any visible enemy. These
    // short cooldowns ride on top of melee attacks.
    if (this.isUnlocked('fireArrow') && this.spells.fireArrow.current <= 0 && visible.length >= 1) {
      this.castFireArrow(visible);
      this.spells.fireArrow.current = this.getBaseCooldown('fireArrow');
      return;
    }
    if (this.isUnlocked('windSlash') && this.spells.windSlash.current <= 0 && visible.length >= 1) {
      this.castWindSlash(visible);
      this.spells.windSlash.current = this.getBaseCooldown('windSlash');
      return;
    }
  }

  reduceAll(ms: number) {
    (Object.keys(this.spells) as SpellId[]).forEach((id) => {
      this.spells[id].current = Math.max(0, this.spells[id].current - ms);
    });
    this.scene.game.events.emit('spell:reduced', ms);
  }

  // Wrong-quiz penalty: bumps every spell's current cooldown so it takes
  // longer to be ready. Cap at 2× base so the punishment can't spiral
  // into 30+ seconds of extra wait across a flurry of bad picks.
  penalizeAll(ms: number) {
    (Object.keys(this.spells) as SpellId[]).forEach((id) => {
      const base = this.getBaseCooldown(id);
      this.spells[id].current = Math.min(
        base * 2,
        this.spells[id].current + ms,
      );
    });
    this.scene.game.events.emit('spell:penalized', ms);
  }

  getCooldown(id: SpellId): number {
    return this.spells[id].current;
  }

  getBaseCooldown(id: SpellId): number {
    const s = this.spells[id];
    // If locked, return rank-1 base so HUD shows a consistent fill value.
    const refState: SpellState = s.rank < 1
      ? { ...s, rank: 1, weakenedRanks: 0 }
      : s;
    return s.baseCooldownAtRank1 * this.cooldownScale(refState);
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
    knight.heal(this.healAmount(knight.hpMax));
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

  // Single-target fast projectile. Picks the closest visible enemy and
  // damages it. No screen-flash — this spell fires often, the only
  // thing we emit is the event so the HUD can badge the icon.
  private castFireArrow(visible: Enemy[]) {
    if (visible.length === 0) return;
    const closest = visible.reduce((a, b) => (Math.abs(a.x) < Math.abs(b.x) ? a : b));
    closest.takeDamage(this.fireArrowDamage());
    this.scene.game.events.emit('spell:cast', { id: 'fireArrow' });
  }

  // Piercing line projectile — damages up to 3 visible enemies.
  private castWindSlash(visible: Enemy[]) {
    const targets = visible.slice(0, 3);
    const dmg = this.windSlashDamage();
    targets.forEach((t) => t.takeDamage(dmg));
    this.scene.game.events.emit('spell:cast', { id: 'windSlash' });
  }

  // Big chill AoE — damages all visible and applies a long slow.
  private castBlizzard(targets: Enemy[]) {
    const dmg = this.blizzardDamage();
    const slow = this.blizzardSlowMs();
    targets.forEach((t) => {
      t.takeDamage(dmg);
      if (t.active) t.applySlow(slow);
    });
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0xb0e4ff, 0.55)
      .setOrigin(0, 0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 320,
      onComplete: () => flash.destroy(),
    });
    this.scene.cameras.main.shake(110, 0.004);
    this.scene.game.events.emit('spell:cast', { id: 'blizzard' });
  }

  // Sustained AoE — hits all visible enemies twice over ~2s.
  private castTornado(targets: Enemy[]) {
    const dmg = this.tornadoTickDamage();
    const snapshot = [...targets];
    const tick = () => {
      snapshot.forEach((t) => { if (t.active) t.takeDamage(dmg); });
    };
    tick();
    this.scene.time.delayedCall(700, tick);
    this.scene.time.delayedCall(1400, tick);
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0xd0ffd0, 0.3)
      .setOrigin(0, 0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 1600,
      onComplete: () => flash.destroy(),
    });
    this.scene.game.events.emit('spell:cast', { id: 'tornado' });
  }

  // Self-buff — grant Knight a brief invulnerability window.
  private castStoneShield(knight: Knight) {
    const ms = 2000;
    knight.setInvulnUntil(this.scene.time.now + ms);
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0xc2a060, 0.4)
      .setOrigin(0, 0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 320,
      onComplete: () => flash.destroy(),
    });
    this.scene.game.events.emit('spell:cast', { id: 'stoneShield' });
  }

  // AoE damage + brief stun — reuses Enemy.applySlow for the slow part
  // (no dedicated stun field yet; 500ms of -60% speed reads as a stun).
  private castEarthquake(targets: Enemy[]) {
    const dmg = this.earthquakeDamage();
    targets.forEach((t) => {
      t.takeDamage(dmg);
      if (t.active) t.applySlow(500);
    });
    const flash = this.scene.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0x8b6030, 0.5)
      .setOrigin(0, 0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
    this.scene.cameras.main.shake(220, 0.012);
    this.scene.game.events.emit('spell:cast', { id: 'earthquake' });
  }
}
