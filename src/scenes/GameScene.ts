import Phaser from 'phaser';
import { AK, GRASS_CENTER_FRAME } from '../constants/assetKeys';
import {
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  GROUND_Y,
  KNIGHT_X,
} from '../constants/layout';
import { Knight } from '../entities/Knight';
import { Enemy } from '../entities/Enemy';
import { WaveSpawner } from '../systems/WaveSpawner';
import { SpellCaster, MAX_RANK, type SpellId } from '../systems/SpellCaster';
import type { SkillCardOption } from '../systems/SkillPicker';
import { SentenceBuilder } from '../systems/SentenceBuilder';

const WALK_SPEED_MPS = 0.008;
const CHAMBER_PUSHBACK_M = 200;

interface Villager {
  sprite: Phaser.GameObjects.Sprite;
  baseScrollFactor: number;
}

interface ParallaxSprite {
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  scrollFactor: number;
  wrapWidth: number;
}

export class GameScene extends Phaser.Scene {
  private knight!: Knight;
  private enemies!: Phaser.GameObjects.Group;
  private spawner!: WaveSpawner;
  private spellCaster!: SpellCaster;

  private distance = 0;
  private level = 1;
  private exp = 0;
  private paused = false;
  private pendingLevelUps = 0;
  private levelUpCount = 0;
  private pendingCardOptions: SkillCardOption[] | null = null;
  // Quiz answers are the primary XP source — kills give a smaller
  // trickle so progression is gated on vocabulary, not combat.
  private readonly EXP_PER_KILL = 8;
  private readonly EXP_PER_BOSS_KILL = 25;
  private readonly EXP_PER_QUIZ_CORRECT = 30;
  // Roguelite-style curve: early levels come quickly so the player hits
  // the full skill pool, then upgrades get progressively rarer.
  //   L1→L2: 40 XP  (2 kills)
  //   L2→L3: 60 XP  (3 kills)
  //   L3→L4: 80 XP  (4 kills)   ← full basic pool usually unlocked by here
  //   L4→L5: 100 XP (5 kills)   ← first upgrades
  //   L5→L6: 120 XP ...
  private xpForNextLevel(): number {
    return 40 + (this.level - 1) * 20;
  }
  private ground!: Phaser.GameObjects.TileSprite;

  private skyGradient!: Phaser.GameObjects.Graphics;
  private clouds: ParallaxSprite[] = [];
  private mountains!: Phaser.GameObjects.Graphics;
  private midProps: ParallaxSprite[] = [];
  private villagers: Villager[] = [];
  private bushes: ParallaxSprite[] = [];

  private lastBgScroll = 0;

  constructor() {
    super('Game');
  }

  create() {
    this.drawSky();
    this.drawMountains();
    this.spawnClouds();

    // Ground tile top sits a few px above GROUND_Y so the pale bottom
    // of the sky gradient is hidden behind the grass and characters
    // visually embed into the grass instead of floating above a
    // near-white seam.
    const GROUND_OVERLAP = 4;
    this.ground = this.add
      .tileSprite(
        0,
        GROUND_Y - GROUND_OVERLAP,
        LOGICAL_WIDTH,
        LOGICAL_HEIGHT - GROUND_Y + GROUND_OVERLAP,
        AK.tilemap,
        GRASS_CENTER_FRAME,
      )
      .setOrigin(0, 0)
      .setDepth(10);

    this.spawnMidProps();
    this.spawnVillagerCrowd();
    this.spawnBushes();

    this.knight = new Knight(this, KNIGHT_X, GROUND_Y + 10);
    this.knight.setDepth(50);
    this.enemies = this.add.group();
    this.spawner = new WaveSpawner(this, this.enemies);
    this.spellCaster = new SpellCaster(this);

    this.registry.set('level', this.level);
    this.registry.set('expPct', 0);
    this.registry.set('spellsUnlocked', [] as SpellId[]);
    this.registry.set('spellsRank', { fire: 0, ice: 0, heal: 0 });

    this.game.events.on('quiz:correct', this.onQuizCorrect, this);
    this.game.events.on('knight:died', this.onKnightDied, this);
    this.game.events.on('enemy:killed', this.onEnemyKilled, this);
    this.game.events.on('skillpicker:picked', this.onSkillPicked, this);
    this.game.events.on('sentence:complete', this.onSentenceComplete, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('quiz:correct', this.onQuizCorrect, this);
      this.game.events.off('knight:died', this.onKnightDied, this);
      this.game.events.off('enemy:killed', this.onEnemyKilled, this);
      this.game.events.off('skillpicker:picked', this.onSkillPicked, this);
      this.game.events.off('sentence:complete', this.onSentenceComplete, this);
    });
  }

  update(_time: number, delta: number) {
    if (this.paused) return;
    const enemies = this.enemies.getChildren() as unknown as Enemy[];
    const busy = this.knight.anyEnemyInRange(enemies);

    if (!busy) {
      this.distance += delta * WALK_SPEED_MPS;
      this.scrollParallax(delta);
    }

    this.knight.tick(delta, enemies);
    enemies.forEach((e) => e.tick(delta, this.knight));
    this.spawner.update(delta);
    this.spellCaster.update(delta, this.knight, enemies);

    this.registry.set('hp', this.knight.hp);
    this.registry.set('hpMax', this.knight.hpMax);
    this.registry.set('distance', Math.max(0, Math.floor(this.distance)));
    this.registry.set('fireCd', this.spellCaster.getCooldown('fire'));
    this.registry.set('fireCdBase', this.spellCaster.getBaseCooldown('fire'));
    this.registry.set('iceCd', this.spellCaster.getCooldown('ice'));
    this.registry.set('iceCdBase', this.spellCaster.getBaseCooldown('ice'));
    this.registry.set('healCd', this.spellCaster.getCooldown('heal'));
    this.registry.set('healCdBase', this.spellCaster.getBaseCooldown('heal'));
    const boss = enemies.find((e) => e.active && e.isBoss);
    this.registry.set('bossAlive', !!boss);
    if (boss) {
      this.registry.set('bossHp', boss.hp);
      this.registry.set('bossHpMax', boss.hpMax);
    }
  }

  private drawSky() {
    this.skyGradient = this.add.graphics();
    const colors = [
      Phaser.Display.Color.HexStringToColor('#8ec6ff').color,
      Phaser.Display.Color.HexStringToColor('#c8eaff').color,
      Phaser.Display.Color.HexStringToColor('#e8f4ff').color,
    ];
    this.skyGradient.fillGradientStyle(
      colors[0],
      colors[0],
      colors[2],
      colors[2],
      1,
    );
    this.skyGradient.fillRect(0, 0, LOGICAL_WIDTH, GROUND_Y);
  }

  private drawMountains() {
    this.mountains = this.add.graphics();
    this.mountains.fillStyle(0x7a8aa5, 0.85);
    const baseY = GROUND_Y - 6;
    this.mountains.beginPath();
    this.mountains.moveTo(-20, baseY);
    const peaks = [40, 110, 190, 260, 330, 410, 490, 560, 630];
    const heights = [60, 45, 72, 50, 80, 55, 68, 40, 62];
    peaks.forEach((x, i) => {
      this.mountains.lineTo(x, baseY - heights[i]);
      this.mountains.lineTo(x + 40, baseY - 10);
    });
    this.mountains.lineTo(LOGICAL_WIDTH + 20, baseY);
    this.mountains.closePath();
    this.mountains.fillPath();

    this.mountains.fillStyle(0x556a82, 0.85);
    this.mountains.beginPath();
    this.mountains.moveTo(-20, baseY);
    const peaks2 = [0, 80, 160, 240, 320, 400, 480, 560, 640];
    const heights2 = [40, 55, 42, 70, 38, 62, 44, 58, 46];
    peaks2.forEach((x, i) => {
      this.mountains.lineTo(x, baseY - heights2[i]);
      this.mountains.lineTo(x + 30, baseY - 8);
    });
    this.mountains.lineTo(LOGICAL_WIDTH + 20, baseY);
    this.mountains.closePath();
    this.mountains.fillPath();
  }

  private spawnClouds() {
    const cloudKeys = [AK.cloud1, AK.cloud2, AK.cloud3];
    const positions = [
      { x: 80, y: 40, scale: 0.14 },
      { x: 260, y: 24, scale: 0.16 },
      { x: 440, y: 48, scale: 0.13 },
      { x: 560, y: 28, scale: 0.15 },
    ];
    positions.forEach((p, i) => {
      const sprite = this.add
        .image(p.x, p.y, cloudKeys[i % cloudKeys.length])
        .setOrigin(0.5, 0.5)
        .setScale(p.scale)
        .setAlpha(0.9);
      this.clouds.push({ sprite, scrollFactor: 0.02, wrapWidth: LOGICAL_WIDTH + 200 });
    });
  }

  private spawnMidProps() {
    // Houses + trees along the middle parallax band. Spawned across two
    // copies of the visible strip (x=[0..2*LOGICAL_WIDTH]) so that as
    // the first copy scrolls left the second copy already fills the
    // right side — no empty right edge while waiting for a wrap.
    const base: Array<{ key: string; x: number; scale: number; depth: number }> = [
      { key: AK.houseBlue1, x: 40, scale: 0.42, depth: 15 },
      { key: AK.houseYellow1, x: 210, scale: 0.38, depth: 15 },
      { key: AK.houseRed1, x: 300, scale: 0.44, depth: 15 },
      { key: AK.tree, x: 360, scale: 0.30, depth: 16 },
      { key: AK.houseBlue2, x: 430, scale: 0.40, depth: 15 },
      { key: AK.houseYellow1, x: 520, scale: 0.38, depth: 15 },
      { key: AK.tree, x: 590, scale: 0.26, depth: 16 },
      { key: AK.houseBlue1, x: 640, scale: 0.42, depth: 15 },
    ];
    const props = [...base, ...base.map((p) => ({ ...p, x: p.x + LOGICAL_WIDTH }))];
    const wrapWidth = LOGICAL_WIDTH * 2;
    props.forEach((p) => {
      const originY = p.key === AK.tree ? 0.938 : 0.90;
      const sprite =
        p.key === AK.tree
          ? this.add
              .sprite(p.x, GROUND_Y, p.key, 0)
              .setOrigin(0.5, originY)
              .setScale(p.scale)
          : this.add
              .image(p.x, GROUND_Y, p.key)
              .setOrigin(0.5, originY)
              .setScale(p.scale);
      sprite.setDepth(p.depth);
      this.midProps.push({ sprite, scrollFactor: 0.4, wrapWidth });
    });
  }

  private spawnVillagerCrowd() {
    // Spawn across 2*LOGICAL_WIDTH so the right side stays populated
    // during parallax scroll (matches wrapWidth = 2*LOGICAL_WIDTH).
    const keys = [AK.pawnBlack, AK.pawnPurple, AK.pawnYellow, AK.pawnRed];
    const count = 28;
    const scale = 0.20;
    for (let i = 0; i < count; i++) {
      const x = 20 + i * 45 + Math.random() * 14;
      const key = keys[Math.floor(Math.random() * keys.length)];
      const sprite = this.add
        .sprite(x, GROUND_Y, key, 0)
        .setOrigin(0.5, 0.71)
        .setScale(scale)
        .setDepth(20);
      if (Math.random() < 0.5) sprite.setFlipX(true);
      this.villagers.push({ sprite, baseScrollFactor: 0.55 });
    }
  }

  private spawnBushes() {
    const base = [
      { x: 20, scale: 0.38 },
      { x: 250, scale: 0.34 },
      { x: 480, scale: 0.40 },
      { x: 600, scale: 0.34 },
    ];
    const positions = [...base, ...base.map((p) => ({ ...p, x: p.x + LOGICAL_WIDTH }))];
    const wrapWidth = LOGICAL_WIDTH * 2;
    // bush.png has its painted leaves ending at y=78/128 (ratio 0.609) —
    // the rest of the frame is transparent padding. Use that ratio as
    // origin Y so the bush visually sits on GROUND_Y.
    positions.forEach((p) => {
      const sprite = this.add
        .sprite(p.x, GROUND_Y + 2, AK.bush, 0)
        .setOrigin(0.5, 0.609)
        .setScale(p.scale)
        .setDepth(30);
      this.bushes.push({ sprite, scrollFactor: 0.85, wrapWidth });
    });
  }

  private scrollParallax(delta: number) {
    this.lastBgScroll += delta;
    const px = delta * 0.04;

    this.ground.tilePositionX += px * 1.2;
    this.clouds.forEach((c) => this.driftSprite(c, px));
    this.midProps.forEach((c) => this.driftSprite(c, px));
    this.villagers.forEach((v) =>
      this.driftSprite(
        { sprite: v.sprite, scrollFactor: v.baseScrollFactor, wrapWidth: LOGICAL_WIDTH * 2 },
        px,
      ),
    );
    this.bushes.forEach((b) => this.driftSprite(b, px));
  }

  private driftSprite(p: ParallaxSprite, px: number) {
    p.sprite.x -= px * p.scrollFactor;
    if (p.sprite.x < -p.wrapWidth * 0.3) {
      p.sprite.x += p.wrapWidth;
    }
  }

  private onQuizCorrect() {
    this.spellCaster.reduceAll(5000);
    this.gainExp(this.EXP_PER_QUIZ_CORRECT);
  }

  private gainExp(amount: number) {
    this.exp += amount;
    while (this.exp >= this.xpForNextLevel()) {
      this.exp -= this.xpForNextLevel();
      this.level += 1;
      this.pendingLevelUps += 1;
      this.levelUpCount += 1;
      this.registry.set('level', this.level);
      this.game.events.emit('level:up', { level: this.level });
    }
    this.registry.set('expPct', (this.exp / this.xpForNextLevel()) * 100);
    this.maybeShowPicker();
  }

  private onKnightDied() {
    this.distance = Math.max(0, this.distance - CHAMBER_PUSHBACK_M);
    this.enemies.getChildren().forEach((e) => e.destroy());
    this.cameras.main.flash(220, 180, 60, 60);
  }

  private onEnemyKilled(payload: { isBoss: boolean }) {
    this.gainExp(payload.isBoss ? this.EXP_PER_BOSS_KILL : this.EXP_PER_KILL);
  }

  private maybeShowPicker() {
    if (this.paused || this.pendingLevelUps <= 0) return;
    const options = this.buildCardOptions(3);
    if (options.length === 0) {
      // No new skills available and nothing to upgrade — drop remaining
      // level-ups silently so the bar still flows.
      this.pendingLevelUps = 0;
      return;
    }
    // Pause game and gate the reward behind a sentence-building task.
    // The picker opens once the player completes the sentence.
    this.paused = true;
    this.pendingCardOptions = options;
    this.game.events.emit('sentence:show', SentenceBuilder.pickRandom());
  }

  private onSentenceComplete() {
    const options = this.pendingCardOptions;
    if (!options) return;
    this.game.events.emit('skillpicker:show', options);
  }

  private buildCardOptions(count: number): SkillCardOption[] {
    const lockedIds = this.spellCaster.getLocked();
    const upgradableIds = this.spellCaster.getUpgradable();

    const newCards: SkillCardOption[] = lockedIds.map((id) => ({
      key: `${id}.new`,
      kind: 'new',
      title: SPELL_META[id].name,
      desc: SPELL_META[id].newDesc,
      icon: SPELL_META[id].icon,
    }));
    const upgradeCards: SkillCardOption[] = upgradableIds.map((id) => {
      const nextRank = this.spellCaster.getRank(id) + 1;
      return {
        key: `${id}.upgrade`,
        kind: 'upgrade',
        title: `${SPELL_META[id].name} ${toRoman(nextRank)}`,
        desc: SPELL_META[id].upgradeDesc,
        icon: SPELL_META[id].icon,
      };
    });

    shuffleInPlace(newCards);
    shuffleInPlace(upgradeCards);

    // New skills only appear on every 2nd level-up (1st, 3rd, 5th...).
    // Other level-ups are upgrade-only, with a new-card fallback if the
    // upgrade pool is empty so the picker still shows something.
    const allowNew = this.levelUpCount % 2 === 1;
    const pool: SkillCardOption[] = [];

    if (allowNew) {
      if (newCards.length > 0) pool.push(newCards.shift()!);
      while (pool.length < count && upgradeCards.length > 0) pool.push(upgradeCards.shift()!);
      while (pool.length < count && newCards.length > 0) pool.push(newCards.shift()!);
    } else {
      while (pool.length < count && upgradeCards.length > 0) pool.push(upgradeCards.shift()!);
      // Soft-lock avoidance: if there are no upgrades yet, offer new cards
      // instead of a blank picker.
      if (pool.length === 0) {
        while (pool.length < count && newCards.length > 0) pool.push(newCards.shift()!);
      }
    }

    return pool;
  }

  private onSkillPicked(option: SkillCardOption) {
    const [idStr, kind] = option.key.split('.') as [SpellId, 'new' | 'upgrade'];
    if (kind === 'new') this.spellCaster.unlock(idStr);
    else this.spellCaster.upgrade(idStr);

    this.registry.set(
      'spellsUnlocked',
      (['fire', 'ice', 'heal'] as SpellId[]).filter((id) => this.spellCaster.isUnlocked(id)),
    );
    this.registry.set('spellsRank', {
      fire: this.spellCaster.getRank('fire'),
      ice: this.spellCaster.getRank('ice'),
      heal: this.spellCaster.getRank('heal'),
    });

    this.pendingLevelUps -= 1;
    this.pendingCardOptions = null;
    this.paused = false;
    // If the player has multiple level-ups banked, show the next picker.
    this.maybeShowPicker();
  }
}

const SPELL_META: Record<
  SpellId,
  { name: string; icon: string; newDesc: string; upgradeDesc: string }
> = {
  fire: {
    name: 'Fire',
    icon: '🔥',
    newDesc: 'AoE burn (30 dmg) when 2+ foes are visible.',
    upgradeDesc: '+35% damage, −15% cooldown.',
  },
  ice: {
    name: 'Ice',
    icon: '❄',
    newDesc: 'Chill blast: 10 dmg + 3s slow.',
    upgradeDesc: '+35% damage & slow, −15% cooldown.',
  },
  heal: {
    name: 'Heal',
    icon: '/assets/ui/Icon_05.png',
    newDesc: 'Restore 50 HP when below 55%.',
    upgradeDesc: '+35% healing, −15% cooldown.',
  },
};

function toRoman(n: number): string {
  return n === 1 ? 'I' : n === 2 ? 'II' : n === 3 ? 'III' : String(n);
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

void MAX_RANK;
