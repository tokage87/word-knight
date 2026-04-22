// City meta-progression branch definitions.
//
// Each branch is a building in the City scene. It has a
// UNLOCK GATE that describes how the player proves competence to
// enter (writing / listening / read-aloud / cloze) and exposes the
// SKILL TREE data the CityOverlay renders for purchased upgrades.
//
// Node-by-node rank storage and all per-rank effects live in the
// skill-tree data layer (src/systems/SkillTreeDefs.ts) — this file
// only wires branches to their gates and their tree.

import { metaStore, type WritingSubmission } from './MetaStore';
import {
  GATE_CTA,
  type GateDef,
  type GatePayload,
} from './UnlockGates';

export type BranchId = 'combat' | 'spells' | 'scholar' | 'writer';

export interface BranchDef {
  id: BranchId;
  label: string;
  icon: string;
  gate: GateDef;
  isUnlocked(): boolean;
}

// Unlock is per-visit: the player must re-complete each building's
// gate every time they enter the city. Submissions are still saved
// (MetaStore) for teacher review and lifetime stats, but gating uses
// this session-scoped set. CityScene clears it on create().
const sessionUnlocks = new Set<BranchId>();

export function resetSessionUnlocks() {
  sessionUnlocks.clear();
}

export function markUnlockedThisVisit(id: BranchId) {
  sessionUnlocks.add(id);
}

export function isUnlockedThisVisit(id: BranchId): boolean {
  return sessionUnlocks.has(id);
}

// Small util — score a writing submission for the soft word-count gate.
export function countWords(text: string): { total: number; distinct: number } {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-ząćęłńóśźż\s'-]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return { total: tokens.length, distinct: new Set(tokens).size };
}

// ─────────────────────────────────────────────────────────────────
// Combat Hall — Sala Bojowa  (Fire  /  read-aloud gate)
// ─────────────────────────────────────────────────────────────────
const combat: BranchDef = {
  id: 'combat',
  label: 'Sala Bojowa',
  icon: '🛡',
  gate: {
    kind: 'readAloud',
    payload: {
      kind: 'readAloud',
      sentence: 'The brave knight fights a red dragon on the mountain.',
      hintPl: 'Dzielny rycerz walczy z czerwonym smokiem na górze.',
    },
  },
  isUnlocked() {
    return isUnlockedThisVisit('combat');
  },
};

// ─────────────────────────────────────────────────────────────────
// Spell Library — Biblioteka Magii  (Water  /  listening gate)
// ─────────────────────────────────────────────────────────────────
const spells: BranchDef = {
  id: 'spells',
  label: 'Biblioteka Magii',
  icon: '🔮',
  gate: {
    kind: 'listening',
    payload: {
      kind: 'listening',
      sentences: [
        {
          en: 'I wake up at seven and eat breakfast with my sister.',
          correctWords: ['wake', 'seven', 'breakfast', 'sister'],
          distractors: ['eight', 'dinner', 'brother', 'school'],
        },
        {
          en: 'My best friend has blue eyes and brown hair.',
          correctWords: ['friend', 'blue', 'brown', 'hair'],
          distractors: ['red', 'green', 'tall', 'short'],
        },
        {
          en: 'We play football in the park on Saturday.',
          correctWords: ['football', 'park', 'Saturday'],
          distractors: ['tennis', 'garden', 'Sunday', 'school'],
        },
        {
          en: 'The cat is sleeping under the big tree.',
          correctWords: ['cat', 'sleeping', 'tree'],
          distractors: ['dog', 'running', 'house', 'mountain'],
        },
      ],
    },
  },
  isUnlocked() {
    return isUnlockedThisVisit('spells');
  },
};

// ─────────────────────────────────────────────────────────────────
// Scholar's Circle — Krąg Uczonych  (Wind  /  cloze gate)
// ─────────────────────────────────────────────────────────────────
const scholar: BranchDef = {
  id: 'scholar',
  label: 'Krąg Uczonych',
  icon: '📚',
  gate: {
    kind: 'cloze',
    payload: {
      kind: 'cloze',
      items: [
        {
          sentence: 'I {{GAP}} to school yesterday.',
          options: ['go', 'went', 'gone'],
          correct: 'went',
          hintPl: 'Wczoraj szedłem do szkoły.',
        },
        {
          sentence: 'She has {{GAP}} apple in her bag.',
          options: ['a', 'an', 'the'],
          correct: 'an',
          hintPl: 'Ma jabłko w torbie.',
        },
        {
          sentence: 'The book is {{GAP}} the table.',
          options: ['on', 'at', 'in'],
          correct: 'on',
          hintPl: 'Książka jest na stole.',
        },
        {
          sentence: 'We {{GAP}} playing football now.',
          options: ['is', 'are', 'am'],
          correct: 'are',
          hintPl: 'Teraz gramy w piłkę.',
        },
        {
          sentence: 'My brother {{GAP}} older than me.',
          options: ['am', 'is', 'are'],
          correct: 'is',
          hintPl: 'Mój brat jest starszy ode mnie.',
        },
        {
          sentence: 'I saw the dog {{GAP}} the garden.',
          options: ['in', 'on', 'at'],
          correct: 'in',
          hintPl: 'Widziałem psa w ogrodzie.',
        },
      ],
    },
  },
  isUnlocked() {
    return isUnlockedThisVisit('scholar');
  },
};

// ─────────────────────────────────────────────────────────────────
// Writer's Guild — Gildia Pisarzy  (Earth  /  writing gate)
// ─────────────────────────────────────────────────────────────────
const writer: BranchDef = {
  id: 'writer',
  label: 'Gildia Pisarzy',
  icon: '✍',
  gate: {
    kind: 'writing',
    payload: {
      kind: 'writing',
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
  },
  isUnlocked() {
    return isUnlockedThisVisit('writer');
  },
};

export const BRANCH_DEFS: Record<BranchId, BranchDef> = {
  combat, spells, scholar, writer,
};

// Helper for UI surfaces that want to show the gate's CTA text.
export function gateCta(id: BranchId) {
  return GATE_CTA[BRANCH_DEFS[id].gate.kind];
}

// Narrow a branch's payload by kind (reads nicer at call-sites than
// chained `isWritingPayload` etc. checks).
export function payloadFor<K extends GatePayload['kind']>(
  id: BranchId,
  kind: K,
): Extract<GatePayload, { kind: K }> | null {
  const p = BRANCH_DEFS[id].gate.payload;
  return p.kind === kind ? (p as Extract<GatePayload, { kind: K }>) : null;
}

// Every gate calls this on success. `text` is the student's written
// response for writing-gates; for listening/read-aloud/cloze we store
// a short machine-generated transcript so the parent can still see
// what the student answered.
export function submitGate(
  branchId: BranchId,
  text: string,
): WritingSubmission {
  const { total, distinct } = countWords(text);
  const gate = BRANCH_DEFS[branchId].gate;
  // "Prompt" field in the submission record is the human-readable
  // description of the challenge (for the teacher review). Use the
  // branch label + gate kind for non-writing gates.
  const promptLabel =
    gate.payload.kind === 'writing'
      ? gate.payload.prompt
      : `${BRANCH_DEFS[branchId].label} — ${GATE_CTA[gate.kind].sublabel}`;

  const submission: WritingSubmission = {
    id: `${branchId}.${Date.now()}`,
    branch: branchId,
    prompt: promptLabel,
    text,
    wordCount: total,
    distinctCount: distinct,
    submittedAt: Date.now(),
  };
  metaStore.addWritingSubmission(submission);
  metaStore.unlockBranch(branchId); // persists unlockedAt timestamp
  markUnlockedThisVisit(branchId);  // session-scoped gate flag
  return submission;
}

// Legacy alias — some call sites still import the old name.
export const submitWritingTask = submitGate;
