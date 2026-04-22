// Centralized access to the English-curriculum data. Holds every
// JSON pool (legacy + experimental tiered + CEFR a2 + CEFR b1) and
// returns a filtered, normalized slice based on the player's current
// CurriculumSelection persisted in MetaStore. Consumers (QuizManager,
// SentenceBuilder) ask the catalog instead of importing JSON directly.
//
// Fallback chain: empty selection → retry with category=all → legacy.
// Keeps the game playable even if someone picks a niche slice that
// happens to be sparse in the generated data.

import LEGACY_VOCAB from '../data/vocab.json';
import LEGACY_SENTENCES from '../data/sentences.json';
import LEGACY_STORIES from '../data/stories.json';
import TIERED_VOCAB from '../data/experimental/tiered/vocab.json';
import TIERED_SENTENCES from '../data/experimental/tiered/sentences.json';
import TIERED_STORIES from '../data/experimental/tiered/stories.json';
import A2_VOCAB from '../data/experimental/cefr/a2/vocab.json';
import A2_SENTENCES from '../data/experimental/cefr/a2/sentences.json';
import A2_STORIES from '../data/experimental/cefr/a2/stories.json';
import B1_VOCAB from '../data/experimental/cefr/b1/vocab.json';
import B1_SENTENCES from '../data/experimental/cefr/b1/sentences.json';
import B1_STORIES from '../data/experimental/cefr/b1/stories.json';
import { metaStore } from './MetaStore';
import {
  DEFAULT_CURRICULUM,
  type CurriculumSelection,
  type CurriculumSentence,
  type CurriculumSource,
  type CurriculumStory,
  type CurriculumVocab,
} from './CurriculumTypes';

type PoolKind = 'vocab' | 'sentences' | 'stories';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

class CurriculumCatalog {
  private vocabMemo?: CurriculumVocab[];
  private sentencesMemo?: CurriculumSentence[];
  private storiesMemo?: CurriculumStory[];
  private lastKey = '';

  getActiveSelection(): CurriculumSelection {
    return metaStore.getCurriculum();
  }

  setSelection(sel: CurriculumSelection) {
    metaStore.setCurriculum(sel);
    this.invalidate();
  }

  getVocabPool(): CurriculumVocab[] {
    this.ensureFresh();
    return this.vocabMemo!;
  }

  getSentencePool(): CurriculumSentence[] {
    this.ensureFresh();
    return this.sentencesMemo!;
  }

  getStoryPool(): CurriculumStory[] {
    this.ensureFresh();
    return this.storiesMemo!;
  }

  // Used by the picker UI to preview how a candidate selection would
  // shape the active pools — shown as the "X słówek · Y zdań" line.
  summaryFor(sel: CurriculumSelection): { vocab: number; sentences: number; stories: number } {
    return {
      vocab: this.resolvePool('vocab', sel).length,
      sentences: this.resolvePool('sentences', sel).length,
      stories: this.resolvePool('stories', sel).length,
    };
  }

  private ensureFresh() {
    const sel = this.getActiveSelection();
    const key = `${sel.source}|${sel.tier ?? '-'}|${sel.category}`;
    if (key === this.lastKey && this.vocabMemo) return;
    this.vocabMemo = this.resolvePool('vocab', sel) as CurriculumVocab[];
    this.sentencesMemo = this.resolvePool('sentences', sel) as CurriculumSentence[];
    this.storiesMemo = this.resolvePool('stories', sel) as CurriculumStory[];
    this.lastKey = key;
  }

  private invalidate() {
    this.vocabMemo = undefined;
    this.sentencesMemo = undefined;
    this.storiesMemo = undefined;
    this.lastKey = '';
  }

  private resolvePool(kind: PoolKind, sel: CurriculumSelection): AnyRecord[] {
    const base = this.baseArray(kind, sel.source);
    let filtered = base;

    if (sel.source === 'experimental-tiered' && sel.tier) {
      filtered = filtered.filter((r) => r.tier === sel.tier);
    }
    if (sel.category !== 'all') {
      filtered = filtered.filter((r) => r.category === sel.category);
    }

    if (filtered.length === 0 && sel.category !== 'all') {
      filtered = this.resolvePool(kind, { ...sel, category: 'all' });
    }
    if (filtered.length === 0 && sel.source !== 'legacy') {
      filtered = this.baseArray(kind, 'legacy');
    }

    return this.normalize(kind, filtered);
  }

  private baseArray(kind: PoolKind, src: CurriculumSource): AnyRecord[] {
    if (src === 'legacy') {
      return ({ vocab: LEGACY_VOCAB, sentences: LEGACY_SENTENCES, stories: LEGACY_STORIES } as Record<PoolKind, AnyRecord[]>)[kind];
    }
    if (src === 'experimental-tiered') {
      return ({ vocab: TIERED_VOCAB, sentences: TIERED_SENTENCES, stories: TIERED_STORIES } as Record<PoolKind, AnyRecord[]>)[kind];
    }
    if (src === 'experimental-a1') {
      // No pre-generated a1 bundle exists — derive it from the tiered
      // export by CEFR level. Cheaper than shipping another JSON and
      // guarantees parity with whatever the tiered build produced.
      const base = ({ vocab: TIERED_VOCAB, sentences: TIERED_SENTENCES, stories: TIERED_STORIES } as Record<PoolKind, AnyRecord[]>)[kind];
      return base.filter((r) => r.cefr === 'a1');
    }
    if (src === 'experimental-a2') {
      return ({ vocab: A2_VOCAB, sentences: A2_SENTENCES, stories: A2_STORIES } as Record<PoolKind, AnyRecord[]>)[kind];
    }
    return ({ vocab: B1_VOCAB, sentences: B1_SENTENCES, stories: B1_STORIES } as Record<PoolKind, AnyRecord[]>)[kind];
  }

  private normalize(kind: PoolKind, records: AnyRecord[]): AnyRecord[] {
    return records.map((r) => ({
      ...r,
      tier: r.tier ?? null,
      cefr: r.cefr ?? null,
      category: r.category ?? null,
      ...(kind !== 'vocab' ? { vocabIds: r.vocabIds ?? null } : {}),
    }));
  }
}

export const curriculumCatalog = new CurriculumCatalog();
// Expose default for hydration/fallback call sites that can't import
// MetaStore yet (e.g. during a fresh save seed).
export { DEFAULT_CURRICULUM };
