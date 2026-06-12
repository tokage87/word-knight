import type Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import type { BranchId } from './MetaStore';
import type { Sentence, Story } from './SentenceBuilder';
import type { SkillCardOption } from './SkillPicker';
import type { SpellId } from './SpellCaster';

// Single source of truth for every custom event that travels over the
// global `game.events` bus. Event names map to their payload type —
// `void` marks events emitted with no argument. All cross-scene
// emit/on/off calls go through `gameEvents()` below so a typo'd event
// name or a wrong payload shape is a compile error, not a silent no-op.
export interface GameEventMap {
  // ── quiz (QuizManager → GameScene) ──
  'quiz:correct': { id: string };
  'quiz:wrong': { id: string };

  // ── sentence / story level-up gates (GameScene ↔ SentenceBuilder) ──
  'sentence:show': Sentence;
  // `id` mirrors the emit site's optional-chain read — it is always set
  // in practice but typed honestly so the emitter compiles unchanged.
  'sentence:complete': { id: string | undefined; perfect: boolean };
  'story:show': Story;
  'story:complete': { id: string; perfect: boolean; weakened: boolean };

  // ── skill picker (GameScene ↔ SkillPicker) ──
  'skillpicker:show': SkillCardOption[];
  'skillpicker:picked': SkillCardOption;

  // ── run progression (GameScene → HUD) ──
  'level:up': { level: number };
  'ult:unlocked': void;
  'ult:cast': { hitCount: number };
  'flow:activated': { streak: number };
  'flow:broken': { streak: number };

  // ── combat (entities / WaveSpawner → scenes) ──
  'knight:died': void;
  'enemy:killed': { isBoss: boolean; tier: number; x: number; y: number };
  'boss:spawned': Enemy;

  // ── spells (SpellCaster → HUD). reduced/penalized carry the ms delta. ──
  'spell:reduced': number;
  'spell:penalized': number;
  'spell:cast': { id: SpellId };

  // ── HUD buttons / overlays (UIScene ↔ GameScene) ──
  'ui:togglePause': void;
  'ui:restart': void;
  'ui:openCity': void;
  'ui:pauseChanged': { paused: boolean };
  'ui:gameOver': {
    level: number;
    quizCorrect: number;
    quizWrong: number;
    sentenceCorrect: number;
    sentenceWrong: number;
    storiesPerfect: number;
    storiesFailed: number;
    distinctWords: number;
    gold: number;
  };

  // ── city hub (CityScene → CityOverlay) ──
  'city:opened': { gold: number };
  'city:closed': void;
  'city:branchClick': { id: BranchId };
  'city:stallClick': void;
  'city:openJournal': void;
  'city:openCurriculum': void;
  'city:openParentDashboard': void;

  // ── writing / listening / cloze gates (CityOverlay ↔ task overlays) ──
  'writing:start': { branchId: BranchId };
  'writing:completed': { branchId: BranchId };
}

// `void` payloads emit with zero arguments; everything else with exactly
// one. Tuple-spread keeps Phaser's variadic emit signature intact.
type EventArgs<K extends keyof GameEventMap> =
  GameEventMap[K] extends void ? [] : [GameEventMap[K]];

// Typed facade over Phaser.Events.EventEmitter. The optional `context`
// mirrors Phaser's on/off signature — Phaser matches listener+context
// pairs on removal, so wrappers must forward it for cleanup to work.
export interface TypedGameEvents {
  emit<K extends keyof GameEventMap>(event: K, ...args: EventArgs<K>): boolean;
  on<K extends keyof GameEventMap>(
    event: K,
    fn: (...args: EventArgs<K>) => void,
    context?: unknown,
  ): this;
  once<K extends keyof GameEventMap>(
    event: K,
    fn: (...args: EventArgs<K>) => void,
    context?: unknown,
  ): this;
  off<K extends keyof GameEventMap>(
    event: K,
    fn: (...args: EventArgs<K>) => void,
    context?: unknown,
  ): this;
}

// The runtime object IS the plain `game.events` emitter — this cast only
// narrows the stringly-typed API down to the GameEventMap contract.
export function gameEvents(game: Phaser.Game): TypedGameEvents {
  return game.events as unknown as TypedGameEvents;
}
