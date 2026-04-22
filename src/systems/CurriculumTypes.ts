// Shared vocabulary / sentence / story shapes used by the curriculum
// catalog and its consumers (QuizManager, SentenceBuilder). Legacy
// records have no tier/cefr/category metadata; the catalog normalizes
// those fields to `null` so downstream code sees a uniform shape.
//
// Separate from SentenceBuilder's Sentence/Story to avoid an import
// cycle (SentenceBuilder now consumes the catalog).

export type CurriculumSource =
  | 'legacy'
  | 'experimental-tiered'
  | 'experimental-a2'
  | 'experimental-b1';

export type CurriculumCategory =
  | 'all'
  | 'household'
  | 'school'
  | 'food_kitchen'
  | 'animals_nature'
  | 'town_places'
  | 'fantasy_adventure';

export type CurriculumTier = 1 | 2 | 3;

export type CefrLevel = 'a1' | 'a2' | 'b1';

export interface CurriculumSelection {
  source: CurriculumSource;
  tier?: CurriculumTier; // only meaningful when source === 'experimental-tiered'
  category: CurriculumCategory;
}

export interface CurriculumStep {
  correct: string;
  distractor: string;
}

export interface CurriculumVocab {
  id: string;
  pl: string;
  en: string;
  distractors: string[];
  tier: CurriculumTier | null;
  cefr: CefrLevel | null;
  category: CurriculumCategory | null;
}

export interface CurriculumSentence {
  id: string;
  pl: string;
  steps: CurriculumStep[];
  tier: CurriculumTier | null;
  cefr: CefrLevel | null;
  category: CurriculumCategory | null;
  vocabIds: string[] | null;
}

export interface CurriculumStory {
  id: string;
  title: string;
  sentences: CurriculumSentence[];
  tier: CurriculumTier | null;
  cefr: CefrLevel | null;
  category: CurriculumCategory | null;
  vocabIds: string[] | null;
}

export const DEFAULT_CURRICULUM: CurriculumSelection = {
  source: 'experimental-tiered',
  tier: 1,
  category: 'all',
};

export const ALL_SOURCES: CurriculumSource[] = [
  'legacy',
  'experimental-tiered',
  'experimental-a2',
  'experimental-b1',
];

export const ALL_CATEGORIES: CurriculumCategory[] = [
  'all',
  'household',
  'school',
  'food_kitchen',
  'animals_nature',
  'town_places',
  'fantasy_adventure',
];

export const ALL_TIERS: CurriculumTier[] = [1, 2, 3];

export const CATEGORY_LABELS_PL: Record<CurriculumCategory, string> = {
  all: 'Wszystko',
  household: 'Dom',
  school: 'Szkoła',
  food_kitchen: 'Jedzenie',
  animals_nature: 'Zwierzęta',
  town_places: 'Miasto',
  fantasy_adventure: 'Fantasy',
};

export const SOURCE_LABELS_PL: Record<CurriculumSource, string> = {
  legacy: 'Klasyczny',
  'experimental-tiered': 'Rozszerzony',
  'experimental-a2': 'CEFR A2',
  'experimental-b1': 'CEFR B1',
};
