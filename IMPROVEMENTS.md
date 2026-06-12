# Improvements for the next iteration

Prioritized suggestions from the June 2026 repo cleanup pass. Items are
ordered by expected payoff. File references point at the code as of that
pass.

## 1. Tooling & safety net (highest payoff)

- **Add tests.** There are none. The pure-logic modules are easy wins for
  vitest with no Phaser mocking needed:
  - `MetaStore` `hydrate()` / `migrateV1()` (localStorage schema migrations
    — the riskiest code in the repo to change blind),
  - `speech.ts` `tokenizeEn()` / `tokenOverlap()`,
  - `SkillTreeBalance.costAtRank()`,
  - `GameScene.buildCardOptions()` (extract it to a pure helper first).
- **Add ESLint + Prettier.** The codebase is consistent today; a linter
  keeps it that way and catches the unused-listener / floating-promise
  class of bug automatically (`@typescript-eslint/no-floating-promises`).
- **CI checks on PRs.** The only workflow today is the Pages deploy. Add a
  job running `tsc --noEmit`, the linter, and
  `npm run curriculum:validate` so curriculum edits can't silently break
  the generated catalogs.

## 2. Architecture

- **Extract a shared DOM-overlay base class.** `QuizManager`,
  `SkillPicker`, `SentenceBuilder`, `CityOverlay`, and the four task
  overlays (`WritingTask`, `ListeningTask`, `ReadAloudTask`, `ClozeTask`)
  all hand-roll the same lifecycle: find a `#*-root` element, render HTML,
  toggle a `--visible` class, add a window keydown listener, and unwind
  everything on scene `SHUTDOWN`. The double-XP bug fixed in this pass
  existed because one of the eight copies missed a cleanup step. One base
  class with `mount/show/hide/destroy` makes the next overlay safe by
  default.
- **Type the event bus.** `game.events` names (`quiz:correct`,
  `skillpicker:show`, `story:complete`, …) are raw strings with untyped
  payloads, scattered across emitters and listeners. A single
  `events.ts` module declaring the names as constants plus a payload
  interface per event would catch typos and payload drift at compile time.
- **Decompose `GameScene`** (~1000 lines). The XP/level-up/picker flow,
  the parallax background, and the ULT system are separable systems that
  would slot next to `WaveSpawner`/`SpellCaster` in `src/systems/`.

## 3. Speech & AI features

- **TTS voice selection** (`src/systems/speech.ts` `speak()`): no voice is
  ever picked, so German sentences can play with an English default voice
  (or silence on browsers that load voices async). Pick the best
  `speechSynthesis.getVoices()` match for the requested lang and listen
  for `voiceschanged` before the first utterance.
- **`listen()` hardening**: add a timeout plus `rec.abort()` so an
  abandoned recognition can't hold the microphone, and guard against
  overlapping calls.
- **DeepJudge UX**: detect missing WebGPU up front (`navigator.gpu`) and
  hide/explain the "Sprawdź szczegółowo" button instead of failing after a
  click; offer an explicit retry button after a failed model download
  (the engine retry path now works after this pass's fix).

## 4. Persistence

- **`STORAGE_KEY` is `wk.meta.v1` while the schema is v3**
  (`src/systems/MetaStore.ts`). Harmless but confusing — rename to a
  version-neutral key (e.g. `wk.meta`) on the next schema bump, reading
  the old key once for migration.
- **Numeric guards**: `addGold`/`spendGold` accept `NaN`/`Infinity`
  silently; clamp inputs (`Number.isFinite`) so one bad multiplier can't
  corrupt the save.
- **Consider export/import of the save** (a "copy code" button) so a kid
  switching devices doesn't lose progression.

## 5. Gameplay / UX

- **Touch input**: the quiz, sentence gate, and picker are W/E/R-keyboard
  driven; buttons are clickable, but on tablets there is no key hint
  fallback — hide the key badges and enlarge tap targets on touch devices.
- **Escape interpolated content**: `SentenceBuilder.render()` inlines
  vocabulary words into HTML attributes (`data-word="…"`) without
  escaping. Current data is safe; future curriculum content with quotes
  would break the buttons. Reuse the `escapeAttr()` helper that
  `SkillPicker` already has.
- **i18n table**: UI strings are inline Polish across ~10 files. A single
  strings module would make a second interface language (or fixing a typo)
  a one-file change, mirroring how curriculum sources already support
  `de-exam`.
- **Parent dashboard**: weekly bars exist; a per-word accuracy view (which
  words the kid keeps missing) is cheap with data already in
  `dailyActivity` + `distinctWordIds` and is the most actionable signal
  for a parent.

## 6. Asset/data pipeline

- **`public/assets/monk/Heal_Effect.png`** is kept on disk but no longer
  loaded (removed in this pass); wire it up as the heal-overlay sprite or
  delete it when the cleric polish lands.
- **Catalog scripts**: `bootstrap-experimental-master.mjs` regenerates
  `master/` from in-script word banks — document that it overwrites manual
  `master/` edits, or make it refuse to run when `master/` has local
  changes.
