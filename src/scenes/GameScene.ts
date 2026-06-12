import Phaser from 'phaser';
import { gameEvents } from '../systems/events';
import { GROUND_Y, KNIGHT_X } from '../constants/layout';
import { Knight } from '../entities/Knight';
import { Ally, isSoloAlly, type AllyKind } from '../entities/Ally';
import { Projectile } from '../entities/Projectile';
import { Enemy } from '../entities/Enemy';
import { WaveSpawner } from '../systems/WaveSpawner';
import { SpellCaster, ALL_SPELL_IDS, type SpellId } from '../systems/SpellCaster';
import type { SkillCardOption } from '../systems/SkillPicker';
import { metaStore, type BranchId } from '../systems/MetaStore';
import { SKILL_TREES } from '../systems/SkillTreeDefs';
import type { TreeNode } from '../systems/SkillTree';
import { ParallaxBackground } from '../systems/ParallaxBackground';
import { LevelUpDirector } from '../systems/LevelUpDirector';
import { UltimateSystem } from '../systems/UltimateSystem';

const WALK_SPEED_MPS = 0.008;

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

  // Extracted systems — re-instantiated every create() so their state
  // (parallax sprite arrays, XP/level/picker flow, ULT cooldown) resets
  // by construction on a death-restart.
  private background!: ParallaxBackground;
  private levelUps!: LevelUpDirector;
  private ult!: UltimateSystem;

  private distance = 0;
  private paused = false;
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
  // Flow / streak — every consecutive correct quiz answer raises this.
  // Once it crosses FLOW_THRESHOLD, ally + ULT cooldowns tick at 2× the
  // normal rate, until the player misses (resets to 0) or the run ends.
  // Visualised by a small flame chip next to the EXP bar.
  private quizStreak = 0;
  private flowActive = false;
  private readonly FLOW_THRESHOLD = 5;
  private readonly FLOW_TICK_MULT = 2;
  // Playtime accumulator — flushed to metaStore every PLAYTIME_FLUSH_MS
  // so the dashboard's day/total numbers stay current without writing
  // localStorage every frame.
  private playMsBuffer = 0;
  private readonly PLAYTIME_FLUSH_MS = 1000;

  constructor() {
    super('Game');
  }

  create() {
    // Class-field initializers only run once (at construction), but
    // `scene.restart()` reuses the instance and re-invokes create().
    // Reset every stateful field up-front so a death-restart truly
    // starts over. New Knight/SpellCaster/WaveSpawner below are fresh
    // because they're re-instantiated in this method — same for the
    // extracted ParallaxBackground/LevelUpDirector/UltimateSystem,
    // which carry the moved state (parallax arrays, XP/level/picker,
    // ULT cooldown) and reset by construction.
    this.distance = 0;
    this.paused = false;
    this.manuallyPaused = false;
    this.quizStreak = 0;
    this.flowActive = false;
    this.playMsBuffer = 0;
    this.stats = {
      quizCorrect: 0,
      quizWrong: 0,
      sentenceCorrect: 0,
      sentenceWrong: 0,
      storiesPerfect: 0,
      storiesFailed: 0,
    };
    this.distinctWords.clear();

    this.background = new ParallaxBackground(this);
    this.background.create();

    this.knight = new Knight(this, KNIGHT_X, GROUND_Y + 10);
    this.knight.setDepth(50);
    this.enemies = this.add.group();
    this.allies = this.add.group();
    this.projectiles = this.add.group();
    this.nextAllyIndex = 0;
    this.spawner = new WaveSpawner(this, this.enemies);
    this.spellCaster = new SpellCaster(this);

    this.ult = new UltimateSystem(this);
    this.levelUps = new LevelUpDirector(this, {
      applyNodeEffect: (effect, rank) => this.applyNodeEffect(effect, rank),
      onSpellsChanged: () => this.publishSpellRegistry(),
      onLevelGained: (level) => this.ult.onLevelChanged(level),
      onSentenceResult: (perfect) => {
        if (perfect) this.stats.sentenceCorrect += 1;
        else this.stats.sentenceWrong += 1;
        this.publishStats();
      },
      onStoryResult: (perfect) => {
        if (perfect) {
          this.stats.storiesPerfect += 1;
          metaStore.incrementPerfectStory();
        } else {
          this.stats.storiesFailed += 1;
        }
        this.publishStats();
      },
      getXpMultiplier: () => this.xpMultiplier,
      // `paused` stays a single scene-owned flag shared between the
      // gates (picker/sentence/story) and manual pause — see
      // toggleManualPause for the interplay.
      isPaused: () => this.paused,
      setPaused: (paused) => {
        this.paused = paused;
      },
    });

    this.applyMetaProgression();

    this.registry.set('level', this.levelUps.level);
    this.registry.set('expPct', 0);
    this.publishSpellRegistry();
    this.registry.set('gold', metaStore.getGold());

    gameEvents(this.game).on('quiz:correct', this.onQuizCorrect, this);
    gameEvents(this.game).on('quiz:wrong', this.onQuizWrong, this);
    // P key toggles manual pause. Ignored while a gate (sentence, story,
    // picker) is already pausing the game — those have their own flow.
    this.input.keyboard?.on('keydown-P', () => this.toggleManualPause());
    gameEvents(this.game).on('ui:togglePause', this.toggleManualPause, this);
    gameEvents(this.game).on('knight:died', this.onKnightDied, this);
    gameEvents(this.game).on('ui:restart', this.onUiRestart, this);
    gameEvents(this.game).on('ui:openCity', this.onOpenCity, this);
    gameEvents(this.game).on('enemy:killed', this.onEnemyKilled, this);
    gameEvents(this.game).on('skillpicker:picked', this.onSkillPicked, this);
    gameEvents(this.game).on('sentence:complete', this.onSentenceComplete, this);
    gameEvents(this.game).on('story:complete', this.onStoryComplete, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameEvents(this.game).off('quiz:correct', this.onQuizCorrect, this);
      gameEvents(this.game).off('quiz:wrong', this.onQuizWrong, this);
      gameEvents(this.game).off('knight:died', this.onKnightDied, this);
      gameEvents(this.game).off('ui:restart', this.onUiRestart, this);
      gameEvents(this.game).off('ui:openCity', this.onOpenCity, this);
      gameEvents(this.game).off('enemy:killed', this.onEnemyKilled, this);
      gameEvents(this.game).off('skillpicker:picked', this.onSkillPicked, this);
      gameEvents(this.game).off('sentence:complete', this.onSentenceComplete, this);
      gameEvents(this.game).off('story:complete', this.onStoryComplete, this);
    });
  }

  update(_time: number, delta: number) {
    if (this.paused) return;
    const enemies = this.enemies.getChildren() as unknown as Enemy[];
    const busy = this.knight.anyEnemyInRange(enemies);

    if (!busy) {
      this.distance += delta * WALK_SPEED_MPS;
      this.background.scroll(delta);
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

    // Ultimate tick — see UltimateSystem. Flow doubles the tick rate
    // same as ally cooldowns.
    this.ult.tick(delta, cooldownMult, enemies);

    this.registry.set('quizStreak', this.quizStreak);
    this.registry.set('flowActive', this.flowActive);

    // Buffer playtime and flush every PLAYTIME_FLUSH_MS so the parent
    // dashboard's day/total numbers update without writing localStorage
    // every frame. Pause and overlays don't reach update() so paused
    // time naturally drops out.
    this.playMsBuffer += delta;
    if (this.playMsBuffer >= this.PLAYTIME_FLUSH_MS) {
      metaStore.recordPlayMs(this.playMsBuffer);
      this.playMsBuffer = 0;
    }

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

  private onQuizCorrect(payload?: { id?: string }) {
    if (import.meta.env.DEV) console.log('[xp] quiz:correct +', this.EXP_PER_QUIZ_CORRECT);
    this.spellCaster.reduceAll(this.quizCorrectCdCutMs);
    this.ult.onQuizCorrect();
    this.quizStreak += 1;
    // Just crossed the threshold — fire the one-shot "FLOW!" event so
    // the HUD can flash a banner. Stays active through subsequent
    // correct answers without re-emitting.
    if (!this.flowActive && this.quizStreak >= this.FLOW_THRESHOLD) {
      this.flowActive = true;
      gameEvents(this.game).emit('flow:activated', { streak: this.quizStreak });
    }
    this.levelUps.gainExp(this.EXP_PER_QUIZ_CORRECT);
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
    gameEvents(this.game).emit('ui:pauseChanged', { paused: this.manuallyPaused });
    this.publishStats();
  }

  private onQuizWrong() {
    if (import.meta.env.DEV) console.log('[xp] quiz:wrong (no xp granted)');
    // Inverse of the correct-answer reward: every spell's cooldown gets
    // pushed back QUIZ_WRONG_PENALTY_MS, teaching the player that silence
    // or wrong picks are dangerous instead of neutral. Capped in
    // SpellCaster.penalizeAll() so the punishment doesn't spiral.
    this.spellCaster.penalizeAll(this.QUIZ_WRONG_PENALTY_MS);
    this.ult.onQuizWrong();
    // Break the streak — flow drops back to idle.
    if (this.flowActive) {
      gameEvents(this.game).emit('flow:broken', { streak: this.quizStreak });
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
      gameEvents(this.game).emit('ui:gameOver', {
        level: this.levelUps.level,
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
    this.levelUps.gainExp(payload.isBoss ? this.EXP_PER_BOSS_KILL : this.EXP_PER_KILL);
    // Gold bounty: 10 per boss, 1 per regular — matches the HUD's
    // existing visible counter, but now persists across runs in meta.
    const baseGold = payload.isBoss ? 10 : 1;
    metaStore.addGold(Math.max(1, Math.round(baseGold * this.goldMultiplier)));
    if (payload.isBoss) metaStore.incrementBossKill();
    // Publish immediately (not just on the next update() tick) so the
    // HUD badge animates in-sync with the kill.
    this.registry.set('gold', metaStore.getGold());
  }

  // Gate / picker flow lives in LevelUpDirector — these shims keep the
  // event subscriptions (and their on/off ordering) scene-owned.
  private onSentenceComplete(payload: { id: string | undefined; perfect: boolean }) {
    this.levelUps.onSentenceComplete(payload);
  }

  private onStoryComplete(payload: {
    id: string;
    perfect: boolean;
    weakened: boolean;
  }) {
    this.levelUps.onStoryComplete(payload);
  }

  private onSkillPicked(option: SkillCardOption) {
    this.levelUps.onSkillPicked(option);
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
