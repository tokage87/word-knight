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
  private statRanks: Record<StatId, number> = { maxHp: 0, meleeDmg: 0, atkSpeed: 0 };
  // Manual pause (P key / button) lives separately from `this.paused`
  // which is also used by the picker/sentence gates. We only toggle
  // `paused` if we're not already gated — otherwise the quiz / story /
  // picker would get accidentally resumed when the player unpauses.
  private manuallyPaused = false;
  // Lifetime counters shown on the pause panel. Distinct words is a Set
  // of vocab ids the player got right at least once — nicer metric than
  // raw correct count because spamming the same word doesn't inflate it.
  private stats = {
    quizCorrect: 0,
    quizWrong: 0,
    sentenceCorrect: 0,
    sentenceWrong: 0,
    storiesPerfect: 0,
    storiesFailed: 0,
  };
  private distinctWords = new Set<string>();
  // Quiz answers are the primary XP source — kills give a smaller
  // trickle so progression is gated on vocabulary, not combat.
  private readonly EXP_PER_KILL = 8;
  private readonly EXP_PER_BOSS_KILL = 25;
  // Nerfed from 30 to slow leveling — quiz answers used to rush the
  // player past the early spell pool; now the curve leans on kills +
  // deliberate correct answers instead of quiz spam.
  private readonly EXP_PER_QUIZ_CORRECT = 5;
  // Wrong quiz answer penalty: every spell's current cooldown gets this
  // many ms added, capped at 2× base so it can't stack into oblivion.
  private readonly QUIZ_WRONG_PENALTY_MS = 5000;
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
    // Class-field initializers only run once (at construction), but
    // `scene.restart()` reuses the instance and re-invokes create().
    // Reset every stateful field up-front so a death-restart truly
    // starts over. New Knight/SpellCaster/WaveSpawner below are fresh
    // because they're re-instantiated in this method.
    this.distance = 0;
    this.level = 1;
    this.exp = 0;
    this.paused = false;
    this.manuallyPaused = false;
    this.pendingLevelUps = 0;
    this.levelUpCount = 0;
    this.pendingCardOptions = null;
    this.statRanks = { maxHp: 0, meleeDmg: 0, atkSpeed: 0 };
    this.stats = {
      quizCorrect: 0,
      quizWrong: 0,
      sentenceCorrect: 0,
      sentenceWrong: 0,
      storiesPerfect: 0,
      storiesFailed: 0,
    };
    this.distinctWords.clear();
    this.lastBgScroll = 0;

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
    this.game.events.on('quiz:wrong', this.onQuizWrong, this);
    // P key toggles manual pause. Ignored while a gate (sentence, story,
    // picker) is already pausing the game — those have their own flow.
    this.input.keyboard?.on('keydown-P', () => this.toggleManualPause());
    this.game.events.on('ui:togglePause', this.toggleManualPause, this);
    this.game.events.on('knight:died', this.onKnightDied, this);
    this.game.events.on('enemy:killed', this.onEnemyKilled, this);
    this.game.events.on('skillpicker:picked', this.onSkillPicked, this);
    this.game.events.on('sentence:complete', this.onSentenceComplete, this);
    this.game.events.on('story:complete', this.onStoryComplete, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('quiz:correct', this.onQuizCorrect, this);
      this.game.events.off('quiz:wrong', this.onQuizWrong, this);
      this.game.events.off('knight:died', this.onKnightDied, this);
      this.game.events.off('enemy:killed', this.onEnemyKilled, this);
      this.game.events.off('skillpicker:picked', this.onSkillPicked, this);
      this.game.events.off('sentence:complete', this.onSentenceComplete, this);
      this.game.events.off('story:complete', this.onStoryComplete, this);
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
    this.registry.set('meleeDamage', this.knight.meleeDamage);
    this.registry.set('meleeCooldownMs', this.knight.meleeCooldownMs);
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

  private onQuizCorrect(payload?: { id?: string }) {
    this.spellCaster.reduceAll(5000);
    this.gainExp(this.EXP_PER_QUIZ_CORRECT);
    this.stats.quizCorrect += 1;
    if (payload?.id) this.distinctWords.add(payload.id);
    this.publishStats();
  }

  private toggleManualPause() {
    // Don't fight with a gate-driven pause (picker, sentence, story).
    // If a gate has already paused the game, ignore P — the player will
    // resume via the gate anyway.
    if (!this.manuallyPaused && this.paused) return;
    this.manuallyPaused = !this.manuallyPaused;
    this.paused = this.manuallyPaused;
    this.game.events.emit('ui:pauseChanged', { paused: this.manuallyPaused });
    this.publishStats();
  }

  private onQuizWrong() {
    // Inverse of the correct-answer reward: every spell's cooldown gets
    // pushed back QUIZ_WRONG_PENALTY_MS, teaching the player that silence
    // or wrong picks are dangerous instead of neutral. Capped in
    // SpellCaster.penalizeAll() so the punishment doesn't spiral.
    this.spellCaster.penalizeAll(this.QUIZ_WRONG_PENALTY_MS);
    this.stats.quizWrong += 1;
    this.publishStats();
  }

  private publishStats() {
    this.registry.set('stats', {
      ...this.stats,
      distinctWords: this.distinctWords.size,
    });
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
    // Hard reset: the player loses EVERYTHING — level, XP, unlocked
    // spells, stat upgrades, stats counters — and starts over. A short
    // red flash + freeze gives the death some weight before the
    // scene restarts. Restarting both scenes clears any UI gate that
    // happened to be open (quiz lockout, picker, story progress).
    this.paused = true;
    this.cameras.main.flash(520, 180, 30, 30);
    this.cameras.main.shake(360, 0.008);
    this.time.delayedCall(700, () => {
      // Kill all enemies so the restart doesn't inherit stragglers.
      this.enemies.getChildren().forEach((e) => e.destroy());
      // Restart the UI scene first so its HTML gates (quiz, sentence,
      // picker) get torn down and re-mounted fresh.
      this.scene.get('UI').scene.restart();
      this.scene.restart();
    });
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
    this.paused = true;
    this.pendingCardOptions = options;

    // If this level-up's pool contains a "new" spell card, gate it
    // behind a 4-5 sentence story; a single wrong answer anywhere in
    // the story strips the new-spell option at pick time (upgrades
    // still available). Upgrade-only level-ups keep the original
    // single-sentence gate for speed.
    const hasNewCard = options.some((o) => o.kind === 'new');
    if (hasNewCard) {
      this.game.events.emit('story:show', SentenceBuilder.pickRandomStory());
    } else {
      this.game.events.emit('sentence:show', SentenceBuilder.pickRandom());
    }
  }

  private onSentenceComplete(payload: { id: string; perfect: boolean }) {
    let options = this.pendingCardOptions;
    if (!options) return;
    if (payload.perfect) this.stats.sentenceCorrect += 1;
    else this.stats.sentenceWrong += 1;
    this.publishStats();
    if (!payload.perfect) {
      // Mistake during the single-sentence gate — upgrade pool stays
      // the same but every card becomes WEAKENED (50% amount).
      options = this.buildCardOptions(3, { weakened: true });
      this.pendingCardOptions = options;
    }
    this.game.events.emit('skillpicker:show', options);
  }

  private onStoryComplete(payload: {
    id: string;
    perfect: boolean;
    weakened: boolean;
  }) {
    let options = this.pendingCardOptions;
    if (!options) return;
    if (payload.perfect) this.stats.storiesPerfect += 1;
    else this.stats.storiesFailed += 1;
    this.publishStats();
    // Only the 3-mistake abort path (weakened:true) drops the NEW
    // spell and halves upgrades. Finishing a story with 1–2 mistakes
    // keeps the new-spell option AND full-strength upgrades. A perfect
    // run needs no rebuild.
    if (payload.weakened) {
      options = this.buildCardOptions(3, {
        allowNew: false,
        weakened: true,
      });
      this.pendingCardOptions = options;
    }
    this.game.events.emit('skillpicker:show', options);
  }

  // `overrides.allowNew`, if set, bypasses the default every-other-levelup
  // rule. Used by the story-gate flow to force upgrade-only pools after
  // a failed story (any mistake in the 4-5 sentence gate).
  // `overrides.weakened`, if true, flags every UPGRADE card as weakened
  // (half amount on pick) and rewrites descriptions to show the halved
  // value, so the player knows what they're accepting before picking.
  private buildCardOptions(
    count: number,
    overrides: { allowNew?: boolean; weakened?: boolean } = {},
  ): SkillCardOption[] {
    const lockedIds = this.spellCaster.getLocked();
    const upgradableIds = this.spellCaster.getUpgradable();

    const newCards: SkillCardOption[] = lockedIds.map((id) => ({
      key: `${id}.new`,
      kind: 'new',
      title: SPELL_META[id].name,
      desc: SPELL_META[id].newDesc,
      icon: SPELL_META[id].icon,
    }));
    const weakened = !!overrides.weakened;
    const spellUpgradeCards: SkillCardOption[] = upgradableIds.map((id) => {
      const nextRank = this.spellCaster.getRank(id) + 1;
      return {
        key: `${id}.upgrade`,
        kind: 'upgrade',
        title: `${SPELL_META[id].name} ${toRoman(nextRank)}`,
        desc: weakened
          ? `${SPELL_META[id].upgradeDesc} (−50%)`
          : SPELL_META[id].upgradeDesc,
        icon: SPELL_META[id].icon,
        weakened,
      };
    });
    const statUpgradeCards: SkillCardOption[] = (Object.keys(this.statRanks) as StatId[])
      .filter((id) => this.statRanks[id] < STAT_META[id].maxRank)
      .map((id) => {
        const nextRank = this.statRanks[id] + 1;
        return {
          key: `${id}.stat`,
          kind: 'upgrade',
          title: `${STAT_META[id].name} ${toRoman(nextRank)}`,
          desc: weakened ? STAT_META[id].weakDesc : STAT_META[id].desc,
          icon: STAT_META[id].icon,
          weakened,
        };
      });
    const upgradeCards = [...spellUpgradeCards, ...statUpgradeCards];

    shuffleInPlace(newCards);
    shuffleInPlace(upgradeCards);

    // New skills only appear every 4th level-up (1st, 5th, 9th...).
    // Other level-ups are upgrade-only, with a new-card fallback if the
    // upgrade pool is empty so the picker still shows something.
    // `overrides.allowNew` forces the value (used by the story gate on
    // failure to guarantee upgrade-only cards).
    const allowNew =
      overrides.allowNew ?? (this.levelUpCount % 4 === 1);
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
    const [idStr, kind] = option.key.split('.') as [string, 'new' | 'upgrade' | 'stat'];
    const weakened = !!option.weakened;

    if (kind === 'stat') {
      this.applyStatUpgrade(idStr as StatId, weakened);
    } else if (kind === 'new') {
      this.spellCaster.unlock(idStr as SpellId);
    } else {
      this.spellCaster.upgrade(idStr as SpellId, weakened);
    }

    this.registry.set(
      'spellsUnlocked',
      (['fire', 'ice', 'heal'] as SpellId[]).filter((id) => this.spellCaster.isUnlocked(id)),
    );
    this.registry.set('spellsRank', {
      fire: this.spellCaster.getRank('fire'),
      ice: this.spellCaster.getRank('ice'),
      heal: this.spellCaster.getRank('heal'),
    });
    this.registry.set('statRanks', { ...this.statRanks });

    this.pendingLevelUps -= 1;
    this.pendingCardOptions = null;
    this.paused = false;
    this.maybeShowPicker();
  }

  private applyStatUpgrade(id: StatId, weakened = false) {
    if (this.statRanks[id] >= STAT_META[id].maxRank) return;
    this.statRanks[id] += 1;
    const amount = weakenedAmount(STAT_META[id].amount, weakened, id);
    if (id === 'maxHp') this.knight.boostMaxHp(amount);
    else if (id === 'meleeDmg') this.knight.boostMeleeDamage(amount);
    else if (id === 'atkSpeed') this.knight.boostAttackSpeed(amount);
  }
}

// Halve an upgrade amount when `weakened` (story/sentence gate failed).
// Integer stats floor to 0 sanely; `atkSpeed` is a 0..1 fraction so we
// halve without flooring to avoid silently zeroing the effect.
function weakenedAmount(amount: number, weakened: boolean, id: StatId): number {
  if (!weakened) return amount;
  if (id === 'atkSpeed') return amount * 0.5; // 10% -> 5%
  return Math.floor(amount * 0.5); // 20 -> 10, 3 -> 1
}

type StatId = 'maxHp' | 'meleeDmg' | 'atkSpeed';

const STAT_META: Record<
  StatId,
  { name: string; icon: string; desc: string; weakDesc: string; amount: number; maxRank: number }
> = {
  maxHp: {
    name: 'Vitality',
    icon: '❤️',
    desc: '+20 max HP & heal now.',
    weakDesc: '+10 max HP & heal now.',
    amount: 20,
    maxRank: 5,
  },
  meleeDmg: {
    name: 'Sharp Sword',
    icon: 'assets/ui/Icon_07.png',
    desc: '+3 melee damage.',
    weakDesc: '+1 melee damage.',
    amount: 3,
    maxRank: 5,
  },
  atkSpeed: {
    name: 'Swift Strike',
    icon: 'assets/ui/Icon_09.png',
    desc: '−10% attack cooldown.',
    weakDesc: '−5% attack cooldown.',
    amount: 0.10,
    maxRank: 4,
  },
};

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
    icon: 'assets/ui/Icon_05.png',
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
