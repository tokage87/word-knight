import Phaser from 'phaser';
import { AK, GRASS_CENTER_FRAME } from '../constants/assetKeys';
import {
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  GROUND_Y,
  KNIGHT_X,
} from '../constants/layout';
import { Knight } from '../entities/Knight';
import { Ally, isSoloAlly, type AllyKind } from '../entities/Ally';
import { Projectile } from '../entities/Projectile';
import { Enemy } from '../entities/Enemy';
import { WaveSpawner } from '../systems/WaveSpawner';
import { SpellCaster, MAX_RANK, ALL_SPELL_IDS, type SpellId } from '../systems/SpellCaster';
import type { SkillCardOption } from '../systems/SkillPicker';
import { SentenceBuilder } from '../systems/SentenceBuilder';
import { metaStore, type BranchId } from '../systems/MetaStore';
import { SKILL_TREES } from '../systems/SkillTreeDefs';
import type { TreeNode } from '../systems/SkillTree';

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
  // Tier-2 allies that follow the knight and fire projectiles. Populated
  // by applyMetaProgression() based on unlocked tree nodes.
  private allies!: Phaser.GameObjects.Group;
  private projectiles!: Phaser.GameObjects.Group;
  // Running count of how many allies have spawned this run — used to
  // pick the follow-offset so stacked allies don't pile on the same
  // pixel.
  private nextAllyIndex = 0;
  private spellCaster!: SpellCaster;

  private distance = 0;
  private level = 1;
  private exp = 0;
  private paused = false;
  private pendingLevelUps = 0;
  private levelUpCount = 0;
  private pendingCardOptions: SkillCardOption[] | null = null;
  // One-shot carry-over for the new-skill slot. If the player failed a
  // story (3 mistakes → no NEW in the picker), the very next level-up
  // re-offers the new-skill opportunity even if the natural cadence
  // (every 4th level-up) would skip it. Consumed once — regardless of
  // the next gate's outcome — so it's a single forgiving retry, not an
  // infinite "keep trying" loop. A subsequent fail sets it again.
  private pendingNewSkillRollover = false;
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
  // These become mutable so MetaStore branches (Scholar +XP/quiz,
  // Writer +XP%, quiz-cooldown cut) can adjust them at run start. Base
  // values restored in create() every time a new run begins.
  private EXP_PER_KILL = 8;
  private EXP_PER_BOSS_KILL = 25;
  // Meta-driven run modifiers — baked from metaStore in create().
  private quizCorrectCdCutMs = 5000;
  private xpMultiplier = 1;
  private goldMultiplier = 1;
  // Composite CDR summed from Water-tree nodes; baked into each spell's
  // opener-readiness via spellCaster.reduceAll at run start.
  private globalCooldownReduction = 0;
  // Nerfed from 30 to slow leveling — quiz answers used to rush the
  // player past the early spell pool; now the curve leans on kills +
  // deliberate correct answers instead of quiz spam.
  private EXP_PER_QUIZ_CORRECT = 5;
  // Wrong quiz answer penalty: every spell's current cooldown gets this
  // many ms added, capped at 2× base so it can't stack into oblivion.
  private readonly QUIZ_WRONG_PENALTY_MS = 5000;
  // Ultimate ability — unlocked the first time the player hits
  // ULT_UNLOCK_LEVEL. 120s base cooldown, quiz-correct shaves 3s off,
  // quiz-wrong adds 1s back (capped at base). When ready, auto-casts
  // on the next update() and wipes all on-screen enemies.
  private readonly ULT_UNLOCK_LEVEL = 10;
  private readonly ULT_BASE_CD_MS = 120_000;
  private readonly ULT_CORRECT_CUT_MS = 3000;
  private readonly ULT_WRONG_PENALTY_MS = 1000;
  private readonly ULT_DAMAGE = 200;
  private ultUnlocked = false;
  private ultCdMs = 0;
  // Flow / streak — every consecutive correct quiz answer raises this.
  // Once it crosses FLOW_THRESHOLD, ally + ULT cooldowns tick at 2× the
  // normal rate, until the player misses (resets to 0) or the run ends.
  // Visualised by a small flame chip next to the EXP bar.
  private quizStreak = 0;
  private flowActive = false;
  private readonly FLOW_THRESHOLD = 5;
  private readonly FLOW_TICK_MULT = 2;
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
    this.pendingNewSkillRollover = false;
    this.ultUnlocked = false;
    this.ultCdMs = 0;
    this.quizStreak = 0;
    this.flowActive = false;
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
    this.allies = this.add.group();
    this.projectiles = this.add.group();
    this.nextAllyIndex = 0;
    this.spawner = new WaveSpawner(this, this.enemies);
    this.spellCaster = new SpellCaster(this);

    this.applyMetaProgression();

    this.registry.set('level', this.level);
    this.registry.set('expPct', 0);
    this.publishSpellRegistry();
    this.registry.set('gold', metaStore.getGold());

    this.game.events.on('quiz:correct', this.onQuizCorrect, this);
    this.game.events.on('quiz:wrong', this.onQuizWrong, this);
    // P key toggles manual pause. Ignored while a gate (sentence, story,
    // picker) is already pausing the game — those have their own flow.
    this.input.keyboard?.on('keydown-P', () => this.toggleManualPause());
    this.game.events.on('ui:togglePause', this.toggleManualPause, this);
    this.game.events.on('knight:died', this.onKnightDied, this);
    this.game.events.on('ui:restart', this.onUiRestart, this);
    this.game.events.on('ui:openCity', this.onOpenCity, this);
    this.game.events.on('enemy:killed', this.onEnemyKilled, this);
    this.game.events.on('skillpicker:picked', this.onSkillPicked, this);
    this.game.events.on('sentence:complete', this.onSentenceComplete, this);
    this.game.events.on('story:complete', this.onStoryComplete, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('quiz:correct', this.onQuizCorrect, this);
      this.game.events.off('quiz:wrong', this.onQuizWrong, this);
      this.game.events.off('knight:died', this.onKnightDied, this);
      this.game.events.off('ui:restart', this.onUiRestart, this);
      this.game.events.off('ui:openCity', this.onOpenCity, this);
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

    // Tier-2 ally tick. Allies move toward a follow-slot behind the
    // knight and auto-fire at the nearest enemy in range. Projectiles
    // are a separate group so they outlive the ally that spawned them
    // (e.g. ally dies offscreen — the arrow still hits). Flow doubles
    // the cooldown-tick rate so allies fire faster while the streak
    // is up (movement speed unaffected).
    const allyList = this.allies.getChildren() as unknown as Ally[];
    const cooldownMult = this.flowActive ? this.FLOW_TICK_MULT : 1;
    allyList.forEach((a) =>
      a.tick(delta, this.knight, enemies, this.projectiles, cooldownMult),
    );

    // Projectile collision pass. `tick()` returns false when the
    // projectile hit something or timed out — destroy on next frame
    // to avoid mutating the group while we're iterating it.
    const projList = this.projectiles.getChildren() as unknown as Projectile[];
    const toDestroy: Projectile[] = [];
    projList.forEach((p) => {
      if (!p.tick(delta, enemies)) toDestroy.push(p);
    });
    toDestroy.forEach((p) => p.destroy());

    // Publish ally cooldown snapshot to the HUD. Same shape as the
    // existing spell cooldowns — one row per active ally.
    const allyCds = allyList.map((a) => ({
      allyKind: a.kind,
      remainingMs: a.cooldownRemaining,
      totalMs: a.cooldownTotal,
    }));
    this.registry.set('allyCooldowns', allyCds);

    // Ultimate tick. Only ticks once unlocked; when it reaches 0 it
    // auto-casts, blasts every on-screen enemy, and resets to base.
    // Flow doubles the tick rate same as ally cooldowns.
    if (this.ultUnlocked) {
      if (this.ultCdMs > 0) {
        this.ultCdMs = Math.max(0, this.ultCdMs - delta * cooldownMult);
      }
      if (this.ultCdMs <= 0) {
        this.castUlt(enemies);
        this.ultCdMs = this.ULT_BASE_CD_MS;
      }
      this.registry.set('ultCdMs', this.ultCdMs);
      this.registry.set('ultCdBase', this.ULT_BASE_CD_MS);
    }

    this.registry.set('quizStreak', this.quizStreak);
    this.registry.set('flowActive', this.flowActive);

    this.registry.set('hp', this.knight.hp);
    this.registry.set('hpMax', this.knight.hpMax);
    this.registry.set('meleeDamage', this.knight.meleeDamage);
    this.registry.set('meleeCooldownMs', this.knight.meleeCooldownMs);
    // Earned stats — the HUD pause panel renders them when non-zero.
    this.registry.set('critChance', this.knight.critChance);
    this.registry.set('armor', this.knight.armor);
    this.registry.set('lifesteal', this.knight.lifesteal);
    this.registry.set('dodgeChance', this.knight.dodgeChance);
    this.registry.set('hpRegen', this.knight.hpRegen);
    this.registry.set('gold', metaStore.getGold());
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
    if (import.meta.env.DEV) console.log('[xp] quiz:correct +', this.EXP_PER_QUIZ_CORRECT);
    this.spellCaster.reduceAll(this.quizCorrectCdCutMs);
    if (this.ultUnlocked && this.ultCdMs > 0) {
      this.ultCdMs = Math.max(0, this.ultCdMs - this.ULT_CORRECT_CUT_MS);
    }
    this.quizStreak += 1;
    // Just crossed the threshold — fire the one-shot "FLOW!" event so
    // the HUD can flash a banner. Stays active through subsequent
    // correct answers without re-emitting.
    if (!this.flowActive && this.quizStreak >= this.FLOW_THRESHOLD) {
      this.flowActive = true;
      this.game.events.emit('flow:activated', { streak: this.quizStreak });
    }
    this.gainExp(this.EXP_PER_QUIZ_CORRECT);
    this.stats.quizCorrect += 1;
    if (payload?.id) this.distinctWords.add(payload.id);
    // Mirror into lifetime counters so the City's "50 correct quizzes"
    // challenge can track across runs.
    metaStore.incrementQuizCorrect(payload?.id);
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
    if (import.meta.env.DEV) console.log('[xp] quiz:wrong (no xp granted)');
    // Inverse of the correct-answer reward: every spell's cooldown gets
    // pushed back QUIZ_WRONG_PENALTY_MS, teaching the player that silence
    // or wrong picks are dangerous instead of neutral. Capped in
    // SpellCaster.penalizeAll() so the punishment doesn't spiral.
    this.spellCaster.penalizeAll(this.QUIZ_WRONG_PENALTY_MS);
    if (this.ultUnlocked) {
      this.ultCdMs = Math.min(this.ULT_BASE_CD_MS, this.ultCdMs + this.ULT_WRONG_PENALTY_MS);
    }
    // Break the streak — flow drops back to idle.
    if (this.flowActive) {
      this.game.events.emit('flow:broken', { streak: this.quizStreak });
    }
    this.quizStreak = 0;
    this.flowActive = false;
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
    if (import.meta.env.DEV) console.trace(`[xp] gainExp +${amount}`);
    this.exp += Math.floor(amount * this.xpMultiplier);
    while (this.exp >= this.xpForNextLevel()) {
      this.exp -= this.xpForNextLevel();
      this.level += 1;
      this.pendingLevelUps += 1;
      this.levelUpCount += 1;
      this.registry.set('level', this.level);
      this.game.events.emit('level:up', { level: this.level });
      if (!this.ultUnlocked && this.level >= this.ULT_UNLOCK_LEVEL) {
        this.ultUnlocked = true;
        this.ultCdMs = this.ULT_BASE_CD_MS;
        this.game.events.emit('ult:unlocked');
      }
    }
    this.registry.set('expPct', (this.exp / this.xpForNextLevel()) * 100);
    this.maybeShowPicker();
  }

  // Read MetaStore tree ranks and bake persistent bonuses into THIS
  // run. Called once per create() after Knight + SpellCaster exist.
  // Base stats are already at fresh values from create(), so we add.
  //
  // Iterates over every node in every tree and dispatches by effect
  // kind. Adding a new effect kind = add one case here (see plan §M6).
  private applyMetaProgression() {
    // Reset run-level modifiers to defaults first, then layer meta on.
    this.EXP_PER_QUIZ_CORRECT = 5;
    this.quizCorrectCdCutMs = 5000;
    this.xpMultiplier = 1;
    this.goldMultiplier = 1;
    this.spellCaster.spellDmgMult = 1;

    const branches: BranchId[] = ['combat', 'spells', 'scholar', 'writer'];
    for (const branchId of branches) {
      const tree = SKILL_TREES[branchId];
      for (const node of tree.nodes) {
        const rank = metaStore.getRank(branchId, node.id);
        if (rank <= 0) continue;
        this.applyNodeEffect(node.effect, rank);
      }
    }

    // Global cooldown reduction applies as opener-readiness: trim every
    // spell's starting cooldown proportionally so the first cast lands
    // sooner. Full per-cast CDR would need a SpellCaster refactor we
    // defer — this opener-cut gets us the "feels faster" effect now.
    if (this.globalCooldownReduction > 0) {
      this.spellCaster.reduceAll(this.globalCooldownReduction * 20_000);
    }
    void ALL_SPELL_IDS;
  }

  // Single dispatch for every tree-node effect kind. Extend here when
  // introducing new effect categories.
  private applyNodeEffect(effect: TreeNode['effect'], rank: number) {
    switch (effect.kind) {
      case 'stat': {
        this.knight.boostStat(effect.stat, effect.perRank * rank);
        break;
      }
      case 'runStat': {
        switch (effect.stat) {
          case 'xpMult':
            this.xpMultiplier += effect.perRank * rank;
            break;
          case 'goldMult':
            this.goldMultiplier += effect.perRank * rank;
            break;
          case 'xpPerQuiz':
            this.EXP_PER_QUIZ_CORRECT += effect.perRank * rank;
            break;
          case 'cdCutPerQuiz':
            this.quizCorrectCdCutMs += effect.perRank * rank;
            break;
          case 'globalCooldown':
            this.globalCooldownReduction += effect.perRank * rank;
            break;
          case 'spellDmg':
            this.spellCaster.spellDmgMult += effect.perRank * rank;
            break;
        }
        break;
      }
      case 'spellUnlock': {
        this.spellCaster.unlock(effect.spellId);
        break;
      }
      case 'spellRank': {
        for (let i = 0; i < effect.perRank * rank; i++) {
          this.spellCaster.upgrade(effect.spellId);
        }
        break;
      }
      case 'allyUnlock': {
        this.spawnAlly(effect.allyKind);
        break;
      }
    }
  }

  // Screen-wide ultimate. Applies ULT_DAMAGE to every active enemy in
  // the passed list, plus a layered visual: yellow screen-flash, a
  // lightning bolt + impact ring on each target, an oversized gold
  // damage popup, and the existing camera flash + shake. Skips
  // enemies already off-screen so the bolts don't whiff into the void.
  private castUlt(enemies: Enemy[]) {
    // Screen-wide yellow flash — same pattern as SpellCaster.castFire.
    const flash = this.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0xfff080, 0.55)
      .setOrigin(0, 0)
      .setDepth(80);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 320,
      onComplete: () => flash.destroy(),
    });

    // Snapshot the list before iterating — `takeDamage` can lethal an
    // enemy and remove it from the underlying group array mid-loop,
    // which would skip the next index. Slice gives us a stable view.
    const targets = enemies.slice();
    let hitCount = 0;
    for (const e of targets) {
      if (!e.active) continue;
      if (e.x < -20 || e.x > LOGICAL_WIDTH + 40) continue;

      // Lightning bolt from above the screen down onto the enemy.
      const bolt = this.add.graphics().setDepth(70);
      bolt.lineStyle(3, 0xfff080, 1);
      bolt.lineBetween(e.x, -10, e.x, e.y - 4);
      bolt.lineStyle(1, 0xffffff, 1);
      bolt.lineBetween(e.x - 1, -10, e.x - 1, e.y - 4);
      this.tweens.add({
        targets: bolt,
        alpha: 0,
        duration: 220,
        onComplete: () => bolt.destroy(),
      });

      // Impact ring expands at the strike point.
      const ring = this.add
        .circle(e.x, e.y - 8, 18, 0xfff080, 0.7)
        .setDepth(71);
      ring.setScale(0.3);
      this.tweens.add({
        targets: ring,
        scale: 1.5,
        alpha: 0,
        duration: 320,
        onComplete: () => ring.destroy(),
      });

      // Big gold popup BEFORE takeDamage — the enemy may destroy itself
      // on lethal damage, and we need a live `this` to spawn from.
      e.popBigDamageNumber(this.ULT_DAMAGE);
      e.takeDamage(this.ULT_DAMAGE);
      hitCount += 1;
    }
    this.cameras.main.flash(650, 255, 210, 80);
    this.cameras.main.shake(320, 0.012);
    this.game.events.emit('ult:cast', { hitCount });
  }

  // Spawns an ally into the scene. Solo allies (archers) walk ahead
  // of the knight and wander independently; other allies trail tight
  // behind at stacked offsets so multiple followers don't share a
  // single pixel.
  private spawnAlly(kind: AllyKind) {
    const solo = isSoloAlly(kind);
    const soloCount = this.allies
      .getChildren()
      .filter((a) => (a as Ally).kind && isSoloAlly((a as Ally).kind))
      .length;
    const trailCount = this.nextAllyIndex - soloCount;
    const offset = solo
      ? 60 + soloCount * 18
      : -20 - trailCount * 22;
    const a = new Ally(this, kind, this.knight, offset);
    a.setDepth(49); // just behind the knight (50)
    this.allies.add(a);
    this.nextAllyIndex += 1;
  }

  private onKnightDied() {
    // Freeze the world, play a short red flash + shake, then surface
    // the game-over panel with the final run stats. Actual reset is
    // deferred to `ui:restart` — emitted by the player clicking the
    // RESTART button in the HUD.
    this.paused = true;
    metaStore.endRun();
    this.cameras.main.flash(520, 180, 30, 30);
    this.cameras.main.shake(360, 0.008);
    this.enemies.getChildren().forEach((e) => e.destroy());
    this.allies.getChildren().forEach((a) => a.destroy());
    this.projectiles.getChildren().forEach((p) => p.destroy());
    this.time.delayedCall(500, () => {
      this.game.events.emit('ui:gameOver', {
        level: this.level,
        ...this.stats,
        distinctWords: this.distinctWords.size,
        gold: metaStore.getGold(),
      });
    });
  }

  private onUiRestart() {
    this.enemies.getChildren().forEach((e) => e.destroy());
    this.allies.getChildren().forEach((a) => a.destroy());
    this.projectiles.getChildren().forEach((p) => p.destroy());
    // Restart the UI scene first so its HTML gates (quiz, sentence,
    // picker, game-over panel) get torn down and re-mounted fresh.
    this.scene.get('UI').scene.restart();
    this.scene.restart();
  }

  private onOpenCity() {
    this.enemies.getChildren().forEach((e) => e.destroy());
    this.allies.getChildren().forEach((a) => a.destroy());
    this.projectiles.getChildren().forEach((p) => p.destroy());
    // Stop Game + UI and hand control to CityScene. UIScene will
    // un-mount its HTML overlay (including the Game Over panel) on
    // shutdown, so we come back to a clean slate when "NOWA PRZYGODA"
    // re-starts Game.
    this.scene.stop('UI');
    this.scene.stop('Game');
    this.scene.start('City');
  }

  private onEnemyKilled(payload: { isBoss: boolean }) {
    this.gainExp(payload.isBoss ? this.EXP_PER_BOSS_KILL : this.EXP_PER_KILL);
    // Gold bounty: 10 per boss, 1 per regular — matches the HUD's
    // existing visible counter, but now persists across runs in meta.
    const baseGold = payload.isBoss ? 10 : 1;
    metaStore.addGold(Math.max(1, Math.round(baseGold * this.goldMultiplier)));
    if (payload.isBoss) metaStore.incrementBossKill();
    // Publish immediately (not just on the next update() tick) so the
    // HUD badge animates in-sync with the kill.
    this.registry.set('gold', metaStore.getGold());
  }

  private maybeShowPicker() {
    if (this.paused || this.pendingLevelUps <= 0) return;
    // Consume the one-shot rollover: if the previous story gate failed,
    // we force allowNew=true here regardless of the natural cadence,
    // then clear the flag. A subsequent story-fail will set it again.
    const rolloverActive = this.pendingNewSkillRollover;
    this.pendingNewSkillRollover = false;
    const options = this.buildCardOptions(
      3,
      rolloverActive ? { allowNew: true } : {},
    );
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
    if (payload.perfect) {
      this.stats.storiesPerfect += 1;
      metaStore.incrementPerfectStory();
    } else {
      this.stats.storiesFailed += 1;
    }
    this.publishStats();
    // Only the 3-mistake abort path (weakened:true) drops the NEW
    // spell and halves upgrades. Finishing a story with 1–2 mistakes
    // keeps the new-spell option AND full-strength upgrades. A perfect
    // run needs no rebuild.
    if (payload.weakened) {
      // 3-mistake abort — arm the one-shot new-skill rollover so the
      // very next level-up gives the player another chance at a new
      // spell, even if the natural every-4 cadence would skip it.
      this.pendingNewSkillRollover = true;
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
  // Cards are derived from the skill tree (SkillTreeDefs.ts) so picks
  // persist via metaStore.buyRank and ally-unlock nodes actually spawn
  // the ally mid-run. "New" cards = allyUnlock nodes at rank 0;
  // "upgrade" cards = stat/runStat nodes, or any node with rank > 0.
  private buildCardOptions(
    count: number,
    overrides: { allowNew?: boolean; weakened?: boolean } = {},
  ): SkillCardOption[] {
    const weakened = !!overrides.weakened;
    const newCards: SkillCardOption[] = [];
    const upgradeCards: SkillCardOption[] = [];

    for (const branchId of ['combat', 'spells', 'scholar', 'writer'] as BranchId[]) {
      for (const node of SKILL_TREES[branchId].nodes) {
        const prereqsMet = node.requires.every((r) => metaStore.getRank(branchId, r) > 0);
        if (!prereqsMet) continue;
        const rank = metaStore.getRank(branchId, node.id);
        if (rank >= node.maxRank) continue;
        const nextRank = rank + 1;
        const isAllyNew = node.effect.kind === 'allyUnlock' && rank === 0;
        const rankSuffix = node.maxRank > 1 ? ` ${toRoman(nextRank)}` : '';
        const descText = node.desc(nextRank);
        const card: SkillCardOption = {
          key: `${branchId}:${node.id}`,
          kind: isAllyNew ? 'new' : 'upgrade',
          title: `${node.label}${rankSuffix}`,
          desc: weakened && canWeaken(node) ? `${descText} (−50%)` : descText,
          icon: node.icon,
          weakened: weakened && canWeaken(node),
        };
        if (isAllyNew) newCards.push(card);
        else upgradeCards.push(card);
      }
    }

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
    const sep = option.key.indexOf(':');
    if (sep < 0) {
      // Defensive: old keys shouldn't reach here after the tree rewire,
      // but if they do, just drop the level-up cleanly.
      this.pendingLevelUps -= 1;
      this.pendingCardOptions = null;
      this.paused = false;
      this.maybeShowPicker();
      return;
    }
    const branchId = option.key.slice(0, sep) as BranchId;
    const nodeId = option.key.slice(sep + 1);
    const node = SKILL_TREES[branchId]?.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    metaStore.buyRank(branchId, nodeId);
    const effect = option.weakened ? weakenEffect(node.effect) : node.effect;
    this.applyNodeEffect(effect, 1);
    this.publishSpellRegistry();

    this.pendingLevelUps -= 1;
    this.pendingCardOptions = null;
    this.paused = false;
    this.maybeShowPicker();
  }

  // Keep the HUD's spell-state registry in sync after unlock / upgrade
  // events. Enumerates every SpellId (old and new) so the HUD can
  // render cooldown badges for any spell the tree has surfaced.
  private publishSpellRegistry() {
    const unlocked: SpellId[] = ALL_SPELL_IDS.filter((id) => this.spellCaster.isUnlocked(id));
    this.registry.set('spellsUnlocked', unlocked);
    const ranks: Record<string, number> = {};
    ALL_SPELL_IDS.forEach((id) => { ranks[id] = this.spellCaster.getRank(id); });
    this.registry.set('spellsRank', ranks);
  }

}

// Stat/runStat nodes have numeric `perRank` we halve for weakened
// picks. Ally unlocks are binary (join or don't) — weakening them is
// a no-op. Returning the effect unchanged means "nothing to soften".
function canWeaken(node: TreeNode): boolean {
  return (
    node.effect.kind === 'stat' ||
    node.effect.kind === 'runStat' ||
    node.effect.kind === 'spellRank'
  );
}

function weakenEffect(effect: TreeNode['effect']): TreeNode['effect'] {
  if (
    effect.kind === 'stat' ||
    effect.kind === 'runStat' ||
    effect.kind === 'spellRank'
  ) {
    return { ...effect, perRank: halve(effect.perRank) };
  }
  return effect;
}

// Integer perRank values floor-halve down with a floor of 1 so the
// bonus doesn't silently vanish; fractional ones halve directly so
// e.g. +10% → +5% stays a useful modifier.
function halve(n: number): number {
  if (Number.isInteger(n)) return Math.max(1, Math.floor(n * 0.5));
  return n * 0.5;
}

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
