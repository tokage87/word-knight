import Phaser from 'phaser';
import { AK, ANIM } from '../constants/assetKeys';
import type { Enemy } from './Enemy';

const MELEE_RANGE = 58;
const SPRITE_SCALE = 0.32;

export type KnightStat =
  | 'hpMax' | 'meleeDmg' | 'atkSpd'
  | 'critChance' | 'lifesteal' | 'hpRegen'
  | 'armor' | 'dodgeChance';

export class Knight extends Phaser.GameObjects.Sprite {
  hpMax = 100;
  hp = 100;
  meleeDamage = 10;
  // Moderate slowdown pass (2026-04-22): 900→1300 ms baseline. Earned
  // attack-speed ranks still scale this down via the tree.
  meleeCooldownMs = 1300;
  readonly meleeRange = MELEE_RANGE;

  // Extended stats applied by tree nodes (fractional values are 0..1).
  critChance = 0;
  lifesteal = 0;
  hpRegen = 0;       // HP per second
  armor = 0;         // incoming damage multiplier = (1 - armor)
  dodgeChance = 0;

  private meleeCooldown = 0;
  private animState: 'idle' | 'run' | 'attack' = 'run';
  private regenCarry = 0; // fractional HP accumulator for hpRegen
  private invulnUntilMs = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, AK.knightRun, 0);
    scene.add.existing(this);
    this.setScale(SPRITE_SCALE);
    this.setOrigin(0.5, 0.71);
    this.play(ANIM.knightRun);
  }

  tick(delta: number, enemies: Enemy[]) {
    if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

    // Passive HP regen — accumulate fractional ticks so a "1 HP/sec"
    // stat actually works at 60 FPS.
    if (this.hpRegen > 0 && this.hp > 0 && this.hp < this.hpMax) {
      this.regenCarry += (this.hpRegen * delta) / 1000;
      if (this.regenCarry >= 1) {
        const whole = Math.floor(this.regenCarry);
        this.regenCarry -= whole;
        this.hp = Math.min(this.hpMax, this.hp + whole);
      }
    }

    const target = enemies.find(
      (e) => e.active && Math.abs(e.x - this.x) < MELEE_RANGE,
    );

    if (target) {
      if (this.animState !== 'attack' && this.meleeCooldown <= 0) {
        this.playAttack();
        // Crit roll: double damage, small yellow flash.
        const isCrit = this.critChance > 0 && Math.random() < this.critChance;
        const dmg = isCrit ? this.meleeDamage * 2 : this.meleeDamage;
        target.takeDamage(dmg);
        if (isCrit) {
          this.scene.cameras.main.flash(60, 255, 230, 120);
        }
        // Lifesteal — heal fraction of damage dealt.
        if (this.lifesteal > 0) {
          this.hp = Math.min(this.hpMax, this.hp + dmg * this.lifesteal);
        }
        this.meleeCooldown = this.meleeCooldownMs;
      } else if (this.animState !== 'attack' && this.animState !== 'idle') {
        this.setAnim('idle');
      }
    } else if (this.animState !== 'run' && this.animState !== 'attack') {
      this.setAnim('run');
    }
  }

  // ── stat boost: single dispatch so tree-node effect.kind === 'stat'
  // can call here without knowing the hero internals.
  boostStat(stat: KnightStat, delta: number) {
    switch (stat) {
      case 'hpMax':
        this.hpMax += delta;
        this.hp = Math.min(this.hpMax, this.hp + delta);
        break;
      case 'meleeDmg':
        this.meleeDamage += delta;
        break;
      case 'atkSpd':
        // `delta` here is a 0..1 fraction; reduces cooldown.
        this.meleeCooldownMs = Math.max(
          200,
          Math.round(this.meleeCooldownMs * (1 - delta)),
        );
        break;
      case 'critChance':
        this.critChance = Math.min(1, this.critChance + delta);
        break;
      case 'lifesteal':
        this.lifesteal = Math.min(1, this.lifesteal + delta);
        break;
      case 'hpRegen':
        this.hpRegen += delta;
        break;
      case 'armor':
        this.armor = Math.min(0.8, this.armor + delta);
        break;
      case 'dodgeChance':
        this.dodgeChance = Math.min(0.9, this.dodgeChance + delta);
        break;
    }
  }

  // Legacy stat-boost hooks — kept so the in-run SkillPicker code that
  // calls boostMaxHp / boostMeleeDamage / boostAttackSpeed still works
  // without a rewrite.
  boostMaxHp(amount: number) { this.boostStat('hpMax', amount); }
  boostMeleeDamage(amount: number) { this.boostStat('meleeDmg', amount); }
  boostAttackSpeed(pct: number) { this.boostStat('atkSpd', pct); }

  anyEnemyInRange(enemies: Enemy[]): boolean {
    return enemies.some(
      (e) => e.active && Math.abs(e.x - this.x) < MELEE_RANGE,
    );
  }

  takeDamage(n: number) {
    if (this.hp <= 0) return;
    // Invulnerability window from Stone Shield etc.
    if (this.scene.time.now < this.invulnUntilMs) {
      this.setTint(0xffe2a0);
      this.scene.time.delayedCall(80, () => this.clearTint());
      return;
    }
    // Dodge roll.
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) {
      this.setTint(0xa0e0ff);
      this.scene.time.delayedCall(80, () => this.clearTint());
      return;
    }
    // Armor reduction.
    const applied = this.armor > 0 ? Math.max(1, Math.round(n * (1 - this.armor))) : n;
    this.hp -= applied;
    this.setTint(0xff7070);
    this.scene.time.delayedCall(80, () => this.clearTint());
    this.scene.cameras.main.shake(60, 0.003);
    if (this.hp <= 0) {
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

  // Called by Stone Shield spell — grant invulnerability until `tMs`.
  setInvulnUntil(tMs: number) {
    this.invulnUntilMs = Math.max(this.invulnUntilMs, tMs);
    this.setTint(0xffd880);
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
