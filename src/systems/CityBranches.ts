// City meta-progression branch definitions.
//
// Each branch is a building in the City scene. It has a LEARNING TASK
// (a teacher-style writing prompt) that unlocks it, and a list of
// upgrades the player can buy with gold once unlocked. The task is
// the only unlock path — combat / quiz / boss counters no longer
// gate the branches (they still accumulate for the pause panel).

import { metaStore, type WritingSubmission } from './MetaStore';
import type { SpellId } from './SpellCaster';

export type BranchId = 'combat' | 'spells' | 'scholar' | 'writer';

export interface BranchTask {
  prompt: string;      // Polish prompt shown to the student
  promptEn: string;    // English version (displayed smaller under the Polish)
  hint: string;        // short teacher-style guidance
  hintWords: string[]; // ~12 suggested topic words, clickable into the textarea
  // A short "reference" description used for topic-match scoring via
  // the embeddings-based TextJudge. Plain English, A1-A2 vocabulary.
  referenceEn: string;
}

export interface UpgradeDef {
  id: string;
  label: string;
  describe(nextRank: number): string;
  maxRank: number;
  costAtRank(rank: number): number;
  currentRank(): number;
  buy(): boolean;
}

export interface BranchDef {
  id: BranchId;
  label: string;
  icon: string;
  task: BranchTask;
  upgrades: UpgradeDef[];
  isUnlocked(): boolean;
}

const cost = (table: number[]) => (r: number) =>
  r < table.length ? table[r]! : Infinity;

// A branch is considered unlocked iff the player has at least one
// saved writing submission for it. We use submissions (not the
// `branches[id].unlocked` boolean) as the source of truth, so old
// saves where auto-unlock from combat/quiz counters set the flag
// don't skip the writing requirement in the new build.
function hasSubmissionFor(id: BranchId): boolean {
  return metaStore.getWritingSubmissions().some((s) => s.branch === id);
}

// Small util — score a submission for the soft word-count gate.
export function countWords(text: string): { total: number; distinct: number } {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-ząćęłńóśźż\s'-]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return { total: tokens.length, distinct: new Set(tokens).size };
}

// ─────────────────────────────────────────────────────────────────
// Combat Hall — Sala Bojowa
// ─────────────────────────────────────────────────────────────────
const combat: BranchDef = {
  id: 'combat',
  label: 'Sala Bojowa',
  icon: '🛡',
  task: {
    prompt: 'Opisz swoją codzienną rutynę',
    promptEn: 'Describe your daily routine',
    hint: 'Napisz po angielsku, co robisz każdego dnia — od rana do wieczora.',
    hintWords: [
      'wake up', 'eat', 'breakfast', 'school', 'study', 'play', 'read',
      'run', 'dinner', 'wash', 'sleep', 'morning', 'evening', 'night',
    ],
    referenceEn:
      'Every morning I wake up early. I eat breakfast with my family. I go to school and study many subjects. After school I play with friends, read books and do my homework. In the evening I eat dinner, wash my face and go to sleep.',
  },
  isUnlocked() {
    return hasSubmissionFor('combat');
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
      describe: (r) => `−${((1 - Math.pow(0.95, r)) * 100) | 0}% czasu odnowy na start (−5% / rangę)`,
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
  task: {
    prompt: 'Opisz swoje ulubione miejsce',
    promptEn: 'Write about your favourite place',
    hint: 'Pomyśl o miejscu, które lubisz — park, pokój, plaża, miasto. Jak wygląda? Co tam robisz?',
    hintWords: [
      'favourite', 'place', 'park', 'house', 'room', 'beach', 'mountain',
      'tree', 'flower', 'sunny', 'warm', 'quiet', 'happy', 'play', 'visit',
    ],
    referenceEn:
      'My favourite place is a quiet park near my house. There are many tall trees and colourful flowers. I like to visit it on sunny days. I sit on the grass, read a book and watch the birds. It makes me feel calm and happy.',
  },
  isUnlocked() {
    return hasSubmissionFor('spells');
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
  task: {
    prompt: 'Opisz swojego najlepszego przyjaciela',
    promptEn: 'Describe your best friend',
    hint: 'Jak ma na imię? Jak wygląda? Jaki ma charakter? Co razem lubicie robić?',
    hintWords: [
      'friend', 'name', 'tall', 'short', 'nice', 'kind', 'funny', 'brave',
      'smart', 'hair', 'eyes', 'play', 'help', 'school',
    ],
    referenceEn:
      'My best friend is called Anna. She is tall and has long brown hair and blue eyes. She is very kind, funny and smart. We go to school together and play every afternoon. She always helps me when I have a problem. I am happy she is my friend.',
  },
  isUnlocked() {
    return hasSubmissionFor('scholar');
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
// ─────────────────────────────────────────────────────────────────
const writer: BranchDef = {
  id: 'writer',
  label: 'Gildia Pisarzy',
  icon: '✍',
  task: {
    prompt: 'Napisz o swoich ostatnich wakacjach',
    promptEn: 'Write about your last holiday',
    hint: 'Gdzie byłeś/byłaś? Z kim? Co robiliście? Jaka była pogoda? Co ci się podobało?',
    hintWords: [
      'last', 'summer', 'holiday', 'family', 'sea', 'mountain', 'swim',
      'play', 'visit', 'eat', 'beach', 'sun', 'happy', 'beautiful',
    ],
    referenceEn:
      'Last summer I went on holiday with my family. We travelled to the sea. The weather was hot and sunny. Every day we swam in the blue water and built big sand castles on the beach. In the evening we ate dinner and played games. It was a beautiful and happy holiday.',
  },
  isUnlocked() {
    return hasSubmissionFor('writer');
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

// Submit a writing task: save to metaStore + unlock branch.
export function submitWritingTask(
  branchId: BranchId,
  text: string,
): WritingSubmission {
  const { total, distinct } = countWords(text);
  const submission: WritingSubmission = {
    id: `${branchId}.${Date.now()}`,
    branch: branchId,
    prompt: BRANCH_DEFS[branchId].task.prompt,
    text,
    wordCount: total,
    distinctCount: distinct,
    submittedAt: Date.now(),
  };
  metaStore.addWritingSubmission(submission);
  metaStore.unlockBranch(branchId);
  return submission;
}
