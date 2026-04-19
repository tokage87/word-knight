// City meta-progression branch definitions.
//
// Each branch is a building in the City scene. It has an unlock
// *challenge* (measured against MetaStore lifetime counters) and a
// list of *upgrades* the player can buy with gold once unlocked.
//
// `applyMetaProgression()` in GameScene reads the ranks directly off
// MetaStore and bakes them into run-start stats — the definitions
// here are for the UI: descriptions, prices, buy actions, unlock
// detection.

import { metaStore } from './MetaStore';
import type { SpellId } from './SpellCaster';

export type BranchId = 'combat' | 'spells' | 'scholar' | 'writer';

export interface ChallengeStatus {
  unlocked: boolean;
  label: string;      // e.g. "Pokonaj 1 bossa"
  current: number;    // lifetime progress toward target
  target: number;
}

export interface UpgradeDef {
  id: string;
  label: string;                     // "Wytrzymałość"
  describe(nextRank: number): string; // "+20 maks. HP na start"
  maxRank: number;
  costAtRank(rank: number): number;  // rank = how many already owned
  currentRank(): number;
  buy(): boolean;                    // deducts gold + mutates state
}

export interface BranchDef {
  id: BranchId;
  label: string;
  icon: string;
  status(): ChallengeStatus;
  upgrades: UpgradeDef[];
}

// Small helper — clamp a cost lookup so "beyond max rank" doesn't
// crash the UI.
const cost = (table: number[]) => (r: number) =>
  r < table.length ? table[r]! : Infinity;

// ─────────────────────────────────────────────────────────────────
// Combat Hall — Sala Bojowa
// ─────────────────────────────────────────────────────────────────
const combat: BranchDef = {
  id: 'combat',
  label: 'Sala Bojowa',
  icon: '🛡',
  status() {
    const killed = metaStore.get().lifetime.bossesKilled;
    const unlocked = metaStore.get().branches.combat.unlocked || killed >= 1;
    if (unlocked && !metaStore.get().branches.combat.unlocked) {
      metaStore.unlockBranch('combat');
    }
    return {
      unlocked,
      label: 'Pokonaj 1 bossa w dowolnym biegu',
      current: Math.min(killed, 1),
      target: 1,
    };
  },
  upgrades: [
    {
      id: 'hp',
      label: 'Wytrzymałość',
      describe: (r) => `+${20 * r} maks. HP na start biegu`,
      maxRank: 5,
      costAtRank: cost([20, 40, 80, 160, 320]),
      currentRank: () => metaStore.get().branches.combat.ranks.hp,
      buy() {
        const r = this.currentRank();
        if (r >= this.maxRank) return false;
        if (!metaStore.spendGold(this.costAtRank(r))) return false;
        metaStore.buyCombatRank('hp');
        return true;
      },
    },
    {
      id: 'dmg',
      label: 'Ostry Miecz',
      describe: (r) => `+${2 * r} obrażeń ataku na start`,
      maxRank: 5,
      costAtRank: cost([25, 50, 100, 200, 400]),
      currentRank: () => metaStore.get().branches.combat.ranks.dmg,
      buy() {
        const r = this.currentRank();
        if (r >= this.maxRank) return false;
        if (!metaStore.spendGold(this.costAtRank(r))) return false;
        metaStore.buyCombatRank('dmg');
        return true;
      },
    },
    {
      id: 'spd',
      label: 'Szybki Cios',
      describe: (r) => `−${(1 - Math.pow(0.95, r)) * 100 | 0}% czasu odnowy na start (−5% / rangę)`,
      maxRank: 4,
      costAtRank: cost([30, 60, 120, 240]),
      currentRank: () => metaStore.get().branches.combat.ranks.spd,
      buy() {
        const r = this.currentRank();
        if (r >= this.maxRank) return false;
        if (!metaStore.spendGold(this.costAtRank(r))) return false;
        metaStore.buyCombatRank('spd');
        return true;
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Spell Library — Biblioteka Magii
// Single-purchase: pick which spell you start with (1 of 3). Once
// bought the "upgrade" becomes re-selectable so the player can swap
// between runs if they wish.
// ─────────────────────────────────────────────────────────────────
const SPELL_OPTIONS: Array<{ id: SpellId; label: string; desc: string; icon: string }> = [
  { id: 'fire',  label: 'Ogień',  desc: 'Startuj z odblokowanym Ogniem.', icon: '🔥' },
  { id: 'ice',   label: 'Lód',    desc: 'Startuj z odblokowanym Lodem.',  icon: '❄' },
  { id: 'heal',  label: 'Leczenie', desc: 'Startuj z odblokowanym Leczeniem.', icon: '💖' },
];

const spells: BranchDef = {
  id: 'spells',
  label: 'Biblioteka Magii',
  icon: '🔮',
  status() {
    const perfect = metaStore.get().lifetime.perfectStories;
    const unlocked = metaStore.get().branches.spells.unlocked || perfect >= 1;
    if (unlocked && !metaStore.get().branches.spells.unlocked) {
      metaStore.unlockBranch('spells');
    }
    return {
      unlocked,
      label: 'Ukończ dowolną opowieść bez błędu',
      current: Math.min(perfect, 1),
      target: 1,
    };
  },
  upgrades: SPELL_OPTIONS.map((opt) => ({
    id: `start.${opt.id}`,
    label: `${opt.icon} ${opt.label}`,
    describe: () => opt.desc,
    maxRank: 1,
    costAtRank: () => (metaStore.get().branches.spells.chosenStartSpell === opt.id ? 0 : 100),
    currentRank: () =>
      metaStore.get().branches.spells.chosenStartSpell === opt.id ? 1 : 0,
    buy() {
      // Free swap if already owned elsewhere (player picked a different
      // start spell previously) — we don't want to re-charge for a
      // change of mind. First purchase costs 100.
      const already = metaStore.get().branches.spells.chosenStartSpell !== null;
      if (!already) {
        if (!metaStore.spendGold(100)) return false;
      }
      metaStore.setStartSpell(opt.id);
      return true;
    },
  })),
};

// ─────────────────────────────────────────────────────────────────
// Scholar's Circle — Krąg Uczonych
// ─────────────────────────────────────────────────────────────────
const scholar: BranchDef = {
  id: 'scholar',
  label: 'Krąg Uczonych',
  icon: '📚',
  status() {
    const qc = metaStore.get().lifetime.quizCorrect;
    const unlocked = metaStore.get().branches.scholar.unlocked || qc >= 50;
    if (unlocked && !metaStore.get().branches.scholar.unlocked) {
      metaStore.unlockBranch('scholar');
    }
    return {
      unlocked,
      label: 'Odpowiedz poprawnie na 50 quizów (łącznie)',
      current: Math.min(qc, 50),
      target: 50,
    };
  },
  upgrades: [
    {
      id: 'xpPerQuiz',
      label: 'Pilna Nauka',
      describe: (r) => `+${2 * r} XP za każdy poprawny quiz`,
      maxRank: 3,
      costAtRank: cost([40, 80, 160]),
      currentRank: () => metaStore.get().branches.scholar.ranks.xpPerQuiz,
      buy() {
        const r = this.currentRank();
        if (r >= this.maxRank) return false;
        if (!metaStore.spendGold(this.costAtRank(r))) return false;
        metaStore.buyScholarRank('xpPerQuiz');
        return true;
      },
    },
    {
      id: 'cdCutPerQuiz',
      label: 'Szybkie Skupienie',
      describe: (r) => `+${r}s dodatkowego skrócenia odnowy zaklęć za każdy poprawny quiz`,
      maxRank: 3,
      costAtRank: cost([50, 100, 200]),
      currentRank: () => metaStore.get().branches.scholar.ranks.cdCutPerQuiz,
      buy() {
        const r = this.currentRank();
        if (r >= this.maxRank) return false;
        if (!metaStore.spendGold(this.costAtRank(r))) return false;
        metaStore.buyScholarRank('cdCutPerQuiz');
        return true;
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Writer's Guild — Gildia Pisarzy
// Phase 3 ships without the writing-task feature yet — we keep the
// challenge + upgrades defined so the UI has something to show, with
// a placeholder challenge tied to lifetime runs until the writing
// mode lands.
// ─────────────────────────────────────────────────────────────────
const writer: BranchDef = {
  id: 'writer',
  label: 'Gildia Pisarzy',
  icon: '✍',
  status() {
    // Placeholder challenge: survive 3 runs total. When writing mode
    // arrives we'll swap this to `writingTasksDone >= 1`.
    const runs = metaStore.get().lifetime.runs;
    const unlocked = metaStore.get().branches.writer.unlocked || runs >= 3;
    if (unlocked && !metaStore.get().branches.writer.unlocked) {
      metaStore.unlockBranch('writer');
    }
    return {
      unlocked,
      label: 'Ukończ 3 biegi (tymczasowo, do czasu dodania zadań pisemnych)',
      current: Math.min(runs, 3),
      target: 3,
    };
  },
  upgrades: [
    {
      id: 'xpBonus',
      label: 'Mądre Pióro',
      describe: (r) => `+${10 * r}% XP ze wszystkich źródeł`,
      maxRank: 3,
      costAtRank: cost([75, 150, 300]),
      currentRank: () => metaStore.get().branches.writer.ranks.xpBonus,
      buy() {
        const r = this.currentRank();
        if (r >= this.maxRank) return false;
        if (!metaStore.spendGold(this.costAtRank(r))) return false;
        metaStore.buyWriterRank();
        return true;
      },
    },
  ],
};

export const BRANCH_DEFS: Record<BranchId, BranchDef> = {
  combat, spells, scholar, writer,
};
