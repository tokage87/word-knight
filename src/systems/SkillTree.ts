import type { KnightStat } from '../entities/Knight';
import type { SpellId } from './SpellCaster';
import type { CurveName } from './SkillTreeBalance';
import type { BranchId } from './CityBranches';

// Elemental theming for the four branches.
export type ElementId = 'fire' | 'water' | 'wind' | 'earth';

// Mapping between branches and elements — single source of truth.
export const BRANCH_ELEMENT: Record<BranchId, ElementId> = {
  combat:  'fire',
  spells:  'water',
  scholar: 'wind',
  writer:  'earth',
};

// Every tree node produces one of these effects when ranked up. Adding
// a NEW effect category (e.g. 'reflect', 'summon') = add a case here
// plus a dispatch branch in `applyNodeEffect` — no other changes.
export type NodeEffect =
  | { kind: 'stat'; stat: KnightStat; perRank: number }
  | { kind: 'runStat'; stat: 'xpMult' | 'goldMult' | 'xpPerQuiz' | 'cdCutPerQuiz' | 'globalCooldown' | 'spellDmg'; perRank: number }
  | { kind: 'spellUnlock'; spellId: SpellId }
  | { kind: 'spellRank'; spellId: SpellId; perRank: number };

export interface TreeNode {
  id: string;                // stable; NEVER rename post-ship
  label: string;             // Polish display label
  desc: (nextRank: number) => string; // Polish flavor for the next rank
  icon: string;              // /assets/ui path (relative, no leading slash)
  maxRank: number;
  costCurve: CurveName;
  effect: NodeEffect;
  requires: string[];        // node IDs at ≥1 rank (or maxed if requiresMaxed)
  requiresMaxed?: boolean;
  position: { q: number; r: number }; // hex axial coords for layout
}

export interface SkillTree {
  element: ElementId;
  nodes: TreeNode[];
  edges: [string, string][]; // from → to for the SVG underlay
  rootIds: string[];         // always purchasable (no prereqs)
}
