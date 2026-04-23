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
import { curriculumCatalog } from './CurriculumCatalog';
import type { CurriculumSentence } from './CurriculumTypes';
import {
  GATE_CTA,
  type ClozeItem,
  type ClozePayload,
  type GateDef,
  type GateKind,
  type GatePayload,
  type ListeningPayload,
  type ReadAloudPayload,
  type WritingPayload,
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
// chained `isWritingPayload` etc. checks). For non-English curricula
// the hardcoded English payload in BRANCH_DEFS isn't useful, so we
// build a fresh payload from the active curriculum pool.
export function payloadFor<K extends GatePayload['kind']>(
  id: BranchId,
  kind: K,
): Extract<GatePayload, { kind: K }> | null {
  const gate = BRANCH_DEFS[id].gate;
  if (gate.kind !== kind) return null;
  if (activeLanguage() !== 'en') {
    return buildLocalizedPayload(gate.kind) as Extract<GatePayload, { kind: K }>;
  }
  return gate.payload as Extract<GatePayload, { kind: K }>;
}

// ─────────────────────────────────────────────────────────────────
// Language-aware payload builders
// ─────────────────────────────────────────────────────────────────
// Sampled from curriculumCatalog on each gate open. Right now only
// German (experimental-de-exam) flips activeLanguage() to 'de'; any
// future non-English curriculum can reuse this path.

function activeLanguage(): 'en' | 'de' {
  return curriculumCatalog.getActiveSelection().source === 'experimental-de-exam'
    ? 'de'
    : 'en';
}

function buildLocalizedPayload(kind: GateKind): GatePayload {
  switch (kind) {
    case 'listening': return buildListeningPayload();
    case 'cloze':     return buildClozePayload();
    case 'readAloud': return buildReadAloudPayload();
    case 'writing':   return buildWritingPayload();
  }
}

function targetLangSentence(s: CurriculumSentence): string {
  return s.steps.map((st) => st.correct).join(' ');
}

function sampleWithoutReplacement<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return [];
  const copy = arr.slice();
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  // Pool too small — repeat with replacement rather than under-fill the gate.
  while (out.length < n && arr.length > 0) {
    out.push(arr[Math.floor(Math.random() * arr.length)]!);
  }
  return out;
}

function buildListeningPayload(): ListeningPayload {
  const pool = curriculumCatalog.getSentencePool();
  const sample = sampleWithoutReplacement(pool, 4);
  return {
    kind: 'listening',
    sentences: sample.map((s) => ({
      en: targetLangSentence(s), // field name is legacy; carries target-lang text
      correctWords: s.steps.map((st) => st.correct),
      distractors: s.steps.map((st) => st.distractor),
    })),
  };
}

function buildReadAloudPayload(): ReadAloudPayload {
  const pool = curriculumCatalog.getSentencePool();
  const picked = sampleWithoutReplacement(pool, 1)[0];
  if (!picked) return { kind: 'readAloud', sentence: '', hintPl: '' };
  return {
    kind: 'readAloud',
    sentence: targetLangSentence(picked),
    hintPl: picked.pl,
  };
}

function buildClozePayload(): ClozePayload {
  const pool = curriculumCatalog.getSentencePool();
  const sample = sampleWithoutReplacement(pool, 6);
  const items: ClozeItem[] = sample.map((s) => {
    const gapIdx = Math.floor(Math.random() * s.steps.length);
    const gap = s.steps[gapIdx]!;
    const sentence = s.steps
      .map((st, i) => (i === gapIdx ? '{{GAP}}' : st.correct))
      .join(' ');
    const options = [gap.correct, gap.distractor];
    // Pad to 3 options by borrowing a distractor from another step.
    const pads = s.steps
      .filter((_, i) => i !== gapIdx)
      .map((st) => st.distractor)
      .filter((w) => !options.includes(w));
    if (pads.length > 0) {
      options.push(pads[Math.floor(Math.random() * pads.length)]!);
    }
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j]!, options[i]!];
    }
    return { sentence, options, correct: gap.correct, hintPl: s.pl };
  });
  return { kind: 'cloze', items };
}

function buildWritingPayload(): WritingPayload {
  // Keep Polish-facing prompt identical for now; drop the English hint
  // word list (it's curated for EN and doesn't translate cleanly).
  return {
    kind: 'writing',
    prompt: 'Napisz o swoich ostatnich wakacjach',
    promptEn: '',
    hint: 'Gdzie byłeś/byłaś? Z kim? Co robiliście? Jaka była pogoda? Co ci się podobało?',
    hintWords: [],
    referenceEn: '',
  };
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
