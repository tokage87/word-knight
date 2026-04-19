// Lightweight topic-match scorer powered by Transformers.js sentence
// embeddings. Runs entirely in-browser via ONNX + WASM — no backend,
// no WebGPU required — so the check works on school Chromebooks.
//
// Model: paraphrase-multilingual-MiniLM-L12-v2 (~120MB). First-time
// load triggers a progress callback we render as a paper progress
// bar. Subsequent visits hit the cache (IndexedDB via
// @xenova/transformers internal storage) and are instant.
//
// We don't grade grammar or creativity here; we measure how close
// the student's text is, in vector space, to a reference description
// of the prompt's topic. Cosine similarity ≥ ~0.55 is a strong
// signal the student stayed on topic.

import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import { BRANCH_DEFS, type BranchId } from './CityBranches';

// Tell Transformers.js to download models from the public HF CDN.
// This is the default, but set it explicitly so we can swap to a
// mirror later if a school firewall blocks huggingface.co.
env.allowLocalModels = false;

export interface LoadProgress {
  phase: 'download' | 'ready' | 'error';
  loadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  file?: string;
  message?: string;
}

type ProgressCallback = (p: LoadProgress) => void;

// Model identifier — public on HuggingFace. Xenova's fork exposes
// ONNX weights that work in the browser.
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

export class TextJudge {
  private pipelinePromise?: Promise<FeatureExtractionPipeline>;
  private refEmbeddings = new Map<BranchId, Float32Array>();
  private progressListeners = new Set<ProgressCallback>();
  private lastProgress: LoadProgress = { phase: 'download', percent: 0 };

  // Kick off the model download; resolves once embeddings for all
  // branch reference texts are precomputed. Safe to call multiple
  // times — subsequent calls return the same promise.
  async init(): Promise<void> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.buildPipeline();
    }
    await this.pipelinePromise;
  }

  private async buildPipeline(): Promise<FeatureExtractionPipeline> {
    const p = await pipeline('feature-extraction', MODEL, {
      // Transformers.js calls this with percent/bytes updates as each
      // ONNX weight file downloads.
      progress_callback: (data: any) => {
        if (data?.status === 'progress') {
          this.emitProgress({
            phase: 'download',
            loadedBytes: data.loaded,
            totalBytes: data.total,
            percent: typeof data.progress === 'number' ? data.progress : undefined,
            file: data.file,
          });
        }
      },
    });

    // Pre-compute reference embeddings for every branch so live scoring
    // is just "embed user text + cosine with cached ref".
    const branchIds: BranchId[] = ['combat', 'spells', 'scholar', 'writer'];
    for (const id of branchIds) {
      const vec = await this.embed(p, BRANCH_DEFS[id].task.referenceEn);
      this.refEmbeddings.set(id, vec);
    }

    this.emitProgress({ phase: 'ready', percent: 100 });
    return p;
  }

  // Returns a similarity score in [0, 1] — higher = more on-topic.
  async scoreTopic(text: string, branch: BranchId): Promise<number> {
    if (!text.trim()) return 0;
    const pipe = await this.pipelinePromise;
    if (!pipe) throw new Error('TextJudge not initialised');
    const ref = this.refEmbeddings.get(branch);
    if (!ref) throw new Error(`No reference embedding for ${branch}`);
    const user = await this.embed(pipe, text);
    return cosine(user, ref);
  }

  onProgress(cb: ProgressCallback): () => void {
    this.progressListeners.add(cb);
    // Fire the latest immediately so a late subscriber catches up.
    cb(this.lastProgress);
    return () => this.progressListeners.delete(cb);
  }

  getLastProgress(): LoadProgress {
    return this.lastProgress;
  }

  isReady(): boolean {
    return this.lastProgress.phase === 'ready';
  }

  private emitProgress(p: LoadProgress) {
    this.lastProgress = p;
    this.progressListeners.forEach((cb) => cb(p));
  }

  private async embed(pipe: FeatureExtractionPipeline, text: string): Promise<Float32Array> {
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    // Transformers.js returns a Tensor; .data is a TypedArray.
    return (output.data as Float32Array).slice();
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    aMag += a[i]! * a[i]!;
    bMag += b[i]! * b[i]!;
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

// Shared singleton — every overlay hits the same model + cache.
export const textJudge = new TextJudge();
