# Improvements for the next iteration

Updated June 2026 after the improvement sprint. Everything from the
previous version of this document has been implemented: vitest suite,
ESLint + Prettier, CI workflow, DomOverlay base class, typed event bus,
GameScene decomposition, TTS voice selection + ASR hardening, DeepJudge
WebGPU pre-check + retry, storage-key migration + numeric guards, save
export/import, touch support, content escaping, i18n strings module,
per-word accuracy dashboard, monk heal effect, and the curriculum
bootstrap guard.

Candidates for the iteration after that, roughly by payoff:

## 1. Adaptive learning
- **Bias the quiz pool toward difficult words.** `MetaStore.wordStats`
  now tracks per-word correct/wrong counts but only feeds the parent
  dashboard. Weighting `QuizManager.loadNext()`'s random pick toward
  low-accuracy and not-seen-recently words (simple spaced-repetition
  bucketing) would turn the existing data into actual pedagogy.
- Surface the same signal to the kid gently (e.g. a "powtórka" chip on
  words coming back for review).

## 2. Delivery
- **Code-split Phaser.** The main bundle is still ~2.4 MB (gzip ~494 kB)
  because Phaser is statically imported everywhere. A `manualChunks`
  split won't reduce total bytes but enables long-term caching of the
  vendor chunk across game updates.
- **PWA/offline**: the game is fully client-side; a service worker +
  manifest would make it installable on the tablets it now supports.

## 3. Quality
- **E2E smoke test** (Playwright): boot the game, answer a quiz, die,
  restart, enter the city — the scene-lifecycle bugs this repo has had
  are exactly what an E2E catches and unit tests can't.
- **DomOverlay unit tests**: the base class is now the single point of
  failure for overlay cleanup; a jsdom-based test of its
  mount/shutdown disposer contract would lock the invariant in.

## 4. Features
- **Second interface language.** `src/i18n/strings.ts` is shaped for it
  (sibling module, same `as const` shape, swap the export) — an English
  or German interface would widen the audience beyond Polish kids.
- **Save backup ergonomics**: the dashboard's base64 code works; a
  download-as-file button and/or QR code would be friendlier for
  parents than copy-paste.
- **DeepJudge model choice**: Llama-3.2-3B (~2 GB) is heavy for school
  hardware; offering the 1B variant as a "fast" option with slightly
  simpler feedback would cut first-use download by ~half.
