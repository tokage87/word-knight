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

import {
  CreateMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
} from '@mlc-ai/web-llm';

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
