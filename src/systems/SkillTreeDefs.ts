import type { BranchId } from './CityBranches';
import type { SkillTree, TreeNode } from './SkillTree';

// All four skill trees — pure data. Add new nodes here. Node IDs are
// stable forever (old saves store rank keyed by node id). Positions
// use axial hex coords: q = column, r = row (half-offset by row).
// Renderer converts: x = q*78 + r*39, y = r*66.

// Tiny Swords icon inventory (from public/assets/ui/):
// Icon_01 hammer · 02 log/scroll · 03 coin · 04 meat (HP)
// Icon_05 crossed swords (damage) · 06 shield (armor) · 07 green wedge
// Icon_08 orange wedge (speed) · 09 red X · 10 gear · 11 mute · 12 music note

// ─── Fire / Sala Bojowa ───────────────────────────────────────────
const fireNodes: TreeNode[] = [
  {
    id: 'fire.hp1',
    label: 'Stalowe Serce',
    desc: (r) => `+${20 * r} maks. HP`,
    icon: 'assets/ui/Icon_04.png',
    maxRank: 3,
    costCurve: 'bigPassive',
    effect: { kind: 'stat', stat: 'hpMax', perRank: 20 },
    requires: [],
    position: { q: -1, r: 0 },
  },
  {
    id: 'fire.dmg1',
    label: 'Ostry Miecz',
    desc: (r) => `+${3 * r} obrażeń w walce wręcz`,
    icon: 'assets/ui/Icon_05.png',
    maxRank: 3,
    costCurve: 'bigPassive',
    effect: { kind: 'stat', stat: 'meleeDmg', perRank: 3 },
    requires: [],
    position: { q: 1, r: 0 },
  },
  {
    id: 'fire.crit',
    label: 'Cios Krytyczny',
    desc: (r) => `+${5 * r}% szansy na krytyk (×2 obrażenia)`,
    icon: 'assets/ui/Icon_08.png',
    maxRank: 3,
    costCurve: 'smallPassive',
    effect: { kind: 'stat', stat: 'critChance', perRank: 0.05 },
    requires: ['fire.dmg1'],
    position: { q: 2, r: 1 },
  },
  {
    id: 'fire.lifesteal',
    label: 'Pradawny Głód',
    desc: (r) => `+${3 * r}% leczenia z zadanych obrażeń`,
    icon: 'assets/ui/Icon_04.png',
    maxRank: 2,
    costCurve: 'mediumPassive',
    effect: { kind: 'stat', stat: 'lifesteal', perRank: 0.03 },
    requires: ['fire.hp1'],
    position: { q: -2, r: 1 },
  },
  {
    // Node ID is stable — old saves with this rank unlocked continue
    // to route to the allyUnlock handler. The *effect* changed from
    // a spell-unlock into an ally-unlock (Tier-2 rework, 2026-04-22).
    id: 'fire.arrow.unlock',
    label: 'Ognisty Łucznik',
    desc: () => 'Łucznik dołącza do drużyny i strzela ognistymi strzałami',
    icon: 'assets/ui/Icon_02.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'fire-archer' },
    requires: ['fire.dmg1'],
    position: { q: 1, r: 2 },
  },
  {
    // ally rework: fire-monk companion (heavy single-target caster)
    id: 'fire.fireball.unlock',
    label: 'Ognisty Mnich',
    desc: () => 'Mnich ciska kulą ognia w pojedynczego wroga',
    icon: 'assets/ui/Icon_01.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'fire-monk' },
    requires: ['fire.arrow.unlock'],
    position: { q: 0, r: 3 },
  },
];

// ─── Water / Biblioteka Magii ─────────────────────────────────────
const waterNodes: TreeNode[] = [
  {
    id: 'water.spellDmg',
    label: 'Moc Magii',
    desc: (r) => `+${10 * r}% obrażeń od zaklęć`,
    icon: 'assets/ui/Icon_10.png',
    maxRank: 3,
    costCurve: 'mediumPassive',
    effect: { kind: 'runStat', stat: 'spellDmg', perRank: 0.10 },
    requires: [],
    position: { q: -1, r: 0 },
  },
  {
    id: 'water.cdr',
    label: 'Szybkie Rzucanie',
    desc: (r) => `−${5 * r}% odnowy zaklęć`,
    icon: 'assets/ui/Icon_12.png',
    maxRank: 3,
    costCurve: 'mediumPassive',
    effect: { kind: 'runStat', stat: 'globalCooldown', perRank: 0.05 },
    requires: [],
    position: { q: 1, r: 0 },
  },
  {
    // ally rework: ice-archer companion
    id: 'water.ice.unlock',
    label: 'Lodowy Łucznik',
    desc: () => 'Łucznik dołącza do drużyny i spowalnia wrogów lodem',
    icon: 'assets/ui/Icon_08.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'ice-archer' },
    requires: ['water.spellDmg'],
    position: { q: -2, r: 1 },
  },
  {
    // ally rework: cleric companion (heals knight over time)
    id: 'water.heal.unlock',
    label: 'Uzdrowiciel',
    desc: () => 'Mnich-uzdrowiciel leczy rycerza podczas walki',
    icon: 'assets/ui/Icon_04.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'cleric' },
    requires: ['water.cdr'],
    position: { q: 2, r: 1 },
  },
  {
    // ally rework: ice-monk companion
    id: 'water.blizzard.unlock',
    label: 'Lodowy Mnich',
    desc: () => 'Mnich rzuca lodowy pocisk z silnym spowolnieniem',
    icon: 'assets/ui/Icon_08.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'ice-monk' },
    requires: ['water.ice.unlock', 'water.heal.unlock'],
    position: { q: 0, r: 2 },
  },
];

// ─── Wind / Krąg Uczonych ─────────────────────────────────────────
const windNodes: TreeNode[] = [
  {
    id: 'wind.atkSpd',
    label: 'Zwinny Cios',
    desc: (r) => `−${3 * r}% czasu odnowy ataku`,
    icon: 'assets/ui/Icon_08.png',
    maxRank: 3,
    costCurve: 'mediumPassive',
    effect: { kind: 'stat', stat: 'atkSpd', perRank: 0.03 },
    requires: [],
    position: { q: -1, r: 0 },
  },
  {
    id: 'wind.xp',
    label: 'Pilna Nauka',
    desc: (r) => `+${2 * r} XP za poprawną odpowiedź`,
    icon: 'assets/ui/Icon_02.png',
    maxRank: 3,
    costCurve: 'smallPassive',
    effect: { kind: 'runStat', stat: 'xpPerQuiz', perRank: 2 },
    requires: [],
    position: { q: 1, r: 0 },
  },
  {
    id: 'wind.cdCut',
    label: 'Szybkie Skupienie',
    desc: (r) => `+${r}s skrócenia odnowy po poprawnej odpowiedzi`,
    icon: 'assets/ui/Icon_12.png',
    maxRank: 3,
    costCurve: 'mediumPassive',
    effect: { kind: 'runStat', stat: 'cdCutPerQuiz', perRank: 1000 },
    requires: ['wind.xp'],
    position: { q: 2, r: 1 },
  },
  {
    id: 'wind.dodge',
    label: 'Cień w Mgnieniu',
    desc: (r) => `+${5 * r}% szansy na unik`,
    icon: 'assets/ui/Icon_09.png',
    maxRank: 2,
    costCurve: 'smallPassive',
    effect: { kind: 'stat', stat: 'dodgeChance', perRank: 0.05 },
    requires: ['wind.atkSpd'],
    position: { q: -2, r: 1 },
  },
  {
    // ally rework: wind-lancer companion (piercing melee)
    id: 'wind.slash.unlock',
    label: 'Wietrzny Lansjer',
    desc: () => 'Lansjer dołącza do drużyny — pcha pchnięciem przez wrogów',
    icon: 'assets/ui/Icon_05.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'wind-lancer' },
    requires: ['wind.atkSpd', 'wind.dodge'],
    position: { q: -1, r: 2 },
  },
  {
    // ally rework: wind-monk companion (fast-firing light caster)
    id: 'wind.tornado.unlock',
    label: 'Wietrzny Mnich',
    desc: () => 'Mnich wiatru atakuje szybko słabszymi pociskami',
    icon: 'assets/ui/Icon_10.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'wind-monk' },
    requires: ['wind.slash.unlock'],
    position: { q: 0, r: 3 },
  },
];

// ─── Earth / Gildia Pisarzy ───────────────────────────────────────
const earthNodes: TreeNode[] = [
  {
    id: 'earth.hp2',
    label: 'Kamienna Skóra',
    desc: (r) => `+${25 * r} maks. HP`,
    icon: 'assets/ui/Icon_04.png',
    maxRank: 3,
    costCurve: 'bigPassive',
    effect: { kind: 'stat', stat: 'hpMax', perRank: 25 },
    requires: [],
    position: { q: -1, r: 0 },
  },
  {
    id: 'earth.xpMult',
    label: 'Mądre Pióro',
    desc: (r) => `+${10 * r}% XP ze wszystkich źródeł`,
    icon: 'assets/ui/Icon_02.png',
    maxRank: 3,
    costCurve: 'bigPassive',
    effect: { kind: 'runStat', stat: 'xpMult', perRank: 0.10 },
    requires: [],
    position: { q: 1, r: 0 },
  },
  {
    id: 'earth.armor',
    label: 'Hartowana Zbroja',
    desc: (r) => `+${5 * r}% redukcji obrażeń`,
    icon: 'assets/ui/Icon_06.png',
    maxRank: 2,
    costCurve: 'mediumPassive',
    effect: { kind: 'stat', stat: 'armor', perRank: 0.05 },
    requires: ['earth.hp2'],
    position: { q: -2, r: 1 },
  },
  {
    id: 'earth.regen',
    label: 'Powolne Ożywienie',
    desc: (r) => `+${r} HP na sekundę`,
    icon: 'assets/ui/Icon_04.png',
    maxRank: 2,
    costCurve: 'mediumPassive',
    effect: { kind: 'stat', stat: 'hpRegen', perRank: 1 },
    requires: ['earth.armor'],
    position: { q: -3, r: 2 },
  },
  {
    // ally rework: earth-pawn companion (axe-wielding frontliner)
    id: 'earth.shield.unlock',
    label: 'Ziemny Pionek',
    desc: () => 'Pionek z toporem rąbie wrogów blisko rycerza',
    icon: 'assets/ui/Icon_06.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'earth-pawn' },
    requires: ['earth.armor'],
    position: { q: -1, r: 2 },
  },
  {
    // ally rework: earth-lancer companion (heavy caster)
    id: 'earth.quake.unlock',
    label: 'Ziemny Lansjer',
    desc: () => 'Lansjer ciska kamiennym grzmotem (wysoki obrażenia + spowolnienie)',
    icon: 'assets/ui/Icon_01.png',
    maxRank: 1,
    costCurve: 'spellUnlock',
    effect: { kind: 'allyUnlock', allyKind: 'earth-lancer' },
    requires: ['earth.shield.unlock', 'earth.xpMult'],
    position: { q: 1, r: 2 },
  },
  {
    id: 'earth.gold',
    label: 'Skarby Zatoki',
    desc: (r) => `+${10 * r}% złota z wrogów`,
    icon: 'assets/ui/Icon_03.png',
    maxRank: 3,
    costCurve: 'smallPassive',
    effect: { kind: 'runStat', stat: 'goldMult', perRank: 0.10 },
    requires: ['earth.xpMult'],
    position: { q: 2, r: 1 },
  },
];

// Build edges from `requires` so they always match the prereq graph.
function edgesFromNodes(nodes: TreeNode[]): [string, string][] {
  const edges: [string, string][] = [];
  nodes.forEach((n) => n.requires.forEach((req) => edges.push([req, n.id])));
  return edges;
}

export const SKILL_TREES: Record<BranchId, SkillTree> = {
  combat: {
    element: 'fire',
    nodes: fireNodes,
    edges: edgesFromNodes(fireNodes),
    rootIds: fireNodes.filter((n) => n.requires.length === 0).map((n) => n.id),
  },
  spells: {
    element: 'water',
    nodes: waterNodes,
    edges: edgesFromNodes(waterNodes),
    rootIds: waterNodes.filter((n) => n.requires.length === 0).map((n) => n.id),
  },
  scholar: {
    element: 'wind',
    nodes: windNodes,
    edges: edgesFromNodes(windNodes),
    rootIds: windNodes.filter((n) => n.requires.length === 0).map((n) => n.id),
  },
  writer: {
    element: 'earth',
    nodes: earthNodes,
    edges: edgesFromNodes(earthNodes),
    rootIds: earthNodes.filter((n) => n.requires.length === 0).map((n) => n.id),
  },
};

// Lookup by nodeId across every tree — used by MetaStore migration
// and by GameScene when applying effects without knowing the branch.
export function findNode(nodeId: string): { branch: BranchId; node: TreeNode } | null {
  for (const branch of Object.keys(SKILL_TREES) as BranchId[]) {
    const n = SKILL_TREES[branch].nodes.find((x) => x.id === nodeId);
    if (n) return { branch, node: n };
  }
  return null;
}

// List of every node ID known today — used by CI-like assertions to
// catch accidental renames (would orphan saves).
export function allNodeIds(): string[] {
  const ids: string[] = [];
  (Object.keys(SKILL_TREES) as BranchId[]).forEach((b) => {
    SKILL_TREES[b].nodes.forEach((n) => ids.push(n.id));
  });
  return ids;
}
