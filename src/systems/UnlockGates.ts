// Gate-abstraction types. Each City branch has a `gate: GateDef` that
// describes HOW the player unlocks it. Four kinds exist today:
//
//   writing   — student writes a short English text (Earth / Gildia Pisarzy)
//   listening — TTS speaks a sentence, student picks the right words (Water / Biblioteka Magii)
//   readAloud — student reads a sentence into the mic (Fire / Sala Bojowa)
//   cloze     — student fills a gap in a sentence from 3 options (Wind / Krąg Uczonych)
//
// The payload per kind carries the content the task UI needs. Adding a
// new kind = one entry in GateKind + a new payload interface + one new
// task UI class that listens on `writing:start` and handles its own kind.

export type GateKind = 'writing' | 'listening' | 'readAloud' | 'cloze';

// Call-to-action label shown on the city branch panel before the player
// starts the gate. Keeps wording consistent across buildings.
export const GATE_CTA: Record<GateKind, { label: string; sublabel: string }> = {
  writing:   { label: 'NAPISZ KRÓTKI TEKST',  sublabel: 'Zadanie pisemne po angielsku' },
  listening: { label: 'POSŁUCHAJ I WYBIERZ',  sublabel: 'Słuchanie + wybieranie słów' },
  readAloud: { label: 'PRZECZYTAJ NA GŁOS',   sublabel: 'Czytanie na głos z mikrofonem' },
  cloze:     { label: 'UZUPEŁNIJ ZDANIA',     sublabel: 'Gramatyka — wstaw brakujące słowo' },
};

export interface WritingPayload {
  kind: 'writing';
  prompt: string;      // PL prompt
  promptEn: string;    // EN prompt
  hint: string;        // teacher guidance
  hintWords: string[]; // clickable chips (~12)
  referenceEn: string; // kept for DeepJudge context
}

export interface ListeningSentence {
  en: string;              // sentence spoken by TTS
  correctWords: string[];  // words that must be picked (order-free)
  distractors: string[];   // plausible-but-wrong chips
}
export interface ListeningPayload {
  kind: 'listening';
  sentences: ListeningSentence[];
}

export interface ReadAloudPayload {
  kind: 'readAloud';
  sentence: string;        // ~8-12 word English sentence
  hintPl?: string;         // optional Polish translation shown as help
}

export interface ClozeItem {
  sentence: string;        // contains "{{GAP}}" where the word should go
  options: string[];       // 3 choices
  correct: string;         // must be one of `options`
  hintPl?: string;         // optional Polish translation clue
}
export interface ClozePayload {
  kind: 'cloze';
  items: ClozeItem[];
}

export type GatePayload =
  | WritingPayload
  | ListeningPayload
  | ReadAloudPayload
  | ClozePayload;

export interface GateDef {
  kind: GateKind;
  payload: GatePayload;
}

// Convenience guards.
export function isWritingPayload(p: GatePayload): p is WritingPayload {
  return p.kind === 'writing';
}
export function isListeningPayload(p: GatePayload): p is ListeningPayload {
  return p.kind === 'listening';
}
export function isReadAloudPayload(p: GatePayload): p is ReadAloudPayload {
  return p.kind === 'readAloud';
}
export function isClozePayload(p: GatePayload): p is ClozePayload {
  return p.kind === 'cloze';
}
