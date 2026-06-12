import type Phaser from 'phaser';
import { gameEvents } from './events';
import type { SkillCardOption } from './SkillPicker';
import { SentenceBuilder } from './SentenceBuilder';
import { metaStore, type BranchId } from './MetaStore';
import { SKILL_TREES } from './SkillTreeDefs';
import type { TreeNode } from './SkillTree';

// Rank lookup injected into the pure card-builder so tests can stub
// player progression without touching localStorage-backed MetaStore.
export type RankLookup = (branchId: BranchId, nodeId: string) => number;

// Callbacks back into GameScene for the pieces that stay scene-side:
// node-effect application (touches knight/spellCaster/spawnAlly), stats
// bookkeeping, the shared pause flag, and the run's XP multiplier.
export interface LevelUpDirectorHooks {
  // Applies a tree-node effect to the live run (knight stats, spell
  // unlocks/ranks, ally spawns). Stays scene-side.
  applyNodeEffect(effect: TreeNode['effect'], rank: number): void;
  // Re-publishes the HUD's spell registry after a pick.
  onSpellsChanged(): void;
  // Fired once per gained level (after `level:up` is emitted) — the
  // scene routes this to UltimateSystem's unlock check.
  onLevelGained(level: number): void;
  // Stats bookkeeping for the sentence / story gates (incl. metaStore
  // lifetime counters + publishStats).
  onSentenceResult(perfect: boolean): void;
  onStoryResult(perfect: boolean): void;
  // The scene's run-XP multiplier (meta-driven, baked in create()).
  getXpMultiplier(): number;
  // `paused` is shared with manual pause (P key) — the scene owns the
  // single flag so toggleManualPause's gate-vs-manual interplay stays
  // exactly as before; the director reads/writes it through these.
  isPaused(): boolean;
  setPaused(paused: boolean): void;
}

// Owns the XP / level / picker / gate flow: XP accrual, level-ups, the
// sentence/story gates in front of the skill picker, and applying the
// picked card. GameScene constructs a fresh instance every create(), so
// a death-restart starts back at level 1 with no pending picker state —
// no manual field resets needed.
export class LevelUpDirector {
  // Public read for the scene (game-over payload, registry seeding);
  // only the director mutates it.
  level = 1;
  private exp = 0;
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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: LevelUpDirectorHooks,
  ) {}

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

  gainExp(amount: number) {
    if (import.meta.env.DEV) console.trace(`[xp] gainExp +${amount}`);
    this.exp += Math.floor(amount * this.hooks.getXpMultiplier());
    while (this.exp >= this.xpForNextLevel()) {
      this.exp -= this.xpForNextLevel();
      this.level += 1;
      this.pendingLevelUps += 1;
      this.levelUpCount += 1;
      this.scene.registry.set('level', this.level);
      gameEvents(this.scene.game).emit('level:up', { level: this.level });
      this.hooks.onLevelGained(this.level);
    }
    this.scene.registry.set('expPct', (this.exp / this.xpForNextLevel()) * 100);
    this.maybeShowPicker();
  }

  private maybeShowPicker() {
    if (this.hooks.isPaused() || this.pendingLevelUps <= 0) return;
    // Consume the one-shot rollover: if the previous story gate failed,
    // we force allowNew=true here regardless of the natural cadence,
    // then clear the flag. A subsequent story-fail will set it again.
    const rolloverActive = this.pendingNewSkillRollover;
    this.pendingNewSkillRollover = false;
    const options = this.buildOptions(
      3,
      rolloverActive ? { allowNew: true } : {},
    );
    if (options.length === 0) {
      // No new skills available and nothing to upgrade — drop remaining
      // level-ups silently so the bar still flows.
      this.pendingLevelUps = 0;
      return;
    }
    this.hooks.setPaused(true);
    this.pendingCardOptions = options;

    // If this level-up's pool contains a "new" spell card, gate it
    // behind a 4-5 sentence story; a single wrong answer anywhere in
    // the story strips the new-spell option at pick time (upgrades
    // still available). Upgrade-only level-ups keep the original
    // single-sentence gate for speed.
    const hasNewCard = options.some((o) => o.kind === 'new');
    if (hasNewCard) {
      gameEvents(this.scene.game).emit('story:show', SentenceBuilder.pickRandomStory());
    } else {
      gameEvents(this.scene.game).emit('sentence:show', SentenceBuilder.pickRandom());
    }
  }

  onSentenceComplete(payload: { id: string | undefined; perfect: boolean }) {
    let options = this.pendingCardOptions;
    if (!options) return;
    this.hooks.onSentenceResult(payload.perfect);
    if (!payload.perfect) {
      // Mistake during the single-sentence gate — upgrade pool stays
      // the same but every card becomes WEAKENED (50% amount).
      options = this.buildOptions(3, { weakened: true });
      this.pendingCardOptions = options;
    }
    gameEvents(this.scene.game).emit('skillpicker:show', options);
  }

  onStoryComplete(payload: {
    id: string;
    perfect: boolean;
    weakened: boolean;
  }) {
    let options = this.pendingCardOptions;
    if (!options) return;
    this.hooks.onStoryResult(payload.perfect);
    // Only the 3-mistake abort path (weakened:true) drops the NEW
    // spell and halves upgrades. Finishing a story with 1–2 mistakes
    // keeps the new-spell option AND full-strength upgrades. A perfect
    // run needs no rebuild.
    if (payload.weakened) {
      // 3-mistake abort — arm the one-shot new-skill rollover so the
      // very next level-up gives the player another chance at a new
      // spell, even if the natural every-4 cadence would skip it.
      this.pendingNewSkillRollover = true;
      options = this.buildOptions(3, {
        allowNew: false,
        weakened: true,
      });
      this.pendingCardOptions = options;
    }
    gameEvents(this.scene.game).emit('skillpicker:show', options);
  }

  onSkillPicked(option: SkillCardOption) {
    const sep = option.key.indexOf(':');
    if (sep < 0) {
      // Defensive: old keys shouldn't reach here after the tree rewire,
      // but if they do, just drop the level-up cleanly.
      this.pendingLevelUps -= 1;
      this.pendingCardOptions = null;
      this.hooks.setPaused(false);
      this.maybeShowPicker();
      return;
    }
    const branchId = option.key.slice(0, sep) as BranchId;
    const nodeId = option.key.slice(sep + 1);
    const node = SKILL_TREES[branchId]?.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    metaStore.buyRank(branchId, nodeId);
    const effect = option.weakened ? weakenEffect(node.effect) : node.effect;
    this.hooks.applyNodeEffect(effect, 1);
    this.hooks.onSpellsChanged();

    this.pendingLevelUps -= 1;
    this.pendingCardOptions = null;
    this.hooks.setPaused(false);
    this.maybeShowPicker();
  }

  // Thin instance wrapper over the pure builder — supplies the live
  // level-up count and the MetaStore-backed rank lookup.
  private buildOptions(
    count: number,
    overrides: { allowNew?: boolean; weakened?: boolean } = {},
  ): SkillCardOption[] {
    return buildCardOptions(count, overrides, this.levelUpCount, (b, n) =>
      metaStore.getRank(b, n),
    );
  }
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
//
// Pure (modulo the in-place shuffles' Math.random): all player state
// arrives through explicit inputs — `levelUpCount` for the new-skill
// cadence and `getRank` for tree progression — so unit tests can call
// it with a stubbed lookup.
export function buildCardOptions(
  count: number,
  overrides: { allowNew?: boolean; weakened?: boolean },
  levelUpCount: number,
  getRank: RankLookup,
): SkillCardOption[] {
  const weakened = !!overrides.weakened;
  const newCards: SkillCardOption[] = [];
  const upgradeCards: SkillCardOption[] = [];

  for (const branchId of ['combat', 'spells', 'scholar', 'writer'] as BranchId[]) {
    for (const node of SKILL_TREES[branchId].nodes) {
      const prereqsMet = node.requires.every((r) => getRank(branchId, r) > 0);
      if (!prereqsMet) continue;
      const rank = getRank(branchId, node.id);
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
    overrides.allowNew ?? (levelUpCount % 4 === 1);
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
