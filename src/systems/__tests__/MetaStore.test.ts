import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MetaState, WritingSubmission } from '../MetaStore';
import { DEFAULT_CURRICULUM } from '../CurriculumTypes';
import { createLocalStorageStub } from './localStorageStub';

// MetaStore instantiates the `metaStore` singleton at module scope and
// its constructor reads localStorage — the stub must be in place before
// the module is imported, hence stubGlobal + dynamic import.
const storage = createLocalStorageStub();
vi.stubGlobal('localStorage', storage);

const { MetaStore, STORAGE_KEY, LEGACY_STORAGE_KEY, localDateKey } = await import('../MetaStore');

function freshBranch() {
  return { unlockedAt: null, treeRanks: {} };
}

// Full v3 state builder for crafting storage payloads in tests.
function v3State(): MetaState {
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
      wordStats: {},
    },
    branches: {
      combat: freshBranch(),
      spells: freshBranch(),
      scholar: freshBranch(),
      writer: freshBranch(),
    },
    writingSubmissions: [],
    curriculum: { ...DEFAULT_CURRICULUM },
  };
}

// Date key `offset` days before today, built with the same exported
// localDateKey the store uses, so tests are timezone-stable.
function dayKey(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return localDateKey(d);
}

beforeEach(() => {
  storage.clear();
});

describe('MetaStore hydrate', () => {
  it('starts fresh when storage is empty', () => {
    const store = new MetaStore();
    const s = store.get();
    expect(s.version).toBe(3);
    expect(s.gold).toBe(0);
    expect(s.lifetime.runs).toBe(0);
    expect(s.branches.combat).toEqual(freshBranch());
    expect(s.curriculum).toEqual(DEFAULT_CURRICULUM);
    expect(s.writingSubmissions).toEqual([]);
  });

  it('starts fresh on corrupt JSON', () => {
    storage.setItem(STORAGE_KEY, '{definitely not json');
    const store = new MetaStore();
    expect(store.get()).toEqual(v3State());
  });

  it('starts fresh on non-object payloads', () => {
    storage.setItem(STORAGE_KEY, '"just a string"');
    expect(new MetaStore().get()).toEqual(v3State());
    storage.setItem(STORAGE_KEY, 'null');
    expect(new MetaStore().get()).toEqual(v3State());
  });

  it('starts fresh on an unknown future version', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, gold: 9999 }));
    const store = new MetaStore();
    expect(store.getGold()).toBe(0);
    expect(store.get().version).toBe(3);
  });

  it('migrates a v1 save onto the tree-node schema', () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        gold: 123,
        lifetime: {
          runs: 4,
          bossesKilled: 2,
          quizCorrect: 50,
          perfectStories: 1,
          writingTasksDone: 0,
          distinctWordIds: ['cat', 'dog'],
        },
        branches: {
          combat: { unlocked: true, ranks: { hp: 2, dmg: 1, spd: 3 } },
          spells: { unlocked: true, chosenStartSpell: 'ice' },
          scholar: { unlocked: false, ranks: { xpPerQuiz: 2, cdCutPerQuiz: 1 } },
          writer: { unlocked: true, ranks: { xpBonus: 2 } },
        },
      }),
    );
    const s = new MetaStore().get();
    expect(s.version).toBe(3);
    expect(s.gold).toBe(123);
    // combat ranks → fire.* nodes
    expect(s.branches.combat.treeRanks).toEqual({ 'fire.hp1': 2, 'fire.dmg1': 1 });
    expect(s.branches.combat.unlockedAt).not.toBeNull();
    // spd re-homed to wind.atkSpd; scholar ranks → wind.*
    expect(s.branches.scholar.treeRanks).toEqual({ 'wind.atkSpd': 3, 'wind.xp': 2, 'wind.cdCut': 1 });
    expect(s.branches.scholar.unlockedAt).toBeNull();
    // chosenStartSpell ice → water.ice.unlock rank 1
    expect(s.branches.spells.treeRanks).toEqual({ 'water.ice.unlock': 1 });
    // writer xpBonus → earth.xpMult
    expect(s.branches.writer.treeRanks).toEqual({ 'earth.xpMult': 2 });
    // lifetime carried over
    expect(s.lifetime.runs).toBe(4);
    expect(s.lifetime.distinctWordIds).toEqual(['cat', 'dog']);
    // v3 field injected
    expect(s.curriculum).toEqual(DEFAULT_CURRICULUM);
  });

  it('migrates v1 chosenStartSpell heal → water.heal.unlock', () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, branches: { spells: { unlocked: true, chosenStartSpell: 'heal' } } }),
    );
    const s = new MetaStore().get();
    expect(s.branches.spells.treeRanks).toEqual({ 'water.heal.unlock': 1 });
  });

  it('treats a missing version field as v1', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ gold: 7, branches: {} }));
    expect(new MetaStore().getGold()).toBe(7);
  });

  it('injects DEFAULT_CURRICULUM into a v2 save and keeps everything else', () => {
    const v2 = v3State() as unknown as Record<string, unknown>;
    v2.version = 2;
    delete v2.curriculum;
    (v2.branches as Record<string, unknown>).combat = { unlockedAt: 111, treeRanks: { 'fire.hp1': 2 } };
    v2.gold = 50;
    storage.setItem(STORAGE_KEY, JSON.stringify(v2));
    const s = new MetaStore().get();
    expect(s.version).toBe(3);
    expect(s.gold).toBe(50);
    expect(s.branches.combat).toEqual({ unlockedAt: 111, treeRanks: { 'fire.hp1': 2 } });
    expect(s.curriculum).toEqual(DEFAULT_CURRICULUM);
  });

  it('round-trips a v3 save through save() and re-read', () => {
    const a = new MetaStore();
    a.addGold(75);
    a.setRank('combat', 'fire.dmg1', 2);
    a.unlockBranch('writer');
    a.incrementQuizCorrect('apple');

    const b = new MetaStore();
    expect(b.getGold()).toBe(75);
    expect(b.getRank('combat', 'fire.dmg1')).toBe(2);
    expect(b.isBranchUnlocked('writer')).toBe(true);
    expect(b.isBranchUnlocked('combat')).toBe(false);
    expect(b.distinctWordCount()).toBe(1);
    expect(b.get().lifetime.quizCorrect).toBe(1);
  });

  it('falls back to the legacy wk.meta.v1 key when wk.meta is absent', () => {
    const legacy = v3State();
    legacy.gold = 42;
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    const store = new MetaStore();
    expect(store.getGold()).toBe(42);
    // current key wins when both exist
    const current = v3State();
    current.gold = 1000;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
    expect(new MetaStore().getGold()).toBe(1000);
  });
});

describe('MetaStore exportSave / importSave', () => {
  it('round-trips state including Polish characters', () => {
    const a = new MetaStore();
    a.addGold(10);
    const submission: WritingSubmission = {
      id: 's1',
      branch: 'writer',
      prompt: 'Opisz swój dzień',
      text: 'Zażółć gęślą jaźń — to był świetny dzień!',
      wordCount: 8,
      distinctCount: 8,
      submittedAt: 1700000000000,
    };
    a.addWritingSubmission(submission);
    const code = a.exportSave();
    expect(code).not.toBe('');

    storage.clear();
    const b = new MetaStore();
    expect(b.importSave(code)).toBe(true);
    expect(b.getGold()).toBe(10);
    expect(b.getWritingSubmissions()).toEqual([submission]);
    // importSave persists: a third store reads the imported state
    expect(new MetaStore().getGold()).toBe(10);
  });

  it('rejects garbage and leaves state unchanged', () => {
    const store = new MetaStore();
    store.addGold(33);
    expect(store.importSave('not base64 at all !!!')).toBe(false);
    expect(store.importSave(btoa('this is not json'))).toBe(false);
    // valid JSON but not an object / an array — explicitly rejected
    expect(store.importSave(btoa('"hello"'))).toBe(false);
    expect(store.importSave(btoa('[1,2,3]'))).toBe(false);
    expect(store.getGold()).toBe(33);
  });
});

describe('MetaStore gold guards', () => {
  it('addGold ignores non-finite and non-positive amounts', () => {
    const store = new MetaStore();
    store.addGold(NaN);
    store.addGold(Infinity);
    store.addGold(-Infinity);
    store.addGold(-5);
    store.addGold(0);
    expect(store.getGold()).toBe(0);
    store.addGold(25);
    expect(store.getGold()).toBe(25);
  });

  it('spendGold refuses non-finite amounts and overdrafts', () => {
    const store = new MetaStore();
    store.addGold(100);
    expect(store.spendGold(NaN)).toBe(false);
    expect(store.spendGold(Infinity)).toBe(false);
    expect(store.spendGold(101)).toBe(false);
    expect(store.getGold()).toBe(100);
    // zero / negative are accepted no-ops
    expect(store.spendGold(0)).toBe(true);
    expect(store.spendGold(-10)).toBe(true);
    expect(store.getGold()).toBe(100);
    expect(store.spendGold(60)).toBe(true);
    expect(store.getGold()).toBe(40);
  });
});

describe('MetaStore.getDayStreak', () => {
  function storeWithActivity(offsets: number[]): InstanceType<typeof MetaStore> {
    const s = v3State();
    for (const off of offsets) {
      s.lifetime.dailyActivity![dayKey(off)] = { msPlayed: 1000, quizCorrect: 1, newWords: 0 };
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
    return new MetaStore();
  }

  it('returns 0 with no activity', () => {
    expect(storeWithActivity([]).getDayStreak()).toBe(0);
  });

  it('counts today only as 1', () => {
    expect(storeWithActivity([0]).getDayStreak()).toBe(1);
  });

  it('counts today + yesterday as 2', () => {
    expect(storeWithActivity([0, 1]).getDayStreak()).toBe(2);
  });

  it('stops at a gap', () => {
    // today, yesterday, (gap at -2), -3 → streak is 2
    expect(storeWithActivity([0, 1, 3]).getDayStreak()).toBe(2);
  });

  it('grants a 1-day grace: yesterday-but-not-today still counts', () => {
    expect(storeWithActivity([1]).getDayStreak()).toBe(1);
    expect(storeWithActivity([1, 2, 3]).getDayStreak()).toBe(3);
  });

  it('ignores days with playtime but no correct quiz answers', () => {
    const s = v3State();
    s.lifetime.dailyActivity![dayKey(0)] = { msPlayed: 60000, quizCorrect: 0, newWords: 0 };
    s.lifetime.dailyActivity![dayKey(2)] = { msPlayed: 60000, quizCorrect: 5, newWords: 1 };
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
    // today has no quizCorrect, yesterday has nothing → 0
    expect(new MetaStore().getDayStreak()).toBe(0);
  });
});
