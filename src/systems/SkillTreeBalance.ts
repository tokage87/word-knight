// Single source of truth for skill-tree cost curves. Every tree node
// references a curve by name so we can rebalance a whole class of
// nodes at once without touching individual node defs.

export const COST_CURVES = {
  // Cheap +N% passive stats (crit, dodge, regen).
  smallPassive: [30, 60, 120],
  // Mid-weight stat ranks (attack speed, armor, lifesteal).
  mediumPassive: [50, 100, 200],
  // Chunky stat ranks (HP, damage, XP mult).
  bigPassive: [75, 150, 300],
  // One-shot spell unlock nodes.
  spellUnlock: [150],
  // Spell upgrade nodes (damage +, split shot, extra targets).
  spellUpgrade: [100, 200, 400],
} as const;

export type CurveName = keyof typeof COST_CURVES;

// Returns cost to buy the NEXT rank (rank currently owned → next).
// Returns Infinity if already past the curve.
export function costAtRank(name: CurveName, currentRank: number): number {
  const curve = COST_CURVES[name];
  return currentRank < curve.length ? (curve[currentRank] as number) : Infinity;
}
