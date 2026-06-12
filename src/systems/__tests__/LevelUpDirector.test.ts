import { describe, it, expect, vi } from 'vitest';
import { SKILL_TREES } from '../SkillTreeDefs';
import type { BranchId } from '../MetaStore';
import { createLocalStorageStub } from './localStorageStub';

// LevelUpDirector value-imports SentenceBuilder (which pulls in Phaser —
// not loadable in node) and MetaStore (which reads localStorage at
// module scope). Mock the former, stub the latter, then import.
vi.mock('../SentenceBuilder', () => ({ SentenceBuilder: class {} }));
vi.stubGlobal('localStorage', createLocalStorageStub());

const { buildCardOptions } = await import('../LevelUpDirector');

// Rank lookup stub: node IDs are globally unique, so key by node ID.
function ranks(table: Record<string, number>) {
  return (_branch: BranchId, nodeId: string) => table[nodeId] ?? 0;
}
const zeroRanks = ranks({});

// With fire.dmg1 owned, fire.arrow.unlock (an allyUnlock at rank 0)
// becomes available as a 'new' card.
const withNewAvailable = ranks({ 'fire.dmg1': 1 });

// All 8 root nodes (no prereqs) across the four trees.
const ROOT_KEYS = (Object.keys(SKILL_TREES) as BranchId[]).flatMap((b) =>
  SKILL_TREES[b].nodes.filter((n) => n.requires.length === 0).map((n) => `${b}:${n.id}`),
);

describe('buildCardOptions cadence', () => {
  it('offers a new card first on the 1st, 5th, 9th... level-up', () => {
    for (const levelUpCount of [1, 5, 9]) {
      const pool = buildCardOptions(3, {}, levelUpCount, withNewAvailable);
      expect(pool[0].kind).toBe('new');
      expect(pool[0].key).toBe('combat:fire.arrow.unlock');
    }
  });

  it('is upgrade-only on off-cadence level-ups', () => {
    for (const levelUpCount of [0, 2, 3, 4]) {
      const pool = buildCardOptions(3, {}, levelUpCount, withNewAvailable);
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.every((o) => o.kind === 'upgrade')).toBe(true);
    }
  });
});

describe('buildCardOptions allowNew override', () => {
  it('allowNew: false suppresses new cards even on-cadence', () => {
    const pool = buildCardOptions(3, { allowNew: false }, 1, withNewAvailable);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((o) => o.kind === 'upgrade')).toBe(true);
  });

  it('allowNew: true forces a new card off-cadence', () => {
    const pool = buildCardOptions(3, { allowNew: true }, 2, withNewAvailable);
    expect(pool[0].kind).toBe('new');
  });
});

describe('buildCardOptions weakened flag', () => {
  it('marks weakenable upgrade cards and rewrites their descriptions', () => {
    const pool = buildCardOptions(20, { weakened: true, allowNew: false }, 1, withNewAvailable);
    expect(pool.length).toBeGreaterThan(0);
    for (const card of pool) {
      expect(card.kind).toBe('upgrade');
      expect(card.weakened).toBe(true);
      expect(card.desc.endsWith('(−50%)')).toBe(true);
    }
  });

  it('does not weaken ally-unlock (new) cards', () => {
    const pool = buildCardOptions(20, { weakened: true, allowNew: true }, 1, withNewAvailable);
    const newCard = pool.find((o) => o.kind === 'new');
    expect(newCard).toBeDefined();
    expect(newCard!.weakened).toBe(false);
    expect(newCard!.desc.includes('−50%')).toBe(false);
  });

  it('leaves descriptions untouched when not weakened', () => {
    const pool = buildCardOptions(20, {}, 2, zeroRanks);
    for (const card of pool) {
      expect(card.weakened).toBe(false);
      expect(card.desc.includes('−50%')).toBe(false);
    }
  });
});

describe('buildCardOptions pool filtering', () => {
  it('offers exactly the prereq-free root nodes at zero ranks', () => {
    const pool = buildCardOptions(20, {}, 1, zeroRanks);
    expect(pool.map((o) => o.key).sort()).toEqual([...ROOT_KEYS].sort());
    // no allyUnlock node is prereq-free, so everything is an upgrade
    expect(pool.every((o) => o.kind === 'upgrade')).toBe(true);
  });

  it('excludes maxed-out nodes', () => {
    // fire.hp1 has maxRank 3
    const pool = buildCardOptions(20, {}, 1, ranks({ 'fire.hp1': 3 }));
    expect(pool.map((o) => o.key)).not.toContain('combat:fire.hp1');
  });

  it('excludes prereq-gated nodes until their requirements are owned', () => {
    // fire.crit requires fire.dmg1
    const locked = buildCardOptions(20, {}, 1, zeroRanks);
    expect(locked.map((o) => o.key)).not.toContain('combat:fire.crit');
    const unlocked = buildCardOptions(20, {}, 1, withNewAvailable);
    expect(unlocked.map((o) => o.key)).toContain('combat:fire.crit');
  });

  it('titles multi-rank nodes with the next rank numeral', () => {
    const pool = buildCardOptions(20, {}, 2, ranks({ 'fire.hp1': 1 }));
    const hp = pool.find((o) => o.key === 'combat:fire.hp1');
    expect(hp).toBeDefined();
    expect(hp!.title.endsWith(' II')).toBe(true);
  });
});

describe('buildCardOptions soft-lock fallback and count', () => {
  // Every stat/runStat node maxed; allyUnlock nodes at 0 with prereqs met.
  const allUpgradesMaxed = (branch: BranchId, nodeId: string): number => {
    const node = SKILL_TREES[branch].nodes.find((n) => n.id === nodeId)!;
    return node.effect.kind === 'allyUnlock' ? 0 : node.maxRank;
  };

  it('falls back to new cards when no upgrades remain, even off-cadence', () => {
    const pool = buildCardOptions(3, {}, 2, allUpgradesMaxed);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((o) => o.kind === 'new')).toBe(true);
  });

  it('returns an empty pool when nothing at all is offerable', () => {
    const everythingMaxed = (branch: BranchId, nodeId: string): number =>
      SKILL_TREES[branch].nodes.find((n) => n.id === nodeId)!.maxRank;
    expect(buildCardOptions(3, {}, 1, everythingMaxed)).toEqual([]);
  });

  it('never returns more than count cards', () => {
    expect(buildCardOptions(3, {}, 2, zeroRanks)).toHaveLength(3);
    expect(buildCardOptions(1, { allowNew: true }, 1, withNewAvailable)).toHaveLength(1);
    // count larger than the pool → whole pool, no padding
    expect(buildCardOptions(20, {}, 2, zeroRanks)).toHaveLength(ROOT_KEYS.length);
  });

  it('returns unique cards (shuffle never duplicates)', () => {
    // pin the shuffle for a deterministic spot-check of the dedupe property
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const pool = buildCardOptions(20, { allowNew: true }, 1, withNewAvailable);
      const keys = pool.map((o) => o.key);
      expect(new Set(keys).size).toBe(keys.length);
    } finally {
      spy.mockRestore();
    }
  });
});
