// Persistent meta-progression store backed by localStorage.
//
// Everything "between runs" lives here: accumulated gold, lifetime
// counters (bosses killed, quizzes answered, distinct words solved,
// stories perfected, writing tasks done) and per-branch unlock +
// upgrade state for the City scene.
//
// A single key `wk.meta.v1` holds the whole blob as JSON — versioned
// so we can migrate cleanly later. Reads are cheap (one localStorage
// hit per game start); writes happen only at well-defined moments
// (end of run, branch unlock, upgrade purchase, save-wipe).
//
// NOT persisted: in-run state (current HP, equipped spells, XP toward
// next level). Death always wipes those — that's the core roguelite
// contract.

import type { SpellId } from './SpellCaster';

export const STORAGE_KEY = 'wk.meta.v1';

export type BranchId = 'combat' | 'spells' | 'scholar' | 'writer';

export interface MetaState {
  version: 1;
  // Accumulated gold ("money" in the user-facing city) carried across
  // runs. Earned from kills during a run; survives death; spent in the
  // city on permanent upgrades.
  gold: number;
  // Lifetime counters — increment during a run, never reset except by
  // the explicit wipe action. These feed branch-unlock challenges.
  lifetime: {
    runs: number;
    bossesKilled: number;
    quizCorrect: number;
    perfectStories: number;
    writingTasksDone: number;
    // Set of vocab ids solved correctly at least once. Stored as an
    // array for JSON compatibility; hydrated into a Set on load.
    distinctWordIds: string[];
  };
  branches: {
    combat: {
      unlocked: boolean;
      ranks: { hp: number; dmg: number; spd: number };
    };
    spells: {
      unlocked: boolean;
      chosenStartSpell: SpellId | null;
    };
    scholar: {
      unlocked: boolean;
      ranks: { xpPerQuiz: number; cdCutPerQuiz: number };
    };
    writer: {
      unlocked: boolean;
      ranks: { xpBonus: number };
    };
  };
}

function freshState(): MetaState {
  return {
    version: 1,
    gold: 0,
    lifetime: {
      runs: 0,
      bossesKilled: 0,
      quizCorrect: 0,
      perfectStories: 0,
      writingTasksDone: 0,
      distinctWordIds: [],
    },
    branches: {
      combat: { unlocked: false, ranks: { hp: 0, dmg: 0, spd: 0 } },
      spells: { unlocked: false, chosenStartSpell: null },
      scholar: { unlocked: false, ranks: { xpPerQuiz: 0, cdCutPerQuiz: 0 } },
      writer: { unlocked: false, ranks: { xpBonus: 0 } },
    },
  };
}

// Merge-with-defaults so an older save missing fields doesn't blow up
// when we extend the schema. The `version` check is the migration
// door; when we bump to v2 we'll branch on it here.
function hydrate(raw: unknown): MetaState {
  const fresh = freshState();
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Partial<MetaState> & { version?: number };
  if (r.version !== 1) return fresh;
  return {
    ...fresh,
    ...r,
    lifetime: { ...fresh.lifetime, ...(r.lifetime ?? {}) },
    branches: {
      combat: { ...fresh.branches.combat, ...(r.branches?.combat ?? {}),
        ranks: { ...fresh.branches.combat.ranks, ...(r.branches?.combat?.ranks ?? {}) } },
      spells: { ...fresh.branches.spells, ...(r.branches?.spells ?? {}) },
      scholar: { ...fresh.branches.scholar, ...(r.branches?.scholar ?? {}),
        ranks: { ...fresh.branches.scholar.ranks, ...(r.branches?.scholar?.ranks ?? {}) } },
      writer: { ...fresh.branches.writer, ...(r.branches?.writer ?? {}),
        ranks: { ...fresh.branches.writer.ranks, ...(r.branches?.writer?.ranks ?? {}) } },
    },
  };
}

export class MetaStore {
  private state: MetaState;
  // In-memory mirror of distinctWordIds for O(1) dedup during a run.
  // Persisted as an array back to localStorage on save.
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
      // Corrupted save (user cleared storage mid-write, QuotaExceeded
      // during a previous session, etc.) — treat as fresh state
      // rather than crashing. Players can wipe manually from the City.
      return freshState();
    }
  }

  save() {
    // Keep the set's contents mirrored back to the array before writing.
    this.state.lifetime.distinctWordIds = Array.from(this.distinctWordsSet);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // localStorage disabled / quota full — silently drop. City UI
      // will show last-known state from memory for this session.
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

  // ───── read helpers ─────

  get(): MetaState {
    return this.state;
  }

  getGold(): number {
    return this.state.gold;
  }

  distinctWordCount(): number {
    return this.distinctWordsSet.size;
  }

  // ───── write helpers (save-after to keep localStorage fresh) ─────

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
    if (wordId) this.distinctWordsSet.add(wordId);
    this.save();
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

  endRun() {
    this.state.lifetime.runs += 1;
    this.save();
  }

  // Branch mutators — the City UI drives these. They don't check the
  // unlock challenge themselves; that lives at a higher level so the
  // "did we just earn it?" moment can fire a celebration animation.

  unlockBranch(id: BranchId) {
    this.state.branches[id].unlocked = true;
    this.save();
  }

  buyCombatRank(stat: 'hp' | 'dmg' | 'spd') {
    this.state.branches.combat.ranks[stat] += 1;
    this.save();
  }

  setStartSpell(id: SpellId | null) {
    this.state.branches.spells.chosenStartSpell = id;
    this.save();
  }

  buyScholarRank(stat: 'xpPerQuiz' | 'cdCutPerQuiz') {
    this.state.branches.scholar.ranks[stat] += 1;
    this.save();
  }

  buyWriterRank() {
    this.state.branches.writer.ranks.xpBonus += 1;
    this.save();
  }
}

// Single shared instance. Scenes should import this rather than
// constructing their own — otherwise two copies could diverge before
// the next save.
export const metaStore = new MetaStore();
