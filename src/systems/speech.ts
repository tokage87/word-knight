// Thin wrappers over the Web Speech API. Feature-detect at call sites
// — support is uneven (Chrome/Edge full, Safari partial, Firefox
// missing SpeechRecognition entirely). Both helpers are no-throw on
// unsupported browsers; callers get a friendly fallback UI.

import type { CurriculumSource } from './CurriculumTypes';

// Maps a curriculum source to the BCP-47 lang code used by the
// browser's TTS and SpeechRecognition APIs.
export function sourceLangCode(src: CurriculumSource): string {
  return src === 'experimental-de-exam' ? 'de-DE' : 'en-US';
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ── TTS voice selection ──
// getVoices() is async-ish on Chromium: the first call often returns []
// and the real list arrives via 'voiceschanged'. Safari usually returns
// voices synchronously and may never fire the event. We cache the list,
// refresh on the event, and never let an empty late result clobber a
// good cache.

let voiceCache: SpeechSynthesisVoice[] = [];
let voicesListenerAdded = false;

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!isTtsSupported()) return voiceCache;
  const got = window.speechSynthesis.getVoices();
  if (got.length > 0) voiceCache = got;
  return voiceCache;
}

function ensureVoicesListener(): void {
  if (voicesListenerAdded || !isTtsSupported()) return;
  voicesListenerAdded = true;
  // addEventListener rather than onvoiceschanged so one-shot waiters in
  // speak() can coexist. Guarded: some older WebKit builds expose
  // speechSynthesis without EventTarget methods.
  try {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      refreshVoices();
    });
  } catch {
    // No event support — refreshVoices() on each speak() still works.
  }
}

// Picks the best available voice for a BCP-47 lang code. Exact match
// ('de-DE') beats language-prefix match ('de'); within a tier prefer
// localService voices (offline, no network latency) then the platform
// default. Returns undefined when nothing matches, in which case the
// utterance falls back to the browser default voice — the pre-existing
// behavior.
export function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  ensureVoicesListener();
  const voices = refreshVoices();
  if (voices.length === 0) return undefined;

  const want = lang.toLowerCase();
  const wantPrefix = want.split('-')[0];
  // Android reports 'de_DE'; normalize so it matches 'de-DE'.
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');

  const best = (cands: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined =>
    cands.length === 0
      ? undefined
      : [...cands].sort(
          (a, b) => Number(b.localService) - Number(a.localService) || Number(b.default) - Number(a.default),
        )[0];

  return (
    best(voices.filter((v) => norm(v) === want)) ?? best(voices.filter((v) => norm(v).split('-')[0] === wantPrefix))
  );
}

// Bumped by every speak()/cancelSpeak(); an utterance still waiting on
// 'voiceschanged' checks this and stays silent if it was superseded.
let speakGeneration = 0;

export function speak(text: string, opts: { lang?: string; rate?: number } = {}) {
  if (!isTtsSupported()) return;
  ensureVoicesListener();
  const gen = ++speakGeneration;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang ?? 'en-US';
  u.rate = opts.rate ?? 0.85;
  window.speechSynthesis.cancel();

  const utter = () => {
    const v = pickVoice(u.lang);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };

  if (refreshVoices().length > 0) {
    utter();
    return;
  }

  // Voices not loaded yet. Wait one 'voiceschanged' tick, with a short
  // fallback timeout for browsers that never fire it, so speech still
  // starts promptly (just possibly with the default voice).
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    try {
      window.speechSynthesis.removeEventListener('voiceschanged', go);
    } catch {
      // Listener was never attached; nothing to remove.
    }
    if (gen !== speakGeneration) return; // superseded by a newer speak/cancel
    utter();
  };
  const timer = setTimeout(go, 250);
  try {
    window.speechSynthesis.addEventListener('voiceschanged', go);
  } catch {
    // No event support — the timeout alone gets us there.
  }
}

export function cancelSpeak() {
  if (!isTtsSupported()) return;
  speakGeneration++; // also drops any utterance still waiting on voices
  window.speechSynthesis.cancel();
}

// ── SpeechRecognition (ASR) ──

// Deliberate `any`: the SpeechRecognition API has no lib.dom types in
// our TS version and is vendor-prefixed; SrAny is the single escape
// hatch for the whole ASR surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Only one recognition can run per page — Chrome errors (or silently
// drops) a second start(). Track the active instance so a new listen()
// aborts the old one; the old promise rejects via its own
// onerror/onend handlers.
let activeRec: SrAny = null;

// Promise-returning wrapper. Rejects on any error event, or after
// timeoutMs (default 10s) with no result — some browsers never fire
// onend if the mic stalls, so we don't rely on it. Single shot: stops
// after first result. Caller sets lang; default en-US.
export function listen(opts: { lang?: string; timeoutMs?: number } = {}): Promise<SrResult> {
  return new Promise((resolve, reject) => {
    const Ctor = getSrCtor();
    if (!Ctor) {
      reject(new Error('SpeechRecognition unavailable'));
      return;
    }
    if (activeRec) {
      const prev = activeRec;
      activeRec = null;
      try {
        prev.abort();
      } catch {
        // Already stopped; its handlers have settled or will settle.
      }
    }
    const rec: SrAny = new Ctor();
    rec.lang = opts.lang ?? 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Marks this recognition settled and releases shared state. Late
    // events (abort fallout, stray onend) bail on the settled flag.
    const finish = () => {
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (activeRec === rec) activeRec = null;
    };

    rec.onresult = (e: SrAny) => {
      if (settled) return;
      finish();
      const r = e.results?.[0]?.[0];
      resolve({ transcript: r?.transcript ?? '', confidence: r?.confidence ?? 0 });
    };
    rec.onerror = (e: SrAny) => {
      if (settled) return;
      finish();
      reject(new Error(e.error || 'recognition error'));
    };
    rec.onend = () => {
      if (settled) return;
      finish();
      reject(new Error('no speech detected'));
    };

    try {
      rec.start();
      activeRec = rec;
      timer = setTimeout(() => {
        if (settled) return;
        finish();
        try {
          rec.abort();
        } catch {
          // Already stopped; we are rejecting regardless.
        }
        reject(new Error('listening timed out'));
      }, opts.timeoutMs ?? 10000);
    } catch (e) {
      finish();
      reject(e as Error);
    }
  });
}

// Utility: tokenize a target-language sentence into lowercase words.
// Keeps ASCII letters plus German umlauts (ä ö ü) and ß so German
// sentences round-trip. Used to compare target vs transcript.
export function tokenizeEn(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-zäöüß'\s-]/g, ' ')
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
