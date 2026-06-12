import { describe, it, expect } from 'vitest';
import { COST_CURVES, costAtRank, type CurveName } from '../SkillTreeBalance';

describe('costAtRank', () => {
  it('returns curve[rank] for every curve and in-range rank', () => {
    for (const name of Object.keys(COST_CURVES) as CurveName[]) {
      const curve = COST_CURVES[name];
      curve.forEach((cost, rank) => {
        expect(costAtRank(name, rank)).toBe(cost);
      });
    }
  });

  it('returns Infinity past the end of the curve', () => {
    for (const name of Object.keys(COST_CURVES) as CurveName[]) {
      const curve = COST_CURVES[name];
      expect(costAtRank(name, curve.length)).toBe(Infinity);
      expect(costAtRank(name, curve.length + 5)).toBe(Infinity);
    }
  });

  it('matches the documented spellUnlock one-shot curve', () => {
    expect(costAtRank('spellUnlock', 0)).toBe(150);
    expect(costAtRank('spellUnlock', 1)).toBe(Infinity);
  });
});
