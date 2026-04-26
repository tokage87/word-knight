// Persistent meta-progression store backed by localStorage.
//
// Everything "between runs" lives here: accumulated gold, lifetime
// counters (bosses killed, quizzes answered, distinct words solved,
// stories perfected, writing tasks done) and per-branch SKILL-TREE
// rank state for the City scene.
//
// v2 schema: each branch stores `unlockedAt` + `treeRanks: Record<nodeId, number>`.
// v1 → v2 migration maps the old flat-rank fields (combat.ranks.hp
// etc. + spells.chosenStartSpell) onto the new tree-node IDs. Once
// migrated, the store writes v2.
//
// NOT persisted: in-run state (current HP, equipped spells, XP toward
// next level). Death always wipes those — the core roguelite contract.

import type { SpellId } from './SpellCaster';
import { DEFAULT_CURRICULUM, type CurriculumSelection } from './CurriculumTypes';

export const STORAGE_KEY = 'wk.meta.v1';
export const SCHEMA_VERSION = 3;

export type BranchId = 'combat' | 'spells' | 'scholar' | 'writer';

export interface BranchState {
  // Timestamp when the unlock gate was first cleared. null = still
  // locked. Takes precedence over any legacy `unlocked` boolean from v1.
  unlockedAt: number | null;
  // nodeId → rank owned. Missing entries mean rank 0 (not purchased).
  treeRanks: Record<string, number>;
}

export interface DayActivity {
  // ms accumulated in GameScene for that calendar date
  msPlayed: number;
  // # of correct quiz answers on that date
  quizCorrect: number;
  // # of distinct word IDs first-seen-correct on that date
  newWords: number;
}

export interface MetaState {
  version: 3;
  gold: number;
  lifetime: {
    runs: number;
    bossesKilled: number;
    quizCorrect: number;
    perfectStories: number;
    writingTasksDone: number;
    distinctWordIds: string[];
    // YYYY-MM-DD (local date) → activity. Optional so v3 saves
    // hydrate without migration; missing reads as `{}`.
    dailyActivity?: Record<string, DayActivity>;
  };
  branches: Record<BranchId, BranchState>;
  writingSubmissions: WritingSubmission[];
  // v3 addition: player-selectable curriculum. A v2 save rehydrates
  // with DEFAULT_CURRICULUM injected; nothing else changes.
  curriculum: CurriculumSelection;
}

export interface WritingSubmission {
  id: string;
  branch: BranchId;
  prompt: string;
  text: string;
  wordCount: number;
  distinctCount: number;
  submittedAt: number;
}

function freshBranch(): BranchState {
  return { unlockedAt: null, treeRanks: {} };
}

function freshState(): MetaState {
  return {
    version: 3,
    gold: 0,
    lifetime: {
      runs: 0,
      bossesKilled: 0,
      quizCorrect: 0,
      perfectStories: 0,
      writingTasksDone: 0,
      distinctWordIds: [],
      dailyActivity: {},
    },
    branches: {
      combat:  freshBranch(),
      spells:  freshBranch(),
      scholar: freshBranch(),
      writer:  freshBranch(),
    },
    writingSubmissions: [],
    curriculum: { ...DEFAULT_CURRICULUM },
  };
}

// v1 shape, referenced only by the migration path.
interface V1Branches {
  combat?:  { unlocked?: boolean; ranks?: { hp?: number; dmg?: number; spd?: number } };
  spells?:  { unlocked?: boolean; chosenStartSpell?: SpellId | null };
  scholar?: { unlocked?: boolean; ranks?: { xpPerQuiz?: number; cdCutPerQuiz?: number } };
  writer?:  { unlocked?: boolean; ranks?: { xpBonus?: number } };
}

// Map old v1 fields onto new tree-node IDs. spd — which lived on
// combat — maps to wind.atkSpd since "attack speed" is thematically
// a Wind-tree passive in v2. Losing the old unlock flag on `spells`
// is accepted: if the player had chosen a start spell, we mint the
// matching tree-unlock rank so they retain the benefit.
function migrateV1(raw: { branches?: V1Branches; unlocked?: boolean } & Record<string, unknown>): MetaState {
  const fresh = freshState();
  const b = raw.branches ?? {};

  const combatRanks: Record<string, number> = {};
  if (b.combat?.ranks?.hp) combatRanks['fire.hp1'] = b.combat.ranks.hp;
  if (b.combat?.ranks?.dmg) combatRanks['fire.dmg1'] = b.combat.ranks.dmg;
  fresh.branches.combat = {
    unlockedAt: b.combat?.unlocked ? Date.now() : null,
    treeRanks: combatRanks,
  };

  const windRanks: Record<string, number> = {};
  // combat.ranks.spd re-homed onto wind.atkSpd (Wind is where atk-speed lives).
  if (b.combat?.ranks?.spd) windRanks['wind.atkSpd'] = b.combat.ranks.spd;
  if (b.scholar?.ranks?.xpPerQuiz) windRanks['wind.xp'] = b.scholar.ranks.xpPerQuiz;
  if (b.scholar?.ranks?.cdCutPerQuiz) windRanks['wind.cdCut'] = b.scholar.ranks.cdCutPerQuiz;
  fresh.branches.scholar = {
    unlockedAt: b.scholar?.unlocked ? Date.now() : null,
    treeRanks: windRanks,
  };

  const waterRanks: Record<string, number> = {};
  const chosen = b.spells?.chosenStartSpell;
  if (chosen === 'fire') waterRanks['water.ice.unlock'] = 0; // fire isn't a water-tree node; silently drop
  if (chosen === 'ice')  waterRanks['water.ice.unlock'] = 1;
  if (chosen === 'heal') waterRanks['water.heal.unlock'] = 1;
  fresh.branches.spells = {
    unlockedAt: b.spells?.unlocked ? Date.now() : null,
    treeRanks: waterRanks,
  };

  const earthRanks: Record<string, number> = {};
  if (b.writer?.ranks?.xpBonus) earthRanks['earth.xpMult'] = b.writer.ranks.xpBonus;
  fresh.branches.writer = {
    unlockedAt: b.writer?.unlocked ? Date.now() : null,
    treeRanks: earthRanks,
  };

  // Carry top-level fields from v1.
  fresh.gold = typeof raw.gold === 'number' ? raw.gold : 0;
  if (Array.isArray(raw.writingSubmissions)) {
    fresh.writingSubmissions = raw.writingSubmissions as WritingSubmission[];
  }
  if (raw.lifetime && typeof raw.lifetime === 'object') {
    fresh.lifetime = { ...fresh.lifetime, ...(raw.lifetime as object) };
    if (!Array.isArray(fresh.lifetime.distinctWordIds)) fresh.lifetime.distinctWordIds = [];
  }
  return fresh;
}

function hydrate(raw: unknown): MetaState {
  const fresh = freshState();
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as { version?: number } & Record<string, unknown>;
  // v2 and v3 share the same branch/lifetime/submission shape; the only
  // difference is the v3 `curriculum` field. v2 saves rehydrate with
  // DEFAULT_CURRICULUM injected and get written back as v3 on the next
  // mutation. No data loss either direction.
  if (r.version === 2 || r.version === 3) {
    const rbranches = (r.branches ?? {}) as Partial<Record<BranchId, Partial<BranchState>>>;
    const branches: Record<BranchId, BranchState> = {
      combat:  { ...freshBranch(), ...(rbranches.combat  ?? {}), treeRanks: { ...(rbranches.combat?.treeRanks  ?? {}) } },
      spells:  { ...freshBranch(), ...(rbranches.spells  ?? {}), treeRanks: { ...(rbranches.spells?.treeRanks  ?? {}) } },
      scholar: { ...freshBranch(), ...(rbranches.scholar ?? {}), treeRanks: { ...(rbranches.scholar?.treeRanks ?? {}) } },
      writer:  { ...freshBranch(), ...(rbranches.writer  ?? {}), treeRanks: { ...(rbranches.writer?.treeRanks  ?? {}) } },
    };
    const rawCurriculum = r.curriculum as CurriculumSelection | undefined;
    return {
      ...fresh,
      ...(r as object),
      version: 3,
      writingSubmissions: Array.isArray(r.writingSubmissions) ? (r.writingSubmissions as WritingSubmission[]) : [],
      lifetime: { ...fresh.lifetime, ...((r.lifetime as object) ?? {}) },
      branches,
      curriculum: rawCurriculum && typeof rawCurriculum === 'object'
        ? { ...DEFAULT_CURRICULUM, ...rawCurriculum }
        : { ...DEFAULT_CURRICULUM },
    };
  }
  if (r.version === 1 || r.version === undefined) {
    try {
      return migrateV1(r as Parameters<typeof migrateV1>[0]);
    } catch {
      return fresh;
    }
  }
  // Unknown future version — start fresh rather than corrupting.
  return fresh;
}

export class MetaStore {
  private state: MetaState;
  private distinctWordsSet: Set<string>;

  constructor() {
    this.state = this.readFromStorage();
    this.distinctWordsSet = new Set(this.state.lifetime.distinctWordIds);
  }

  private readFromStorage(): MetaState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      return hydrate(JSON.parse(raw));
    } catch {
      return freshState();
    }
  }

  save() {
    this.state.lifetime.distinctWordIds = Array.from(this.distinctWordsSet);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // localStorage disabled / quota full — silently drop.
    }
  }

  wipe() {
    this.state = freshState();
    this.distinctWordsSet = new Set();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  get(): MetaState { return this.state; }
  getGold(): number { return this.state.gold; }
  distinctWordCount(): number { return this.distinctWordsSet.size; }

  addGold(amount: number) {
    if (amount <= 0) return;
    this.state.gold += amount;
    this.save();
  }

  spendGold(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.state.gold < amount) return false;
    this.state.gold -= amount;
    this.save();
    return true;
  }

  incrementQuizCorrect(wordId?: string) {
    this.state.lifetime.quizCorrect += 1;
    const wasNewWord = wordId ? !this.distinctWordsSet.has(wordId) : false;
    if (wordId) this.distinctWordsSet.add(wordId);
    const today = this.todayBucket();
    today.quizCorrect += 1;
    if (wasNewWord) today.newWords += 1;
    this.save();
  }

  // Add `ms` of playtime to today's bucket. Called from GameScene's
  // update loop on a 1s flush cadence so we don't write localStorage
  // every frame.
  recordPlayMs(ms: number) {
    if (ms <= 0) return;
    this.todayBucket().msPlayed += ms;
    this.save();
  }

  getDailyActivity(): Record<string, DayActivity> {
    return this.state.lifetime.dailyActivity ?? {};
  }

  // Consecutive days ending today (or yesterday — grace for kids who
  // play before midnight then check the next morning) with at least one
  // quiz answer logged. Returns 0 if there's no activity today/yesterday.
  getDayStreak(): number {
    const activity = this.getDailyActivity();
    let streak = 0;
    let day = new Date();
    // Allow 1-day grace: if today is empty but yesterday isn't, start
    // counting from yesterday so the streak doesn't break the moment
    // the date rolls over.
    if (!activity[localDateKey(day)]?.quizCorrect) {
      day.setDate(day.getDate() - 1);
      if (!activity[localDateKey(day)]?.quizCorrect) return 0;
    }
    while (activity[localDateKey(day)]?.quizCorrect) {
      streak += 1;
      day.setDate(day.getDate() - 1);
    }
    return streak;
  }

  // Total ms played across every recorded day. Stable across runs.
  getTotalPlayMs(): number {
    let total = 0;
    for (const v of Object.values(this.getDailyActivity())) total += v.msPlayed;
    return total;
  }

  private todayBucket(): DayActivity {
    if (!this.state.lifetime.dailyActivity) this.state.lifetime.dailyActivity = {};
    const key = localDateKey(new Date());
    let bucket = this.state.lifetime.dailyActivity[key];
    if (!bucket) {
      bucket = { msPlayed: 0, quizCorrect: 0, newWords: 0 };
      this.state.lifetime.dailyActivity[key] = bucket;
    }
    return bucket;
  }

  incrementBossKill() {
    this.state.lifetime.bossesKilled += 1;
    this.save();
  }

  incrementPerfectStory() {
    this.state.lifetime.perfectStories += 1;
    this.save();
  }

  incrementWritingTaskDone() {
    this.state.lifetime.writingTasksDone += 1;
    this.save();
  }

  addWritingSubmission(s: WritingSubmission) {
    this.state.writingSubmissions.unshift(s);
    if (this.state.writingSubmissions.length > 20) {
      this.state.writingSubmissions.length = 20;
    }
    this.state.lifetime.writingTasksDone += 1;
    this.save();
  }

  getWritingSubmissions(): WritingSubmission[] {
    return this.state.writingSubmissions;
  }

  // ── curriculum (v3) ──

  getCurriculum(): CurriculumSelection {
    return this.state.curriculum ?? DEFAULT_CURRICULUM;
  }

  setCurriculum(sel: CurriculumSelection) {
    this.state.curriculum = { ...sel };
    this.save();
  }

  endRun() {
    this.state.lifetime.runs += 1;
    this.save();
  }

  // ── branch mutators ──

  unlockBranch(id: BranchId) {
    const b = this.state.branches[id];
    if (b.unlockedAt === null) b.unlockedAt = Date.now();
    this.save();
  }

  isBranchUnlocked(id: BranchId): boolean {
    return this.state.branches[id].unlockedAt !== null;
  }

  getRank(id: BranchId, nodeId: string): number {
    return this.state.branches[id].treeRanks[nodeId] ?? 0;
  }

  setRank(id: BranchId, nodeId: string, rank: number) {
    this.state.branches[id].treeRanks[nodeId] = rank;
    this.save();
  }

  buyRank(id: BranchId, nodeId: string): boolean {
    const b = this.state.branches[id];
    const current = b.treeRanks[nodeId] ?? 0;
    b.treeRanks[nodeId] = current + 1;
    this.save();
    return true;
  }
}

export const metaStore = new MetaStore();

// Local-time YYYY-MM-DD so a kid playing at 23:50 doesn't get
// counted as the next day's session. Avoids UTC date drift entirely.
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
