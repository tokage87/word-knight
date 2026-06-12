// Heavyweight text feedback using WebLLM — a full LLM (Llama 3.2 3B)
// running in the browser via WebGPU. Used on-demand when the student
// clicks "Sprawdź szczegółowo": the model grades their writing on a
// 1-5 scale and returns 2-3 sentences of Polish feedback.
//
// First-time load is ~2GB; WebLLM streams weights from the MLC CDN
// and caches them in the browser's IndexedDB. The engine exposes a
// progress callback during download + compilation, which we forward
// to UI listeners so the student sees a real progress bar instead
// of wondering why nothing is happening.

// Type-only import — the web-llm runtime (~5 MB of JS before the model
// weights) is loaded lazily via dynamic import() in build(), so players
// who never click "Sprawdź szczegółowo" don't pay for it in the main
// bundle.
import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm';

export interface DeepProgress {
  phase: 'download' | 'ready' | 'error';
  percent: number;
  text: string; // human-readable status from MLC
}

export interface DeepVerdict {
  score: number;   // 1-5
  feedback: string; // 2-3 Polish sentences
}

type ProgressCallback = (p: DeepProgress) => void;

// 3B-parameter Llama, q4f16 quant — the smallest WebLLM model that
// can produce coherent Polish feedback. About 2GB to download once.
const MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

export class DeepJudge {
  private enginePromise?: Promise<MLCEngineInterface>;
  private progressListeners = new Set<ProgressCallback>();
  private lastProgress: DeepProgress = { phase: 'download', percent: 0, text: '' };

  async init(): Promise<void> {
    if (!this.enginePromise) {
      this.enginePromise = this.build();
    }
    await this.enginePromise;
  }

  private async build(): Promise<MLCEngineInterface> {
    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      const engine = await CreateMLCEngine(MODEL, {
        initProgressCallback: (report: InitProgressReport) => {
          this.emitProgress({
            phase: 'download',
            percent: Math.round((report.progress ?? 0) * 100),
            text: report.text ?? '',
          });
        },
      });
      this.emitProgress({ phase: 'ready', percent: 100, text: 'Gotowe' });
      return engine;
    } catch (e) {
      // Surface the failure to progress listeners (so the UI bar doesn't
      // hang at a stale percent) and drop the cached promise — otherwise
      // every later init() would await the same rejection forever and
      // the feature could never recover from a transient network error.
      this.emitProgress({
        phase: 'error',
        percent: 0,
        text: (e as Error)?.message ?? 'Nie udało się załadować modelu',
      });
      this.enginePromise = undefined;
      throw e;
    }
  }

  async evaluate(params: {
    prompt: string;
    text: string;
  }): Promise<DeepVerdict> {
    const engine = await this.enginePromise;
    if (!engine) throw new Error('DeepJudge not initialised');

    const system = `You are a friendly English teacher for Polish children aged 10-13 (CEFR A1-A2).
You will receive a writing prompt and the student's response in English.
Reply in Polish with EXACTLY this format, nothing else:
OCENA: <integer from 1 to 5>
KOMENTARZ: <2-3 short sentences of warm, specific feedback>

Rules:
- Praise one concrete thing the student did well.
- Suggest ONE concrete improvement if the text is short or off-topic.
- Never be harsh. Kids are beginners.`;
    const user = `TEMAT: ${params.prompt}\n\nODPOWIEDŹ UCZNIA:\n${params.text}`;

    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });
    const raw = reply.choices[0]?.message?.content ?? '';
    return parseVerdict(raw);
  }

  onProgress(cb: ProgressCallback): () => void {
    this.progressListeners.add(cb);
    cb(this.lastProgress);
    return () => this.progressListeners.delete(cb);
  }

  isReady(): boolean {
    return this.lastProgress.phase === 'ready';
  }

  getProgress(): DeepProgress {
    return this.lastProgress;
  }

  private emitProgress(p: DeepProgress) {
    this.lastProgress = p;
    this.progressListeners.forEach((cb) => cb(p));
  }
}

// Parse the strict `OCENA: N\nKOMENTARZ: …` format the prompt asks
// for. If the model goes off-script we still extract as much as we
// can and fall back to score 3 + raw text so the UI has something.
function parseVerdict(raw: string): DeepVerdict {
  const scoreMatch = raw.match(/OCENA\s*[:\-]\s*(\d)/i);
  const score = scoreMatch
    ? Math.min(5, Math.max(1, Number(scoreMatch[1])))
    : 3;
  const commentMatch = raw.match(/KOMENTARZ\s*[:\-]\s*([\s\S]*)/i);
  const feedback = (commentMatch ? commentMatch[1] : raw).trim();
  return { score, feedback: feedback || 'Brak komentarza.' };
}

export const deepJudge = new DeepJudge();
