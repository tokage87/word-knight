// Thin wrappers over the Web Speech API. Feature-detect at call sites
// — support is uneven (Chrome/Edge full, Safari partial, Firefox
// missing SpeechRecognition entirely). Both helpers are no-throw on
// unsupported browsers; callers get a friendly fallback UI.

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts: { lang?: string; rate?: number } = {}) {
  if (!isTtsSupported()) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang ?? 'en-US';
  u.rate = opts.rate ?? 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function cancelSpeak() {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}

// ── SpeechRecognition (ASR) ──

type SrAny = any;

function getSrCtor(): SrAny {
  if (typeof window === 'undefined') return null;
  const w = window as SrAny;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSrSupported(): boolean {
  return Boolean(getSrCtor());
}

export interface SrResult {
  transcript: string;
  confidence: number;
}

// Promise-returning wrapper. Rejects on any error event. Single shot:
// stops after first result. Caller sets lang; default en-US.
export function listen(opts: { lang?: string } = {}): Promise<SrResult> {
  return new Promise((resolve, reject) => {
    const Ctor = getSrCtor();
    if (!Ctor) {
      reject(new Error('SpeechRecognition unavailable'));
      return;
    }
    const rec: SrAny = new Ctor();
    rec.lang = opts.lang ?? 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let settled = false;
    rec.onresult = (e: SrAny) => {
      settled = true;
      const r = e.results?.[0]?.[0];
      resolve({ transcript: r?.transcript ?? '', confidence: r?.confidence ?? 0 });
    };
    rec.onerror = (e: SrAny) => {
      if (settled) return;
      settled = true;
      reject(new Error(e.error || 'recognition error'));
    };
    rec.onend = () => {
      if (settled) return;
      settled = true;
      reject(new Error('no speech detected'));
    };

    try {
      rec.start();
    } catch (e) {
      reject(e as Error);
    }
  });
}

// Utility: tokenize an English sentence into lowercase alphabetic words.
// Used to compare target sentence vs transcript for fuzzy pass/fail.
export function tokenizeEn(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// Compute fraction of target tokens present in spoken tokens. Order
// and duplicates are ignored.
export function tokenOverlap(target: string, spoken: string): number {
  const t = tokenizeEn(target);
  if (t.length === 0) return 1;
  const spokenSet = new Set(tokenizeEn(spoken));
  const hits = t.filter((w) => spokenSet.has(w)).length;
  return hits / t.length;
}
